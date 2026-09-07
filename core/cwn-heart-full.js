/* ============================================================
   CWN HEART v3.0.0
   Hyperlocal Environment Atmospheric Reporting Technology

   Goals:
   - Backward compatible with existing CWN era-page imports
   - Observation-first current conditions
   - Complete, provenance-preserving NWS alert records
   - Timeout, retry, request deduplication, caching, and stale fallback
   - Stable numeric fields plus legacy display fields
   - Read-only treatment of third-party weather data
   - Data catalog for the CWN OBS-style Data-Binding Inspector

   Existing exports preserved:
   getCityCoords, getConditions, fetchNWSPeriods, getAlerts,
   getRadarUrl, getClock, getDayPeriod, hasEmergency, getCWNCore
   ============================================================ */

export const CWN_HEART_VERSION = '3.0.0';
export const CWN_HEART_SCHEMA_VERSION = '3.0.0';

const NWS_BASE = 'https://api.weather.gov';
const DEFAULT_RADAR_URL = 'https://radar.weather.gov/ridge/standard/KOHX_loop.gif';
const MEMORY_CACHE = new Map();
const IN_FLIGHT = new Map();
const LAST_GOOD_PREFIX = 'cwn-heart-v3:last-good:';
const CITY_CACHE_KEY = 'cwn-heart-v3:cities';

const CONFIG = {
  timeoutMs: 9000,
  retries: 2,
  retryBaseMs: 450,
  pointTtlMs: 6 * 60 * 60 * 1000,
  stationsTtlMs: 6 * 60 * 60 * 1000,
  observationTtlMs: 2 * 60 * 1000,
  forecastTtlMs: 10 * 60 * 1000,
  alertsTtlMs: 60 * 1000,
  staleMaxAgeMs: 24 * 60 * 60 * 1000
};

const NWS_HEADERS = {
  Accept: 'application/geo+json, application/json;q=0.9',
  'User-Agent': 'CumberlandWeatherNetwork/3.0 (cumberlandweather.net)'
};

export class CWNHeartError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CWNHeartError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 0) {
  const number = finiteNumber(value);
  if (number == null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function celsiusToFahrenheit(value) {
  const number = finiteNumber(value);
  return number == null ? null : round((number * 9 / 5) + 32, 0);
}

function kilometersPerHourToMilesPerHour(value) {
  const number = finiteNumber(value);
  return number == null ? null : round(number * 0.621371, 0);
}

function pascalsToInchesMercury(value) {
  const number = finiteNumber(value);
  return number == null ? null : round(number * 0.0002952998751, 2);
}

function metersToMiles(value) {
  const number = finiteNumber(value);
  return number == null ? null : round(number * 0.000621371, 1);
}

function millimetersToInches(value) {
  const number = finiteNumber(value);
  return number == null ? null : round(number / 25.4, 2);
}

function degreesToCompass(value) {
  const number = finiteNumber(value);
  if (number == null) return 'Variable';
  const directions = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const degrees = ((number % 360) + 360) % 360;
  return directions[Math.round(degrees / 22.5) % 16];
}

function calculateHeatIndexF(tempF, humidityPct) {
  const t = finiteNumber(tempF);
  const r = finiteNumber(humidityPct);
  if (t == null || r == null || t < 80 || r < 40) return null;
  const hi = -42.379 + 2.04901523*t + 10.14333127*r - 0.22475541*t*r
    - 0.00683783*t*t - 0.05481717*r*r + 0.00122874*t*t*r
    + 0.00085282*t*r*r - 0.00000199*t*t*r*r;
  return round(hi, 0);
}

function calculateWindChillF(tempF, windMph) {
  const t = finiteNumber(tempF);
  const v = finiteNumber(windMph);
  if (t == null || v == null || t > 50 || v < 3) return null;
  return round(35.74 + 0.6215*t - 35.75*(v ** 0.16) + 0.4275*t*(v ** 0.16), 0);
}

function calculateFeelsLikeF(tempF, humidityPct, windMph) {
  return calculateHeatIndexF(tempF, humidityPct)
    ?? calculateWindChillF(tempF, windMph)
    ?? finiteNumber(tempF);
}

function safeStorageGet(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Storage is optional; memory cache remains available.
  }
}

function lastGoodKey(kind, lat, lon) {
  return `${LAST_GOOD_PREFIX}${kind}:${round(lat, 4)},${round(lon, 4)}`;
}

function saveLastGood(kind, lat, lon, value) {
  safeStorageSet(lastGoodKey(kind, lat, lon), {
    saved_at: nowIso(),
    value
  });
}

function loadLastGood(kind, lat, lon) {
  const saved = safeStorageGet(lastGoodKey(kind, lat, lon));
  if (!saved?.saved_at || !saved?.value) return null;
  const age = Date.now() - new Date(saved.saved_at).getTime();
  if (!Number.isFinite(age) || age > CONFIG.staleMaxAgeMs) return null;
  return { ...saved.value, is_stale: true, data_status: 'stale', stale_since: saved.saved_at };
}

function validateJSONShape(data, validator, url) {
  if (!validator || validator(data)) return data;
  throw new CWNHeartError('INVALID_RESPONSE_SHAPE', 'Weather provider returned an unexpected response shape', { url });
}

async function fetchJSON(url, options = {}) {
  const {
    ttlMs = 0,
    timeoutMs = CONFIG.timeoutMs,
    retries = CONFIG.retries,
    validator = null,
    force = false
  } = options;

  const cached = MEMORY_CACHE.get(url);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  if (!force && IN_FLIGHT.has(url)) return IN_FLIGHT.get(url);

  const task = (async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { headers: NWS_HEADERS, signal: controller.signal });
        if (!response.ok) {
          const transient = response.status === 408 || response.status === 429 || response.status >= 500;
          const error = new CWNHeartError('HTTP_ERROR', `CWN HEART request failed: ${response.status} ${response.statusText}`, {
            url, status: response.status, transient, attempt
          });
          if (!transient || attempt >= retries) throw error;
          lastError = error;
        } else {
          const data = validateJSONShape(await response.json(), validator, url);
          if (ttlMs > 0) MEMORY_CACHE.set(url, { value: data, expiresAt: Date.now() + ttlMs });
          return data;
        }
      } catch (error) {
        const normalized = error?.name === 'AbortError'
          ? new CWNHeartError('TIMEOUT', `CWN HEART request timed out after ${timeoutMs}ms`, { url, attempt })
          : error;
        lastError = normalized;
        if (attempt >= retries || (normalized instanceof CWNHeartError && normalized.details?.transient === false)) throw normalized;
      } finally {
        clearTimeout(timer);
      }
      await sleep(CONFIG.retryBaseMs * (2 ** attempt));
    }
    throw lastError ?? new CWNHeartError('REQUEST_FAILED', 'CWN HEART request failed', { url });
  })();

  IN_FLIGHT.set(url, task);
  try {
    return await task;
  } finally {
    IN_FLIGHT.delete(url);
  }
}

function pointKey(lat, lon) {
  const latitude = finiteNumber(lat);
  const longitude = finiteNumber(lon);
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new CWNHeartError('INVALID_COORDINATES', 'Latitude or longitude is invalid', { lat, lon });
  }
  return `${round(latitude, 4)},${round(longitude, 4)}`;
}

async function getPointMetadata(lat, lon) {
  const key = pointKey(lat, lon);
  return fetchJSON(`${NWS_BASE}/points/${key}`, {
    ttlMs: CONFIG.pointTtlMs,
    validator: data => Boolean(data?.properties?.forecast && data?.properties?.observationStations)
  });
}

async function getForecastFeed(lat, lon) {
  const point = await getPointMetadata(lat, lon);
  return fetchJSON(point.properties.forecast, {
    ttlMs: CONFIG.forecastTtlMs,
    validator: data => Array.isArray(data?.properties?.periods)
  });
}

async function getHourlyFeed(lat, lon) {
  const point = await getPointMetadata(lat, lon);
  if (!point.properties.forecastHourly) return null;
  return fetchJSON(point.properties.forecastHourly, {
    ttlMs: CONFIG.forecastTtlMs,
    validator: data => Array.isArray(data?.properties?.periods)
  });
}

async function getStationsFeed(lat, lon) {
  const point = await getPointMetadata(lat, lon);
  return fetchJSON(point.properties.observationStations, {
    ttlMs: CONFIG.stationsTtlMs,
    validator: data => Array.isArray(data?.features)
  });
}

async function selectObservation(lat, lon) {
  const stations = await getStationsFeed(lat, lon);
  const stationUrls = stations.features.map(feature => feature?.id).filter(Boolean).slice(0, 4);
  if (!stationUrls.length) throw new CWNHeartError('NO_STATIONS', 'No NWS observation station was returned');

  const candidates = await Promise.allSettled(stationUrls.map(async stationUrl => {
    const data = await fetchJSON(`${stationUrl}/observations/latest`, {
      ttlMs: CONFIG.observationTtlMs,
      validator: value => Boolean(value?.properties)
    });
    const p = data.properties;
    const completeness = [p.temperature?.value, p.windSpeed?.value, p.relativeHumidity?.value,
      p.barometricPressure?.value ?? p.seaLevelPressure?.value, p.dewpoint?.value, p.visibility?.value]
      .filter(value => finiteNumber(value) != null).length;
    const timestamp = new Date(p.timestamp ?? 0).getTime();
    return { stationUrl, data, completeness, timestamp: Number.isFinite(timestamp) ? timestamp : 0 };
  }));

  const usable = candidates.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (!usable.length) throw new CWNHeartError('OBSERVATION_UNAVAILABLE', 'No usable station observation was returned');
  usable.sort((a, b) => b.completeness - a.completeness || b.timestamp - a.timestamp);
  return usable[0];
}

function normalizeConditions(observation, stationUrl, forecastPeriod = null) {
  const p = observation?.properties ?? {};
  const tempF = celsiusToFahrenheit(p.temperature?.value);
  const humidityPct = round(p.relativeHumidity?.value, 0);
  const dewpointF = celsiusToFahrenheit(p.dewpoint?.value);
  const windSpeedMph = kilometersPerHourToMilesPerHour(p.windSpeed?.value);
  const windGustMph = kilometersPerHourToMilesPerHour(p.windGust?.value);
  const pressureInHg = pascalsToInchesMercury(p.barometricPressure?.value ?? p.seaLevelPressure?.value);
  const visibilityMiles = metersToMiles(p.visibility?.value);
  const windDirectionDegrees = round(p.windDirection?.value, 0);
  const windDirection = degreesToCompass(windDirectionDegrees);
  const feelsLikeF = calculateFeelsLikeF(tempF, humidityPct, windSpeedMph);
  const precipPct = round(forecastPeriod?.probabilityOfPrecipitation?.value, 0) ?? 0;

  const cloudLayers = Array.isArray(p.cloudLayers) ? p.cloudLayers.map(layer => ({
    amount: layer?.amount ?? null,
    base_meters: finiteNumber(layer?.base?.value),
    base_feet: finiteNumber(layer?.base?.value) == null ? null : round(layer.base.value * 3.28084, 0)
  })) : [];

  return {
    schema_version: CWN_HEART_SCHEMA_VERSION,
    data_kind: 'observation',
    data_status: 'live',
    is_observation: true,
    is_stale: false,
    source_name: 'National Weather Service Observation',
    source_url: stationUrl,
    observation_station: stationUrl?.split('/').pop() || '',
    observation_time: p.timestamp || null,
    received_time: nowIso(),

    temp_f: tempF ?? '--',
    description: p.textDescription || 'Current Conditions',
    wind_mph: windSpeedMph == null ? '--' : `${windSpeedMph} mph`,
    wind_direction: windDirection,
    precip_pct: precipPct,
    humidity: humidityPct == null ? '--' : `${humidityPct}%`,
    pressure: pressureInHg == null ? '--' : `${pressureInHg.toFixed(2)} inHg`,
    dew_point: dewpointF == null ? '--' : `${dewpointF}°F`,
    visibility: visibilityMiles == null ? '--' : `${visibilityMiles.toFixed(1)} mi`,

    temperature_f: tempF,
    feels_like_f: feelsLikeF,
    heat_index_f: calculateHeatIndexF(tempF, humidityPct),
    wind_chill_f: calculateWindChillF(tempF, windSpeedMph),
    humidity_pct: humidityPct,
    pressure_inhg: pressureInHg,
    dewpoint_f: dewpointF,
    visibility_miles: visibilityMiles,
    wind_speed_mph: windSpeedMph,
    wind_gust_mph: windGustMph,
    wind_direction_degrees: windDirectionDegrees,
    precipitation_last_hour_inches: millimetersToInches(p.precipitationLastHour?.value),
    precipitation_last_3_hours_inches: millimetersToInches(p.precipitationLast3Hours?.value),
    precipitation_last_6_hours_inches: millimetersToInches(p.precipitationLast6Hours?.value),
    cloud_layers: cloudLayers,
    present_weather: Array.isArray(p.presentWeather) ? p.presentWeather : [],
    raw_properties: p
  };
}

function normalizeForecastFallback(period, error) {
  const tempF = finiteNumber(period?.temperature);
  const windText = period?.windSpeed || '--';
  const windNumber = finiteNumber(String(windText).match(/\d+(?:\.\d+)?/)?.[0]);
  return {
    schema_version: CWN_HEART_SCHEMA_VERSION,
    data_kind: 'forecast',
    data_status: 'fallback',
    is_observation: false,
    is_stale: false,
    source_name: 'National Weather Service Forecast',
    source_url: null,
    fallback_reason: error?.code || 'OBSERVATION_UNAVAILABLE',
    observation_station: '',
    observation_time: null,
    received_time: nowIso(),

    temp_f: tempF ?? '--',
    description: period?.shortForecast || 'Forecast Conditions',
    wind_mph: windText,
    wind_direction: period?.windDirection || 'Variable',
    precip_pct: round(period?.probabilityOfPrecipitation?.value, 0) ?? 0,
    humidity: '--', pressure: '--', dew_point: '--', visibility: '--',

    temperature_f: tempF,
    feels_like_f: tempF,
    heat_index_f: null,
    wind_chill_f: null,
    humidity_pct: null,
    pressure_inhg: null,
    dewpoint_f: null,
    visibility_miles: null,
    wind_speed_mph: windNumber,
    wind_gust_mph: null,
    wind_direction_degrees: null,
    precipitation_last_hour_inches: null,
    precipitation_last_3_hours_inches: null,
    precipitation_last_6_hours_inches: null,
    cloud_layers: [], present_weather: [], raw_properties: period ?? null
  };
}

function unavailableConditions(errors = []) {
  return {
    schema_version: CWN_HEART_SCHEMA_VERSION,
    data_kind: 'unavailable', data_status: 'unavailable', is_observation: false, is_stale: false,
    source_name: null, source_url: null, observation_station: '', observation_time: null, received_time: nowIso(),
    temp_f: '--', description: 'Weather Data Unavailable', wind_mph: '--', wind_direction: 'Variable',
    precip_pct: 0, humidity: '--', pressure: '--', dew_point: '--', visibility: '--',
    temperature_f: null, feels_like_f: null, heat_index_f: null, wind_chill_f: null,
    humidity_pct: null, pressure_inhg: null, dewpoint_f: null, visibility_miles: null,
    wind_speed_mph: null, wind_gust_mph: null, wind_direction_degrees: null,
    precipitation_last_hour_inches: null, precipitation_last_3_hours_inches: null,
    precipitation_last_6_hours_inches: null, cloud_layers: [], present_weather: [], raw_properties: null,
    errors: errors.map(serializeError)
  };
}

function serializeError(error) {
  return {
    code: error?.code || error?.name || 'ERROR',
    message: error?.message || String(error),
    details: error?.details || null,
    timestamp: error?.timestamp || nowIso()
  };
}

export async function getCityCoords(cityName) {
  if (!cityName) throw new CWNHeartError('CITY_REQUIRED', 'A city name is required');
  let data = MEMORY_CACHE.get(CITY_CACHE_KEY)?.value ?? safeStorageGet(CITY_CACHE_KEY);
  if (!data) {
    const response = await fetch('../api/cities.json');
    if (!response.ok) throw new CWNHeartError('CITIES_HTTP_ERROR', `CWN HEART cities.json failed: ${response.status} ${response.statusText}`);
    data = await response.json();
    MEMORY_CACHE.set(CITY_CACHE_KEY, { value: data, expiresAt: Number.POSITIVE_INFINITY });
    safeStorageSet(CITY_CACHE_KEY, data);
  }
  for (const county of Object.keys(data)) {
    if (Object.prototype.hasOwnProperty.call(data[county], cityName)) {
      return { ...data[county][cityName], county };
    }
  }
  throw new CWNHeartError('CITY_NOT_FOUND', `City not found: ${cityName}`, { cityName });
}

export async function getConditions(lat, lon) {
  const errors = [];
  try {
    const [selected, forecast] = await Promise.all([selectObservation(lat, lon), getForecastFeed(lat, lon)]);
    const result = normalizeConditions(selected.data, selected.stationUrl, forecast.properties.periods?.[0]);
    saveLastGood('conditions', lat, lon, result);
    return result;
  } catch (observationError) {
    errors.push(observationError);
    try {
      const forecast = await getForecastFeed(lat, lon);
      const period = forecast.properties?.periods?.[0];
      if (!period) throw new CWNHeartError('NO_FORECAST_PERIOD', 'No NWS forecast period was returned');
      return normalizeForecastFallback(period, observationError);
    } catch (forecastError) {
      errors.push(forecastError);
      return loadLastGood('conditions', lat, lon) ?? unavailableConditions(errors);
    }
  }
}

export async function fetchNWSPeriods(lat, lon, count = 6) {
  try {
    const forecast = await getForecastFeed(lat, lon);
    return forecast.properties.periods.slice(0, Math.max(0, Number(count) || 6));
  } catch (error) {
    console.error('[CWN HEART] Forecast periods unavailable:', error);
    return [];
  }
}

export async function fetchNWSHourlyPeriods(lat, lon, count = 24) {
  try {
    const forecast = await getHourlyFeed(lat, lon);
    return forecast?.properties?.periods?.slice(0, Math.max(0, Number(count) || 24)) || [];
  } catch (error) {
    console.error('[CWN HEART] Hourly forecast unavailable:', error);
    return [];
  }
}

function normalizeAlert(feature) {
  const p = feature?.properties ?? {};
  const references = Array.isArray(p.references) ? p.references : [];
  return Object.freeze({
    id: feature?.id || p.id || '',
    identifier: p.id || feature?.id || '',
    event: p.event || '',
    sender: p.sender || '',
    sender_name: p.senderName || '',
    authority: p.senderName || p.sender || '',
    headline: p.headline || '',
    description: p.description || '',
    instruction: p.instruction || '',
    area_desc: p.areaDesc || '',
    severity: p.severity || '',
    urgency: p.urgency || '',
    certainty: p.certainty || '',
    status: p.status || '',
    message_type: p.messageType || '',
    category: p.category || '',
    response: p.response || '',
    sent: p.sent || null,
    effective: p.effective || null,
    onset: p.onset || null,
    expires: p.expires || null,
    ends: p.ends || null,
    references,
    affected_zones: Array.isArray(p.affectedZones) ? [...p.affectedZones] : [],
    geometry: feature?.geometry ?? null,
    parameters: p.parameters ?? {},
    source_url: feature?.id || '',
    provenance: 'authority-feed',
    raw_properties: p
  });
}

export async function getAlerts(lat, lon) {
  try {
    pointKey(lat, lon);
    const data = await fetchJSON(`${NWS_BASE}/alerts/active?point=${lat},${lon}`, {
      ttlMs: CONFIG.alertsTtlMs,
      validator: value => Array.isArray(value?.features)
    });
    const alerts = data.features.map(normalizeAlert);
    saveLastGood('alerts', lat, lon, alerts);
    return alerts;
  } catch (error) {
    console.error('[CWN HEART] Alerts unavailable:', error);
    return loadLastGood('alerts', lat, lon) ?? [];
  }
}

export function getRadarUrl() {
  return DEFAULT_RADAR_URL;
}

export function getRadarConfig() {
  return Object.freeze({
    mode: 'static-fallback',
    station: 'KOHX',
    source_name: 'NWS Radar KOHX Nashville',
    url: DEFAULT_RADAR_URL,
    is_third_party_read_only: true
  });
}

export function getClock() {
  return {
    clock_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}

export function getDayPeriod(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Overnight';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Tonight';
}

export function hasEmergency(alerts = []) {
  return alerts.some(alert =>
    alert?.severity === 'Severe' || alert?.severity === 'Extreme' || /Warning/i.test(alert?.event || '')
  );
}

export const WEATHER_DATA_CATALOG = Object.freeze([
  { id: 'current.temperature_f', label: 'Temperature', type: 'number', unit: '°F', legacy: 'temp_f' },
  { id: 'current.feels_like_f', label: 'Feels Like', type: 'number', unit: '°F' },
  { id: 'current.description', label: 'Conditions', type: 'text' },
  { id: 'current.humidity_pct', label: 'Humidity', type: 'number', unit: '%' },
  { id: 'current.dewpoint_f', label: 'Dew Point', type: 'number', unit: '°F' },
  { id: 'current.pressure_inhg', label: 'Pressure', type: 'number', unit: 'inHg' },
  { id: 'current.visibility_miles', label: 'Visibility', type: 'number', unit: 'mi' },
  { id: 'current.wind_speed_mph', label: 'Wind Speed', type: 'number', unit: 'mph' },
  { id: 'current.wind_gust_mph', label: 'Wind Gust', type: 'number', unit: 'mph' },
  { id: 'current.wind_direction', label: 'Wind Direction', type: 'text' },
  { id: 'current.precip_pct', label: 'Precipitation Chance', type: 'number', unit: '%' },
  { id: 'current.observation_time', label: 'Observation Time', type: 'datetime' },
  { id: 'current.observation_station', label: 'Observation Station', type: 'text' },
  { id: 'forecast.periods', label: 'Forecast Periods', type: 'collection' },
  { id: 'forecast.hourly', label: 'Hourly Forecast', type: 'collection' },
  { id: 'alerts', label: 'Active Alerts', type: 'collection' },
  { id: 'radar.url', label: 'KOHX Radar', type: 'image-url' },
  { id: 'system.clock_time', label: 'Clock', type: 'time' },
  { id: 'system.data_status', label: 'Data Status', type: 'status' },
  { id: 'system.source_name', label: 'Data Source', type: 'text' }
]);

export function getWeatherDataCatalog() {
  return WEATHER_DATA_CATALOG.map(item => ({ ...item }));
}

export function resolveWeatherData(snapshot, bindingId) {
  if (!snapshot || !bindingId) return null;
  return bindingId.split('.').reduce((value, key) => value?.[key], snapshot);
}

export async function getCWNSnapshot(cityName, options = {}) {
  const { forecastCount = 6, hourlyCount = 24 } = options;
  const { lat, lon, county = '' } = await getCityCoords(cityName);
  const [current, alerts, periods, hourly] = await Promise.all([
    getConditions(lat, lon),
    getAlerts(lat, lon),
    fetchNWSPeriods(lat, lon, forecastCount),
    fetchNWSHourlyPeriods(lat, lon, hourlyCount)
  ]);
  return Object.freeze({
    schema_version: CWN_HEART_SCHEMA_VERSION,
    generated_at: nowIso(),
    location: Object.freeze({ city_name: cityName, county, lat, lon }),
    current: Object.freeze({ ...current }),
    forecast: Object.freeze({ periods, hourly }),
    alerts: Object.freeze([...alerts]),
    radar: getRadarConfig(),
    system: Object.freeze({
      ...getClock(),
      day_period: getDayPeriod(),
      data_status: current.data_status,
      source_name: current.source_name,
      has_emergency: hasEmergency(alerts)
    }),
    catalog: WEATHER_DATA_CATALOG
  });
}

export async function getCWNCore(cityName) {
  const snapshot = await getCWNSnapshot(cityName, { hourlyCount: 0 });
  return {
    city_name: cityName,
    ...snapshot.current,
    alerts: snapshot.alerts,
    radar_url: snapshot.radar.url,
    clock_time: snapshot.system.clock_time,
    schema_version: snapshot.schema_version,
    data_catalog: snapshot.catalog
  };
}

export function clearHeartCache() {
  MEMORY_CACHE.clear();
  IN_FLIGHT.clear();
}


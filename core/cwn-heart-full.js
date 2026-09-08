/* ============================================================
   CWN HEART v3.1.0
   Hyperlocal Environment Atmospheric Reporting Technology

   Security and reliability revision of v3.0.0.

   Preserved public exports:
   getCityCoords, getConditions, fetchNWSPeriods,
   fetchNWSHourlyPeriods, getAlerts, getRadarUrl,
   getRadarConfig, getClock, getDayPeriod, hasEmergency,
   getWeatherDataCatalog, resolveWeatherData, getCWNSnapshot,
   getCWNCore, clearHeartCache

   Key protections:
   - No secrets, credentials, or privileged operations
   - HTTPS allowlist for provider JSON requests
   - Validated coordinates and provider response shapes
   - Timeout, bounded retry, jitter, request deduplication
   - Compact last-known-good persistence
   - Array-preserving stale alert fallback
   - Approved-path-only data binding resolution
   - Observation remains usable if optional forecast fails
   - Versioned and validated city-registry cache
   - Separate memory and persistent cache controls
   ============================================================ */

export const CWN_HEART_VERSION = '3.1.0';
export const CWN_HEART_SCHEMA_VERSION = '3.1.0';

const NWS_BASE = 'https://api.weather.gov';
const DEFAULT_RADAR_URL = 'https://radar.weather.gov/ridge/standard/KOHX_loop.gif';
const CITY_DATA_URL = new URL('../api/cities.json', import.meta.url).href;

const MEMORY_CACHE = new Map();
const IN_FLIGHT = new Map();
const LAST_GOOD_PREFIX = 'cwn-heart-v3:last-good:';
const CITY_CACHE_KEY = 'cwn-heart-v3:cities';
const CITY_CACHE_SCHEMA = 1;

const CONFIG = Object.freeze({
  timeoutMs: 9000,
  retries: 2,
  retryBaseMs: 450,
  retryJitterMs: 180,
  pointTtlMs: 6 * 60 * 60 * 1000,
  stationsTtlMs: 6 * 60 * 60 * 1000,
  cityTtlMs: 24 * 60 * 60 * 1000,
  observationTtlMs: 2 * 60 * 1000,
  forecastTtlMs: 10 * 60 * 1000,
  alertsTtlMs: 60 * 1000,
  staleMaxAgeMs: 24 * 60 * 60 * 1000,
  maxForecastPeriods: 14,
  maxHourlyPeriods: 168,
  maxAlertRecords: 200
});

/* Browsers control the User-Agent header. Keep browser-settable headers only. */
const NWS_HEADERS = Object.freeze({
  Accept: 'application/geo+json, application/json;q=0.9'
});

const ALLOWED_JSON_ORIGINS = new Set([
  new URL(NWS_BASE).origin
]);

const BLOCKED_BINDING_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor'
]);

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

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
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
  const directions = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
  ];
  const degrees = ((number % 360) + 360) % 360;
  return directions[Math.round(degrees / 22.5) % 16];
}

function calculateHeatIndexF(tempF, humidityPct) {
  const t = finiteNumber(tempF);
  const r = finiteNumber(humidityPct);
  if (t == null || r == null || t < 80 || r < 40) return null;
  const value = -42.379 + 2.04901523 * t + 10.14333127 * r
    - 0.22475541 * t * r - 0.00683783 * t * t
    - 0.05481717 * r * r + 0.00122874 * t * t * r
    + 0.00085282 * t * r * r - 0.00000199 * t * t * r * r;
  return round(value, 0);
}

function calculateWindChillF(tempF, windMph) {
  const t = finiteNumber(tempF);
  const v = finiteNumber(windMph);
  if (t == null || v == null || t > 50 || v < 3) return null;
  return round(35.74 + 0.6215 * t - 35.75 * (v ** 0.16) + 0.4275 * t * (v ** 0.16), 0);
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
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    // Persistent storage is optional.
  }
}

function safeStorageKeys() {
  try {
    if (typeof localStorage === 'undefined') return [];
    return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean);
  } catch {
    return [];
  }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function cloneJSONSafe(value) {
  if (value == null) return value;
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch {
    // Fall through to JSON clone.
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function serializeError(error) {
  return {
    code: error?.code || error?.name || 'ERROR',
    message: error?.message || String(error),
    details: cloneJSONSafe(error?.details) || null,
    timestamp: error?.timestamp || nowIso()
  };
}

function pointKey(lat, lon) {
  const latitude = finiteNumber(lat);
  const longitude = finiteNumber(lon);
  if (
    latitude == null || longitude == null ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    throw new CWNHeartError('INVALID_COORDINATES', 'Latitude or longitude is invalid', { lat, lon });
  }
  return `${round(latitude, 4)},${round(longitude, 4)}`;
}

function normalizedCoordinates(lat, lon) {
  const key = pointKey(lat, lon);
  const [latitude, longitude] = key.split(',').map(Number);
  return { key, latitude, longitude };
}

function assertAllowedProviderURL(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new CWNHeartError('INVALID_PROVIDER_URL', 'Weather provider URL is invalid', { url: String(input) });
  }
  if (url.protocol !== 'https:' || !ALLOWED_JSON_ORIGINS.has(url.origin)) {
    throw new CWNHeartError('PROVIDER_URL_BLOCKED', 'Weather provider URL is outside the approved HTTPS allowlist', {
      url: url.href
    });
  }
  return url.href;
}

function validateJSONShape(data, validator, url) {
  if (!validator || validator(data)) return data;
  throw new CWNHeartError(
    'INVALID_RESPONSE_SHAPE',
    'Weather provider returned an unexpected response shape',
    { url }
  );
}

function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(attempt) {
  const base = CONFIG.retryBaseMs * (2 ** attempt);
  const jitter = Math.floor(Math.random() * CONFIG.retryJitterMs);
  return base + jitter;
}

async function fetchJSON(inputUrl, options = {}) {
  const {
    ttlMs = 0,
    timeoutMs = CONFIG.timeoutMs,
    retries = CONFIG.retries,
    validator = null,
    force = false
  } = options;

  const url = assertAllowedProviderURL(inputUrl);
  const cached = MEMORY_CACHE.get(url);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  if (!force && IN_FLIGHT.has(url)) return IN_FLIGHT.get(url);

  const task = (async () => {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: NWS_HEADERS,
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer'
        });

        if (!response.ok) {
          const transient = shouldRetryStatus(response.status);
          const error = new CWNHeartError(
            'HTTP_ERROR',
            `CWN HEART request failed: ${response.status} ${response.statusText}`,
            { url, status: response.status, transient, attempt }
          );
          if (!transient || attempt >= retries) throw error;
          lastError = error;
        } else {
          const contentType = response.headers.get('content-type') || '';
          if (!/json|geo\+json/i.test(contentType)) {
            throw new CWNHeartError(
              'UNEXPECTED_CONTENT_TYPE',
              'Weather provider did not return JSON',
              { url, contentType }
            );
          }
          const parsed = await response.json();
          const data = validateJSONShape(parsed, validator, url);
          if (ttlMs > 0) {
            MEMORY_CACHE.set(url, { value: data, expiresAt: Date.now() + ttlMs });
          }
          return data;
        }
      } catch (error) {
        const normalized = error?.name === 'AbortError'
          ? new CWNHeartError(
              'TIMEOUT',
              `CWN HEART request timed out after ${timeoutMs}ms`,
              { url, attempt, transient: true }
            )
          : error;

        lastError = normalized;
        const explicitlyPermanent = normalized instanceof CWNHeartError
          && normalized.details?.transient === false;
        if (attempt >= retries || explicitlyPermanent) throw normalized;
      } finally {
        clearTimeout(timer);
      }

      await sleep(retryDelay(attempt));
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

function lastGoodKey(kind, lat, lon) {
  return `${LAST_GOOD_PREFIX}${kind}:${pointKey(lat, lon)}`;
}

function compactConditionForStorage(value) {
  if (!value || typeof value !== 'object') return null;
  const { raw_properties: _rawProperties, ...compact } = value;
  return cloneJSONSafe(compact);
}

function compactAlertForStorage(alert) {
  if (!alert || typeof alert !== 'object') return null;
  const { raw_properties: _rawProperties, ...compact } = alert;
  return cloneJSONSafe(compact);
}

function compactValueForStorage(kind, value) {
  if (kind === 'conditions') return compactConditionForStorage(value);
  if (kind === 'alerts' && Array.isArray(value)) {
    return value.map(compactAlertForStorage).filter(Boolean).slice(0, CONFIG.maxAlertRecords);
  }
  return cloneJSONSafe(value);
}

function saveLastGood(kind, lat, lon, value) {
  const compactValue = compactValueForStorage(kind, value);
  if (compactValue == null) return false;
  return safeStorageSet(lastGoodKey(kind, lat, lon), {
    schema_version: CWN_HEART_SCHEMA_VERSION,
    saved_at: nowIso(),
    kind,
    value: compactValue
  });
}

function staleObject(value, savedAt) {
  return deepFreeze({
    ...value,
    is_stale: true,
    data_status: 'stale',
    stale_since: savedAt
  });
}

function staleArray(value, savedAt) {
  const items = value.map(item => staleObject(item, savedAt));
  Object.defineProperties(items, {
    is_stale: { value: true, enumerable: false },
    data_status: { value: 'stale', enumerable: false },
    stale_since: { value: savedAt, enumerable: false }
  });
  return Object.freeze(items);
}

function loadLastGood(kind, lat, lon) {
  const saved = safeStorageGet(lastGoodKey(kind, lat, lon));
  if (!saved?.saved_at || saved.value == null) return null;

  const savedTime = new Date(saved.saved_at).getTime();
  const age = Date.now() - savedTime;
  if (!Number.isFinite(age) || age < 0 || age > CONFIG.staleMaxAgeMs) return null;

  if (Array.isArray(saved.value)) return staleArray(saved.value, saved.saved_at);
  if (typeof saved.value === 'object') return staleObject(saved.value, saved.saved_at);
  return null;
}

async function getPointMetadata(lat, lon) {
  const key = pointKey(lat, lon);
  return fetchJSON(`${NWS_BASE}/points/${encodeURIComponent(key)}`, {
    ttlMs: CONFIG.pointTtlMs,
    validator: data => Boolean(
      data?.properties?.forecast &&
      data?.properties?.observationStations
    )
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
  const stationUrls = stations.features
    .map(feature => feature?.id)
    .filter(Boolean)
    .slice(0, 4)
    .map(assertAllowedProviderURL);

  if (!stationUrls.length) {
    throw new CWNHeartError('NO_STATIONS', 'No NWS observation station was returned');
  }

  const candidates = await Promise.allSettled(
    stationUrls.map(async stationUrl => {
      const data = await fetchJSON(`${stationUrl}/observations/latest`, {
        ttlMs: CONFIG.observationTtlMs,
        validator: value => Boolean(value?.properties)
      });

      const properties = data.properties;
      const completeness = [
        properties.temperature?.value,
        properties.windSpeed?.value,
        properties.relativeHumidity?.value,
        properties.barometricPressure?.value ?? properties.seaLevelPressure?.value,
        properties.dewpoint?.value,
        properties.visibility?.value
      ].filter(value => finiteNumber(value) != null).length;

      const parsedTimestamp = new Date(properties.timestamp ?? 0).getTime();
      const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
      return { stationUrl, data, completeness, timestamp };
    })
  );

  const usable = candidates
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);

  if (!usable.length) {
    throw new CWNHeartError(
      'OBSERVATION_UNAVAILABLE',
      'No usable station observation was returned',
      {
        station_count: stationUrls.length,
        failures: candidates
          .filter(result => result.status === 'rejected')
          .map(result => serializeError(result.reason))
      }
    );
  }

  usable.sort((a, b) => b.completeness - a.completeness || b.timestamp - a.timestamp);
  return usable[0];
}

function sanitizedPresentWeather(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(item => deepFreeze({
    intensity: item?.intensity ?? null,
    modifier: item?.modifier ?? null,
    weather: item?.weather ?? null,
    rawString: item?.rawString ?? null,
    inVicinity: Boolean(item?.inVicinity)
  }));
}

function normalizeConditions(observation, stationUrl, forecastPeriod = null) {
  const properties = observation?.properties ?? {};
  const tempF = celsiusToFahrenheit(properties.temperature?.value);
  const humidityPct = round(properties.relativeHumidity?.value, 0);
  const dewpointF = celsiusToFahrenheit(properties.dewpoint?.value);
  const windSpeedMph = kilometersPerHourToMilesPerHour(properties.windSpeed?.value);
  const windGustMph = kilometersPerHourToMilesPerHour(properties.windGust?.value);
  const pressureInHg = pascalsToInchesMercury(
    properties.barometricPressure?.value ?? properties.seaLevelPressure?.value
  );
  const visibilityMiles = metersToMiles(properties.visibility?.value);
  const windDirectionDegrees = round(properties.windDirection?.value, 0);
  const windDirection = degreesToCompass(windDirectionDegrees);
  const feelsLikeF = calculateFeelsLikeF(tempF, humidityPct, windSpeedMph);
  const precipPct = round(forecastPeriod?.probabilityOfPrecipitation?.value, 0) ?? 0;

  const cloudLayers = Array.isArray(properties.cloudLayers)
    ? properties.cloudLayers.slice(0, 20).map(layer => {
        const baseMeters = finiteNumber(layer?.base?.value);
        return deepFreeze({
          amount: layer?.amount ?? null,
          base_meters: baseMeters,
          base_feet: baseMeters == null ? null : round(baseMeters * 3.28084, 0)
        });
      })
    : [];

  return deepFreeze({
    schema_version: CWN_HEART_SCHEMA_VERSION,
    data_kind: 'observation',
    data_status: 'live',
    is_observation: true,
    is_stale: false,
    source_name: 'National Weather Service Observation',
    source_url: stationUrl,
    observation_station: stationUrl?.split('/').pop() || '',
    observation_time: properties.timestamp || null,
    received_time: nowIso(),

    /* Legacy display fields. */
    temp_f: tempF ?? '--',
    description: properties.textDescription || 'Current Conditions',
    wind_mph: windSpeedMph == null ? '--' : `${windSpeedMph} mph`,
    wind_direction: windDirection,
    precip_pct: precipPct,
    humidity: humidityPct == null ? '--' : `${humidityPct}%`,
    pressure: pressureInHg == null ? '--' : `${pressureInHg.toFixed(2)} inHg`,
    dew_point: dewpointF == null ? '--' : `${dewpointF}°F`,
    visibility: visibilityMiles == null ? '--' : `${visibilityMiles.toFixed(1)} mi`,

    /* Stable numeric fields. */
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
    precipitation_last_hour_inches: millimetersToInches(properties.precipitationLastHour?.value),
    precipitation_last_3_hours_inches: millimetersToInches(properties.precipitationLast3Hours?.value),
    precipitation_last_6_hours_inches: millimetersToInches(properties.precipitationLast6Hours?.value),
    cloud_layers: cloudLayers,
    present_weather: sanitizedPresentWeather(properties.presentWeather),

    /* Raw provider objects are deliberately omitted from the public snapshot. */
    raw_properties: null
  });
}

function normalizeForecastFallback(period, error) {
  const tempF = finiteNumber(period?.temperature);
  const windText = typeof period?.windSpeed === 'string' ? period.windSpeed : '--';
  const windNumber = finiteNumber(windText.match(/\d+(?:\.\d+)?/)?.[0]);

  return deepFreeze({
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
    humidity: '--',
    pressure: '--',
    dew_point: '--',
    visibility: '--',

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
    cloud_layers: [],
    present_weather: [],
    raw_properties: null
  });
}

function unavailableConditions(errors = []) {
  return deepFreeze({
    schema_version: CWN_HEART_SCHEMA_VERSION,
    data_kind: 'unavailable',
    data_status: 'unavailable',
    is_observation: false,
    is_stale: false,
    source_name: null,
    source_url: null,
    observation_station: '',
    observation_time: null,
    received_time: nowIso(),

    temp_f: '--',
    description: 'Weather Data Unavailable',
    wind_mph: '--',
    wind_direction: 'Variable',
    precip_pct: 0,
    humidity: '--',
    pressure: '--',
    dew_point: '--',
    visibility: '--',

    temperature_f: null,
    feels_like_f: null,
    heat_index_f: null,
    wind_chill_f: null,
    humidity_pct: null,
    pressure_inhg: null,
    dewpoint_f: null,
    visibility_miles: null,
    wind_speed_mph: null,
    wind_gust_mph: null,
    wind_direction_degrees: null,
    precipitation_last_hour_inches: null,
    precipitation_last_3_hours_inches: null,
    precipitation_last_6_hours_inches: null,
    cloud_layers: [],
    present_weather: [],
    raw_properties: null,
    errors: errors.map(serializeError)
  });
}

function validCityRecord(city) {
  const lat = finiteNumber(city?.lat);
  const lon = finiteNumber(city?.lon);
  return lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function validCitiesRegistry(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const counties = Object.values(data);
  if (!counties.length) return false;
  return counties.every(county =>
    county &&
    typeof county === 'object' &&
    !Array.isArray(county) &&
    Object.values(county).every(validCityRecord)
  );
}

function readCachedCities() {
  const cached = safeStorageGet(CITY_CACHE_KEY);
  if (
    !cached ||
    cached.schema !== CITY_CACHE_SCHEMA ||
    !cached.saved_at ||
    !validCitiesRegistry(cached.value)
  ) {
    return null;
  }

  const age = Date.now() - new Date(cached.saved_at).getTime();
  if (!Number.isFinite(age) || age < 0 || age > CONFIG.cityTtlMs) return null;
  return cached.value;
}

async function fetchCitiesRegistry(force = false) {
  const memory = MEMORY_CACHE.get(CITY_CACHE_KEY);
  if (!force && memory && memory.expiresAt > Date.now() && validCitiesRegistry(memory.value)) {
    return memory.value;
  }

  const persistent = !force ? readCachedCities() : null;
  if (persistent) {
    MEMORY_CACHE.set(CITY_CACHE_KEY, {
      value: persistent,
      expiresAt: Date.now() + CONFIG.cityTtlMs
    });
    return persistent;
  }

  const response = await fetch(CITY_DATA_URL, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    referrerPolicy: 'same-origin'
  });

  if (!response.ok) {
    throw new CWNHeartError(
      'CITIES_HTTP_ERROR',
      `CWN HEART cities.json failed: ${response.status} ${response.statusText}`,
      { url: CITY_DATA_URL, status: response.status }
    );
  }

  const data = await response.json();
  if (!validCitiesRegistry(data)) {
    throw new CWNHeartError(
      'CITIES_INVALID_RESPONSE',
      'CWN HEART cities.json has an unexpected structure',
      { url: CITY_DATA_URL }
    );
  }

  MEMORY_CACHE.set(CITY_CACHE_KEY, {
    value: data,
    expiresAt: Date.now() + CONFIG.cityTtlMs
  });
  safeStorageSet(CITY_CACHE_KEY, {
    schema: CITY_CACHE_SCHEMA,
    saved_at: nowIso(),
    value: data
  });
  return data;
}

export async function getCityCoords(cityName) {
  const requested = String(cityName ?? '').trim();
  if (!requested) throw new CWNHeartError('CITY_REQUIRED', 'A city name is required');

  const data = await fetchCitiesRegistry();
  const requestedLower = requested.toLocaleLowerCase('en-US');

  for (const county of Object.keys(data)) {
    const cities = data[county];
    for (const canonicalName of Object.keys(cities)) {
      if (canonicalName.toLocaleLowerCase('en-US') === requestedLower) {
        const record = cities[canonicalName];
        const { latitude, longitude } = normalizedCoordinates(record.lat, record.lon);
        return deepFreeze({
          ...cloneJSONSafe(record),
          lat: latitude,
          lon: longitude,
          city_name: canonicalName,
          county
        });
      }
    }
  }

  throw new CWNHeartError('CITY_NOT_FOUND', `City not found: ${requested}`, { cityName: requested });
}

export async function getConditions(lat, lon) {
  const errors = [];

  try {
    const selected = await selectObservation(lat, lon);
    let forecastPeriod = null;

    try {
      const forecast = await getForecastFeed(lat, lon);
      forecastPeriod = forecast.properties?.periods?.[0] ?? null;
    } catch (forecastError) {
      errors.push(forecastError);
      /* Observation remains authoritative and usable without forecast-derived precipitation chance. */
    }

    const result = normalizeConditions(selected.data, selected.stationUrl, forecastPeriod);
    saveLastGood('conditions', lat, lon, result);
    return result;
  } catch (observationError) {
    errors.push(observationError);

    try {
      const forecast = await getForecastFeed(lat, lon);
      const period = forecast.properties?.periods?.[0];
      if (!period) {
        throw new CWNHeartError('NO_FORECAST_PERIOD', 'No NWS forecast period was returned');
      }
      const fallback = normalizeForecastFallback(period, observationError);
      return fallback;
    } catch (forecastError) {
      errors.push(forecastError);
      return loadLastGood('conditions', lat, lon) ?? unavailableConditions(errors);
    }
  }
}

function cloneForecastPeriods(periods, count) {
  return periods.slice(0, count).map(period => deepFreeze(cloneJSONSafe(period) || {}));
}

export async function fetchNWSPeriods(lat, lon, count = 6) {
  const limit = clampInteger(count, 6, 0, CONFIG.maxForecastPeriods);
  if (limit === 0) return [];

  try {
    const forecast = await getForecastFeed(lat, lon);
    return Object.freeze(cloneForecastPeriods(forecast.properties.periods, limit));
  } catch (error) {
    console.error('[CWN HEART] Forecast periods unavailable:', serializeError(error));
    return Object.freeze([]);
  }
}

export async function fetchNWSHourlyPeriods(lat, lon, count = 24) {
  const limit = clampInteger(count, 24, 0, CONFIG.maxHourlyPeriods);
  if (limit === 0) return [];

  try {
    const forecast = await getHourlyFeed(lat, lon);
    const periods = forecast?.properties?.periods || [];
    return Object.freeze(cloneForecastPeriods(periods, limit));
  } catch (error) {
    console.error('[CWN HEART] Hourly forecast unavailable:', serializeError(error));
    return Object.freeze([]);
  }
}

function normalizedReferences(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map(reference => deepFreeze({
    identifier: reference?.identifier || '',
    sender: reference?.sender || '',
    sent: reference?.sent || null
  }));
}

function normalizedStringArray(value, max = 200) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).filter(item => typeof item === 'string');
}

function normalizedParameters(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    if (BLOCKED_BINDING_KEYS.has(key)) continue;
    if (Array.isArray(entry)) {
      result[key] = entry.slice(0, 100).map(item => String(item));
    } else if (entry == null || ['string', 'number', 'boolean'].includes(typeof entry)) {
      result[key] = entry;
    }
  }
  return result;
}

function normalizeAlert(feature) {
  const properties = feature?.properties ?? {};
  return deepFreeze({
    id: feature?.id || properties.id || '',
    identifier: properties.id || feature?.id || '',
    event: properties.event || '',
    sender: properties.sender || '',
    sender_name: properties.senderName || '',
    authority: properties.senderName || properties.sender || '',
    headline: properties.headline || '',
    description: properties.description || '',
    instruction: properties.instruction || '',
    area_desc: properties.areaDesc || '',
    severity: properties.severity || '',
    urgency: properties.urgency || '',
    certainty: properties.certainty || '',
    status: properties.status || '',
    message_type: properties.messageType || '',
    category: properties.category || '',
    response: properties.response || '',
    sent: properties.sent || null,
    effective: properties.effective || null,
    onset: properties.onset || null,
    expires: properties.expires || null,
    ends: properties.ends || null,
    references: normalizedReferences(properties.references),
    affected_zones: normalizedStringArray(properties.affectedZones),
    geometry: cloneJSONSafe(feature?.geometry),
    parameters: normalizedParameters(properties.parameters),
    source_url: feature?.id || '',
    provenance: 'authority-feed',
    data_status: 'live',
    is_stale: false,
    raw_properties: null
  });
}

export async function getAlerts(lat, lon) {
  const { key } = normalizedCoordinates(lat, lon);

  try {
    const data = await fetchJSON(
      `${NWS_BASE}/alerts/active?point=${encodeURIComponent(key)}`,
      {
        ttlMs: CONFIG.alertsTtlMs,
        validator: value => Array.isArray(value?.features)
      }
    );

    const alerts = data.features
      .slice(0, CONFIG.maxAlertRecords)
      .map(normalizeAlert);

    const result = Object.freeze(alerts);
    saveLastGood('alerts', lat, lon, result);
    return result;
  } catch (error) {
    console.error('[CWN HEART] Alerts unavailable:', serializeError(error));
    return loadLastGood('alerts', lat, lon) ?? Object.freeze([]);
  }
}

export function getRadarUrl() {
  return DEFAULT_RADAR_URL;
}

export function getRadarConfig() {
  return deepFreeze({
    mode: 'static-fallback',
    station: 'KOHX',
    source_name: 'NWS Radar KOHX Nashville',
    url: DEFAULT_RADAR_URL,
    is_third_party_read_only: true
  });
}

export function getClock() {
  return Object.freeze({
    clock_time: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  });
}

export function getDayPeriod(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return 'Unknown';
  const hour = value.getHours();
  if (hour < 5) return 'Overnight';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 21) return 'Evening';
  return 'Tonight';
}

export function hasEmergency(alerts = []) {
  if (!Array.isArray(alerts)) return false;
  return alerts.some(alert =>
    alert?.severity === 'Severe' ||
    alert?.severity === 'Extreme' ||
    /Warning/i.test(alert?.event || '')
  );
}

export const WEATHER_DATA_CATALOG = Object.freeze([
  Object.freeze({ id: 'current.temperature_f', label: 'Temperature', type: 'number', unit: '°F', legacy: 'temp_f' }),
  Object.freeze({ id: 'current.feels_like_f', label: 'Feels Like', type: 'number', unit: '°F' }),
  Object.freeze({ id: 'current.description', label: 'Conditions', type: 'text' }),
  Object.freeze({ id: 'current.humidity_pct', label: 'Humidity', type: 'number', unit: '%' }),
  Object.freeze({ id: 'current.dewpoint_f', label: 'Dew Point', type: 'number', unit: '°F' }),
  Object.freeze({ id: 'current.pressure_inhg', label: 'Pressure', type: 'number', unit: 'inHg' }),
  Object.freeze({ id: 'current.visibility_miles', label: 'Visibility', type: 'number', unit: 'mi' }),
  Object.freeze({ id: 'current.wind_speed_mph', label: 'Wind Speed', type: 'number', unit: 'mph' }),
  Object.freeze({ id: 'current.wind_gust_mph', label: 'Wind Gust', type: 'number', unit: 'mph' }),
  Object.freeze({ id: 'current.wind_direction', label: 'Wind Direction', type: 'text' }),
  Object.freeze({ id: 'current.precip_pct', label: 'Precipitation Chance', type: 'number', unit: '%' }),
  Object.freeze({ id: 'current.observation_time', label: 'Observation Time', type: 'datetime' }),
  Object.freeze({ id: 'current.observation_station', label: 'Observation Station', type: 'text' }),
  Object.freeze({ id: 'forecast.periods', label: 'Forecast Periods', type: 'collection' }),
  Object.freeze({ id: 'forecast.hourly', label: 'Hourly Forecast', type: 'collection' }),
  Object.freeze({ id: 'alerts', label: 'Active Alerts', type: 'collection' }),
  Object.freeze({ id: 'radar.url', label: 'KOHX Radar', type: 'image-url' }),
  Object.freeze({ id: 'system.clock_time', label: 'Clock', type: 'time' }),
  Object.freeze({ id: 'system.data_status', label: 'Data Status', type: 'status' }),
  Object.freeze({ id: 'system.source_name', label: 'Data Source', type: 'text' })
]);

const ALLOWED_BINDINGS = new Set(WEATHER_DATA_CATALOG.map(item => item.id));

export function getWeatherDataCatalog() {
  return WEATHER_DATA_CATALOG.map(item => ({ ...item }));
}

export function resolveWeatherData(snapshot, bindingId) {
  if (!snapshot || typeof bindingId !== 'string' || !ALLOWED_BINDINGS.has(bindingId)) {
    return null;
  }

  const keys = bindingId.split('.');
  if (keys.some(key => BLOCKED_BINDING_KEYS.has(key))) return null;

  return keys.reduce((value, key) => value?.[key], snapshot);
}

export async function getCWNSnapshot(cityName, options = {}) {
  const forecastCount = clampInteger(options.forecastCount, 6, 0, CONFIG.maxForecastPeriods);
  const hourlyCount = clampInteger(options.hourlyCount, 24, 0, CONFIG.maxHourlyPeriods);
  const { lat, lon, county = '', city_name: canonicalCity = String(cityName) } = await getCityCoords(cityName);

  const [current, alerts, periods, hourly] = await Promise.all([
    getConditions(lat, lon),
    getAlerts(lat, lon),
    fetchNWSPeriods(lat, lon, forecastCount),
    fetchNWSHourlyPeriods(lat, lon, hourlyCount)
  ]);

  return deepFreeze({
    schema_version: CWN_HEART_SCHEMA_VERSION,
    generated_at: nowIso(),
    location: {
      city_name: canonicalCity,
      county,
      lat,
      lon
    },
    current: { ...current },
    forecast: {
      periods: [...periods],
      hourly: [...hourly]
    },
    alerts: [...alerts],
    radar: getRadarConfig(),
    system: {
      ...getClock(),
      day_period: getDayPeriod(),
      data_status: current.data_status,
      source_name: current.source_name,
      has_emergency: hasEmergency(alerts),
      alert_data_status: alerts.data_status || (alerts.some(alert => alert.is_stale) ? 'stale' : 'live')
    },
    catalog: WEATHER_DATA_CATALOG
  });
}

export async function getCWNCore(cityName) {
  const snapshot = await getCWNSnapshot(cityName, { hourlyCount: 0 });
  return {
    city_name: snapshot.location.city_name,
    ...snapshot.current,
    alerts: snapshot.alerts,
    radar_url: snapshot.radar.url,
    clock_time: snapshot.system.clock_time,
    schema_version: snapshot.schema_version,
    data_catalog: snapshot.catalog
  };
}

export function clearHeartMemoryCache() {
  MEMORY_CACHE.clear();
  /* In-flight network work is not aborted; references are only released. */
  IN_FLIGHT.clear();
}

export function clearHeartPersistentCache() {
  for (const key of safeStorageKeys()) {
    if (key === CITY_CACHE_KEY || key.startsWith(LAST_GOOD_PREFIX)) {
      safeStorageRemove(key);
    }
  }
}

export function clearHeartCache(options = {}) {
  const includePersistent = Boolean(options?.persistent);
  clearHeartMemoryCache();
  if (includePersistent) clearHeartPersistentCache();
}

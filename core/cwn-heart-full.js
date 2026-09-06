/* ============================================================
   CWN HEART v2.1 — Hyperlocal Environment Atmospheric Reporting Technology
   v2.1: + precip_pct in getConditions()
         + User-Agent on ALL NWS fetches
         + exported fetchNWSPeriods()
   ============================================================ */

const NWS_UA = { 'User-Agent': 'CumberlandWeatherNet/2.0 (cumberlandweather.net)' };

export async function getCityCoords(cityName) {
  const res  = await fetch('../api/cities.json', { headers: NWS_UA });
  const data = await res.json();
  for (const county in data) {
    if (data[county][cityName]) return data[county][cityName];
  }
  throw new Error(`City not found: ${cityName}`);
}

export async function getConditions(lat, lon) {
  const point    = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers: NWS_UA }).then(r => r.json());
  const forecast = await fetch(point.properties.forecast, { headers: NWS_UA }).then(r => r.json());
  const period   = forecast.properties.periods[0];
  return {
    temp_f         : period.temperature,
    description    : period.shortForecast,
    wind_mph       : period.windSpeed,
    wind_direction : period.windDirection,
    precip_pct     : period.probabilityOfPrecipitation?.value ?? 0
  };
}

export async function fetchNWSPeriods(lat, lon, count = 6) {
  const point    = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers: NWS_UA }).then(r => r.json());
  const forecast = await fetch(point.properties.forecast, { headers: NWS_UA }).then(r => r.json());
  return forecast.properties.periods.slice(0, count);
}

export async function getAlerts(lat, lon) {
  const data = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, { headers: NWS_UA }).then(r => r.json());
  return (data.features || []).map(a => ({
    event    : a.properties.event,
    severity : a.properties.severity,
    headline : a.properties.headline
  }));
}

export function getRadarUrl() {
  return 'https://radar.weather.gov/ridge/standard/KOHX_loop.gif';
}

export function getClock() {
  return { clock_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
}

export function getDayPeriod() {
  const h = new Date().getHours();
  return (h >= 18 || h < 2) ? 'Tonight' : 'Today';
}

export function hasEmergency(alerts) {
  return alerts.some(a =>
    a.severity === 'Severe'  ||
    a.severity === 'Extreme' ||
    a.event.includes('Warning')
  );
}

export async function getCWNCore(cityName) {
  const { lat, lon } = await getCityCoords(cityName);
  const [conditions, alerts] = await Promise.all([getConditions(lat, lon), getAlerts(lat, lon)]);
  return { city_name: cityName, ...conditions, alerts, radar_url: getRadarUrl(), ...getClock() };
}


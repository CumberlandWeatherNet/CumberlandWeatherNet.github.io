/* ============================================================
   CWN HEART v2.1.1 — Hyperlocal Environment Atmospheric Reporting Technology
   PATCH RELEASE

   Fixes:
   + Handles NWS fetch failures gracefully
   + Prevents site-wide crashes
   + Validates API responses
   + Preserves ALL exports and return formats
   + Requires NO CHANGES to existing pages
   ============================================================ */

const NWS_UA = {
  'Accept': 'application/geo+json'
};

export async function getCityCoords(cityName) {

  const res = await fetch('../api/cities.json');

  if (!res.ok) {
    throw new Error(`cities.json failed (${res.status})`);
  }

  const data = await res.json();

  for (const county in data) {
    if (data[county]?.[cityName]) {
      return data[county][cityName];
    }
  }

  throw new Error(`City not found: ${cityName}`);
}

export async function getConditions(lat, lon) {

  try {

    const pointRes = await fetch(
      `https://api.weather.gov/points/${lat},${lon}`,
      { headers: NWS_UA }
    );

    if (!pointRes.ok) {
      throw new Error(`Points API failed (${pointRes.status})`);
    }

    const point = await pointRes.json();

    const forecastRes = await fetch(
      point.properties.forecast,
      { headers: NWS_UA }
    );

    if (!forecastRes.ok) {
      throw new Error(`Forecast API failed (${forecastRes.status})`);
    }

    const forecast = await forecastRes.json();

    const period = forecast?.properties?.periods?.[0];

    if (!period) {
      throw new Error('Forecast period missing');
    }

    return {
      temp_f: period.temperature,
      description: period.shortForecast,
      wind_mph: period.windSpeed,
      wind_direction: period.windDirection,
      precip_pct:
        period.probabilityOfPrecipitation?.value ?? 0
    };

  } catch (err) {

    console.error(
      '[CWN HEART] getConditions failed:',
      err
    );

    return {
      temp_f: '--',
      description: 'Data Unavailable',
      wind_mph: '0 mph',
      wind_direction: 'Variable',
      precip_pct: 0
    };
  }
}

export async function fetchNWSPeriods(lat, lon, count = 6) {

  try {

    const pointRes = await fetch(
      `https://api.weather.gov/points/${lat},${lon}`,
      { headers: NWS_UA }
    );

    if (!pointRes.ok) {
      throw new Error(`Points API failed (${pointRes.status})`);
    }

    const point = await pointRes.json();

    const forecastRes = await fetch(
      point.properties.forecast,
      { headers: NWS_UA }
    );

    if (!forecastRes.ok) {
      throw new Error(`Forecast API failed (${forecastRes.status})`);
    }

    const forecast = await forecastRes.json();

    return (
      forecast?.properties?.periods?.slice(0, count)
      || []
    );

  } catch (err) {

    console.error(
      '[CWN HEART] fetchNWSPeriods failed:',
      err
    );

    return [];
  }
}

export async function getAlerts(lat, lon) {

  try {

    const res = await fetch(
      `https://api.weather.gov/alerts/active?point=${lat},${lon}`,
      { headers: NWS_UA }
    );

    if (!res.ok) {
      throw new Error(`Alerts API failed (${res.status})`);
    }

    const data = await res.json();

    return (data.features || []).map(a => ({
      event: a.properties.event,
      severity: a.properties.severity,
      headline: a.properties.headline
    }));

  } catch (err) {

    console.error(
      '[CWN HEART] getAlerts failed:',
      err
    );

    return [];
  }
}

export function getRadarUrl() {
  return 'https://radar.weather.gov/ridge/standard/KOHX_loop.gif';
}

export function getClock() {
  return {
    clock_time: new Date().toLocaleTimeString(
      [],
      {
        hour: '2-digit',
        minute: '2-digit'
      }
    )
  };
}

export function getDayPeriod() {
  const h = new Date().getHours();
  return (h >= 18 || h < 2)
    ? 'Tonight'
    : 'Today';
}

export function hasEmergency(alerts) {

  return alerts.some(a =>
    a.severity === 'Severe' ||
    a.severity === 'Extreme' ||
    a.event.includes('Warning')
  );
}

export async function getCWNCore(cityName) {

  try {

    const { lat, lon } =
      await getCityCoords(cityName);

    const [conditions, alerts] =
      await Promise.all([
        getConditions(lat, lon),
        getAlerts(lat, lon)
      ]);

    return {
      city_name: cityName,
      ...conditions,
      alerts,
      radar_url: getRadarUrl(),
      ...getClock()
    };

  } catch (err) {

    console.error(
      '[CWN HEART] getCWNCore failed:',
      err
    );

    return {
      city_name: cityName,
      temp_f: '--',
      description: 'Data Unavailable',
      wind_mph: '0 mph',
      wind_direction: 'Variable',
      precip_pct: 0,
      alerts: [],
      radar_url: getRadarUrl(),
      ...getClock()
    };
  }
}

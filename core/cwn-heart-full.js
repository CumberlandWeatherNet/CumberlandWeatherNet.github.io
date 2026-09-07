/* ============================================================
   CWN HEART v2.3 — Hyperlocal Environment Atmospheric Reporting Technology

   v2.3:
   + Uses live NWS observations for current conditions
   + Adds humidity
   + Adds atmospheric pressure
   + Adds dew point
   + Adds visibility
   + Retains NWS forecast periods for actual forecasts
   + Preserves all existing exports and return properties
   ============================================================ */

const NWS_UA = {
  'Accept': 'application/geo+json'
};

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: NWS_UA
  });

  if (!response.ok) {
    throw new Error(
      `CWN HEART request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

function celsiusToFahrenheit(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return null;
  }

  return Math.round((Number(value) * 9 / 5) + 32);
}

function kilometersPerHourToMilesPerHour(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return null;
  }

  return Math.round(Number(value) * 0.621371);
}

function pascalsToInchesMercury(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return null;
  }

  return Number((Number(value) * 0.0002952998751).toFixed(2));
}

function metersToMiles(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return null;
  }

  return Number((Number(value) * 0.000621371).toFixed(1));
}

function degreesToCompass(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return 'Variable';
  }

  const directions = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW'
  ];

  const degrees = ((Number(value) % 360) + 360) % 360;
  const index = Math.round(degrees / 22.5) % 16;

  return directions[index];
}

export async function getCityCoords(cityName) {
  const res = await fetch('../api/cities.json');

  if (!res.ok) {
    throw new Error(
      `CWN HEART cities.json failed: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();

  for (const county in data) {
    if (data[county][cityName]) {
      return data[county][cityName];
    }
  }

  throw new Error(`City not found: ${cityName}`);
}

export async function getConditions(lat, lon) {
  try {
    const point = await fetchJSON(
      `https://api.weather.gov/points/${lat},${lon}`
    );

    const stations = await fetchJSON(
      point.properties.observationStations
    );

    const stationUrl = stations.features?.[0]?.id;

    if (!stationUrl) {
      throw new Error('No NWS observation station was returned');
    }

    const observation = await fetchJSON(
      `${stationUrl}/observations/latest`
    );

    const p = observation.properties || {};

    let precipPct = 0;

    try {
      const forecast = await fetchJSON(
        point.properties.forecast
      );

      precipPct =
        forecast.properties?.periods?.[0]
          ?.probabilityOfPrecipitation?.value ?? 0;
    } catch (forecastError) {
      console.warn(
        '[CWN HEART] Precipitation forecast unavailable:',
        forecastError
      );
    }

    const tempValue =
      celsiusToFahrenheit(p.temperature?.value);

    const dewPointValue =
      celsiusToFahrenheit(p.dewpoint?.value);

    const windSpeedValue =
      kilometersPerHourToMilesPerHour(p.windSpeed?.value);

    const humidityValue =
      p.relativeHumidity?.value != null &&
      Number.isFinite(Number(p.relativeHumidity.value))
        ? Math.round(Number(p.relativeHumidity.value))
        : null;

    const pressureValue =
      pascalsToInchesMercury(
        p.barometricPressure?.value ??
        p.seaLevelPressure?.value
      );

    const visibilityValue =
      metersToMiles(p.visibility?.value);

    const windDirectionDegrees =
      p.windDirection?.value != null &&
      Number.isFinite(Number(p.windDirection.value))
        ? Math.round(Number(p.windDirection.value))
        : null;

    const windDirection =
      degreesToCompass(windDirectionDegrees);

    return {
      temp_f:
        tempValue ?? '--',

      description:
        p.textDescription || 'Current Conditions',

      wind_mph:
        windSpeedValue != null
          ? `${windSpeedValue} mph`
          : '0 mph',

      wind_direction:
        windDirection,

      precip_pct:
        precipPct,

      humidity:
        humidityValue != null
          ? `${humidityValue}%`
          : '--',

      pressure:
        pressureValue != null
          ? `${pressureValue.toFixed(2)} inHg`
          : '--',

      dew_point:
        dewPointValue != null
          ? `${dewPointValue}°F`
          : '--',

      visibility:
        visibilityValue != null
          ? `${visibilityValue.toFixed(1)} mi`
          : '--',

      humidity_pct:
        humidityValue ?? 0,

      pressure_inhg:
        pressureValue ?? 0,

      dewpoint_f:
        dewPointValue ?? '--',

      visibility_miles:
        visibilityValue ?? 0,

      wind_direction_degrees:
        windDirectionDegrees,

      observation_station:
        stationUrl.split('/').pop() || '',

      observation_time:
        p.timestamp || null
    };

  } catch (err) {
    console.warn(
      '[CWN HEART] Observation unavailable, using forecast:',
      err
    );

    try {
      const point = await fetchJSON(
        `https://api.weather.gov/points/${lat},${lon}`
      );

      const forecast = await fetchJSON(
        point.properties.forecast
      );

      const period = forecast.properties?.periods?.[0];

      if (!period) {
        throw new Error('No NWS forecast period was returned');
      }

      return {
        temp_f:
          period.temperature,

        description:
          period.shortForecast,

        wind_mph:
          period.windSpeed,

        wind_direction:
          period.windDirection,

        precip_pct:
          period.probabilityOfPrecipitation?.value ?? 0,

        humidity:
          '--',

        pressure:
          '--',

        dew_point:
          '--',

        visibility:
          '--',

        humidity_pct:
          0,

        pressure_inhg:
          0,

        dewpoint_f:
          '--',

        visibility_miles:
          0,

        wind_direction_degrees:
          null,

        observation_station:
          '',

        observation_time:
          null
      };

    } catch (forecastError) {
      console.error(
        '[CWN HEART] Current conditions and forecast failed:',
        forecastError
      );

      return {
        temp_f:
          '--',

        description:
          'Weather Data Unavailable',

        wind_mph:
          '0 mph',

        wind_direction:
          'Variable',

        precip_pct:
          0,

        humidity:
          '--',

        pressure:
          '--',

        dew_point:
          '--',

        visibility:
          '--',

        humidity_pct:
          0,

        pressure_inhg:
          0,

        dewpoint_f:
          '--',

        visibility_miles:
          0,

        wind_direction_degrees:
          null,

        observation_station:
          '',

        observation_time:
          null
      };
    }
  }
}

export async function fetchNWSPeriods(lat, lon, count = 6) {
  try {
    const point = await fetchJSON(
      `https://api.weather.gov/points/${lat},${lon}`
    );

    const forecast = await fetchJSON(
      point.properties.forecast
    );

    return forecast.properties?.periods?.slice(0, count) || [];

  } catch (err) {
    console.error(
      '[CWN HEART] Forecast periods unavailable:',
      err
    );

    return [];
  }
}

export async function getAlerts(lat, lon) {
  try {
    const data = await fetchJSON(
      `https://api.weather.gov/alerts/active?point=${lat},${lon}`
    );

    return (data.features || []).map(a => ({
      event:
        a.properties?.event || '',

      severity:
        a.properties?.severity || '',

      headline:
        a.properties?.headline || ''
    }));

  } catch (err) {
    console.error(
      '[CWN HEART] Alerts unavailable:',
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
    a.event?.includes('Warning')
  );
}

export async function getCWNCore(cityName) {
  const { lat, lon } =
    await getCityCoords(cityName);

  const [conditions, alerts] =
    await Promise.all([
      getConditions(lat, lon),
      getAlerts(lat, lon)
    ]);

  return {
    city_name:
      cityName,

    ...conditions,

    alerts,

    radar_url:
      getRadarUrl(),

    ...getClock()
  };
}


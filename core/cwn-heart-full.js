/* ============================================================
   CWN HEART v3.0
   Hyperlocal Environment Atmospheric Reporting Technology

   Improvements:
   - Uses real NWS observation stations
   - Better error handling
   - Safer fallback values
   - Cleaner async flow
   - Full alert support
   - Forecast periods export
   ============================================================ */

const NWS_HEADERS = {
  Accept: "application/geo+json"
};

/* ---------------------------
   CITY COORDINATES
--------------------------- */

export async function getCityCoords(cityName) {
  try {
    const response = await fetch("../api/cities.json");

    if (!response.ok) {
      throw new Error(`cities.json failed (${response.status})`);
    }

    const data = await response.json();

    for (const county in data) {
      if (data[county][cityName]) {
        return data[county][cityName];
      }
    }

    throw new Error(`City not found: ${cityName}`);

  } catch (error) {
    console.error("getCityCoords:", error);
    throw error;
  }
}

/* ---------------------------
   NWS POINT DATA
--------------------------- */

async function getPointData(lat, lon) {
  const response = await fetch(
    `https://api.weather.gov/points/${lat},${lon}`,
    {
      headers: NWS_HEADERS
    }
  );

  if (!response.ok) {
    throw new Error(`NWS Points Error: ${response.status}`);
  }

  return await response.json();
}

/* ---------------------------
   LIVE OBSERVATIONS
--------------------------- */

export async function getConditions(lat, lon) {
  try {
    const pointData = await getPointData(lat, lon);

    const stationUrl =
      pointData.properties.observationStations;

    const stationsResponse = await fetch(
      stationUrl,
      { headers: NWS_HEADERS }
    );

    const stationsData =
      await stationsResponse.json();

    const station =
      stationsData.observationStations?.[0];

    if (!station) {
      throw new Error("No observation station found");
    }

    const observationResponse = await fetch(
      `${station}/observations/latest`,
      { headers: NWS_HEADERS }
    );

    const observationData =
      await observationResponse.json();

    const props =
      observationData.properties;

    return {
      temp_f:
        props.temperature?.value != null
          ? Math.round(
              (props.temperature.value * 9) / 5 + 32
            )
          : null,

      description:
        props.textDescription || "Unavailable",

      wind_mph:
        props.windSpeed?.value != null
          ? Math.round(
              props.windSpeed.value * 0.621371
            )
          : 0,

      wind_direction:
        props.windDirection?.value != null
          ? `${Math.round(
              props.windDirection.value
            )}°`
          : "Variable",

      relative_humidity:
        props.relativeHumidity?.value ?? null,

      timestamp:
        props.timestamp
    };

  } catch (error) {
    console.error("getConditions:", error);

    return {
      temp_f: null,
      description: "Weather Data Unavailable",
      wind_mph: 0,
      wind_direction: "N/A",
      relative_humidity: null,
      timestamp: null
    };
  }
}

/* ---------------------------
   FORECAST PERIODS
--------------------------- */

export async function fetchNWSPeriods(
  lat,
  lon,
  count = 6
) {
  try {
    const pointData =
      await getPointData(lat, lon);

    const forecastResponse = await fetch(
      pointData.properties.forecast,
      {
        headers: NWS_HEADERS
      }
    );

    const forecastData =
      await forecastResponse.json();

    return forecastData.properties.periods
      .slice(0, count);

  } catch (error) {
    console.error(
      "fetchNWSPeriods:",
      error
    );

    return [];
  }
}

/* ---------------------------
   ALERTS
--------------------------- */

export async function getAlerts(lat, lon) {
  try {
    const response = await fetch(
      `https://api.weather.gov/alerts/active?point=${lat},${lon}`,
      {
        headers: NWS_HEADERS
      }
    );

    const data = await response.json();

    return (data.features || []).map(
      alert => ({
        event:
          alert.properties.event,

        severity:
          alert.properties.severity,

        headline:
          alert.properties.headline,

        description:
          alert.properties.description
      })
    );

  } catch (error) {
    console.error("getAlerts:", error);
    return [];
  }
}

/* ---------------------------
   RADAR
--------------------------- */

export function getRadarUrl() {
  return "https://radar.weather.gov/ridge/standard/KOHX_loop.gif";
}

/* ---------------------------
   CLOCK
--------------------------- */

export function getClock() {
  return {
    clock_time: new Date().toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    )
  };
}

/* ---------------------------
   DAY PART
--------------------------- */

export function getDayPeriod() {
  const h = new Date().getHours();

  if (h >= 18 || h < 6) {
    return "Tonight";
  }

  return "Today";
}

/* ---------------------------
   EMERGENCY DETECTION
--------------------------- */

export function hasEmergency(alerts) {
  return alerts.some(alert =>
    alert.severity === "Extreme" ||
    alert.severity === "Severe" ||
    alert.event.includes("Warning")
  );
}

/* ---------------------------
  

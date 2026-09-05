/* ============================================================
   CWN HEART v2.0 — Hyperlocal Environment Atmospheric Reporting Technology
   Clean, stable, production-ready core for all CWN era pages
   ============================================================ */

/* ------------------------------
   1. Load city coordinates
   ------------------------------ */
export async function getCityCoords(cityName) {
    const res = await fetch("../api/cities.json");
    const data = await res.json();

    for (const county in data) {
        if (data[county][cityName]) {
            return data[county][cityName];
        }
    }

    throw new Error("City not found in cities.json");
}

/* ------------------------------
   2. Fetch current conditions
   ------------------------------ */
export async function getConditions(lat, lon) {
    const url = `https://api.weather.gov/points/${lat},${lon}`;
    const point = await fetch(url).then(r => r.json());

    const forecastUrl = point.properties.forecast;
    const forecast = await fetch(forecastUrl).then(r => r.json());

    const period = forecast.properties.periods[0];

    return {
        temp_f: period.temperature,
        description: period.shortForecast,
        wind_mph: period.windSpeed,
        wind_direction: period.windDirection
    };
}

/* ------------------------------
   3. Fetch alerts
   ------------------------------ */
export async function getAlerts(lat, lon) {
    const url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
    const alerts = await fetch(url).then(r => r.json());

    return alerts.features.map(a => ({
        event: a.properties.event,
        severity: a.properties.severity,
        headline: a.properties.headline
    }));
}

/* ------------------------------
   4. Radar URL
   ------------------------------ */
export function getRadarUrl() {
    return "https://radar.weather.gov/ridge/standard/KOHX_loop.gif";
}

/* ------------------------------
   5. Clock
   ------------------------------ */
export function getClock() {
    const now = new Date();
    return {
        clock_time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
}

/* ------------------------------
   6. Today/Tonight logic
   ------------------------------ */
export function getDayPeriod() {
    const hour = new Date().getHours();
    return (hour >= 18 || hour < 2) ? "Tonight" : "Today";
}

/* ------------------------------
   7. Emergency detection
   ------------------------------ */
export function hasEmergency(alerts) {
    return alerts.some(a =>
        a.severity === "Severe" ||
        a.severity === "Extreme" ||
        a.event.includes("Warning")
    );
}

/* ------------------------------
   8. Unified CWN Core Object
   ------------------------------ */
export async function getCWNCore(cityName) {
    const coords = await getCityCoords(cityName);

    const conditions = await getConditions(coords.lat, coords.lon);
    const alerts = await getAlerts(coords.lat, coords.lon);
    const radar_url = getRadarUrl();
    const clock = getClock();

    return {
        city_name: cityName,
        ...conditions,
        alerts,
        radar_url,
        ...clock
    };
}

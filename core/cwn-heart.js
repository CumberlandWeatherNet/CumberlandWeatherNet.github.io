// ===============================
//  CWN HEART v1.0 (Browser-Side)
//  Unified Data Core for All Eras
// ===============================

// Major Middle Tennessee cities
export const CITY_COORDS = {
  "Lebanon,TN": { name:"Lebanon, Tennessee", lat:36.2081, lon:-86.2911 },
  "Nashville,TN": { name:"Nashville, Tennessee", lat:36.1627, lon:-86.7816 },
  "Gallatin,TN": { name:"Gallatin, Tennessee", lat:36.3884, lon:-86.4467 },
  "Cookeville,TN": { name:"Cookeville, Tennessee", lat:36.1628, lon:-85.5016 },
  "Murfreesboro,TN": { name:"Murfreesboro, Tennessee", lat:35.8456, lon:-86.3903 }
};

// ===============================
//  LIVE CONDITIONS (Open-Meteo)
// ===============================
export async function getConditions(cityKey) {
  const c = CITY_COORDS[cityKey];
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current_weather=true`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const cw = data.current_weather;

    return {
      city_name: c.name,
      temp_f: Math.round((cw.temperature * 9/5) + 32),
      wind_mph: Math.round(cw.windspeed),
      humidity: cw.relativehumidity ?? null,
      description: "Live Conditions"
    };
  } catch (e) {
    return {
      city_name: c.name,
      temp_f: null,
      wind_mph: null,
      humidity: null,
      description: "Unavailable"
    };
  }
}

// ===============================
//  RADAR SOURCE (NOAA Static)
// ===============================
export function getRadarUrl() {
  return "https://radar.weather.gov/ridge/standard/KOHX_loop.gif";
}

// ===============================
//  ALERTS (Placeholder v1.0)
//  Future: NWS API integration
// ===============================
export async function getAlerts(cityKey) {
  return []; // placeholder until NWS integration
}

// ===============================
//  CLOCK (No Seconds)
// ===============================
export function getClock() {
  const now = new Date();
  return {
    clock_time: now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    }),
    clock_date: now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    })
  };
}

// ===============================
//  HEART — Unified Output
// ===============================
export async function getCWNCore(cityKey) {
  const conditions = await getConditions(cityKey);
  const alerts = await getAlerts(cityKey);
  const radar_url = getRadarUrl();
  const clock = getClock();

  return {
    ...conditions,
    radar_url,
    alerts,
    ...clock
  };
}

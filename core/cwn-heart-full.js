const CWN_HEART_VERSION_1.1


// =============================================================
//   CUMBERLAND WEATHER NETWORK — FULL HEART / AI CORE
// =============================================================

// -------------------------------------------------------------
//  SHARED AUDIO CONTEXT (Alert Audio AI)
// -------------------------------------------------------------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// -------------------------------------------------------------
//  CITY METADATA (Data Heart)
// -------------------------------------------------------------
const CITY_COORDS = {
  "Lebanon,TN": { name:"Lebanon, Tennessee", lat:36.2081, lon:-86.2911 },
  "Nashville,TN": { name:"Nashville, Tennessee", lat:36.1627, lon:-86.7816 },
  "Gallatin,TN": { name:"Gallatin, Tennessee", lat:36.3884, lon:-86.4467 },
  "Cookeville,TN": { name:"Cookeville, Tennessee", lat:36.1628, lon:-85.5016 },
  "Murfreesboro,TN": { name:"Murfreesboro, Tennessee", lat:35.8456, lon:-86.3903 }
};

// -------------------------------------------------------------
//  DATA HEART — Live Weather (Open-Meteo)
// -------------------------------------------------------------
async function getConditions(cityKey) {
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
  } catch {
    return {
      city_name: c.name,
      temp_f: null,
      wind_mph: null,
      humidity: null,
      description: "Unavailable"
    };
  }
}

// -------------------------------------------------------------
//  RADAR SOURCE (NOAA)
// -------------------------------------------------------------
function getRadarUrl() {
  return "https://radar.weather.gov/ridge/standard/KOHX_loop.gif";
}

// -------------------------------------------------------------
//  ALERTS (placeholder v1.0)
// -------------------------------------------------------------
async function getAlerts() {
  return [];
}

// -------------------------------------------------------------
//  CLOCK (no seconds)
// -------------------------------------------------------------
function getClock() {
  const now = new Date();
  return {
    clock_time: now.toLocaleTimeString("en-US", {
      hour:"2-digit",
      minute:"2-digit"
    }),
    clock_date: now.toLocaleDateString("en-US", {
      month:"long",
      day:"numeric",
      year:"numeric"
    })
  };
}

// -------------------------------------------------------------
//  HEART CONTRACT — Unified Output
// -------------------------------------------------------------
async function getHeart(cityKey) {
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

// -------------------------------------------------------------
//  MAINTAINER AI — Data Integrity
// -------------------------------------------------------------
function validateHeartOutput(core) {
  const required = [
    "city_name","temp_f","wind_mph","humidity",
    "description","radar_url","alerts",
    "clock_time","clock_date"
  ];

  required.forEach(f => {
    if (!(f in core)) console.warn("[CWN AI] Missing field:", f);
  });

  return core;
}

// -------------------------------------------------------------
//  MAINTAINER AI — Era Consumption
// -------------------------------------------------------------
function validateEraConsumption(core, era) {
  const required = [
    "city_name","temp_f","wind_mph",
    "description","clock_time","clock_date"
  ];

  required.forEach(f => {
    if (!(f in core)) console.warn(`[CWN Era AI] ${era} missing:`, f);
  });
}

// -------------------------------------------------------------
//  MAINTAINER AI — Alert Normalization
// -------------------------------------------------------------
function normalizeAlerts(alerts) {
  if (!Array.isArray(alerts)) return [];
  return alerts.map(a => ({
    type: a.type || "Unknown Alert",
    severity: a.severity || "Moderate",
    text: a.text || "Details unavailable."
  }));
}

// -------------------------------------------------------------
//  MAINTAINER AI — Radar Validation
// -------------------------------------------------------------
function validateRadar(url) {
  if (!url) console.warn("[CWN Radar AI] Missing radar URL");
  return url;
}

// -------------------------------------------------------------
//  MAINTAINER AI — Clock Validation
// -------------------------------------------------------------
function validateClock(core) {
  if (!core.clock_time || !core.clock_date) {
    console.warn("[CWN Clock AI] Missing clock fields");
  }
}

// -------------------------------------------------------------
//  ERA AUTHENTICITY AI
// -------------------------------------------------------------
function validateEraAuthenticity(era) {
  const eras = ["1850s","1900s","1950s","1970s","1980s","1990s","2000s"];
  if (!eras.includes(era)) {
    console.warn("[CWN Era Authenticity AI] Unknown era:", era);
  }
}

// -------------------------------------------------------------
//  BRANDING & IDENTITY AI
// -------------------------------------------------------------
function validateBrandIdentity() {
  // Placeholder for crest, bug, typography rules
}

// -------------------------------------------------------------
//  WEATHER WINDOW AI
// -------------------------------------------------------------
function validateWeatherWindow() {
  // Placeholder for CRT grid, glow, layout rules
}

// -------------------------------------------------------------
//  INFRASTRUCTURE AI
// -------------------------------------------------------------
function validateInfrastructure() {
  // Placeholder for repo structure checks
}

// -------------------------------------------------------------
//  PROGRAMMING BIBLE AI
// -------------------------------------------------------------
function enforceProgrammingBible() {
  // Placeholder for CWN Bible rule enforcement
}

// -------------------------------------------------------------
//  ALERT AUDIO AI — Tone Synthesis
// -------------------------------------------------------------
function playTone(freq, dur) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  gain.gain.value = 0.4;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

function playAlertTone(type) {
  if (type === "Tornado Warning") {
    playTone(440,0.4); playTone(660,0.4); playTone(880,0.4);
  }
}

// -------------------------------------------------------------
//  WORKER BEES — Supervisors
// -------------------------------------------------------------
const AI_REGISTRY = {
  dataMaintainer:true,
  eraMaintainer:true,
  alertMaintainer:true,
  radarMaintainer:true,
  clockMaintainer:true,
  eraAuthenticity:true,
  brandIdentity:true,
  weatherWindow:true,
  infrastructure:true,
  programmingBible:true,
  alertAudio:true
};

const WorkerBeeA = {
  enable(ai){ AI_REGISTRY[ai] = true; },
  disable(ai){ AI_REGISTRY[ai] = false; },
  status(){ return {...AI_REGISTRY}; }
};

const WorkerBeeB = {
  replaceAI(ai, fn){ AI_REGISTRY[ai] = true; },
  retireAI(ai){ AI_REGISTRY[ai] = false; }
};

// -------------------------------------------------------------
//  ADMIN AI — Human Override
// -------------------------------------------------------------
const AdminAI = {
  override(ai, state){ AI_REGISTRY[ai] = state; },
  getStatus(){ return {...AI_REGISTRY}; }
};

// -------------------------------------------------------------
//  FULL HEART — All AIs Applied
// -------------------------------------------------------------
export async function CWN_HEART(cityKey, era="1970s") {

  let core = await getHeart(cityKey);

  if (AI_REGISTRY.dataMaintainer) core = validateHeartOutput(core);
  if (AI_REGISTRY.alertMaintainer) core.alerts = normalizeAlerts(core.alerts);
  if (AI_REGISTRY.radarMaintainer) core.radar_url = validateRadar(core.radar_url);
  if (AI_REGISTRY.clockMaintainer) validateClock(core);
  if (AI_REGISTRY.eraMaintainer) validateEraConsumption(core, era);
  if (AI_REGISTRY.eraAuthenticity) validateEraAuthenticity(era);
  if (AI_REGISTRY.brandIdentity) validateBrandIdentity();
  if (AI_REGISTRY.weatherWindow) validateWeatherWindow();
  if (AI_REGISTRY.infrastructure) validateInfrastructure();
  if (AI_REGISTRY.programmingBible) enforceProgrammingBible();

  if (AI_REGISTRY.alertAudio && core.alerts.length > 0) {
    core.alerts.forEach(a => playAlertTone(a.type));
  }

  return core;
}

// -------------------------------------------------------------
//  EXPORT WORKER BEES + ADMIN
// -------------------------------------------------------------
export { WorkerBeeA, WorkerBeeB, AdminAI };

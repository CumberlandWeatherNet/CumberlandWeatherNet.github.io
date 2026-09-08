/**
 * CWN 1980s Edition — 80s.js  (corrected)
 *
 * Data sources:
 *   /api/cities.json   → nested { County: { CityName: { lat, lon } } }
 *   cwn-heart-full.js  → getConditions(lat,lon), getAlerts(lat,lon),
 *                         fetchNWSPeriods(lat,lon,count), getRadarUrl() [sync],
 *                         hasEmergency(alerts)
 */

import {
  getConditions,
  getAlerts,
  getRadarUrl,
  fetchNWSPeriods,
  hasEmergency,
} from './core/cwn-heart-full.js';

/* ── DOM HOOKS ── */
const timeEl          = document.getElementById('cwnTime');
const themeToggleBtn  = document.getElementById('themeToggle');
const directoryNav    = document.getElementById('directoryNav');
const directoryToggle = document.getElementById('directoryToggle');
const citySelect      = document.getElementById('citySelect');
const forecastStrip   = document.getElementById('forecastStrip');
const alertStrip      = document.getElementById('alertStrip');
const alertStripText  = document.getElementById('alertStripText');
const currentSymbol   = document.getElementById('currentSymbol');
const currentTempEl   = document.getElementById('currentTemp');
const feelsLikeEl     = document.getElementById('feelsLike');
const summaryEl       = document.getElementById('currentSummary');
const humidityEl      = document.getElementById('humidity');
const windEl          = document.getElementById('wind');
const pressureEl      = document.getElementById('pressure');
const visibilityEl    = document.getElementById('visibility');
const lastUpdateEl    = document.getElementById('lastUpdate');
const alertsEmpty     = document.getElementById('alertsEmpty');
const alertsList      = document.getElementById('alertsList');
const radarImg        = document.getElementById('cwnRadar');
const radarStatus     = document.getElementById('cwnRadarStatus');
const openRadarFull   = document.getElementById('openRadarFull');
const tickerContent   = document.getElementById('tickerContent');
const themeColorMeta  = document.getElementById('themeColor');

const THEME_KEY = 'cwn80s_theme';
const CITY_KEY  = 'cwn_city';

/**
 * Flat lookup table built when cities.json loads.
 * Key = city name string, value = { lat, lon }
 */
let cityMap = {};

/* ─────────────────────────────────────────────── */
/*   SYMBOL HELPER                                 */
/* ─────────────────────────────────────────────── */
function descToSymbol(desc = '') {
  const d = desc.toLowerCase();
  if (d.includes('thunder'))                              return '⛈';
  if (d.includes('snow') || d.includes('blizzard'))      return '❄';
  if (d.includes('rain') || d.includes('shower') ||
      d.includes('drizzle'))                             return '🌧';
  if (d.includes('fog')  || d.includes('mist'))          return '🌫';
  if (d.includes('wind'))                                return '💨';
  if (d.includes('cloud') || d.includes('overcast'))     return '☁';
  if (d.includes('partly'))                              return '⛅';
  if (d.includes('clear') || d.includes('sunny') ||
      d.includes('fair'))                                return '☀';
  return '🌡';
}

/* ─────────────────────────────────────────────── */
/*   TICKER                                        */
/*   "Powered by NWS" for data,                    */
/*   "Powered by KOHX" for radar.                  */
/* ─────────────────────────────────────────────── */
function setTicker(cityName = '') {
  const city = cityName ? `${cityName.toUpperCase()} · ` : '';
  tickerContent.textContent =
    `▶ CUMBERLAND WEATHER NETWORK · ${city}` +
    `CONDITIONS & ALERTS POWERED BY NWS · ` +
    `RADAR POWERED BY KOHX NASHVILLE · ` +
    `DATA REFRESHES EVERY 5 MINUTES ◀`;
}

/* ─────────────────────────────────────────────── */
/*   THEME                                         */
/* ─────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.textContent = theme === 'day' ? 'Switch to Night' : 'Switch to Day';
  if (themeColorMeta) {
    themeColorMeta.content = theme === 'day' ? '#ddd4f4' : '#030d18';
  }
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'night');
}

/* ─────────────────────────────────────────────── */
/*   CLOCK                                         */
/* ─────────────────────────────────────────────── */
function updateClock() {
  const now  = new Date();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
  timeEl.textContent = `${time} · ${date}`;
}

/* ─────────────────────────────────────────────── */
/*   CITY LIST                                     */
/*   cities.json = { County: { CityName: {lat,lon} } } */
/* ─────────────────────────────────────────────── */
async function loadCities() {
  try {
    const resp = await fetch('/api/cities.json');
    const data = await resp.json();

    citySelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a city…';
    citySelect.appendChild(placeholder);

    // Flatten nested structure → populate <select> + build cityMap
    for (const county of Object.keys(data).sort()) {
      const cities = data[county];
      for (const cityName of Object.keys(cities).sort()) {
        const { lat, lon } = cities[cityName];

        cityMap[cityName] = { lat: parseFloat(lat), lon: parseFloat(lon) };

        const opt = document.createElement('option');
        opt.value = cityName;
        opt.textContent = cityName;
        citySelect.appendChild(opt);
      }
    }
  } catch (err) {
    console.error('City load error:', err);
    citySelect.innerHTML = '<option value="">Error loading cities</option>';
  }
}

/* ─────────────────────────────────────────────── */
/*   FORECAST                                      */
/*   fetchNWSPeriods returns raw NWS period objs   */
/* ─────────────────────────────────────────────── */
function renderForecast(periods) {
  if (!periods || !periods.length) return;
  const cards = forecastStrip.querySelectorAll('.icon-card');
  periods.slice(0, cards.length).forEach((p, idx) => {
    const card = cards[idx];
    card.querySelector('.period-name').textContent = p.name || `Period ${idx + 1}`;
    card.querySelector('.live-symbol').textContent = descToSymbol(p.shortForecast);
    card.querySelector('.period-temp').textContent =
      p.temperature != null ? `${p.temperature}°${p.temperatureUnit || 'F'}` : '--°F';
    card.querySelector('.period-desc').textContent = p.shortForecast || '';
    const pop = p.probabilityOfPrecipitation?.value;
    card.querySelector('.period-rain').textContent =
      pop != null ? `${pop}% chance of rain` : '';
  });
}

/* ─────────────────────────────────────────────── */
/*   CURRENT CONDITIONS                            */
/*   getConditions(lat,lon) returns:               */
/*   { temp_f, description, wind_mph,              */
/*     wind_direction, precip_pct }                */
/* ─────────────────────────────────────────────── */
function renderCurrentConditions(cond) {
  currentSymbol.textContent = descToSymbol(cond.description);
  currentTempEl.textContent = cond.temp_f != null
    ? `${Math.round(cond.temp_f)}°F`
    : '--°F';

  // Core doesn't return feels-like — clear gracefully
  if (feelsLikeEl) feelsLikeEl.textContent = '';

  summaryEl.textContent = cond.description || 'Conditions unavailable.';

  windEl.textContent =
  cond.wind_speed_mph != null
    ? `${Math.round(cond.wind_speed_mph)} mph${cond.wind_direction ? ' ' + cond.wind_direction : ''}`
    : '-- mph'; 
  
  if (humidityEl) {
  humidityEl.textContent =
    cond.humidity_pct != null
      ? `${Math.round(cond.humidity_pct)}%`
      : '--%';
}

if (pressureEl) {
  pressureEl.textContent =
    cond.pressure_inhg != null
      ? `${cond.pressure_inhg.toFixed(2)} inHg`
      : '-- inHg';
}

if (visibilityEl) {
  visibilityEl.textContent =
    cond.visibility_miles != null
      ? `${cond.visibility_miles.toFixed(1)} mi`
      : '-- mi';
}

  lastUpdateEl.textContent =
    `Last updated: ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/* ─────────────────────────────────────────────── */
/*   ALERTS                                        */
/*   getAlerts(lat,lon) returns:                   */
/*   [{ event, severity, headline }]               */
/* ─────────────────────────────────────────────── */
function renderAlerts(alerts) {
  alertsList.innerHTML = '';

  if (!alerts || alerts.length === 0) {
    alertsEmpty.style.display = 'block';
    alertStrip.hidden = true;
    return;
  }

  alertsEmpty.style.display = 'none';

  alerts.forEach(alert => {
    const card = document.createElement('div');
    card.className = 'alert-card';
    card.innerHTML = `
      <div class="alert-title">${alert.event || 'Weather Alert'}</div>
      <div class="alert-area">${alert.severity ? 'Severity: ' + alert.severity : 'Middle Tennessee'}</div>
      <div class="alert-text">${alert.headline || 'Alert details unavailable.'}</div>
    `;
    alertsList.appendChild(card);
  });

  const emergency = hasEmergency(alerts);
  alertStrip.hidden = !emergency;
  if (alertStripText) {
    alertStripText.textContent = emergency
      ? 'EMERGENCY WEATHER ALERT IN EFFECT · SEE DETAILS BELOW'
      : 'WEATHER ALERT IN EFFECT · SEE DETAILS BELOW';
  }
}

/* ─────────────────────────────────────────────── */
/*   RADAR                                         */
/*   getRadarUrl() — SYNC, NO ARGS                 */
/*   Always returns the KOHX Nashville loop GIF    */
/* ─────────────────────────────────────────────── */
function loadRadar() {
  try {
    const url = getRadarUrl();   // sync — no args, no await
    if (!url) {
      radarStatus.textContent = 'Radar unavailable.';
      radarImg.removeAttribute('src');
      return;
    }
    radarImg.src = `${url}?t=${Date.now()}`;
    radarStatus.textContent = 'KOHX Nashville · Powered by NWS Radar';
  } catch (err) {
    console.error('Radar error:', err);
    radarStatus.textContent = 'Error loading radar.';
    radarImg.removeAttribute('src');
  }
}

/* ─────────────────────────────────────────────── */
/*   FULL RADAR VIEW                               */
/* ─────────────────────────────────────────────── */
function openFullRadarView() {
  const url = getRadarUrl();   // sync — no args
  if (url) window.open(url, '_blank', 'noopener');
}

/* ─────────────────────────────────────────────── */
/*   MAIN UPDATE                                   */
/* ─────────────────────────────────────────────── */
async function updateForCity(cityName) {
  if (!cityName) return;

  const coords = cityMap[cityName];
  if (!coords) {
    console.error('No coordinates for city:', cityName);
    summaryEl.textContent = 'City coordinates not found.';
    return;
  }

  const { lat, lon } = coords;
  localStorage.setItem(CITY_KEY, cityName);
  setTicker(cityName);

  try {
    const [cond, alerts, periods] = await Promise.all([
      getConditions(lat, lon),
      getAlerts(lat, lon),
      fetchNWSPeriods(lat, lon, 6),
    ]);

    renderCurrentConditions(cond);
    renderAlerts(alerts);
    renderForecast(periods);
  } catch (err) {
    console.error('Update error:', err);
    summaryEl.textContent = 'Error loading weather data.';
  }

  // Radar is station-fixed (KOHX) — refresh independently of city
  loadRadar();
}

/* ─────────────────────────────────────────────── */
/*   EVENTS                                        */
/* ─────────────────────────────────────────────── */
function initEvents() {
  themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'day' ? 'night' : 'day');
  });

  if (directoryToggle && directoryNav) {
    directoryToggle.addEventListener('click', () => {
      directoryNav.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if (!directoryNav.contains(e.target)) directoryNav.classList.remove('open');
    });
  }

  citySelect.addEventListener('change', () => updateForCity(citySelect.value));

  if (openRadarFull) {
    openRadarFull.addEventListener('click', openFullRadarView);
  }
}

/* ─────────────────────────────────────────────── */
/*   INIT                                          */
/* ─────────────────────────────────────────────── */
async function init() {
  initTheme();
  initEvents();
  updateClock();
  setInterval(updateClock, 30_000);

  setTicker();    // default ticker text before a city is chosen
  loadRadar();    // radar is station-fixed — loads immediately

  await loadCities();

  const storedCity = localStorage.getItem(CITY_KEY);
  if (storedCity && cityMap[storedCity]) {
    citySelect.value = storedCity;
    updateForCity(storedCity);
  }

  // Auto-refresh every 5 minutes
  setInterval(() => {
    const city = citySelect.value;
    if (city) updateForCity(city);
    else loadRadar();
  }, 5 * 60 * 1000);
}

init();


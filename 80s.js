/**
 * CWN 1980s Edition — 80s.js
 * Uses:
 *   - /api/cities.json for city list + coords
 *   - HEART engine for all live weather data
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

const themeColorMeta  = document.getElementById('themeColor');

const THEME_KEY       = 'cwn80s_theme';
const CITY_KEY        = 'cwn_city';

/* ─────────────────────────────────────────────── */
/*   THEME                                         */
/* ─────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  themeToggleBtn.textContent =
    theme === 'day' ? 'Switch to Night' : 'Switch to Day';

  themeColorMeta.content =
    theme === 'day' ? '#ddd4f4' : '#030d18';

  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  applyTheme(stored || 'night');
}

/* ─────────────────────────────────────────────── */
/*   CLOCK                                         */
/* ─────────────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
  timeEl.textContent = `${time} · ${date}`;
}

/* ─────────────────────────────────────────────── */
/*   CITY LIST (API)                               */
/*   ✔ EXACTLY what you asked for                  */
/*   ✔ Purely loads from /api/cities.json          */
/* ─────────────────────────────────────────────── */
async function loadCities() {
  try {
    const resp = await fetch('/api/cities.json');
    const cities = await resp.json();

    citySelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a city…';
    citySelect.appendChild(placeholder);

    cities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city.id;       // HEART expects this ID
      opt.textContent = city.name;
      citySelect.appendChild(opt);
    });

  } catch (err) {
    console.error('City load error:', err);
    citySelect.innerHTML = '<option value="">Error loading cities</option>';
  }
}

/* ─────────────────────────────────────────────── */
/*   FORECAST                                      */
/* ─────────────────────────────────────────────── */
function renderForecast(periods) {
  const cards = forecastStrip.querySelectorAll('.icon-card');
  periods.slice(0, cards.length).forEach((p, idx) => {
    const card = cards[idx];
    card.querySelector('.period-name').textContent = p.name;
    card.querySelector('.live-symbol').textContent = p.symbol || '☁';
    card.querySelector('.period-temp').textContent = `${p.temperature}°${p.temperatureUnit}`;
    card.querySelector('.period-desc').textContent = p.shortForecast;
    card.querySelector('.period-rain').textContent =
      p.probabilityOfPrecipitation ? `${p.probabilityOfPrecipitation}% chance of rain` : '';
  });
}

/* ─────────────────────────────────────────────── */
/*   CURRENT CONDITIONS                            */
/* ─────────────────────────────────────────────── */
function renderCurrentConditions(cond) {
  currentSymbol.textContent = cond.symbol || '☁';
  currentTempEl.textContent = `${cond.temperature}°F`;
  feelsLikeEl.textContent = `Feels like ${cond.apparentTemperature}°F`;
  summaryEl.textContent = cond.description || cond.shortForecast || 'Current conditions unavailable.';

  humidityEl.textContent   = cond.relativeHumidity != null ? `${cond.relativeHumidity}%` : '--%';
  windEl.textContent       = cond.windSpeed || '-- mph';
  pressureEl.textContent   = cond.pressure || '-- inHg';
  visibilityEl.textContent = cond.visibility || '-- mi';

  if (cond.timestamp) {
    const dt = new Date(cond.timestamp);
    lastUpdateEl.textContent =
      `Last updated: ${dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } else {
    lastUpdateEl.textContent = 'Last updated: --:--';
  }
}

/* ─────────────────────────────────────────────── */
/*   ALERTS                                        */
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
      <div class="alert-title">${alert.event}</div>
      <div class="alert-area">${alert.areaDesc || 'Middle Tennessee'}</div>
      <div class="alert-text">${alert.description || alert.headline || 'Alert details unavailable.'}</div>
    `;

    alertsList.appendChild(card);
  });

  const emergency = hasEmergency(alerts);
  alertStrip.hidden = !emergency;
  alertStripText.textContent = emergency
    ? 'EMERGENCY WEATHER ALERT IN EFFECT · SEE DETAILS BELOW'
    : 'Weather alerts in effect · See details below.';
}

/* ─────────────────────────────────────────────── */
/*   RADAR (FIXED)                                 */
/* ─────────────────────────────────────────────── */
async function loadRadar(cityId) {
  if (!cityId) {
    radarStatus.textContent = 'Select a city to load radar.';
    radarImg.removeAttribute('src');
    return;
  }

  try {
    radarStatus.textContent = 'Loading radar…';
    const url = await getRadarUrl(cityId);

    if (!url) {
      radarStatus.textContent = 'Radar unavailable.';
      radarImg.removeAttribute('src');
      return;
    }

    radarImg.src = `${url}?t=${Date.now()}`;
    radarStatus.textContent = 'Radar updated.';
  } catch (err) {
    console.error('Radar error', err);
    radarStatus.textContent = 'Error loading radar.';
    radarImg.removeAttribute('src');
  }
}

/* ─────────────────────────────────────────────── */
/*   FULL RADAR VIEW                               */
/* ─────────────────────────────────────────────── */
function openFullRadarView(cityId) {
  if (!cityId) return;
  getRadarUrl(cityId).then(url => {
    if (url) window.open(url, '_blank', 'noopener');
  });
}

/* ─────────────────────────────────────────────── */
/*   MAIN UPDATE                                    */
/* ─────────────────────────────────────────────── */
async function updateForCity(cityId) {
  if (!cityId) return;

  localStorage.setItem(CITY_KEY, cityId);

  try {
    const [cond, alerts, periods] = await Promise.all([
      getConditions(cityId),
      getAlerts(cityId),
      fetchNWSPeriods(cityId),
    ]);

    renderCurrentConditions(cond);
    renderAlerts(alerts);
    renderForecast(periods);
    loadRadar(cityId);

  } catch (err) {
    console.error('Update error', err);
    summaryEl.textContent = 'Error loading data.';
  }
}

/* ─────────────────────────────────────────────── */
/*   INIT                                          */
/* ─────────────────────────────────────────────── */
function initEvents() {
  themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'day' ? 'night' : 'day');
  });

  citySelect.addEventListener('change', () => {
    updateForCity(citySelect.value);
  });

  openRadarFull.addEventListener('click', () => {
    openFullRadarView(citySelect.value);
  });
}

async function init() {
  initTheme();
  initEvents();
  updateClock();
  setInterval(updateClock, 30000);

  await loadCities();   // <-- EXACTLY what you asked for

  const storedCity = localStorage.getItem(CITY_KEY);
  if (storedCity) updateForCity(storedCity);
}

init();


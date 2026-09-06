/**
 * CWN 1980s Edition — 80s.js
 * HEART engine · persistent city · day/night toggle
 * Theme key: cwn80s_theme
 */

import {
  getCityCoords,
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
const directoryMenu   = document.getElementById('directoryMenu');

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

const alertsPanel     = document.getElementById('alertsPanel');
const alertsEmpty     = document.getElementById('alertsEmpty');
const alertsList      = document.getElementById('alertsList');

const radarImg        = document.getElementById('cwnRadar');
const radarStatus     = document.getElementById('cwnRadarStatus');
const openRadarFull   = document.getElementById('openRadarFull');

const themeColorMeta  = document.getElementById('themeColor');

const THEME_KEY       = 'cwn80s_theme';
const CITY_KEY        = 'cwn_city';

/* ── THEME HANDLING ── */
function applyTheme(theme) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);

  if (theme === 'day') {
    themeToggleBtn.textContent = 'Switch to Night';
    themeColorMeta.content = '#ddd4f4';
  } else {
    themeToggleBtn.textContent = 'Switch to Day';
    themeColorMeta.content = '#030d18';
  }

  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const theme = stored === 'day' || stored === 'night' ? stored : 'night';
  applyTheme(theme);
}

/* ── CLOCK ── */
function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
  timeEl.textContent = `${time} · ${date}`;
}

/* ── CITY SELECT ── */
async function populateCitySelect() {
  const cities = await getCityCoords();
  citySelect.innerHTML = '';

  const storedCity = localStorage.getItem(CITY_KEY);

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a city…';
  citySelect.appendChild(placeholder);

  for (const city of cities) {
    const opt = document.createElement('option');
    opt.value = city.id;
    opt.textContent = city.name;
    if (storedCity && storedCity === city.id) {
      opt.selected = true;
    }
    citySelect.appendChild(opt);
  }
}

/* ── FORECAST RENDER ── */
function renderForecast(periods) {
  const cards = forecastStrip.querySelectorAll('.icon-card');
  periods.slice(0, cards.length).forEach((p, idx) => {
    const card = cards[idx];
    card.querySelector('.period-name').textContent = p.name;
    card.querySelector('.live-symbol').textContent = p.symbol || '☁';
    card.querySelector('.period-temp').textContent = `${p.temperature}°${p.temperatureUnit}`;
    card.querySelector('.period-desc').textContent = p.shortForecast;
    card.querySelector('.period-rain').textContent = p.probabilityOfPrecipitation
      ? `${p.probabilityOfPrecipitation}% chance of rain`
      : '';
  });
}

/* ── CURRENT CONDITIONS RENDER ── */
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
    const time = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    lastUpdateEl.textContent = `Last updated: ${time}`;
  } else {
    lastUpdateEl.textContent = 'Last updated: --:--';
  }
}

/* ── ALERTS RENDER ── */
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

    const title = document.createElement('div');
    title.className = 'alert-title';
    title.textContent = alert.event;

    const area = document.createElement('div');
    area.className = 'alert-area';
    area.textContent = alert.areaDesc || 'Middle Tennessee';

    const text = document.createElement('div');
    text.className = 'alert-text';
    text.textContent = alert.description || alert.headline || 'Alert details unavailable.';

    card.appendChild(title);
    card.appendChild(area);
    card.appendChild(text);
    alertsList.appendChild(card);
  });

  const emergency = hasEmergency(alerts);
  alertStrip.hidden = !emergency;
  if (emergency) {
    alertStripText.textContent = 'EMERGENCY WEATHER ALERT IN EFFECT · SEE DETAILS BELOW';
  } else {
    alertStripText.textContent = 'Weather alerts in effect · See details below.';
  }
}

/* ── RADAR LOAD (FIXED) ── */
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
      radarStatus.textContent = 'Radar unavailable for this city.';
      radarImg.removeAttribute('src');
      return;
    }

    // Only set src; sizing is handled by CSS (fix)
    radarImg.src = `${url}?t=${Date.now()}`;
    radarStatus.textContent = 'Radar updated.';
  } catch (err) {
    console.error('Radar error', err);
    radarStatus.textContent = 'Error loading radar.';
    radarImg.removeAttribute('src');
  }
}

/* ── FULL RADAR OPEN ── */
function openFullRadarView(cityId) {
  if (!cityId) return;
  getRadarUrl(cityId).then(url => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }).catch(err => {
    console.error('Full radar open error', err);
  });
}

/* ── DIRECTORY TOGGLE ── */
function initDirectory() {
  directoryToggle.addEventListener('click', () => {
    const open = directoryNav.classList.toggle('open');
    if (open) {
      directoryToggle.setAttribute('aria-expanded', 'true');
    } else {
      directoryToggle.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('click', (evt) => {
    if (!directoryNav.contains(evt.target)) {
      directoryNav.classList.remove('open');
      directoryToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ── MAIN UPDATE ── */
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

/* ── INIT ── */
function initEvents() {
  themeToggleBtn.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') === 'day' ? 'day' : 'night';
    const next = current === 'day' ? 'night' : 'day';
    applyTheme(next);
  });

  citySelect.addEventListener('change', () => {
    const cityId = citySelect.value;
    updateForCity(cityId);
  });

  openRadarFull.addEventListener('click', () => {
    const cityId = citySelect.value;
    openFullRadarView(cityId);
  });
}

async function init() {
  initTheme();
  initDirectory();
  initEvents();
  updateClock();
  setInterval(updateClock, 30000);

  await populateCitySelect();

  const storedCity = localStorage.getItem(CITY_KEY);
  if (storedCity) {
    updateForCity(storedCity);
  }
}

init();

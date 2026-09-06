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

/* ── CRT weather symbols ── */
const ICON = {
  sunny: '◎',
  cloudy: '◑',
  rain: '≈',
  storm: '⌁',
  snow: '❄',
};

function wxIcon(desc = '') {
  const d = desc.toLowerCase();
  if (d.includes('thunder') || d.includes('storm')) return ICON.storm;
  if (d.includes('snow') || d.includes('blizzard') || d.includes('sleet')) return ICON.snow;
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return ICON.rain;
  if (d.includes('cloud') || d.includes('overcast') || d.includes('fog')) return ICON.cloudy;
  return ICON.sunny;
}

/* ── DOM refs ── */
const sel = document.getElementById('citySelector');

const radarImg = document.getElementById('cwnRadar');
const radarStatus = document.getElementById('cwnRadarStatus');

const forecastEl = document.getElementById('forecastPeriods');

const alertsPanel = document.getElementById('alertsPanel');
const alertsBody = document.getElementById('alertsBody');

const locEl = document.getElementById('currentLocation');
const tempEl = document.getElementById('currentTemp');
const feelsEl = document.getElementById('currentFeels');
const summaryEl = document.getElementById('currentSummary');
const windEl = document.getElementById('currentWind');
const humEl = document.getElementById('currentHumidity');
const presEl = document.getElementById('currentPressure');
const lastUpdateEl = document.getElementById('lastUpdate');

const clockEl = document.getElementById('cwnClock');
const dateEl = document.getElementById('cwnDate');

const togBtn = document.getElementById('themeToggle');
const metaTag = document.getElementById('themeColor');

const dirNav = document.getElementById('directoryNav');
const dirBtn = document.getElementById('directoryBtn');

/* ══════════════════════════════════════════
   DAY / NIGHT THEME
   DAY meta = #1c1000 (amber terminal)
   NIGHT meta = #030d18 (blue CRT)
   Click → MANUAL toggle
   Dbl-click → reset AUTO (day=06:00–19:00)
══════════════════════════════════════════ */

const DAY_META = '#1c1000';
const NIGHT_META = '#030d18';

let themeMode = 'auto';

function isNightHour() {
  const h = new Date().getHours();
  return h < 6 || h >= 19;
}

function applyTheme(night) {
  const mode = night ? 'night' : 'day';
  document.documentElement.dataset.theme = mode;
  const text = night ? 'Switch to Day' : 'Switch to Night';
  togBtn.textContent = text;
  togBtn.setAttribute('aria-pressed', String(night));
  metaTag.content = night ? NIGHT_META : DAY_META;
}

function updateBtn() {
  const night = document.documentElement.dataset.theme === 'night';
  const text = night ? 'Switch to Day' : 'Switch to Night';
  togBtn.textContent = text;
  togBtn.setAttribute('aria-pressed', String(night));
}

function initTheme() {
  try {
    const stored = localStorage.getItem('cwn80s_theme');
    if (stored === 'night' || stored === 'day') {
      themeMode = 'manual';
      applyTheme(stored === 'night');
      return;
    }
  } catch (e) {
    // ignore
  }
  themeMode = 'auto';
  applyTheme(isNightHour());
}

/* ── DIRECTORY DROPDOWN ─ */
function closeDirectory() {
  dirNav.classList.remove('open');
  dirBtn.setAttribute('aria-expanded', 'false');
}

dirBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = !dirNav.classList.contains('open');
  dirNav.classList.toggle('open', open);
  dirBtn.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', e => {
  if (!dirNav.contains(e.target) && e.target !== dirBtn) {
    closeDirectory();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && dirNav.classList.contains('open')) {
    closeDirectory();
    dirBtn.focus();
  }
});

/* ── CLOCK ─ */
function clock() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr12 = h % 12 || 12;
  clockEl.textContent = `${hr12}:${m} ${ampm}`;

  const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  dateEl.textContent = now.toLocaleDateString(undefined, opts);
}

/* ── FORECAST RENDER ─ */
function renderPeriods(periods = []) {
  if (!Array.isArray(periods) || !periods.length) {
    forecastEl.innerHTML = '<div class="icon-card">Forecast unavailable</div>';
    return;
  }

  forecastEl.innerHTML = periods
    .map(p => {
      const icon = wxIcon(p.shortForecast || p.detailedForecast || '');
      const temp = p.temperature != null ? `${p.temperature}°${p.temperatureUnit || 'F'}` : '--°F';
      return `
        <div class="icon-card">
          <div class="period-name">${p.name || 'Period'}</div>
          <div class="period-icon">${icon}</div>
          <div class="period-temp">${temp}</div>
        </div>
      `;
    })
    .join('');
}

/* ── ALERTS RENDER ─ */
function renderAlerts(alerts = []) {
  if (!Array.isArray(alerts) || !alerts.length) {
    alertsPanel.hidden = true;
    alertsBody.innerHTML = '';
    return;
  }

  alertsPanel.hidden = false;
  alertsBody.innerHTML = alerts
    .map(a => {
      const title = a.event || 'Alert';
      const area = a.areaDesc || '';
      const sent = a.sent || '';
      const desc = a.description || a.headline || '';
      return `
        <div class="alert-card">
          <h3 class="alert-title">${title}</h3>
          <p class="alert-area">${area}</p>
          <p class="alert-time">${sent}</p>
          <p class="alert-text">${desc}</p>
        </div>
      `;
    })
    .join('');
}

/* ── CONDITIONS RENDER ─ */
function renderConditions(city, cond) {
  if (!cond) {
    locEl.textContent = 'Conditions unavailable.';
    tempEl.textContent = '--°F';
    feelsEl.textContent = 'Feels like --°F';
    summaryEl.textContent = 'Conditions will appear here.';
    windEl.textContent = '-- mph';
    humEl.textContent = '--%';
    presEl.textContent = '-- hPa';
    lastUpdateEl.textContent = 'Last update: --';
    return;
  }

  locEl.textContent = `${city.name}, ${city.county} County`;
  tempEl.textContent = `${Math.round(cond.temperature)}°F`;
  if (cond.apparentTemperature != null) {
    feelsEl.textContent = `Feels like ${Math.round(cond.apparentTemperature)}°F`;
  } else {
    feelsEl.textContent = 'Feels like --°F';
  }
  summaryEl.textContent = cond.summary || cond.description || 'Conditions will appear here.';
  windEl.textContent = cond.windSpeed ? `${cond.windSpeed} mph` : '-- mph';
  humEl.textContent = cond.humidity != null ? `${cond.humidity}%` : '--%';
  presEl.textContent = cond.pressure != null ? `${cond.pressure} hPa` : '-- hPa';
  lastUpdateEl.textContent = cond.time ? `Last update: ${cond.time}` : 'Last update: --';
}

/* ── RADAR ─ */
async function loadRadar(city) {
  try {
    radarStatus.textContent = 'Loading radar...';
    const url = await getRadarUrl(city);
    radarImg.src = `${url}?t=${Date.now()}`;
    radarStatus.textContent = 'Radar updated.';
  } catch (e) {
    console.error('[CWN 80s] Radar load failed:', e);
    radarStatus.textContent = 'Radar unavailable.';
  }
}

/* ── CITY LOADING ─ */
async function load(cityId) {
  if (!cityId) return;

  try {
    const city = await getCityCoords(cityId);
    const [cond, alerts, periods] = await Promise.all([
      getConditions(city),
      getAlerts(city),
      fetchNWSPeriods(city),
    ]);

    renderConditions(city, cond);
    renderAlerts(alerts);
    renderPeriods(periods);
    await loadRadar(city);
  } catch (e) {
    console.error('[CWN 80s] Load failed:', e);
    locEl.textContent = 'The location or weather service could not be reached.';
    forecastEl.innerHTML = '<div class="icon-card">Forecast unavailable</div>';
    radarStatus.textContent = 'Radar unavailable.';
  }
}

/* ── CITY SELECTOR FILL ─ */
async function fillCities() {
  // If cities are already in the HTML, just respect them.
  if (sel.options.length > 1) {
    try {
      const stored = localStorage.getItem('cwn_city');
      if (stored) {
        sel.value = stored;
      }
    } catch (e) {
      // ignore
    }
    return;
  }

  // Otherwise, you can wire this to your registry later.
  // For now, leave as-is to avoid breaking.
}

/* ── INIT ─ */
function init() {
  initTheme();

  clock();
  setInterval(clock, 1000);

  try {
    const storedCity = localStorage.getItem('cwn_city');
    if (storedCity) {
      sel.value = storedCity;
    }
  } catch (e) {
    // ignore
  }

  if (sel.value) {
    load(sel.value);
  }

  // periodic refresh
  setInterval(() => {
    const c = sel.value;
    if (c) load(c);
  }, 600_000);

  // theme toggle
  togBtn.addEventListener('click', () => {
    const night = document.documentElement.dataset.theme === 'night';
    themeMode = 'manual';
    applyTheme(!night);
    try {
      localStorage.setItem('cwn80s_theme', !night ? 'night' : 'day');
    } catch (e) {
      // ignore
    }
    updateBtn();
  });

  togBtn.addEventListener('dblclick', e => {
    e.preventDefault();
    themeMode = 'auto';
    try {
      localStorage.removeItem('cwn80s_theme');
    } catch (e2) {
      // ignore
    }
    applyTheme(isNightHour());
    updateBtn();
  });

  // city change
  sel.addEventListener('change', () => {
    const city = sel.value;
    if (!city) return;
    try {
      localStorage.setItem('cwn_city', city);
    } catch (e) {
      // ignore
    }
    load(city);
  });
}

fillCities()
  .then(init)
  .catch(err => {
    console.error('[CWN 80s] City load failed:', err);
    locEl.textContent = 'City data could not be loaded. Please refresh.';
    forecastEl.innerHTML = '<div class="icon-card">Forecast unavailable</div>';
  });

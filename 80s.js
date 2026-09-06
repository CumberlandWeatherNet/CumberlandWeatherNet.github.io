/**
 * CWN 1980s Edition — ORIGINAL RESTORED
 * HEART engine · persistent city · day/night toggle
 */

import {
  getCityCoords,
  getConditions,
  getAlerts,
  getRadarUrl,
  fetchNWSPeriods,
  hasEmergency,
} from './core/cwn-heart-full.js';

/* DOM */
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

/* CLOCK */
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

/* DIRECTORY */
dirBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = !dirNav.classList.contains('open');
  dirNav.classList.toggle('open', open);
  dirBtn.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', e => {
  if (!dirNav.contains(e.target) && e.target !== dirBtn) {
    dirNav.classList.remove('open');
    dirBtn.setAttribute('aria-expanded', 'false');
  }
});

/* THEME */
function applyTheme(night) {
  document.documentElement.dataset.theme = night ? 'night' : 'day';
  togBtn.textContent = night ? 'Switch to Day' : 'Switch to Night';
  metaTag.content = night ? '#030d18' : '#1c1000';
}

togBtn.addEventListener('click', () => {
  const night = document.documentElement.dataset.theme === 'night';
  applyTheme(!night);
});

/* FORECAST */
function renderPeriods(periods) {
  if (!periods || !periods.length) {
    forecastEl.innerHTML = '<div>Forecast unavailable</div>';
    return;
  }

  forecastEl.innerHTML = periods.map(p => `
    <div class="icon-card">
      <div>${p.name}</div>
      <div>${p.temperature}°F</div>
    </div>
  `).join('');
}

/* ALERTS */
function renderAlerts(alerts) {
  if (!alerts || !alerts.length) {
    alertsPanel.hidden = true;
    alertsBody.innerHTML = '';
    return;
  }

  alertsPanel.hidden = false;
  alertsBody.innerHTML = alerts.map(a => `
    <div class="alert-card">
      <h3>${a.event}</h3>
      <p>${a.areaDesc}</p>
      <p>${a.description}</p>
    </div>
  `).join('');
}

/* CONDITIONS */
function renderConditions(city, cond) {
  locEl.textContent = `${city.name}, ${city.county} County`;
  tempEl.textContent = `${Math.round(cond.temperature)}°F`;
  feelsEl.textContent = `Feels like ${Math.round(cond.apparentTemperature)}°F`;
  summaryEl.textContent = cond.summary;
  windEl.textContent = cond.windSpeed;
  humEl.textContent = `${cond.humidity}%`;
  presEl.textContent = `${cond.pressure} hPa`;
  lastUpdateEl.textContent = `Last update: ${cond.time}`;
}

/* RADAR */
async function loadRadar(city) {
  radarStatus.textContent = 'Loading radar…';
  const url = await getRadarUrl(city);
  radarImg.src = `${url}?t=${Date.now()}`;
  radarStatus.textContent = 'Radar updated.';
}

/* LOAD CITY */
async function load(cityId) {
  const city = await getCityCoords(cityId);
  const [cond, alerts, periods] = await Promise.all([
    getConditions(city),
    getAlerts(city),
    fetchNWSPeriods(city),
  ]);

  renderConditions(city, cond);
  renderAlerts(alerts);
  renderPeriods(periods);
  loadRadar(city);
}

/* INIT */
function init() {
  clock();
  setInterval(clock, 1000);

  const stored = localStorage.getItem('cwn_city');
  if (stored) sel.value = stored;

  if (sel.value) load(sel.value);

  sel.addEventListener('change', () => {
    const city = sel.value;
    localStorage.setItem('cwn_city', city);
    load(city);
  });
}

init();

/* ============================================================
   Cumberland Weather Network — 1970s Home Page
   index.js  |  HEART v2.1 + auto day/night + persistent city
   ============================================================ */

import {
  getCityCoords, getConditions, getAlerts,
  fetchNWSPeriods, getRadarUrl, getClock, hasEmergency,
} from './core/cwn-heart-full.js';

/* ── DOM REFS ── */
const sel         = document.getElementById('cwnCitySelect');
const cwnTime     = document.getElementById('cwnTime');
const themeToggle = document.getElementById('themeToggle');
const modeBadge   = document.getElementById('modeBadge');
const alertStrip  = document.getElementById('alertStrip');
const alertText   = document.getElementById('alertStripText');
const forecastEl  = document.getElementById('forecastPeriods');
const iconBox     = document.getElementById('currentIconBox');
const tempEl      = document.getElementById('cwnTemp');
const descEl      = document.getElementById('cwnDesc');
const windEl      = document.getElementById('cwnWind');
const precipEl    = document.getElementById('cwnPrecip');
const statusEl    = document.getElementById('weatherStatus');
const radarImg    = document.getElementById('cwnRadar');
const radarStatus = document.getElementById('cwnRadarStatus');
const metaTheme   = document.getElementById('themeColor');
const dirBtn      = document.getElementById('directoryButton');
const dirMenu     = document.getElementById('directoryMenu');

/* ── ICON MAPPER ── */
function wxIcon(desc = '') {
  const d = desc.toLowerCase();
  if (d.includes('tornado'))                         return '🌪️';
  if (d.includes('hurricane'))                       return '🌀';
  if (d.includes('thunder') || d.includes('tstm'))  return '⛈️';
  if (d.includes('blizzard'))                        return '❄️';
  if (d.includes('snow') && d.includes('rain'))      return '🌨️';
  if (d.includes('snow') || d.includes('flurr'))     return '🌨️';
  if (d.includes('sleet') || d.includes('freezing')) return '🌧️';
  if (d.includes('fog')  || d.includes('haze'))      return '🌫️';
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return '🌧️';
  if (d.includes('partly cloudy') || d.includes('partly sunny')) return '⛅';
  if (d.includes('overcast') || d.includes('mostly cloudy'))     return '☁️';
  if (d.includes('cloud'))                           return '🌥️';
  if (d.includes('sunny') || d.includes('clear') || d.includes('fair')) {
    return (new Date().getHours() >= 6 && new Date().getHours() < 19) ? '☀️' : '🌙';
  }
  if (d.includes('wind'))                            return '💨';
  return '🌡️';
}

/* ── RADAR — wire ONCE at module scope ── */
radarImg.onload  = () => { radarStatus.textContent = 'Radar updated.'; };
radarImg.onerror = () => { radarStatus.textContent = 'Radar unavailable.'; };
function radar() { radarImg.src = getRadarUrl() + '?t=' + Date.now(); }

/* ── CLOCK ── */
function clock() { cwnTime.textContent = getClock(); }

/* ── FORECAST CARDS ── */
function renderPeriods(periods) {
  if (!periods?.length) {
    forecastEl.innerHTML = '<div class="icon-card"><div class="period-name">No forecast available</div></div>';
    return;
  }
  forecastEl.innerHTML = periods.slice(0, 6).map(p => `
    <div class="icon-card">
      <div class="period-name">${p.name ?? '—'}</div>
      <div class="period-icon">${wxIcon(p.shortForecast ?? '')}</div>
      <div class="period-temp">${p.temperature ?? '--'}°${p.temperatureUnit ?? 'F'}</div>
      <div class="period-desc">${p.shortForecast ?? ''}</div>
      <div class="period-precip">💧 ${p.precip_pct ?? 0}%</div>
    </div>
  `).join('');
}

/* ── ALERT STRIP ── */
function updateAlertStrip(alerts) {
  if (!alerts?.length || !hasEmergency(alerts)) { alertStrip.hidden = true; return; }
  alertText.textContent = `${alerts[0].event.toUpperCase()} — ${alerts[0].headline ?? ''}`;
  alertStrip.hidden = false;
}

/* ── LOAD WEATHER DATA ── */
async function load(cityName) {
  if (!cityName) return;
  statusEl.textContent = 'Loading…';
  try {
    const { lat, lon } = await getCityCoords(cityName);
    const [conditions, alerts, periods] = await Promise.all([
      getConditions(lat, lon), getAlerts(lat, lon), fetchNWSPeriods(lat, lon, 6),
    ]);
    iconBox.textContent  = wxIcon(conditions.description);
    tempEl.textContent   = `${conditions.temp_f}°F`;
    descEl.textContent   = conditions.description;
    windEl.textContent   = `Wind: ${conditions.wind_direction} ${conditions.wind_mph}`;
    precipEl.textContent = `Precip: ${conditions.precip_pct}%`;
    statusEl.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    renderPeriods(periods);
    updateAlertStrip(alerts);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error('[CWN70]', err);
  }
}

/* ── CITY SELECTOR ── */
async function fillCities() {
  try {
    const data = await (await fetch('./api/cities.json')).json();
    const byCounty = {};
    for (const city of data) {
      const c = city.county ?? 'Other';
      if (!byCounty[c]) byCounty[c] = [];
      byCounty[c].push(city.name);
    }
    let html = '<option value="">— SELECT CITY —</option>';
    for (const county of Object.keys(byCounty).sort()) {
      html += `<optgroup label="${county} County">`;
      for (const name of byCounty[county].sort()) html += `<option value="${name}">${name}</option>`;
      html += '</optgroup>';
    }
    sel.innerHTML = html;
    const saved = localStorage.getItem('cwn_city');
    if (saved) { sel.value = saved; if (!sel.value) localStorage.removeItem('cwn_city'); }
  } catch (err) {
    console.error('[CWN70] fillCities:', err);
    sel.innerHTML = '<option value="">— City list unavailable —</option>';
  }
}

/* ── DAY/NIGHT AUTO-SWITCH ── */
let userOverride = false, prevThemeBucket = null;

function getThemeBucket() {
  const h = new Date().getHours();
  return (h >= 6 && h < 19) ? 'day' : 'night';
}

function applyTheme(theme, manual = false) {
  document.documentElement.setAttribute('data-theme', theme);
  metaTheme.content = theme === 'day' ? '#3b2a1f' : '#15110d';
  themeToggle.textContent = theme === 'day' ? 'Switch to Night' : 'Switch to Day';
  themeToggle.setAttribute('aria-pressed', String(theme === 'night'));
  modeBadge.textContent = manual ? 'MANUAL' : 'AUTO';
  modeBadge.setAttribute('data-mode', manual ? 'manual' : 'auto');
  localStorage.setItem('cwnTheme', theme);
}

function initTheme() {
  const bucket = getThemeBucket();
  prevThemeBucket = bucket;
  const saved = localStorage.getItem('cwnTheme');
  if (saved && saved !== bucket) { userOverride = true; applyTheme(saved, true); }
  else { userOverride = false; applyTheme(bucket, false); }
}

function autoCheck() {
  if (userOverride) return;
  const bucket = getThemeBucket();
  if (bucket !== prevThemeBucket) {
    userOverride = false; prevThemeBucket = bucket; applyTheme(bucket, false);
  }
}

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'day' ? 'night' : 'day';
  userOverride = true; prevThemeBucket = getThemeBucket(); applyTheme(next, true);
});

/* ── DIRECTORY NAV ── */
dirBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = dirMenu.classList.toggle('open');
  dirBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', () => {
  dirMenu.classList.remove('open'); dirBtn.setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dirMenu.classList.contains('open')) {
    dirMenu.classList.remove('open'); dirBtn.setAttribute('aria-expanded', 'false'); dirBtn.focus();
  }
});

/* ── CITY CHANGE → SAVE + RELOAD ── */
sel.addEventListener('change', () => {
  const city = sel.value;
  if (!city) return;
  localStorage.setItem('cwn_city', city);
  load(city);
});

/* ════════════════════════════════════════════════
   BOOT SEQUENCE — order is locked
════════════════════════════════════════════════ */
// 1. onchange wired above ✓
// 2. Fill cities → load saved/first city
fillCities().then(() => { const city = sel.value; if (city) load(city); });
// 3. Clock
clock(); setInterval(clock, 1_000);
// 4. Radar
radar(); setInterval(radar, 300_000);
// 5. Theme + auto-check
initTheme(); setInterval(autoCheck, 60_000);

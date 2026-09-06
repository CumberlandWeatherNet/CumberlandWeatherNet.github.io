/* Cumberland Weather Network — 1970s Edition
   type="module" — import path: ./core/cwn-heart-full.js
   Auto day/night: DAY 6AM–6:59PM | NIGHT 7PM–5:59AM
   userOverride resets at each threshold crossing           */

import {
  getCityCoords, getConditions, getAlerts,
  getRadarUrl, hasEmergency
} from './core/cwn-heart-full.js';

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function wxIcon(desc) {
  const d = (desc || '').toLowerCase();
  if (d.includes('thunder') || d.includes('t-storm'))       return '⚡';
  if (d.includes('snow') || d.includes('flurr') || d.includes('blizzard')) return '✻';
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return '☂';
  if (d.includes('cloud') || d.includes('overcast') || d.includes('fog'))  return '☁';
  return '☀';
}

/* ── Forecast periods (separate NWS call for 6-card strip) ─ */
const NWS_HDR = { 'User-Agent': 'CumberlandWeatherNet/2.0 (cumberlandweather.net)' };
async function fetchNWSPeriods(lat, lon) {
  const pt = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers: NWS_HDR }).then(r => r.json());
  const fc = await fetch(pt.properties.forecast, { headers: NWS_HDR }).then(r => r.json());
  return fc.properties.periods.slice(0, 6);
}

/* ── City selector ───────────────────────────────────────── */
const sel = document.getElementById('cwnCitySelect');

async function fillCities() {
  const data = await fetch('api/cities.json').then(r => r.json());
  sel.innerHTML = '<option value="">— SELECT CITY —</option>';
  for (const county in data) {
    const grp = document.createElement('optgroup');
    grp.label = county + ' County';
    for (const city in data[county]) {
      const opt = document.createElement('option');
      opt.value = city; opt.textContent = city + ', TN';
      grp.appendChild(opt);
    }
    sel.appendChild(grp);
  }
  try {
    const saved = localStorage.getItem('cwn_city');
    if (saved && [...sel.options].find(o => o.value === saved)) sel.value = saved;
  } catch(e) {}
}

/* ── Clock ───────────────────────────────────────────────── */
function clock() {
  const el = document.getElementById('cwnTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
}

/* ── Radar (event listeners wired once at module scope) ──── */
const radarImg    = document.getElementById('cwnRadar');
const radarStatus = document.getElementById('cwnRadarStatus');
radarImg.addEventListener('load',  () => { radarStatus.textContent = 'Radar updated.'; });
radarImg.addEventListener('error', () => { radarStatus.textContent = 'Radar unavailable.'; });
function radar() { radarImg.src = getRadarUrl() + '?t=' + Date.now(); }

/* ── Alert strip ─────────────────────────────────────────── */
function updateAlertStrip(alerts) {
  const strip = document.getElementById('alertStrip');
  const txt   = document.getElementById('alertStripText');
  if (hasEmergency(alerts) && alerts.length) {
    txt.textContent = alerts[0].headline || alerts[0].event;
    strip.hidden = false;
  } else { strip.hidden = true; }
}

/* ── Forecast strip (6 cards) ────────────────────────────── */
function renderPeriods(periods) {
  document.getElementById('forecastPeriods').innerHTML = periods.map(p => {
    const precip = p.probabilityOfPrecipitation?.value ?? 0;
    return `<article class="icon-card">
      <div class="period-name">${esc(p.name)}</div>
      <div class="live-symbol" aria-hidden="true">${wxIcon(p.shortForecast)}</div>
      <div class="period-temp">${esc(p.temperature)}&deg;</div>
      <div class="period-desc">${esc(p.shortForecast)}</div>
      <div class="period-rain">Rain ${precip}%</div>
    </article>`;
  }).join('');
}

/* ── Main load ───────────────────────────────────────────── */
async function load(cityName) {
  if (!cityName) return;
  const st = document.getElementById('weatherStatus');
  st.textContent = 'Fetching live local data…';
  try { localStorage.setItem('cwn_city', cityName); } catch(e) {}
  try {
    const { lat, lon } = await getCityCoords(cityName);
    const [conditions, alerts, periods] = await Promise.all([
      getConditions(lat, lon), getAlerts(lat, lon), fetchNWSPeriods(lat, lon)
    ]);
    document.getElementById('cwnTemp').textContent    = conditions.temp_f + '°F';
    document.getElementById('cwnDesc').textContent    = esc(conditions.description);
    document.getElementById('cwnWind').textContent    = `Wind: ${esc(conditions.wind_mph)} ${esc(conditions.wind_direction)}`;
    document.getElementById('cwnPrecip').textContent  = `Precip: ${conditions.precip_pct}%`;
    document.getElementById('currentIconBox').innerHTML = `<div class="current-live-symbol">${wxIcon(conditions.description)}</div>`;
    st.textContent = `Live report for ${esc(cityName)}.`;
    updateAlertStrip(alerts);
    renderPeriods(periods);
  } catch(err) {
    console.error('[CWN 70s]', err);
    document.getElementById('weatherStatus').textContent = 'Weather service unavailable.';
    document.getElementById('forecastPeriods').innerHTML = '<div class="icon-card" style="grid-column:1/-1">Forecast unavailable</div>';
  }
}

/* ── Day/Night auto-switch ───────────────────────────────── */
let userOverride = false, prevThemeBucket = null;

function getThemeBucket() {
  const h = new Date().getHours();
  return (h >= 6 && h < 19) ? 'day' : 'night';
}
function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const night = theme === 'night';
  const toggle = document.getElementById('themeToggle');
  if (toggle) { toggle.textContent = night ? 'Switch to Day' : 'Switch to Night'; toggle.setAttribute('aria-pressed', String(night)); }
  const tc = document.getElementById('themeColor');
  if (tc) tc.content = night ? '#15110d' : '#3b2a1f';
  try { localStorage.setItem('cwnTheme', theme); } catch(e) {}
}
function updateModeBadge(mode) {
  const b = document.getElementById('modeBadge');
  if (b) { b.textContent = mode; b.dataset.mode = mode.toLowerCase(); }
}
function autoCheck() {
  const bucket = getThemeBucket();
  if (prevThemeBucket !== null && bucket !== prevThemeBucket) userOverride = false;
  prevThemeBucket = bucket;
  if (!userOverride) { applyTheme(bucket); updateModeBadge('AUTO'); }
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('cwnTheme'); } catch(e) {}
  const bucket = getThemeBucket();
  prevThemeBucket = bucket;
  if (saved && (saved === 'day' || saved === 'night') && saved !== bucket) {
    applyTheme(saved); userOverride = true; updateModeBadge('MANUAL');
  } else { applyTheme(bucket); userOverride = false; updateModeBadge('AUTO'); }
}
document.getElementById('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'night' ? 'day' : 'night';
  applyTheme(next); userOverride = true; updateModeBadge('MANUAL');
});

/* ── Directory nav ───────────────────────────────────────── */
const dirNav = document.getElementById('directoryNav');
const dirBtn = document.getElementById('directoryButton');
function closeDirectory() { dirNav.classList.remove('open'); dirBtn.setAttribute('aria-expanded','false'); }
dirBtn.addEventListener('click', () => {
  const open = !dirNav.classList.contains('open');
  dirNav.classList.toggle('open', open); dirBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', e => { if (!dirNav.contains(e.target)) closeDirectory(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDirectory(); dirBtn.focus(); } });

/* ── Boot sequence ───────────────────────────────────────── */
sel.addEventListener('change', () => { if (sel.value) load(sel.value); });
fillCities().then(() => { if (sel.value) load(sel.value); });
clock();              setInterval(clock,    1000);
radar();              setInterval(radar,  300_000);
initTheme();          setInterval(autoCheck, 60_000);

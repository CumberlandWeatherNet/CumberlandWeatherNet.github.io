/* ============================================================
   Cumberland Weather Network — index.js
   HEART engine · persistent city · auto day/night
   ============================================================ */
"use strict";

import {
  getCityCoords,
  getConditions,
  getAlerts,
  fetchNWSPeriods,
  getRadarUrl,
  hasEmergency,
} from './core/cwn-heart-full.js';

/* ── DOM ── */
const sel         = document.getElementById('cwnCitySelect');
const timeEl      = document.getElementById('cwnTime');
const toggle      = document.getElementById('themeToggle');
const badge       = document.getElementById('modeBadge');
const dirNav      = document.getElementById('directoryNav');
const dirBtn      = document.getElementById('directoryButton');
const forecastEl  = document.getElementById('forecastPeriods');
const iconBox     = document.getElementById('currentIconBox');
const tempEl      = document.getElementById('cwnTemp');
const windEl      = document.getElementById('cwnWind');
const descEl      = document.getElementById('cwnDesc');
const statusEl    = document.getElementById('weatherStatus');
const radarImg    = document.getElementById('cwnRadar');
const radarStatus = document.getElementById('cwnRadarStatus');
const metaTheme   = document.getElementById('themeColor');

/* ── WEATHER ICONS ── */
function wxIcon(desc = '') {
  const d = desc.toLowerCase();
  if (d.includes('tornado'))                                              return '🌪';
  if (d.includes('thunder') || d.includes('tstm'))                       return '⚡';
  if (d.includes('snow') || d.includes('blizzard') || d.includes('flurr')) return '✻';
  if (d.includes('sleet') || d.includes('freezing'))                     return '✻';
  if (d.includes('fog')   || d.includes('haze'))                         return '🌫';
  if (d.includes('rain')  || d.includes('shower') || d.includes('drizzle')) return '☂';
  if (d.includes('cloud') || d.includes('overcast'))                     return '☁';
  if (d.includes('wind'))                                                return '💨';
  if (d.includes('sunny') || d.includes('clear') || d.includes('fair'))  return '☀';
  return '☁';
}

/* ── CLOCK ── */
function clock() {
  timeEl.textContent = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  });
}

/* ── RADAR ── */
function loadRadar() {
  radarImg.src = getRadarUrl() + '?t=' + Date.now();
}
radarImg.onload  = () => { radarStatus.textContent = 'Radar image updated.'; };
radarImg.onerror = () => { radarStatus.textContent = 'Radar image currently unavailable.'; };

/* ── FORECAST CARDS ── */
function renderPeriods(periods) {
  if (!periods?.length) {
    forecastEl.innerHTML = '<div class="icon-card">Forecast unavailable</div>';
    return;
  }
  forecastEl.innerHTML = periods.slice(0, 6).map(p => `
    <article class="icon-card">
      <div class="period-name">${p.name ?? '—'}</div>
      <div class="live-symbol" aria-hidden="true">${wxIcon(p.shortForecast ?? '')}</div>
      <div class="period-temp">${p.temperature ?? '--'}°${p.temperatureUnit ?? 'F'}</div>
      <div class="period-desc">${p.shortForecast ?? ''}</div>
      <div class="period-rain">Rain ${p.precip_pct ?? 0}%</div>
    </article>
  `).join('');
}

/* ── LOAD WEATHER ── */
async function load(cityName) {
  if (!cityName) return;
  statusEl.textContent = 'Loading live local forecast…';
  try {
    const { lat, lon } = await getCityCoords(cityName);
    const [conditions, alerts, periods] = await Promise.all([
      getConditions(lat, lon),
      getAlerts(lat, lon),
      fetchNWSPeriods(lat, lon, 6),
    ]);

    iconBox.innerHTML    = `<div class="current-live-symbol">${wxIcon(conditions.description)}</div>`;
    tempEl.textContent   = `${conditions.temp_f}°F`;
    windEl.textContent   = `Wind: ${conditions.wind_mph} mph`;
    descEl.textContent   = conditions.description;
    statusEl.textContent = `Live report for ${cityName}. Updated ${new Date().toLocaleTimeString()}`;

    renderPeriods(periods);

  } catch (err) {
    console.error('[CWN]', err);
    statusEl.textContent = 'The location or weather service could not be reached.';
    forecastEl.innerHTML = '<div class="icon-card">Forecast unavailable</div>';
  }
}

/* ── CITY SELECT — fill from api/cities.json, restore saved city ── */
async function fillCities() {
  try {
    const resp = await fetch('./api/cities.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const cities = await resp.json();

    const byCounty = {};
    for (const c of cities) {
      const county = c.county ?? 'Other';
      (byCounty[county] ??= []).push(c.name);
    }

    let html = '<option value="">— Select city —</option>';
    for (const county of Object.keys(byCounty).sort()) {
      html += `<optgroup label="${county} County">`;
      for (const name of byCounty[county].sort())
        html += `<option value="${name}">${name}, TN</option>`;
      html += '</optgroup>';
    }
    sel.innerHTML = html;

  } catch (err) {
    console.error('[CWN] fillCities:', err);
    sel.innerHTML = '<option value="">— City list unavailable —</option>';
  }

  /* Restore saved city — persists until user picks a different one */
  const saved = localStorage.getItem('cwn_city');
  if (saved) {
    sel.value = saved;
    if (!sel.value) localStorage.removeItem('cwn_city');
  }
}

/* Save on change + load weather immediately */
sel.addEventListener('change', () => {
  const city = sel.value;
  if (!city) return;
  localStorage.setItem('cwn_city', city);
  load(city);
});

/* ── AUTO DAY / NIGHT ──────────────────────────────────────────
   Day   = 06:00–18:59
   Night = 19:00–05:59
   Manual toggle sets MANUAL badge; auto resets at threshold crossings.
────────────────────────────────────────────────────────────── */
let userOverride = false;
let prevBucket   = null;

function bucket() {
  const h = new Date().getHours();
  return (h >= 6 && h < 19) ? 'day' : 'night';
}

function applyTheme(theme, manual = false) {
  document.documentElement.dataset.theme = theme;
  metaTheme.content  = theme === 'night' ? '#15110d' : '#3b2a1f';
  toggle.textContent = theme === 'night' ? 'Switch to Day' : 'Switch to Night';
  toggle.setAttribute('aria-pressed', String(theme === 'night'));
  badge.textContent  = manual ? 'MANUAL' : 'AUTO';
  badge.dataset.mode = manual ? 'manual' : 'auto';
  try { localStorage.setItem('cwn_theme', theme); } catch (_) {}
}

function initTheme() {
  const b     = bucket();
  prevBucket  = b;
  let saved   = null;
  try { saved = localStorage.getItem('cwn_theme'); } catch (_) {}
  if (saved && saved !== b) { userOverride = true;  applyTheme(saved, true); }
  else                      { userOverride = false; applyTheme(b, false);    }
}

function autoCheck() {
  if (userOverride) return;
  const b = bucket();
  if (b !== prevBucket) { prevBucket = b; applyTheme(b, false); }
}

toggle.addEventListener('click', () => {
  const next   = document.documentElement.dataset.theme === 'night' ? 'day' : 'night';
  userOverride = true;
  prevBucket   = bucket();
  applyTheme(next, true);
});

/* ── DIRECTORY DROPDOWN ── */
dirBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = dirNav.classList.toggle('open');
  dirBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', () => {
  dirNav.classList.remove('open');
  dirBtn.setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && dirNav.classList.contains('open')) {
    dirNav.classList.remove('open');
    dirBtn.setAttribute('aria-expanded', 'false');
    dirBtn.focus();
  }
});

/* ── BOOT ── */
initTheme();
clock();    setInterval(clock,      1_000);
loadRadar(); setInterval(loadRadar, 300_000);
setInterval(autoCheck, 60_000);

fillCities().then(() => {
  const city = sel.value;
  if (city) load(city);
});

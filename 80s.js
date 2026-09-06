/**
 * CWN 1980s Edition — 80s.js
 * ES Module. Mirrors home page JS structure exactly.
 * HEART engine → ./core/cwn-heart-full.js
 * City registry → api/cities.json
 */

import {
  getConditions,
  getAlerts,
  getRadarUrl,
  hasEmergency
} from './core/cwn-heart-full.js';

/* ── CRT weather symbols (replaces home page emoji) ── */
const ICON = { sunny:'◎', cloudy:'◑', rain:'≈', storm:'⌁', snow:'❄' };

function forecastToIcon(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('thunder') || t.includes('storm'))                    return 'storm';
  if (t.includes('snow') || t.includes('blizzard') || t.includes('sleet')) return 'snow';
  if (t.includes('rain') || t.includes('shower') || t.includes('drizzle')) return 'rain';
  if (t.includes('cloud') || t.includes('overcast') || t.includes('fog'))  return 'cloudy';
  return 'sunny';
}

/* ── City registry ── */
let citiesData = {};
const sel    = document.getElementById('cwnCitySelect');
const LS_KEY = 'cwn_city';

async function loadCities() {
  try {
    const res  = await fetch('api/cities.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    citiesData = await res.json();

    sel.innerHTML = '';
    Object.entries(citiesData).sort().forEach(([county, cities]) => {
      const g   = document.createElement('optgroup');
      g.label   = county.replace(/_/g, ' ') + ' County';
      Object.keys(cities).sort().forEach(name => {
        const o       = document.createElement('option');
        o.value       = name + '|' + county.replace(/_/g, ' ');
        o.textContent = name + ', TN';
        if (name === 'Lebanon' && county.replace(/_/g, ' ') === 'Wilson') o.selected = true;
        g.appendChild(o);
      });
      sel.appendChild(g);
    });

    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const opt = sel.querySelector(`option[value="${saved.replace(/"/g, '\\"')}"]`);
        if (opt) sel.value = saved;
      }
    } catch (_) {}

    load(sel.value);
  } catch (err) {
    console.error('[CWN] City load error:', err);
    sel.innerHTML = '<option value="">City data unavailable</option>';
    document.getElementById('weatherStatus').textContent =
      'City data could not be loaded. Please refresh.';
  }
}

function resolveCoords(selectVal) {
  const [name, county] = selectVal.split('|');
  const countyKey = Object.keys(citiesData).find(
    k => k.replace(/_/g, ' ').toLowerCase() === (county || '').toLowerCase()
  );
  if (!countyKey) throw new Error(`County not found: ${county}`);
  const entry = citiesData[countyKey]?.[name];
  if (!entry)   throw new Error(`City not found: ${name}`);
  return { name, county: county.replace(/_/g, ' '), lat: entry.lat, lon: entry.lon };
}

/* ── Clock ── */
function clock() {
  document.getElementById('cwnTime').textContent =
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/* ── Radar ── */
function radar() {
  const img = document.getElementById('cwnRadar');
  const st  = document.getElementById('cwnRadarStatus');
  st.textContent = 'Loading radar...';
  img.src    = getRadarUrl() + '?t=' + Date.now();
  img.onload  = () => { st.textContent = 'Radar image updated.'; };
  img.onerror = () => { st.textContent = 'Radar image currently unavailable.'; };
}

/* ── NWS 6-period forecast ── */
const NWS_UA = 'CumberlandWeatherNet/2.0 (cumberlandweather.net)';

async function fetchNWSPeriods(lat, lon) {
  const ptRes = await fetch(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
    { headers: { 'User-Agent': NWS_UA } }
  );
  if (!ptRes.ok) throw new Error(`NWS points HTTP ${ptRes.status}`);
  const ptData = await ptRes.json();
  const fcUrl  = ptData.properties?.forecast;
  if (!fcUrl) throw new Error('No forecast URL from NWS');

  const fcRes = await fetch(fcUrl, { headers: { 'User-Agent': NWS_UA } });
  if (!fcRes.ok) throw new Error(`NWS forecast HTTP ${fcRes.status}`);
  const fcData = await fcRes.json();
  return (fcData.properties?.periods || []).slice(0, 6);
}

/* ── Render forecast periods ── */
function renderPeriods(periods) {
  const el = document.getElementById('forecastPeriods');
  if (!periods || !periods.length) {
    el.innerHTML = '<div class="icon-card">Forecast unavailable</div>';
    return;
  }
  el.innerHTML = periods.map(p => {
    const iconKey   = forecastToIcon(p.shortForecast);
    const rainMatch = (p.detailedForecast || '').match(/(\d+)\s*percent/i);
    const rain      = rainMatch ? rainMatch[1] : '--';
    return `<article class="icon-card">
  <div class="period-name">${esc(p.name)}</div>
  <div class="live-symbol" aria-hidden="true">${ICON[iconKey]}</div>
  <div class="period-temp">${p.temperature}&deg;${p.temperatureUnit || 'F'}</div>
  <div class="period-desc">${esc(p.shortForecast)}</div>
  <div class="period-rain">Precip ${rain}%</div>
</article>`;
  }).join('');
}

/* ── Render alerts ── */
function renderAlerts(alerts) {
  const strip  = document.getElementById('alertStrip');
  const stripT = document.getElementById('alertStripText');
  const inline = document.getElementById('alertsInline');

  if (!alerts || alerts.length === 0) {
    strip.hidden    = true;
    inline.innerHTML = '';
    return;
  }

  if (hasEmergency(alerts)) {
    const worst = alerts.find(a =>
      a.severity === 'Extreme' || a.severity === 'Severe' ||
      (a.event || '').toLowerCase().includes('warning')
    ) || alerts[0];
    stripT.textContent = `\u26A0 ${(worst.event || 'WEATHER ALERT').toUpperCase()} IN EFFECT \u26A0`;
    strip.hidden = false;
  } else {
    strip.hidden = true;
  }

  inline.innerHTML = alerts.map(a => `
    <div class="alert-inline-row">
      <div class="alert-event">${esc((a.event || '').toUpperCase())}</div>
      <div>${esc(trunc(a.headline || a.event || '', 100))}</div>
    </div>`).join('');
}

/* ── Main load — mirrors home page load() ── */
async function load(selectVal) {
  const st = document.getElementById('weatherStatus');
  st.textContent = 'Loading live local forecast...';
  document.getElementById('alertsInline').innerHTML = '';
  document.getElementById('alertStrip').hidden = true;

  try {
    const { name, county, lat, lon } = resolveCoords(selectVal);

    const [cond, alerts, periods] = await Promise.all([
      getConditions(lat, lon),
      getAlerts(lat, lon),
      fetchNWSPeriods(lat, lon),
    ]);

    document.getElementById('cwnTemp').textContent    = `${cond.temp_f}\u00B0F`;
    document.getElementById('cwnWind').textContent    = `Wind: ${cond.wind_mph} mph ${cond.wind_direction || ''}`.trim();
    document.getElementById('cwnDesc').textContent    = cond.description || 'Data received';
    document.getElementById('currentIconBox').innerHTML =
      `<div class="current-live-symbol">${ICON[forecastToIcon(cond.description || '')]}</div>`;

    st.textContent = `Live report for ${name}, ${county} County.`;

    renderPeriods(periods);
    renderAlerts(alerts);

  } catch (err) {
    console.error('[CWN] Load error:', err);
    st.textContent = 'The location or weather service could not be reached.';
    document.getElementById('forecastPeriods').innerHTML =
      '<div class="icon-card">Forecast unavailable</div>';
  }
}

/* ── Directory nav — mirrors home page exactly ── */
const directoryNav    = document.getElementById('directoryNav');
const directoryButton = document.getElementById('directoryButton');

function closeDirectory() {
  directoryNav.classList.remove('open');
  directoryButton.setAttribute('aria-expanded', 'false');
}
directoryButton.addEventListener('click', () => {
  const open = !directoryNav.classList.contains('open');
  directoryNav.classList.toggle('open', open);
  directoryButton.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', e => { if (!directoryNav.contains(e.target)) closeDirectory(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDirectory(); directoryButton.focus(); } });

/* ── City select change ── */
sel.addEventListener('change', () => {
  if (!sel.value) return;
  try { localStorage.setItem(LS_KEY, sel.value); } catch (_) {}
  load(sel.value);
});

/* ── Utilities ── */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function trunc(s, n) { return s.length <= n ? s : s.slice(0, n - 1) + '\u2026'; }

/* ── Boot — mirrors home page exactly ── */
loadCities();
clock(); setInterval(clock, 1000);
radar(); setInterval(radar, 300000);

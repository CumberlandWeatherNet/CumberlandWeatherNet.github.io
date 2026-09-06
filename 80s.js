/**
 * CWN 1980s Edition — 80s.js
 * ES Module. Boot sequence mirrors home page exactly.
 * Data: HEART engine (getConditions, getAlerts, getRadarUrl, hasEmergency)
 *       + api/cities.json city registry
 *       + NWS forecast API for 6-period strip
 */

import {
  getConditions,
  getAlerts,
  getRadarUrl,
  hasEmergency
} from './core/cwn-heart-full.js';

/* ── CRT weather symbols ── */
const ICON = { sunny: '◎', cloudy: '◑', rain: '≈', storm: '⌁', snow: '❄' };

function forecastToIcon(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('thunder') || t.includes('storm'))                        return 'storm';
  if (t.includes('snow') || t.includes('blizzard') || t.includes('sleet')) return 'snow';
  if (t.includes('rain') || t.includes('shower') || t.includes('drizzle')) return 'rain';
  if (t.includes('cloud') || t.includes('overcast') || t.includes('fog'))  return 'cloudy';
  return 'sunny';
}

/* ── City registry — api/cities.json → dropdown ── */
let citiesData = {};
const sel    = document.getElementById('cwnCitySelect');
const LS_KEY = 'cwn_city';

async function fillCities() {
  const res  = await fetch('api/cities.json');
  const data = await res.json();
  citiesData = data;

  sel.innerHTML = '';
  Object.entries(data).sort().forEach(([county, cities]) => {
    const g = document.createElement('optgroup');
    g.label = county.replace(/_/g, ' ') + ' County';
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
      const opt = sel.querySelector('option[value="' + saved.replace(/"/g, '\\"') + '"]');
      if (opt) sel.value = saved;
    }
  } catch (_) {}
}

function resolveCoords(v) {
  const [name, county] = v.split('|');
  const key = Object.keys(citiesData).find(
    k => k.replace(/_/g, ' ').toLowerCase() === (county || '').toLowerCase()
  );
  if (!key)        throw new Error('County not found: ' + county);
  const entry = citiesData[key]?.[name];
  if (!entry)      throw new Error('City not found: ' + name);
  return { name, county: county.replace(/_/g, ' '), lat: entry.lat, lon: entry.lon };
}

/* ── Clock — exact mirror of home page clock() ── */
function clock() {
  document.getElementById('cwnTime').textContent =
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/* ── Radar — onload/onerror wired ONCE on element, mirrors home page ── */
const radarImg    = document.getElementById('cwnRadar');
const radarStatus = document.getElementById('cwnRadarStatus');
radarImg.onload  = () => { radarStatus.textContent = 'Radar image updated.'; };
radarImg.onerror = () => { radarStatus.textContent = 'Radar image is currently unavailable.'; };

function radar() {
  radarStatus.textContent = 'Loading radar...';
  radarImg.src = getRadarUrl() + '?t=' + Date.now();
}

/* ── NWS 6-period forecast strip ── */
const NWS_UA = 'CumberlandWeatherNet/2.0 (cumberlandweather.net)';

async function fetchNWSPeriods(lat, lon) {
  const ptRes = await fetch(
    'https://api.weather.gov/points/' + lat + ',' + lon,
    { headers: { 'User-Agent': NWS_UA } }
  );
  if (!ptRes.ok) throw new Error('NWS points: ' + ptRes.status);
  const pt = await ptRes.json();

  const fcRes = await fetch(pt.properties.forecast, { headers: { 'User-Agent': NWS_UA } });
  if (!fcRes.ok) throw new Error('NWS forecast: ' + fcRes.status);
  const fc = await fcRes.json();
  return fc.properties.periods || [];
}

/* ── Render forecast periods — mirrors home page renderPeriods() ── */
function renderPeriods(periods) {
  const el  = document.getElementById('forecastPeriods');
  const six = periods.slice(0, 6);
  if (!six.length) { el.innerHTML = '<div class="icon-card">Forecast unavailable</div>'; return; }
  el.innerHTML = six.map(p => {
    const icon      = forecastToIcon(p.shortForecast);
    const rainMatch = (p.detailedForecast || '').match(/(\d+)\s*percent/i);
    const rain      = rainMatch ? rainMatch[1] : '--';
    return '<article class="icon-card">'
      + '<div class="period-name">'                    + esc(p.name)         + '</div>'
      + '<div class="live-symbol" aria-hidden="true">' + ICON[icon]          + '</div>'
      + '<div class="period-temp">'                    + p.temperature + '&deg;' + (p.temperatureUnit || 'F') + '</div>'
      + '<div class="period-desc">'                    + esc(p.shortForecast) + '</div>'
      + '<div class="period-rain">Rain '               + rain + '%</div>'
      + '</article>';
  }).join('');
}

/* ── Render alerts — uses HEART hasEmergency() ── */
function renderAlerts(alerts) {
  const strip  = document.getElementById('alertStrip');
  const stripT = document.getElementById('alertStripText');
  const inline = document.getElementById('alertsInline');

  if (!alerts || !alerts.length) {
    strip.hidden = true; inline.innerHTML = ''; return;
  }

  if (hasEmergency(alerts)) {
    const worst = alerts.find(a =>
      a.severity === 'Extreme' || a.severity === 'Severe' || (a.event || '').includes('Warning')
    ) || alerts[0];
    stripT.textContent = '⚠ ' + (worst.event || 'WEATHER ALERT').toUpperCase() + ' IN EFFECT ⚠';
    strip.hidden = false;
  } else {
    strip.hidden = true;
  }

  inline.innerHTML = alerts.map(a =>
    '<div class="alert-inline-row">'
    + '<div class="alert-event">' + esc((a.event || '').toUpperCase()) + '</div>'
    + '<div>' + esc(trunc(a.headline || a.event || '', 100)) + '</div>'
    + '</div>'
  ).join('');
}

/* ── Load — mirrors home page load() exactly ── */
async function load(v) {
  const st = document.getElementById('weatherStatus');
  st.textContent = 'Loading live local forecast...';
  document.getElementById('alertsInline').innerHTML = '';
  document.getElementById('alertStrip').hidden = true;

  try {
    const { name, county, lat, lon } = resolveCoords(v);

    const [cond, alerts, periods] = await Promise.all([
      getConditions(lat, lon),    // HEART → NWS points → forecast → period[0]
      getAlerts(lat, lon),        // HEART → NWS alerts/active?point=
      fetchNWSPeriods(lat, lon)   // NWS → all periods for strip
    ]);

    document.getElementById('cwnTemp').textContent =
      cond.temp_f + '°F';
    // wind_mph is raw NWS string e.g. "10 to 15 mph" — display as-is
    document.getElementById('cwnWind').textContent =
      'Wind: ' + cond.wind_mph + ' ' + cond.wind_direction;
    document.getElementById('cwnDesc').textContent =
      cond.description;
    // currentIconBox starts empty in HTML — JS injects innerHTML (mirrors home page)
    document.getElementById('currentIconBox').innerHTML =
      '<div class="current-live-symbol">' + ICON[forecastToIcon(cond.description)] + '</div>';

    st.textContent = 'Live report for ' + name + ', ' + county + ' County.';

    renderPeriods(periods);
    renderAlerts(alerts);

  } catch (e) {
    console.error('[CWN 80s]', e);
    st.textContent = 'The location or weather service could not be reached.';
    document.getElementById('forecastPeriods').innerHTML =
      '<div class="icon-card">Forecast unavailable</div>';
  }
}

/* ── Directory nav — exact copy of home page logic ── */
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

/* ── Utilities ── */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function trunc(s, n) { return s.length <= n ? s : s.slice(0, n - 1) + '\u2026'; }

/* ── Boot — mirrors home page ordering exactly ── */
sel.onchange = () => {
  try { localStorage.setItem(LS_KEY, sel.value); } catch (_) {}
  load(sel.value);
};

fillCities()
  .then(() => load(sel.value))
  .catch(e => {
    console.error('[CWN 80s] City load failed:', e);
    document.getElementById('weatherStatus').textContent =
      'City data could not be loaded. Please refresh.';
  });

clock(); setInterval(clock, 1000);
radar(); setInterval(radar, 300000);

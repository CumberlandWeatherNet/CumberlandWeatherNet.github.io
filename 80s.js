/**
 * CWN 1980s Edition — 80s.js
 * HEART engine · persistent city · no day/night toggle
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
const ICON = { sunny: '◎', cloudy: '◑', rain: '≈', storm: '⌁', snow: '❄' };

function wxIcon(desc = '') {
  const d = desc.toLowerCase();
  if (d.includes('thunder') || d.includes('storm'))                        return ICON.storm;
  if (d.includes('snow') || d.includes('blizzard') || d.includes('sleet')) return ICON.snow;
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return ICON.rain;
  if (d.includes('cloud') || d.includes('overcast') || d.includes('fog'))  return ICON.cloudy;
  return ICON.sunny;
}

/* ── DOM ── */
const sel         = document.getElementById('cwnCitySelect');
const radarImg    = document.getElementById('cwnRadar');
const radarStatus = document.getElementById('cwnRadarStatus');
const statusEl    = document.getElementById('weatherStatus');
const forecastEl  = document.getElementById('forecastPeriods');
const alertStrip  = document.getElementById('alertStrip');
const alertStripT = document.getElementById('alertStripText');
const alertInline = document.getElementById('alertsInline');

/* ── CLOCK ── */
function clock() {
  document.getElementById('cwnTime').textContent =
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/* ── RADAR ── */
function loadRadar() {
  radarStatus.textContent = 'Loading radar...';
  radarImg.src = getRadarUrl() + '?t=' + Date.now();
}
radarImg.onload  = () => { radarStatus.textContent = 'Radar image updated.'; };
radarImg.onerror = () => { radarStatus.textContent = 'Radar image currently unavailable.'; };

/* ── FORECAST STRIP ── */
function renderPeriods(periods) {
  if (!periods?.length) {
    forecastEl.innerHTML = '<div class="icon-card">Forecast unavailable</div>';
    return;
  }
  forecastEl.innerHTML = periods.slice(0, 6).map(p => {
    const rain = p.probabilityOfPrecipitation?.value ?? p.precip_pct ?? '--';
    return `
      <article class="icon-card">
        <div class="period-name">${esc(p.name ?? '—')}</div>
        <div class="live-symbol" aria-hidden="true">${wxIcon(p.shortForecast ?? '')}</div>
        <div class="period-temp">${p.temperature ?? '--'}°${p.temperatureUnit ?? 'F'}</div>
        <div class="period-desc">${esc(p.shortForecast ?? '')}</div>
        <div class="period-rain">Rain ${rain}%</div>
      </article>`;
  }).join('');
}

/* ── ALERTS ── */
function renderAlerts(alerts) {
  if (!alerts?.length) {
    alertStrip.hidden = true;
    alertInline.innerHTML = '';
    return;
  }

  if (hasEmergency(alerts)) {
    const worst = alerts.find(a =>
      a.severity === 'Extreme' || a.severity === 'Severe' || (a.event || '').includes('Warning')
    ) ?? alerts[0];
    alertStripT.textContent = '⚠ ' + (worst.event || 'WEATHER ALERT').toUpperCase() + ' IN EFFECT ⚠';
    alertStrip.hidden = false;
  } else {
    alertStrip.hidden = true;
  }

  alertInline.innerHTML = alerts.map(a =>
    `<div class="alert-inline-row">
      <div class="alert-event">${esc((a.event || '').toUpperCase())}</div>
      <div>${esc(trunc(a.headline || a.event || '', 100))}</div>
    </div>`
  ).join('');
}

/* ── LOAD WEATHER ── */
async function load(cityName) {
  if (!cityName) return;
  statusEl.textContent = 'Loading live local forecast...';
  alertInline.innerHTML = '';
  alertStrip.hidden = true;

  try {
    const { lat, lon } = await getCityCoords(cityName);

    const [cond, alerts, periods] = await Promise.all([
      getConditions(lat, lon),
      getAlerts(lat, lon),
      fetchNWSPeriods(lat, lon, 6),
    ]);

    document.getElementById('currentIconBox').innerHTML =
      `<div class="current-live-symbol">${wxIcon(cond.description)}</div>`;
    document.getElementById('cwnTemp').textContent  = `${cond.temp_f}°F`;
    document.getElementById('cwnWind').textContent  = `Wind: ${cond.wind_mph} mph`;
    document.getElementById('cwnDesc').textContent  = cond.description;
    statusEl.textContent = `Live report for ${cityName}. Updated ${new Date().toLocaleTimeString()}`;

    renderPeriods(periods);
    renderAlerts(alerts);

  } catch (err) {
    console.error('[CWN 80s]', err);
    statusEl.textContent = 'Location or weather service could not be reached.';
    forecastEl.innerHTML = '<div class="icon-card">Forecast unavailable</div>';
  }
}

/* ── CITY SELECT ─────────────────────────────────────────────
   cities.json: { "Davidson County": { "Nashville": { lat, lon } } }
────────────────────────────────────────────────────────────── */
async function fillCities() {
  try {
    const resp = await fetch('./api/cities.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    let html = '<option value="">— Select city —</option>';
    for (const county of Object.keys(data).sort()) {
      html += `<optgroup label="${county}">`;
      for (const city of Object.keys(data[county]).sort())
        html += `<option value="${city}">${city}, TN</option>`;
      html += '</optgroup>';
    }
    sel.innerHTML = html;

  } catch (err) {
    console.error('[CWN 80s] fillCities:', err);
    sel.innerHTML = '<option value="">— City list unavailable —</option>';
  }

  /* Restore saved city — shared key with home page */
  const saved = localStorage.getItem('cwn_city');
  if (saved) {
    sel.value = saved;
    if (!sel.value) localStorage.removeItem('cwn_city');
  }
}

sel.addEventListener('change', () => {
  const city = sel.value;
  if (!city) return;
  localStorage.setItem('cwn_city', city);
  load(city);
});

/* ── DIRECTORY DROPDOWN ── */
const dirNav = document.getElementById('directoryNav');
const dirBtn = document.getElementById('directoryButton');

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

/* ── UTILITIES ── */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function trunc(s, n) { return s.length <= n ? s : s.slice(0, n - 1) + '…'; }

/* ── BOOT ── */
clock();     setInterval(clock,       1_000);
loadRadar(); setInterval(loadRadar,  300_000);

fillCities()
  .then(() => { const city = sel.value; if (city) load(city); })
  .catch(err => {
    console.error('[CWN 80s] City load failed:', err);
    statusEl.textContent = 'City data could not be loaded. Please refresh.';
  });

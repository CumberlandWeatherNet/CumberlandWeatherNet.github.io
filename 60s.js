/**
 * Cumberland Weather Network — 1960s Edition
 * 60s.js
 * Identical logic to index.js — theme key: cwn60s_theme
 */

import {
  getCityCoords, getConditions, getAlerts,
  getRadarUrl, fetchNWSPeriods,
} from './core/cwn-heart-full.js';

function wxIcon(desc = '') {
  const d = desc.toLowerCase();
  if (d.includes('tornado'))                                                return '🌪';
  if (d.includes('thunder') || d.includes('tstm') || d.includes('storm'))  return '⛈';
  if (d.includes('blizzard') || d.includes('heavy snow'))                   return '🌨';
  if (d.includes('snow') || d.includes('sleet') || d.includes('flurr'))    return '❄';
  if (d.includes('freez') || d.includes('ice') || d.includes('wintry'))    return '🧊';
  if (d.includes('fog') || d.includes('haze') || d.includes('mist'))       return '🌫';
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return '🌧';
  if (d.includes('wind') || d.includes('breezy') || d.includes('gusty'))   return '💨';
  if (d.includes('overcast') || d.includes('mostly cloudy'))                return '☁';
  if (d.includes('partly cloudy') || d.includes('partly sunny') ||
      d.includes('mostly sunny'))                                           return '⛅';
  if (d.includes('cloud'))                                                  return '🌤';
  if (d.includes('clear') || d.includes('sunny') || d.includes('fair'))    return '☀';
  return '🌡';
}

function isActiveAlert(a) {
  const ev = (a.event || '').toLowerCase();
  return (
    ev.includes('warning')  || ev.includes('watch')     ||
    ev.includes('advisory') || ev.includes('statement') ||
    ev.includes('amber')    || ev.includes('emergency') ||
    ev.includes('special')  || ev.includes('evacuation')
  );
}

function worstLabel(alerts) {
  if (alerts.some(a => /tornado warning/i.test(a.event)))             return '⚡ Tornado Warning';
  if (alerts.some(a => /severe thunderstorm warning/i.test(a.event))) return '⛈ Severe Thunderstorm Warning';
  if (alerts.some(a => /flash flood warning/i.test(a.event)))         return '🌊 Flash Flood Warning';
  if (alerts.some(a => /tornado watch/i.test(a.event)))               return '🌪 Tornado Watch';
  if (alerts.some(a => /warning/i.test(a.event)))                     return '⚠ Weather Warning';
  if (alerts.some(a => /watch/i.test(a.event)))                       return '👁 Weather Watch';
  if (alerts.some(a => /advisory/i.test(a.event)))                    return '📢 Weather Advisory';
  return '📋 Special Weather Statement';
}

const $        = id => document.getElementById(id);
const sel      = $('cwnCitySelect');
const radarImg = $('cwnRadar');
const radarSt  = $('cwnRadarStatus');
const statusEl = $('weatherStatus');
const fcastEl  = $('forecastPeriods');
const ticker   = $('alertTicker');
const tickTrk  = $('alertTickerTrack');
const tickLbl  = $('alertTickerLabel');
const inlineEl = $('alertsInline');
const togBtn   = $('themeToggle');
const timeEl   = $('cwnTime');
const metaTag  = $('themeColor');
const dirNav   = $('directoryNav');
const dirBtn   = $('directoryButton');

const DAY_META   = '#f0e0b0';
const NIGHT_META = '#0d0900';
let themeMode = 'auto';

function isNightHour() { const h = new Date().getHours(); return h >= 19 || h < 6; }

function applyTheme(night) {
  document.documentElement.dataset.theme = night ? 'night' : 'day';
  if (metaTag) metaTag.content = night ? NIGHT_META : DAY_META;
}

function updateBtn() {
  const night = document.documentElement.dataset.theme === 'night';
  togBtn.textContent = `${night ? '☾' : '☀'} ${night ? 'NIGHT' : 'DAY'} — ${themeMode === 'auto' ? 'AUTO' : 'MANUAL'}`;
  togBtn.setAttribute('aria-pressed', String(night));
}

function syncAuto() { if (themeMode === 'auto') { applyTheme(isNightHour()); updateBtn(); } }

function loadTheme() {
  const saved = localStorage.getItem('cwn60s_theme');
  if (saved === 'night' || saved === 'day') { themeMode = 'manual'; applyTheme(saved === 'night'); }
  else { themeMode = 'auto'; applyTheme(isNightHour()); }
  updateBtn();
}

togBtn.addEventListener('click', () => {
  const night = document.documentElement.dataset.theme === 'night';
  themeMode = 'manual';
  applyTheme(!night);
  localStorage.setItem('cwn60s_theme', !night ? 'night' : 'day');
  updateBtn();
});
togBtn.addEventListener('dblclick', e => {
  e.preventDefault();
  themeMode = 'auto';
  localStorage.removeItem('cwn60s_theme');
  applyTheme(isNightHour());
  updateBtn();
});
setInterval(syncAuto, 60_000);

function clock() {
  timeEl.textContent = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
}

function loadRadar() {
  radarSt.textContent = 'Loading radar…';
  radarImg.src = getRadarUrl() + '?t=' + Date.now();
}
radarImg.onload  = () => { radarSt.textContent = 'Radar updated ' + new Date().toLocaleTimeString('en-US',{ hour:'2-digit', minute:'2-digit' }); };
radarImg.onerror = () => { radarSt.textContent = 'Radar image unavailable.'; };

const PX_PER_SEC = 90;
function setTicker(alerts) {
  const active = (alerts || []).filter(isActiveAlert);
  if (!active.length) { ticker.hidden = true; tickTrk.textContent = ''; return; }
  ticker.hidden = false;
  tickLbl.textContent = worstLabel(active);
  const segment = active.map(a =>
    `${(a.event || 'WEATHER ALERT').toUpperCase()} — ${(a.headline || a.event || '').trim()}`
  ).join('     ⚠     ') + '     ⚠     ';
  tickTrk.textContent = segment + segment;
  tickTrk.style.animationDuration = Math.max(14, (segment.length * 9) / PX_PER_SEC) + 's';
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderPeriods(periods) {
  if (!periods?.length) { fcastEl.innerHTML = '<div class="icon-card" role="listitem">Forecast unavailable</div>'; return; }
  fcastEl.innerHTML = periods.slice(0,6).map(p => {
    const rain = p.probabilityOfPrecipitation?.value ?? p.precip_pct ?? '--';
    return `
      <article class="icon-card" role="listitem">
        <div class="period-name">${esc(p.name ?? '—')}</div>
        <span class="wx-icon" aria-hidden="true">${wxIcon(p.shortForecast ?? '')}</span>
        <div class="period-temp">${p.temperature ?? '--'}°${p.temperatureUnit ?? 'F'}</div>
        <div class="period-desc">${esc(p.shortForecast ?? '')}</div>
        <div class="period-rain">Rain: ${rain}%</div>
      </article>`;
  }).join('');
}

function renderInline(alerts) {
  if (!alerts?.length) { inlineEl.innerHTML = ''; return; }
  inlineEl.innerHTML = alerts.map(a => `
    <div class="alert-inline-row">
      <div class="alert-event">${esc((a.event||'Alert').toUpperCase())}</div>
      <div>${esc((a.headline||a.event||'').slice(0,140))}</div>
    </div>`).join('');
}

async function load(cityName) {
  if (!cityName) return;
  statusEl.textContent = 'Loading live forecast…';
  inlineEl.innerHTML = ''; ticker.hidden = true; fcastEl.innerHTML = '';
  try {
    const { lat, lon } = await getCityCoords(cityName);
    const [cond, alerts, periods] = await Promise.all([
      getConditions(lat, lon), getAlerts(lat, lon), fetchNWSPeriods(lat, lon, 6),
    ]);
    const icon = wxIcon(cond.description ?? '');
    $('currentIconBox').innerHTML = `<span class="current-live-symbol" aria-hidden="true">${icon}</span>`;
    $('cwnTemp').textContent =
  cond.temp_f != null
    ? `${Math.round(cond.temp_f)}°F`
    : '--°F';
    $('cwnWind').textContent =
  cond.wind_speed_mph != null
    ? `Wind: ${Math.round(cond.wind_speed_mph)} mph ${cond.wind_direction || ''}`
    : 'Wind: -- mph';
    $('cwnDesc').textContent = cond.description ?? '--';
    statusEl.textContent = `Live data for ${cityName} · Updated ${new Date().toLocaleTimeString('en-US',{ hour:'2-digit', minute:'2-digit' })}`;
    renderPeriods(periods); setTicker(alerts); renderInline(alerts);
  } catch (err) {
    console.error('[CWN 60s]', err);
    statusEl.textContent = 'Weather data unavailable — please try again.';
    fcastEl.innerHTML = '<div class="icon-card" role="listitem">Forecast unavailable</div>';
  }
}

async function fillCities() {
  try {
    const res = await fetch('./api/cities.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let html = '<option value="">— Select City —</option>';
    for (const county of Object.keys(data).sort()) {
      html += `<optgroup label="${esc(county)}">`;
      for (const city of Object.keys(data[county]).sort())
        html += `<option value="${esc(city)}">${esc(city)}, TN</option>`;
      html += '</optgroup>';
    }
    sel.innerHTML = html;
  } catch (err) {
    console.error('[CWN 60s] fillCities:', err);
    sel.innerHTML = '<option value="">— City list unavailable —</option>';
  }
  const saved = localStorage.getItem('cwn_city');
  if (saved) { sel.value = saved; if (!sel.value) localStorage.removeItem('cwn_city'); }
}

sel.addEventListener('change', () => { const c = sel.value; if (!c) return; localStorage.setItem('cwn_city', c); load(c); });

dirBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = dirNav.classList.toggle('open');
  dirBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', () => { dirNav.classList.remove('open'); dirBtn.setAttribute('aria-expanded','false'); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && dirNav.classList.contains('open')) {
    dirNav.classList.remove('open'); dirBtn.setAttribute('aria-expanded','false'); dirBtn.focus();
  }
});

loadTheme();
clock();     setInterval(clock,      1_000);
loadRadar(); setInterval(loadRadar, 300_000);
setInterval(() => { const c = sel.value; if (c) load(c); }, 600_000);
fillCities().then(() => { const c = sel.value; if (c) load(c); });

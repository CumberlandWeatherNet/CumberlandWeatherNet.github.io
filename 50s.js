/**
 * Cumberland Weather Network — 1950s TV Broadcast Edition
 * 50s.js — Full broadcast engine
 *
 * Responsibilities:
 *  · Auto-scale 1920×1080 to any viewport (scaleToFit)
 *  · Day / Night theme toggle (cwn50s_theme)
 *  · City select + persistent localStorage (cwn_city)
 *  · Channel system: Conditions → Forecast → Radar → Emergency
 *  · Auto slideshow with smooth fade transitions
 *  · Seamless scrolling ticker (no hard resets)
 *  · Live weather data via cwn-heart-full.js
 *  · City radar zoom marker
 *  · 4-voice AI announcer system (Web Speech API)
 *  · Weather Window scheduling (every :05/:15/:25/:35/:45/:55)
 *  · Sign-on (6:30 AM) / sign-off (8:00 PM) broadcasts
 *  · Emergency alert override (all channels)
 *  · Drag-and-drop music playlist
 *  · TV noise canvas effect
 *  · Directory nav dropdown
 */

import {
  getCityCoords,
  getConditions,
  getAlerts,
  getRadarUrl,
  fetchNWSPeriods,
} from './core/cwn-heart-full.js';

/* ══════════════════════════════════════════════════════
   SCALE TO FIT — 1920×1080 base, auto-centers
══════════════════════════════════════════════════════ */
const NATIVE_W = 1920, NATIVE_H = 1080;

function scaleToFit() {
  const wrapper = document.getElementById('scaleWrapper');
  const s = Math.min(window.innerWidth / NATIVE_W, window.innerHeight / NATIVE_H);
  const offsetX = (window.innerWidth  - NATIVE_W * s) / 2;
  const offsetY = (window.innerHeight - NATIVE_H * s) / 2;
  wrapper.style.transform       = `scale(${s})`;
  wrapper.style.transformOrigin = 'top left';
  wrapper.style.left            = `${offsetX}px`;
  wrapper.style.top             = `${offsetY}px`;
}
window.addEventListener('resize', scaleToFit);
scaleToFit();

/* ══════════════════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const citySelect    = $('cwnCitySelect');
const themeTogBtn   = $('themeToggle');
const themeMetaTag  = $('themeColor');
const dirNav        = $('directoryNav');
const dirBtn        = $('directoryButton');
const channelDial   = $('channelDial');
const dialPointer   = $('dialPointer');
const autoBtn       = $('autoBtn');
const noiseCanvas   = $('noiseCanvas');
const musicZone     = $('musicZone');
const mzStatus      = $('mzStatus');
const tickerTrack   = $('tickerTrack');
const tickerBadge   = $('tickerBadge');
const announcerPlate= $('announcerPlate');
const apName        = $('apName');
const bgMusic       = $('bgMusic');
const alertAudio    = $('alertAudio');

/* ══════════════════════════════════════════════════════
   CHANNEL SYSTEM
══════════════════════════════════════════════════════ */
const CHANNELS = ['ch-current','ch-forecast','ch-radar'];
let currentChannel   = 0;
let autoPlay         = true;
let autoTimer        = null;
const SLIDE_DURATION = 18_000; // 18 s per channel

/* Dial rotation angles per channel */
const DIAL_ANGLES = { 0: -40, 1: 0, 2: 40 };

function switchChannel(idx, fromAuto = false) {
  if (idx < 0) idx = CHANNELS.length - 1;
  if (idx >= CHANNELS.length) idx = 0;

  // During emergency hide auto slideshow, show emergency instead
  if (activeEmergency && idx !== 3) idx = 3;

  const prev = document.querySelector('.channel.active');
  const next = document.getElementById(idx === 3 ? 'ch-emergency' : CHANNELS[idx]);
  if (!next || next === prev) return;

  if (prev) prev.classList.remove('active');
  next.classList.add('active');
  currentChannel = idx === 3 ? currentChannel : idx;

  // Update dial
  if (idx !== 3) {
    dialPointer.style.transform = `translateX(-50%) rotate(${DIAL_ANGLES[idx]}deg)`;
    channelDial.setAttribute('aria-valuenow', idx);
    document.querySelectorAll('.ch-btn').forEach((b, i) =>
      b.classList.toggle('active', i === idx));
  }

  if (!fromAuto) resetAutoTimer();
}

function resetAutoTimer() {
  clearTimeout(autoTimer);
  if (autoPlay && !activeEmergency) {
    autoTimer = setTimeout(() => {
      switchChannel(currentChannel + 1, true);
    }, SLIDE_DURATION);
  }
}

autoBtn.addEventListener('click', () => {
  autoPlay = !autoPlay;
  autoBtn.classList.toggle('active', autoPlay);
  resetAutoTimer();
});

channelDial.addEventListener('click', () => {
  switchChannel(activeEmergency ? currentChannel : currentChannel + 1);
});

document.querySelectorAll('.ch-btn').forEach(btn => {
  btn.addEventListener('click', () => switchChannel(+btn.dataset.ch));
});

/* ══════════════════════════════════════════════════════
   WEATHER ICON MAPPER
══════════════════════════════════════════════════════ */
function wxIcon(desc = '') {
  const d = desc.toLowerCase();
  if (d.includes('tornado'))                                                  return '🌪';
  if (d.includes('thunder') || d.includes('tstm') || d.includes('storm'))   return '⛈';
  if (d.includes('snow') || d.includes('blizzard') || d.includes('sleet'))  return '❄';
  if (d.includes('freez') || d.includes('ice'))                              return '🧊';
  if (d.includes('fog') || d.includes('mist') || d.includes('haze'))        return '🌫';
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle'))  return '🌧';
  if (d.includes('wind') || d.includes('breezy') || d.includes('gusty'))    return '💨';
  if (d.includes('overcast') || d.includes('mostly cloudy'))                 return '☁';
  if (d.includes('partly') || d.includes('partly sunny'))                   return '⛅';
  if (d.includes('clear') || d.includes('sunny'))                            return '☀';
  if (d.includes('cloud'))                                                   return '🌤';
  return '🌡';
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function trunc(s, n=90) { return s.length > n ? s.slice(0,n-1)+'…' : s }

/* ══════════════════════════════════════════════════════
   LIVE WEATHER DATA
══════════════════════════════════════════════════════ */
let lastConditions = null;
let lastAlerts     = [];
let lastPeriods    = [];
let lastCity       = '';
let activeEmergency= false;

async function loadWeather(cityName) {
  if (!cityName) return;
  lastCity = cityName;

  $('condStatus').textContent  = 'Loading live data…';
  $('fcstStatus').textContent  = 'Loading forecast…';
  $('radarStatus').textContent = 'Loading radar…';
  $('condCity').textContent    = cityName.toUpperCase();
  $('fcstCity').textContent    = cityName.toUpperCase();

  try {
    const { lat, lon } = await getCityCoords(cityName);
    const [cond, alerts, periods] = await Promise.all([
      getConditions(lat, lon),
      getAlerts(lat, lon),
      fetchNWSPeriods(lat, lon, 6),
    ]);

    lastConditions = cond;
    lastAlerts     = alerts || [];
    lastPeriods    = periods || [];

    renderConditions(cond, alerts);
    renderForecast(periods);
    renderAlerts(alerts);
    updateRadarMarker(lat, lon, cityName);
    buildTickerContent();

    $('condStatus').textContent  = `Live data · ${cityName} · ${new Date().toLocaleTimeString()}`;
    $('fcstStatus').textContent  = `6-period outlook · ${cityName}`;
    $('radarStatus').textContent = 'KOHX Nashville · Auto-refreshes every 5 min';

    // Announce update
    scheduleAnnouncement('weather_update');

  } catch(err) {
    console.error('[CWN 50s] loadWeather:', err);
    $('condStatus').textContent = 'Weather service unavailable — retrying…';
  }
}

function renderConditions(cond, alerts) {
  if (!cond) return;
  $('condSymbol').textContent = wxIcon(cond.description || '');
  $('condTemp').textContent   = `${cond.temp_f ?? '--'}°F`;
  $('condDesc').textContent   = cond.description || 'No description';
  $('condWind').textContent   = `${cond.wind_mph ?? '--'} mph`;
  $('condHum').textContent    = cond.humidity != null ? `${cond.humidity}%` : '--%';
  $('condVis').textContent    = cond.visibility_mi != null ? `${cond.visibility_mi} mi` : '-- mi';
  $('condDew').textContent    = cond.dewpoint_f != null ? `${cond.dewpoint_f}°F` : '--°F';
  $('condPrecip').textContent = cond.precip_pct != null ? `${cond.precip_pct}%` : '--%';
  $('condUpdate').textContent = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
}

function renderForecast(periods) {
  const grid = $('forecastGrid');
  if (!periods?.length) {
    grid.innerHTML = '<div class="fcst-placeholder">No forecast available</div>';
    return;
  }
  grid.innerHTML = periods.slice(0, 6).map(p => {
    const rain = p.probabilityOfPrecipitation?.value ?? p.precip_pct ?? '--';
    return `<article class="fcst-card">
      <div class="fcst-period">${esc(p.name || '—')}</div>
      <div class="fcst-icon">${wxIcon(p.shortForecast || '')}</div>
      <div class="fcst-temp">${p.temperature ?? '--'}°${p.temperatureUnit ?? 'F'}</div>
      <div class="fcst-desc">${esc(p.shortForecast || '')}</div>
      <div class="fcst-rain">☂ ${rain}%</div>
    </article>`;
  }).join('');
}

function renderAlerts(alerts) {
  const box = $('condAlerts');
  const hasAlerts = alerts?.length > 0;

  // Emergency channel
  activeEmergency = hasAlerts && alerts.some(a =>
    a.severity === 'Extreme' || a.severity === 'Severe' ||
    (a.event || '').toLowerCase().includes('warning') ||
    (a.event || '').toLowerCase().includes('tornado') ||
    (a.event || '').toLowerCase().includes('emergency')
  );

  if (activeEmergency) {
    const emgBody = $('emgBody');
    const worst = alerts.find(a => a.severity === 'Extreme' || a.severity === 'Severe') || alerts[0];
    $('emgTitle').textContent = (worst.event || 'WEATHER ALERT').toUpperCase();
    $('emgRadar').src = getRadarUrl() + '?t=' + Date.now();
    emgBody.innerHTML = alerts.map(a => `
      <div class="emg-entry">
        <div class="emg-event">${esc((a.event || '').toUpperCase())}</div>
        <div class="emg-detail">${esc(trunc(a.headline || a.event || '', 180))}</div>
      </div>`).join('');
    switchChannel(3);
    tickerBadge.textContent = '⚠ ALERT';
    tickerBadge.style.background = '#e05030';
    tickerBadge.style.color = '#fff';
    scheduleAnnouncement('emergency');
  } else {
    if (document.querySelector('#ch-emergency.active')) switchChannel(0);
    tickerBadge.textContent = '⚡ CWN';
    tickerBadge.style.background = '#d4a020';
    tickerBadge.style.color = '#0d0800';
  }

  // Inline alert rows on conditions channel
  box.innerHTML = alerts?.slice(0,3).map(a =>
    `<div class="cond-alert-row">⚠ ${esc((a.event||'').toUpperCase())}</div>`
  ).join('') || '';
}

/* ══════════════════════════════════════════════════════
   RADAR
══════════════════════════════════════════════════════ */
function loadRadar() {
  const url = getRadarUrl() + '?t=' + Date.now();
  $('radarImg').src   = url;
  $('emgRadar').src   = url;
}

/* City marker on radar — simplified lat/lon → pixel mapping for KOHX loop image */
function updateRadarMarker(lat, lon, city) {
  const marker  = $('radarMarker');
  const wrapper = document.querySelector('.radar-window-wrap');
  $('rciVal').textContent = city;
  $('markerLbl').textContent = city;

  // KOHX Nashville image approximate bounds
  const latMin=34.5, latMax=37.5, lonMin=-88.5, lonMax=-85.5;
  const xPct = ((lon - lonMin) / (lonMax - lonMin)) * 100;
  const yPct = (1 - (lat - latMin) / (latMax - latMin)) * 100;

  if (xPct >= 0 && xPct <= 100 && yPct >= 0 && yPct <= 100) {
    marker.style.display = 'block';
    marker.style.left    = `${xPct}%`;
    marker.style.top     = `${yPct}%`;
  } else {
    marker.style.display = 'none';
  }
}

/* ══════════════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════════════ */
function updateClock() {
  const now = new Date();
  $('screenClock').textContent = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  $('screenDate').textContent  = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }).toUpperCase();
}

/* ══════════════════════════════════════════════════════
   SEAMLESS TICKER
══════════════════════════════════════════════════════ */
let tickerData = [
  'CUMBERLAND WEATHER NETWORK — MIDDLE TENNESSEE REGIONAL WEATHER',
  'Select a city above to load live weather data',
];
let tickerAnimationId = null;

function setTickerContent(segments) {
  const sep = '   ✦   ';
  const full = segments.join(sep) + sep;
  const doubled = full + full; // seamless loop
  tickerTrack.textContent = doubled;

  // Calculate duration based on content length
  const charCount = full.length;
  const duration  = Math.max(20, charCount * 0.28); // ~0.28s per char
  tickerTrack.style.animationDuration = `${duration}s`;
}

function buildTickerContent() {
  const segments = [];
  const now = new Date();
  segments.push(`✦ CUMBERLAND WEATHER NETWORK — MIDDLE TENNESSEE ✦`);
  segments.push(`${now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} CDT`);

  if (lastCity) segments.push(`SELECTED CITY: ${lastCity.toUpperCase()}`);

  if (lastConditions) {
    segments.push(
      `CURRENT: ${lastConditions.temp_f ?? '--'}°F · ${lastConditions.description ?? '--'}`,
      `WIND: ${lastConditions.wind_mph ?? '--'} MPH`,
      `HUMIDITY: ${lastConditions.humidity ?? '--'}%`
    );
  }

  if (lastPeriods?.length) {
    lastPeriods.slice(0,3).forEach(p => {
      segments.push(`${(p.name||'').toUpperCase()}: ${p.temperature ?? '--'}°${p.temperatureUnit||'F'} — ${p.shortForecast||''}`);
    });
  }

  if (lastAlerts?.length) {
    lastAlerts.forEach(a => {
      segments.push(`⚠ ALERT: ${(a.event||'').toUpperCase()} IN EFFECT FOR MIDDLE TENNESSEE`);
    });
  }

  segments.push('DATA SOURCE: NATIONAL WEATHER SERVICE — NWS NASHVILLE');
  setTickerContent(segments);
}

/* ══════════════════════════════════════════════════════
   AI VOICE ANNOUNCERS — Web Speech API
   4 personalities scheduled in shifts
══════════════════════════════════════════════════════ */
const ANNOUNCERS = [
  { name: 'Earl Henderson',  title: 'Chief Meteorologist',    voiceName: 'Google US English',    gender:'male',   pitch:0.88, rate:0.90 },
  { name: 'Walter Grayson',  title: 'Weekend Meteorologist',  voiceName: 'Alex',                 gender:'male',   pitch:0.92, rate:0.88 },
  { name: 'Barbara Collins', title: 'Weather Correspondent',  voiceName: 'Google US English Female', gender:'female', pitch:1.08, rate:0.94 },
  { name: 'Dorothy Sinclair',title: 'Forecast Specialist',    voiceName: 'Samantha',             gender:'female', pitch:1.12, rate:0.92 },
];

let currentAnnouncer = 0;
let isSpeaking       = false;
let voicesLoaded     = false;
let cachedVoices     = [];

function loadVoices() {
  cachedVoices = speechSynthesis.getVoices();
  voicesLoaded = true;
}
speechSynthesis.addEventListener('voiceschanged', loadVoices);
loadVoices();

function getVoice(announcer) {
  if (!cachedVoices.length) cachedVoices = speechSynthesis.getVoices();
  const pref = announcer.voiceName.toLowerCase();
  return cachedVoices.find(v => v.name.toLowerCase().includes(pref.split(' ')[0]))
    || cachedVoices.find(v => v.lang === 'en-US')
    || cachedVoices[0] || null;
}

function speak(text, announcer, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return; }
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.voice = getVoice(announcer);
  utt.pitch = announcer.pitch;
  utt.rate  = announcer.rate;
  utt.volume= getVolume();
  utt.onend = () => { isSpeaking = false; hideAnnouncerPlate(); onEnd?.() };
  isSpeaking = true;
  showAnnouncerPlate(announcer);
  speechSynthesis.speak(utt);
}

function showAnnouncerPlate(a) {
  apName.textContent = a.name;
  document.querySelector('.ap-title').textContent = a.title;
  announcerPlate.style.display = 'block';
}
function hideAnnouncerPlate() { announcerPlate.style.display = 'none'; }

/* Shift logic — each announcer serves 3-hour shifts */
function getShiftAnnouncer() {
  const h = new Date().getHours();
  if (h >= 6  && h < 9)  return 0; // Earl
  if (h >= 9  && h < 12) return 2; // Barbara
  if (h >= 12 && h < 15) return 1; // Walter
  if (h >= 15 && h < 18) return 3; // Dorothy
  if (h >= 18 && h < 20) return 0; // Earl evening
  return 0;
}

/* ── Randomized Script Bank ── */
const SCRIPT_BANK = {
  weather_update: (a, city, cond, periods) => {
    const temp  = cond?.temp_f ?? '--';
    const desc  = cond?.description ?? 'conditions unknown';
    const next  = periods?.[0];
    const variants = [
      `Good ${timeOfDay()} Middle Tennessee. I'm ${a.name}. We're looking at ${temp} degrees and ${desc} ${city ? 'in ' + city : ''}. ${next ? 'Heading into ' + next.name + ', expect ' + next.shortForecast + ' with a high of ' + next.temperature + ' degrees.' : ''}`,
      `This is ${a.name} at Cumberland Weather Network. Current readings show ${temp} degrees, ${desc}. ${next ? 'Your ' + next.name + ' forecast: ' + next.shortForecast + '.' : 'Stay tuned for your full outlook.'}`,
      `Middle Tennessee weather update from ${a.name}. Temperatures are sitting at ${temp} degrees with ${desc}. ${next ? next.name + ' brings ' + next.shortForecast + '.' : 'Watch this broadcast for your complete forecast.'}`,
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  },
  weather_window: (a, city, cond, periods) => {
    const temp = cond?.temp_f ?? '--';
    const desc = cond?.description ?? 'conditions variable';
    const variants = [
      `It's your Weather Window on Cumberland Weather Network. ${a.name} here. Right now across Middle Tennessee, we're seeing ${temp} degrees and ${desc}. Full forecast in just a moment.`,
      `Weather Window time. ${a.name} reporting. The current temperature stands at ${temp} degrees. ${desc} is the story across the region today.`,
      `Your Cumberland Weather Window update — ${temp} degrees and ${desc} for Middle Tennessee as of this hour. I'm ${a.name} and we'll have your full regional outlook right after this.`,
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  },
  sign_on: (a) => [
    `Good morning Middle Tennessee and welcome to Cumberland Weather Network. I'm ${a.name} and we are on the air with your complete regional weather coverage for the day ahead. Stay with us.`,
    `Cumberland Weather Network is now on the air. Good morning, I'm ${a.name}. We'll have your latest conditions, your full forecast, and regional radar coverage all morning right here.`,
    `Rise and shine Middle Tennessee. This is ${a.name} at Cumberland Weather Network. We are live with complete weather coverage. Let's start with current conditions across the region.`,
  ][Math.floor(Math.random()*3)],
  sign_off: (a) => [
    `This is ${a.name} signing off for Cumberland Weather Network. Thank you for watching Middle Tennessee's weather authority. We'll be back at six thirty tomorrow morning. Goodnight.`,
    `And that wraps up our evening coverage here at Cumberland Weather Network. I'm ${a.name}. Stay safe Middle Tennessee, and we'll see you back here tomorrow morning at six thirty.`,
    `Cumberland Weather Network is signing off for the evening. From all of us here, I'm ${a.name} — thank you for trusting us with your weather. Goodnight Middle Tennessee.`,
  ][Math.floor(Math.random()*3)],
  emergency: (a, alerts) => {
    const worst = alerts?.[0];
    const event = worst?.event || 'Severe Weather';
    return [
      `ATTENTION. This is ${a.name} at Cumberland Weather Network with an urgent weather alert. A ${event} is now in effect for portions of Middle Tennessee. Please take immediate protective action and monitor this broadcast.`,
      `Cumberland Weather Network EMERGENCY ALERT. I'm ${a.name}. A ${event} warning has been issued for Middle Tennessee. This is not a drill. Seek shelter immediately.`,
      `BREAKING — ${a.name} at Cumberland Weather Network. The National Weather Service has issued a ${event} for Middle Tennessee. All residents should take cover immediately. We will keep you updated.`,
    ][Math.floor(Math.random()*3)];
  },
};

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function scheduleAnnouncement(type, delay = 600) {
  if (isSpeaking) return;
  const a = ANNOUNCERS[getShiftAnnouncer()];
  let text = '';
  if (type === 'weather_update') text = SCRIPT_BANK.weather_update(a, lastCity, lastConditions, lastPeriods);
  if (type === 'weather_window')  text = SCRIPT_BANK.weather_window(a, lastCity, lastConditions, lastPeriods);
  if (type === 'sign_on')         text = SCRIPT_BANK.sign_on(a);
  if (type === 'sign_off')        text = SCRIPT_BANK.sign_off(a);
  if (type === 'emergency')       text = SCRIPT_BANK.emergency(a, lastAlerts);
  if (!text) return;
  setTimeout(() => speak(text, a), delay);
}

/* ── Schedule sign-on / sign-off / weather windows ── */
function schedulerTick() {
  const now   = new Date();
  const h     = now.getHours();
  const m     = now.getMinutes();
  const s     = now.getSeconds();
  const onAir = h > 6 || (h === 6 && m >= 30);
  const onAirEnd = h < 20;

  // Sign-on 6:30 AM exactly
  if (h === 6 && m === 30 && s === 0) scheduleAnnouncement('sign_on', 1000);

  // Sign-off 8:00 PM exactly
  if (h === 20 && m === 0 && s === 0) scheduleAnnouncement('sign_off', 1000);

  // Weather Window every :05/:15/:25/:35/:45/:55 between 6:30am and 8pm
  if (onAir && onAirEnd && s === 0 && [5,15,25,35,45,55].includes(m)) {
    scheduleAnnouncement('weather_window', 500);
  }
}

/* ══════════════════════════════════════════════════════
   CITY SELECT
══════════════════════════════════════════════════════ */
async function fillCities() {
  try {
    const res  = await fetch('./api/cities.json');
    const data = await res.json();
    let html   = '<option value="">— Select City —</option>';
    for (const county of Object.keys(data).sort()) {
      html += `<optgroup label="${county}">`;
      for (const city of Object.keys(data[county]).sort())
        html += `<option value="${city}">${city}, TN</option>`;
      html += '</optgroup>';
    }
    citySelect.innerHTML = html;
    const saved = localStorage.getItem('cwn_city');
    if (saved) citySelect.value = saved;
  } catch(e) {
    citySelect.innerHTML = '<option value="">City list unavailable</option>';
  }
}

citySelect.addEventListener('change', () => {
  const c = citySelect.value;
  if (!c) return;
  localStorage.setItem('cwn_city', c);
  loadWeather(c);
});

/* ══════════════════════════════════════════════════════
   DAY / NIGHT THEME
══════════════════════════════════════════════════════ */
const DAY_META   = '#2a1804';
const NIGHT_META = '#050505';
let themeMode    = 'auto';

function isNightHour() { const h = new Date().getHours(); return h >= 20 || h < 6 }

function applyTheme(night) {
  document.documentElement.dataset.theme = night ? 'night' : 'day';
  if (themeMetaTag) themeMetaTag.content = night ? NIGHT_META : DAY_META;
}
function updateThemeBtn() {
  const night = document.documentElement.dataset.theme === 'night';
  themeTogBtn.textContent = `${night ? '☾' : '☀'} ${night ? 'NIGHT' : 'DAY'} — ${themeMode === 'auto' ? 'AUTO' : 'MANUAL'}`;
}
function syncAutoTheme() {
  if (themeMode === 'auto') { applyTheme(isNightHour()); updateThemeBtn(); }
}
function loadTheme() {
  const saved = localStorage.getItem('cwn50s_theme');
  themeMode = (saved === 'night' || saved === 'day') ? 'manual' : 'auto';
  applyTheme(themeMode === 'manual' ? saved === 'night' : isNightHour());
  updateThemeBtn();
}
themeTogBtn.addEventListener('click', () => {
  const night = document.documentElement.dataset.theme === 'night';
  themeMode = 'manual';
  applyTheme(!night);
  localStorage.setItem('cwn50s_theme', !night ? 'night' : 'day');
  updateThemeBtn();
});
themeTogBtn.addEventListener('dblclick', e => {
  e.preventDefault();
  themeMode = 'auto';
  localStorage.removeItem('cwn50s_theme');
  syncAutoTheme();
});
setInterval(syncAutoTheme, 60_000);

/* ══════════════════════════════════════════════════════
   VOLUME KNOB — drag
══════════════════════════════════════════════════════ */
let volLevel = 0.5;
const volKnob    = $('volKnob');
const volReadout = $('volReadout');
let dragStartY = null, dragStartVol = null;

volKnob.addEventListener('mousedown', e => {
  dragStartY   = e.clientY;
  dragStartVol = volLevel;
  document.addEventListener('mousemove', onVolDrag);
  document.addEventListener('mouseup',   onVolUp);
});
function onVolDrag(e) {
  const delta = (dragStartY - e.clientY) / 120;
  volLevel = Math.max(0, Math.min(1, dragStartVol + delta));
  volReadout.textContent = Math.round(volLevel * 100) + '%';
  if (bgMusic) bgMusic.volume = volLevel;
}
function onVolUp() {
  document.removeEventListener('mousemove', onVolDrag);
  document.removeEventListener('mouseup',   onVolUp);
}
function getVolume() { return volLevel }

/* ══════════════════════════════════════════════════════
   MUSIC DRAG & DROP PLAYLIST
══════════════════════════════════════════════════════ */
const playlist = [];
let currentTrack = 0;

musicZone.addEventListener('dragover',  e => { e.preventDefault(); musicZone.classList.add('drag-over') });
musicZone.addEventListener('dragleave', () => musicZone.classList.remove('drag-over'));
musicZone.addEventListener('drop', e => {
  e.preventDefault();
  musicZone.classList.remove('drag-over');
  const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('audio/'));
  if (!files.length) { mzStatus.textContent = 'No audio files'; return; }
  files.forEach(f => playlist.push(URL.createObjectURL(f)));
  mzStatus.textContent = `${playlist.length} track${playlist.length!==1?'s':''}`;
  shufflePlaylist();
  if (!bgMusic.src || bgMusic.paused) playNextTrack();
});

musicZone.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true; input.accept = 'audio/*';
  input.onchange = e => {
    const files = [...e.target.files];
    files.forEach(f => playlist.push(URL.createObjectURL(f)));
    mzStatus.textContent = `${playlist.length} track${playlist.length!==1?'s':''}`;
    shufflePlaylist();
    if (!bgMusic.src || bgMusic.paused) playNextTrack();
  };
  input.click();
});

function shufflePlaylist() {
  for (let i = playlist.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
  }
  currentTrack = 0;
}
function playNextTrack() {
  if (!playlist.length) return;
  bgMusic.src    = playlist[currentTrack % playlist.length];
  bgMusic.volume = volLevel;
  bgMusic.play().catch(() => {});
  currentTrack++;
}
bgMusic.addEventListener('ended', () => {
  if (currentTrack >= playlist.length) shufflePlaylist();
  playNextTrack();
});

/* ══════════════════════════════════════════════════════
   TV NOISE CANVAS
══════════════════════════════════════════════════════ */
function initNoise() {
  const ctx = noiseCanvas.getContext('2d');
  noiseCanvas.width  = 1280;
  noiseCanvas.height = 900;

  let lastNoise = 0;
  function drawNoise(ts) {
    if (ts - lastNoise > 80) { // ~12fps noise update
      lastNoise = ts;
      const img = ctx.createImageData(noiseCanvas.width, noiseCanvas.height);
      const d   = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() > 0.5 ? 255 : 0;
        d[i] = d[i+1] = d[i+2] = v;
        d[i+3] = Math.random() * 18; // very faint
      }
      ctx.putImageData(img, 0, 0);
    }
    requestAnimationFrame(drawNoise);
  }
  requestAnimationFrame(drawNoise);
}

/* ══════════════════════════════════════════════════════
   DIRECTORY NAV
══════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════ */
async function boot() {
  loadTheme();
  updateClock(); setInterval(updateClock, 1_000);
  setInterval(schedulerTick, 1_000);
  initNoise();
  buildTickerContent();
  loadRadar();
  setInterval(loadRadar, 300_000);

  await fillCities();
  const savedCity = localStorage.getItem('cwn_city');
  if (savedCity && citySelect.value) {
    await loadWeather(savedCity);
  }

  resetAutoTimer();

  // Refresh weather every 10 min
  setInterval(() => {
    const c = citySelect.value;
    if (c) loadWeather(c);
  }, 600_000);

  // Check sign-on time on boot
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  if (h === 6 && m === 30) scheduleAnnouncement('sign_on', 2000);

  console.log('[CWN 50s] Broadcast system online.');
}

boot().catch(err => console.error('[CWN 50s] Boot error:', err));

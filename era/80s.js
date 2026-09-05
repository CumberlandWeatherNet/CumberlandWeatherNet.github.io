// HEART + WX + MT integration for 1980s page

// From mobile master reference (WX + MT) 
const WX = {
  0: ['Clear', 'sunny'],
  1: ['Mostly clear', 'sunny'],
  2: ['Partly cloudy', 'cloudy'],
  3: ['Overcast', 'cloudy'],
  45: ['Fog', 'cloudy'],
  48: ['Freezing fog', 'cloudy'],
  51: ['Light drizzle', 'rain'],
  53: ['Drizzle', 'rain'],
  55: ['Heavy drizzle', 'rain'],
  56: ['Freezing drizzle', 'rain'],
  57: ['Freezing drizzle', 'rain'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'],
  81: ['Rain showers', 'rain'],
  82: ['Heavy showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Heavy snow', 'snow'],
  95: ['Thunderstorms', 'storm'],
  96: ['Storms with hail', 'storm'],
  99: ['Severe storms', 'storm']
};

const MT = {
  Bedford: ['Bell Buckle', 'Normandy', 'Shelbyville', 'Wartrace'],
  Cannon: ['Auburntown', 'Woodbury'],
  Cheatham: ['Ashland City', 'Kingston Springs', 'Pegram', 'Pleasant View'],
  Clay: ['Celina'],
  Coffee: ['Manchester', 'Tullahoma'],
  Cumberland: ['Crab Orchard', 'Crossville'],
  Davidson: ['Belle Meade', 'Goodlettsville', 'Nashville'],
  // …continue MT registry as in master reference
};

// Persistent keys
const CITY_KEY = 'cwn_city';
const THEME_KEY = 'cwn_themeMode';

// Simple HEART fetch (you can wire this to your real endpoint)
async function fetchHeartData(cityName) {
  // Example: /api/heart?city=Lebanon
  const res = await fetch(`/api/heart?city=${encodeURIComponent(cityName)}`);
  if (!res.ok) throw new Error('HEART fetch failed');
  return res.json();
}

// Radar URL from HEART (regional_radar scene) 
function getRadarUrl(core) {
  return core.radar_url || core.regional_radar_url || '';
}

// Theme handling: auto + manual + persistent
function getStoredThemeMode() {
  return localStorage.getItem(THEME_KEY) || 'auto';
}

function setStoredThemeMode(mode) {
  localStorage.setItem(THEME_KEY, mode);
}

function applyTheme(mode, dayPeriod) {
  const body = document.body;
  let effective = mode;

  if (mode === 'auto') {
    effective = dayPeriod === 'night' ? 'night' : 'day';
  }

  body.setAttribute('data-theme', effective);
  document.documentElement.setAttribute('data-theme', effective);

  const label = document.getElementById('themeStateLabel');
  if (label) {
    label.textContent = mode.toUpperCase();
  }
}

function fadeTheme(mode, dayPeriod) {
  const wrapper = document.getElementById('scaleWrapper');
  if (!wrapper) return;
  wrapper.style.transition = 'background 400ms ease-in-out, color 400ms ease-in-out';
  applyTheme(mode, dayPeriod);
}

// City persistence
function getStoredCity() {
  return localStorage.getItem(CITY_KEY) || '';
}

function setStoredCity(city) {
  localStorage.setItem(CITY_KEY, city);
}

// Populate city selector from API/MT
async function populateCitySelector() {
  const selector = document.getElementById('citySelector');
  if (!selector) return;

  // If you already have /api/cities.json, use that; otherwise build from MT
  try {
    const res = await fetch('/api/cities.json');
    if (res.ok) {
      const cities = await res.json();
      fillSelectorFromCities(selector, cities);
    } else {
      fillSelectorFromMT(selector);
    }
  } catch {
    fillSelectorFromMT(selector);
  }

  const storedCity = getStoredCity();
  if (storedCity) {
    selector.value = storedCity;
  }

  selector.addEventListener('change', () => {
    const value = selector.value;
    if (value) {
      setStoredCity(value);
      loadPageForCity(value);
    }
  });
}

function fillSelectorFromCities(selector, cities) {
  selector.innerHTML = '<option value="">Select a City</option>';
  cities.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city.display_name || city.name;
    opt.textContent = city.display_name || city.name;
    selector.appendChild(opt);
  });
}

function fillSelectorFromMT(selector) {
  selector.innerHTML = '<option value="">Select a City</option>';
  Object.keys(MT).forEach(county => {
    const group = document.createElement('optgroup');
    group.label = `${county} County`;
    MT[county].forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      group.appendChild(opt);
    });
    selector.appendChild(group);
  });
}

// Fill UI from HEART core
function renderHeart(core) {
  // Current conditions
  document.getElementById('conditionsLocation').textContent =
    `${core.city_display || core.city_name || 'Middle Tennessee'}`;

  document.getElementById('tempValue').textContent =
    `${Math.round(core.temperature_2m_f || core.temp_f || 0)}°F`;

  if (core.apparent_temperature) {
    document.getElementById('feelsLikeValue').textContent =
      `Feels like ${Math.round(core.apparent_temperature)}°F`;
  }

  const iconCode = core.weather_code;
  const [condText, condClass] = WX[iconCode] || ['Unknown', 'cloudy'];
  document.getElementById('condText').textContent = condText;

  const iconEl = document.getElementById('condIcon');
  iconEl.className = `cond-icon wx-${condClass}`;

  document.getElementById('windText').textContent =
    `Wind: ${Math.round(core.wind_speed_10m_mph || core.wind_mph || 0)} mph ${core.wind_direction || ''}`;

  document.getElementById('humidityText').textContent =
    `Humidity: ${Math.round(core.humidity_2m || core.humidity || 0)}%`;

  document.getElementById('pressureText').textContent =
    `Pressure: ${Math.round(core.pressure_msl || core.pressure || 0)} hPa`;

  document.getElementById('obsTime').textContent =
    `Last update: ${core.local_time || core.obs_time || '--'}`;

  // Radar
  const radarUrl = getRadarUrl(core);
  const radarImg = document.getElementById('radarImage');
  if (radarUrl) {
    radarImg.src = radarUrl;
    document.getElementById('radarTime').textContent =
      `Radar: ${core.radar_time || core.local_time || '--'}`;
  }

  // Forecast tiles (extended_forecast scene) 
  const grid = document.getElementById('forecastGrid');
  grid.innerHTML = '';
  (core.extended_forecast || []).slice(0, 5).forEach(period => {
    const tile = document.createElement('div');
    tile.className = 'forecast-tile';

    const pLabel = document.createElement('div');
    pLabel.className = 'forecast-period';
    pLabel.textContent = period.name || period.period || '---';

    const pDesc = document.createElement('div');
    pDesc.className = 'forecast-desc';
    pDesc.textContent = period.description || period.summary || '';

    const pTemp = document.createElement('div');
    pTemp.className = 'forecast-temp';
    pTemp.textContent = `${Math.round(period.temp_high_f || period.high_f || 0)}° / ${Math.round(period.temp_low_f || period.low_f || 0)}°`;

    tile.appendChild(pLabel);
    tile.appendChild(pDesc);
    tile.appendChild(pTemp);
    grid.appendChild(tile);
  });

  // Alerts
  const alertsCard = document.getElementById('alertsCard');
  const alertsBody = document.getElementById('alertsBody');
  alertsBody.innerHTML = '';
  const alerts = core.active_alerts || [];
  if (alerts.length) {
    alertsCard.hidden = false;
    alerts.forEach(alert => {
      const div = document.createElement('div');
      div.className = 'alert-row';
      div.textContent = `${alert.type || alert.event}: ${alert.headline || alert.title || ''}`;
      alertsBody.appendChild(div);
    });
  } else {
    alertsCard.hidden = true;
  }

  // Clock
  updateClock(core.local_time);
}

// Clock (simple digital, homepage‑style)
function updateClock(localTime) {
  const clockEl = document.getElementById('cwnClock');
  if (!clockEl) return;

  if (localTime) {
    clockEl.textContent = localTime;
    return;
  }

  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  clockEl.textContent = `${h}:${m} ${ampm}`;
}

// Directory navigation
function wireDirectory() {
  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target === 'home') {
        window.location.href = '/index.html';
      } else if (target === '1994') {
        window.location.href = '/era/1994Severe.html';
      } else if (target === '80s') {
        // stay here
      }
    });
  });
}

// Theme toggle button
function wireThemeToggle(core) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = getStoredThemeMode();
    let next;
    if (current === 'auto') next = 'day';
    else if (current === 'day') next = 'night';
    else next = 'auto';

    setStoredThemeMode(next);
    fadeTheme(next, core.dayPeriod || core.day_period || 'day');
  });
}

// Load page for city
async function loadPageForCity(cityName) {
  try {
    const core = await fetchHeartData(cityName);
    const themeMode = getStoredThemeMode();
    fadeTheme(themeMode, core.dayPeriod || core.day_period || 'day');
    renderHeart(core);
    wireThemeToggle(core);
  } catch (e) {
    console.error(e);
  }
}

// Initial boot
document.addEventListener('DOMContentLoaded', async () => {
  wireDirectory();
  await populateCitySelector();

  const city = getStoredCity() || 'Lebanon';
  setStoredCity(city);
  await loadPageForCity(city);
});

// ------------------------------------------------------
// CONFIG — HEART + CITY REGISTRY
// ------------------------------------------------------

const HEART_BASE = "/api/heart";        // mission-critical HEART endpoint
const CITIES_URL = "/api/cities.json";  // unified city registry
const CITY_KEY = "cwn_city";


// ------------------------------------------------------
// HEART FETCH
// ------------------------------------------------------
async function fetchHeart(city) {
  const url = `${HEART_BASE}?city=${encodeURIComponent(city)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HEART fetch failed: ${res.status}`);
  }

  return await res.json();
}


// ------------------------------------------------------
// CITY LOADER — NO MT FALLBACK, NO HARDCODE
// ------------------------------------------------------
async function loadCities() {
  const selector = document.getElementById("citySelector");
  selector.innerHTML = '<option value="">Select a City</option>';

  try {
    const res = await fetch(CITIES_URL);
    if (!res.ok) throw new Error("cities.json missing");

    const data = await res.json();

    // Supports flat list or counties[]
    if (Array.isArray(data)) {
      const byCounty = {};

      data.forEach(rec => {
        const county = rec.county || "Middle Tennessee";
        if (!byCounty[county]) byCounty[county] = [];
        byCounty[county].push(rec);
      });

      Object.keys(byCounty).sort().forEach(county => {
        const group = document.createElement("optgroup");
        group.label = `${county} County`;

        byCounty[county].forEach(rec => {
          const opt = document.createElement("option");
          opt.value = rec.name;
          opt.textContent = rec.display_name || rec.name;
          group.appendChild(opt);
        });

        selector.appendChild(group);
      });

    } else if (Array.isArray(data.counties)) {
      data.counties.forEach(c => {
        const group = document.createElement("optgroup");
        group.label = `${c.name} County`;

        c.cities.forEach(rec => {
          const opt = document.createElement("option");
          opt.value = rec.name;
          opt.textContent = rec.display_name || rec.name;
          group.appendChild(opt);
        });

        selector.appendChild(group);
      });
    }

  } catch (e) {
    console.error("City registry failed:", e);
    selector.innerHTML = '<option value="">City list unavailable</option>';
  }

  const saved = localStorage.getItem(CITY_KEY);
  if (saved) selector.value = saved;

  selector.addEventListener("change", () => {
    const city = selector.value;
    localStorage.setItem(CITY_KEY, city);
    if (city) load(city);
  });
}


// ------------------------------------------------------
// RENDER — MATCHES HEART CORE FIELDS EXACTLY
// ------------------------------------------------------
function render(core) {
  document.getElementById("conditionsLocation").textContent = core.city_display;
  document.getElementById("tempValue").textContent = `${Math.round(core.temp_f)}°F`;
  document.getElementById("feelsLikeValue").textContent =
    `Feels like ${Math.round(core.apparent_temperature)}°F`;

  document.getElementById("condText").textContent = core.condition_text;

  document.getElementById("windText").textContent =
    `Wind: ${Math.round(core.wind_mph)} mph ${core.wind_direction}`;

  document.getElementById("humidityText").textContent =
    `Humidity: ${Math.round(core.humidity_2m)}%`;

  document.getElementById("pressureText").textContent =
    `Pressure: ${Math.round(core.pressure_msl)} hPa`;

  document.getElementById("obsTime").textContent =
    `Last update: ${core.local_time}`;

  // Radar
  document.getElementById("radarImage").src = core.radar_loop_gif;
  document.getElementById("radarTime").textContent =
    `Middle Tennessee Radar: ${core.radar_timestamp || core.local_time}`;

  // Forecast
  const grid = document.getElementById("forecastGrid");
  grid.innerHTML = "";

  if (core.forecast_daily && core.forecast_daily.length) {
    core.forecast_daily.slice(0, 5).forEach(p => {
      const tile = document.createElement("div");
      tile.className = "forecast-tile";
      tile.innerHTML = `
        <div class="forecast-period">${p.label}</div>
        <div class="forecast-desc">${p.description}</div>
        <div class="forecast-temp">${Math.round(p.high_f)}° / ${Math.round(p.low_f)}°</div>
      `;
      grid.appendChild(tile);
    });
  }

  // Alerts
  const alertsCard = document.getElementById("alertsCard");
  const alertsBody = document.getElementById("alertsBody");
  alertsBody.innerHTML = "";

  if (core.active_alerts && core.active_alerts.length) {
    alertsCard.hidden = false;

    core.active_alerts.forEach(a => {
      const div = document.createElement("div");
      div.textContent = `${a.event}: ${a.headline}`;
      alertsBody.appendChild(div);
    });

  } else {
    alertsCard.hidden = true;
  }

  // Clock
  document.getElementById("cwnClock").textContent = core.local_time;
}


// ------------------------------------------------------
// ERROR STATE
// ------------------------------------------------------
function showHeartError() {
  document.getElementById("condText").textContent = "Data unavailable";
  document.getElementById("radarTime").textContent = "Middle Tennessee Radar unavailable";
}


// ------------------------------------------------------
// LOAD CITY
// ------------------------------------------------------
async function load(city) {
  try {
    const core = await fetchHeart(city);
    render(core);
  } catch (e) {
    console.error("HEART failed:", e);
    showHeartError();
  }
}


// ------------------------------------------------------
// AUTOSCALE — MASTER SPEC
// ------------------------------------------------------
function scaleToFit() {
  const wrapper = document.getElementById("scaleWrapper");
  const scaleX = window.innerWidth / 1920;
  const scaleY = window.innerHeight / 1080;
  const scale = Math.min(scaleX, scaleY);
  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.transformOrigin = "top left";
}

window.addEventListener("resize", scaleToFit);


// ------------------------------------------------------
// BOOT
// ------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await loadCities();
  scaleToFit();

  const city = localStorage.getItem(CITY_KEY) || "";
  if (city) {
    load(city);
  }
});

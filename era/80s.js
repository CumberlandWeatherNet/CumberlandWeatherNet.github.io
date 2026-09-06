// Persistence keys
const CITY_KEY = "cwn_city";
const THEME_KEY = "cwn_themeMode";

// Fetch HEART
async function fetchHeart(city) {
    const res = await fetch(`/api/heart?city=${encodeURIComponent(city)}`);
    if (!res.ok) throw new Error("HEART fetch failed");
    return await res.json();
}

// Load cities.json (homepage logic)
async function loadCities() {
    const selector = document.getElementById("citySelector");

    try {
        const res = await fetch("/api/cities.json");
        if (!res.ok) throw new Error("cities.json missing");

        const cities = await res.json();
        selector.innerHTML = '<option value="">Select a City</option>';

        cities.forEach(city => {
            const opt = document.createElement("option");
            opt.value = city.name;
            opt.textContent = city.display_name || city.name;
            selector.appendChild(opt);
        });

    } catch {
        // Fallback to MT registry
        selector.innerHTML = '<option value="">Select a City</option>';

        Object.keys(MT).forEach(county => {
            const group = document.createElement("optgroup");
            group.label = `${county} County`;

            MT[county].forEach(city => {
                const opt = document.createElement("option");
                opt.value = city;
                opt.textContent = city;
                group.appendChild(opt);
            });

            selector.appendChild(group);
        });
    }

    // Restore saved city
    const saved = localStorage.getItem(CITY_KEY);
    if (saved) selector.value = saved;

    selector.addEventListener("change", () => {
        const city = selector.value;
        localStorage.setItem(CITY_KEY, city);

        if (city) {
            load(city);
        }
    });
}

// Render HEART data
function render(core) {
    document.getElementById("conditionsLocation").textContent = core.city_display;
    document.getElementById("tempValue").textContent = `${Math.round(core.temp_f)}°F`;
    document.getElementById("feelsLikeValue").textContent = `Feels like ${Math.round(core.apparent_temperature)}°F`;

    const [condText] = WX[core.weather_code] || ["Unknown"];
    document.getElementById("condText").textContent = condText;

    document.getElementById("windText").textContent = `Wind: ${Math.round(core.wind_mph)} mph ${core.wind_direction}`;
    document.getElementById("humidityText").textContent = `Humidity: ${Math.round(core.humidity)}%`;
    document.getElementById("pressureText").textContent = `Pressure: ${Math.round(core.pressure)} hPa`;
    document.getElementById("obsTime").textContent = `Last update: ${core.local_time}`;

    // Radar
    document.getElementById("radarImage").src = core.radar_url;
    document.getElementById("radarTime").textContent = `Radar: ${core.radar_time}`;

    // Forecast
    const grid = document.getElementById("forecastGrid");
    grid.innerHTML = "";
    core.extended_forecast.slice(0,5).forEach(p => {
        const tile = document.createElement("div");
        tile.className = "forecast-tile";
        tile.innerHTML = `
            <div class="forecast-period">${p.name}</div>
            <div class="forecast-desc">${p.description}</div>
            <div class="forecast-temp">${Math.round(p.high_f)}° / ${Math.round(p.low_f)}°</div>
        `;
        grid.appendChild(tile);
    });

    // Alerts
    const alertsCard = document.getElementById("alertsCard");
    const alertsBody = document.getElementById("alertsBody");
    alertsBody.innerHTML = "";

    if (core.active_alerts.length) {
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

// HEART error fallback
function showHeartError() {
    document.getElementById("condText").textContent = "Data unavailable";
    document.getElementById("radarTime").textContent = "Radar unavailable";
}

// Load page
async function load(city) {
    try {
        const core = await fetchHeart(city);
        render(core);
    } catch (e) {
        console.warn("HEART failed:", e);
        showHeartError();
    }
}

// Directory
function wireDirectory() {
    document.querySelectorAll(".dir-btn").forEach(btn => {
        btn.onclick = () => {
            const t = btn.dataset.target;
            if (t === "home") location.href = "/index.html";
            if (t === "1994") location.href = "/era/1994Severe.html";
            if (t === "80s") return;
        };
    });
}

// Boot
document.addEventListener("DOMContentLoaded", async () => {
    wireDirectory();
    await loadCities();

    const city = localStorage.getItem(CITY_KEY) || "";
    if (city) {
        load(city);
    }
});

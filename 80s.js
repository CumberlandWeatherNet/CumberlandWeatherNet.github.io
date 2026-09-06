import { getCityCoords, getConditions, getAlerts } 
    from "/core/cwn-heart-full.js";

const CITIES_URL = "/api/cities.json";
const CITY_KEY = "cwn_city";

async function loadHeart(city) {
    const { lat, lon } = await getCityCoords(city);

    const conditions = await getConditions(lat, lon);
    const alerts = await getAlerts(lat, lon);

    return {
        city_display: city,
        temp_f: conditions.temp_f,
        apparent_temperature: conditions.temp_f,
        condition_text: conditions.description,
        wind_mph: conditions.wind_mph,
        wind_direction: conditions.wind_direction,
        active_alerts: alerts,
        lat,
        lon,
        local_time: new Date().toLocaleString()
    };
}

async function loadCities() {
    const selector = document.getElementById("citySelector");
    selector.innerHTML = '<option value="">Select a City</option>';

    const res = await fetch(CITIES_URL);
    const data = await res.json();

    for (const county in data) {
        const group = document.createElement("optgroup");
        group.label = `${county} County`;

        for (const cityName in data[county]) {
            const opt = document.createElement("option");
            opt.value = cityName;
            opt.textContent = cityName;
            group.appendChild(opt);
        }

        selector.appendChild(group);
    }

    const saved = localStorage.getItem(CITY_KEY);
    if (saved) selector.value = saved;

    selector.addEventListener("change", () => {
        const city = selector.value;
        localStorage.setItem(CITY_KEY, city);
        if (city) load(city);
    });
}

function render(core) {
    document.getElementById("conditionsLocation").textContent = core.city_display;
    document.getElementById("tempValue").textContent = `${core.temp_f}°F`;
    document.getElementById("feelsLikeValue").textContent =
        `Feels like ${core.apparent_temperature}°F`;

    document.getElementById("condText").textContent = core.condition_text;

    document.getElementById("windText").textContent =
        `Wind: ${core.wind_mph} mph ${core.wind_direction}`;

    document.getElementById("humidityText").textContent = `Humidity: --%`;
    document.getElementById("pressureText").textContent = `Pressure: -- hPa`;

    document.getElementById("obsTime").textContent =
        `Last update: ${core.local_time}`;

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

    document.getElementById("radarImage").src =
        "https://radar.weather.gov/ridge/standard/KOHX_loop.gif";

    document.getElementById("radarTime").textContent =
        `Middle Tennessee Radar: ${core.local_time}`;

    document.getElementById("cwnClock").textContent = core.local_time;
}

async function load(city) {
    const core = await loadHeart(city);
    render(core);
}

function scaleToFit() {
    const wrapper = document.getElementById("scaleWrapper");
    const scaleX = window.innerWidth / 1920;
    const scaleY = window.innerHeight / 1080;
    const scale = Math.min(scaleX, scaleY);
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = "top left";
}

window.addEventListener("resize", scaleToFit);

document.addEventListener("DOMContentLoaded", async () => {
    await loadCities();
    scaleToFit();

    const city = localStorage.getItem(CITY_KEY);
    if (city) load(city);
});

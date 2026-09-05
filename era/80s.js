import { getCWNCore, getDayPeriod, hasEmergency } from "./core/cwn-heart-full.js";

async function loadWeather() {
    const city = localStorage.getItem("cwn_city");

    if (!city) {
        const status = document.getElementById("status");
        status.textContent = "Please select a city on the main page.";
        return;
    }

    const core = await getCWNCore(city);

    if (hasEmergency(core.alerts)) {
        window.location.href = "emergency.html";
        return;
    }

    renderEra(core);
}

function renderEra(core) {
    document.getElementById("cityName").textContent = core.city_name;
    document.getElementById("tempValue").textContent = core.temp_f + "°";
    document.getElementById("descValue").textContent = core.description;
    document.getElementById("windValue").textContent = core.wind_mph + " mph " + core.wind_direction;
    document.getElementById("dayPeriod").textContent = getDayPeriod();
    document.getElementById("radarImage").src = core.radar_url;
    document.getElementById("clockValue").textContent = core.clock_time;
}

/* Autoscaling */
function autoscale() {
    const w = window.innerWidth / 1920;
    const h = window.innerHeight / 1080;
    const scale = Math.min(w, h);
    document.getElementById("scaleWrapper").style.transform = `scale(${scale})`;
}

window.addEventListener("resize", autoscale);
autoscale();

loadWeather();

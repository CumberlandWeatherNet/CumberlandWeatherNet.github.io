/* ============================================================
   CWN — 1980s Weather Page Script
   Clean, corrected, and fully compatible with HEART v2.0
   ============================================================ */

import { 
    getCWNCore, 
    getDayPeriod, 
    hasEmergency 
} from "../core/cwn-heart-full.js";

/* ------------------------------
   Load Weather for Selected City
   ------------------------------ */
async function loadWeather() {

    const city = localStorage.getItem("cwn_city");

    if (!city) {
        document.getElementById("status").textContent =
            "Please select a city on the main page.";
        return;
    }

    try {
        const core = await getCWNCore(city);

        // Emergency redirect
        if (hasEmergency(core.alerts)) {
            window.location.href = "../emergency.html";
            return;
        }

        renderEra(core);

    } catch (err) {
        document.getElementById("status").textContent =
            "Weather data unavailable.";
        console.error(err);
    }
}

/* ------------------------------
   Render 1980s CRT Layout
   ------------------------------ */
function renderEra(core) {

    document.getElementById("cityName").textContent = core.city_name;
    document.getElementById("tempValue").textContent = core.temp_f + "°";
    document.getElementById("descValue").textContent = core.description;

    document.getElementById("windValue").textContent =
        core.wind_mph + " mph " + core.wind_direction;

    document.getElementById("dayPeriod").textContent = getDayPeriod();

    document.getElementById("radarImage").src = core.radar_url;

    document.getElementById("clockValue").textContent = core.clock_time;
}

/* ------------------------------
   Autoscaling (Matches Reference)
   ------------------------------ */
function autoscale() {
    const w = window.innerWidth / 1920;
    const h = window.innerHeight / 1080;
    const scale = Math.min(w, h);

    document.getElementById("scaleWrapper").style.transform =
        `scale(${scale})`;
}

window.addEventListener("resize", autoscale);
autoscale();

/* ------------------------------
   Initialize Page
   ------------------------------ */
loadWeather();

window.addEventListener("resize", autoscale);
autoscale();

loadWeather();

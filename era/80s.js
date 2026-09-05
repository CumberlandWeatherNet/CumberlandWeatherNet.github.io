import { getCWNCore, getDayPeriod, hasEmergency } from "../core/cwn-heart-full.js";

async function loadWeather() {
    const city = localStorage.getItem("cwn_city");

    if (!city) {
        document.getElementById("currentCity").textContent = "Select a city above.";
        return;
    }

    const core = await getCWNCore(city);

    // Emergency redirect
    if (hasEmergency(core.alerts)) {
        window.location.href = "../emergency.html";
        return;
    }

    renderEra(core);
}

function renderEra(core) {

    /* ============================
       TOP BAR
       ============================ */
    document.getElementById("topClock").textContent = core.clock_time;


    /* ============================
       CURRENT CONDITIONS CARD
       ============================ */
    document.getElementById("currentCity").textContent =
        `${core.city_name}, ${core.county_name}`;

    document.getElementById("currentTemp").textContent =
        `${core.temp_f}°F`;

    document.getElementById("currentDesc").textContent =
        core.description;

    document.getElementById("currentWind").textContent =
        `${core.wind_mph} mph ${core.wind_direction}`;

    document.getElementById("currentMeta").textContent =
        `Live report for ${core.city_name}, ${core.county_name}`;


    /* ============================
       RADAR
       ============================ */
    document.getElementById("radarImage").src = core.radar_url;


    /* ============================
       FORECAST TILES
       ============================ */
    if (core.forecast && core.forecast.length >= 6) {

        const tiles = [
            ["fc1Temp", "fc1Desc", "fc1Rain"],
            ["fc2Temp", "fc2Desc", "fc2Rain"],
            ["fc3Temp", "fc3Desc", "fc3Rain"],
            ["fc4Temp", "fc4Desc", "fc4Rain"],
            ["fc5Temp", "fc5Desc", "fc5Rain"],
            ["fc6Temp", "fc6Desc", "fc6Rain"]
        ];

        core.forecast.slice(0, 6).forEach((f, i) => {
            document.getElementById(tiles[i][0]).textContent = `${f.temp}°`;
            document.getElementById(tiles[i][1]).textContent = f.desc;
            document.getElementById(tiles[i][2]).textContent = `Rain ${f.pop}%`;
        });
    }


    /* ============================
       ALERTS + TIMESTAMP
       ============================ */
    if (core.alerts && core.alerts.length > 0) {
        document.getElementById("alerts").textContent =
            core.alerts.join(" • ");
    } else {
        document.getElementById("alerts").textContent = "";
    }

    document.getElementById("timestamp").textContent = core.timestamp;
}


/* ============================
   AUTOSCALE
   ============================ */
function autoscale() {
    const w = window.innerWidth / 1100;
    const scale = Math.min(w, 1);
    document.getElementById("scaleWrapper").style.transform = `scale(${scale})`;
}

window.addEventListener("resize", autoscale);
autoscale();


/* ============================
   INIT
   ============================ */
loadWeather();

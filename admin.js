/* ═══════════════════════════════════════════════════════
   CWN ADMIN PORTAL — admin.js
   Cumberland Weather Network · Full Admin Logic
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ══ CONSTANTS ══ */
const CWN_CREDS_KEY    = 'cwn_admin_creds';
const CWN_SESSION_KEY  = 'cwn_admin_session';
const DEFAULT_USER     = 'THILL';
const DEFAULT_PASS     = 'YoMama69$$';

/* ══ UTILS ══ */
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const ts = () => { const n = new Date(); return `[${n.getHours().toString().padStart(2,'0')}:${n.getMinutes().toString().padStart(2,'0')}:${n.getSeconds().toString().padStart(2,'0')}]`; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════
   LOGIN SYSTEM
   ══════════════════════════════════════════════════════ */
const Auth = {
  getCreds() {
    try {
      const stored = JSON.parse(localStorage.getItem(CWN_CREDS_KEY));
      return stored || { user: DEFAULT_USER, pass: DEFAULT_PASS };
    } catch { return { user: DEFAULT_USER, pass: DEFAULT_PASS }; }
  },
  saveCreds(user, pass) {
    localStorage.setItem(CWN_CREDS_KEY, JSON.stringify({ user, pass }));
  },
  resetCreds() {
    localStorage.removeItem(CWN_CREDS_KEY);
  },
  check(u, p) {
    const c = this.getCreds();
    return u.toUpperCase() === c.user.toUpperCase() && p === c.pass;
  },
  isSessionActive() {
    return sessionStorage.getItem(CWN_SESSION_KEY) === 'active';
  },
  startSession() {
    sessionStorage.setItem(CWN_SESSION_KEY, 'active');
  },
  endSession() {
    sessionStorage.removeItem(CWN_SESSION_KEY);
  }
};

function initLogin() {
  const screen = $('#loginScreen');
  const shell  = $('#adminShell');

  // Auto-restore session
  if (Auth.isSessionActive()) {
    screen.classList.add('hidden');
    shell.classList.remove('hidden');
    initAdminShell();
    return;
  }

  // Password toggle
  const pwField  = $('#loginPass');
  const pwToggle = $('#pwToggle');
  pwToggle.addEventListener('click', () => {
    const isText = pwField.type === 'text';
    pwField.type = isText ? 'password' : 'text';
    pwToggle.textContent = isText ? '👁' : '🙈';
  });

  // Login submit
  const loginBtn = $('#loginForm').querySelector('[type="submit"]');
  const errMsg   = $('#loginError');
  loginBtn.addEventListener('click', attemptLogin);
  ['#loginUser','#loginPass'].forEach(s => $(s).addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); }));

  function attemptLogin() {
    const u = $('#loginUser').value.trim();
    const p = $('#loginPass').value;
    if (!u || !p) { errMsg.textContent = 'Enter username and password.'; return; }
    if (Auth.check(u, p)) {
      errMsg.textContent = '';
      const loginBtn = loginForm.querySelector('[type="submit"]');
      loginBtn.textContent = 'AUTHENTICATED ✓';
      loginBtn.style.background = 'var(--ok)';
      Auth.startSession();
      setTimeout(() => {
        screen.classList.add('hidden');
        shell.classList.remove('hidden');
        initAdminShell();
      }, 600);
    } else {
      errMsg.textContent = '\u26A0 Invalid credentials. Try again.';
      pwField.value = '';
      pwField.focus();
    }
  }

  // Forgot / reset panel
  $('#showReset').addEventListener('click', () => {
    $('#loginForm').style.display = 'none';
    $('#resetPanel').style.display = 'block';
  });
  $('#backToLogin').addEventListener('click', () => {
    $('#resetPanel').style.display = 'none';
    $('#loginForm').style.display = 'block';
  });
  $('#doReset').addEventListener('click', () => {
    Auth.resetCreds();
    $('#resetPanel').style.display = 'none';
    $('#loginForm').style.display = 'block';
    errMsg.style.color = 'var(--ok)';
    errMsg.textContent = 'Credentials reset to defaults. Log in with THILL / YoMama69$$';
    setTimeout(() => { errMsg.style.color = ''; errMsg.textContent = ''; }, 4000);
  });
}

/* ══════════════════════════════════════════════════════
   PANEL ROUTER
   ══════════════════════════════════════════════════════ */
function initPanelRouter() {
  $$('.sb-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.panel;
      if (!target) return;
      $$('.sb-item').forEach(b => b.classList.remove('active'));
      $$('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`#panel-${target}`)?.classList.add('active');
    });
  });

  $('#logoutBtn').addEventListener('click', () => {
    Auth.endSession();
    location.reload();
  });
}

/* ══════════════════════════════════════════════════════
   SYSTEM LOG
   ══════════════════════════════════════════════════════ */
const Log = {
  box: null,
  init() { this.box = $('#sysLog'); },
  append(msg, type = 'info') {
    if (!this.box) return;
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.textContent = `${ts()} ${msg}`;
    this.box.appendChild(line);
    this.box.scrollTop = this.box.scrollHeight;
  },
  ok(msg)   { this.append('✓ ' + msg, 'ok');   },
  fail(msg) { this.append('✗ ' + msg, 'fail'); },
  warn(msg) { this.append('⚠ ' + msg, 'warn'); },
  info(msg) { this.append('→ ' + msg, 'info'); }
};

/* ══════════════════════════════════════════════════════
   DIAGNOSTICS ENGINE
   ══════════════════════════════════════════════════════ */
const Diagnostics = {
  results: {},

  async runAll() {
    Log.info('Running full CWN system diagnostic…');
    $('#diagBtn').textContent = '⏳ Running…';
    $('#diagBtn').disabled = true;

    await Promise.all([
      this.checkNWS(),
      this.checkRadar(),
      this.checkCitiesJSON(),
      this.checkSpeechAPI(),
      this.checkAudioContext(),
      this.checkHeart()
    ]);

    $('#diagBtn').textContent = '▶ Run Diagnostic';
    $('#diagBtn').disabled = false;
    Log.info('Diagnostic complete.');
    this.updateStatusCards();
  },

  setCard(id, status, val) {
    const card = $(`#sc-${id}`);
    if (!card) return;
    card.className = `status-card ${status}`;
    const indicator = status === 'ok' ? '🟢 Online' : status === 'fail' ? '🔴 Offline' : '🟡 Degraded';
    card.querySelector('.sc-val').textContent = val || indicator;
    card.querySelector('.sc-indicator').textContent = indicator;
    this.results[id] = { status, val };
  },

  updateStatusCards() { /* cards already updated inline */ },

  async checkNWS() {
    try {
      const r = await fetch('https://api.weather.gov/alerts/active?area=TN', { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        this.setCard('nws', 'ok', 'NWS API Responding');
        Log.ok('NWS API → 200 OK');
      } else {
        this.setCard('nws', 'warn', `HTTP ${r.status}`);
        Log.warn(`NWS API → ${r.status}`);
      }
    } catch(e) {
      this.setCard('nws', 'fail', 'No Response');
      Log.fail(`NWS API → ${e.message}`);
    }
  },

  async checkRadar() {
    try {
      const url = 'https://radar.weather.gov/ridge/standard/KOHX_N0R_0.gif?' + Date.now();
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        this.setCard('radar', 'ok', 'KOHX Responding');
        Log.ok('KOHX Radar → 200 OK');
      } else {
        this.setCard('radar', 'warn', `HTTP ${r.status}`);
        Log.warn(`KOHX Radar → ${r.status}`);
      }
    } catch(e) {
      this.setCard('radar', 'fail', 'No Response');
      Log.fail(`KOHX Radar → ${e.message}`);
    }
  },

  async checkCitiesJSON() {
    try {
      const r = await fetch('/api/cities.json', { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d = await r.json();
        const count = Object.values(d).flat().length;
        this.setCard('cities', 'ok', `${count} cities loaded`);
        Log.ok(`cities.json → ${count} cities`);
      } else {
        this.setCard('cities', 'fail', `HTTP ${r.status}`);
        Log.fail(`cities.json → ${r.status}`);
      }
    } catch(e) {
      this.setCard('cities', 'warn', 'Local path only');
      Log.warn(`cities.json → ${e.message}`);
    }
  },

  async checkHeart() {
    try {
      const r = await fetch('/core/cwn-heart-full.js', { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        this.setCard('heart', 'ok', 'Heart Engine Online');
        Log.ok('cwn-heart-full.js → 200 OK');
      } else {
        this.setCard('heart', 'warn', `HTTP ${r.status}`);
        Log.warn(`cwn-heart-full.js → ${r.status}`);
      }
    } catch(e) {
      this.setCard('heart', 'warn', 'Local path only');
      Log.warn(`Heart → ${e.message}`);
    }
  },

  checkSpeechAPI() {
    const avail = 'speechSynthesis' in window;
    this.setCard('speech', avail ? 'ok' : 'fail', avail ? 'Web Speech API Ready' : 'Not supported');
    avail ? Log.ok('Speech API → Available') : Log.fail('Speech API → Not supported');
    if (avail) {
      window.speechSynthesis.getVoices();
    }
    return Promise.resolve();
  },

  checkAudioContext() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.setCard('audio', 'ok', 'AudioContext Ready');
      Log.ok('AudioContext → Available');
      ctx.close();
    } catch(e) {
      this.setCard('audio', 'fail', 'Not Available');
      Log.fail(`AudioContext → ${e.message}`);
    }
    return Promise.resolve();
  }
};

/* ══════════════════════════════════════════════════════
   REPAIR AI
   ══════════════════════════════════════════════════════ */
class RepairAI {
  constructor() { this.errors = []; }

  scan() {
    Log.info('RepairAI scanning system…');
    let fixes = 0;

    // Check for orphaned override keys
    const overrideKeys = [
      'cwn_override_weather','cwn_override_alert','cwn_override_closings',
      'cwn_ticker_override','cwn50s_channel_override','cwn50s_emergency_override'
    ];
    overrideKeys.forEach(k => {
      try {
        const v = localStorage.getItem(k);
        if (v) JSON.parse(v);
      } catch(e) {
        localStorage.removeItem(k);
        Log.warn(`RepairAI: Removed corrupt key "${k}"`);
        fixes++;
      }
    });

    // Verify playlist integrity
    try {
      const pl = JSON.parse(localStorage.getItem('cwn_admin_playlist') || '[]');
      if (!Array.isArray(pl)) {
        localStorage.removeItem('cwn_admin_playlist');
        Log.warn('RepairAI: Reset corrupt playlist');
        fixes++;
      }
    } catch { localStorage.removeItem('cwn_admin_playlist'); fixes++; }

    if (fixes === 0) {
      Log.ok('RepairAI: No issues found — system clean');
    } else {
      Log.ok(`RepairAI: Fixed ${fixes} issue(s)`);
    }
    return fixes;
  }

  clearAllOverrides() {
    const keys = [
      'cwn_override_weather','cwn_override_alert','cwn_override_closings',
      'cwn_ticker_override','cwn50s_channel_override','cwn50s_auto_override',
      'cwn50s_emergency_override','cwn50s_theme','cwn50s_announce_override',
      'cwn50s_city_override'
    ];
    keys.forEach(k => localStorage.removeItem(k));
    Log.ok('RepairAI: All overrides cleared');
  }
}

const Repair = new RepairAI();

/* ══════════════════════════════════════════════════════
   BOB AI — Central Communications Hub
   ══════════════════════════════════════════════════════ */
class BobAI {
  constructor() {
    this.name = 'Bob';
    this.mood = 'ready';
    this.lastIntent = null;
  }

  /* ── Voice announcer engine ── */
  speak(text, voiceName = null, rate = 0.9, pitch = 1.0) {
    if (!('speechSynthesis' in window)) {
      Log.fail('Bob: Speech API unavailable');
      return;
    }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = rate; utt.pitch = pitch;
    if (voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find(v => v.name.toLowerCase().includes(voiceName.toLowerCase()));
      if (v) utt.voice = v;
    }
    window.speechSynthesis.speak(utt);
    Log.info(`Bob: Speaking → "${text.substring(0,60)}…"`);
  }

  /* ── Intent classification ── */
  classify(msg) {
    const m = msg.toLowerCase();

    if (/\b(weather|temp|condition|forecast|humidity|wind|rain|snow|storm)\b/.test(m))    return 'weather';
    if (/\b(earl|walter|barbara|dorothy|announcer|voice|speak|say|announce)\b/.test(m))   return 'announce';
    if (/\b(playlist|music|song|shuffle|play|pause|skip|next|track|audio)\b/.test(m))     return 'playlist';
    if (/\b(diagnos|status|check|ping|test|health|online|offline)\b/.test(m))             return 'diagnostic';
    if (/\b(channel|ch1|ch2|ch3|switch|flip)\b/.test(m))                                  return 'channel';
    if (/\b(theme|day|night|dark|light|mode)\b/.test(m))                                  return 'theme';
    if (/\b(emergency|tornado|alert|warning|watch|eas|override)\b/.test(m))               return 'emergency';
    if (/\b(ticker|scroll|marquee|message|headline)\b/.test(m))                           return 'ticker';
    if (/\b(school|clos|dismiss)\b/.test(m))                                              return 'closings';
    if (/\b(clear|remove|reset|cancel|undo)\b/.test(m))                                   return 'clear';
    if (/\b(help|what|can you|commands|list)\b/.test(m))                                  return 'help';
    if (/\b(repair|fix|scan|clean|broken)\b/.test(m))                                     return 'repair';
    if (/\b(heart|core|engine|data)\b/.test(m))                                           return 'heart';
    if (/\b(city|location|select|change city)\b/.test(m))                                 return 'city';
    return 'general';
  }

  /* ── Weather status fetch ── */
  async getWeatherSummary() {
    const city = localStorage.getItem('cwn_city') || 'Lebanon';
    const ov   = localStorage.getItem('cwn_override_weather');
    if (ov) {
      try {
        const d = JSON.parse(ov);
        return `Override active for ${city}: ${d.temp || '--'}°F, ${d.condition || '--'}, Wind ${d.wind || '--'}, Humidity ${d.humidity || '--'}%`;
      } catch {}
    }
    return `Live weather for ${city} is pulling from the NWS feed via CWN Heart. Check the System Status panel for live API health.`;
  }

  /* ── Announcer dispatch ── */
  fireAnnouncer(msg) {
    const m = msg.toLowerCase();
    let name = 'Earl Henderson', voice = 'male', script = '';

    if (/walter/.test(m))  { name = 'Walter Grayson';  voice = 'David'; }
    if (/barbara/.test(m)) { name = 'Barbara Collins'; voice = 'female'; }
    if (/dorothy/.test(m)) { name = 'Dorothy Sinclair'; voice = 'Zira'; }
    if (/earl/.test(m))    { name = 'Earl Henderson';   voice = 'David'; }

    if      (/sign.on/.test(m))   script = `Good morning, Middle Tennessee. This is ${name} with the Cumberland Weather Network. Welcome to your CWN weather broadcast.`;
    else if (/sign.off/.test(m))  script = `This is ${name} for the Cumberland Weather Network. That wraps up tonight's broadcast. Stay safe, Middle Tennessee. Good night.`;
    else if (/emergency/.test(m)) script = `ATTENTION. The National Weather Service has issued an emergency alert for Middle Tennessee. Please stand by for critical information.`;
    else {
      const scripts = [
        `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, Middle Tennessee. ${name} here with the Cumberland Weather Network. Here's your latest weather update.`,
        `You're watching the Cumberland Weather Network. I'm ${name}. Let's take a look at conditions across Middle Tennessee right now.`,
        `This is ${name} on the Cumberland Weather Network. Conditions are changing across the region. Here's what you need to know.`
      ];
      script = scripts[Math.floor(Math.random() * scripts.length)];
    }

    this.speak(script, voice, 0.88, voice === 'female' ? 1.1 : 0.9);
    return `🎙 ${name} is now speaking on-air.`;
  }

  /* ── Main process ── */
  async process(userMsg) {
    const intent = this.classify(userMsg);
    this.lastIntent = intent;
    Log.info(`Bob: Intent → "${intent}" | "${userMsg.substring(0,50)}"`);

    await sleep(400 + Math.random() * 600);

    switch(intent) {

      case 'weather': {
        const summary = await this.getWeatherSummary();
        return `📡 ${summary}\n\nTo inject a manual override, use the **Weather Overrides** panel. I can push any value you want directly to the 50s page.`;
      }

      case 'announce': {
        return this.fireAnnouncer(userMsg);
      }

      case 'playlist': {
        if (/shuffle/.test(userMsg.toLowerCase())) {
          SoundLibrary.shuffle();
          return '🔀 Playlist shuffled! The randomizer has mixed up your queue.';
        }
        if (/play/.test(userMsg.toLowerCase())) {
          SoundLibrary.playPause();
          return '▶ Playback toggled.';
        }
        if (/skip|next/.test(userMsg.toLowerCase())) {
          SoundLibrary.next();
          return '⏭ Skipped to next track.';
        }
        if (/pause|stop/.test(userMsg.toLowerCase())) {
          SoundLibrary.playPause();
          return '⏸ Playback paused.';
        }
        const pl = SoundLibrary.playlist;
        return `🎵 Playlist has ${pl.length} track(s) loaded. Tell me to shuffle, play, skip, or pause — or use the Sound Library panel to upload more files.`;
      }

      case 'diagnostic': {
        this.addBobMsg('⏳ Running diagnostics now…', false);
        await Diagnostics.runAll();
        const r = Diagnostics.results;
        const all = Object.values(r).every(v => v.status === 'ok');
        return `🔧 Diagnostic complete.\n${Object.entries(r).map(([k,v]) => `• ${k}: ${v.status === 'ok' ? '✓' : '✗'} ${v.val}`).join('\n')}\n\n${all ? 'Everything is running great, boss.' : 'Some issues detected — check the System Status panel for details.'}`;
      }

      case 'channel': {
        const m = userMsg.toLowerCase();
        const ch = m.includes('ch1') || m.includes('channel 1') ? '1'
                 : m.includes('ch2') || m.includes('channel 2') ? '2'
                 : m.includes('ch3') || m.includes('channel 3') ? '3' : null;
        if (ch) {
          localStorage.setItem('cwn50s_channel_override', ch);
          Log.ok(`Bob: Channel override → CH${ch}`);
          return `📺 CH${ch} override sent to the 50s broadcast page. It'll switch on the next refresh cycle.`;
        }
        return 'Which channel? Say "switch to CH1" (Conditions), "CH2" (Forecast), or "CH3" (Radar).';
      }

      case 'theme': {
        const night = /night|dark/.test(userMsg.toLowerCase());
        const val = night ? 'night' : 'day';
        localStorage.setItem('cwn50s_theme', val);
        Log.ok(`Bob: Theme override → ${val}`);
        return `🌙 Theme set to **${val}** mode. The 50s page will pick this up on next cycle.`;
      }

      case 'emergency': {
        const m = userMsg.toLowerCase();
        if (/clear|cancel|off/.test(m)) {
          localStorage.removeItem('cwn50s_emergency_override');
          localStorage.removeItem('cwn_override_alert');
          Log.ok('Bob: Emergency override cleared');
          return '✅ Emergency override cleared. Normal broadcast resumed.';
        }
        const alert = {
          type: 'Tornado Warning', severity: 'extreme',
          headline: 'TORNADO WARNING — The National Weather Service has issued a Tornado Warning for Middle Tennessee. Take shelter immediately.',
          issued: new Date().toISOString()
        };
        localStorage.setItem('cwn_override_alert', JSON.stringify(alert));
        localStorage.setItem('cwn50s_emergency_override', 'true');
        Log.warn('Bob: Emergency override activated');
        return '🚨 Emergency override activated! Tornado Warning pushed to the broadcast. Say "clear emergency" to cancel.';
      }

      case 'ticker': {
        const msgClean = userMsg.replace(/\b(ticker|set|push|send|message|to|the)\b/gi,'').trim();
        if (msgClean.length > 4) {
          localStorage.setItem('cwn_ticker_override', JSON.stringify({ message: msgClean, badge: 'ADMIN', ts: Date.now() }));
          Log.ok(`Bob: Ticker override → "${msgClean}"`);
          return `📝 Ticker updated: "${msgClean}" — scrolling on the 50s page now.`;
        }
        return 'What should the ticker say? Example: "set ticker to Community Meeting Tonight at 7PM"';
      }

      case 'closings': {
        const text = userMsg.replace(/\b(school|closings?|set|push|add)\b/gi,'').trim();
        if (text.length > 4) {
          localStorage.setItem('cwn_override_closings', JSON.stringify({ closings: text, ts: Date.now() }));
          Log.ok('Bob: School closings pushed');
          return `🏫 School closing pushed to ticker: "${text}"`;
        }
        return 'Tell me which school closings to post. Example: "set school closings: Lebanon Special School District — Closed"';
      }

      case 'clear': {
        const m = userMsg.toLowerCase();
        if (/all|everything/.test(m)) {
          Repair.clearAllOverrides();
          return '🧹 All overrides cleared! The 50s page is back to normal operation.';
        }
        if (/weather/.test(m)) { localStorage.removeItem('cwn_override_weather'); return '✅ Weather override cleared.'; }
        if (/ticker/.test(m))  { localStorage.removeItem('cwn_ticker_override');  return '✅ Ticker override cleared.'; }
        if (/alert/.test(m))   { localStorage.removeItem('cwn_override_alert'); localStorage.removeItem('cwn50s_emergency_override'); return '✅ Alert override cleared.'; }
        return 'What should I clear? Weather, ticker, alert, or everything?';
      }

      case 'repair': {
        const fixes = Repair.scan();
        return `🔧 RepairAI scan complete. ${fixes === 0 ? 'No issues found — system is clean.' : `Fixed ${fixes} issue(s). Check the System Log for details.`}`;
      }

      case 'heart': {
        return `❤ CWN Heart (/core/cwn-heart-full.js) is the shared data engine. It exports:\n• getCityCoords(city)\n• getConditions(lat,lon)\n• getAlerts(lat,lon)\n• getRadarUrl(station)\n• fetchNWSPeriods(lat,lon)\n\nAll era pages import from it. Want me to run a connectivity check on it?`;
      }

      case 'city': {
        const m = userMsg.toLowerCase();
        const city = m.replace(/\b(set|change|city|to|select|location)\b/g,'').trim();
        if (city.length > 2) {
          localStorage.setItem('cwn_city', city);
          localStorage.setItem('cwn50s_city_override', city);
          Log.ok(`Bob: City override → ${city}`);
          return `📍 City set to **${city}** across all pages. The 50s page will refresh weather data on the next cycle.`;
        }
        const cur = localStorage.getItem('cwn_city') || 'Lebanon';
        return `📍 Current city: **${cur}**. To change it say "set city to Murfreesboro" or use the Broadcast Control panel.`;
      }

      case 'help': {
        return `Here's what I can do for you, boss:\n\n📡 **Weather** — "what's the weather?" or "check conditions"\n📺 **Channels** — "switch to CH1/CH2/CH3"\n🎙 **Announcers** — "have Earl do a sign-on" or "Barbara weather update"\n🔀 **Playlist** — "shuffle the music" or "skip track"\n🔧 **Diagnostics** — "run diagnostics" or "check system status"\n🚨 **Emergency** — "activate tornado warning" or "clear emergency"\n📝 **Ticker** — "set ticker to [message]"\n🏫 **Closings** — "set school closings: [info]"\n🧹 **Clear** — "clear all overrides" or "clear weather"\n🌙 **Theme** — "set night mode" or "switch to day"\n📍 **City** — "set city to Nashville"\n🔧 **Repair** — "scan for issues"\n\nJust talk to me naturally — I'll figure it out.`;
      }

      default: {
        const responses = [
          `I hear you. Could you be a bit more specific? Try asking me to check the weather, run diagnostics, control a channel, or manage the playlist.`,
          `Got it. I'm not 100% sure what you need — want me to run a diagnostic, check alerts, or adjust something on the broadcast?`,
          `Standing by. If you need something specific on the broadcast, just say the word. I can switch channels, push alerts, shuffle music, or have an announcer take it away.`
        ];
        return responses[Math.floor(Math.random() * responses.length)];
      }
    }
  }

  addBobMsg(text, isTyping = false) {
    const window_ = $('#chatWindow');
    const div = document.createElement('div');
    div.className = 'chat-msg bob' + (isTyping ? ' typing' : '');
    div.innerHTML = `
      <div class="msg-avatar">BOB</div>
      <div class="msg-bubble">
        <div class="msg-sender">Bob · CWN Comms AI</div>
        <div class="msg-text">${text.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</div>
      </div>`;
    window_.appendChild(div);
    window_.scrollTop = window_.scrollHeight;
    return div;
  }
}

const Bob = new BobAI();

function initChat() {
  const chatWindow = $('#chatWindow');
  const input      = $('#chatInput');
  const sendBtn    = $('#chatSend');

  // Greeting
  setTimeout(() => {
    Bob.addBobMsg("Hey Tanner — Bob here. I'm online and all systems are linked up. What do you need?");
  }, 500);

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // User bubble
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user';
    userDiv.innerHTML = `
      <div class="msg-avatar">YOU</div>
      <div class="msg-bubble">
        <div class="msg-sender">Tanner</div>
        <div class="msg-text">${text}</div>
      </div>`;
    chatWindow.appendChild(userDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    // Typing indicator
    const typing = Bob.addBobMsg('Bob is thinking…', true);

    const response = await Bob.process(text);
    typing.remove();
    Bob.addBobMsg(response);
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

  // Quick action buttons
  $$('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.cmd || btn.textContent;
      sendMessage();
    });
  });
}

/* ══════════════════════════════════════════════════════
   BROADCAST CONTROLS
   ══════════════════════════════════════════════════════ */
function initBroadcast() {
  // Channel override
  $$('.ch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = btn.dataset.ch;
      localStorage.setItem('cwn50s_channel_override', ch);
      $$('.ch-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setFeedback('broadcastFb', `CH${ch} override active`, 'ok');
      Log.ok(`Broadcast: Channel → CH${ch}`);
    });
  });

  // Auto slideshow
  $('#autoToggle')?.addEventListener('change', e => {
    localStorage.setItem('cwn50s_auto_override', e.target.checked ? 'on' : 'off');
    Log.info(`Broadcast: Auto slideshow → ${e.target.checked ? 'ON' : 'OFF'}`);
  });

  // Emergency
  $('#forceEmergency')?.addEventListener('click', () => {
    localStorage.setItem('cwn50s_emergency_override', 'true');
    localStorage.setItem('cwn_override_alert', JSON.stringify({
      type: 'Emergency Override', severity: 'extreme',
      headline: 'ADMIN EMERGENCY OVERRIDE ACTIVE — Cumberland Weather Network',
      issued: new Date().toISOString()
    }));
    setFeedback('broadcastFb', '🚨 Emergency mode FORCED', 'danger');
    Log.warn('Broadcast: Emergency override forced by admin');
  });

  $('#clearEmergency')?.addEventListener('click', () => {
    localStorage.removeItem('cwn50s_emergency_override');
    localStorage.removeItem('cwn_override_alert');
    setFeedback('broadcastFb', '✅ Emergency cleared', 'ok');
    Log.ok('Broadcast: Emergency cleared');
  });

  // Theme override
  $('#themeOverride')?.addEventListener('change', e => {
    const val = e.target.value;
    if (val === 'auto') localStorage.removeItem('cwn50s_theme');
    else localStorage.setItem('cwn50s_theme', val);
    Log.info(`Broadcast: Theme → ${val}`);
  });

  // Announcer override
  $('#announcerOverride')?.addEventListener('change', () => {});
  $('#fireAnnouncer')?.addEventListener('click', () => {
    const type = $('#announcerType')?.value || 'weather_update';
    const name = $('#announcerSelect')?.value || 'Earl Henderson';
    localStorage.setItem('cwn50s_announce_override', JSON.stringify({ announcer: name, type, ts: Date.now() }));
    setFeedback('broadcastFb', `🎙 ${name} cued for ${type}`, 'ok');
    Log.ok(`Broadcast: Announcer → ${name} (${type})`);
    Bob.fireAnnouncer(`have ${name} ${type}`);
  });

  // City override
  $('#pusCity')?.addEventListener('click', () => {
    const city = $('#cityOverrideInput')?.value.trim();
    if (!city) return;
    localStorage.setItem('cwn_city', city);
    localStorage.setItem('cwn50s_city_override', city);
    setFeedback('broadcastFb', `📍 City set to ${city}`, 'ok');
    Log.ok(`Broadcast: City override → ${city}`);
  });
}

function setFeedback(id, msg, type = 'ok') {
  const el = $(`#${id}`);
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'danger' ? 'var(--danger)' : type === 'warn' ? 'var(--warn)' : 'var(--ok)';
}

/* ══════════════════════════════════════════════════════
   SOUND LIBRARY
   ══════════════════════════════════════════════════════ */
const SoundLibrary = {
  playlist: [],
  currentIdx: 0,
  isPlaying: false,
  audio: new Audio(),

  load() {
    try {
      this.playlist = JSON.parse(localStorage.getItem('cwn_admin_playlist') || '[]');
    } catch { this.playlist = []; }
    this.renderList();
  },

  save() {
    // Store metadata only (not the full object URLs - those expire)
    const meta = this.playlist.map(t => ({ name: t.name, dur: t.dur, cat: t.cat }));
    localStorage.setItem('cwn_admin_playlist', JSON.stringify(meta));
  },

  addTrack(file) {
    const url = URL.createObjectURL(file);
    const track = {
      id: Date.now() + Math.random(),
      name: file.name.replace(/\.[^.]+$/, ''),
      file: file.name,
      url,
      dur: '—',
      cat: 'music'
    };
    // Get duration
    const tmp = new Audio(url);
    tmp.addEventListener('loadedmetadata', () => {
      track.dur = this.formatDur(tmp.duration);
      this.renderList();
    });
    this.playlist.push(track);
    this.save();
    this.renderList();
    Log.ok(`Sound Library: Added "${track.name}"`);
  },

  formatDur(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2,'0')}`;
  },

  removeTrack(id) {
    this.playlist = this.playlist.filter(t => t.id !== id);
    this.save();
    this.renderList();
  },

  shuffle() {
    for (let i = this.playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
    }
    this.save();
    this.renderList();
    Log.info('Sound Library: Playlist shuffled');
  },

  playTrack(idx) {
    if (!this.playlist[idx] || !this.playlist[idx].url) {
      Log.warn('Sound Library: Track URL expired — re-upload the file to play');
      return;
    }
    this.currentIdx = idx;
    this.audio.src = this.playlist[idx].url;
    this.audio.play().then(() => {
      this.isPlaying = true;
      this.updateNowPlaying();
      this.renderList();
    }).catch(e => Log.fail(`Audio: ${e.message}`));
  },

  playPause() {
    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
      $('#npPlayPause').textContent = '▶';
    } else {
      if (this.audio.src) {
        this.audio.play();
        this.isPlaying = true;
        $('#npPlayPause').textContent = '⏸';
      } else if (this.playlist.length) {
        this.playTrack(0);
      }
    }
  },

  prev() {
    this.currentIdx = (this.currentIdx - 1 + this.playlist.length) % this.playlist.length;
    this.playTrack(this.currentIdx);
  },

  next() {
    this.currentIdx = (this.currentIdx + 1) % this.playlist.length;
    this.playTrack(this.currentIdx);
  },

  updateNowPlaying() {
    const t = this.playlist[this.currentIdx];
    if (!t) return;
    const np = $('#nowPlayingBar');
    if (np) np.style.display = 'flex';
    const label = $('#npTrack');
    if (label) label.textContent = t.name;
    const pp = $('#npPlayPause');
    if (pp) pp.textContent = this.isPlaying ? '⏸' : '▶';
  },

  renderList() {
    const list = $('#playlistList');
    if (!list) return;
    if (!this.playlist.length) {
      list.innerHTML = '<div class="lib-empty">No tracks yet — drag audio files here to upload</div>';
      return;
    }
    list.innerHTML = this.playlist.map((t, i) => `
      <div class="lib-item ${i === this.currentIdx && this.isPlaying ? 'playing' : ''}" data-idx="${i}">
        <span class="li-icon">🎵</span>
        <span class="li-name">${t.name}</span>
        <span class="li-dur">${t.dur}</span>
        <button class="li-del" data-id="${t.id}" title="Remove">✕</button>
      </div>`).join('');

    list.querySelectorAll('.lib-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.classList.contains('li-del')) return;
        this.playTrack(parseInt(el.dataset.idx));
      });
    });
    list.querySelectorAll('.li-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.removeTrack(parseFloat(btn.dataset.id));
      });
    });
  },

  init() {
    this.load();

    // Audio ended → auto-next
    this.audio.addEventListener('ended', () => { this.next(); });

    // Upload zone
    const zone = $('#soundUploadZone');
    const fileInput = $('#soundFileInput');

    if (zone) {
      zone.addEventListener('click', () => fileInput?.click());
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('drag-over');
        [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('audio/')).forEach(f => this.addTrack(f));
      });
    }

    fileInput?.addEventListener('change', () => {
      [...(fileInput.files || [])].forEach(f => this.addTrack(f));
      fileInput.value = '';
    });

    // Controls
    $('#npPlayPause')?.addEventListener('click', () => this.playPause());
    $('#npPrev')?.addEventListener('click', () => this.prev());
    $('#npNext')?.addEventListener('click', () => this.next());
    $('#shufflePlaylist')?.addEventListener('click', () => this.shuffle());
    $('#clearPlaylist')?.addEventListener('click', () => {
      this.playlist = []; this.audio.pause(); this.isPlaying = false;
      this.save(); this.renderList();
      Log.info('Sound Library: Playlist cleared');
    });

    // Volume
    const vol = $('#volumeSlider');
    if (vol) {
      vol.addEventListener('input', () => {
        this.audio.volume = vol.value / 100;
        const label = $('#volLabel');
        if (label) label.textContent = vol.value + '%';
      });
    }
  }
};

/* ══════════════════════════════════════════════════════
   GRAPHICS LIBRARY
   ══════════════════════════════════════════════════════ */
const GraphicsLibrary = {
  images: [],
  activeCategory: 'all',

  load() {
    try {
      this.images = JSON.parse(localStorage.getItem('cwn_admin_graphics') || '[]');
    } catch { this.images = []; }
  },

  save() {
    // Store meta only — URLs are object URLs and won't persist across sessions
    localStorage.setItem('cwn_admin_graphics', JSON.stringify(
      this.images.map(i => ({ id: i.id, name: i.name, cat: i.cat }))
    ));
  },

  addImage(file) {
    const url = URL.createObjectURL(file);
    const img = {
      id: Date.now() + Math.random(),
      name: file.name.replace(/\.[^.]+$/, ''),
      file: file.name,
      url,
      cat: 'all'
    };
    this.images.push(img);
    this.save();
    this.renderGrid();
    Log.ok(`Graphics Library: Added "${img.name}"`);
  },

  removeImage(id) {
    this.images = this.images.filter(i => i.id !== id);
    this.save(); this.renderGrid();
  },

  setCat(id, cat) {
    const img = this.images.find(i => i.id === id);
    if (img) { img.cat = cat; this.save(); this.renderGrid(); }
  },

  renderGrid() {
    const grid = $('#gfxGrid');
    if (!grid) return;
    const filtered = this.activeCategory === 'all'
      ? this.images
      : this.images.filter(i => i.cat === this.activeCategory);

    if (!filtered.length) {
      grid.innerHTML = '<div class="lib-empty">No graphics in this category</div>';
      return;
    }
    grid.innerHTML = filtered.map(img => `
      <div class="gfx-card" data-id="${img.id}">
        <div class="gfx-thumb">
          ${img.url ? `<img src="${img.url}" alt="${img.name}" loading="lazy">` : `<span style="font-size:32px">🖼</span>`}
        </div>
        <div class="gfx-info">
          <div class="gfx-name">${img.name}</div>
          <select class="gfx-cat-sel" data-id="${img.id}" style="background:var(--bg3);color:var(--text3);border:1px solid var(--border);border-radius:4px;font-size:10px;padding:2px;margin-top:4px;width:100%;">
            ${['all','logos','backgrounds','icons','overlays','crests'].map(c => `<option value="${c}" ${img.cat===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <div class="gfx-del" data-id="${img.id}">✕ Remove</div>
        </div>
      </div>`).join('');

    grid.querySelectorAll('.gfx-del').forEach(el => {
      el.addEventListener('click', () => this.removeImage(parseFloat(el.dataset.id)));
    });
    grid.querySelectorAll('.gfx-cat-sel').forEach(sel => {
      sel.addEventListener('change', () => this.setCat(parseFloat(sel.dataset.id), sel.value));
    });
  },

  init() {
    this.load();
    this.renderGrid();

    const zone = $('#gfxUploadZone');
    const fileInput = $('#gfxFileInput');

    if (zone) {
      zone.addEventListener('click', () => fileInput?.click());
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('drag-over');
        [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/')).forEach(f => this.addImage(f));
      });
    }

    fileInput?.addEventListener('change', () => {
      [...(fileInput.files || [])].forEach(f => this.addImage(f));
      fileInput.value = '';
    });

    // Category filters
    $$('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.dataset.cat || 'all';
        this.renderGrid();
      });
    });
  }
};

/* ══════════════════════════════════════════════════════
   WEATHER OVERRIDES
   ══════════════════════════════════════════════════════ */
function initWeatherOverrides() {
  $('#pushWeather')?.addEventListener('click', () => {
    const data = {
      temp:      $('#ovTemp')?.value.trim(),
      condition: $('#ovCondition')?.value.trim(),
      wind:      $('#ovWind')?.value.trim(),
      humidity:  $('#ovHumidity')?.value.trim(),
      ts:        Date.now()
    };
    localStorage.setItem('cwn_override_weather', JSON.stringify(data));
    setFeedback('weatherFb', '✅ Weather override pushed to 50s page', 'ok');
    Log.ok(`Weather override: ${JSON.stringify(data)}`);
  });

  $('#clearWeather')?.addEventListener('click', () => {
    localStorage.removeItem('cwn_override_weather');
    ['#ovTemp','#ovCondition','#ovWind','#ovHumidity'].forEach(s => { if ($(s)) $(s).value = ''; });
    setFeedback('weatherFb', '✅ Weather override cleared — live data restored', 'ok');
    Log.ok('Weather override cleared');
  });
}

/* ══════════════════════════════════════════════════════
   ALERT CONTROL
   ══════════════════════════════════════════════════════ */
function initAlertControl() {
  $('#issueAlert')?.addEventListener('click', () => {
    const data = {
      type:     $('#alertType')?.value,
      severity: $('#alertSeverity')?.value,
      headline: $('#alertHeadline')?.value.trim(),
      issued:   new Date().toISOString()
    };
    if (!data.headline) { setFeedback('alertFb', '⚠ Enter a headline first', 'warn'); return; }
    localStorage.setItem('cwn_override_alert', JSON.stringify(data));
    if (['extreme','severe'].includes(data.severity)) {
      localStorage.setItem('cwn50s_emergency_override', 'true');
    }
    setFeedback('alertFb', `🚨 ${data.type} issued`, 'ok');
    Log.warn(`Alert issued: ${data.type} (${data.severity}) — ${data.headline}`);
  });

  $('#clearAlert')?.addEventListener('click', () => {
    localStorage.removeItem('cwn_override_alert');
    localStorage.removeItem('cwn50s_emergency_override');
    if ($('#alertHeadline')) $('#alertHeadline').value = '';
    setFeedback('alertFb', '✅ Alert cleared', 'ok');
    Log.ok('Alert override cleared');
  });

  $('#pushClosings')?.addEventListener('click', () => {
    const text = $('#closingsText')?.value.trim();
    if (!text) { setFeedback('alertFb', '⚠ Enter school closing info first', 'warn'); return; }
    localStorage.setItem('cwn_override_closings', JSON.stringify({ closings: text, ts: Date.now() }));
    setFeedback('alertFb', '🏫 School closings pushed to ticker', 'ok');
    Log.ok(`School closings: "${text}"`);
  });

  $('#clearClosings')?.addEventListener('click', () => {
    localStorage.removeItem('cwn_override_closings');
    if ($('#closingsText')) $('#closingsText').value = '';
    setFeedback('alertFb', '✅ School closings cleared', 'ok');
  });
}

/* ══════════════════════════════════════════════════════
   TICKER OVERRIDE
   ══════════════════════════════════════════════════════ */
function initTickerOverride() {
  $('#pushTicker')?.addEventListener('click', () => {
    const msg   = $('#tickerMsg')?.value.trim();
    const badge = $('#tickerBadge')?.value.trim() || 'CWN';
    if (!msg) { setFeedback('tickerFb', '⚠ Enter ticker text first', 'warn'); return; }
    localStorage.setItem('cwn_ticker_override', JSON.stringify({ message: msg, badge, ts: Date.now() }));
    setFeedback('tickerFb', '📝 Ticker pushed to all active pages', 'ok');
    Log.ok(`Ticker override: [${badge}] "${msg}"`);
  });

  $('#clearTicker')?.addEventListener('click', () => {
    localStorage.removeItem('cwn_ticker_override');
    if ($('#tickerMsg')) $('#tickerMsg').value = '';
    setFeedback('tickerFb', '✅ Ticker override cleared — live data restored', 'ok');
    Log.ok('Ticker override cleared');
  });
}

/* ══════════════════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════════════════ */
function initSettings() {
  // Change password
  $('#savePassword')?.addEventListener('click', () => {
    const cur = $('#pwCurrent')?.value;
    const nw  = $('#pwNew')?.value;
    const cf  = $('#pwConfirm')?.value;
    const msg = $('#pwMsg');

    if (!Auth.check(Auth.getCreds().user, cur)) {
      if (msg) { msg.textContent = '⚠ Current password is incorrect.'; msg.style.color = 'var(--danger)'; }
      return;
    }
    if (nw.length < 6) {
      if (msg) { msg.textContent = '⚠ New password must be at least 6 characters.'; msg.style.color = 'var(--danger)'; }
      return;
    }
    if (nw !== cf) {
      if (msg) { msg.textContent = '⚠ New passwords do not match.'; msg.style.color = 'var(--danger)'; }
      return;
    }
    Auth.saveCreds(Auth.getCreds().user, nw);
    if (msg) { msg.textContent = '✓ Password updated successfully.'; msg.style.color = 'var(--ok)'; }
    ['#pwCurrent','#pwNew','#pwConfirm'].forEach(s => { if ($(s)) $(s).value = ''; });
    Log.ok('Settings: Password changed');
  });

  // Reset to defaults
  $('#resetDefaults')?.addEventListener('click', () => {
    if (!confirm('Reset credentials to THILL / YoMama69$$?')) return;
    Auth.resetCreds();
    Log.ok('Settings: Credentials reset to defaults');
    alert('Reset complete. Next login: THILL / YoMama69$$');
  });

  // Clear all localStorage
  $('#clearAllStorage')?.addEventListener('click', () => {
    if (!confirm('Clear ALL CWN localStorage keys? This removes all overrides, playlist metadata, and settings.')) return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith('cwn'));
    keys.forEach(k => localStorage.removeItem(k));
    Log.warn(`Settings: Cleared ${keys.length} localStorage keys`);
    alert(`Cleared ${keys.length} CWN keys.`);
  });

  // Export localStorage
  $('#exportStorage')?.addEventListener('click', () => {
    const data = {};
    Object.keys(localStorage).filter(k => k.startsWith('cwn')).forEach(k => data[k] = localStorage.getItem(k));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cwn-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    Log.ok(`Settings: Exported ${Object.keys(data).length} keys`);
  });

  // Import localStorage
  $('#importStorage')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          let count = 0;
          Object.entries(data).forEach(([k, v]) => { if (k.startsWith('cwn')) { localStorage.setItem(k, v); count++; } });
          Log.ok(`Settings: Imported ${count} keys`);
          alert(`Imported ${count} settings keys successfully.`);
        } catch { alert('Invalid JSON file.'); }
      };
      reader.readAsText(file);
    });
    input.click();
  });
}

/* ══════════════════════════════════════════════════════
   AI ROSTER — BUTTONS
   ══════════════════════════════════════════════════════ */
function initAIRoster() {
  // Test announcer buttons
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-announce]');
    if (!btn) return;
    const script = btn.dataset.announce;
    const name   = btn.dataset.name || 'Earl Henderson';
    Bob.fireAnnouncer(`have ${name} ${script}`);
    Log.info(`AI Roster: ${name} → ${script}`);
  });

  // Run diagnostic
  document.addEventListener('click', e => {
    if (e.target.matches('#diagBtn')) Diagnostics.runAll();
  });
}

/* ══════════════════════════════════════════════════════
   STATUS CARD INITS
   ══════════════════════════════════════════════════════ */
function initStatusCards() {
  $('#diagBtn')?.addEventListener('click', () => Diagnostics.runAll());
  // Auto-run a quick diag on load
  setTimeout(() => Diagnostics.runAll(), 1200);
}

/* ══════════════════════════════════════════════════════
   ERA PAGES PANEL
   ══════════════════════════════════════════════════════ */
function initEraPages() {
  $$('.page-card[data-href]').forEach(card => {
    card.addEventListener('click', () => window.open(card.dataset.href, '_blank'));
  });
}

/* ══════════════════════════════════════════════════════
   FULL ADMIN SHELL INIT
   ══════════════════════════════════════════════════════ */
function initAdminShell() {
  Log.init();
  Log.info('CWN Admin Portal loaded — welcome back, Tanner.');

  initPanelRouter();
  initChat();
  SoundLibrary.init();
  GraphicsLibrary.init();
  initBroadcast();
  initWeatherOverrides();
  initAlertControl();
  initTickerOverride();
  initSettings();
  initAIRoster();
  initStatusCards();
  initEraPages();

  // Repair AI auto-scan
  setTimeout(() => Repair.scan(), 2000);

  // Show Bob panel by default
  const bobBtn = $('[data-panel="bob"]');
  if (bobBtn) bobBtn.click();

  Log.ok('Admin shell initialized.');
}

/* ══════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
});


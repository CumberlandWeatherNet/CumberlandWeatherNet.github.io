/* ═══════════════════════════════════════════════════════
   CWN ADMIN PORTAL — admin.js
   Cumberland Weather Network · Full Admin Logic
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ══ CONSTANTS ══ */
const CWN_CREDS_KEY   = 'cwn_admin_creds';
const CWN_SESSION_KEY = 'cwn_admin_session';
const DEFAULT_USER    = 'THILL';
const DEFAULT_PASS    = 'YoMama69$$';

/* ══ UTILS ══ */
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const ts = () => {
  const n = new Date();
  return `[${n.getHours().toString().padStart(2,'0')}:${n.getMinutes().toString().padStart(2,'0')}:${n.getSeconds().toString().padStart(2,'0')}]`;
};
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
  resetCreds() { localStorage.removeItem(CWN_CREDS_KEY); },
  check(u, p) {
    const c = this.getCreds();
    return u.toUpperCase() === c.user.toUpperCase() && p === c.pass;
  },
  isSessionActive() { return sessionStorage.getItem(CWN_SESSION_KEY) === 'active'; },
  startSession()    { sessionStorage.setItem(CWN_SESSION_KEY, 'active'); },
  endSession()      { sessionStorage.removeItem(CWN_SESSION_KEY); }
};

function initLogin() {
  const screen = $('#loginScreen');
  const shell  = $('#adminShell');

  if (Auth.isSessionActive()) {
    screen.classList.add('hidden');
    shell.classList.remove('hidden');
    initAdminShell();
    return;
  }

  const pwField  = $('#loginPw');
  const pwToggle = $('#pwToggle');
  pwToggle.addEventListener('click', () => {
    const isText = pwField.type === 'text';
    pwField.type = isText ? 'password' : 'text';
    pwToggle.textContent = isText ? '👁' : '🙈';
  });

  const loginBtn = $('#loginBtn');
  const errMsg   = $('#loginError');
  loginBtn.addEventListener('click', attemptLogin);
  ['#loginUser','#loginPw'].forEach(s =>
    $(s).addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); })
  );

  function attemptLogin() {
    const u = $('#loginUser').value.trim();
    const p = $('#loginPw').value;
    if (!u || !p) { errMsg.textContent = 'Enter username and password.'; return; }
    if (Auth.check(u, p)) {
      errMsg.textContent = '';
      loginBtn.textContent = 'AUTHENTICATED ✓';
      loginBtn.style.background = 'var(--ok)';
      Auth.startSession();
      setTimeout(() => {
        screen.classList.add('hidden');
        shell.classList.remove('hidden');
        initAdminShell();
      }, 600);
    } else {
      errMsg.textContent = '⚠ Invalid credentials. Try again.';
      pwField.value = '';
      pwField.focus();
    }
  }

  $('#forgotLink').addEventListener('click', () => {
    $('#loginFormMain').classList.add('hidden');
    $('#resetPanel').classList.remove('hidden');
  });
  $('#cancelReset').addEventListener('click', () => {
    $('#resetPanel').classList.add('hidden');
    $('#loginFormMain').classList.remove('hidden');
  });
  $('#doReset').addEventListener('click', () => {
    Auth.resetCreds();
    $('#resetPanel').classList.add('hidden');
    $('#loginFormMain').classList.remove('hidden');
    errMsg.style.color = 'var(--ok)';
    errMsg.textContent = 'Credentials reset. Log in with THILL / YoMama69$$';
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
    const btn = $('#diagBtn');
    if (btn) { btn.textContent = '⏳ Running…'; btn.disabled = true; }

    await Promise.all([
      this.checkNWS(), this.checkRadar(), this.checkCitiesJSON(),
      this.checkHeart(), this.checkSpeechAPI(), this.checkAudioContext()
    ]);

    if (btn) { btn.textContent = '▶ Run Diagnostic'; btn.disabled = false; }
    Log.info('Diagnostic complete.');
  },

  setCard(id, status, val) {
    const card = $(`#sc-${id}`);
    if (!card) return;
    card.className = `status-card ${status}`;
    const ind = status === 'ok' ? '🟢 Online' : status === 'fail' ? '🔴 Offline' : '🟡 Degraded';
    card.querySelector('.sc-val').textContent = val || ind;
    card.querySelector('.sc-indicator').textContent = ind;
    this.results[id] = { status, val };
  },

  async checkNWS() {
    try {
      const r = await fetch('https://api.weather.gov/alerts/active?area=TN',
        { signal: AbortSignal.timeout(8000) });
      r.ok
        ? (this.setCard('nws','ok','NWS API Responding'), Log.ok('NWS API → 200 OK'))
        : (this.setCard('nws','warn',`HTTP ${r.status}`), Log.warn(`NWS API → ${r.status}`));
    } catch(e) {
      this.setCard('nws','fail','No Response'); Log.fail(`NWS API → ${e.message}`);
    }
  },

  async checkRadar() {
    try {
      const r = await fetch(
        'https://radar.weather.gov/ridge/standard/KOHX_N0R_0.gif?' + Date.now(),
        { method: 'HEAD', signal: AbortSignal.timeout(6000) }
      );
      r.ok
        ? (this.setCard('radar','ok','KOHX Responding'), Log.ok('KOHX Radar → 200 OK'))
        : (this.setCard('radar','warn',`HTTP ${r.status}`), Log.warn(`KOHX Radar → ${r.status}`));
    } catch(e) {
      this.setCard('radar','fail','No Response'); Log.fail(`KOHX Radar → ${e.message}`);
    }
  },

  async checkCitiesJSON() {
    try {
      const r = await fetch('/api/cities.json', { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d = await r.json();
        const count = Object.values(d).flat().length;
        this.setCard('cities','ok',`${count} cities loaded`);
        Log.ok(`cities.json → ${count} cities`);
      } else {
        this.setCard('cities','fail',`HTTP ${r.status}`); Log.fail(`cities.json → ${r.status}`);
      }
    } catch(e) {
      this.setCard('cities','warn','Local path only'); Log.warn(`cities.json → ${e.message}`);
    }
  },

  async checkHeart() {
    try {
      const r = await fetch('/core/cwn-heart-full.js', { signal: AbortSignal.timeout(4000) });
      r.ok
        ? (this.setCard('heart','ok','Heart Engine Online'), Log.ok('cwn-heart-full.js → 200 OK'))
        : (this.setCard('heart','warn',`HTTP ${r.status}`), Log.warn(`Heart → ${r.status}`));
    } catch(e) {
      this.setCard('heart','warn','Local path only'); Log.warn(`Heart → ${e.message}`);
    }
  },

  checkSpeechAPI() {
    const avail = 'speechSynthesis' in window;
    this.setCard('speech', avail ? 'ok' : 'fail', avail ? 'Web Speech API Ready' : 'Not supported');
    avail ? Log.ok('Speech API → Available') : Log.fail('Speech API → Not supported');
    if (avail) window.speechSynthesis.getVoices();
    return Promise.resolve();
  },

  checkAudioContext() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.setCard('audio','ok','AudioContext Ready');
      Log.ok('AudioContext → Available');
      ctx.close();
    } catch(e) {
      this.setCard('audio','fail','Not Available');
      Log.fail(`AudioContext → ${e.message}`);
    }
    return Promise.resolve();
  }
};

/* ══════════════════════════════════════════════════════
   REPAIR AI
   ══════════════════════════════════════════════════════ */
class RepairAI {
  scan() {
    Log.info('RepairAI scanning system…');
    let fixes = 0;
    const keys = [
      'cwn_override_weather','cwn_override_alert','cwn_override_closings',
      'cwn_ticker_override','cwn50s_channel_override','cwn50s_emergency_override'
    ];
    keys.forEach(k => {
      try { const v = localStorage.getItem(k); if (v) JSON.parse(v); }
      catch { localStorage.removeItem(k); Log.warn(`RepairAI: Removed corrupt key "${k}"`); fixes++; }
    });
    try {
      const pl = JSON.parse(localStorage.getItem('cwn_admin_playlist') || '[]');
      if (!Array.isArray(pl)) { localStorage.removeItem('cwn_admin_playlist'); fixes++; }
    } catch { localStorage.removeItem('cwn_admin_playlist'); fixes++; }
    fixes === 0 ? Log.ok('RepairAI: System clean') : Log.ok(`RepairAI: Fixed ${fixes} issue(s)`);
    return fixes;
  }

  clearAllOverrides() {
    [
      'cwn_override_weather','cwn_override_alert','cwn_override_closings',
      'cwn_ticker_override','cwn50s_channel_override','cwn50s_auto_override',
      'cwn50s_emergency_override','cwn50s_theme','cwn50s_announce_override','cwn50s_city_override'
    ].forEach(k => localStorage.removeItem(k));
    Log.ok('RepairAI: All overrides cleared');
  }
}

const Repair = new RepairAI();

/* ══════════════════════════════════════════════════════
   BOB AI — Central Communications Hub
   ══════════════════════════════════════════════════════ */
class BobAI {
  constructor() { this.name = 'Bob'; }

  speak(text, voiceHint = null, rate = 0.88, pitch = 1.0) {
    if (!('speechSynthesis' in window)) { Log.fail('Bob: Speech API unavailable'); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = rate; utt.pitch = pitch;
    if (voiceHint) {
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find(v => v.name.toLowerCase().includes(voiceHint.toLowerCase()));
      if (v) utt.voice = v;
    }
    window.speechSynthesis.speak(utt);
    Log.info(`Bob speaking → "${text.substring(0,60)}…"`);
  }

  classify(msg) {
    const m = msg.toLowerCase();
    if (/\b(weather|temp|condition|forecast|humidity|wind|rain|snow|storm)\b/.test(m))   return 'weather';
    if (/\b(earl|walter|barbara|dorothy|announcer|voice|speak|say|announce)\b/.test(m))  return 'announce';
    if (/\b(playlist|music|song|shuffle|play|pause|skip|next|track|audio)\b/.test(m))    return 'playlist';
    if (/\b(diagnos|status|check|ping|test|health|online|offline)\b/.test(m))            return 'diagnostic';
    if (/\b(channel|ch1|ch2|ch3|switch|flip)\b/.test(m))                                 return 'channel';
    if (/\b(theme|day|night|dark|light|mode)\b/.test(m))                                 return 'theme';
    if (/\b(emergency|tornado|alert|warning|watch|eas|override)\b/.test(m))              return 'emergency';
    if (/\b(ticker|scroll|marquee|message|headline)\b/.test(m))                          return 'ticker';
    if (/\b(school|clos|dismiss)\b/.test(m))                                             return 'closings';
    if (/\b(clear|remove|reset|cancel|undo)\b/.test(m))                                  return 'clear';
    if (/\b(help|what can|commands|list)\b/.test(m))                                     return 'help';
    if (/\b(repair|fix|scan|clean|broken)\b/.test(m))                                    return 'repair';
    if (/\b(heart|core|engine|data)\b/.test(m))                                          return 'heart';
    if (/\b(city|location|select|change city)\b/.test(m))                                return 'city';
    return 'general';
  }

  fireAnnouncer(msg) {
    const m = msg.toLowerCase();
    let name = 'Earl Henderson', voice = 'David', script = '';

    if (/walter/.test(m))  { name = 'Walter Grayson';   voice = 'David'; }
    if (/barbara/.test(m)) { name = 'Barbara Collins';  voice = 'Zira';  }
    if (/dorothy/.test(m)) { name = 'Dorothy Sinclair'; voice = 'Zira';  }
    if (/earl/.test(m))    { name = 'Earl Henderson';   voice = 'David'; }

    if      (/sign.on/.test(m))   script = `Good morning, Middle Tennessee. This is ${name} with the Cumberland Weather Network. Welcome to your CWN weather broadcast.`;
    else if (/sign.off/.test(m))  script = `This is ${name} for the Cumberland Weather Network. That wraps up tonight's broadcast. Stay safe, Middle Tennessee. Good night.`;
    else if (/emergency/.test(m)) script = `ATTENTION. The National Weather Service has issued an emergency alert for Middle Tennessee. Please stand by for critical information.`;
    else {
      const hr = new Date().getHours();
      const greet = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
      const pool = [
        `Good ${greet}, Middle Tennessee. ${name} here with the Cumberland Weather Network. Here's your latest weather update.`,
        `You're watching the Cumberland Weather Network. I'm ${name}. Let's take a look at current conditions across the region.`,
        `This is ${name} on the Cumberland Weather Network. We're tracking the latest data for Middle Tennessee. Here's what you need to know.`
      ];
      script = pool[Math.floor(Math.random() * pool.length)];
    }

    this.speak(script, voice, 0.88, voice === 'Zira' ? 1.1 : 0.92);
    return `🎙 ${name} is now on-air.`;
  }

  async process(userMsg) {
    const intent = this.classify(userMsg);
    Log.info(`Bob: Intent → "${intent}"`);
    await sleep(400 + Math.random() * 500);

    switch (intent) {

      case 'weather': {
        const city = localStorage.getItem('cwn_city') || 'Lebanon';
        const ov = localStorage.getItem('cwn_override_weather');
        if (ov) {
          try {
            const d = JSON.parse(ov);
            return `📡 Override active for ${city}: ${d.temp||'--'}°F, ${d.condition||'--'}, Wind ${d.wind||'--'}, Humidity ${d.humidity||'--'}%\n\nClear it in the Weather Overrides panel or tell me "clear weather".`;
          } catch {}
        }
        return `📡 Live weather for **${city}** is pulling from the NWS feed via CWN Heart. All data is live — no override active.\n\nTell me to override weather, or check the System Status panel for API health.`;
      }

      case 'announce':
        return this.fireAnnouncer(userMsg);

      case 'playlist': {
        const m = userMsg.toLowerCase();
        if (/shuffle/.test(m))       { SoundLibrary.shuffle();   return '🔀 Playlist shuffled — new random order locked in.'; }
        if (/play/.test(m))          { SoundLibrary.playPause(); return '▶ Playback toggled.'; }
        if (/skip|next/.test(m))     { SoundLibrary.next();      return '⏭ Skipped to next track.'; }
        if (/pause|stop/.test(m))    { SoundLibrary.playPause(); return '⏸ Playback paused.'; }
        return `🎵 Playlist has **${SoundLibrary.playlist.length}** track(s) loaded. Say: shuffle, play, skip, or pause. Upload more files in the Sound Library panel.`;
      }

      case 'diagnostic': {
        this.addBobMsg('⏳ Running diagnostics now…');
        await Diagnostics.runAll();
        const r = Diagnostics.results;
        const summary = Object.entries(r).map(([k,v]) => `• ${k}: ${v.status === 'ok' ? '✓' : '✗'} ${v.val}`).join('\n');
        const all = Object.values(r).every(v => v.status === 'ok');
        return `🔧 Diagnostic complete.\n${summary}\n\n${all ? 'Everything is running great, boss.' : 'Some issues found — check the System Status panel.'}`;
      }

      case 'channel': {
        const m = userMsg.toLowerCase();
        const ch = m.includes('ch1')||m.includes('channel 1') ? '1'
                 : m.includes('ch2')||m.includes('channel 2') ? '2'
                 : m.includes('ch3')||m.includes('channel 3') ? '3' : null;
        if (ch) {
          localStorage.setItem('cwn50s_channel_override', ch);
          Log.ok(`Bob: Channel → CH${ch}`);
          return `📺 CH${ch} override sent. The 50s broadcast page will switch on next cycle.\n\n• CH1 = Current Conditions\n• CH2 = Forecast\n• CH3 = Radar`;
        }
        return 'Which channel? Say "switch to CH1", "CH2", or "CH3".';
      }

      case 'theme': {
        const night = /night|dark/.test(userMsg.toLowerCase());
        const val = night ? 'night' : 'day';
        localStorage.setItem('cwn50s_theme', val);
        Log.ok(`Bob: Theme → ${val}`);
        return `🌙 Theme set to **${val}** mode on the 50s page.`;
      }

      case 'emergency': {
        const m = userMsg.toLowerCase();
        if (/clear|cancel|off/.test(m)) {
          localStorage.removeItem('cwn50s_emergency_override');
          localStorage.removeItem('cwn_override_alert');
          Log.ok('Bob: Emergency cleared');
          return '✅ Emergency override cleared. Normal broadcast resumed.';
        }
        localStorage.setItem('cwn_override_alert', JSON.stringify({
          type: 'Tornado Warning', severity: 'extreme',
          headline: 'TORNADO WARNING — NWS has issued a Tornado Warning for Middle Tennessee. Take shelter immediately.',
          issued: new Date().toISOString()
        }));
        localStorage.setItem('cwn50s_emergency_override', 'true');
        Log.warn('Bob: Emergency override activated');
        return '🚨 **Emergency override ACTIVE.** Tornado Warning pushed to the broadcast.\n\nSay "clear emergency" when you want to return to normal.';
      }

      case 'ticker': {
        const clean = userMsg.replace(/\b(ticker|set|push|send|message|to|the)\b/gi,'').trim();
        if (clean.length > 4) {
          localStorage.setItem('cwn_ticker_override', JSON.stringify({ message: clean, badge: 'ADMIN', ts: Date.now() }));
          Log.ok(`Bob: Ticker → "${clean}"`);
          return `📝 Ticker updated: **"${clean}"**`;
        }
        return 'What should the ticker say? Example: "set ticker to Flood Advisory in Effect Until 8PM"';
      }

      case 'closings': {
        const text = userMsg.replace(/\b(school|closings?|set|push|add)\b/gi,'').trim();
        if (text.length > 4) {
          localStorage.setItem('cwn_override_closings', JSON.stringify({ closings: text, ts: Date.now() }));
          Log.ok('Bob: School closings pushed');
          return `🏫 School closing posted to ticker: **"${text}"**`;
        }
        return 'Tell me which closings to post. Example: "school closings: Lebanon Special School District — Closed Tomorrow"';
      }

      case 'clear': {
        const m = userMsg.toLowerCase();
        if (/all|everything/.test(m)) { Repair.clearAllOverrides(); return '🧹 All overrides cleared. 50s page is back to normal.'; }
        if (/weather/.test(m)) { localStorage.removeItem('cwn_override_weather'); return '✅ Weather override cleared.'; }
        if (/ticker/.test(m))  { localStorage.removeItem('cwn_ticker_override');  return '✅ Ticker override cleared.'; }
        if (/alert|emergency/.test(m)) {
          localStorage.removeItem('cwn_override_alert');
          localStorage.removeItem('cwn50s_emergency_override');
          return '✅ Alert and emergency override cleared.';
        }
        return 'What do you want cleared? Weather, ticker, alert, or everything?';
      }

      case 'repair': {
        const fixes = Repair.scan();
        return `🔧 RepairAI scan done. ${fixes === 0 ? 'System is clean — no issues found.' : `Fixed ${fixes} issue(s). Check the System Log.`}`;
      }

      case 'heart':
        return `❤ CWN Heart (/core/cwn-heart-full.js) exports:\n• getCityCoords(city)\n• getConditions(lat, lon)\n• getAlerts(lat, lon)\n• getRadarUrl(station)\n• fetchNWSPeriods(lat, lon)\n\nAll era pages pull from it. Want me to run a connectivity check?`;

      case 'city': {
        const clean = userMsg.replace(/\b(set|change|city|to|select|location)\b/g,'').trim();
        if (clean.length > 2) {
          localStorage.setItem('cwn_city', clean);
          localStorage.setItem('cwn50s_city_override', clean);
          Log.ok(`Bob: City → ${clean}`);
          return `📍 City set to **${clean}** across all pages.`;
        }
        const cur = localStorage.getItem('cwn_city') || 'Lebanon';
        return `📍 Current city: **${cur}**. Say "set city to Murfreesboro" to change it.`;
      }

      case 'help':
        return `Here's what I can do, boss:\n\n📡 **Weather** — "what's the weather?"\n📺 **Channels** — "switch to CH1/CH2/CH3"\n🎙 **Announcers** — "have Earl do a sign-on" / "Barbara weather update"\n🔀 **Playlist** — "shuffle", "skip", "play", "pause"\n🔧 **Diagnostics** — "run diagnostics" / "check system status"\n🚨 **Emergency** — "activate tornado warning" / "clear emergency"\n📝 **Ticker** — "set ticker to [message]"\n🏫 **Closings** — "school closings: [info]"\n🧹 **Clear** — "clear all overrides" / "clear weather"\n🌙 **Theme** — "set night mode"\n📍 **City** — "set city to Nashville"\n🔧 **Repair** — "scan for issues"\n\nJust talk naturally — I'll figure it out.`;

      default: {
        const pool = [
          "I hear you. Be a bit more specific? Try weather, diagnostics, a channel switch, or an announcer command.",
          "Standing by. I can switch channels, push alerts, shuffle music, or have an announcer take it away. What do you need?",
          "Got it. Not totally sure what you're after — try asking me to check status, run diagnostics, or control the broadcast."
        ];
        return pool[Math.floor(Math.random() * pool.length)];
      }
    }
  }

  addBobMsg(text) {
    const win = $('#chatWindow');
    const div = document.createElement('div');
    div.className = 'chat-msg bob';
    div.innerHTML = `
      <div class="msg-avatar">BOB</div>
      <div class="msg-bubble">
        <div class="msg-sender">Bob · CWN Comms AI</div>
        <div class="msg-text">${text.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</div>
      </div>`;
    win.appendChild(div);
    win.scrollTop = win.scrollHeight;
    return div;
  }
}

const Bob = new BobAI();

/* ══════════════════════════════════════════════════════
   CHAT
   ══════════════════════════════════════════════════════ */
function initChat() {
  const win   = $('#chatWindow');
  const input = $('#chatInput');
  const send  = $('#chatSend');

  setTimeout(() => {
    Bob.addBobMsg("Hey Tanner — Bob here. I'm online and all systems are linked. What do you need?");
  }, 500);

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user';
    userDiv.innerHTML = `
      <div class="msg-avatar">YOU</div>
      <div class="msg-bubble">
        <div class="msg-sender">Tanner</div>
        <div class="msg-text">${text}</div>
      </div>`;
    win.appendChild(userDiv);
    win.scrollTop = win.scrollHeight;

    const typing = document.createElement('div');
    typing.className = 'chat-msg bob typing';
    typing.innerHTML = `
      <div class="msg-avatar">BOB</div>
      <div class="msg-bubble">
        <div class="msg-sender">Bob · CWN Comms AI</div>
        <div class="msg-text">Bob is thinking…</div>
      </div>`;
    win.appendChild(typing);
    win.scrollTop = win.scrollHeight;

    const response = await Bob.process(text);
    typing.remove();
    Bob.addBobMsg(response);
  }

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  $$('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.cmd || btn.textContent.trim();
      sendMessage();
    });
  });
}

/* ══════════════════════════════════════════════════════
   SOUND LIBRARY
   ══════════════════════════════════════════════════════ */
const SoundLibrary = {
  playlist: [],
  currentIdx: 0,
  isPlaying: false,
  audio: new Audio(),

  init() {
    try { this.playlist = JSON.parse(localStorage.getItem('

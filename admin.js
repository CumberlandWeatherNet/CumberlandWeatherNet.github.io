/* ═══════════════════════════════════════════════════════
   CWN ADMIN PORTAL — admin.js  (FULLY FIXED BUILD)
   Cumberland Weather Network · Full Admin Logic
   All HTML ID mismatches corrected. All global onclick
   functions defined. Zero null-ref crashes.
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
  return `[${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}]`;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safeGet  = id => document.getElementById(id);
const safeText = (id, val) => { const el = safeGet(id); if (el) el.textContent = val; };
const safeHTML = (id, val) => { const el = safeGet(id); if (el) el.innerHTML  = val; };
const safeVal  = id => safeGet(id)?.value || '';

/* ══════════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════════ */
const Auth = {
  getCreds() {
    try { return JSON.parse(localStorage.getItem(CWN_CREDS_KEY)) || { user: DEFAULT_USER, pass: DEFAULT_PASS }; }
    catch { return { user: DEFAULT_USER, pass: DEFAULT_PASS }; }
  },
  saveCreds(user, pass)  { localStorage.setItem(CWN_CREDS_KEY, JSON.stringify({ user, pass })); },
  resetCreds()           { localStorage.removeItem(CWN_CREDS_KEY); },
  check(u, p)            { const c = this.getCreds(); return u.toUpperCase() === c.user.toUpperCase() && p === c.pass; },
  isSessionActive()      { return sessionStorage.getItem(CWN_SESSION_KEY) === 'active'; },
  startSession()         { sessionStorage.setItem(CWN_SESSION_KEY, 'active'); },
  endSession()           { sessionStorage.removeItem(CWN_SESSION_KEY); }
};

/* ══════════════════════════════════════════════════════
   LOGIN  (HTML IDs: loginScreen, adminShell, loginUser,
           loginPass, pwToggle, loginForm, loginError,
           showReset, resetPanel, backToLogin)
══════════════════════════════════════════════════════ */
function initLogin() {
  const screen = safeGet('loginScreen');
  const shell  = safeGet('adminShell');

  if (Auth.isSessionActive()) {
    if (screen) screen.classList.add('hidden');
    if (shell)  shell.style.display = 'flex';
    initAdminShell();
    return;
  }

  /* password toggle */
  const pwField  = safeGet('loginPass');
  const pwToggle = safeGet('pwToggle');
  if (pwToggle && pwField) {
    pwToggle.addEventListener('click', () => {
      pwField.type = pwField.type === 'text' ? 'password' : 'text';
      pwToggle.textContent = pwField.type === 'text' ? '🙈' : '👁';
    });
  }

  const errMsg = safeGet('loginError');

  function attemptLogin() {
    const u = safeGet('loginUser')?.value.trim() || '';
    const p = safeGet('loginPass')?.value        || '';
    if (!u || !p) { if (errMsg) errMsg.textContent = 'Enter username and password.'; return; }
    if (Auth.check(u, p)) {
      if (errMsg) errMsg.textContent = '';
      const btn = safeGet('loginForm')?.querySelector('[type="submit"]');
      if (btn) { btn.textContent = 'AUTHENTICATED ✓'; btn.style.background = '#20c070'; }
      Auth.startSession();
      setTimeout(() => {
        if (screen) screen.classList.add('hidden');
        if (shell)  shell.style.display = 'flex';
        initAdminShell();
      }, 600);
    } else {
      if (errMsg) errMsg.textContent = '⚠ Invalid credentials.';
      if (pwField) { pwField.value = ''; pwField.focus(); }
    }
  }

  safeGet('loginForm')?.addEventListener('submit', e => { e.preventDefault(); attemptLogin(); });
  ['loginUser','loginPass'].forEach(id =>
    safeGet(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); })
  );
  safeGet('showReset')?.addEventListener('click', () => {
    const f = safeGet('loginForm'), r = safeGet('resetPanel');
    if (f) f.style.display = 'none';
    if (r) r.style.display = 'block';
  });
  safeGet('backToLogin')?.addEventListener('click', () => {
    const r = safeGet('resetPanel'), f = safeGet('loginForm');
    if (r) r.style.display = 'none';
    if (f) f.style.display = '';
  });
}

/* ══════════════════════════════════════════════════════
   SYSTEM LOG  (HTML id="logBox")
══════════════════════════════════════════════════════ */
const Log = {
  _box: null,
  init() { this._box = safeGet('logBox'); },
  append(msg, type = 'info') {
    if (!this._box) return;
    const d = document.createElement('div');
    d.className = `log-line ${type}`;
    d.textContent = `${ts()} ${msg}`;
    this._box.appendChild(d);
    this._box.scrollTop = this._box.scrollHeight;
  },
  ok(msg)   { this.append('✓ ' + msg, 'ok');   },
  fail(msg) { this.append('✗ ' + msg, 'fail'); },
  warn(msg) { this.append('⚠ ' + msg, 'warn'); },
  info(msg) { this.append('→ ' + msg, 'info'); }
};

/* ══════════════════════════════════════════════════════
   DIAGNOSTICS
   Status cards:  id="sc-{key}"  (nws|radar|cities|heart|speech|audio)
   Value label:   id="scv-{key}"
   Indicator:     id="sci-{key}"
   Run button:    id="runDiagBtn"
══════════════════════════════════════════════════════ */
const Diagnostics = {
  results: {},

  async runAll() {
    Log.info('Running full CWN system diagnostic…');
    /* ── FIX: was $('#diagBtn') — HTML id is "runDiagBtn" ── */
    const btn = safeGet('runDiagBtn');
    if (btn) { btn.textContent = '⏳ Running…'; btn.disabled = true; }

    await Promise.all([
      this.checkNWS(), this.checkRadar(), this.checkCitiesJSON(),
      this.checkHeart(), this.checkSpeechAPI(), this.checkAudioContext()
    ]);

    if (btn) { btn.textContent = '▶ Run Full Diagnostic'; btn.disabled = false; }
    Log.info('Diagnostic complete.');
  },

  setCard(key, status, val) {
    /* card container */
    const card = safeGet(`sc-${key}`);
    if (card) card.className = `status-card ${status}`;
    /* ── FIX: HTML uses #scv-X / #sci-X, not .sc-val / .sc-indicator classes ── */
    const ind = status === 'ok' ? '🟢 Online' : status === 'fail' ? '🔴 Offline' : '🟡 Degraded';
    safeText(`scv-${key}`, val || ind);
    safeText(`sci-${key}`, ind);
    this.results[key] = { status, val };
  },

  async checkNWS() {
    try {
      const r = await fetch('https://api.weather.gov/alerts/active?area=TN',
        { signal: AbortSignal.timeout(8000) });
      r.ok
        ? (this.setCard('nws','ok','NWS API Responding'),  Log.ok('NWS API → 200 OK'))
        : (this.setCard('nws','warn',`HTTP ${r.status}`),  Log.warn(`NWS API → ${r.status}`));
    } catch(e) { this.setCard('nws','fail','No Response'); Log.fail(`NWS API → ${e.message}`); }
  },

  async checkRadar() {
    try {
      const r = await fetch(
        'https://radar.weather.gov/ridge/standard/KOHX_N0R_0.gif?' + Date.now(),
        { method:'HEAD', signal: AbortSignal.timeout(6000) });
      r.ok
        ? (this.setCard('radar','ok','KOHX Responding'),    Log.ok('KOHX Radar → 200 OK'))
        : (this.setCard('radar','warn',`HTTP ${r.status}`), Log.warn(`KOHX Radar → ${r.status}`));
    } catch(e) { this.setCard('radar','fail','No Response'); Log.fail(`KOHX Radar → ${e.message}`); }
  },

  async checkCitiesJSON() {
    try {
      const r = await fetch('./api/cities.json', { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d = await r.json();
        const count = Object.values(d).reduce((a,v) => a + Object.keys(v).length, 0);
        this.setCard('cities','ok',`${count} cities`);
        Log.ok(`cities.json → ${count} cities`);
      } else { this.setCard('cities','fail',`HTTP ${r.status}`); Log.fail(`cities.json → ${r.status}`); }
    } catch(e) { this.setCard('cities','warn','Local path'); Log.warn(`cities.json → ${e.message}`); }
  },

  async checkHeart() {
    try {
      const r = await fetch('./core/cwn-heart-full.js', { signal: AbortSignal.timeout(4000) });
      r.ok
        ? (this.setCard('heart','ok','Heart Engine Online'), Log.ok('cwn-heart-full.js → 200 OK'))
        : (this.setCard('heart','warn',`HTTP ${r.status}`), Log.warn(`Heart → ${r.status}`));
    } catch(e) { this.setCard('heart','warn','Local path'); Log.warn(`Heart → ${e.message}`); }
  },

  checkSpeechAPI() {
    const ok = 'speechSynthesis' in window;
    this.setCard('speech', ok ? 'ok':'fail', ok ? 'Web Speech API Ready':'Not Supported');
    ok ? Log.ok('Speech API → Available') : Log.fail('Speech API → Not supported');
    if (ok) window.speechSynthesis.getVoices();
    return Promise.resolve();
  },

  checkAudioContext() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.setCard('audio','ok','AudioContext Ready');
      Log.ok('AudioContext → Available');
      ctx.close();
    } catch(e) { this.setCard('audio','fail','Not Available'); Log.fail(`AudioContext → ${e.message}`); }
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
    [
      'cwn_override_weather','cwn_override_alert','cwn_override_closings',
      'cwn_ticker_override','cwn50s_channel_override','cwn50s_emergency_override'
    ].forEach(k => {
      try { const v = localStorage.getItem(k); if (v) JSON.parse(v); }
      catch { localStorage.removeItem(k); Log.warn(`Removed corrupt key "${k}"`); fixes++; }
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
      'cwn50s_emergency_override','cwn50s_announce_override','cwn50s_city_override'
    ].forEach(k => localStorage.removeItem(k));
    Log.ok('RepairAI: All overrides cleared');
  }
}
const Repair = new RepairAI();

/* ══════════════════════════════════════════════════════
   BOB AI
══════════════════════════════════════════════════════ */
class BobAI {
  speak(text, voiceHint, rate = 0.88, pitch = 1.0) {
    if (!('speechSynthesis' in window)) { Log.fail('Bob: Speech API unavailable'); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = rate; utt.pitch = pitch;
    if (voiceHint) {
      const v = window.speechSynthesis.getVoices()
        .find(v => v.name.toLowerCase().includes(voiceHint.toLowerCase()));
      if (v) utt.voice = v;
    }
    window.speechSynthesis.speak(utt);
    Log.info(`Bob speaking → "${text.substring(0,60)}…"`);
  }

  classify(msg) {
    const m = msg.toLowerCase();
    if (/\b(weather|temp|condition|forecast|humidity|wind|rain|snow|storm)\b/.test(m))  return 'weather';
    if (/\b(earl|walter|barbara|dorothy|announcer|voice|speak|say|announce)\b/.test(m)) return 'announce';
    if (/\b(playlist|music|song|shuffle|play|pause|skip|next|track|audio)\b/.test(m))   return 'playlist';
    if (/\b(diagnos|status|check|ping|test|health|online|offline)\b/.test(m))           return 'diagnostic';
    if (/\b(channel|ch1|ch2|ch3|switch|flip)\b/.test(m))                                return 'channel';
    if (/\b(theme|day|night|dark|light|mode)\b/.test(m))                                return 'theme';
    if (/\b(emergency|tornado|alert|warning|watch|eas)\b/.test(m))                      return 'emergency';
    if (/\b(ticker|scroll|marquee|headline)\b/.test(m))                                  return 'ticker';
    if (/\b(school|clos|dismiss)\b/.test(m))                                             return 'closings';
    if (/\b(clear|remove|reset|cancel|undo)\b/.test(m))                                  return 'clear';
    if (/\b(help|what can|commands|list)\b/.test(m))                                     return 'help';
    if (/\b(repair|fix|scan|clean|broken)\b/.test(m))                                   return 'repair';
    if (/\b(heart|core|engine|data)\b/.test(m))                                          return 'heart';
    if (/\b(city|location|select|change city)\b/.test(m))                                return 'city';
    return 'general';
  }

  fireAnnouncer(msg) {
    const m = msg.toLowerCase();
    let name = 'Earl Henderson', voice = 'David';
    if (/walter/.test(m))  { name = 'Walter Grayson';   voice = 'David'; }
    if (/barbara/.test(m)) { name = 'Barbara Collins';  voice = 'Zira';  }
    if (/dorothy/.test(m)) { name = 'Dorothy Sinclair'; voice = 'Zira';  }
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
    let script;
    if      (/sign.on/.test(m))   script = `Good morning, Middle Tennessee. This is ${name} with the Cumberland Weather Network. Welcome to your CWN weather broadcast.`;
    else if (/sign.off/.test(m))  script = `This is ${name} for the Cumberland Weather Network. That wraps up tonight's broadcast. Stay safe, Middle Tennessee. Good night.`;
    else if (/emergency/.test(m)) script = `ATTENTION. The National Weather Service has issued an emergency alert for Middle Tennessee. Please stand by for critical information.`;
    else {
      const pool = [
        `Good ${greet}, Middle Tennessee. ${name} here with the Cumberland Weather Network. Here's your latest weather update.`,
        `You're watching the Cumberland Weather Network. I'm ${name}. Let's take a look at current conditions across the region.`,
        `This is ${name} on the Cumberland Weather Network. We are tracking the latest data for Middle Tennessee. Here is what you need to know.`
      ];
      script = pool[Math.floor(Math.random() * pool.length)];
    }
    this.speak(script, voice, 0.88, voice === 'Zira' ? 1.1 : 0.92);
    return `🎙 ${name} is now on-air.`;
  }

  async process(userMsg) {
    const intent = this.classify(userMsg);
    Log.info(`Bob: Intent → "${intent}"`);
    await sleep(350 + Math.random() * 450);

    switch (intent) {
      case 'weather': {
        const city = localStorage.getItem('cwn_city') || 'Lebanon';
        const ov   = localStorage.getItem('cwn_override_weather');
        if (ov) {
          try {
            const d = JSON.parse(ov);
            return `📡 **Override active** for ${city}:\n${d.temp||'--'}°F · ${d.condition||'--'} · Wind ${d.wind||'--'} · Humidity ${d.humidity||'--'}%\n\nSay "clear weather" to remove the override.`;
          } catch {}
        }
        return `📡 Live weather for **${city}** is pulling from the NWS feed via CWN Heart. No override active.\n\nSay "override weather" or check System Status for API health.`;
      }
      case 'announce': return this.fireAnnouncer(userMsg);
      case 'playlist': {
        const m = userMsg.toLowerCase();
        if (/shuffle/.test(m))    { SoundLibrary.shuffle();   return '🔀 Playlist shuffled.'; }
        if (/play/.test(m))       { SoundLibrary.playPause(); return '▶ Playback toggled.'; }
        if (/skip|next/.test(m))  { SoundLibrary.next();      return '⏭ Skipped to next track.'; }
        if (/pause|stop/.test(m)) { SoundLibrary.playPause(); return '⏸ Playback paused.'; }
        return `🎵 Playlist has **${SoundLibrary.playlist.length}** track(s). Say: shuffle, play, skip, or pause.`;
      }
      case 'diagnostic': {
        this._addMsg('⏳ Running diagnostics now…');
        await Diagnostics.runAll();
        const r = Diagnostics.results;
        const lines = Object.entries(r).map(([k,v]) => `• ${k}: ${v.status==='ok'?'✓':'✗'} ${v.val}`).join('\n');
        const allOk = Object.values(r).every(v => v.status==='ok');
        return `🔧 Diagnostic complete.\n${lines}\n\n${allOk ? 'Everything running great, boss.' : 'Some issues found — check System Status panel.'}`;
      }
      case 'channel': {
        const m = userMsg.toLowerCase();
        const ch = m.includes('ch1')||m.includes('channel 1') ? '0'
                 : m.includes('ch2')||m.includes('channel 2') ? '1'
                 : m.includes('ch3')||m.includes('channel 3') ? '2' : null;
        if (ch) { localStorage.setItem('cwn50s_channel_override', ch); return `📺 CH${+ch+1} override sent.`; }
        return 'Which channel? Say "switch to CH1" (Conditions), "CH2" (Forecast), or "CH3" (Radar).';
      }
      case 'theme': {
        const val = /night|dark/.test(userMsg.toLowerCase()) ? 'night' : 'day';
        localStorage.setItem('cwn50s_theme', val);
        return `🌙 Theme set to **${val}** mode on the 50s page.`;
      }
      case 'emergency': {
        const m = userMsg.toLowerCase();
        if (/clear|cancel|off/.test(m)) {
          localStorage.removeItem('cwn50s_emergency_override');
          localStorage.removeItem('cwn_override_alert');
          return '✅ Emergency override cleared. Normal broadcast resumed.';
        }
        localStorage.setItem('cwn_override_alert', JSON.stringify({
          type:'Tornado Warning', severity:'extreme',
          headline:'TORNADO WARNING — NWS has issued a Tornado Warning for Middle Tennessee. Take shelter immediately.',
          issued: new Date().toISOString()
        }));
        localStorage.setItem('cwn50s_emergency_override','true');
        Log.warn('Bob: Emergency override activated');
        return '🚨 **Emergency override ACTIVE.** Tornado Warning pushed.\n\nSay "clear emergency" to return to normal.';
      }
      case 'ticker': {
        const clean = userMsg.replace(/\b(ticker|set|push|send|message|to|the)\b/gi,'').trim();
        if (clean.length > 4) {
          localStorage.setItem('cwn_ticker_override', JSON.stringify({ message:clean, badge:'ADMIN', ts: Date.now() }));
          return `📝 Ticker updated: **"${clean}"**`;
        }
        return 'What should the ticker say? Example: "set ticker to Flood Advisory in Effect Until 8PM"';
      }
      case 'closings': {
        const text = userMsg.replace(/\b(school|closings?|set|push|add)\b/gi,'').trim();
        if (text.length > 4) {
          localStorage.setItem('cwn_override_closings', JSON.stringify({ closings:text, ts: Date.now() }));
          return `🏫 School closing posted: **"${text}"**`;
        }
        return 'Tell me which closings to post. Example: "school closings: Lebanon Special School District — Closed Tomorrow"';
      }
      case 'clear': {
        const m = userMsg.toLowerCase();
        if (/all|everything/.test(m))  { Repair.clearAllOverrides(); return '🧹 All overrides cleared.'; }
        if (/weather/.test(m))         { localStorage.removeItem('cwn_override_weather');  return '✅ Weather override cleared.'; }
        if (/ticker/.test(m))          { localStorage.removeItem('cwn_ticker_override');   return '✅ Ticker override cleared.'; }
        if (/alert|emergency/.test(m)) {
          localStorage.removeItem('cwn_override_alert');
          localStorage.removeItem('cwn50s_emergency_override');
          return '✅ Alert/emergency override cleared.';
        }
        return 'What do you want cleared? Weather, ticker, alert, or everything?';
      }
      case 'repair': {
        const fixes = Repair.scan();
        return `🔧 RepairAI scan done. ${fixes===0 ? 'System is clean.' : `Fixed ${fixes} issue(s). Check System Log.`}`;
      }
      case 'heart':
        return `❤ CWN Heart (/core/cwn-heart-full.js) exports:\n• getCityCoords(city)\n• getConditions(lat,lon)\n• getAlerts(lat,lon)\n• getRadarUrl(station)\n• fetchNWSPeriods(lat,lon)\n\nAll era pages pull from it. Want me to run a connectivity check?`;
      case 'city': {
        const clean = userMsg.replace(/\b(set|change|city|to|select|location)\b/g,'').trim();
        if (clean.length > 2) {
          localStorage.setItem('cwn_city', clean);
          localStorage.setItem('cwn50s_city_override', clean);
          return `📍 City set to **${clean}** across all pages.`;
        }
        return `📍 Current city: **${localStorage.getItem('cwn_city')||'Lebanon'}**. Say "set city to Nashville" to change.`;
      }
      case 'help':
        return `Here's what I can do, boss:\n\n📡 **Weather** — "what's the weather?"\n📺 **Channels** — "switch to CH1/CH2/CH3"\n🎙 **Announcers** — "have Earl do a sign-on"\n🔀 **Playlist** — "shuffle / skip / play / pause"\n🔧 **Diagnostics** — "run diagnostics"\n🚨 **Emergency** — "activate tornado warning"\n📝 **Ticker** — "set ticker to [message]"\n🏫 **Closings** — "school closings: [info]"\n🧹 **Clear** — "clear all overrides"\n🌙 **Theme** — "set night mode"\n📍 **City** — "set city to Nashville"\n🔧 **Repair** — "scan for issues"`;
      default: {
        const pool = [
          "I hear you. Be more specific? Try weather, diagnostics, a channel switch, or an announcer command.",
          "Standing by. I can switch channels, push alerts, shuffle music, or fire an announcer. What do you need?",
          "Got it — not totally sure what you're after. Try asking me to check status, run diagnostics, or control the broadcast."
        ];
        return pool[Math.floor(Math.random() * pool.length)];
      }
    }
  }

  _addMsg(text, sender = 'bob') {
    const win = safeGet('chatWindow');
    if (!win) return null;
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    div.innerHTML = `
      <div class="msg-avatar">${sender === 'bob' ? 'BOB' : 'YOU'}</div>
      <div class="msg-bubble">
        <div class="msg-sender">${sender === 'bob' ? 'Bob · CWN Comms AI' : 'Tanner'}</div>
        <div class="msg-text">${text
          .replace(/</g,'&lt;')
          .replace(/\n/g,'<br>')
          .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</div>
      </div>`;
    win.appendChild(div);
    win.scrollTop = win.scrollHeight;
    return div;
  }
}
const Bob = new BobAI();

/* ══════════════════════════════════════════════════════
   CHAT  (HTML IDs: chatWindow, chatInput, chatSend)
══════════════════════════════════════════════════════ */
function initChat() {
  const win   = safeGet('chatWindow');
  const input = safeGet('chatInput');
  const send  = safeGet('chatSend');
  if (!win || !input || !send) return;

  setTimeout(() => Bob._addMsg("Hey Tanner — Bob here. I'm online and all systems are linked. What do you need?"), 700);

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    Bob._addMsg(text, 'user');

    const typing = document.createElement('div');
    typing.className = 'chat-msg bob typing';
    typing.innerHTML = `
      <div class="msg-avatar">BOB</div>
      <div class="msg-bubble">
        <div class="msg-sender">Bob · CWN Comms AI</div>
        <div class="msg-text" style="color:var(--text3);font-style:italic">Bob is thinking…</div>
      </div>`;
    win.appendChild(typing);
    win.scrollTop = win.scrollHeight;

    const response = await Bob.process(text);
    typing.remove();
    Bob._addMsg(response);
  }

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  $$('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => { input.value = btn.dataset.q || btn.textContent.trim(); sendMessage(); });
  });
}

/* ══════════════════════════════════════════════════════
   PANEL ROUTER  (sidebar data-panel attr → panel-{id})
══════════════════════════════════════════════════════ */
function initPanelRouter() {
  $$('.sb-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.panel;
      if (!target) return;
      $$('.sb-item').forEach(b => b.classList.remove('active'));
      $$('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      safeGet(`panel-${target}`)?.classList.add('active');
    });
  });
  safeGet('logoutBtn')?.addEventListener('click', () => { Auth.endSession(); location.reload(); });
}

/* ══════════════════════════════════════════════════════
   SOUND LIBRARY
   HTML IDs (corrected):
     soundDropZone   — drag-and-drop zone
     soundBrowseBtn  — browse button
     soundList       — track list container
     playPauseBtn    — play/pause toggle
     prevBtn         — previous track
     nextBtn         — next track
     shuffleBtn      — shuffle playlist
     clearPlaylistBtn— clear all tracks
     nowPlaying      — now-playing bar
     npTrack         — current track name
     volumeSlider    — range input
     volLabel        — volume % label
══════════════════════════════════════════════════════ */
const SoundLibrary = {
  playlist: [],
  currentIdx: 0,
  isPlaying: false,
  audio: new Audio(),

  init() {
    try { this.playlist = JSON.parse(localStorage.getItem('cwn_admin_playlist') || '[]'); } catch { this.playlist = []; }
    this.renderList();
    this.bindControls();
    this.audio.addEventListener('ended', () => this.next());
  },

  save() {
    const meta = this.playlist.map(t => ({ id:t.id, name:t.name, dur:t.dur, cat:t.cat }));
    localStorage.setItem('cwn_admin_playlist', JSON.stringify(meta));
  },

  addTrack(file) {
    const url = URL.createObjectURL(file);
    const track = { id: Date.now() + Math.random(), name: file.name.replace(/\.[^.]+$/,''), url, dur:'—', cat:'music' };
    const tmp = new Audio(url);
    tmp.addEventListener('loadedmetadata', () => { track.dur = this._fmt(tmp.duration); this.renderList(); });
    this.playlist.push(track);
    this.renderList();
    Log.ok(`Sound Library: Added "${track.name}"`);
  },

  _fmt(s) { const m=Math.floor(s/60), sec=Math.floor(s%60); return `${m}:${String(sec).padStart(2,'0')}`; },

  removeTrack(id) {
    this.playlist = this.playlist.filter(t => t.id !== id);
    this.save(); this.renderList();
  },

  shuffle() {
    for (let i=this.playlist.length-1; i>0; i--) {
      const j=Math.floor(Math.random()*(i+1));
      [this.playlist[i],this.playlist[j]]=[this.playlist[j],this.playlist[i]];
    }
    this.currentIdx = 0; this.save(); this.renderList();
    Log.info('Playlist shuffled');
  },

  playTrack(idx) {
    const t = this.playlist[idx];
    if (!t || !t.url) { Log.warn('Track URL expired — re-upload to play'); return; }
    this.currentIdx = idx;
    this.audio.src = t.url;
    this.audio.play()
      .then(() => { this.isPlaying=true; this._updateNP(); this.renderList(); })
      .catch(e  => Log.fail(`Audio: ${e.message}`));
  },

  playPause() {
    if (this.isPlaying) {
      this.audio.pause(); this.isPlaying=false; safeText('playPauseBtn','▶');
    } else {
      if (this.audio.src) {
        this.audio.play().then(() => { this.isPlaying=true; safeText('playPauseBtn','⏸'); });
      } else if (this.playlist.length) { this.playTrack(0); }
    }
  },

  prev() { this.playTrack((this.currentIdx-1+this.playlist.length)%this.playlist.length); },
  next() { this.playTrack((this.currentIdx+1)%this.playlist.length); },

  _updateNP() {
    const np = safeGet('nowPlaying');
    if (np) np.style.display = 'flex';
    const t = this.playlist[this.currentIdx];
    safeText('npTrack', t ? t.name : '—');
    safeText('playPauseBtn', this.isPlaying ? '⏸' : '▶');
  },

  renderList() {
    const list = safeGet('soundList');
    if (!list) return;
    if (!this.playlist.length) {
      list.innerHTML = '<div class="lib-empty">No tracks loaded · Drop audio files above to begin</div>';
      return;
    }
    list.innerHTML = this.playlist.map((t,i) => `
      <div class="lib-item${i===this.currentIdx&&this.isPlaying?' playing':''}" data-idx="${i}">
        <span class="li-icon">${i===this.currentIdx&&this.isPlaying?'▶':'♫'}</span>
        <span class="li-name">${t.name}</span>
        <span class="li-dur">${t.dur}</span>
        <button class="li-del" data-id="${t.id}" title="Remove">✕</button>
      </div>`).join('');
    list.querySelectorAll('.lib-item').forEach(el => {
      el.addEventListener('click', e => { if (!e.target.classList.contains('li-del')) this.playTrack(+el.dataset.idx); });
    });
    list.querySelectorAll('.li-del').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this.removeTrack(+btn.dataset.id); });
    });
  },

  bindControls() {
    /* ── Drop zone — id="soundDropZone" (was #soundUploadZone) ── */
    const zone = safeGet('soundDropZone');
    if (zone) {
      zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('drag-over');
        [...e.dataTransfer.files].filter(f => f.type.startsWith('audio/')).forEach(f => this.addTrack(f));
      });
    }

    /* ── Browse button — id="soundBrowseBtn" (was #soundFileInput) ── */
    safeGet('soundBrowseBtn')?.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type='file'; inp.multiple=true; inp.accept='audio/*';
      inp.onchange = e => [...e.target.files].forEach(f => this.addTrack(f));
      inp.click();
    });

    /* ── Playback controls ── */
    safeGet('playPauseBtn')?.addEventListener('click',   () => this.playPause());
    safeGet('prevBtn')?.addEventListener('click',        () => this.prev());
    safeGet('nextBtn')?.addEventListener('click',        () => this.next());
    safeGet('shuffleBtn')?.addEventListener('click',     () => this.shuffle());
    safeGet('clearPlaylistBtn')?.addEventListener('click', () => {
      this.playlist=[]; this.currentIdx=0; this.isPlaying=false;
      this.audio.pause(); this.audio.src='';
      const np = safeGet('nowPlaying');
      if (np) np.style.display='none';
      this.save(); this.renderList();
      Log.ok('Playlist cleared');
    });

    const vol = safeGet('volumeSlider');
    if (vol) {
      vol.addEventListener('input', () => {
        this.audio.volume = vol.value/100;
        safeText('volLabel', vol.value+'%');
      });
    }
  }
};

/* ══════════════════════════════════════════════════════
   GRAPHICS LIBRARY
   HTML IDs (corrected):
     gfxDropZone  — drop zone (was #gfxUploadZone)
     gfxBrowseBtn — browse button (was #gfxFileInput)
     gfxGrid      — image grid
     gfxFilter-*  — category filter buttons
══════════════════════════════════════════════════════ */
const GraphicsLibrary = {
  items: [],
  currentCat: 'all',

  init() {
    try { this.items = JSON.parse(localStorage.getItem('cwn_admin_graphics') || '[]'); } catch { this.items = []; }
    this.renderGrid();
    this.bindControls();
  },

  save() {
    const meta = this.items.map(i => ({ id:i.id, name:i.name, cat:i.cat }));
    localStorage.setItem('cwn_admin_graphics', JSON.stringify(meta));
  },

  addImage(file, cat='all') {
    const url = URL.createObjectURL(file);
    this.items.push({ id: Date.now()+Math.random(), name:file.name, url, cat });
    this.renderGrid();
    Log.ok(`Graphics: Added "${file.name}"`);
  },

  removeItem(id) { this.items = this.items.filter(i => i.id!==id); this.save(); this.renderGrid(); },

  renderGrid() {
    const grid = safeGet('gfxGrid');
    if (!grid) return;
    const visible = this.currentCat==='all' ? this.items : this.items.filter(i => i.cat===this.currentCat);
    if (!visible.length) {
      grid.innerHTML = '<div class="lib-empty">No graphics loaded · Drop images above</div>';
      return;
    }
    grid.innerHTML = visible.map(item => `
      <div class="gfx-card" data-id="${item.id}">
        <img src="${item.url}" alt="${item.name}" class="gfx-thumb" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\'><rect fill=\\'%23333\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23888\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\' font-size=\\'12\\'>No preview</text></svg>'">
        <div class="gfx-name">${item.name}</div>
        <button class="li-del gfx-del" data-id="${item.id}">✕</button>
      </div>`).join('');
    grid.querySelectorAll('.gfx-del').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this.removeItem(+btn.dataset.id); });
    });
  },

  bindControls() {
    /* ── Drop zone — id="gfxDropZone" (was #gfxUploadZone) ── */
    const zone = safeGet('gfxDropZone');
    if (zone) {
      zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('drag-over');
        const cat = safeGet('gfxCatSelect')?.value || 'all';
        [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')).forEach(f => this.addImage(f, cat));
      });
    }

    /* ── Browse button — id="gfxBrowseBtn" (was #gfxFileInput) ── */
    safeGet('gfxBrowseBtn')?.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type='file'; inp.multiple=true; inp.accept='image/*';
      const cat = safeGet('gfxCatSelect')?.value || 'all';
      inp.onchange = e => [...e.target.files].forEach(f => this.addImage(f, cat));
      inp.click();
    });

    /* ── Category filter ── */
    $$('[data-gfx-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('[data-gfx-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCat = btn.dataset.gfxFilter;
        this.renderGrid();
      });
    });
  }
};

/* ══════════════════════════════════════════════════════
   AI ROSTER  (HTML: announcer cards, testAnnouncer buttons)
══════════════════════════════════════════════════════ */
const Announcers = [
  { name:'Earl Henderson',   role:'Chief Meteorologist', gender:'male',   voice:'David',  shift:'6AM–12PM' },
  { name:'Walter Grayson',   role:'Evening Meteorologist',gender:'male',   voice:'David',  shift:'12PM–6PM' },
  { name:'Barbara Collins',  role:'Morning Meteorologist',gender:'female', voice:'Zira',   shift:'6PM–12AM' },
  { name:'Dorothy Sinclair', role:'Overnight Meteorologist',gender:'female',voice:'Zira',  shift:'12AM–6AM' }
];

function testAnnouncer(idx, type) {
  const ann = Announcers[idx];
  if (!ann) return;
  const fake = `${ann.name} ${type}`;
  const result = Bob.fireAnnouncer(fake);
  Log.ok(`Announcer test: ${ann.name} · ${type}`);
  Bob._addMsg(result);
}

function renderAIRoster() {
  const container = safeGet('aiRosterList');
  if (!container) return;
  container.innerHTML = Announcers.map((a, i) => `
    <div class="ai-card">
      <div class="ai-avatar">${a.gender==='male'?'🎙':'🎙'}</div>
      <div class="ai-info">
        <div class="ai-name">${a.name}</div>
        <div class="ai-role">${a.role}</div>
        <div class="ai-shift">Shift: ${a.shift}</div>
        <div class="ai-voice">Voice: ${a.voice}</div>
      </div>
      <div class="ai-actions">
        <button class="btn-sm" onclick="testAnnouncer(${i},'weather_update')">Weather Test</button>
        <button class="btn-sm" onclick="testAnnouncer(${i},'sign_on')">Sign-On</button>
        <button class="btn-sm btn-warn" onclick="testAnnouncer(${i},'emergency')">Emergency</button>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════
   BROADCAST CONTROL
══════════════════════════════════════════════════════ */
function broadcastCommand(type, value) {
  switch (type) {
    case 'channel':
      localStorage.setItem('cwn50s_channel_override', String(value));
      Log.ok(`Broadcast: Channel → CH${+value+1}`);
      break;
    case 'auto':
      if (value === 'on')       localStorage.removeItem('cwn50s_channel_override');
      else if (value === 'off') localStorage.setItem('cwn50s_auto_override','off');
      Log.ok(`Broadcast: Auto-slideshow → ${value}`);
      break;
    case 'emergency':
      if (value === 'on') {
        localStorage.setItem('cwn50s_emergency_override','true');
        localStorage.setItem('cwn_override_alert', JSON.stringify({
          type:'Tornado Warning', severity:'extreme',
          headline:'TORNADO WARNING — NWS has issued a Tornado Warning for Middle Tennessee. Take shelter immediately.',
          issued: new Date().toISOString()
        }));
        Log.warn('Broadcast: Emergency override ON');
      } else {
        localStorage.removeItem('cwn50s_emergency_override');
        localStorage.removeItem('cwn_override_alert');
        Log.ok('Broadcast: Emergency override cleared');
      }
      break;
    case 'theme':
      localStorage.setItem('cwn50s_theme', value);
      Log.ok(`Broadcast: Theme → ${value}`);
      break;
    case 'announce':
      localStorage.setItem('cwn50s_announce_override', value);
      Log.ok(`Broadcast: Announce override → ${value}`);
      break;
    default:
      Log.warn(`Broadcast: Unknown command "${type}"`);
  }
}

/* ══════════════════════════════════════════════════════
   WEATHER OVERRIDES
   HTML IDs (corrected):
     ov-temp, ov-desc, ov-wind, ov-hum
     (were #ovTemp, #ovCondition, #ovWind, #ovHumidity)
══════════════════════════════════════════════════════ */
function injectWeather() {
  const temp      = safeGet('ov-temp')?.value.trim()   || '';
  const condition = safeGet('ov-desc')?.value.trim()   || '';
  const wind      = safeGet('ov-wind')?.value.trim()   || '';
  const humidity  = safeGet('ov-hum')?.value.trim()    || '';
  if (!temp && !condition) { Log.warn('Weather override: Fill at least Temp or Condition'); return; }
  const city = localStorage.getItem('cwn_city') || 'Lebanon';
  localStorage.setItem('cwn_override_weather', JSON.stringify({ city, temp, condition, wind, humidity, ts: Date.now() }));
  Log.ok(`Weather override pushed → ${temp}°F · ${condition}`);
}

function clearWeatherOverride() {
  localStorage.removeItem('cwn_override_weather');
  Log.ok('Weather override cleared');
}

function overrideCity() {
  const sel = safeGet('ovCitySelect');
  if (!sel || !sel.value) return;
  localStorage.setItem('cwn_city', sel.value);
  localStorage.setItem('cwn50s_city_override', sel.value);
  Log.ok(`City override → ${sel.value}`);
}

/* ══════════════════════════════════════════════════════
   ALERT CONTROL
   HTML IDs (corrected):
     alertTypeSelect  (was #alertType)
     alertHeadlineInput
     alertSeveritySelect
══════════════════════════════════════════════════════ */
function injectAlert() {
  const type     = safeGet('alertTypeSelect')?.value || 'Tornado Warning';
  const headline = safeGet('alertHeadlineInput')?.value.trim() || `${type} in effect for Middle Tennessee.`;
  const severity = safeGet('alertSeveritySelect')?.value || 'extreme';
  localStorage.setItem('cwn_override_alert', JSON.stringify({ type, headline, severity, issued: new Date().toISOString() }));
  localStorage.setItem('cwn50s_emergency_override', severity === 'extreme' ? 'true' : 'false');
  Log.warn(`Alert pushed → ${type} (${severity})`);
}

function clearManualAlert() {
  localStorage.removeItem('cwn_override_alert');
  localStorage.removeItem('cwn50s_emergency_override');
  Log.ok('Manual alert cleared');
}

/* ══════════════════════════════════════════════════════
   SCHOOL CLOSINGS
   HTML IDs (corrected):
     schoolClosingInput  (was #closingsText)
══════════════════════════════════════════════════════ */
function injectSchoolClosings() {
  const text = safeGet('schoolClosingInput')?.value.trim() || '';
  if (!text) { Log.warn('Closings: Enter school closing info first'); return; }
  localStorage.setItem('cwn_override_closings', JSON.stringify({ closings:text, ts: Date.now() }));
  Log.ok(`School closings pushed → "${text.substring(0,50)}…"`);
}

function clearSchoolClosings() {
  localStorage.removeItem('cwn_override_closings');
  Log.ok('School closings cleared');
}

/* ══════════════════════════════════════════════════════
   TICKER OVERRIDE
   HTML IDs (corrected):
     tickerMsgInput   (was #tickerMsg)
     tickerBadgeInput (was #tickerBadge)
══════════════════════════════════════════════════════ */
function pushTickerOverride() {
  const message = safeGet('tickerMsgInput')?.value.trim()   || '';
  const badge   = safeGet('tickerBadgeInput')?.value.trim() || 'CWN';
  if (!message) { Log.warn('Ticker: Enter a message first'); return; }
  localStorage.setItem('cwn_ticker_override', JSON.stringify({ message, badge, ts: Date.now() }));
  Log.ok(`Ticker override pushed → [${badge}] ${message.substring(0,40)}…`);
}

function clearTickerOverride() {
  localStorage.removeItem('cwn_ticker_override');
  Log.ok('Ticker override cleared');
}

/* ══════════════════════════════════════════════════════
   SETTINGS
   HTML IDs (corrected):
     curPw, newPw, confPw, pwFeedback
     (were #pwCurrent, #pwNew, #pwConfirm, #pwMsg)
══════════════════════════════════════════════════════ */
function changePw() {
  const cur  = safeGet('curPw')?.value    || '';
  const nw   = safeGet('newPw')?.value    || '';
  const conf = safeGet('confPw')?.value   || '';
  const msg  = safeGet('pwFeedback');

  if (!cur || !nw || !conf) { if (msg) { msg.textContent='Fill all three fields.'; msg.style.color='#f55'; } return; }
  if (!Auth.check(Auth.getCreds().user, cur)) { if (msg) { msg.textContent='Current password incorrect.'; msg.style.color='#f55'; } return; }
  if (nw !== conf) { if (msg) { msg.textContent='New passwords do not match.'; msg.style.color='#f55'; } return; }
  if (nw.length < 8) { if (msg) { msg.textContent='Password must be at least 8 characters.'; msg.style.color='#f55'; } return; }
  Auth.saveCreds(Auth.getCreds().user, nw);
  if (msg) { msg.textContent='✓ Password updated successfully.'; msg.style.color='#20c070'; }
  safeGet('curPw') && (safeGet('curPw').value='');
  safeGet('newPw') && (safeGet('newPw').value='');
  safeGet('confPw') && (safeGet('confPw').value='');
  Log.ok('Password changed successfully');
}

function clearAllOverrides() { Repair.clearAllOverrides(); }

function clearCityMemory() {
  localStorage.removeItem('cwn_city');
  localStorage.removeItem('cwn50s_city_override');
  Log.ok('City memory cleared');
}

function exportLog() {
  const box = safeGet('logBox');
  const text = box ? box.innerText : 'No log data';
  const blob = new Blob([text], { type:'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cwn-admin-log-${Date.now()}.txt`;
  a.click();
  Log.ok('Log exported');
}

function factoryReset() {
  if (!confirm('⚠ FACTORY RESET — This will clear ALL CWN admin data, overrides, playlist, and graphics. Are you absolutely sure?')) return;
  const keys = Object.keys(localStorage).filter(k => k.startsWith('cwn'));
  keys.forEach(k => localStorage.removeItem(k));
  Auth.endSession();
  sessionStorage.clear();
  Log.ok(`Factory reset complete. Removed ${keys.length} keys. Reloading…`);
  setTimeout(() => location.reload(), 1000);
}

function openChat() {
  const btn = document.querySelector('.sb-item[data-panel="chat"]');
  if (btn) btn.click();
}

function diagHeart() {
  openChat();
  setTimeout(() => {
    const input = safeGet('chatInput');
    if (input) {
      input.value = 'run diagnostics';
      safeGet('chatSend')?.click();
    }
  }, 200);
}

function testResize() {
  Log.info('Resize test: Broadcasting resize event…');
  window.dispatchEvent(new Event('resize'));
  Log.ok('Resize event fired');
}

/* ══════════════════════════════════════════════════════
   OVERRIDE STATUS REFRESH  (updates live localStorage readout)
══════════════════════════════════════════════════════ */
function refreshOverrideStatus() {
  const keys = {
    'cwn_override_weather':      'ovStatusWeather',
    'cwn_override_alert':        'ovStatusAlert',
    'cwn_override_closings':     'ovStatusClosings',
    'cwn_ticker_override':       'ovStatusTicker',
    'cwn50s_channel_override':   'ovStatusChannel',
    'cwn50s_emergency_override': 'ovStatusEmergency'
  };
  Object.entries(keys).forEach(([lsKey, elId]) => {
    const el = safeGet(elId);
    if (!el) return;
    const val = localStorage.getItem(lsKey);
    if (val) {
      el.textContent = '● ACTIVE';
      el.style.color = '#f80';
    } else {
      el.textContent = '— none —';
      el.style.color = 'var(--text3, #666)';
    }
  });
}

/* ══════════════════════════════════════════════════════
   ERA PAGES STATUS  (panel-era)
══════════════════════════════════════════════════════ */
function renderEraStatus() {
  const container = safeGet('eraPageList');
  if (!container) return;
  const pages = [
    { name:'2026 Home',          file:'index.html',      key:'cwn_theme'    },
    { name:'1994 Severe',        file:'1994Severe.html', key:'cwn94_theme'  },
    { name:'1980s CRT',          file:'80s.html',        key:'cwn80s_theme' },
    { name:'1970s Edition',      file:'70s.html',        key:'cwn70s_theme' },
    { name:'1960s Mid-Century',  file:'60s.html',        key:'cwn60s_theme' },
    { name:'1950s TV Broadcast', file:'50s.html',        key:'cwn50s_theme' }
  ];
  container.innerHTML = pages.map(p => {
    const theme = localStorage.getItem(p.key) || 'auto';
    const city  = localStorage.getItem('cwn_city') || 'Lebanon';
    return `
      <div class="era-row">
        <div class="era-name">${p.name}</div>
        <div class="era-meta">Theme: <strong>${theme}</strong> · City: <strong>${city}</strong></div>
        <a class="btn-sm era-link" href="${p.file}" target="_blank">Open ↗</a>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════
   ADMIN SHELL INIT
══════════════════════════════════════════════════════ */
function initAdminShell() {
  /* update username display */
  safeText('sbUser', Auth.getCreds().user.toUpperCase());

  Log.init();
  Log.info('CWN Admin Portal initialised');

  initPanelRouter();
  initChat();
  SoundLibrary.init();
  GraphicsLibrary.init();
  renderAIRoster();
  renderEraStatus();

  /* ── Diagnostics panel button — id="runDiagBtn" ── */
  safeGet('runDiagBtn')?.addEventListener('click', () => Diagnostics.runAll());

  /* override status refresh */
  refreshOverrideStatus();
  setInterval(refreshOverrideStatus, 3000);

  /* ── Boot diagnostic (safe — no null crash) ── */
  setTimeout(() => {
    Log.info('Running boot diagnostic…');
    Diagnostics.runAll().catch(e => Log.fail(`Boot diagnostic error: ${e.message}`));
  }, 800);

  Log.ok('Admin shell ready — all systems connected');
}

/* ══════════════════════════════════════════════════════
   ENTRY POINT
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', initLogin);


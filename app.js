/* ============================================================================
   IRONLOG — a logbook for the Upper/Lower A-B 2-on-1-off block.
   No build step, no dependencies, no server. Everything lives in localStorage
   on this device; Settings has export/import for backup and moving phones.
   ========================================================================== */

const STORE_KEY = 'ironlog.v1';

const DEFAULTS = {
  v: 1,
  unit: 'lb',
  nextIndex: 0,
  active: null,           // in-progress session
  sessions: [],
  bw: [],
  sound: true,
  seenIntro: false,
};

let DB = load();
let view = 'today';
let toastTimer = null;

/* --------------------------------------------------------------- store -- */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULTS };
    return clean(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data:', e);
    return { ...DEFAULTS };
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  } catch (e) {
    toast('Could not save — device storage is full or blocked.');
  }
}

/* Saved data and imported backups are rebuilt field by field: anything that is not the shape
   the app writes itself is dropped or blanked, so a hand-made backup file can't carry markup
   into the innerHTML templates (unit, weights, ids, bodyweights are interpolated unescaped). */
function clean(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  // set fields are kept as the numeric strings the inputs produce ('0' stays truthy for loggedSets)
  const num = (v) => (v === '' || v == null || typeof v === 'object' || !Number.isFinite(Number(v)) ? '' : String(v).trim());
  const time = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : undefined);
  const str = (v) => (typeof v === 'string' ? v : '');
  const entries = (e) => {
    const out = {};
    for (const [k, sets] of Object.entries(e && typeof e === 'object' ? e : {})) {
      if (!/^[\w-]{1,40}$/.test(k) || !Array.isArray(sets)) continue;
      out[k] = sets.filter(x => x && typeof x === 'object')
        .map(x => ({ w: num(x.w), r: num(x.r), rir: num(x.rir), done: x.done === true }));
    }
    return out;
  };
  const day = (k) => typeof k === 'string' && Object.hasOwn(PROGRAM.days, k);
  const sessions = (Array.isArray(o.sessions) ? o.sessions : [])
    .filter(x => x && day(x.dayKey) && isDate(x.date))
    .map((x, i) => ({
      id: typeof x.id === 'string' && /^s\d{1,16}$/.test(x.id) ? x.id : `s${i + 1}`,
      dayKey: x.dayKey, date: x.date, started: time(x.started), ended: time(x.ended),
      entries: entries(x.entries), notes: str(x.notes),
    }));
  const a = o.active;
  const active = a && day(a.dayKey) && isDate(a.date)
    ? { dayKey: a.dayKey, date: a.date, started: time(a.started) ?? Date.now(), entries: entries(a.entries), notes: str(a.notes) }
    : null;
  const exNotes = {};
  for (const [k, v] of Object.entries(o.exNotes && typeof o.exNotes === 'object' ? o.exNotes : {}))
    if (/^[\w-]{1,40}$/.test(k) && typeof v === 'string') exNotes[k] = v;
  const ni = Number(o.nextIndex);
  return {
    ...DEFAULTS,
    unit: o.unit === 'kg' ? 'kg' : 'lb',
    nextIndex: Number.isInteger(ni) && ni >= 0 ? ni % PROGRAM.rotation.length : 0,
    active, sessions, exNotes,
    bw: (Array.isArray(o.bw) ? o.bw : []).filter(b => b && isDate(b.date) && num(b.v) !== '').map(b => ({ date: b.date, v: Number(b.v) })),
    sound: o.sound !== false,
    seenIntro: o.seenIntro === true,
  };
}

/* -------------------------------------------------------------- units -- */
const LB_PER_KG = 2.2046226218;
function unitLabel() { return DB.unit; }
function inc(ex) {
  // exercise increments are authored in lb; kg users get the nearest plate pair
  if (DB.unit === 'lb') return ex.inc;
  return ex.inc >= 10 ? 5 : 2.5;
}
function convertAll(to) {
  const f = to === 'kg' ? (1 / LB_PER_KG) : LB_PER_KG;
  const round = (n) => Math.round(n * 2) / 2;
  const fix = (entries) => {
    for (const sets of Object.values(entries || {})) {
      for (const s of sets) if (s.w != null && s.w !== '') s.w = round(s.w * f);
    }
  };
  DB.sessions.forEach(s => fix(s.entries));
  if (DB.active) fix(DB.active.entries);
  DB.bw.forEach(b => { b.v = round(b.v * f); });
  DB.unit = to;
}

/* --------------------------------------------------------------- dates -- */
const today = () => new Date().toISOString().slice(0, 10);
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const diff = daysBetween(iso, today());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtClock(sec) {
  const s = Math.abs(Math.round(sec));
  return (sec < 0 ? '-' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* ------------------------------------------------------- program state -- */
/* The app only ever points at the next workout. It advances when a session is
   finished, never on the clock — rest whenever you like and it simply waits. */
function nextDayKey() { return PROGRAM.rotation[DB.nextIndex % PROGRAM.rotation.length]; }

/* Standing reminders per exercise. They belong to the exercise, not a session,
   so they carry forward every time that exercise comes round. */
function exNote(exId) { return DB.exNotes?.[exId] || ''; }
function setExNote(exId, text) {
  DB.exNotes = { ...DB.exNotes };
  if (text.trim()) DB.exNotes[exId] = text; else delete DB.exNotes[exId];
  save();
}

function dayLastDone(dayKey) {
  const hits = DB.sessions.filter(s => s.dayKey === dayKey);
  return hits.length ? hits[hits.length - 1].date : null;
}

/* ---------------------------------------------------------- lift math -- */
/* Epley, extended with RIR so a 8@2RIR and a 10@0RIR compare honestly. */
function e1rm(w, r, rir = 0) {
  if (!w || !r) return 0;
  return w * (1 + (Number(r) + Number(rir || 0)) / 30);
}
function loggedSets(sets) { return (sets || []).filter(s => s.done && s.w && s.r); }

function historyFor(exId) {
  return DB.sessions
    .filter(s => loggedSets(s.entries?.[exId]).length)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({ date: s.date, sets: loggedSets(s.entries[exId]) }));
}
function lastFor(exId) {
  const h = historyFor(exId);
  return h.length ? h[h.length - 1] : null;
}
function bestE1rmFor(exId) {
  let best = 0;
  for (const h of historyFor(exId))
    for (const s of h.sets) best = Math.max(best, e1rm(s.w, s.r, s.rir));
  return best;
}

/* Double progression: clear the top of the rep range on every set at or under
   the target RIR, and the weight goes up next time. */
function progressionFor(ex) {
  const last = lastFor(ex.id);
  if (!last || last.sets.length < ex.sets) return null;
  const target = REP_SCHEMES[ex.scheme].rir;
  const cleared = last.sets.every(s => Number(s.r) >= ex.hi && Number(s.rir || 0) <= target);
  if (!cleared) return null;
  const top = Math.min(...last.sets.map(s => Number(s.w)));
  return { from: top, to: top + inc(ex) };
}

/* What to put in the weight box before the user types anything. */
function suggestedWeight(ex) {
  const p = progressionFor(ex);
  if (p) return p.to;
  const last = lastFor(ex.id);
  if (last) return Math.min(...last.sets.map(s => Number(s.w)));
  return '';
}

/* ------------------------------------------------------- plate loading -- */
/* Only for barbell lifts — a cable stack number means nothing here. */
const BARBELL = new Set(['bb_bench','bb_squat','rdl','deadlift','ohp','ez_curl']);
const PLATE_SETS = {
  lb: [[45,'var(--plate-blue)'],[35,'var(--plate-yellow)'],[25,'var(--plate-green)'],
       [10,'var(--ink-3)'],[5,'var(--ink-3)'],[2.5,'var(--ink-3)']],
  kg: [[25,'var(--plate-red)'],[20,'var(--plate-blue)'],[15,'var(--plate-yellow)'],
       [10,'var(--plate-green)'],[5,'var(--ink-3)'],[2.5,'var(--ink-3)'],[1.25,'var(--ink-3)']],
};
function usesPlates(exId) { return BARBELL.has(exId) && exId !== 'ez_curl'; }
function plateMath(total, exId) {
  if (!usesPlates(exId)) return null;
  const bar = DB.unit === 'lb' ? 45 : 20;
  const t = Number(total);
  if (!t || t < bar) return null;
  let side = (t - bar) / 2;
  if (side <= 0) return { bar, plates: [] };
  const out = [];
  for (const [w, c] of PLATE_SETS[DB.unit]) {
    let n = Math.floor((side + 1e-6) / w);
    if (n > 0) { out.push({ w, n, c }); side -= n * w; }
  }
  if (side > 0.01) return null;   // can't be made with standard plates — say nothing
  return { bar, plates: out };
}

function platesHTML(pm) {
  if (!pm) return '';
  const body = pm.plates.length
    ? pm.plates.map(p => `<span class="plate" style="background:${p.c}">${p.n}×${p.w}</span>`).join('')
    : '<span>bar only</span>';
  return `<span>Per side:</span>${body}<span>+ ${pm.bar} bar</span>`;
}

/* ------------------------------------------------------ weekly volume -- */
/* Direct sets count 1; a secondary role counts 0.5 — roughly how the volume
   landmark literature treats indirect work. */
function weeklyVolume(days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const tally = {};
  for (const k of Object.keys(MUSCLES)) tally[k] = 0;
  for (const s of DB.sessions) {
    if (s.date < cutoff) continue;
    for (const [exId, sets] of Object.entries(s.entries || {})) {
      const ex = EXERCISE_INDEX[exId];
      if (!ex) continue;
      const n = loggedSets(sets).length;
      tally[ex.muscle] = (tally[ex.muscle] || 0) + n;
      for (const m of ex.secondary || []) tally[m] = (tally[m] || 0) + n * 0.5;
    }
  }
  return tally;
}

/* ---------------------------------------------------------------- sound -- */
/* iOS Safari ignores navigator.vibrate entirely, so the end of a rest has to be
   audible. Web Audio needs the context created inside a user gesture, so we
   unlock it on the first tap and keep it warm from then on. */
const Sound = {
  ctx: null,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      // a silent blip is what actually flips iOS out of the muted state
      const b = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = b; src.connect(this.ctx.destination); src.start(0);
    } catch (e) { this.ctx = null; }
  },
  chime() {
    if (!DB.sound) return;
    if (navigator.vibrate) navigator.vibrate([90, 60, 90]);   // Android
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime;
    [880, 1318.5].forEach((hz, i) => {          // A5 then E6 — carries over gym noise
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const t = now + i * 0.17;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.36);
    });
  },
};

/* --------------------------------------------------------- rest timer -- */
const Timer = {
  endsAt: null, target: 0, label: '', tick: null, alerted: false,
  start(seconds, label) {
    this.endsAt = Date.now() + seconds * 1000;
    this.target = seconds;
    this.label = label;
    this.alerted = false;
    clearInterval(this.tick);
    this.tick = setInterval(() => this.paint(), 250);
    this.paint();
  },
  add(seconds) {
    if (!this.endsAt) return;
    this.endsAt += seconds * 1000;
    this.target += seconds;
    if (this.remaining() > 0) this.alerted = false;
    this.paint();
  },
  stop() { clearInterval(this.tick); this.tick = null; this.endsAt = null; this.paint(); },
  remaining() { return this.endsAt ? (this.endsAt - Date.now()) / 1000 : 0; },
  paint() {
    const el = document.getElementById('timerbar');
    // the bar is fixed above the tab bar, so the page needs room for it
    document.body.classList.toggle('resting', !!this.endsAt);
    if (!this.endsAt) { el.hidden = true; return; }
    const rem = this.remaining();
    el.hidden = false;
    el.classList.toggle('over', rem <= 0);
    el.querySelector('.t').textContent = fmtClock(rem);
    el.querySelector('.lbl').textContent = rem > 0 ? this.label : 'Rested — next set.';
    const pct = Math.max(0, Math.min(1, rem / this.target));
    el.querySelector('.bar').style.width = (pct * 100) + '%';
    if (rem <= 0 && !this.alerted) { this.alerted = true; Sound.chime(); }
  },
};
const REST_SECONDS = { heavy: 180, moderate: 120, pump: 75 };

/* --------------------------------------------------------------- toast -- */
function toast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

/* ------------------------------------------------------------- icons -- */
const ICON = {
  today: '<path d="M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/>',
  history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1015 5.6L3 8"/><path d="M12 7v5l3 2"/>',
  progress: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
  program: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  play: '<path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 3.6 1.65 1.65 0 0010 2.09V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 8v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
};
function svg(path, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ==========================================================================
   VIEWS
   ========================================================================== */

const expanded = new Set();

function render() {
  const root = document.getElementById('view');
  const bar = document.getElementById('topbar');

  if (view === 'today')         { bar.innerHTML = topToday();   root.innerHTML = viewToday(); }
  else if (view === 'history')  { bar.innerHTML = topPlain('History', 'Every session you have logged'); root.innerHTML = viewHistory(); }
  else if (view === 'progress') { bar.innerHTML = topPlain('Progress', 'Are the numbers actually moving?'); root.innerHTML = viewProgress(); }
  else                          { bar.innerHTML = topPlain('Program', PROGRAM.name); root.innerHTML = viewProgram(); }

  document.querySelectorAll('.tabs button').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.tab === view)));
  Timer.paint();
}

const GEAR_BTN = `<button id="settingsBtn" aria-label="Settings" style="color:var(--ink-3);padding:6px">
  <svg style="width:20px;height:20px" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON.gear}</svg></button>`;

function topPlain(title, sub) {
  return `<div style="flex:1;min-width:0">
      <h1>${esc(title)}</h1>
      <div class="sub">${esc(sub)}</div>
    </div>${GEAR_BTN}`;
}
function topToday() {
  const n = DB.sessions.length;
  const cyc = n ? `${n} session${n > 1 ? 's' : ''} logged` : 'Not started';
  return `<div class="brand" style="flex:1"><b>Ironlog</b><span class="cyc">${esc(cyc)}</span></div>${GEAR_BTN}`;
}

/* --------------------------------------------------------------- TODAY -- */
function viewToday() {
  if (DB.active) return renderSession();

  const dayKey = nextDayKey();
  const day = PROGRAM.days[dayKey];
  const totalSets = day.exercises.reduce((n, e) => n + e.sets, 0);
  const musclesHit = [...new Set(day.exercises.map(e => MUSCLES[e.muscle]))].slice(0, 4);

  const hero = `
    <div class="hero" data-day="${dayKey}">
      <div class="eyebrow">Next session</div>
      <div class="day">${esc(day.name)}</div>
      <div class="subtitle">${esc(day.subtitle)}</div>
      <div class="chips">
        <span class="chip accent">${day.exercises.length} exercises</span>
        <span class="chip">${totalSets} working sets</span>
        ${musclesHit.map(m => `<span class="chip">${esc(m)}</span>`).join('')}
      </div>
      <button class="btn" id="startBtn">${svg(ICON.play).replace('<svg', '<svg style="width:15px;height:15px"')} Start ${esc(day.name)}</button>
      <button class="linkbtn" id="switchBtn">Do a different workout</button>
    </div>`;

  const strip = PROGRAM.rotation.map(k => {
    const cls = [k, k === dayKey ? 'now' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}">${esc(PROGRAM.days[k].name)}</div>`;
  }).join('');

  const recent = DB.sessions.slice(-3).reverse();

  return `
    ${hero}

    <div>
      <h2 class="sect">The rotation</h2>
      <div class="card" style="margin-top:8px">
        <div class="cyclestrip">${strip}</div>
        <p style="font-size:12px;color:var(--ink-3);margin:11px 0 0;line-height:1.45">
          Finishing a session moves you to the next one. Rest whenever you need to —
          the next workout just waits for you.
        </p>
      </div>
    </div>

    ${recent.length ? `
    <div>
      <h2 class="sect">Recent</h2>
      <div class="card flush" style="margin-top:8px"><div class="rows">
        ${recent.map(s => {
          const d = PROGRAM.days[s.dayKey];
          const n = Object.values(s.entries || {}).reduce((a, x) => a + loggedSets(x).length, 0);
          return `<div class="row" data-day="${s.dayKey}">
            <span class="daydot"></span>
            <span class="lead"><div class="t1">${esc(d.name)}</div>
              <div class="t2">${esc(fmtDate(s.date))}</div></span>
            <span class="val">${n} sets<br><span style="color:var(--ink-3)">${fmtTonnage(s)}</span></span>
          </div>`;
        }).join('')}
      </div></div>
    </div>` : `
    <div class="card empty">
      <div class="big">Nothing logged yet</div>
      <p>Start your first session above. The app fills in last time's numbers from
         then on, so you always know what to beat.</p>
    </div>`}

  `;
}

function fmtTonnage(s) {
  let t = 0;
  for (const sets of Object.values(s.entries || {}))
    for (const x of loggedSets(sets)) t += Number(x.w) * Number(x.r);
  return t ? `${Math.round(t).toLocaleString()} ${esc(unitLabel())}` : '—';
}

/* ------------------------------------------------------------- SESSION -- */
function renderSession() {
  const a = DB.active;
  const day = PROGRAM.days[a.dayKey];

  const doneCount = day.exercises.filter(ex =>
    loggedSets(a.entries[ex.id]).length >= ex.sets).length;

  const cards = day.exercises.map((ex, i) => renderExercise(ex, i, a)).join('');

  return `<div data-day="${a.dayKey}">
    <div class="hero" style="margin-bottom:16px">
      <div class="eyebrow">In progress · ${esc(fmtDate(a.date))}</div>
      <div class="day">${esc(day.name)}</div>
      <div class="subtitle">${doneCount} of ${day.exercises.length} exercises complete</div>
      <div class="btn-row">
        <button class="btn ghost" id="cancelBtn">Discard</button>
        <button class="btn" id="finishBtn">Finish session</button>
      </div>
    </div>

    <h2 class="sect" style="margin-bottom:8px">Exercises</h2>
    <div class="exlist">${cards}</div>

    <div class="field" style="margin-top:16px">
      <label for="sessNotes">Session notes</label>
      <textarea id="sessNotes" placeholder="Sleep, energy, anything that felt off…">${esc(a.notes || '')}</textarea>
    </div>
  </div>`;
}

function renderExercise(ex, i, a) {
  const sets = a.entries[ex.id] || [];
  const done = loggedSets(sets).length;
  const complete = done >= ex.sets;
  const open = expanded.has(ex.id);
  const scheme = REP_SCHEMES[ex.scheme];
  const prev = lastFor(ex.id);
  const prog = progressionFor(ex);

  const rows = sets.map((s, si) => {
    const p = prev?.sets?.[si];
    const hit = p && Number(p.r) >= ex.hi;
    return `<div class="setrow ${s.done ? 'logged' : ''}" data-ex="${ex.id}" data-set="${si}">
      <span class="idx">${si + 1}</span>
      <span class="prev ${hit ? 'hit' : ''}">${p ? `${p.w}×${p.r}${p.rir != null && p.rir !== '' ? ` @${p.rir}` : ''}` : '—'}</span>
      <input type="number" inputmode="decimal" step="any" aria-label="Weight, set ${si + 1}"
             data-f="w" value="${s.w ?? ''}" placeholder="${unitLabel()}">
      <input type="number" inputmode="numeric" aria-label="Reps, set ${si + 1}"
             data-f="r" value="${s.r ?? ''}" placeholder="reps">
      <input type="number" inputmode="numeric" aria-label="Reps in reserve, set ${si + 1}"
             data-f="rir" value="${s.rir ?? ''}" placeholder="RIR">
      <button class="tick" data-tick aria-pressed="${!!s.done}" aria-label="Mark set ${si + 1} complete">
        ${svg(ICON.check)}</button>
    </div>`;
  }).join('');

  const lastWeight = sets.find(s => s.w)?.w;
  const pm = plateMath(lastWeight, ex.id);
  const note = exNote(ex.id);

  return `<div class="ex ${complete ? 'done' : ''}">
    <button class="ex-head" data-toggle="${ex.id}" aria-expanded="${open}">
      <span class="ex-num">${i + 1}</span>
      <span class="ex-title">
        <div class="nm">${esc(ex.name)}${ex.superset ? `<span class="ss-tag">SS ${ex.superset}</span>` : ''}</div>
        <div class="meta"><b>${ex.sets}×${ex.lo}–${ex.hi}</b> · ${scheme.rir} RIR</div>
        ${note && !open ? `<div class="notepeek">${esc(note)}</div>` : ''}
      </span>
      <span class="ex-prog ${complete ? 'full' : ''}">${done}/${ex.sets}</span>
    </button>

    ${open ? `<div class="ex-body">
      <div class="cue"><b>${esc(scheme.note)}</b> ${esc(ex.cue)}</div>

      ${prog ? `<div class="nudge" style="margin:0 0 11px">
        ${svg(ICON.up)}<div>You cleared ${ex.hi} reps on every set last time.
        Go up: <b>${prog.from} → ${prog.to} ${unitLabel()}</b> and rebuild to ${ex.hi}.</div>
      </div>` : ''}

      <div class="setgrid">
        <div class="setrow hdr">
          <span></span><span>Last time</span><span>${esc(unitLabel())}</span><span>Reps</span><span>RIR</span><span></span>
        </div>
        ${rows}
      </div>

      ${usesPlates(ex.id) ? `<div class="plates">${platesHTML(pm)}</div>` : ''}

      <div class="exmore">
        <span style="flex:1">Swap: ${esc((ex.subs || []).join(' · '))}</span>
        <button data-rest="${ex.id}">Rest ${fmtClock(REST_SECONDS[ex.scheme])}</button>
      </div>

      <div class="exnote">
        <label for="note-${ex.id}">Notes</label>
        <textarea id="note-${ex.id}" data-exnote="${ex.id}" rows="2"
          placeholder="Reminders for next time — seat height, grip, anything to watch">${esc(note)}</textarea>
      </div>
    </div>` : ''}
  </div>`;
}

/* ------------------------------------------------------------- HISTORY -- */
function viewHistory() {
  if (!DB.sessions.length) return `<div class="card empty">
    <div class="big">No sessions yet</div>
    <p>Finished workouts land here with every set, so you can look back at exactly
       what you did six weeks ago.</p></div>`;

  const byMonth = {};
  for (const s of [...DB.sessions].reverse()) {
    const k = new Date(s.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    (byMonth[k] ||= []).push(s);
  }

  return Object.entries(byMonth).map(([month, list]) => `
    <div>
      <h2 class="sect">${esc(month)}</h2>
      <div class="card flush" style="margin-top:8px"><div class="rows">
        ${list.map(s => {
          const d = PROGRAM.days[s.dayKey];
          const n = Object.values(s.entries || {}).reduce((a, x) => a + loggedSets(x).length, 0);
          const mins = s.ended && s.started ? Math.round((s.ended - s.started) / 60000) : null;
          return `<button class="row" data-session="${s.id}" data-day="${s.dayKey}">
            <span class="daydot"></span>
            <span class="lead"><div class="t1">${esc(d.name)}</div>
              <div class="t2">${esc(fmtDate(s.date))}${mins ? ` · ${mins} min` : ''}</div></span>
            <span class="val">${n} sets<br><span style="color:var(--ink-3)">${fmtTonnage(s)}</span></span>
          </button>`;
        }).join('')}
      </div></div>
    </div>`).join('');
}

/* ------------------------------------------------------------ PROGRESS -- */
function viewProgress() {
  const vol = weeklyVolume();
  const anyVolume = Object.values(vol).some(v => v > 0);

  const tonnage = DB.sessions
    .filter(s => daysBetween(s.date, today()) < 7)
    .reduce((t, s) => {
      for (const sets of Object.values(s.entries || {}))
        for (const x of loggedSets(sets)) t += Number(x.w) * Number(x.r);
      return t;
    }, 0);

  const bw = DB.bw.slice().sort((a, b) => a.date.localeCompare(b.date));
  const bwDelta = bw.length > 1 ? bw[bw.length - 1].v - bw[0].v : null;

  /* Headline lifts — the five that carry the program */
  const keyLifts = ['bb_bench', 'bb_squat', 'deadlift', 'ohp', 'pullup'];
  const liftRows = keyLifts.map(id => {
    const ex = EXERCISE_INDEX[id];
    const h = historyFor(id);
    if (!h.length) return '';
    const pts = h.map(s => ({ x: s.date, y: Math.max(...s.sets.map(t => e1rm(t.w, t.r, t.rir))) }));
    const first = pts[0].y, last = pts[pts.length - 1].y;
    const gain = first ? ((last - first) / first) * 100 : 0;
    return `<div class="card" style="margin-bottom:10px" data-day="${ex.dayKey}">
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:2px">
        <div style="flex:1;font-weight:600;font-size:14px">${esc(ex.name)}</div>
        <div style="font-family:var(--font-data);font-size:13px;color:${gain >= 0 ? 'var(--pr)' : 'var(--ink-3)'}">
          ${gain >= 0 ? '+' : ''}${gain.toFixed(0)}%</div>
      </div>
      <div style="font-family:var(--font-data);font-size:11px;color:var(--ink-3);margin-bottom:8px">
        est. 1RM ${Math.round(last)} ${unitLabel()} · ${pts.length} session${pts.length > 1 ? 's' : ''}</div>
      ${lineChart(pts)}
    </div>`;
  }).filter(Boolean).join('');

  return `
    <div class="stats">
      <div class="stat"><div class="n">${DB.sessions.length}</div><div class="l">Sessions</div></div>
      <div class="stat"><div class="n">${DB.sessions.filter(s => daysBetween(s.date, today()) < 7).length}</div><div class="l">This week</div></div>
      <div class="stat"><div class="n">${tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + 'k' : Math.round(tonnage)}</div>
        <div class="l">${esc(unitLabel())} / week</div></div>
    </div>

    <div>
      <h2 class="sect">Weekly sets per muscle</h2>
      <div class="card" style="margin-top:8px">
        ${anyVolume ? `<div class="vol">${
          Object.entries(MUSCLES).map(([k, name]) => {
            const n = vol[k] || 0;
            const pct = Math.min(100, (n / 24) * 100);
            const cls = n >= 10 && n <= 20 ? 'ok' : (n < 10 ? 'low' : '');
            return `<div class="volrow">
              <span class="nm">${esc(name)}</span>
              <span class="track" style="--lo:${(10 / 24) * 100}%;--hi:${100 - (20 / 24) * 100}%">
                <span class="fill" style="width:${pct}%"></span></span>
              <span class="n ${cls}">${n % 1 ? n.toFixed(1) : n}</span>
            </div>`;
          }).join('')}</div>
          <p style="font-size:11.5px;color:var(--ink-3);margin:12px 0 0;line-height:1.45">
            The two ticks on each bar mark <b style="color:var(--ink-2)">10–20 hard sets a week</b> —
            the range where the dose-response data flattens out. Under it you leave growth
            on the table; far over it you mostly buy fatigue.</p>`
        : `<div class="empty" style="padding:22px 6px"><p>Log a session and your weekly
            volume shows up here against the 10–20 set target band.</p></div>`}
      </div>
    </div>

    <div>
      <h2 class="sect">Bodyweight</h2>
      <div class="card" style="margin-top:8px">
        ${bw.length > 1 ? `
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px">
            <div style="font-family:var(--font-data);font-size:21px;font-weight:600">
              ${bw[bw.length - 1].v} ${esc(unitLabel())}</div>
            <div style="font-family:var(--font-data);font-size:12px;color:${bwDelta > 0 ? 'var(--pr)' : 'var(--ink-3)'}">
              ${bwDelta > 0 ? '+' : ''}${bwDelta.toFixed(1)} since ${esc(fmtDate(bw[0].date))}</div>
          </div>
          ${lineChart(bw.map(b => ({ x: b.date, y: b.v })))}
        ` : `<p style="font-size:13px;color:var(--ink-2);margin:0 0 12px;line-height:1.5">
            Weigh in a few mornings a week. Gaining <b style="color:var(--ink)">0.25–0.5% of
            bodyweight per week</b> is the rate that adds muscle without much fat riding along.
            Judge it on the trend line, never one morning's number.</p>`}
        <button class="btn ghost" id="bwBtn" style="margin-top:12px">Log today's weight</button>
      </div>
    </div>

    ${liftRows ? `<div><h2 class="sect">Key lifts — estimated 1RM</h2>
      <div style="margin-top:8px">${liftRows}</div></div>` : ''}

    <div class="card">
      <div class="eyebrow">Check in with someone</div>
      <p style="font-size:13px;color:var(--ink-2);margin:9px 0 13px;line-height:1.5">
        Your log never leaves this phone, so nobody can see it unless you send it.
        This copies a short plain-text summary — lifts, volume, bodyweight trend —
        that you can paste into a message.</p>
      <button class="btn ghost" id="copySumBtn">Copy check-in summary</button>
    </div>
  `;
}

/* ------------------------------------------------------ check-in export -- */
/* A short, pasteable digest. The full JSON export is the backup; this is the
   thing you can actually paste into a message from a phone. */
function buildSummary() {
  const u = unitLabel();
  const L = [];
  const pad = (t, n) => String(t).padEnd(n);

  L.push(`IRONLOG CHECK-IN — ${new Date().toLocaleDateString(undefined,
    { day: 'numeric', month: 'short', year: 'numeric' })}`);
  L.push(`Program: ${PROGRAM.name}, 2 on / 1 off`);

  if (!DB.sessions.length) {
    L.push('', 'No sessions logged yet.');
    return L.join('\n');
  }

  const first = DB.sessions[0].date, last = DB.sessions[DB.sessions.length - 1].date;
  const span = Math.max(1, daysBetween(first, today()));
  L.push(`${DB.sessions.length} sessions over ${span} days · last trained ${fmtDate(last)}`);

  // bodyweight
  const bw = DB.bw.slice().sort((a, b) => a.date.localeCompare(b.date));
  L.push('', 'BODYWEIGHT');
  if (bw.length > 1) {
    const d = bw[bw.length - 1].v - bw[0].v;
    const wks = Math.max(0.5, daysBetween(bw[0].date, bw[bw.length - 1].date) / 7);
    const perWk = d / wks;
    const pctWk = (perWk / bw[bw.length - 1].v) * 100;
    L.push(`  ${bw[bw.length - 1].v} ${u} now · ${d >= 0 ? '+' : ''}${d.toFixed(1)} ${u} since ${
      shortDate(bw[0].date)}`);
    L.push(`  rate ${perWk >= 0 ? '+' : ''}${perWk.toFixed(2)} ${u}/wk (${
      pctWk >= 0 ? '+' : ''}${pctWk.toFixed(2)}%/wk) · target +0.25 to +0.50%/wk`);
  } else {
    L.push('  not logged — this is the number that says whether the surplus is working');
  }

  // key lifts
  L.push('', `KEY LIFTS — estimated 1RM in ${u} (change since first logged session)`);
  for (const id of ['bb_bench', 'bb_squat', 'deadlift', 'ohp', 'pullup', 'cs_row']) {
    const h = historyFor(id);
    if (!h.length) continue;
    const ex = EXERCISE_INDEX[id];
    const val = d => Math.max(...d.sets.map(t => e1rm(t.w, t.r, t.rir)));
    const a = val(h[0]), b = val(h[h.length - 1]);
    const top = h[h.length - 1].sets.reduce((m, t) => e1rm(t.w, t.r, t.rir) > e1rm(m.w, m.r, m.rir) ? t : m);
    L.push(`  ${pad(ex.name, 24)} ${pad(Math.round(b), 5)} ${
      pad((b >= a ? '+' : '') + (a ? ((b - a) / a * 100).toFixed(0) : '0') + '%', 6)} last ${
      top.w}x${top.r}${top.rir !== '' && top.rir != null ? ` @${top.rir}RIR` : ''} · ${h.length} sessions`);
  }

  // volume
  const vol = weeklyVolume();
  L.push('', 'HARD SETS LAST 7 DAYS (target 10–20 per muscle)');
  L.push('  ' + Object.entries(MUSCLES)
    .map(([k, n]) => `${n} ${vol[k] % 1 ? vol[k].toFixed(1) : vol[k]}`).join(' · '));

  // balance across the rotation
  L.push('', 'SESSIONS PER ROTATION DAY');
  L.push('  ' + PROGRAM.rotation
    .map(k => `${PROGRAM.days[k].name} ${DB.sessions.filter(x => x.dayKey === k).length}`).join(' · '));

  // standing per-exercise reminders
  const noted = Object.keys(EXERCISE_INDEX).filter(id => exNote(id));
  if (noted.length) {
    L.push('', 'EXERCISE NOTES');
    for (const id of noted) L.push(`  ${EXERCISE_INDEX[id].name}: ${exNote(id).replace(/\s+/g, ' ')}`);
  }

  // recent sessions
  L.push('', 'RECENT SESSIONS');
  for (const x of DB.sessions.slice(-6).reverse()) {
    const n = Object.values(x.entries || {}).reduce((a, y) => a + loggedSets(y).length, 0);
    L.push(`  ${pad(shortDate(x.date), 8)} ${pad(PROGRAM.days[x.dayKey].name, 9)} ${
      pad(n + ' sets', 9)} ${fmtTonnage(x)}${x.notes ? ' · ' + x.notes.slice(0, 60) : ''}`);
  }

  return L.join('\n');
}

async function copySummary() {
  const text = buildSummary();
  try {
    await navigator.clipboard.writeText(text);
    toast('Summary copied — paste it into a message.');
  } catch (e) {
    // clipboard blocked (older iOS, insecure context): show it to select by hand
    const dlg = sheet(`
      <h3>Check-in summary</h3>
      <p style="font-size:12.5px;color:var(--ink-2);margin:-4px 0 0">
        Copying was blocked, so select this text and copy it manually.</p>
      <textarea readonly style="width:100%;height:46vh;background:var(--surface-2);
        border:1px solid var(--line);border-radius:8px;color:var(--ink);padding:10px;
        font-family:var(--font-data);font-size:11px;line-height:1.5">${esc(text)}</textarea>
      <button class="btn ghost" data-close>Close</button>`);
    dlg.querySelector('textarea').select();
    dlg.querySelector('[data-close]').onclick = () => dlg.close();
  }
}

/* Small SVG line chart. One scale places the marks, the ticks and the labels;
   the viewBox leaves room for the outermost label so nothing clips. */
function lineChart(pts, h = 78) {
  if (!pts || pts.length < 2) {
    return `<div style="font-size:12px;color:var(--ink-3);font-family:var(--font-data)">
      ${pts?.length ? 'One data point — chart appears after the next entry.' : ''}</div>`;
  }
  const W = 320, PAD_L = 4, PAD_R = 34, PAD_T = 8, PAD_B = 16;
  const ys = pts.map(p => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi === lo) { hi = lo + 1; lo = lo - 1; }
  const span = hi - lo;
  lo -= span * 0.12; hi += span * 0.12;

  const x = i => PAD_L + (i / (pts.length - 1)) * (W - PAD_L - PAD_R);
  const y = v => PAD_T + (1 - (v - lo) / (hi - lo)) * (h - PAD_T - PAD_B);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${h - PAD_B}L${PAD_L},${h - PAD_B}Z`;
  const lastX = x(pts.length - 1), lastY = y(pts[pts.length - 1].y);
  const gid = 'g' + Math.random().toString(36).slice(2, 8);

  return `<div class="chartwrap"><svg class="chart" viewBox="0 0 ${W} ${h}" role="img"
    aria-label="Trend from ${pts[0].y} to ${pts[pts.length - 1].y}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity=".22"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${PAD_L}" y1="${h - PAD_B}" x2="${W - PAD_R}" y2="${h - PAD_B}"
          stroke="var(--line)" stroke-width="1"/>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.2" fill="var(--accent)"/>
    <text x="${(lastX + 7).toFixed(1)}" y="${(lastY + 3.5).toFixed(1)}" fill="var(--ink-2)">${Math.round(pts[pts.length - 1].y)}</text>
    <text x="${PAD_L}" y="${h - 4}">${esc(shortDate(pts[0].x))}</text>
    <text x="${(W - PAD_R).toFixed(1)}" y="${h - 4}" text-anchor="end">${esc(shortDate(pts[pts.length - 1].x))}</text>
  </svg></div>`;
}
function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------- PROGRAM -- */
function viewProgram() {
  const days = PROGRAM.rotation.map(k => {
    const d = PROGRAM.days[k];
    return `<div class="card flush" style="margin-bottom:10px" data-day="${k}">
      <div style="padding:14px 14px 10px;border-bottom:1px solid var(--line-soft);
                  display:flex;align-items:center;gap:10px">
        <span class="daydot" style="min-height:26px"></span>
        <span style="flex:1">
          <div style="font-weight:700;font-size:15px;letter-spacing:-.01em">${esc(d.name)}</div>
          <div style="font-size:11.5px;color:var(--ink-3)">${esc(d.subtitle)}</div>
        </span>
      </div>
      <div class="rows">
        ${d.exercises.map(ex => `<div class="row">
          <span class="lead">
            <div class="t1">${esc(ex.name)}${ex.superset ? `<span class="ss-tag">SS ${ex.superset}</span>` : ''}</div>
            <div class="t2">${esc(MUSCLES[ex.muscle])} · ${REP_SCHEMES[ex.scheme].rir} RIR</div>
            ${exNote(ex.id) ? `<div class="notepeek">${esc(exNote(ex.id))}</div>` : ''}
          </span>
          <span class="val">${ex.sets}×${ex.lo}–${ex.hi}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="eyebrow">Why this program</div>
      <div class="prose" style="margin-top:10px">
        <p>Four things drive hypertrophy, and almost nothing else does. This block is
           built to hit all four and let you measure each one.</p>
        <h3>1. Hard sets close to failure</h3>
        <p>Effort is the trigger. Sets taken within about <b>0–3 reps of failure</b> grow
           muscle; sets stopped 5+ reps short mostly do not. Load matters far less than
           people think — anywhere from <b>5 to 30 reps</b> builds similar size when the
           set is taken close enough to failure. That is why the heavy compounds here run
           5–8 and the isolation work runs 12–20: same stimulus, different joint cost.</p>
        <h3>2. Enough weekly volume</h3>
        <p><b>10–20 hard sets per muscle per week</b> is where the dose-response curve
           flattens. Below 10 you are under-dosing. The Progress tab counts this for you
           automatically and marks the band.</p>
        <h3>3. Progressive overload, tracked</h3>
        <p>The muscle only adapts if the demand keeps rising. This app uses
           <b>double progression</b>: stay at a weight until you hit the top of the rep
           range on every set, then add the smallest jump and rebuild. Showing you last
           session's numbers next to today's box is the entire point of the app.</p>
        <h3>4. Frequency of about twice a week</h3>
        <p>Training a muscle twice a week beats once, mostly because it spreads the same
           volume across fresher sessions. The 2-on/1-off rotation lands every muscle
           twice per 6-day cycle.</p>
        <h3>The part that is not training</h3>
        <p>Strength climbing while the mirror stays flat is the single most common pattern
           in a first year of lifting, and it is usually not a programming problem. Early
           strength gains are largely <b>neural</b> — better technique, better recruitment —
           and they happen fine at maintenance calories. New tissue does not.</p>
        <p>To actually get bigger you need a <b>small calorie surplus</b> (roughly 300–400
           over maintenance, aiming for <b>0.25–0.5% of bodyweight gained per week</b>) and
           <b>1.6–2.2 g of protein per kg</b> of bodyweight — about 0.7–1.0 g per pound.
           Above ~1.6 g/kg the returns flatten hard, so treat that as the floor, not a
           target to chase.</p>
        <h3>When to deload</h3>
        <p>Every <b>6 cycles</b> — roughly 8 weeks — run one cycle at half the sets, same
           weights. You are not losing anything; you are letting accumulated fatigue drain
           so the next block starts from a higher floor.</p>
      </div>
    </div>

    <div><h2 class="sect">The rotation</h2>
      <div style="margin-top:8px">${days}</div></div>

    <div class="card">
      <div class="eyebrow">Reading the logger</div>
      <div class="prose" style="margin-top:10px">
        <ul>
          <li><b>Last time</b> — what you did on that set number last session. Beat it.</li>
          <li><b>RIR</b> — reps in reserve: how many more you could have done. <code>2</code>
              means you had two left. Be honest; the number is only useful if it is.</li>
          <li><b>SS</b> — superset. Alternate between the two marked exercises to save time.</li>
          <li><b>Per side</b> — plate math for barbell lifts, so you are not doing arithmetic
              between sets.</li>
        </ul>
      </div>
    </div>

    <button class="btn ghost" id="settingsBtn2">Settings &amp; backup</button>
  `;
}

/* ==========================================================================
   SESSION LIFECYCLE
   ========================================================================== */

function startSession() {
  const dayKey = nextDayKey();
  const day = PROGRAM.days[dayKey];
  const entries = {};
  for (const ex of day.exercises) {
    const w = suggestedWeight(ex);
    entries[ex.id] = Array.from({ length: ex.sets }, () => ({ w: w === '' ? '' : w, r: '', rir: '', done: false }));
  }
  DB.active = { dayKey, date: today(), started: Date.now(), entries, notes: '' };
  expanded.clear();
  expanded.add(day.exercises[0].id);
  save(); render();
}

function finishSession() {
  const a = DB.active;
  const logged = Object.values(a.entries).reduce((n, s) => n + loggedSets(s).length, 0);
  if (!logged) {
    toast('Nothing logged — tick at least one set first.');
    return;
  }
  const notes = document.getElementById('sessNotes')?.value || '';
  DB.sessions.push({
    id: 's' + Date.now(),
    dayKey: a.dayKey, date: a.date,
    started: a.started, ended: Date.now(),
    entries: a.entries, notes,
  });
  DB.sessions.sort((x, y) => x.date.localeCompare(y.date));
  DB.nextIndex = (DB.nextIndex + 1) % PROGRAM.rotation.length;
  DB.active = null;
  Timer.stop();
  save(); render();
  toast(`${PROGRAM.days[a.dayKey].name} logged — ${logged} sets in the book.`);
}

/* ==========================================================================
   EVENTS
   ========================================================================== */

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tabs button');
  if (tab) { view = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }

  if (e.target.closest('#startBtn'))  { startSession(); return; }
  if (e.target.closest('#finishBtn')) { finishSession(); return; }

  if (e.target.closest('#cancelBtn')) {
    if (confirm('Discard this session? Everything you logged in it is lost.')) {
      DB.active = null; Timer.stop(); save(); render();
    }
    return;
  }

  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    const id = toggle.dataset.toggle;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    render();
    return;
  }

  const tick = e.target.closest('[data-tick]');
  if (tick) {
    const row = tick.closest('.setrow');
    const exId = row.dataset.ex, si = +row.dataset.set;
    const set = DB.active.entries[exId][si];
    const ex = EXERCISE_INDEX[exId];

    if (!set.done) {
      // adopt whatever is in the boxes; reps are required, weight can be bodyweight
      const w = row.querySelector('[data-f="w"]').value;
      const r = row.querySelector('[data-f="r"]').value;
      if (!r) { row.querySelector('[data-f="r"]').focus(); toast('Add the reps first.'); return; }
      set.w = w === '' ? 0 : Number(w);
      set.r = Number(r);
      set.rir = row.querySelector('[data-f="rir"]').value;
      set.done = true;

      const wasBest = bestE1rmFor(exId);
      save();
      Sound.unlock();
      Timer.start(REST_SECONDS[ex.scheme], `${ex.name} — ${si + 2 > ex.sets ? 'last set done' : 'set ' + (si + 2) + ' next'}`);
      if (e1rm(set.w, set.r, set.rir) > wasBest && historyFor(exId).length) {
        toast(`Best ${ex.name} set yet.`);
      }
    } else {
      set.done = false;
      save();
    }
    render();
    return;
  }

  const restBtn = e.target.closest('[data-rest]');
  if (restBtn) {
    const ex = EXERCISE_INDEX[restBtn.dataset.rest];
    Sound.unlock();
    Timer.start(REST_SECONDS[ex.scheme], `${ex.name} — resting`);
    return;
  }

  const sess = e.target.closest('[data-session]');
  if (sess) { openSession(sess.dataset.session); return; }

  if (e.target.closest('#switchBtn')) { openWorkoutPicker(); return; }
  if (e.target.closest('#copySumBtn')) { copySummary(); return; }
  if (e.target.closest('#settingsBtn') || e.target.closest('#settingsBtn2')) { openSettings(); return; }
  if (e.target.closest('#bwBtn')) { openBodyweight(); return; }
});

/* keep inputs in state as they are typed, without re-rendering under the user */
document.addEventListener('input', (e) => {
  const row = e.target.closest('.setrow');
  if (row && DB.active) {
    const set = DB.active.entries[row.dataset.ex][+row.dataset.set];
    const f = e.target.dataset.f;
    set[f] = e.target.value === '' ? '' : (f === 'rir' ? e.target.value : Number(e.target.value));
    save();
    if (f === 'w') {
      const pm = plateMath(e.target.value, row.dataset.ex);
      const box = row.closest('.ex-body')?.querySelector('.plates');
      if (box) box.innerHTML = platesHTML(pm);
    }
    return;
  }
  if (e.target.dataset.exnote) { setExNote(e.target.dataset.exnote, e.target.value); return; }
  if (e.target.id === 'sessNotes' && DB.active) { DB.active.notes = e.target.value; save(); }
});

/* ==========================================================================
   DIALOGS
   ========================================================================== */

function sheet(html) {
  const dlg = document.getElementById('dlg');
  dlg.innerHTML = `<div class="sheet">${html}</div>`;
  dlg.showModal();
  return dlg;
}

function openSession(id) {
  const s = DB.sessions.find(x => x.id === id);
  if (!s) return;
  const day = PROGRAM.days[s.dayKey];
  const body = day.exercises.map(ex => {
    const sets = loggedSets(s.entries?.[ex.id]);
    if (!sets.length) return '';
    return `<div style="margin-bottom:12px">
      <div style="font-weight:600;font-size:13.5px;margin-bottom:3px">${esc(ex.name)}</div>
      <div style="font-family:var(--font-data);font-size:12px;color:var(--ink-2)">
        ${sets.map(t => `${t.w}×${t.r}${t.rir !== '' && t.rir != null ? ` @${t.rir}` : ''}`).join('   ·   ')}
      </div></div>`;
  }).join('');

  const dlg = sheet(`
    <div data-day="${s.dayKey}">
      <div class="eyebrow">${esc(fmtDate(s.date))}</div>
      <h3 style="margin:5px 0 14px">${esc(day.name)}</h3>
      ${body}
      ${s.notes ? `<div style="font-size:13px;color:var(--ink-2);border-top:1px solid var(--line-soft);
        padding-top:11px;margin-top:4px;line-height:1.5">${esc(s.notes)}</div>` : ''}
    </div>
    <div class="btn-row">
      <button class="btn danger" data-del="${s.id}">Delete</button>
      <button class="btn ghost" data-close>Close</button>
    </div>`);

  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  dlg.querySelector('[data-del]').onclick = () => {
    if (!confirm('Delete this session permanently?')) return;
    DB.sessions = DB.sessions.filter(x => x.id !== s.id);
    save(); dlg.close(); render();
    toast('Session deleted.');
  };
}

function openWorkoutPicker() {
  const current = nextDayKey();
  const rows = PROGRAM.rotation.map((k, i) => {
    const d = PROGRAM.days[k];
    const last = dayLastDone(k);
    return `<button class="row pickrow ${k === current ? 'on' : ''}" data-pick="${i}" data-day="${k}">
      <span class="daydot"></span>
      <span class="lead">
        <div class="t1">${esc(d.name)}${k === current ? ' <span class="ss-tag">NEXT UP</span>' : ''}</div>
        <div class="t2">${esc(d.subtitle)}</div>
      </span>
      <span class="val">${d.exercises.length} ex<br><span style="color:var(--ink-3)">${
        last ? esc(fmtDate(last)) : 'never'}</span></span>
    </button>`;
  }).join('');

  const dlg = sheet(`
    <h3>Choose a workout</h3>
    <p style="font-size:12.5px;color:var(--ink-2);margin:-4px 0 2px;line-height:1.45">
      Picking one moves the rotation to it. The date on the right is when you last
      did that day — favouring the one you've trained least keeps the balance even.</p>
    <div>${rows}</div>
    <button class="btn ghost" data-close>Cancel</button>`);

  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    DB.nextIndex = +b.dataset.pick;
    save(); dlg.close(); render();
    toast(`Switched to ${PROGRAM.days[nextDayKey()].name}.`);
  });
}

function openBodyweight() {
  const last = DB.bw.length ? DB.bw[DB.bw.length - 1].v : '';
  const dlg = sheet(`
    <h3>Log bodyweight</h3>
    <div class="field">
      <label for="bwVal">Weight (${esc(unitLabel())})</label>
      <input id="bwVal" type="number" inputmode="decimal" step="0.1" value="${last}">
    </div>
    <p style="font-size:12px;color:var(--ink-3);margin:0;line-height:1.45">
      Weigh first thing, after the bathroom, before food. The daily number is noise —
      the trend over 2–3 weeks is the signal.</p>
    <div class="btn-row">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn" data-save>Save</button>
    </div>`);
  const input = dlg.querySelector('#bwVal');
  input.focus(); input.select();
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  dlg.querySelector('[data-save]').onclick = () => {
    const v = Number(input.value);
    if (!v) { toast('Enter a weight.'); return; }
    DB.bw = DB.bw.filter(b => b.date !== today());
    DB.bw.push({ date: today(), v });
    DB.bw.sort((a, b) => a.date.localeCompare(b.date));
    save(); dlg.close(); render();
    toast('Weight logged.');
  };
}

function openSettings() {
  const dlg = sheet(`
    <h3>Settings</h3>

    <div class="field">
      <label>Units</label>
      <div class="seg" id="unitSeg">
        <button data-u="lb" aria-pressed="${DB.unit === 'lb'}">Pounds</button>
        <button data-u="kg" aria-pressed="${DB.unit === 'kg'}">Kilograms</button>
      </div>
      <span style="font-size:11.5px;color:var(--ink-3)">Switching converts everything already logged.</span>
    </div>

    <div class="field">
      <label>Rest timer sound</label>
      <div class="seg" id="soundSeg">
        <button data-s="1" aria-pressed="${DB.sound !== false}">Chime</button>
        <button data-s="0" aria-pressed="${DB.sound === false}">Silent</button>
      </div>
      <span style="font-size:11.5px;color:var(--ink-3)">Plays when the rest timer hits zero.
        iOS mutes web audio while the screen is locked — keep the app open to hear it.</span>
    </div>

    <div class="field">
      <label for="nextSel">Next workout</label>
      <select id="nextSel">
        ${PROGRAM.rotation.map((k, i) =>
          `<option value="${i}" ${i === DB.nextIndex ? 'selected' : ''}>${esc(PROGRAM.days[k].name)}</option>`).join('')}
      </select>
      <span style="font-size:11.5px;color:var(--ink-3)">Use this if you skip a day or train out of order.</span>
    </div>

    <div style="border-top:1px solid var(--line-soft);padding-top:14px">
      <div class="eyebrow" style="margin-bottom:9px">Backup</div>
      <p style="font-size:12.5px;color:var(--ink-2);margin:0 0 11px;line-height:1.45">
        Your log lives only in this browser on this device. Export a copy before you
        clear browsing data or change phones.</p>
      <div class="btn-row">
        <button class="btn ghost" data-export>Export JSON</button>
        <button class="btn ghost" data-import>Import</button>
      </div>
    </div>

    <button class="btn" data-close>Done</button>
    <button class="btn danger" data-wipe style="min-height:40px;font-size:13px">Erase all data</button>
  `);

  dlg.querySelector('[data-close]').onclick = () => dlg.close();

  dlg.querySelector('#unitSeg').onclick = (e) => {
    const b = e.target.closest('[data-u]');
    if (!b || b.dataset.u === DB.unit) return;
    convertAll(b.dataset.u);
    save(); dlg.close(); render();
    toast(`Switched to ${DB.unit === 'lb' ? 'pounds' : 'kilograms'}.`);
  };
  dlg.querySelector('#soundSeg').onclick = (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    DB.sound = b.dataset.s === '1';
    save();
    dlg.querySelectorAll('#soundSeg button').forEach(x =>
      x.setAttribute('aria-pressed', String((x.dataset.s === '1') === DB.sound)));
    if (DB.sound) { Sound.unlock(); Sound.chime(); }
  };
  dlg.querySelector('#nextSel').onchange = (e) => { DB.nextIndex = +e.target.value; save(); render(); };

  dlg.querySelector('[data-export]').onclick = () => {
    const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ironlog-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  dlg.querySelector('[data-import]').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      try {
        const parsed = JSON.parse(await inp.files[0].text());
        if (!Array.isArray(parsed.sessions)) throw new Error('not an Ironlog backup');
        if (!confirm(`Replace your current log with this backup (${parsed.sessions.length} sessions)?`)) return;
        DB = clean(parsed);
        save(); dlg.close(); render();
        toast('Backup restored.');
      } catch (err) {
        toast('That file is not an Ironlog backup.');
      }
    };
    inp.click();
  };

  dlg.querySelector('[data-wipe]').onclick = () => {
    if (!confirm('Erase every session, weigh-in and setting? This cannot be undone.')) return;
    localStorage.removeItem(STORE_KEY);
    DB = { ...DEFAULTS };
    dlg.close(); render();
    toast('All data erased.');
  };
}

/* ==========================================================================
   BOOT
   ========================================================================== */

document.getElementById('tabs').innerHTML = [
  ['today', 'Today', ICON.today],
  ['history', 'History', ICON.history],
  ['progress', 'Progress', ICON.progress],
  ['program', 'Program', ICON.program],
].map(([k, label, icon]) =>
  `<button data-tab="${k}" role="tab" aria-selected="${view === k}">${svg(icon)}<span>${label}</span></button>`
).join('');

document.getElementById('timerbar').addEventListener('click', (e) => {
  const add = e.target.closest('[data-addtime]');
  if (add) { Sound.unlock(); Timer.add(+add.dataset.addtime); return; }
  if (e.target.closest('[data-skip]')) Timer.stop();
});

if (DB.active) { expanded.add(PROGRAM.days[DB.active.dayKey].exercises[0].id); }
render();

/* A home-screen app on iOS is resumed, not reopened, so it would sit on the old
   version indefinitely. Check for an update whenever it comes back to the front,
   and reload once the new worker takes over — unless a set is half-typed. */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').then(reg => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {}));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    const typing = document.activeElement?.matches('input, textarea');
    if (!typing) location.reload();
  });
}

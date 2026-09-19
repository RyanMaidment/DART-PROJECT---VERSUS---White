/* ==========================================================================
   Dart League — Scorer (tablet)
   One device per match. The marker enters each turn's score in throw order;
   the app works out remaining score, busts, finishes, "under 100 first",
   leg points and every player stat. Everything is saved live to the league
   database, and the TV board updates by itself.
   ========================================================================== */

import { createStore } from '../lib/store.js';
import {
  withRules, matchState, legState, starterFor, lineupFor, nextPlayer, lastThrower,
  classifyEntry, replaySide, fmtPoints,
} from '../lib/engine.js';
import { teamLabel, lineupChoices, customTeamName, teamTitle } from '../lib/night.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const keyOf = (side) => (side === 'A' ? 'a' : 'b');

const QUICK_SCORES = [26, 41, 45, 60, 100, 180];

const S = {
  store: null,
  kind: null,
  auth: { ready: false, signedIn: false, role: null },
  config: null,
  players: null,
  byId: {},
  nightId: null,
  night: null,
  matches: null,
  route: { name: 'list', id: null },
  viewLeg: null,       // leg being viewed (null = the first unfinished leg)
  entry: '',           // digits typed for the next turn
  override: null,      // player picked for the next turn (otherwise: next in rotation)
  pending: false,      // writes waiting to sync
  online: navigator.onLine,
};

let dataStarted = false;
let unsubNight = null;
let unsubMatches = null;

/* ================================================================== boot == */

boot();

async function boot() {
  try {
    S.store = await createStore();
  } catch (err) {
    console.error(err);
    $('#app').innerHTML = `<div class="center-msg"><h2>Couldn't start</h2>${esc(err.message || err)}<br><br>Check <code>lib/config.js</code> and your internet connection.</div>`;
    return;
  }
  S.kind = S.store.kind;
  readHash();
  window.addEventListener('hashchange', () => { readHash(); render(); });
  window.addEventListener('online', () => { S.online = true; render(); });
  window.addEventListener('offline', () => { S.online = false; render(); });

  // No sign-in needed on the scorer: the database rules let anyone update scores.
  S.auth = { ready: true, signedIn: true, role: null };
  startData();
  render();
}

function startData() {
  if (dataStarted) return;
  dataStarted = true;
  S.store.onConfig((cfg) => {
    S.config = cfg || {};
    const id = (cfg && cfg.currentNight) || null;
    if (id !== S.nightId) watchNight(id);
    render();
  });
  S.store.onPlayers((players) => {
    S.players = players;
    S.byId = Object.fromEntries(players.map((p) => [p.id, p]));
    render();
  });
}

function watchNight(id) {
  if (unsubNight) unsubNight();
  if (unsubMatches) unsubMatches();
  S.nightId = id;
  S.night = null;
  S.matches = id ? null : [];
  if (!id) return;
  unsubNight = S.store.onNight(id, (n) => { S.night = n; render(); });
  unsubMatches = S.store.onMatches(id, (matches, meta) => {
    S.matches = matches;
    S.pending = !!(meta && meta.pending);
    render();
  });
}

/* ================================================================ routing == */

function readHash() {
  const m = location.hash.match(/^#\/match\/([\w-]+)/);
  const next = m ? { name: 'match', id: m[1] } : { name: 'list', id: null };
  if (next.name !== S.route.name || next.id !== S.route.id) {
    S.viewLeg = null; S.entry = ''; S.override = null;
  }
  S.route = next;
}
const go = (hash) => { location.hash = hash; };

/* ================================================================== helpers == */

const rules = () => withRules(S.config && S.config.rules);
const matchNo = (m) => parseInt(String(m.id).replace(/\D/g, ''), 10) || 0;
const findMatch = (id) => (S.matches || []).find((m) => m.id === id);
const P = (id) => S.byId[id];

function firstName(id) {
  const p = P(id);
  if (!p) return '?';
  const t = (p.short || p.name).split(/\s+/);
  return (t[0] === 'S.' && t[1]) ? t[1] : t[0];
}
const shortOf = (id) => (P(id) ? (P(id).short || P(id).name) : '?');

// "The Honey Badgers" if the team has a name, otherwise "Team 7"
const tt = (teamNum) => teamTitle(S.config, teamNum);

// What to show as the team's line on cards: its name if it has one, else the players' names
function namesOf(m, side, n) {
  const custom = customTeamName(S.config, side === 'A' ? m.teamA : m.teamB);
  return custom || lineupFor(m, n, side).map(shortOf).join(', ');
}

let toastTimer = null;
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2800);
}

/* ================================================================== render == */

function render() {
  const app = $('#app');
  if (!S.auth.ready) { app.innerHTML = '<div class="center-msg">Loading…</div>'; return; }
  if (!S.config || !S.players || (S.nightId && !S.matches)) { app.innerHTML = topbar({ title: 'Dart League' }) + '<div class="center-msg">Loading…</div>'; return; }

  if (S.route.name === 'match') {
    const m = findMatch(S.route.id);
    if (m) { app.innerHTML = matchView(m); afterRender(); return; }
  }
  app.innerHTML = listView();
}

function afterRender() {
  document.querySelectorAll('.turns').forEach((el) => { el.scrollTop = el.scrollHeight; });
}

function topbar({ left = '', title = '', sub = '', mid = '', right = '' }) {
  return `<header class="topbar">${left}<div class="title">${title}${sub ? `<small>${sub}</small>` : ''}</div>${mid}${right}</header>`;
}

function syncHtml() {
  const cls = !S.online ? 'off' : S.pending ? 'saving' : '';
  const text = !S.online ? 'Offline — saving on this device' : S.pending ? 'Saving…' : 'Saved';
  return `${S.kind === 'demo' ? '<span class="demo-flag">DEMO</span>' : ''}<span class="sync ${cls}" title="${text}"><i></i><span class="sync-text">${text}</span></span>`;
}

/* -------------------------------------------------------------- match list -- */

function listView() {
  const R = rules();
  const dateTxt = S.night && S.night.date
    ? new Date(S.night.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    : '';
  const bar = topbar({
    title: esc((S.config && S.config.name) || 'Dart League'),
    sub: 'Scorer',
    right: syncHtml(),
  });

  if (!S.nightId) {
    return bar + `<div class="center-msg"><h2>No night set up</h2>Ask the league admin to create tonight's matchups on the Admin page.</div>`;
  }
  const list = [...S.matches].sort((a, b) => matchNo(a) - matchNo(b));
  if (!list.length) {
    return bar + `<div class="center-msg"><h2>No matches yet</h2>Tonight's matchups haven't been created. Ask the league admin.</div>`;
  }

  const cards = list.map((m) => {
    const ms = matchState(m, R);
    const status = m.status === 'final'
      ? '<span class="pill final">Final</span>'
      : ms.started ? `<span class="pill live">Leg ${ms.currentLeg} live</span>` : '<span class="pill">Not started</span>';
    return `
      <button class="match-card" data-act="open" data-id="${esc(m.id)}">
        <div class="mt"><span class="tok">${esc(m.teamA)}</span><span class="names">${esc(namesOf(m, 'A', ms.currentLeg))}</span></div>
        <div class="mid"><div class="pts">${fmtPoints(ms.a)} : ${fmtPoints(ms.b)}</div>${status}</div>
        <div class="mt b"><span class="tok">${esc(m.teamB)}</span><span class="names">${esc(namesOf(m, 'B', ms.currentLeg))}</span></div>
      </button>`;
  }).join('');

  return bar + `<div class="list-wrap"><div class="night-head">${esc(dateTxt)}${S.night && S.night.week ? ` · <b>Week ${esc(S.night.week)}</b>` : ''} — pick your match</div>${cards}</div>`;
}

/* ------------------------------------------------------------ match setup -- */

function selectOptions(choices, selectedId) {
  const groups = {};
  choices.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
  const has = choices.some((c) => c.id === selectedId);
  let out = '<option value="">— pick player —</option>';
  if (selectedId && !has && P(selectedId)) out += `<option value="${esc(selectedId)}" selected>${esc(P(selectedId).name)}</option>`;
  for (const [g, arr] of Object.entries(groups)) {
    out += `<optgroup label="${esc(g)}">` + arr.map((c) =>
      `<option value="${esc(c.id)}"${c.id === selectedId ? ' selected' : ''}>${esc(c.name)}${c.gender === 'N' && !c.dummy ? ' (gender not set)' : ''}</option>`).join('') + '</optgroup>';
  }
  return out;
}

function setupView(m) {
  const cols = ['A', 'B'].map((side) => {
    const tn = side === 'A' ? m.teamA : m.teamB;
    const lineup = side === 'A' ? m.lineupA : m.lineupB;
    const choices = lineupChoices(S.players, tn);
    const selects = [0, 1, 2].map((i) => `
      <label>Player ${i + 1}${i === 0 ? ' (throws first)' : ''}</label>
      <select class="sel" id="lu-${side}-${i}">${selectOptions(choices, lineup && lineup[i])}</select>`).join('');
    return `<div class="setup-col ${side === 'A' ? 'a' : 'b'}"><h3>Team ${esc(tn)}</h3>
      <label>Team name (optional)</label>
      <input class="txt" id="tn-${side}" maxlength="30" placeholder="e.g. The Honey Badgers" value="${esc(customTeamName(S.config, tn))}">
      ${selects}</div>`;
  }).join('');

  return topbar({
    left: '<button class="btn small ghost" data-act="back">‹ Matches</button>',
    title: `Match ${matchNo(m)}<small>${esc(tt(m.teamA))} v ${esc(tt(m.teamB))} · setup</small>`,
    right: syncHtml(),
  }) + `
    <div class="setup">
      <h2>Who's playing?</h2>
      <div class="setup-cols">${cols}</div>
      <div class="starter">
        <b>Who throws first in leg 1?</b>
        <div class="seg" id="first-starter">
          <button class="on" data-act="pick-starter" data-side="A">${esc(tt(m.teamA))}</button>
          <button data-act="pick-starter" data-side="B">${esc(tt(m.teamB))}</button>
        </div>
      </div>
      <p style="color:var(--chalk-dim);margin:0 0 14px">Legs then alternate. Use a <b>Dummy</b> if someone hasn't arrived yet — you can swap them in later without losing anything.</p>
      <button class="btn good" style="width:100%;font-size:20px" data-act="start">Start match ▶</button>
    </div>`;
}

/* ------------------------------------------------------------ match screen -- */

function matchView(m) {
  const R = rules();
  const ms = matchState(m, R);
  if (!ms.started && m.status === 'pending') return setupView(m);

  const n = (S.viewLeg && S.viewLeg <= R.legsPerMatch) ? S.viewLeg : ms.currentLeg;
  const leg = (m.legs && m.legs[n]) || { a: [], b: [] };
  const st = legState(leg, starterFor(m, n), R);

  const legChips = ms.legs.map((l) => {
    const cls = [l.state.winner === 'A' ? 'wa' : l.state.winner === 'B' ? 'wb' : '', l.n === n ? 'cur' : ''].join(' ');
    return `<button class="legchip ${cls}" data-act="leg" data-n="${l.n}" aria-label="Leg ${l.n}">${l.n}</button>`;
  }).join('');

  const bar = topbar({
    left: '<button class="btn small ghost" data-act="back">‹ Matches</button>',
    title: `Match ${matchNo(m)}<small>${esc(tt(m.teamA))} v ${esc(tt(m.teamB))}${S.night && S.night.week ? ` · Week ${esc(S.night.week)}` : ''}</small>`,
    mid: `<div class="legbar">${legChips}</div>`,
    right: syncHtml(),
  });

  return bar + `<div class="match-grid">
    ${teamPanel(m, 'A', n, leg, st, ms, R)}
    ${padPanel(m, n, leg, st, ms, R)}
    ${teamPanel(m, 'B', n, leg, st, ms, R)}
  </div>`;
}

function currentThrower(m, n, leg, st) {
  if (st.over) return null;
  const side = st.next;
  const lineup = lineupFor(m, n, side);
  const pid = (S.override && lineup.includes(S.override)) ? S.override : nextPlayer(lineup, leg[keyOf(side)]);
  return { side, pid, lineup };
}

function teamPanel(m, side, n, leg, st, ms, R) {
  const tn = side === 'A' ? m.teamA : m.teamB;
  const sd = st[side];
  const lineup = lineupFor(m, n, side);
  const thrower = currentThrower(m, n, leg, st);
  const active = !!thrower && thrower.side === side;
  const pts = side === 'A' ? ms.a : ms.b;
  const ton = (id) => R.tonThreshold[P(id) && P(id).gender === 'F' ? 'F' : 'M'];

  const tags = [
    active ? '<span class="tag throw">▶ Throwing</span>' : '',
    st.under100First === side ? `<span class="tag bonus">Under ${R.underThreshold} first +${R.under100Points}</span>` : '',
    st.winner === side ? `<span class="tag win">Finished · +${R.finishPoints}</span>` : '',
  ].join('');

  const chips = lineup.map((id) => {
    const sel = active && id === thrower.pid;
    return active
      ? `<button class="pchip ${sel ? 'sel' : ''}" data-act="pick" data-p="${esc(id)}">${esc(shortOf(id))}</button>`
      : `<span class="pchip static">${esc(shortOf(id))}</span>`;
  }).join('');

  const turns = sd.turns.map((t, i) => {
    const cls = [t.finish ? 'fin' : '', t.bust ? 'bust' : '', R.maxShots.includes(t.s) ? 'max' : (t.s >= ton(t.p) ? 'ton' : '')].join(' ');
    return `<button class="tchip ${cls}" data-act="edit" data-side="${side}" data-i="${i}"><span class="who">${esc(firstName(t.p))}</span><b>${t.s}</b></button>`;
  }).join('');

  const numCls = sd.finished ? 'done' : (sd.remaining < R.underThreshold ? 'under' : '');

  return `
    <section class="team ${side === 'B' ? 'b' : ''} ${active ? 'active' : ''} panel-${side.toLowerCase()}">
      <div class="team-head">
        <span class="tok">${esc(tn)}</span>
        <div class="names${customTeamName(S.config, tn) ? ' custom' : ''}">${esc(customTeamName(S.config, tn) || lineup.map(shortOf).join(', '))}</div>
        <div class="mpts">${fmtPoints(pts)}<small>MATCH PTS</small></div>
      </div>
      <div class="remaining">
        <div class="lbl">Remaining</div>
        <div class="num ${numCls}">${sd.remaining}</div>
      </div>
      <div class="tags">${tags}</div>
      <div class="pchips">${chips}</div>
      <div class="turns-label"><span>Turns (${sd.shots}) · tap to edit</span>
        <button class="btn small ghost" data-act="subs" data-side="${side}">Change players</button></div>
      <div class="turns">${turns || '<span style="color:var(--chalk-dim);font-size:13px">No turns yet</span>'}</div>
    </section>`;
}

function padPanel(m, n, leg, st, ms, R) {
  const canUndo = st.A.shots + st.B.shots > 0;
  const undoBtn = `<button class="btn" data-act="undo" ${canUndo ? '' : 'disabled'}>↶ Undo<span class="long"> last turn</span></button>`;
  const moreBtn = '<button class="btn ghost" data-act="more">More…</button>';
  const turnsBtn = '<button class="btn phone-only" data-act="turns">Turns</button>';

  /* Leg finished */
  if (st.over) {
    const label = (side) => {
      const p = st.pts[side];
      const parts = [];
      if (st.winner === side) parts.push('finish');
      if (st.under100First === side) parts.push(`under ${R.underThreshold}`);
      return `<div>${esc(tt(side === 'A' ? m.teamA : m.teamB))}<b>+${fmtPoints(p)}</b>${parts.join(' + ') || '—'}</div>`;
    };
    const winnerTeam = st.winner === 'A' ? m.teamA : m.teamB;
    let action;
    if (ms.complete) {
      action = m.status === 'final'
        ? '<button class="btn primary" data-act="back">Back to matches</button>'
        : '<button class="btn good" style="font-size:20px" data-act="finish">Finish match ✓</button>';
    } else {
      action = '<button class="btn good" style="font-size:20px" data-act="nextleg">Next leg ›</button>';
    }
    const matchLine = ms.complete
      ? `<h3 style="color:var(--brass)">Match complete</h3><div style="font-family:var(--font-mono);font-size:34px;font-weight:700">${fmtPoints(ms.a)} : ${fmtPoints(ms.b)}</div>`
      : '';
    return `<section class="pad">
      <div class="result-card">
        <h3>Leg ${n} — ${esc(tt(winnerTeam))} wins</h3>
        <div class="split">${label('A')}${label('B')}</div>
        ${matchLine}
        ${action}
      </div>
      <div class="pad-actions">${undoBtn}${turnsBtn}${moreBtn}</div>
    </section>`;
  }

  /* Leg in play */
  const t = currentThrower(m, n, leg, st);
  const tn = t.side === 'A' ? m.teamA : m.teamB;
  const rem = st[t.side].remaining;
  const noTurns = !canUndo;
  const starter = starterFor(m, n);
  const starterRow = noTurns ? `
    <div class="starter-row">Leg ${n} starts:
      <div class="seg">
        <button class="${starter === 'A' ? 'on' : ''}" data-act="set-starter" data-side="A">${esc(tt(m.teamA))}</button>
        <button class="${starter === 'B' ? 'on b' : ''}" data-act="set-starter" data-side="B">${esc(tt(m.teamB))}</button>
      </div></div>` : '';

  return `<section class="pad">
    <div class="pchips phone-only">${t.lineup.map((id) => `<button class="pchip ${id === t.pid ? 'sel' : ''}" data-act="pick" data-p="${esc(id)}">${esc(shortOf(id))}</button>`).join('')}</div>
    <div class="entry-box">
      <div class="who">${esc(tt(tn))} · <b>${esc(shortOf(t.pid))}</b> to throw · ${rem} left</div>
      <div class="val ${S.entry === '' ? 'empty' : ''}" id="entry-val">${S.entry === '' ? '0' : esc(S.entry)}</div>
    </div>
    <div class="quick">${QUICK_SCORES.map((q) => `<button data-act="quick" data-v="${q}">${q}</button>`).join('')}</div>
    <div class="keys">
      ${[7, 8, 9, 4, 5, 6, 1, 2, 3].map((d) => `<button data-act="key" data-k="${d}">${d}</button>`).join('')}
      <button class="back" data-act="key" data-k="back" aria-label="Backspace">⌫</button>
      <button data-act="key" data-k="0">0</button>
      <button class="enter" data-act="enter">Enter ✓</button>
    </div>
    ${starterRow}
    <div class="pad-actions">${undoBtn}${turnsBtn}${moreBtn}</div>
  </section>`;
}

/* ================================================================== keypad == */

function entryContext() {
  if (S.route.name !== 'match' || !S.matches || !S.players) return null;
  const m = findMatch(S.route.id);
  if (!m) return null;
  const R = rules();
  const ms = matchState(m, R);
  if (!ms.started && m.status === 'pending') return null;
  const n = (S.viewLeg && S.viewLeg <= R.legsPerMatch) ? S.viewLeg : ms.currentLeg;
  const leg = (m.legs && m.legs[n]) || { a: [], b: [] };
  const st = legState(leg, starterFor(m, n), R);
  return { m, R, ms, n, leg, st };
}

function updateEntryDisplay() {
  const el = $('#entry-val');
  if (!el) return;
  el.textContent = S.entry === '' ? '0' : S.entry;
  el.classList.toggle('empty', S.entry === '');
}

function press(k) {
  const ctx = entryContext();
  if (!ctx || ctx.st.over) return;
  if (k === 'back') { S.entry = S.entry.slice(0, -1); }
  else if (/^\d$/.test(k)) {
    const next = (S.entry === '0' ? '' : S.entry) + k;
    if (next.length > 3) return;
    if (parseInt(next, 10) > 180) { toast('The highest possible score is 180', 'error'); return; }
    S.entry = next;
  }
  updateEntryDisplay();
}

async function enterScore() {
  const ctx = entryContext();
  if (!ctx || ctx.st.over) return;
  const { m, n, leg, st } = ctx;
  if (S.entry === '') { toast('Type the score first (0 if they missed)', 'error'); return; }
  const s = parseInt(S.entry, 10);
  const thrower = currentThrower(m, n, leg, st);
  const rem = st[thrower.side].remaining;
  const c = classifyEntry(rem, s);

  if (c.kind === 'invalid') { toast(c.reason, 'error'); return; }
  if (c.kind === 'bust') {
    await commitTurn(ctx, thrower, 0, true);
    toast(`Bust — ${c.reason}. Recorded 0.`, 'error');
    return;
  }
  if (c.kind === 'finish') {
    const ok = await confirmModal({
      title: 'Finished the leg?',
      text: `${tt(thrower.side === 'A' ? m.teamA : m.teamB)} — ${firstName(thrower.pid)} checks out on ${s}. Was it a double?`,
      yes: `Yes, finished on ${s}`, no: 'No — fix score',
    });
    if (!ok) return;
    await commitTurn(ctx, thrower, s, false);
    toast(`Leg ${n} finished! 🎯`, 'good');
    return;
  }
  await commitTurn(ctx, thrower, s, false);
}

async function commitTurn(ctx, thrower, s, bust) {
  const { m, n, leg } = ctx;
  const key = keyOf(thrower.side);
  const turn = { p: thrower.pid, s, t: Date.now() };
  if (bust) turn.bust = true;
  const turns = [...(leg[key] || []), turn];
  S.entry = '';
  S.override = null;
  S.viewLeg = n;            // stay on this leg so a finished leg's result card shows
  try {
    await S.store.writeTurns(S.nightId, m.id, n, thrower.side, turns);
  } catch (err) {
    console.error(err);
    toast('Could not save that turn — check the connection and try again', 'error');
  }
  render();
}

async function undoLast() {
  const ctx = entryContext();
  if (!ctx) return;
  const { m, n, leg, st } = ctx;
  const side = lastThrower(st);
  if (!side) return;
  const key = keyOf(side);
  const turns = (leg[key] || []).slice(0, -1);
  S.viewLeg = n;
  S.entry = '';
  try {
    await S.store.writeTurns(S.nightId, m.id, n, side, turns);
    toast('Last turn removed');
  } catch (err) {
    toast('Could not undo — try again', 'error');
  }
  render();
}

/* ================================================================== modals == */

let modalResolve = null;

function showModal(html) {
  const d = $('#modal');
  d.innerHTML = html;
  if (!d.open) d.showModal();
}
function closeModal(result = false) {
  const d = $('#modal');
  if (modalResolve) { const r = modalResolve; modalResolve = null; r(result); }
  if (d.open) d.close();
}
// The 'close' event fires asynchronously; if a new dialog was opened in the meantime, leave it alone.
$('#modal').addEventListener('close', () => {
  if (!$('#modal').open && modalResolve) { const r = modalResolve; modalResolve = null; r(false); }
});

function confirmModal({ title, text, yes = 'Yes', no = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    modalResolve = resolve;
    showModal(`
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      <div class="row">
        <button class="btn" data-mact="no">${esc(no)}</button>
        <button class="btn ${danger ? 'danger' : 'good'}" data-mact="yes">${esc(yes)}</button>
      </div>`);
  });
}

function openTurns() {
  const ctx = entryContext();
  if (!ctx) return;
  const { m, n, leg, st, R } = ctx;
  const ton = (id) => R.tonThreshold[P(id) && P(id).gender === 'F' ? 'F' : 'M'];
  const col = (side) => {
    const tn = side === 'A' ? m.teamA : m.teamB;
    const chips = st[side].turns.map((t, i) => {
      const cls = [t.finish ? 'fin' : '', t.bust ? 'bust' : '', R.maxShots.includes(t.s) ? 'max' : (t.s >= ton(t.p) ? 'ton' : '')].join(' ');
      return `<button class="tchip ${cls}" data-act="edit" data-side="${side}" data-i="${i}"><span class="who">${esc(firstName(t.p))}</span><b>${t.s}</b></button>`;
    }).join('') || '<span style="color:var(--chalk-dim);font-size:13px">No turns yet</span>';
    return `<div class="sheet-col ${side === 'B' ? 'b' : ''}">
      <h4>${esc(tt(tn))} · ${st[side].remaining} left</h4>
      <div class="sheet-turns">${chips}</div>
      <button class="btn small" data-act="subs" data-side="${side}">Change players</button>
    </div>`;
  };
  showModal(`
    <h3>Leg ${n} — turns</h3>
    <p>Tap a turn to correct it.</p>
    <div class="sheet-cols">${col('A')}${col('B')}</div>
    <div class="row"><button class="btn" data-mact="no">Close</button></div>`);
}

function openEdit(side, i) {
  const ctx = entryContext();
  if (!ctx) return;
  const { m, n, leg, R } = ctx;
  const key = keyOf(side);
  const turn = (leg[key] || [])[i];
  if (!turn) return;
  const isLast = i === (leg[key] || []).length - 1;
  const tn = side === 'A' ? m.teamA : m.teamB;
  const choices = lineupChoices(S.players, tn);
  showModal(`
    <h3>Edit turn</h3>
    <p>Leg ${n} · ${esc(tt(tn))} · turn ${i + 1}</p>
    <label>Score</label>
    <input id="edit-score" class="txt" inputmode="numeric" maxlength="3" value="${turn.s}">
    <label>Thrown by</label>
    <select id="edit-player" class="sel">${selectOptions(choices, turn.p)}</select>
    <div class="error-text" id="edit-err"></div>
    <div class="row">
      <button class="btn" data-mact="no">Cancel</button>
      ${isLast ? '<button class="btn danger" data-mact="edit-delete">Delete</button>' : ''}
      <button class="btn good" data-mact="edit-save" data-side="${side}" data-i="${i}">Save</button>
    </div>`);
  setTimeout(() => { const el = $('#edit-score'); if (el) { el.focus(); el.select(); } }, 50);
}

async function saveEdit(side, i) {
  const ctx = entryContext();
  if (!ctx) return;
  const { m, n, leg, R } = ctx;
  const key = keyOf(side);
  const errEl = $('#edit-err');
  const s = parseInt($('#edit-score').value, 10);
  const p = $('#edit-player').value;
  if (!p) { errEl.textContent = 'Pick who threw it.'; return; }
  if (!Number.isInteger(s) || s < 0 || s > 180) { errEl.textContent = 'Enter a score from 0 to 180.'; return; }

  const old = leg[key] || [];
  const turns = old.map((t, idx) => (idx === i ? { ...t, p, s, bust: undefined } : t));
  const cleaned = turns.map((t) => { const c = { ...t }; if (c.bust === undefined) delete c.bust; return c; });

  // Re-play the whole side: the edit must keep every later turn valid.
  const r = replaySide(cleaned, R);
  if (r.turns.length < cleaned.length) { errEl.textContent = 'Turns after the finish would no longer count — fix or delete those first.'; return; }
  for (let k = 0; k < cleaned.length; k++) {
    if (r.turns[k].s !== cleaned[k].s) {
      errEl.textContent = k === i
        ? `That score isn't possible here (${classifyEntry(k ? r.turns[k - 1].rem : R.startScore, cleaned[k].s).reason || 'invalid'}). Enter 0 for a bust.`
        : 'That would make a later turn impossible (it would go over the remaining score). Fix that turn first.';
      return;
    }
  }
  try {
    await S.store.writeTurns(S.nightId, m.id, n, side, cleaned);
    closeModal(true);
    toast('Turn updated');
  } catch (err) {
    errEl.textContent = 'Could not save — check the connection.';
  }
}

async function deleteEditedTurn(side, i) {
  const ctx = entryContext();
  if (!ctx) return;
  const { m, n, leg } = ctx;
  const key = keyOf(side);
  const old = leg[key] || [];
  if (i !== old.length - 1) return;
  await S.store.writeTurns(S.nightId, m.id, n, side, old.slice(0, -1));
  closeModal(true);
  toast('Turn deleted');
}

function openSubs(side) {
  const ctx = entryContext();
  if (!ctx) return;
  const { m, n } = ctx;
  const tn = side === 'A' ? m.teamA : m.teamB;
  const lineup = lineupFor(m, n, side);
  const choices = lineupChoices(S.players, tn);
  const selects = [0, 1, 2].map((i) => `
    <label>Player ${i + 1}</label>
    <select class="sel" id="sub-${i}">${selectOptions(choices, lineup[i])}</select>`).join('');
  showModal(`
    <h3>Change players — ${esc(tt(tn))}</h3>
    <p>Applies from leg ${n} onward. Earlier legs keep who actually threw.</p>
    ${selects}
    <div class="error-text" id="sub-err"></div>
    <div class="row">
      <button class="btn" data-mact="no">Cancel</button>
      <button class="btn good" data-mact="subs-save" data-side="${side}">Save</button>
    </div>`);
}

async function saveSubs(side) {
  const ctx = entryContext();
  if (!ctx) return;
  const { m, n } = ctx;
  const ids = [0, 1, 2].map((i) => $(`#sub-${i}`).value);
  const err = $('#sub-err');
  if (ids.some((x) => !x)) { err.textContent = 'Pick three players (use Dummy if needed).'; return; }
  const named = ids.filter((id) => !(P(id) && P(id).dummy));
  if (new Set(named).size !== named.length) { err.textContent = 'The same player is picked twice.'; return; }
  try {
    await S.store.setLegFields(S.nightId, m.id, n, { [side === 'A' ? 'lineupA' : 'lineupB']: ids });
    S.override = null;
    closeModal(true);
    toast('Players updated');
  } catch (e) {
    err.textContent = 'Could not save — check the connection.';
  }
}

function openTeamNames() {
  const ctx = entryContext();
  if (!ctx) return;
  const { m } = ctx;
  const field = (side) => {
    const tn = side === 'A' ? m.teamA : m.teamB;
    return `<label>Team ${esc(tn)}</label>
      <input class="txt" id="tnm-${side}" maxlength="30" placeholder="Leave blank to show the players' names" value="${esc(customTeamName(S.config, tn))}">`;
  };
  showModal(`
    <h3>Team names</h3>
    <p>Optional. A team name shows instead of the players' names on the TV and here.</p>
    ${field('A')}${field('B')}
    <div class="row">
      <button class="btn" data-mact="no">Cancel</button>
      <button class="btn good" data-mact="names-save">Save</button>
    </div>`);
}

async function saveTeamNamesModal() {
  const ctx = entryContext();
  if (!ctx) return;
  const { m } = ctx;
  const patch = {};
  for (const side of ['A', 'B']) {
    const tn = side === 'A' ? m.teamA : m.teamB;
    const v = ($(`#tnm-${side}`).value || '').trim();
    if (v !== customTeamName(S.config, tn)) patch[tn] = v;
  }
  try {
    if (Object.keys(patch).length) await S.store.saveTeamNames(patch);
    closeModal(true);
    toast('Team names saved', 'good');
  } catch (err) {
    toast('Could not save — check the connection', 'error');
  }
}

function openMore() {
  const ctx = entryContext();
  if (!ctx) return;
  const { m, n, st } = ctx;
  const starter = starterFor(m, n);
  const starterBlock = (!st.over && st.A.shots + st.B.shots === 0) ? `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b>Leg ${n} starts:</b>
        <div class="seg">
          <button class="${starter === 'A' ? 'on' : ''}" data-act="set-starter" data-side="A">${esc(tt(m.teamA))}</button>
          <button class="${starter === 'B' ? 'on b' : ''}" data-act="set-starter" data-side="B">${esc(tt(m.teamB))}</button>
        </div></div>` : '';
  showModal(`
    <h3>More</h3>
    <p>Match ${matchNo(m)} · ${esc(tt(m.teamA))} v ${esc(tt(m.teamB))}</p>
    <div style="display:grid;gap:10px">
      ${starterBlock}
      <button class="btn" data-mact="team-names">Team names…</button>
      ${m.status === 'final' ? '' : '<button class="btn primary" data-mact="end-match">End match now (mark final)</button>'}
      ${m.status === 'final' ? '<button class="btn" data-mact="reopen">Re-open match</button>' : ''}
      <button class="btn danger" data-mact="clear-match">Clear ALL scores for this match</button>
      <button class="btn" data-mact="no">Close</button>
    </div>`);
}

/* ================================================================== events == */

document.addEventListener('click', async (e) => {
  const mact = e.target.closest('[data-mact]');
  if (mact) return handleModalAction(mact);

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const ctx = S.route.name === 'match' ? entryContext() : null;

  switch (act) {
    case 'open': return go(`#/match/${el.dataset.id}`);
    case 'back': return go('#/');
    case 'leg': S.viewLeg = parseInt(el.dataset.n, 10); S.entry = ''; S.override = null; return render();
    case 'key': return press(el.dataset.k);
    case 'quick': S.entry = el.dataset.v; return updateEntryDisplay();
    case 'enter': return enterScore();
    case 'undo': return undoLast();
    case 'pick': S.override = el.dataset.p; return render();
    case 'edit': return openEdit(el.dataset.side, parseInt(el.dataset.i, 10));
    case 'subs': return openSubs(el.dataset.side);
    case 'more': return openMore();
    case 'turns': return openTurns();
    case 'nextleg': {
      if (!ctx) return;
      const { ms, n, R } = ctx;
      S.viewLeg = n < R.legsPerMatch ? n + 1 : ms.currentLeg;
      S.entry = ''; S.override = null;
      return render();
    }
    case 'set-starter': {
      if (!ctx) return;
      await S.store.setLegFields(S.nightId, ctx.m.id, ctx.n, { starter: el.dataset.side });
      S.override = null;
      if ($('#modal').open) closeModal(true);
      return;
    }
    case 'pick-starter': {
      document.querySelectorAll('#first-starter button').forEach((b) => { b.classList.remove('on', 'b'); });
      el.classList.add('on');
      if (el.dataset.side === 'B') el.classList.add('b');
      return;
    }
    case 'start': return startMatch();
    case 'finish': {
      if (!ctx) return;
      await S.store.setMatchFields(S.nightId, ctx.m.id, { status: 'final' });
      toast('Match saved as final', 'good');
      return go('#/');
    }
  }
});

async function startMatch() {
  const m = findMatch(S.route.id);
  if (!m) return;
  const read = (side) => [0, 1, 2].map((i) => $(`#lu-${side}-${i}`).value);
  const a = read('A'), b = read('B');
  const bad = (ids) => ids.some((x) => !x);
  if (bad(a) || bad(b)) { toast('Pick three players for each team (use Dummy if someone is missing)', 'error'); return; }
  const dup = (ids) => { const named = ids.filter((id) => !(P(id) && P(id).dummy)); return new Set(named).size !== named.length; };
  if (dup(a) || dup(b)) { toast('The same player is picked twice', 'error'); return; }
  // save any team names typed on the setup screen
  const names = {};
  for (const side of ['A', 'B']) {
    const tn = side === 'A' ? m.teamA : m.teamB;
    const v = (($(`#tn-${side}`) || {}).value || '').trim();
    if (v !== customTeamName(S.config, tn)) names[tn] = v;
  }
  if (Object.keys(names).length) S.store.saveTeamNames(names).catch(() => toast('Could not save team names', 'error'));
  const firstBtn = document.querySelector('#first-starter button.on');
  const first = firstBtn && firstBtn.dataset.side === 'B' ? 'B' : 'A';
  try {
    await S.store.setMatchFields(S.nightId, m.id, { lineupA: a, lineupB: b, firstStarter: first, status: 'live' });
  } catch (err) {
    toast('Could not start the match — check the connection', 'error');
  }
}

async function handleModalAction(el) {
  const act = el.dataset.mact;
  const ctx = entryContext();
  switch (act) {
    case 'yes': return closeModal(true);
    case 'no': return closeModal(false);
    case 'edit-save': return saveEdit(el.dataset.side, parseInt(el.dataset.i, 10));
    case 'edit-delete': {
      // delete button has no data; the save button next to it carries side/index
      const save = document.querySelector('[data-mact="edit-save"]');
      return deleteEditedTurn(save.dataset.side, parseInt(save.dataset.i, 10));
    }
    case 'subs-save': return saveSubs(el.dataset.side);
    case 'team-names': return openTeamNames();
    case 'names-save': return saveTeamNamesModal();
    case 'end-match':
      if (ctx) { await S.store.setMatchFields(S.nightId, ctx.m.id, { status: 'final' }); closeModal(true); go('#/'); }
      return;
    case 'reopen':
      if (ctx) { await S.store.setMatchFields(S.nightId, ctx.m.id, { status: 'live' }); closeModal(true); }
      return;
    case 'clear-match': {
      if (!ctx) return;
      closeModal(false);
      const ok = await confirmModal({ title: 'Clear all scores?', text: 'This deletes every turn in this match and cannot be undone.', yes: 'Yes, clear it', no: 'Keep scores', danger: true });
      if (ok) { await S.store.clearMatch(S.nightId, ctx.m.id); S.viewLeg = null; toast('Match cleared'); }
      return;
    }
  }
}

// Physical keyboard support (laptops): digits, Backspace, Enter
document.addEventListener('keydown', (e) => {
  if ($('#modal').open) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
    return;
  }
  if (S.route.name !== 'match') return;
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
  else if (e.key === 'Enter') { e.preventDefault(); enterScore(); }
});

// Enter key inside the edit dialog saves
$('#modal').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'edit-score') {
    const save = document.querySelector('[data-mact="edit-save"]');
    if (save) saveEdit(save.dataset.side, parseInt(save.dataset.i, 10));
  }
});

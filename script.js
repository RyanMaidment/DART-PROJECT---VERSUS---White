/* ==========================================================================
   Thursday Night Dart League — TV Scoreboard
   -------------------------------------------------------------------------
   How this works:
   - The board reads directly from the live "Thursday Dart League" Google
     Sheet — no API key, no backend. This only works because the sheet is
     shared as "Anyone with the link – Viewer"; if that ever changes, the
     loads below will start failing.
   - It uses Google's visualization/gviz endpoint via a JSONP-style
     <script> tag rather than fetch(), because that endpoint doesn't
     reliably send CORS headers for cross-origin fetch() calls — a script
     tag isn't subject to CORS at all, so this is the standard reliable
     way to read a public sheet from another site.
   - It polls every POLL_MS and re-renders only the values that changed
     (a short green flash), so the TV updates itself the moment someone
     edits a score, no reload, no rebuild, no deploy.
   - If the sheet can't be reached (offline, sharing revoked, etc.) on the
     very first load, it falls back to the snapshot in data.json so the
     screen is never blank. data.json is otherwise unused — regenerating
     it with xlsx_to_json.py is optional, just a way to keep that fallback
     snapshot fresh.
   ========================================================================== */

const SPREADSHEET_ID = '1dlA5vn3dlh0_JFZqtuCB9VlruYBHY_HyeVcZVuC7iwk';
const POLL_MS = 7000;

let lastData = null;
let usedFallback = false;

document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);

  loadData();
  setInterval(loadData, POLL_MS);

  setupFullscreenToggle();
});

/* ---------------------------------------------------------------- data -- */

async function loadData() {
  try {
    const data = await fetchLiveSheetData();
    render(data);
    lastData = data;
    setStatus(true);
  } catch (err) {
    console.error('Could not read the Google Sheet:', err);
    setStatus(false);
    if (!lastData && !usedFallback) {
      usedFallback = true;
      await loadFallback();
    }
  }
}

async function loadFallback() {
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    render(data);
    lastData = data;
  } catch (err) {
    console.error('No fallback data.json available either:', err);
  }
}

function setStatus(ok) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.classList.remove('live', 'stale');
  if (ok) {
    dot.classList.add('live');
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    text.textContent = `Live — synced ${stamp}`;
  } else {
    dot.classList.add('stale');
    text.textContent = 'Could not reach the sheet — showing last known scores';
  }
}

/* ----------------------------------------------------- live sheet fetch -- */

let jsonpCounter = 0;

// Sheets like Sheet1/Team run to ~1000 rows in the underlying workbook but
// only ever have a handful of real ones — capping the queried range keeps
// each poll small instead of shipping hundreds of empty rows every 7s.
const SHEET_RANGES = {
  Sheet1: 'A1:C40',
  SheetA: 'A1:C10',
  Sheet2: 'A1:F12',
  Sheet3: 'A1:F12',
  Team: 'A1:B25',
  Chat: 'A1:A30',
};

function gvizScriptUrl(sheetName, callbackName) {
  const base = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;
  // headers=0 tells gviz "don't treat any row as a header", so every row
  // in the sheet comes back as plain data, in order — the same shape our
  // parse* functions below expect.
  const tqx = `out:json;responseHandler:${callbackName}`;
  const range = SHEET_RANGES[sheetName] ? `&range=${SHEET_RANGES[sheetName]}` : '';
  return `${base}?headers=0&sheet=${encodeURIComponent(sheetName)}${range}&tqx=${encodeURIComponent(tqx)}&_=${Date.now()}`;
}

// Loads one tab via a JSONP <script> tag (not fetch — see file header) and
// resolves with its rows as a plain array-of-arrays, e.g.
// [["JustinV, RachelJ, KatieS - TEAM", "0  :  0", "LucL, LynnS, MaggieJ - TEAM"], ...]
function fetchSheetRows(sheetName, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const callbackName = `__gvizCallback_${jsonpCounter++}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`${sheetName}: timed out`));
    }, timeoutMs);

    window[callbackName] = (json) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!json || json.status === 'error') {
        reject(new Error(`${sheetName}: ${(json && json.errors && json.errors[0] && json.errors[0].detailed_message) || 'query error'}`));
        return;
      }
      resolve(gvizTableToRows(json.table));
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`${sheetName}: failed to load`));
    };

    script.src = gvizScriptUrl(sheetName, callbackName);
    document.head.appendChild(script);
  });
}

function gvizTableToRows(table) {
  if (!table || !Array.isArray(table.rows)) return [];
  return table.rows.map(r =>
    (r.c || []).map(cell => (cell && cell.v !== null && cell.v !== undefined) ? cell.v : '')
  );
}

async function fetchLiveSheetData() {
  const [sheet1, sheetA, sheet2, sheet3, team, chat] = await Promise.all([
    fetchSheetRows('Sheet1'),
    fetchSheetRows('SheetA'),
    fetchSheetRows('Sheet2'),
    fetchSheetRows('Sheet3'),
    fetchSheetRows('Team'),
    fetchSheetRows('Chat'),
  ]);

  const teamMap = buildTeamMap(team);

  return {
    matches: parseMatches(sheet1, teamMap),
    awards: parseAwards(sheetA),
    menTop8: parseTop8(sheet3),
    womenTop8: parseTop8(sheet2),
    news: parseNews(chat),
  };
}

/* ------------------------------------------------------- sheet -> data -- */

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu;
const NAME_FIXES = { 'Ken Mclean': 'Ken McLean', 'Kim Wb': 'Kim WB' };

function titleCase(name) {
  const tc = String(name || '').trim().split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return NAME_FIXES[tc] || tc;
}

function cleanRosterStr(s) {
  return String(s || '').replace(/\s*-\s*TEAM\s*(\[\d+\])?\s*$/i, '').trim();
}

function splitNames(s) {
  return s.split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const spaced = p.replace(/([a-z])(?=[A-Z])/g, '$1 ');
    return titleCase(spaced);
  });
}

function buildTeamMap(rows) {
  const map = {};
  for (let r = 1; r < rows.length; r++) {
    const name = rows[r][1];
    if (!name) continue;
    const m = String(name).trim().match(/\[(\d+)\]\s*$/);
    if (m) map[cleanRosterStr(name)] = m[1];
  }
  return map;
}

function parseMatches(rows, teamMap) {
  const matches = [];
  for (const row of rows) {
    const [a, score, b] = row;
    if (!a || !b || !score) continue;
    const parts = String(score).split(':').map(x => x.trim());
    if (parts.length !== 2) continue;
    const sa = parseInt(parts[0], 10);
    const sb = parseInt(parts[1], 10);
    if (Number.isNaN(sa) || Number.isNaN(sb)) continue;

    const aClean = cleanRosterStr(a);
    const bClean = cleanRosterStr(b);
    matches.push({
      teamANum: teamMap[aClean] || '?',
      teamAPlayers: splitNames(aClean),
      scoreA: sa,
      teamBNum: teamMap[bClean] || '?',
      teamBPlayers: splitNames(bClean),
      scoreB: sb,
    });
  }
  return matches;
}

function parsePlayerRow(row) {
  if (!row) return null;
  const [rank, players, avg, , hs, hfin] = row;
  if (!players) return null;
  const badges = String(players).match(EMOJI_RE) || [];
  const cleanName = String(players).replace(EMOJI_RE, '').trim();
  const avgNum = parseFloat(avg);
  const hsNum = parseFloat(hs);
  const hfinNum = parseFloat(hfin);
  return {
    rank: rank ? parseInt(rank, 10) : null,
    name: titleCase(cleanName),
    badges,
    avg: Number.isFinite(avgNum) ? Math.round(avgNum * 10) / 10 : null,
    hs: Number.isFinite(hsNum) ? hsNum : null,
    hfin: (Number.isFinite(hfinNum) && hfinNum) ? hfinNum : null,
  };
}

function parseTop8(rows) {
  const out = [];
  for (let r = 1; r <= 8 && r < rows.length; r++) {
    const parsed = parsePlayerRow(rows[r]);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseAwards(rows) {
  // Scan every row in the fetched range for an MVP/SVP label rather than
  // assuming a fixed row position — a row inserted or removed above these
  // in the live sheet would otherwise silently drop or misread an award.
  const awards = [];
  for (let r = 0; r < rows.length; r++) {
    const [rawLabel, name, rating] = rows[r];
    if (!rawLabel || !name) continue;
    if (!/MVP|SVP/i.test(rawLabel)) continue;
    const gender = /\u2640/.test(rawLabel) ? 'women' : 'men';
    const title = /SVP/i.test(rawLabel) ? 'SVP' : 'MVP';
    const ratingNum = parseFloat(rating);
    awards.push({
      title,
      gender,
      name: titleCase(name),
      rating: Number.isFinite(ratingNum) ? Math.round(ratingNum * 10) / 10 : rating,
    });
  }
  return awards;
}

function parseNews(rows) {
  const news = [];
  for (let r = 1; r < rows.length; r++) {
    const v = rows[r][0];
    if (v && String(v).trim()) news.push(String(v).trim());
  }
  return news;
}

function render(data) {
  const name = document.getElementById('league-name');
  if (data.meta && data.meta.leagueName) name.textContent = data.meta.leagueName;

  renderMatches(data.matches || []);
  renderAwards(data.awards || []);
  renderLeaderboard('men-list', data.menTop8 || []);
  renderLeaderboard('women-list', data.womenTop8 || []);
  renderTicker(data.news || []);
}

/* ------------------------------------------------------------ matchups -- */

function renderMatches(matches) {
  const list = document.getElementById('match-list');
  list.innerHTML = '';

  matches.forEach((m, i) => {
    const prev = lastData && lastData.matches && lastData.matches[i];
    const changed = prev && (prev.scoreA !== m.scoreA || prev.scoreB !== m.scoreB);

    const li = document.createElement('li');
    li.className = 'match-row';
    if (m.scoreA > m.scoreB) li.classList.add('a-leads');
    else if (m.scoreB > m.scoreA) li.classList.add('b-leads');

    li.innerHTML = `
      <div class="side side-a">
        <span class="team-token">${escapeHtml(m.teamANum)}</span>
        <div class="team-info">
          <p class="team-players">${escapeHtml(m.teamAPlayers.join(', '))}</p>
        </div>
      </div>
      <div class="score-box${changed ? ' flash' : ''}">
        <span class="score-a">${m.scoreA}</span>
        <span class="divider">:</span>
        <span class="score-b">${m.scoreB}</span>
      </div>
      <div class="side side-b">
        <span class="team-token">${escapeHtml(m.teamBNum)}</span>
        <div class="team-info">
          <p class="team-players">${escapeHtml(m.teamBPlayers.join(', '))}</p>
        </div>
      </div>
    `;
    list.appendChild(li);
  });
}

/* -------------------------------------------------------------- awards -- */

function renderAwards(awards) {
  const row = document.getElementById('award-row');
  row.innerHTML = '';

  awards.forEach(a => {
    const icon = a.gender === 'women' ? '\u2640' : '\u2642';
    const div = document.createElement('div');
    div.className = 'medallion';
    div.innerHTML = `
      <span class="coin">${icon}</span>
      <span class="title">${escapeHtml(a.title)}</span>
      <span class="name">${escapeHtml(a.name)}</span>
      <span class="rating">${formatNumber(a.rating)}% rating</span>
    `;
    row.appendChild(div);
  });
}

/* --------------------------------------------------------- leaderboards -- */

function renderLeaderboard(listId, players) {
  const list = document.getElementById(listId);
  const prevKey = listId === 'men-list' ? 'menTop8' : 'womenTop8';
  list.innerHTML = '';

  players.forEach((p, i) => {
    const prev = lastData && lastData[prevKey] && lastData[prevKey][i];
    const changed = prev && (prev.avg !== p.avg || prev.hs !== p.hs);

    const li = document.createElement('li');
    li.className = 'lb-row';
    const badges = (p.badges || []).join('');
    li.innerHTML = `
      <span class="lb-rank">${p.rank}</span>
      <span class="lb-name${changed ? ' flash' : ''}">
        <span class="player-name">${escapeHtml(p.name)}</span>
        ${badges ? `<span class="badges">${badges}</span>` : ''}
      </span>
      <span class="lb-avg">${formatNumber(p.avg)}</span>
      <span class="lb-hs">${p.hs || 0}</span>
    `;
    list.appendChild(li);
  });
}

/* --------------------------------------------------------------- ticker -- */

function renderTicker(news) {
  const track = document.getElementById('ticker-track');
  if (!news.length) {
    track.innerHTML = '';
    return;
  }
  // Duplicate the list so the CSS marquee (translateX -50%) loops seamlessly.
  const itemsHtml = news.map(n => `<span class="ticker-item">${escapeHtml(n)}</span>`).join('');
  track.innerHTML = itemsHtml + itemsHtml;

  // Scale scroll speed to content length so short and long nights both read comfortably.
  const pxPerSecond = 60;
  const approxWidth = news.join('').length * 11 + news.length * 60;
  const duration = Math.max(18, (approxWidth * 2) / pxPerSecond);
  track.style.animationDuration = `${duration}s`;
}

/* ----------------------------------------------------------------- misc -- */

function updateClock() {
  const el = document.getElementById('clock');
  el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '\u2014';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setupFullscreenToggle() {
  const btn = document.getElementById('fullscreen-toggle');
  const toggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  };
  btn.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') toggle();
  });
}

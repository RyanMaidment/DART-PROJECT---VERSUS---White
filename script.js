/* ==========================================================================
   Thursday Night Dart League — TV Scoreboard
   -------------------------------------------------------------------------
   How this works:
   - All league content (matchups, awards, top 8s, news) lives in data.json,
     sitting next to this file.
   - To update the board, regenerate data.json from the spreadsheet with
     `python3 xlsx_to_json.py Thursday_Dart_League.xlsx` (see README.md) and
     overwrite the copy on whatever machine/server is driving the TV.
   - This page polls data.json every POLL_MS and redraws only the values
     that changed, with a short green flash, so the TV never needs to be
     reloaded or touched during the night.
   ========================================================================== */

const POLL_MS = 8000;
let lastData = null;

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
    const res = await fetch(`data.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data);
    lastData = data;
    setStatus(true);
  } catch (err) {
    console.error('Could not load data.json:', err);
    setStatus(false);
  }
}

function setStatus(ok) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.classList.remove('live', 'stale');
  if (ok) {
    dot.classList.add('live');
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    text.textContent = `Live — updated ${stamp}`;
  } else {
    dot.classList.add('stale');
    text.textContent = 'Could not refresh — showing last known scores';
  }
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
        <span class="team-token">#${escapeHtml(m.teamANum)}</span>
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
        <span class="team-token">#${escapeHtml(m.teamBNum)}</span>
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
        <span>${escapeHtml(p.name)}</span>
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

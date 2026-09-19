/* ==========================================================================
   Board model — turns tonight's matches + roster into exactly the data shape
   the TV board's render() functions expect (same as the old data.json):
     { meta, matches, awards, menTop8, womenTop8, news }
   Pure functions, so they can be tested without a browser.
   ========================================================================== */

import { withRules, matchState, lineupFor, playerStats, legState, starterFor } from './engine.js';

/** "Ken MCLEAN" -> "Ken McLean", "Alain PATRY" -> "Alain Patry" */
export function prettyName(name) {
  return String(name || '').trim().split(/\s+/).map((w) => {
    if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) {
      const cap = w.charAt(0) + w.slice(1).toLowerCase();
      return cap.replace(/^Mc([a-z])/, (_, c) => 'Mc' + c.toUpperCase());
    }
    return w;
  }).join(' ');
}

const matchNo = (m) => parseInt(String(m.id).replace(/\D/g, ''), 10) || 0;

function badgesFor(s, R) {
  const out = [];
  if (s.maxes > 0) out.push('\u{1F48E}');          // 💎  180 / 171
  else if (s.tons > 0) out.push('\u{1F4AF}');      // 💯  100+ (men) / 95+ (women)
  if (s.highFinish >= R.finishBadge) out.push('\u{1F3AF}');   // 🎯  big finish
  return out;
}

function rankList(rows, R, limit = 8) {
  const sorted = [...rows].sort((a, b) => {
    if ((b.avg ?? -1) !== (a.avg ?? -1)) return (b.avg ?? -1) - (a.avg ?? -1);
    return a.name.localeCompare(b.name);
  });
  return sorted.slice(0, limit).map((s, i) => ({
    rank: i + 1,
    name: prettyName(s.name),
    badges: badgesFor(s, R),
    avg: s.avg === null ? null : Math.round(s.avg * 10) / 10,
    hs: s.highShot,
    hfin: s.highFinish || null,
  }));
}

/**
 * MVP / SVP placeholders. Until the real formula is confirmed, MVP = best
 * average tonight and SVP = second best, separately for men and women.
 * (Replace this function to change how awards are chosen.)
 */
export function pickAwards(menRows, womenRows) {
  const played = (rows) => rows.filter((r) => r.shots > 0).sort((a, b) => b.avg - a.avg);
  const awards = [];
  const add = (title, gender, s) => s && awards.push({
    title, gender, name: prettyName(s.name), rating: Math.round(s.avg * 10) / 10, unit: 'avg',
  });
  const m = played(menRows), w = played(womenRows);
  add('MVP', 'men', m[0]);
  add('MVP', 'women', w[0]);
  add('SVP', 'men', m[1]);
  add('SVP', 'women', w[1]);
  return awards;
}

/** Ticker lines: manual announcements first, then auto-generated highlights. */
export function buildNews({ config, matches, playersById, R }) {
  const manual = ((config && config.news) || []).map((s) => String(s).trim()).filter(Boolean);
  const events = [];
  for (const m of matches) {
    for (let n = 1; n <= R.legsPerMatch; n++) {
      const leg = (m.legs && m.legs[n]) || { a: [], b: [] };
      const st = legState(leg, starterFor(m, n), R);
      for (const side of ['A', 'B']) {
        (leg[side === 'A' ? 'a' : 'b'] || []).forEach((raw, i) => {
          const eff = st[side].turns[i];
          const p = playersById[raw.p];
          if (!eff || !p || p.dummy) return;
          events.push({ p, s: eff.s, finish: eff.finish, t: raw.t || 0 });
        });
      }
    }
  }
  const auto = [];
  const isMax = (e) => R.maxShots.includes(e.s);
  const ton = (e) => e.s >= R.tonThreshold[e.p.gender === 'F' ? 'F' : 'M'];

  events.filter(isMax).sort((a, b) => b.t - a.t).slice(0, 4)
    .forEach((e) => auto.push(`\u{1F48E} ${e.p.short || e.p.name} hit a ${e.s}!`));
  events.filter((e) => ton(e) && !isMax(e)).sort((a, b) => b.s - a.s || b.t - a.t).slice(0, 4)
    .forEach((e) => auto.push(`\u{1F4AF} ${e.p.short || e.p.name} scored ${e.s}`));
  events.filter((e) => e.finish && e.s >= R.finishBadge).sort((a, b) => b.s - a.s).slice(0, 3)
    .forEach((e) => auto.push(`\u{1F3AF} ${e.p.short || e.p.name} checked out ${e.s}!`));

  return [...manual, ...auto];
}

export function buildBoardModel({ config, players, matches, rules }) {
  const R = withRules(rules || (config && config.rules));
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]));
  const ordered = [...matches].sort((a, b) => matchNo(a) - matchNo(b));

  const boardMatches = ordered.map((m) => {
    const ms = matchState(m, R);
    const names = (side) => lineupFor(m, ms.currentLeg, side).map((id) => (playersById[id] ? (playersById[id].short || playersById[id].name) : '?'));
    return {
      teamANum: String(m.teamA), teamAPlayers: names('A'), scoreA: ms.a,
      teamBNum: String(m.teamB), teamBPlayers: names('B'), scoreB: ms.b,
    };
  });

  // Players appearing tonight (so the leaderboards can list them before they've thrown)
  const tonight = new Set();
  for (const m of ordered) {
    [...(m.lineupA || []), ...(m.lineupB || [])].forEach((id) => tonight.add(id));
    Object.values(m.legs || {}).forEach((l) => [...(l.lineupA || []), ...(l.lineupB || [])].forEach((id) => tonight.add(id)));
  }
  const stats = playerStats(ordered, playersById, R);
  const rowFor = (id) => {
    const p = playersById[id];
    if (!p || p.dummy) return null;
    return stats.get(id) || { id, name: p.name, short: p.short, gender: p.gender, team: p.team, shots: 0, avg: null, highShot: 0, highFinish: 0, tons: 0, maxes: 0 };
  };
  const rows = [...tonight].map(rowFor).filter(Boolean);
  const men = rows.filter((r) => r.gender === 'M');            // spares with no gender set are left off until set in Admin
  const women = rows.filter((r) => r.gender === 'F');

  return {
    meta: { leagueName: (config && config.name) || 'Dart League' },
    matches: boardMatches,
    awards: pickAwards(men, women),
    menTop8: rankList(men, R),
    womenTop8: rankList(women, R),
    news: buildNews({ config, matches: ordered, playersById, R }),
  };
}

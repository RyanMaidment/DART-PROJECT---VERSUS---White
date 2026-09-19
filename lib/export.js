/* Weekly stats snapshot (same columns as the "All Weeks" sheet) and CSV export. */

import { withRules, playerStats, matchResults, pointsPerMatch } from './engine.js';
import { teamLabel } from './night.js';

export const CSV_COLUMNS = [
  ['Team', 'team'], ['Gender', 'gender'], ['Player', 'player'], ['Games', 'games'], ['Points', 'points'],
  ['Shots', 'shots'], ['Average', 'average'], ['Finishes', 'finishes'], ['High Shot', 'highShot'],
  ['High Finish', 'highFinish'], ['100+ or 95+', 'tons'], ['180 or 171', 'maxes'], ['Team#', 'teamNum'],
  ['Team Name', 'teamName'], ['Win', 'win'], ['#', 'total'], ['Loss', 'loss'], ['Week', 'week'],
  ['Date', 'date'], ['Spare', 'spare'],
];

const GENDER_WORD = { M: 'Male', F: 'Female' };

/**
 * One row per player who threw a dart on the night — the same information the
 * old "SAVE TO COMPLETE STATS SPREADSHEET" script appended to All Weeks.
 */
export function weeklyRows({ night, matches, players, rules, teamNames }) {
  const R = withRules(rules);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const stats = playerStats(matches, byId, R);
  const teamPoints = {};
  for (const r of matchResults(matches, R)) { teamPoints[r.teamA] = r.a; teamPoints[r.teamB] = r.b; }
  const total = pointsPerMatch(R);

  return [...stats.values()]
    .filter((s) => s.shots > 0)
    .sort((a, b) => a.team - b.team || (byId[a.id].order ?? 0) - (byId[b.id].order ?? 0))
    .map((s) => {
      const win = teamPoints[s.team] ?? 0;
      return {
        team: s.team,
        gender: GENDER_WORD[s.gender] || 'N/A',
        player: s.name,
        games: s.games,
        points: s.points,
        shots: s.shots,
        average: s.avg,
        finishes: s.finishes,
        highShot: s.highShot,
        highFinish: s.highFinish,
        tons: s.tons,
        maxes: s.maxes,
        teamNum: s.team,
        teamName: (teamNames && teamNames[String(s.team)] && String(teamNames[String(s.team)]).trim()) || (teamLabel(players, s.team) + ' - TEAM'),
        win,
        total,
        loss: total - win,
        week: night.week ?? '',
        date: night.date,
        spare: s.spare ? 'Yes' : '',
      };
    });
}

const esc = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  const head = CSV_COLUMNS.map(([h]) => esc(h)).join(',');
  const body = rows.map((r) => CSV_COLUMNS.map(([, k]) => esc(k === 'average' && r[k] != null ? Number(r[k]).toFixed(4) : r[k])).join(','));
  return [head, ...body].join('\r\n');
}

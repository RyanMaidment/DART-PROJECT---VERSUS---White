/* Helpers for teams, lineups and creating a league night. Pure functions. */

/** Active, non-spare players on a team, in roster order. */
export function teamRoster(players, teamNum) {
  return players
    .filter((p) => p.active !== false && !p.spare && Number(p.team) === Number(teamNum))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** "Alain P, Mike H, Sherley D" */
export function teamLabel(players, teamNum) {
  const r = teamRoster(players, teamNum);
  return r.length ? r.map((p) => p.short || p.name).join(', ') : `Team ${teamNum}`;
}

/** The optional custom team name (e.g. "The Honey Badgers"), or '' if none. Stored in league config. */
export function customTeamName(config, teamNum) {
  const v = config && config.teamNames && config.teamNames[String(teamNum)];
  return v ? String(v).trim() : '';
}

/** What to call a team in headings: its custom name, or "Team 7". */
export function teamTitle(config, teamNum) {
  return customTeamName(config, teamNum) || `Team ${teamNum}`;
}

/** Team numbers that exist in the roster, ascending. */
export function teamNumbers(players) {
  return [...new Set(players.filter((p) => !p.spare && p.active !== false && p.team != null && p.team !== '').map((p) => Number(p.team)))]
    .sort((a, b) => a - b);
}

export function defaultLineup(players, teamNum, size = 3) {
  return teamRoster(players, teamNum).slice(0, size).map((p) => p.id);
}

/** Everyone who could throw for a team: its roster first, then spares, then Dummy. */
export function lineupChoices(players, teamNum) {
  const roster = teamRoster(players, teamNum);
  const spares = players.filter((p) => p.active !== false && p.spare && !p.dummy).sort((a, b) => a.name.localeCompare(b.name));
  const dummies = players.filter((p) => p.active !== false && p.dummy);
  return [
    ...roster.map((p) => ({ ...p, group: `Team ${teamNum}` })),
    ...spares.map((p) => ({ ...p, group: 'Spares' })),
    ...dummies.map((p) => ({ ...p, group: 'Dummy' })),
  ];
}

/**
 * Build the docs for a league night.
 * pairings = [[teamA, teamB], ...]
 * Returns { night, matches } — the caller writes them to the database.
 */
export function buildNight({ date, week, pairings, players }) {
  const matches = pairings.map(([a, b], i) => ({
    id: `m${i + 1}`,
    nightId: date,
    teamA: Number(a),
    teamB: Number(b),
    lineupA: defaultLineup(players, a),
    lineupB: defaultLineup(players, b),
    firstStarter: 'A',
    status: 'pending',
    legs: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  const night = {
    id: date,
    date,
    week: Number(week) || null,
    matches: matches.map((m) => ({ id: m.id, a: m.teamA, b: m.teamB })),
  };
  return { night, matches };
}

export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

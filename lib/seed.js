/* Builds a ready-to-use set of documents: roster + config + a sample night.
   Used by demo mode, and by the Admin page's "Load starter roster" button. */

import { SEED_PLAYERS, SEED_PAIRINGS } from './seed-data.js';
import { buildNight, todayISO } from './night.js';
import { DEFAULT_RULES } from './engine.js';

export const DEFAULT_LEAGUE_NAME = 'Thursday Night Dart League';

/** path -> document map */
export function buildDemoDocs() {
  const docs = {};
  const date = todayISO();

  for (const p of SEED_PLAYERS) docs[`players/${p.id}`] = { ...p };

  const { night, matches } = buildNight({ date, week: 1, pairings: SEED_PAIRINGS, players: SEED_PLAYERS });
  docs[`nights/${date}`] = night;
  for (const m of matches) docs[`nights/${date}/matches/${m.id}`] = m;

  docs['league/config'] = {
    name: DEFAULT_LEAGUE_NAME,
    rules: { ...DEFAULT_RULES },
    currentNight: date,
    news: ['Welcome to league night!'],
  };
  return docs;
}

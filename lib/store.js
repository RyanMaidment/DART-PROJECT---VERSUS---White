/* ==========================================================================
   Store — the league-specific database operations used by all three pages
   (scorer, admin, TV board). Works with either backend.

   Collections:
     league/config                       league name, rules, currentNight, news
     players/{id}                        roster (incl. spares and Dummy)
     nights/{date}                       the night: week number + pairings
     nights/{date}/matches/{m1..}        one document per match (all turns)
     weekly/{date}                       saved weekly stats snapshot
   ========================================================================== */

import { getBackend } from './backend.js';
import { buildNight } from './night.js';
import { weeklyRows } from './export.js';
import { withRules } from './engine.js';

const matchPath = (nightId, matchId) => `nights/${nightId}/matches/${matchId}`;

const hasTurns = (m) =>
  Object.values((m && m.legs) || {}).some((l) => (l.a && l.a.length) || (l.b && l.b.length));

export async function createStore() {
  const be = await getBackend();

  return {
    kind: be.kind,
    backend: be,

    /* ---- live subscriptions (each returns an unsubscribe function) ---- */
    onConfig: (cb) => be.onDoc('league/config', cb),
    onPlayers: (cb) => be.onCollection('players', cb),
    onNight: (nightId, cb) => be.onDoc(`nights/${nightId}`, cb),
    onMatches: (nightId, cb) => be.onCollection(`nights/${nightId}/matches`, cb),
    onWeekly: (cb) => be.onCollection('weekly', cb),

    onNights: (cb) => be.onCollection('nights', cb),
    getNights: () => be.getCollection('nights'),
    getMatches: (nightId) => be.getCollection(`nights/${nightId}/matches`),
    getWeekly: () => be.getCollection('weekly'),
    getPlayers: () => be.getCollection('players'),
    getConfig: () => be.getDoc('league/config'),
    resetDemo: () => (be.resetDemo ? be.resetDemo() : Promise.resolve()),

    /* ---- league settings ---- */
    saveConfig: (patch) => be.setDoc('league/config', patch, { merge: true }),

    /* ---- roster ---- */
    savePlayer: (p) => be.setDoc(`players/${p.id}`, p),
    deletePlayer: (id) => be.deleteDoc(`players/${id}`),
    async importPlayers(list) { for (const p of list) await be.setDoc(`players/${p.id}`, p); },

    /* ---- nights ---- */
    async createNight({ date, week, pairings, makeCurrent = true }) {
      const players = await be.getCollection('players');
      const { night, matches } = buildNight({ date, week, pairings, players });
      const existing = await be.getCollection(`nights/${date}/matches`);
      const existingById = Object.fromEntries(existing.map((m) => [m.id, m]));

      // Never overwrite a match that already has scores under a different pairing.
      for (const m of matches) {
        const old = existingById[m.id];
        if (old && hasTurns(old) && (old.teamA !== m.teamA || old.teamB !== m.teamB)) {
          throw new Error(`Match ${m.id.slice(1)} already has scores for Team ${old.teamA} v Team ${old.teamB}. Change that pairing back, or clear the match first.`);
        }
      }
      for (const m of matches) {
        const old = existingById[m.id];
        if (old && hasTurns(old)) continue;               // keep scored matches untouched
        await be.setDoc(matchPath(date, m.id), m);
      }
      // Remove unscored matches that are no longer in the pairing list.
      const keep = new Set(matches.map((m) => m.id));
      for (const old of existing) {
        if (!keep.has(old.id) && !hasTurns(old)) await be.deleteDoc(matchPath(date, old.id));
      }
      await be.setDoc(`nights/${date}`, night);
      if (makeCurrent) await be.setDoc('league/config', { currentNight: date }, { merge: true });
      return night;
    },

    /* ---- scoring writes ---- */
    // Each side of each leg is its own field, so two devices scoring two
    // different teams of the same match never overwrite each other.
    writeTurns(nightId, matchId, legNo, side, turns) {
      return be.updateDoc(matchPath(nightId, matchId), {
        [`legs.${legNo}.${side === 'A' ? 'a' : 'b'}`]: turns,
        status: 'live',
        updatedAt: Date.now(),
      });
    },
    setLegFields(nightId, matchId, legNo, fields) {
      const patch = { updatedAt: Date.now() };
      for (const [k, v] of Object.entries(fields)) patch[`legs.${legNo}.${k}`] = v;
      return be.updateDoc(matchPath(nightId, matchId), patch);
    },
    setMatchFields(nightId, matchId, fields) {
      return be.updateDoc(matchPath(nightId, matchId), { ...fields, updatedAt: Date.now() });
    },
    /** Wipe all turns from a match (admin "clear match"). */
    clearMatch(nightId, matchId) {
      return be.updateDoc(matchPath(nightId, matchId), { legs: {}, status: 'pending', updatedAt: Date.now() });
    },

    /* ---- end of night ---- */
    async saveWeekly(nightId) {
      const [night, matches, players, config] = await Promise.all([
        be.getDoc(`nights/${nightId}`),
        be.getCollection(`nights/${nightId}/matches`),
        be.getCollection('players'),
        be.getDoc('league/config'),
      ]);
      if (!night) throw new Error('That night does not exist.');
      const rules = withRules(config && config.rules);
      const rows = weeklyRows({ night, matches, players, rules });
      const doc = { nightId, date: night.date, week: night.week ?? null, savedAt: Date.now(), rows };
      await be.setDoc(`weekly/${nightId}`, doc);
      return doc;
    },
  };
}

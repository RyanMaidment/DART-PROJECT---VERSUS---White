/* ==========================================================================
   Demo backend — same interface as the Firebase backend, but everything is
   stored in this browser's localStorage. Lets you try the whole system (scorer,
   admin and TV board in separate tabs of the same browser) with no setup.
   Changes made in one tab show up live in the others.
   ========================================================================== */

import { buildDemoDocs } from './seed.js';

const KEY = 'dart-league-demo-v1';

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const parentOf = (path) => path.split('/').slice(0, -1).join('/');
const idOf = (path) => path.split('/').pop();

function setPath(obj, dotted, value) {
  const keys = dotted.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepMerge(target[k], v);
    } else {
      target[k] = clone(v);
    }
  }
  return target;
}

export function createDemoBackend() {
  let docs = {};
  const listeners = new Set();

  const load = () => {
    try { docs = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { docs = {}; }
  };
  const save = () => localStorage.setItem(KEY, JSON.stringify(docs));

  load();
  if (!Object.keys(docs).length) {
    docs = buildDemoDocs();
    save();
  }

  const docData = (path) => (docs[path] ? { id: idOf(path), ...clone(docs[path]) } : null);
  const colData = (path) =>
    Object.keys(docs)
      .filter((p) => parentOf(p) === path)
      .sort()
      .map((p) => ({ id: idOf(p), ...clone(docs[p]) }));

  const fire = () => {
    for (const l of [...listeners]) {
      if (l.type === 'doc') l.cb(docData(l.path), { demo: true });
      else l.cb(colData(l.path), { demo: true });
    }
  };

  // Changes made in another tab of this browser
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { load(); fire(); }
  });

  const subscribe = (type, path, cb) => {
    const l = { type, path, cb };
    listeners.add(l);
    queueMicrotask(() => { if (listeners.has(l)) cb(type === 'doc' ? docData(path) : colData(path), { demo: true }); });
    return () => listeners.delete(l);
  };

  return {
    kind: 'demo',
    async getDoc(path) { return docData(path); },
    async getCollection(path) { return colData(path); },

    async setDoc(path, data, opts) {
      if (opts && opts.merge && docs[path]) deepMerge(docs[path], data);
      else docs[path] = clone(data);
      save(); fire();
    },
    async updateDoc(path, fields) {
      if (!docs[path]) throw new Error('No document at ' + path);
      for (const [k, v] of Object.entries(fields)) setPath(docs[path], k, clone(v));
      save(); fire();
    },
    async deleteDoc(path) { delete docs[path]; save(); fire(); },

    onDoc: (path, cb) => subscribe('doc', path, cb),
    onCollection: (path, cb) => subscribe('col', path, cb),

    /** Demo only: wipe and re-seed */
    async resetDemo() { docs = buildDemoDocs(); save(); fire(); },
  };
}

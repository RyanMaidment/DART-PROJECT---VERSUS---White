/* ==========================================================================
   Firebase backend (Firestore only — no logins)
   Loaded from Google's CDN — no build step, no npm. Works on GitHub Pages.

   Offline: Firestore keeps a copy of the data on the device and queues writes,
   so if the bar's Wi-Fi drops mid-match the scorer keeps working and
   everything syncs when the connection returns.
   ========================================================================== */

import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION } from './config.js';

export async function createFirebaseBackend() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [appMod, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
  ]);

  const app = appMod.initializeApp(FIREBASE_CONFIG);

  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn('Offline cache unavailable, using default Firestore:', err);
    db = fs.getFirestore(app);
  }

  const snapMeta = (snap) => ({
    fromCache: snap.metadata.fromCache,
    pending: snap.metadata.hasPendingWrites,
  });

  return {
    kind: 'firebase',

    async getDoc(path) {
      const snap = await fs.getDoc(fs.doc(db, path));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },
    async getCollection(path) {
      const snap = await fs.getDocs(fs.collection(db, path));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async setDoc(path, data, opts) {
      if (opts) await fs.setDoc(fs.doc(db, path), data, opts);
      else await fs.setDoc(fs.doc(db, path), data);
    },
    async updateDoc(path, fields) { await fs.updateDoc(fs.doc(db, path), fields); },
    async deleteDoc(path) { await fs.deleteDoc(fs.doc(db, path)); },

    onDoc(path, cb) {
      return fs.onSnapshot(
        fs.doc(db, path),
        (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null, snapMeta(snap)),
        (error) => cb(null, { error }),
      );
    },
    onCollection(path, cb) {
      return fs.onSnapshot(
        fs.collection(db, path),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })), snapMeta(snap)),
        (error) => cb([], { error }),
      );
    },
  };
}

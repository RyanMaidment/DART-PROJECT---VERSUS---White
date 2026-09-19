/* ==========================================================================
   SETUP — the only file you need to edit to connect the app to Firebase.
   See README.md, step 3. Until you paste real values below, every page runs
   in DEMO MODE (data is stored only in that browser, nothing is shared).
   ========================================================================== */

// Firebase console -> Project settings -> Your apps -> Web app -> "firebaseConfig"
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCKSdnQJIADybKZkvo4iGQqG0_zh3p78aA',
  authDomain: 'darts-scorer-6b320.firebaseapp.com',
  projectId: 'darts-scorer-6b320',
  appId: '1:265935613884:web:b050a76675f7b18c87c5b9',
};

// The two shared logins you create in Firebase -> Authentication -> Users.
// The email can be anything that looks like an email (it is never emailed).
// The PASSWORD you set for each user is the PIN people type in.
//   scorer = tablets at the tables (can only write match scores)
//   admin  = you (roster, matchups, saving stats)
export const LOGIN_EMAILS = {
  admin: 'admin@dartscorer.app',
};

// Firebase JS SDK version loaded from Google's CDN. Bump if you ever want to update.
export const FIREBASE_SDK_VERSION = '10.12.2';

export function isFirebaseConfigured() {
  const k = FIREBASE_CONFIG.apiKey || '';
  return k.length > 0 && !/^PASTE/i.test(k);
}

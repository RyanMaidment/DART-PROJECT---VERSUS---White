/* ==========================================================================
   SETUP — the only file you need to edit to connect the app to Firebase.
   See README.md, step 3. Until you paste real values below, every page runs
   in DEMO MODE (data is stored only in that browser, nothing is shared).
   ========================================================================== */

// Firebase console -> Project settings -> Your apps -> Web app -> "firebaseConfig"
export const FIREBASE_CONFIG = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  appId: 'PASTE_APP_ID',
};

// Firebase JS SDK version loaded from Google's CDN. Bump if you ever want to update.
export const FIREBASE_SDK_VERSION = '10.12.2';

export function isFirebaseConfigured() {
  const k = FIREBASE_CONFIG.apiKey || '';
  return k.length > 0 && !/^PASTE/i.test(k);
}

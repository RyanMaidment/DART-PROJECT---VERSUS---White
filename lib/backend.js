/* Picks the backend: Firebase when configured, otherwise the local demo backend.
   Add ?demo to any page URL to force demo mode (handy for trying things out). */

import { isFirebaseConfigured } from './config.js';

let promise = null;

export function getBackend() {
  if (!promise) {
    promise = (async () => {
      const forceDemo = new URLSearchParams(location.search).has('demo');
      if (isFirebaseConfigured() && !forceDemo) {
        const { createFirebaseBackend } = await import('./backend-firebase.js');
        return createFirebaseBackend();
      }
      const { createDemoBackend } = await import('./backend-demo.js');
      return createDemoBackend();
    })();
  }
  return promise;
}

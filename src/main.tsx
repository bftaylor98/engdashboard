import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// When debugApi is on, log every fetch to /api/* so TV, auth/me, etc. are visible (they use raw fetch, not api.ts)
(function patchFetchForApiLogging() {
  const orig = window.fetch;
  if (!orig) return;
  // Always log so we can confirm this file is the one running (e.g. not a different project folder)
  console.log(
    "[api] Fetch logger loaded. To log requests: localStorage.setItem('debugApi','true'); then refresh (Ctrl+Shift+R)."
  );
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('debugApi') === 'true') {
      console.log('[api] Debug logging ENABLED for /api requests');
    }
  } catch {
    // ignore
  }
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const reqUrl = typeof input === 'string' ? input : (input as Request).url;
    const path = reqUrl.startsWith('http') ? new URL(reqUrl).pathname : String(reqUrl).split('?')[0];
    let debug = false;
    try {
      debug = typeof localStorage !== 'undefined' && localStorage.getItem('debugApi') === 'true';
    } catch {
      // ignore
    }
    if (!debug || !path.startsWith('/api')) return orig.call(this, input, init);
    const start = Date.now();
    return orig.call(this, input, init).then(
      (res) => {
        const duration = Date.now() - start;
        console.log(`[api] ${path} ${res.status} ${duration}ms`);
        return res;
      },
      (err: unknown) => {
        const duration = Date.now() - start;
        console.log(`[api] ${path} error ${duration}ms`, err instanceof Error ? err.message : String(err));
        throw err;
      }
    );
  };
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);


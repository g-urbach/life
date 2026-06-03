// sw.js — LifeTold Service Worker
// Strategy: network-first for same-origin requests, with offline shell fallback.
//
// CRITICAL: Cross-origin requests (CDN scripts, fonts, APIs) MUST NOT be intercepted.
// The document CSP connect-src does not include CDN domains, so any SW fetch() of a
// CDN URL is blocked by CSP → net::ERR_FAILED → cascading load failures.
// Fix (SEC-BUG-02): early-return for all non-same-origin requests so the browser
// handles them directly via its normal script/link loading pipeline, which is NOT
// subject to the connect-src CSP restriction (only script-src applies to <script> tags).
//
// Affected URLs that must pass through:
//   cdn.jsdelivr.net      — supabase, dompurify, d3-dtree
//   cdnjs.cloudflare.com  — jspdf, d3, lodash
//   unpkg.com             — supabase fallback
//   fonts.googleapis.com  — Google Fonts CSS
//   fonts.gstatic.com     — Google Fonts files
//   *.supabase.co         — API calls (already in connect-src but SW must not re-fetch)
//   *.cloudfront.net      — Peecho button script

const CACHE_NAME = 'lifetold-v6';
const SHELL_URL  = '/';

// Install — cache the app shell
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.add(SHELL_URL).catch(function() { /* non-fatal */ });
    })
  );
});

// Activate — clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// Fetch — network-first for same-origin only
self.addEventListener('fetch', function(event) {
  var req = event.request;

  // ── SEC-BUG-02: Pass through ALL cross-origin requests without intercepting ──
  // The browser's normal fetch pipeline handles CDN scripts/fonts directly and is
  // NOT subject to connect-src CSP restrictions. The SW fetch() IS subject to
  // connect-src, so intercepting these causes CSP blocks and ERR_FAILED errors.
  try {
    var reqUrl = new URL(req.url);
    if (reqUrl.origin !== self.location.origin) {
      // Let the browser handle it — no SW involvement
      return;
    }
  } catch (e) {
    return; // malformed URL — don't intercept
  }

  // Only handle GET requests for same-origin resources
  if (req.method !== 'GET') return;

  // Network-first strategy for same-origin GETs
  event.respondWith(
    fetch(req)
      .then(function(response) {
        // Cache successful same-origin responses (not opaque/error)
        if (response && response.status === 200 && response.type === 'basic') {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(req, responseClone);
          });
        }
        return response;
      })
      .catch(function() {
        // Offline fallback — serve from cache, or the shell for navigation requests
        return caches.match(req).then(function(cached) {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match(SHELL_URL);
          // No cache hit — return a minimal offline response
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

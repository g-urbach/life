// sw.js — LifeTold Service Worker
// Strategy: network-first for same-origin requests, with offline shell fallback.
//
// CRITICAL: Cross-origin requests (CDN scripts, fonts, APIs) MUST NOT be intercepted.
// The document CSP connect-src does not include CDN domains, so any SW fetch() of a
// CDN URL is blocked by CSP → net::ERR_FAILED → cascading load failures.
// Fix (SEC-BUG-02): early-return for all non-same-origin requests so the browser
// handles them directly via its normal script/link load// sw.js — LifeTold Service Worker
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
//
// SW-01 (2026-10-22) — three changes, found while reviewing sign-in hangs on Android:
//  1. Requests whose URL carries ?code= / ?error= (the return trip from Google sign-in) are not
//     handled at all, so the browser does that navigation directly.
//  2. Responses for URLs with ANY query string are no longer cached. Before, one-time sign-in codes,
//     share-link tokens and gift codes were stored in Cache Storage as cache keys (and the cache grew
//     with every unique URL). Plain files and the app shell are still cached as before.
//  3. Network-first now has a time limit: if the network has not answered within NET_TIMEOUT_MS and a
//     cached copy exists, serve the cached copy (the network request carries on and refreshes the cache).
//     Before, a stalled connection made the app wait on the network indefinitely instead of falling back.
//     (A slightly older cached shell is fine: the app's own version check offers a reload.)
//  CACHE_NAME bumped to v7 so activate() deletes the old cache, including any ?code= entries.

const CACHE_NAME     = 'lifetold-v7';
const SHELL_URL      = '/';
const NET_TIMEOUT_MS = 4000;

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
  var reqUrl;

  // ── SEC-BUG-02: Pass through ALL cross-origin requests without intercepting ──
  // The browser's normal fetch pipeline handles CDN scripts/fonts directly and is
  // NOT subject to connect-src CSP restrictions. The SW fetch() IS subject to
  // connect-src, so intercepting these causes CSP blocks and ERR_FAILED errors.
  try {
    reqUrl = new URL(req.url);
    if (reqUrl.origin !== self.location.origin) {
      // Let the browser handle it — no SW involvement
      return;
    }
  } catch (e) {
    return; // malformed URL — don't intercept
  }

  // Only handle GET requests for same-origin resources
  if (req.method !== 'GET') return;

  // SW-01 (1): sign-in return trip (?code=… or ?error=…) — never involve the SW
  var sp = reqUrl.searchParams;
  if (sp.has('code') || sp.has('error') || sp.has('error_description')) return;

  var cacheable = !reqUrl.search;   // SW-01 (2): only URLs with no query string are cached

  // Fallback copy for this request, if we have one (navigations fall back to the shell)
  function cachedCopy() {
    return caches.match(req).then(function(cached) {
      if (cached) return cached;
      if (req.mode === 'navigate') return caches.match(SHELL_URL);
      return undefined;
    });
  }

  // Network-first strategy for same-origin GETs
  var net = fetch(req).then(function(response) {
    // Cache successful same-origin responses (not opaque/error)
    if (cacheable && response && response.status === 200 && response.type === 'basic') {
      var responseClone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(req, responseClone);
      });
    }
    return response;
  });

  // SW-01 (3): if the network is slow AND we have a cached copy, answer with the copy.
  // If there is no cached copy this never settles, so the network answer is still used.
  var slowFallback = new Promise(function(resolve) {
    setTimeout(function() {
      cachedCopy().then(function(c) { if (c) resolve(c); });
    }, NET_TIMEOUT_MS);
  });

  event.respondWith(
    Promise.race([net, slowFallback]).catch(function() {
      // Offline (network failed outright) — serve from cache, or the shell for navigation requests
      return cachedCopy().then(function(cached) {
        if (cached) return cached;
        // No cache hit — return a minimal offline response
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
ing pipeline, which is NOT
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

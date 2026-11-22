// --- src/sw.js ---
// Service Worker v5 (copia offline per telefono / PWA)
// - Disabilitato automaticamente su Desktop Tauri (vedi cloud-sync.js)
// - Con rete: scarica SEMPRE la versione più recente e aggiorna la copia offline
// - Senza rete (o rete lentissima): usa la copia offline
//
// IMPORTANTE: quando aggiungi un nuovo file JS/CSS all'app, aggiungilo anche qui
// e aumenta il numero di CACHE_NAME.

const CACHE_NAME = 'cortex-os-cache-v5';
const NAV_TIMEOUT_MS = 3000;

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './problems.json',
    './css/base.css',
    './css/layout.css',
    './css/features.css',
    './css/money.css',
    './css/health.css',
    './js/core/boot.js',
    './js/core/audio.js',
    './js/core/state.js',
    './js/core/cloud-sync.js',
    './js/core/workspace.js',
    './js/core/dsl.js',
    './js/core/external-bridge.js',
    './js/core/mobile-touch.js',
    './js/modules/modals.js',
    './js/modules/calendar.js',
    './js/modules/tasks.js',
    './js/modules/notes.js',
    './js/modules/planner.js',
    './js/modules/focus.js',
    './js/modules/diet.js',
    './js/modules/gym.js',
    './js/modules/money.js',
    './js/modules/uni.js',
    './js/modules/math.js',
    './js/ai/gemini-agent.js',
    './js/ai/terminal-ui.js',
    // Libreria formule (Math-Hub)
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.allSettled(
                CORE_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
            )
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : undefined)))
        )
    );
    self.clients.claim();
});

function isBypassed(url) {
    return (
        !url.protocol.startsWith('http') ||
        url.hostname.includes('tauri.localhost') ||
        url.hostname.includes('api.github.com') ||
        url.hostname.includes('githubusercontent.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('script.google.com')
    );
}

// Rete prima (con timeout), poi copia offline. Aggiorna sempre la cache quando la rete risponde.
function networkFirst(req, cacheKey, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const fallback = () =>
            caches.match(cacheKey || req).then((cached) => {
                if (!settled && cached) { settled = true; resolve(cached); }
                return cached;
            });

        const timer = timeoutMs ? setTimeout(fallback, timeoutMs) : null;

        fetch(req, { cache: 'no-cache' })
            .then((resp) => {
                if (timer) clearTimeout(timer);
                if (resp && resp.ok) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(cacheKey || req, clone));
                }
                if (!settled) { settled = true; resolve(resp); }
            })
            .catch(() => {
                if (timer) clearTimeout(timer);
                fallback().then((cached) => {
                    if (!settled) {
                        settled = true;
                        resolve(cached || new Response('Offline', { status: 503, statusText: 'Offline' }));
                    }
                });
            });
    });
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (isBypassed(url)) return;

    if (req.mode === 'navigate') {
        event.respondWith(networkFirst(req, './index.html', NAV_TIMEOUT_MS));
        return;
    }
    event.respondWith(networkFirst(req, null, 0));
});

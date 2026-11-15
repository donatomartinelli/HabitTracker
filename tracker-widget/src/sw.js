// --- src/sw.js ---
// Service Worker v4:
// - Disabilitato automaticamente su Desktop Tauri (zero schermate d'errore WebView)
// - App Shell Navigation Fallback immediato + Tutti i CSS/JS aggiornati per PWA Mobile

const CACHE_NAME = 'cortex-os-cache-v4';

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/base.css',
    './css/layout.css',
    './css/features.css',
    './css/money.css',
    './css/health.css',
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
    './js/ai/gemini-agent.js',
    './js/ai/terminal-ui.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                CORE_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((k) => {
                    if (k !== CACHE_NAME) return caches.delete(k);
                })
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Ignora chiamate API esterne o schemi interni Tauri
    if (
        !url.protocol.startsWith('http') ||
        url.hostname.includes('tauri.localhost') ||
        url.hostname.includes('api.github.com') ||
        url.hostname.includes('githubusercontent.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('script.google.com')
    ) {
        return;
    }

    // Per la navigazione principale (index.html), rispondi subito dalla cache se presente (zero schermata "Impossibile aprire pagina") e aggiorna in background
    if (req.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html').then((cachedPage) => {
                const networkFetch = fetch(req)
                    .then((networkResp) => {
                        if (networkResp && networkResp.status === 200) {
                            const clone = networkResp.clone();
                            caches.open(CACHE_NAME).then((c) => c.put('./index.html', clone));
                        }
                        return networkResp;
                    })
                    .catch(() => cachedPage);

                return cachedPage || networkFetch;
            })
        );
        return;
    }

    event.respondWith(
        fetch(req)
            .then((networkResp) => {
                if (networkResp && networkResp.status === 200) {
                    const respClone = networkResp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
                }
                return networkResp;
            })
            .catch(() => caches.match(req))
    );
});
// --- src/sw.js ---
// Service Worker v3: carica sempre i file più recenti quando sei online e usa la cache quando sei in Modalità Aereo / Offline

const CACHE_NAME = 'cortex-os-cache-v3';

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/base.css',
    './css/layout.css',
    './css/components.css',
    './css/features.css',
    './js/core/state.js',
    './js/core/cloud-sync.js',
    './js/core/workspace.js',
    './js/core/dsl.js',
    './js/core/mobile-touch.js',
    './js/modules/calendar.js',
    './js/modules/tasks.js',
    './js/modules/notes.js',
    './js/modules/planner.js',
    './js/modules/diet.js',
    './js/modules/gym.js',
    './js/modules/money.js',
    './js/modules/uni.js',
    './js/modules/modals.js',
    './js/ai/gemini-agent.js',
    './js/ai/terminal-ui.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                CORE_ASSETS.map((url) => cache.add(new Request(url, { cache: 'no-cache' })))
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

    if (url.hostname.includes('api.github.com') ||
        url.hostname.includes('githubusercontent.com') ||
        url.hostname.includes('googleapis.com')) {
        return;
    }

    event.respondWith(
        fetch(req, { cache: 'no-cache' })
            .then((networkResp) => {
                if (networkResp && networkResp.status === 200) {
                    const respClone = networkResp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
                }
                return networkResp;
            })
            .catch(() => {
                return caches.match(req).then((cachedResp) => {
                    if (cachedResp) return cachedResp;
                    if (req.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
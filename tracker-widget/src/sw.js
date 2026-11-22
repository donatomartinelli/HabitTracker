// --- src/sw.js ---
// Service Worker v10 (copia offline per telefono / PWA)
// - Disabilitato automaticamente su Desktop Tauri (vedi cloud-sync.js)
// - APERTURA ISTANTANEA: risponde subito con la copia salvata sul dispositivo
//   e intanto scarica la versione nuova in sottofondo (stale-while-revalidate).
//   Le novita' pubblicate arrivano quindi all'apertura successiva.
// - Prima visita / file non ancora salvati: rete, poi li salva.
//
// IMPORTANTE: quando aggiungi un nuovo file JS/CSS all'app, aggiungilo anche qui
// e aumenta il numero di CACHE_NAME.

const CACHE_NAME = 'cortex-os-cache-v12';

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
    './js/core/sync-merge.js',
    './js/core/cloud-sync.js',
    './js/core/cloud-account.js',
    './js/core/workspace.js',
    './js/core/dsl.js',
    './js/core/nl-parser.js',
    './js/core/search.js',
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
    './js/modules/links.js',
    './js/modules/today.js',
    './js/modules/review.js',
    './js/core/navigator.js',
    './css/shell.css',
    './js/ai/gemini-agent.js',
    './js/ai/terminal-ui.js',
    './js/ai/palette.js',
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
        url.hostname.endsWith('supabase.co') ||
        url.hostname.includes('githubusercontent.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('script.google.com')
    );
}

// Scarica dalla rete e aggiorna la copia salvata
function refresh(req, cacheKey) {
    return fetch(req, { cache: 'no-cache' }).then((resp) => {
        if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(cacheKey || req, clone));
        }
        return resp;
    });
}

// Copia salvata subito (aggiornata in sottofondo); rete solo se non c'e' ancora
function staleWhileRevalidate(event, req, cacheKey) {
    return caches.match(cacheKey || req).then((cached) => {
        const network = refresh(req, cacheKey).catch(() => null);
        if (cached) {
            event.waitUntil(network);
            return cached;
        }
        return network.then((resp) => resp || new Response('Offline', { status: 503, statusText: 'Offline' }));
    });
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (isBypassed(url)) return;

    if (req.mode === 'navigate') {
        // La pagina principale e' sempre index.html (anche con ?v=... o #...)
        event.respondWith(staleWhileRevalidate(event, req, './index.html'));
        return;
    }
    event.respondWith(staleWhileRevalidate(event, req, null));
});

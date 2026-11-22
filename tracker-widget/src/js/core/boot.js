// --- js/core/boot.js ---
// AVVIO DI CORTEX + MEMORIA DATI (cortexStore)
//
// Perché esiste:
//   Prima l'app leggeva i dati da localStorage (max ~5 MB). Quando si riempiva,
//   i salvataggi fallivano in silenzio e all'avvio i dati VECCHI venivano
//   ricopiati sopra quelli buoni in IndexedDB. Rischio di perdita dati.
//
// Come funziona ora:
//   1. Prima di caricare il resto dell'app, legge TUTTO da IndexedDB (nessun limite pratico).
//   2. Mette i dati in memoria in `cortexStore`, che ha la stessa interfaccia di
//      localStorage (getItem / setItem / removeItem), così il resto del codice non cambia.
//   3. Ogni scrittura va subito in IndexedDB. localStorage resta solo come copia
//      di riserva "best effort": se è pieno, la chiave viene rimossa invece di restare vecchia.
//   4. Una volta al giorno salva un'istantanea completa (ultimi 14 giorni) per il ripristino.
//   5. Se un salvataggio fallisce davvero, l'utente viene avvisato.

(function () {
    'use strict';

    const DB_NAME = 'CortexScalableDB';
    const DB_VERSION = 2;            // v2: aggiunto archivio istantanee giornaliere
    const KV = 'kv_store';
    const SNAP = 'snapshots';
    const SNAPSHOT_KEEP = 14;

    // Ordine di caricamento degli script dell'app (prima era nei tag <script> di index.html)
    const APP_SCRIPTS = [
        'js/core/audio.js',
        'js/core/state.js',
        'js/core/sync-merge.js',
        'js/core/cloud-sync.js',
        'js/core/workspace.js',
        'js/core/dsl.js',
        'js/core/external-bridge.js',
        'js/modules/modals.js',
        'js/modules/calendar.js',
        'js/modules/tasks.js',
        'js/modules/notes.js',
        'js/modules/planner.js',
        'js/modules/focus.js',
        'js/modules/diet.js',
        'js/modules/gym.js',
        'js/modules/money.js',
        'js/modules/uni.js',
        'js/modules/math.js',
        'js/modules/today.js',
        'js/ai/gemini-agent.js',
        'js/ai/terminal-ui.js',
        'js/core/mobile-touch.js',
        'js/core/navigator.js'
    ];
    window.CORTEX_APP_SCRIPTS = APP_SCRIPTS;

    // ------------------------------------------------------------------
    // Avvisi all'utente (funziona anche prima che l'interfaccia sia pronta)
    // ------------------------------------------------------------------
    const shownNotices = new Set();
    function notify(msg, kind = 'error') {
        if (shownNotices.has(msg)) return;
        shownNotices.add(msg);
        const show = () => {
            if (typeof window.showToast === 'function') { window.showToast(msg); return; }
            const el = document.getElementById('terminal-toast');
            if (!el) return;
            el.textContent = msg;
            el.classList.add('show');
            setTimeout(() => el.classList.remove('show'), 5000);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
        else show();
        (kind === 'error' ? console.error : console.warn)('[Cortex]', msg);
    }
    window.cortexNotify = notify;

    // ------------------------------------------------------------------
    // IndexedDB
    // ------------------------------------------------------------------
    let dbPromise = null;
    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve) => {
            if (!window.indexedDB) { resolve(null); return; }
            try {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
                    if (!db.objectStoreNames.contains(SNAP)) db.createObjectStore(SNAP);
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = () => resolve(null);
                req.onblocked = () => resolve(null);
            } catch (err) {
                resolve(null);
            }
        });
        return dbPromise;
    }

    function readAll(db, storeName) {
        return new Promise((resolve) => {
            const out = {};
            try {
                const cur = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor();
                cur.onsuccess = (e) => {
                    const c = e.target.result;
                    if (c) { out[c.key] = c.value; c.continue(); } else resolve(out);
                };
                cur.onerror = () => resolve(out);
            } catch (err) { resolve(out); }
        });
    }

    // ------------------------------------------------------------------
    // cortexStore: stessa interfaccia di localStorage, ma con IndexedDB come fonte principale
    // ------------------------------------------------------------------
    const mem = new Map();
    let pendingPuts = new Map();     // chiave -> valore (stringa) oppure null = cancella
    let flushScheduled = false;
    let idbAvailable = false;
    let inflight = Promise.resolve();   // ultima scrittura in corso

    function scheduleFlush() {
        if (flushScheduled) return;
        flushScheduled = true;
        queueMicrotask(flush);
    }

    async function flush() {
        flushScheduled = false;
        if (pendingPuts.size === 0) return;
        const batch = pendingPuts;
        pendingPuts = new Map();
        const db = await openDB();
        if (!db) {
            if (!idbAvailable) return; // browser senza IndexedDB: resta solo localStorage
            notify('⚠ Save failed: device storage unavailable. Export a backup.');
            return;
        }
        const txP = new Promise((resolve) => {
            try {
                const tx = db.transaction(KV, 'readwrite');
                const store = tx.objectStore(KV);
                for (const [k, v] of batch) {
                    if (v === null) store.delete(k); else store.put(v, k);
                }
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => { notify('⚠ Save failed: some changes may not have been saved.'); resolve(false); };
                tx.onabort = () => { notify('⚠ Save failed: storage full or blocked.'); resolve(false); };
            } catch (err) {
                notify('⚠ Save failed: ' + (err && err.message ? err.message : err));
                resolve(false);
            }
        });
        inflight = inflight.then(() => txP);
        return txP;
    }

    function mirrorToLocalStorage(key, value) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch (quotaErr) {
            // localStorage pieno: rimuovo la copia vecchia così non può mai "vincere" su quella buona.
            try { localStorage.removeItem(key); } catch (e) { /* niente da fare */ }
        }
    }

    const cortexStore = {
        getItem(key) {
            const v = mem.get(String(key));
            return v === undefined ? null : v;
        },
        setItem(key, value) {
            key = String(key);
            value = String(value);
            if (mem.get(key) === value) return;
            mem.set(key, value);
            pendingPuts.set(key, value);
            scheduleFlush();
            mirrorToLocalStorage(key, value);
        },
        removeItem(key) {
            key = String(key);
            mem.delete(key);
            pendingPuts.set(key, null);
            scheduleFlush();
            mirrorToLocalStorage(key, null);
        },
        key(i) { return Array.from(mem.keys())[i] ?? null; },
        get length() { return mem.size; },
        keys() { return Array.from(mem.keys()); },
        // Attende che tutte le modifiche siano scritte su disco (da usare prima di un reload)
        async flush() { await flush(); await inflight; },
        // Copia completa di tutti i dati (usata da backup ed esportazione)
        dump() { return Object.fromEntries(mem); }
    };
    window.cortexStore = cortexStore;

    // ------------------------------------------------------------------
    // Istantanee giornaliere (backup automatico locale)
    // ------------------------------------------------------------------
    function localDateStr(d = new Date()) {
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    async function takeDailySnapshot() {
        const db = await openDB();
        if (!db) return;
        const today = localDateStr();
        try {
            const keys = await new Promise((resolve) => {
                const r = db.transaction(SNAP, 'readonly').objectStore(SNAP).getAllKeys();
                r.onsuccess = () => resolve(r.result || []);
                r.onerror = () => resolve([]);
            });
            if (keys.includes(today)) return;
            const tx = db.transaction(SNAP, 'readwrite');
            const store = tx.objectStore(SNAP);
            store.put({ createdAt: new Date().toISOString(), data: cortexStore.dump() }, today);
            keys.sort();
            const excess = keys.length + 1 - SNAPSHOT_KEEP;
            for (let i = 0; i < excess; i++) store.delete(keys[i]);
        } catch (err) {
            console.warn('[Cortex] istantanea giornaliera non riuscita', err);
        }
    }

    // API pubblica per l'interfaccia (impostazioni → backup)
    window.cortexBackups = {
        async list() {
            const db = await openDB();
            if (!db) return [];
            return new Promise((resolve) => {
                const r = db.transaction(SNAP, 'readonly').objectStore(SNAP).getAllKeys();
                r.onsuccess = () => resolve((r.result || []).sort().reverse());
                r.onerror = () => resolve([]);
            });
        },
        async get(dateStr) {
            const db = await openDB();
            if (!db) return null;
            return new Promise((resolve) => {
                const r = db.transaction(SNAP, 'readonly').objectStore(SNAP).get(dateStr);
                r.onsuccess = () => resolve(r.result || null);
                r.onerror = () => resolve(null);
            });
        },
        // Ripristina un'istantanea: sostituisce tutti i dati e ricarica l'app
        async restore(dateStr) {
            const snap = await this.get(dateStr);
            if (!snap || !snap.data) return false;
            for (const k of cortexStore.keys()) {
                if (!(k in snap.data)) cortexStore.removeItem(k);
            }
            for (const [k, v] of Object.entries(snap.data)) cortexStore.setItem(k, v);
            await cortexStore.flush();
            location.reload();
            return true;
        },
        snapshotNow: takeDailySnapshot
    };

    // ------------------------------------------------------------------
    // Errori imprevisti: visibili invece che silenziosi
    // ------------------------------------------------------------------
    window.addEventListener('error', (e) => {
        if (!e || !e.message) return;
        notify('⚠ Error: ' + e.message + (e.filename ? ' (' + e.filename.split('/').pop() + ')' : ''));
    });
    window.addEventListener('unhandledrejection', (e) => {
        const r = e && e.reason;
        console.error('[Cortex] promise non gestita', r);
    });

    // Prima di chiudere/nascondere l'app, svuota subito la coda di scrittura
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', () => flush());

    // ------------------------------------------------------------------
    // Caricamento sequenziale degli script dell'app
    // ------------------------------------------------------------------
    function loadScriptsInOrder(list) {
        return list.reduce((p, src) => p.then(() => new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = () => resolve();
            s.onerror = () => { notify("⚠ Couldn't load " + src); resolve(); };
            document.body.appendChild(s);
        })), Promise.resolve());
    }

    async function hydrate() {
        // 1. Copia da localStorage (dati vecchi o chiavi mai finite in IndexedDB)
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k !== null) mem.set(k, localStorage.getItem(k));
            }
        } catch (e) { /* localStorage non disponibile */ }

        // 2. IndexedDB vince: contiene sempre la versione più completa
        const db = await openDB();
        if (db) {
            idbAvailable = true;
            const idbData = await readAll(db, KV);
            const missingInIdb = [];
            for (const [k, v] of Object.entries(idbData)) {
                if (v === null || v === undefined) continue;
                mem.set(k, typeof v === 'string' ? v : JSON.stringify(v));
            }
            // 3. Le chiavi che esistevano solo in localStorage vengono copiate in IndexedDB
            for (const k of mem.keys()) if (!(k in idbData)) missingInIdb.push(k);
            for (const k of missingInIdb) pendingPuts.set(k, mem.get(k));
            if (missingInIdb.length) scheduleFlush();
        } else {
            notify('⚠ Main storage unavailable: data is only saved in limited mode. Export backups often.', 'warn');
        }

        // 4. Chiedi al browser di non cancellare mai i dati (importante su telefono)
        try {
            if (navigator.storage && navigator.storage.persist) {
                const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
                if (!already) await navigator.storage.persist();
            }
        } catch (e) { /* non supportato */ }
    }

    async function start() {
        await hydrate();
        await loadScriptsInOrder(APP_SCRIPTS);

        // Gli script sono stati caricati dopo l'evento DOMContentLoaded originale:
        // lo rilancio così i moduli eseguono la loro inizializzazione come prima.
        const fire = () => document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fire, { once: true });
        else fire();

        setTimeout(takeDailySnapshot, 5000);
    }

    start();
})();

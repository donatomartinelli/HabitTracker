// --- js/core/cloud-sync.js ---
// SINCRONIZZAZIONE PC ↔ TELEFONO ↔ TABLET (GitHub Gist segreto)
//
// Come funziona (v3, "unione intelligente"):
//   1. Scarica lo stato dal cloud.
//   2. Lo UNISCE con quello di questo dispositivo usando la "base" (lo stato
//      dell'ultima sincronizzazione riuscita) → vedi js/core/sync-merge.js.
//      Nessun dispositivo sovrascrive più alla cieca il lavoro dell'altro.
//   3. Applica il risultato qui e lo carica nel cloud (solo se serve).
//   4. Nei conflitti veri (stesso campo cambiato su due dispositivi) vince il
//      più recente; la versione scartata è salvata in "cortex_sync_conflicts".
//
// Quando parte da sola:
//   all'avvio · 3s dopo una modifica · quando torni sull'app · quando torna la rete ·
//   ogni 60s se l'app è aperta · subito quando chiudi/nascondi l'app con modifiche in sospeso.

const GIST_FILENAME = 'cortex_cloud_state.json';
const SYNC_PAYLOAD_VERSION = 3;
const SYNC_BASE_KEY = 'cortex_sync_base';
const SYNC_CONFLICTS_KEY = 'cortex_sync_conflicts';
const SYNC_CHANGE_DEBOUNCE_MS = 3000;
const SYNC_POLL_MS = 60000;
const SYNC_FOCUS_THROTTLE_MS = 10000;
const SYNC_MAX_CONFLICTS = 100;
const SYNC_DIRTY_KEY = 'cortex_sync_dirty_since';

let cloudGithubToken = (cortexStore.getItem('cortex_gist_token') || '').trim();
let cloudGistId = (cortexStore.getItem('cortex_gist_id') || '').trim();
let lastCloudSyncedUpdatedAt = parseInt(cortexStore.getItem('cortex_last_cloud_ts') || '0', 10) || 0;

// Pulizia chiavi della versione precedente
cortexStore.removeItem('cortex_pending_push_ts');

// Stato del motore
let isCloudSyncInProgress = false;
let isApplyingCloudPull = false;     // usato anche da altri moduli per ignorare i salvataggi durante l'applicazione
let syncRequestedAgain = false;
let localChangeSeq = 0;              // aumenta a ogni modifica locale
let localSyncedSeq = 0;              // valore di localChangeSeq all'ultima sync riuscita
let localDirtySinceMs = 0;           // quando è iniziata la modifica locale non ancora sincronizzata
let syncDebounceTimer = null;
let lastSyncAttemptMs = 0;
let lastSyncOkMs = 0;
let cloudSyncStatus = 'idle';

// Modifiche rimaste in sospeso dalla sessione precedente (es. app chiusa offline)
(function restorePendingFromLastSession() {
    const since = parseInt(cortexStore.getItem('cortex_sync_dirty_since') || '0', 10) || 0;
    if (since) { localDirtySinceMs = since; localChangeSeq = 1; }
})();

// Compatibilità con il codice esistente
let isBootSyncing = false;
function hasLocalChangesPending() { return localChangeSeq !== localSyncedSeq; }

// ============================================================================
// SERVICE WORKER (copia offline per telefono)
// ============================================================================

function registerAndRefreshServiceWorker() {
    const isDesktopTauri = Boolean(window.__TAURI__ || window.location.hostname.includes('tauri'));

    // Su Desktop Tauri non serve il Service Worker e può causare il flash "Impossibile aprire pagina" di WebView2
    if (isDesktopTauri) {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                regs.forEach(r => r.unregister());
            }).catch(() => {});
        }
        return;
    }

    // La pulizia delle vecchie cache la fa sw.js stesso all'attivazione.
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
            reg.update().catch(() => {});
        }).catch(() => {});
    }
}

// ============================================================================
// CONFIGURAZIONE
// ============================================================================

function checkUrlHashForMagicSyncSetup() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#cortex_sync=')) return false;

    const rawPayload = decodeURIComponent(hash.replace('#cortex_sync=', '').trim());
    const sepIdx = rawPayload.indexOf(':');
    if (sepIdx === -1) return false;

    const token = rawPayload.slice(0, sepIdx).trim();
    const gistId = rawPayload.slice(sepIdx + 1).trim();

    if (token && gistId) {
        cloudGithubToken = token;
        cloudGistId = gistId;
        cortexStore.setItem('cortex_gist_token', cloudGithubToken);
        cortexStore.setItem('cortex_gist_id', cloudGistId);
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
        if (typeof showToast === 'function') showToast('[☁ SYNC] Device linked. Syncing…');
        return true;
    }
    return false;
}

function isAccountSignedIn() {
    return typeof CortexAccount !== 'undefined' && CortexAccount.isSignedIn();
}

function isCloudSyncConfigured() {
    return isAccountSignedIn() || Boolean(cloudGithubToken && cloudGistId);
}

// Which cloud this device syncs with. The account wins over the legacy Gist.
function syncBackendId() {
    if (isAccountSignedIn()) return 'account:' + CortexAccount.userId();
    if (cloudGithubToken && cloudGistId) return 'gist:' + cloudGistId;
    return null;
}

// Read the cloud copy: payload { version, updatedAt, data } with a hidden __version
async function fetchRemote() {
    if (isAccountSignedIn()) return CortexAccount.fetchState();
    const p = await fetchRemoteGistPayload();
    Object.defineProperty(p, '__version', { value: p.__gistVersion, enumerable: false });
    return p;
}

// Write the merged state. Returns the data written by other devices in the meantime
// (empty array = our write went through cleanly).
async function uploadRemote(payload, versionRead) {
    if (isAccountSignedIn()) {
        const r = await CortexAccount.saveState(payload, versionRead);
        return r.ok ? [] : [(r.latest && r.latest.data) || {}];
    }
    const missed = await uploadPayloadToGist(payload, versionRead);
    const others = [];
    for (const sha of missed.slice().reverse()) {          // oldest first
        const intruder = await fetchGistPayloadAtVersion(sha);
        others.push((intruder && intruder.data) || {});
    }
    return others;
}

// ============================================================================
// INDICATORE DI STATO NELL'HEADER
// ============================================================================

function formatAgo(ms) {
    if (!ms) return 'never';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function setCloudSyncHeaderIndicator(state, tooltipMsg = '') {
    cloudSyncStatus = state;
    const btn = document.getElementById('btn-cloud-sync-hdr');
    if (!btn) return;

    if (!isCloudSyncConfigured()) {
        btn.textContent = '☁';
        btn.style.color = 'var(--text-dim)';
        btn.title = 'Sign in to sync your devices';
        btn.dataset.syncState = 'off';
        return;
    }

    const map = {
        'idle':    { text: '☁',     color: 'var(--text-dim)',     tip: 'Sync ready' },
        'syncing': { text: '☁ ⇅',   color: 'var(--accent-gold)',  tip: 'Syncing…' },
        'queued':  { text: '☁ •',   color: 'var(--accent-gold)',  tip: 'Changes waiting to be sent' },
        'offline': { text: '☁ OFF', color: 'var(--text-muted)',   tip: "Offline — changes are saved here and will be sent when you're back online" },
        'ok':      { text: '☁ ✓',   color: 'var(--accent-green)', tip: 'Synced' },
        'error':   { text: '☁ !',   color: 'var(--accent-red)',   tip: 'Sync error' }
    };
    const cfg = map[state] || map['idle'];
    btn.textContent = cfg.text;
    btn.style.color = cfg.color;
    btn.dataset.syncState = state;
    const lastLine = lastSyncOkMs ? `\nLast sync: ${formatAgo(lastSyncOkMs)}` : '';
    btn.title = (tooltipMsg || cfg.tip) + lastLine + '\n(click to sync now)';
}

function refreshSyncIndicatorFromState() {
    if (!isCloudSyncConfigured()) { setCloudSyncHeaderIndicator('idle'); return; }
    if (isCloudSyncInProgress) return;
    if (!navigator.onLine) { setCloudSyncHeaderIndicator('offline'); return; }
    if (hasLocalChangesPending()) { setCloudSyncHeaderIndicator('queued'); return; }
    if (cloudSyncStatus === 'error') return;
    setCloudSyncHeaderIndicator(lastSyncOkMs ? 'ok' : 'idle');
}

// ============================================================================
// STATO SINCRONIZZATO: cosa va nel cloud e come si riapplica
// ============================================================================

function buildFullCortexCloudPayload(timestampMs) {
    return {
        version: SYNC_PAYLOAD_VERSION,
        updatedAt: timestampMs,
        data: {
            templates: typeof templates !== 'undefined' ? templates : [],
            logs: typeof logs !== 'undefined' ? logs : {},
            specificEvents: typeof specificEvents !== 'undefined' ? specificEvents : [],
            noteCategories: typeof noteCategories !== 'undefined' ? noteCategories : ['General', 'Registrazioni'],
            notesContent: typeof notesContent !== 'undefined' ? notesContent : {},
            journals: typeof journals !== 'undefined' ? journals : {},
            categoryOrder: typeof categoryOrder !== 'undefined' ? categoryOrder : [],
            referenceLayers: typeof referenceLayers !== 'undefined' ? referenceLayers : [],
            refToggles: typeof refToggles !== 'undefined' ? refToggles : {},
            ephemeralData: typeof ephemeralData !== 'undefined' ? ephemeralData : {},
            generalTodos: typeof generalTodos !== 'undefined' ? generalTodos : [],
            plannerExceptions: typeof plannerExceptions !== 'undefined' ? plannerExceptions : {},
            dailyPriorities: typeof dailyPriorities !== 'undefined' ? dailyPriorities : {},
            routinesData: typeof routinesData !== 'undefined' ? routinesData : [],
            routineLogs: typeof routineLogs !== 'undefined' ? routineLogs : {},
            focusLogs: typeof focusLogs !== 'undefined' ? focusLogs : [],
            processedAudioFiles: typeof processedAudioFiles !== 'undefined' ? processedAudioFiles : [],
            mBalance: typeof mBalance !== 'undefined' ? mBalance : 0,
            mTransactions: typeof mTransactions !== 'undefined' ? mTransactions : [],
            mRecurring: typeof mRecurring !== 'undefined' ? mRecurring : [],
            mWishlist: typeof mWishlist !== 'undefined' ? mWishlist : [],
            mVaults: typeof mVaults !== 'undefined' ? mVaults : [],
            mCategories: typeof mCategories !== 'undefined' ? mCategories : [],
            nextWorkoutDay: typeof nextWorkoutDay !== 'undefined' ? nextWorkoutDay : 1,
            savedGymWeights: typeof savedGymWeights !== 'undefined' ? savedGymWeights : {},
            dietData: typeof dietData !== 'undefined' ? dietData : [],
            dietRules: typeof dietRules !== 'undefined' ? dietRules : '',
            foodDb: typeof foodDb !== 'undefined' ? foodDb : [],
            bodyLogs: typeof bodyLogs !== 'undefined' ? bodyLogs : [],
            gymPlan: typeof gymPlan !== 'undefined' ? gymPlan : {},
            gymRoutine: typeof gymRoutine !== 'undefined' ? gymRoutine : {},
            gymStartDate: typeof gymStartDate !== 'undefined' ? gymStartDate : '',
            gymEndDate: typeof gymEndDate !== 'undefined' ? gymEndDate : '',
            uniData: typeof uniData !== 'undefined' ? uniData : {},
            mathHubState: typeof mathHubState !== 'undefined' ? mathHubState : {},
            mentalMathWeights: typeof mentalMathWeights !== 'undefined' ? mentalMathWeights : {},
            mentalMathHistory: typeof mentalMathHistory !== 'undefined' ? mentalMathHistory : {},
            mentalMathConfig: typeof mentalMathConfig !== 'undefined' ? mentalMathConfig : {},
            workspacePresets: typeof workspacePresets !== 'undefined' ? workspacePresets : [],
            customAliases: typeof customAliases !== 'undefined' ? customAliases : {},
            macroDefaultTrees: typeof macroDefaultTrees !== 'undefined' ? macroDefaultTrees : {},
            bridgeWebAppUrl: typeof bridgeWebAppUrl !== 'undefined' ? bridgeWebAppUrl : '',
            icloudIcsUrl: typeof icloudIcsUrl !== 'undefined' ? icloudIcsUrl : '',
            bankGmailQuery: typeof bankGmailQuery !== 'undefined' ? bankGmailQuery : '',
            processedBankEmails: typeof processedBankEmails !== 'undefined' ? processedBankEmails : [],
            enabledModules: typeof enabledModules !== 'undefined' ? enabledModules : {},
            calendarFeeds: typeof calendarFeeds !== 'undefined' ? calendarFeeds : [],
            timeZone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })()
        }
    };
}

function buildLocalSyncState() {
    // Copia profonda: il merge non deve mai toccare gli oggetti vivi dell'app
    return JSON.parse(JSON.stringify(buildFullCortexCloudPayload(0).data));
}

function applyFullCortexCloudPayload(payloadObj) {
    if (!payloadObj || !payloadObj.data) return false;
    const d = payloadObj.data;

    isApplyingCloudPull = true;
    try {
        if (Array.isArray(d.templates)) templates = d.templates;
        if (d.logs && typeof d.logs === 'object') logs = d.logs;
        if (Array.isArray(d.specificEvents)) specificEvents = d.specificEvents;
        if (Array.isArray(d.noteCategories)) noteCategories = d.noteCategories;
        if (d.notesContent && typeof d.notesContent === 'object') notesContent = d.notesContent;
        if (d.journals && typeof d.journals === 'object') journals = d.journals;
        if (Array.isArray(d.categoryOrder)) categoryOrder = d.categoryOrder;
        if (Array.isArray(d.referenceLayers)) referenceLayers = d.referenceLayers;
        if (d.refToggles && typeof d.refToggles === 'object') refToggles = d.refToggles;
        if (d.ephemeralData && typeof d.ephemeralData === 'object') ephemeralData = d.ephemeralData;
        if (Array.isArray(d.generalTodos)) generalTodos = d.generalTodos;
        if (d.plannerExceptions && typeof d.plannerExceptions === 'object') plannerExceptions = d.plannerExceptions;
        if (d.dailyPriorities && typeof d.dailyPriorities === 'object') dailyPriorities = d.dailyPriorities;
        if (Array.isArray(d.routinesData)) routinesData = d.routinesData;
        if (d.routineLogs && typeof d.routineLogs === 'object') routineLogs = d.routineLogs;
        if (Array.isArray(d.focusLogs)) focusLogs = d.focusLogs;
        if (Array.isArray(d.processedAudioFiles)) processedAudioFiles = d.processedAudioFiles;

        if (d.mBalance !== undefined) mBalance = roundCurrency(d.mBalance);
        if (Array.isArray(d.mTransactions)) mTransactions = d.mTransactions;
        if (Array.isArray(d.mRecurring)) mRecurring = d.mRecurring;
        if (Array.isArray(d.mWishlist)) mWishlist = d.mWishlist;
        if (Array.isArray(d.mVaults)) mVaults = d.mVaults;
        if (Array.isArray(d.mCategories)) mCategories = d.mCategories;

        if (d.nextWorkoutDay !== undefined) nextWorkoutDay = d.nextWorkoutDay;
        if (d.savedGymWeights && typeof d.savedGymWeights === 'object') savedGymWeights = d.savedGymWeights;
        if (Array.isArray(d.dietData)) dietData = d.dietData;
        if (typeof d.dietRules === 'string') dietRules = d.dietRules;
        if (Array.isArray(d.foodDb)) foodDb = d.foodDb;
        if (Array.isArray(d.bodyLogs)) bodyLogs = d.bodyLogs;
        if (d.gymPlan && typeof d.gymPlan === 'object') gymPlan = d.gymPlan;
        if (d.gymRoutine && typeof d.gymRoutine === 'object') gymRoutine = d.gymRoutine;
        if (typeof d.gymStartDate === 'string') gymStartDate = d.gymStartDate;
        if (typeof d.gymEndDate === 'string') gymEndDate = d.gymEndDate;

        if (d.uniData && typeof d.uniData === 'object') uniData = d.uniData;
        if (d.mathHubState && typeof d.mathHubState === 'object' && Object.keys(d.mathHubState).length) mathHubState = d.mathHubState;
        if (d.mentalMathWeights && typeof d.mentalMathWeights === 'object') mentalMathWeights = d.mentalMathWeights;
        if (d.mentalMathHistory && typeof d.mentalMathHistory === 'object') mentalMathHistory = d.mentalMathHistory;
        if (d.mentalMathConfig && typeof d.mentalMathConfig === 'object' && Object.keys(d.mentalMathConfig).length) mentalMathConfig = d.mentalMathConfig;
        if (Array.isArray(d.workspacePresets)) workspacePresets = d.workspacePresets;
        if (d.customAliases && typeof d.customAliases === 'object') customAliases = d.customAliases;
        if (d.macroDefaultTrees && typeof d.macroDefaultTrees === 'object') {
            macroDefaultTrees = d.macroDefaultTrees;
            cortexStore.setItem('tracker_macro_default_trees', JSON.stringify(macroDefaultTrees));
        }
        if (typeof d.bridgeWebAppUrl === 'string' && d.bridgeWebAppUrl) {
            bridgeWebAppUrl = d.bridgeWebAppUrl;
            cortexStore.setItem('cortex_bridge_url', bridgeWebAppUrl);
        }
        if (typeof d.icloudIcsUrl === 'string') {
            icloudIcsUrl = d.icloudIcsUrl;
            cortexStore.setItem('cortex_icloud_ics_url', icloudIcsUrl);
        }
        if (typeof d.bankGmailQuery === 'string' && d.bankGmailQuery) {
            bankGmailQuery = d.bankGmailQuery;
            cortexStore.setItem('cortex_bank_gmail_query', bankGmailQuery);
        }
        if (Array.isArray(d.processedBankEmails)) {
            processedBankEmails = d.processedBankEmails;
            cortexStore.setItem('cortex_processed_bank_emails', JSON.stringify(processedBankEmails));
        }

        if (d.enabledModules && typeof applyEnabledModules === 'function') applyEnabledModules(d.enabledModules);
        if (Array.isArray(d.calendarFeeds) && typeof applyCalendarFeeds === 'function') applyCalendarFeeds(d.calendarFeeds);

        saveData();
        saveMoneyData();
        saveHealthData();
        saveUniData();
        saveWorkspaceState();
        if (typeof saveCustomAliases === 'function') saveCustomAliases();

        rerenderAllAfterSync();

        if (typeof captureCurrentStateSnapshotString === 'function') {
            lastCapturedSnapshotStr = captureCurrentStateSnapshotString();
        }
    } catch (err) {
        console.error('[SYNC] errore applicando i dati', err);
        isApplyingCloudPull = false;
        return false;
    }
    isApplyingCloudPull = false;
    return true;
}

function rerenderAllAfterSync() {
    const calls = [
        'refreshActivePanesInPlace', 'renderTasks', 'renderCalendar', 'renderWeeklyPlanner',
        'renderDayPlannerModule', 'renderDiet', 'renderGymDashboard', 'renderMoneyDashboard',
        'renderUniDashboard', 'renderNoteCategories', 'syncMobileModeUI',
        'updateWorkspaceDropdownUI', 'updateExternalBridgeSettingsUI'
    ];
    for (const fn of calls) {
        try { if (typeof window[fn] === 'function') window[fn](); }
        catch (e) { console.error('[SYNC] errore ridisegnando', fn, e); }
    }
}

// ============================================================================
// BASE E CONFLITTI
// ============================================================================

const SYNC_BASE_OWNER_KEY = 'cortex_sync_base_owner';

function loadSyncBase() {
    const owner = cortexStore.getItem(SYNC_BASE_OWNER_KEY);
    const current = syncBackendId();
    // Legacy bases (before accounts) belong to the Gist they were made with
    if (!owner && current && current.startsWith('gist:')) {
        // keep using it
    } else if (owner !== current) {
        return null;
    }
    const raw = cortexStore.getItem(SYNC_BASE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

function saveSyncBase(stateObj) {
    cortexStore.setItem(SYNC_BASE_KEY, JSON.stringify(stateObj));
    cortexStore.setItem(SYNC_BASE_OWNER_KEY, syncBackendId() || '');
}

function recordSyncConflicts(conflicts, keptSide) {
    if (!conflicts || !conflicts.length) return;
    let list = [];
    try { list = JSON.parse(cortexStore.getItem(SYNC_CONFLICTS_KEY) || '[]'); } catch (e) { list = []; }
    const at = new Date().toISOString();
    for (const c of conflicts) list.unshift({ at, keptSide, path: c.path, kept: c.kept, discarded: c.discarded });
    cortexStore.setItem(SYNC_CONFLICTS_KEY, JSON.stringify(list.slice(0, SYNC_MAX_CONFLICTS)));
    if (typeof showToast === 'function') {
        const n = conflicts.length;
        showToast(`[☁ SYNC] ${n} ${n === 1 ? 'conflicting change' : 'conflicting changes'}: kept the newest, the other is saved in Settings → System.`);
    }
    updateCloudSyncSettingsUI();
}

function getSyncConflicts() {
    try { return JSON.parse(cortexStore.getItem(SYNC_CONFLICTS_KEY) || '[]'); } catch (e) { return []; }
}

// Nomi leggibili per le sezioni dei dati (usati nell'elenco conflitti)
const SYNC_SECTION_LABELS = {
    templates: 'Tasks', logs: 'Task history', specificEvents: 'Events', noteCategories: 'Note categories',
    notesContent: 'Notes', journals: 'Journal', categoryOrder: 'Category order', referenceLayers: 'Planner layers',
    refToggles: 'Active layers', ephemeralData: 'Day blocks', generalTodos: 'To-dos',
    plannerExceptions: 'Planner exceptions', dailyPriorities: 'Daily priorities', routinesData: 'Routines',
    routineLogs: 'Routine history', focusLogs: 'Focus sessions', mBalance: 'Balance', mTransactions: 'Transactions',
    mRecurring: 'Bills', mWishlist: 'Wishlist', mVaults: 'Vaults', mCategories: 'Spending categories',
    savedGymWeights: 'Gym weights', dietData: 'Diet', dietRules: 'Diet rules', foodDb: 'Foods',
    bodyLogs: 'Body weight', gymPlan: 'Gym plan', gymRoutine: 'Gym routine', uniData: 'University',
    mathHubState: 'Math', workspacePresets: 'Saved views', customAliases: 'Custom commands'
};
function humanSyncPath(path) {
    const parts = String(path || '').split('.');
    if (parts[0] && SYNC_SECTION_LABELS[parts[0]]) parts[0] = SYNC_SECTION_LABELS[parts[0]];
    return parts.join(' › ');
}

function showSyncConflictsModal() {
    const list = getSyncConflicts();
    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s)) : String(s).replace(/[&<>"]/g, ''));
    const fmt = (v) => esc(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
    const rows = list.length
        ? list.map((c) => `
            <div class="cfg-box u-flex u-col u-gap-2">
                <div class="u-flex u-jc-between u-fs-2xs u-dim">
                    <span>${esc(humanSyncPath(c.path))}</span><span>${esc(new Date(c.at).toLocaleString('en-GB'))}</span>
                </div>
                <div class="u-fs-2xs u-dim">DISCARDED VERSION</div>
                <pre class="u-m-0 u-fs-xs" style="white-space:pre-wrap; max-height:160px; overflow:auto;">${fmt(c.discarded)}</pre>
            </div>`).join('')
        : '<div class="empty-state">[ NO CONFLICTS ]</div>';

    const root = document.getElementById('modals-root');
    if (!root) return;
    const wrap = document.createElement('div');
    wrap.className = 'modal-overlay';
    wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:var(--z-modal); padding:var(--space-4);';
    wrap.innerHTML = `
        <div class="modal-content u-flex u-col u-gap-3" style="background:var(--bg-sec); border:1px solid var(--border-bright); width:min(640px,100%); max-height:85vh; padding:var(--space-4);">
            <div class="u-flex u-jc-between u-ai-center">
                <span class="section-label">Sync conflicts</span>
                <button type="button" class="icon-btn" data-close>×</button>
            </div>
            <div class="u-fs-xs u-dim" style="line-height:var(--line-normal);">
                When the same thing was changed differently on two devices, Cortex keeps the newest version.
                The discarded one is here in case you need it back.
            </div>
            <div class="u-flex u-col u-gap-2" style="overflow:auto;">${rows}</div>
            ${list.length ? '<button type="button" class="btn btn-sm" data-clear>[CLEAR LIST]</button>' : ''}
        </div>`;
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove();
        if (e.target.closest('[data-clear]')) {
            cortexStore.setItem(SYNC_CONFLICTS_KEY, '[]');
            updateCloudSyncSettingsUI();
            wrap.remove();
        }
    });
    root.appendChild(wrap);
}

// ============================================================================
// COMUNICAZIONE CON GITHUB GIST
// ============================================================================

function gistHeaders(extra = {}) {
    return Object.assign({
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${cloudGithubToken}`
    }, extra);
}

async function parseGistPayload(gistData) {
    const fileObj = gistData.files && (gistData.files[GIST_FILENAME] || Object.values(gistData.files)[0]);
    if (!fileObj) throw new Error(`File "${GIST_FILENAME}" not found in the Gist`);
    let rawContent = fileObj.content;
    if (fileObj.truncated && fileObj.raw_url) {
        const rawRes = await fetch(fileObj.raw_url, { headers: { 'Authorization': `Bearer ${cloudGithubToken}` }, cache: 'no-store' });
        rawContent = await rawRes.text();
    }
    if (!rawContent || !rawContent.trim()) return { version: SYNC_PAYLOAD_VERSION, updatedAt: 0, data: {} };
    return JSON.parse(rawContent);
}

async function gistRequest(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP ${res.status}`);
    }
    return res.json();
}

// Restituisce il contenuto del cloud + l'identificativo della versione (per accorgersi di scritture concorrenti)
async function fetchRemoteGistPayload() {
    const gistData = await gistRequest(`https://api.github.com/gists/${encodeURIComponent(cloudGistId)}?t=${Date.now()}`, {
        method: 'GET', headers: gistHeaders(), cache: 'no-store'
    });
    const payload = await parseGistPayload(gistData);
    Object.defineProperty(payload, '__gistVersion', {
        value: (gistData.history && gistData.history[0] && gistData.history[0].version) || null,
        enumerable: false
    });
    return payload;
}

async function fetchGistPayloadAtVersion(versionSha) {
    const gistData = await gistRequest(`https://api.github.com/gists/${encodeURIComponent(cloudGistId)}/${encodeURIComponent(versionSha)}`, {
        method: 'GET', headers: gistHeaders(), cache: 'no-store'
    });
    return parseGistPayload(gistData);
}

// Carica nel cloud. Restituisce le versioni scritte da ALTRI dispositivi tra la nostra lettura
// e la nostra scrittura (normalmente nessuna).
async function uploadPayloadToGist(payload, versionWeRead = null) {
    const body = JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(payload) } } });
    const gistData = await gistRequest(`https://api.github.com/gists/${encodeURIComponent(cloudGistId)}`, {
        method: 'PATCH',
        headers: gistHeaders({ 'Content-Type': 'application/json' }),
        body,
        keepalive: body.length < 60000 // permette l'invio anche se l'app si sta chiudendo
    });
    const history = (gistData && gistData.history) || [];
    if (!versionWeRead || history.length < 2) return [];
    const missed = [];
    for (let i = 1; i < history.length; i++) {
        if (history[i].version === versionWeRead) return missed;
        missed.push(history[i].version);
    }
    return []; // versione letta non trovata nella cronologia recente: non possiamo dire nulla
}

async function createNewSecretGistForCortex() {
    const tokInp = document.getElementById('cloud-gist-token-inp');
    if (tokInp && tokInp.value.trim()) {
        cloudGithubToken = tokInp.value.trim();
        cortexStore.setItem('cortex_gist_token', cloudGithubToken);
    }

    if (!cloudGithubToken) {
        if (typeof showToast === 'function') showToast('[SYNC] Paste your GitHub token first');
        return false;
    }

    setCloudSyncHeaderIndicator('syncing', 'Creating the secret Gist…');
    const nowTs = Date.now();
    const payload = buildFullCortexCloudPayload(nowTs);

    try {
        const res = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${cloudGithubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: 'Cortex — private sync state',
                public: false,
                files: { [GIST_FILENAME]: { content: JSON.stringify(payload) } }
            })
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        cloudGistId = data.id;
        lastCloudSyncedUpdatedAt = nowTs;
        lastSyncOkMs = Date.now();
        localSyncedSeq = localChangeSeq;
        saveSyncBase(payload.data);

        cortexStore.setItem('cortex_gist_id', cloudGistId);
        cortexStore.setItem('cortex_last_cloud_ts', String(nowTs));

        const idInp = document.getElementById('cloud-gist-id-inp');
        if (idInp) idInp.value = cloudGistId;

        setCloudSyncHeaderIndicator('ok');
        updateCloudSyncSettingsUI();
        if (typeof showToast === 'function') showToast(`[☁ GIST CREATED] ID: ${cloudGistId}`);
        return true;
    } catch (err) {
        setCloudSyncHeaderIndicator('error', err.message);
        if (typeof showToast === 'function') showToast(`[GIST ERROR] ${err.message}`);
        return false;
    }
}

// ============================================================================
// IL CUORE: SINCRONIZZAZIONE CON UNIONE A TRE VIE
// ============================================================================

async function syncNow(isManual = false) {
    if (!isCloudSyncConfigured()) {
        if (isManual && typeof openAccountPanel === 'function') openAccountPanel();
        return false;
    }
    if (!navigator.onLine) {
        setCloudSyncHeaderIndicator('offline');
        updateCloudSyncSettingsUI();
        if (isManual && typeof showToast === 'function') showToast("[☁ SYNC] You're offline: changes stay saved on this device.");
        return false;
    }
    if (isCloudSyncInProgress) {
        syncRequestedAgain = true;
        return false;
    }
    if (typeof CortexMerge === 'undefined') {
        console.error('[SYNC] motore di unione non caricato');
        return false;
    }

    isCloudSyncInProgress = true;
    lastSyncAttemptMs = Date.now();
    if (syncDebounceTimer) { clearTimeout(syncDebounceTimer); syncDebounceTimer = null; }
    setCloudSyncHeaderIndicator('syncing');
    updateCloudSyncSettingsUI();

    try {
        const remotePayload = await fetchRemote();
        const remoteData = (remotePayload && remotePayload.data) || {};
        const remoteTs = parseInt(remotePayload && remotePayload.updatedAt, 10) || 0;

        // Da qui in poi tutto è sincrono fino all'upload: nessuna modifica locale può infilarsi
        const seqAtMerge = localChangeSeq;
        const local = buildLocalSyncState();
        const base = loadSyncBase();
        const localWins = hasLocalChangesPending() && localDirtySinceMs > remoteTs;

        const { merged, conflicts } = CortexMerge.mergeStates(base, local, remoteData, { localWins });

        const changedHere = !CortexMerge.same(merged, local);
        const changedRemote = !CortexMerge.same(merged, remoteData);

        if (changedHere) {
            applyFullCortexCloudPayload({ data: merged });
            if (!isManual && typeof showToast === 'function' && base) {
                showToast('[☁ SYNC] Updated with changes from your other device');
            }
        }

        let newTs = remoteTs;
        let finalState = merged;
        if (changedRemote) {
            let versionRead = remotePayload.__version;
            let written = false;
            // Al massimo 4 tentativi se un altro dispositivo scrive nello stesso istante
            for (let attempt = 0; attempt < 4; attempt++) {
                newTs = Math.max(Date.now(), remoteTs + 1);
                const others = await uploadRemote({ version: SYNC_PAYLOAD_VERSION, updatedAt: newTs, data: finalState }, versionRead);
                if (!others.length) { written = true; break; }
                // Un altro dispositivo ha scritto tra la nostra lettura e la nostra scrittura:
                // unisco quello che ha scritto, così nessuna modifica va persa, e riprovo.
                console.warn('[SYNC] scrittura concorrente rilevata, unisco e riprovo');
                const before = finalState;
                const mergeIn = (otherData) => {
                    const again = CortexMerge.mergeStates(base, finalState, otherData || {}, { localWins });
                    conflicts.push(...again.conflicts);
                    finalState = again.merged;
                };
                others.forEach(mergeIn);
                // Riparto dalla versione attuale del cloud
                const fresh = await fetchRemote();
                mergeIn(fresh.data);
                versionRead = fresh.__version;
                if (!CortexMerge.same(before, finalState)) applyFullCortexCloudPayload({ data: finalState });
            }
            if (!written) throw new Error('Another device keeps writing at the same time. Will retry shortly.');
        }

        saveSyncBase(finalState);
        lastCloudSyncedUpdatedAt = newTs;
        cortexStore.setItem('cortex_last_cloud_ts', String(newTs));
        localSyncedSeq = seqAtMerge;              // le modifiche fatte durante l'upload restano "in attesa"
        if (!hasLocalChangesPending()) {
            localDirtySinceMs = 0;
            cortexStore.removeItem(SYNC_DIRTY_KEY);
        }
        lastSyncOkMs = Date.now();

        recordSyncConflicts(conflicts, localWins ? 'this device' : 'other device');

        isCloudSyncInProgress = false;
        setCloudSyncHeaderIndicator(hasLocalChangesPending() ? 'queued' : 'ok');
        updateCloudSyncSettingsUI();
        if (isManual && typeof showToast === 'function') showToast('[☁ SYNC] Everything is in sync');
    } catch (err) {
        isCloudSyncInProgress = false;
        console.error('[SYNC] errore', err);
        setCloudSyncHeaderIndicator(navigator.onLine ? 'error' : 'offline', `Error: ${err.message}`);
        updateCloudSyncSettingsUI();
        if (isManual && typeof showToast === 'function') showToast(`[☁ SYNC ERROR] ${err.message}`);
        return false;
    }

    if (syncRequestedAgain || hasLocalChangesPending()) {
        syncRequestedAgain = false;
        scheduleSyncSoon(SYNC_CHANGE_DEBOUNCE_MS);
    }
    return true;
}

function scheduleSyncSoon(delayMs = SYNC_CHANGE_DEBOUNCE_MS) {
    if (!isCloudSyncConfigured()) return;
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
        syncDebounceTimer = null;
        syncNow(false);
    }, delayMs);
}

// Chiamata a ogni salvataggio locale
function markLocalChangeForCloud() {
    if (isApplyingCloudPull) return;
    localChangeSeq++;
    if (!localDirtySinceMs) {
        localDirtySinceMs = Date.now();
        // Ricordato anche se l'app viene chiusa offline
        cortexStore.setItem(SYNC_DIRTY_KEY, String(localDirtySinceMs));
    }
    if (!isCloudSyncConfigured()) return;
    if (!navigator.onLine) { setCloudSyncHeaderIndicator('offline'); return; }
    if (!isCloudSyncInProgress) setCloudSyncHeaderIndicator('queued');
    scheduleSyncSoon(SYNC_CHANGE_DEBOUNCE_MS);
}

// Nomi della versione precedente, usati da altri moduli e dalle impostazioni
function checkAndQueueLocalChangeForCloud() { markLocalChangeForCloud(); }
function scheduleDebouncedCloudPush() { markLocalChangeForCloud(); }
function pushStateToCloudGist(isManual = false) { return syncNow(isManual); }
function pullStateFromCloudGist(_force = false, isManual = false) { return syncNow(isManual); }
function triggerManualCloudSync() {
    if (typeof openAccountPanel === 'function') return openAccountPanel();
    return syncNow(true);
}

// ============================================================================
// IMPOSTAZIONI
// ============================================================================

function saveCloudSyncCredentialsFromUI() {
    const tokInp = document.getElementById('cloud-gist-token-inp');
    const idInp = document.getElementById('cloud-gist-id-inp');
    const prevGist = cloudGistId;
    if (tokInp) cloudGithubToken = tokInp.value.trim();
    if (idInp) cloudGistId = idInp.value.trim();

    cortexStore.setItem('cortex_gist_token', cloudGithubToken);
    cortexStore.setItem('cortex_gist_id', cloudGistId);

    // Gist diverso = storia diversa: la vecchia base non vale più (unione senza cancellazioni)
    if (prevGist && prevGist !== cloudGistId) cortexStore.removeItem(SYNC_BASE_KEY);

    updateCloudSyncSettingsUI();
    if (isCloudSyncConfigured()) syncNow(true);
    else setCloudSyncHeaderIndicator('idle');
}

function copyMagicMobileSetupUrl() {
    saveCloudSyncCredentialsFromUI();
    if (!isCloudSyncConfigured()) {
        if (typeof showToast === 'function') showToast('[SYNC] Set up the token and Gist ID first');
        return;
    }
    const baseUrl = window.location.protocol.startsWith('http') && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('tauri')
        ? `${window.location.origin}${window.location.pathname}`
        : 'https://donatomartinelli.github.io/HabitTracker/';

    const magicUrl = `${baseUrl}#cortex_sync=${encodeURIComponent(cloudGithubToken + ':' + cloudGistId)}`;
    navigator.clipboard.writeText(magicUrl);
    if (typeof showToast === 'function') {
        showToast("[🔗 LINK COPIED] Open it once on your phone to link it. It contains your key, so don't share it.");
    }
}

function updateCloudSyncSettingsUI() {
    const tokInp = document.getElementById('cloud-gist-token-inp');
    const idInp = document.getElementById('cloud-gist-id-inp');
    const statusLbl = document.getElementById('cloud-sync-settings-status');
    const conflictsBtn = document.getElementById('cloud-sync-conflicts-btn');

    if (tokInp && tokInp !== document.activeElement) tokInp.value = cloudGithubToken;
    if (idInp && idInp !== document.activeElement) idInp.value = cloudGistId;

    if (conflictsBtn) {
        const n = getSyncConflicts().length;
        conflictsBtn.textContent = `[SAVED CONFLICTS: ${n}]`;
        conflictsBtn.style.color = n ? 'var(--accent-gold)' : '';
    }

    if (statusLbl) {
        if (!isCloudSyncConfigured()) {
            statusLbl.textContent = '[NOT SET UP]';
            statusLbl.style.color = 'var(--text-dim)';
        } else if (!navigator.onLine) {
            statusLbl.textContent = '[OFFLINE // SAVED HERE]';
            statusLbl.style.color = 'var(--accent-gold)';
        } else if (isCloudSyncInProgress) {
            statusLbl.textContent = '[SYNCING…]';
            statusLbl.style.color = 'var(--accent-gold)';
        } else if (hasLocalChangesPending()) {
            statusLbl.textContent = '[CHANGES WAITING]';
            statusLbl.style.color = 'var(--accent-gold)';
        } else if (cloudSyncStatus === 'error') {
            statusLbl.textContent = '[ERROR — TRY AGAIN]';
            statusLbl.style.color = 'var(--accent-red)';
        } else {
            statusLbl.textContent = `[CONNECTED // LAST SYNC: ${formatAgo(lastSyncOkMs).toUpperCase()}]`;
            statusLbl.style.color = 'var(--accent-green)';
        }
    }
}

// ============================================================================
// AVVIO E TRIGGER AUTOMATICI
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    registerAndRefreshServiceWorker();
    const linkedFromHash = checkUrlHashForMagicSyncSetup();

    // Ogni funzione di salvataggio segnala la modifica alla sincronizzazione
    ['saveData', 'saveMoneyData', 'saveHealthData', 'saveUniData', 'saveWorkspaceState', 'saveCustomAliases'].forEach(fnName => {
        const origFn = window[fnName];
        if (typeof origFn === 'function' && !origFn.__cortexSyncWrapped) {
            const wrapped = function (...args) {
                const res = origFn.apply(this, args);
                markLocalChangeForCloud();
                return res;
            };
            wrapped.__cortexSyncWrapped = true;
            window[fnName] = wrapped;
        }
    });

    // Prima della nuova versione non esisteva la "base": se c'è un'impronta salvata
    // la ignoriamo e la prima sync farà un'unione senza cancellazioni (nessuna perdita).
    refreshSyncIndicatorFromState();
    updateCloudSyncSettingsUI();

    if (isCloudSyncConfigured()) {
        setTimeout(() => syncNow(linkedFromHash), 600);
    }

    // Controllo periodico (solo se l'app è visibile)
    setInterval(() => {
        if (document.visibilityState !== 'visible' || !isCloudSyncConfigured() || !navigator.onLine) return;
        if (Date.now() - lastSyncAttemptMs < SYNC_POLL_MS - 1000) return;
        syncNow(false);
    }, SYNC_POLL_MS);

    // Aggiorna i "x min fa" dell'indicatore
    setInterval(() => { if (cloudSyncStatus === 'ok') setCloudSyncHeaderIndicator('ok'); }, 30000);

    const syncOnReturn = () => {
        if (!isCloudSyncConfigured() || !navigator.onLine) return;
        if (Date.now() - lastSyncAttemptMs < SYNC_FOCUS_THROTTLE_MS) return;
        syncNow(false);
    };

    window.addEventListener('online', () => { if (isCloudSyncConfigured()) syncNow(false); });
    window.addEventListener('offline', () => {
        if (!isCloudSyncConfigured()) return;
        setCloudSyncHeaderIndicator('offline');
        updateCloudSyncSettingsUI();
    });
    window.addEventListener('focus', syncOnReturn);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            syncOnReturn();
        } else if (hasLocalChangesPending() && isCloudSyncConfigured() && navigator.onLine) {
            // L'app viene nascosta/chiusa: invia subito le modifiche in sospeso
            syncNow(false);
        }
    });
});

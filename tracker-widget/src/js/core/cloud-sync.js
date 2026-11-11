// --- js/core/cloud-sync.js ---
// Sincronizzazione Bidirezionale Real-Time + Coda Offline Persistente (PC <-> Tablet <-> Telefono)

const GIST_FILENAME = 'cortex_cloud_state.json';

let cloudGithubToken = (localStorage.getItem('cortex_gist_token') || '').trim();
let cloudGistId = (localStorage.getItem('cortex_gist_id') || '').trim();
let lastCloudSyncedUpdatedAt = parseInt(localStorage.getItem('cortex_last_cloud_ts') || '0', 10) || 0;
let localPendingChangesTs = parseInt(localStorage.getItem('cortex_pending_push_ts') || '0', 10) || 0;

let isCloudSyncInProgress = false;
let isApplyingCloudPull = false;
let cloudPushDebounceTimer = null;
let cloudSyncStatus = 'idle'; // 'idle' | 'syncing' | 'ok' | 'queued' | 'offline' | 'error'

function setLocalPendingChangesTs(tsVal) {
    localPendingChangesTs = tsVal || 0;
    if (localPendingChangesTs > 0) {
        localStorage.setItem('cortex_pending_push_ts', String(localPendingChangesTs));
    } else {
        localStorage.removeItem('cortex_pending_push_ts');
    }
}

// Registrazione Service Worker per avvio Offline su iPhone / Android / Tablet
function registerOfflineServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('[SW] Service Worker registration skipped:', err);
        });
    }
}

// 1. Auto-configurazione istantanea tramite Magic Link (#cortex_sync=TOKEN:GIST_ID)
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
        localStorage.setItem('cortex_gist_token', cloudGithubToken);
        localStorage.setItem('cortex_gist_id', cloudGistId);

        history.replaceState(null, document.title, window.location.pathname + window.location.search);

        if (typeof showToast === 'function') {
            showToast('[☁ CLOUD SYNC] Device linked! Pulling data...');
        }
        return true;
    }
    return false;
}

function isCloudSyncConfigured() {
    return Boolean(cloudGithubToken && cloudGistId);
}

function setCloudSyncHeaderIndicator(state, tooltipMsg = '') {
    cloudSyncStatus = state;
    const btn = document.getElementById('btn-cloud-sync-hdr');
    if (!btn) return;

    if (!isCloudSyncConfigured()) {
        btn.textContent = '[☁]';
        btn.style.color = 'var(--text-dim)';
        btn.title = 'Cloud Sync not configured (Click to open Settings)';
        return;
    }

    const map = {
        'idle': { text: '[☁]', color: 'var(--text-dim)' },
        'syncing': { text: '[☁ ⇅]', color: 'var(--accent-gold)' },
        'queued': { text: '[☁ ⏳]', color: 'var(--accent-gold)' },
        'offline': { text: '[☁ OFF]', color: 'var(--text-muted)' },
        'ok': { text: '[☁ ✓]', color: 'var(--accent-green)' },
        'error': { text: '[☁ !]', color: 'var(--accent-red)' }
    };
    const cfg = map[state] || map['idle'];
    btn.textContent = cfg.text;
    btn.style.color = cfg.color;
    btn.title = tooltipMsg || `Cloud Sync (${state.toUpperCase()})`;
}

function buildFullCortexCloudPayload(timestampMs) {
    return {
        version: 2,
        updatedAt: timestampMs,
        data: {
            templates: typeof templates !== 'undefined' ? templates : [],
            logs: typeof logs !== 'undefined' ? logs : {},
            specificEvents: typeof specificEvents !== 'undefined' ? specificEvents : [],
            noteCategories: typeof noteCategories !== 'undefined' ? noteCategories : ['General', 'Registrazioni'],
            notesContent: typeof notesContent !== 'undefined' ? notesContent : {},
            categoryOrder: typeof categoryOrder !== 'undefined' ? categoryOrder : [],
            referenceLayers: typeof referenceLayers !== 'undefined' ? referenceLayers : [],
            refToggles: typeof refToggles !== 'undefined' ? refToggles : {},
            ephemeralData: typeof ephemeralData !== 'undefined' ? ephemeralData : {},
            generalTodos: typeof generalTodos !== 'undefined' ? generalTodos : [],
            plannerExceptions: typeof plannerExceptions !== 'undefined' ? plannerExceptions : {},
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
            workspacePresets: typeof workspacePresets !== 'undefined' ? workspacePresets : [],
            customAliases: typeof customAliases !== 'undefined' ? customAliases : {},
            macroDefaultTrees: typeof macroDefaultTrees !== 'undefined' ? macroDefaultTrees : {}
        }
    };
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
        if (Array.isArray(d.categoryOrder)) categoryOrder = d.categoryOrder;
        if (Array.isArray(d.referenceLayers)) referenceLayers = d.referenceLayers;
        if (d.refToggles && typeof d.refToggles === 'object') refToggles = d.refToggles;
        if (d.ephemeralData && typeof d.ephemeralData === 'object') ephemeralData = d.ephemeralData;
        if (Array.isArray(d.generalTodos)) generalTodos = d.generalTodos;
        if (d.plannerExceptions && typeof d.plannerExceptions === 'object') plannerExceptions = d.plannerExceptions;
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
        if (Array.isArray(d.workspacePresets)) workspacePresets = d.workspacePresets;
        if (d.customAliases && typeof d.customAliases === 'object') customAliases = d.customAliases;
        if (d.macroDefaultTrees && typeof d.macroDefaultTrees === 'object') {
            macroDefaultTrees = d.macroDefaultTrees;
            localStorage.setItem('tracker_macro_default_trees', JSON.stringify(macroDefaultTrees));
        }

        saveData();
        saveMoneyData();
        saveHealthData();
        saveUniData();
        saveWorkspaceState();
        if (typeof saveCustomAliases === 'function') saveCustomAliases();

        if (payloadObj.updatedAt) {
            lastCloudSyncedUpdatedAt = payloadObj.updatedAt;
            localStorage.setItem('cortex_last_cloud_ts', String(lastCloudSyncedUpdatedAt));
        }
        setLocalPendingChangesTs(0);

        if (typeof refreshActivePanesInPlace === 'function') {
            refreshActivePanesInPlace();
        } else if (typeof renderQuadrantLayout === 'function') {
            renderQuadrantLayout();
        }
        if (typeof syncMobileModeUI === 'function') syncMobileModeUI();
        if (typeof updateWorkspaceDropdownUI === 'function') updateWorkspaceDropdownUI();
    } catch (err) {
        console.error('[CLOUD APPLY ERROR]', err);
        isApplyingCloudPull = false;
        return false;
    }
    isApplyingCloudPull = false;
    return true;
}

// ============================================================================
// OPERAZIONI API GITHUB GIST: CREATE, PUSH (CON CODA OFFLINE), PULL
// ============================================================================

async function createNewSecretGistForCortex() {
    const tokInp = document.getElementById('cloud-gist-token-inp');
    if (tokInp && tokInp.value.trim()) {
        cloudGithubToken = tokInp.value.trim();
        localStorage.setItem('cortex_gist_token', cloudGithubToken);
    }

    if (!cloudGithubToken) {
        if (typeof showToast === 'function') showToast('[CLOUD ERROR] Paste your GitHub Token first!');
        return false;
    }

    setCloudSyncHeaderIndicator('syncing', 'Creating new Secret Gist...');
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
                description: 'Cortex Personal OS — Encrypted/Private Sync State',
                public: false,
                files: {
                    [GIST_FILENAME]: {
                        content: JSON.stringify(payload)
                    }
                }
            })
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        cloudGistId = data.id;
        lastCloudSyncedUpdatedAt = nowTs;
        setLocalPendingChangesTs(0);
        localStorage.setItem('cortex_gist_id', cloudGistId);
        localStorage.setItem('cortex_last_cloud_ts', String(nowTs));

        const idInp = document.getElementById('cloud-gist-id-inp');
        if (idInp) idInp.value = cloudGistId;

        setCloudSyncHeaderIndicator('ok', `Synced (Gist: ${cloudGistId.slice(0, 8)}...)`);
        updateCloudSyncSettingsUI();
        if (typeof showToast === 'function') {
            showToast(`[☁ GIST CREATED] ID: ${cloudGistId}`);
        }
        return true;
    } catch (err) {
        setCloudSyncHeaderIndicator('error', err.message);
        if (typeof showToast === 'function') showToast(`[GIST ERROR] ${err.message}`);
        return false;
    }
}

async function pushStateToCloudGist(isManual = false) {
    if (!isCloudSyncConfigured()) {
        if (isManual && typeof openSettingsModal === 'function') openSettingsModal('tab-system');
        return false;
    }

    // Se il dispositivo è senza rete, mantiene le modifiche nella coda locale pronta per quando torna internet
    if (!navigator.onLine) {
        if (!localPendingChangesTs) setLocalPendingChangesTs(Date.now());
        setCloudSyncHeaderIndicator('queued', 'Offline — Changes saved locally & queued for upload');
        updateCloudSyncSettingsUI();
        if (isManual && typeof showToast === 'function') {
            showToast('[☁ OFFLINE] Saved on device — Will auto-upload when back online!');
        }
        return false;
    }

    if (isCloudSyncInProgress) return false;

    isCloudSyncInProgress = true;
    setCloudSyncHeaderIndicator('syncing', 'Uploading changes to GitHub Gist...');

    const nowTs = localPendingChangesTs || Date.now();
    const payload = buildFullCortexCloudPayload(nowTs);

    try {
        const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(cloudGistId)}`, {
            method: 'PATCH',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${cloudGithubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    [GIST_FILENAME]: {
                        content: JSON.stringify(payload)
                    }
                }
            })
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.message || `HTTP ${res.status}`);
        }

        lastCloudSyncedUpdatedAt = nowTs;
        setLocalPendingChangesTs(0);
        localStorage.setItem('cortex_last_cloud_ts', String(nowTs));

        isCloudSyncInProgress = false;
        const timeStr = new Date(nowTs).toLocaleTimeString('en-US', { hour12: false });
        setCloudSyncHeaderIndicator('ok', `Last pushed at ${timeStr}`);
        updateCloudSyncSettingsUI();

        if (isManual && typeof showToast === 'function') {
            showToast(`[☁ PUSH OK] State uploaded to Gist (${timeStr})`);
        }
        return true;
    } catch (err) {
        isCloudSyncInProgress = false;
        // Se la rete cade durante il push, lascia il timestamp in coda per riprovare automaticamente
        if (!localPendingChangesTs) setLocalPendingChangesTs(nowTs);
        setCloudSyncHeaderIndicator('queued', `Queued for retry (${err.message})`);
        updateCloudSyncSettingsUI();
        if (isManual && typeof showToast === 'function') {
            showToast(`[☁ QUEUED] Network unreachable — Changes queued locally`);
        }
        return false;
    }
}

async function pullStateFromCloudGist(forceOverwrite = false, isManual = false) {
    if (!isCloudSyncConfigured()) {
        if (isManual && typeof openSettingsModal === 'function') openSettingsModal('tab-system');
        return false;
    }

    if (!navigator.onLine) {
        setCloudSyncHeaderIndicator(
            localPendingChangesTs > 0 ? 'queued' : 'offline',
            'Device is offline — Running on local cached state'
        );
        updateCloudSyncSettingsUI();
        if (isManual && typeof showToast === 'function') {
            showToast('[☁ OFFLINE] Working offline on local data');
        }
        return false;
    }

    if (isCloudSyncInProgress) return false;

    // Se hai fatto modifiche offline su questo dispositivo, inviale al Gist PRIMA di fare qualsiasi pull!
    if (!forceOverwrite && localPendingChangesTs > 0) {
        return pushStateToCloudGist(isManual);
    }

    isCloudSyncInProgress = true;
    setCloudSyncHeaderIndicator('syncing', 'Checking cloud for updates...');

    try {
        const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(cloudGistId)}?t=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${cloudGithubToken}`
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.message || `HTTP ${res.status}`);
        }

        const gistData = await res.json();
        const fileObj = gistData.files && (gistData.files[GIST_FILENAME] || Object.values(gistData.files)[0]);
        if (!fileObj) {
            throw new Error(`File "${GIST_FILENAME}" not found in Gist`);
        }

        let rawContent = fileObj.content;
        if (fileObj.truncated && fileObj.raw_url) {
            const rawRes = await fetch(fileObj.raw_url, {
                headers: { 'Authorization': `Bearer ${cloudGithubToken}` },
                cache: 'no-store'
            });
            rawContent = await rawRes.text();
        }

        const remotePayload = JSON.parse(rawContent);
        const remoteTs = parseInt(remotePayload.updatedAt || '0', 10) || 0;

        if (forceOverwrite || remoteTs > lastCloudSyncedUpdatedAt) {
            applyFullCortexCloudPayload(remotePayload);
            const timeStr = new Date(remoteTs || Date.now()).toLocaleTimeString('en-US', { hour12: false });
            setCloudSyncHeaderIndicator('ok', `Pulled update (${timeStr})`);
            if (isManual && typeof showToast === 'function') {
                showToast(`[☁ PULL OK] Workspace updated from Cloud!`);
            }
        } else {
            setCloudSyncHeaderIndicator('ok', 'Up to date');
            if (isManual && typeof showToast === 'function') {
                showToast('[☁ CLOUD SYNC] Already up to date');
            }
        }

        isCloudSyncInProgress = false;
        updateCloudSyncSettingsUI();
        return true;
    } catch (err) {
        isCloudSyncInProgress = false;
        setCloudSyncHeaderIndicator(navigator.onLine ? 'error' : 'offline', `Pull failed: ${err.message}`);
        if (isManual && typeof showToast === 'function') {
            showToast(`[CLOUD PULL ERROR] ${err.message}`);
        }
        return false;
    }
}

function scheduleDebouncedCloudPush() {
    if (!isStorageHydrated || isApplyingCloudPull || isApplyingUndoRedo) return;
    if (!isCloudSyncConfigured()) return;

    setLocalPendingChangesTs(Date.now());

    if (!navigator.onLine) {
        setCloudSyncHeaderIndicator('queued', 'Offline — Changes saved locally & queued');
        updateCloudSyncSettingsUI();
        return;
    }

    setCloudSyncHeaderIndicator('syncing', 'Changes queued for sync...');

    clearTimeout(cloudPushDebounceTimer);
    cloudPushDebounceTimer = setTimeout(() => {
        pushStateToCloudGist(false);
    }, 1500);
}

function triggerManualCloudSync() {
    if (!isCloudSyncConfigured()) {
        if (typeof openSettingsModal === 'function') openSettingsModal('tab-system');
        return;
    }
    if (localPendingChangesTs > 0) {
        pushStateToCloudGist(true);
    } else {
        pullStateFromCloudGist(false, true);
    }
}

// ============================================================================
// UI PANNELLO SETTINGS & MAGIC LINK PER TELEFONO/TABLET
// ============================================================================

function saveCloudSyncCredentialsFromUI() {
    const tokInp = document.getElementById('cloud-gist-token-inp');
    const idInp = document.getElementById('cloud-gist-id-inp');
    if (tokInp) cloudGithubToken = tokInp.value.trim();
    if (idInp) cloudGistId = idInp.value.trim();

    localStorage.setItem('cortex_gist_token', cloudGithubToken);
    localStorage.setItem('cortex_gist_id', cloudGistId);

    updateCloudSyncSettingsUI();
    if (isCloudSyncConfigured()) {
        pullStateFromCloudGist(false, true);
    } else {
        setCloudSyncHeaderIndicator('idle');
    }
}

function copyMagicMobileSetupUrl() {
    saveCloudSyncCredentialsFromUI();
    if (!isCloudSyncConfigured()) {
        if (typeof showToast === 'function') showToast('[ERROR] Configure Token & Gist ID first!');
        return;
    }
    const baseUrl = window.location.protocol.startsWith('http') && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('tauri')
        ? `${window.location.origin}${window.location.pathname}`
        : 'https://donatomartinelli.github.io/HabitTracker/';

    const magicUrl = `${baseUrl}#cortex_sync=${encodeURIComponent(cloudGithubToken + ':' + cloudGistId)}`;
    navigator.clipboard.writeText(magicUrl);
    if (typeof showToast === 'function') {
        showToast('[🔗 MAGIC URL COPIED] Open this link once on Phone/Tablet to auto-connect!');
    }
}

function updateCloudSyncSettingsUI() {
    const tokInp = document.getElementById('cloud-gist-token-inp');
    const idInp = document.getElementById('cloud-gist-id-inp');
    const statusLbl = document.getElementById('cloud-sync-settings-status');

    if (tokInp && tokInp !== document.activeElement) tokInp.value = cloudGithubToken;
    if (idInp && idInp !== document.activeElement) idInp.value = cloudGistId;

    if (statusLbl) {
        if (!isCloudSyncConfigured()) {
            statusLbl.textContent = '[NOT CONFIGURED]';
            statusLbl.style.color = 'var(--text-dim)';
        } else if (!navigator.onLine) {
            statusLbl.textContent = localPendingChangesTs > 0
                ? '[OFFLINE // CHANGES QUEUED FOR UPLOAD]'
                : '[OFFLINE // USING LOCAL CACHE]';
            statusLbl.style.color = 'var(--accent-gold)';
        } else if (localPendingChangesTs > 0) {
            statusLbl.textContent = '[PENDING UPLOAD QUEUED...]';
            statusLbl.style.color = 'var(--accent-gold)';
        } else {
            const lastStr = lastCloudSyncedUpdatedAt > 0
                ? new Date(lastCloudSyncedUpdatedAt).toLocaleTimeString('en-US', { hour12: false })
                : 'READY';
            statusLbl.textContent = `[CONNECTED // LAST SYNC: ${lastStr}]`;
            statusLbl.style.color = 'var(--accent-green)';
        }
    }
}

// Avvio, Hook di Salvataggio e Riconnessione Automatica alla Rete
window.addEventListener('DOMContentLoaded', () => {
    registerOfflineServiceWorker();
    const linkedFromHash = checkUrlHashForMagicSyncSetup();

    ['saveData', 'saveMoneyData', 'saveHealthData', 'saveUniData', 'saveWorkspaceState', 'saveCustomAliases'].forEach(fnName => {
        const origFn = window[fnName];
        if (typeof origFn === 'function') {
            window[fnName] = function(...args) {
                const res = origFn.apply(this, args);
                scheduleDebouncedCloudPush();
                return res;
            };
        }
    });

    if (!navigator.onLine) {
        setCloudSyncHeaderIndicator(localPendingChangesTs > 0 ? 'queued' : 'offline');
    } else {
        setCloudSyncHeaderIndicator(isCloudSyncConfigured() ? (localPendingChangesTs > 0 ? 'queued' : 'ok') : 'idle');
    }
    updateCloudSyncSettingsUI();

    // All'avvio: se ci sono modifiche fatte offline in coda le carica subito, altrimenti scarica dal cloud
    setTimeout(() => {
        if (isCloudSyncConfigured() && navigator.onLine) {
            if (localPendingChangesTs > 0 && !linkedFromHash) {
                pushStateToCloudGist(false);
            } else {
                pullStateFromCloudGist(linkedFromHash, linkedFromHash);
            }
        }
    }, 650);

    // Appena torna la connessione (es. esci dalla palestra o togli la modalità aereo), invia subito la coda!
    window.addEventListener('online', () => {
        if (!isCloudSyncConfigured()) return;
        if (localPendingChangesTs > 0) {
            if (typeof showToast === 'function') {
                showToast('[☁ ONLINE] Connection restored — Uploading offline changes...');
            }
            pushStateToCloudGist(true);
        } else {
            pullStateFromCloudGist(false, false);
        }
    });

    window.addEventListener('offline', () => {
        if (!isCloudSyncConfigured()) return;
        setCloudSyncHeaderIndicator(localPendingChangesTs > 0 ? 'queued' : 'offline', 'Working offline');
        updateCloudSyncSettingsUI();
    });

    window.addEventListener('focus', () => {
        if (isCloudSyncConfigured() && navigator.onLine) {
            if (localPendingChangesTs > 0) pushStateToCloudGist(false);
            else pullStateFromCloudGist(false, false);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isCloudSyncConfigured() && navigator.onLine) {
            if (localPendingChangesTs > 0) pushStateToCloudGist(false);
            else pullStateFromCloudGist(false, false);
        }
    });

    setInterval(() => {
        if (document.visibilityState === 'visible' && isCloudSyncConfigured() && navigator.onLine) {
            if (localPendingChangesTs > 0) pushStateToCloudGist(false);
            else pullStateFromCloudGist(false, false);
        }
    }, 30000);
});
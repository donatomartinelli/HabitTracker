// --- js/core/cloud-sync.js ---
// Motore Cloud Sync Peer-to-Peer Simmetrico (PC <-> Tablet <-> Telefono)
// - Nessuna istanza ha priorità: vince sempre l'ultima modifica effettuata su qualsiasi dispositivo
// - Rilevamento automatico basato sull'impronta reale dei dati (Fingerprint)
// - Auto-Push (400ms) con coda garantita + Live Auto-Pull ogni 4 secondi

const GIST_FILENAME = 'cortex_cloud_state.json';

let cloudGithubToken = (localStorage.getItem('cortex_gist_token') || '').trim();
let cloudGistId = (localStorage.getItem('cortex_gist_id') || '').trim();
let lastCloudSyncedUpdatedAt = parseInt(localStorage.getItem('cortex_last_cloud_ts') || '0', 10) || 0;

// Pulisce subito eventuale vecchia coda bloccata dalle versioni precedenti
localStorage.removeItem('cortex_pending_push_ts');

let isBootSyncing = true;
let isCloudSyncInProgress = false;
let isApplyingCloudPull = false;
let hasUnsentLocalEdit = false;
let pendingPushAfterCurrentOp = false;
let localEditTimestampMs = 0;
let cloudPushDebounceTimer = null;
let lastKnownDataFingerprint = '';
let cloudSyncStatus = 'idle';

function registerAndRefreshServiceWorker() {
    if ('caches' in window) {
        caches.keys().then(keys => {
            keys.forEach(k => {
                if (k !== 'cortex-os-cache-v3') caches.delete(k);
            });
        }).catch(() => {});
    }
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
            reg.update().catch(() => {});
        }).catch(() => {});
    }
}

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
            showToast('[☁ CLOUD SYNC] Device linked! Syncing...');
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

// Calcola l'impronta esatta dei dati per sapere con certezza matematica se qualcosa è stato modificato
function getLocalDataFingerprint() {
    try {
        return JSON.stringify(buildFullCortexCloudPayload(0).data);
    } catch (e) {
        return '';
    }
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
            lastCloudSyncedUpdatedAt = Math.max(lastCloudSyncedUpdatedAt, parseInt(payloadObj.updatedAt, 10) || 0);
            localStorage.setItem('cortex_last_cloud_ts', String(lastCloudSyncedUpdatedAt));
        }

        hasUnsentLocalEdit = false;
        localEditTimestampMs = 0;
        lastKnownDataFingerprint = getLocalDataFingerprint();

        if (typeof refreshActivePanesInPlace === 'function') {
            refreshActivePanesInPlace();
        }
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
        if (typeof renderDiet === 'function') renderDiet();
        if (typeof renderGymDashboard === 'function') renderGymDashboard();
        if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
        if (typeof renderUniDashboard === 'function') renderUniDashboard();
        if (typeof renderNoteCategories === 'function') renderNoteCategories();
        if (typeof syncMobileModeUI === 'function') syncMobileModeUI();
        if (typeof updateWorkspaceDropdownUI === 'function') updateWorkspaceDropdownUI();

        if (typeof captureCurrentStateSnapshotString === 'function') {
            lastCapturedSnapshotStr = captureCurrentStateSnapshotString();
        }
    } catch (err) {
        console.error('[CLOUD APPLY ERROR]', err);
        isApplyingCloudPull = false;
        return false;
    }
    isApplyingCloudPull = false;
    return true;
}

async function fetchRemoteGistPayload() {
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

    return JSON.parse(rawContent);
}

// ============================================================================
// OPERAZIONI API: CREATE, PUSH & PULL SIMMETRICO
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
        hasUnsentLocalEdit = false;
        isBootSyncing = false;
        lastKnownDataFingerprint = getLocalDataFingerprint();

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

    if (!navigator.onLine) {
        hasUnsentLocalEdit = true;
        setCloudSyncHeaderIndicator('offline', 'Offline — Will upload when online');
        updateCloudSyncSettingsUI();
        return false;
    }

    // Se è già in corso una chiamata di rete, prenota subito il push appena finisce (non perde mai una modifica!)
    if (isCloudSyncInProgress) {
        pendingPushAfterCurrentOp = true;
        return false;
    }

    isCloudSyncInProgress = true;
    setCloudSyncHeaderIndicator('syncing', 'Uploading to Cloud...');

    const nowTs = Math.max(Date.now(), localEditTimestampMs || 0, lastCloudSyncedUpdatedAt + 1);
    const payload = buildFullCortexCloudPayload(nowTs);
    const pushedFp = JSON.stringify(payload.data);

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
        localStorage.setItem('cortex_last_cloud_ts', String(nowTs));

        // Controlla se l'utente ha fatto altre modifiche mentre il PATCH era in volo
        const currentFpNow = getLocalDataFingerprint();
        if (currentFpNow === pushedFp) {
            hasUnsentLocalEdit = false;
            localEditTimestampMs = 0;
            lastKnownDataFingerprint = pushedFp;
        } else {
            pendingPushAfterCurrentOp = true;
        }

        isCloudSyncInProgress = false;
        const timeStr = new Date(nowTs).toLocaleTimeString('en-US', { hour12: false });
        setCloudSyncHeaderIndicator('ok', `Synced (${timeStr})`);
        updateCloudSyncSettingsUI();

        if (isManual && typeof showToast === 'function') {
            showToast(`[☁ PUSH OK] Uploaded to Cloud (${timeStr})`);
        }

        if (pendingPushAfterCurrentOp) {
            pendingPushAfterCurrentOp = false;
            setTimeout(() => pushStateToCloudGist(false), 150);
        }
        return true;
    } catch (err) {
        isCloudSyncInProgress = false;
        console.error('[GIST PUSH ERROR]', err);
        setCloudSyncHeaderIndicator(navigator.onLine ? 'error' : 'offline', `Push failed: ${err.message}`);
        updateCloudSyncSettingsUI();
        if (isManual && typeof showToast === 'function') {
            showToast(`[CLOUD PUSH ERROR] ${err.message}`);
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
        setCloudSyncHeaderIndicator('offline', 'Offline');
        updateCloudSyncSettingsUI();
        return false;
    }

    // Se questo dispositivo ha una modifica appena fatta dall'utente, inviala prima!
    if (!forceOverwrite && hasUnsentLocalEdit) {
        return pushStateToCloudGist(isManual);
    }

    if (isCloudSyncInProgress) return false;
    isCloudSyncInProgress = true;

    if (isManual || isBootSyncing) {
        setCloudSyncHeaderIndicator('syncing', 'Checking cloud...');
    }

    try {
        const remotePayload = await fetchRemoteGistPayload();
        const remoteTs = parseInt(remotePayload.updatedAt || '0', 10) || 0;

        // Se mentre scaricavamo il Gist l'utente ha toccato qualcosa su questo dispositivo, non sovrascrivere: fai vincere la modifica locale!
        if (!forceOverwrite && hasUnsentLocalEdit) {
            isBootSyncing = false;
            isCloudSyncInProgress = false;
            return pushStateToCloudGist(false);
        }

        const remoteFp = (remotePayload && remotePayload.data) ? JSON.stringify(remotePayload.data) : '';
        const localFp = getLocalDataFingerprint();

        // Se il Cloud ha uno stato più recente (o diverso all'avvio / force pull), aggiorna subito questa istanza!
        if (forceOverwrite || remoteTs > lastCloudSyncedUpdatedAt || (isBootSyncing && remoteFp && remoteFp !== localFp)) {
            if (remoteFp && remoteFp !== localFp) {
                applyFullCortexCloudPayload(remotePayload);
                const timeStr = new Date(remoteTs || Date.now()).toLocaleTimeString('en-US', { hour12: false });
                if (!isBootSyncing && typeof showToast === 'function') {
                    showToast(`[☁ SYNCED] Updated from other device (${timeStr})`);
                }
            } else if (remoteTs > lastCloudSyncedUpdatedAt) {
                lastCloudSyncedUpdatedAt = remoteTs;
                localStorage.setItem('cortex_last_cloud_ts', String(remoteTs));
                lastKnownDataFingerprint = localFp;
            }
        } else {
            lastKnownDataFingerprint = localFp;
        }

        isBootSyncing = false;
        isCloudSyncInProgress = false;
        setCloudSyncHeaderIndicator('ok', 'In sync across devices');
        updateCloudSyncSettingsUI();

        if (isManual && typeof showToast === 'function') {
            showToast('[☁ SYNC OK] Up to date');
        }

        if (pendingPushAfterCurrentOp || hasUnsentLocalEdit) {
            pendingPushAfterCurrentOp = false;
            setTimeout(() => pushStateToCloudGist(false), 100);
        }
        return true;
    } catch (err) {
        isBootSyncing = false;
        isCloudSyncInProgress = false;
        console.error('[GIST PULL ERROR]', err);
        setCloudSyncHeaderIndicator(navigator.onLine ? 'error' : 'offline', `Sync error: ${err.message}`);
        updateCloudSyncSettingsUI();
        if (isManual && typeof showToast === 'function') {
            showToast(`[CLOUD SYNC ERROR] ${err.message}`);
        }
        return false;
    }
}

// Rileva se i dati locali sono effettivamente cambiati e avvia il Push verso gli altri dispositivi
function checkAndQueueLocalChangeForCloud() {
    if (!isStorageHydrated || isBootSyncing || isApplyingCloudPull || isApplyingUndoRedo) return;
    if (!isCloudSyncConfigured()) return;

    const currentFp = getLocalDataFingerprint();
    if (!currentFp || currentFp === lastKnownDataFingerprint) return;

    lastKnownDataFingerprint = currentFp;
    hasUnsentLocalEdit = true;
    localEditTimestampMs = Date.now();

    if (!navigator.onLine) {
        setCloudSyncHeaderIndicator('offline', 'Offline — Changes saved locally');
        updateCloudSyncSettingsUI();
        return;
    }

    setCloudSyncHeaderIndicator('syncing', 'Syncing change...');

    if (cloudPushDebounceTimer) {
        clearTimeout(cloudPushDebounceTimer);
    }
    cloudPushDebounceTimer = setTimeout(() => {
        cloudPushDebounceTimer = null; // Fondamentale: sblocca il timer per i cicli successivi!
        pushStateToCloudGist(false);
    }, 400);
}

function scheduleDebouncedCloudPush() {
    checkAndQueueLocalChangeForCloud();
}

function triggerManualCloudSync() {
    if (!isCloudSyncConfigured()) {
        if (typeof openSettingsModal === 'function') openSettingsModal('tab-system');
        return;
    }
    if (hasUnsentLocalEdit) {
        pushStateToCloudGist(true);
    } else {
        pullStateFromCloudGist(true, true);
    }
}

// ============================================================================
// UI PANNELLO SETTINGS & MAGIC LINK
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
        pullStateFromCloudGist(true, true);
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
            statusLbl.textContent = '[OFFLINE // LOCAL CACHE]';
            statusLbl.style.color = 'var(--accent-gold)';
        } else if (hasUnsentLocalEdit || isCloudSyncInProgress) {
            statusLbl.textContent = '[SYNCING...]';
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

window.addEventListener('DOMContentLoaded', () => {
    registerAndRefreshServiceWorker();
    const linkedFromHash = checkUrlHashForMagicSyncSetup();

    ['saveData', 'saveMoneyData', 'saveHealthData', 'saveUniData', 'saveWorkspaceState', 'saveCustomAliases'].forEach(fnName => {
        const origFn = window[fnName];
        if (typeof origFn === 'function') {
            window[fnName] = function(...args) {
                const res = origFn.apply(this, args);
                checkAndQueueLocalChangeForCloud();
                return res;
            };
        }
    });

    updateCloudSyncSettingsUI();

    // 1. All'apertura: scarica subito lo stato più recente dal Gist e blocca i falsi salvataggi di avvio
    setTimeout(() => {
        lastKnownDataFingerprint = getLocalDataFingerprint();
        if (isCloudSyncConfigured() && navigator.onLine) {
            pullStateFromCloudGist(linkedFromHash, false);
        } else {
            isBootSyncing = false;
            setCloudSyncHeaderIndicator(navigator.onLine ? 'idle' : 'offline');
        }
    }, 250);

    // 2. Sentinella locale (ogni 1s): cattura qualsiasi modifica fatta in qualsiasi modulo anche se non passa da window.saveData
    setInterval(() => {
        if (!isBootSyncing && !isApplyingCloudPull) {
            checkAndQueueLocalChangeForCloud();
        }
    }, 1000);

    // 3. Sentinella Cloud (ogni 4s): mantiene PC, Tablet e Telefono costantemente allineati in tempo reale
    setInterval(() => {
        if (document.visibilityState === 'visible' && isCloudSyncConfigured() && navigator.onLine && !isBootSyncing && !cloudPushDebounceTimer) {
            if (hasUnsentLocalEdit) {
                pushStateToCloudGist(false);
            } else {
                pullStateFromCloudGist(false, false);
            }
        }
    }, 4000);

    window.addEventListener('online', () => {
        if (!isCloudSyncConfigured()) return;
        if (hasUnsentLocalEdit) pushStateToCloudGist(true);
        else pullStateFromCloudGist(false, true);
    });

    window.addEventListener('offline', () => {
        if (!isCloudSyncConfigured()) return;
        setCloudSyncHeaderIndicator('offline', 'Working offline');
        updateCloudSyncSettingsUI();
    });

    window.addEventListener('focus', () => {
        if (isCloudSyncConfigured() && navigator.onLine && !isBootSyncing && !cloudPushDebounceTimer) {
            pullStateFromCloudGist(false, false);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isCloudSyncConfigured() && navigator.onLine && !isBootSyncing) {
            pullStateFromCloudGist(false, false);
        } else if (document.visibilityState === 'hidden' && hasUnsentLocalEdit && navigator.onLine) {
            if (cloudPushDebounceTimer) {
                clearTimeout(cloudPushDebounceTimer);
                cloudPushDebounceTimer = null;
            }
            pushStateToCloudGist(false);
        }
    });
});
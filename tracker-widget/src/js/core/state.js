// --- js/core/state.js ---
// Architettura di Persistenza Scalabile: Tauri Atomic File System / SQLite + IndexedDB (Gigabyte capacity, Async Non-Blocking) + Deep Recovery

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function roundCurrency(val) {
    const num = parseFloat(val) || 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

const DEFAULT_DIET_DATA = [
    { type: 'Spuntino 1', 1: 'MilkPro 200g', 2: 'MilkPro 200g', 3: 'Anacardi 20g', 4: 'MilkPro 200g', 5: 'Anacardi 20g', 6: 'MilkPro 200g', 0: 'Anacardi 20g' },
    { type: 'Pranzo', 1: 'Soncino 100g\nRiso 160g\nVitellone 200g', 2: 'Rucola 100g\nRiso 160g\nTonno 90g', 3: 'Soncino 100g\nRiso 90g\nCeci 120g\nTonno 100g', 4: 'Rucola 100g\nRiso 160g\nVitellone 200g', 5: 'Soncino 100g\nRiso 90g\nCeci 120g\n2 Uova', 6: 'Rucola 100g\nRiso 160g\nTonno 90g', 0: 'Soncino 100g\nPasta\nVitellone 200g' },
    { type: 'Spuntino 2', 1: 'MilkPro 150g\nBanana', 2: 'MilkPro 150g\nBanana', 3: 'Kefir 200g\nBanana', 4: 'MilkPro 150g\nBanana', 5: 'Kefir 200g\nBanana', 6: 'MilkPro 150g\nBanana', 0: 'Kefir 200g\nBanana' },
    { type: 'Cena', 1: 'Spinaci 100g\nMerluzzo 250g\nPane 50g', 2: 'Spinaci 100g\nPollo 200g\nPane 50g', 3: 'Spinaci 100g\nBresaola 100g\nPane 50g', 4: 'Spinaci 100g\nSalmone 100g\nPane 50g', 5: 'Spinaci 100g\nPollo 200g\nPane 50g', 6: '[ PASTO\nLIBERO ]', 0: 'Spinaci 100g\nTonno 70g\nRobiola 30g\nPane 50g' }
];

const DEFAULT_DIET_RULES = "COLAZIONE: 200g Latte + 20g Biscotti + 10g Cioccolato Fondente  |  CONDIMENTO: 15g Olio EVO (Pranzo, Cena)  |  ACQUA: Min 3L / Die";

const DEFAULT_FOOD_DB = [
    { name: "MilkPro", kcal: 51, p: 10.0, c: 2.5, f: 0.1, defaultG: 200 },
    { name: "Anacardi", kcal: 553, p: 18.2, c: 30.2, f: 43.8, defaultG: 20 },
    { name: "Soncino", kcal: 21, p: 2.0, c: 3.6, f: 0.4, defaultG: 100 },
    { name: "Rucola", kcal: 25, p: 2.6, c: 3.7, f: 0.7, defaultG: 100 },
    { name: "Riso", kcal: 358, p: 7.0, c: 79.0, f: 0.6, defaultG: 100 },
    { name: "Pasta", kcal: 353, p: 13.0, c: 71.0, f: 1.5, defaultG: 100 },
    { name: "Vitellone", kcal: 135, p: 21.0, c: 0.0, f: 5.5, defaultG: 200 },
    { name: "Tonno", kcal: 116, p: 25.5, c: 0.0, f: 1.0, defaultG: 90 },
    { name: "Ceci", kcal: 120, p: 7.0, c: 18.0, f: 2.0, defaultG: 120 },
    { name: "Uova", kcal: 143, p: 12.6, c: 0.7, f: 9.5, defaultG: 60 },
    { name: "Kefir", kcal: 45, p: 3.4, c: 4.0, f: 1.5, defaultG: 200 },
    { name: "Banana", kcal: 89, p: 1.1, c: 22.8, f: 0.3, defaultG: 120 },
    { name: "Spinaci", kcal: 23, p: 2.9, c: 3.6, f: 0.4, defaultG: 100 },
    { name: "Merluzzo", kcal: 82, p: 18.0, c: 0.0, f: 0.7, defaultG: 250 },
    { name: "Pollo", kcal: 110, p: 23.0, c: 0.0, f: 1.2, defaultG: 200 },
    { name: "Pane", kcal: 265, p: 8.5, c: 54.0, f: 1.5, defaultG: 50 },
    { name: "Bresaola", kcal: 151, p: 32.0, c: 0.0, f: 2.6, defaultG: 100 },
    { name: "Salmone", kcal: 208, p: 20.0, c: 0.0, f: 13.0, defaultG: 100 },
    { name: "Robiola", kcal: 318, p: 7.5, c: 2.3, f: 31.0, defaultG: 30 },
    { name: "Latte", kcal: 46, p: 3.3, c: 4.9, f: 1.5, defaultG: 200 },
    { name: "Biscotti", kcal: 440, p: 7.5, c: 70.0, f: 14.0, defaultG: 20 },
    { name: "Cioccolato Fondente", kcal: 546, p: 6.0, c: 46.0, f: 35.0, defaultG: 10 },
    { name: "Olio EVO", kcal: 884, p: 0.0, c: 0.0, f: 100.0, defaultG: 15 }
];

const DEFAULT_GYM_PLAN = {
    1: [
        { id: "g1_1", group: "Pettorali", name: "Panca Inclinata 2 Manubri", repStr: "4x5-8", sets: 4, currentReps: 5 },
        { id: "g1_2", group: "Pettorali", name: "Panca Piana Multipower", repStr: "8-8-6", sets: 3 },
        { id: "g1_3", group: "Pettorali", name: "Croci in Piedi Cavi Bassi", repStr: "2x12 + 10 parziali", sets: 3 },
        { id: "g1_4", group: "Spalle", name: "Shoulder Press", repStr: "3x5-8", sets: 3, currentReps: 5 },
        { id: "g1_5", group: "Spalle", name: "Alzate Laterali Deltoid", repStr: "2x12 + 1xmax - 20%", sets: 3 },
        { id: "g1_6", group: "Bicipiti", name: "Curl Bicheps-Machine", repStr: "10-8-8", sets: 3 },
        { id: "g1_7", group: "Bicipiti", name: "Curl Alt. Seduto Panca Incl.", repStr: "2x12 + 1xmax - 20%", sets: 3 },
        { id: "g1_8", group: "Addome", name: "Crunch Machine", repStr: "3xMax", sets: 0 },
        { id: "g1_9", group: "Addome", name: "Plank Busto Scorrimento", repStr: "3xMax", sets: 0 }
    ],
    2: [
        { id: "g2_1", group: "Dorsali", name: "Lat Machine Avanti", repStr: "4x5-8", sets: 4, currentReps: 5 },
        { id: "g2_2", group: "Dorsali", name: "Rematore In Piedi T-Bar", repStr: "8-8-6", sets: 3 },
        { id: "g2_3", group: "Dorsali", name: "Pull Down Cavo Alto", repStr: "2x12 + 1xmax - 20%", sets: 3 },
        { id: "g2_4", group: "Tricipiti", name: "Push Down Sbarra 2 Maniglie", repStr: "10-8-8", sets: 3 },
        { id: "g2_5", group: "Tricipiti", name: "Kick Back Seduto 1 Manubrio", repStr: "2x12 + 1xmax - 20%", sets: 3 },
        { id: "g2_6", group: "Gambe", name: "Leg Press Inclinata", repStr: "3x5-8", sets: 3, currentReps: 5 },
        { id: "g2_7", group: "Gambe", name: "Leg Extension", repStr: "2x12 + 1xmax - 20%", sets: 3 },
        { id: "g2_8", group: "Gambe", name: "Leg Curl", repStr: "12-12-10", sets: 3 },
        { id: "g2_9", group: "Addome", name: "Chiusure A Libro Gambe Tese", repStr: "3xMax", sets: 0 }
    ]
};

const DEFAULT_GYM_ROUTINE = {
    enabled: true,
    timeWindows: [
        { days: [1, 2, 4], start: "19:45", end: "21:15" },
        { days: [6], start: "16:00", end: "17:30" }
    ],
    activeSubModules: ['split'],
    subLayoutDir: 'row'
};

const DEFAULT_MONEY_CATEGORIES = ["Generale", "Tasse Uni", "Treno", "Cinema", "Cibo", "Studio", "Abbonamenti", "Salute", "Svago"];

const DEFAULT_UNI_DATA = {
    targetCfu: 180,
    activeSubModules: ['roadmap'],
    subLayoutDir: 'row',
    passedExams: [],
    remainingExams: [],
    appeals: [],
    taxes: []
};

const DEFAULT_LAYOUT_TREE = {
    id: 'root_split',
    type: 'split',
    dir: 'row',
    ratio: 0.35,
    children: [
        { id: 'pane_init_1', type: 'pane', module: 'tasks' },
        { id: 'pane_init_2', type: 'pane', module: 'planner' }
    ]
};

const ALL_STORAGE_KEYS = [
    'tracker_templates', 'tracker_logs', 'tracker_events',
    'tracker_note_cats', 'tracker_notes', 'tracker_journal',
    'tracker_category_order', 'tracker_references', 'ref_toggles',
    'tracker_ephemeral', 'tracker_general_todo', 'tracker_planner_exceptions',
    'tracker_focus_logs', 'tracker_daily_priorities',
    'm_balance', 'm_trans', 'm_rec', 'm_wish', 'm_vaults', 'm_categories',
    'tracker_gym_next', 'tracker_gym_weights', 'gym_start_date', 'gym_end_date',
    'tracker_diet_data', 'tracker_diet_rules', 'tracker_gym_plan', 'tracker_gym_routine', 'tracker_food_db', 'tracker_body_logs',
    'tracker_uni_data',
    'tracker_gemini_key', 'tracker_gemini_audio_key', 'tracker_processed_audio',
    'tracker_opacity', 'tracker_red_mode', 'tracker_layout_tree', 'tracker_workspace_presets', 'tracker_startup_view'
];

function safeJsonParse(rawStr, fallbackVal) {
    if (!rawStr || typeof rawStr !== 'string') return fallbackVal;
    try {
        const parsed = JSON.parse(rawStr);
        return parsed !== null && parsed !== undefined ? parsed : fallbackVal;
    } catch (e) {
        return fallbackVal;
    }
}

// ============================================================================
// MOTORE DI PERSISTENZA SCALABILE: INDEXEDDB + TAURI ATOMIC FS / SQLITE
// ============================================================================

let isStorageHydrated = false;
let idbInstance = null;

function openCortexIndexedDB() {
    if (idbInstance) return Promise.resolve(idbInstance);
    return new Promise((resolve) => {
        if (!window.indexedDB) { resolve(null); return; }
        try {
            const req = window.indexedDB.open('CortexScalableDB', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('kv_store')) {
                    db.createObjectStore('kv_store');
                }
            };
            req.onsuccess = (e) => {
                idbInstance = e.target.result;
                resolve(idbInstance);
            };
            req.onerror = () => resolve(null);
        } catch (err) {
            resolve(null);
        }
    });
}

async function idbWriteBatch(entriesMap) {
    const db = await openCortexIndexedDB();
    if (!db) return;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction('kv_store', 'readwrite');
            const store = tx.objectStore('kv_store');
            for (const [k, v] of Object.entries(entriesMap)) {
                store.put(v, k);
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        } catch (e) {
            resolve(false);
        }
    });
}

async function idbReadAll() {
    const db = await openCortexIndexedDB();
    if (!db) return {};
    return new Promise((resolve) => {
        try {
            const tx = db.transaction('kv_store', 'readonly');
            const store = tx.objectStore('kv_store');
            const out = {};
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    out[cursor.key] = cursor.value;
                    cursor.continue();
                } else {
                    resolve(out);
                }
            };
            cursorReq.onerror = () => resolve({});
        } catch (e) {
            resolve({});
        }
    });
}

// Scrittura non bloccante su IndexedDB + Mirror safe su localStorage (senza mai lanciare QuotaExceededError)
function persistKeysMap(entriesMap) {
    for (const [k, v] of Object.entries(entriesMap)) {
        const strVal = typeof v === 'string' ? v : JSON.stringify(v);
        try {
            localStorage.setItem(k, strVal);
        } catch (quotaErr) {
            // Se localStorage supera i 5MB, non blocca l'esecuzione: i dati primari sono su IndexedDB e Tauri Disk!
        }
        entriesMap[k] = strVal;
    }
    idbWriteBatch(entriesMap);
    scheduleDiskSync();
}

// Lettura file JSON nativo da Tauri (supporta sia Tauri v1 sia Tauri v2)
async function readTauriDiskDatabase() {
    try {
        // 1. Se è presente un comando Rust custom 'load_atomic_db'
        if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
            try {
                const rawRust = await window.__TAURI__.core.invoke('load_atomic_db');
                if (rawRust) return JSON.parse(rawRust);
            } catch (e) {}
        }

        // 2. Plugin FS di Tauri (cerca cortex_db.json o minimal_tracker_db.json in AppData)
        if (window.__TAURI__ && window.__TAURI__.fs && window.__TAURI__.fs.readTextFile) {
            const baseDir = window.__TAURI__.fs.BaseDirectory
                ? (window.__TAURI__.fs.BaseDirectory.AppData || window.__TAURI__.fs.BaseDirectory.AppLocalData)
                : undefined;
            const opts = baseDir !== undefined ? { dir: baseDir, baseDir: baseDir } : undefined;

            for (const fileName of ['cortex_db.json', 'minimal_tracker_db.json', 'cortex_db.backup.json']) {
                try {
                    const txt = await window.__TAURI__.fs.readTextFile(fileName, opts);
                    if (txt && txt.trim()) {
                        const parsed = JSON.parse(txt);
                        if (parsed && typeof parsed === 'object') return parsed;
                    }
                } catch (e) {}
            }
        }
    } catch (err) {}
    return null;
}

// Scrittura atomica su disco tramite Tauri (non sovrascrive mai prima che il boot di recupero sia completato)
let diskSyncTimeout;
function scheduleDiskSync() {
    if (!isStorageHydrated) return;
    clearTimeout(diskSyncTimeout);
    diskSyncTimeout = setTimeout(async () => {
        const payloadObj = buildBackupObject();
        const jsonString = JSON.stringify(payloadObj, null, 2);

        // 1. Comando Rust nativo atomico se configurato
        if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
            try {
                await window.__TAURI__.core.invoke('save_atomic_db', { payload: jsonString });
            } catch (e) {}
        }

        // 2. Tauri FS Plugin (scrive sia su cortex_db.json che su minimal_tracker_db.json + backup)
        if (window.__TAURI__ && window.__TAURI__.fs && window.__TAURI__.fs.writeTextFile) {
            try {
                const baseDir = window.__TAURI__.fs.BaseDirectory
                    ? (window.__TAURI__.fs.BaseDirectory.AppData || window.__TAURI__.fs.BaseDirectory.AppLocalData)
                    : undefined;
                const opts = baseDir !== undefined ? { dir: baseDir, baseDir: baseDir } : undefined;

                await window.__TAURI__.fs.writeTextFile('cortex_db.json', jsonString, opts);
                await window.__TAURI__.fs.writeTextFile('minimal_tracker_db.json', jsonString, opts);
                await window.__TAURI__.fs.writeTextFile('cortex_db.backup.json', jsonString, opts);
            } catch (e) {}
        }
    }, 350);
}

function migrateAndInitData() {
    const defaults = {
        'tracker_templates': [],
        'tracker_logs': {},
        'tracker_events': [],
        'tracker_note_cats': ["General", "Registrazioni", "Productivity", "Math", "Ideas"],
        'tracker_notes': {},
        'tracker_category_order': [],
        'tracker_references': [],
        'ref_toggles': {},
        'tracker_ephemeral': {},
        'tracker_journal': {},
        'tracker_general_todo': [],
        'tracker_planner_exceptions': {},
        'tracker_focus_logs': [],
        'tracker_daily_priorities': {},
        'm_balance': 0.0,
        'm_trans': [],
        'm_rec': [],
        'm_wish': [],
        'm_vaults': [],
        'm_categories': DEFAULT_MONEY_CATEGORIES,
        'tracker_gym_next': 1,
        'tracker_gym_weights': {},
        'gym_start_date': "",
        'gym_end_date': "",
        'tracker_diet_data': DEFAULT_DIET_DATA,
        'tracker_diet_rules': DEFAULT_DIET_RULES,
        'tracker_gym_plan': DEFAULT_GYM_PLAN,
        'tracker_gym_routine': DEFAULT_GYM_ROUTINE,
        'tracker_food_db': DEFAULT_FOOD_DB,
        'tracker_body_logs': [],
        'tracker_uni_data': DEFAULT_UNI_DATA,
        'tracker_gemini_key': "",
        'tracker_gemini_audio_key': "",
        'tracker_processed_audio': [],
        'tracker_opacity': "0.92",
        'tracker_layout_tree': DEFAULT_LAYOUT_TREE,
        'tracker_workspace_presets': [],
        'tracker_startup_view': 'last'
    };

    for (let key in defaults) {
        if (localStorage.getItem(key) === null) {
            try {
                const val = typeof defaults[key] === 'string' ? defaults[key] : JSON.stringify(defaults[key]);
                localStorage.setItem(key, val);
            } catch (e) {}
        }
    }
}

migrateAndInitData();

// --- VARIABILI DI STATO GLOBALI ---
let templates = safeJsonParse(localStorage.getItem('tracker_templates'), []);
let logs = safeJsonParse(localStorage.getItem('tracker_logs'), {});
let specificEvents = safeJsonParse(localStorage.getItem('tracker_events'), []);
let noteCategories = safeJsonParse(localStorage.getItem('tracker_note_cats'), ["General", "Registrazioni", "Productivity", "Math", "Ideas"]);
let notesContent = safeJsonParse(localStorage.getItem('tracker_notes'), {});
let journals = safeJsonParse(localStorage.getItem('tracker_journal'), {});
let categoryOrder = safeJsonParse(localStorage.getItem('tracker_category_order'), []);
let referenceLayers = safeJsonParse(localStorage.getItem('tracker_references'), []);
let refToggles = safeJsonParse(localStorage.getItem('ref_toggles'), {});
let ephemeralData = safeJsonParse(localStorage.getItem('tracker_ephemeral'), {});
let generalTodos = safeJsonParse(localStorage.getItem('tracker_general_todo'), []);
let plannerExceptions = safeJsonParse(localStorage.getItem('tracker_planner_exceptions'), {});
let focusLogs = safeJsonParse(localStorage.getItem('tracker_focus_logs'), []);
let dailyPriorities = safeJsonParse(localStorage.getItem('tracker_daily_priorities'), {});
let selectedTodos = new Set();

// Money
let mBalance = roundCurrency(localStorage.getItem('m_balance'));
let mTransactions = safeJsonParse(localStorage.getItem('m_trans'), []);
let mRecurring = safeJsonParse(localStorage.getItem('m_rec'), []);
let mWishlist = safeJsonParse(localStorage.getItem('m_wish'), []);
let mVaults = safeJsonParse(localStorage.getItem('m_vaults'), []);
let mCategories = safeJsonParse(localStorage.getItem('m_categories'), DEFAULT_MONEY_CATEGORIES);
if (!mCategories.includes('Tasse Uni')) mCategories.push('Tasse Uni');

// Health (Diet & Gym)
let nextWorkoutDay = parseInt(localStorage.getItem('tracker_gym_next'), 10) || 1;
let savedGymWeights = safeJsonParse(localStorage.getItem('tracker_gym_weights'), {});
let gymStartDate = localStorage.getItem('gym_start_date') || "";
let gymEndDate = localStorage.getItem('gym_end_date') || "";
let dietData = safeJsonParse(localStorage.getItem('tracker_diet_data'), DEFAULT_DIET_DATA);
let dietRules = localStorage.getItem('tracker_diet_rules') || DEFAULT_DIET_RULES;
let gymPlan = safeJsonParse(localStorage.getItem('tracker_gym_plan'), DEFAULT_GYM_PLAN);
let gymRoutine = Object.assign({}, DEFAULT_GYM_ROUTINE, safeJsonParse(localStorage.getItem('tracker_gym_routine'), {}));
let foodDb = safeJsonParse(localStorage.getItem('tracker_food_db'), DEFAULT_FOOD_DB);
let bodyLogs = safeJsonParse(localStorage.getItem('tracker_body_logs'), []);

// University
let uniData = Object.assign({}, DEFAULT_UNI_DATA, safeJsonParse(localStorage.getItem('tracker_uni_data'), {}));

// AI, Audio, Tiling Layout Tree & Startup View
let geminiApiKey = localStorage.getItem('tracker_gemini_key') || "";
let geminiAudioApiKey = localStorage.getItem('tracker_gemini_audio_key') || "";
let processedAudioFiles = safeJsonParse(localStorage.getItem('tracker_processed_audio'), []);
let savedOpacity = localStorage.getItem('tracker_opacity') || '0.92';

let layoutTree = safeJsonParse(localStorage.getItem('tracker_layout_tree'), DEFAULT_LAYOUT_TREE);
let workspacePresets = safeJsonParse(localStorage.getItem('tracker_workspace_presets'), []);
let startupView = localStorage.getItem('tracker_startup_view') || 'last';

let activeSlots = ['tasks', 'planner'];
let activeLeft = 'tasks';
let activeRight = 'planner';

// ============================================================================
// FUNZIONI DI SALVATAGGIO VERSO IL MOTORE SCALABILE
// ============================================================================

function saveData() {
    persistKeysMap({
        'tracker_templates': templates,
        'tracker_logs': logs,
        'tracker_events': specificEvents,
        'tracker_note_cats': noteCategories,
        'tracker_notes': notesContent,
        'tracker_journal': journals,
        'tracker_category_order': categoryOrder,
        'tracker_references': referenceLayers,
        'ref_toggles': refToggles,
        'tracker_ephemeral': ephemeralData,
        'tracker_general_todo': generalTodos,
        'tracker_planner_exceptions': plannerExceptions,
        'tracker_focus_logs': focusLogs,
        'tracker_daily_priorities': dailyPriorities,
        'tracker_processed_audio': processedAudioFiles
    });
}

function saveMoneyData() {
    mBalance = roundCurrency(mBalance);
    persistKeysMap({
        'm_balance': mBalance.toString(),
        'm_trans': mTransactions,
        'm_rec': mRecurring,
        'm_wish': mWishlist,
        'm_vaults': mVaults,
        'm_categories': mCategories
    });
}

function saveHealthData() {
    persistKeysMap({
        'tracker_gym_next': nextWorkoutDay.toString(),
        'tracker_gym_weights': savedGymWeights,
        'gym_start_date': gymStartDate,
        'gym_end_date': gymEndDate,
        'tracker_diet_data': dietData,
        'tracker_diet_rules': dietRules,
        'tracker_gym_plan': gymPlan,
        'tracker_gym_routine': gymRoutine,
        'tracker_food_db': foodDb,
        'tracker_body_logs': bodyLogs
    });
}

function saveUniData() {
    persistKeysMap({
        'tracker_uni_data': uniData
    });
}

function saveWorkspaceState() {
    persistKeysMap({
        'tracker_layout_tree': layoutTree,
        'tracker_workspace_presets': workspacePresets,
        'tracker_startup_view': startupView
    });
}

function saveGeminiKey(val) {
    geminiApiKey = (val || '').trim();
    persistKeysMap({ 'tracker_gemini_key': geminiApiKey });
}

function saveGeminiAudioKey(val) {
    geminiAudioApiKey = (val || '').trim();
    persistKeysMap({ 'tracker_gemini_audio_key': geminiAudioApiKey });
}

// ============================================================================
// AUTO-RECOVERY ALL'AVVIO DA DISCO TAURI E INDEXEDDB (ZERO PERDITA NOTE)
// ============================================================================

function mergeNotesObjectsNonDestructive(targetNotes, candidateNotes) {
    if (!candidateNotes || typeof candidateNotes !== 'object') return false;
    let recoveredAny = false;

    for (const [cat, text] of Object.entries(candidateNotes)) {
        if (!text || typeof text !== 'string' || !text.trim()) continue;
        const currentText = (targetNotes[cat] || '').trim();

        if (!currentText) {
            targetNotes[cat] = text;
            recoveredAny = true;
        } else if (text.trim().length > currentText.length && !currentText.includes(text.trim())) {
            // Conserva la versione più ricca/completa senza perdere eventuali aggiunte recenti
            targetNotes[cat] = text;
            recoveredAny = true;
        }
        if (!noteCategories.includes(cat)) {
            noteCategories.push(cat);
        }
    }
    return recoveredAny;
}

async function bootHydrateAndRecoverDatabase() {
    try {
        const idbData = await idbReadAll();
        const diskData = await readTauriDiskDatabase();

        let notesRecovered = false;
        let stateUpdated = false;

        // 1. Unione intelligente e recupero di tutte le Note e Registrazioni da IndexedDB e da Tauri Disk
        for (const source of [idbData, diskData]) {
            if (!source || typeof source !== 'object') continue;

            const candidateNotes = typeof source['tracker_notes'] === 'string'
                ? safeJsonParse(source['tracker_notes'], null)
                : source['tracker_notes'];

            if (mergeNotesObjectsNonDestructive(notesContent, candidateNotes)) {
                notesRecovered = true;
            }

            // Se templates o logs in memoria erano vuoti ma esistono su disco/IndexedDB, li ripristina
            if (templates.length === 0 && source['tracker_templates']) {
                const candTemplates = typeof source['tracker_templates'] === 'string'
                    ? safeJsonParse(source['tracker_templates'], [])
                    : source['tracker_templates'];
                if (Array.isArray(candTemplates) && candTemplates.length > 0) {
                    templates = candTemplates;
                    stateUpdated = true;
                }
            }

            if (Object.keys(logs).length === 0 && source['tracker_logs']) {
                const candLogs = typeof source['tracker_logs'] === 'string'
                    ? safeJsonParse(source['tracker_logs'], {})
                    : source['tracker_logs'];
                if (candLogs && Object.keys(candLogs).length > 0) {
                    logs = candLogs;
                    stateUpdated = true;
                }
            }

            if (mTransactions.length === 0 && source['m_trans']) {
                const candTrans = typeof source['m_trans'] === 'string'
                    ? safeJsonParse(source['m_trans'], [])
                    : source['m_trans'];
                if (Array.isArray(candTrans) && candTrans.length > 0) {
                    mTransactions = candTrans;
                    if (source['m_balance'] !== undefined) mBalance = roundCurrency(source['m_balance']);
                    stateUpdated = true;
                }
            }
        }

        isStorageHydrated = true;

        // Salva lo stato unificato su IndexedDB e Tauri Disk
        saveData();
        saveMoneyData();
        saveHealthData();
        saveUniData();
        saveWorkspaceState();

        if (notesRecovered || stateUpdated) {
            if (typeof renderNoteCategories === 'function') renderNoteCategories();
            if (typeof renderQuadrantLayout === 'function') renderQuadrantLayout();
            if (typeof showToast === 'function' && notesRecovered) {
                showToast('[STORAGE] Note e Registrazioni ripristinate dal database!');
            }
        }
    } catch (e) {
        isStorageHydrated = true;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    bootHydrateAndRecoverDatabase();
});

// ============================================================================
// UTILITY DATE, LOG FOCUS & BACKUP MANUALE
// ============================================================================

function logFocusSession(minutes, category, title, dateStr = todayStr) {
    const mins = Math.round(parseFloat(minutes) || 0);
    if (mins <= 0) return;
    focusLogs.push({
        id: 'fl_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        date: dateStr,
        category: (category || 'General').trim(),
        title: (title || 'Focus Session').trim(),
        minutes: mins
    });
    saveData();
}

function getNow() { return new Date(); }

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const todayObj = getNow();
let todayStr = formatDate(todayObj);

const tomorrowObj = new Date(todayObj);
tomorrowObj.setDate(todayObj.getDate() + 1);
let tomorrowStr = formatDate(tomorrowObj);

let selectedDateStr = todayStr;
let currentCalendarDate = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);

function syncCategoryOrder() {
    const activeTemplates = templates.filter(t => !t.endDate || t.endDate >= todayStr);
    const existingCats = new Set(activeTemplates.map(t => t.category));
    existingCats.forEach(c => {
        if (!categoryOrder.includes(c)) categoryOrder.push(c);
    });
    categoryOrder = categoryOrder.filter(c => existingCats.has(c));
    try {
        localStorage.setItem('tracker_category_order', JSON.stringify(categoryOrder));
    } catch (e) {}
}

syncCategoryOrder();

function isTaskActiveOnDate(template, dateStr) {
    if (template.exceptions && template.exceptions.includes(dateStr)) return false;
    if (dateStr < template.startDate) return false;
    if (template.endDate && dateStr > template.endDate) return false;

    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();

    if (template.type === 'timed' || (template.timeWindows && template.timeWindows.length > 0)) {
        if (template.timeWindows && template.timeWindows.length > 0) {
            for (let tw of template.timeWindows) {
                if (tw.days && tw.days.includes(dayOfWeek)) return true;
            }
        }
        return false;
    }

    if (template.frequency === 'all') return true;
    if (template.frequency === 'weekdays' && dayOfWeek >= 1 && dayOfWeek <= 5) return true;
    if (template.frequency === 'weekends' && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
    if (template.frequency === 'specific' && template.daysOfWeek && template.daysOfWeek.includes(dayOfWeek)) return true;

    return false;
}

function getStatsForDate(dateStr) {
    let total = 0, completed = 0;
    let activeCategories = new Set();

    templates.forEach(t => {
        if (isTaskActiveOnDate(t, dateStr)) {
            total += t.instances;
            activeCategories.add(t.category);
            if (logs[dateStr] && logs[dateStr][t.id]) {
                completed += logs[dateStr][t.id].filter(Boolean).length;
            }
        }
    });

    return { total, completed, categories: Array.from(activeCategories) };
}

function buildBackupObject() {
    return {
        'tracker_templates': JSON.stringify(templates),
        'tracker_logs': JSON.stringify(logs),
        'tracker_events': JSON.stringify(specificEvents),
        'tracker_note_cats': JSON.stringify(noteCategories),
        'tracker_notes': JSON.stringify(notesContent),
        'tracker_journal': JSON.stringify(journals),
        'tracker_category_order': JSON.stringify(categoryOrder),
        'tracker_references': JSON.stringify(referenceLayers),
        'ref_toggles': JSON.stringify(refToggles),
        'tracker_ephemeral': JSON.stringify(ephemeralData),
        'tracker_general_todo': JSON.stringify(generalTodos),
        'tracker_planner_exceptions': JSON.stringify(plannerExceptions),
        'tracker_focus_logs': JSON.stringify(focusLogs),
        'tracker_daily_priorities': JSON.stringify(dailyPriorities),
        'm_balance': mBalance.toString(),
        'm_trans': JSON.stringify(mTransactions),
        'm_rec': JSON.stringify(mRecurring),
        'm_wish': JSON.stringify(mWishlist),
        'm_vaults': JSON.stringify(mVaults),
        'm_categories': JSON.stringify(mCategories),
        'tracker_gym_next': nextWorkoutDay.toString(),
        'tracker_gym_weights': JSON.stringify(savedGymWeights),
        'gym_start_date': gymStartDate,
        'gym_end_date': gymEndDate,
        'tracker_diet_data': JSON.stringify(dietData),
        'tracker_diet_rules': dietRules,
        'tracker_gym_plan': JSON.stringify(gymPlan),
        'tracker_gym_routine': JSON.stringify(gymRoutine),
        'tracker_food_db': JSON.stringify(foodDb),
        'tracker_body_logs': JSON.stringify(bodyLogs),
        'tracker_uni_data': JSON.stringify(uniData),
        'tracker_gemini_key': geminiApiKey,
        'tracker_gemini_audio_key': geminiAudioApiKey,
        'tracker_processed_audio': JSON.stringify(processedAudioFiles),
        'tracker_opacity': savedOpacity,
        'tracker_red_mode': localStorage.getItem('tracker_red_mode') || 'false',
        'tracker_layout_tree': JSON.stringify(layoutTree),
        'tracker_workspace_presets': JSON.stringify(workspacePresets),
        'tracker_startup_view': startupView
    };
}

function exportData() {
    saveData();
    saveMoneyData();
    saveHealthData();
    saveUniData();
    saveWorkspaceState();

    const backup = buildBackupObject();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "cortex_backup_" + formatDate(new Date()) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            const batch = {};
            for (let key in data) {
                if (data[key] !== null && data[key] !== undefined) {
                    const val = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
                    batch[key] = val;
                    try { localStorage.setItem(key, val); } catch (err) {}
                }
            }
            await idbWriteBatch(batch);
            alert("Backup restored successfully! The app will now reload.");
            location.reload();
        } catch (err) {
            alert("Error reading backup file. Make sure it's a valid JSON from this app.");
        }
    };
    reader.readAsText(file);
}
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

const DAY_PHASES = [
    { id: 'early_am', label: 'EARLY MORNING',   short: 'EARLY AM', start: '06:30', end: '09:30', startDec: 6.5,  endDec: 9.5 },
    { id: 'late_am',  label: 'LATE MORNING',    short: 'LATE AM',  start: '09:30', end: '13:00', startDec: 9.5,  endDec: 13.0 },
    { id: 'early_pm', label: 'EARLY AFTERNOON', short: 'EARLY PM', start: '13:00', end: '16:30', startDec: 13.0, endDec: 16.5 },
    { id: 'late_pm',  label: 'LATE AFTERNOON',  short: 'LATE PM',  start: '16:30', end: '20:00', startDec: 16.5, endDec: 20.0 },
    { id: 'evening',  label: 'EVENING',         short: 'EVENING',  start: '20:00', end: '24:00', startDec: 20.0, endDec: 24.0 }
];

const DEFAULT_ROUTINES_DATA = [
    {
        id: 'rtn_morning',
        title: 'Morning Routine',
        color: '#b08d43',
        startDate: '2026-01-01',
        endDate: null,
        type: 'untimed',
        noTimer: true,
        timerMinutes: 20,
        frequency: 'all',
        daysOfWeek: [],
        timeWindows: [],
        sections: [
            {
                id: 'sec_m_1',
                title: 'Avvio',
                items: [
                    { id: 'ri_m1', title: 'Acqua + Luce naturale' },
                    { id: 'ri_m2', title: 'Skincare viso mattina' }
                ]
            }
        ]
    },
    {
        id: 'rtn_evening',
        title: 'Evening Routine',
        color: '#4c5b73',
        startDate: '2026-01-01',
        endDate: null,
        type: 'untimed',
        noTimer: true,
        timerMinutes: 25,
        frequency: 'all',
        daysOfWeek: [],
        timeWindows: [],
        sections: [
            {
                id: 'sec_e_close',
                title: 'Chiusura & System',
                items: [
                    { id: 'ri_e_tx', title: 'Log in transactions' },
                    { id: 'ri_e_sony', title: 'Sync recorder & gestione note' },
                    { id: 'ri_e_plan', title: 'Pianificazione giorno dopo' }
                ]
            }
        ]
    },
    {
        id: 'rtn_weekly',
        title: 'Weekly Routine',
        color: '#5f7a61',
        startDate: '2026-01-01',
        endDate: null,
        type: 'untimed',
        noTimer: true,
        timerMinutes: 45,
        frequency: 'weekends',
        daysOfWeek: [6, 0],
        timeWindows: [],
        sections: [
            {
                id: 'sec_w_home',
                title: 'Casa',
                items: [
                    { id: 'ri_w_wash', title: 'Fare lavatrici' }
                ]
            },
            {
                id: 'sec_w_groom',
                title: 'Grooming',
                items: [
                    { id: 'ri_w_shower', title: 'Doccia' },
                    { id: 'ri_w_shave', title: 'Rasatura barba + crema' }
                ]
            },
            {
                id: 'sec_w_plan',
                title: 'Domenica Sera',
                items: [
                    { id: 'ri_w_weekplan', title: 'Pianificazione della settimana' }
                ]
            }
        ]
    }
];

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
    'tracker_gemini_key', 'tracker_gemini_audio_key', 'tracker_processed_audio', 'tracker_extracted_notes',
    'tracker_opacity', 'tracker_red_mode', 'tracker_layout_tree', 'tracker_workspace_presets', 'tracker_startup_view',
    'tracker_custom_aliases', 'tracker_routines', 'tracker_routine_logs', 'tracker_nl_learning',
    'tracker_study_plans', 'tracker_diet_logs'
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
// PERSISTENZA: tutto passa da cortexStore (js/core/boot.js)
// IndexedDB è la fonte principale; localStorage solo copia di riserva.
// ============================================================================

// I dati sono già caricati in memoria da boot.js prima che questo file venga eseguito.
let isStorageHydrated = true;

function persistKeysMap(entriesMap) {
    for (const [k, v] of Object.entries(entriesMap)) {
        const strVal = typeof v === 'string' ? v : JSON.stringify(v);
        cortexStore.setItem(k, strVal);
    }
}

// ----------------------------------------------------------------------------
// FIRST RUN: is this a brand-new install (no data of any kind yet)?
// ----------------------------------------------------------------------------
const CORTEX_FRESH_INSTALL = ['tracker_templates', 'tracker_routines', 'tracker_notes', 'tracker_logs', 'm_trans']
    .every(k => cortexStore.getItem(k) === null);
if (CORTEX_FRESH_INSTALL) {
    cortexStore.setItem('cortex_fresh_install', '1');
    cortexStore.setItem('cortex_starter', '1');   // permanent: this user started from the neutral setup
} else if (cortexStore.getItem('cortex_onboarded') === null && cortexStore.getItem('cortex_fresh_install') === null) {
    // Existing users skip the welcome guide
    cortexStore.setItem('cortex_onboarded', '1');
}
// True for every launch of a user who started clean (not only the very first one)
const CORTEX_STARTER_USER = cortexStore.getItem('cortex_starter') === '1';

// Neutral starting point for new users (English, empty, nothing personal)
const STARTER_DATA = {
    'tracker_note_cats': ['Inbox', 'Ideas', 'Projects'],
    'tracker_diet_data': [
        { type: 'Breakfast' }, { type: 'Lunch' }, { type: 'Snack' }, { type: 'Dinner' }
    ],
    'tracker_diet_rules': '',
    'tracker_food_db': [
        { name: 'Oats', kcal: 389, p: 16.9, c: 66.3, f: 6.9, defaultG: 50 },
        { name: 'Rice', kcal: 360, p: 7.0, c: 79.0, f: 0.6, defaultG: 80 },
        { name: 'Pasta', kcal: 357, p: 12.5, c: 72.0, f: 1.5, defaultG: 80 },
        { name: 'Chicken breast', kcal: 110, p: 23.0, c: 0, f: 1.2, defaultG: 150 },
        { name: 'Eggs', kcal: 143, p: 12.6, c: 0.7, f: 9.5, defaultG: 100 },
        { name: 'Greek yogurt', kcal: 97, p: 9.0, c: 3.9, f: 5.0, defaultG: 150 },
        { name: 'Banana', kcal: 89, p: 1.1, c: 22.8, f: 0.3, defaultG: 120 },
        { name: 'Olive oil', kcal: 884, p: 0, c: 0, f: 100, defaultG: 10 }
    ],
    'tracker_gym_plan': { 1: [], 2: [] },
    'tracker_gym_routine': { enabled: false, timeWindows: [] },
    'm_categories': ['General', 'Food', 'Transport', 'Bills', 'Subscriptions', 'Health', 'Fun', 'Study'],
    'tracker_routines': []
};

function migrateAndInitData() {
    const defaults = {
        'tracker_templates': [],
        'tracker_logs': {},
        'tracker_events': [],
        'tracker_note_cats': ["General", "Registrazioni", "Extracted", "Productivity", "Math", "Ideas"],
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
        'tracker_startup_view': 'last',
        'tracker_custom_aliases': {},
        'tracker_nl_learning': {},
        'tracker_routines': DEFAULT_ROUTINES_DATA,
        'tracker_routine_logs': {},
        'tracker_study_plans': {},
        'tracker_diet_logs': {}
    };

    // A brand-new install starts clean and neutral. The DEFAULT_* values above are the
    // original author's personal setup: they stay only as fallbacks for existing data.
    if (CORTEX_FRESH_INSTALL) Object.assign(defaults, STARTER_DATA);

    for (let key in defaults) {
        if (cortexStore.getItem(key) === null) {
            try {
                const val = typeof defaults[key] === 'string' ? defaults[key] : JSON.stringify(defaults[key]);
                cortexStore.setItem(key, val);
            } catch (e) {}
        }
    }
}

migrateAndInitData();

// --- VARIABILI DI STATO GLOBALI ---
let templates = safeJsonParse(cortexStore.getItem('tracker_templates'), []);
let logs = safeJsonParse(cortexStore.getItem('tracker_logs'), {});
let specificEvents = safeJsonParse(cortexStore.getItem('tracker_events'), []);
let noteCategories = safeJsonParse(cortexStore.getItem('tracker_note_cats'), ["General", "Registrazioni", "Productivity", "Math", "Ideas"]);
let notesContent = safeJsonParse(cortexStore.getItem('tracker_notes'), {});
let journals = safeJsonParse(cortexStore.getItem('tracker_journal'), {});
let categoryOrder = safeJsonParse(cortexStore.getItem('tracker_category_order'), []);
let referenceLayers = safeJsonParse(cortexStore.getItem('tracker_references'), []);
let refToggles = safeJsonParse(cortexStore.getItem('ref_toggles'), {});
let ephemeralData = safeJsonParse(cortexStore.getItem('tracker_ephemeral'), {});
let generalTodos = safeJsonParse(cortexStore.getItem('tracker_general_todo'), []);
let plannerExceptions = safeJsonParse(cortexStore.getItem('tracker_planner_exceptions'), {});
let focusLogs = safeJsonParse(cortexStore.getItem('tracker_focus_logs'), []);
let dailyPriorities = safeJsonParse(cortexStore.getItem('tracker_daily_priorities'), {});
let routinesData = safeJsonParse(cortexStore.getItem('tracker_routines'), DEFAULT_ROUTINES_DATA);
let routineLogs = safeJsonParse(cortexStore.getItem('tracker_routine_logs'), {});
// Study windows per day (js/modules/study.js) and what was actually eaten (js/modules/meals.js)
let studyPlans = safeJsonParse(cortexStore.getItem('tracker_study_plans'), {});
let dietLogs = safeJsonParse(cortexStore.getItem('tracker_diet_logs'), {});
let selectedTodos = new Set();

// Money
let mBalance = roundCurrency(cortexStore.getItem('m_balance'));
let mTransactions = safeJsonParse(cortexStore.getItem('m_trans'), []);
let mRecurring = safeJsonParse(cortexStore.getItem('m_rec'), []);
let mWishlist = safeJsonParse(cortexStore.getItem('m_wish'), []);
let mVaults = safeJsonParse(cortexStore.getItem('m_vaults'), []);
let mCategories = safeJsonParse(cortexStore.getItem('m_categories'), DEFAULT_MONEY_CATEGORIES);
// University fees get their own category, except on a fresh install (added when the uni module is used)
if (!CORTEX_STARTER_USER && !mCategories.includes('Tasse Uni')) mCategories.push('Tasse Uni');

// Health (Diet & Gym)
let nextWorkoutDay = parseInt(cortexStore.getItem('tracker_gym_next'), 10) || 1;
let savedGymWeights = safeJsonParse(cortexStore.getItem('tracker_gym_weights'), {});
let gymStartDate = cortexStore.getItem('gym_start_date') || "";
let gymEndDate = cortexStore.getItem('gym_end_date') || "";
let dietData = safeJsonParse(cortexStore.getItem('tracker_diet_data'), DEFAULT_DIET_DATA);
let dietRules = cortexStore.getItem('tracker_diet_rules') ?? DEFAULT_DIET_RULES;
let gymPlan = safeJsonParse(cortexStore.getItem('tracker_gym_plan'), DEFAULT_GYM_PLAN);
let gymRoutine = Object.assign({}, DEFAULT_GYM_ROUTINE, safeJsonParse(cortexStore.getItem('tracker_gym_routine'), {}));
let foodDb = safeJsonParse(cortexStore.getItem('tracker_food_db'), DEFAULT_FOOD_DB);
let bodyLogs = safeJsonParse(cortexStore.getItem('tracker_body_logs'), []);

// University
let uniData = Object.assign({}, DEFAULT_UNI_DATA, safeJsonParse(cortexStore.getItem('tracker_uni_data'), {}));

// AI, Audio, Tiling Layout Tree & Startup View
let geminiApiKey = cortexStore.getItem('tracker_gemini_key') || "";
let geminiAudioApiKey = cortexStore.getItem('tracker_gemini_audio_key') || "";
let processedAudioFiles = safeJsonParse(cortexStore.getItem('tracker_processed_audio'), []);
let savedOpacity = cortexStore.getItem('tracker_opacity') || '0.92';

let layoutTree = safeJsonParse(cortexStore.getItem('tracker_layout_tree'), DEFAULT_LAYOUT_TREE);
let workspacePresets = safeJsonParse(cortexStore.getItem('tracker_workspace_presets'), []);
let startupView = cortexStore.getItem('tracker_startup_view') || 'last';
let customAliases = safeJsonParse(cortexStore.getItem('tracker_custom_aliases'), {});

function saveCustomAliases() {
    persistKeysMap({
        'tracker_custom_aliases': customAliases
    });
}

// What the command bar has learned from you (js/core/nl-parser.js → LEARNING)
let nlLearning = safeJsonParse(cortexStore.getItem('tracker_nl_learning'), {});

function saveNlLearning() {
    persistKeysMap({ 'tracker_nl_learning': nlLearning });
    if (typeof markLocalChangeForCloud === 'function') markLocalChangeForCloud();
}

let activeSlots = ['tasks', 'planner'];
let activeLeft = 'tasks';
let activeRight = 'planner';

// Math-Hub & Mental Math Native State
let mathHubState = safeJsonParse(cortexStore.getItem('tracker_math_state'), {
    topicRecords: {}, dailyHistory: {}, activeProblemId: null, activeMode: 'NUOVO', activeCourse: null, globalEmaMastery: 0.5
});
let mentalMathWeights = safeJsonParse(cortexStore.getItem('tracker_math_weights'), {});
let mentalMathHistory = safeJsonParse(cortexStore.getItem('tracker_math_history'), {});
let mentalMathConfig = safeJsonParse(cortexStore.getItem('tracker_math_config'), { digits: '2', mult: '11', multType: 'literal' });
let cachedMathProblems = []; // Popolato al volo via fetch

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
        'tracker_processed_audio': processedAudioFiles,
        'tracker_routines': routinesData,
        'tracker_routine_logs': routineLogs,
        'tracker_study_plans': studyPlans,
        'tracker_math_state': mathHubState,
        'tracker_math_weights': mentalMathWeights,
        'tracker_math_history': mentalMathHistory,
        'tracker_math_config': mentalMathConfig
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
        'tracker_body_logs': bodyLogs,
        'tracker_diet_logs': dietLogs
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
// MIGRAZIONI LEGGERE ALL'AVVIO
// ============================================================================

if (!noteCategories.includes('Extracted')) {
    const regIdx = noteCategories.indexOf('Registrazioni');
    if (regIdx !== -1) noteCategories.splice(regIdx + 1, 0, 'Extracted');
    else noteCategories.push('Extracted');
}

// ============================================================================
// UTILITY DATE, LOG FOCUS & BACKUP MANUALE
// ============================================================================

// entryId: fixed id for a phase of a shared focus session (js/modules/focus.js).
// If that id is already logged (by this or another device) nothing is added: returns false.
function logFocusSession(minutes, category, title, dateStr = todayStr, templateId = null, entryId = null, extra = null) {
    const mins = Math.round(parseFloat(minutes) || 0);
    if (mins <= 0) return false;
    if (entryId && focusLogs.some(l => l && l.id === entryId)) return false;
    const entry = {
        id: entryId || ('fl_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
        date: dateStr,
        category: (category || 'General').trim(),
        title: (title || 'Focus Session').trim(),
        minutes: mins
    };
    // Lets study progress count minutes per task (js/modules/study.js)
    if (templateId) entry.templateId = templateId;
    if (extra && Number(extra.planned) > 0) entry.planned = Math.round(Number(extra.planned));
    if (extra && extra.phase) entry.phase = String(extra.phase);
    if (extra && Number(extra.at) > 0) entry.at = Math.round(Number(extra.at));   // when it ended (ms)
    focusLogs.push(entry);
    saveData();
    return true;
}

function getNow() { return new Date(); }

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseLocalDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return getNow();
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0])) return new Date(dateStr);
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
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
        cortexStore.setItem('tracker_category_order', JSON.stringify(categoryOrder));
    } catch (e) {}
}

syncCategoryOrder();

function isTaskActiveOnDate(template, dateStr) {
    if (!template) return false;
    
    // Controllo eccezioni rigoroso sulle stringhe
    if (Array.isArray(template.exceptions) && template.exceptions.includes(dateStr)) return false;
    
    if (template.startDate && dateStr < template.startDate) return false;
    if (template.endDate && dateStr > template.endDate) return false;

    const dateObj = parseLocalDate(dateStr);
    const dayOfWeek = dateObj.getDay();

    if (template.type === 'timed' || (template.timeWindows && template.timeWindows.length > 0)) {
        if (template.timeWindows && template.timeWindows.length > 0) {
            const activeWindowsToday = template.timeWindows.filter(tw => tw.days && tw.days.includes(dayOfWeek));
            if (activeWindowsToday.length === 0) return false;

            const hasCustomOverrideToday = Array.isArray(ephemeralData[dateStr]) &&
                ephemeralData[dateStr].some(b => b.templateId === template.id);
            if (hasCustomOverrideToday) return true;

            const anySlotVisible = activeWindowsToday.some(tw => !plannerExceptions[`${template.id}_${dateStr}_${tw.start}`]);
            return anySlotVisible;
        }
        return false;
    }

    if (template.frequency === 'all') return true;
    if (template.frequency === 'weekdays' && dayOfWeek >= 1 && dayOfWeek <= 5) return true;
    if (template.frequency === 'weekends' && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
    if (template.frequency === 'specific' && template.daysOfWeek && template.daysOfWeek.includes(dayOfWeek)) return true;
    if (template.frequency === 'interval') {
        const startD = parseLocalDate(template.startDate || todayStr);
        const diffDays = Math.round((dateObj - startD) / (1000 * 60 * 60 * 24));
        const step = Math.max(1, parseInt(template.intervalDays, 10) || 14);
        return diffDays >= 0 && (diffDays % step === 0);
    }

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
        'tracker_extracted_notes': cortexStore.getItem('tracker_extracted_notes') || '[]',
        'tracker_opacity': savedOpacity,
        'tracker_red_mode': cortexStore.getItem('tracker_red_mode') || 'false',
        'tracker_layout_tree': JSON.stringify(layoutTree),
        'tracker_workspace_presets': JSON.stringify(workspacePresets),
        'tracker_startup_view': startupView,
        'tracker_custom_aliases': JSON.stringify(customAliases),
        'tracker_nl_learning': JSON.stringify(nlLearning),
        'tracker_routines': JSON.stringify(routinesData),
        'tracker_routine_logs': JSON.stringify(routineLogs),
        'tracker_study_plans': JSON.stringify(studyPlans),
        'tracker_diet_logs': JSON.stringify(dietLogs)
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
                    try { cortexStore.setItem(key, val); } catch (err) {}
                }
            }
            // Attende che tutto sia scritto in IndexedDB prima di ricaricare
            await cortexStore.flush();
            alert("Backup restored successfully! The app will now reload.");
            location.reload();
        } catch (err) {
            alert("Error reading backup file. Make sure it's a valid JSON from this app.");
        }
    };
    reader.readAsText(file);
}

// ============================================================================
// MOTORE GLOBALE UNDO / REDO (CTRL+Z / CTRL+Y)
// ============================================================================

let undoStack = [];
let redoStack = [];
let isApplyingUndoRedo = false;
let lastCapturedSnapshotStr = '';

function captureCurrentStateSnapshotString() {
    return JSON.stringify({
        templates,
        logs,
        specificEvents,
        noteCategories,
        notesContent,
        categoryOrder,
        referenceLayers,
        refToggles,
        ephemeralData,
        generalTodos,
        plannerExceptions,
        routinesData,
        routineLogs,
        mBalance,
        mTransactions,
        mRecurring,
        mWishlist,
        mVaults,
        mCategories,
        nextWorkoutDay,
        savedGymWeights,
        dietData,
        dietRules,
        gymPlan,
        uniData,
        bodyLogs,
        focusLogs,
        journals,
        dailyPriorities,
        studyPlans,
        dietLogs
    });
}

function recordUndoHistoryBeforeSave() {
    if (!isStorageHydrated || isApplyingUndoRedo) return;
    const currentSnap = captureCurrentStateSnapshotString();
    if (!lastCapturedSnapshotStr) {
        lastCapturedSnapshotStr = currentSnap;
        return;
    }
    if (currentSnap !== lastCapturedSnapshotStr) {
        undoStack.push(lastCapturedSnapshotStr);
        if (undoStack.length > 30) undoStack.shift();
        redoStack = [];
        lastCapturedSnapshotStr = currentSnap;
    }
}

function refreshActivePanesInPlace() {
    const prevScrolls = [];
    document.querySelectorAll('.planner-scroll-area, #plan-mod-timeline-scroll, .notes-browse-container').forEach(el => {
        prevScrolls.push({ el, top: el.scrollTop });
    });

    if (typeof activeSlots !== 'undefined' && Array.isArray(activeSlots)) {
        activeSlots.forEach(modKey => {
            if (typeof dashboardModules !== 'undefined' && dashboardModules[modKey] && typeof dashboardModules[modKey].render === 'function') {
                try {
                    dashboardModules[modKey].render();
                } catch (e) {
                    console.error('[Cortex] module error', modKey, e);
                    if (typeof cortexNotify === 'function') cortexNotify('⚠ The "' + modKey + '" module hit an error: ' + e.message);
                }
            }
        });
    }

    if (typeof renderHudPod === 'function') renderHudPod();

    prevScrolls.forEach(item => {
        if (item.el) item.el.scrollTop = item.top;
    });
}

function applyStateSnapshotString(snapStr) {
    if (!snapStr) return;
    isApplyingUndoRedo = true;
    try {
        const s = JSON.parse(snapStr);
        templates = s.templates || [];
        logs = s.logs || {};
        specificEvents = s.specificEvents || [];
        noteCategories = s.noteCategories || ['General', 'Registrazioni'];
        notesContent = s.notesContent || {};
        categoryOrder = s.categoryOrder || [];
        referenceLayers = s.referenceLayers || [];
        refToggles = s.refToggles || {};
        ephemeralData = s.ephemeralData || {};
        generalTodos = s.generalTodos || [];
        plannerExceptions = s.plannerExceptions || {};
        routinesData = s.routinesData || [];
        routineLogs = s.routineLogs || {};
        mBalance = roundCurrency(s.mBalance);
        mTransactions = s.mTransactions || [];
        mRecurring = s.mRecurring || [];
        mWishlist = s.mWishlist || [];
        mVaults = s.mVaults || [];
        mCategories = s.mCategories || [];
        nextWorkoutDay = s.nextWorkoutDay || 1;
        savedGymWeights = s.savedGymWeights || {};
        dietData = s.dietData || [];
        dietRules = s.dietRules || '';
        gymPlan = s.gymPlan || {};
        uniData = s.uniData || {};
        // Added later: older snapshots may not have them → keep current values
        if (Array.isArray(s.bodyLogs)) bodyLogs = s.bodyLogs;
        if (Array.isArray(s.focusLogs)) focusLogs = s.focusLogs;
        if (s.journals && typeof s.journals === 'object') journals = s.journals;
        if (s.dailyPriorities && typeof s.dailyPriorities === 'object') dailyPriorities = s.dailyPriorities;
        if (s.studyPlans && typeof s.studyPlans === 'object') studyPlans = s.studyPlans;
        if (s.dietLogs && typeof s.dietLogs === 'object') dietLogs = s.dietLogs;

        lastCapturedSnapshotStr = snapStr;
        saveData();
        saveMoneyData();
        saveHealthData();
        saveUniData();

        // Aggiorna i moduli sul posto senza svuotare il DOM (zero lampo nero!)
        refreshActivePanesInPlace();
    } catch (e) {
        console.error('[UNDO/REDO ERROR]', e);
    }
    isApplyingUndoRedo = false;
}

function performGlobalUndo() {
    if (undoStack.length === 0) {
        if (typeof showToast === 'function') showToast('[UNDO] Nothing to undo');
        return;
    }
    const currentSnap = captureCurrentStateSnapshotString();
    redoStack.push(currentSnap);
    const prevSnap = undoStack.pop();
    applyStateSnapshotString(prevSnap);
    if (typeof showToast === 'function') showToast('[UNDO] Reverted last action');
}

function performGlobalRedo() {
    if (redoStack.length === 0) {
        if (typeof showToast === 'function') showToast('[REDO] Nothing to redo');
        return;
    }
    const currentSnap = captureCurrentStateSnapshotString();
    undoStack.push(currentSnap);
    const nextSnap = redoStack.pop();
    applyStateSnapshotString(nextSnap);
    if (typeof showToast === 'function') showToast('[REDO] Restored action');
}

// Aggancia automaticamente il tracker Undo alle funzioni di salvataggio e alle scorciatoie Ctrl+Z / Ctrl+Y
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        lastCapturedSnapshotStr = captureCurrentStateSnapshotString();
    }, 300);

    ['saveData', 'saveMoneyData', 'saveHealthData', 'saveUniData'].forEach(fnName => {
        const origFn = window[fnName];
        if (typeof origFn === 'function') {
            window[fnName] = function(...args) {
                recordUndoHistoryBeforeSave();
                return origFn.apply(this, args);
            };
        }
    });

    document.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) {
            return; // Lascia il Ctrl+Z nativo del testo quando stai scrivendo in un campo
        }

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            performGlobalUndo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault();
            performGlobalRedo();
        }
    });
});

// Controlla se tutte le task marchiate come 'high' priority per oggi sono state spuntate
function areAllHighPriorityTasksDone() {
    let allDone = true;
    (templates || []).forEach(t => {
        if (t.priority === 'high' && isTaskActiveOnDate(t, todayStr)) {
            const logsToday = (logs[todayStr] && logs[todayStr][t.id]) || Array(t.instances || 1).fill(false);
            if (logsToday.some(x => !x)) {
                allDone = false;
            }
        }
    });
    return allDone;
}
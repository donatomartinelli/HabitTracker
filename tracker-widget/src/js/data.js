// --- 1. DATA MANAGEMENT, MIGRATION & DISK PERSISTENCE ---

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
        { id: "g1_1", name: "Panca Inclinata 2 Manubri", repStr: "4x5-8", sets: 4 },
        { id: "g1_2", name: "Panca Piana Multipower", repStr: "8-8-6", sets: 3 },
        { id: "g1_3", name: "Croci in Piedi Cavi Bassi", repStr: "2x12 + 10 parziali", sets: 2 },
        { id: "g1_4", name: "Shoulder Press", repStr: "3x5-8", sets: 3 },
        { id: "g1_5", name: "Alzate Laterali Deltoid", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g1_6", name: "Curl Bicheps-Machine", repStr: "10-8-8", sets: 3 },
        { id: "g1_7", name: "Curl Alt. Seduto Panca Incl.", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g1_8", name: "Crunch Machine", repStr: "3xMax", sets: 0 },
        { id: "g1_9", name: "Plank Busto Scorrimento", repStr: "3xMax", sets: 0 }
    ],
    2: [
        { id: "g2_1", name: "Lat Machine Avanti", repStr: "4x5-8", sets: 4 },
        { id: "g2_2", name: "Rematore In Piedi T-Bar", repStr: "8-8-6", sets: 3 },
        { id: "g2_3", name: "Pull Down Cavo Alto", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g2_4", name: "Push Down Sbarra 2 Maniglie", repStr: "10-8-8", sets: 3 },
        { id: "g2_5", name: "Kick Back Seduto 1 Manubrio", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g2_6", name: "Leg Press Inclinata", repStr: "3x5-8", sets: 3 },
        { id: "g2_7", name: "Leg Extension", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g2_8", name: "Leg Curl", repStr: "12-12-10", sets: 3 },
        { id: "g2_9", name: "Chiusure A Libro Gambe Tese", repStr: "3xMax", sets: 0 }
    ]
};

const DEFAULT_MONEY_CATEGORIES = ["Generale", "Treno", "Cinema", "Cibo", "Studio", "Abbonamenti", "Salute", "Svago"];

function migrateAndInitData() {
    const oldCats = localStorage.getItem('tracker_note_categories');
    const currentCats = localStorage.getItem('tracker_note_cats');
    if (oldCats) {
        if (!currentCats) {
            localStorage.setItem('tracker_note_cats', oldCats);
        } else {
            const parsedOld = JSON.parse(oldCats) || [];
            const parsedCur = JSON.parse(currentCats) || [];
            const mergedCats = Array.from(new Set([...parsedCur, ...parsedOld]));
            localStorage.setItem('tracker_note_cats', JSON.stringify(mergedCats));
        }
        localStorage.removeItem('tracker_note_categories');
    }

    const oldNotes = localStorage.getItem('tracker_notes_content');
    const currentNotes = localStorage.getItem('tracker_notes');
    if (oldNotes) {
        const parsedOld = JSON.parse(oldNotes) || {};
        const parsedCur = currentNotes ? (JSON.parse(currentNotes) || {}) : {};
        for (let cat in parsedOld) {
            if (!parsedCur[cat]) {
                parsedCur[cat] = parsedOld[cat];
            } else if (parsedCur[cat] !== parsedOld[cat] && !parsedCur[cat].includes(parsedOld[cat])) {
                parsedCur[cat] = parsedOld[cat] + "\n\n" + parsedCur[cat];
            }
        }
        localStorage.setItem('tracker_notes', JSON.stringify(parsedCur));
        localStorage.removeItem('tracker_notes_content');
    }

    const defaults = {
        'tracker_templates': [],
        'tracker_logs': {},
        'tracker_events': [],
        'tracker_note_cats': ["General", "Productivity", "Math", "Ideas"],
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
        'tracker_food_db': DEFAULT_FOOD_DB,
        'tracker_body_logs': [],
        'tracker_gemini_key': "",
        'tracker_opacity': "0.92",
        'tracker_mod_left': "daily",
        'tracker_mod_right': "planner",
        'tracker_pane_left_width': "50%"
    };

    for (let key in defaults) {
        if (localStorage.getItem(key) === null) {
            const val = typeof defaults[key] === 'string' ? defaults[key] : JSON.stringify(defaults[key]);
            localStorage.setItem(key, val);
        }
    }

    try {
        const notesObj = JSON.parse(localStorage.getItem('tracker_notes')) || {};
        const catsArr = JSON.parse(localStorage.getItem('tracker_note_cats')) || ["General"];
        let catsUpdated = false;
        for (let key in notesObj) {
            if (notesObj[key] && notesObj[key].trim() !== '' && !catsArr.includes(key)) {
                catsArr.push(key);
                catsUpdated = true;
            }
        }
        if (catsUpdated) {
            localStorage.setItem('tracker_note_cats', JSON.stringify(catsArr));
        }
    } catch (e) {}

    try {
        const rawBal = localStorage.getItem('m_balance');
        if (rawBal !== null) {
            localStorage.setItem('m_balance', roundCurrency(rawBal).toString());
        }
        const transArr = JSON.parse(localStorage.getItem('m_trans')) || [];
        let transFixed = false;
        transArr.forEach(t => {
            if (t.id && t.id.includes('.')) {
                const parts = t.id.split('.');
                let mainPart = parts[0];
                if (mainPart.length > 16) {
                    mainPart = mainPart.slice(0, 16);
                }
                t.id = `${mainPart}_${parts[1].slice(0, 4)}`;
                transFixed = true;
            }
            t.amount = roundCurrency(t.amount);
            if (!t.category) {
                if (t.desc && t.desc.toLowerCase().includes('bigliett')) t.category = 'Treno';
                else if (t.desc && t.desc.startsWith('(Auto)')) t.category = 'Abbonamenti';
                else t.category = t.type === 'in' ? 'Entrata' : 'Generale';
                transFixed = true;
            }
        });
        if (transFixed) {
            localStorage.setItem('m_trans', JSON.stringify(transArr));
        }
    } catch (e) {}
}

migrateAndInitData();

// --- STATO GLOBALE UNIFICATO ---
let templates = JSON.parse(localStorage.getItem('tracker_templates')) || [];
let logs = JSON.parse(localStorage.getItem('tracker_logs')) || {};
let specificEvents = JSON.parse(localStorage.getItem('tracker_events')) || [];
let noteCategories = JSON.parse(localStorage.getItem('tracker_note_cats')) || ["General"];
let notesContent = JSON.parse(localStorage.getItem('tracker_notes')) || {};
let journals = JSON.parse(localStorage.getItem('tracker_journal')) || {};
let categoryOrder = JSON.parse(localStorage.getItem('tracker_category_order')) || [];
let referenceLayers = JSON.parse(localStorage.getItem('tracker_references')) || [];
let refToggles = JSON.parse(localStorage.getItem('ref_toggles')) || {};
let ephemeralData = JSON.parse(localStorage.getItem('tracker_ephemeral')) || {};
let generalTodos = JSON.parse(localStorage.getItem('tracker_general_todo')) || [];
let plannerExceptions = JSON.parse(localStorage.getItem('tracker_planner_exceptions')) || {};
let focusLogs = JSON.parse(localStorage.getItem('tracker_focus_logs')) || [];
let dailyPriorities = JSON.parse(localStorage.getItem('tracker_daily_priorities')) || {};
let selectedTodos = new Set();

// Money
let mBalance = roundCurrency(localStorage.getItem('m_balance'));
let mTransactions = JSON.parse(localStorage.getItem('m_trans')) || [];
let mRecurring = JSON.parse(localStorage.getItem('m_rec')) || [];
let mWishlist = JSON.parse(localStorage.getItem('m_wish')) || [];
let mVaults = JSON.parse(localStorage.getItem('m_vaults')) || [];
let mCategories = JSON.parse(localStorage.getItem('m_categories')) || DEFAULT_MONEY_CATEGORIES;

// Health
let nextWorkoutDay = parseInt(localStorage.getItem('tracker_gym_next'), 10) || 1;
let savedGymWeights = JSON.parse(localStorage.getItem('tracker_gym_weights')) || {};
let gymStartDate = localStorage.getItem('gym_start_date') || "";
let gymEndDate = localStorage.getItem('gym_end_date') || "";
let dietData = JSON.parse(localStorage.getItem('tracker_diet_data')) || DEFAULT_DIET_DATA;
let dietRules = localStorage.getItem('tracker_diet_rules') || DEFAULT_DIET_RULES;
let gymPlan = JSON.parse(localStorage.getItem('tracker_gym_plan')) || DEFAULT_GYM_PLAN;
let foodDb = JSON.parse(localStorage.getItem('tracker_food_db')) || DEFAULT_FOOD_DB;
let bodyLogs = JSON.parse(localStorage.getItem('tracker_body_logs')) || [];

// AI & Layout
let geminiApiKey = localStorage.getItem('tracker_gemini_key') || "";
let activeLeft = localStorage.getItem('tracker_mod_left') || 'daily';
let activeRight = localStorage.getItem('tracker_mod_right') || 'planner';
let savedOpacity = localStorage.getItem('tracker_opacity') || '0.92';

// --- LISTA COMPLETA CHIAVI DATABASE ---
const ALL_STORAGE_KEYS = [
    'tracker_templates', 'tracker_logs', 'tracker_events',
    'tracker_note_cats', 'tracker_notes', 'tracker_journal',
    'tracker_category_order', 'tracker_references', 'ref_toggles',
    'tracker_ephemeral', 'tracker_general_todo', 'tracker_planner_exceptions',
    'tracker_focus_logs', 'tracker_daily_priorities',
    'm_balance', 'm_trans', 'm_rec', 'm_wish', 'm_vaults', 'm_categories',
    'tracker_gym_next', 'tracker_gym_weights', 'gym_start_date', 'gym_end_date',
    'tracker_diet_data', 'tracker_diet_rules', 'tracker_gym_plan', 'tracker_food_db', 'tracker_body_logs',
    'tracker_gemini_key', 'tracker_opacity', 'tracker_mod_left', 'tracker_mod_right', 'tracker_pane_left_width'
];

let diskSyncTimeout;
function scheduleDiskSync() {
    clearTimeout(diskSyncTimeout);
    diskSyncTimeout = setTimeout(async () => {
        if (window.__TAURI__ && window.__TAURI__.fs && window.__TAURI__.fs.writeTextFile) {
            try {
                const payload = buildBackupObject();
                await window.__TAURI__.fs.writeTextFile('minimal_tracker_db.json', JSON.stringify(payload, null, 2), {
                    dir: window.__TAURI__.fs.BaseDirectory ? window.__TAURI__.fs.BaseDirectory.AppData : undefined
                });
            } catch (e) {}
        }
    }, 600);
}

// --- FUNZIONI DI SALVATAGGIO CENTRALIZZATE ---
function saveData() {
    localStorage.setItem('tracker_templates', JSON.stringify(templates));
    localStorage.setItem('tracker_logs', JSON.stringify(logs));
    localStorage.setItem('tracker_events', JSON.stringify(specificEvents));
    localStorage.setItem('tracker_note_cats', JSON.stringify(noteCategories));
    localStorage.setItem('tracker_notes', JSON.stringify(notesContent));
    localStorage.setItem('tracker_journal', JSON.stringify(journals));
    localStorage.setItem('tracker_category_order', JSON.stringify(categoryOrder));
    localStorage.setItem('tracker_references', JSON.stringify(referenceLayers));
    localStorage.setItem('ref_toggles', JSON.stringify(refToggles));
    localStorage.setItem('tracker_ephemeral', JSON.stringify(ephemeralData));
    localStorage.setItem('tracker_general_todo', JSON.stringify(generalTodos));
    localStorage.setItem('tracker_planner_exceptions', JSON.stringify(plannerExceptions));
    localStorage.setItem('tracker_focus_logs', JSON.stringify(focusLogs));
    localStorage.setItem('tracker_daily_priorities', JSON.stringify(dailyPriorities));
    scheduleDiskSync();
}

function saveMoneyData() {
    mBalance = roundCurrency(mBalance);
    localStorage.setItem('m_balance', mBalance.toString());
    localStorage.setItem('m_trans', JSON.stringify(mTransactions));
    localStorage.setItem('m_rec', JSON.stringify(mRecurring));
    localStorage.setItem('m_wish', JSON.stringify(mWishlist));
    localStorage.setItem('m_vaults', JSON.stringify(mVaults));
    localStorage.setItem('m_categories', JSON.stringify(mCategories));
    scheduleDiskSync();
}

function saveHealthData() {
    localStorage.setItem('tracker_gym_next', nextWorkoutDay.toString());
    localStorage.setItem('tracker_gym_weights', JSON.stringify(savedGymWeights));
    localStorage.setItem('gym_start_date', gymStartDate);
    localStorage.setItem('gym_end_date', gymEndDate);
    localStorage.setItem('tracker_diet_data', JSON.stringify(dietData));
    localStorage.setItem('tracker_diet_rules', dietRules);
    localStorage.setItem('tracker_gym_plan', JSON.stringify(gymPlan));
    localStorage.setItem('tracker_food_db', JSON.stringify(foodDb));
    localStorage.setItem('tracker_body_logs', JSON.stringify(bodyLogs));
    scheduleDiskSync();
}

function saveGeminiKey(val) {
    geminiApiKey = (val || '').trim();
    localStorage.setItem('tracker_gemini_key', geminiApiKey);
    scheduleDiskSync();
}

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

function getNow() { 
    return new Date(); 
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const todayObj = getNow();
const todayStr = formatDate(todayObj);

const tomorrowObj = new Date(todayObj);
tomorrowObj.setDate(todayObj.getDate() + 1);
const tomorrowStr = formatDate(tomorrowObj);

let selectedDateStr = todayStr;
let currentCalendarDate = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);

function syncCategoryOrder() {
    const existingCats = new Set(templates.map(t => t.category));
    existingCats.forEach(c => { 
        if (!categoryOrder.includes(c)) {
            categoryOrder.push(c);
        }
    });
    categoryOrder = categoryOrder.filter(c => existingCats.has(c));
    localStorage.setItem('tracker_category_order', JSON.stringify(categoryOrder));
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
    let total = 0; 
    let completed = 0; 
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
    
    return { 
        total: total, 
        completed: completed, 
        categories: Array.from(activeCategories) 
    };
}

function buildBackupObject() {
    const backup = {};
    ALL_STORAGE_KEYS.forEach(key => {
        backup[key] = localStorage.getItem(key);
    });
    return backup;
}

function exportData() {
    saveData();
    saveMoneyData();
    saveHealthData();

    const backup = buildBackupObject();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "minimal_backup_" + formatDate(new Date()) + ".json");
    
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            for (let key in data) {
                if (data[key] !== null && data[key] !== undefined) {
                    const val = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
                    localStorage.setItem(key, val);
                }
            }
            alert("Backup restored successfully! The app will now reload.");
            location.reload();
        } catch (err) {
            alert("Error reading backup file. Make sure it's a valid JSON from this app.");
        }
    };
    reader.readAsText(file);
}
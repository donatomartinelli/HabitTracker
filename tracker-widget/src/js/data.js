// --- 1. DATA MANAGEMENT, MIGRATION & SECURITY HELPERS ---

// Filtro di sicurezza: trasforma simboli speciali (<, >, &, ", ') in testo puro inoffensivo
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Arrotondamento matematico al centesimo per evitare errori tipo 13.29999999999999
function roundCurrency(val) {
    const num = parseFloat(val) || 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

function migrateAndInitData() {
    // 1. Unificazione Categorie Note
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

    // 2. Unificazione Contenuto Note
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

    // 3. Inizializzazione valori di default
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
        'm_balance': 0.0,
        'm_trans': [],
        'm_rec': [],
        'm_wish': [],
        'tracker_gym_next': 1,
        'tracker_gym_weights': {},
        'gym_start_date': "",
        'gym_end_date': "",
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

    // 4. Recupero categorie note "orfane" (es. "Mathematics" presente nelle note ma non nel menu)
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

    // 5. Pulizia saldo decimale e riparazione ID transazioni corrotte (es. mt_17911400356510.963...)
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
                // Se lo 0 di Math.random() si è incollato al timestamp rendendolo di 14 cifre, rimuove l'ultimo 0
                let mainPart = parts[0];
                if (mainPart.length > 16) {
                    mainPart = mainPart.slice(0, 16);
                }
                t.id = `${mainPart}_${parts[1].slice(0, 4)}`;
                transFixed = true;
            }
            t.amount = roundCurrency(t.amount);
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
let selectedTodos = new Set();

// Money
let mBalance = roundCurrency(localStorage.getItem('m_balance'));
let mTransactions = JSON.parse(localStorage.getItem('m_trans')) || [];
let mRecurring = JSON.parse(localStorage.getItem('m_rec')) || [];
let mWishlist = JSON.parse(localStorage.getItem('m_wish')) || [];

// Health
let nextWorkoutDay = parseInt(localStorage.getItem('tracker_gym_next'), 10) || 1;
let savedGymWeights = JSON.parse(localStorage.getItem('tracker_gym_weights')) || {};
let gymStartDate = localStorage.getItem('gym_start_date') || "";
let gymEndDate = localStorage.getItem('gym_end_date') || "";

// Layout & UI
let activeLeft = localStorage.getItem('tracker_mod_left') || 'daily';
let activeRight = localStorage.getItem('tracker_mod_right') || 'planner';
let savedOpacity = localStorage.getItem('tracker_opacity') || '0.92';

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
}

function saveMoneyData() {
    mBalance = roundCurrency(mBalance);
    localStorage.setItem('m_balance', mBalance.toString());
    localStorage.setItem('m_trans', JSON.stringify(mTransactions));
    localStorage.setItem('m_rec', JSON.stringify(mRecurring));
    localStorage.setItem('m_wish', JSON.stringify(mWishlist));
}

function saveHealthData() {
    localStorage.setItem('tracker_gym_next', nextWorkoutDay.toString());
    localStorage.setItem('tracker_gym_weights', JSON.stringify(savedGymWeights));
    localStorage.setItem('gym_start_date', gymStartDate);
    localStorage.setItem('gym_end_date', gymEndDate);
}

// --- GESTIONE DATE E CALCOLO STATISTICHE ---
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

// --- BACKUP & RESTORE COMPLETO ---
const ALL_STORAGE_KEYS = [
    'tracker_templates', 'tracker_logs', 'tracker_events',
    'tracker_note_cats', 'tracker_notes', 'tracker_journal',
    'tracker_category_order', 'tracker_references', 'ref_toggles',
    'tracker_ephemeral', 'tracker_general_todo', 'tracker_planner_exceptions',
    'm_balance', 'm_trans', 'm_rec', 'm_wish',
    'tracker_gym_next', 'tracker_gym_weights', 'gym_start_date', 'gym_end_date',
    'tracker_opacity', 'tracker_mod_left', 'tracker_mod_right', 'tracker_pane_left_width'
];

function exportData() {
    saveData();
    saveMoneyData();
    saveHealthData();

    const backup = {};
    ALL_STORAGE_KEYS.forEach(key => {
        backup[key] = localStorage.getItem(key);
    });

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
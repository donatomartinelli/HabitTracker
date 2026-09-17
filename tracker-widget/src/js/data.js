// --- 1. DATA MANAGEMENT & GLOBALS ---

function initData() {
    if (!localStorage.getItem('tracker_templates')) {
        localStorage.setItem('tracker_templates', JSON.stringify([]));
    }
    if (!localStorage.getItem('tracker_logs')) {
        localStorage.setItem('tracker_logs', JSON.stringify({}));
    }
    if (!localStorage.getItem('tracker_events')) {
        localStorage.setItem('tracker_events', JSON.stringify([]));
    }
    if (!localStorage.getItem('tracker_note_cats')) {
        localStorage.setItem('tracker_note_cats', JSON.stringify(["General", "Productivity", "Math", "Ideas"]));
    }
    if (!localStorage.getItem('tracker_category_order')) {
        localStorage.setItem('tracker_category_order', JSON.stringify([]));
    }
    if (!localStorage.getItem('tracker_references')) {
        localStorage.setItem('tracker_references', JSON.stringify([]));
    }
    if (!localStorage.getItem('ref_toggles')) {
        localStorage.setItem('ref_toggles', JSON.stringify({}));
    }
    if (!localStorage.getItem('tracker_ephemeral')) {
        localStorage.setItem('tracker_ephemeral', JSON.stringify({}));
    }
    if (!localStorage.getItem('tracker_journal')) {
        localStorage.setItem('tracker_journal', JSON.stringify({}));
    }
}

initData();

// Global State Arrays
let templates = JSON.parse(localStorage.getItem('tracker_templates')) || [];
let logs = JSON.parse(localStorage.getItem('tracker_logs')) || {};
let specificEvents = JSON.parse(localStorage.getItem('tracker_events')) || [];
let noteCategories = JSON.parse(localStorage.getItem('tracker_note_cats')) || [];
let categoryOrder = JSON.parse(localStorage.getItem('tracker_category_order')) || [];
let referenceLayers = JSON.parse(localStorage.getItem('tracker_references')) || [];
let refToggles = JSON.parse(localStorage.getItem('ref_toggles')) || {};
let ephemeralData = JSON.parse(localStorage.getItem('tracker_ephemeral')) || {};

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
let currentDailyTab = 'today';
let dragStartH = null;

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

function saveData() {
    localStorage.setItem('tracker_templates', JSON.stringify(templates));
    localStorage.setItem('tracker_logs', JSON.stringify(logs));
    localStorage.setItem('tracker_events', JSON.stringify(specificEvents));
    localStorage.setItem('tracker_category_order', JSON.stringify(categoryOrder));
    localStorage.setItem('tracker_references', JSON.stringify(referenceLayers));
    localStorage.setItem('ref_toggles', JSON.stringify(refToggles));
    localStorage.setItem('tracker_ephemeral', JSON.stringify(ephemeralData));
}

function isTaskActiveOnDate(template, dateStr) {
    if (template.exceptions && template.exceptions.includes(dateStr)) {
        return false;
    }
    if (dateStr < template.startDate) {
        return false;
    }
    if (template.endDate && dateStr > template.endDate) {
        return false;
    }
    
    const dateObj = new Date(dateStr); 
    const dayOfWeek = dateObj.getDay();
    
    if (template.type === 'timed' || (template.timeWindows && template.timeWindows.length > 0)) {
        let inTimeWindowDays = false;
        
        if (template.timeWindows && template.timeWindows.length > 0) {
            for (let tw of template.timeWindows) {
                if (tw.days && tw.days.includes(dayOfWeek)) { 
                    inTimeWindowDays = true; 
                    break; 
                }
            }
        }
        return inTimeWindowDays;
    }
    
    if (template.frequency === 'all') {
        return true;
    }
    if (template.frequency === 'weekdays' && dayOfWeek >= 1 && dayOfWeek <= 5) {
        return true;
    }
    if (template.frequency === 'weekends' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        return true;
    }
    if (template.frequency === 'specific' && template.daysOfWeek && template.daysOfWeek.includes(dayOfWeek)) {
        return true;
    }
    
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

// --- BACKUP & RESTORE (OFFLINE JSON) ---

function exportData() {
    const backup = {
        tracker_templates: localStorage.getItem('tracker_templates'),
        tracker_logs: localStorage.getItem('tracker_logs'),
        tracker_events: localStorage.getItem('tracker_events'),
        tracker_note_cats: localStorage.getItem('tracker_note_cats'),
        tracker_category_order: localStorage.getItem('tracker_category_order'),
        tracker_references: localStorage.getItem('tracker_references'),
        ref_toggles: localStorage.getItem('ref_toggles'),
        tracker_ephemeral: localStorage.getItem('tracker_ephemeral'),
        tracker_journal: localStorage.getItem('tracker_journal'),
        tracker_opacity: localStorage.getItem('tracker_opacity')
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    
    // Nomi dei file dinamici: es. minimal_backup_2026-09-18.json
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
            
            // Controlla e ripristina ogni chiave
            for (let key in data) {
                if (data[key] !== null && data[key] !== undefined) {
                    localStorage.setItem(key, data[key]);
                }
            }
            
            alert("Backup restored successfully! The app will now reload.");
            location.reload(); // Forza il riavvio per caricare i nuovi dati
            
        } catch (err) {
            alert("Error reading backup file. Make sure it's a valid JSON from this app.");
        }
    };
    reader.readAsText(file);
}
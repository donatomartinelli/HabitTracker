// --- js/core/workspace.js ---
// Tiling Window Manager: Universal MACRO_SUBMODULES_MAP for ALL Modules, 60fps rAF Resizer, Floating Dock Menus & Tactical HUD Pod

const dashboardModules = {
    // 1. CALENDAR & SUB-MODULES
    'calendar': {
        name: 'Calendar',
        id: 'module-calendar',
        minW: () => 220,
        minH: () => 170,
        render: () => { if (typeof renderCalendar === 'function') renderCalendar(); }
    },
    'cal_grid': {
        name: 'Calendar: Month Grid',
        id: 'module-cal-grid',
        minW: () => 220,
        minH: () => 170,
        render: () => {
            if (typeof renderCalendarAtomGrid === 'function') renderCalendarAtomGrid();
            else if (typeof renderCalendar === 'function') renderCalendar();
        }
    },
    'cal_agenda': {
        name: 'Calendar: Day Events',
        id: 'module-cal-agenda',
        minW: () => 200,
        minH: () => 120,
        render: () => {
            if (typeof renderCalendarAtomAgenda === 'function') renderCalendarAtomAgenda();
            else if (typeof renderCalendarDaySummary === 'function') renderCalendarDaySummary();
        }
    },

    // 2. TASKS
    'tasks': {
        name: 'Tasks',
        id: 'module-tasks',
        minW: () => Math.max(155, Math.floor(window.innerWidth * 0.125)),
        minH: () => 145,
        render: () => { if (typeof renderTasks === 'function') renderTasks(); }
    },

    // 3. NOTES & SUB-MODULES (WRITE, BROWSE, GRAPH)
    'notes': {
        name: 'Notes',
        id: 'module-notes',
        minW: () => Math.max(170, Math.floor(window.innerWidth * 0.14)),
        minH: () => 145,
        render: () => { if (typeof renderNoteCategories === 'function') renderNoteCategories(); }
    },
    'notes_write': {
        name: 'Notes: Write',
        id: 'module-notes-write',
        minW: () => 210,
        minH: () => 145,
        render: () => { if (typeof renderNotesAtomWrite === 'function') renderNotesAtomWrite(); }
    },
    'notes_browse': {
        name: 'Notes: Browse',
        id: 'module-notes-browse',
        minW: () => 240,
        minH: () => 150,
        render: () => { if (typeof renderNotesAtomBrowse === 'function') renderNotesAtomBrowse(); }
    },
    'notes_graph': {
        name: 'Notes: Graph',
        id: 'module-notes-graph',
        minW: () => 260,
        minH: () => 180,
        render: () => { if (typeof renderNotesAtomGraph === 'function') renderNotesAtomGraph(); }
    },

    // 4. WEEKLY PLANNER
    'planner': {
        name: 'Weekly Planner',
        id: 'module-planner',
        minW: () => Math.max(420, Math.floor(window.innerWidth * 0.35)),
        minH: () => 210,
        render: () => { if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner(); }
    },

    // 5. DAY PLANNER
    'plan': {
        name: 'Day Planner',
        id: 'module-plan',
        minW: () => 360,
        minH: () => 210,
        render: () => { if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule(); }
    },

    // 6. DIET & SUB-MODULES
    'diet': {
        name: 'Diet & Macros',
        id: 'module-diet',
        minW: () => 240,
        minH: () => 170,
        render: () => { if (typeof renderDiet === 'function') renderDiet(); }
    },
    'diet_today': {
        name: 'Diet: Today Meals',
        id: 'module-diet-today',
        minW: () => 230,
        minH: () => 160,
        render: () => {
            if (typeof renderDietAtomToday === 'function') renderDietAtomToday();
            else if (typeof renderDiet === 'function') renderDiet();
        }
    },
    'diet_week': {
        name: 'Diet: Weekly Matrix',
        id: 'module-diet-week',
        minW: () => 320,
        minH: () => 180,
        render: () => {
            if (typeof renderDietAtomWeek === 'function') renderDietAtomWeek();
            else if (typeof renderDiet === 'function') renderDiet();
        }
    },

    // 7. GYM & SUB-MODULES
    'gym': {
        name: 'Gym Split',
        id: 'module-gym',
        minW: () => 235,
        minH: () => 170,
        render: () => { if (typeof renderGymDashboard === 'function') renderGymDashboard(); }
    },
    'gym_today': {
        name: 'Gym: Today Workout',
        id: 'module-gym-today',
        minW: () => 235,
        minH: () => 170,
        render: () => {
            if (typeof renderGymAtomToday === 'function') renderGymAtomToday();
            else if (typeof renderGymDashboard === 'function') renderGymDashboard();
        }
    },
    'gym_split': {
        name: 'Gym: Full Split',
        id: 'module-gym-split',
        minW: () => 280,
        minH: () => 180,
        render: () => {
            if (typeof renderGymAtomSplit === 'function') renderGymAtomSplit();
            else if (typeof renderGymDashboard === 'function') renderGymDashboard();
        }
    },

    // 8. MONEY & 7 SUB-MODULES
    'money': {
        name: 'Money',
        id: 'module-money',
        minW: () => 250,
        minH: () => 170,
        render: () => { if (typeof renderMoneyAllActivePanes === 'function') renderMoneyAllActivePanes(); }
    },
    'm_summary': {
        name: 'Money: Summary',
        id: 'module-m-summary',
        minW: () => 220,
        minH: () => 105,
        render: () => { if (typeof renderMoneyAtomSummary === 'function') renderMoneyAtomSummary(); }
    },
    'm_vaults': {
        name: 'Money: Vaults',
        id: 'module-m-vaults',
        minW: () => 220,
        minH: () => 130,
        render: () => { if (typeof renderMoneyAtomVaults === 'function') renderMoneyAtomVaults(); }
    },
    'm_chart': {
        name: 'Money: Chart',
        id: 'module-m-chart',
        minW: () => 220,
        minH: () => 125,
        render: () => { if (typeof renderMoneyAtomChart === 'function') renderMoneyAtomChart(); }
    },
    'm_tx': {
        name: 'Money: Transactions',
        id: 'module-m-tx',
        minW: () => 240,
        minH: () => 150,
        render: () => { if (typeof renderMoneyAtomTransactions === 'function') renderMoneyAtomTransactions(); }
    },
    'm_bills': {
        name: 'Money: Bills',
        id: 'module-m-bills',
        minW: () => 200,
        minH: () => 130,
        render: () => { if (typeof renderMoneyAtomBills === 'function') renderMoneyAtomBills(); }
    },
    'm_analytics': {
        name: 'Money: Analytics & Cats',
        id: 'module-m-analytics',
        minW: () => 260,
        minH: () => 170,
        render: () => { if (typeof renderMoneyAtomAnalytics === 'function') renderMoneyAtomAnalytics(); }
    },
    'm_incubator': {
        name: 'Money: Incubator',
        id: 'module-m-incubator',
        minW: () => 250,
        minH: () => 160,
        render: () => { if (typeof renderMoneyAtomIncubator === 'function') renderMoneyAtomIncubator(); }
    },

    // 9. STREAK & SUB-MODULES
    'streak': {
        name: 'Today & Streak',
        id: 'module-streak',
        minW: () => 260,
        minH: () => 180,
        render: () => {
            if (typeof renderTracker === 'function') renderTracker();
            if (typeof renderFocusLedger === 'function') renderFocusLedger();
        }
    },
    'streak_grid': {
        name: 'Streak: Habit Grid',
        id: 'module-streak-grid',
        minW: () => 250,
        minH: () => 150,
        render: () => {
            if (typeof renderStreakAtomGrid === 'function') renderStreakAtomGrid();
            else if (typeof renderTracker === 'function') renderTracker();
        }
    },
    'streak_ledger': {
        name: 'Streak: Focus Ledger',
        id: 'module-streak-ledger',
        minW: () => 250,
        minH: () => 160,
        render: () => {
            if (typeof renderStreakAtomLedger === 'function') renderStreakAtomLedger();
            else if (typeof renderFocusLedger === 'function') renderFocusLedger();
        }
    },

    // 10. UNIVERSITY & SUB-MODULES
    'uni': {
        name: 'University',
        id: 'module-uni',
        minW: () => 280,
        minH: () => 190,
        render: () => { if (typeof renderUniDashboard === 'function') renderUniDashboard(); }
    },
    'uni_roadmap': {
        name: 'Uni: Roadmap & Prep',
        id: 'module-uni-roadmap',
        minW: () => 260,
        minH: () => 170,
        render: () => {
            if (typeof renderUniAtomRoadmap === 'function') renderUniAtomRoadmap();
            else if (typeof renderUniDashboard === 'function') renderUniDashboard();
        }
    },
    'uni_lectures': {
        name: 'Uni: Lectures',
        id: 'module-uni-lectures',
        minW: () => 250,
        minH: () => 160,
        render: () => {
            if (typeof renderUniAtomLectures === 'function') renderUniAtomLectures();
            else if (typeof renderUniDashboard === 'function') renderUniDashboard();
        }
    },
    'uni_appeals': {
        name: 'Uni: Appeals & Taxes',
        id: 'module-uni-appeals',
        minW: () => 250,
        minH: () => 160,
        render: () => {
            if (typeof renderUniAtomAppeals === 'function') renderUniAtomAppeals();
            else if (typeof renderUniDashboard === 'function') renderUniDashboard();
        }
    },
    'uni_libretto': {
        name: 'Uni: Libretto (180 CFU)',
        id: 'module-uni-libretto',
        minW: () => 250,
        minH: () => 160,
        render: () => {
            if (typeof renderUniAtomLibretto === 'function') renderUniAtomLibretto();
            else if (typeof renderUniDashboard === 'function') renderUniDashboard();
        }
    },
    // 11. MATH-HUB & SUB-MODULES
    'math': {
        name: 'Math-Hub',
        id: 'module-math',
        minW: () => 280,
        minH: () => 220,
        render: () => { if (typeof renderMathModule === 'function') renderMathModule(); }
    },
};

// Aggiungi 'math' in queste due liste
const PRIMARY_MODULE_KEYS = ['calendar', 'tasks', 'notes', 'planner', 'plan', 'diet', 'gym', 'money', 'streak', 'uni', 'math'];
const ALL_MODULE_KEYS = Object.keys(dashboardModules); // Se math è in dashboardModules, viene pescato da qui.

// Assicurati che math sia nel dizionario dei sotto-moduli
const MACRO_SUBMODULES_MAP = {
    'calendar': ['cal_grid', 'cal_agenda'],
    'tasks':    ['tasks'],
    'notes':    ['notes_write', 'notes_browse', 'notes_graph'],
    'planner':  ['planner'],
    'plan':     ['plan'],
    'diet':     ['diet_today', 'diet_week'],
    'gym':      ['gym_today', 'gym_split'],
    'money':    ['m_summary', 'm_vaults', 'm_chart', 'm_tx', 'm_bills', 'm_analytics', 'm_incubator'],
    'streak':   ['streak_grid', 'streak_ledger'],
    'uni':      ['uni_roadmap', 'uni_lectures', 'uni_appeals', 'uni_libretto'],
    'math':     ['math'] // <-- AGGIUNGI QUESTO
};

let macroDefaultTrees = safeJsonParse(cortexStore.getItem('tracker_macro_default_trees'), {});
let isLayoutEditMode = false;

let pointerDragCandidate = null;
let isPointerDragging = false;
let currentSnapAction = null;
let dragGhostEl = null;
let floatingDockPopoverEl = null;

function saveMacroDefaultTrees() {
    if (typeof persistKeysMap === 'function') {
        persistKeysMap({ 'tracker_macro_default_trees': macroDefaultTrees });
    } else {
        cortexStore.setItem('tracker_macro_default_trees', JSON.stringify(macroDefaultTrees));
    }
}

// Restituisce l'albero di default per qualsiasi Macro-Modulo (con fallback automatico finché non unisci le Branch 2-4)
function getMacroDefaultSubtree(macroKey) {
    if (macroDefaultTrees[macroKey]) {
        return JSON.parse(JSON.stringify(macroDefaultTrees[macroKey]));
    }
    if (macroKey === 'money') {
        return makeSplitNode('col', 0.22,
            makePaneNode('m_summary'),
            makeSplitNode('col', 0.42,
                makeSplitNode('row', 0.52, makePaneNode('m_vaults'), makePaneNode('m_chart')),
                makeSplitNode('row', 0.62, makePaneNode('m_tx'), makePaneNode('m_bills'))
            )
        );
    }
    if (macroKey === 'calendar') {
        if (typeof renderCalendarAtomGrid === 'function') {
            // Month grid on the left, the selected day's agenda on the right
            return makeSplitNode('row', 0.6, makePaneNode('cal_grid'), makePaneNode('cal_agenda'));
        }
        return makePaneNode('calendar');
    }
    if (macroKey === 'diet') {
        if (typeof renderDietAtomToday === 'function') {
            return makePaneNode('diet_today');
        }
        return makePaneNode('diet');
    }
    if (macroKey === 'gym') {
        if (typeof renderGymAtomToday === 'function') {
            return makePaneNode('gym_today');
        }
        return makePaneNode('gym');
    }
    if (macroKey === 'streak') {
        if (typeof renderStreakAtomGrid === 'function') {
            return makeSplitNode('col', 0.45, makePaneNode('streak_grid'), makePaneNode('streak_ledger'));
        }
        return makePaneNode('streak');
    }
    if (macroKey === 'uni') {
        if (typeof renderUniAtomRoadmap === 'function') {
            return makePaneNode('uni_roadmap');
        }
        return makePaneNode('uni');
    }
    if (macroKey === 'notes') {
        if (typeof renderNotesAtomBrowse === 'function') {
            return makeSplitNode('row', 0.38, makePaneNode('notes_write'), makePaneNode('notes_browse'));
        }
        return makePaneNode('notes');
    }
    return makePaneNode(macroKey);
}

function createDefaultMoneySubtree() {
    return getMacroDefaultSubtree('money');
}

function saveCurrentAsMacroDefault(macroKey) {
    const allowedSubs = [macroKey, ...(MACRO_SUBMODULES_MAP[macroKey] || [])];
    if (!layoutTree) return;

    const filterSubtreeByMacro = (node) => {
        if (!node) return null;
        if (node.type === 'pane') {
            return allowedSubs.includes(node.module) ? JSON.parse(JSON.stringify(node)) : null;
        }
        if (node.type === 'split' && Array.isArray(node.children)) {
            const c0 = filterSubtreeByMacro(node.children[0]);
            const c1 = filterSubtreeByMacro(node.children[1]);
            if (!c0 && !c1) return null;
            if (!c0) return c1;
            if (!c1) return c0;
            return {
                id: 'split_' + Math.random().toString(36).slice(2, 9),
                type: 'split',
                dir: node.dir,
                ratio: node.ratio,
                children: [c0, c1]
            };
        }
        return null;
    };

    const extracted = filterSubtreeByMacro(layoutTree);
    if (!extracted) {
        if (typeof showToast === 'function') {
            showToast(`[DEFAULT] Mount ${dashboardModules[macroKey].name} on screen first`);
        }
        return;
    }

    macroDefaultTrees[macroKey] = extracted;
    saveMacroDefaultTrees();
    if (typeof showToast === 'function') {
        showToast(`[★ DEFAULT SAVED] ${dashboardModules[macroKey].name}`);
    }
}

// Pop-up hover per vedere i moduli che compongono una Saved View senza testo fisso
function showPresetModulesHoverPopup(e, presetName, modulesListStr) {
    const tooltip = document.getElementById('planner-tooltip');
    if (!tooltip) return;
    tooltip.innerHTML = `<strong class="u-block u-main" style="margin-bottom:2px;">${escapeHtml(presetName)}</strong><span class="u-muted">${escapeHtml(modulesListStr)}</span>`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY + 14) + 'px';
}

function movePresetModulesHoverPopup(e) {
    const tooltip = document.getElementById('planner-tooltip');
    if (tooltip && tooltip.style.display === 'block') {
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top = (e.clientY + 14) + 'px';
    }
}

function hidePresetModulesHoverPopup() {
    const tooltip = document.getElementById('planner-tooltip');
    if (tooltip) tooltip.style.display = 'none';
}

// --- MENU A TENDINA FLOTTANTE PER TUTTI I MACRO-MODULI NELLA DOCK [EDIT] ---

function closeFloatingDockPopover() {
    if (floatingDockPopoverEl) {
        floatingDockPopoverEl.remove();
        floatingDockPopoverEl = null;
    }
}

function openFloatingDockPopover(anchorBtn, modKey) {
    if (floatingDockPopoverEl && floatingDockPopoverEl.dataset.modKey === modKey) {
        closeFloatingDockPopover();
        return;
    }
    closeFloatingDockPopover();

    const subKeys = MACRO_SUBMODULES_MAP[modKey] || [modKey];
    const activeLeafMods = new Set(collectLeafPanes(layoutTree).map(p => p.module));
    const rect = anchorBtn.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.dataset.modKey = modKey;
    menu.style.cssText = `
        position: fixed;
        top: ${Math.round(rect.bottom + 4)}px;
        left: ${Math.round(Math.max(8, Math.min(window.innerWidth - 230, rect.left - 60)))}px;
        min-width: 210px;
        background: #060606;
        border: 1px solid var(--text-main);
        padding: 6px;
        z-index: 9500;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.96);
        display: flex;
        flex-direction: column;
        gap: 4px;
    `;

    subKeys.forEach(sk => {
        if (!dashboardModules[sk]) return;
        const subMounted = activeLeafMods.has(sk);
        const subRow = document.createElement('div');
        subRow.className = `draggable-mod-chip ${subMounted ? 'in-use' : ''}`;
        subRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
        const cleanSubName = dashboardModules[sk].name.replace(/^.*?:\s*/, '');
        subRow.innerHTML = `<span>${subMounted ? '✓ ' : '+ '}${escapeHtml(cleanSubName)}</span>`;

        bindCustomPointerDragSource(subRow, sk, null, () => {
            addModuleToTilingLayout(sk);
            closeFloatingDockPopover();
        });
        menu.appendChild(subRow);
    });

    const setDefBtn = document.createElement('button');
    setDefBtn.type = 'button';
    setDefBtn.className = 'btn btn-primary btn-sm';
    setDefBtn.style.cssText = 'width:100%; margin-top:2px; font-size:var(--font-2xs);';
    setDefBtn.textContent = '[★ SET AS DEFAULT]';
    setDefBtn.onclick = (e) => {
        e.stopPropagation();
        saveCurrentAsMacroDefault(modKey);
        closeFloatingDockPopover();
    };
    menu.appendChild(setDefBtn);

    document.body.appendChild(menu);
    floatingDockPopoverEl = menu;
}

document.addEventListener('mousedown', (e) => {
    if (floatingDockPopoverEl && !floatingDockPopoverEl.contains(e.target) && !e.target.closest('.dock-sub-drop-btn')) {
        closeFloatingDockPopover();
    }
});

function ensureDragGhostElement() {
    if (!dragGhostEl) {
        dragGhostEl = document.createElement('div');
        dragGhostEl.id = 'custom-drag-ghost';
        dragGhostEl.className = 'custom-drag-ghost';
        document.body.appendChild(dragGhostEl);
    }
    return dragGhostEl;
}

// --- FUNZIONI ALBERO TILING (BINARY SPACE PARTITIONING) ---

function makePaneNode(modKey) {
    return {
        id: 'pane_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        type: 'pane',
        module: modKey
    };
}

function makeSplitNode(dir, ratio, childA, childB) {
    return {
        id: 'split_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        type: 'split',
        dir: dir,
        ratio: Math.max(0.125, Math.min(0.875, ratio || 0.5)),
        children: [childA, childB]
    };
}

function collectLeafPanes(node, out = []) {
    if (!node) return out;
    if (node.type === 'pane') {
        if (dashboardModules[node.module]) out.push(node);
        return out;
    }
    if (node.type === 'split' && Array.isArray(node.children)) {
        collectLeafPanes(node.children[0], out);
        collectLeafPanes(node.children[1], out);
    }
    return out;
}

function isMacroContainerKey(modKey) {
    if (modKey === 'money') return true;
    if (macroDefaultTrees[modKey]) return true;
    if (modKey === 'calendar' && typeof renderCalendarAtomGrid === 'function') return true;
    if (modKey === 'diet' && typeof renderDietAtomToday === 'function') return true;
    if (modKey === 'gym' && typeof renderGymAtomToday === 'function') return true;
    if (modKey === 'streak' && typeof renderStreakAtomGrid === 'function') return true;
    if (modKey === 'uni' && typeof renderUniAtomRoadmap === 'function') return true;
    if (modKey === 'notes' && typeof renderNotesAtomBrowse === 'function') return true;
    return false;
}

function sanitizeLayoutTree(node, seenModules = new Set()) {
    if (!node) return null;
    if (node.type === 'pane') {
        let mod = node.module;
        if (mod === 'daily') mod = 'tasks';
        if (mod === 'health') mod = 'diet';
        if (isMacroContainerKey(mod)) {
            const expanded = getMacroDefaultSubtree(mod);
            if (expanded.type !== 'pane' || expanded.module !== mod) {
                return sanitizeLayoutTree(expanded, seenModules);
            }
        }
        if (!dashboardModules[mod] || seenModules.has(mod)) return null;
        seenModules.add(mod);
        node.module = mod;
        if (!node.id) node.id = 'pane_' + Math.random().toString(36).slice(2, 9);
        return node;
    }
    if (node.type === 'split' && Array.isArray(node.children)) {
        const left = sanitizeLayoutTree(node.children[0], seenModules);
        const right = sanitizeLayoutTree(node.children[1], seenModules);
        if (!left && !right) return null;
        if (!left) return right;
        if (!right) return left;
        node.children = [left, right];
        node.ratio = Math.max(0.12, Math.min(0.88, parseFloat(node.ratio) || 0.5));
        if (!node.id) node.id = 'split_' + Math.random().toString(36).slice(2, 9);
        return node;
    }
    return null;
}

function removePaneById(node, targetPaneId) {
    if (!node) return null;
    if (node.type === 'pane') {
        return node.id === targetPaneId ? null : node;
    }
    if (node.type === 'split') {
        const c0 = removePaneById(node.children[0], targetPaneId);
        const c1 = removePaneById(node.children[1], targetPaneId);
        if (!c0 && !c1) return null;
        if (!c0) return c1;
        if (!c1) return c0;
        node.children = [c0, c1];
        return node;
    }
    return null;
}

function removePaneByModule(node, modKey) {
    if (!node) return null;
    if (node.type === 'pane') {
        return node.module === modKey ? null : node;
    }
    if (node.type === 'split') {
        const c0 = removePaneByModule(node.children[0], modKey);
        const c1 = removePaneByModule(node.children[1], modKey);
        if (!c0 && !c1) return null;
        if (!c0) return c1;
        if (!c1) return c0;
        node.children = [c0, c1];
        return node;
    }
    return null;
}

function replacePaneNode(node, targetPaneId, replacerFn) {
    if (!node) return null;
    if (node.type === 'pane') {
        if (node.id === targetPaneId) return replacerFn(node);
        return node;
    }
    if (node.type === 'split') {
        node.children[0] = replacePaneNode(node.children[0], targetPaneId, replacerFn);
        node.children[1] = replacePaneNode(node.children[1], targetPaneId, replacerFn);
        return node;
    }
    return node;
}

function getSubtreeMinWidth(node) {
    if (!node) return 150;
    if (node.type === 'pane') {
        const mod = dashboardModules[node.module];
        return mod ? mod.minW() : 200;
    }
    if (node.type === 'split') {
        const w0 = getSubtreeMinWidth(node.children[0]);
        const w1 = getSubtreeMinWidth(node.children[1]);
        return node.dir === 'row' ? (w0 + w1 + 6) : Math.max(w0, w1);
    }
    return 200;
}

function getSubtreeMinHeight(node) {
    if (!node) return 140;
    if (node.type === 'pane') {
        const mod = dashboardModules[node.module];
        return mod ? mod.minH() : 160;
    }
    if (node.type === 'split') {
        const h0 = getSubtreeMinHeight(node.children[0]);
        const h1 = getSubtreeMinHeight(node.children[1]);
        return node.dir === 'col' ? (h0 + h1 + 6) : Math.max(h0, h1);
    }
    return 160;
}

// ============================================================================
// SCELTA SCHERMATA DI AVVIO (STARTUP VIEW)
// ============================================================================

function applyStartupViewPreferenceOnBoot() {
    if (!startupView || startupView === 'last') {
        layoutTree = sanitizeLayoutTree(layoutTree, new Set());
        return;
    }
    if (startupView === 'zero') {
        layoutTree = null;
        return;
    }
    if (startupView.startsWith('mod:')) {
        const modKey = startupView.slice(4);
        if (dashboardModules[modKey]) {
            const node = MACRO_SUBMODULES_MAP[modKey] ? getMacroDefaultSubtree(modKey) : makePaneNode(modKey);
            layoutTree = sanitizeLayoutTree(node, new Set());
            return;
        }
    }
    if (startupView.startsWith('preset:')) {
        const presetId = startupView.slice(7);
        const p = workspacePresets.find(x => x.id === presetId);
        if (p && p.tree !== undefined) {
            layoutTree = p.tree ? JSON.parse(JSON.stringify(p.tree)) : null;
            return;
        }
    }
    layoutTree = sanitizeLayoutTree(layoutTree, new Set());
}

function setStartupViewPreference(modeStr) {
    startupView = modeStr || 'last';
    saveWorkspaceState();
    updateWorkspaceDropdownUI();

    let label = 'Last Active Layout';
    if (startupView === 'zero') label = '0 // Zero-UI';
    else if (startupView.startsWith('mod:')) {
        const m = dashboardModules[startupView.slice(4)];
        if (m) label = m.name;
    } else if (startupView.startsWith('preset:')) {
        const p = workspacePresets.find(x => x.id === startupView.slice(7));
        if (p) label = p.name;
    }
    if (typeof showToast === 'function') {
        showToast(`[STARTUP] ${label}`);
    }
}

// ============================================================================
// RENDERIZZAZIONE PRINCIPALE DEL WORKSPACE TILING
// ============================================================================

function initDashboard() {
    applyStartupViewPreferenceOnBoot();
    initCustomPointerDragEngine();
    renderQuadrantLayout();
}

function returnAllModulesToRegistry() {
    const registry = document.getElementById('module-registry');
    if (!registry) return;
    ALL_MODULE_KEYS.forEach(key => {
        const modEl = document.getElementById(dashboardModules[key].id);
        if (modEl && modEl.parentElement !== registry) {
            registry.appendChild(modEl);
        }
    });
}

function toggleLayoutEditMode(forceState = null) {
    isLayoutEditMode = forceState !== null ? Boolean(forceState) : !isLayoutEditMode;
    document.body.classList.toggle('layout-edit-mode', isLayoutEditMode);
    if (!isLayoutEditMode) closeFloatingDockPopover();
    renderEditDockChips();
}

function renderEditDockChips() {
    const cont = document.getElementById('edit-dock-chips');
    if (!cont) return;
    cont.innerHTML = '';

    const activeLeafMods = new Set(collectLeafPanes(layoutTree).map(p => p.module));

    PRIMARY_MODULE_KEYS.forEach(modKey => {
        const subKeys = MACRO_SUBMODULES_MAP[modKey] || [modKey];
        const isMounted = activeLeafMods.has(modKey) || subKeys.some(sk => activeLeafMods.has(sk));

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:inline-flex; align-items:center; flex-shrink:0;';

        const chip = document.createElement('div');
        chip.className = `draggable-mod-chip ${isMounted ? 'in-use' : ''}`;
        chip.textContent = `${isMounted ? '✓ ' : '+ '}${dashboardModules[modKey].name.toUpperCase()}`;

        bindCustomPointerDragSource(chip, modKey, null, () => {
            addModuleToTilingLayout(modKey);
        });
        wrap.appendChild(chip);

        // Tutti i Macro-Moduli hanno la freccia ▾ per accedere ai loro Sotto-Moduli (1 o N) e salvare il Default
        const dropBtn = document.createElement('button');
        dropBtn.type = 'button';
        dropBtn.className = 'btn btn-sm dock-sub-drop-btn';
        dropBtn.style.cssText = 'padding:var(--space-1) var(--space-2); margin-left:-1px; font-size:var(--font-2xs); border-color:var(--border-bright);';
        dropBtn.textContent = '▾';
        dropBtn.onclick = (e) => {
            e.stopPropagation();
            openFloatingDockPopover(dropBtn, modKey);
        };
        wrap.appendChild(dropBtn);

        cont.appendChild(wrap);
    });
}

function addModuleToTilingLayout(modKey) {
    if (!dashboardModules[modKey]) return;

    if (isMacroContainerKey(modKey)) {
        layoutTree = getMacroDefaultSubtree(modKey);
        renderQuadrantLayout();
        return;
    }

    const leaves = collectLeafPanes(layoutTree);

    if (leaves.some(l => l.module === modKey)) {
        if (isLayoutEditMode && leaves.length > 1) {
            layoutTree = removePaneByModule(layoutTree, modKey);
            renderQuadrantLayout();
        } else {
            dashboardModules[modKey].render();
        }
        return;
    }

    if (!layoutTree || leaves.length === 0) {
        layoutTree = makePaneNode(modKey);
        renderQuadrantLayout();
        return;
    }

    let largestPaneId = leaves[leaves.length - 1].id;
    let largestArea = -1;
    let splitDirection = 'row';

    document.querySelectorAll('.quadrant-cell').forEach(cell => {
        const r = cell.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > largestArea) {
            largestArea = area;
            largestPaneId = cell.dataset.paneId;
            splitDirection = r.width >= r.height ? 'row' : 'col';
        }
    });

    const newPane = makePaneNode(modKey);
    layoutTree = replacePaneNode(layoutTree, largestPaneId, (oldPane) => {
        const ratio = splitDirection === 'row' ? getOptimalInitialRatio(oldPane.module, modKey) : 0.5;
        return makeSplitNode(splitDirection, ratio, oldPane, newPane);
    });

    renderQuadrantLayout();
}

function renderQuadrantLayout() {
    const wrapper = document.getElementById('app-content-wrapper');
    if (!wrapper) return;

    returnAllModulesToRegistry();
    wrapper.innerHTML = '';
    hideSnapPreview();

    layoutTree = sanitizeLayoutTree(layoutTree, new Set());
    const leaves = collectLeafPanes(layoutTree);

    activeSlots = leaves.map(p => p.module);
    activeLeft = activeSlots[0] || 'tasks';
    activeRight = activeSlots[1] || 'planner';

    renderEditDockChips();
    updateWorkspaceDropdownUI();
    renderHudPod();

    if (!layoutTree || leaves.length === 0) {
        layoutTree = null;
        saveWorkspaceState();
        return;
    }

    let paneCounter = { val: 0 };
    const domTree = buildTilingDomNode(layoutTree, paneCounter, leaves.length);
    if (domTree) wrapper.appendChild(domTree);

    leaves.forEach(leaf => {
        const modInfo = dashboardModules[leaf.module];
        if (modInfo) {
            try {
                modInfo.render();
                if ((leaf.module === 'm_chart' || leaf.module === 'money') && typeof drawSteppedChart === 'function') {
                    setTimeout(drawSteppedChart, 20);
                }
            } catch (err) {
                console.error(`[CORTEX] Error rendering module "${leaf.module}":`, err);
            }
        }
    });

    saveWorkspaceState();
}

function buildTilingDomNode(node, paneCounter, totalPanes) {
    if (!node) return null;

    if (node.type === 'pane') {
        paneCounter.val++;
        const modKey = node.module;
        const modInfo = dashboardModules[modKey];
        if (!modInfo) return null;

        const cell = document.createElement('div');
        cell.className = 'quadrant-cell';
        cell.dataset.paneId = node.id;
        cell.dataset.module = modKey;
        cell.style.flex = '1 1 0%';

        const bar = document.createElement('div');
        bar.className = 'quadrant-bar';
        bindCustomPointerDragSource(bar, modKey, node.id, null);

        const leftPart = document.createElement('div');
        leftPart.className = 'quadrant-bar-left';

        const dragHint = document.createElement('span');
        dragHint.style.cssText = 'color:var(--text-dim); font-weight:bold;';
        dragHint.textContent = '[::]';

        const select = document.createElement('select');
        select.className = 'quadrant-select';
        ALL_MODULE_KEYS.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.selected = (k === modKey);
            const inOther = activeSlots.includes(k) && k !== modKey;
            opt.textContent = `${dashboardModules[k].name.toUpperCase()}${inOther ? ' (SWAP)' : ''}`;
            select.appendChild(opt);
        });
        select.onchange = () => changePaneModuleById(node.id, select.value);

        leftPart.appendChild(dragHint);
        leftPart.appendChild(select);

        const rightActions = document.createElement('div');
        rightActions.className = 'quadrant-bar-actions';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'icon-btn delete';
        closeBtn.style.fontSize = '0.72rem';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => {
            layoutTree = removePaneById(layoutTree, node.id);
            renderQuadrantLayout();
        };
        rightActions.appendChild(closeBtn);

        bar.appendChild(leftPart);
        bar.appendChild(rightActions);

        const body = document.createElement('div');
        body.className = 'quadrant-body';

        body.addEventListener('mousedown', (e) => {
            if (!isLayoutEditMode || e.button !== 0) return;
            if (['SELECT', 'BUTTON', 'INPUT', 'TEXTAREA', 'OPTION'].includes(e.target.tagName)) return;
            e.preventDefault();
            e.stopPropagation();
            pointerDragCandidate = {
                module: modKey,
                sourcePaneId: node.id,
                startX: e.clientX,
                startY: e.clientY,
                onClick: null
            };
        }, true);

        const modElement = document.getElementById(modInfo.id);
        if (modElement) body.appendChild(modElement);

        cell.appendChild(bar);
        cell.appendChild(body);
        return cell;
    }

    if (node.type === 'split' && Array.isArray(node.children)) {
        const splitEl = document.createElement('div');
        splitEl.className = `tiling-split dir-${node.dir || 'row'}`;
        splitEl.style.flex = '1 1 0%';

        const childEl0 = buildTilingDomNode(node.children[0], paneCounter, totalPanes);
        const childEl1 = buildTilingDomNode(node.children[1], paneCounter, totalPanes);
        if (!childEl0 || !childEl1) return childEl0 || childEl1;

        const r = Math.max(0.125, Math.min(0.875, parseFloat(node.ratio) || 0.5));
        childEl0.style.flex = `${r} 1 0%`;
        childEl1.style.flex = `${1 - r} 1 0%`;

        const resizer = document.createElement('div');
        resizer.className = (node.dir || 'row') === 'row' ? 'resizer-vertical' : 'resizer-horizontal';

        attachSplitResizer(resizer, splitEl, node, childEl0, childEl1);

        splitEl.appendChild(childEl0);
        splitEl.appendChild(resizer);
        splitEl.appendChild(childEl1);
        return splitEl;
    }

    return null;
}

// Resizer fluido a 60fps con requestAnimationFrame e blocco pointer-events sui figli
function attachSplitResizer(resizerEl, splitEl, splitNode, childEl0, childEl1) {
    resizerEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resizerEl.classList.add('dragging');
        document.body.classList.add('is-resizing-split');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = splitNode.dir === 'row' ? 'ew-resize' : 'ns-resize';

        let rafId = null;

        const onMouseMove = (moveEvent) => {
            const clientX = moveEvent.clientX;
            const clientY = moveEvent.clientY;

            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const rect = splitEl.getBoundingClientRect();

                if (splitNode.dir === 'row') {
                    const totalW = rect.width;
                    if (totalW <= 100) return;

                    const minW0 = getSubtreeMinWidth(splitNode.children[0]);
                    const minW1 = getSubtreeMinWidth(splitNode.children[1]);

                    let minRatio = minW0 / totalW;
                    let maxRatio = (totalW - minW1) / totalW;

                    if (minRatio > maxRatio) {
                        const sumMin = minW0 + minW1;
                        minRatio = maxRatio = minW0 / (sumMin || 1);
                    }

                    minRatio = Math.max(0.125, Math.min(0.875, minRatio));
                    maxRatio = Math.max(minRatio, Math.min(0.875, maxRatio));

                    const rawRatio = (clientX - rect.left) / totalW;
                    const clampedRatio = Math.max(minRatio, Math.min(maxRatio, rawRatio));

                    splitNode.ratio = clampedRatio;
                    childEl0.style.flex = `${clampedRatio} 1 0%`;
                    childEl1.style.flex = `${1 - clampedRatio} 1 0%`;
                } else {
                    const totalH = rect.height;
                    if (totalH <= 100) return;

                    const minH0 = getSubtreeMinHeight(splitNode.children[0]);
                    const minH1 = getSubtreeMinHeight(splitNode.children[1]);

                    let minRatio = Math.max(0.12, minH0 / totalH);
                    let maxRatio = Math.min(0.88, (totalH - minH1) / totalH);
                    if (minRatio > maxRatio) minRatio = maxRatio = 0.5;

                    const rawRatio = (clientY - rect.top) / totalH;
                    const clampedRatio = Math.max(minRatio, Math.min(maxRatio, rawRatio));

                    splitNode.ratio = clampedRatio;
                    childEl0.style.flex = `${clampedRatio} 1 0%`;
                    childEl1.style.flex = `${1 - clampedRatio} 1 0%`;
                }
            });
        };

        const onMouseUp = () => {
            if (rafId) cancelAnimationFrame(rafId);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            resizerEl.classList.remove('dragging');
            document.body.classList.remove('is-resizing-split');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            saveWorkspaceState();
            if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
            if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
            if ((activeSlots.includes('m_chart') || activeSlots.includes('money')) && typeof drawSteppedChart === 'function') {
                setTimeout(drawSteppedChart, 15);
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// ============================================================================
// MOTORE CUSTOM MOUSE DRAG & SNAP
// ============================================================================

function bindCustomPointerDragSource(el, modKey, sourcePaneId, onClickCallback) {
    el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (['SELECT', 'BUTTON', 'INPUT', 'OPTION'].includes(e.target.tagName)) return;

        e.preventDefault();
        pointerDragCandidate = {
            module: modKey,
            sourcePaneId: sourcePaneId,
            startX: e.clientX,
            startY: e.clientY,
            onClick: onClickCallback
        };
    });
}

function initCustomPointerDragEngine() {
    window.addEventListener('mousemove', (e) => {
        if (!pointerDragCandidate) return;

        const dist = Math.hypot(e.clientX - pointerDragCandidate.startX, e.clientY - pointerDragCandidate.startY);
        if (!isPointerDragging && dist > 6) {
            isPointerDragging = true;
            closeFloatingDockPopover();
            const ghost = ensureDragGhostElement();
            const modName = dashboardModules[pointerDragCandidate.module]?.name || pointerDragCandidate.module;
            ghost.textContent = `[:: ${modName.toUpperCase()}]`;
            ghost.style.display = 'block';
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';
        }

        if (isPointerDragging) {
            const ghost = ensureDragGhostElement();
            ghost.style.left = `${e.clientX + 14}px`;
            ghost.style.top = `${e.clientY + 14}px`;
            computePointerSnapTarget(e.clientX, e.clientY);
        }
    });

    window.addEventListener('mouseup', () => {
        if (!pointerDragCandidate) return;

        if (isPointerDragging) {
            const draggedMod = pointerDragCandidate.module;
            const action = currentSnapAction;

            isPointerDragging = false;
            pointerDragCandidate = null;
            currentSnapAction = null;

            if (dragGhostEl) dragGhostEl.style.display = 'none';
            hideSnapPreview();
            document.body.style.userSelect = '';
            document.body.style.cursor = '';

            if (action) {
                executeSnapDrop(draggedMod, action);
            }
        } else {
            const cb = pointerDragCandidate.onClick;
            pointerDragCandidate = null;
            if (typeof cb === 'function') cb();
        }
    });
}

function computePointerSnapTarget(clientX, clientY) {
    const wrapper = document.getElementById('app-content-wrapper');
    if (!wrapper) return;

    const wrapRect = wrapper.getBoundingClientRect();
    if (
        clientX < wrapRect.left || clientX > wrapRect.right ||
        clientY < wrapRect.top || clientY > wrapRect.bottom
    ) {
        currentSnapAction = null;
        hideSnapPreview();
        return;
    }

    const gx = (clientX - wrapRect.left) / wrapRect.width;
    const gy = (clientY - wrapRect.top) / wrapRect.height;

    if (!layoutTree) {
        currentSnapAction = { scope: 'root_empty', zone: 'full' };
        showSnapPreview(wrapRect.left, wrapRect.top, wrapRect.width, wrapRect.height, 'FULL SCREEN');
        return;
    }

    const cornerT = 0.16;
    if (gx < cornerT && gy < cornerT) {
        currentSnapAction = { scope: 'screen_corner', corner: 'tl' };
        showSnapPreview(wrapRect.left, wrapRect.top, wrapRect.width / 2, wrapRect.height / 2, 'TOP-LEFT');
        return;
    }
    if (gx > (1 - cornerT) && gy < cornerT) {
        currentSnapAction = { scope: 'screen_corner', corner: 'tr' };
        showSnapPreview(wrapRect.left + wrapRect.width / 2, wrapRect.top, wrapRect.width / 2, wrapRect.height / 2, 'TOP-RIGHT');
        return;
    }
    if (gx < cornerT && gy > (1 - cornerT)) {
        currentSnapAction = { scope: 'screen_corner', corner: 'bl' };
        showSnapPreview(wrapRect.left, wrapRect.top + wrapRect.height / 2, wrapRect.width / 2, wrapRect.height / 2, 'BOTTOM-LEFT');
        return;
    }
    if (gx > (1 - cornerT) && gy > (1 - cornerT)) {
        currentSnapAction = { scope: 'screen_corner', corner: 'br' };
        showSnapPreview(wrapRect.left + wrapRect.width / 2, wrapRect.top + wrapRect.height / 2, wrapRect.width / 2, wrapRect.height / 2, 'BOTTOM-RIGHT');
        return;
    }

    const outerEdgeT = 0.07;
    if (gx < outerEdgeT) {
        currentSnapAction = { scope: 'root_edge', edge: 'left' };
        showSnapPreview(wrapRect.left, wrapRect.top, wrapRect.width / 2, wrapRect.height, 'LEFT HALF');
        return;
    }
    if (gx > (1 - outerEdgeT)) {
        currentSnapAction = { scope: 'root_edge', edge: 'right' };
        showSnapPreview(wrapRect.left + wrapRect.width / 2, wrapRect.top, wrapRect.width / 2, wrapRect.height, 'RIGHT HALF');
        return;
    }
    if (gy < outerEdgeT) {
        currentSnapAction = { scope: 'root_edge', edge: 'top' };
        showSnapPreview(wrapRect.left, wrapRect.top, wrapRect.width, wrapRect.height / 2, 'TOP HALF');
        return;
    }
    if (gy > (1 - outerEdgeT)) {
        currentSnapAction = { scope: 'root_edge', edge: 'bottom' };
        showSnapPreview(wrapRect.left, wrapRect.top + wrapRect.height / 2, wrapRect.width, wrapRect.height / 2, 'BOTTOM HALF');
        return;
    }

    const targetEl = document.elementFromPoint(clientX, clientY);
    const paneEl = targetEl ? targetEl.closest('.quadrant-cell') : null;
    if (!paneEl) {
        currentSnapAction = null;
        hideSnapPreview();
        return;
    }

    const paneId = paneEl.dataset.paneId;
    const pRect = paneEl.getBoundingClientRect();
    const rx = (clientX - pRect.left) / pRect.width;
    const ry = (clientY - pRect.top) / pRect.height;

    const edgeT = 0.28;
    if (rx < edgeT) {
        currentSnapAction = { scope: 'pane', paneId, zone: 'left' };
        showSnapPreview(pRect.left, pRect.top, pRect.width / 2, pRect.height, 'SPLIT LEFT');
    } else if (rx > (1 - edgeT)) {
        currentSnapAction = { scope: 'pane', paneId, zone: 'right' };
        showSnapPreview(pRect.left + pRect.width / 2, pRect.top, pRect.width / 2, pRect.height, 'SPLIT RIGHT');
    } else if (ry < edgeT) {
        currentSnapAction = { scope: 'pane', paneId, zone: 'top' };
        showSnapPreview(pRect.left, pRect.top, pRect.width, pRect.height / 2, 'SPLIT TOP');
    } else if (ry > (1 - edgeT)) {
        currentSnapAction = { scope: 'pane', paneId, zone: 'bottom' };
        showSnapPreview(pRect.left, pRect.top + pRect.height / 2, pRect.width, pRect.height / 2, 'SPLIT BOTTOM');
    } else {
        currentSnapAction = { scope: 'pane', paneId, zone: 'center' };
        showSnapPreview(pRect.left, pRect.top, pRect.width, pRect.height, 'REPLACE');
    }
}

function showSnapPreview(left, top, width, height, labelText) {
    const overlay = document.getElementById('snap-preview-overlay');
    const lbl = document.getElementById('snap-preview-label');
    if (!overlay || !lbl) return;

    overlay.style.display = 'flex';
    overlay.style.left = `${Math.round(left)}px`;
    overlay.style.top = `${Math.round(top)}px`;
    overlay.style.width = `${Math.round(width)}px`;
    overlay.style.height = `${Math.round(height)}px`;
    lbl.textContent = labelText;
}

function hideSnapPreview() {
    const overlay = document.getElementById('snap-preview-overlay');
    if (overlay) overlay.style.display = 'none';
}

function getOptimalInitialRatio(modLeft, modRight) {
    if (modLeft === 'tasks' && modRight === 'planner') return 0.38;
    if (modLeft === 'planner' && modRight === 'tasks') return 0.62;
    return 0.5;
}

function executeSnapDrop(modKey, action) {
    if (!dashboardModules[modKey] || !action) return;

    const createNodeForDrop = (k) => isMacroContainerKey(k) ? getMacroDefaultSubtree(k) : makePaneNode(k);

    if (action.scope === 'root_empty' || !layoutTree) {
        layoutTree = createNodeForDrop(modKey);
        renderQuadrantLayout();
        return;
    }

    if (action.scope === 'pane' && action.zone === 'center') {
        if (isMacroContainerKey(modKey)) {
            layoutTree = replacePaneNode(layoutTree, action.paneId, () => getMacroDefaultSubtree(modKey));
            renderQuadrantLayout();
        } else {
            changePaneModuleById(action.paneId, modKey);
        }
        return;
    }

    const existingLeafs = collectLeafPanes(layoutTree);
    const targetLeaf = existingLeafs.find(l => l.id === action.paneId);
    if (targetLeaf && targetLeaf.module === modKey && existingLeafs.length === 1) {
        return;
    }

    let cleanTree = removePaneByModule(layoutTree, modKey);
    if (!cleanTree) {
        layoutTree = createNodeForDrop(modKey);
        renderQuadrantLayout();
        return;
    }

    if (action.scope === 'root_edge') {
        const newPane = createNodeForDrop(modKey);
        const dir = (action.edge === 'left' || action.edge === 'right') ? 'row' : 'col';
        const isFirst = (action.edge === 'left' || action.edge === 'top');
        layoutTree = isFirst
            ? makeSplitNode(dir, 0.5, newPane, cleanTree)
            : makeSplitNode(dir, 0.5, cleanTree, newPane);
        renderQuadrantLayout();
        return;
    }

    if (action.scope === 'screen_corner') {
        const newPane = createNodeForDrop(modKey);
        const corner = action.corner;
        const isLeft = (corner === 'tl' || corner === 'bl');
        const isTop = (corner === 'tl' || corner === 'tr');

        if (cleanTree.type === 'split' && cleanTree.dir === 'row') {
            const sideIdx = isLeft ? 0 : 1;
            const existingSide = cleanTree.children[sideIdx];
            cleanTree.children[sideIdx] = isTop
                ? makeSplitNode('col', 0.5, newPane, existingSide)
                : makeSplitNode('col', 0.5, existingSide, newPane);
            layoutTree = cleanTree;
        } else {
            layoutTree = isLeft
                ? makeSplitNode('row', 0.5, newPane, cleanTree)
                : makeSplitNode('row', 0.5, cleanTree, newPane);
        }
        renderQuadrantLayout();
        return;
    }

    if (action.scope === 'pane') {
        const newPane = createNodeForDrop(modKey);
        const stillHasTarget = collectLeafPanes(cleanTree).some(l => l.id === action.paneId);

        if (!stillHasTarget) {
            const isFirst = (action.zone === 'left' || action.zone === 'top');
            const dir = (action.zone === 'left' || action.zone === 'right') ? 'row' : 'col';
            layoutTree = isFirst
                ? makeSplitNode(dir, 0.5, newPane, cleanTree)
                : makeSplitNode(dir, 0.5, cleanTree, newPane);
        } else {
            layoutTree = replacePaneNode(cleanTree, action.paneId, (oldPane) => {
                const dir = (action.zone === 'left' || action.zone === 'right') ? 'row' : 'col';
                const isFirst = (action.zone === 'left' || action.zone === 'top');
                const ratio = dir === 'row'
                    ? (isFirst ? getOptimalInitialRatio(modKey, oldPane.module) : getOptimalInitialRatio(oldPane.module, modKey))
                    : 0.5;
                return isFirst
                    ? makeSplitNode(dir, ratio, newPane, oldPane)
                    : makeSplitNode(dir, ratio, oldPane, newPane);
            });
        }
        renderQuadrantLayout();
    }
}

function changePaneModuleById(paneId, newModKey) {
    if (!dashboardModules[newModKey]) return;
    if (isMacroContainerKey(newModKey)) {
        layoutTree = replacePaneNode(layoutTree, paneId, () => getMacroDefaultSubtree(newModKey));
        renderQuadrantLayout();
        return;
    }
    const leaves = collectLeafPanes(layoutTree);
    const targetLeaf = leaves.find(l => l.id === paneId);
    if (!targetLeaf) return;

    const otherLeaf = leaves.find(l => l.module === newModKey && l.id !== paneId);
    if (otherLeaf) {
        otherLeaf.module = targetLeaf.module;
    }
    targetLeaf.module = newModKey;
    renderQuadrantLayout();
}

function setQuadrantCount(targetCount) {
    const n = parseInt(targetCount, 10) || 0;
    if (n <= 0) {
        layoutTree = null;
        renderQuadrantLayout();
        return;
    }
    if (!layoutTree) {
        layoutTree = makePaneNode('tasks');
        renderQuadrantLayout();
    }
}

function summonModule(modKey) {
    if (isHudMode) toggleHudMode(false);
    addModuleToTilingLayout(modKey);
}

function switchModule(side, rawModKey) {
    let modKey = rawModKey === 'daily' ? 'tasks' : (rawModKey === 'health' ? 'diet' : rawModKey);
    if (!dashboardModules[modKey]) return;
    const leaves = collectLeafPanes(layoutTree);
    if (leaves.length === 0) {
        layoutTree = isMacroContainerKey(modKey) ? getMacroDefaultSubtree(modKey) : makePaneNode(modKey);
        renderQuadrantLayout();
        return;
    }
    const targetLeaf = (side === 'right' && leaves.length >= 2) ? leaves[1] : leaves[0];
    changePaneModuleById(targetLeaf.id, modKey);
}

// ============================================================================
// MENU WORKSPACE NELLA FINESTRA SETTINGS (SENZA DESCRIZIONI FISSE, HOVER POPUP)
// ============================================================================

function updateWorkspaceDropdownUI() {
    const dropEl = document.getElementById('settings-workspace-container') || document.getElementById('dropdown-workspaces');
    if (!dropEl) return;

    const isLastStartup = (startupView === 'last');
    const isZeroStartup = (startupView === 'zero');
    const currentSingleStartupMod = startupView.startsWith('mod:') ? startupView.slice(4) : '';

    let singleModOptionsHtml = `<option value="">-- Module --</option>`;
    ALL_MODULE_KEYS.forEach(k => {
        singleModOptionsHtml += `<option value="mod:${k}" ${currentSingleStartupMod === k ? 'selected' : ''}>${dashboardModules[k].name}</option>`;
    });

    let html = `
        <div class="u-fs-2xs u-dim u-upper" style="padding:var(--space-2) var(--space-3); border-bottom:1px solid var(--border-color);">
            Startup Default
        </div>
        <div class="startup-option-row ${isLastStartup ? 'active' : ''}" onclick="setStartupViewPreference('last')">
            <span>Restore Last Active Layout</span>
            <span>${isLastStartup ? '★' : '[SET]'}</span>
        </div>
        <div class="startup-option-row ${isZeroStartup ? 'active' : ''}" onclick="setStartupViewPreference('zero')">
            <span>0 // Zero-UI</span>
            <span>${isZeroStartup ? '★' : '[SET]'}</span>
        </div>
        <div class="u-flex u-ai-center u-jc-between u-gap-2" style="padding:var(--space-2) var(--space-3); border-bottom:1px solid var(--border-color);">
            <span class="u-fs-xs u-muted">Single Module:</span>
            <select class="form-control form-control-sm" style="width:180px; padding:var(--space-1) var(--space-2);" onchange="if(this.value) setStartupViewPreference(this.value)">
                ${singleModOptionsHtml}
            </select>
        </div>

        <div class="u-fs-2xs u-dim u-upper u-mt-2" style="padding:var(--space-2) var(--space-3); border-bottom:1px solid var(--border-color);">
            Saved Views
        </div>
        <div id="settings-saved-views-list"></div>
        <div class="u-flex u-gap-2" style="padding:var(--space-3); background:var(--bg-sec); border-top:1px solid var(--border-color);">
            <input type="text" id="new-preset-name-input" class="form-control form-control-sm" placeholder="View name..." onkeydown="if(event.key==='Enter'){event.preventDefault(); saveCurrentWorkspacePreset('new-preset-name-input');}">
            <button class="btn btn-primary btn-sm" onclick="saveCurrentWorkspacePreset('new-preset-name-input')">[SAVE VIEW]</button>
        </div>
    `;

    dropEl.innerHTML = html;

    const listContainer = dropEl.querySelector('#settings-saved-views-list');
    if (workspacePresets.length === 0) {
        listContainer.innerHTML = `<div class="u-fs-xs u-dim" style="padding:var(--space-3);">[ NONE ]</div>`;
    } else {
        workspacePresets.forEach(p => {
            const pLeaves = p.tree ? collectLeafPanes(p.tree).map(l => dashboardModules[l.module]?.name || l.module.toUpperCase()) : [];
            const desc = pLeaves.length === 0 ? 'ZERO-UI' : pLeaves.join(' + ');
            const isPresetStartup = (startupView === `preset:${p.id}`);

            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:var(--space-2) var(--space-3); border-bottom:1px solid #1a1a1a; gap:var(--space-2);';
            row.onmouseenter = (e) => showPresetModulesHoverPopup(e, p.name, desc);
            row.onmousemove = movePresetModulesHoverPopup;
            row.onmouseleave = hidePresetModulesHoverPopup;

            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'cursor:pointer; flex:1; min-width:0; font-size:var(--font-xs); font-weight:bold; color:var(--text-main); overflow:hidden; text-overflow:ellipsis;';
            nameDiv.textContent = p.name;
            nameDiv.onclick = () => {
                hidePresetModulesHoverPopup();
                applyWorkspacePreset(p.id);
            };

            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'display:flex; align-items:center; gap:var(--space-1); flex-shrink:0;';
            actionsDiv.innerHTML = `
                <button class="startup-star-btn ${isPresetStartup ? 'active' : ''}">${isPresetStartup ? '★' : '☆'}</button>
                <button class="icon-btn delete">×</button>
            `;
            actionsDiv.children[0].onclick = () => setStartupViewPreference(`preset:${p.id}`);
            actionsDiv.children[1].onclick = () => {
                hidePresetModulesHoverPopup();
                deleteWorkspacePreset(p.id);
            };

            row.appendChild(nameDiv);
            row.appendChild(actionsDiv);
            listContainer.appendChild(row);
        });
    }
}

function applyWorkspacePreset(presetId) {
    const p = workspacePresets.find(x => x.id === presetId);
    if (!p) return;

    if (p.tree !== undefined) {
        layoutTree = p.tree ? JSON.parse(JSON.stringify(p.tree)) : null;
    }

    const dropEl = document.getElementById('dropdown-workspaces');
    if (dropEl) dropEl.classList.remove('show');
    renderQuadrantLayout();
    if (typeof showToast === 'function') showToast(`[VIEW] ${p.name}`);
}

function saveCurrentWorkspacePreset(inputId = 'new-preset-name-input') {
    const inp = document.getElementById(inputId);
    const name = (inp ? inp.value : '').trim().toUpperCase();
    if (!name) return;

    const clonedTree = layoutTree ? JSON.parse(JSON.stringify(layoutTree)) : null;
    const existing = workspacePresets.find(p => p.name === name);
    if (existing) {
        existing.tree = clonedTree;
    } else {
        workspacePresets.push({
            id: 'ws_' + Date.now(),
            name: name,
            tree: clonedTree
        });
    }

    if (inp) inp.value = '';
    saveWorkspaceState();
    updateWorkspaceDropdownUI();
    if (typeof showToast === 'function') showToast(`[SAVED] "${name}"`);
}

function deleteWorkspacePreset(presetId) {
    if (startupView === `preset:${presetId}`) {
        startupView = 'last';
    }
    workspacePresets = workspacePresets.filter(p => p.id !== presetId);
    saveWorkspaceState();
    updateWorkspaceDropdownUI();
}

window.onclick = function(event) {
    if (!event.target.matches('.dropdown-btn') && !event.target.closest('.module-title')) {
        const dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            dropdowns[i].classList.remove('show');
        }
    }
};

document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
    const termOverlay = document.getElementById('terminalOverlay');
    if (anyModalOpen || (termOverlay && termOverlay.style.display === 'flex')) return;

    if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        toggleLayoutEditMode();
    }
});

// ============================================================================
// SOVRAPPOSIZIONE DIRETTA MODULI (USATA DA QUICK-SWITCHER V E BARRA DSL)
// ============================================================================

function resolveModuleKeyFromText(rawText) {
    const q = (rawText || '').trim().toLowerCase();
    if (!q) return null;
    if (dashboardModules[q]) return q;

    const aliasesMap = {
        'daily tasks': 'tasks',
        'daily': 'tasks',
        'task': 'tasks',
        'note': 'notes',
        'weekly planner': 'planner',
        'week': 'planner',
        'day planner': 'plan',
        'plan tomorrow': 'plan',
        'plan': 'plan',
        'monthly calendar': 'calendar',
        'cal': 'calendar',
        'calendar grid': 'cal_grid',
        'day events': 'cal_agenda',
        'agenda': 'cal_agenda',
        'diet & macros': 'diet',
        'macros': 'diet',
        'diet today': 'diet_today',
        'diet week': 'diet_week',
        'gym split': 'gym',
        'workout': 'gym',
        'palestra': 'gym',
        'gym today': 'gym_today',
        'today & streak': 'streak',
        'consistency': 'streak',
        'streak grid': 'streak_grid',
        'focus ledger': 'streak_ledger',
        'university': 'uni',
        'uni roadmap': 'uni_roadmap',
        'uni lectures': 'uni_lectures',
        'uni appeals': 'uni_appeals',
        'uni libretto': 'uni_libretto',
        'money summary': 'm_summary',
        'summary': 'm_summary',
        'money vaults': 'm_vaults',
        'vaults': 'm_vaults',
        'money chart': 'm_chart',
        'chart': 'm_chart',
        'money transactions': 'm_tx',
        'money tx': 'm_tx',
        'transactions': 'm_tx',
        'tx': 'm_tx',
        'money bills': 'm_bills',
        'bills': 'm_bills',
        'money analytics': 'm_analytics',
        'analytics': 'm_analytics',
        'cats': 'm_analytics',
        'money incubator': 'm_incubator',
        'incubator': 'm_incubator',
        'wishlist': 'm_incubator',
        'notes write': 'notes_write',
        'write': 'notes_write',
        'notes browse': 'notes_browse',
        'browse': 'notes_browse',
        'notes graph': 'notes_graph',
        'graph': 'notes_graph',
        'math': 'math', // <-- Aggiungi
        'drill': 'math', // <-- Aggiungi
        'problems': 'math' // <-- Aggiungi
    };
    if (aliasesMap[q]) return aliasesMap[q];

    for (const k of ALL_MODULE_KEYS) {
        const nameLower = dashboardModules[k].name.toLowerCase();
        if (k.startsWith(q) || nameLower === q || nameLower.startsWith(q)) {
            return k;
        }
    }
    return null;
}

function setModulesView(modKeysArray) {
    const validMods = [];
    (modKeysArray || []).forEach(k => {
        const resolved = dashboardModules[k] ? k : resolveModuleKeyFromText(k);
        if (resolved && !validMods.includes(resolved)) {
            validMods.push(resolved);
        }
    });

    if (validMods.length === 0) return false;

    if (isHudMode) {
        toggleHudMode(false);
    }

    const makeNodeForKey = (k) => {
        if (isMacroContainerKey(k)) return getMacroDefaultSubtree(k);
        return makePaneNode(k);
    };

    const buildBalancedSubtree = (keys, depth = 0) => {
        if (keys.length === 1) return makeNodeForKey(keys[0]);
        if (keys.length === 2) {
            const dir = (depth % 2 === 0) ? 'row' : 'col';
            const ratio = dir === 'row' ? getOptimalInitialRatio(keys[0], keys[1]) : 0.5;
            return makeSplitNode(dir, ratio, makeNodeForKey(keys[0]), makeNodeForKey(keys[1]));
        }
        const mid = Math.ceil(keys.length / 2);
        const leftKeys = keys.slice(0, mid);
        const rightKeys = keys.slice(mid);
        const dir = (depth % 2 === 0) ? 'row' : 'col';
        const ratio = leftKeys.length / keys.length;
        return makeSplitNode(dir, ratio, buildBalancedSubtree(leftKeys, depth + 1), buildBalancedSubtree(rightKeys, depth + 1));
    };

    layoutTree = buildBalancedSubtree(validMods, 0);
    renderQuadrantLayout();

    if (typeof showToast === 'function') {
        const names = validMods.map(k => dashboardModules[k].name).join(' + ');
        showToast(`[VIEW] ${names}`);
    }
    return true;
}

// ============================================================================
// HUD: the small always-on-top window (H) & MULTI-MONITOR PHYSICAL MEMORY
// ============================================================================
// Same cards as Today (timer, timeline, study windows, tasks, meals, routines), in the order and
// with the ones you choose in Settings → HUD; "compact" keeps only the timer and the search.
// The search box on top is the command bar: it searches your data and runs commands right there.
// Anything that needs the whole app (opening a note, a section, editing a study window) leaves the HUD.

let isHudMode = false;
let isHudTempExpanded = false;

let savedNormalPhysicalSize = null;
let savedNormalPhysicalPos = null;
let savedHudPodPhysicalPos = null;

const HUD_POD_WIDTH = 340;
function hudPodSize() {
    const compact = typeof getPref === 'function' && getPref('hudCompact');
    return { width: HUD_POD_WIDTH, height: compact ? 236 : 600 };
}

let hudPodStagedCommands = [];
let hudLastSig = '';
let hudLastCompact = null;

function hudCardKeys() {
    if (typeof getPref !== 'function') return ['now', 'timeline', 'tasks'];
    if (getPref('hudCompact')) return ['now'];
    return (getPref('hudCards') || []).filter(c => c && c.on).map(c => c.key);
}

// opts.tick: called every second by the clock; redraws only when the minute or the timer state changed
function renderHudPod(opts = {}) {
    if (!isHudMode) return;
    const pod = document.getElementById('hud-tactical-pod');
    const body = document.getElementById('hud-pod-body');
    if (!pod || !body || !window.CortexToday) return;

    const compact = typeof getPref === 'function' && getPref('hudCompact');
    pod.classList.toggle('is-compact', Boolean(compact));
    if (hudLastCompact !== null && compact !== hudLastCompact && !isHudTempExpanded) {
        const sz = hudPodSize();
        applyTauriWindowGeometry(sz.width, sz.height, true, null);
    }
    hudLastCompact = compact;

    const running = typeof focusPlaylist !== 'undefined' && focusPlaylist.length > 0 && currentPlaylistIndex < focusPlaylist.length;
    const keys = hudCardKeys();
    const sig = [new Date().getMinutes(), running ? `${currentPlaylistIndex}:${isPomodoroPaused}` : 'idle', keys.join(',')].join('|');
    if (opts.tick && sig === hudLastSig) {
        if (running) CortexToday.liveTick(body);
        return;
    }
    hudLastSig = sig;
    const keep = body.scrollTop;
    const snap = window.CortexMotion ? CortexMotion.snapshot(body) : null;
    const html = keys.map(k => {
        const h = CortexToday.cardHtml(k);
        return h ? `<div class="today-card hud-card" data-card="${k}">${h}</div>` : '';
    }).join('');
    body.innerHTML = html || '<div class="today-empty">Nothing to show. Choose the HUD cards in Settings → HUD.</div>';
    CortexToday.bindCards(body);
    body.scrollTop = keep;
    if (snap) CortexMotion.replay(body, snap);
}

// What needs the whole app leaves the HUD first
function leaveHudFor(fn) {
    if (isHudMode) toggleHudMode(false);
    if (typeof fn === 'function') setTimeout(fn, 60);
}

// ---------------------------------------------------------------------------
// The search box: the same results as the command bar, shown inside the HUD
// ---------------------------------------------------------------------------
let hudItems = [];
let hudSel = 0;
const HUD_APP_GROUPS = ['FOUND IN YOUR DATA', 'IN YOUR NOTES', 'GO TO', 'SWITCHED OFF'];

function hudBuildGroups(q) {
    const groups = typeof cortexPaletteBuild === 'function' ? cortexPaletteBuild(q) : [];
    // notes too (the command bar leaves them out; here a quick look-up is the point)
    if (q.trim().length >= 3 && typeof cortexSearch === 'function') {
        const notes = cortexSearch(q, 30).filter(r => r.kind === 'Note' || r.kind === 'Notes').slice(0, 3)
            .map(r => ({ label: r.title, hint: r.sub, run: r.run }));
        if (notes.length) {
            const at = groups.findIndex(g => g.title === 'GO TO');
            groups.splice(at < 0 ? groups.length : at, 0, { title: 'IN YOUR NOTES', items: notes });
        }
    }
    // the "nothing matched" hint only when nothing else is there
    const shown = groups.length > 1 ? groups.filter(g => g.title !== 'NOTHING MATCHED') : groups;
    return shown.map(g => Object.assign({}, g, {
        items: g.items.map(it => Object.assign({}, it, { where: g.title === 'ASK AI' ? 'ai' : (HUD_APP_GROUPS.includes(g.title) ? 'app' : 'here') }))
    }));
}

function renderHudResults() {
    const input = document.getElementById('hud-pod-input');
    const box = document.getElementById('hud-pod-results');
    if (!input || !box) return;
    const open = document.activeElement === input;
    if (!open) { box.hidden = true; box.innerHTML = ''; hudItems = []; return; }
    const groups = hudBuildGroups(input.value);
    hudItems = [];
    const esc = (x) => (typeof escapeHtml === 'function' ? escapeHtml(String(x ?? '')) : String(x ?? ''));
    box.innerHTML = groups.filter(g => g.items.length).map(g => `
        <div class="hud-res-group">${esc(g.title)}</div>
        ${g.items.map(it => {
            const i = hudItems.push(it) - 1;
            return `<div class="hud-res-item ${i === hudSel ? 'active' : ''}" data-hud-res="${i}" role="option">
                <span class="hud-res-label">${esc(it.label)}${it.where === 'app' ? ' <span class="dim">↗</span>' : ''}</span>
                <span class="hud-res-hint">${esc(it.hint || '')}</span>
            </div>`;
        }).join('')}`).join('');
    if (hudSel >= hudItems.length) hudSel = 0;
    box.hidden = !hudItems.length;
}

function paintHudSelection() {
    document.querySelectorAll('#hud-pod-results .hud-res-item').forEach((r, i) => r.classList.toggle('active', i === hudSel));
    document.querySelector('#hud-pod-results .hud-res-item.active')?.scrollIntoView({ block: 'nearest' });
}

async function hudAskAi(text) {
    const input = document.getElementById('hud-pod-input');
    if (typeof translateNaturalLanguageToDslWithGemini !== 'function' || !input) return;
    input.disabled = true;
    const oldPh = input.placeholder;
    input.value = '';
    input.placeholder = 'AI is reading it…';
    try {
        const cmds = await translateNaturalLanguageToDslWithGemini(text);
        if (Array.isArray(cmds) && cmds.length > 0) { hudPodStagedCommands.push(...cmds); renderHudPodStaging(); }
    } catch (err) {
        if (typeof showToast === 'function') showToast(`[AI ERROR] ${err.message}`);
    }
    input.disabled = false;
    input.placeholder = oldPh;
    input.focus();
}

function fillHudInput(it) {
    const input = document.getElementById('hud-pod-input');
    if (!it || !input || (it.fill === undefined && !it.cmd)) return false;
    input.value = it.fill !== undefined ? it.fill : it.cmd;
    hudSel = 0;
    renderHudResults();
    return true;
}

function activateHudItem(it) {
    const input = document.getElementById('hud-pod-input');
    if (!it || !input) return;
    const typed = input.value.trim();
    if (it.where === 'ai') { hudAskAi(typed); return; }
    if (!it.run) { fillHudInput(it); return; }      // a completion or a suggestion to fill in
    input.value = '';
    input.blur();
    renderHudResults();
    if (it.where === 'app') { leaveHudFor(it.run); return; }
    hudWatchNav = true;
    try { it.run(); } finally { hudWatchNav = false; }
    renderHudPod();
}

// Something run from the HUD opened a section of the app: show the app
let hudWatchNav = false;
function wrapNavigationForHud() {
    if (typeof navigateToSection !== 'function' || navigateToSection.__hud) return;
    const orig = navigateToSection;
    const wrapped = function (...args) {
        if (isHudMode && hudWatchNav) toggleHudMode(false);
        return orig.apply(this, args);
    };
    wrapped.__hud = true;
    window.navigateToSection = navigateToSection = wrapped;
}

function wireHudPod() {
    wrapNavigationForHud();
    const input = document.getElementById('hud-pod-input');
    const box = document.getElementById('hud-pod-results');
    const body = document.getElementById('hud-pod-body');
    if (!input || input.dataset.wired) return;
    input.dataset.wired = '1';
    input.addEventListener('focus', () => { hudSel = 0; renderHudResults(); });
    input.addEventListener('blur', () => setTimeout(renderHudResults, 120));
    input.addEventListener('input', () => { hudSel = 0; renderHudResults(); });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (hudItems.length) { hudSel = (hudSel + 1) % hudItems.length; paintHudSelection(); } return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); if (hudItems.length) { hudSel = (hudSel - 1 + hudItems.length) % hudItems.length; paintHudSelection(); } return; }
        if (e.key === 'Tab') { e.preventDefault(); fillHudInput(hudItems[hudSel]); return; }
        if (e.key === 'Escape') {
            e.preventDefault();
            hudPodStagedCommands = [];
            renderHudPodStaging();
            input.value = '';
            input.blur();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (!val) { if (hudPodStagedCommands.length > 0) confirmHudPodStaging(); return; }
            // several commands separated by ";" → queued for review
            if (val.includes(';')) {
                hudPodStagedCommands.push(...val.split(';').map(x => x.trim()).filter(Boolean));
                input.value = '';
                renderHudPodStaging();
                renderHudResults();
                return;
            }
            if (hudItems[hudSel]) { activateHudItem(hudItems[hudSel]); return; }
            if (typeof isValidDslCommand === 'function' && isValidDslCommand(val)) {
                executeTerminalCommand(val);
                input.value = '';
                renderHudResults();
                renderHudPod();
            }
        }
    });
    if (box) {
        box.addEventListener('mousedown', (e) => {
            const row = e.target.closest('[data-hud-res]');
            if (!row) return;
            e.preventDefault();
            hudSel = parseInt(row.dataset.hudRes, 10);
            activateHudItem(hudItems[hudSel]);
        });
        box.addEventListener('mousemove', (e) => {
            const row = e.target.closest('[data-hud-res]');
            if (row && parseInt(row.dataset.hudRes, 10) !== hudSel) { hudSel = parseInt(row.dataset.hudRes, 10); paintHudSelection(); }
        });
    }
    // Cards: opening a section or editing a study window happens in the whole app
    if (body) {
        body.addEventListener('click', (e) => {
            if (e.target.closest('[data-nav], [data-study-edit], [data-study-new]')) toggleHudMode(false);
        }, true);
    }
    // In the HUD, Ctrl+K and / go to its own search box
    window.addEventListener('keydown', (e) => {
        if (!isHudMode || isHudTempExpanded) return;
        const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement ? document.activeElement.tagName : '');
        if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !inField)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            input.focus();
        }
    }, true);
}

function renderHudPodStaging() {
    const box = document.getElementById('hud-pod-staging');
    if (!box) return;

    if (hudPodStagedCommands.length === 0) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }

    box.style.display = 'flex';
    box.innerHTML = `
        <div class="u-flex u-jc-between u-ai-center u-fs-2xs u-gold u-bold">
            <span>STAGED (${hudPodStagedCommands.length})</span>
            <div class="u-flex u-gap-1">
                <button type="button" class="btn btn-sm u-fs-2xs" style="padding:1px var(--space-1);" id="hud-stg-cancel">[ESC]</button>
                <button type="button" class="btn btn-primary btn-sm u-fs-2xs" style="padding:1px var(--space-2);" id="hud-stg-run">[RUN]</button>
            </div>
        </div>
        <div class="u-col u-gap-1" id="hud-stg-list" style="display:flex;"></div>
    `;

    const listEl = box.querySelector('#hud-stg-list');
    hudPodStagedCommands.forEach((cmd, idx) => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-control form-control-sm';
        inp.style.cssText = 'padding:var(--space-1) var(--space-2); font-size:var(--font-2xs);';
        inp.value = cmd;
        inp.oninput = () => { hudPodStagedCommands[idx] = inp.value.trim(); };
        inp.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmHudPodStaging(); }
            else if (e.key === 'Escape') { e.preventDefault(); hudPodStagedCommands = []; renderHudPodStaging(); }
        };
        listEl.appendChild(inp);
    });

    box.querySelector('#hud-stg-cancel').onclick = () => {
        hudPodStagedCommands = [];
        renderHudPodStaging();
    };
    box.querySelector('#hud-stg-run').onclick = confirmHudPodStaging;
}

function confirmHudPodStaging() {
    let count = 0;
    hudPodStagedCommands.forEach(c => {
        if (c && executeTerminalCommand(c)) count++;
    });
    hudPodStagedCommands = [];
    renderHudPodStaging();
    renderHudPod();
    if (count > 0 && typeof showToast === 'function') {
        showToast(`[EXECUTED] ${count} command(s)`);
    }
}

function updateGlobalClock() {
    const now = getNow();
    const currentDayStr = formatDate(now);

    if (currentDayStr !== todayStr) {
        const wasOnToday = (selectedDateStr === todayStr);
        todayStr = currentDayStr;
        const tmw = new Date(now);
        tmw.setDate(now.getDate() + 1);
        tomorrowStr = formatDate(tmw);
        if (wasOnToday) selectedDateStr = todayStr;
        renderQuadrantLayout();
    }

    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const dayName = days[now.getDay()];
    const dayNum = now.getDate().toString().padStart(2, '0');
    const fullClockText = `${timeStr} // ${dayName} ${dayNum}`;

    const clockEl = document.getElementById('global-clock');
    if (clockEl) clockEl.innerText = fullClockText;

    const podClockEl = document.getElementById('hud-pod-clock');
    if (podClockEl) podClockEl.innerText = fullClockText;

    if (isHudMode) renderHudPod({ tick: true });
}

setInterval(updateGlobalClock, 1000);

window.addEventListener('DOMContentLoaded', () => {
    updateGlobalClock();
    initDashboard();

    wireHudPod();
});

async function applyTauriWindowGeometry(width, height, alwaysOnTop = null, physicalPos = null) {
    try {
        const tauriObj = window.__TAURI__;
        if (!tauriObj || !tauriObj.window) return;
        const appWin = typeof tauriObj.window.getCurrentWindow === 'function'
            ? tauriObj.window.getCurrentWindow()
            : null;
        if (!appWin) return;

        try {
            if (typeof appWin.isMaximized === 'function' && await appWin.isMaximized()) {
                await appWin.unmaximize();
            }
        } catch (e) {}

        try {
            if (typeof appWin.isFullscreen === 'function' && await appWin.isFullscreen()) {
                await appWin.setFullscreen(false);
            }
        } catch (e) {}

        try {
            if (typeof appWin.setMinSize === 'function') {
                await appWin.setMinSize(null);
            }
        } catch (e) {}

        try {
            if (alwaysOnTop !== null && typeof appWin.setAlwaysOnTop === 'function') {
                await appWin.setAlwaysOnTop(Boolean(alwaysOnTop));
            }
        } catch (e) {}

        if (typeof appWin.setSize === 'function') {
            const LogicalSizeCtor = (tauriObj.dpi && tauriObj.dpi.LogicalSize)
                || (tauriObj.window && tauriObj.window.LogicalSize);
            if (LogicalSizeCtor) {
                await appWin.setSize(new LogicalSizeCtor(Math.round(width), Math.round(height)));
            } else {
                await appWin.setSize({ type: 'Logical', width: Math.round(width), height: Math.round(height) });
            }
        }

        if (physicalPos && typeof physicalPos.x === 'number' && typeof physicalPos.y === 'number' && typeof appWin.setPosition === 'function') {
            try {
                const PhysicalPosCtor = (tauriObj.dpi && tauriObj.dpi.PhysicalPosition)
                    || (tauriObj.window && tauriObj.window.PhysicalPosition);
                if (PhysicalPosCtor) {
                    await appWin.setPosition(new PhysicalPosCtor(Math.round(physicalPos.x), Math.round(physicalPos.y)));
                } else {
                    await appWin.setPosition({ type: 'Physical', x: Math.round(physicalPos.x), y: Math.round(physicalPos.y) });
                }
            } catch (e) {}
        }
    } catch (err) {
        console.warn('[HUD MODE] Tauri window resize warning:', err);
    }
}

async function toggleHudMode(forceState = null) {
    const nextState = forceState !== null ? Boolean(forceState) : !isHudMode;
    const tauriObj = window.__TAURI__;
    const appWin = (tauriObj && tauriObj.window && typeof tauriObj.window.getCurrentWindow === 'function')
        ? tauriObj.window.getCurrentWindow()
        : null;

    if (nextState && !isHudMode) {
        if (window.innerHeight > 200) {
            savedNormalPhysicalSize = {
                width: Math.max(600, window.innerWidth || 1100),
                height: Math.max(400, window.innerHeight || 620)
            };
            if (appWin && typeof appWin.outerPosition === 'function') {
                try {
                    const pos = await appWin.outerPosition();
                    if (pos && typeof pos.x === 'number') {
                        savedNormalPhysicalPos = { x: pos.x, y: pos.y };
                    }
                } catch (e) {}
            }
        }

        isHudMode = true;
        isHudTempExpanded = false;
        document.body.classList.add('hud-mode');
        document.body.classList.remove('hud-temp-expanded');
        renderHudPod();

        const sz = hudPodSize();
        await applyTauriWindowGeometry(sz.width, sz.height, true, savedHudPodPhysicalPos);
    } else if (!nextState && isHudMode) {
        if (appWin && typeof appWin.outerPosition === 'function') {
            try {
                const podPos = await appWin.outerPosition();
                if (podPos && typeof podPos.x === 'number') {
                    savedHudPodPhysicalPos = { x: podPos.x, y: podPos.y };
                }
            } catch (e) {}
        }

        isHudMode = false;
        isHudTempExpanded = false;
        document.body.classList.remove('hud-mode', 'hud-temp-expanded');

        const w = savedNormalPhysicalSize ? savedNormalPhysicalSize.width : 1100;
        const h = savedNormalPhysicalSize ? savedNormalPhysicalSize.height : 620;
        await applyTauriWindowGeometry(w, h, false, savedNormalPhysicalPos);
        renderQuadrantLayout();
    }
}

async function setHudTemporaryExpansion(shouldExpand) {
    if (!isHudMode) return;
    const w = savedNormalPhysicalSize ? savedNormalPhysicalSize.width : 1100;
    const h = savedNormalPhysicalSize ? savedNormalPhysicalSize.height : 620;

    if (shouldExpand && !isHudTempExpanded) {
        isHudTempExpanded = true;
        document.body.classList.add('hud-temp-expanded');
        await applyTauriWindowGeometry(w, h, true, savedNormalPhysicalPos);
    } else if (!shouldExpand && isHudTempExpanded) {
        isHudTempExpanded = false;
        document.body.classList.remove('hud-temp-expanded');
        const sz = hudPodSize();
        await applyTauriWindowGeometry(sz.width, sz.height, true, savedHudPodPhysicalPos);
    }
}

document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        toggleHudMode();
        return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const termOverlay = document.getElementById('terminalOverlay');
    if (termOverlay && termOverlay.classList.contains('show')) return;

    const qsModal = document.getElementById('quickSwitcherModal');
    if (qsModal && qsModal.style.display === 'flex' && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        closeModals();
        return;
    }

    const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
    if (anyModalOpen) return;

    if ((e.key === 't' || e.key === 'T') && window.__TAURI__ && typeof toggleTransparent === 'function') {
        e.preventDefault();
        toggleTransparent();
    } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        toggleHudMode();
    } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        if (typeof openQuickSwitcherModal === 'function') openQuickSwitcherModal();
    }
});
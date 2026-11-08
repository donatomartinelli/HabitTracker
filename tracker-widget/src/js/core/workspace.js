// --- js/core/workspace.js ---
// Tiling Window Manager: Custom Mouse Drag & Snap, Fractal Micro-Modules, Floating Dock Menus & Centered HUD Widget

const dashboardModules = {
    'calendar': {
        name: 'Calendar',
        id: 'module-calendar',
        minW: () => 220,
        minH: () => 170,
        render: () => { if (typeof renderCalendar === 'function') renderCalendar(); }
    },
    'tasks': {
        name: 'Tasks',
        id: 'module-tasks',
        minW: () => Math.max(155, Math.floor(window.innerWidth * 0.125)),
        minH: () => 145,
        render: () => { if (typeof renderTasks === 'function') renderTasks(); if (typeof renderGeneralTodos === 'function') renderGeneralTodos(); }
    },
    'notes': {
        name: 'Notes',
        id: 'module-notes',
        minW: () => Math.max(170, Math.floor(window.innerWidth * 0.14)),
        minH: () => 145,
        render: () => { if (typeof renderNoteCategories === 'function') renderNoteCategories(); }
    },
    'planner': {
        name: 'Weekly Planner',
        id: 'module-planner',
        minW: () => Math.max(420, Math.floor(window.innerWidth * 0.35)),
        minH: () => 210,
        render: () => { if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner(); }
    },
    'plan': {
        name: 'Day Planner',
        id: 'module-plan',
        minW: () => 360,
        minH: () => 210,
        render: () => { if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule(); }
    },
    'diet': {
        name: 'Diet & Macros',
        id: 'module-diet',
        minW: () => 240,
        minH: () => 170,
        render: () => { if (typeof renderDiet === 'function') renderDiet(); }
    },
    'gym': {
        name: 'Gym Split',
        id: 'module-gym',
        minW: () => 235,
        minH: () => 170,
        render: () => { if (typeof renderGymDashboard === 'function') renderGymDashboard(); }
    },
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
    'uni': {
        name: 'University',
        id: 'module-uni',
        minW: () => 280,
        minH: () => 190,
        render: () => {
            if (typeof renderUniDashboard === 'function') renderUniDashboard();
        }
    }
};

const PRIMARY_MODULE_KEYS = ['calendar', 'tasks', 'notes', 'planner', 'plan', 'diet', 'gym', 'money', 'streak', 'uni'];
const ALL_MODULE_KEYS = Object.keys(dashboardModules);

const MACRO_SUBMODULES_MAP = {
    'money': ['m_summary', 'm_vaults', 'm_chart', 'm_tx', 'm_bills', 'm_analytics', 'm_incubator']
};

let macroDefaultTrees = safeJsonParse(localStorage.getItem('tracker_macro_default_trees'), {});
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
        localStorage.setItem('tracker_macro_default_trees', JSON.stringify(macroDefaultTrees));
    }
}

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
    return makePaneNode(macroKey);
}

function createDefaultMoneySubtree() {
    return getMacroDefaultSubtree('money');
}

function saveCurrentAsMacroDefault(macroKey) {
    const allowedSubs = MACRO_SUBMODULES_MAP[macroKey] || [];
    if (!layoutTree || allowedSubs.length === 0) return;

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
            showToast(`[DEFAULT VIEW] Mount at least one ${dashboardModules[macroKey].name} micro-module first!`);
        }
        return;
    }

    macroDefaultTrees[macroKey] = extracted;
    saveMacroDefaultTrees();
    if (typeof showToast === 'function') {
        const count = collectLeafPanes(extracted).length;
        showToast(`[★ DEFAULT SAVED] "${dashboardModules[macroKey].name}" (${count} micro-modules)`);
    }
}

// Pop-up hover per vedere i moduli che compongono una Saved View senza testo fisso
function showPresetModulesHoverPopup(e, presetName, modulesListStr) {
    const tooltip = document.getElementById('planner-tooltip');
    if (!tooltip) return;
    tooltip.innerHTML = `<strong style="display:block; margin-bottom:2px; color:var(--text-main);">${escapeHtml(presetName)}</strong><span style="color:var(--text-muted);">${escapeHtml(modulesListStr)}</span>`;
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

// --- MENU A TENDINA FLOTTANTE PER MICRO-MODULI NELLA DOCK [EDIT] (ZERO CLIPPING) ---

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

    const subKeys = MACRO_SUBMODULES_MAP[modKey] || [];
    if (subKeys.length === 0) return;

    const activeLeafMods = new Set(collectLeafPanes(layoutTree).map(p => p.module));
    const rect = anchorBtn.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.dataset.modKey = modKey;
    menu.style.cssText = `
        position: fixed;
        top: ${Math.round(rect.bottom + 4)}px;
        left: ${Math.round(Math.max(8, rect.left - 80))}px;
        min-width: 215px;
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
        const subMounted = activeLeafMods.has(sk);
        const subRow = document.createElement('div');
        subRow.className = `draggable-mod-chip ${subMounted ? 'in-use' : ''}`;
        subRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
        subRow.innerHTML = `<span>${subMounted ? '✓ ' : '+ '}${escapeHtml(dashboardModules[sk].name.replace(/^.*?:\s*/, ''))}</span>`;

        bindCustomPointerDragSource(subRow, sk, null, () => {
            addModuleToTilingLayout(sk);
            closeFloatingDockPopover();
        });
        menu.appendChild(subRow);
    });

    const setDefBtn = document.createElement('button');
    setDefBtn.type = 'button';
    setDefBtn.className = 'btn btn-primary btn-sm';
    setDefBtn.style.cssText = 'width: 100%; margin-top: 2px; font-size: 0.62rem;';
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

function sanitizeLayoutTree(node, seenModules = new Set()) {
    if (!node) return null;
    if (node.type === 'pane') {
        let mod = node.module;
        if (mod === 'daily') mod = 'tasks';
        if (mod === 'health') mod = 'diet';
        if (MACRO_SUBMODULES_MAP[mod]) {
            return sanitizeLayoutTree(getMacroDefaultSubtree(mod), seenModules);
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
            layoutTree = sanitizeLayoutTree(makePaneNode(modKey), new Set());
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
    if (startupView === 'zero') label = '0 // Zero-UI Mode';
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
        const subKeys = MACRO_SUBMODULES_MAP[modKey] || [];
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

        if (subKeys.length > 0) {
            const dropBtn = document.createElement('button');
            dropBtn.type = 'button';
            dropBtn.className = 'btn btn-sm dock-sub-drop-btn';
            dropBtn.style.cssText = 'padding: 4px 6px; margin-left: -1px; font-size: 0.65rem; border-color: var(--border-bright);';
            dropBtn.textContent = '▾';
            dropBtn.onclick = (e) => {
                e.stopPropagation();
                openFloatingDockPopover(dropBtn, modKey);
            };
            wrap.appendChild(dropBtn);
        }

        cont.appendChild(wrap);
    });
}

function addModuleToTilingLayout(modKey) {
    if (!dashboardModules[modKey]) return;

    if (MACRO_SUBMODULES_MAP[modKey]) {
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
    updateHudWidgetStrip();

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
        dragHint.style.cssText = 'color: var(--text-dim); font-weight: bold;';
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
        closeBtn.textContent = '[×]';
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

function attachSplitResizer(resizerEl, splitEl, splitNode, childEl0, childEl1) {
    resizerEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resizerEl.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = splitNode.dir === 'row' ? 'ew-resize' : 'ns-resize';

        const onMouseMove = (moveEvent) => {
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

                const rawRatio = (moveEvent.clientX - rect.left) / totalW;
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

                const rawRatio = (moveEvent.clientY - rect.top) / totalH;
                const clampedRatio = Math.max(minRatio, Math.min(maxRatio, rawRatio));

                splitNode.ratio = clampedRatio;
                childEl0.style.flex = `${clampedRatio} 1 0%`;
                childEl1.style.flex = `${1 - clampedRatio} 1 0%`;
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            resizerEl.classList.remove('dragging');
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

    const createNodeForDrop = (k) => MACRO_SUBMODULES_MAP[k] ? getMacroDefaultSubtree(k) : makePaneNode(k);

    if (action.scope === 'root_empty' || !layoutTree) {
        layoutTree = createNodeForDrop(modKey);
        renderQuadrantLayout();
        return;
    }

    if (action.scope === 'pane' && action.zone === 'center') {
        if (MACRO_SUBMODULES_MAP[modKey]) {
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
    if (MACRO_SUBMODULES_MAP[newModKey]) {
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
        layoutTree = MACRO_SUBMODULES_MAP[modKey] ? getMacroDefaultSubtree(modKey) : makePaneNode(modKey);
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
        <div style="padding: 7px 12px; font-size: 0.65rem; color: var(--text-dim); border-bottom: 1px solid var(--border-color); text-transform: uppercase;">
            Startup Default
        </div>
        <div class="startup-option-row ${isLastStartup ? 'active' : ''}" onclick="setStartupViewPreference('last')">
            <span>Restore Last Active Layout</span>
            <span>${isLastStartup ? '[★]' : '[SET]'}</span>
        </div>
        <div class="startup-option-row ${isZeroStartup ? 'active' : ''}" onclick="setStartupViewPreference('zero')">
            <span>0 // Zero-UI</span>
            <span>${isZeroStartup ? '[★]' : '[SET]'}</span>
        </div>
        <div style="padding: 8px 12px; border-bottom: 1px solid var(--border-color); display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <span style="font-size:var(--font-xs); color:var(--text-muted);">Single Module:</span>
            <select class="form-control form-control-sm" style="width:180px; padding:3px 6px;" onchange="if(this.value) setStartupViewPreference(this.value)">
                ${singleModOptionsHtml}
            </select>
        </div>

        <div style="padding: 7px 12px; font-size: 0.65rem; color: var(--text-dim); border-bottom: 1px solid var(--border-color); text-transform: uppercase; margin-top: 6px;">
            Saved Views
        </div>
        <div id="settings-saved-views-list"></div>
        <div style="padding: 10px; background: #030303; display: flex; gap: 6px; border-top: 1px solid var(--border-color);">
            <input type="text" id="new-preset-name-input" class="form-control form-control-sm" placeholder="View name..." onkeydown="if(event.key==='Enter'){event.preventDefault(); saveCurrentWorkspacePreset('new-preset-name-input');}">
            <button class="btn btn-primary btn-sm" onclick="saveCurrentWorkspacePreset('new-preset-name-input')">[SAVE VIEW]</button>
        </div>
    `;

    dropEl.innerHTML = html;

    const listContainer = dropEl.querySelector('#settings-saved-views-list');
    if (workspacePresets.length === 0) {
        listContainer.innerHTML = `<div style="padding: 12px; font-size: var(--font-xs); color: var(--text-dim);">[ NONE ]</div>`;
    } else {
        workspacePresets.forEach(p => {
            const pLeaves = p.tree ? collectLeafPanes(p.tree).map(l => dashboardModules[l.module]?.name || l.module.toUpperCase()) : [];
            const desc = pLeaves.length === 0 ? 'ZERO-UI' : pLeaves.join(' + ');
            const isPresetStartup = (startupView === `preset:${p.id}`);

            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding: 8px 12px; border-bottom: 1px solid #1a1a1a; gap: 8px;';
            row.onmouseenter = (e) => showPresetModulesHoverPopup(e, p.name, desc);
            row.onmousemove = movePresetModulesHoverPopup;
            row.onmouseleave = hidePresetModulesHoverPopup;

            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'cursor:pointer; flex:1; min-width:0; font-size: var(--font-xs); font-weight: bold; color: var(--text-main); overflow:hidden; text-overflow:ellipsis;';
            nameDiv.textContent = p.name;
            nameDiv.onclick = () => {
                hidePresetModulesHoverPopup();
                applyWorkspacePreset(p.id);
            };

            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'display:flex; align-items:center; gap:4px; flex-shrink:0;';
            actionsDiv.innerHTML = `
                <button class="startup-star-btn ${isPresetStartup ? 'active' : ''}">${isPresetStartup ? '★' : '☆'}</button>
                <button class="icon-btn delete">[X]</button>
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
// TACTICAL VERTICAL POD HUD (340x460px) & MULTI-MONITOR PHYSICAL MEMORY (3A1 + 3B1)
// ============================================================================

let isHudMode = false;
let isHudTempExpanded = false;

let savedNormalPhysicalSize = null;
let savedNormalPhysicalPos = null;
let savedHudPodPhysicalPos = null;

const HUD_POD_WIDTH = 340;
const HUD_POD_HEIGHT = 460;

let hudPodStagedCommands = [];

function getNextScheduledBlockLabelForToday() {
    const now = getNow();
    const curMins = now.getHours() * 60 + now.getMinutes();
    const dayIdx = now.getDay();
    const candidates = [];

    if (typeof templates !== 'undefined') {
        templates.forEach(t => {
            if (t && isTaskActiveOnDate(t, todayStr) && Array.isArray(t.timeWindows)) {
                t.timeWindows.forEach(tw => {
                    if (tw.days && tw.days.includes(dayIdx) && tw.start && tw.end) {
                        const [sh, sm] = tw.start.split(':').map(Number);
                        const [eh, em] = tw.end.split(':').map(Number);
                        const sMins = sh * 60 + (sm || 0);
                        const eMins = eh * 60 + (em || 0);
                        if (eMins >= curMins) {
                            candidates.push({ startMins: sMins, endMins: eMins, start: tw.start, end: tw.end, title: t.title });
                        }
                    }
                });
            }
        });
    }

    if (typeof ephemeralData !== 'undefined' && Array.isArray(ephemeralData[todayStr])) {
        ephemeralData[todayStr].forEach(b => {
            if (b.start && b.end) {
                const [sh, sm] = b.start.split(':').map(Number);
                const [eh, em] = b.end.split(':').map(Number);
                const sMins = sh * 60 + (sm || 0);
                const eMins = eh * 60 + (em || 0);
                if (eMins >= curMins) {
                    candidates.push({ startMins: sMins, endMins: eMins, start: b.start, end: b.end, title: b.title });
                }
            }
        });
    }

    if (typeof specificEvents !== 'undefined') {
        specificEvents.filter(e => e && e.date === todayStr && e.start && e.end).forEach(ev => {
            const [sh, sm] = ev.start.split(':').map(Number);
            const [eh, em] = ev.end.split(':').map(Number);
            const sMins = sh * 60 + (sm || 0);
            const eMins = eh * 60 + (em || 0);
            if (eMins >= curMins) {
                candidates.push({ startMins: sMins, endMins: eMins, start: ev.start, end: ev.end, title: ev.title });
            }
        });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.startMins - b.startMins);
    const best = candidates[0];
    const isNow = curMins >= best.startMins && curMins <= best.endMins;
    return `${isNow ? 'NOW' : best.start} // ${best.title.toUpperCase()}`;
}

function updateHudWidgetStrip() {
    renderHudPod();
}

function renderHudPod() {
    if (!isHudMode) return;
    const pod = document.getElementById('hud-tactical-pod');
    if (!pod) return;

    // 1. Focus Controller Box
    const focusBox = document.getElementById('hud-pod-focus-box');
    const isFocusRunning = typeof focusPlaylist !== 'undefined' && focusPlaylist.length > 0 && currentPlaylistIndex < focusPlaylist.length;

    if (focusBox) {
        if (isFocusRunning) {
            const phase = focusPlaylist[currentPlaylistIndex];
            const m = Math.floor(Math.abs(timeRemaining) / 60).toString().padStart(2, '0');
            const s = (Math.abs(timeRemaining) % 60).toString().padStart(2, '0');
            const pct = totalPhaseTime > 0 ? Math.max(0, Math.min(100, (timeRemaining / totalPhaseTime) * 100)) : 0;
            const activeColor = phase.type === 'task' ? (phase.color || '#ffffff') : '#888888';

            focusBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:baseline;">
                    <div style="font-size:1.35rem; font-weight:bold; color:${activeColor}; font-variant-numeric:tabular-nums;">
                        ${isPomodoroPaused ? '⏸' : '▶'} ${m}:${s}
                    </div>
                    <div style="font-size:var(--font-xs); font-weight:bold; color:var(--text-main); max-width:175px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${escapeHtml(phase.type === 'task' ? phase.title : 'BREAK')}
                    </div>
                </div>
                <div style="height:4px; width:100%; background:#141414; overflow:hidden;">
                    <div style="height:100%; width:${pct.toFixed(1)}%; background:${activeColor};"></div>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:2px;">
                    <button type="button" class="btn btn-sm" style="padding:2px 6px; font-size:0.62rem;" onclick="togglePomodoroPause(); renderHudPod();">${isPomodoroPaused ? '[RESUME]' : '[PAUSE]'}</button>
                    <button type="button" class="btn btn-sm" style="padding:2px 6px; font-size:0.62rem;" onclick="skipPomodoroPhase(); renderHudPod();">[SKIP ✓]</button>
                    <button type="button" class="btn btn-danger btn-sm" style="padding:2px 6px; font-size:0.62rem;" onclick="stopPomodoro(); renderHudPod();">[×]</button>
                </div>
            `;
        } else {
            focusBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:var(--font-xs); color:var(--text-dim); font-weight:bold;">FOCUS TIMER // IDLE</span>
                    <button type="button" class="btn btn-sm" style="padding:2px 8px; font-size:0.62rem;" onclick="openTimerModal()">[▶ PLAYLIST]</button>
                </div>
            `;
        }
    }

    // 2. Radar (Now/Next + Spendable Balance)
    const radarEl = document.getElementById('hud-pod-radar');
    if (radarEl) {
        const nextStr = getNextScheduledBlockLabelForToday() || 'NO TIMED BLOCKS LEFT';
        const spendableVal = typeof getMoneyAllocationMetrics === 'function'
            ? getMoneyAllocationMetrics().spendable
            : (typeof mBalance !== 'undefined' ? mBalance : 0);

        radarEl.innerHTML = `
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;"><strong>${escapeHtml(nextStr)}</strong></span>
            <span style="font-weight:bold; color:${spendableVal < 0 ? 'var(--accent-red)' : 'var(--accent-green)'}; flex-shrink:0;">€${Number(spendableVal || 0).toFixed(2)}</span>
        `;
    }

    // 3. Checklist Task & To-Do di oggi
    const listEl = document.getElementById('hud-pod-tasks-list');
    const counterEl = document.getElementById('hud-pod-tasks-counter');
    if (listEl) {
        listEl.innerHTML = '';
        const st = typeof getStatsForDate === 'function' ? getStatsForDate(todayStr) : { completed: 0, total: 0 };
        if (counterEl) counterEl.textContent = `${st.completed}/${st.total}`;

        const activeToday = (typeof templates !== 'undefined' ? templates : []).filter(t =>
            t && t.type !== 'medicine' && isTaskActiveOnDate(t, todayStr)
        );

        const uncompleted = [];
        const completed = [];

        activeToday.forEach(t => {
            const inst = t.instances || 1;
            const curLog = (logs[todayStr] && logs[todayStr][t.id]) || Array(inst).fill(false);
            if (curLog.every(Boolean)) completed.push({ t, curLog, inst });
            else uncompleted.push({ t, curLog, inst });
        });

        const ordered = [...uncompleted, ...completed];
        if (ordered.length === 0) {
            listEl.innerHTML = `<div class="empty-state" style="text-align:center;">[ NO TASKS FOR TODAY ]</div>`;
        } else {
            ordered.forEach(({ t, curLog, inst }) => {
                const isAllDone = curLog.every(Boolean);
                const mins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, todayStr) : 0;

                const row = document.createElement('div');
                row.className = 'hud-pod-task-row';
                row.style.borderLeftColor = t.color || '#ffffff';
                if (isAllDone) row.style.opacity = '0.4';

                const left = document.createElement('div');
                left.style.cssText = 'flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
                left.innerHTML = `
                    <strong style="color:var(--text-main); ${isAllDone ? 'text-decoration:line-through;' : ''}">${escapeHtml(t.title)}</strong>
                    <span style="font-size:0.6rem; color:var(--text-dim); margin-left:4px;">${escapeHtml(t.category)}</span>
                `;

                const right = document.createElement('div');
                right.style.cssText = 'display:flex; align-items:center; gap:4px; flex-shrink:0;';

                if (!isAllDone && mins > 0) {
                    const playBtn = document.createElement('button');
                    playBtn.type = 'button';
                    playBtn.className = 'icon-btn';
                    playBtn.style.cssText = 'font-size:0.65rem; padding:1px 4px; color:var(--text-main);';
                    playBtn.textContent = '▶';
                    playBtn.title = `Start ${mins}m Focus`;
                    playBtn.onclick = () => {
                        if (typeof quickStartTaskFocus === 'function') {
                            const prevDate = selectedDateStr;
                            selectedDateStr = todayStr;
                            quickStartTaskFocus(t.id);
                            selectedDateStr = prevDate;
                            renderHudPod();
                        }
                    };
                    right.appendChild(playBtn);
                }

                for (let i = 0; i < inst; i++) {
                    const cb = document.createElement('div');
                    cb.className = `check-box ${curLog[i] ? 'checked' : ''}`;
                    cb.style.cssText = 'width:13px; height:13px;';
                    cb.onclick = () => {
                        const prevDate = selectedDateStr;
                        selectedDateStr = todayStr;
                        toggleTask(t.id, i);
                        selectedDateStr = prevDate;
                        renderHudPod();
                    };
                    right.appendChild(cb);
                }

                row.appendChild(left);
                row.appendChild(right);
                listEl.appendChild(row);
            });
        }
    }
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
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.62rem; color:var(--accent-gold); font-weight:bold;">
            <span>STAGED COMMANDS (${hudPodStagedCommands.length})</span>
            <div style="display:flex; gap:4px;">
                <button type="button" class="btn btn-sm" style="padding:1px 5px; font-size:0.6rem;" id="hud-stg-cancel">[ESC]</button>
                <button type="button" class="btn btn-primary btn-sm" style="padding:1px 6px; font-size:0.6rem;" id="hud-stg-run">[RUN // ENTER]</button>
            </div>
        </div>
        <div id="hud-stg-list" style="display:flex; flex-direction:column; gap:4px;"></div>
    `;

    const listEl = box.querySelector('#hud-stg-list');
    hudPodStagedCommands.forEach((cmd, idx) => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-control form-control-sm';
        inp.style.cssText = 'padding:3px 6px; font-size:0.65rem;';
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
        showToast(`[POD EXECUTED] ${count} command(s)`);
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

    if (isHudMode) renderHudPod();
}

setInterval(updateGlobalClock, 1000);

window.addEventListener('DOMContentLoaded', () => {
    updateGlobalClock();
    initDashboard();

    const podInput = document.getElementById('hud-pod-input');
    if (podInput) {
        podInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                hudPodStagedCommands = [];
                renderHudPodStaging();
                podInput.value = '';
                podInput.blur();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = podInput.value.trim();
                if (!val) {
                    if (hudPodStagedCommands.length > 0) confirmHudPodStaging();
                    return;
                }
                if (typeof isValidDslCommand === 'function' && isValidDslCommand(val)) {
                    executeTerminalCommand(val);
                    podInput.value = '';
                    renderHudPod();
                } else if (typeof translateNaturalLanguageToDslWithGemini === 'function') {
                    podInput.disabled = true;
                    const oldPh = podInput.placeholder;
                    podInput.value = '';
                    podInput.placeholder = '◈ AI translating...';
                    try {
                        const cmds = await translateNaturalLanguageToDslWithGemini(val);
                        if (Array.isArray(cmds) && cmds.length > 0) {
                            hudPodStagedCommands.push(...cmds);
                            renderHudPodStaging();
                        }
                    } catch (err) {
                        if (typeof showToast === 'function') showToast(`[AI ERROR] ${err.message}`);
                    }
                    podInput.disabled = false;
                    podInput.placeholder = oldPh;
                    podInput.focus();
                }
            }
        });
    }
});

async function applyTauriWindowGeometry(width, height, alwaysOnTop = null, physicalPos = null) {
    try {
        const tauriObj = window.__TAURI__;
        if (!tauriObj || !tauriObj.window) return;
        const appWin = typeof tauriObj.window.getCurrentWindow === 'function'
            ? tauriObj.window.getCurrentWindow()
            : null;
        if (!appWin) return;

        // 1. Se la finestra è massimizzata o a schermo intero, la sblocca prima di ridimensionare
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

        // 2. Rimuove eventuali blocchi di dimensione minima (minWidth/minHeight)
        try {
            if (typeof appWin.setMinSize === 'function') {
                await appWin.setMinSize(null);
            }
        } catch (e) {}

        // 3. Imposta Always-on-Top
        try {
            if (alwaysOnTop !== null && typeof appWin.setAlwaysOnTop === 'function') {
                await appWin.setAlwaysOnTop(Boolean(alwaysOnTop));
            }
        } catch (e) {}

        // 4. Ridimensiona usando LogicalSize o il fallback oggetto nativo Tauri v2
        if (typeof appWin.setSize === 'function') {
            const LogicalSizeCtor = (tauriObj.dpi && tauriObj.dpi.LogicalSize)
                || (tauriObj.window && tauriObj.window.LogicalSize);
            if (LogicalSizeCtor) {
                await appWin.setSize(new LogicalSizeCtor(Math.round(width), Math.round(height)));
            } else {
                await appWin.setSize({ type: 'Logical', width: Math.round(width), height: Math.round(height) });
            }
        }

        // 5. Ripristina la posizione fisica sul monitor corretto (solo se disponibile)
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

        await applyTauriWindowGeometry(HUD_POD_WIDTH, HUD_POD_HEIGHT, true, savedHudPodPhysicalPos);
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
        await applyTauriWindowGeometry(HUD_POD_WIDTH, HUD_POD_HEIGHT, true, savedHudPodPhysicalPos);
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

    if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        toggleHudMode();
    } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        if (typeof openQuickSwitcherModal === 'function') openQuickSwitcherModal();
    }
});
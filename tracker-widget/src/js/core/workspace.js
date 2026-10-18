// --- js/core/workspace.js ---
// Tiling Window Manager: Custom Mouse Drag & Snap (Zero Cursor Block), Unlimited Split Panes & Startup View Selector

const dashboardModules = {
    'calendar': {
        name: 'Calendar',
        id: 'module-calendar',
        minW: () => 220,
        minH: () => 170,
        render: () => { if (typeof renderCalendar === 'function') renderCalendar(); }
    },
    'tasks': {
        name: 'Daily Tasks',
        id: 'module-tasks',
        // Comprimibile fino a 1/8 della larghezza dello schermo
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
        // Non comprimibile sotto il 35% dello schermo (~420px)
        minW: () => Math.max(420, Math.floor(window.innerWidth * 0.35)),
        minH: () => 210,
        render: () => { if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner(); }
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
        render: () => { if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard(); }
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
    }
};

const ALL_MODULE_KEYS = Object.keys(dashboardModules);
let isLayoutEditMode = false;

// Stato per il Custom Pointer Drag & Snap (niente più HTML5 draggable bloccato da WebView2)
let pointerDragCandidate = null;
let isPointerDragging = false;
let currentSnapAction = null;
let dragGhostEl = null;

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
        dir: dir, // 'row' (affiancati SX/DX) | 'col' (impilati SOPRA/SOTTO)
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
// SCELTA SCHERMATA DI AVVIO (STARTUP VIEW: COSA SI APRE QUANDO APRI L'APP)
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
            layoutTree = makePaneNode(modKey);
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
        if (m) label = `Single Module: ${m.name}`;
    } else if (startupView.startsWith('preset:')) {
        const p = workspacePresets.find(x => x.id === startupView.slice(7));
        if (p) label = `Saved View "${p.name}"`;
    }
    if (typeof showToast === 'function') {
        showToast(`[STARTUP DEFAULT] App will now open on: ${label}`);
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
    const btn = document.getElementById('btn-edit-layout');
    if (btn) {
        btn.textContent = isLayoutEditMode ? '[EDIT: ON]' : '[EDIT]';
        btn.classList.toggle('btn-primary', isLayoutEditMode);
    }
    renderEditDockChips();
    if (typeof showToast === 'function' && isLayoutEditMode) {
        showToast('[EDIT MODE] Click modules to add/tile, or hold & drag onto screen edges/corners!');
    }
}

// Quando clicchi un modulo (o lo aggiungi senza trascinare), divide automaticamente il riquadro più grande senza alcun limite di 2 moduli!
function addModuleToTilingLayout(modKey) {
    if (!dashboardModules[modKey]) return;
    const leaves = collectLeafPanes(layoutTree);

    // Se è già presente a schermo e sei in modalità EDIT, cliccarlo di nuovo lo rimuove (toggle)
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

    // Trova il riquadro attualmente più ampio sullo schermo e lo divide in 2 per inserire il nuovo modulo (fino a tutti e 7!)
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

function renderEditDockChips() {
    const cont = document.getElementById('edit-dock-chips');
    if (!cont) return;
    cont.innerHTML = '';

    const activeLeafMods = new Set(collectLeafPanes(layoutTree).map(p => p.module));

    ALL_MODULE_KEYS.forEach(modKey => {
        const isMounted = activeLeafMods.has(modKey);
        const chip = document.createElement('div');
        chip.className = `draggable-mod-chip ${isMounted ? 'in-use' : ''}`;
        chip.textContent = `${isMounted ? '✓ ' : '+ '}${dashboardModules[modKey].name.toUpperCase()}`;
        chip.title = 'Click to add/toggle, or hold & drag onto screen to snap!';

        // Usa il nostro motore Mouse Drag & Click (zero blocchi del cursore!)
        bindCustomPointerDragSource(chip, modKey, null, () => {
            addModuleToTilingLayout(modKey);
        });

        cont.appendChild(chip);
    });
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

    // CASO 0: MODALITÀ ZERO-UI
    if (!layoutTree || leaves.length === 0) {
        layoutTree = null;
        saveWorkspaceState();
        return;
    }

    // CASO 1..N: COSTRUISCE L'ALBERO DI FINESTRE E RESIZERS
    let paneCounter = { val: 0 };
    const domTree = buildTilingDomNode(layoutTree, paneCounter, leaves.length);
    if (domTree) wrapper.appendChild(domTree);

    leaves.forEach(leaf => {
        const modInfo = dashboardModules[leaf.module];
        if (modInfo) {
            modInfo.render();
            if (leaf.module === 'money' && typeof drawSteppedChart === 'function') {
                setTimeout(drawSteppedChart, 20);
            }
        }
    });

    saveWorkspaceState();
}

function buildTilingDomNode(node, paneCounter, totalPanes) {
    if (!node) return null;

    if (node.type === 'pane') {
        paneCounter.val++;
        const qIndex = paneCounter.val;
        const modKey = node.module;
        const modInfo = dashboardModules[modKey];
        if (!modInfo) return null;

        const cell = document.createElement('div');
        cell.className = 'quadrant-cell';
        cell.dataset.paneId = node.id;
        cell.dataset.module = modKey;
        cell.style.flex = '1 1 0%';

        // Barra superiore: Q1 [Notes] ... [×] (Trascinabile col mouse per fare Snap!)
        const bar = document.createElement('div');
        bar.className = 'quadrant-bar';
        bindCustomPointerDragSource(bar, modKey, node.id, null);

        const leftPart = document.createElement('div');
        leftPart.className = 'quadrant-bar-left';

        const tag = document.createElement('span');
        tag.className = 'quadrant-tag';
        tag.textContent = `Q${qIndex}`;

        const staticTitle = document.createElement('span');
        staticTitle.className = 'quadrant-title-static';
        staticTitle.textContent = `[${modInfo.name}]`;
        staticTitle.title = 'Hold & drag this bar to snap window, or click [EDIT]';

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

        leftPart.appendChild(tag);
        leftPart.appendChild(staticTitle);
        leftPart.appendChild(select);

        const rightActions = document.createElement('div');
        rightActions.className = 'quadrant-bar-actions';

        if (totalPanes > 1) {
            const maxBtn = document.createElement('button');
            maxBtn.className = 'icon-btn';
            maxBtn.style.fontSize = '0.68rem';
            maxBtn.title = 'Maximize this window to Full Screen';
            maxBtn.textContent = '[MAX]';
            maxBtn.onclick = () => {
                layoutTree = makePaneNode(modKey);
                renderQuadrantLayout();
            };
            rightActions.appendChild(maxBtn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'icon-btn delete';
        closeBtn.style.fontSize = '0.72rem';
        closeBtn.title = 'Close this window';
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

        const modElement = document.getElementById(modInfo.id);
        if (modElement) body.appendChild(modElement);

        cell.appendChild(bar);
        cell.appendChild(body);
        return cell;
    }

    if (node.type === 'split') {
        const splitEl = document.createElement('div');
        splitEl.className = `tiling-split dir-${node.dir}`;
        splitEl.style.flex = '1 1 0%';

        const childEl0 = buildTilingDomNode(node.children[0], paneCounter, totalPanes);
        const childEl1 = buildTilingDomNode(node.children[1], paneCounter, totalPanes);
        if (!childEl0 || !childEl1) return childEl0 || childEl1;

        const r = Math.max(0.125, Math.min(0.875, parseFloat(node.ratio) || 0.5));
        childEl0.style.flex = `${r} 1 0%`;
        childEl1.style.flex = `${1 - r} 1 0%`;

        const resizer = document.createElement('div');
        resizer.className = node.dir === 'row' ? 'resizer-vertical' : 'resizer-horizontal';
        resizer.title = 'Drag to resize';

        attachSplitResizer(resizer, splitEl, node, childEl0, childEl1);

        splitEl.appendChild(childEl0);
        splitEl.appendChild(resizer);
        splitEl.appendChild(childEl1);
        return splitEl;
    }

    return null;
}

function attachSplitResizer(resizerEl, splitEl, splitNode, childEl0, childEl1) {
    let isDragging = false;

    resizerEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        resizerEl.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = splitNode.dir === 'row' ? 'ew-resize' : 'ns-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
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

            const rawRatio = (e.clientX - rect.left) / totalW;
            const clampedRatio = Math.max(minRatio, Math.min(maxRatio, rawRatio));

            splitNode.ratio = clampedRatio;
            childEl0.style.flex = `${clampedRatio} 1 0%`;
            childEl1.style.flex = `${1 - clampedRatio} 1 0%`;
        } else {
            const totalH = rect.height;
            if (totalH <= 100) return;

            const minH0 = getSubtreeMinHeight(splitNode.children[0]);
            const minH1 = getSubtreeMinHeight(splitNode.children[1]);

            let minRatio = Math.max(0.15, minH0 / totalH);
            let maxRatio = Math.min(0.85, (totalH - minH1) / totalH);
            if (minRatio > maxRatio) minRatio = maxRatio = 0.5;

            const rawRatio = (e.clientY - rect.top) / totalH;
            const clampedRatio = Math.max(minRatio, Math.min(maxRatio, rawRatio));

            splitNode.ratio = clampedRatio;
            childEl0.style.flex = `${clampedRatio} 1 0%`;
            childEl1.style.flex = `${1 - clampedRatio} 1 0%`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        resizerEl.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        saveWorkspaceState();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        if (activeSlots.includes('money') && typeof drawSteppedChart === 'function') {
            setTimeout(drawSteppedChart, 15);
        }
    });
}

// ============================================================================
// MOTORE CUSTOM MOUSE DRAG & SNAP STILE WINDOWS (ZERO BLOCCO DEL CURSORE!)
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

    // 1. I 4 ANGOLI DELLO SCHERMO -> QUARTO DI SCHERMO (1/4) STILE WINDOWS
    const cornerT = 0.16;
    if (gx < cornerT && gy < cornerT) {
        currentSnapAction = { scope: 'screen_corner', corner: 'tl' };
        showSnapPreview(wrapRect.left, wrapRect.top, wrapRect.width / 2, wrapRect.height / 2, 'TOP-LEFT QUARTER (1/4)');
        return;
    }
    if (gx > (1 - cornerT) && gy < cornerT) {
        currentSnapAction = { scope: 'screen_corner', corner: 'tr' };
        showSnapPreview(wrapRect.left + wrapRect.width / 2, wrapRect.top, wrapRect.width / 2, wrapRect.height / 2, 'TOP-RIGHT QUARTER (1/4)');
        return;
    }
    if (gx < cornerT && gy > (1 - cornerT)) {
        currentSnapAction = { scope: 'screen_corner', corner: 'bl' };
        showSnapPreview(wrapRect.left, wrapRect.top + wrapRect.height / 2, wrapRect.width / 2, wrapRect.height / 2, 'BOTTOM-LEFT QUARTER (1/4)');
        return;
    }
    if (gx > (1 - cornerT) && gy > (1 - cornerT)) {
        currentSnapAction = { scope: 'screen_corner', corner: 'br' };
        showSnapPreview(wrapRect.left + wrapRect.width / 2, wrapRect.top + wrapRect.height / 2, wrapRect.width / 2, wrapRect.height / 2, 'BOTTOM-RIGHT QUARTER (1/4)');
        return;
    }

    // 2. BORDI ESTERNI GLOBALI DELLO SCHERMO (Metà Sinistra, Metà Destra, Metà Sopra, Metà Sotto)
    const outerEdgeT = 0.07;
    if (gx < outerEdgeT) {
        currentSnapAction = { scope: 'root_edge', edge: 'left' };
        showSnapPreview(wrapRect.left, wrapRect.top, wrapRect.width / 2, wrapRect.height, 'FULL LEFT HALF');
        return;
    }
    if (gx > (1 - outerEdgeT)) {
        currentSnapAction = { scope: 'root_edge', edge: 'right' };
        showSnapPreview(wrapRect.left + wrapRect.width / 2, wrapRect.top, wrapRect.width / 2, wrapRect.height, 'FULL RIGHT HALF');
        return;
    }
    if (gy < outerEdgeT) {
        currentSnapAction = { scope: 'root_edge', edge: 'top' };
        showSnapPreview(wrapRect.left, wrapRect.top, wrapRect.width, wrapRect.height / 2, 'FULL TOP HALF');
        return;
    }
    if (gy > (1 - outerEdgeT)) {
        currentSnapAction = { scope: 'root_edge', edge: 'bottom' };
        showSnapPreview(wrapRect.left, wrapRect.top + wrapRect.height / 2, wrapRect.width, wrapRect.height / 2, 'FULL BOTTOM HALF');
        return;
    }

    // 3. SNAP INTERNO SU QUALSIASI FINESTRA SPECIFICA (Divide quella finestra a metà o fa Swap al centro)
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
        showSnapPreview(pRect.left, pRect.top, pRect.width, pRect.height, 'SWAP / REPLACE');
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
    if (modLeft === 'tasks' && modRight === 'planner') return 0.32;
    if (modLeft === 'planner' && modRight === 'tasks') return 0.68;
    return 0.5;
}

function executeSnapDrop(modKey, action) {
    if (!dashboardModules[modKey] || !action) return;

    if (action.scope === 'root_empty' || !layoutTree) {
        layoutTree = makePaneNode(modKey);
        renderQuadrantLayout();
        return;
    }

    if (action.scope === 'pane' && action.zone === 'center') {
        changePaneModuleById(action.paneId, modKey);
        return;
    }

    const existingLeafs = collectLeafPanes(layoutTree);
    const targetLeaf = existingLeafs.find(l => l.id === action.paneId);
    if (targetLeaf && targetLeaf.module === modKey && existingLeafs.length === 1) {
        return;
    }

    let cleanTree = removePaneByModule(layoutTree, modKey);
    if (!cleanTree) {
        layoutTree = makePaneNode(modKey);
        renderQuadrantLayout();
        return;
    }

    // Bordo esterno globale dello schermo
    if (action.scope === 'root_edge') {
        const newPane = makePaneNode(modKey);
        const dir = (action.edge === 'left' || action.edge === 'right') ? 'row' : 'col';
        const isFirst = (action.edge === 'left' || action.edge === 'top');
        layoutTree = isFirst
            ? makeSplitNode(dir, 0.5, newPane, cleanTree)
            : makeSplitNode(dir, 0.5, cleanTree, newPane);
        renderQuadrantLayout();
        return;
    }

    // Angolo 1/4 dello schermo
    if (action.scope === 'screen_corner') {
        const newPane = makePaneNode(modKey);
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

    // Split su una singola finestra esistente
    if (action.scope === 'pane') {
        const newPane = makePaneNode(modKey);
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

// --- FUNZIONI CHIAMATE DA SCORCIATOIE, ZERO-UI E AI ---

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
    addModuleToTilingLayout(modKey);
}

function switchModule(side, rawModKey) {
    let modKey = rawModKey === 'daily' ? 'tasks' : (rawModKey === 'health' ? 'diet' : rawModKey);
    if (!dashboardModules[modKey]) return;
    const leaves = collectLeafPanes(layoutTree);
    if (leaves.length === 0) {
        layoutTree = makePaneNode(modKey);
        renderQuadrantLayout();
        return;
    }
    const targetLeaf = (side === 'right' && leaves.length >= 2) ? leaves[1] : leaves[0];
    changePaneModuleById(targetLeaf.id, modKey);
}

// ============================================================================
// MENU VIEW ▼: SCELTA COSA SI APRE ALL'AVVIO (STARTUP) + VISTE SALVATE
// ============================================================================

function updateWorkspaceDropdownUI() {
    const dropEl = document.getElementById('settings-workspace-container') || document.getElementById('dropdown-workspaces');
    if (!dropEl) return;

    const isLastStartup = (startupView === 'last');
    const isZeroStartup = (startupView === 'zero');
    const currentSingleStartupMod = startupView.startsWith('mod:') ? startupView.slice(4) : '';

    let singleModOptionsHtml = `<option value="">-- Pick Single Module --</option>`;
    ALL_MODULE_KEYS.forEach(k => {
        singleModOptionsHtml += `<option value="mod:${k}" ${currentSingleStartupMod === k ? 'selected' : ''}>Open Only: ${dashboardModules[k].name}</option>`;
    });

    let html = `
        <div style="padding: 7px 12px; font-size: 0.65rem; color: var(--text-dim); border-bottom: 1px solid var(--border-color); text-transform: uppercase;">
            1. On App Launch (Startup Default)
        </div>
        <div class="startup-option-row ${isLastStartup ? 'active' : ''}" onclick="setStartupViewPreference('last')">
            <span>Restore Last Active Layout</span>
            <span>${isLastStartup ? '[★ ACTIVE]' : '[SET]'}</span>
        </div>
        <div class="startup-option-row ${isZeroStartup ? 'active' : ''}" onclick="setStartupViewPreference('zero')">
            <span>0 // Zero-UI Empty Canvas</span>
            <span>${isZeroStartup ? '[★ ACTIVE]' : '[SET]'}</span>
        </div>
        <div style="padding: 8px 12px; border-bottom: 1px solid var(--border-color); display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <span style="font-size:var(--font-xs); color:var(--text-muted);">Single Module at Startup:</span>
            <select class="form-control form-control-sm" style="width:180px; padding:3px 6px;" onchange="if(this.value) setStartupViewPreference(this.value)">
                ${singleModOptionsHtml}
            </select>
        </div>

        <div style="padding: 7px 12px; font-size: 0.65rem; color: var(--text-dim); border-bottom: 1px solid var(--border-color); text-transform: uppercase; margin-top: 6px;">
            2. Saved Custom Views (Click name to load · ★ for Startup)
        </div>
    `;

    if (workspacePresets.length === 0) {
        html += `<div style="padding: 12px; font-size: var(--font-xs); color: var(--text-dim);">No saved views yet. Save your current tiling layout below.</div>`;
    } else {
        workspacePresets.forEach(p => {
            const pLeaves = p.tree ? collectLeafPanes(p.tree).map(l => l.module.toUpperCase()) : [];
            const desc = pLeaves.length === 0 ? 'ZERO-UI' : pLeaves.join(' + ');
            const isPresetStartup = (startupView === `preset:${p.id}`);

            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 12px; border-bottom: 1px solid #1a1a1a; gap: 8px;">
                    <div style="cursor:pointer; flex:1; min-width:0;" onclick="applyWorkspacePreset('${p.id}')">
                        <div style="font-size: var(--font-xs); font-weight: bold; color: var(--text-main); overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.name)}</div>
                        <div style="font-size: 0.65rem; color: var(--text-dim); overflow:hidden; text-overflow:ellipsis;">${escapeHtml(desc)}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                        <button class="startup-star-btn ${isPresetStartup ? 'active' : ''}" onclick="setStartupViewPreference('preset:${p.id}')" title="Open this view automatically when the app starts">
                            ${isPresetStartup ? '★ STARTUP' : '☆ STARTUP'}
                        </button>
                        <button class="icon-btn delete" onclick="deleteWorkspacePreset('${p.id}')" title="Delete saved view">[X]</button>
                    </div>
                </div>
            `;
        });
    }

    html += `
        <div style="padding: 10px; background: #030303; display: flex; gap: 6px; border-top: 1px solid var(--border-color);">
            <input type="text" id="new-preset-name-input" class="form-control form-control-sm" placeholder="Save current layout as..." onkeydown="if(event.key==='Enter'){event.preventDefault(); saveCurrentWorkspacePreset('new-preset-name-input');}">
            <button class="btn btn-primary btn-sm" onclick="saveCurrentWorkspacePreset('new-preset-name-input')">[SAVE VIEW]</button>
        </div>
    `;

    dropEl.innerHTML = html;
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
    if (typeof showToast === 'function') showToast(`[VIEW] Loaded "${p.name}"`);
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
    if (typeof showToast === 'function') showToast(`[VIEW] Saved "${name}"`);
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

function updateGlobalClock() {
    const clockEl = document.getElementById('global-clock');
    if (!clockEl) return;

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

    clockEl.innerText = `${timeStr} // ${dayName} ${dayNum}`;
}

setInterval(updateGlobalClock, 1000);

window.addEventListener('DOMContentLoaded', () => {
    updateGlobalClock();
    initDashboard();
});
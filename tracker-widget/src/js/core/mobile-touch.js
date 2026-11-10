// --- js/core/mobile-touch.js ---
// Mobile & Tablet Touch Engine:
// 1. Switch [🖥 / 📱] (Auto-detect <=768px + Manual Override)
// 2. Bottom Bar a 5 Moduli (Tasks, Plan, Gym, Notes, Money + [V]) & Sub-Module Pill Strip
// 3. Touch Date Bar (<- TODAY ->) + Long-Press (400ms -> Right-Click) + Touch-Drag Bridge

let isMobileViewMode = localStorage.getItem('cortex_force_mobile') === 'true' || window.innerWidth <= 768;
let activeMobileModKey = localStorage.getItem('cortex_mobile_active_mod') || 'tasks';
let savedDesktopLayoutTreeBeforeMobile = null;

const MOBILE_PINNED_TABS = [
    { id: 'tasks', label: 'TASKS', macro: 'tasks', defaultMod: 'tasks' },
    { id: 'plan', label: 'PLAN', macro: 'plan', defaultMod: 'plan' },
    { id: 'gym', label: 'GYM', macro: 'gym', defaultMod: 'gym_today' },
    { id: 'notes', label: 'NOTES', macro: 'notes', defaultMod: 'notes_browse' },
    { id: 'money', label: 'MONEY', macro: 'money', defaultMod: 'm_summary' }
];

function findParentMacroForSubmodule(modKey) {
    if (!modKey) return 'tasks';
    if (typeof MACRO_SUBMODULES_MAP !== 'undefined') {
        if (MACRO_SUBMODULES_MAP[modKey]) return modKey;
        for (const [macro, subs] of Object.entries(MACRO_SUBMODULES_MAP)) {
            if (Array.isArray(subs) && subs.includes(modKey)) return macro;
        }
    }
    return modKey;
}

function toggleMobileViewMode(forceState = null) {
    const nextState = forceState !== null ? Boolean(forceState) : !isMobileViewMode;

    if (nextState && !isMobileViewMode) {
        if (typeof layoutTree !== 'undefined' && layoutTree) {
            savedDesktopLayoutTreeBeforeMobile = JSON.parse(JSON.stringify(layoutTree));
        }
        isMobileViewMode = true;
        localStorage.setItem('cortex_force_mobile', 'true');
        const currentLeaves = typeof collectLeafPanes === 'function' ? collectLeafPanes(layoutTree) : [];
        if (currentLeaves.length > 0) {
            activeMobileModKey = currentLeaves[0].module;
        }
        mountMobileSingleModule(activeMobileModKey);
    } else if (!nextState && isMobileViewMode) {
        isMobileViewMode = false;
        localStorage.setItem('cortex_force_mobile', 'false');
        document.body.classList.remove('mobile-view-mode');
        if (savedDesktopLayoutTreeBeforeMobile) {
            layoutTree = JSON.parse(JSON.stringify(savedDesktopLayoutTreeBeforeMobile));
        }
        if (typeof renderQuadrantLayout === 'function') renderQuadrantLayout();
    }

    syncMobileModeUI();
}

function mountMobileSingleModule(modKey) {
    if (!dashboardModules[modKey]) modKey = 'tasks';
    // Se viene passato un macro-modulo contenitore (es. 'money' o 'notes'), su mobile monta il suo primo sottomodulo atomico
    if (typeof MACRO_SUBMODULES_MAP !== 'undefined' && MACRO_SUBMODULES_MAP[modKey] && MACRO_SUBMODULES_MAP[modKey].length > 1 && modKey === 'money') {
        modKey = 'm_summary';
    } else if (modKey === 'notes') {
        modKey = 'notes_browse';
    } else if (modKey === 'gym') {
        modKey = 'gym_today';
    } else if (modKey === 'diet') {
        modKey = 'diet_today';
    } else if (modKey === 'calendar') {
        modKey = 'cal_grid';
    } else if (modKey === 'streak') {
        modKey = 'streak_grid';
    } else if (modKey === 'uni') {
        modKey = 'uni_roadmap';
    }

    activeMobileModKey = modKey;
    localStorage.setItem('cortex_mobile_active_mod', activeMobileModKey);

    if (isMobileViewMode && typeof makePaneNode === 'function') {
        layoutTree = makePaneNode(activeMobileModKey);
        if (typeof renderQuadrantLayout === 'function') renderQuadrantLayout();
    }
    syncMobileModeUI();
}

function syncMobileModeUI() {
    document.body.classList.toggle('mobile-view-mode', isMobileViewMode);

    const switchBtn = document.getElementById('btn-toggle-mobile-mode');
    if (switchBtn) {
        switchBtn.textContent = isMobileViewMode ? '[📱]' : '[🖥]';
        switchBtn.style.color = isMobileViewMode ? 'var(--accent-green)' : 'var(--text-dim)';
        switchBtn.title = isMobileViewMode ? 'Mobile Touch Mode Active (Click for Desktop Tiling)' : 'Desktop Tiling Mode (Click for Mobile Touch Mode)';
    }

    const topStrip = document.getElementById('mobile-top-nav-strip');
    const bottomBar = document.getElementById('mobile-bottom-nav');
    if (!topStrip || !bottomBar) return;

    if (!isMobileViewMode) {
        topStrip.style.display = 'none';
        bottomBar.style.display = 'none';
        return;
    }

    topStrip.style.display = 'flex';
    bottomBar.style.display = 'flex';

    // 1. Aggiorna data corrente nella barra mobile
    const dateBtn = document.getElementById('mob-date-Display-btn');
    if (dateBtn) {
        const isOnToday = (selectedDateStr === todayStr);
        dateBtn.textContent = isOnToday ? `TODAY // ${selectedDateStr.slice(5)}` : selectedDateStr;
        dateBtn.classList.toggle('btn-primary', isOnToday);
    }

    // 2. Aggiorna la striscia orizzontale dei Sotto-Moduli se il Macro-Modulo attivo ne ha più di 1
    const subStrip = document.getElementById('mobile-submod-pills');
    const parentMacro = findParentMacroForSubmodule(activeMobileModKey);
    const subList = (typeof MACRO_SUBMODULES_MAP !== 'undefined' && MACRO_SUBMODULES_MAP[parentMacro])
        ? MACRO_SUBMODULES_MAP[parentMacro]
        : [];

    if (subStrip) {
        if (subList.length > 1) {
            subStrip.style.display = 'flex';
            subStrip.innerHTML = '';
            subList.forEach(sk => {
                if (!dashboardModules[sk]) return;
                const shortName = dashboardModules[sk].name.replace(/^.*?:\s*/, '');
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `note-subcat-pill ${sk === activeMobileModKey ? 'active' : ''}`;
                b.style.cssText = 'padding: 4px 10px; font-size: 0.68rem; flex-shrink: 0;';
                b.textContent = shortName.toUpperCase();
                b.onclick = () => mountMobileSingleModule(sk);
                subStrip.appendChild(b);
            });
        } else {
            subStrip.style.display = 'none';
            subStrip.innerHTML = '';
        }
    }

    // 3. Evidenzia il tab attivo nella Bottom Navigation Bar
    bottomBar.querySelectorAll('.mob-nav-tab').forEach(btn => {
        const tabMacro = btn.dataset.macro;
        btn.classList.toggle('active', tabMacro === parentMacro);
    });
}

// ============================================================================
// PONTE GESTI TOUCH: LONG-PRESS (400ms -> RIGHT-CLICK) & TOUCH-DRAG
// ============================================================================

function initMobileTouchGesturesBridge() {
    let longPressTimer = null;
    let touchStartPos = { x: 0, y: 0 };
    let activeTouchDragTarget = null;

    // 1. Long-Press (400ms) -> Simula contextmenu (Tasto Destro per selezionare Note o rimuovere blocchi Planner)
    document.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const touch = e.touches[0];
        touchStartPos = { x: touch.clientX, y: touch.clientY };

        const target = e.target;
        const actionableEl = target.closest('.note-card, .block-absolute, .notes-graph-canvas');

        if (actionableEl) {
            clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                if (navigator.vibrate) navigator.vibrate(20);
                const ctxEv = new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    button: 2
                });
                target.dispatchEvent(ctxEv);
            }, 420);
        }

        // 2. Touch-Drag Bridge per Day Planner, Maniglie Resize e Grafo Note
        const draggableEl = target.closest('.plan-draggable-card, .plan-block-resize-handle, #plan-mod-day-canvas .block-absolute, .notes-graph-canvas');
        if (draggableEl && !target.closest('button, input, select, textarea')) {
            activeTouchDragTarget = draggableEl;
            const downEv = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0
            });
            draggableEl.dispatchEvent(downEv);
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const touch = e.touches[0];
        const moveDist = Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y);
        if (moveDist > 10) {
            clearTimeout(longPressTimer);
        }

        if (activeTouchDragTarget) {
            // Se il drag nel Day Planner o nel Grafo è attivo, impedisce lo scroll verticale della pagina
            const isPlannerDragging = typeof planTimelineDragState !== 'undefined' && planTimelineDragState && planTimelineDragState.isDragging;
            const isGraphCanvas = activeTouchDragTarget.classList.contains('notes-graph-canvas');
            if (isPlannerDragging || isGraphCanvas) {
                e.preventDefault();
            }

            const moveEv = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0
            });
            activeTouchDragTarget.dispatchEvent(moveEv);
        }
    }, { passive: false });

    const endTouchHandler = (e) => {
        clearTimeout(longPressTimer);
        if (activeTouchDragTarget) {
            const touch = (e.changedTouches && e.changedTouches[0]) || touchStartPos;
            const upEv = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: touch.clientX || touchStartPos.x,
                clientY: touch.clientY || touchStartPos.y,
                button: 0
            });
            window.dispatchEvent(upEv);
            activeTouchDragTarget = null;
        }
    };

    document.addEventListener('touchend', endTouchHandler, { passive: true });
    document.addEventListener('touchcancel', endTouchHandler, { passive: true });
}

window.addEventListener('DOMContentLoaded', () => {
    initMobileTouchGesturesBridge();

    // Aggancia setModulesView così quando scegli un modulo da [V] su mobile lo monta in formato singolo mobile
    if (typeof window.setModulesView === 'function' && !window.setModulesView._mobileHooked) {
        const origSetModulesView = window.setModulesView;
        window.setModulesView = function(modKeysArray) {
            if (isMobileViewMode && Array.isArray(modKeysArray) && modKeysArray.length > 0) {
                const resolved = dashboardModules[modKeysArray[0]]
                    ? modKeysArray[0]
                    : (typeof resolveModuleKeyFromText === 'function' ? resolveModuleKeyFromText(modKeysArray[0]) : 'tasks');
                mountMobileSingleModule(resolved || 'tasks');
                return true;
            }
            return origSetModulesView(modKeysArray);
        };
        window.setModulesView._mobileHooked = true;
    }

    // Aggancia selectDate per aggiornare l'etichetta della data nella barra mobile
    if (typeof window.selectDate === 'function' && !window.selectDate._mobileDateHooked) {
        const origSelectDate = window.selectDate;
        window.selectDate = function(dateStr) {
            origSelectDate(dateStr);
            syncMobileModeUI();
        };
        window.selectDate._mobileDateHooked = true;
    }

    if (isMobileViewMode) {
        mountMobileSingleModule(activeMobileModKey);
    } else {
        syncMobileModeUI();
    }

    window.addEventListener('resize', () => {
        if (localStorage.getItem('cortex_force_mobile') === null) {
            const shouldBeMobile = window.innerWidth <= 768;
            if (shouldBeMobile !== isMobileViewMode) {
                toggleMobileViewMode(shouldBeMobile);
            }
        }
    });
});
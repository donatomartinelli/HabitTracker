// --- js/core/mobile-touch.js ---
// Mobile & Tablet Touch Engine:
// 1. Vertical Flex Layout Stack & Auto-Recovery after Cloud Pull
// 2. Saved Views Mobile Adapter (mostra i moduli di una Saved View come pillole a tutto schermo)
// 3. Instant Touch Suggestions nella Command Bar (chiude tastiera iOS ed esegue al tocco)

let isMobileViewMode = localStorage.getItem('cortex_force_mobile') === 'true' ||
    (localStorage.getItem('cortex_force_mobile') !== 'false' && window.innerWidth <= 768);
let activeMobileModKey = localStorage.getItem('cortex_mobile_active_mod') || 'tasks';
let activeMobilePresetMods = null; // Array di moduli quando apri una Saved View (es. GENERALE) su telefono
let activeMobilePresetName = '';
let savedDesktopLayoutTreeBeforeMobile = null;

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

function normalizeToSingleLeafModuleKey(modKey) {
    if (!modKey || !dashboardModules[modKey]) return 'tasks';
    const mapDefaults = {
        'money': 'm_summary',
        'notes': 'notes_browse',
        'gym': 'gym_today',
        'diet': 'diet_today',
        'calendar': 'cal_grid',
        'streak': 'streak_grid',
        'uni': 'uni_roadmap'
    };
    return mapDefaults[modKey] || modKey;
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
        if (currentLeaves.length > 1) {
            activeMobilePresetMods = currentLeaves.map(l => normalizeToSingleLeafModuleKey(l.module));
            activeMobilePresetName = 'VIEW';
            activeMobileModKey = activeMobilePresetMods[0];
        } else if (currentLeaves.length === 1) {
            activeMobileModKey = normalizeToSingleLeafModuleKey(currentLeaves[0].module);
        }
        mountMobileSingleModule(activeMobileModKey, true);
    } else if (!nextState && isMobileViewMode) {
        isMobileViewMode = false;
        localStorage.setItem('cortex_force_mobile', 'false');
        document.body.classList.remove('mobile-view-mode');
        if (savedDesktopLayoutTreeBeforeMobile) {
            layoutTree = JSON.parse(JSON.stringify(savedDesktopLayoutTreeBeforeMobile));
        }
        if (typeof renderQuadrantLayout === 'function') renderQuadrantLayout();
        syncMobileModeUI();
    }
}

function mountMobileSingleModule(modKey, keepPresetStrip = false) {
    const cleanKey = normalizeToSingleLeafModuleKey(modKey);
    activeMobileModKey = cleanKey;
    localStorage.setItem('cortex_mobile_active_mod', activeMobileModKey);

    if (!keepPresetStrip) {
        activeMobilePresetMods = null;
        activeMobilePresetName = '';
    }

    if (isMobileViewMode && typeof makePaneNode === 'function') {
        document.body.classList.add('mobile-view-mode');
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

    // 1. Bottone Data corrente
    const dateBtn = document.getElementById('mob-date-Display-btn');
    if (dateBtn && typeof selectedDateStr !== 'undefined') {
        const isOnToday = (selectedDateStr === todayStr);
        dateBtn.textContent = isOnToday ? `TODAY // ${selectedDateStr.slice(5)}` : selectedDateStr;
        dateBtn.classList.toggle('btn-primary', isOnToday);
    }

    // 2. Striscia Pillole Superiore:
    //    - Se hai aperto una Saved View (es. GENERALE), mostra i moduli di quella Saved View!
    //    - Altrimenti mostra i sottomoduli del Macro-Modulo corrente (es. TODAY WORKOUT | FULL SPLIT)
    const subStrip = document.getElementById('mobile-submod-pills');
    const parentMacro = findParentMacroForSubmodule(activeMobileModKey);

    if (subStrip) {
        if (Array.isArray(activeMobilePresetMods) && activeMobilePresetMods.length > 1) {
            subStrip.style.display = 'flex';
            subStrip.innerHTML = `<span style="font-size:0.62rem; color:var(--accent-gold); font-weight:bold; flex-shrink:0;">${escapeHtml(activeMobilePresetName)}:</span>`;
            activeMobilePresetMods.forEach(mk => {
                if (!dashboardModules[mk]) return;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `note-subcat-pill ${mk === activeMobileModKey ? 'active' : ''}`;
                b.style.cssText = 'padding: 4px 10px; font-size: 0.68rem; flex-shrink: 0;';
                b.textContent = dashboardModules[mk].name.toUpperCase();
                b.onclick = () => mountMobileSingleModule(mk, true);
                subStrip.appendChild(b);
            });
        } else {
            const subList = (typeof MACRO_SUBMODULES_MAP !== 'undefined' && MACRO_SUBMODULES_MAP[parentMacro])
                ? MACRO_SUBMODULES_MAP[parentMacro]
                : [];
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
                    b.onclick = () => mountMobileSingleModule(sk, false);
                    subStrip.appendChild(b);
                });
            } else {
                subStrip.style.display = 'none';
                subStrip.innerHTML = '';
            }
        }
    }

    // 3. Evidenzia il tab attivo nella Bottom Navigation Bar
    bottomBar.querySelectorAll('.mob-nav-tab').forEach(btn => {
        const tabMacro = btn.dataset.macro;
        btn.classList.toggle('active', tabMacro === parentMacro);
    });
}

// ============================================================================
// PONTE GESTI TOUCH & CHIUSURA AUTOMATICA COMMAND BAR SU TELEFONO
// ============================================================================

function initMobileTouchGesturesBridge() {
    let longPressTimer = null;
    let touchStartPos = { x: 0, y: 0 };
    let activeTouchDragTarget = null;

    // Intercetta il tocco sui suggerimenti della barra comandi (#terminal-suggestions) su iOS/Android
    const sugBox = document.getElementById('terminal-suggestions');
    if (sugBox) {
        sugBox.addEventListener('touchend', (e) => {
            const item = e.target.closest('.terminal-suggestion-item');
            if (item && typeof item.onclick === 'function') {
                e.preventDefault();
                e.stopPropagation();
                item.onclick(e);
                const inp = document.getElementById('terminal-input');
                if (inp) inp.blur();
            }
        }, { passive: false });
    }

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
        if (Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y) > 10) {
            clearTimeout(longPressTimer);
        }

        if (activeTouchDragTarget) {
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

    // 1. Intercetta setModulesView (es. quando scegli un modulo da [V] o dalla barra comandi)
    if (typeof window.setModulesView === 'function' && !window.setModulesView._mobileHooked) {
        const origSetModulesView = window.setModulesView;
        window.setModulesView = function(modKeysArray) {
            if (isMobileViewMode && Array.isArray(modKeysArray) && modKeysArray.length > 0) {
                const resolvedList = modKeysArray
                    .map(k => dashboardModules[k] ? k : (typeof resolveModuleKeyFromText === 'function' ? resolveModuleKeyFromText(k) : null))
                    .filter(Boolean)
                    .map(k => normalizeToSingleLeafModuleKey(k));

                if (resolvedList.length > 1) {
                    activeMobilePresetMods = [...new Set(resolvedList)];
                    activeMobilePresetName = 'SPLIT';
                    mountMobileSingleModule(activeMobilePresetMods[0], true);
                } else if (resolvedList.length === 1) {
                    mountMobileSingleModule(resolvedList[0], false);
                }
                if (typeof closeTerminal === 'function') closeTerminal();
                return true;
            }
            return origSetModulesView(modKeysArray);
        };
        window.setModulesView._mobileHooked = true;
    }

    // 2. Intercetta applyWorkspacePreset (es. quando apri "generale" sul telefono!)
    if (typeof window.applyWorkspacePreset === 'function' && !window.applyWorkspacePreset._mobileHooked) {
        const origApplyPreset = window.applyWorkspacePreset;
        window.applyWorkspacePreset = function(presetId) {
            if (isMobileViewMode) {
                const p = (workspacePresets || []).find(x => x.id === presetId);
                if (p && p.tree) {
                    const leaves = collectLeafPanes(p.tree).map(l => normalizeToSingleLeafModuleKey(l.module));
                    const uniqueLeaves = [...new Set(leaves)];
                    if (uniqueLeaves.length > 0) {
                        activeMobilePresetMods = uniqueLeaves;
                        activeMobilePresetName = p.name;
                        mountMobileSingleModule(uniqueLeaves[0], true);
                        if (typeof closeTerminal === 'function') closeTerminal();
                        if (typeof showToast === 'function') showToast(`[VIEW] ${p.name}`);
                        return;
                    }
                }
            }
            origApplyPreset(presetId);
        };
        window.applyWorkspacePreset._mobileHooked = true;
    }

    // 3. Intercetta selectDate per aggiornare il badge della data
    if (typeof window.selectDate === 'function' && !window.selectDate._mobileDateHooked) {
        const origSelectDate = window.selectDate;
        window.selectDate = function(dateStr) {
            origSelectDate(dateStr);
            syncMobileModeUI();
        };
        window.selectDate._mobileDateHooked = true;
    }

    // Monta il modulo iniziale e garantisce che anche dopo l'idratazione asincrona / Cloud Pull resti un singolo modulo a tutto schermo su mobile
    const enforceMobileSinglePane = () => {
        if (isMobileViewMode) {
            mountMobileSingleModule(activeMobileModKey, Boolean(activeMobilePresetMods));
        } else {
            syncMobileModeUI();
        }
    };

    enforceMobileSinglePane();
    setTimeout(enforceMobileSinglePane, 250);
    setTimeout(enforceMobileSinglePane, 950);
});
// --- js/core/mobile-touch.js ---
// Mobile & Tablet Touch Engine v3:
// 1. Encoding UTF-8 Pulito ([MOB]/[DESK], TODAY ·, [DONE ✓]) + Pulsanti Undo/Redo nella Top Bar
// 2. Day Planner Mobile Safe-Scroll: in VIEW non sposta/cancella mai nulla per errore; in EDIT usa Long-Press (350ms) o Tap-to-Place
// 3. Gym Quick-Stepper Bar ([-2.5] [-1] [+1] [+2.5] [= PREV] [DONE ✓]) & Swipe Orizzontale sottomoduli

let isMobileViewMode = cortexStore.getItem('cortex_force_mobile') === 'true' ||
    (cortexStore.getItem('cortex_force_mobile') !== 'false' && window.innerWidth <= 768);
let activeMobileModKey = cortexStore.getItem('cortex_mobile_active_mod') || 'tasks';
let activeMobilePresetMods = null;
let activeMobilePresetName = '';
let savedDesktopLayoutTreeBeforeMobile = null;
let activeFocusedGymInput = null;

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

function enhanceMobileInputsErgonomics() {
    document.querySelectorAll('input[type="number"], .gym-input').forEach(inp => {
        if (!inp.getAttribute('inputmode')) {
            inp.setAttribute('inputmode', 'decimal');
        }
    });
}

function updateMobileUndoRedoButtonsUI() {
    const undoBtn = document.getElementById('mob-undo-btn');
    const redoBtn = document.getElementById('mob-redo-btn');
    const hasUndo = typeof undoStack !== 'undefined' && undoStack.length > 0;
    const hasRedo = typeof redoStack !== 'undefined' && redoStack.length > 0;

    if (undoBtn) {
        undoBtn.style.opacity = hasUndo ? '1' : '0.35';
    }
    if (redoBtn) {
        redoBtn.style.opacity = hasRedo ? '1' : '0.35';
    }
}

function toggleMobileViewMode(forceState = null) {
    const nextState = forceState !== null ? Boolean(forceState) : !isMobileViewMode;

    if (nextState && !isMobileViewMode) {
        if (typeof layoutTree !== 'undefined' && layoutTree) {
            savedDesktopLayoutTreeBeforeMobile = JSON.parse(JSON.stringify(layoutTree));
        }
        isMobileViewMode = true;
        cortexStore.setItem('cortex_force_mobile', 'true');
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
        cortexStore.setItem('cortex_force_mobile', 'false');
        document.body.classList.remove('mobile-view-mode');
        hideMobileGymQuickStepper();
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
    cortexStore.setItem('cortex_mobile_active_mod', activeMobileModKey);
    hideMobileGymQuickStepper();

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
    setTimeout(enhanceMobileInputsErgonomics, 40);
}

function getCurrentMobileCycleList() {
    if (Array.isArray(activeMobilePresetMods) && activeMobilePresetMods.length > 1) {
        return { list: activeMobilePresetMods, isPreset: true };
    }
    const parentMacro = findParentMacroForSubmodule(activeMobileModKey);
    const subList = (typeof MACRO_SUBMODULES_MAP !== 'undefined' && MACRO_SUBMODULES_MAP[parentMacro])
        ? MACRO_SUBMODULES_MAP[parentMacro]
        : [];
    return { list: subList, isPreset: false };
}

function syncMobileModeUI() {
    document.body.classList.toggle('mobile-view-mode', isMobileViewMode);

    const switchBtn = document.getElementById('btn-toggle-mobile-mode');
    if (switchBtn) {
        switchBtn.textContent = isMobileViewMode ? '[MOB]' : '[DESK]';
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

    updateMobileUndoRedoButtonsUI();

    const dateBtn = document.getElementById('mob-date-Display-btn');
    if (dateBtn && typeof selectedDateStr !== 'undefined') {
        const isOnToday = (selectedDateStr === todayStr);
        const dObj = parseLocalDate(selectedDateStr);
        const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const dayLbl = dayNames[dObj.getDay()];
        dateBtn.textContent = isOnToday ? `TODAY · ${dayLbl} ${selectedDateStr.slice(8)}` : `${dayLbl} ${selectedDateStr.slice(5)}`;
        dateBtn.classList.toggle('btn-primary', isOnToday);
    }

    const subStrip = document.getElementById('mobile-submod-pills');
    const parentMacro = findParentMacroForSubmodule(activeMobileModKey);

    if (subStrip) {
        if (Array.isArray(activeMobilePresetMods) && activeMobilePresetMods.length > 1) {
            subStrip.style.display = 'flex';
            subStrip.innerHTML = `<span style="font-size:var(--font-2xs); color:var(--accent-gold); font-weight:bold; flex-shrink:0;">${escapeHtml(activeMobilePresetName)}:</span>`;
            activeMobilePresetMods.forEach(mk => {
                if (!dashboardModules[mk]) return;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `note-subcat-pill ${mk === activeMobileModKey ? 'active' : ''}`;
                b.style.cssText = 'padding: 5px 11px; font-size: 0.7rem; flex-shrink: 0;';
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
                    b.style.cssText = 'padding: 5px 11px; font-size: 0.7rem; flex-shrink: 0;';
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

    bottomBar.querySelectorAll('.mob-nav-tab').forEach(btn => {
        const tabMacro = btn.dataset.macro;
        btn.classList.toggle('active', tabMacro === parentMacro);
    });

    enhanceMobileInputsErgonomics();
}

// ============================================================================
// BARRA RAPIDA PESI IN PALESTRA SU MOBILE (GYM QUICK-STEPPER)
// ============================================================================

function ensureMobileGymStepperBar() {
    let bar = document.getElementById('mobile-gym-stepper-bar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'mobile-gym-stepper-bar';
    bar.className = 'mobile-gym-stepper-bar';
    bar.style.display = 'none';
    bar.innerHTML = `
        <button type="button" class="btn btn-sm" data-step="prev">[= PREV]</button>
        <button type="button" class="btn btn-sm" data-step="-2.5">[-2.5]</button>
        <button type="button" class="btn btn-sm" data-step="-1">[-1]</button>
        <button type="button" class="btn btn-sm" data-step="+1">[+1]</button>
        <button type="button" class="btn btn-sm" data-step="+2.5">[+2.5]</button>
        <button type="button" class="btn btn-primary btn-sm" data-step="done">[DONE ✓]</button>
    `;

    bar.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('button[data-step]');
        if (!btn || !activeFocusedGymInput) return;
        e.preventDefault();

        const action = btn.dataset.step;
        if (action === 'done') {
            activeFocusedGymInput.blur();
            hideMobileGymQuickStepper();
            return;
        }

        if (action === 'prev') {
            const prevInp = activeFocusedGymInput.previousElementSibling;
            if (prevInp && prevInp.classList.contains('gym-input') && prevInp.value) {
                activeFocusedGymInput.value = prevInp.value;
            }
        } else {
            const delta = parseFloat(action) || 0;
            const cur = parseFloat(activeFocusedGymInput.value) || 0;
            const nextVal = Math.max(0, Math.round((cur + delta) * 10) / 10);
            activeFocusedGymInput.value = nextVal;
        }

        activeFocusedGymInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (navigator.vibrate) navigator.vibrate(10);
    });

    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (bottomNav && bottomNav.parentNode) {
        bottomNav.parentNode.insertBefore(bar, bottomNav);
    } else {
        document.body.appendChild(bar);
    }
    return bar;
}

function showMobileGymQuickStepper(inputEl) {
    if (!isMobileViewMode) return;
    activeFocusedGymInput = inputEl;
    const bar = ensureMobileGymStepperBar();
    bar.style.display = 'flex';
}

function hideMobileGymQuickStepper() {
    activeFocusedGymInput = null;
    const bar = document.getElementById('mobile-gym-stepper-bar');
    if (bar) bar.style.display = 'none';
}

// ============================================================================
// PONTE GESTI TOUCH: SWIPE SOTTOMODULI, LONG-PRESS & SAFE TIMELINE DRAG
// ============================================================================

function initMobileTouchGesturesBridge() {
    let longPressTimer = null;
    let touchDragHoldTimer = null;
    let touchStartPos = { x: 0, y: 0, time: 0 };
    let activeTouchDragTarget = null;

    document.addEventListener('focusin', (e) => {
        if (isMobileViewMode && e.target && e.target.classList && e.target.classList.contains('gym-input')) {
            showMobileGymQuickStepper(e.target);
        }
    });

    document.addEventListener('focusout', (e) => {
        if (e.target && e.target === activeFocusedGymInput) {
            setTimeout(() => {
                if (!document.activeElement || !document.activeElement.classList.contains('gym-input')) {
                    hideMobileGymQuickStepper();
                }
            }, 150);
        }
    });

    // Fix tap su suggerimenti della barra comando (.suggestion-item)
    const sugBox = document.getElementById('terminal-suggestions');
    if (sugBox) {
        sugBox.addEventListener('touchend', (e) => {
            const item = e.target.closest('.suggestion-item');
            if (item && typeof item.onclick === 'function') {
                e.preventDefault();
                e.stopPropagation();
                item.onclick(e);
            }
        }, { passive: false });
    }

    document.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const touch = e.touches[0];
        touchStartPos = { x: touch.clientX, y: touch.clientY, time: Date.now() };

        const target = e.target;

        // 1. Long-Press (450ms) per menu contestuale su Note Cards o Grafo (NON sui blocchi della timeline quando sei in VIEW)
        const isPlanEditActive = typeof currentDayPlanMode !== 'undefined' && currentDayPlanMode === 'edit';
        const noteOrGraphEl = target.closest('.note-card, .notes-graph-canvas');
        if (noteOrGraphEl) {
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
            }, 450);
        }

        // 2. Canvas Grafo Note: trascinamento immediato
        const graphCanvas = target.closest('.notes-graph-canvas');
        if (graphCanvas) {
            activeTouchDragTarget = graphCanvas;
            const downEv = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0
            });
            graphCanvas.dispatchEvent(downEv);
            return;
        }

        // 3. Blocchi e Maniglie sulla Timeline del Day Planner:
        // Attivi SOLO in modalità EDIT e SOLO dopo un Long-Press di 320ms (così lo scroll col pollice non sposta MAI i blocchi per errore!)
        if (isPlanEditActive && !target.closest('button, input, select, textarea')) {
            const resizeHandle = target.closest('.plan-block-resize-handle');
            const timelineBlock = target.closest('#plan-mod-day-canvas .block-absolute:not(.block-ref)');

            if (resizeHandle) {
                activeTouchDragTarget = resizeHandle;
                if (navigator.vibrate) navigator.vibrate(15);
                resizeHandle.dispatchEvent(new MouseEvent('mousedown', {
                    bubbles: true, cancelable: true, view: window, clientX: touch.clientX, clientY: touch.clientY, button: 0
                }));
            } else if (timelineBlock) {
                clearTimeout(touchDragHoldTimer);
                touchDragHoldTimer = setTimeout(() => {
                    activeTouchDragTarget = timelineBlock;
                    if (navigator.vibrate) navigator.vibrate(25);
                    timelineBlock.dispatchEvent(new MouseEvent('mousedown', {
                        bubbles: true, cancelable: true, view: window, clientX: touch.clientX, clientY: touch.clientY, button: 0
                    }));
                }, 320);
            }
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const touch = e.touches[0];
        if (Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y) > 10) {
            clearTimeout(longPressTimer);
            clearTimeout(touchDragHoldTimer);
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
        clearTimeout(touchDragHoldTimer);
        const touch = (e.changedTouches && e.changedTouches[0]) || null;

        if (activeTouchDragTarget) {
            const upEv = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: (touch && touch.clientX) || touchStartPos.x,
                clientY: (touch && touch.clientY) || touchStartPos.y,
                button: 0
            });
            window.dispatchEvent(upEv);
            activeTouchDragTarget = null;
            return;
        }

        // Swipe Orizzontale Rapido per cambiare Sotto-Modulo col pollice
        if (isMobileViewMode && touch && e.target && !e.target.closest('input, textarea, select, .notes-graph-canvas, .diet-wrapper, #planner-scroll, #m-chart-box')) {
            const dx = touch.clientX - touchStartPos.x;
            const dy = touch.clientY - touchStartPos.y;
            const dt = Date.now() - touchStartPos.time;

            if (dt < 380 && Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 2.2) {
                const { list, isPreset } = getCurrentMobileCycleList();
                if (list.length > 1) {
                    const curIdx = list.indexOf(activeMobileModKey);
                    if (curIdx !== -1) {
                        const nextIdx = dx < 0
                            ? Math.min(list.length - 1, curIdx + 1)
                            : Math.max(0, curIdx - 1);
                        if (nextIdx !== curIdx) {
                            mountMobileSingleModule(list[nextIdx], isPreset);
                        }
                    }
                }
            }
        }
    };

    document.addEventListener('touchend', endTouchHandler, { passive: true });
    document.addEventListener('touchcancel', endTouchHandler, { passive: true });
}

window.addEventListener('DOMContentLoaded', () => {
    initMobileTouchGesturesBridge();

    // Aggiorna lo stato dei bottoni Undo/Redo ad ogni salvataggio o azione Undo/Redo
    ['saveData', 'saveMoneyData', 'saveHealthData', 'saveUniData', 'performGlobalUndo', 'performGlobalRedo'].forEach(fnName => {
        const orig = window[fnName];
        if (typeof orig === 'function') {
            window[fnName] = function(...args) {
                const res = orig.apply(this, args);
                setTimeout(updateMobileUndoRedoButtonsUI, 20);
                return res;
            };
        }
    });

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
                        mountMobileSingleModule(activeMobilePresetMods[0], true);
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

    if (typeof window.selectDate === 'function' && !window.selectDate._mobileDateHooked) {
        const origSelectDate = window.selectDate;
        window.selectDate = function(dateStr) {
            origSelectDate(dateStr);
            syncMobileModeUI();
        };
        window.selectDate._mobileDateHooked = true;
    }

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
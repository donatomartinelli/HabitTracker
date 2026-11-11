// --- js/core/mobile-touch.js ---
// Mobile & Tablet Touch Engine v2:
// 1. Vertical Flex Layout Stack & Saved Views Mobile Adapter
// 2. Gym Quick-Stepper Bar ([-2.5] [-1] [+1] [+2.5] [= PREV] [✓]) quando tocchi un peso in palestra
// 3. Swipe Orizzontale col pollice per cambiare sottomodulo + Numeric Keypad automatico

let isMobileViewMode = localStorage.getItem('cortex_force_mobile') === 'true' ||
    (localStorage.getItem('cortex_force_mobile') !== 'false' && window.innerWidth <= 768);
let activeMobileModKey = localStorage.getItem('cortex_mobile_active_mod') || 'tasks';
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

// Aggiunge inputmode="decimal" a tutti i campi numerici per aprire il tastierino numerico rapido su iPhone/Android
function enhanceMobileInputsErgonomics() {
    document.querySelectorAll('input[type="number"], .gym-input').forEach(inp => {
        if (!inp.getAttribute('inputmode')) {
            inp.setAttribute('inputmode', 'decimal');
        }
    });
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
    localStorage.setItem('cortex_mobile_active_mod', activeMobileModKey);
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

// Restituisce l'elenco di pillole (sottomoduli o moduli della Saved View) attualmente disponibili per lo swipe
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
            subStrip.innerHTML = `<span style="font-size:0.62rem; color:var(--accent-gold); font-weight:bold; flex-shrink:0;">${escapeHtml(activeMobilePresetName)}:</span>`;
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
        e.preventDefault(); // Mantiene il focus sull'input senza far chiudere/riaprire la tastiera

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
// PONTE GESTI TOUCH: SWIPE SOTTOMODULI, LONG-PRESS & TOUCH-DRAG
// ============================================================================

function initMobileTouchGesturesBridge() {
    let longPressTimer = null;
    let touchStartPos = { x: 0, y: 0, time: 0 };
    let activeTouchDragTarget = null;

    // Focus listener per far comparire la barra rapida dei pesi quando tocchi un box kg in palestra
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
        touchStartPos = { x: touch.clientX, y: touch.clientY, time: Date.now() };

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

        // Swipe Orizzontale Rapido per cambiare Sotto-Modulo col pollice (es. WRITE <-> BROWSE <-> GRAPH)
        if (isMobileViewMode && touch && e.target && !e.target.closest('input, textarea, select, .notes-graph-canvas, .diet-wrapper, #planner-scroll')) {
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
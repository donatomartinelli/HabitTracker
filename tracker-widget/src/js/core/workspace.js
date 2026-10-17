// --- js/core/workspace.js ---
// Motore Griglia Dinamica (0-4 Quadranti), Zero-UI Mode e Gestore Presets Salvabili

const dashboardModules = {
    'calendar': { name: 'Calendar',       id: 'module-calendar', render: () => { if (typeof renderCalendar === 'function') renderCalendar(); } },
    'tasks':    { name: 'Daily Tasks',    id: 'module-tasks',    render: () => { if (typeof renderTasks === 'function') renderTasks(); if (typeof renderGeneralTodos === 'function') renderGeneralTodos(); } },
    'notes':    { name: 'Notes',          id: 'module-notes',    render: () => { if (typeof renderNoteCategories === 'function') renderNoteCategories(); } },
    'planner':  { name: 'Weekly Planner', id: 'module-planner',  render: () => { if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner(); } },
    'diet':     { name: 'Diet & Macros',  id: 'module-diet',     render: () => { if (typeof renderDiet === 'function') renderDiet(); } },
    'gym':      { name: 'Gym Split',      id: 'module-gym',      render: () => { if (typeof renderGymDashboard === 'function') renderGymDashboard(); } },
    'money':    { name: 'Money',          id: 'module-money',    render: () => { if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard(); } }
};

const ALL_MODULE_KEYS = Object.keys(dashboardModules);

// Pulisce eventuali chiavi vecchie ('daily', 'health') rimaste in memoria
activeSlots = (activeSlots || [])
    .map(k => k === 'daily' ? 'tasks' : (k === 'health' ? 'diet' : k))
    .filter(k => dashboardModules[k]);

// Rimuove eventuali duplicati nello stesso layout
activeSlots = Array.from(new Set(activeSlots)).slice(0, 4);

function initDashboard() {
    renderQuadrantLayout();
}

// Restituisce tutti i moduli attualmente montati dentro il magazzino nascosto prima di ridisegnare
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

function renderQuadrantLayout() {
    const wrapper = document.getElementById('app-content-wrapper');
    if (!wrapper) return;

    returnAllModulesToRegistry();
    wrapper.innerHTML = '';

    const count = activeSlots.length;
    wrapper.className = `layout grid-${count}`;

    // Aggiorna i bottoni [0] [1] [2] [3] [4] nell'header
    for (let i = 0; i <= 4; i++) {
        const btn = document.getElementById(`slot-btn-${i}`);
        if (btn) btn.classList.toggle('active', i === count);
    }

    updateWorkspaceDropdownUI();

    // CASO 0: MODALITA' ZERO-UI (Schermo pulito, solo comando e richiamo rapido)
    if (count === 0) {
        const zeroDiv = document.createElement('div');
        zeroDiv.className = 'zero-ui-screen';

        const moduleButtonsHtml = ALL_MODULE_KEYS.map(k =>
            `<button class="btn btn-sm" onclick="summonModule('${k}')">[+ ${dashboardModules[k].name.toUpperCase()}]</button>`
        ).join('');

        const presetButtonsHtml = workspacePresets
            .filter(p => p.slots && p.slots.length > 0)
            .map(p => `<button class="btn btn-sm" onclick="applyWorkspacePreset('${p.id}')">${escapeHtml(p.name)}</button>`)
            .join('');

        zeroDiv.innerHTML = `
            <div class="zero-ui-box">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="section-label">ZERO-UI MODE // STANDBY</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim);">PRESS [CTRL+SPACE] OR [V]</span>
                </div>

                <button class="zero-ui-cmd-trigger" onclick="openTerminal()">
                    <span><strong style="margin-right:10px;">&gt;_</strong> Type command, ask AI, or speak...</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim);">[ENTER / V]</span>
                </button>

                <div>
                    <div style="font-size:var(--font-xs); color:var(--text-dim); margin-bottom:8px; text-transform:uppercase;">Summon Module on Demand</div>
                    <div class="zero-ui-chips">${moduleButtonsHtml}</div>
                </div>

                <div style="border-top:1px solid var(--border-color); padding-top:12px;">
                    <div style="font-size:var(--font-xs); color:var(--text-dim); margin-bottom:8px; text-transform:uppercase;">Saved Workspaces</div>
                    <div class="zero-ui-chips">${presetButtonsHtml}</div>
                </div>
            </div>
        `;
        wrapper.appendChild(zeroDiv);
        saveWorkspaceState();
        return;
    }

    // CASO 1..4: MONTA I QUADRANTI ATTIVI
    activeSlots.forEach((modKey, slotIdx) => {
        const modInfo = dashboardModules[modKey];
        if (!modInfo) return;

        const cell = document.createElement('div');
        cell.className = 'quadrant-cell';

        // Barra superiore del quadrante
        const bar = document.createElement('div');
        bar.className = 'quadrant-bar';

        const leftPart = document.createElement('div');
        leftPart.className = 'quadrant-bar-left';

        const tag = document.createElement('span');
        tag.className = 'quadrant-tag';
        tag.textContent = `[Q${slotIdx + 1}]`;

        const select = document.createElement('select');
        select.className = 'quadrant-select';
        ALL_MODULE_KEYS.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.selected = (k === modKey);
            const inOtherSlot = activeSlots.includes(k) && k !== modKey;
            opt.textContent = `${dashboardModules[k].name.toUpperCase()}${inOtherSlot ? ' (SWAP)' : ''}`;
            select.appendChild(opt);
        });
        select.onchange = () => setSlotModule(slotIdx, select.value);

        leftPart.appendChild(tag);
        leftPart.appendChild(select);

        const rightActions = document.createElement('div');
        rightActions.className = 'quadrant-bar-actions';

        if (count > 1) {
            const maxBtn = document.createElement('button');
            maxBtn.className = 'icon-btn';
            maxBtn.style.fontSize = '0.68rem';
            maxBtn.title = 'Maximize this module to Full Screen (1 Quadrant)';
            maxBtn.textContent = '[MAX]';
            maxBtn.onclick = () => maximizeQuadrantSlot(slotIdx);
            rightActions.appendChild(maxBtn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'icon-btn delete';
        closeBtn.style.fontSize = '0.68rem';
        closeBtn.title = 'Close this quadrant';
        closeBtn.textContent = '[×]';
        closeBtn.onclick = () => closeQuadrantSlot(slotIdx);
        rightActions.appendChild(closeBtn);

        bar.appendChild(leftPart);
        bar.appendChild(rightActions);

        const body = document.createElement('div');
        body.className = 'quadrant-body';

        const modElement = document.getElementById(modInfo.id);
        if (modElement) body.appendChild(modElement);

        cell.appendChild(bar);
        cell.appendChild(body);
        wrapper.appendChild(cell);

        // Renderizza i contenuti del modulo montato
        modInfo.render();
        if (modKey === 'money' && typeof drawSteppedChart === 'function') {
            setTimeout(drawSteppedChart, 15);
        }
    });

    saveWorkspaceState();
}

// Imposta il numero di quadranti a schermo (0, 1, 2, 3, 4)
function setQuadrantCount(targetCount) {
    const n = Math.max(0, Math.min(4, parseInt(targetCount, 10) || 0));
    if (n === 0) {
        activeSlots = [];
    } else if (activeSlots.length > n) {
        activeSlots = activeSlots.slice(0, n);
    } else {
        while (activeSlots.length < n) {
            const nextAvailable = ALL_MODULE_KEYS.find(k => !activeSlots.includes(k));
            if (nextAvailable) activeSlots.push(nextAvailable);
            else break;
        }
    }
    renderQuadrantLayout();
}

// Cambia il modulo in uno specifico quadrante (e fa SWAP se era già aperto in un altro)
function setSlotModule(slotIdx, newModKey) {
    if (!dashboardModules[newModKey]) return;
    const existingIdx = activeSlots.indexOf(newModKey);
    if (existingIdx !== -1 && existingIdx !== slotIdx) {
        const temp = activeSlots[slotIdx];
        activeSlots[slotIdx] = newModKey;
        activeSlots[existingIdx] = temp;
    } else {
        activeSlots[slotIdx] = newModKey;
    }
    renderQuadrantLayout();
}

function closeQuadrantSlot(slotIdx) {
    activeSlots.splice(slotIdx, 1);
    renderQuadrantLayout();
}

function maximizeQuadrantSlot(slotIdx) {
    const modKey = activeSlots[slotIdx];
    if (!modKey) return;
    activeSlots = [modKey];
    renderQuadrantLayout();
}

// Richiama un modulo a schermo (usato da Zero-UI, da scorciatoie e dall'AI quando risponde)
function summonModule(modKey) {
    if (!dashboardModules[modKey]) return;
    if (activeSlots.includes(modKey)) {
        dashboardModules[modKey].render();
        return;
    }
    if (activeSlots.length === 0) {
        activeSlots = [modKey];
    } else if (activeSlots.length < 2) {
        activeSlots.push(modKey);
    } else {
        activeSlots[activeSlots.length - 1] = modKey;
    }
    renderQuadrantLayout();
}

// Retrocompatibilità con chiamate switchModule('left' / 'right', modKey)
function switchModule(side, rawModKey) {
    let modKey = rawModKey === 'daily' ? 'tasks' : (rawModKey === 'health' ? 'diet' : rawModKey);
    if (!dashboardModules[modKey]) return;

    if (activeSlots.length === 0) {
        activeSlots = [modKey];
        renderQuadrantLayout();
        return;
    }

    const targetIdx = (side === 'right' && activeSlots.length >= 2) ? 1 : 0;
    setSlotModule(targetIdx, modKey);
}

// --- GESTIONE WORKSPACE PRESETS (SALVATAGGIO E RICHIAMO VISTE) ---

function updateWorkspaceDropdownUI() {
    const labelEl = document.getElementById('active-workspace-label');
    const dropEl = document.getElementById('dropdown-workspaces');
    if (!labelEl || !dropEl) return;

    const currentSignature = activeSlots.join(',');
    const matchedPreset = workspacePresets.find(p => (p.slots || []).join(',') === currentSignature);

    if (activeSlots.length === 0) {
        labelEl.textContent = 'VIEW: 0 // ZERO-UI';
    } else if (matchedPreset) {
        labelEl.textContent = `VIEW: ${matchedPreset.name}`;
    } else {
        const shortNames = activeSlots.map(k => k.toUpperCase().slice(0, 4)).join('+');
        labelEl.textContent = `VIEW: ${shortNames}`;
    }

    let html = `<div style="padding: 6px 12px; font-size: 0.65rem; color: var(--text-dim); border-bottom: 1px solid var(--border-color); text-transform: uppercase;">Saved Workspace Views</div>`;

    workspacePresets.forEach(p => {
        const isCurrent = (p.slots || []).join(',') === currentSignature;
        const slotsDesc = (!p.slots || p.slots.length === 0) ? 'EMPTY' : p.slots.map(s => s.toUpperCase()).join(' + ');

        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 12px; border-bottom: 1px solid #1a1a1a; background: ${isCurrent ? 'rgba(255,255,255,0.06)' : 'transparent'};">
                <div style="cursor:pointer; flex:1;" onclick="applyWorkspacePreset('${p.id}')">
                    <div style="font-size: var(--font-xs); font-weight: bold; color: var(--text-main);">${escapeHtml(p.name)}</div>
                    <div style="font-size: 0.65rem; color: var(--text-dim);">${escapeHtml(slotsDesc)}</div>
                </div>
                ${!p.builtin ? `<button class="icon-btn delete" onclick="deleteWorkspacePreset('${p.id}')" title="Delete preset">[X]</button>` : ''}
            </div>
        `;
    });

    html += `
        <div style="padding: 10px; background: #030303; display: flex; gap: 6px;">
            <input type="text" id="new-preset-name-input" class="form-control form-control-sm" placeholder="Save current view as..." onkeydown="if(event.key==='Enter'){event.preventDefault(); saveCurrentWorkspacePreset();}">
            <button class="btn btn-primary btn-sm" onclick="saveCurrentWorkspacePreset()">[SAVE]</button>
        </div>
    `;

    dropEl.innerHTML = html;
}

function applyWorkspacePreset(presetId) {
    const p = workspacePresets.find(x => x.id === presetId);
    if (!p) return;
    activeSlots = [...(p.slots || [])].filter(k => dashboardModules[k]).slice(0, 4);
    const dropEl = document.getElementById('dropdown-workspaces');
    if (dropEl) dropEl.classList.remove('show');
    renderQuadrantLayout();
    if (typeof showToast === 'function') showToast(`[WORKSPACE] Loaded "${p.name}"`);
}

function saveCurrentWorkspacePreset() {
    const inp = document.getElementById('new-preset-name-input');
    const name = (inp ? inp.value : '').trim().toUpperCase();
    if (!name) return;

    const newPreset = {
        id: 'ws_' + Date.now(),
        name: name,
        slots: [...activeSlots],
        builtin: false
    };

    workspacePresets.push(newPreset);
    saveWorkspaceState();
    updateWorkspaceDropdownUI();
    if (typeof showToast === 'function') showToast(`[WORKSPACE] Saved preset "${name}"`);
}

function deleteWorkspacePreset(presetId) {
    workspacePresets = workspacePresets.filter(p => p.id !== presetId || p.builtin);
    saveWorkspaceState();
    updateWorkspaceDropdownUI();
}

// Chiude i menu a tendina cliccando fuori
window.onclick = function(event) {
    if (!event.target.matches('.dropdown-btn') && !event.target.closest('.module-title')) {
        const dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            dropdowns[i].classList.remove('show');
        }
    }
};

// Orologio Globale + Controllo cambio data a mezzanotte
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
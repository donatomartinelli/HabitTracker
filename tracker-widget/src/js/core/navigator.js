// --- js/core/navigator.js ---
// APP SHELL NAVIGATION
//
// Cortex has two ways to look at things:
//   1. SECTIONS (default) — Today · Plan · Notes · Study · Money · Health.
//      Each section shows one module at a time, with tabs when it has more than one.
//   2. TILES — the free-form tiling dashboard (drag, split, saved views).
//
// Desktop: left rail. Phone (≤ 768px wide, automatic): bottom bar + "More" sheet.
// Built on top of the existing tiling engine (layoutTree + renderQuadrantLayout),
// so every module keeps working unchanged.

const NAV_SECTIONS = {
    today:  { label: 'Today',  tabs: [{ key: 'today', label: 'Overview' }, { key: 'tasks', label: 'Tasks' }, { key: 'review', label: 'Weekly review' }] },
    plan:   { label: 'Plan',   tabs: [{ key: 'plan', label: 'Day' }, { key: 'planner', label: 'Week' }, { key: 'calendar', label: 'Calendar' }] },
    notes:  { label: 'Notes',  tabs: [{ key: 'notes', label: 'Notes' }] },
    study:  { label: 'Study',  tabs: [{ key: 'uni', label: 'University' }, { key: 'math', label: 'Math' }] },
    money:  { label: 'Money',  tabs: [{ key: 'money', label: 'Money' }] },
    health: { label: 'Health', tabs: [{ key: 'gym', label: 'Gym' }, { key: 'diet', label: 'Diet' }, { key: 'streak', label: 'Streak' }] }
};
const NAV_ORDER = ['today', 'plan', 'notes', 'study', 'money', 'health'];
const NAV_STATE_KEY = 'cortex_nav_state';
const NAV_TILES_KEY = 'cortex_tiles_tree';
const NAV_MOBILE_BREAKPOINT = 768;

let navState = (function () {
    try {
        const s = JSON.parse(cortexStore.getItem(NAV_STATE_KEY) || 'null');
        if (s && (s.mode === 'tiles' || NAV_SECTIONS[s.section])) return Object.assign({ lastTab: {} }, s);
    } catch (e) { /* ignore */ }
    return { mode: 'section', section: 'today', lastTab: {}, lastSub: {} };
})();
if (!navState.lastSub) navState.lastSub = {};

// Sub-modules of a "container" module (e.g. University → Roadmap, Lectures...)
function getSubmodulesOf(tabKey) {
    const subs = (typeof MACRO_SUBMODULES_MAP !== 'undefined' && MACRO_SUBMODULES_MAP[tabKey]) || [];
    return subs.filter(k => k !== tabKey && typeof dashboardModules !== 'undefined' && dashboardModules[k]);
}
function shortModuleName(key) {
    const n = (dashboardModules[key] && dashboardModules[key].name) || key;
    return n.replace(/^.*?:\s*/, '');
}

function saveNavState() {
    cortexStore.setItem(NAV_STATE_KEY, JSON.stringify(navState));
}

function findSectionForModule(modKey) {
    const leaf = String(modKey || '');
    for (const secKey of NAV_ORDER) {
        const sec = NAV_SECTIONS[secKey];
        for (const tab of sec.tabs) {
            if (tab.key === leaf) return { secKey, tabKey: tab.key };
            const subs = (typeof MACRO_SUBMODULES_MAP !== 'undefined' && MACRO_SUBMODULES_MAP[tab.key]) || [];
            if (subs.includes(leaf)) return { secKey, tabKey: tab.key };
        }
    }
    return null;
}

// ------------------------------------------------------------------
// Rendering a section / tiles
// ------------------------------------------------------------------

function mountModuleForNav(modKey) {
    if (typeof isHudMode !== 'undefined' && isHudMode && typeof toggleHudMode === 'function') toggleHudMode(false);
    if (typeof isMobileViewMode !== 'undefined' && isMobileViewMode && typeof mountMobileSingleModule === 'function') {
        mountMobileSingleModule(modKey);
        return;
    }
    const sub = navState.lastSub[modKey];
    if (sub && sub !== 'all' && dashboardModules[sub]) {
        layoutTree = makePaneNode(sub);
    } else {
        layoutTree = (typeof isMacroContainerKey === 'function' && isMacroContainerKey(modKey))
            ? getMacroDefaultSubtree(modKey)
            : makePaneNode(modKey);
    }
    renderQuadrantLayout();
}

function navigateToSub(subKey) {
    const tab = navState.lastTab[navState.section];
    if (!tab) return;
    navState.lastSub[tab] = subKey;
    saveNavState();
    mountModuleForNav(tab);
    renderSectionTabs();
}

function rememberTilesLayout() {
    if (navState.mode === 'tiles' && typeof layoutTree !== 'undefined' && layoutTree) {
        cortexStore.setItem(NAV_TILES_KEY, JSON.stringify(layoutTree));
    }
}

function navigateToSection(secKey, tabKey = null) {
    const sec = NAV_SECTIONS[secKey];
    if (!sec) return;
    rememberTilesLayout();
    const tab = tabKey || navState.lastTab[secKey] || sec.tabs[0].key;
    navState.mode = 'section';
    navState.section = secKey;
    navState.lastTab[secKey] = tab;
    saveNavState();
    document.body.classList.remove('tiles-mode');
    if (typeof isLayoutEditMode !== 'undefined' && isLayoutEditMode && typeof toggleLayoutEditMode === 'function') toggleLayoutEditMode(false);
    mountModuleForNav(tab);
    renderNavChrome();
    closeMoreSheet();
    const content = document.getElementById('app-content-wrapper');
    if (content) content.scrollTop = 0;
}

function navigateToTiles() {
    navState.mode = 'tiles';
    saveNavState();
    document.body.classList.add('tiles-mode');
    closeMoreSheet();
    if (typeof isMobileViewMode !== 'undefined' && isMobileViewMode) {
        // On a phone, tiles = your saved views (one module at a time)
        if (typeof openQuickSwitcherModal === 'function') openQuickSwitcherModal();
        renderNavChrome();
        return;
    }
    let saved = null;
    try { saved = JSON.parse(cortexStore.getItem(NAV_TILES_KEY) || 'null'); } catch (e) { saved = null; }
    layoutTree = saved || (typeof DEFAULT_LAYOUT_TREE !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_LAYOUT_TREE)) : makePaneNode('today'));
    renderQuadrantLayout();
    renderNavChrome();
}

// Keep the saved tiles layout in sync while the user rearranges tiles
(function hookTilesPersistence() {
    if (typeof renderQuadrantLayout !== 'function') return;
    const orig = renderQuadrantLayout;
    window.renderQuadrantLayout = renderQuadrantLayout = function (...args) {
        const r = orig.apply(this, args);
        if (navState.mode === 'tiles' && !(typeof isMobileViewMode !== 'undefined' && isMobileViewMode)) rememberTilesLayout();
        return r;
    };
})();

// Commands / old code that set a view directly (e.g. "show money") → keep the nav in sync
(function hookSetModulesView() {
    if (typeof setModulesView !== 'function') return;
    const orig = setModulesView;
    window.setModulesView = setModulesView = function (keys, ...rest) {
        const list = (keys || []).filter(Boolean);
        if (list.length === 1) {
            const hit = findSectionForModule(list[0]);
            if (hit) {
                navigateToSection(hit.secKey, hit.tabKey);
                return true;
            }
        }
        // More than one module = a custom arrangement → tiles
        navState.mode = 'tiles';
        saveNavState();
        document.body.classList.add('tiles-mode');
        const r = orig.call(this, keys, ...rest);
        renderNavChrome();
        return r;
    };
})();

// ------------------------------------------------------------------
// Chrome: rail, section tabs, bottom bar, more sheet
// ------------------------------------------------------------------

function renderNavChrome() {
    renderRail();
    renderSectionTabs();
    renderBottomBar();
}

function renderRail() {
    const rail = document.getElementById('app-rail');
    if (!rail) return;
    const items = NAV_ORDER.map(k => {
        const active = navState.mode === 'section' && navState.section === k;
        return `<button type="button" class="rail-item ${active ? 'active' : ''}" data-sec="${k}" ${active ? 'aria-current="page"' : ''}>${NAV_SECTIONS[k].label}</button>`;
    }).join('');
    rail.innerHTML = `
        <div class="rail-group">${items}</div>
        <div class="rail-group rail-bottom">
            <button type="button" class="rail-item ${navState.mode === 'tiles' ? 'active' : ''}" data-tiles title="Free-form tiling dashboard">▦ Tiles</button>
        </div>`;
    rail.querySelectorAll('[data-sec]').forEach(b => b.addEventListener('click', () => navigateToSection(b.dataset.sec)));
    rail.querySelector('[data-tiles]')?.addEventListener('click', navigateToTiles);
}

function renderSectionTabs() {
    const bar = document.getElementById('section-tabs');
    if (!bar) return;

    if (navState.mode === 'tiles') {
        const presets = (typeof workspacePresets !== 'undefined' ? workspacePresets : []);
        const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s)) : String(s));
        bar.innerHTML = `
            <span class="section-tabs-title">Tiles</span>
            <div class="section-tabs-list">
                ${presets.map(p => `<button type="button" class="section-tab" data-preset="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
            </div>
            <button type="button" class="btn btn-sm" data-edit-layout>[EDIT LAYOUT]</button>`;
        bar.hidden = false;
        bar.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
            if (typeof applyWorkspacePreset === 'function') applyWorkspacePreset(b.dataset.preset);
        }));
        bar.querySelector('[data-edit-layout]')?.addEventListener('click', () => {
            if (typeof toggleLayoutEditMode === 'function') toggleLayoutEditMode();
        });
        return;
    }

    const sec = NAV_SECTIONS[navState.section];
    const activeTab = sec ? (navState.lastTab[navState.section] || sec.tabs[0].key) : null;
    // On a phone the module's own sub-tab strip already lists sub-modules
    const subs = (activeTab && !(typeof isMobileViewMode !== 'undefined' && isMobileViewMode)) ? getSubmodulesOf(activeTab) : [];
    if (!sec || (sec.tabs.length < 2 && subs.length < 2)) {
        bar.hidden = true;
        bar.innerHTML = '';
        return;
    }
    const activeSub = navState.lastSub[activeTab] || 'all';
    let multiPaneDefault = false;
    try {
        multiPaneDefault = typeof getMacroDefaultSubtree === 'function' && typeof collectLeafPanes === 'function'
            && collectLeafPanes(getMacroDefaultSubtree(activeTab)).length > 1;
    } catch (e) { multiPaneDefault = false; }
    const subChips = subs.length >= 2 ? `
        <div class="section-subtabs" role="tablist" aria-label="${sec.label} views">
            ${multiPaneDefault ? `<button type="button" class="section-subtab ${activeSub === 'all' ? 'active' : ''}" data-sub="all">Overview</button>` : ''}
            ${subs.map((k, i) => {
                const isActive = activeSub === k || (!multiPaneDefault && activeSub === 'all' && i === 0);
                return `<button type="button" class="section-subtab ${isActive ? 'active' : ''}" data-sub="${k}">${shortModuleName(k)}</button>`;
            }).join('')}
        </div>` : '';
    bar.hidden = false;
    bar.innerHTML = `
        <span class="section-tabs-title">${sec.label}</span>
        <div class="section-tabs-list" role="tablist">
            ${sec.tabs.length > 1 ? sec.tabs.map(t => `<button type="button" role="tab" class="section-tab ${t.key === activeTab ? 'active' : ''}" aria-selected="${t.key === activeTab}" data-tab="${t.key}">${t.label}</button>`).join('') : ''}
        </div>
        ${subChips}`;
    bar.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => navigateToSection(navState.section, b.dataset.tab)));
    bar.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => navigateToSub(b.dataset.sub)));
}

function renderBottomBar() {
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav) return;
    const isActive = (k) => navState.mode === 'section' && navState.section === k;
    const moreActive = navState.mode === 'tiles' || ['study', 'money', 'health'].includes(navState.section);
    nav.innerHTML = `
        <button type="button" class="mob-nav-tab ${isActive('today') ? 'active' : ''}" data-sec="today">Today</button>
        <button type="button" class="mob-nav-tab ${isActive('plan') ? 'active' : ''}" data-sec="plan">Plan</button>
        <button type="button" class="mob-nav-tab mob-nav-cmd" data-cmd aria-label="Open command bar">⌘</button>
        <button type="button" class="mob-nav-tab ${isActive('notes') ? 'active' : ''}" data-sec="notes">Notes</button>
        <button type="button" class="mob-nav-tab ${moreActive ? 'active' : ''}" data-more>More</button>`;
    nav.querySelectorAll('[data-sec]').forEach(b => b.addEventListener('click', () => navigateToSection(b.dataset.sec)));
    nav.querySelector('[data-cmd]')?.addEventListener('click', () => { if (typeof openTerminal === 'function') openTerminal(); });
    nav.querySelector('[data-more]')?.addEventListener('click', toggleMoreSheet);
}

function toggleMoreSheet() {
    const sheet = document.getElementById('more-sheet');
    if (!sheet) return;
    if (!sheet.hidden) { closeMoreSheet(); return; }
    const item = (attrs, label, hint = '') =>
        `<button type="button" class="more-item" ${attrs}><span>${label}</span>${hint ? `<span class="dim">${hint}</span>` : ''}</button>`;
    sheet.innerHTML = `
        <div class="more-panel" role="dialog" aria-label="More">
            ${item('data-sec="study"', 'Study', 'University · Math')}
            ${item('data-sec="money"', 'Money', 'Balance · bills')}
            ${item('data-sec="health"', 'Health', 'Gym · diet · streak')}
            <div class="more-sep"></div>
            ${item('data-act="views"', 'Saved views', 'Your tile layouts')}
            ${item('data-act="note"', 'Quick note')}
            ${item('data-act="rec"', 'Record voice note')}
            ${item('data-act="settings"', 'Settings')}
        </div>`;
    sheet.hidden = false;
    sheet.querySelectorAll('[data-sec]').forEach(b => b.addEventListener('click', () => navigateToSection(b.dataset.sec)));
    const acts = {
        views: () => navigateToTiles(),
        note: () => { closeMoreSheet(); if (typeof openQuickNoteModal === 'function') openQuickNoteModal(); },
        rec: () => { closeMoreSheet(); if (typeof toggleLiveMicRecording === 'function') toggleLiveMicRecording(); },
        settings: () => { closeMoreSheet(); if (typeof openSettingsModal === 'function') openSettingsModal(); }
    };
    sheet.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => acts[b.dataset.act]()));
}

function closeMoreSheet() {
    const sheet = document.getElementById('more-sheet');
    if (sheet) { sheet.hidden = true; sheet.innerHTML = ''; }
}

// ------------------------------------------------------------------
// Automatic desktop ↔ phone layout (no more [DESK]/[MOB] toggle)
// ------------------------------------------------------------------

function applyResponsiveMode(initial = false) {
    const wantMobile = window.innerWidth <= NAV_MOBILE_BREAKPOINT;
    if (typeof isMobileViewMode === 'undefined') return;
    if (!initial && wantMobile === isMobileViewMode) return;
    isMobileViewMode = wantMobile;
    document.body.classList.toggle('mobile-view-mode', wantMobile);
    if (typeof hideMobileGymQuickStepper === 'function' && !wantMobile) hideMobileGymQuickStepper();
    restoreNavView();
    // Show/hide the phone-only bars (top date strip, bottom bar)
    if (typeof syncMobileModeUI === 'function') syncMobileModeUI();
    renderNavChrome();
}

function restoreNavView() {
    if (navState.mode === 'tiles' && !isMobileViewMode) navigateToTiles();
    else navigateToSection(NAV_SECTIONS[navState.section] ? navState.section : 'today');
}

window.addEventListener('DOMContentLoaded', () => {
    // Window controls (minimize/close) only make sense in the desktop app
    document.body.classList.toggle('is-tauri', Boolean(window.__TAURI__));

    // The old manual switch is gone: layout follows the window width
    cortexStore.removeItem('cortex_force_mobile');
    applyResponsiveMode(true);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => applyResponsiveMode(false), 150);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMoreSheet();
        // Alt+1..6 → sections, Alt+0 → tiles
        if (e.altKey && !e.ctrlKey && !e.metaKey) {
            const n = parseInt(e.key, 10);
            if (n >= 1 && n <= NAV_ORDER.length) { e.preventDefault(); navigateToSection(NAV_ORDER[n - 1]); }
            if (e.key === '0') { e.preventDefault(); navigateToTiles(); }
        }
    });
    document.getElementById('more-sheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'more-sheet') closeMoreSheet();
    });
});

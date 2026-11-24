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

// ------------------------------------------------------------------
// Optional modules: each tab except Today's can be switched off.
// Switching off only hides it; the data stays and comes back when switched on.
// ------------------------------------------------------------------
const MODULES_KEY = 'cortex_modules';
const OPTIONAL_MODULES = [
    { key: 'plan', section: 'plan', label: 'Day plan', desc: 'Timeline of your day with fixed blocks and routines' },
    { key: 'planner', section: 'plan', label: 'Week planner', desc: 'Seven days side by side, with ghost layers' },
    { key: 'calendar', section: 'plan', label: 'Calendar', desc: 'Month grid and events' },
    { key: 'notes', section: 'notes', label: 'Notes', desc: 'Folders, quick capture, voice notes' },
    { key: 'uni', section: 'study', label: 'University', desc: 'Exams, credits, exam dates, study pace' },
    { key: 'math', section: 'study', label: 'Math practice', desc: 'Problem sets and mental math drills' },
    { key: 'money', section: 'money', label: 'Money', desc: 'Balance, envelopes, bills, wishlist' },
    { key: 'gym', section: 'health', label: 'Gym', desc: 'Workout splits and progressive weights' },
    { key: 'diet', section: 'health', label: 'Diet', desc: 'Meals, macros and body weight' },
    { key: 'streak', section: 'health', label: 'Streak', desc: 'Consistency grid and focus hours' }
];
// Labs: personal or advanced integrations, off by default for new users
const LAB_MODULES = [
    { key: 'lab_sony', label: 'Voice recorder import', desc: 'Desktop app: imports recordings from a Sony voice recorder and transcribes them with your AI key' },
    { key: 'lab_bridge', label: 'Calendar and bank email bridge', desc: 'Google Apps Script bridge: Google/Apple calendars and bank notification emails' }
];
function labAutoDefault(key) {
    try {
        if (key === 'lab_sony') return (typeof processedAudioFiles !== 'undefined' && processedAudioFiles.length > 0) || Boolean(cortexStore.getItem('tracker_sony_archive_dir'));
        if (key === 'lab_bridge') return Boolean(cortexStore.getItem('cortex_bridge_url'));
    } catch (e) { /* ignore */ }
    return false;
}
function isLabEnabled(key) {
    if (typeof enabledModules !== 'undefined' && typeof enabledModules[key] === 'boolean') return enabledModules[key];
    return labAutoDefault(key);
}
function applyLabClasses() {
    document.body.classList.toggle('lab-sony-off', !isLabEnabled('lab_sony'));
    document.body.classList.toggle('lab-bridge-off', !isLabEnabled('lab_bridge'));
}
window.isLabEnabled = isLabEnabled;

let enabledModules = (function () {
    try {
        const v = JSON.parse(cortexStore.getItem(MODULES_KEY) || 'null');
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
})();

function isModuleEnabled(key) {
    return !OPTIONAL_MODULES.some(m => m.key === key) || enabledModules[key] !== false;
}
function visibleTabs(secKey) {
    const s = NAV_SECTIONS[secKey];
    return s ? s.tabs.filter(t => isModuleEnabled(t.key)) : [];
}
function isSectionEnabled(secKey) { return visibleTabs(secKey).length > 0; }
function visibleSections() { return NAV_ORDER.filter(isSectionEnabled); }

function setModuleEnabled(key, on) {
    enabledModules[key] = Boolean(on);
    cortexStore.setItem(MODULES_KEY, JSON.stringify(enabledModules));
    if (typeof markLocalChangeForCloud === 'function') markLocalChangeForCloud();
    afterModulesChanged();
}
// Called by cloud-sync when another device changed the selection
function applyEnabledModules(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    enabledModules = Object.assign({}, obj);
    cortexStore.setItem(MODULES_KEY, JSON.stringify(enabledModules));
    afterModulesChanged();
}
function afterModulesChanged() {
    applyLabClasses();
    if (navState.mode === 'section') {
        const tab = navState.lastTab[navState.section];
        if (!isSectionEnabled(navState.section) || (tab && !isModuleEnabled(tab))) navigateToSection(navState.section);
        else renderNavChrome();
    } else {
        renderNavChrome();
    }
    if (typeof renderTodayModule === 'function') renderTodayModule();
}
window.isModuleEnabled = isModuleEnabled;
window.isSectionEnabled = isSectionEnabled;

function openModulesPanel() {
    closeMoreSheet();
    const root = document.getElementById('modals-root');
    if (!root) return;
    document.getElementById('modules-panel')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'modules-panel';
    wrap.className = 'modules-overlay';
    const groups = NAV_ORDER.filter(k => k !== 'today').map(sec => {
        const mods = OPTIONAL_MODULES.filter(m => m.section === sec);
        return `
            <div class="modules-group">
                <div class="modules-group-title">${NAV_SECTIONS[sec].label}</div>
                ${mods.map(m => `
                    <label class="modules-row" for="mod-${m.key}">
                        <input type="checkbox" id="mod-${m.key}" data-mod="${m.key}" ${isModuleEnabled(m.key) ? 'checked' : ''}>
                        <span class="modules-name">${m.label}</span>
                        <span class="modules-desc">${m.desc}</span>
                    </label>`).join('')}
            </div>`;
    }).join('');
    const labs = `
            <div class="modules-group">
                <div class="modules-group-title">Labs</div>
                ${LAB_MODULES.map(m => `
                    <label class="modules-row" for="mod-${m.key}">
                        <input type="checkbox" id="mod-${m.key}" data-mod="${m.key}" ${isLabEnabled(m.key) ? 'checked' : ''}>
                        <span class="modules-name">${m.label}</span>
                        <span class="modules-desc">${m.desc}</span>
                    </label>`).join('')}
            </div>`;
    wrap.innerHTML = `
        <div class="modules-panel" role="dialog" aria-modal="true" aria-labelledby="modules-title">
            <div class="modules-head">
                <span id="modules-title" class="section-label">Modules</span>
                <button type="button" class="hdr-icon" data-close aria-label="Close">×</button>
            </div>
            <p class="modules-intro">Turn on only what you use. Today is always on. Switching a module off hides it everywhere; your data stays and comes back when you switch it on again.</p>
            ${groups}
            ${labs}
            <div class="modules-foot"><button type="button" class="btn btn-primary btn-sm" data-close>[DONE]</button></div>
        </div>`;
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove();
    });
    wrap.addEventListener('change', (e) => {
        const cb = e.target.closest('[data-mod]');
        if (cb) setModuleEnabled(cb.dataset.mod, cb.checked);
    });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') wrap.remove(); });
    root.appendChild(wrap);
    wrap.querySelector('input')?.focus();
}
window.openModulesPanel = openModulesPanel;

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
    if (!NAV_SECTIONS[secKey]) return;
    // A switched-off section falls back to Today; a switched-off tab to the first one still on
    if (!isSectionEnabled(secKey)) { secKey = 'today'; tabKey = null; }
    const vis = visibleTabs(secKey);
    rememberTilesLayout();
    let tab = tabKey || navState.lastTab[secKey] || vis[0].key;
    if (!vis.some(t => t.key === tab)) tab = vis[0].key;
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

// Saving or deleting a view updates the list of views in the rail
['saveCurrentWorkspacePreset', 'deleteWorkspacePreset'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function (...args) {
        const r = orig.apply(this, args);
        try { renderNavChrome(); } catch (e) { /* rail not ready yet */ }
        return r;
    };
});

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
    const items = visibleSections().map(k => {
        const active = navState.mode === 'section' && navState.section === k;
        return `<button type="button" class="rail-item ${active ? 'active' : ''}" data-sec="${k}" ${active ? 'aria-current="page"' : ''}>${NAV_SECTIONS[k].label}</button>`;
    }).join('');
    const presets = (typeof workspacePresets !== 'undefined' ? workspacePresets : []);
    const viewsHtml = presets.length ? `
        <div class="rail-group rail-views" aria-label="Saved views">
            <div class="rail-label">Views</div>
            ${presets.map(p => `<button type="button" class="rail-item rail-view ${navState.mode === 'tiles' && navState.preset === p.id ? 'active' : ''}" data-preset="${escapeHtml(String(p.id))}" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</button>`).join('')}
        </div>` : '';
    rail.innerHTML = `
        <div class="rail-top">
            <div class="rail-group">${items}</div>
            ${viewsHtml}
        </div>
        <div class="rail-group rail-bottom">
            <button type="button" class="rail-item ${navState.mode === 'tiles' ? 'active' : ''}" data-tiles title="Free-form tiling dashboard">▦ Tiles</button>
            <button type="button" class="rail-item rail-quiet" data-modules title="Choose which modules you use">Modules</button>
            <button type="button" class="rail-item rail-quiet" data-account title="Sign in and sync your devices">Account</button>
        </div>`;
    rail.querySelectorAll('[data-sec]').forEach(b => b.addEventListener('click', () => navigateToSection(b.dataset.sec)));
    rail.querySelector('[data-tiles]')?.addEventListener('click', () => { navState.preset = null; navigateToTiles(); });
    rail.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => openSavedView(b.dataset.preset)));
    rail.querySelector('[data-modules]')?.addEventListener('click', openModulesPanel);
    rail.querySelector('[data-account]')?.addEventListener('click', () => { if (typeof openAccountPanel === 'function') openAccountPanel(); });
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
    const secTabs = visibleTabs(navState.section);
    const activeTab = sec && secTabs.length ? (navState.lastTab[navState.section] || secTabs[0].key) : null;
    // On a phone the module's own sub-tab strip already lists sub-modules
    const subs = (activeTab && !(typeof isMobileViewMode !== 'undefined' && isMobileViewMode)) ? getSubmodulesOf(activeTab) : [];
    const composable = activeTab && !(typeof isMobileViewMode !== 'undefined' && isMobileViewMode) && composeCandidates(navState.section, activeTab).length >= 2;
    if (!sec || (secTabs.length < 2 && subs.length < 2 && !composable)) {
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
    const canCompose = !(typeof isMobileViewMode !== 'undefined' && isMobileViewMode) && composeCandidates(navState.section, activeTab).length >= 2;
    bar.hidden = false;
    bar.innerHTML = `
        <span class="section-tabs-title">${sec.label}</span>
        <div class="section-tabs-list" role="tablist">
            ${secTabs.length > 1 ? secTabs.map(t => `<button type="button" role="tab" class="section-tab ${t.key === activeTab ? 'active' : ''}" aria-selected="${t.key === activeTab}" data-tab="${t.key}">${t.label}</button>`).join('') : ''}
        </div>
        ${subChips}
        ${canCompose ? '<button type="button" class="section-compose" data-compose title="Choose what this tab shows on a computer">Customize</button>' : ''}`;
    bar.querySelector('[data-compose]')?.addEventListener('click', () => openComposePanel(navState.section, activeTab));
    bar.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => navigateToSection(navState.section, b.dataset.tab)));
    bar.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => navigateToSub(b.dataset.sub)));
}

function renderBottomBar() {
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav) return;
    const isActive = (k) => navState.mode === 'section' && navState.section === k;
    const others = visibleSections().filter(k => k !== 'today');
    const slots = others.slice(0, 2);
    const inMore = others.slice(2);
    const moreActive = navState.mode === 'tiles' || inMore.includes(navState.section);
    const tab = (k) => k ? `<button type="button" class="mob-nav-tab ${isActive(k) ? 'active' : ''}" data-sec="${k}">${NAV_SECTIONS[k].label}</button>` : '';
    nav.innerHTML = `
        ${tab('today')}
        ${tab(slots[0])}
        <button type="button" class="mob-nav-tab mob-nav-cmd" data-cmd aria-label="Open command bar">⌘</button>
        ${tab(slots[1])}
        <button type="button" class="mob-nav-tab ${moreActive ? 'active' : ''}" data-more>More</button>`;
    nav.querySelectorAll('[data-sec]').forEach(b => b.addEventListener('click', () => navigateToSection(b.dataset.sec)));
    nav.querySelector('[data-cmd]')?.addEventListener('click', () => { if (typeof openTerminal === 'function') openTerminal(); });
    nav.querySelector('[data-more]')?.addEventListener('click', toggleMoreSheet);
}

// ------------------------------------------------------------------
// Saved views in the rail
// ------------------------------------------------------------------
function openSavedView(presetId) {
    rememberTilesLayout();
    navState.mode = 'tiles';
    navState.preset = presetId;
    saveNavState();
    document.body.classList.add('tiles-mode');
    if (typeof applyWorkspacePreset === 'function') applyWorkspacePreset(presetId);
    renderNavChrome();
}

// ------------------------------------------------------------------
// Customize what a tab shows on a computer (stored in macroDefaultTrees, synced)
// ------------------------------------------------------------------
const COMPOSE_ARRANGEMENTS = {
    row: { label: 'Side by side' },
    col: { label: 'Stacked' },
    main: { label: 'One big + side' },
    grid: { label: 'Grid' }
};

// Modules you can put in a tab: its own views, then the other tabs of the same section
function composeCandidates(secKey, tabKey) {
    const sec = NAV_SECTIONS[secKey];
    if (!sec || typeof dashboardModules === 'undefined') return [];
    const out = [];
    const add = (k) => { if (k && dashboardModules[k] && !out.includes(k)) out.push(k); };
    const own = getSubmodulesOf(tabKey);
    if (own.length) own.forEach(add); else add(tabKey);
    visibleTabs(secKey).forEach(t => {
        if (t.key === tabKey) return;
        const subs = getSubmodulesOf(t.key);
        if (subs.length) subs.forEach(add); else add(t.key);
    });
    return out;
}

function chainTree(dir, keys) {
    if (keys.length === 1) return makePaneNode(keys[0]);
    return makeSplitNode(dir, 1 / keys.length, makePaneNode(keys[0]), chainTree(dir, keys.slice(1)));
}
function buildComposeTree(keys, arrangement) {
    if (!keys.length) return null;
    if (keys.length === 1) return makePaneNode(keys[0]);
    if (arrangement === 'col') return chainTree('col', keys);
    if (arrangement === 'main') return makeSplitNode('row', 0.62, makePaneNode(keys[0]), chainTree('col', keys.slice(1)));
    if (arrangement === 'grid') {
        const left = keys.filter((_, i) => i % 2 === 0), right = keys.filter((_, i) => i % 2 === 1);
        return makeSplitNode('row', 0.5, chainTree('col', left), chainTree('col', right));
    }
    return chainTree('row', keys);
}
// What the tab shows now, to pre-fill the panel
function readComposition(tabKey) {
    const tree = typeof getMacroDefaultSubtree === 'function' ? getMacroDefaultSubtree(tabKey) : null;
    const keys = tree && typeof collectLeafPanes === 'function' ? collectLeafPanes(tree).map(n => n.module) : [tabKey];
    let arrangement = 'row';
    if (tree && tree.type === 'split') {
        if (tree.dir === 'col') arrangement = 'col';
        else if (tree.children && tree.children[1] && tree.children[1].type === 'split' && tree.children[1].dir === 'col') arrangement = tree.ratio > 0.55 ? 'main' : 'grid';
    }
    return { keys, arrangement };
}

function openComposePanel(secKey, tabKey) {
    document.getElementById('compose-panel')?.remove();
    const root = document.getElementById('modals-root');
    if (!root) return;
    const cands = composeCandidates(secKey, tabKey);
    const cur = readComposition(tabKey);
    const st = {
        order: [...cur.keys.filter(k => cands.includes(k)), ...cands.filter(k => !cur.keys.includes(k))],
        on: new Set(cur.keys.filter(k => cands.includes(k))),
        arrangement: cur.arrangement
    };
    if (!st.on.size) st.on.add(cands[0]);
    const tabLabel = (NAV_SECTIONS[secKey].tabs.find(t => t.key === tabKey) || {}).label || tabKey;
    const wrap = document.createElement('div');
    wrap.id = 'compose-panel';
    wrap.className = 'modules-overlay compose-overlay';
    const render = () => {
        wrap.innerHTML = `
            <div class="modules-panel compose-panel" role="dialog" aria-modal="true" aria-labelledby="compose-title">
                <div class="modules-head">
                    <span id="compose-title" class="section-label">Customize ${escapeHtml(NAV_SECTIONS[secKey].label)} › ${escapeHtml(tabLabel)}</span>
                    <button type="button" class="hdr-icon" data-close aria-label="Close">×</button>
                </div>
                <p class="modules-intro">Pick what opens on a computer and how it is arranged. On the phone you still see one view at a time.</p>
                <div class="compose-list">
                    ${st.order.map((k, i) => `
                        <div class="compose-row ${st.on.has(k) ? '' : 'is-off'}" data-key="${k}">
                            <label class="compose-on"><input type="checkbox" ${st.on.has(k) ? 'checked' : ''} data-on> <span>${escapeHtml(shortModuleName(k))}</span></label>
                            <span class="compose-move">
                                <button type="button" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
                                <button type="button" data-move="1" ${i === st.order.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
                            </span>
                        </div>`).join('')}
                </div>
                <div class="compose-arr" role="radiogroup" aria-label="Arrangement">
                    ${Object.entries(COMPOSE_ARRANGEMENTS).map(([k, a]) => `
                        <button type="button" class="compose-arr-btn ${st.arrangement === k ? 'active' : ''}" data-arr="${k}" aria-pressed="${st.arrangement === k}">
                            <span class="compose-ico compose-ico-${k}" aria-hidden="true"><i></i><i></i><i></i></span>${a.label}
                        </button>`).join('')}
                </div>
                <div class="modules-foot compose-foot">
                    <button type="button" class="ghost-btn" data-reset>Reset to default</button>
                    <span class="u-grow"></span>
                    <button type="button" class="btn btn-sm" data-close>Cancel</button>
                    <button type="button" class="btn btn-primary btn-sm" data-save>Save</button>
                </div>
            </div>`;
    };
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) { wrap.remove(); return; }
        const mv = e.target.closest('[data-move]');
        if (mv) {
            const k = mv.closest('[data-key]').dataset.key;
            const i = st.order.indexOf(k), j = i + parseInt(mv.dataset.move, 10);
            if (j >= 0 && j < st.order.length) { [st.order[i], st.order[j]] = [st.order[j], st.order[i]]; render(); }
            return;
        }
        const arr = e.target.closest('[data-arr]');
        if (arr) { st.arrangement = arr.dataset.arr; render(); return; }
        if (e.target.closest('[data-reset]')) {
            if (typeof macroDefaultTrees !== 'undefined') { delete macroDefaultTrees[tabKey]; saveMacroDefaultTrees(); }
            navState.lastSub[tabKey] = 'all';
            saveNavState();
            wrap.remove();
            mountModuleForNav(tabKey);
            renderNavChrome();
            return;
        }
        if (e.target.closest('[data-save]')) {
            const keys = st.order.filter(k => st.on.has(k));
            if (!keys.length) return;
            macroDefaultTrees[tabKey] = buildComposeTree(keys, st.arrangement);
            saveMacroDefaultTrees();
            if (typeof markLocalChangeForCloud === 'function') markLocalChangeForCloud();
            navState.lastSub[tabKey] = 'all';
            saveNavState();
            wrap.remove();
            mountModuleForNav(tabKey);
            renderNavChrome();
        }
    });
    wrap.addEventListener('change', (e) => {
        const cb = e.target.closest('[data-on]');
        if (!cb) return;
        const k = cb.closest('[data-key]').dataset.key;
        if (cb.checked) st.on.add(k); else if (st.on.size > 1) st.on.delete(k); else cb.checked = true;
        render();
    });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') wrap.remove(); });
    render();
    root.appendChild(wrap);
    wrap.querySelector('[data-save]')?.focus();
}
window.openComposePanel = openComposePanel;

function toggleMoreSheet() {
    const sheet = document.getElementById('more-sheet');
    if (!sheet) return;
    if (!sheet.hidden) { closeMoreSheet(); return; }
    const item = (attrs, label, hint = '') =>
        `<button type="button" class="more-item" ${attrs}><span>${label}</span>${hint ? `<span class="dim">${hint}</span>` : ''}</button>`;
    const hints = { plan: 'Day · week · calendar', notes: 'Folders · voice notes', study: 'University · math', money: 'Balance · bills', health: 'Gym · diet · streak' };
    const inMore = visibleSections().filter(k => k !== 'today').slice(2);
    sheet.innerHTML = `
        <div class="more-panel" role="dialog" aria-label="More">
            ${inMore.map(k => item(`data-sec="${k}"`, NAV_SECTIONS[k].label, hints[k] || '')).join('')}
            ${inMore.length ? '<div class="more-sep"></div>' : ''}
            ${item('data-act="account"', 'Account and sync', 'Sign in on your devices')}
            ${item('data-act="modules"', 'Modules', 'Choose what you use')}
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
        settings: () => { closeMoreSheet(); if (typeof openSettingsModal === 'function') openSettingsModal(); },
        modules: () => openModulesPanel(),
        account: () => { closeMoreSheet(); if (typeof openAccountPanel === 'function') openAccountPanel(); }
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
    // Desktop HUD pod shrinks the window on purpose: that's not a phone, leave the layout alone
    if (typeof isHudMode !== 'undefined' && isHudMode) return;
    if (!initial && wantMobile === isMobileViewMode) return;
    isMobileViewMode = wantMobile;
    document.body.classList.toggle('mobile-view-mode', wantMobile);
    if (typeof hideMobileGymQuickStepper === 'function' && !wantMobile) hideMobileGymQuickStepper();
    // Settings → General → Start screen
    if (initial && typeof getPref === 'function') {
        const start = getPref('startScreen');
        if (start && start !== 'last' && NAV_SECTIONS[start] && isSectionEnabled(start)) {
            navState.mode = 'section';
            navState.section = start;
        }
    }
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
    applyLabClasses();

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
            const vis = visibleSections();
            if (n >= 1 && n <= vis.length) { e.preventDefault(); navigateToSection(vis[n - 1]); }
            if (e.key === '0') { e.preventDefault(); navigateToTiles(); }
        }
    });
    document.getElementById('more-sheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'more-sheet') closeMoreSheet();
    });
});

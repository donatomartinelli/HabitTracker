// --- js/core/settings-page.js ---
// SETTINGS: one full page instead of the old numbered modal.
//
// Left: sections (on the phone: a list, then the section with a back button).
// Each row = name + one line of explanation on the left, the control on the right.
// Sections: General · Appearance · Today · Focus & study · Modules · Account & sync · Data · Commands · Labs · About
//
// Older code still calls openSettingsModal('tab-ai' | 'tab-system' | 'tab-workspace'): those names map to sections here.
// Some controls keep the element ids that other files update (cloud sync, Gemini keys, bridge, aliases).

(function () {
    'use strict';

    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));
    const SECTIONS = [
        { key: 'general',    label: 'General' },
        { key: 'appearance', label: 'Appearance' },
        { key: 'today',      label: 'Today' },
        { key: 'study',      label: 'Focus & study' },
        { key: 'modules',    label: 'Modules' },
        { key: 'account',    label: 'Account & sync' },
        { key: 'data',       label: 'Data' },
        { key: 'commands',   label: 'Commands' },
        { key: 'labs',       label: 'Labs', lab: true },
        { key: 'about',      label: 'About' }
    ];
    const LEGACY_TABS = { 'tab-workspace': 'general', 'tab-ai': 'labs', 'tab-system': 'data' };

    let current = 'general';
    let phoneDetail = false;

    const isPhone = () => typeof isMobileViewMode !== 'undefined' && isMobileViewMode;
    const isTauri = () => Boolean(window.__TAURI__);

    // ------------------------------------------------------------------
    // Building blocks
    // ------------------------------------------------------------------
    function row(name, desc, control, opts = {}) {
        return `
            <div class="cx-row ${opts.stack ? 'is-stack' : ''}" ${opts.id ? `id="${opts.id}"` : ''}>
                <div class="cx-row-text">
                    <div class="cx-row-name">${name}</div>
                    ${desc ? `<div class="cx-row-desc">${desc}</div>` : ''}
                </div>
                <div class="cx-row-control">${control}</div>
            </div>`;
    }
    function group(title, inner, note = '') {
        return `
            <section class="cx-group">
                ${title ? `<h3 class="cx-group-title">${title}</h3>` : ''}
                <div class="cx-group-body">${inner}</div>
                ${note ? `<p class="cx-group-note">${note}</p>` : ''}
            </section>`;
    }
    function toggle(id, on, attrs = '') {
        return `<label class="cx-switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${attrs}><span class="cx-switch-track" aria-hidden="true"></span></label>`;
    }
    function seg(name, options, value) {
        return `<div class="cx-seg" role="radiogroup" data-seg="${name}">${options.map(o =>
            `<button type="button" role="radio" aria-checked="${o.value === value}" class="${o.value === value ? 'active' : ''}" data-value="${esc(o.value)}" ${o.style ? `style="${o.style}"` : ''}>${esc(o.label)}</button>`).join('')}</div>`;
    }
    function button(label, attrs, kind = '') {
        return `<button type="button" class="cx-btn ${kind}" ${attrs}>${label}</button>`;
    }
    function timeOptions(from, to, step, value) {
        const out = [];
        for (let m = from; m <= to; m += step) {
            const v = m >= 1440 ? '24:00' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            out.push(`<option value="${v}" ${v === value ? 'selected' : ''}>${v}</option>`);
        }
        return out.join('');
    }

    // ------------------------------------------------------------------
    // Sections
    // ------------------------------------------------------------------
    function sectionGeneral() {
        const start = typeof getPref === 'function' ? getPref('startScreen') : 'last';
        const secs = (typeof visibleSections === 'function' ? visibleSections() : ['today']).map(k => ({ value: k, label: (NAV_SECTIONS[k] || {}).label || k }));
        const startSel = `<select class="cx-select" data-pref-select="startScreen">
            <option value="last" ${start === 'last' ? 'selected' : ''}>Where I left off</option>
            ${secs.map(s => `<option value="${esc(s.value)}" ${start === s.value ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>`;
        const views = (typeof workspacePresets !== 'undefined' ? workspacePresets : []);
        const viewsHtml = views.length
            ? views.map(p => `
                <div class="cx-list-row">
                    <span>${esc(p.name)}</span>
                    <span class="cx-list-actions">
                        ${button('Open', `data-view-open="${esc(p.id)}"`, 'is-quiet')}
                        ${button('Delete', `data-view-del="${esc(p.id)}"`, 'is-quiet is-danger')}
                    </span>
                </div>`).join('')
            : '<div class="cx-empty">No saved views. Arrange tiles, then save the layout here.</div>';
        return `
            ${group('Start', row('Start screen', 'What Cortex opens when you launch it.', startSel))}
            ${isPhone() ? '' : group('Tile layouts', `
                ${row('Edit the layout', 'Drag panels side by side in Tiles mode. Shortcut: E.', button('Edit layout', 'data-act="edit-layout"'))}
                ${row('Save current layout', 'Keep the tiles you have now as a named view.', `<span class="cx-inline"><input type="text" class="cx-input" id="cx-view-name" placeholder="View name" maxlength="40">${button('Save', 'data-act="save-view"')}</span>`)}
                <div class="cx-list">${viewsHtml}</div>`)}
            ${group('Keyboard', row('Shortcuts and commands', 'Everything you can type in the command bar, and the keys.', button('Open the guide', 'data-act="shortcuts"')))}
        `;
    }

    function sectionAppearance() {
        const accent = getPref('accent');
        const presetHit = (typeof ACCENT_PRESETS !== 'undefined' ? ACCENT_PRESETS : []).find(p => p.color.toLowerCase() === accent.toLowerCase());
        const swatches = `
            <div class="cx-swatches" role="radiogroup" aria-label="Accent colour">
                ${(typeof ACCENT_PRESETS !== 'undefined' ? ACCENT_PRESETS : []).map(p => `<button type="button" class="cx-swatch ${presetHit && presetHit.id === p.id ? 'active' : ''}" style="--sw:${p.color}" data-accent="${p.color}" aria-label="${esc(p.label)}" title="${esc(p.label)}"></button>`).join('')}
                <label class="cx-swatch is-custom ${presetHit ? '' : 'active'}" style="--sw:${esc(accent)}" title="Custom colour"><input type="color" value="${esc(accent)}" data-accent-custom aria-label="Custom accent colour"></label>
            </div>`;
        const fontNow = (() => { try { return localStorage.getItem('cortex_font') || 'vt323'; } catch (e) { return 'vt323'; } })();
        const fonts = seg('font', [
            { value: 'vt323', label: 'Terminal', style: "font-family:'VT323',monospace!important;font-size-adjust:.56" },
            { value: 'jetbrains', label: 'JetBrains', style: "font-family:'JetBrains Mono',monospace!important" },
            { value: 'space', label: 'Space', style: "font-family:'Space Mono',monospace!important" },
            { value: 'classic', label: 'System', style: 'font-family:var(--font-system)!important' }
        ], fontNow);
        const red = typeof isRedMode !== 'undefined' && isRedMode;
        return `
            ${group('Colours', `
                ${row('Accent colour', 'Primary buttons, active tabs, the line that marks now, live study windows.', swatches)}
                ${row('Night red filter', 'Turns everything red to protect your eyes in the dark. Shortcut: R.', toggle('cx-red', red))}
            `)}
            ${group('Text and layout', `
                ${row('Font', 'Used across the whole app, on this device.', fonts)}
                ${isPhone() ? '' : row('Content width', 'Centred keeps lines readable on a wide screen; full width uses all of it.', seg('width', [{ value: 'centered', label: 'Centred' }, { value: 'full', label: 'Full width' }], getPref('width')))}
                ${row('Density', 'Compact fits more rows on screen.', seg('density', [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }], getPref('density')))}
                ${isTauri() ? row('Window transparency', 'How much of the desktop shows through the app window.', `<span class="cx-inline"><input type="range" min="0.3" max="1" step="0.01" value="${esc(typeof savedOpacity !== 'undefined' ? savedOpacity : 0.92)}" data-opacity class="cx-range"><span class="cx-range-val" data-opacity-val>${esc(typeof savedOpacity !== 'undefined' ? savedOpacity : 0.92)}</span></span>`) : ''}
            `)}
            ${group('Day hours', `
                ${row('Day starts at', 'Top of the day and week timelines.', `<select class="cx-select" data-pref-select="dayStart">${timeOptions(240, 600, 30, getPref('dayStart'))}</select>`)}
                ${row('Day ends at', 'Bottom of the timelines.', `<select class="cx-select" data-pref-select="dayEnd">${timeOptions(1200, 1440, 30, getPref('dayEnd'))}</select>`)}
            `, 'The day phases (early morning, late morning, afternoon, evening) keep their times and stretch to these limits.')}
        `;
    }

    function sectionToday() {
        const cards = getPref('todayCards');
        const defs = (typeof TODAY_CARD_DEFS !== 'undefined' ? TODAY_CARD_DEFS : []);
        const list = cards.map((c, i) => {
            const d = defs.find(x => x.key === c.key) || { label: c.key, desc: '' };
            return `
                <div class="cx-order-row ${c.on ? '' : 'is-off'}" data-card="${esc(c.key)}">
                    ${toggle(`cx-card-${c.key}`, c.on, `data-card-on="${esc(c.key)}"`)}
                    <div class="cx-row-text">
                        <div class="cx-row-name">${esc(d.label)}</div>
                        <div class="cx-row-desc">${esc(d.desc)}</div>
                    </div>
                    <div class="cx-order-move">
                        <button type="button" data-card-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(d.label)} up">↑</button>
                        <button type="button" data-card-move="1" ${i === cards.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(d.label)} down">↓</button>
                    </div>
                </div>`;
        }).join('');
        return `
            ${group('Cards on Today', `<div class="cx-order">${list}</div>`, 'On a computer the timeline sits in its own column on the right; on the phone it follows this order.')}
            <div class="cx-actions">${button('Reset to default', 'data-act="reset-cards"', 'is-quiet')}</div>
        `;
    }

    function sectionStudy() {
        const S = window.CortexStudy;
        const L = S && S.learnedSummary ? S.learnedSummary() : null;
        const places = (typeof referenceLayers !== 'undefined' ? referenceLayers : []);
        const learned = [];
        if (L && L.favourite) learned.push(`You pick “${esc(L.favourite.label)}” most often (${L.favourite.count} of ${L.picks}).`);
        if (L && L.pace) learned.push(`You stay on a session about ${L.pace.len} min (last ${L.pace.n} sessions).`);
        if (L && L.splits) learned.push(`It remembers how you split ${L.splits} combination${L.splits === 1 ? '' : 's'} of tasks.`);
        if (L && L.lenShift) learned.push(`You like sessions ${L.lenShift > 0 ? 'longer' : 'shorter'} than proposed.`);
        const anything = L && (L.picks || L.splits || L.lenShift);
        return `
            ${group('Study windows', `
                ${row('How sessions are planned', 'No fixed rhythm: in each window you split the time between your tasks and pick one of the plans Cortex proposes (theory first, learn then apply, warm-up then peak, sprints, long blocks…).', '')}
                ${row('What Cortex has learned', learned.length ? learned.join(' ') : 'Nothing yet: it learns from the plans you pick, how you split the time and how long your focus sessions really last.', anything ? button('Forget', 'data-act="forget-study"', 'is-quiet') : '')}
            `, 'The kind of work is set per task in the study window: Theory for new material, Exercises for problems, Review for flashcards like Anki.')}
            ${group('Places and schedules', `
                ${row('Places', places.length ? esc(places.map(p => p.title).join(' · ')) : 'Libraries, home, the train: places with opening hours or timetables (ghost layers).', button('Manage places', 'data-act="places"'))}
                ${row('Tasks and routines', 'Subjects, habits, routines and medicines.', button('Open', 'data-act="tasks"'))}
            `)}
            ${group('Timer', row('Sound at the end of a session', 'A short tone when a session or a break ends.', toggle('cx-sound', getPref('focusSound') !== false)))}
        `;
    }

    function sectionModules() {
        if (typeof OPTIONAL_MODULES === 'undefined') return '';
        const bySection = {};
        OPTIONAL_MODULES.forEach(m => { (bySection[m.section] = bySection[m.section] || []).push(m); });
        return Object.entries(bySection).map(([sec, mods]) => group(esc((NAV_SECTIONS[sec] || {}).label || sec),
            mods.map(m => row(esc(m.label), esc(m.desc), toggle(`cx-mod-${m.key}`, isModuleEnabled(m.key), `data-mod="${m.key}"`))).join('')
        )).join('') + `<p class="cx-group-note">Today is always on. Switching a module off hides it everywhere; your data stays and comes back when you switch it on.</p>`;
    }

    function sectionAccount() {
        const A = window.CortexAccount;
        const signed = A && A.isSignedIn();
        const status = typeof cloudSyncStatus !== 'undefined' ? cloudSyncStatus : 'idle';
        const last = typeof lastSyncOkMs !== 'undefined' && lastSyncOkMs && typeof formatAgo === 'function' ? formatAgo(lastSyncOkMs) : 'not yet';
        const gistOn = typeof cloudGithubToken !== 'undefined' && cloudGithubToken;
        return `
            ${group('Account', signed
                ? `${row('Signed in', esc(A.userEmail()), button('Manage account', 'data-act="account"'))}
                   ${row('Sync', `Status: ${esc(status)} · last sync ${esc(last)}`, button('Sync now', 'data-act="sync"'))}
                   ${row('Saved conflicts', 'When two devices changed the same thing, the newest wins and the other is kept here.', button('Show', 'data-act="conflicts"'))}`
                : row('Not signed in', 'Sign in with your email to keep Cortex in sync on your laptop, phone and desktop app. No password.', button('Sign in', 'data-act="account"', 'is-primary')))}
            <details class="cx-details" ${gistOn ? 'open' : ''}>
                <summary>Advanced: sync through a private GitHub Gist</summary>
                <div class="cx-group-body">
                    ${row('Status', '', '<span class="cx-status" id="cloud-sync-settings-status">Not set up</span>')}
                    ${row('GitHub token', 'A token with the “gist” scope.', `<span class="cx-inline"><input type="password" id="cloud-gist-token-inp" class="cx-input" placeholder="ghp_…" onchange="saveCloudSyncCredentialsFromUI()" autocomplete="off">${button('Show', `onclick="const i=document.getElementById('cloud-gist-token-inp'); i.type=i.type==='password'?'text':'password';"`, 'is-quiet')}</span>`, { stack: true })}
                    ${row('Gist id', 'Paste an existing one or create a new private Gist.', `<span class="cx-inline"><input type="text" id="cloud-gist-id-inp" class="cx-input" placeholder="Gist id" onchange="saveCloudSyncCredentialsFromUI()">${button('Create new', 'onclick="createNewSecretGistForCortex()"', 'is-quiet')}</span>`, { stack: true })}
                    ${row('Link a phone', 'Copies a one-time setup link. It contains your token: do not share it.', `<span class="cx-inline">${button('Sync now', 'onclick="syncNow(true)"', 'is-quiet')}${button('Copy link', 'onclick="copyMagicMobileSetupUrl()"', 'is-quiet')}<button type="button" class="cx-btn is-quiet" id="cloud-sync-conflicts-btn" onclick="closeSettingsPage(); showSyncConflictsModal()">Conflicts</button></span>`)}
                </div>
            </details>
        `;
    }

    function sectionData() {
        return `
            ${group('Backup', `
                ${row('Export everything', 'One JSON file with all your data. Keep it somewhere safe.', button('Export', 'onclick="exportData()"'))}
                ${row('Restore from a backup', 'Replaces the data on this device with the file. The app reloads.', `<label class="cx-btn">Choose file<input type="file" accept=".json" hidden onchange="importData(event)"></label>`)}
            `)}
            ${typeof exportNotesMarkdown === 'function' || typeof window.exportNotesMarkdown === 'function' ? group('Notes', row('Export notes as Markdown', 'A .zip with one folder per notebook, ready for Obsidian or Notion.', button('Export', 'data-act="notes-md"'))) : ''}
            ${group('This device', row('Storage', 'Your data lives on this device (IndexedDB) and, if you sign in, in your account.', '<span class="cx-status" data-storage>—</span>'))}
        `;
    }

    function sectionCommands() {
        return `
            ${group('Your commands', '<div id="settings-aliases-container" class="cx-aliases"></div>', 'One word that runs several commands, separated by “;”. Type the word in the command bar.')}
            ${group('', row('All commands and shortcuts', 'The full guide of the command bar.', button('Open the guide', 'data-act="shortcuts"')))}
        `;
    }

    function sectionLabs() {
        const L = typeof LAB_MODULES !== 'undefined' ? LAB_MODULES : [];
        const sony = typeof isLabEnabled === 'function' && isLabEnabled('lab_sony');
        const bridge = typeof isLabEnabled === 'function' && isLabEnabled('lab_bridge');
        return `
            ${group('Experiments', L.map(m => row(esc(m.label), esc(m.desc), toggle(`cx-mod-${m.key}`, isLabEnabled(m.key), `data-mod="${m.key}"`))).join(''), 'Personal integrations. Off unless you use them.')}
            ${sony ? group('Voice recorder import', `
                ${row('Gemini API key', 'Used to transcribe recordings and by the AI in the command bar. <span id="gemini-key-status" class="cx-status"></span>', `<span class="cx-inline"><input type="password" id="gemini-api-key-input" class="cx-input" placeholder="AIza…" oninput="handleGeminiKeyInput(this.value)" autocomplete="off">${button('Show', `onclick="const i=document.getElementById('gemini-api-key-input'); i.type=i.type==='password'?'text':'password';"`, 'is-quiet')}</span>`, { stack: true })}
                ${row('Separate key for recordings', 'Optional. <span id="gemini-audio-key-status" class="cx-status"></span>', `<span class="cx-inline"><input type="password" id="gemini-audio-key-input" class="cx-input" placeholder="Optional" oninput="handleGeminiAudioKeyInput(this.value)" autocomplete="off">${button('Show', `onclick="const i=document.getElementById('gemini-audio-key-input'); i.type=i.type==='password'?'text':'password';"`, 'is-quiet')}</span>`, { stack: true })}
                ${row('Transcribed files', '<span id="processed-audio-count"></span>', button('Forget the list', 'onclick="resetProcessedAudioHistory()"', 'is-quiet'))}
            `) : ''}
            ${bridge ? group('Calendar and bank email bridge', `
                ${row('Status', '', '<span class="cx-status" id="bridge-settings-status">Not set up</span>')}
                ${row('Apps Script web app URL', '', '<input type="text" id="bridge-webapp-url-inp" class="cx-input is-wide" placeholder="https://script.google.com/…" onchange="saveExternalBridgeConfigFromUI()">', { stack: true })}
                ${row('Apple iCloud calendar', 'Optional webcal:// link.', '<input type="text" id="bridge-icloud-ics-inp" class="cx-input is-wide" placeholder="webcal://…" onchange="saveExternalBridgeConfigFromUI()">', { stack: true })}
                ${row('Gmail search for bank emails', '', '<input type="text" id="bridge-bank-query-inp" class="cx-input is-wide" placeholder="from:bank subject:payment" onchange="saveExternalBridgeConfigFromUI()">', { stack: true })}
                ${row('Run now', '', `<span class="cx-inline">${button('Sync calendars', 'onclick="syncExternalCalendarsNow(true)"', 'is-quiet')}${button('Scan bank emails', 'onclick="scanBankEmailsNow(true)"', 'is-quiet')}</span>`)}
            `) : ''}
        `;
    }

    function sectionAbout() {
        return `
            ${group('Cortex', `
                ${row('Feedback', 'Something broken or missing? Tell me.', button('Send feedback', 'data-act="feedback"'))}
                ${row('Privacy', 'What is stored and where.', '<a class="cx-btn is-quiet" href="https://donatomartinelli.github.io/cortex/privacy/" target="_blank" rel="noopener">Read</a>')}
            `)}
        `;
    }

    const RENDER = {
        general: sectionGeneral, appearance: sectionAppearance, today: sectionToday, study: sectionStudy,
        modules: sectionModules, account: sectionAccount, data: sectionData, commands: sectionCommands,
        labs: sectionLabs, about: sectionAbout
    };

    // ------------------------------------------------------------------
    // Page
    // ------------------------------------------------------------------
    function open(tab) {
        if (typeof closeModals === 'function') closeModals();
        if (typeof closeMoreSheet === 'function') closeMoreSheet();
        current = LEGACY_TABS[tab] || (RENDER[tab] ? tab : current || 'general');
        phoneDetail = Boolean(tab);
        let page = document.getElementById('cx-settings');
        if (!page) {
            page = document.createElement('div');
            page.id = 'cx-settings';
            page.className = 'cx-settings-overlay';
            page.setAttribute('role', 'dialog');
            page.setAttribute('aria-modal', 'true');
            page.setAttribute('aria-label', 'Settings');
            (document.getElementById('modals-root') || document.body).appendChild(page);
            bindPage(page);
        }
        render();
        page.querySelector('.cx-nav-item.active, .cx-close')?.focus();
    }
    function close() {
        document.getElementById('cx-settings')?.remove();
        if (typeof renderTodayModule === 'function') renderTodayModule();
    }

    function render() {
        const page = document.getElementById('cx-settings');
        if (!page) return;
        const labsOn = typeof isLabEnabled === 'function' && (isLabEnabled('lab_sony') || isLabEnabled('lab_bridge'));
        const nav = SECTIONS.map(s => `<button type="button" class="cx-nav-item ${s.key === current ? 'active' : ''}" data-sec="${s.key}" ${s.key === current ? 'aria-current="page"' : ''}>${esc(s.label)}${s.lab && !labsOn ? '<span class="cx-nav-hint">off</span>' : ''}<span class="cx-nav-chev" aria-hidden="true">›</span></button>`).join('');
        const scroller = page.querySelector('.cx-main');
        const keepScroll = scroller && page.dataset.current === current ? scroller.scrollTop : 0;
        page.dataset.current = current;
        page.classList.toggle('is-detail', phoneDetail);
        const title = (SECTIONS.find(s => s.key === current) || {}).label || 'Settings';
        page.innerHTML = `
            <div class="cx-settings">
                <header class="cx-head">
                    <button type="button" class="cx-back" data-back aria-label="Back to settings">‹</button>
                    <h2 class="cx-title"><span class="cx-title-root">Settings</span><span class="cx-title-sec">${esc(title)}</span></h2>
                    <button type="button" class="cx-close" data-close aria-label="Close settings">×</button>
                </header>
                <div class="cx-body">
                    <nav class="cx-nav" aria-label="Settings sections">${nav}</nav>
                    <main class="cx-main">
                        <h2 class="cx-main-title">${esc(title)}</h2>
                        ${RENDER[current]()}
                    </main>
                </div>
            </div>`;
        if (keepScroll) page.querySelector('.cx-main').scrollTop = keepScroll;
        afterRender(page);
    }

    // Fill in the controls owned by other files
    function afterRender(page) {
        try {
            if (current === 'commands' && typeof renderCustomAliasesSettingsUI === 'function') renderCustomAliasesSettingsUI();
            if (current === 'account' && typeof updateCloudSyncSettingsUI === 'function') updateCloudSyncSettingsUI();
            if (current === 'labs') {
                if (typeof updateGeminiKeyStatusUI === 'function') updateGeminiKeyStatusUI();
                if (typeof updateGeminiAudioKeyStatusUI === 'function') updateGeminiAudioKeyStatusUI();
                if (typeof updateExternalBridgeSettingsUI === 'function') updateExternalBridgeSettingsUI();
            }
            if (current === 'data' && navigator.storage && navigator.storage.estimate) {
                navigator.storage.estimate().then(e => {
                    const el = page.querySelector('[data-storage]');
                    if (el && e && e.usage !== undefined) el.textContent = `${(e.usage / 1048576).toFixed(1)} MB used`;
                }).catch(() => {});
            }
        } catch (e) { console.error('[settings]', e); }
    }

    function bindPage(page) {
        page.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); if (isPhone() && phoneDetail) { phoneDetail = false; render(); } else close(); }
        });
        page.addEventListener('click', (e) => {
            const t = e.target;
            if (t === page || t.closest('[data-close]')) { close(); return; }
            if (t.closest('[data-back]')) { phoneDetail = false; render(); return; }
            const navBtn = t.closest('.cx-nav-item[data-sec]');
            if (navBtn) { current = navBtn.dataset.sec; phoneDetail = true; render(); page.querySelector('.cx-main').scrollTop = 0; return; }

            const segBtn = t.closest('[data-seg] [data-value]');
            if (segBtn) {
                const name = segBtn.closest('[data-seg]').dataset.seg;
                const v = segBtn.dataset.value;
                if (name === 'font') { if (typeof applyFontChoice === 'function') applyFontChoice(v); }
                else setPref(name, v);
                render();
                return;
            }
            const sw = t.closest('[data-accent]');
            if (sw) { setPref('accent', sw.dataset.accent); render(); return; }

            const mv = t.closest('[data-card-move]');
            if (mv) {
                const key = mv.closest('[data-card]').dataset.card;
                const cards = getPref('todayCards').map(c => Object.assign({}, c));
                const i = cards.findIndex(c => c.key === key), j = i + parseInt(mv.dataset.cardMove, 10);
                if (j >= 0 && j < cards.length) { [cards[i], cards[j]] = [cards[j], cards[i]]; setPref('todayCards', cards); render(); }
                return;
            }
            const vo = t.closest('[data-view-open]');
            if (vo) { close(); if (typeof applyWorkspacePreset === 'function') applyWorkspacePreset(vo.dataset.viewOpen); return; }
            const vd = t.closest('[data-view-del]');
            if (vd) { if (typeof deleteWorkspacePreset === 'function') deleteWorkspacePreset(vd.dataset.viewDel); render(); return; }

            const act = t.closest('[data-act]');
            if (!act) return;
            const a = act.dataset.act;
            if (a === 'edit-layout') { close(); if (typeof navigateToTiles === 'function') navigateToTiles(); if (typeof toggleLayoutEditMode === 'function') toggleLayoutEditMode(true); }
            else if (a === 'save-view') {
                const inp = page.querySelector('#cx-view-name');
                if (inp && inp.value.trim() && typeof saveCurrentWorkspacePreset === 'function') { saveCurrentWorkspacePreset('cx-view-name'); render(); }
                else inp?.focus();
            }
            else if (a === 'shortcuts') { close(); if (typeof openShortcutsHelp === 'function') openShortcutsHelp(); }
            else if (a === 'reset-cards') { setPref('todayCards', TODAY_CARD_DEFS.map(c => ({ key: c.key, on: true }))); render(); }
            else if (a === 'forget-study') { if (window.CortexStudy) CortexStudy.forgetLearned(); render(); }
            else if (a === 'places') { close(); if (typeof openTasksSettingsModal === 'function') openTasksSettingsModal('tcfg-ghosts'); }
            else if (a === 'tasks') { close(); if (typeof openTasksSettingsModal === 'function') openTasksSettingsModal(); }
            else if (a === 'account') { close(); if (typeof openAccountPanel === 'function') openAccountPanel(); }
            else if (a === 'sync') { if (typeof triggerManualCloudSync === 'function') triggerManualCloudSync(); setTimeout(render, 1500); }
            else if (a === 'conflicts') { close(); if (typeof showSyncConflictsModal === 'function') showSyncConflictsModal(); }
            else if (a === 'notes-md') { (window.exportNotesMarkdown || (typeof exportNotesMarkdown === 'function' ? exportNotesMarkdown : null))?.(); }
            else if (a === 'feedback') { close(); if (typeof openFeedback === 'function') openFeedback(); }
        });
        page.addEventListener('change', (e) => {
            const t = e.target;
            if (t.matches('[data-pref-select]')) { setPref(t.dataset.prefSelect, t.value); render(); return; }
            if (t.matches('[data-pref-num]')) { setPref(t.dataset.prefNum, Math.max(0, parseInt(t.value, 10) || 0)); return; }
            if (t.matches('[data-accent-custom]')) { setPref('accent', t.value); render(); return; }
            if (t.id === 'cx-red') { if (typeof toggleRedMode === 'function') toggleRedMode(t.checked); return; }
            if (t.id === 'cx-sound') { setPref('focusSound', t.checked); return; }
            if (t.matches('[data-card-on]')) {
                const cards = getPref('todayCards').map(c => c.key === t.dataset.cardOn ? Object.assign({}, c, { on: t.checked }) : c);
                setPref('todayCards', cards); render(); return;
            }
            if (t.matches('[data-mod]')) {
                if (typeof setModuleEnabled === 'function') setModuleEnabled(t.dataset.mod, t.checked);
                render(); return;
            }
        });
        page.addEventListener('input', (e) => {
            const t = e.target;
            if (t.matches('[data-opacity]')) {
                if (typeof updateOpacity === 'function') updateOpacity(t.value);
                const v = page.querySelector('[data-opacity-val]');
                if (v) v.textContent = t.value;
            }
        });
    }

    // Old entry points
    window.openSettingsModal = function (tab) { open(tab); };
    window.openSettingsPage = open;
    window.closeSettingsPage = close;
    window.renderSettingsPage = render;
})();

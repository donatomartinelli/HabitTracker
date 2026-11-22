// --- js/ai/palette.js ---
// COMMAND PALETTE (Ctrl+K) — grouped, keyboard-first, bilingual.
//
// Empty   → SUGGESTED NOW (based on time and your day) · RECENT
// Typing  → I'LL DO THIS (exact command, or a sentence understood offline by nl-parser.js)
//           · COMMANDS (completions) · FOUND IN YOUR DATA (search.js) · GO TO (sections)
//           · ASK AI (Gemini, only if nothing matched and a key is set — always asks to confirm)
// After a command that changes data → toast with [UNDO] (restores the exact state before it).
//
// Builds on terminal-ui.js (open/close, staging queue, AI fallback) and dsl.js (execution).

(function () {
    'use strict';

    const HISTORY_KEY = 'cortex_cmd_history';
    const HISTORY_MAX = 50;
    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));

    let items = [];        // flat list of selectable items, in display order
    let selected = 0;
    let recallIndex = -1;  // for ↑ on an empty input

    // ------------------------------------------------------------------
    // History (this device only)
    // ------------------------------------------------------------------
    function loadHistory() {
        try { return JSON.parse(cortexStore.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
    }
    function pushHistory(cmd) {
        const list = loadHistory().filter(h => h.cmd !== cmd);
        list.unshift({ cmd, at: Date.now() });
        cortexStore.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    }
    function ago(ts) {
        const m = Math.round((Date.now() - ts) / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return `${m} min ago`;
        const h = Math.round(m / 60);
        if (h < 24) return `${h}h ago`;
        const d = Math.round(h / 24);
        return d === 1 ? 'yesterday' : `${d} days ago`;
    }

    // ------------------------------------------------------------------
    // Undo toast
    // ------------------------------------------------------------------
    function showUndoToast(message, snapshotBefore) {
        let el = document.getElementById('action-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'action-toast';
            el.className = 'action-toast';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.innerHTML = `<span>${esc(message)}</span><button type="button" class="btn btn-sm">[UNDO]</button>`;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 7000);
        el.querySelector('button').onclick = () => {
            if (typeof captureCurrentStateSnapshotString === 'function' && typeof redoStack !== 'undefined') {
                redoStack.push(captureCurrentStateSnapshotString());
            }
            if (typeof applyStateSnapshotString === 'function') applyStateSnapshotString(snapshotBefore);
            if (typeof renderTodayModule === 'function') renderTodayModule();
            el.classList.remove('show');
            if (typeof showToast === 'function') showToast('[UNDO] Command reverted');
        };
    }

    // ------------------------------------------------------------------
    // Running things
    // ------------------------------------------------------------------
    function runCommand(cmd, { keepOpen = false } = {}) {
        const input = document.getElementById('terminal-input');
        if (cmd.startsWith('@nav ')) {
            const key = cmd.slice(5).trim();
            closeTerminal();
            if (key === 'tiles') navigateToTiles(); else navigateToSection(key);
            return true;
        }
        const before = typeof captureCurrentStateSnapshotString === 'function' ? captureCurrentStateSnapshotString() : null;
        pushHistory(cmd);
        const ok = typeof executeTerminalCommand === 'function' ? executeTerminalCommand(cmd) : false;
        if (!ok) {
            if (typeof showToast === 'function') showToast(`[?] Couldn't run "${cmd}". Check the wording or press Tab for help.`);
            return false;
        }
        const after = before !== null ? captureCurrentStateSnapshotString() : null;
        if (typeof renderTodayModule === 'function') setTimeout(renderTodayModule, 30);

        // Inspection commands (today, bal, diet…) show a card inside the palette: keep it open
        const isInspection = typeof isInspectionOnlyCommand === 'function' && isInspectionOnlyCommand(cmd);
        const anyModal = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
        if (isInspection || keepOpen) {
            if (input) input.select();
            render();
        } else if (anyModal) {
            // A modal opened (settings, food db…): hide the palette but don't steal focus
            isAskBarExpanded = false;
            document.body.classList.remove('terminal-open');
            document.getElementById('ask-bar-container')?.classList.remove('expanded');
            document.getElementById('terminalOverlay')?.classList.remove('show');
            if (input) { input.value = ''; input.blur(); }
            hide();
        } else {
            closeTerminal();
        }
        if (before !== null && after !== null && before !== after) {
            showUndoToast(`Done: ${cmd}`, before);
        }
        return true;
    }

    // ------------------------------------------------------------------
    // Building the list
    // ------------------------------------------------------------------
    function suggestedNow() {
        const out = [];
        const now = typeof getNow === 'function' ? getNow() : new Date();
        const h = now.getHours();

        // Next unfinished task with a duration → focus on it
        try {
            const next = (typeof templates !== 'undefined' ? templates : []).find(t => {
                if (!t || t.type === 'medicine' || !isTaskActiveOnDate(t, todayStr)) return false;
                const inst = t.instances || 1;
                const log = (logs[todayStr] && logs[todayStr][t.id]) || Array(inst).fill(false);
                const mins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, todayStr) : 0;
                return !log.every(Boolean) && mins > 0;
            });
            if (next) out.push({
                label: `▶ Focus on “${next.title}”`, hint: 'next task',
                run: () => { closeTerminal(); const p = selectedDateStr; selectedDateStr = todayStr; quickStartTaskFocus(next.id); selectedDateStr = p; }
            });
        } catch (e) { /* optional */ }

        if (h >= 17) out.push({
            label: 'Plan tomorrow', hint: 'evening',
            run: () => { closeTerminal(); if (typeof tomorrowStr !== 'undefined' && typeof jumpToDate === 'function') jumpToDate(tomorrowStr); navigateToSection('plan', 'plan'); }
        });
        if (h < 11) {
            const loggedToday = (typeof bodyLogs !== 'undefined' ? bodyLogs : []).some(b => b && b.date === todayStr);
            if (!loggedToday) out.push({ label: 'Log weight', hint: 'morning', fill: 'peso ' });
        }
        out.push({ label: 'Add expense', hint: 'e.g. 12€ lunch', fill: '' , placeholder: '12€ lunch' });
        out.push({ label: 'Add to-do', hint: 'e.g. call mum friday', fill: '', placeholder: 'call mum friday' });
        return out.slice(0, 4);
    }

    function sectionItems(q) {
        if (typeof NAV_SECTIONS === 'undefined') return [];
        const all = NAV_ORDER.map((k, i) => ({ key: k, label: NAV_SECTIONS[k].label, hint: `Alt ${i + 1}` }))
            .concat([{ key: 'tiles', label: 'Tiles', hint: 'Alt 0' }]);
        if (/^(rev|revi|review|revisione|weekly|settiman)/.test(q.toLowerCase())) {
            return [{ label: 'Open weekly review', hint: 'Today › Weekly review', run: () => { closeTerminal(); navigateToSection('today', 'review'); } }];
        }
        const f = q.toLowerCase();
        return all.filter(s => s.label.toLowerCase().startsWith(f) || (f.length >= 3 && s.label.toLowerCase().includes(f)))
            .map(s => ({ label: `Go to ${s.label}`, hint: s.hint, run: () => runCommand(`@nav ${s.key}`) }));
    }

    function build(raw) {
        const q = raw.trim();
        const groups = [];

        if (!q) {
            groups.push({ title: 'SUGGESTED NOW', items: suggestedNow() });
            const recent = loadHistory().slice(0, 5).map(hh => ({ label: hh.cmd, hint: ago(hh.at), fill: hh.cmd, recent: true }));
            if (recent.length) groups.push({ title: 'RECENT', items: recent });
            return groups;
        }

        // 1. What will happen on Enter
        const doThis = [];
        const isDsl = typeof isValidDslCommand === 'function' && isValidDslCommand(q);
        if (isDsl) {
            const preview = typeof getCommandPreview === 'function' ? getCommandPreview(q) : q;
            doThis.push({ label: preview || q, hint: 'Enter', primary: true, run: () => runCommand(q), stage: q });
        } else if (typeof CortexNL !== 'undefined') {
            const parsed = CortexNL.interpret(q, {
                today: todayStr,
                noteCategories: typeof noteCategories !== 'undefined' ? noteCategories : []
            });
            parsed.forEach((p, i) => doThis.push({
                label: p.label, hint: i === 0 ? 'Enter' : 'alternative', primary: i === 0,
                run: () => runCommand(p.cmd), stage: p.cmd, cmd: p.cmd
            }));
        }
        if (doThis.length) groups.push({ title: "I'LL DO THIS", items: doThis });

        // 2. Command completions (from the existing DSL suggestions)
        if (!isDsl && typeof getContextualSuggestions === 'function') {
            // Module-opening suggestions are replaced by the GO TO group (sections)
            const sug = getContextualSuggestions(raw).filter(s => !s.moduleKey && !/\[OPEN VIEW\]/.test(s.display || ''))
                .slice(0, doThis.length ? 3 : 5).map(s => ({
                label: s.display, hint: s.desc, fill: s.fillValue
            }));
            if (sug.length) groups.push({ title: 'COMMANDS', items: sug });
        }

        // 3. Search your data
        if (typeof cortexSearch === 'function' && q.length >= 2 && !isDsl) {
            const found = cortexSearch(q, 6).map(r => ({
                label: `${r.kind} · ${r.title}`, hint: r.sub, run: () => { closeTerminal(); r.run(); }
            }));
            if (found.length) groups.push({ title: 'FOUND IN YOUR DATA', items: found });
        }

        // 4. Navigation
        const nav = sectionItems(q);
        if (nav.length) groups.push({ title: 'GO TO', items: nav });

        // 5. AI fallback (only when nothing understood it)
        const hasAi = typeof geminiApiKey !== 'undefined' && geminiApiKey;
        if (!doThis.length && hasAi && q.split(/\s+/).length >= 2) {
            groups.push({ title: 'ASK AI', items: [{
                label: `Interpret “${q}” with Gemini`, hint: 'you confirm before anything runs',
                run: () => handleNaturalLanguageAiFallback(q, document.getElementById('terminal-input'))
            }] });
        } else if (!doThis.length && !groups.length) {
            groups.push({ title: 'NOTHING MATCHED', items: [{
                label: 'Try: “12€ lunch”, “dentist tomorrow at 3pm”, “note Ideas: …”', hint: 'Tab for commands', fill: ''
            }] });
        }
        return groups;
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------
    function hide() {
        const list = document.getElementById('terminal-suggestions');
        const prev = document.getElementById('terminal-live-preview');
        if (list) { list.style.display = 'none'; list.innerHTML = ''; }
        if (prev) prev.style.display = 'none';
        items = [];
        activeSuggestions = [];
    }

    function render() {
        const input = document.getElementById('terminal-input');
        const list = document.getElementById('terminal-suggestions');
        const prev = document.getElementById('terminal-live-preview');
        if (!input || !list) return;
        if (prev) prev.style.display = 'none';
        if (!isAskBarExpanded) { hide(); return; }

        const groups = build(input.value);
        items = [];
        list.innerHTML = '';
        list.classList.add('palette-list');
        groups.forEach(g => {
            if (!g.items.length) return;
            const head = document.createElement('div');
            head.className = 'palette-group';
            head.textContent = g.title;
            list.appendChild(head);
            g.items.forEach(it => {
                const idx = items.length;
                items.push(it);
                const row = document.createElement('div');
                row.className = `suggestion-item palette-item ${idx === selected ? 'active' : ''} ${it.recent ? 'is-recent' : ''}`;
                row.setAttribute('role', 'option');
                row.innerHTML = `<span class="suggestion-cmd">${esc(it.label)}</span><span class="suggestion-desc">${esc(it.hint || '')}</span>`;
                const choose = (e) => { e.preventDefault(); e.stopPropagation(); selected = idx; activate(false); };
                row.onmousedown = choose;
                row.onmousemove = () => { if (selected !== idx) { selected = idx; paintSelection(); } };
                list.appendChild(row);
            });
        });
        const foot = document.createElement('div');
        foot.className = 'palette-foot';
        foot.textContent = '↑↓ move · Enter run · Tab complete · Shift+Enter queue · Esc close';
        list.appendChild(foot);
        list.style.display = items.length ? 'flex' : 'none';
        if (selected >= items.length) selected = 0;
        paintSelection();
        // Expose to the legacy mobile [TAB] button
        activeSuggestions = items.map(i => ({ fillValue: i.fill ?? i.cmd ?? '' }));
        selectedSuggestionIdx = selected;
    }

    function paintSelection() {
        const rows = document.querySelectorAll('#terminal-suggestions .palette-item');
        rows.forEach((r, i) => r.classList.toggle('active', i === selected));
        const cur = rows[selected];
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
        selectedSuggestionIdx = selected;
    }

    function completeSelected() {
        const it = items[selected];
        const input = document.getElementById('terminal-input');
        if (!it || !input) return false;
        const fill = it.fill !== undefined ? it.fill : (it.cmd || null);
        if (fill === null) return false;
        input.value = fill;
        if (it.placeholder !== undefined) input.placeholder = it.placeholder;
        input.focus();
        selected = 0;
        render();
        return true;
    }

    function activate(stage) {
        const it = items[selected];
        const input = document.getElementById('terminal-input');
        if (!it) {
            const raw = input ? input.value.trim() : '';
            if (!raw && typeof isStagingActive !== 'undefined' && isStagingActive) confirmStagingCommands();
            return;
        }
        if (stage) {
            const cmd = it.stage || it.cmd || (input ? input.value.trim() : '');
            if (cmd) {
                pushCommandsToStaging(cmd.split(';').map(s => s.trim()).filter(Boolean));
                if (input) input.value = '';
                selected = 0;
                render();
            }
            return;
        }
        if (it.run) { it.run(); return; }
        completeSelected();
    }

    // ------------------------------------------------------------------
    // Wiring: replace the old input listeners with the palette's
    // ------------------------------------------------------------------
    function wire() {
        const old = document.getElementById('terminal-input');
        if (!old || old.dataset.palette === '1') return;
        const input = old.cloneNode(true); // drops the old listeners
        input.dataset.palette = '1';
        input.placeholder = 'Type a command, a sentence, or search…';
        old.replaceWith(input);

        input.addEventListener('focus', () => { if (!isAskBarExpanded) openTerminal(); });
        input.addEventListener('input', () => {
            const answer = document.getElementById('terminal-ai-answer');
            if (answer && answer.style.display === 'block' && input.value.trim()) answer.style.display = 'none';
            selected = 0;
            recallIndex = -1;
            render();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length) { selected = (selected + 1) % items.length; paintSelection(); }
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                // Empty input: walk back through history
                if (!input.value.trim() || recallIndex >= 0) {
                    const hist = loadHistory();
                    if (hist.length) {
                        recallIndex = Math.min(hist.length - 1, recallIndex + 1);
                        input.value = hist[recallIndex].cmd;
                        selected = 0;
                        render();
                        return;
                    }
                }
                if (items.length) { selected = (selected - 1 + items.length) % items.length; paintSelection(); }
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                completeSelected();
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                if (typeof isStagingActive !== 'undefined' && isStagingActive) { cancelStaging(); return; }
                closeTerminal();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const raw = input.value.trim();
                // Several commands separated by ";" → queue them for review
                if (raw.includes(';') && !e.shiftKey) {
                    pushCommandsToStaging(raw.split(';').map(s => s.trim()).filter(Boolean));
                    input.value = '';
                    render();
                    return;
                }
                if (!raw && typeof isStagingActive !== 'undefined' && isStagingActive) { confirmStagingCommands(); return; }
                activate(e.shiftKey);
            }
        });
    }

    // Override the legacy functions other code calls
    window.updateLivePreviewAndSuggestions = updateLivePreviewAndSuggestions = render;
    window.hideSuggestionsAndPreview = hideSuggestionsAndPreview = hide;
    window.applySuggestionAtIndex = applySuggestionAtIndex = (idx) => { selected = idx; completeSelected(); };
    window.cortexRunCommand = runCommand;

    window.addEventListener('DOMContentLoaded', wire);
})();

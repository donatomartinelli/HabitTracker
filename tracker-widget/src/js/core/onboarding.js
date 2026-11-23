// --- js/core/onboarding.js ---
// WELCOME GUIDE for brand-new installs (never shown to people who already have data).
//   1. Welcome (or "I already use Cortex" → sign in)
//   2. What do you want to organize? → modules
//   3. Three things for today → to-dos
//   4. Meet the command bar → try a sentence
// Finishing or skipping sets cortex_onboarded = 1.

(function () {
    'use strict';

    const DONE_KEY = 'cortex_onboarded';
    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));

    const AREAS = [
        { id: 'plan', label: 'Plan my days and weeks', hint: 'Day timeline, week planner, calendar', modules: ['plan', 'planner', 'calendar'], on: true },
        { id: 'notes', label: 'Capture notes and ideas', hint: 'Folders, quick capture, voice notes', modules: ['notes'], on: true },
        { id: 'study', label: 'Study for exams', hint: 'Exams, credits, study pace, math practice', modules: ['uni', 'math'], on: false },
        { id: 'money', label: 'Keep track of money', hint: 'Balance, envelopes, bills, wishlist', modules: ['money'], on: false },
        { id: 'health', label: 'Train and eat well', hint: 'Workouts, meals, body weight', modules: ['gym', 'diet'], on: false },
        { id: 'habits', label: 'Build habits', hint: 'Streak grid and focus hours', modules: ['streak'], on: true }
    ];
    const EXAMPLES = ['dentist tomorrow at 3pm', '12€ lunch', 'call mum friday', 'Ideas: a name for my side project'];

    let step = 0;
    const choice = Object.fromEntries(AREAS.map(a => [a.id, a.on]));

    function needsOnboarding() {
        return cortexStore.getItem(DONE_KEY) !== '1';
    }

    function finish(goTo = 'today') {
        cortexStore.setItem(DONE_KEY, '1');
        cortexStore.removeItem('cortex_fresh_install');
        document.getElementById('onboarding')?.remove();
        if (typeof navigateToSection === 'function' && goTo) navigateToSection(goTo, 'today');
    }

    function applyModules() {
        if (typeof setModuleEnabled !== 'function') return;
        AREAS.forEach(a => a.modules.forEach(m => setModuleEnabled(m, Boolean(choice[a.id]))));
    }

    function addTodos(list) {
        list.map(s => s.trim()).filter(Boolean).forEach(text => {
            if (typeof executeTerminalCommand === 'function') executeTerminalCommand(`todo ${text}`);
        });
        if (typeof renderTodayModule === 'function') renderTodayModule();
    }

    function render() {
        const wrap = document.getElementById('onboarding');
        if (!wrap) return;
        const dots = [0, 1, 2, 3].map(i => `<span class="ob-dot ${i === step ? 'on' : ''}"></span>`).join('');
        let body = '';

        if (step === 0) {
            body = `
                <div class="ob-kicker">WELCOME</div>
                <h2 class="ob-title">From idea to done. Type what you mean.</h2>
                <p class="ob-text">Cortex keeps your day in one place: what to do, when, a focus timer, and a weekly review. Everything is stored on this device first and works offline.</p>
                <div class="ob-actions">
                    <button type="button" class="btn btn-primary" data-next>[GET STARTED]</button>
                    <button type="button" class="ghost-btn" data-signin>I already use Cortex: sign in</button>
                </div>`;
        } else if (step === 1) {
            body = `
                <div class="ob-kicker">STEP 1 OF 3</div>
                <h2 class="ob-title">What do you want Cortex to help with?</h2>
                <p class="ob-text">Pick what you'll use now. You can change this any time in Modules.</p>
                <div class="ob-areas">
                    ${AREAS.map(a => `
                        <label class="ob-area" for="ob-${a.id}">
                            <input type="checkbox" id="ob-${a.id}" data-area="${a.id}" ${choice[a.id] ? 'checked' : ''}>
                            <span><strong>${esc(a.label)}</strong><span class="dim">${esc(a.hint)}</span></span>
                        </label>`).join('')}
                </div>
                <div class="ob-actions">
                    <button type="button" class="btn btn-primary" data-next>[CONTINUE]</button>
                    <button type="button" class="ghost-btn" data-back>Back</button>
                </div>`;
        } else if (step === 2) {
            body = `
                <div class="ob-kicker">STEP 2 OF 3</div>
                <h2 class="ob-title">Three things you want to get done today</h2>
                <p class="ob-text">Small or big. They'll be waiting on your Today screen.</p>
                <div class="ob-todos">
                    ${[0, 1, 2].map(i => `<input type="text" class="form-control" id="ob-todo-${i}" placeholder="${['Reply to the landlord', 'Go for a 20-minute walk', 'Read one chapter'][i]}" autocomplete="off">`).join('')}
                </div>
                <div class="ob-actions">
                    <button type="button" class="btn btn-primary" data-next>[CONTINUE]</button>
                    <button type="button" class="ghost-btn" data-back>Back</button>
                </div>`;
        } else {
            const isPhone = typeof isMobileViewMode !== 'undefined' && isMobileViewMode;
            body = `
                <div class="ob-kicker">STEP 3 OF 3</div>
                <h2 class="ob-title">One bar for everything</h2>
                <p class="ob-text">${isPhone ? 'Tap ⌘ at the bottom' : 'Press <kbd>Ctrl K</kbd>'} and write what you mean, in English or Italian. Cortex shows what it will do before doing it.</p>
                <div class="ob-examples">${EXAMPLES.map(e => `<button type="button" class="chip-btn" data-try="${esc(e)}">${esc(e)}</button>`).join('')}</div>
                <div class="ob-actions">
                    <button type="button" class="btn btn-primary" data-finish>[OPEN MY DAY]</button>
                    <button type="button" class="ghost-btn" data-back>Back</button>
                </div>`;
        }

        wrap.innerHTML = `
            <div class="ob-panel" role="dialog" aria-modal="true" aria-label="Welcome to Cortex">
                <div class="ob-top"><span class="ob-brand">CORTEX</span><span class="ob-dots">${dots}</span><button type="button" class="ghost-btn" data-skip>Skip</button></div>
                ${body}
            </div>`;

        wrap.querySelector('[data-skip]')?.addEventListener('click', () => finish());
        wrap.querySelector('[data-back]')?.addEventListener('click', () => { step = Math.max(0, step - 1); render(); });
        wrap.querySelector('[data-signin]')?.addEventListener('click', () => {
            finish(null);
            if (typeof openAccountPanel === 'function') openAccountPanel();
        });
        wrap.querySelectorAll('[data-area]').forEach(cb => cb.addEventListener('change', () => { choice[cb.dataset.area] = cb.checked; }));
        wrap.querySelector('[data-next]')?.addEventListener('click', () => {
            if (step === 1) applyModules();
            if (step === 2) addTodos([0, 1, 2].map(i => wrap.querySelector(`#ob-todo-${i}`).value));
            step++;
            render();
        });
        wrap.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => {
            finish();
            setTimeout(() => {
                if (typeof openTerminal !== 'function') return;
                openTerminal();
                const input = document.getElementById('terminal-input');
                if (input) { input.value = b.dataset.try; input.dispatchEvent(new Event('input')); }
            }, 150);
        }));
        wrap.querySelector('[data-finish]')?.addEventListener('click', () => finish());
        wrap.querySelectorAll('.ob-todos input').forEach((inp, i, all) => inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); (all[i + 1] || wrap.querySelector('[data-next]')).focus(); }
        }));
        (wrap.querySelector('input:not([type=checkbox])') || wrap.querySelector('[data-next], [data-finish]'))?.focus();
    }

    function start() {
        if (!needsOnboarding() || document.getElementById('onboarding')) return;
        const root = document.getElementById('modals-root') || document.body;
        const wrap = document.createElement('div');
        wrap.id = 'onboarding';
        wrap.className = 'ob-overlay';
        root.appendChild(wrap);
        step = 0;
        render();
    }

    window.startOnboarding = () => { cortexStore.removeItem(DONE_KEY); start(); };
    window.addEventListener('DOMContentLoaded', () => setTimeout(start, 400));
})();

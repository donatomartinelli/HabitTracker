// --- js/core/onboarding.js ---
// WELCOME GUIDE for brand-new installs (never shown to people who already have data).
//   1. Welcome (or "I already use Cortex" → sign in)
//   2. How do you spend your days? → study / work / a bit of everything (picks modules and examples)
//   3. What do you want to organize? → modules
//   4. Three things for today → to-dos
//   5. Meet the command bar → try a sentence
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
    // Who you are changes the starting modules, the example to-dos and the sentences to try
    const PROFILES = [
        {
            id: 'study', label: 'Studying', hint: 'Lectures, exams, study sessions',
            areas: { study: true, money: true },
            todos: ['Review chapter 3', 'Email the professor', 'Book the library room'],
            examples: ['study maths 2h tomorrow', 'exam history 15/01 at 9', 'lecture every monday and wednesday 9-11', 'move study to friday', 'what do I have thursday?']
        },
        {
            id: 'work', label: 'Working', hint: 'Meetings, deep work, deadlines',
            areas: {},
            todos: ['Send the weekly report', 'Prepare slides for Monday', 'Call the accountant'],
            examples: ['call with Anna tomorrow at 3pm', 'deep work 2h tomorrow morning', 'standup every weekday 9:30-9:45', 'postpone everything to tomorrow', 'what do I have friday?']
        },
        {
            id: 'mix', label: 'A bit of everything', hint: 'Life, errands, side projects',
            areas: { money: true },
            todos: ['Reply to the landlord', 'Go for a 20-minute walk', 'Read one chapter'],
            examples: ['dentist tomorrow at 3pm', 'gym every monday and thursday at 6pm', 'call mum friday then groceries', '12€ lunch', 'move dentist to friday']
        }
    ];

    let step = 0;
    let profile = PROFILES[2];
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
        const dots = [0, 1, 2, 3, 4].map(i => `<span class="ob-dot ${i === step ? 'on' : ''}"></span>`).join('');
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
                <div class="ob-kicker">STEP 1 OF 4</div>
                <h2 class="ob-title">How do you spend most of your days?</h2>
                <p class="ob-text">Cortex sets itself up around it. Nothing is locked: you can change everything later.</p>
                <div class="ob-areas ob-profiles">
                    ${PROFILES.map(p => `
                        <label class="ob-area" for="ob-p-${p.id}">
                            <input type="radio" name="ob-profile" id="ob-p-${p.id}" data-profile="${p.id}" ${profile.id === p.id ? 'checked' : ''}>
                            <span><strong>${esc(p.label)}</strong><span class="dim">${esc(p.hint)}</span></span>
                        </label>`).join('')}
                </div>
                <div class="ob-actions">
                    <button type="button" class="btn btn-primary" data-next>[CONTINUE]</button>
                    <button type="button" class="ghost-btn" data-back>Back</button>
                </div>`;
        } else if (step === 2) {
            body = `
                <div class="ob-kicker">STEP 2 OF 4</div>
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
        } else if (step === 3) {
            body = `
                <div class="ob-kicker">STEP 3 OF 4</div>
                <h2 class="ob-title">Three things you want to get done today</h2>
                <p class="ob-text">Small or big. They'll be waiting on your Today screen.</p>
                <div class="ob-todos">
                    ${[0, 1, 2].map(i => `<input type="text" class="form-control" id="ob-todo-${i}" placeholder="${esc(profile.todos[i])}" autocomplete="off">`).join('')}
                </div>
                <div class="ob-actions">
                    <button type="button" class="btn btn-primary" data-next>[CONTINUE]</button>
                    <button type="button" class="ghost-btn" data-back>Back</button>
                </div>`;
        } else {
            const isPhone = typeof isMobileViewMode !== 'undefined' && isMobileViewMode;
            body = `
                <div class="ob-kicker">STEP 4 OF 4</div>
                <h2 class="ob-title">One bar for everything</h2>
                <p class="ob-text">${isPhone ? 'Tap ⌘ at the bottom' : 'Press <kbd>Ctrl K</kbd>'} and write what you mean, in English or Italian. Cortex shows what it will do before doing it, finds free time for you, and learns your habits. Type <kbd>?</kbd> to see everything it understands.</p>
                <div class="ob-examples">${profile.examples.map(e => `<button type="button" class="chip-btn" data-try="${esc(e)}">${esc(e)}</button>`).join('')}</div>
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
        wrap.querySelectorAll('[data-profile]').forEach(rb => rb.addEventListener('change', () => {
            profile = PROFILES.find(p => p.id === rb.dataset.profile) || profile;
            // the profile pre-selects areas; the next step still lets you change them
            AREAS.forEach(a => { choice[a.id] = a.on || Boolean(profile.areas[a.id]); });
        }));
        wrap.querySelector('[data-next]')?.addEventListener('click', () => {
            if (step === 1) cortexStore.setItem('cortex_profile', profile.id);
            if (step === 2) applyModules();
            if (step === 3) addTodos([0, 1, 2].map(i => wrap.querySelector(`#ob-todo-${i}`).value));
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
        (wrap.querySelector('input:not([type=checkbox]):not([type=radio])') || wrap.querySelector('[data-next], [data-finish]'))?.focus();
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

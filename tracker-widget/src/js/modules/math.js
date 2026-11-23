// --- js/modules/math.js ---
// ATOMIC MODULE 11: MATH-HUB NATIVE ENGINE

class MathHubProblemEngine {
    constructor() {
        this.problems = cachedMathProblems || [];
    }
    get state() { return mathHubState; }
    saveState() { saveData(); }

    getGroupKey(p) { return `${p.course}::${p.topic}::${p.baseDiff}`; }

    getAvailableCourses() {
        const courses = [];
        for (const p of this.problems) {
            if (!courses.includes(p.course)) courses.push(p.course);
        }
        return courses;
    }

    setActiveCourse(courseName) {
        this.state.activeCourse = courseName;
        this.state.activeProblemId = null;
        this.saveState();
    }

    getTodayISO() { return todayStr; }

    // Avanzamento di un corso: argomenti superati in sequenza sul totale
    getCourseProgress(course) {
        const courseProbs = this.problems.filter(p => p.course === course);
        if (!courseProbs.length) return { passed: 0, total: 0 };
        const uniqueGroups = [...new Set(courseProbs.map(p => this.getGroupKey(p)))];
        let passed = 0;
        for (const gKey of uniqueGroups) {
            const rec = this.state.topicRecords[gKey];
            if (rec && rec.status === 'passed') passed++;
            else break;
        }
        return { passed, total: uniqueGroups.length };
    }

    getNextProblem(forceRecompute = false) {
        if (!this.problems.length || !this.state.activeCourse) return null;
        const courseProbs = this.problems.filter(p => p.course === this.state.activeCourse);
        if (!courseProbs.length) return null;

        if (!forceRecompute && this.state.activeProblemId) {
            const locked = courseProbs.find(p => p.id === this.state.activeProblemId);
            if (locked) return { problem: locked, mode: this.state.activeMode || 'IN CORSO' };
        }

        const today = this.getTodayISO();
        const uniqueGroups = [...new Set(courseProbs.map(p => this.getGroupKey(p)))];

        // 1. RIPASSO
        const dueGroups = uniqueGroups.filter(key => {
            const rec = this.state.topicRecords[key];
            return rec && rec.dueDate && rec.dueDate <= today && (rec.status === 'passed' || rec.status === 'failed');
        });

        if (dueGroups.length > 0) {
            dueGroups.sort((a, b) => {
                const recA = this.state.topicRecords[a], recB = this.state.topicRecords[b];
                if (recA.status === 'failed' && recB.status !== 'failed') return -1;
                if (recB.status === 'failed' && recA.status !== 'failed') return 1;
                return (recA.interval || 1) - (recB.interval || 1);
            });
            const targetGroupKey = dueGroups[0];
            const rec = this.state.topicRecords[targetGroupKey];
            const groupSubset = courseProbs.filter(p => this.getGroupKey(p) === targetGroupKey);
            let chosen = groupSubset.find(p => !rec.usedIds.includes(p.id)) || groupSubset[Math.floor(Math.random() * groupSubset.length)];
            
            this.state.activeProblemId = chosen.id;
            this.state.activeMode = rec.status === 'failed' ? 'RESA' : 'RIPASSO';
            this.saveState();
            return { problem: chosen, mode: this.state.activeMode };
        }

        // 2. NUOVO
        for (const gKey of uniqueGroups) {
            const rec = this.state.topicRecords[gKey];
            if (!rec || rec.status !== 'passed') {
                const groupSubset = courseProbs.filter(p => this.getGroupKey(p) === gKey);
                const used = rec ? rec.usedIds : [];
                let chosen = groupSubset.find(p => !used.includes(p.id)) || groupSubset[0];

                this.state.activeProblemId = chosen.id;
                this.state.activeMode = 'NUOVO';
                this.saveState();
                return { problem: chosen, mode: 'NUOVO' };
            }
        }

        // 3. CONSOLIDAMENTO
        const hardProbs = courseProbs.filter(p => p.baseDiff >= 3);
        const fallbackPool = hardProbs.length ? hardProbs : courseProbs;
        const randomProb = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
        
        this.state.activeProblemId = randomProb.id;
        this.state.activeMode = 'CONSOLIDAMENTO';
        this.saveState();
        return { problem: randomProb, mode: 'CONSOLIDAMENTO' };
    }

    submitEvaluation(problemId, sliderValue) {
        const problem = this.problems.find(p => p.id === problemId);
        if (!problem) return;

        const s = Math.min(1, Math.max(0, parseFloat(sliderValue)));
        const isFailed = (s >= 0.99); 
        const gKey = this.getGroupKey(problem);
        
        if (!this.state.topicRecords[gKey]) {
            this.state.topicRecords[gKey] = { status: 'learning', interval: 1, dueDate: null, usedIds: [] };
        }
        const rec = this.state.topicRecords[gKey];
        if (!rec.usedIds.includes(problemId)) rec.usedIds.push(problemId);

        if (isFailed) {
            rec.status = 'failed';
            rec.interval = 1;
        } else {
            rec.status = 'passed';
            const factor = Math.max(1.1, 2.6 - 1.8 * s);
            rec.interval = Math.max(1, Math.round((rec.interval || 1) * factor));
        }

        const dueDateObj = new Date();
        dueDateObj.setDate(dueDateObj.getDate() + rec.interval);
        rec.dueDate = formatDate(dueDateObj);

        const today = this.getTodayISO();
        if (!this.state.dailyHistory[today]) this.state.dailyHistory[today] = { count: 0, sumSlider: 0 };
        this.state.dailyHistory[today].count += 1;
        this.state.dailyHistory[today].sumSlider += s;

        const alpha = 0.1;
        const oldEma = this.state.globalEmaMastery ?? 0.50;
        this.state.globalEmaMastery = (alpha * (1 - s)) + ((1 - alpha) * oldEma);

        this.state.activeProblemId = null; 
        this.saveState();
    }
}

class MathHubTrachtenbergEngine {
    get weights() { return mentalMathWeights; }
    get history() { return mentalMathHistory; }
    get config() { return mentalMathConfig; }

    updateConfig(newConfig) {
        mentalMathConfig = { ...mentalMathConfig, ...newConfig };
        saveData();
    }

    parseDigits(inputStr) {
        let [min, max] = inputStr.split('-').map(n => parseInt(n.trim(), 10));
        min = min || 1;
        max = max || min;
        if (min > max) [min, max] = [max, min];
        return { min: 10 ** (min - 1), max: (10 ** max) - 1 };
    }

    parseLiteralValues(inputStr) {
        const values = new Set();
        inputStr.split(',').forEach(part => {
            if (part.includes('-')) {
                let [min, max] = part.split('-').map(n => parseInt(n.trim(), 10));
                if (!isNaN(min) && !isNaN(max)) {
                    if (min > max) [min, max] = [max, min];
                    for (let i = min; i <= max; i++) values.add(i);
                }
            } else {
                const val = parseInt(part.trim(), 10);
                if (!isNaN(val)) values.add(val);
            }
        });
        return values.size ? Array.from(values) : [11];
    }

    generateOperation() {
        const rangeA = this.parseDigits(this.config.digits);
        let multipliers = this.config.multType === 'digits'
            ? Array.from({ length: this.parseDigits(this.config.mult).max - this.parseDigits(this.config.mult).min + 1 }, (_, i) => i + this.parseDigits(this.config.mult).min)
            : this.parseLiteralValues(this.config.mult);

        const pool = multipliers.map(m => ({ multiplier: m, weight: this.weights[m] ?? 1000 }));
        let rand = Math.random() * pool.reduce((sum, item) => sum + item.weight, 0);

        let selectedMultiplier = pool[pool.length - 1].multiplier;
        for (const { multiplier, weight } of pool) {
            if ((rand -= weight) <= 0) {
                selectedMultiplier = multiplier;
                break;
            }
        }

        const multiplicand = Math.floor(Math.random() * (rangeA.max - rangeA.min + 1)) + rangeA.min;
        return {
            multiplicand,
            multiplier: selectedMultiplier,
            targetStr: (multiplicand * selectedMultiplier).toString(),
            key: selectedMultiplier,
            rawMultiplicand: multiplicand
        };
    }

    validateInput(inputBuffer, targetStr) {
        if (inputBuffer === targetStr) return { status: 'CORRECT' };
        if (inputBuffer.length >= targetStr.length) return { status: 'ERROR' };
        return { status: 'PENDING' };
    }

    updateWeights(sessionStats) {
        if (!sessionStats.length) return;
        const alpha = 0.3;
        const penaltyPerError = 800;
        const today = todayStr;
        
        if (!this.history[today]) this.history[today] = {};

        sessionStats.forEach(({ key, time, errors, multiplicand }) => {
            const oldWeight = this.weights[key] ?? 1000;
            const normalizedTime = (time + errors * penaltyPerError) / Math.max(1, multiplicand.toString().length / 2);
            this.weights[key] = (alpha * normalizedTime) + ((1 - alpha) * oldWeight);

            if (!this.history[today][key]) this.history[today][key] = { sum: 0, count: 0 };
            this.history[today][key].sum += normalizedTime;
            this.history[today][key].count += 1;
        });

        saveData(); // Salva nel DB principale di Cortex
    }
}

// Istanze Singletone
const pEngine = new MathHubProblemEngine();
const mEngine = new MathHubTrachtenbergEngine();

let activeMathTab = 'drill';
let mathDrillInterval = null;
let mathDrillTimeLeft = 60;
let mathDrillScore = 0;
let currentOp = null;
let opStartTime = 0;
let currentErrors = 0;
let sessionStats = [];

// Carica problems.json in cache se vuoto (assume che problems.json sia nella root Tauri)
let mathProblemsLoading = false;
async function fetchMathProblemsIfNeeded() {
    if (cachedMathProblems.length > 0 || mathProblemsLoading) return;
    mathProblemsLoading = true;
    try {
        const res = await fetch('./problems.json', { cache: 'no-cache' });
        if (res.ok) {
            cachedMathProblems = await res.json();
            pEngine.problems = cachedMathProblems;
            // Il render iniziale è avvenuto senza dati: ridisegna ora che ci sono
            if (cachedMathProblems.length > 0) renderMathModule();
        }
    } catch (e) {
        console.error('Math-Hub: impossibile caricare problems.json', e);
    } finally {
        mathProblemsLoading = false;
    }
}

window.switchMathTab = function(tabId) {
    activeMathTab = tabId;
    renderMathModule();
};

function renderMathModule() {
    const root = document.getElementById('module-math');
    if (!root) return;

    fetchMathProblemsIfNeeded();

    root.innerHTML = `
        <div class="module-body-padded u-grow u-flex u-col u-gap-3 u-scroll-y" style="height:100%; padding-bottom:var(--space-5);">
            <div class="section-header-row u-mb-0 u-noshrink">
                <div>
                    <span class="section-label">Math-Hub</span>
                    <span class="u-fs-xs u-dim u-ml-2">// NATIVE ENGINE</span>
                </div>
                <div class="u-flex u-gap-2">
                    <button type="button" class="btn btn-sm ${activeMathTab==='drill'?'btn-primary':''}" onclick="switchMathTab('drill')">[DRILL]</button>
                    <button type="button" class="btn btn-sm ${activeMathTab==='problems'?'btn-primary':''}" onclick="switchMathTab('problems')">[PROBLEMS]</button>
                </div>
            </div>

            <!-- DRILL TAB -->
            <div id="math-tab-drill" style="display:${activeMathTab==='drill'?'flex':'none'}; flex-direction:column; gap:var(--space-4); flex:1;">
                
                <div id="mh-drill-setup" class="cfg-box u-mb-0" style="border-color:var(--text-main);">
                    <div class="sub-column-header">Trachtenberg Setup</div>
                    <div class="u-flex u-gap-2 u-wrap u-mb-3">
                        <input type="text" id="mh-cfg-dig" class="form-control form-control-sm" value="${mEngine.config.digits}" style="width:80px;" placeholder="Digits">
                        <input type="text" id="mh-cfg-mul" class="form-control form-control-sm" value="${mEngine.config.mult}" style="width:80px;" placeholder="Mult">
                        <select id="mh-cfg-type" class="form-control form-control-sm" style="width:100px;">
                            <option value="literal" ${mEngine.config.multType==='literal'?'selected':''}>Literal</option>
                            <option value="digits" ${mEngine.config.multType==='digits'?'selected':''}>Digits</option>
                        </select>
                        <input type="number" id="mh-cfg-time" class="form-control form-control-sm no-spinners" value="60" style="width:60px;" placeholder="Sec">
                        <button class="btn btn-primary btn-sm" id="mh-btn-start">[START SESSION]</button>
                    </div>
                </div>

                <div id="mh-drill-game" class="cfg-box u-tc u-grow u-col u-jc-center" style="display:none;">
                    <div class="u-flex u-jc-between u-dim u-fs-xs u-bold">
                        <span id="mh-time-display">TIME: 60s</span>
                        <span id="mh-score-display">SCORE: 0</span>
                    </div>
                    <div class="u-mt-4 u-bold u-tnum" style="font-size:3.5rem; letter-spacing:4px;">
                        <div class="u-main" id="mh-multiplicand">--</div>
                        <div class="u-dim" id="mh-multiplier">* --</div>
                        <input class="u-w-full u-tr u-border-0 u-main" type="text" id="mh-answer" autocomplete="off" inputmode="numeric" style="font-size:3.5rem; border-bottom:2px solid var(--text-main); background:transparent; letter-spacing:4px;">
                    </div>
                    <div style="margin-top:var(--space-5);">
                        <button class="btn btn-danger btn-sm" id="mh-btn-stop">[STOP / SAVE]</button>
                    </div>
                </div>
            </div>

            <!-- PROBLEMS TAB (LaTeX) -->
            <div id="math-tab-problems" style="display:${activeMathTab==='problems'?'flex':'none'}; flex-direction:column; gap:var(--space-3); flex:1;">
                <div class="u-col u-gap-2" id="mh-prob-courses" style="display:flex;"></div>
                <div class="u-col u-gap-3 u-grow" id="mh-prob-solve" style="display:none;">
                    <div class="u-flex u-jc-between u-fs-xs u-dim u-bold" style="border-bottom:1px solid var(--border-color); padding-bottom:var(--space-2);">
                        <span id="mh-prob-bread">COURSE > TOPIC</span>
                        <button class="icon-btn" id="mh-btn-back-courses">[× EXIT]</button>
                    </div>
                    <div class="u-fs-md u-main u-grow u-scroll-y" id="mh-prob-statement" style="line-height:1.6; min-height:150px;">
                        Statement...
                    </div>
                    
                    <div class="u-jc-center u-gap-2 u-mt-3" id="mh-prob-actions" style="display:flex;">
                        <button class="btn btn-primary u-w-full" id="mh-btn-show-rate">[ DONE / SHOW RATING ]</button>
                    </div>
                    <div class="u-jc-between u-gap-2 u-mt-3" id="mh-prob-rates" style="display:none;">
                        <button class="btn btn-danger u-grow" data-rate="1.0">[FAIL]</button>
                        <button class="btn u-grow" data-rate="0.8">[HARD]</button>
                        <button class="btn u-grow" data-rate="0.4">[GOOD]</button>
                        <button class="btn u-grow u-green" style="border-color:var(--accent-green);" data-rate="0.1">[EASY]</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- LOGICA DRILL ---
    const startBtn = root.querySelector('#mh-btn-start');
    const stopBtn = root.querySelector('#mh-btn-stop');
    const setupBox = root.querySelector('#mh-drill-setup');
    const gameBox = root.querySelector('#mh-drill-game');
    const ansInp = root.querySelector('#mh-answer');

    const renderNewOp = () => {
        currentOp = mEngine.generateOperation();
        root.querySelector('#mh-multiplicand').textContent = currentOp.multiplicand;
        root.querySelector('#mh-multiplier').textContent = `* ${currentOp.multiplier}`;
        ansInp.value = '';
        opStartTime = performance.now();
        currentErrors = 0;
        ansInp.focus();
    };

    const endDrill = () => {
        clearInterval(mathDrillInterval);
        mEngine.updateWeights(sessionStats);
        
        // INTEGRAZIONE FOCUS LEDGER: Salva i minuti
        if (typeof logFocusSession === 'function' && mathDrillTimeLeft < parseInt(root.querySelector('#mh-cfg-time').value, 10)) {
            const secsPlayed = parseInt(root.querySelector('#mh-cfg-time').value, 10) - mathDrillTimeLeft;
            const mins = Math.max(1, Math.round(secsPlayed / 60));
            logFocusSession(mins, 'Mental Math', `Trachtenberg Drill`, todayStr);
        }

        setupBox.style.display = 'block';
        gameBox.style.display = 'none';
        if (typeof showToast === 'function') showToast(`[DRILL] Logged ${mathDrillScore} correct!`);
    };

    startBtn.onclick = () => {
        mEngine.updateConfig({
            digits: root.querySelector('#mh-cfg-dig').value,
            mult: root.querySelector('#mh-cfg-mul').value,
            multType: root.querySelector('#mh-cfg-type').value
        });
        mathDrillTimeLeft = parseInt(root.querySelector('#mh-cfg-time').value, 10) || 60;
        mathDrillScore = 0;
        sessionStats = [];
        
        setupBox.style.display = 'none';
        gameBox.style.display = 'flex';
        root.querySelector('#mh-score-display').textContent = `SCORE: 0`;
        root.querySelector('#mh-time-display').textContent = `TIME: ${mathDrillTimeLeft}s`;
        
        clearInterval(mathDrillInterval);
        mathDrillInterval = setInterval(() => {
            mathDrillTimeLeft--;
            root.querySelector('#mh-time-display').textContent = `TIME: ${mathDrillTimeLeft}s`;
            if (mathDrillTimeLeft <= 0) endDrill();
        }, 1000);
        
        renderNewOp();
    };

    stopBtn.onclick = endDrill;

    ansInp.onkeydown = (e) => {
        if (e.key.length > 1 && e.key !== 'Backspace') return;
        e.preventDefault();
        if (e.key === 'Backspace') ansInp.value = ansInp.value.slice(1);
        else if (/^\d$/.test(e.key)) ansInp.value = e.key + ansInp.value;
        else return;

        if (!currentOp) return;
        const val = mEngine.validateInput(ansInp.value, currentOp.targetStr);
        if (val.status === 'CORRECT') {
            sessionStats.push({
                key: currentOp.key, multiplicand: currentOp.rawMultiplicand,
                time: performance.now() - opStartTime, errors: currentErrors
            });
            mathDrillScore++;
            root.querySelector('#mh-score-display').textContent = `SCORE: ${mathDrillScore}`;
            renderNewOp();
        } else if (val.status === 'ERROR') {
            currentErrors++;
            ansInp.style.color = 'var(--accent-red)';
            setTimeout(() => { ansInp.value = ''; ansInp.style.color = 'var(--text-main)'; }, 150);
        }
    };

    // --- LOGICA PROBLEMS (LaTeX) ---
    const courseBox = root.querySelector('#mh-prob-courses');
    const solveBox = root.querySelector('#mh-prob-solve');
    
    const showCourses = () => {
        pEngine.setActiveCourse(null);
        courseBox.style.display = 'flex';
        solveBox.style.display = 'none';
        courseBox.innerHTML = '';
        
        const courses = pEngine.getAvailableCourses();
        if (courses.length === 0) {
            courseBox.innerHTML = '<div class="empty-state">[ NO COURSES (problems.json is missing or empty) ]</div>';
            return;
        }
        
        courses.forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.style.cssText = 'text-align:left; display:flex; justify-content:space-between;';
            const prog = pEngine.getCourseProgress(c);
            btn.innerHTML = `<strong>${escapeHtml(c.toUpperCase())}</strong> <span class="u-fs-2xs u-dim">${prog.passed}/${prog.total}</span>`;
            btn.onclick = () => {
                pEngine.setActiveCourse(c);
                courseBox.style.display = 'none';
                solveBox.style.display = 'flex';
                renderNextProb();
            };
            courseBox.appendChild(btn);
        });
    };

    const renderNextProb = () => {
        const next = pEngine.getNextProblem(true);
        if (!next || !next.problem) {
            root.querySelector('#mh-prob-bread').textContent = '// FINE CORSO';
            root.querySelector('#mh-prob-statement').textContent = 'No problems left in the review queue for this course.';
            root.querySelector('#mh-prob-actions').style.display = 'none';
            return;
        }
        
        root.querySelector('#mh-prob-actions').style.display = 'flex';
        root.querySelector('#mh-prob-rates').style.display = 'none';
        
        const p = next.problem;
        root.querySelector('#mh-prob-bread').textContent = `[${next.mode}] ${p.course} > ${p.topic}`;
        root.querySelector('#mh-prob-statement').innerHTML = p.statement;
        
        if (window.renderMathInElement) {
            window.renderMathInElement(root.querySelector('#mh-prob-statement'), {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false
            });
        }
    };

    root.querySelector('#mh-btn-show-rate').onclick = () => {
        root.querySelector('#mh-prob-actions').style.display = 'none';
        root.querySelector('#mh-prob-rates').style.display = 'flex';
    };

    root.querySelectorAll('#mh-prob-rates button').forEach(btn => {
        btn.onclick = () => {
            const val = btn.getAttribute('data-rate');
            if (pEngine.state.activeProblemId) {
                pEngine.submitEvaluation(pEngine.state.activeProblemId, val);
                renderNextProb();
            }
        };
    });

    root.querySelector('#mh-btn-back-courses').onclick = showCourses;

    if (pEngine.state.activeCourse) {
        courseBox.style.display = 'none';
        solveBox.style.display = 'flex';
        renderNextProb();
    } else {
        showCourses();
    }
}
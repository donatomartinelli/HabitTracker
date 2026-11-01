// --- js/modules/money.js ---
// Atomic Module 7 & First-Class Composable Sub-Modules:
// m_summary | m_vaults | m_chart | m_tx | m_bills | m_analytics | m_incubator

let currentChartStepData = [];
let mTxLimit = parseInt(localStorage.getItem('m_tx_limit'), 10) || 5;
let mTxCategoryFilter = 'ALL';
let editingTxId = null;
let activeCatPopoverTxId = null;

// Categorie per le Purchase Ideas (stile Tasks)
let mWishCategories = safeJsonParse(localStorage.getItem('m_wish_cats'), ['General', 'Vestiti', 'Office Supplies', 'Tech']);
let editingWishId = null;
let buyingInlineWishId = null;

// Chiude la tendina categorie se clicchi fuori dal badge
document.addEventListener('mousedown', (e) => {
    if (activeCatPopoverTxId && !e.target.closest('.m-cat-dropdown-wrap')) {
        activeCatPopoverTxId = null;
        renderMoneyAllActivePanes();
    }
});

function saveMoneyUiPrefs() {
    if (typeof persistKeysMap === 'function') {
        persistKeysMap({
            'm_tx_limit': String(mTxLimit),
            'm_wish_cats': mWishCategories
        });
    } else {
        localStorage.setItem('m_tx_limit', String(mTxLimit));
        localStorage.setItem('m_wish_cats', JSON.stringify(mWishCategories));
    }
}

function migrateWishlistCategories() {
    if (!Array.isArray(mWishCategories) || mWishCategories.length === 0) {
        mWishCategories = ['General', 'Vestiti', 'Office Supplies', 'Tech'];
    }
    let changed = false;
    (mWishlist || []).forEach(w => {
        if (!w.category || !w.category.trim()) {
            w.category = mWishCategories[0] || 'General';
            changed = true;
        } else if (!mWishCategories.includes(w.category)) {
            mWishCategories.push(w.category);
            changed = true;
        }
    });
    if (changed) {
        saveMoneyData();
        saveMoneyUiPrefs();
    }
}

// Restituisce il sotto-albero Tiling di default quando apri "Money (Full Suite)"
function getSavedOrDefaultMoneySubtree() {
    return makeSplitNode('col', 0.22,
        makePaneNode('m_summary'),
        makeSplitNode('col', 0.42,
            makeSplitNode('row', 0.52, makePaneNode('m_vaults'), makePaneNode('m_chart')),
            makeSplitNode('row', 0.62, makePaneNode('m_tx'), makePaneNode('m_bills'))
        )
    );
}

// ============================================================================
// 1. LOGICA SALVADANAI (VAULTS), CICLI MENSILI E RICORRENZE
// ============================================================================

function buildCycleDateStr(year, monthIndex0, renewalDay) {
    const maxDays = new Date(year, monthIndex0 + 1, 0).getDate();
    const clampedDay = Math.max(1, Math.min(maxDays, parseInt(renewalDay, 10) || 1));
    return formatDate(new Date(year, monthIndex0, clampedDay));
}

function getLatestCycleStartOnOrBeforeToday(renewalDay) {
    const now = getNow();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const rDay = Math.max(1, Math.min(31, parseInt(renewalDay, 10) || 1));

    if (d >= rDay) {
        return buildCycleDateStr(y, m, rDay);
    } else {
        const prevMonthDate = new Date(y, m - 1, 1);
        return buildCycleDateStr(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), rDay);
    }
}

function getNextCycleDateStr(lastCycleDateStr, renewalDay) {
    const parts = (lastCycleDateStr || todayStr).split('-').map(Number);
    const nextMonth = new Date(parts[0], (parts[1] - 1) + 1, 1);
    return buildCycleDateStr(nextMonth.getFullYear(), nextMonth.getMonth(), renewalDay);
}

function processRecurringPayments() {
    const today = getNow();
    today.setHours(0, 0, 0, 0);
    let madeChanges = false;

    mRecurring.forEach(rec => {
        let lastProc = rec.lastProcessed ? parseLocalDate(rec.lastProcessed) : parseLocalDate(rec.startDate);
        let startD = parseLocalDate(rec.startDate);
        let endD = rec.endDate ? parseLocalDate(rec.endDate) : parseLocalDate("2099-12-31");

        if (today >= startD && today <= endD) {
            let checkDate = new Date(lastProc);
            checkDate.setDate(checkDate.getDate() + 1);

            while (checkDate <= today) {
                if (checkDate.getDate() === parseInt(rec.dayOfMonth, 10)) {
                    const amt = roundCurrency(rec.amount);
                    mBalance = roundCurrency(mBalance - amt);
                    mTransactions.push({
                        id: 'mt_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                        date: formatDate(checkDate),
                        desc: `(Auto) ${rec.title}`,
                        category: 'Abbonamenti',
                        amount: amt,
                        type: 'out'
                    });
                    rec.lastProcessed = formatDate(checkDate);
                    madeChanges = true;
                }
                checkDate.setDate(checkDate.getDate() + 1);
            }
        }
    });

    if (madeChanges) saveMoneyData();
}

function processVaultMonthlyRules() {
    let changed = false;

    mVaults.forEach(v => {
        if (v.ruleType === 'monthly_fixed' && parseFloat(v.ruleValue) > 0) {
            const rDay = Math.max(1, Math.min(31, parseInt(v.renewalDay, 10) || 1));
            if (!v.lastCycleDate) {
                v.lastCycleDate = getLatestCycleStartOnOrBeforeToday(rDay);
                changed = true;
            }

            let nextCycleStr = getNextCycleDateStr(v.lastCycleDate, rDay);
            let safetyCounter = 0;

            while (nextCycleStr <= todayStr && safetyCounter < 36) {
                const refillAmt = roundCurrency(v.ruleValue);
                v.balance = roundCurrency((parseFloat(v.balance) || 0) + refillAmt);
                v.lastCycleDate = nextCycleStr;
                nextCycleStr = getNextCycleDateStr(v.lastCycleDate, rDay);
                changed = true;
                safetyCounter++;
            }
        }
    });

    if (changed) saveMoneyData();
}

function applyIncomeVaultRules(incomeAmount) {
    const inc = roundCurrency(incomeAmount);
    if (inc <= 0) return 0;

    let totalAutoSaved = 0;
    mVaults.forEach(v => {
        if (v.ruleType === 'percent_in' && parseFloat(v.ruleValue) > 0) {
            const pct = Math.min(100, Math.max(0, parseFloat(v.ruleValue)));
            const cut = roundCurrency(inc * (pct / 100));
            if (cut > 0) {
                v.balance = roundCurrency((parseFloat(v.balance) || 0) + cut);
                totalAutoSaved = roundCurrency(totalAutoSaved + cut);
            }
        }
    });

    if (totalAutoSaved > 0) saveMoneyData();
    return totalAutoSaved;
}

function findMatchingVaultForExpense(category, description) {
    const catClean = (category || '').trim().toLowerCase();
    const descClean = (description || '').trim().toLowerCase();

    let match = mVaults.find(v => v.name.trim().toLowerCase() === catClean);
    if (match) return match;

    match = mVaults.find(v => {
        const vName = v.name.trim().toLowerCase();
        return vName.length >= 2 && (catClean.includes(vName) || descClean.includes(vName));
    });
    return match || null;
}

function recordExpenseWithVaultCheck({ amount, category, desc, dateStr = todayStr }) {
    const amt = roundCurrency(amount);
    if (amt <= 0) return null;

    let finalCat = (category || 'Generale').trim();
    const matchedVault = findMatchingVaultForExpense(finalCat, desc);

    let linkedVaultId = null;
    let linkedVaultName = null;
    let newVaultBalance = null;

    if (matchedVault) {
        finalCat = matchedVault.name;
        matchedVault.balance = roundCurrency((parseFloat(matchedVault.balance) || 0) - amt);
        linkedVaultId = matchedVault.id;
        linkedVaultName = matchedVault.name;
        newVaultBalance = matchedVault.balance;
    }

    if (!mCategories.includes(finalCat) && finalCat !== 'Entrata') {
        mCategories.push(finalCat);
    }

    mBalance = roundCurrency(mBalance - amt);

    const tx = {
        id: 'mt_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        type: 'out',
        amount: amt,
        category: finalCat,
        desc: (desc || finalCat).trim(),
        date: dateStr,
        vaultId: linkedVaultId,
        vaultName: linkedVaultName
    };

    mTransactions.push(tx);
    saveMoneyData();
    renderMoneyAllActivePanes();

    return { tx, matchedVault, newVaultBalance };
}

function updateTransactionDetails(txId, { newDate, newCategory, newDesc, newAmount }) {
    const t = mTransactions.find(x => x.id === txId);
    if (!t) return false;

    const oldAmt = roundCurrency(t.amount);
    const updatedAmt = roundCurrency(newAmount);
    if (updatedAmt <= 0) return false;

    if (t.type === 'in') {
        mBalance = roundCurrency(mBalance - oldAmt);
    } else {
        mBalance = roundCurrency(mBalance + oldAmt);
        if (t.vaultId) {
            const oldV = mVaults.find(x => x.id === t.vaultId);
            if (oldV) oldV.balance = roundCurrency((parseFloat(oldV.balance) || 0) + oldAmt);
        }
    }

    t.date = newDate || t.date || todayStr;
    t.desc = (newDesc || '').trim() || t.desc;
    t.amount = updatedAmt;

    let cleanCat = (newCategory || '').trim() || (t.type === 'in' ? 'Entrata' : 'Generale');

    if (t.type === 'in') {
        t.category = cleanCat;
        t.vaultId = null;
        t.vaultName = null;
        mBalance = roundCurrency(mBalance + updatedAmt);
    } else {
        const matchedV = findMatchingVaultForExpense(cleanCat, t.desc);
        if (matchedV) {
            cleanCat = matchedV.name;
            matchedV.balance = roundCurrency((parseFloat(matchedV.balance) || 0) - updatedAmt);
            t.vaultId = matchedV.id;
            t.vaultName = matchedV.name;
        } else {
            t.vaultId = null;
            t.vaultName = null;
        }
        t.category = cleanCat;
        if (!mCategories.includes(cleanCat) && cleanCat !== 'Entrata') {
            mCategories.push(cleanCat);
        }
        mBalance = roundCurrency(mBalance - updatedAmt);
    }

    editingTxId = null;
    saveMoneyData();
    renderMoneyAllActivePanes();
    if (typeof showToast === 'function') {
        showToast(`[MONEY] Updated "${t.desc}" (€${updatedAmt.toFixed(2)} · ${t.category})`);
    }
    return true;
}

// ============================================================================
// 2. CALCOLO METRICHE MENSILI, MEDIA GIORNALIERA & STATISTICHE PER CATEGORIA
// ============================================================================

function getMoneyAllocationMetrics() {
    const totalVaultedPositive = roundCurrency(
        mVaults.reduce((acc, v) => {
            const b = parseFloat(v.balance) || 0;
            return acc + (b > 0 ? b : 0);
        }, 0)
    );

    const totalOverbudgetDebt = roundCurrency(
        mVaults.reduce((acc, v) => {
            const b = parseFloat(v.balance) || 0;
            return acc + (b < 0 ? Math.abs(b) : 0);
        }, 0)
    );

    const now = getNow();
    const curDay = Math.max(1, now.getDate());
    const curMonthPrefix = todayStr.slice(0, 7);

    const prevMonthObj = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthPrefix = formatDate(prevMonthObj).slice(0, 7);

    let pendingBills = 0;
    mRecurring.forEach(rec => {
        const recDay = parseInt(rec.dayOfMonth, 10);
        const alreadyPaidThisMonth = rec.lastProcessed && rec.lastProcessed.startsWith(curMonthPrefix);
        const notEnded = !rec.endDate || rec.endDate >= todayStr;
        if (notEnded && !alreadyPaidThisMonth && recDay > curDay) {
            pendingBills = roundCurrency(pendingBills + (parseFloat(rec.amount) || 0));
        }
    });

    let monthIn = 0, monthOut = 0, prevMonthOut = 0, allTimeOut = 0;
    const catStatsMap = {};

    mCategories.forEach(c => {
        catStatsMap[c] = { monthOut: 0, allTimeOut: 0, countMonth: 0, countAll: 0 };
    });

    mTransactions.forEach(t => {
        const amt = roundCurrency(t.amount);
        const isCurMonth = t.date && t.date.startsWith(curMonthPrefix);
        const isPrevMonth = t.date && t.date.startsWith(prevMonthPrefix);

        if (t.type === 'in') {
            if (isCurMonth) monthIn = roundCurrency(monthIn + amt);
        } else {
            allTimeOut = roundCurrency(allTimeOut + amt);
            if (isCurMonth) monthOut = roundCurrency(monthOut + amt);
            if (isPrevMonth) prevMonthOut = roundCurrency(prevMonthOut + amt);

            const cat = (t.category || 'Generale').trim();
            if (!catStatsMap[cat]) {
                catStatsMap[cat] = { monthOut: 0, allTimeOut: 0, countMonth: 0, countAll: 0 };
            }
            catStatsMap[cat].allTimeOut = roundCurrency(catStatsMap[cat].allTimeOut + amt);
            catStatsMap[cat].countAll++;
            if (isCurMonth) {
                catStatsMap[cat].monthOut = roundCurrency(catStatsMap[cat].monthOut + amt);
                catStatsMap[cat].countMonth++;
            }
        }
    });

    const spendable = roundCurrency(mBalance - totalVaultedPositive - pendingBills);
    const avgDailySpend = roundCurrency(monthOut / curDay);

    return {
        total: mBalance,
        vaulted: totalVaultedPositive,
        overbudgetDebt: totalOverbudgetDebt,
        pendingBills: pendingBills,
        spendable: spendable,
        monthIn: monthIn,
        monthOut: monthOut,
        prevMonthOut: prevMonthOut,
        allTimeOut: allTimeOut,
        avgDailySpend: avgDailySpend,
        monthNet: roundCurrency(monthIn - monthOut),
        catStatsMap: catStatsMap
    };
}

function sortMoneyTransactionsInPlace() {
    mTransactions.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '');
        if (dateCmp !== 0) return dateCmp;
        let timeA = parseInt((a.id || '').split('_')[1], 10) || 0;
        let timeB = parseInt((b.id || '').split('_')[1], 10) || 0;
        return timeB - timeA;
    });
}

// Funzione universale che aggiorna tutti i 7 sotto-moduli atomici di Money
function renderMoneyDashboard() {
    renderMoneyAllActivePanes();
}

function renderMoneyAllActivePanes() {
    processVaultMonthlyRules();
    migrateWishlistCategories();
    sortMoneyTransactionsInPlace();

    const metrics = getMoneyAllocationMetrics();

    renderMoneyAtomSummary(metrics);
    renderMoneyAtomVaults();
    renderMoneyAtomChart();
    renderMoneyAtomTransactions();
    renderMoneyAtomBills();
    renderMoneyAtomAnalytics(metrics);
    renderMoneyAtomIncubator();
}

// ============================================================================
// ATOM 1: MONEY: SUMMARY & ACTIONS (#module-m-summary) — UNICO CON BOTTONI AZIONE (3B)
// ============================================================================

function renderMoneyAtomSummary(precomputedMetrics = null) {
    const root = document.getElementById('module-m-summary');
    if (!root) return;

    const metrics = precomputedMetrics || getMoneyAllocationMetrics();
    const netSign = metrics.monthNet >= 0 ? '+' : '';
    const netColor = metrics.monthNet >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:10px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0; flex-wrap:wrap; gap:8px;">
                <div>
                    <span class="section-label">Money Summary</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${todayStr.slice(0, 7)}</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button type="button" class="btn btn-primary btn-sm" onclick="openTransactionModal('in')">[+ IN]</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="openTransactionModal('out')">[- OUT]</button>
                    <button type="button" class="btn btn-sm" onclick="openVaultModal()">[+ VAULT]</button>
                </div>
            </div>

            <div class="balance-cards-row" style="justify-content:space-between; border-top:1px solid var(--border-color); padding-top:10px;">
                <div>
                    <div class="section-label" style="margin-bottom:2px; color:var(--accent-green);">Spendable Free</div>
                    <div class="spendable-balance" style="color:${metrics.spendable < 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">€${metrics.spendable.toFixed(2)}</div>
                </div>
                <div style="border-left:1px solid var(--border-color); padding-left:14px;">
                    <div class="section-label" style="margin-bottom:2px;">Total Balance</div>
                    <div class="hero-balance">€${metrics.total.toFixed(2)}</div>
                </div>
                <div style="border-left:1px solid var(--border-color); padding-left:14px;">
                    <div class="section-label" style="margin-bottom:2px; color:var(--accent-red);">Month Out</div>
                    <div style="font-size:1.15rem; font-weight:bold; color:var(--accent-red); font-variant-numeric:tabular-nums;">-€${metrics.monthOut.toFixed(2)}</div>
                </div>
                <div style="border-left:1px solid var(--border-color); padding-left:14px;">
                    <div class="section-label" style="margin-bottom:2px;">Month Net</div>
                    <div style="font-size:1.15rem; font-weight:bold; color:${netColor}; font-variant-numeric:tabular-nums;">${netSign}€${metrics.monthNet.toFixed(2)}</div>
                </div>
            </div>

            <div style="font-size:0.65rem; color:var(--text-dim); font-variant-numeric:tabular-nums; border-top:1px dotted rgba(255,255,255,0.06); padding-top:6px;">
                LOCKED IN VAULTS: <strong style="color:var(--text-muted);">€${metrics.vaulted.toFixed(2)}</strong> &nbsp;|&nbsp;
                PENDING BILLS: <strong style="color:var(--text-muted);">€${metrics.pendingBills.toFixed(2)}</strong> &nbsp;|&nbsp;
                MONTH IN: <strong style="color:var(--accent-green);">+€${metrics.monthIn.toFixed(2)}</strong>
            </div>
        </div>
    `;
}

// ============================================================================
// ATOM 2: MONEY: VAULTS (#module-m-vaults) — ZERO BOTTONI HEADER (3B)
// ============================================================================

function renderMoneyAtomVaults() {
    const root = document.getElementById('module-m-vaults');
    if (!root) return;

    const totalLocked = roundCurrency(mVaults.reduce((acc, v) => acc + Math.max(0, parseFloat(v.balance) || 0), 0));

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0;">
                <div>
                    <span class="section-label">Vaults &amp; Envelopes</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// €${totalLocked.toFixed(2)}</span>
                </div>
            </div>
            <div id="m-vaults-container" class="vaults-list-horizontal"></div>
        </div>
    `;

    renderVaultsSection(root.querySelector('#m-vaults-container'));
}

// ============================================================================
// ATOM 3: MONEY: CHART (#module-m-chart) — ZERO BOTTONI HEADER (3B)
// ============================================================================

function renderMoneyAtomChart() {
    const root = document.getElementById('module-m-chart');
    if (!root) return;

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:10px; overflow:hidden;">
            <div class="section-header-row" style="margin-bottom:0;">
                <div>
                    <span class="section-label">Balance History</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// 30 TX</span>
                </div>
                <span id="m-chart-hover-info" style="font-size:var(--font-xs); color:var(--text-main); font-weight:bold;"></span>
            </div>
            <div class="money-chart-box" id="m-chart-box" style="flex:1; height:auto; min-height:75px;">
                <div class="chart-meta-top">
                    <span id="m-chart-start">START: €0.00</span>
                    <span id="m-chart-max">MAX: €0.00</span>
                </div>
                <svg id="m-chart-svg" width="100%" height="100%" preserveAspectRatio="none" style="overflow: visible;">
                    <polyline id="m-chart-line" fill="none" stroke="var(--text-main)" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
                </svg>
                <div class="chart-meta-bottom">
                    <span>STEP CURVE</span>
                    <span id="m-chart-min">MIN: €0.00</span>
                </div>
            </div>
        </div>
    `;

    setTimeout(drawSteppedChart, 10);
}

// ============================================================================
// ATOM 4: MONEY: TRANSACTIONS (#module-m-tx) — ZERO BOTTONI +IN/-OUT (3B)
// ============================================================================

function renderMoneyAtomTransactions() {
    const root = document.getElementById('module-m-tx');
    if (!root) return;

    sortMoneyTransactionsInPlace();

    const allFilterCats = ['ALL', ...Array.from(new Set([...mCategories, ...mVaults.map(v => v.name)]))];
    const filterOptsHtml = allFilterCats.map(c => `<option value="${escapeHtml(c)}" ${mTxCategoryFilter === c ? 'selected' : ''}>${c === 'ALL' ? 'All Categories' : c}</option>`).join('');

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0; flex-wrap:wrap; gap:8px;">
                <div>
                    <span class="section-label">Transactions</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${mTxCategoryFilter.toUpperCase()}</span>
                </div>
                <div style="display:flex; gap:4px; align-items:center;">
                    <select id="m-tx-cat-filter" class="form-control form-control-sm" style="width:125px; padding:2px 6px; font-size:0.65rem;">
                        ${filterOptsHtml}
                    </select>
                    <button type="button" class="btn btn-sm ${mTxLimit === 5 ? 'btn-primary' : ''}" style="padding:2px 6px; font-size:0.65rem;" data-lim="5">[5]</button>
                    <button type="button" class="btn btn-sm ${mTxLimit === 15 ? 'btn-primary' : ''}" style="padding:2px 6px; font-size:0.65rem;" data-lim="15">[15]</button>
                    <button type="button" class="btn btn-sm ${mTxLimit >= 9999 ? 'btn-primary' : ''}" style="padding:2px 6px; font-size:0.65rem;" data-lim="9999">[ALL]</button>
                </div>
            </div>
            <div id="m-tx-atom-list" style="display:flex; flex-direction:column; gap:6px;"></div>
        </div>
    `;

    root.querySelector('#m-tx-cat-filter').onchange = (e) => {
        mTxCategoryFilter = e.target.value;
        renderMoneyAtomTransactions();
    };

    root.querySelectorAll('button[data-lim]').forEach(btn => {
        btn.onclick = () => {
            mTxLimit = parseInt(btn.dataset.lim, 10);
            saveMoneyUiPrefs();
            renderMoneyAtomTransactions();
        };
    });

    const listEl = root.querySelector('#m-tx-atom-list');
    const filteredTx = mTransactions.filter(t => {
        if (mTxCategoryFilter === 'ALL') return true;
        return (t.category || 'Generale').toLowerCase() === mTxCategoryFilter.toLowerCase();
    });

    if (filteredTx.length === 0) {
        listEl.innerHTML = '<div class="empty-state">[ NO TRANSACTIONS ]</div>';
    } else {
        filteredTx.slice(0, mTxLimit).forEach(t => {
            listEl.appendChild(buildTransactionRowDom(t));
        });
    }
}

// ============================================================================
// ATOM 5: MONEY: BILLS (#module-m-bills)
// ============================================================================

function renderMoneyAtomBills() {
    const root = document.getElementById('module-m-bills');
    if (!root) return;

    const totalMonthlyFixed = roundCurrency(mRecurring.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0));

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0;">
                <div>
                    <span class="section-label">Fixed Bills</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// €${totalMonthlyFixed.toFixed(2)}/MO</span>
                </div>
                <button type="button" class="icon-btn" onclick="openRecurringModal()" title="Add recurring bill">[+]</button>
            </div>
            <div id="m-recurring-container" style="display:flex; flex-direction:column; gap:6px;"></div>
        </div>
    `;

    const recCont = root.querySelector('#m-recurring-container');
    if (mRecurring.length === 0) {
        recCont.innerHTML = '<div class="empty-state">[ NONE ]</div>';
    } else {
        mRecurring.forEach(r => {
            const absAmount = Math.abs(parseFloat(r.amount)).toFixed(2);
            const row = document.createElement('div');
            row.className = 'm-item-row';
            row.style.borderLeftColor = '#888';
            row.innerHTML = `
                <div>
                    <div class="m-title">${escapeHtml(r.title)}</div>
                    <div class="m-sub">DAY ${escapeHtml(r.dayOfMonth)} | END: ${escapeHtml(r.endDate || 'NEVER')}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="m-amt neg">-€${absAmount}</div>
                    <div class="m-row-hover-tools">
                        <button type="button" class="icon-btn delete" title="Delete">[×]</button>
                    </div>
                </div>
            `;
            row.querySelector('.delete').onclick = () => deleteRecurring(r.id);
            recCont.appendChild(row);
        });
    }
}

// ============================================================================
// ATOM 6: MONEY: ANALYTICS & CATS (#module-m-analytics)
// ============================================================================

function renderMoneyAtomAnalytics(precomputedMetrics = null) {
    const root = document.getElementById('module-m-analytics');
    if (!root) return;

    const metrics = precomputedMetrics || getMoneyAllocationMetrics();
    const deltaPrev = roundCurrency(metrics.monthOut - metrics.prevMonthOut);
    const deltaSign = deltaPrev > 0 ? '+' : '';
    const deltaColor = deltaPrev > 0 ? 'var(--accent-red)' : 'var(--accent-green)';

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0;">
                <div>
                    <span class="section-label">Analytics &amp; Categories</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${mCategories.length} CATS</span>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;">
                <div class="cfg-box" style="margin:0; padding:8px 10px;">
                    <div style="font-size:0.62rem; color:var(--text-dim);">THIS MONTH OUT</div>
                    <div style="font-size:var(--font-md); font-weight:bold; color:var(--accent-red); margin-top:2px; font-variant-numeric:tabular-nums;">€${metrics.monthOut.toFixed(2)}</div>
                </div>
                <div class="cfg-box" style="margin:0; padding:8px 10px;">
                    <div style="font-size:0.62rem; color:var(--text-dim);">VS LAST MO (€${metrics.prevMonthOut.toFixed(0)})</div>
                    <div style="font-size:var(--font-md); font-weight:bold; color:${deltaColor}; margin-top:2px; font-variant-numeric:tabular-nums;">${deltaSign}€${deltaPrev.toFixed(2)}</div>
                </div>
                <div class="cfg-box" style="margin:0; padding:8px 10px;">
                    <div style="font-size:0.62rem; color:var(--text-dim);">DAILY AVG</div>
                    <div style="font-size:var(--font-md); font-weight:bold; color:var(--text-main); margin-top:2px; font-variant-numeric:tabular-nums;">€${metrics.avgDailySpend.toFixed(2)}/d</div>
                </div>
                <div class="cfg-box" style="margin:0; padding:8px 10px;">
                    <div style="font-size:0.62rem; color:var(--text-dim);">ALL-TIME OUT</div>
                    <div style="font-size:var(--font-md); font-weight:bold; color:var(--text-muted); margin-top:2px; font-variant-numeric:tabular-nums;">€${metrics.allTimeOut.toFixed(2)}</div>
                </div>
            </div>

            <div style="display:flex; gap:6px;">
                <input type="text" id="m-new-cat-inp" class="form-control form-control-sm" style="flex:1;" placeholder="+ Create new expense category (Enter)...">
            </div>

            <div id="m-cat-breakdown-list" style="display:flex; flex-direction:column; gap:6px;"></div>
        </div>
    `;

    const newCatInp = root.querySelector('#m-new-cat-inp');
    newCatInp.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCustomExpenseCategory(newCatInp.value);
        }
    };

    const listEl = root.querySelector('#m-cat-breakdown-list');
    const entries = Object.entries(metrics.catStatsMap)
        .sort((a, b) => b[1].monthOut - a[1].monthOut || b[1].allTimeOut - a[1].allTimeOut);

    const maxMonthCat = Math.max(...entries.map(e => e[1].monthOut), 1);

    entries.forEach(([catName, st]) => {
        const pctOfMonth = metrics.monthOut > 0 ? Math.round((st.monthOut / metrics.monthOut) * 100) : 0;
        const barWidth = st.monthOut > 0 ? Math.max(4, Math.round((st.monthOut / maxMonthCat) * 100)) : 0;

        const row = document.createElement('div');
        row.className = 'm-cat-stat-row';

        row.innerHTML = `
            <div style="cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" class="cat-jump-trigger" title="Click to filter Transactions by ${escapeHtml(catName)}">
                <strong style="color:var(--text-main); text-transform:uppercase;">${escapeHtml(catName)}</strong>
                <div style="font-size:0.6rem; color:var(--text-dim);">${st.countMonth} tx (${pctOfMonth}%)</div>
            </div>
            <div style="height:6px; background:#111; border:1px solid #2a2a2a; position:relative; overflow:hidden;">
                <div style="height:100%; width:${barWidth}%; background:var(--text-main);"></div>
            </div>
            <div style="text-align:right; font-variant-numeric:tabular-nums;">
                <strong style="color:${st.monthOut > 0 ? 'var(--text-main)' : 'var(--text-dim)'};">€${st.monthOut.toFixed(2)}</strong>
                <span style="color:var(--text-dim); font-size:0.62rem;"> / €${st.allTimeOut.toFixed(0)}</span>
            </div>
            <div style="display:flex; gap:4px;">
                <button type="button" class="icon-btn btn-ren-cat" title="Rename category">[✎]</button>
                <button type="button" class="icon-btn delete btn-del-cat" title="Delete category">[×]</button>
            </div>
        `;

        row.querySelector('.cat-jump-trigger').onclick = () => {
            mTxCategoryFilter = catName;
            renderMoneyAtomTransactions();
            if (typeof showToast === 'function') showToast(`[FILTER] Transactions filtered by "${catName}"`);
        };

        row.querySelector('.btn-ren-cat').onclick = () => {
            row.innerHTML = `
                <input type="text" class="form-control form-control-sm ren-cat-inp" value="${escapeHtml(catName)}" style="grid-column: 1 / 3;">
                <div style="grid-column: 3 / 5; display:flex; justify-content:flex-end; gap:6px;">
                    <button type="button" class="btn btn-primary btn-sm btn-save-ren">[SAVE]</button>
                    <button type="button" class="btn btn-sm btn-cancel-ren">[ESC]</button>
                </div>
            `;
            const inp = row.querySelector('.ren-cat-inp');
            inp.focus();
            row.querySelector('.btn-save-ren').onclick = () => renameExpenseCategoryEverywhere(catName, inp.value);
            row.querySelector('.btn-cancel-ren').onclick = () => renderMoneyAtomAnalytics();
            inp.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); renameExpenseCategoryEverywhere(catName, inp.value); }
                else if (e.key === 'Escape') { e.preventDefault(); renderMoneyAtomAnalytics(); }
            };
        };

        row.querySelector('.btn-del-cat').onclick = () => deleteExpenseCategory(catName);
        listEl.appendChild(row);
    });
}

// ============================================================================
// ATOM 7: MONEY: INCUBATOR (#module-m-incubator) — MOSAICO STILE TASKS
// ============================================================================

function renderMoneyAtomIncubator() {
    const root = document.getElementById('module-m-incubator');
    if (!root) return;

    migrateWishlistCategories();
    const totalEstimated = roundCurrency(
        mWishlist.reduce((acc, w) => acc + (parseFloat(w.cost) > 0 ? parseFloat(w.cost) : 0), 0)
    );

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0; flex-wrap:wrap; gap:8px;">
                <div>
                    <span class="section-label">Purchase Incubator</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// EST €${totalEstimated.toFixed(2)}</span>
                </div>
                <input type="text" id="m-new-wish-cat-inp" class="form-control form-control-sm" style="width:170px;" placeholder="+ New category (Enter)...">
            </div>
            <div id="m-incubator-masonry" class="daily-columns-wrap" style="align-items:flex-start;"></div>
        </div>
    `;

    const newCatInp = root.querySelector('#m-new-wish-cat-inp');
    newCatInp.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addWishCategory(newCatInp.value);
        }
    };

    const masonryWrap = root.querySelector('#m-incubator-masonry');
    const colLeft = document.createElement('div');
    colLeft.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column; gap:14px;';
    const colRight = document.createElement('div');
    colRight.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column; gap:14px;';

    mWishCategories.forEach((catName, cIdx) => {
        const itemsInCat = mWishlist.filter(w => (w.category || 'General') === catName);
        const catSum = roundCurrency(itemsInCat.reduce((acc, w) => acc + (parseFloat(w.cost) > 0 ? parseFloat(w.cost) : 0), 0));

        const groupDiv = document.createElement('div');
        groupDiv.className = 'category-group';
        groupDiv.style.marginBottom = '0';

        const headerWrap = document.createElement('div');
        headerWrap.className = 'category-header-wrap';
        headerWrap.innerHTML = `
            <div class="category-title">${escapeHtml(catName)}</div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.65rem; color:var(--text-dim); font-variant-numeric:tabular-nums;">${catSum > 0 ? '€' + catSum.toFixed(2) : ''}</span>
                <div class="action-btns">
                    <button type="button" class="icon-btn delete btn-del-wcat" title="Delete category">[×]</button>
                </div>
            </div>
        `;
        headerWrap.querySelector('.btn-del-wcat').onclick = () => deleteWishCategory(catName);
        groupDiv.appendChild(headerWrap);

        const itemsList = document.createElement('div');
        itemsList.style.cssText = 'display:flex; flex-direction:column;';

        if (itemsInCat.length === 0) {
            itemsList.innerHTML = `<div class="empty-state" style="padding:4px 0;">[ EMPTY ]</div>`;
        } else {
            itemsInCat.forEach(w => {
                itemsList.appendChild(buildWishItemRowDom(w));
            });
        }
        groupDiv.appendChild(itemsList);

        const quickAddWrap = document.createElement('div');
        quickAddWrap.className = 'quick-add-task';
        quickAddWrap.style.paddingBottom = '2px';
        quickAddWrap.innerHTML = `<span>+</span><input type="text" placeholder="Add to ${escapeHtml(catName)} (e.g. 'Item 25' or 'Item')...">`;
        const qInp = quickAddWrap.querySelector('input');
        qInp.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const parsed = parseQuickWishInput(qInp.value);
                if (!parsed) return;
                mWishlist.push({
                    id: 'mw_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                    category: catName,
                    title: parsed.title,
                    cost: parsed.cost,
                    order: mWishlist.length
                });
                saveMoneyData();
                renderMoneyAtomIncubator();
            }
        };
        groupDiv.appendChild(quickAddWrap);

        if (cIdx % 2 === 0) colLeft.appendChild(groupDiv);
        else colRight.appendChild(groupDiv);
    });

    masonryWrap.appendChild(colLeft);
    masonryWrap.appendChild(colRight);
}

// ============================================================================
// COMPONENTI CONDIVISI: RIGA TRANSAZIONE (CON BADGE DROPDOWN), WISH ROW, VAULTS & CHART
// ============================================================================

function buildTransactionRowDom(t) {
    const isOut = t.type === 'out';
    const absAmount = Math.abs(parseFloat(t.amount)).toFixed(2);
    const catLabel = t.category || (isOut ? 'Generale' : 'Entrata');

    const row = document.createElement('div');
    row.className = `m-item-row ${isOut ? 'out' : 'in'}`;

    if (editingTxId === t.id) {
        const allCatOpts = Array.from(new Set([
            ...(isOut ? [] : ['Entrata']),
            ...mVaults.map(v => v.name),
            ...mCategories,
            catLabel
        ]));

        row.style.cssText = 'flex-direction:column; align-items:stretch; gap:8px; padding:10px; border-color:var(--text-main); background:#080808;';
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.65rem; color:var(--text-dim);">
                <strong>EDIT TRANSACTION (${isOut ? 'EXPENSE' : 'INCOME'})</strong>
                <span>[ENTER] SAVE · [ESC] CANCEL</span>
            </div>
            <div style="display:grid; grid-template-columns: 120px 140px 1fr 90px; gap:6px;">
                <input type="date" class="form-control form-control-sm edit-tx-date" value="${escapeHtml(t.date || todayStr)}">
                <select class="form-control form-control-sm edit-tx-cat">
                    ${allCatOpts.map(c => `<option value="${escapeHtml(c)}" ${c.toLowerCase() === catLabel.toLowerCase() ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                </select>
                <input type="text" class="form-control form-control-sm edit-tx-desc" value="${escapeHtml(t.desc)}" placeholder="Description...">
                <input type="number" step="0.01" class="form-control form-control-sm no-spinners edit-tx-amt" value="${absAmount}" placeholder="€">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:6px;">
                <button type="button" class="btn btn-sm btn-cancel-tx">[CANCEL]</button>
                <button type="button" class="btn btn-primary btn-sm btn-save-tx">[SAVE CHANGES]</button>
            </div>
        `;

        const commit = () => {
            updateTransactionDetails(t.id, {
                newDate: row.querySelector('.edit-tx-date').value,
                newCategory: row.querySelector('.edit-tx-cat').value,
                newDesc: row.querySelector('.edit-tx-desc').value,
                newAmount: row.querySelector('.edit-tx-amt').value
            });
        };

        row.querySelector('.btn-save-tx').onclick = commit;
        row.querySelector('.btn-cancel-tx').onclick = () => {
            editingTxId = null;
            renderMoneyAtomTransactions();
        };
        row.querySelectorAll('input, select').forEach(inp => {
            inp.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                else if (e.key === 'Escape') { e.preventDefault(); editingTxId = null; renderMoneyAtomTransactions(); }
            };
        });
        return row;
    }

    const isPopoverOpen = (activeCatPopoverTxId === t.id);
    const badgeClass = t.vaultName ? 'm-vault-linked-badge' : 'm-cat-badge';
    const badgeText = t.vaultName ? `VAULT: ${t.vaultName} ▼` : `${catLabel} ▼`;

    row.title = 'Double-click row to edit date, description or amount';
    row.ondblclick = (e) => {
        if (e.target.closest('.m-cat-dropdown-wrap')) return;
        editingTxId = t.id;
        renderMoneyAtomTransactions();
    };

    row.innerHTML = `
        <div style="min-width:0; flex:1;">
            <div class="m-title" style="display:flex; align-items:center; flex-wrap:wrap; gap:2px;">
                <div class="m-cat-dropdown-wrap">
                    <span class="${badgeClass}" style="cursor:pointer;" title="Click to change, add or remove categories">${escapeHtml(badgeText)}</span>
                </div>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.desc)}</span>
            </div>
            <div class="m-sub">${escapeHtml(t.date)}</div>
        </div>
        <div style="display:flex; align-items:center;">
            <div class="m-amt ${isOut ? 'neg' : 'pos'}">${isOut ? '-' : '+'}€${absAmount}</div>
            <div class="m-row-hover-tools">
                <button type="button" class="icon-btn btn-edit-tx" title="Edit date or amount">[✎]</button>
                <button type="button" class="icon-btn delete btn-del-tx" title="Delete transaction">[×]</button>
            </div>
        </div>
    `;

    const dropWrap = row.querySelector('.m-cat-dropdown-wrap');
    const badgeSpan = dropWrap.querySelector('span');

    badgeSpan.onclick = (e) => {
        e.stopPropagation();
        activeCatPopoverTxId = isPopoverOpen ? null : t.id;
        renderMoneyAtomTransactions();
    };

    if (isPopoverOpen) {
        const popover = document.createElement('div');
        popover.className = 'm-cat-popover';
        popover.onclick = (e) => e.stopPropagation();

        const listEl = document.createElement('div');
        listEl.className = 'm-cat-popover-list';

        const protectedCats = ['Generale', 'Entrata', 'Tasse Uni'];
        const allItems = Array.from(new Set([
            ...(isOut ? [] : ['Entrata']),
            ...mVaults.map(v => v.name),
            ...mCategories
        ]));

        allItems.forEach(cName => {
            const isVault = mVaults.some(v => v.name.toLowerCase() === cName.toLowerCase());
            const isCurrent = cName.toLowerCase() === catLabel.toLowerCase();

            const itemRow = document.createElement('div');
            itemRow.className = `m-cat-popover-item ${isCurrent ? 'active' : ''}`;

            const labelSpan = document.createElement('span');
            labelSpan.style.flex = '1';
            labelSpan.textContent = isVault ? `[VAULT] ${cName}` : cName;
            labelSpan.onclick = () => {
                activeCatPopoverTxId = null;
                updateTransactionDetails(t.id, {
                    newDate: t.date,
                    newCategory: cName,
                    newDesc: t.desc,
                    newAmount: t.amount
                });
            };
            itemRow.appendChild(labelSpan);

            if (!isVault && !protectedCats.includes(cName)) {
                const delCatBtn = document.createElement('button');
                delCatBtn.type = 'button';
                delCatBtn.className = 'icon-btn delete';
                delCatBtn.style.cssText = 'font-size:0.65rem; padding:0 4px;';
                delCatBtn.textContent = '[×]';
                delCatBtn.title = `Delete category "${cName}"`;
                delCatBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    mCategories = mCategories.filter(x => x !== cName);
                    mTransactions.forEach(tx => {
                        if (tx.category === cName) tx.category = isOut ? 'Generale' : 'Entrata';
                    });
                    saveMoneyData();
                    renderMoneyAllActivePanes();
                };
                itemRow.appendChild(delCatBtn);
            }

            listEl.appendChild(itemRow);
        });

        popover.appendChild(listEl);

        const addBox = document.createElement('div');
        addBox.className = 'm-cat-popover-add';
        addBox.innerHTML = `
            <input type="text" class="form-control form-control-sm new-pop-cat-inp" placeholder="+ New category..." style="padding:3px 6px; font-size:0.65rem;">
            <button type="button" class="btn btn-primary btn-sm btn-pop-cat-add" style="padding:2px 6px;">[+]</button>
        `;

        const newInp = addBox.querySelector('.new-pop-cat-inp');
        const addBtn = addBox.querySelector('.btn-pop-cat-add');

        const createAndAssignCat = () => {
            const val = newInp.value.trim();
            if (!val) return;
            if (!mCategories.some(c => c.toLowerCase() === val.toLowerCase())) {
                mCategories.push(val);
            }
            activeCatPopoverTxId = null;
            updateTransactionDetails(t.id, {
                newDate: t.date,
                newCategory: val,
                newDesc: t.desc,
                newAmount: t.amount
            });
        };

        addBtn.onclick = createAndAssignCat;
        newInp.onkeydown = (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                createAndAssignCat();
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                activeCatPopoverTxId = null;
                renderMoneyAtomTransactions();
            }
        };

        popover.appendChild(addBox);
        dropWrap.appendChild(popover);
        setTimeout(() => newInp.focus(), 15);
    }

    row.querySelector('.btn-edit-tx').onclick = (e) => {
        e.stopPropagation();
        editingTxId = t.id;
        renderMoneyAtomTransactions();
    };
    row.querySelector('.btn-del-tx').onclick = (e) => {
        e.stopPropagation();
        deleteTransaction(t.id);
    };

    return row;
}

function addCustomExpenseCategory(catName) {
    const clean = (catName || '').trim();
    if (!clean) return;
    if (!mCategories.some(c => c.toLowerCase() === clean.toLowerCase())) {
        mCategories.push(clean);
        saveMoneyData();
        renderMoneyAllActivePanes();
        if (typeof showToast === 'function') showToast(`[CATEGORIES] Created "${clean}"`);
    }
}

function renameExpenseCategoryEverywhere(oldName, newNameRaw) {
    const cleanNew = (newNameRaw || '').trim();
    if (!cleanNew || cleanNew === oldName) return;

    const idx = mCategories.indexOf(oldName);
    if (idx !== -1) {
        if (mCategories.includes(cleanNew)) mCategories.splice(idx, 1);
        else mCategories[idx] = cleanNew;
    } else if (!mCategories.includes(cleanNew)) {
        mCategories.push(cleanNew);
    }

    mTransactions.forEach(t => {
        if ((t.category || '').toLowerCase() === oldName.toLowerCase()) {
            t.category = cleanNew;
        }
    });

    if (mTxCategoryFilter === oldName) mTxCategoryFilter = cleanNew;
    saveMoneyData();
    renderMoneyAllActivePanes();
    if (typeof showToast === 'function') showToast(`[CATEGORIES] Renamed "${oldName}" ➔ "${cleanNew}"`);
}

function deleteExpenseCategory(catName) {
    if (catName === 'Generale' || catName === 'Tasse Uni') {
        if (typeof showToast === 'function') showToast(`[SYSTEM] "${catName}" is a core category`);
        return;
    }
    mCategories = mCategories.filter(c => c !== catName);
    mTransactions.forEach(t => {
        if (t.category === catName) t.category = 'Generale';
    });
    if (mTxCategoryFilter === catName) mTxCategoryFilter = 'ALL';
    saveMoneyData();
    renderMoneyAllActivePanes();
    if (typeof showToast === 'function') showToast(`[CATEGORIES] Deleted "${catName}"`);
}

function addWishCategory(catNameRaw) {
    const clean = (catNameRaw || '').trim();
    if (!clean) return;
    if (!mWishCategories.includes(clean)) {
        mWishCategories.push(clean);
        saveMoneyUiPrefs();
        renderMoneyAtomIncubator();
    }
}

function deleteWishCategory(catName) {
    mWishCategories = mWishCategories.filter(c => c !== catName);
    mWishlist = mWishlist.filter(w => w.category !== catName);
    saveMoneyData();
    saveMoneyUiPrefs();
    renderMoneyAtomIncubator();
}

function parseQuickWishInput(rawStr) {
    const str = (rawStr || '').trim();
    if (!str) return null;
    const m = str.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*€?$/);
    if (m && m[1].trim()) {
        return {
            title: m[1].trim(),
            cost: roundCurrency(m[2].replace(',', '.'))
        };
    }
    return { title: str, cost: '' };
}

function buildWishItemRowDom(w) {
    const row = document.createElement('div');
    row.className = 'task-item';

    const hasCost = w.cost !== '' && w.cost !== null && parseFloat(w.cost) > 0;
    const costVal = hasCost ? roundCurrency(w.cost) : '';

    if (editingWishId === w.id) {
        row.style.cssText = 'flex-direction:column; align-items:stretch; gap:6px; padding:8px; background:#080808; border:1px solid var(--text-main);';
        const catOpts = mWishCategories.map(c => `<option value="${escapeHtml(c)}" ${w.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
        row.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 80px 110px; gap:6px;">
                <input type="text" class="form-control form-control-sm edit-w-title" value="${escapeHtml(w.title)}" placeholder="Item name...">
                <input type="number" step="0.01" class="form-control form-control-sm no-spinners edit-w-cost" value="${costVal}" placeholder="€ Price">
                <select class="form-control form-control-sm edit-w-cat">${catOpts}</select>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:6px;">
                <button type="button" class="btn btn-sm btn-w-cancel">[ESC]</button>
                <button type="button" class="btn btn-primary btn-sm btn-w-save">[SAVE]</button>
            </div>
        `;

        const commitWish = () => {
            const newTitle = row.querySelector('.edit-w-title').value.trim();
            const rawPrice = row.querySelector('.edit-w-cost').value;
            const newCat = row.querySelector('.edit-w-cat').value;
            if (newTitle) w.title = newTitle;
            w.cost = (rawPrice !== '' && parseFloat(rawPrice) > 0) ? roundCurrency(rawPrice) : '';
            w.category = newCat || w.category || 'General';
            editingWishId = null;
            saveMoneyData();
            renderMoneyAtomIncubator();
        };

        row.querySelector('.btn-w-save').onclick = commitWish;
        row.querySelector('.btn-w-cancel').onclick = () => { editingWishId = null; renderMoneyAtomIncubator(); };
        row.querySelectorAll('input').forEach(inp => {
            inp.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitWish(); }
                else if (e.key === 'Escape') { e.preventDefault(); editingWishId = null; renderMoneyAtomIncubator(); }
            };
        });
        setTimeout(() => row.querySelector('.edit-w-title')?.focus(), 10);
        return row;
    }

    if (buyingInlineWishId === w.id) {
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:6px; padding:6px 8px; background:#080808; border:1px solid var(--accent-green);';
        row.innerHTML = `
            <span style="font-size:var(--font-xs); color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Buy <strong>${escapeHtml(w.title)}</strong>:</span>
            <div style="display:flex; gap:4px; align-items:center;">
                <input type="number" step="0.01" class="form-control form-control-sm no-spinners inline-buy-price" style="width:75px;" placeholder="€ Price" value="${costVal}">
                <button type="button" class="btn btn-primary btn-sm btn-confirm-buy">[✓]</button>
                <button type="button" class="btn btn-sm btn-cancel-buy">[×]</button>
            </div>
        `;
        const priceInp = row.querySelector('.inline-buy-price');
        const confirmBuy = () => {
            const p = roundCurrency(priceInp.value);
            if (p <= 0) { priceInp.focus(); return; }
            buyingInlineWishId = null;
            executeWishPurchase(w.id, p);
        };
        row.querySelector('.btn-confirm-buy').onclick = confirmBuy;
        row.querySelector('.btn-cancel-buy').onclick = () => { buyingInlineWishId = null; renderMoneyAtomIncubator(); };
        priceInp.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmBuy(); }
            else if (e.key === 'Escape') { e.preventDefault(); buyingInlineWishId = null; renderMoneyAtomIncubator(); }
        };
        setTimeout(() => priceInp.focus(), 10);
        return row;
    }

    const costDisplay = hasCost ? `€${costVal.toFixed(2)}` : '+ €';
    row.title = 'Double-click to edit name, price or category';
    row.ondblclick = () => {
        editingWishId = w.id;
        renderMoneyAtomIncubator();
    };

    row.innerHTML = `
        <div class="task-left">
            <div class="task-title">${escapeHtml(w.title)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
            <span class="wish-price-badge" style="font-size:var(--font-xs); color:${hasCost ? 'var(--text-main)' : 'var(--text-dim)'}; font-weight:${hasCost ? 'bold' : 'normal'}; font-variant-numeric:tabular-nums; cursor:pointer;" title="Click to set or edit price">${costDisplay}</span>
            <div class="m-row-hover-tools">
                <button type="button" class="icon-btn btn-wish-buy" style="color:var(--accent-green);" title="Mark as purchased & log expense">[✓]</button>
                <button type="button" class="icon-btn btn-wish-edit" title="Edit name, price or category">[✎]</button>
                <button type="button" class="icon-btn delete btn-wish-del" title="Delete idea">[×]</button>
            </div>
        </div>
    `;

    row.querySelector('.wish-price-badge').onclick = (e) => {
        e.stopPropagation();
        editingWishId = w.id;
        renderMoneyAtomIncubator();
    };
    row.querySelector('.btn-wish-edit').onclick = (e) => {
        e.stopPropagation();
        editingWishId = w.id;
        renderMoneyAtomIncubator();
    };
    row.querySelector('.btn-wish-buy').onclick = (e) => {
        e.stopPropagation();
        purchaseIdea(w.id);
    };
    row.querySelector('.btn-wish-del').onclick = (e) => {
        e.stopPropagation();
        deleteWish(w.id);
    };

    return row;
}

function executeWishPurchase(id, finalCost) {
    const w = mWishlist.find(x => x.id === id);
    if (!w) return;
    const cat = w.category && w.category !== 'General' ? w.category : 'Generale';
    recordExpenseWithVaultCheck({
        amount: finalCost,
        category: cat,
        desc: w.title,
        dateStr: todayStr
    });
    deleteWish(id);
    if (typeof showToast === 'function') {
        showToast(`[PURCHASED] "${w.title}" (-€${finalCost.toFixed(2)} in ${cat})`);
    }
}

function purchaseIdea(id) {
    const w = mWishlist.find(x => x.id === id);
    if (!w) return;
    const cost = roundCurrency(w.cost);
    if (cost > 0) {
        executeWishPurchase(id, cost);
    } else {
        buyingInlineWishId = id;
        renderMoneyAtomIncubator();
    }
}

function renderVaultsSection(targetContainer = null) {
    const cont = targetContainer || document.getElementById('m-vaults-container');
    if (!cont) return;
    cont.innerHTML = '';

    if (mVaults.length === 0) {
        cont.innerHTML = '<div class="empty-state">[ NO VAULTS CREATED ]</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    mVaults.forEach(v => {
        const bal = roundCurrency(v.balance);
        const isNegative = bal < 0;
        const cap = roundCurrency(v.target || v.ruleValue || 0);
        const pct = cap > 0 ? Math.max(0, Math.min(100, Math.round((bal / cap) * 100))) : 100;

        const rDay = parseInt(v.renewalDay, 10) || 1;
        let ruleText = 'MANUAL VAULT';
        let nextRenewalPreview = '';

        if (v.ruleType === 'monthly_fixed' && v.ruleValue > 0) {
            const refill = roundCurrency(v.ruleValue);
            const projectedNext = roundCurrency(bal + refill);
            ruleText = `+€${refill.toFixed(2)} EVERY DAY ${rDay}`;
            if (isNegative) {
                nextRenewalPreview = ` · NEXT CYCLE: €${projectedNext.toFixed(2)}`;
            }
        } else if (v.ruleType === 'percent_in' && v.ruleValue > 0) {
            ruleText = `AUTO: +${v.ruleValue}% OF INCOME`;
        }

        const row = document.createElement('div');
        row.className = `vault-envelope-row ${isNegative ? 'overbudget' : ''}`;

        const signStr = isNegative ? `-€${Math.abs(bal).toFixed(2)} [OVERBUDGET]` : `€${bal.toFixed(2)}`;
        const capStr = cap > 0 ? `/ €${cap.toFixed(2)} (${isNegative ? '0%' : pct + '%'})` : '';

        row.innerHTML = `
            <div class="vault-env-top">
                <div class="vault-env-title-wrap">
                    <span class="vault-name">${escapeHtml(v.name)}</span>
                    <span class="vault-rule-badge">${escapeHtml(ruleText + nextRenewalPreview)}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="vault-env-numbers">
                        <span class="vault-val ${isNegative ? 'neg' : ''}">${signStr}</span>
                        <span class="vault-target">${capStr}</span>
                    </div>
                    <div class="vault-actions" style="display:flex; gap:4px;"></div>
                </div>
            </div>
            <div class="vault-progress-track">
                <div class="vault-progress-fill ${isNegative ? 'overbudget' : ''}" style="width:${pct}%;"></div>
            </div>
        `;

        const actBox = row.querySelector('.vault-actions');

        const btnSpend = document.createElement('button');
        btnSpend.className = 'btn btn-danger btn-sm';
        btnSpend.style.padding = '2px 6px';
        btnSpend.textContent = '[- SPEND]';
        btnSpend.onclick = () => openTransactionModal('out', v.name);

        const btnAdd = document.createElement('button');
        btnAdd.className = 'btn btn-sm';
        btnAdd.style.padding = '2px 6px';
        btnAdd.textContent = '[+]';
        btnAdd.onclick = () => openVaultTransferModal(v.id, 'in');

        const btnEdit = document.createElement('button');
        btnEdit.className = 'icon-btn';
        btnEdit.textContent = '[✎]';
        btnEdit.onclick = () => openVaultModal(v.id);

        const btnDel = document.createElement('button');
        btnDel.className = 'icon-btn delete';
        btnDel.textContent = '[×]';
        btnDel.onclick = () => deleteVault(v.id);

        actBox.appendChild(btnSpend);
        actBox.appendChild(btnAdd);
        actBox.appendChild(btnEdit);
        actBox.appendChild(btnDel);

        frag.appendChild(row);
    });

    cont.appendChild(frag);
}

function drawSteppedChart() {
    const svg = document.getElementById('m-chart-svg');
    const polyline = document.getElementById('m-chart-line');
    if (!svg || !polyline) return;

    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');

    let sortedT = [...mTransactions].sort((a, b) => {
        const dCmp = (a.date || '').localeCompare(b.date || '');
        if (dCmp !== 0) return dCmp;
        let timeA = parseInt((a.id || '').split('_')[1], 10) || 0;
        let timeB = parseInt((b.id || '').split('_')[1], 10) || 0;
        return timeA - timeB;
    });

    const maxTrans = 30;
    let displayTrans = sortedT.slice(-maxTrans);

    let startBal = mBalance;
    for (let i = displayTrans.length - 1; i >= 0; i--) {
        let t = displayTrans[i];
        if (t.type === 'in') startBal = roundCurrency(startBal - parseFloat(t.amount));
        else startBal = roundCurrency(startBal + parseFloat(t.amount));
    }

    let historyPoints = [];
    currentChartStepData = [];
    let currentBal = startBal;

    historyPoints.push(currentBal);
    currentChartStepData.push({
        balance: currentBal,
        label: `INITIAL: €${currentBal.toFixed(2)}`
    });

    displayTrans.forEach(t => {
        const amt = roundCurrency(t.amount);
        if (t.type === 'in') currentBal = roundCurrency(currentBal + amt);
        else currentBal = roundCurrency(currentBal - amt);
        historyPoints.push(currentBal);
        const catTag = t.category ? `[${t.category}] ` : '';
        currentChartStepData.push({
            balance: currentBal,
            label: `${t.date} // ${catTag}${t.desc} (${t.type === 'in' ? '+' : '-'}€${amt.toFixed(2)}) -> €${currentBal.toFixed(2)}`
        });
    });

    const maxBal = Math.max(...historyPoints);
    const minBal = Math.min(...historyPoints);

    const maxEl = document.getElementById('m-chart-max');
    const minEl = document.getElementById('m-chart-min');
    const startEl = document.getElementById('m-chart-start');
    if (maxEl) maxEl.textContent = `MAX: €${maxBal.toFixed(2)}`;
    if (minEl) minEl.textContent = `MIN: €${minBal.toFixed(2)}`;
    if (startEl) startEl.textContent = `START: €${startBal.toFixed(2)}`;

    let rawRange = maxBal - minBal;
    if (rawRange === 0) rawRange = 1;

    const padding = rawRange * 0.05;
    const paddedMax = maxBal + padding;
    const paddedMin = minBal - padding;
    const paddedRange = paddedMax - paddedMin;

    let pointsStr = "";
    const width = 1000, height = 1000;
    const stepWidth = width / maxTrans;
    const xOffset = width - ((historyPoints.length - 1) * stepWidth);

    for (let i = 0; i < historyPoints.length; i++) {
        let x = xOffset + (i * stepWidth);
        let y = height - (((historyPoints[i] - paddedMin) / paddedRange) * height);

        if (i === 0) {
            pointsStr += `${x},${y} `;
        } else {
            let prevY = height - (((historyPoints[i - 1] - paddedMin) / paddedRange) * height);
            pointsStr += `${x},${prevY} ${x},${y} `;
        }
    }

    polyline.setAttribute("points", pointsStr);

    const chartBox = document.getElementById('m-chart-box');
    const hoverInfo = document.getElementById('m-chart-hover-info');
    if (chartBox && hoverInfo && !chartBox.dataset.listenerBound) {
        chartBox.dataset.listenerBound = 'true';
        chartBox.addEventListener('mousemove', (e) => {
            if (currentChartStepData.length === 0) return;
            const rect = chartBox.getBoundingClientRect();
            const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const idx = Math.min(currentChartStepData.length - 1, Math.floor(relX * currentChartStepData.length));
            hoverInfo.textContent = currentChartStepData[idx].label;
        });
        chartBox.addEventListener('mouseleave', () => { hoverInfo.textContent = ''; });
    }
}

// ============================================================================
// MODALI E HANDLERS STANDARD
// ============================================================================

function populateTransactionModalCategorySelect(selectedCat = 'Generale', type = 'out') {
    const sel = document.getElementById('m-trans-cat');
    if (!sel) return;
    sel.innerHTML = '';

    const baseCats = type === 'in'
        ? Array.from(new Set(['Entrata', ...mCategories]))
        : Array.from(new Set([...mVaults.map(v => v.name), ...mCategories]));

    baseCats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        const isVault = mVaults.some(v => v.name.toLowerCase() === c.toLowerCase());
        opt.textContent = isVault ? `VAULT: ${c}` : c;
        if (c.toLowerCase() === (selectedCat || '').toLowerCase()) opt.selected = true;
        sel.appendChild(opt);
    });

    const newOpt = document.createElement('option');
    newOpt.value = '__NEW__';
    newOpt.textContent = '+ New Category...';
    sel.appendChild(newOpt);
}

function handleModalCatSelectChange(selectEl) {
    if (selectEl.value !== '__NEW__') return;
    const type = document.getElementById('m-trans-type')?.value || 'out';
    const fallback = type === 'in' ? 'Entrata' : 'Generale';
    const entered = prompt('New category name:');
    if (entered && entered.trim()) {
        const clean = entered.trim();
        if (!mCategories.includes(clean)) {
            mCategories.push(clean);
            saveMoneyData();
        }
        populateTransactionModalCategorySelect(clean, type);
    } else {
        populateTransactionModalCategorySelect(fallback, type);
    }
}

function openTransactionModal(type, prefillCategory = null) {
    document.getElementById('mTransactionForm').reset();
    document.getElementById('m-trans-type').value = type;
    document.getElementById('m-trans-title').innerText = type === 'in' ? 'Add Income (+ IN)' : 'Add Expense (- OUT)';
    document.getElementById('m-trans-date').value = todayStr;

    const defaultCat = prefillCategory || (type === 'in' ? 'Entrata' : 'Generale');
    populateTransactionModalCategorySelect(defaultCat, type);

    closeModals();
    document.getElementById('mTransactionModal').style.display = 'flex';
    setTimeout(() => {
        const amtInp = document.getElementById('m-trans-amount');
        if (amtInp) amtInp.focus();
    }, 20);
}

function openRecurringModal() {
    document.getElementById('mRecurringForm').reset();
    document.getElementById('m-rec-start').value = todayStr;
    closeModals();
    document.getElementById('mRecurringModal').style.display = 'flex';
}

function openWishlistModal() {
    document.getElementById('mWishlistForm').reset();
    closeModals();
    document.getElementById('mWishlistModal').style.display = 'flex';
}

function toggleVaultRuleInput() {
    const ruleType = document.getElementById('m-vault-rule-type').value;
    const group = document.getElementById('m-vault-rule-val-group');
    const label = document.getElementById('m-vault-rule-val-label');
    const dayGroup = document.getElementById('m-vault-renewal-day-group');
    if (!group || !label) return;

    if (ruleType === 'none') {
        group.style.display = 'none';
    } else {
        group.style.display = 'flex';
        label.textContent = ruleType === 'percent_in' ? 'Percentage of every +IN (1-100%)' : 'Monthly Refill Amount (€)';
        if (dayGroup) {
            dayGroup.style.display = ruleType === 'monthly_fixed' ? 'block' : 'none';
        }
    }
}

function openVaultModal(vaultId = null) {
    const form = document.getElementById('mVaultForm');
    if (!form) return;
    form.reset();

    if (vaultId) {
        const v = mVaults.find(x => x.id === vaultId);
        if (!v) return;
        document.getElementById('m-vault-id').value = v.id;
        document.getElementById('m-vault-name').value = v.name;
        document.getElementById('m-vault-balance').value = v.balance || 0;
        document.getElementById('m-vault-target').value = v.target || '';
        document.getElementById('m-vault-rule-type').value = v.ruleType || 'monthly_fixed';
        document.getElementById('m-vault-rule-val').value = v.ruleValue || '';
        document.getElementById('m-vault-renewal-day').value = v.renewalDay || 15;
    } else {
        document.getElementById('m-vault-id').value = '';
        document.getElementById('m-vault-balance').value = 15;
        document.getElementById('m-vault-target').value = 15;
        document.getElementById('m-vault-rule-type').value = 'monthly_fixed';
        document.getElementById('m-vault-rule-val').value = 15;
        document.getElementById('m-vault-renewal-day').value = 15;
    }

    toggleVaultRuleInput();
    closeModals();
    document.getElementById('mVaultModal').style.display = 'flex';
}

function openVaultTransferModal(vaultId, dir) {
    const v = mVaults.find(x => x.id === vaultId);
    if (!v) return;
    document.getElementById('mVaultTransferForm').reset();
    document.getElementById('m-vtrans-id').value = v.id;
    document.getElementById('m-vtrans-dir').value = dir;
    document.getElementById('m-vtrans-title').textContent = dir === 'in'
        ? `Add Funds to "${v.name}"`
        : `Deduct from "${v.name}"`;
    closeModals();
    document.getElementById('mVaultTransferModal').style.display = 'flex';
}

function deleteVault(vaultId) {
    mVaults = mVaults.filter(x => x.id !== vaultId);
    saveMoneyData();
    renderMoneyAllActivePanes();
    if (typeof showToast === 'function') showToast('[VAULT] Deleted');
}

document.getElementById('mTransactionForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = document.getElementById('m-trans-type').value;
    const amount = roundCurrency(document.getElementById('m-trans-amount').value);
    const rawCat = (document.getElementById('m-trans-cat').value || '').trim();
    const desc = document.getElementById('m-trans-desc').value.trim();
    const dateStr = document.getElementById('m-trans-date').value || todayStr;

    if (type === 'out') {
        const res = recordExpenseWithVaultCheck({
            amount: amount,
            category: rawCat || 'Generale',
            desc: desc,
            dateStr: dateStr
        });
        closeModals();
        if (res && res.matchedVault && typeof showToast === 'function') {
            showToast(`[VAULT ${res.matchedVault.name.toUpperCase()}] -€${amount.toFixed(2)} -> Balance: €${res.newVaultBalance.toFixed(2)}`);
        }
        return;
    }

    const category = rawCat || 'Entrata';
    mBalance = roundCurrency(mBalance + amount);
    const autoSaved = applyIncomeVaultRules(amount);

    mTransactions.push({
        id: 'mt_' + Date.now(),
        type: 'in',
        amount: amount,
        category: category,
        desc: desc || 'Income',
        date: dateStr
    });

    saveMoneyData();
    closeModals();
    renderMoneyAllActivePanes();
    if (autoSaved > 0 && typeof showToast === 'function') {
        showToast(`[VAULT AUTO-RULE] €${autoSaved.toFixed(2)} allocated to Vaults`);
    }
});

document.getElementById('mVaultForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('m-vault-id').value;
    const name = document.getElementById('m-vault-name').value.trim();
    const balance = roundCurrency(document.getElementById('m-vault-balance').value);
    const targetRaw = document.getElementById('m-vault-target').value;
    const ruleType = document.getElementById('m-vault-rule-type').value;
    const ruleValue = ruleType === 'none' ? 0 : roundCurrency(document.getElementById('m-vault-rule-val').value);
    const renewalDay = Math.max(1, Math.min(31, parseInt(document.getElementById('m-vault-renewal-day').value, 10) || 15));
    const target = targetRaw ? roundCurrency(targetRaw) : (ruleType === 'monthly_fixed' ? ruleValue : 0);

    if (!mCategories.includes(name)) {
        mCategories.push(name);
    }

    if (id) {
        const v = mVaults.find(x => x.id === id);
        if (v) {
            v.name = name;
            v.balance = balance;
            v.target = target;
            v.ruleType = ruleType;
            v.ruleValue = ruleValue;
            v.renewalDay = renewalDay;
            if (!v.lastCycleDate) v.lastCycleDate = getLatestCycleStartOnOrBeforeToday(renewalDay);
        }
    } else {
        mVaults.push({
            id: 'mv_' + Date.now(),
            name: name,
            balance: balance,
            target: target,
            ruleType: ruleType,
            ruleValue: ruleValue,
            renewalDay: renewalDay,
            lastCycleDate: getLatestCycleStartOnOrBeforeToday(renewalDay)
        });
    }

    saveMoneyData();
    closeModals();
    renderMoneyAllActivePanes();
    if (typeof showToast === 'function') {
        showToast(`[VAULT] Saved "${name}" (Renews Day ${renewalDay})`);
    }
});

document.getElementById('mVaultTransferForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('m-vtrans-id').value;
    const dir = document.getElementById('m-vtrans-dir').value;
    const amt = roundCurrency(document.getElementById('m-vtrans-amount').value);
    const v = mVaults.find(x => x.id === id);
    if (!v || amt <= 0) return;

    if (dir === 'in') {
        v.balance = roundCurrency((parseFloat(v.balance) || 0) + amt);
    } else {
        v.balance = roundCurrency((parseFloat(v.balance) || 0) - amt);
    }

    saveMoneyData();
    closeModals();
    renderMoneyAllActivePanes();
    if (typeof showToast === 'function') {
        showToast(`[VAULT] ${v.name}: €${v.balance.toFixed(2)}`);
    }
});

document.getElementById('mRecurringForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    mRecurring.push({
        id: 'mr_' + Date.now(),
        title: document.getElementById('m-rec-title').value.trim(),
        amount: roundCurrency(document.getElementById('m-rec-amount').value),
        dayOfMonth: document.getElementById('m-rec-day').value,
        startDate: document.getElementById('m-rec-start').value,
        endDate: document.getElementById('m-rec-end').value || null,
        lastProcessed: null
    });
    saveMoneyData();
    closeModals();
    renderMoneyAllActivePanes();
});

document.getElementById('mWishlistForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const rawCost = document.getElementById('m-wish-cost').value;
    mWishlist.push({
        id: 'mw_' + Date.now(),
        category: mWishCategories[0] || 'General',
        title: document.getElementById('m-wish-title').value.trim(),
        cost: rawCost ? roundCurrency(rawCost) : "",
        order: mWishlist.length
    });
    saveMoneyData();
    closeModals();
    renderMoneyAllActivePanes();
});

function deleteTransaction(id) {
    const t = mTransactions.find(x => x.id === id);
    if (!t) return;
    if (t.type === 'in') {
        mBalance = roundCurrency(mBalance - parseFloat(t.amount));
    } else {
        mBalance = roundCurrency(mBalance + parseFloat(t.amount));
        if (t.vaultId) {
            const v = mVaults.find(x => x.id === t.vaultId);
            if (v) v.balance = roundCurrency((parseFloat(v.balance) || 0) + parseFloat(t.amount));
        }
    }
    mTransactions = mTransactions.filter(x => x.id !== id);
    saveMoneyData();
    renderMoneyAllActivePanes();
}

function deleteRecurring(id) {
    mRecurring = mRecurring.filter(x => x.id !== id);
    saveMoneyData();
    renderMoneyAllActivePanes();
}

function deleteWish(id) {
    mWishlist = mWishlist.filter(x => x.id !== id);
    saveMoneyData();
    renderMoneyAllActivePanes();
}

window.addEventListener('DOMContentLoaded', () => {
    processRecurringPayments();
    processVaultMonthlyRules();
    renderMoneyAllActivePanes();
});
// --- js/modules/money.js ---
// Atomic Module 7: Spendable Balance, Monthly Cashflow, Auto-Deducting Envelopes/Vaults & Rollover Cycles

let currentChartStepData = [];

// Calcola la data (YYYY-MM-DD) di un giorno specifico del mese gestendo mesi da 28/30/31 giorni
function buildCycleDateStr(year, monthIndex0, renewalDay) {
    const maxDays = new Date(year, monthIndex0 + 1, 0).getDate();
    const clampedDay = Math.max(1, Math.min(maxDays, parseInt(renewalDay, 10) || 1));
    return formatDate(new Date(year, monthIndex0, clampedDay));
}

// Restituisce l'inizio dell'ultimo ciclo avvenuto prima o uguale a oggi (es. il 15 del mese)
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

// Restituisce la data del prossimo rinnovo futuro dopo una data ciclo
function getNextCycleDateStr(lastCycleDateStr, renewalDay) {
    const parts = (lastCycleDateStr || todayStr).split('-').map(Number);
    const nextMonth = new Date(parts[0], (parts[1] - 1) + 1, 1);
    return buildCycleDateStr(nextMonth.getFullYear(), nextMonth.getMonth(), renewalDay);
}

// 1. AUTOMAZIONE RATE FISSE RICORRENTI ALL'AVVIO
function processRecurringPayments() {
    const today = getNow();
    today.setHours(0, 0, 0, 0);
    let madeChanges = false;

    mRecurring.forEach(rec => {
        let lastProc = rec.lastProcessed ? new Date(rec.lastProcessed) : new Date(rec.startDate);
        lastProc.setHours(0, 0, 0, 0);

        let startD = new Date(rec.startDate);
        startD.setHours(0, 0, 0, 0);
        let endD = rec.endDate ? new Date(rec.endDate) : new Date("2099-12-31");
        endD.setHours(0, 0, 0, 0);

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

// 2. RINNOVO CICLICO SALVADANAI (Es. Ogni 15 del mese: somma algebricamente al saldo anche se negativo!)
// Se avevi 15€, hai speso 20€ -> saldo = -5€. Al rinnovo del 15 del mese successivo: -5€ + 15€ = 10€!
function processVaultMonthlyRules() {
    let changed = false;

    mVaults.forEach(v => {
        if (v.ruleType === 'monthly_fixed' && parseFloat(v.ruleValue) > 0) {
            const rDay = Math.max(1, Math.min(31, parseInt(v.renewalDay, 10) || 1));

            // Migrazione dal vecchio formato YYYY-MM al formato esatto YYYY-MM-DD
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

// Cerca se esiste un Salvadanaio corrispondente alla categoria o alla descrizione (es. "Amazon")
function findMatchingVaultForExpense(category, description) {
    const catClean = (category || '').trim().toLowerCase();
    const descClean = (description || '').trim().toLowerCase();

    // 1. Match esatto sul nome del salvadanaio con la categoria
    let match = mVaults.find(v => v.name.trim().toLowerCase() === catClean);
    if (match) return match;

    // 2. Match se il nome del salvadanaio è contenuto nella categoria o nella descrizione
    match = mVaults.find(v => {
        const vName = v.name.trim().toLowerCase();
        return vName.length >= 2 && (catClean.includes(vName) || descClean.includes(vName));
    });
    return match || null;
}

// Registra un'uscita e, se corrisponde a un Salvadanaio (es. Amazon), scala direttamente da lì (anche andando in negativo)
function recordExpenseWithVaultCheck({ amount, category, desc, dateStr = todayStr }) {
    const amt = roundCurrency(amount);
    if (amt <= 0) return null;

    let finalCat = (category || 'Generale').trim();
    const matchedVault = findMatchingVaultForExpense(finalCat, desc);

    let linkedVaultId = null;
    let linkedVaultName = null;
    let newVaultBalance = null;

    if (matchedVault) {
        finalCat = matchedVault.name; // Uniforma il tag al nome del salvadanaio
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
    renderMoneyDashboard();

    return { tx, matchedVault, newVaultBalance };
}

// 3. CALCOLO SALDO SPENDIBILE REALE E CASHFLOW DEL MESE CORRENTE
function getMoneyAllocationMetrics() {
    // I salvadanai con saldo positivo bloccano fondi; quelli in negativo hanno già eroso il saldo e compenseranno al prossimo rinnovo
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
    const curDay = now.getDate();
    const curMonthPrefix = todayStr.slice(0, 7);

    let pendingBills = 0;
    mRecurring.forEach(rec => {
        const recDay = parseInt(rec.dayOfMonth, 10);
        const alreadyPaidThisMonth = rec.lastProcessed && rec.lastProcessed.startsWith(curMonthPrefix);
        const notEnded = !rec.endDate || rec.endDate >= todayStr;
        if (notEnded && !alreadyPaidThisMonth && recDay > curDay) {
            pendingBills = roundCurrency(pendingBills + (parseFloat(rec.amount) || 0));
        }
    });

    // Calcolo Cashflow del mese corrente (+IN vs -OUT)
    let monthIn = 0, monthOut = 0;
    mTransactions.forEach(t => {
        if (t.date && t.date.startsWith(curMonthPrefix)) {
            if (t.type === 'in') monthIn = roundCurrency(monthIn + (parseFloat(t.amount) || 0));
            else monthOut = roundCurrency(monthOut + (parseFloat(t.amount) || 0));
        }
    });

    const spendable = roundCurrency(mBalance - totalVaultedPositive - pendingBills);

    return {
        total: mBalance,
        vaulted: totalVaultedPositive,
        overbudgetDebt: totalOverbudgetDebt,
        pendingBills: pendingBills,
        spendable: spendable,
        monthIn: monthIn,
        monthOut: monthOut,
        monthNet: roundCurrency(monthIn - monthOut)
    };
}

// 4. RENDER PRINCIPALE DASHBOARD MONEY (SCELTA 2A)
function renderMoneyDashboard() {
    processVaultMonthlyRules();
    const metrics = getMoneyAllocationMetrics();

    const balEl = document.getElementById('m-balance-display');
    if (balEl) balEl.innerText = metrics.total.toFixed(2);

    const spendEl = document.getElementById('m-spendable-display');
    if (spendEl) {
        spendEl.innerText = metrics.spendable.toFixed(2);
        spendEl.parentElement.style.color = metrics.spendable < 0 ? 'var(--accent-red)' : 'var(--accent-green)';
    }

    const breakdownEl = document.getElementById('m-balance-breakdown');
    if (breakdownEl) {
        const debtWarning = metrics.overbudgetDebt > 0
            ? `  |  VAULT OVERBUDGET (ROLLS NEXT MONTH): -€${metrics.overbudgetDebt.toFixed(2)}`
            : '';
        breakdownEl.textContent = `LOCKED IN VAULTS: €${metrics.vaulted.toFixed(2)}  |  PENDING BILLS THIS MONTH: €${metrics.pendingBills.toFixed(2)}${debtWarning}`;
    }

    const cashflowEl = document.getElementById('m-monthly-cashflow');
    if (cashflowEl) {
        const netSign = metrics.monthNet >= 0 ? '+' : '';
        const netColor = metrics.monthNet >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        cashflowEl.innerHTML = `
            <span class="cashflow-pill">MONTH IN: <strong style="color:var(--accent-green);">+€${metrics.monthIn.toFixed(2)}</strong></span>
            <span class="cashflow-pill">MONTH OUT: <strong style="color:var(--accent-red);">-€${metrics.monthOut.toFixed(2)}</strong></span>
            <span class="cashflow-pill">NET: <strong style="color:${netColor};">${netSign}€${metrics.monthNet.toFixed(2)}</strong></span>
        `;
    }

    // Popola datalist nel modale transazione (include sia i nomi dei Salvadanai sia le categorie)
    const datalist = document.getElementById('m-cat-datalist');
    if (datalist) {
        const allNames = Array.from(new Set([...mVaults.map(v => v.name), ...mCategories]));
        datalist.innerHTML = allNames.map(c => `<option value="${escapeHtml(c)}">`).join('');
    }

    mTransactions.sort((a, b) => {
        let timeA = parseInt(a.id.split('_')[1], 10) || new Date(a.date).getTime();
        let timeB = parseInt(b.id.split('_')[1], 10) || new Date(b.date).getTime();
        return timeB - timeA;
    });

    mWishlist.sort((a, b) => a.order - b.order);

    // A. Render Salvadanai Orizzontali (Envelopes)
    renderVaultsSection();

    // B. Recent Transactions
    const histCont = document.getElementById('m-history-container');
    if (histCont) {
        histCont.innerHTML = '';
        if (mTransactions.length === 0) {
            histCont.innerHTML = '<div class="empty-state">[ NO TRANSACTIONS ]</div>';
        } else {
            const histFrag = document.createDocumentFragment();
            mTransactions.slice(0, 18).forEach(t => {
                const isOut = t.type === 'out';
                const absAmount = Math.abs(parseFloat(t.amount)).toFixed(2);
                const catLabel = t.category || (isOut ? 'Generale' : 'Entrata');
                const vaultBadge = t.vaultName
                    ? `<span class="m-vault-linked-badge" title="Deducted from Vault ${escapeHtml(t.vaultName)}">[VAULT: ${escapeHtml(t.vaultName)}]</span>`
                    : `<span class="m-cat-badge">${escapeHtml(catLabel)}</span>`;

                const row = document.createElement('div');
                row.className = `m-item-row ${isOut ? 'out' : 'in'}`;
                row.innerHTML = `
                    <div>
                        <div class="m-title">${vaultBadge}${escapeHtml(t.desc)}</div>
                        <div class="m-sub">${escapeHtml(t.date)}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="m-amt ${isOut ? 'neg' : 'pos'}">${isOut ? '-' : '+'}€${absAmount}</div>
                    </div>
                `;
                const delBtn = document.createElement('button');
                delBtn.className = 'icon-btn delete';
                delBtn.textContent = '[X]';
                delBtn.onclick = () => deleteTransaction(t.id);
                row.lastElementChild.appendChild(delBtn);

                histFrag.appendChild(row);
            });
            histCont.appendChild(histFrag);
        }
    }

    // C. Recurring Payments
    const recCont = document.getElementById('m-recurring-container');
    if (recCont) {
        recCont.innerHTML = '';
        if (mRecurring.length === 0) {
            recCont.innerHTML = '<div class="empty-state">[ NONE ]</div>';
        } else {
            const recFrag = document.createDocumentFragment();
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
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="m-amt neg">-€${absAmount}</div>
                    </div>
                `;
                const delBtn = document.createElement('button');
                delBtn.className = 'icon-btn delete';
                delBtn.textContent = '[X]';
                delBtn.onclick = () => deleteRecurring(r.id);
                row.lastElementChild.appendChild(delBtn);

                recFrag.appendChild(row);
            });
            recCont.appendChild(recFrag);
        }
    }

    // D. Purchase Ideas Incubator
    const wishCont = document.getElementById('m-wishlist-container');
    if (wishCont) {
        wishCont.innerHTML = '';
        if (mWishlist.length === 0) {
            wishCont.innerHTML = '<div class="empty-state">[ NO IDEAS IN INCUBATOR ]</div>';
        } else {
            const wishFrag = document.createDocumentFragment();
            mWishlist.forEach((w, i) => {
                const hasCost = w.cost && parseFloat(w.cost) > 0;
                const costDisplay = hasCost ? `€${Math.abs(parseFloat(w.cost)).toFixed(2)}` : '€--';

                const row = document.createElement('div');
                row.className = 'm-item-row idea';
                row.innerHTML = `
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div class="wish-arrows" style="display:flex; flex-direction:column;"></div>
                        <div><div class="m-title" style="color:white;">${escapeHtml(w.title)}</div></div>
                    </div>
                    <div class="wish-actions" style="display:flex; align-items:center; gap:8px;">
                        <div class="m-amt" style="color: var(--text-dim); margin-right: 4px;">${costDisplay}</div>
                    </div>
                `;

                const arrowsBox = row.querySelector('.wish-arrows');
                const upBtn = document.createElement('button');
                upBtn.className = 'icon-btn';
                upBtn.style.cssText = 'font-size:0.6rem; padding:0;';
                upBtn.textContent = '▲';
                upBtn.onclick = () => moveWish(i, -1);

                const downBtn = document.createElement('button');
                downBtn.className = 'icon-btn';
                downBtn.style.cssText = 'font-size:0.6rem; padding:0;';
                downBtn.textContent = '▼';
                downBtn.onclick = () => moveWish(i, 1);

                arrowsBox.appendChild(upBtn);
                arrowsBox.appendChild(downBtn);

                const actionsBox = row.querySelector('.wish-actions');
                const buyBtn = document.createElement('button');
                buyBtn.className = 'btn btn-sm';
                buyBtn.textContent = '[BUY]';
                buyBtn.onclick = () => purchaseIdea(w.id);

                const delBtn = document.createElement('button');
                delBtn.className = 'icon-btn delete';
                delBtn.textContent = '[X]';
                delBtn.onclick = () => deleteWish(w.id);

                actionsBox.appendChild(buyBtn);
                actionsBox.appendChild(delBtn);
                wishFrag.appendChild(row);
            });
            wishCont.appendChild(wishFrag);
        }
    }

    drawSteppedChart();
}

function renderVaultsSection() {
    const cont = document.getElementById('m-vaults-container');
    if (!cont) return;
    cont.innerHTML = '';

    if (mVaults.length === 0) {
        cont.innerHTML = '<div class="empty-state">[ NO VAULTS CREATED — CLICK "+ VAULT" TO CREATE A MONTHLY ENVELOPE LIKE "AMAZON" ]</div>';
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
            ruleText = `+€${refill.toFixed(2)} EVERY DAY ${rDay} OF MONTH`;
            if (isNegative) {
                nextRenewalPreview = ` · NEXT CYCLE (DAY ${rDay}): €${projectedNext.toFixed(2)} AVAILABLE`;
            }
        } else if (v.ruleType === 'percent_in' && v.ruleValue > 0) {
            ruleText = `AUTO: +${v.ruleValue}% OF EVERY INCOME`;
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
                <div style="display:flex; align-items:center; gap:14px;">
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

        // Bottone rapido per registrare subito una spesa su questo Salvadanaio
        const btnSpend = document.createElement('button');
        btnSpend.className = 'btn btn-danger btn-sm';
        btnSpend.textContent = '[- SPEND]';
        btnSpend.title = `Log an expense directly on "${v.name}"`;
        btnSpend.onclick = () => openTransactionModal('out', v.name);

        const btnAdd = document.createElement('button');
        btnAdd.className = 'btn btn-sm';
        btnAdd.textContent = '[+]';
        btnAdd.title = 'Add funds manually to Vault';
        btnAdd.onclick = () => openVaultTransferModal(v.id, 'in');

        const btnEdit = document.createElement('button');
        btnEdit.className = 'icon-btn';
        btnEdit.textContent = '[✎]';
        btnEdit.title = 'Edit Vault & Renewal Day';
        btnEdit.onclick = () => openVaultModal(v.id);

        const btnDel = document.createElement('button');
        btnDel.className = 'icon-btn delete';
        btnDel.textContent = '[X]';
        btnDel.title = 'Delete Vault';
        btnDel.onclick = () => deleteVault(v.id);

        actBox.appendChild(btnSpend);
        actBox.appendChild(btnAdd);
        actBox.appendChild(btnEdit);
        actBox.appendChild(btnDel);

        frag.appendChild(row);
    });

    cont.appendChild(frag);
}

// 5. GRAFICO A SCALINI DELLE ULTIME 30 TRANSAZIONI
function drawSteppedChart() {
    const svg = document.getElementById('m-chart-svg');
    const polyline = document.getElementById('m-chart-line');
    if (!svg || !polyline) return;

    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');

    let sortedT = [...mTransactions].sort((a, b) => {
        let timeA = parseInt(a.id.split('_')[1], 10) || new Date(a.date).getTime();
        let timeB = parseInt(b.id.split('_')[1], 10) || new Date(b.date).getTime();
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

// 6. GESTIONE MODALI TRANSAZIONI, SALVADANAI, RICORRENZE E WISHLIST
function openTransactionModal(type, prefillCategory = null) {
    document.getElementById('mTransactionForm').reset();
    document.getElementById('m-trans-type').value = type;
    document.getElementById('m-trans-title').innerText = type === 'in' ? 'Add Income (+ IN)' : 'Add Expense (- OUT)';
    document.getElementById('m-trans-date').value = todayStr;
    const catInput = document.getElementById('m-trans-cat');
    if (catInput) {
        catInput.value = prefillCategory || (type === 'in' ? 'Entrata' : 'Generale');
    }
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
    renderMoneyDashboard();
    if (typeof showToast === 'function') showToast('[VAULT] Deleted');
}

// --- LISTENER FORM ---
document.getElementById('mTransactionForm').addEventListener('submit', (e) => {
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

    // Caso + IN (Entrata)
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
    renderMoneyDashboard();
    if (autoSaved > 0 && typeof showToast === 'function') {
        showToast(`[VAULT AUTO-RULE] €${autoSaved.toFixed(2)} allocated to Vaults`);
    }
});

document.getElementById('mVaultForm').addEventListener('submit', (e) => {
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
    renderMoneyDashboard();
    if (typeof showToast === 'function') {
        showToast(`[VAULT] Saved "${name}" (Renews Day ${renewalDay})`);
    }
});

document.getElementById('mVaultTransferForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('m-vtrans-id').value;
    const dir = document.getElementById('m-vtrans-dir').value;
    const amt = roundCurrency(document.getElementById('m-vtrans-amount').value);
    const v = mVaults.find(x => x.id === id);
    if (!v || amt <= 0) return;

    if (dir === 'in') {
        v.balance = roundCurrency((parseFloat(v.balance) || 0) + amt);
    } else {
        // Permette anche il saldo negativo se necessario
        v.balance = roundCurrency((parseFloat(v.balance) || 0) - amt);
    }

    saveMoneyData();
    closeModals();
    renderMoneyDashboard();
    if (typeof showToast === 'function') {
        showToast(`[VAULT] ${v.name}: €${v.balance.toFixed(2)}`);
    }
});

document.getElementById('mRecurringForm').addEventListener('submit', (e) => {
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
    renderMoneyDashboard();
});

document.getElementById('mWishlistForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const rawCost = document.getElementById('m-wish-cost').value;
    mWishlist.push({
        id: 'mw_' + Date.now(),
        title: document.getElementById('m-wish-title').value.trim(),
        cost: rawCost ? roundCurrency(rawCost) : "",
        order: mWishlist.length
    });
    saveMoneyData();
    closeModals();
    renderMoneyDashboard();
});

function deleteTransaction(id) {
    const t = mTransactions.find(x => x.id === id);
    if (!t) return;
    if (t.type === 'in') {
        mBalance = roundCurrency(mBalance - parseFloat(t.amount));
    } else {
        mBalance = roundCurrency(mBalance + parseFloat(t.amount));
        // Se la spesa aveva scalato da un Salvadanaio (es. Amazon), rimborsa anche il Salvadanaio!
        if (t.vaultId) {
            const v = mVaults.find(x => x.id === t.vaultId);
            if (v) v.balance = roundCurrency((parseFloat(v.balance) || 0) + parseFloat(t.amount));
        }
    }
    mTransactions = mTransactions.filter(x => x.id !== id);
    saveMoneyData();
    renderMoneyDashboard();
}

function deleteRecurring(id) {
    mRecurring = mRecurring.filter(x => x.id !== id);
    saveMoneyData();
    renderMoneyDashboard();
}

function deleteWish(id) {
    mWishlist = mWishlist.filter(x => x.id !== id);
    saveMoneyData();
    renderMoneyDashboard();
}

function purchaseIdea(id) {
    const w = mWishlist.find(x => x.id === id);
    if (!w) return;

    let cost = roundCurrency(w.cost);
    if (!cost || cost <= 0) {
        const entered = prompt(`Enter purchase price (€) for "${w.title}":`, "10.00");
        if (entered === null) return;
        cost = roundCurrency(entered.replace(',', '.'));
        if (cost <= 0) return;
    }

    recordExpenseWithVaultCheck({
        amount: cost,
        category: 'Wishlist',
        desc: `[Wish] ${w.title}`,
        dateStr: todayStr
    });
    deleteWish(id);
    if (typeof showToast === 'function') {
        showToast(`[MONEY] Purchased "${w.title}" (-€${cost.toFixed(2)})`);
    }
}

function moveWish(index, dir) {
    if (index + dir < 0 || index + dir >= mWishlist.length) return;
    const temp = mWishlist[index].order;
    mWishlist[index].order = mWishlist[index + dir].order;
    mWishlist[index + dir].order = temp;
    saveMoneyData();
    renderMoneyDashboard();
}

processRecurringPayments();
processVaultMonthlyRules();
renderMoneyDashboard();
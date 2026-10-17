// --- MONEY MODULE: SPENDABLE BALANCE, VAULTS, CATEGORIES & SVG PIE CHARTS ---

let currentChartStepData = [];

const PIE_PALETTE = [
    '#ffffff', '#5f7a61', '#b08d43', '#4c5b73',
    '#b84b4b', '#725b7a', '#888888', '#444444'
];

// 1. AUTOMAZIONE RATE RICORRENTI ALL'AVVIO
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

    if (madeChanges) {
        saveMoneyData();
    }
}

// 2. AUTOMAZIONE SALVADANAI (Regola Mensile e Regola % su Entrate)
function processVaultMonthlyRules() {
    const currentMonthKey = todayStr.slice(0, 7); // YYYY-MM
    let changed = false;

    mVaults.forEach(v => {
        if (v.ruleType === 'monthly_fixed' && parseFloat(v.ruleValue) > 0) {
            if (!v.lastMonthlyProc) {
                v.lastMonthlyProc = currentMonthKey;
                changed = true;
            } else if (v.lastMonthlyProc < currentMonthKey) {
                // Calcola quanti mesi sono passati
                const [ly, lm] = v.lastMonthlyProc.split('-').map(Number);
                const [cy, cm] = currentMonthKey.split('-').map(Number);
                const monthsDiff = Math.max(0, (cy - ly) * 12 + (cm - lm));
                if (monthsDiff > 0) {
                    const addAmt = roundCurrency(monthsDiff * parseFloat(v.ruleValue));
                    v.balance = roundCurrency((v.balance || 0) + addAmt);
                    v.lastMonthlyProc = currentMonthKey;
                    changed = true;
                }
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
                v.balance = roundCurrency((v.balance || 0) + cut);
                totalAutoSaved = roundCurrency(totalAutoSaved + cut);
            }
        }
    });

    if (totalAutoSaved > 0) {
        saveMoneyData();
    }
    return totalAutoSaved;
}

// 3. CALCOLO SALDO SPENDIBILE REALE
function getMoneyAllocationMetrics() {
    const totalVaulted = roundCurrency(
        mVaults.reduce((acc, v) => acc + (parseFloat(v.balance) || 0), 0)
    );

    const now = getNow();
    const curDay = now.getDate();
    const curMonthPrefix = todayStr.slice(0, 7);

    // Somma i pagamenti ricorrenti attivi che devono ancora scattare in questo mese
    let pendingBills = 0;
    mRecurring.forEach(rec => {
        const recDay = parseInt(rec.dayOfMonth, 10);
        const alreadyPaidThisMonth = rec.lastProcessed && rec.lastProcessed.startsWith(curMonthPrefix);
        const notEnded = !rec.endDate || rec.endDate >= todayStr;
        if (notEnded && !alreadyPaidThisMonth && recDay > curDay) {
            pendingBills = roundCurrency(pendingBills + (parseFloat(rec.amount) || 0));
        }
    });

    const spendable = roundCurrency(mBalance - totalVaulted - pendingBills);
    return {
        total: mBalance,
        vaulted: totalVaulted,
        pendingBills: pendingBills,
        spendable: spendable
    };
}

// 4. GENERATORE SVG GRAFICO A TORTA (Spicchi matematici + Legenda)
function renderSvgPieChart(svgContainerId, legendContainerId, slices, emptyLabel) {
    const svgWrap = document.getElementById(svgContainerId);
    const legendWrap = document.getElementById(legendContainerId);
    if (!svgWrap || !legendWrap) return;

    const validSlices = slices.filter(s => s.value > 0);
    const total = roundCurrency(validSlices.reduce((acc, s) => acc + s.value, 0));

    svgWrap.innerHTML = '';
    legendWrap.innerHTML = '';

    if (total <= 0 || validSlices.length === 0) {
        svgWrap.innerHTML = `
            <svg viewBox="0 0 100 100" width="84" height="84">
                <circle cx="50" cy="50" r="44" fill="transparent" stroke="#222" stroke-width="2" stroke-dasharray="4 4"></circle>
            </svg>
        `;
        legendWrap.innerHTML = `<div class="empty-state" style="padding: 4px 0;">${escapeHtml(emptyLabel)}</div>`;
        return;
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", "84");
    svg.setAttribute("height", "84");

    const cx = 50, cy = 50, r = 45;
    let currentAngle = -Math.PI / 2; // Parte dalle ore 12:00

    validSlices.forEach((slice, idx) => {
        const color = slice.color || PIE_PALETTE[idx % PIE_PALETTE.length];
        const pct = (slice.value / total) * 100;
        const sliceAngle = (slice.value / total) * (2 * Math.PI);

        if (validSlices.length === 1 || pct >= 99.9) {
            const circle = document.createElementNS(svgNS, "circle");
            circle.setAttribute("cx", cx);
            circle.setAttribute("cy", cy);
            circle.setAttribute("r", r);
            circle.setAttribute("fill", color);
            circle.setAttribute("stroke", "#000000");
            circle.setAttribute("stroke-width", "1.5");
            svg.appendChild(circle);
        } else {
            const x1 = cx + r * Math.cos(currentAngle);
            const y1 = cy + r * Math.sin(currentAngle);
            const endAngle = currentAngle + sliceAngle;
            const x2 = cx + r * Math.cos(endAngle);
            const y2 = cy + r * Math.sin(endAngle);
            const largeArc = sliceAngle > Math.PI ? 1 : 0;

            const pathData = [
                `M ${cx} ${cy}`,
                `L ${x1} ${y1}`,
                `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
                `Z`
            ].join(' ');

            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d", pathData);
            path.setAttribute("fill", color);
            path.setAttribute("stroke", "#000000");
            path.setAttribute("stroke-width", "1.5");
            path.innerHTML = `<title>${escapeHtml(slice.label)}: €${slice.value.toFixed(2)} (${pct.toFixed(1)}%)</title>`;
            svg.appendChild(path);

            currentAngle = endAngle;
        }

        // Riga Legenda
        const row = document.createElement('div');
        row.className = 'pie-legend-row';
        row.innerHTML = `
            <div class="pie-legend-left">
                <span class="pie-dot" style="background:${color};"></span>
                <span style="color:var(--text-main); overflow:hidden; text-overflow:ellipsis;">${escapeHtml(slice.label)}</span>
            </div>
            <div style="color:var(--text-muted); font-variant-numeric:tabular-nums; white-space:nowrap;">
                €${slice.value.toFixed(2)} <span style="color:var(--text-dim);">(${Math.round(pct)}%)</span>
            </div>
        `;
        legendWrap.appendChild(row);
    });

    svgWrap.appendChild(svg);
}

// 5. RENDER PRINCIPALE DASHBOARD MONEY
function renderMoneyDashboard() {
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
        breakdownEl.textContent = `LOCKED IN VAULTS: €${metrics.vaulted.toFixed(2)}  |  PENDING BILLS THIS MONTH: €${metrics.pendingBills.toFixed(2)}`;
    }

    // Popola datalist categorie nel modale transazione
    const datalist = document.getElementById('m-cat-datalist');
    if (datalist) {
        datalist.innerHTML = mCategories.map(c => `<option value="${escapeHtml(c)}">`).join('');
    }
    
    mTransactions.sort((a, b) => {
        let timeA = parseInt(a.id.split('_')[1], 10) || new Date(a.date).getTime();
        let timeB = parseInt(b.id.split('_')[1], 10) || new Date(b.date).getTime();
        return timeB - timeA;
    });
    
    mWishlist.sort((a, b) => a.order - b.order);

    // A. Render Salvadanai (Vaults)
    renderVaultsSection();

    // B. Render Grafici a Torta (Spese per Categoria & Allocazione Capitale)
    renderMoneyPieCharts(metrics);

    // C. Recent History (con badge Categoria)
    const histCont = document.getElementById('m-history-container');
    if (histCont) {
        histCont.innerHTML = '';
        if (mTransactions.length === 0) {
            histCont.innerHTML = '<div class="empty-state">[ NO TRANSACTIONS ]</div>';
        } else {
            const histFrag = document.createDocumentFragment();
            mTransactions.slice(0, 15).forEach(t => { 
                const isOut = t.type === 'out';
                const absAmount = Math.abs(parseFloat(t.amount)).toFixed(2);
                const catLabel = t.category || (isOut ? 'Generale' : 'Entrata');
                
                const row = document.createElement('div');
                row.className = `m-item-row ${isOut ? 'out' : 'in'}`;
                row.innerHTML = `
                    <div>
                        <div class="m-title"><span class="m-cat-badge">${escapeHtml(catLabel)}</span>${escapeHtml(t.desc)}</div>
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

    // D. Recurring Payments
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

    // E. Ideas Incubator
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
                buyBtn.title = 'Purchase item and deduct from balance';
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

function renderMoneyPieCharts(metrics) {
    // 1. Torta Uscite per Categoria
    const catTotals = {};
    mTransactions.forEach(t => {
        if (t.type === 'out') {
            const cat = (t.category || 'Generale').trim();
            catTotals[cat] = roundCurrency((catTotals[cat] || 0) + (parseFloat(t.amount) || 0));
        }
    });

    const expenseSlices = Object.entries(catTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value], idx) => ({
            label: label,
            value: value,
            color: PIE_PALETTE[idx % PIE_PALETTE.length]
        }));

    renderSvgPieChart('m-pie-expenses', 'm-legend-expenses', expenseSlices, '[ NO EXPENSES ]');

    // 2. Torta Allocazione Capitale (Spendibile vs Salvadanai vs Bollette Riservate)
    const allocSlices = [];
    if (metrics.spendable > 0) {
        allocSlices.push({ label: 'Spendable', value: metrics.spendable, color: '#5f7a61' });
    }
    mVaults.forEach((v, idx) => {
        const b = roundCurrency(v.balance);
        if (b > 0) {
            allocSlices.push({
                label: `Vault: ${v.name}`,
                value: b,
                color: PIE_PALETTE[(idx + 2) % PIE_PALETTE.length]
            });
        }
    });
    if (metrics.pendingBills > 0) {
        allocSlices.push({ label: 'Pending Bills', value: metrics.pendingBills, color: '#b84b4b' });
    }

    renderSvgPieChart('m-pie-allocation', 'm-legend-allocation', allocSlices, '[ ZERO BALANCE ]');
}

function renderVaultsSection() {
    const cont = document.getElementById('m-vaults-container');
    if (!cont) return;
    cont.innerHTML = '';

    if (mVaults.length === 0) {
        cont.innerHTML = '<div class="empty-state">[ NO VAULTS CREATED — CLICK "+ NEW VAULT" TO SET UP A PIGGY BANK ]</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    mVaults.forEach(v => {
        const bal = roundCurrency(v.balance);
        const target = roundCurrency(v.target);
        const pct = target > 0 ? Math.min(100, Math.round((bal / target) * 100)) : 0;

        let ruleText = 'RULE: MANUAL ONLY';
        if (v.ruleType === 'percent_in' && v.ruleValue > 0) {
            ruleText = `AUTO: ${v.ruleValue}% OF EVERY +IN`;
        } else if (v.ruleType === 'monthly_fixed' && v.ruleValue > 0) {
            ruleText = `AUTO: €${parseFloat(v.ruleValue).toFixed(2)} / MONTH`;
        }

        const card = document.createElement('div');
        card.className = 'vault-card';
        card.innerHTML = `
            <div class="vault-header">
                <div>
                    <div class="vault-name">${escapeHtml(v.name)}</div>
                    <div class="vault-rule-badge">${escapeHtml(ruleText)}</div>
                </div>
                <div class="vault-actions" style="display:flex; gap:4px;"></div>
            </div>
            <div class="vault-amount-row">
                <span class="vault-val">€${bal.toFixed(2)}</span>
                <span class="vault-target">${target > 0 ? `/ €${target.toFixed(2)} (${pct}%)` : ''}</span>
            </div>
            ${target > 0 ? `<div class="vault-progress-track"><div class="vault-progress-fill" style="width:${pct}%;"></div></div>` : ''}
        `;

        const actBox = card.querySelector('.vault-actions');

        const btnAdd = document.createElement('button');
        btnAdd.className = 'btn btn-sm';
        btnAdd.textContent = '[+]';
        btnAdd.title = 'Deposit into Vault';
        btnAdd.onclick = () => openVaultTransferModal(v.id, 'in');

        const btnSub = document.createElement('button');
        btnSub.className = 'btn btn-sm';
        btnSub.textContent = '[-]';
        btnSub.title = 'Withdraw from Vault to Spendable';
        btnSub.onclick = () => openVaultTransferModal(v.id, 'out');

        const btnEdit = document.createElement('button');
        btnEdit.className = 'icon-btn';
        btnEdit.textContent = '[✎]';
        btnEdit.title = 'Edit Vault & Rule';
        btnEdit.onclick = () => openVaultModal(v.id);

        const btnDel = document.createElement('button');
        btnDel.className = 'icon-btn delete';
        btnDel.textContent = '[X]';
        btnDel.title = 'Delete Vault (returns funds to Spendable)';
        btnDel.onclick = () => deleteVault(v.id);

        actBox.appendChild(btnAdd);
        actBox.appendChild(btnSub);
        actBox.appendChild(btnEdit);
        actBox.appendChild(btnDel);

        frag.appendChild(card);
    });

    cont.appendChild(frag);
}

// 6. GRAFICO A SCALINI DELLE ULTIME 30 TRANSAZIONI
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
        label: `INITIAL BALANCE: €${currentBal.toFixed(2)}`
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
    const width = 1000;
    const height = 1000;

    const stepWidth = width / maxTrans; 
    const xOffset = width - ((historyPoints.length - 1) * stepWidth);

    for (let i = 0; i < historyPoints.length; i++) {
        let x = xOffset + (i * stepWidth); 
        let y = height - (((historyPoints[i] - paddedMin) / paddedRange) * height);
        
        if (i === 0) {
            pointsStr += `${x},${y} `;
        } else {
            let prevY = height - (((historyPoints[i - 1] - paddedMin) / paddedRange) * height);
            pointsStr += `${x},${prevY} `; 
            pointsStr += `${x},${y} `;     
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
            const idx = Math.min(
                currentChartStepData.length - 1,
                Math.floor(relX * currentChartStepData.length)
            );
            hoverInfo.textContent = currentChartStepData[idx].label;
        });
        chartBox.addEventListener('mouseleave', () => {
            hoverInfo.textContent = '';
        });
    }
}

// 7. GESTIONE MODALI TRANSAZIONI, RICORRENZE, WISHLIST E SALVADANAI
function openTransactionModal(type) {
    document.getElementById('mTransactionForm').reset();
    document.getElementById('m-trans-type').value = type;
    document.getElementById('m-trans-title').innerText = type === 'in' ? 'Add Funds (+ IN)' : 'Add Expense (- OUT)';
    document.getElementById('m-trans-date').value = todayStr;
    const catInput = document.getElementById('m-trans-cat');
    if (catInput) {
        catInput.value = type === 'in' ? 'Entrata' : 'Generale';
    }
    closeModals();
    document.getElementById('mTransactionModal').style.display = 'flex';
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
    if (!group || !label) return;

    if (ruleType === 'none') {
        group.style.display = 'none';
    } else {
        group.style.display = 'block';
        label.textContent = ruleType === 'percent_in' ? 'Percentage of every +IN (1-100%)' : 'Fixed Monthly Amount (€)';
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
        document.getElementById('m-vault-rule-type').value = v.ruleType || 'none';
        document.getElementById('m-vault-rule-val').value = v.ruleValue || '';
    } else {
        document.getElementById('m-vault-id').value = '';
        document.getElementById('m-vault-balance').value = 0;
        document.getElementById('m-vault-rule-type').value = 'none';
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
        ? `Deposit into "${v.name}"`
        : `Withdraw from "${v.name}"`;
    closeModals();
    document.getElementById('mVaultTransferModal').style.display = 'flex';
}

function deleteVault(vaultId) {
    mVaults = mVaults.filter(x => x.id !== vaultId);
    saveMoneyData();
    renderMoneyDashboard();
    if (typeof showToast === 'function') showToast('[VAULT] Deleted (funds returned to Spendable)');
}

// --- LISTENER FORM ---
document.getElementById('mTransactionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = document.getElementById('m-trans-type').value;
    const amount = roundCurrency(document.getElementById('m-trans-amount').value);
    const rawCat = (document.getElementById('m-trans-cat').value || '').trim();
    const category = rawCat || (type === 'in' ? 'Entrata' : 'Generale');

    if (!mCategories.includes(category) && category !== 'Entrata') {
        mCategories.push(category);
    }

    let autoSaved = 0;
    if (type === 'in') {
        mBalance = roundCurrency(mBalance + amount);
        autoSaved = applyIncomeVaultRules(amount);
    } else {
        mBalance = roundCurrency(mBalance - amount);
    }
    
    mTransactions.push({
        id: 'mt_' + Date.now(),
        type: type,
        amount: amount,
        category: category,
        desc: document.getElementById('m-trans-desc').value.trim(),
        date: document.getElementById('m-trans-date').value
    });

    saveMoneyData(); 
    closeModals(); 
    renderMoneyDashboard();
    if (autoSaved > 0 && typeof showToast === 'function') {
        showToast(`[VAULT AUTO-RULE] €${autoSaved.toFixed(2)} automatically allocated to Vaults`);
    }
});

document.getElementById('mVaultForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('m-vault-id').value;
    const name = document.getElementById('m-vault-name').value.trim();
    const balance = roundCurrency(document.getElementById('m-vault-balance').value);
    const targetRaw = document.getElementById('m-vault-target').value;
    const target = targetRaw ? roundCurrency(targetRaw) : 0;
    const ruleType = document.getElementById('m-vault-rule-type').value;
    const ruleValue = ruleType === 'none' ? 0 : roundCurrency(document.getElementById('m-vault-rule-val').value);

    if (id) {
        const v = mVaults.find(x => x.id === id);
        if (v) {
            v.name = name;
            v.balance = balance;
            v.target = target;
            v.ruleType = ruleType;
            v.ruleValue = ruleValue;
        }
    } else {
        mVaults.push({
            id: 'mv_' + Date.now(),
            name: name,
            balance: balance,
            target: target,
            ruleType: ruleType,
            ruleValue: ruleValue,
            lastMonthlyProc: todayStr.slice(0, 7)
        });
    }

    saveMoneyData();
    closeModals();
    renderMoneyDashboard();
});

document.getElementById('mVaultTransferForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('m-vtrans-id').value;
    const dir = document.getElementById('m-vtrans-dir').value;
    const amt = roundCurrency(document.getElementById('m-vtrans-amount').value);
    const v = mVaults.find(x => x.id === id);
    if (!v || amt <= 0) return;

    if (dir === 'in') {
        v.balance = roundCurrency((v.balance || 0) + amt);
    } else {
        v.balance = Math.max(0, roundCurrency((v.balance || 0) - amt));
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
    if (t.type === 'in') mBalance = roundCurrency(mBalance - parseFloat(t.amount)); 
    else mBalance = roundCurrency(mBalance + parseFloat(t.amount));
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

    mBalance = roundCurrency(mBalance - cost);
    mTransactions.push({ 
        id: 'mt_' + Date.now(), 
        type: 'out', 
        amount: cost, 
        category: 'Wishlist',
        desc: `[Wish] ${w.title}`, 
        date: todayStr 
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
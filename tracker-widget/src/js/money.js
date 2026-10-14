// --- MONEY MODULE: RECURRING ENGINE, WISHLIST BUY & INTERACTIVE CHART ---

let currentChartStepData = [];

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

function renderMoneyDashboard() {
    const balEl = document.getElementById('m-balance-display');
    if (balEl) balEl.innerText = mBalance.toFixed(2);
    
    mTransactions.sort((a, b) => {
        let timeA = parseInt(a.id.split('_')[1], 10) || new Date(a.date).getTime();
        let timeB = parseInt(b.id.split('_')[1], 10) || new Date(b.date).getTime();
        return timeB - timeA;
    });
    
    mWishlist.sort((a, b) => a.order - b.order);

    // 1. Recent History
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
                
                const row = document.createElement('div');
                row.className = `m-item-row ${isOut ? 'out' : 'in'}`;
                row.innerHTML = `
                    <div>
                        <div class="m-title">${escapeHtml(t.desc)}</div>
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

    // 2. Recurring Payments
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

    // 3. Ideas Incubator (Ora con il pulsante [BUY] funzionante)
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
        currentChartStepData.push({
            balance: currentBal,
            label: `${t.date} // ${t.desc} (${t.type === 'in' ? '+' : '-'}€${amt.toFixed(2)}) -> €${currentBal.toFixed(2)}`
        });
    });

    const maxBal = Math.max(...historyPoints);
    const minBal = Math.min(...historyPoints);

    // Aggiorna etichette testuali sul grafico
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

    // Attiva ispezione interattiva col mouse sul grafico
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

function openTransactionModal(type) {
    document.getElementById('mTransactionForm').reset();
    document.getElementById('m-trans-type').value = type;
    document.getElementById('m-trans-title').innerText = type === 'in' ? 'Add Funds (+)' : 'Add Expense (-)';
    document.getElementById('m-trans-date').value = todayStr;
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

document.getElementById('mTransactionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = document.getElementById('m-trans-type').value;
    const amount = roundCurrency(document.getElementById('m-trans-amount').value);
    if (type === 'in') mBalance = roundCurrency(mBalance + amount); 
    else mBalance = roundCurrency(mBalance - amount);
    
    mTransactions.push({
        id: 'mt_' + Date.now(),
        type: type,
        amount: amount,
        desc: document.getElementById('m-trans-desc').value.trim(),
        date: document.getElementById('m-trans-date').value
    });
    saveMoneyData(); 
    closeModals(); 
    renderMoneyDashboard();
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
renderMoneyDashboard();
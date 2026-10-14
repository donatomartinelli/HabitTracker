// --- AUTOMAZIONE PAGAMENTI RICORRENTI ALL'AVVIO ---
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

// --- RENDER DASHBOARD SICURO E VELOCIZZATO ---
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
                    <div class="m-amt ${isOut ? 'neg' : 'pos'}" style="font-family: monospace; font-weight: bold;">€${absAmount}</div>
                </div>
            `;
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.style.cssText = 'opacity: 1; visibility: visible;';
            delBtn.textContent = '×';
            delBtn.onclick = () => deleteTransaction(t.id);
            row.lastElementChild.appendChild(delBtn);

            histFrag.appendChild(row);
        });
        histCont.appendChild(histFrag);
    }

    // 2. Recurring Payments
    const recCont = document.getElementById('m-recurring-container');
    if (recCont) {
        recCont.innerHTML = '';
        const recFrag = document.createDocumentFragment();

        mRecurring.forEach(r => {
            const absAmount = Math.abs(parseFloat(r.amount)).toFixed(2);
            const row = document.createElement('div');
            row.className = 'm-item-row';
            row.style.borderLeftColor = '#888';
            row.innerHTML = `
                <div>
                    <div class="m-title">${escapeHtml(r.title)}</div>
                    <div class="m-sub">Day ${escapeHtml(r.dayOfMonth)} | Ends: ${escapeHtml(r.endDate || 'Never')}</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="m-amt neg" style="font-family: monospace; font-weight: bold;">€${absAmount}</div>
                </div>
            `;
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.style.cssText = 'opacity: 1; visibility: visible;';
            delBtn.textContent = '×';
            delBtn.onclick = () => deleteRecurring(r.id);
            row.lastElementChild.appendChild(delBtn);

            recFrag.appendChild(row);
        });
        recCont.appendChild(recFrag);
    }

    // 3. Ideas Incubator (Wishlist)
    const wishCont = document.getElementById('m-wishlist-container');
    if (wishCont) {
        wishCont.innerHTML = '';
        const wishFrag = document.createDocumentFragment();

        mWishlist.forEach((w, i) => {
            const costDisplay = (w.cost && parseFloat(w.cost) > 0) ? `€${Math.abs(parseFloat(w.cost)).toFixed(2)}` : '';
            const badgeHtml = costDisplay ? `<div class="m-amt" style="color: var(--text-dim); font-weight: bold;">${costDisplay}</div>` : '';

            const row = document.createElement('div');
            row.className = 'm-item-row idea';
            row.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center;">
                    <div class="wish-arrows" style="display:flex; flex-direction:column;"></div>
                    <div><div class="m-title" style="color:white;">${escapeHtml(w.title)}</div></div>
                </div>
                <div class="wish-actions" style="display:flex; align-items:center; gap:10px;">
                    ${badgeHtml}
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

            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.style.cssText = 'opacity: 1; visibility: visible; color: #ff6666;';
            delBtn.textContent = '×';
            delBtn.onclick = () => deleteWish(w.id);
            row.querySelector('.wish-actions').appendChild(delBtn);

            wishFrag.appendChild(row);
        });
        wishCont.appendChild(wishFrag);
    }

    drawSteppedChart();
}

// --- GRAFICO A SCALINI ---
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
    let currentBal = startBal;
    historyPoints.push(currentBal);

    displayTrans.forEach(t => {
        if (t.type === 'in') currentBal = roundCurrency(currentBal + parseFloat(t.amount));
        else currentBal = roundCurrency(currentBal - parseFloat(t.amount));
        historyPoints.push(currentBal);
    });

    const maxBal = Math.max(...historyPoints);
    const minBal = Math.min(...historyPoints);
    
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
}

// --- AZIONI MODALI ---
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

// --- LISTENER FORM ---
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

// --- ELIMINAZIONI E ACQUISTI ---
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
    const cost = roundCurrency(w.cost);
    mBalance = roundCurrency(mBalance - cost);
    mTransactions.push({ 
        id: 'mt_' + Date.now(), 
        type: 'out', 
        amount: cost, 
        desc: `(Wishlist) ${w.title}`, 
        date: todayStr 
    });
    deleteWish(id);
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
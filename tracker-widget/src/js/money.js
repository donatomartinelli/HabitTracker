// --- DATI MONEY ---
let mBalance = parseFloat(localStorage.getItem('m_balance')) || 0.0;
let mTransactions = JSON.parse(localStorage.getItem('m_trans')) || [];
let mRecurring = JSON.parse(localStorage.getItem('m_rec')) || [];
let mWishlist = JSON.parse(localStorage.getItem('m_wish')) || [];

function saveMoneyData() {
    localStorage.setItem('m_balance', mBalance.toString());
    localStorage.setItem('m_trans', JSON.stringify(mTransactions));
    localStorage.setItem('m_rec', JSON.stringify(mRecurring));
    localStorage.setItem('m_wish', JSON.stringify(mWishlist));
}

// --- AUTOMAZIONE PAGAMENTI RICORRENTI ALL'AVVIO ---
function processRecurringPayments() {
    const today = getNow();
    today.setHours(0,0,0,0);

    let madeChanges = false;

    mRecurring.forEach(rec => {
        let lastProc = rec.lastProcessed ? new Date(rec.lastProcessed) : new Date(rec.startDate);
        lastProc.setHours(0,0,0,0);
        
        let startD = new Date(rec.startDate); startD.setHours(0,0,0,0);
        let endD = rec.endDate ? new Date(rec.endDate) : new Date("2099-12-31"); endD.setHours(0,0,0,0);

        // Se oggi è dentro il range temporale della rata
        if (today >= startD && today <= endD) {
            // Controlla ogni giorno tra l'ultima volta elaborata e oggi
            let checkDate = new Date(lastProc);
            checkDate.setDate(checkDate.getDate() + 1); // Parti dal giorno successivo all'ultima volta

            while (checkDate <= today) {
                if (checkDate.getDate() === parseInt(rec.dayOfMonth)) {
                    // È IL GIORNO DELLA RATA! Scala i soldi.
                    mBalance -= parseFloat(rec.amount);
                    mTransactions.push({
                        id: 'mt_' + Date.now() + Math.random(),
                        date: formatDate(checkDate),
                        desc: `(Auto) ${rec.title}`,
                        amount: parseFloat(rec.amount),
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

// --- RENDER DASHBOARD ---
function renderMoneyDashboard() {
    document.getElementById('m-balance-display').innerText = mBalance.toFixed(2);
    
    // ORDINAMENTO CRONOLOGICO ASSOLUTO (Al millisecondo, sfruttando l'ID)
    mTransactions.sort((a,b) => {
        let timeA = parseInt(a.id.split('_')[1]) || new Date(a.date).getTime();
        let timeB = parseInt(b.id.split('_')[1]) || new Date(b.date).getTime();
        return timeB - timeA; // I più recenti in alto
    });
    
    mWishlist.sort((a,b) => a.order - b.order);

    const histCont = document.getElementById('m-history-container');
    histCont.innerHTML = '';
    mTransactions.slice(0, 15).forEach(t => { 
        const isOut = t.type === 'out';
        histCont.innerHTML += `
            <div class="m-item-row ${isOut ? 'out' : 'in'}">
                <div><div class="m-title">${t.desc}</div><div class="m-sub">${t.date}</div></div>
                <div style="display:flex; align-items:center; gap:15px;">
                    <div class="m-amt ${isOut ? 'neg' : 'pos'}">${isOut ? '-' : '+'}€${parseFloat(t.amount).toFixed(2)}</div>
                    <button class="icon-btn delete" onclick="deleteTransaction('${t.id}')">×</button>
                </div>
            </div>`;
    });

    const recCont = document.getElementById('m-recurring-container');
    recCont.innerHTML = '';
    mRecurring.forEach(r => {
        recCont.innerHTML += `
            <div class="m-item-row" style="border-left-color: #888;">
                <div><div class="m-title">${r.title}</div><div class="m-sub">Day ${r.dayOfMonth} | Ends: ${r.endDate || 'Never'}</div></div>
                <div style="display:flex; align-items:center; gap:15px;">
                    <div class="m-amt neg">-€${parseFloat(r.amount).toFixed(2)}</div>
                    <button class="icon-btn delete" onclick="deleteRecurring('${r.id}')">×</button>
                </div>
            </div>`;
    });

    const wishCont = document.getElementById('m-wishlist-container');
    wishCont.innerHTML = '';
    mWishlist.forEach((w, i) => {
        const canAfford = mBalance >= w.cost;
        wishCont.innerHTML += `
            <div class="m-item-row idea">
                <div style="display:flex; gap:10px; align-items:center;">
                    <div style="display:flex; flex-direction:column;">
                        <button class="icon-btn" style="font-size:0.6rem; padding:0;" onclick="moveWish(${i}, -1)">▲</button>
                        <button class="icon-btn" style="font-size:0.6rem; padding:0;" onclick="moveWish(${i}, 1)">▼</button>
                    </div>
                    <div><div class="m-title" style="${canAfford ? 'color:white;' : 'color:#666;'}">${w.title}</div></div>
                </div>
                <div style="display:flex; align-items:center; gap:15px;">
                    <div class="m-amt" style="color: ${canAfford ? '#b08d43' : '#666'}">€${parseFloat(w.cost).toFixed(2)}</div>
                    <div class="m-actions">
                        <button class="btn" style="font-size:0.6rem; padding:4px 8px;" onclick="purchaseIdea('${w.id}')">Buy</button>
                        <button class="icon-btn delete" onclick="deleteWish('${w.id}')">×</button>
                    </div>
                </div>
            </div>`;
    });

    drawSteppedChart();
}

// --- GRAFICO A SCALINI (Dominio discreto, finestra fissa 30, padding dinamico) ---
// --- GRAFICO A SCALINI (Ancorato a destra, Griglia Fissa 30, Caso A) ---
function drawSteppedChart() {
    const svg = document.getElementById('m-chart-svg');
    const polyline = document.getElementById('m-chart-line');
    if (!svg || !polyline) return;
    
    // ViewBox fisso 1000x1000 per svincolarsi dalle dimensioni CSS del contenitore
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');

    // 1. Ordiniamo cronologicamente (dal passato al presente)
    let sortedT = [...mTransactions].sort((a, b) => {
        let timeA = parseInt(a.id.split('_')[1]) || new Date(a.date).getTime();
        let timeB = parseInt(b.id.split('_')[1]) || new Date(b.date).getTime();
        return timeA - timeB; 
    });
    
    // 2. Finestra logica: massimo 30 transazioni
    const maxTrans = 30;
    let displayTrans = sortedT.slice(-maxTrans);
    
    // 3. Calcolo del punto Iniziale (S_0): il saldo originario a ritroso
    let startBal = mBalance;
    for (let i = displayTrans.length - 1; i >= 0; i--) {
        let t = displayTrans[i];
        if(t.type === 'in') startBal -= parseFloat(t.amount);
        else startBal += parseFloat(t.amount);
    }

    // Costruiamo la successione completa dei valori
    let historyPoints = [];
    let currentBal = startBal;
    historyPoints.push(currentBal); // Inseriamo S_0

    displayTrans.forEach(t => {
        if(t.type === 'in') currentBal += parseFloat(t.amount);
        else currentBal -= parseFloat(t.amount);
        historyPoints.push(currentBal);
    });

    // 4. Intorno (Padding dinamico sulle Y): Calcoliamo min/max e aggiungiamo il 5% di respiro
    const maxBal = Math.max(...historyPoints);
    const minBal = Math.min(...historyPoints);
    
    let rawRange = maxBal - minBal;
    if (rawRange === 0) rawRange = 1; // Evita la divisione per 0 in caso di saldo piatto
    
    const padding = rawRange * 0.05; 
    const paddedMax = maxBal + padding;
    const paddedMin = minBal - padding;
    const paddedRange = paddedMax - paddedMin;

    let pointsStr = "";
    const width = 1000;
    const height = 1000;

    // 5. Tracciamento ancorato a DESTRA e geometria a gradino
    // Calcoliamo l'offset iniziale affinché l'ULTIMO punto tocchi esattamente il bordo destro
    const stepWidth = width / maxTrans; 
    const xOffset = width - ((historyPoints.length - 1) * stepWidth);

    for (let i = 0; i < historyPoints.length; i++) {
        let x = xOffset + (i * stepWidth); 
        let y = height - (((historyPoints[i] - paddedMin) / paddedRange) * height);
        
        if (i === 0) {
            pointsStr += `${x},${y} `;
        } else {
            // Gradino A: mantiene il livello Y orizzontalmente fino alla nuova X, poi scatto verticale
            let prevY = height - (((historyPoints[i-1] - paddedMin) / paddedRange) * height);
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
    const amount = parseFloat(document.getElementById('m-trans-amount').value);
    if(type === 'in') mBalance += amount; else mBalance -= amount;
    
    mTransactions.push({
        id: 'mt_' + Date.now(),
        type: type,
        amount: amount,
        desc: document.getElementById('m-trans-desc').value.trim(),
        date: document.getElementById('m-trans-date').value
    });
    saveMoneyData(); closeModals(); renderMoneyDashboard();
});

document.getElementById('mRecurringForm').addEventListener('submit', (e) => {
    e.preventDefault();
    mRecurring.push({
        id: 'mr_' + Date.now(),
        title: document.getElementById('m-rec-title').value.trim(),
        amount: document.getElementById('m-rec-amount').value,
        dayOfMonth: document.getElementById('m-rec-day').value,
        startDate: document.getElementById('m-rec-start').value,
        endDate: document.getElementById('m-rec-end').value || null,
        lastProcessed: null
    });
    saveMoneyData(); closeModals(); renderMoneyDashboard();
});

document.getElementById('mWishlistForm').addEventListener('submit', (e) => {
    e.preventDefault();
    mWishlist.push({
        id: 'mw_' + Date.now(),
        title: document.getElementById('m-wish-title').value.trim(),
        cost: document.getElementById('m-wish-cost').value,
        order: mWishlist.length
    });
    saveMoneyData(); closeModals(); renderMoneyDashboard();
});

// --- ELIMINAZIONI E ACQUISTI ---
function deleteTransaction(id) {
    const t = mTransactions.find(x => x.id === id);
    if(!t) return;
    if(t.type === 'in') mBalance -= t.amount; else mBalance += t.amount;
    mTransactions = mTransactions.filter(x => x.id !== id);
    saveMoneyData(); renderMoneyDashboard();
}

function deleteRecurring(id) { mRecurring = mRecurring.filter(x => x.id !== id); saveMoneyData(); renderMoneyDashboard(); }
function deleteWish(id) { mWishlist = mWishlist.filter(x => x.id !== id); saveMoneyData(); renderMoneyDashboard(); }

function purchaseIdea(id) {
    const w = mWishlist.find(x => x.id === id);
    if(!w) return;
    mBalance -= parseFloat(w.cost);
    mTransactions.push({ id: 'mt_' + Date.now(), type: 'out', amount: w.cost, desc: `(Wishlist) ${w.title}`, date: todayStr });
    deleteWish(id); // Salva e renderizza in automatico
}

function moveWish(index, dir) {
    if(index + dir < 0 || index + dir >= mWishlist.length) return;
    const temp = mWishlist[index].order;
    mWishlist[index].order = mWishlist[index + dir].order;
    mWishlist[index + dir].order = temp;
    saveMoneyData(); renderMoneyDashboard();
}

// INIZIALIZZAZIONE MONEY ALL'AVVIO
processRecurringPayments();
renderMoneyDashboard();
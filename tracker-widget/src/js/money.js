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

// --- GRAFICO A SCALINI (Basato sulle singole transazioni, non sui giorni) ---
function drawSteppedChart() {
    const svg = document.getElementById('m-chart-svg');
    const polyline = document.getElementById('m-chart-line');
    if (!svg || !polyline) return;
    
    // FIX: Se il tab è nascosto, clientWidth è 0. Interrompiamo per ridisegnarlo al momento dell'apertura
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (width === 0 || height === 0) return;

    let historyPoints = [];
    let currentBal = mBalance;
    
    // Il punto finale attuale
    historyPoints.push(currentBal);

    // Prendiamo le ultime 30 transazioni cronologiche per costruire i gradini precisi
    let recentTrans = [...mTransactions].sort((a, b) => {
        let timeA = parseInt(a.id.split('_')[1]) || new Date(a.date).getTime();
        let timeB = parseInt(b.id.split('_')[1]) || new Date(b.date).getTime();
        return timeB - timeA; 
    }).slice(0, 30);
    
    // Andiamo indietro calcolando il saldo *prima* di ogni transazione
    recentTrans.forEach(t => {
        if(t.type === 'in') currentBal -= parseFloat(t.amount);
        else currentBal += parseFloat(t.amount);
        // Aggiungiamo in testa all'array (per andare da sx verso dx nel grafico)
        historyPoints.unshift(currentBal);
    });

    const maxBal = Math.max(...historyPoints, mBalance + 5);
    const minBal = Math.min(...historyPoints, 0); // Non va sotto lo zero nel calcolo scala
    const rangeY = (maxBal - minBal) || 1;

    let pointsStr = "";
    for (let i = 0; i < historyPoints.length; i++) {
        let x = (i / (historyPoints.length - 1)) * width;
        let y = height - (((historyPoints[i] - minBal) / rangeY) * height);
        
        if (i === 0) {
            pointsStr += `${x},${y} `;
        } else {
            // STEP: Disegna prima orizzontale al livello precedente, poi scende/sale verticale
            let prevY = height - (((historyPoints[i-1] - minBal) / rangeY) * height);
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

// --- GRAFICO A SCALINI ---
function drawSteppedChart() {
    const svg = document.getElementById('m-chart-svg');
    const polyline = document.getElementById('m-chart-line');
    if (!svg || !polyline) return;
    
    // Calcoliamo lo storico a ritroso
    let historyPoints = [];
    let tempBalance = mBalance;
    historyPoints.push({ date: new Date(), bal: tempBalance });

    // Ordina dal più recente al più vecchio per il calcolo
    let sortedT = [...mTransactions].sort((a,b) => new Date(b.date) - new Date(a.date));
    
    // Andiamo indietro di 30 giorni max
    let pastDate = new Date();
    for(let i=0; i<30; i++) {
        let dStr = formatDate(pastDate);
        let transOnDay = sortedT.filter(t => t.date === dStr);
        // Per tornare al saldo *prima* di questa giornata, togliamo le entrate e sommiamo le uscite
        transOnDay.forEach(t => {
            if(t.type === 'in') tempBalance -= parseFloat(t.amount);
            else tempBalance += parseFloat(t.amount);
        });
        pastDate.setDate(pastDate.getDate() - 1);
        historyPoints.unshift({ date: new Date(pastDate), bal: tempBalance }); // unshift per metterlo in ordine cronologico
    }

    // Troviamo min e max
    const maxBal = Math.max(...historyPoints.map(p => p.bal), mBalance + 10);
    const minBal = Math.min(...historyPoints.map(p => p.bal), 0);
    const rangeY = (maxBal - minBal) || 1;

    // Costruiamo i punti SVG per una linea a gradini (stepped)
    let pointsStr = "";
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    
    for (let i = 0; i < historyPoints.length; i++) {
        let x = (i / (historyPoints.length - 1)) * width;
        let y = height - (((historyPoints[i].bal - minBal) / rangeY) * height);
        
        if (i === 0) {
            pointsStr += `${x},${y} `;
        } else {
            // STEP: Disegna prima in orizzontale, poi in verticale
            let prevX = ((i - 1) / (historyPoints.length - 1)) * width;
            pointsStr += `${x},${height - (((historyPoints[i-1].bal - minBal) / rangeY) * height)} `;
            pointsStr += `${x},${y} `;
        }
    }
    polyline.setAttribute("points", pointsStr);
}

// INIZIALIZZAZIONE MONEY ALL'AVVIO
processRecurringPayments();
renderMoneyDashboard();
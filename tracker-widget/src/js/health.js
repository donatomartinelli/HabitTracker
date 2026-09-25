// --- DATI HEALTH (Hardcoded dai PDF forniti) ---

// Piano Dietetico
const dietData = [
    { type: 'Spuntino 1', 1: 'MilkPro 200g', 2: 'MilkPro 200g', 3: 'Anacardi 20g', 4: 'MilkPro 200g', 5: 'Anacardi 20g', 6: 'MilkPro 200g', 0: 'Anacardi 20g' },
    { type: 'Pranzo', 1: 'Soncino 100g\nRiso 160g\nVitellone 200g', 2: 'Rucola 100g\nRiso 160g\nTonno 90g', 3: 'Soncino 100g\nRiso 90g\nCeci 120g\nTonno 100g', 4: 'Rucola 100g\nRiso 160g\nVitellone 200g', 5: 'Soncino 100g\nRiso 90g\nCeci 120g\n2 Uova', 6: 'Rucola 100g\nRiso 160g\nTonno 90g', 0: 'Soncino 100g\nPasta\nVitellone 200g' },
    { type: 'Spuntino 2', 1: 'MilkPro 150g\nBanana', 2: 'MilkPro 150g\nBanana', 3: 'Kefir 200g\nBanana', 4: 'MilkPro 150g\nBanana', 5: 'Kefir 200g\nBanana', 6: 'MilkPro 150g\nBanana', 0: 'Kefir 200g\nBanana' },
    { type: 'Cena', 1: 'Spinaci 100g\nMerluzzo 250g\nPane 50g', 2: 'Spinaci 100g\nPollo 200g\nPane 50g', 3: 'Spinaci 100g\nBresaola 100g\nPane 50g', 4: 'Spinaci 100g\nSalmone 100g\nPane 50g', 5: 'Spinaci 100g\nPollo 200g\nPane 50g', 6: '[ PASTO\nLIBERO ]', 0: 'Spinaci 100g\nTonno 70g\nRobiola 30g\nPane 50g' }
];

// Scheda Palestra (Giorno 1 e 2)
const gymPlan = {
    1: [
        { id: "g1_1", name: "Panca Inclinata 2 Manubri", repStr: "4x5-8", sets: 4 },
        { id: "g1_2", name: "Panca Piana Multipower", repStr: "8-8-6", sets: 3 },
        { id: "g1_3", name: "Croci in Piedi Cavi Bassi", repStr: "2x12 + 10 parziali", sets: 2 },
        { id: "g1_4", name: "Shoulder Press", repStr: "3x5-8", sets: 3 },
        { id: "g1_5", name: "Alzate Laterali Deltoid", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g1_6", name: "Curl Bicheps-Machine", repStr: "10-8-8", sets: 3 },
        { id: "g1_7", name: "Curl Alt. Seduto Panca Incl.", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g1_8", name: "Crunch Machine", repStr: "3xMax", sets: 0 }, // Bodyweight
        { id: "g1_9", name: "Plank Busto Scorrimento", repStr: "3xMax", sets: 0 }
    ],
    2: [
        { id: "g2_1", name: "Lat Machine Avanti", repStr: "4x5-8", sets: 4 },
        { id: "g2_2", name: "Rematore In Piedi T-Bar", repStr: "8-8-6", sets: 3 },
        { id: "g2_3", name: "Pull Down Cavo Alto", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g2_4", name: "Push Down Sbarra 2 Maniglie", repStr: "10-8-8", sets: 3 },
        { id: "g2_5", name: "Kick Back Seduto 1 Manubrio", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g2_6", name: "Leg Press Inclinata", repStr: "3x5-8", sets: 3 },
        { id: "g2_7", name: "Leg Extension", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g2_8", name: "Leg Curl", repStr: "12-12-10", sets: 3 },
        { id: "g2_9", name: "Chiusure A Libro Gambe Tese", repStr: "3xMax", sets: 0 }
    ]
};

// --- LOGICA DI STATO ---
let nextWorkoutDay = parseInt(localStorage.getItem('tracker_gym_next')) || 1;
let gymLogs = JSON.parse(localStorage.getItem('tracker_gym_logs')) || [];

function toggleHealthMode() {
    const isGym = document.getElementById('health-mode-checkbox').checked;
    const mainArea = document.getElementById('health-main-content');
    const sideArea = document.getElementById('health-side-content');
    
    mainArea.innerHTML = '';
    sideArea.innerHTML = '';

    if (isGym) {
        renderGymMode(mainArea, sideArea);
    } else {
        renderDietMode(mainArea, sideArea);
    }
}

// --- MODALITÀ DIETA ---
function renderDietMode(mainArea, sideArea) {
    // Left Pane: Weekly Grid
    const todayJS = new Date(selectedDateStr).getDay(); // Usiamo la data selezionata nel planner

    let html = `<div class="diet-wrapper">
                    <div class="diet-row">
                        <div class="diet-header" style="background:transparent; border:none;"></div>
                        <div class="diet-header ${todayJS === 1 ? 'diet-col-active' : ''}">LUN</div>
                        <div class="diet-header ${todayJS === 2 ? 'diet-col-active' : ''}">MAR</div>
                        <div class="diet-header ${todayJS === 3 ? 'diet-col-active' : ''}">MER</div>
                        <div class="diet-header ${todayJS === 4 ? 'diet-col-active' : ''}">GIO</div>
                        <div class="diet-header ${todayJS === 5 ? 'diet-col-active' : ''}">VEN</div>
                        <div class="diet-header ${todayJS === 6 ? 'diet-col-active' : ''}">SAB</div>
                        <div class="diet-header ${todayJS === 0 ? 'diet-col-active' : ''}">DOM</div>
                    </div>`;

    dietData.forEach(row => {
        html += `<div class="diet-row">
                    <div class="diet-cell diet-row-label">${row.type}</div>
                    <div class="diet-cell ${todayJS === 1 ? 'diet-col-active' : ''}">${row[1]}</div>
                    <div class="diet-cell ${todayJS === 2 ? 'diet-col-active' : ''}">${row[2]}</div>
                    <div class="diet-cell ${todayJS === 3 ? 'diet-col-active' : ''}">${row[3]}</div>
                    <div class="diet-cell ${todayJS === 4 ? 'diet-col-active' : ''}">${row[4]}</div>
                    <div class="diet-cell ${todayJS === 5 ? 'diet-col-active' : ''}">${row[5]}</div>
                    <div class="diet-cell ${todayJS === 6 ? 'diet-col-active' : ''}">${row[6]}</div>
                    <div class="diet-cell ${todayJS === 0 ? 'diet-col-active' : ''}">${row[0]}</div>
                 </div>`;
    });
    html += `</div>`;
    mainArea.innerHTML = html;

    // Right Pane: Regole Fisse
    sideArea.innerHTML = `
        <h2 style="color: white; margin-bottom: 20px;">Regole Fisse</h2>
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 20px; color: #ccc; font-size: 0.85rem; line-height: 1.6;">
            <p><strong style="color:white;">COLAZIONE:</strong><br>200g Latte + 20g Biscotti + 10g Cioccolato Fondente</p>
            <div style="height:1px; background:var(--border-color); margin: 15px 0;"></div>
            <p><strong style="color:white;">CONDIMENTO:</strong><br>15g Olio EVO (Pranzo, Cena)</p>
            <div style="height:1px; background:var(--border-color); margin: 15px 0;"></div>
            <p><strong style="color:white;">ACQUA:</strong><br>Minimo 3L / Giorno</p>
        </div>
    `;
}

// --- MODALITÀ PALESTRA ---
function renderGymMode(mainArea, sideArea) {
    const exercises = gymPlan[nextWorkoutDay];
    
    // Left Pane: Form di Log
    let html = `<div class="gym-header-bar">
                    <h3 style="margin:0; color:white; font-size: 1.1rem;">Schedulato: GIORNO ${nextWorkoutDay}</h3>
                    <button class="btn btn-primary" onclick="saveGymSession()">Salva Allenamento</button>
                </div>`;
                
    exercises.forEach((ex, idx) => {
        let inputsHtml = '';
        if (ex.sets > 0) {
            for (let i = 0; i < ex.sets; i++) {
                inputsHtml += `<input type="number" class="gym-weight-input no-spinners" id="gw_${ex.id}_${i}" placeholder="kg">`;
            }
        } else {
            inputsHtml = `<span style="font-size:0.75rem; color:var(--text-dim);">Bodyweight</span>`;
        }

        html += `<div class="gym-exercise-row">
                    <div>
                        <div class="gym-ex-title">${ex.name}</div>
                        <div class="gym-ex-reps">Rep: ${ex.repStr}</div>
                    </div>
                    <div class="gym-sets-container">
                        ${inputsHtml}
                    </div>
                 </div>`;
    });
    mainArea.innerHTML = html;

    // Right Pane: Grafico Linee
    let optionsHtml = `<option value="">-- Seleziona Esercizio --</option>`;
    // Uniamo tutti gli esercizi per la tendina
    [...gymPlan[1], ...gymPlan[2]].filter(e => e.sets > 0).forEach(e => {
        optionsHtml += `<option value="${e.id}">${e.name}</option>`;
    });

    sideArea.innerHTML = `
        <h2 style="color: white; margin-bottom: 20px;">Progressione Carichi</h2>
        <select id="gym-chart-select" class="form-control" style="margin-bottom: 20px; font-weight: bold;" onchange="drawGymChart()">
            ${optionsHtml}
        </select>
        <div style="flex: 1; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 15px; position: relative;">
            <svg id="g-chart-svg" width="100%" height="100%" preserveAspectRatio="none" style="overflow: visible;">
                <polyline id="g-chart-line" fill="none" stroke="#5f7a61" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
            </svg>
        </div>
    `;
}

// Salva e slitta la macchina a stati
function saveGymSession() {
    const exercises = gymPlan[nextWorkoutDay];
    let sessionData = {
        date: todayStr, // Salva la data in cui si clicca
        dayType: nextWorkoutDay,
        weights: {}
    };

    let hasData = false;
    exercises.forEach(ex => {
        if (ex.sets > 0) {
            let setsData = [];
            for (let i = 0; i < ex.sets; i++) {
                let val = document.getElementById(`gw_${ex.id}_${i}`).value;
                setsData.push(val ? parseFloat(val) : 0);
                if (val) hasData = true;
            }
            // Salviamo il peso massimo sollevato in quell'esercizio come metrica principale
            sessionData.weights[ex.id] = Math.max(...setsData);
        }
    });

    if (!hasData) {
        alert("Inserisci almeno un peso prima di salvare!");
        return;
    }

    gymLogs.push(sessionData);
    localStorage.setItem('tracker_gym_logs', JSON.stringify(gymLogs));

    // Slittamento rigido (Macchina a stati)
    nextWorkoutDay = nextWorkoutDay === 1 ? 2 : 1;
    localStorage.setItem('tracker_gym_next', nextWorkoutDay);

    toggleHealthMode(); // Ricarica la UI
}

// Disegna il grafico a linee per l'esercizio (Point to Point, non a scalini)
function drawGymChart() {
    const svg = document.getElementById('g-chart-svg');
    const polyline = document.getElementById('g-chart-line');
    const exId = document.getElementById('gym-chart-select').value;
    
    if (!svg || !polyline || !exId) {
        if (polyline) polyline.setAttribute("points", "");
        return;
    }

    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');

    // Filtriamo i log che contengono questo esercizio e li ordiniamo cronologicamente
    let exLogs = gymLogs.filter(log => log.weights && log.weights[exId] !== undefined && log.weights[exId] > 0)
                        .sort((a,b) => new Date(a.date) - new Date(b.date));

    if (exLogs.length === 0) {
        polyline.setAttribute("points", "");
        return;
    }

    const historyPoints = exLogs.map(log => log.weights[exId]);
    const maxWeight = Math.max(...historyPoints);
    const minWeight = Math.min(...historyPoints);
    
    let rawRange = maxWeight - minWeight;
    if (rawRange === 0) rawRange = 10; 

    const padding = rawRange * 0.2; // 20% respiro
    const paddedMax = maxWeight + padding;
    const paddedMin = minWeight - padding;
    const paddedRange = paddedMax - paddedMin;

    let pointsStr = "";
    const width = 1000;
    const height = 1000;

    // Grafico a Linee (Diagonale, non a scalini)
    if (historyPoints.length === 1) {
        // Se c'è solo un punto, linea dritta
        let y = height - (((historyPoints[0] - paddedMin) / paddedRange) * height);
        pointsStr = `0,${y} ${width},${y}`;
    } else {
        const stepWidth = width / (historyPoints.length - 1);
        for (let i = 0; i < historyPoints.length; i++) {
            let x = i * stepWidth;
            let y = height - (((historyPoints[i] - paddedMin) / paddedRange) * height);
            pointsStr += `${x},${y} `;
        }
    }

    polyline.setAttribute("points", pointsStr.trim());
}

// Inizializza al volo la tab se aperta
toggleHealthMode();
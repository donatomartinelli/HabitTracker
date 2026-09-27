// --- DATI HEALTH (Dieta e Palestra) ---
const dietData = [
    { type: 'Spuntino 1', 1: 'MilkPro 200g', 2: 'MilkPro 200g', 3: 'Anacardi 20g', 4: 'MilkPro 200g', 5: 'Anacardi 20g', 6: 'MilkPro 200g', 0: 'Anacardi 20g' },
    { type: 'Pranzo', 1: 'Soncino 100g\nRiso 160g\nVitellone 200g', 2: 'Rucola 100g\nRiso 160g\nTonno 90g', 3: 'Soncino 100g\nRiso 90g\nCeci 120g\nTonno 100g', 4: 'Rucola 100g\nRiso 160g\nVitellone 200g', 5: 'Soncino 100g\nRiso 90g\nCeci 120g\n2 Uova', 6: 'Rucola 100g\nRiso 160g\nTonno 90g', 0: 'Soncino 100g\nPasta\nVitellone 200g' },
    { type: 'Spuntino 2', 1: 'MilkPro 150g\nBanana', 2: 'MilkPro 150g\nBanana', 3: 'Kefir 200g\nBanana', 4: 'MilkPro 150g\nBanana', 5: 'Kefir 200g\nBanana', 6: 'MilkPro 150g\nBanana', 0: 'Kefir 200g\nBanana' },
    { type: 'Cena', 1: 'Spinaci 100g\nMerluzzo 250g\nPane 50g', 2: 'Spinaci 100g\nPollo 200g\nPane 50g', 3: 'Spinaci 100g\nBresaola 100g\nPane 50g', 4: 'Spinaci 100g\nSalmone 100g\nPane 50g', 5: 'Spinaci 100g\nPollo 200g\nPane 50g', 6: '[ PASTO\nLIBERO ]', 0: 'Spinaci 100g\nTonno 70g\nRobiola 30g\nPane 50g' }
];

const gymPlan = {
    1: [
        { id: "g1_1", name: "Panca Inclinata 2 Manubri", repStr: "4x5-8", sets: 4 },
        { id: "g1_2", name: "Panca Piana Multipower", repStr: "8-8-6", sets: 3 },
        { id: "g1_3", name: "Croci in Piedi Cavi Bassi", repStr: "2x12 + 10 parziali", sets: 2 },
        { id: "g1_4", name: "Shoulder Press", repStr: "3x5-8", sets: 3 },
        { id: "g1_5", name: "Alzate Laterali Deltoid", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g1_6", name: "Curl Bicheps-Machine", repStr: "10-8-8", sets: 3 },
        { id: "g1_7", name: "Curl Alt. Seduto Panca Incl.", repStr: "2x12 + 1xmax - 20%", sets: 2 },
        { id: "g1_8", name: "Crunch Machine", repStr: "3xMax", sets: 0 },
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

// Variabili di stato salvate
let nextWorkoutDay = parseInt(localStorage.getItem('tracker_gym_next')) || 1;
let savedGymWeights = JSON.parse(localStorage.getItem('tracker_gym_weights')) || {};

// Inizializzazione Globale Health
function renderHealthDashboard() {
    renderDiet();
    
    // Carica le date salvate
    document.getElementById('gym-start-date').value = localStorage.getItem('gym_start_date') || "";
    document.getElementById('gym-end-date').value = localStorage.getItem('gym_end_date') || "";
    
    renderGym();
}

function renderDiet() {
    const mainArea = document.getElementById('diet-main-content');
    const todayJS = new Date(selectedDateStr).getDay();

    let html = `<div class="diet-wrapper">
                    <div class="diet-row">
                        <div class="diet-header" style="border:none;"></div>
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
}

function renderGym() {
    const mainArea = document.getElementById('gym-main-content');
    let html = '';

    [1, 2].forEach(dayNum => {
        const isActive = (dayNum === nextWorkoutDay);
        const cardClass = isActive ? 'gym-day-active' : 'gym-day-inactive';
        
        html += `<div class="gym-day-card ${cardClass}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="margin:0; font-size:0.9rem; color: ${isActive ? 'white' : 'var(--text-dim)'};">GIORNO ${dayNum}</h3>
                        ${isActive ? `<button class="btn btn-primary" style="padding: 4px 10px; font-size: 0.7rem;" onclick="completeWorkout(${dayNum})">✓ DONE</button>` : ''}
                    </div>
                    <div class="gym-ex-list">`;
        
        gymPlan[dayNum].forEach(ex => {
            let inputsHtml = '';
            if (ex.sets > 0) {
                for (let i = 0; i < ex.sets; i++) {
                    const inputId = `gw_${ex.id}_${i}`;
                    const lastWeight = savedGymWeights[inputId] || '';
                    inputsHtml += `<input type="number" class="gym-input no-spinners" id="${inputId}" placeholder="kg" value="${lastWeight}">`;
                }
            } else {
                inputsHtml = `<span style="font-size:0.65rem; color:var(--text-dim);">BW</span>`;
            }

            html += `<div class="gym-ex-row">
                        <div class="gym-ex-info">
                            <span class="gym-ex-name">${ex.name}</span>
                            <span class="gym-ex-reps">${ex.repStr}</span>
                        </div>
                        <div class="gym-sets-container">${inputsHtml}</div>
                     </div>`;
        });
        html += `</div></div>`;
    });

    mainArea.innerHTML = html;
}

// Azione "DONE": Salva i pesi, slitta il giorno e ricarica
function completeWorkout(dayNum) {
    // 1. Memorizza i pesi inseriti
    gymPlan[dayNum].forEach(ex => {
        if (ex.sets > 0) {
            for (let i = 0; i < ex.sets; i++) {
                const inputId = `gw_${ex.id}_${i}`;
                const val = document.getElementById(inputId).value;
                if (val) savedGymWeights[inputId] = val;
            }
        }
    });
    localStorage.setItem('tracker_gym_weights', JSON.stringify(savedGymWeights));

    // 2. Inverte il giorno attivo
    nextWorkoutDay = nextWorkoutDay === 1 ? 2 : 1;
    localStorage.setItem('tracker_gym_next', nextWorkoutDay);

    // 3. Ridisegna
    renderGym();
}

// Aggiorna le date e le inietta nel calendario di Overview
function updateGymDates() {
    const start = document.getElementById('gym-start-date').value;
    const end = document.getElementById('gym-end-date').value;
    
    localStorage.setItem('gym_start_date', start);
    localStorage.setItem('gym_end_date', end);

    // Sincronizza con tracker_events (CRUD)
    let events = JSON.parse(localStorage.getItem('tracker_events')) || [];
    // Pulisce i vecchi
    events = events.filter(e => e.id !== 'gym_start_evt' && e.id !== 'gym_end_evt');
    
    // Aggiunge i nuovi come puntini
    if (start) events.push({ id: 'gym_start_evt', date: start, title: 'Inizio Scheda', category: 'Health', color: '#5f7a61' });
    if (end) events.push({ id: 'gym_end_evt', date: end, title: 'Scadenza Scheda', category: 'Health', color: '#ff6666' });
    
    localStorage.setItem('tracker_events', JSON.stringify(events));
    
    // Aggiorna i render esterni se le funzioni esistono nello scope globale
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderTasks === 'function') renderTasks();
}
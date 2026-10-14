// --- HEALTH MODULE (DYNAMIC DIET & WORKOUT SPLIT) ---

let isEditingGymPlan = false;

function renderHealthDashboard() {
    renderDiet();
    renderMeds();
    
    const startInput = document.getElementById('gym-start-date');
    const endInput = document.getElementById('gym-end-date');
    if (startInput) startInput.value = gymStartDate;
    if (endInput) endInput.value = gymEndDate;
    
    ensureGymEditButton();
    renderGym();
}

function ensureGymEditButton() {
    const startInput = document.getElementById('gym-start-date');
    if (!startInput || document.getElementById('btn-toggle-gym-edit')) return;
    
    const bar = startInput.parentElement;
    const btn = document.createElement('button');
    btn.id = 'btn-toggle-gym-edit';
    btn.className = 'btn btn-sm';
    btn.style.marginLeft = '8px';
    btn.textContent = '[EDIT SPLIT]';
    btn.onclick = toggleGymEditMode;
    bar.appendChild(btn);
}

function toggleGymEditMode() {
    isEditingGymPlan = !isEditingGymPlan;
    const btn = document.getElementById('btn-toggle-gym-edit');
    if (btn) {
        btn.textContent = isEditingGymPlan ? '[DONE EDIT]' : '[EDIT SPLIT]';
        btn.className = isEditingGymPlan ? 'btn btn-primary btn-sm' : 'btn btn-sm';
    }
    renderGym();
}

function renderMeds() {
    let container = document.getElementById('meds-main-content');
    
    if (!container) {
        const dietDiv = document.getElementById('diet-main-content');
        if (!dietDiv || !dietDiv.parentElement) return;
        container = document.createElement('div');
        container.id = 'meds-main-content';
        container.style.cssText = 'flex: 0 0 auto; padding: 8px 12px; margin: 12px 0 0 0; background: rgba(255,255,255,0.015); border: 1px solid var(--border-color);';
        dietDiv.parentElement.insertAdjacentElement('afterend', container);
    }

    const meds = templates.filter(t => t.type === 'medicine');
    if (meds.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; align-items:center; gap:20px; flex-wrap:wrap; font-size:var(--font-xs); text-transform:uppercase;';
    
    meds.forEach(m => {
        const isLow = m.stock <= (m.alertDays * m.instances);
        const color = isLow ? 'var(--accent-red)' : 'var(--text-dim)';
        const tagColor = isLow ? 'var(--accent-red)' : '#4c5b73';
        
        const item = document.createElement('span');
        item.style.cssText = `color:${color}; display:flex; align-items:center; gap:6px;`;
        item.innerHTML = `
            <strong style="color:${tagColor};">[MED]</strong> 
            <span style="color:white; font-weight:bold;">${escapeHtml(m.title)}</span> 
            (${m.instances}/DAY) <span style="margin:0 4px;">|</span> STOCK: <b>${m.stock}</b>
        `;
        wrap.appendChild(item);
    });
    
    container.appendChild(wrap);
}

function renderDiet() {
    const mainArea = document.getElementById('diet-main-content');
    if (!mainArea) return;
    mainArea.innerHTML = '';

    const todayJS = new Date(selectedDateStr).getDay();
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    const wrapper = document.createElement('div');
    wrapper.className = 'diet-wrapper';

    const headerRow = document.createElement('div');
    headerRow.className = 'diet-row';

    const emptyCorner = document.createElement('div');
    emptyCorner.className = 'diet-header';
    emptyCorner.textContent = 'MEAL';
    headerRow.appendChild(emptyCorner);

    dayOrder.forEach((dVal, idx) => {
        const hCell = document.createElement('div');
        hCell.className = `diet-header ${todayJS === dVal ? 'diet-col-active' : ''}`;
        hCell.textContent = dayLabels[idx];
        headerRow.appendChild(hCell);
    });
    wrapper.appendChild(headerRow);

    dietData.forEach((rowObj, rowIdx) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'diet-row';

        const labelCell = document.createElement('div');
        labelCell.className = 'diet-cell diet-row-label';
        labelCell.textContent = rowObj.type;
        rowEl.appendChild(labelCell);

        dayOrder.forEach(dVal => {
            const cell = document.createElement('div');
            cell.className = `diet-cell ${todayJS === dVal ? 'diet-col-active' : ''}`;
            cell.title = "Double-click to edit meal";
            cell.textContent = rowObj[dVal] || '';

            cell.ondblclick = () => startDietCellEdit(cell, rowIdx, dVal);
            rowEl.appendChild(cell);
        });

        wrapper.appendChild(rowEl);
    });

    mainArea.appendChild(wrapper);

    const rulesEl = document.getElementById('diet-rules');
    if (rulesEl) {
        rulesEl.title = "Double-click to edit diet rules";
        rulesEl.style.cursor = 'pointer';
        rulesEl.textContent = dietRules;
        rulesEl.ondblclick = () => startDietRulesEdit(rulesEl);
    }
}

function startDietCellEdit(cell, rowIdx, dayKey) {
    if (cell.querySelector('textarea')) return;
    const currentVal = dietData[rowIdx][dayKey] || '';
    cell.innerHTML = '';

    const ta = document.createElement('textarea');
    ta.className = 'diet-inline-editor';
    ta.value = currentVal;

    const commit = () => {
        dietData[rowIdx][dayKey] = ta.value.trim();
        saveHealthData();
        renderDiet();
        if (typeof showToast === 'function') showToast('[DIET] Meal updated');
    };

    ta.onblur = commit;
    ta.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            ta.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            renderDiet();
        }
    };

    cell.appendChild(ta);
    ta.focus();
}

function startDietRulesEdit(rulesEl) {
    if (rulesEl.querySelector('input')) return;
    const currentVal = dietRules;
    rulesEl.innerHTML = '';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'form-control form-control-sm';
    inp.value = currentVal;

    const commit = () => {
        dietRules = inp.value.trim() || DEFAULT_DIET_RULES;
        saveHealthData();
        renderDiet();
        if (typeof showToast === 'function') showToast('[DIET] Rules updated');
    };

    inp.onblur = commit;
    inp.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            inp.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            renderDiet();
        }
    };

    rulesEl.appendChild(inp);
    inp.focus();
}

function renderGym() {
    const mainArea = document.getElementById('gym-main-content');
    if (!mainArea) return;
    mainArea.innerHTML = '';

    [1, 2].forEach(dayNum => {
        if (!gymPlan[dayNum]) gymPlan[dayNum] = [];
        const isActive = (dayNum === nextWorkoutDay);
        let cardClass = isActive ? 'gym-day-active' : 'gym-day-inactive';
        if (isEditingGymPlan) cardClass = 'gym-day-editing';

        const card = document.createElement('div');
        card.className = `gym-day-card ${cardClass}`;

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';

        const title = document.createElement('h3');
        title.style.cssText = `margin:0; font-size:var(--font-sm); color: ${(isActive || isEditingGymPlan) ? 'white' : 'var(--text-dim)'}; cursor: pointer; text-transform: uppercase;`;
        title.title = "Click to set as active workout day";
        title.textContent = `DAY ${dayNum} ${isActive ? '// ACTIVE' : ''}`;
        title.onclick = () => {
            nextWorkoutDay = dayNum;
            saveHealthData();
            renderGym();
        };
        header.appendChild(title);

        if (isActive && !isEditingGymPlan) {
            const doneBtn = document.createElement('button');
            doneBtn.className = 'btn btn-primary btn-sm';
            doneBtn.textContent = '[DONE]';
            doneBtn.onclick = () => completeWorkout(dayNum);
            header.appendChild(doneBtn);
        }

        card.appendChild(header);

        const list = document.createElement('div');
        list.className = 'gym-ex-list';

        gymPlan[dayNum].forEach((ex, exIdx) => {
            const row = document.createElement('div');
            row.className = 'gym-ex-row';

            if (isEditingGymPlan) {
                const nameInp = document.createElement('input');
                nameInp.type = 'text';
                nameInp.className = 'gym-edit-input';
                nameInp.style.flex = '2';
                nameInp.value = ex.name;
                nameInp.placeholder = 'Exercise name';
                nameInp.onchange = () => {
                    ex.name = nameInp.value.trim() || 'Exercise';
                    saveHealthData();
                };

                const repsInp = document.createElement('input');
                repsInp.type = 'text';
                repsInp.className = 'gym-edit-input';
                repsInp.style.width = '95px';
                repsInp.value = ex.repStr;
                repsInp.placeholder = 'e.g. 4x8';
                repsInp.onchange = () => {
                    ex.repStr = repsInp.value.trim();
                    saveHealthData();
                };

                const setsInp = document.createElement('input');
                setsInp.type = 'number';
                setsInp.min = '0';
                setsInp.max = '10';
                setsInp.className = 'gym-edit-input no-spinners';
                setsInp.style.cssText = 'width: 38px; text-align: center;';
                setsInp.title = 'Number of weight boxes (0 = bodyweight)';
                setsInp.value = ex.sets;
                setsInp.onchange = () => {
                    ex.sets = Math.max(0, Math.min(10, parseInt(setsInp.value, 10) || 0));
                    saveHealthData();
                };

                const delBtn = document.createElement('button');
                delBtn.className = 'icon-btn delete';
                delBtn.textContent = '[X]';
                delBtn.onclick = () => {
                    gymPlan[dayNum].splice(exIdx, 1);
                    saveHealthData();
                    renderGym();
                };

                row.appendChild(nameInp);
                row.appendChild(repsInp);
                row.appendChild(setsInp);
                row.appendChild(delBtn);
            } else {
                const info = document.createElement('div');
                info.className = 'gym-ex-info';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'gym-ex-name';
                nameSpan.textContent = ex.name;

                const repsSpan = document.createElement('span');
                repsSpan.className = 'gym-ex-reps';
                repsSpan.textContent = ex.repStr;

                info.appendChild(nameSpan);
                info.appendChild(repsSpan);

                const setsCont = document.createElement('div');
                setsCont.className = 'gym-sets-container';

                if (ex.sets > 0) {
                    for (let i = 0; i < ex.sets; i++) {
                        const inputId = `gw_${ex.id}_${i}`;
                        const wInp = document.createElement('input');
                        wInp.type = 'number';
                        wInp.step = '0.5';
                        wInp.className = 'gym-input no-spinners';
                        wInp.id = inputId;
                        wInp.placeholder = 'kg';
                        wInp.value = savedGymWeights[inputId] || '';
                        wInp.oninput = () => {
                            savedGymWeights[inputId] = wInp.value;
                            saveHealthData();
                        };
                        setsCont.appendChild(wInp);
                    }
                } else {
                    const bwSpan = document.createElement('span');
                    bwSpan.style.cssText = 'font-size:var(--font-xs); color:var(--text-dim);';
                    bwSpan.textContent = 'BW';
                    setsCont.appendChild(bwSpan);
                }

                row.appendChild(info);
                row.appendChild(setsCont);
            }

            list.appendChild(row);
        });

        card.appendChild(list);

        if (isEditingGymPlan) {
            const addBtn = document.createElement('button');
            addBtn.className = 'btn btn-sm';
            addBtn.style.cssText = 'width: 100%; border-style: dashed;';
            addBtn.textContent = `+ Add Exercise to Day ${dayNum}`;
            addBtn.onclick = () => {
                gymPlan[dayNum].push({
                    id: `g${dayNum}_${Date.now()}`,
                    name: "New Exercise",
                    repStr: "3x10",
                    sets: 3
                });
                saveHealthData();
                renderGym();
            };
            card.appendChild(addBtn);
        }

        mainArea.appendChild(card);
    });
}

function completeWorkout(dayNum) {
    (gymPlan[dayNum] || []).forEach(ex => {
        if (ex.sets > 0) {
            for (let i = 0; i < ex.sets; i++) {
                const inputId = `gw_${ex.id}_${i}`;
                const el = document.getElementById(inputId);
                if (el && el.value) savedGymWeights[inputId] = el.value;
            }
        }
    });

    nextWorkoutDay = nextWorkoutDay === 1 ? 2 : 1;
    saveHealthData();
    renderGym();
}

function updateGymDates() {
    gymStartDate = document.getElementById('gym-start-date').value;
    gymEndDate = document.getElementById('gym-end-date').value;
    saveHealthData();

    specificEvents = specificEvents.filter(e => e.id !== 'gym_start_evt' && e.id !== 'gym_end_evt');
    
    if (gymStartDate) specificEvents.push({ id: 'gym_start_evt', date: gymStartDate, title: 'Workout Split Start', category: 'Health', color: '#5f7a61' });
    if (gymEndDate) specificEvents.push({ id: 'gym_end_evt', date: gymEndDate, title: 'Workout Split End', category: 'Health', color: '#ff5555' });
    
    saveData();
    
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
}

renderHealthDashboard();
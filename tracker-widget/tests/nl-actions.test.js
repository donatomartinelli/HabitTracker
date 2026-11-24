// Test della command bar offline: spostare, rimandare, ripetere, slot liberi,
// domande, frasi concatenate e ricerca tollerante. Esegui con: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
await import('../src/js/core/nl-parser.js');
const { interpret, findSlot, scoreTitle } = globalThis.CortexNL;

// Domenica 22 novembre 2026, ore 9:20
const items = [
    { id: 'e_1', kind: 'event', title: 'Dentista', date: '2026-11-23', start: 900, end: 960 },
    { id: 'e_2', kind: 'event', title: 'Riunione con Marco', date: '2026-11-22', start: 600, end: 660 },
    { id: 't_1', kind: 'todo', title: 'Chiamare la nonna', date: '2026-11-22', done: false },
    { id: 't_2', kind: 'todo', title: 'Pagare affitto', date: '2026-11-21', done: false },
    { id: 't_3', kind: 'task', title: 'Studio analisi', date: '2026-11-22', done: false },
    { id: 't_4', kind: 'todo', title: 'Spesa', date: '2026-11-22', done: true }
];
const busy = {
    '2026-11-22': [[480, 600], [600, 660], [780, 840]], // 8-10, 10-11, 13-14
    '2026-11-23': [[540, 720], [900, 960]]              // 9-12, 15-16
};
const T = { today: '2026-11-22', now: 9 * 60 + 20, items, busyOn: d => busy[d] || [], noteCategories: ['Ideas'] };
const all = (s, o = T) => interpret(s, o).map(r => r.cmd);
const first = (s, o = T) => (interpret(s, o)[0] || {}).cmd;

test('annulla', () => {
    assert.equal(first('annulla'), 'undo');
    assert.equal(first('undo'), 'undo');
    assert.equal(first("annulla l'ultima modifica"), 'undo');
});

test('domande sulla giornata', () => {
    assert.equal(first('cosa ho giovedì?'), 'schedule @2026-11-26');
    assert.equal(first('cosa ho oggi'), 'today');
    assert.equal(first("what's on friday"), 'schedule @2026-11-27');
    assert.equal(first('agenda domani'), 'schedule @2026-11-23');
    assert.equal(first('cosa mi resta da fare'), 'today');
    assert.deepEqual(all("cos'è un integrale"), []);
});

test('domande sulle spese (senza importo)', () => {
    assert.equal(first('quanto ho speso questa settimana'), 'spent week');
    assert.equal(first('quanto ho speso oggi?'), 'spent today');
    assert.equal(first('how much did i spend this month'), 'spent month');
    assert.equal(first('spent 9.99 on netflix'), 'out 9.99 netflix'); // con un importo è una spesa
});

test('rimandare tutto quello che resta', () => {
    assert.equal(first('rimanda tutto a domani'), 'postpone @2026-11-23');
    assert.equal(first('sposta il non fatto a lunedì'), 'postpone @2026-11-23');
    assert.equal(first('push everything to tuesday'), 'postpone @2026-11-24');
    assert.equal(first('rimanda tutto'), 'postpone @2026-11-23'); // senza data: domani
    assert.match(interpret('rimanda tutto a domani', T)[0].label, /2 unfinished to-dos/);
});

test('spostare un evento o un to-do esistente', () => {
    assert.equal(first('sposta dentista a giovedì'), 'move e_1 @2026-11-26');
    assert.equal(first('sposta la riunione alle 16'), 'move e_2 @2026-11-22 16:00-17:00');
    assert.equal(first('move marco to friday at 9'), 'move e_2 @2026-11-27 09:00-10:00');
    assert.equal(first('sposta dentista domani pomeriggio'), 'move e_1 @2026-11-23 13:00-14:00');
    assert.equal(first('rimanda nonna a sabato'), 'move t_1 @2026-11-28');
    assert.deepEqual(all('sposta qualcosa che non esiste domani'), []);
});

test('ripetere: ogni giorno, feriali, giorni precisi', () => {
    assert.equal(first('ogni lunedì e giovedì alle 18 palestra'), 'every mon,thu 18:00-19:00 palestra');
    assert.equal(first('every weekday 9:30-10 standup'), 'every weekdays 09:30-10:00 standup');
    assert.equal(first('tutti i giorni meditazione'), 'every daily meditazione');
    assert.equal(first('gym on mondays and fridays at 7pm'), 'every mon,fri 19:00-20:00 gym');
    assert.equal(first('ogni weekend pulizie'), 'every weekends pulizie');
    assert.equal(first('inglese ogni martedì, giovedì e sabato'), 'every tue,thu,sat inglese');
});

test('durata senza ora → primo slot libero', () => {
    // oggi: libero dalle 11 alle 13 (adesso sono le 9:20)
    assert.equal(first('studio analisi 2h'), 'event @2026-11-22 11:00-13:00 studio analisi');
    // domani: 8-9 è troppo corto, 12-14 va bene
    assert.equal(first('studio analisi 2h domani'), 'event @2026-11-23 12:00-14:00 studio analisi');
    assert.equal(first('leggere 30 min stasera'), 'event @2026-11-22 19:00-19:30 leggere');
    // solo una parte del giorno: to-do prima, evento nello slot come alternativa
    assert.deepEqual(all('palestra domani pomeriggio'), ['todo @2026-11-23 palestra', 'event @2026-11-23 13:00-14:00 palestra']);
});

test('parte del giorno sposta l\'ora al pomeriggio o alla sera', () => {
    assert.equal(first('cena domani sera alle 8'), 'event @2026-11-23 20:00-21:00 cena');
    assert.equal(first('call with Anna tomorrow afternoon at 3'), 'event @2026-11-23 15:00-16:00 call with Anna');
    assert.equal(first('dentista domani alle 15'), 'event @2026-11-23 15:00-16:00 dentista');
});

test('"study" con un giorno è un piano, senza giorno avvia il focus', () => {
    assert.equal(first('study maths 2h tomorrow'), 'event @2026-11-23 12:00-14:00 study maths');
    assert.equal(first('studia inglese stasera'), 'todo @2026-11-22 studia inglese');
    assert.equal(first('study maths'), 'focus maths');
});

test('"2h" è una durata, "15h" un orario', () => {
    assert.equal(first('palestra 18h'), 'event @2026-11-22 18:00-19:00 palestra');
    assert.notEqual(first('ripasso 2h domani'), 'event @2026-11-23 02:00-03:00 ripasso');
});

test('fatto: ritrova il task anche scritto a metà', () => {
    assert.equal(first('fatto anal'), 'done Studio analisi');
    assert.equal(first('ho finito nonna'), 'done Chiamare la nonna');
    assert.equal(first('fatto palestra'), 'done palestra'); // nessun task simile: resta com'è
});

test('frasi concatenate', () => {
    assert.equal(first('12€ pranzo; peso 72'), 'out 12 pranzo ;; weight 72');
    // la seconda parte eredita il giorno della prima
    assert.equal(first('chiama Marco domani poi palestra alle 18'), 'todo @2026-11-23 chiama Marco ;; event @2026-11-23 18:00-19:00 palestra');
    // un pezzo senza data prende il giorno di quello prima
    assert.equal(first('call mum friday then groceries'), 'todo @2026-11-27 call mum ;; todo @2026-11-27 groceries');
    // "spesa" senza importo è la spesa da fare, non un'uscita
    assert.equal(first('chiama Marco domani poi spesa'), 'todo @2026-11-23 chiama Marco ;; todo @2026-11-23 spesa');
    assert.equal(first('spesa domani'), 'todo @2026-11-23 spesa');
    assert.equal(first('spesa 30 benzina'), 'out 30 benzina');
    // una nota resta una nota
    assert.equal(first('nota: prima x poi y'), 'note prima x poi y');
    // se un pezzo non si capisce, non si spezza
    assert.equal(first('cena poi cinema sabato alle 20'), 'event @2026-11-28 20:00-21:00 cena poi cinema');
});

test('cancellare', () => {
    assert.equal(first('cancella dentista'), 'delete e_1');
    assert.equal(first('elimina la riunione'), 'delete e_2');
    assert.equal(first('delete nonna'), 'delete t_1');
    assert.equal(first('togli studio analisi'), 'delete t_3');
    assert.match(interpret('togli studio analisi', T)[0].label, /repeating task/);
    // la data restringe la scelta
    assert.equal(first('cancella dentista di lunedì'), 'delete e_1');
    assert.deepEqual(all('cancella dentista di venerdì'), []);
    assert.deepEqual(all('cancella qualcosa che non esiste'), []);
    // "rimuovi scorciatoia" resta il comando delle scorciatoie
    assert.equal(first('rimuovi scorciatoia pal'), 'shortcut -pal');
});

test('rinominare', () => {
    assert.equal(first('rinomina riunione con Marco in call con Marco'), 'rename e_2 = call con Marco');
    assert.equal(first('rinomina dentista in Dentista Rossi'), 'rename e_1 = Dentista Rossi');
    assert.equal(first('rename nonna to call grandma'), 'rename t_1 = call grandma');
    assert.equal(first('cambia nome a dentista: visita'), 'rename e_1 = visita');
    assert.deepEqual(all('rinomina xyz in abc'), []);
});

test('allungare e accorciare un evento', () => {
    assert.equal(first('allunga dentista di 30 min'), 'resize e_1 +30');
    assert.match(interpret('allunga dentista di 30 min', T)[0].label, /15:00–16:30/);
    assert.equal(first('accorcia la riunione di mezz\'ora'), 'resize e_2 -30');
    assert.equal(first('extend marco by 1 hour'), 'resize e_2 +60');
    // un to-do non ha orari: niente da allungare
    assert.deepEqual(all('allunga nonna di 30 min'), []);
});

test('cambiare colore', () => {
    assert.equal(first('colora dentista di rosso'), 'color e_1 rosso');
    assert.equal(first('colore blu a palestra'), undefined); // nessuna "palestra" tra gli elementi
    assert.equal(first('colore blu alla riunione'), 'color e_2 blu');
    assert.equal(first('color nonna green'), 'color t_1 green');
});

test('ricerca dello slot', () => {
    assert.equal(findSlot([[480, 600]], 60, 480, 1320), 600);
    assert.equal(findSlot([[480, 600], [610, 700]], 60, 480, 1320), 705);
    assert.equal(findSlot([[480, 1320]], 30, 480, 1320), null);
    assert.equal(findSlot([], 30, 487, 1320), 495); // arrotonda al quarto d'ora
});

test('somiglianza dei titoli', () => {
    assert.ok(scoreTitle('anal', 'Studio analisi') > 0);
    assert.ok(scoreTitle('dentista', 'Dentista') === 100);
    assert.equal(scoreTitle('xyz', 'Dentista'), 0);
});

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
    // una nota resta una nota
    assert.equal(first('nota: prima x poi y'), 'note prima x poi y');
    // se un pezzo non si capisce, non si spezza
    assert.equal(first('cena poi cinema sabato alle 20'), 'event @2026-11-28 20:00-21:00 cena poi cinema');
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

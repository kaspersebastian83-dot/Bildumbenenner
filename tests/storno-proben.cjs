// FotoKit 1.31.0 – in LabelKit stornierte Proben (Nachzug zu LabelKit 4.49.0 „Proben stornieren“, 31.10.2026):
//  • storniert (Objekt {am, kuerzel, grund} – jeder wahre Wert zählt) → nicht angeboten (P7 + Enter, Ergänzung, Bohrkern-Zuordnung)
//  • die Nummer bleibt vergeben: fortlaufende Nummern dahinter rücken nicht auf
//  • Foto mit stornierter Probe-Nr. → Hinweistext; Storno aufgehoben → wieder angeboten, kein Hinweis
//  • vor PDF und ZIP: Rückfrage, solange ein nicht aussortiertes Foto einer stornierten Probe zugeordnet ist
// node tests/storno-proben.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('const normProbe = '), b = html.indexOf('const geisterAktiv = ');
assert.ok(a > 0 && b > a, 'Block normProbe … probeAusBeschreibung in index.html');
const ctx = { S: { view: [] }, cfg: { probe: true } };
vm.runInNewContext(html.slice(a, b) + `
this.labelkitProben = labelkitProben; this.bohrkernNummern = bohrkernNummern; this.fotoProben = fotoProben;
this.vorschlagFuer = vorschlagFuer; this.stornoProben = stornoProben; this.stornoHinweis = stornoHinweis;
this.setLK = d => { LK.storniert = new Set(); LK.proben = labelkitProben(d, LK.storniert); };`, ctx);
const { labelkitProben, bohrkernNummern, fotoProben, vorschlagFuer, stornoProben, stornoHinweis, setLK } = ctx;
const P = x => JSON.parse(JSON.stringify(x));
const it = { desc: '' };
ctx.S.view = [it];

const STORNO = { am: '2026-10-30T10:00:00.000Z', kuerzel: 'Ka', grund: 'doppelt' }, FEST = { am: '2026-10-29T08:00:00.000Z', anlass: 'Etiketten' };
// LabelKit 4.49: P1–P3 PAK (P2 storniert, ohne _nr – fortlaufend), Chlorid P4, Asbest P5 storniert mit _nr, Sonstige ohne _nr → P6
const daten = { nrSchutz: 1, probenStartNr: 1,
  proben: [{ z2: 'Küche', z3: 'verrußt', z4: 'Untersicht', nrFest: FEST },
           { z2: 'Dachboden', z3: 'stark verrußt', z4: 'Sparren', nrFest: FEST, storniert: STORNO },
           { z2: 'Flur', z3: 'mit Ruß', z4: 'Ansicht' }],
  chloridProben: [{ z2: 'Keller', z3: 'Rohr', z4: 'Aufsicht' }],
  asbestProben: [{ _nr: 5, z2: 'Bad', z3: 'Fliesenkleber', nrFest: FEST, storniert: STORNO }],
  sonstigeProben: [{ z2: 'Garage', z3: '', z4: 'Boden' }] };

let n = 0;
const test = (title, fn) => { fn(); n++; console.log('OK Storno: ' + title); };

test('stornierte Proben nicht angeboten, Nummer bleibt vergeben', () => {
  const st = new Set(), m = labelkitProben(daten, st);
  assert.deepEqual([...m.keys()], ['P1', 'P3', 'P4', 'P6'], 'P2 und P5 fehlen, die übrigen behalten ihre Nummer');
  assert.deepEqual([...st], ['P2', 'P5']);
  assert.equal(m.get('P3').text, 'Flur mit Ruß Ansicht', 'Probe hinter der stornierten rückt nicht auf');
  assert.equal(m.get('P6').text, 'Garage Boden');
  assert.deepEqual([...labelkitProben(daten).keys()], ['P1', 'P3', 'P4', 'P6'], 'auch ohne Storno-Liste');
});

test('jeder wahre Wert für „storniert“ zählt (true, Objekt), falsch/fehlend nicht', () => {
  for (const v of [true, 1, 'ja', STORNO]){ const st = new Set(); assert.ok(!labelkitProben({ proben: [{ z2: 'A', storniert: v }] }, st).has('P1')); assert.ok(st.has('P1')); }
  for (const v of [false, null, undefined, 0, '']){ const st = new Set(); assert.ok(labelkitProben({ proben: [{ z2: 'A', storniert: v }] }, st).has('P1')); assert.equal(st.size, 0); }
});

test('P-Nr.-Vorschläge: P2 + Enter und Ergänzung bieten die stornierte Probe nicht an', () => {
  setLK(daten);
  assert.equal(vorschlagFuer(it, 'P1'), 'P1 Küche verrußt Untersicht');
  assert.equal(vorschlagFuer(it, 'P2'), '', 'P2 storniert – kein Vorschlag');
  assert.equal(vorschlagFuer(it, 'p5'), '', 'P5 storniert – kein Vorschlag');
  assert.equal(vorschlagFuer(it, 'Dach'), '', 'Raum nur aus stornierter Probe – nicht angeboten');
  assert.equal(vorschlagFuer(it, 'Fl'), 'Flur mit Ruß Ansicht');
});

test('Foto mit stornierter Probe-Nr. → Hinweis (eine, mehrere, gemischt, Schreibweise)', () => {
  setLK(daten);
  assert.deepEqual(P(stornoProben('P2')), ['P2']);
  assert.deepEqual(P(stornoProben('p 2')), ['P2'], 'wie in der Probe-Nr. üblich normalisiert');
  assert.deepEqual(P(stornoProben('P1, P3')), [], 'gültige Proben: kein Hinweis');
  assert.deepEqual(P(stornoProben('P1, P5; P2')), ['P5', 'P2']);
  assert.deepEqual(P(stornoProben('')), []);
  assert.equal(stornoHinweis([]), '');
  assert.equal(stornoHinweis(['P2']), '⚠ P2 ist in LabelKit storniert – dieses Foto ist noch P2 zugeordnet. Ordne es einer anderen Probe zu oder sortiere es mit ✕ aus.');
  assert.equal(stornoHinweis(['P5', 'P2']), '⚠ P5 und P2 sind in LabelKit storniert – dieses Foto ist noch P5 und P2 zugeordnet. Ordne es einer anderen Probe zu oder sortiere es mit ✕ aus.');
  assert.ok(!/\bSie\b|\bIhr(e|en)?\b/.test(stornoHinweis(['P2'])), 'du, nicht Sie');
});

test('Storno aufgehoben → wieder angeboten, kein Hinweis', () => {
  const d = P(daten); delete d.proben[1].storniert; d.proben[1].nrFest = { am: '2026-10-31T09:00:00.000Z', anlass: 'Storno aufgehoben' };
  setLK(d);
  assert.equal(vorschlagFuer(it, 'P2'), 'P2 Dachboden stark verrußt Sparren');
  assert.deepEqual(P(stornoProben('P2')), []);
  assert.deepEqual(P(stornoProben('P5')), ['P5'], 'P5 bleibt storniert');
});

test('ältere Datei ohne Storno → unverändert, kein Hinweis', () => {
  setLK({ probenStartNr: 1, proben: [{ z2: 'Küche' }, { z2: 'Flur' }] });
  assert.equal(vorschlagFuer(it, 'P2'), 'P2 Flur');
  assert.deepEqual(P(stornoProben('P2')), []);
});

test('Bohrkern: stornierte Segmente bekommen keine Fotos (wie Rückstellproben)', () => {
  const seg = (nr, t, extra) => Object.assign({ _nr: nr, matrix: 'Bohrkern', bkBez: 'EG-WZ-B-7', bkId: `EG-WZ-B-7-T${t}`, bkStatus: 'A', notiz: 'MKW', nrFest: FEST }, extra);
  const bk = bohrkernNummern({ sonstigeProben: [seg(2, 1), seg(3, 2, { storniert: STORNO }), seg(4, 3)] });
  assert.deepEqual(P(fotoProben('EG-WZ-B-7', bk)), ['P2', 'P4'], 'Kern-ID → nur nicht stornierte Segmente');
  assert.deepEqual(P(fotoProben('EG-WZ-B-7-T2', bk)), ['EG-WZ-B-7-T2'], 'stornierte Segment-ID bleibt unaufgelöst');
});

test('Zeile und Zählung zeigen den Hinweis; FotoKit ändert dabei nichts', () => {
  assert.ok(/stornoProben\(it\.probe\)/.test(html) && /querySelector\('\.storno'\)/.test(html), 'recompute setzt den Hinweis je Zeile');
  assert.ok(html.includes('bei stornierter Probe</span>'), 'Zählung oben');
  const f = html.slice(html.indexOf('function stornoHinweis('), html.indexOf('function vorschlagKandidaten('));
  assert.ok(!/it\.probe\s*=|\.discard\s*=|rename|move/i.test(f), 'Hinweis ändert keine Zuordnung, keinen Namen, keinen Ordner');
});

test('Rückfrage vor PDF und ZIP: Text, nur nicht aussortierte Fotos, beide Knöpfe', () => {
  const fa = html.indexOf('function stornoFotos('), fb = html.indexOf('function guardStorno(');
  assert.ok(fa > 0 && fb > fa, 'stornoFotos/stornoFrage in index.html');
  const c = { S: { view: [] }, LK: { storniert: new Set(['P2', 'P5']) } };
  vm.runInNewContext(/const undListe = .*;/.exec(html)[0] + '\n' + html.slice(html.indexOf('const normProbe = '), html.indexOf('const BK = { map:')) +
    '\nconst stornoProben = ' + /const stornoProben = (.*);/.exec(html)[1] + ';\n' + html.slice(fa, fb) + '\nthis.stornoFotos = stornoFotos; this.stornoFrage = stornoFrage;', c);
  assert.equal(c.stornoFrage(2, ['P7']), '2 Fotos sind noch P7 zugeordnet – P7 ist in LabelKit storniert. In der Bilddokumentation stehen sie dann weiter unter P7. Trotzdem exportieren?');
  assert.equal(c.stornoFrage(1, ['P7']), '1 Foto ist noch P7 zugeordnet – P7 ist in LabelKit storniert. In der Bilddokumentation steht es dann weiter unter P7. Trotzdem exportieren?');
  assert.equal(c.stornoFrage(3, ['P5', 'P7']), '3 Fotos sind noch P5 und P7 zugeordnet – P5 und P7 sind in LabelKit storniert. In der Bilddokumentation stehen sie dann weiter unter P5 und P7. Trotzdem exportieren?');
  c.S.view = [{ probe: 'P2' }, { probe: 'P1' }, { probe: 'P5, P2' }, { probe: 'P5', discard: true }];
  const r = c.stornoFotos();
  assert.equal(r.fotos.length, 2, 'aussortierte und gültige zählen nicht'); assert.deepEqual(P(r.proben), ['P2', 'P5']);
  c.S.view = [{ probe: 'P1' }, { probe: 'P5', discard: true }];
  assert.equal(c.stornoFotos().fotos.length, 0, 'nichts betroffen → keine Rückfrage');
  assert.ok(html.includes("$('btnZip').onclick = guardPicks(guardStorno(openZipDialog));") && html.includes("$('btnPdf').onclick = guardPicks(guardStorno(openPdfDialog));"), 'PDF und ZIP fragen nach');
  const g = html.slice(fb, html.indexOf('function clearDropMarks('));
  assert.ok(!/readOnly/.test(g), 'gilt auch im geschützten Modus');
  assert.ok(!/it\.probe\s*=|\.discard\s*=/.test(g), 'Rückfrage ändert keine Zuordnung');
});

test('Wechsel zu Fotoordner ohne Projekt: Storno-Stand des vorigen Projekts weg, Zeilen neu berechnet (Codex-Review #76)', () => {
  const a = html.indexOf('async function loadBohrkernZuordnung('), b = html.indexOf('async function lkLesen(');
  assert.ok(a > 0 && b > a, 'loadBohrkernZuordnung in index.html');
  const c = { S: { proj: null }, BK: {}, LK: { proben: new Map(), storniert: new Set(['P2']), datei: 'alt_Daten.json' }, rechnungen: 0 };
  vm.runInNewContext(html.slice(a, b) + `
this.recompute = () => { this.rechnungen++; }; this.lkLesen = async () => {}; this.laden = loadBohrkernZuordnung;`, c);
  c.laden();   // ohne Projekt kehrt die Funktion vor dem ersten await zurück – synchron prüfbar
  assert.equal(c.LK.storniert.size, 0, 'Storno-Stand des vorigen Projekts gelöscht');
  assert.equal(c.rechnungen, 1, 'ohne Projekt trotzdem neu berechnet – sonst bleiben Hinweis und Zählung stehen');
  c.laden();
  assert.equal(c.rechnungen, 1, 'nichts zu löschen → keine zusätzliche Neuberechnung');
});

console.log(`OK Storno: ${n} Fälle`);

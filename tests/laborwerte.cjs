// Laborwerte in der Ergebnistabelle: dieselben Regeln wie PlanKit (src/results.ts, tests/lab-regressions.mjs).
// node tests/laborwerte.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('/* LABZAHL-START'), b = html.indexOf('/* LABZAHL-ENDE */');
assert.ok(a > 0 && b > a, 'Block LABZAHL in index.html');
const ctx = {};
vm.runInNewContext(html.slice(a, b) + '\nthis.labNumber = labNumber; this.labQualifier = labQualifier;', ctx);
const { labNumber, labQualifier } = ctx;

const good = [['1300', 1300], ['0', 0], ['3,2', 3.2], ['3.2', 3.2], ['0.123', .123], ['0,123', .123], ['1.300,5', 1300.5], ['1,300.5', 1300.5], ['1.234.567', 1234567], ['1,234,567', 1234567], ['1 300,5', 1300.5], ['1 300.5', 1300.5], ['1 300', 1300], ['1,2e3', 1200], ['1.2E-3', .0012], ['−2,5', -2.5]];
for (const [s, n] of good) assert.equal(labNumber(s), n, s);
const bad = ['', ' ', '1.300', '1,300', '1.234', '1,234', '12.345', '12,345', '12.34,5', '12,34.5', '1 30', '1,2,3', '1.2.3', '1.234,5.6', '1.2 mg/kg', '> 5', 'NaN', 'Infinity', '0x10', '1e999', '1e', '--1'];
for (const s of bad) assert.ok(Number.isNaN(labNumber(s)), 'mehrdeutig/ungültig: ' + JSON.stringify(s));
const cases = [['< 0,50', 'below'], ['unter BG', 'below'], [' UNTER bg ', 'below'], ['n.n.', 'notDetected'], ['(N. N.)', 'notDetected'], ['n.b.', 'notDetermined'], ['(n. b.)', 'notDetermined'], ['0', 'measured'], ['0,00', 'measured'], ['<', 'unrated'], ['< kaputt', 'unrated'], ['< 1.2 mg/kg', 'unrated'], ['<< 0.50', 'unrated'], ['< NaN', 'unrated'], ['< Infinity', 'unrated'], ['< -1', 'unrated'], ['< 1.234', 'unrated'], ['< BG', 'unrated'], ['n.n. Zusatz', 'unrated'], ['(n.b.', 'unrated']];
for (const [s, k] of cases) assert.equal(labQualifier(s), k, s);
// Regression FotoKit 1.6.1: „0.5“ wurde zu 5, „n.b.“ (nicht bestimmt) als „< BG“ mit der niedrigsten Kategorie bewertet
assert.equal(labNumber('0.5'), 0.5);
assert.equal(labQualifier('n.b.'), 'notDetermined');
// Die Anzeige im Programm nutzt diese Funktionen
assert.ok(html.includes('const labNum = r => labQualifier(r) === \'measured\' ? labNumber(r) : NaN;'));
// Tabellen und beide Zwischenablageformate mit denselben produktiven Funktionen prüfen.
const scales = {
  'Summe 16 EPA-PAK|mg/kg': { name: 'Testskala', cats: [{ name: 'niedrig', from: 0 }, { name: 'hoch', from: 10 }] },
  // Auch ein alter Eintrag ohne Einheit darf keine fachliche Bewertung ermöglichen.
  'Summe 16 EPA-PAK|': { name: 'ohne Einheit', cats: [{ name: 'falsch', from: 0 }] }
};
const tableCtx = {
  store: { get: () => scales }, zipSelection: () => [], loadMeta: () => ({}),
  esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
};
vm.runInNewContext(html.slice(html.indexOf('const LAB_DIR ='), html.indexOf('async function findLabFiles()')) +
  '\nthis.ergebnisAlsRep = ergebnisAlsRep; this.tables = labTables; this.clipHtml = r => labHtml(r, true); this.preview = r => labHtml(r, false); this.clipText = labText;', tableCtx);
const main = 'Summe 16 EPA-PAK', bap = 'Benzo[a]pyren';
const value = (param, result, unit, loq = '') => ({ param, result, unit, loq });
const sample = (label, lines) => ({ label, desc: label + ' Teststelle', art: 'Material', lines });
const report = proben => ({ proben, labor: 'Testlabor', bericht: 'Synthetisch', datum: '', vorlaeufig: false });
const options = mode => ({ p1: main, p2: bap, mode, cRating: true, cFoto: false, cFlaeche: false });
const outputs = res => {
  const formats = [tableCtx.preview(res), tableCtx.clipHtml(res), tableCtx.clipText(res)];
  // Jede Zelle bleibt auch im HTML für Word und im Text-Fallback derselben Zeile zugeordnet.
  const decode = s => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  for (const rendered of formats.slice(0, 2)) {
    const rows = [...rendered.matchAll(/<tr>(.*?)<\/tr>/gs)].map(m => [...m[1].matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gs)].map(m => decode(m[1])));
    assert.deepEqual(rows, JSON.parse(JSON.stringify(res.tables.flatMap(t => [t.head, ...t.rows.map(r => r.cells)]))));
  }
  for (const t of res.tables) for (const r of t.rows) assert.ok(formats[2].includes(r.cells.join('\t')));
  return formats;
};

// A: Die Hauptparameter-Einheit ist gleich, die BaP-Einheiten sind verschieden.
const mixed = report([
  sample('P1', [value(main, '5', 'mg/kg'), value(bap, '2', 'mg/kg', '0,1')]),
  sample('P2', [value(main, '20', 'mg/kg'), value(bap, '2000', 'µg/kg', '100')])
]);
for (const mode of ['uebersicht', 'einzel']) {
  const res = tableCtx.tables(mixed, options(mode)), t = res.tables[0];
  if (mode === 'uebersicht') {
    assert.equal(t.head[3], 'BaP', 'keine falsche gemeinsame BaP-Einheit');
    assert.equal(t.rows[0].cells[3], '2 mg/kg (BG 0,1 mg/kg)');
    assert.equal(t.rows[1].cells[3], '2000 µg/kg (BG 100 µg/kg)');
    assert.equal(t.rows[0].cells[4], 'niedrig');
    assert.equal(t.rows[1].cells[4], 'hoch');
    assert.equal(t.rows[1].strong, true, 'Hervorhebung bleibt erhalten');
  } else {
    const rows = t.rows.filter(r => r.cells[0] === bap);
    assert.deepEqual(Array.from(rows[0].cells), [bap, 'mg/kg', '0,1', '2', '–']);
    assert.deepEqual(Array.from(rows[1].cells), [bap, 'µg/kg', '100', '–', '2000']);
  }
  for (const out of outputs(res)) {
    assert.ok(out.includes('µg/kg') && out.includes('mg/kg') && out.includes('2000'));
    assert.ok(out.includes('0,1') && out.includes('100'));
    assert.ok(!out.includes('BaP [mg/kg]'));
  }
}
const missingUnit = structuredClone(mixed);
missingUnit.proben[1].lines[1].unit = '';
const missingResult = tableCtx.tables(missingUnit, options('uebersicht')).tables[0];
assert.equal(missingResult.head[3], 'BaP');
assert.equal(missingResult.rows[1].cells[3], '2000 (Einheit fehlt) (BG 100)');
const uniform = structuredClone(mixed);
uniform.proben[1].lines[1].unit = 'mg/kg';
assert.equal(tableCtx.tables(uniform, options('uebersicht')).tables[0].head[3], 'BaP [mg/kg]');
uniform.proben[1].lines[0].unit = 'µg/kg';
const separateScale = tableCtx.tables(uniform, options('uebersicht'));
assert.ok(!separateScale.tables[1].scale, 'mg/kg-Skala gilt nicht für µg/kg');
assert.ok(separateScale.warn.some(w => w.includes('µg/kg') && w.includes('Bewertung')));

// B: Unterschiedliche BG und fehlende Angaben gehören zur jeweiligen Probe.
const bounds = report([
  sample('P1', [value(main, '< 0,10', 'mg/kg', '0,10')]),
  sample('P2', [value(main, 'unter BG', 'mg/kg', '0,50')]),
  sample('P3', [value(main, 'n.b.', 'mg/kg')]),
  sample('P4', [value(main, '7', '')])
]);
for (const mode of ['uebersicht', 'einzel']) {
  const res = tableCtx.tables(bounds, { ...options(mode), p2: '' }), t = res.tables[0];
  if (mode === 'uebersicht') {
    assert.equal(t.rows[0].cells[2], '< 0,10 (BG 0,10)');
    assert.equal(t.rows[1].cells[2], 'unter BG (BG 0,50)');
    assert.equal(t.rows[2].cells[2], 'n.b.');
    assert.ok(t.rows.every(r => r.cells[3] === '–'), 'Qualifikatoren bleiben ohne Bewertung');
    assert.equal(res.tables[1].scale, null, 'fehlende Einheit trotz gespeicherter Skala nicht bewerten');
    assert.ok(res.warn.some(w => w.includes('ohne Einheit') && w.includes('Bewertung')));
  } else {
    assert.deepEqual(Array.from(t.rows[0].cells), [main, 'mg/kg', '0,10', '< 0,10', '–', '–']);
    assert.deepEqual(Array.from(t.rows[1].cells), [main, 'mg/kg', '0,50', '–', 'unter BG', '–']);
    assert.deepEqual(Array.from(t.rows[2].cells), [main, 'mg/kg', '', '–', '–', 'n.b.']);
    assert.deepEqual(Array.from(res.tables[1].rows[0].cells), [main, '', '', '7']);
  }
  for (const out of outputs(res)) {
    assert.ok(out.includes('0,10') && out.includes('0,50') && out.includes('n.b.'));
    assert.ok(!out.includes('je Einzelstoff'), 'keine gemeinsame BG aus anderen Parametern ableiten');
  }
}
assert.equal(mixed.proben[1].lines[1].result, '2000', 'Originaldaten unverändert');

// C: Laborergebnisse aus ResultKit (_Ergebnisse.json) – gleiche Form wie aus der XML; mehrere Berichte in einer Tabelle (erfundene Daten).
{
  const datei = JSON.stringify({ format: 'spektron-ergebnisse', version: 1, projekt: '99.9001', uebernommen: '2026-10-26T10:00:00.000Z', vollstaendig: false, stand: 'x', offen: ['P3'],
    berichte: [
      { id: 'b1', bericht: 'AR-1-02', datum: '2026-10-12', labor: 'Eurofins', auftragsreferenz: '99.9001 Musterort', sources: { xml: 'AR-1-02.xml' },
        proben: [{ label: 'P2', ref: 'Probe 2', desc: 'Testbereich 2', art: 'Wischprobe', datum: '2026-10-08', werte: [{ p: main, r: '8,5', u: 'µg/m²', loq: '0,5' }, { p: 'Größe der Probenfläche', r: '400', u: 'cm²' }] },
                 { label: 'P1', ref: 'Probe 1', desc: 'Testbereich 1', art: 'Wischprobe', datum: '2026-10-08', werte: [{ p: main, r: '14', u: 'µg/m²', loq: '0,5' }] }] },
      { id: 'b2', bericht: 'AR-1-01', datum: '2026-10-10', vorlaeufig: true, labor: 'Eurofins', auftragsreferenz: '99.9001 Musterort', sources: { xml: 'AR-1-01.xml' },
        proben: [{ label: 'P1', ref: 'Probe 1', desc: 'Testbereich 1', art: 'Wischprobe', datum: '2026-10-08', werte: [{ p: bap, r: '< 0,5', u: 'µg/m²', loq: '0,5' }] }] }] });
  const rep = tableCtx.ergebnisAlsRep(datei, 'Laborergebnisse/_Ergebnisse.json');
  assert.deepEqual(Array.from(rep.proben.map(p => p.label)), ['P1', 'P2'], 'nach Probennummer');
  assert.deepEqual(Array.from(rep.proben[0].lines.map(l => l.param)), [main, bap], 'gleiche Probe aus zwei Berichten zusammengeführt');
  assert.equal(rep.proben[1].flaeche, '400 cm²'); assert.equal(rep.proben[1].lines.length, 1, 'Probenfläche als Fläche, nicht als Wert');
  assert.equal(rep.proben[0].datum, '08.10.2026'); assert.equal(rep.vorlaeufig, true); assert.equal(rep.resultkit.vollstaendig, false); assert.equal(rep.resultkit.projekt, '99.9001');
  const res = tableCtx.tables(rep, { p1: main, p2: bap, mode: 'uebersicht', cRating: false, cFoto: false, cFlaeche: true });
  assert.ok(res.foot.includes('Prüfberichte Eurofins AR-1-02 vom 12.10.2026, AR-1-01 vom 10.10.2026 (vorläufig).'), res.foot.join(' | '));
  assert.throws(() => tableCtx.ergebnisAlsRep('{"format":"x"}'), /nicht aus ResultKit/);
  assert.throws(() => tableCtx.ergebnisAlsRep(JSON.stringify({ format: 'spektron-ergebnisse', version: 2 })), /FotoKit aktualisieren/);
  assert.throws(() => tableCtx.ergebnisAlsRep(JSON.stringify({ format: 'spektron-ergebnisse', version: 1, berichte: [] })), /noch keine Proben/);
}
console.log('Laborwerte: Zahlenregeln, Regressionen A/B und Übergabe aus ResultKit (C) für Tabellen und Word-Zwischenablage bestanden');

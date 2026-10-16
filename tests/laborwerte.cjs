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
for (const s of ['const labNum = r => labQualifier(r) === \'measured\' ? labNumber(r) : NaN;', "const labShow = r => ({ below: '< BG', notDetected: 'n.n.', notDetermined: 'n.b.' })[labQualifier(r)] || r;"]) assert.ok(html.includes(s), s);
console.log('Laborwerte: alle Prüfungen bestanden');

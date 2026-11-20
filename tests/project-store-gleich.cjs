// project-store.js ist eine Kopie aus der Projektzentrale (Kopf: „byte-identical“) – hier byte-genau vergleichen
// (Audit 2026-11 Lauf 1, A11: die Kopien waren auseinandergelaufen). In CI holt der Workflow die Projektzentrale daneben
// (gleichnamiger Zweig, sonst main) und setzt PROJEKT_STORE_PFLICHT – dort wird der Vergleich nie übersprungen.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const hier = path.join(__dirname, '..', 'project-store.js');
const vorlage = path.join(__dirname, '..', '..', 'projektzentrale', 'project-store.js');
if (!fs.existsSync(vorlage)){
  assert.ok(!process.env.PROJEKT_STORE_PFLICHT, 'Projektzentrale nicht neben dem Repo: ' + vorlage);
  console.log('SKIP project-store.js: keine Projektzentrale daneben (' + vorlage + ')');
  process.exit(0);
}
const a = fs.readFileSync(hier), b = fs.readFileSync(vorlage);
if (!a.equals(b)){
  const la = a.toString('utf8').split('\n'), lb = b.toString('utf8').split('\n');
  const i = la.findIndex((z, n) => z !== lb[n]);
  assert.fail(`project-store.js weicht von der Projektzentrale ab (erste Abweichung Zeile ${i + 1}):\n  FotoKit:         ${la[i]}\n  Projektzentrale: ${lb[i]}`);
}
console.log('OK project-store.js: byte-gleich mit der Projektzentrale');

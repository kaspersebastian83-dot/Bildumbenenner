// ortstermine.js ist eine Kopie aus der Projektzentrale – hier byte-genau vergleichen
// (FotoKit 2.7.0, O13: Termin-Kennungen nach genau derselben Regel wie die Projektzentrale – nicht nachgebaut). In CI holt der Workflow die Projektzentrale daneben
// (gleichnamiger Zweig, sonst main) und setzt ORTSTERMINE_PFLICHT – dort wird der Vergleich nie übersprungen.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const hier = path.join(__dirname, '..', 'ortstermine.js');
const vorlage = path.join(__dirname, '..', '..', 'projektzentrale', 'ortstermine.js');
if (!fs.existsSync(vorlage)){
  assert.ok(!process.env.ORTSTERMINE_PFLICHT, 'Projektzentrale nicht neben dem Repo: ' + vorlage);
  console.log('SKIP ortstermine.js: keine Projektzentrale daneben (' + vorlage + ')');
  process.exit(0);
}
const a = fs.readFileSync(hier), b = fs.readFileSync(vorlage);
if (!a.equals(b)){
  const la = a.toString('utf8').split('\n'), lb = b.toString('utf8').split('\n');
  const i = la.findIndex((z, n) => z !== lb[n]);
  assert.fail(`ortstermine.js weicht von der Projektzentrale ab (erste Abweichung Zeile ${i + 1}):\n  FotoKit:         ${la[i]}\n  Projektzentrale: ${lb[i]}`);
}
console.log('OK ortstermine.js: byte-gleich mit der Projektzentrale');

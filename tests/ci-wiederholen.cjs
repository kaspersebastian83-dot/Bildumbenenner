// Nur für GitHub Actions: Browsertest ausführen; bricht er ab, einmal wiederholen.
// Der erste Abbruch bleibt als gelbe Warnung mit Fehlermeldung am Lauf sichtbar (tests/ci-fehler.cjs) –
// so blockiert ein zeitabhängiger Ausreißer nicht das Zusammenführen, wird aber nicht verschwiegen.
// Schlägt auch die Wiederholung fehl, ist der Lauf rot wie bisher.
const { spawnSync } = require('node:child_process'), path = require('node:path');
const [datei, ...args] = process.argv.slice(2);
if (!datei) { console.error('Aufruf: node tests/ci-wiederholen.cjs tests/<test>.cjs [Browser]'); process.exit(2); }
const lauf = stufe => spawnSync(process.execPath, [datei, ...args], { stdio: 'inherit', env: { ...process.env, CI_FEHLER_STUFE: stufe } }).status;
let code = lauf('warning');
if (code !== 0) {
  console.log(`::warning title=${path.basename(datei)} wiederholt::Erster Durchlauf abgebrochen (Exit-Code ${code}) – Test wird einmal wiederholt.`);
  code = lauf('error');
}
process.exit(code ?? 1);

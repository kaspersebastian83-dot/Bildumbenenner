// Hilfe-Links ins Handbuch: nur feste Kapiteladressen aus AidKit (hilfe-anker.json), gemeinsames Fenster „aidkit“.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const FEST = ['start', 'brandschaden', 'bohrkern-ablauf', 'app-projektzentrale', 'app-labelkit', 'app-fotokit', 'app-resultkit', 'app-plankit', 'app-belegkit', 'app-spesenkit', 'app-datenarchiv', 'bohrkern', 'wischprobe', 'raumkuerzel'];
const neben = path.join(__dirname, '..', '..', 'aidkit', 'hilfe-anker.json');
const anker = fs.existsSync(neben) ? Object.keys(JSON.parse(fs.readFileSync(neben, 'utf8')).anker) : FEST;
if (fs.existsSync(neben)) assert.deepEqual([...anker].sort(), [...FEST].sort(), 'Liste hier = hilfe-anker.json in AidKit');
const links = [...html.matchAll(/<a\b[^>]*href="\.\.\/aidkit\/#([^"]+)"[^>]*>/g)];
for (const [tag, id] of links){
  assert.ok(anker.includes(id), `#${id} ist keine feste Handbuch-Adresse`);
  assert.match(tag, /target="aidkit"/); assert.match(tag, /rel="noopener"/);
}
const ids = links.map(l => l[1]).sort();
assert.deepEqual(ids, ['app-fotokit', 'app-fotokit', 'bohrkern'], 'Kopfzeile + Kurzanleitung: FotoKit; Kurzanleitung: Bohrkerne');
assert.match(html, /id="lnkHandbuch"[^>]*href="\.\.\/aidkit\/#app-fotokit"/, 'Knopf „📘 Handbuch“ in der Kopfzeile');
console.log(`OK Hilfe-Links: ${links.length} Links auf feste Handbuch-Adressen${fs.existsSync(neben) ? ' (mit AidKit-Liste geprüft)' : ''}`);

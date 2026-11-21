// FotoKit 2.6.0 (Audit 2026-11 Lauf 5, E2): Feld „probeLabelKit“ je Bild in _Bildumbenenner.json – echte Speicherfunktionen,
// synthetisches Dateisystem. Lesen und Schreiben ohne Verlust, anders geformte Werte bleiben unverändert stehen, ältere Dateien
// bekommen kein Feld, und eine Änderung nur am gemerkten Text macht die Bilddoku nicht „veraltet“. node tests/probe-labelkit.cjs
'use strict';
const assert = require('node:assert/strict');
const { disk, session } = require('./n2-speichersicherheit.cjs');
// Version 1.8.2: der Testaufbau (n2-speichersicherheit) läuft als FotoKit 1.9.5 – eine neuere Datei wäre geschützt
const datei = bilder => ({ app: 'Bildumbenenner', format: 1, version: '1.8.2', projekt: {}, benennung: {}, reihenfolge: [], bilder });
const harness = input => { const d = disk(JSON.stringify(input)), s = session(d); return { ...s, dir: d.dir, read: () => d.json() }; };
const plain = x => JSON.parse(JSON.stringify(x));
let n = 0; const test = async (t, fn) => { await fn(); n++; console.log('OK probeLabelKit: ' + t); };

(async () => {
  await test('lesen und unverändert wieder schreiben', () => {
    const h = harness(datei({}));
    const vorher = datei({ 'a.jpg': { probe: 'P4', probeLabelKit: { P4: 'EG Küche Heizkörper' } }, 'b.jpg': { probe: 'P1, P2', probeLabelKit: { P1: 'EG Flur', P2: 'OG Bad' } }, 'c.jpg': { probe: 'P3' } });
    const d = h.projFromJson(vorher);
    assert.deepEqual(plain(d.extra['a.jpg']), { sec: '', probe: 'P4', lk: { P4: 'EG Küche Heizkörper' } });
    assert.deepEqual(plain(d.extra['c.jpg']), { sec: '', probe: 'P3' }, 'ältere Datei: kein Feld');
    const nach = JSON.parse(h.projToJson(d));
    assert.deepEqual(nach.bilder, vorher.bilder);
  });
  await test('anders geformt → bleibt als unbekanntes Feld stehen, wird nicht ausgewertet', () => {
    const h = harness(datei({}));
    for (const fremd of [['P4'], { P4: 7 }, { 'Probe 4': 'x' }, {}, 'P4', { P4: 'x'.repeat(501) }]){
      const vorher = datei({ 'a.jpg': { probe: 'P4', probeLabelKit: fremd } }), d = h.projFromJson(vorher);
      assert.equal(d.extra['a.jpg'].lk, undefined, JSON.stringify(fremd));
      assert.deepEqual(JSON.parse(h.projToJson(d)).bilder['a.jpg'], vorher.bilder['a.jpg'], 'unverändert: ' + JSON.stringify(fremd));
    }
    // ohne Probe gehört der Text zu nichts – bleibt ebenfalls unverändert stehen
    const ohne = datei({ 'a.jpg': { abschnitt: 'Küche', probeLabelKit: { P4: 'x' } } });
    assert.deepEqual(JSON.parse(h.projToJson(h.projFromJson(ohne))).bilder['a.jpg'], ohne.bilder['a.jpg']);
  });
  await test('nur der gemerkte Text ändert sich → Bilddoku bleibt aktuell; Probe ändert sich → „Doku geändert“', async () => {
    const erstellt = '2026-11-21T08:00:00.000Z';
    const h = harness({ ...datei({ 'a.jpg': { probe: 'P4', probeLabelKit: { P4: 'EG Küche' } } }), bilddoku: { dateien: ['Bilddokumentation.pdf'], erstellt, anlage: '', version: '1.8.2', bestand: ['a.jpg'] } });
    await h.open();
    assert.equal(h.P.data.extensions.dokuGeaendert, undefined);
    h.projSet('extra', { 'a.jpg': { sec: '', probe: 'P4', lk: { P4: 'EG Flur' } } });
    assert.equal(h.P.data.extensions.dokuGeaendert, undefined, 'nur lk geändert');
    assert.equal(await h.flushProject(), true);
    assert.deepEqual(h.read().bilder['a.jpg'].probeLabelKit, { P4: 'EG Flur' });
    assert.equal(h.read().dokuGeaendert, undefined);
    h.projSet('extra', { 'a.jpg': { sec: '', probe: 'P5', lk: { P5: 'OG Bad' } } });
    assert.ok(h.P.data.extensions.dokuGeaendert > erstellt, 'Probe geändert: Doku geändert');
  });
  await test('Zusammenführen mit einem anderen Fenster behält den gemerkten Text', async () => {
    const start = datei({ 'a.jpg': { probe: 'P4' }, 'b.jpg': { probe: 'P1' } });
    const { disk: mk } = require('./n2-speichersicherheit.cjs'), d = mk(JSON.stringify(start)), a = session(d), b = session(d);
    await a.open(); await b.open();
    a.projSet('extra', { 'a.jpg': { sec: '', probe: 'P4', lk: { P4: 'EG Küche' } }, 'b.jpg': { sec: '', probe: 'P1' } });
    assert.equal(await a.flushProject(), true);
    b.projSet('drafts', { 'b.jpg': 'Flur, Wand' });
    assert.equal(await b.flushProject(), true);
    const o = d.json();
    assert.deepEqual(o.bilder['a.jpg'].probeLabelKit, { P4: 'EG Küche' }, 'Text aus Fenster A bleibt');
    assert.equal(o.bilder['b.jpg'].beschreibung, 'Flur, Wand');
  });
  console.log(`${n} Prüfungen probeLabelKit grün`);
})().catch(e => { console.error(e); process.exit(1); });

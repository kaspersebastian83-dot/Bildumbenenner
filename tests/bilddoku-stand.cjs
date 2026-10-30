// Stand der Bilddokumentation für BerichtKit: bilddoku (erstellte PDF) und dokuGeaendert in _Bildumbenenner.json.
// Echte FotoKit-Speicher- und Zusammenführfunktionen (Harness aus n2-speichersicherheit.cjs), synthetisches Dateisystem.
const assert = require('node:assert/strict');
const { disk, session, fixture } = require('./n2-speichersicherheit.cjs');
const tick = () => new Promise(r => setTimeout(r, 5));

async function run() {
  let n = 0; const test = async (name, fn) => { await fn(); console.log('OK Bilddoku-Stand:', name); n++; };

  await test('Doku-Inhalte ändern setzt dokuGeaendert, Prüfsummen nicht', async () => {
    const d = disk(), s = session(d); await s.open();
    assert.equal(s.P.data.extensions.dokuGeaendert, undefined, 'Öffnen allein ändert nichts');
    s.projSet('hash', { 'a.jpg': { h: 'x', s: 1, m: 1 } });
    assert.equal(s.P.data.extensions.dokuGeaendert, undefined, 'Prüfsumme ist kein Doku-Inhalt');
    s.edit('a.jpg', 'neue Beschreibung');
    const t1 = s.P.data.extensions.dokuGeaendert; assert.match(t1, /^\d{4}-\d{2}-\d{2}T/);
    await tick(); s.projSet('extra', { ...s.P.data.extra });   // unverändert → kein neuer Stand
    assert.equal(s.P.data.extensions.dokuGeaendert, t1);
    for (const [kind, v] of [['rot', { 'a.jpg': 90 }], ['discard', ['b.jpg']], ['order', ['b.jpg', 'a.jpg']], ['meta', { anlage: 'Anlage 2' }]]) {
      await tick(); const vorher = s.P.data.extensions.dokuGeaendert; s.projSet(kind, v);
      assert.ok(s.P.data.extensions.dokuGeaendert > vorher, kind + ' zählt');
    }
    assert.equal(await s.flushProject(), true);
    const j = d.json(); assert.equal(j.dokuGeaendert, s.P.data.extensions.dokuGeaendert);
    assert.deepEqual(j.extension, fixture().extension, 'unbekannte Felder bleiben');
  });

  await test('Erstellte PDF wird vermerkt; späteres Ändern macht sie veraltet', async () => {
    const d = disk(), s = session(d); await s.open();
    s.edit('a.jpg', 'vor der Doku'); await tick();
    s.ctx.bilddokuVermerken(['Bilddokumentation_99.9001_Ort_2026-10-30_Teil_1_von_2.pdf', 'Bilddokumentation_99.9001_Ort_2026-10-30_Teil_2_von_2.pdf'], 'Anlage 2');
    assert.equal(await s.flushProject(), true);
    let j = d.json();
    assert.deepEqual(j.bilddoku.dateien, ['Bilddokumentation_99.9001_Ort_2026-10-30_Teil_1_von_2.pdf', 'Bilddokumentation_99.9001_Ort_2026-10-30_Teil_2_von_2.pdf']);
    assert.equal(j.bilddoku.anlage, 'Anlage 2');
    assert.ok(j.dokuGeaendert < j.bilddoku.erstellt, 'aktuell');
    await tick(); s.edit('b.jpg', 'nach der Doku'); assert.equal(await s.flushProject(), true);
    j = d.json(); assert.ok(j.dokuGeaendert > j.bilddoku.erstellt, 'veraltet');
    // Neu öffnen (anderer Rechner): Vermerk bleibt, Speichern ohne Änderung lässt ihn stehen
    const t = session(d); await t.open(); assert.deepEqual(JSON.parse(JSON.stringify(t.P.data.extensions.bilddoku)), j.bilddoku);
  });

  await test('Zwei Fenster: Doku-Stand ist kein Widerspruch – der neuere gilt', async () => {
    const d = disk(), a = session(d), b = session(d); await a.open(); await b.open();
    a.edit('a.jpg', 'A ändert'); await tick();
    b.edit('b.jpg', 'B ändert'); b.ctx.bilddokuVermerken(['Bilddokumentation_B.pdf'], 'Anlage 2');
    assert.equal(await a.flushProject(), true);
    assert.equal(await b.flushProject(), true, 'kein Abbruch wegen „Widersprüchliche Änderungen“');
    const j = d.json();
    assert.equal(j.bilder['a.jpg'].beschreibung, 'A ändert'); assert.equal(j.bilder['b.jpg'].beschreibung, 'B ändert');
    assert.deepEqual(j.bilddoku.dateien, ['Bilddokumentation_B.pdf']);
    assert.equal(j.dokuGeaendert, [a.P.data.extensions.dokuGeaendert, b.P.data.extensions.dokuGeaendert].sort().pop());
  });

  console.log(`${n} Fälle bestanden.`);
}
run().catch(e => { console.error(e); process.exit(1); });

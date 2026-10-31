// Stand der Bilddokumentation für BerichtKit: bilddoku (erstellte PDF) und dokuGeaendert in _Bildumbenenner.json.
// Echte FotoKit-Speicher- und Zusammenführfunktionen (Harness aus n2-speichersicherheit.cjs), synthetisches Dateisystem.
const assert = require('node:assert/strict');
const vm = require('node:vm');
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

  await test('Zwei Fenster: kein Widerspruch; eine PDF ohne die Änderung des anderen Fensters gilt als veraltet', async () => {
    const d = disk(), a = session(d), b = session(d); await a.open(); await b.open();
    a.edit('a.jpg', 'A ändert'); await tick();
    b.edit('b.jpg', 'B ändert'); b.ctx.bilddokuVermerken(['Bilddokumentation_B.pdf'], 'Anlage 2');
    assert.equal(await a.flushProject(), true);
    assert.equal(await b.flushProject(), true, 'kein Abbruch wegen „Widersprüchliche Änderungen“');
    const j = d.json();
    assert.equal(j.bilder['a.jpg'].beschreibung, 'A ändert'); assert.equal(j.bilder['b.jpg'].beschreibung, 'B ändert');
    assert.deepEqual(j.bilddoku.dateien, ['Bilddokumentation_B.pdf']);
    assert.ok(j.dokuGeaendert > j.bilddoku.erstellt, 'B hat die PDF ohne die Beschreibung aus A gebaut → veraltet');
  });

  await test('Kausalität: PDF aus altem Stand, Änderung des Kollegen war schon gespeichert → veraltet', async () => {
    const d = disk(), a = session(d), b = session(d); await a.open(); await b.open();
    b.edit('b.jpg', 'Kollege'); assert.equal(await b.flushProject(), true);   // liegt auf der Platte, A weiß nichts davon
    await tick(); a.ctx.bilddokuVermerken(['Bilddokumentation_A.pdf'], 'Anlage 2');   // A baut die PDF aus dem alten Stand
    assert.equal(await a.flushProject(), true);
    const j = d.json(); assert.equal(j.bilder['b.jpg'].beschreibung, 'Kollege');
    assert.ok(j.dokuGeaendert > j.bilddoku.erstellt, 'Zeitstempel allein hätten „aktuell“ ergeben');
  });

  await test('Umgekehrt: eigene ungespeicherte Änderung, Kollege erstellt die PDF → veraltet', async () => {
    const d = disk(), a = session(d), b = session(d); await a.open(); await b.open();
    a.edit('a.jpg', 'noch nicht gespeichert'); await tick();
    b.ctx.bilddokuVermerken(['Bilddokumentation_B.pdf'], 'Anlage 2'); assert.equal(await b.flushProject(), true);
    assert.equal(await a.flushProject(), true);
    const j = d.json(); assert.ok(j.dokuGeaendert > j.bilddoku.erstellt);
  });

  await test('Nur Prüfsummen vom anderen Fenster: PDF bleibt aktuell', async () => {
    const d = disk(), a = session(d), b = session(d); await a.open(); await b.open();
    a.projSet('hash', { 'a.jpg': { h: 'abc', s: 3, m: 4 } }); assert.equal(await a.flushProject(), true);
    await tick(); b.ctx.bilddokuVermerken(['Bilddokumentation_B.pdf'], 'Anlage 2'); assert.equal(await b.flushProject(), true);
    const j = d.json(); assert.ok(!j.dokuGeaendert || j.dokuGeaendert < j.bilddoku.erstellt, 'kein Doku-Inhalt geändert');
  });

  await test('Neue oder entfernte Fotos (neu eingelesen, übernommen) → veraltet, nur einmal', async () => {
    const d = disk(), s = session(d); await s.open();
    s.ctx.S.items = [{ name: 'a.jpg' }, { name: 'b.jpg' }];
    s.ctx.bilddokuVermerken(['Bilddokumentation.pdf'], 'Anlage 2'); assert.equal(await s.flushProject(), true);
    assert.deepEqual(d.json().bilddoku.bestand, ['a.jpg', 'b.jpg']);
    s.ctx.dokuBestandPruefen(); assert.ok(!s.P.data.extensions.dokuGeaendert, 'gleicher Bestand: nichts');
    s.ctx.S.items = [{ name: 'a.jpg' }, { name: 'b.jpg' }, { name: 'c.jpg' }]; await tick();
    s.ctx.dokuBestandPruefen(); const t1 = s.P.data.extensions.dokuGeaendert;
    assert.ok(t1 > s.P.data.extensions.bilddoku.erstellt, 'neues Foto');
    await tick(); s.ctx.dokuBestandPruefen(); assert.equal(s.P.data.extensions.dokuGeaendert, t1, 'nicht bei jedem Einlesen neu');
  });

  // Uhr einer Sitzung festhalten (eigener vm-Kontext je Fenster): new Date() und Date.now() liefern `ms`.
  const uhr = (s, ms) => vm.runInContext(`if (!globalThis.__EchtDate) globalThis.__EchtDate = Date; globalThis.__jetzt = ${ms};
    Date = class extends __EchtDate { constructor(...a){ a.length ? super(...a) : super(globalThis.__jetzt); } static now(){ return globalThis.__jetzt; } };`, s.ctx);
  const T = Date.parse('2026-10-31T09:00:00.000Z');

  await test('Gleiche Millisekunde: PDF erstellen und Zusammenführen → trotzdem veraltet (1.31.1, war zufällig rot in CI)', async () => {
    const d = disk(), a = session(d), b = session(d); await a.open(); await b.open();
    uhr(b, T - 10); b.edit('b.jpg', 'Kollege'); assert.equal(await b.flushProject(), true);
    uhr(a, T); a.ctx.bilddokuVermerken(['Bilddokumentation_A.pdf'], 'Anlage 2');   // PDF und Zusammenführen in derselben Millisekunde
    assert.equal(await a.flushProject(), true);
    const j = d.json(); assert.equal(j.bilddoku.erstellt, new Date(T).toISOString());
    assert.ok(j.dokuGeaendert > j.bilddoku.erstellt, `veraltet trotz gleicher Uhrzeit (${j.dokuGeaendert} / ${j.bilddoku.erstellt})`);
  });

  await test('Uhr des PDF-Rechners geht vor: spätere Änderung auf dem anderen Rechner → veraltet', async () => {
    const d = disk(), a = session(d); await a.open();
    uhr(a, T + 60000); a.ctx.bilddokuVermerken(['Bilddokumentation_A.pdf'], 'Anlage 2'); assert.equal(await a.flushProject(), true);
    const b = session(d); await b.open(); uhr(b, T);   // Rechner B: Uhr eine Minute zurück
    b.edit('b.jpg', 'danach geändert'); assert.equal(await b.flushProject(), true);
    const j = d.json(); assert.ok(j.dokuGeaendert > j.bilddoku.erstellt, `veraltet trotz nachgehender Uhr (${j.dokuGeaendert} / ${j.bilddoku.erstellt})`);
    // … und eine neue PDF auf Rechner B (Uhr zurück) ist danach aktuell – nicht sofort wieder veraltet (Codex-Review #77)
    uhr(b, T + 5); b.ctx.bilddokuVermerken(['Bilddokumentation_B.pdf'], 'Anlage 2'); assert.equal(await b.flushProject(), true);
    const k = d.json(); assert.deepEqual(k.bilddoku.dateien, ['Bilddokumentation_B.pdf']);
    assert.ok(k.dokuGeaendert < k.bilddoku.erstellt, `Ersatz-PDF aktuell (${k.dokuGeaendert} / ${k.bilddoku.erstellt})`);
    // ohne PDF bleibt es die echte Zeit
    const e = disk(), c = session(e); await c.open(); uhr(c, T); c.edit('a.jpg', 'x');
    assert.equal(c.P.data.extensions.dokuGeaendert, new Date(T).toISOString());
  });

  await test('Änderung von einem Rechner mit vorgehender Uhr, PDF auf einem mit nachgehender → aktuell; danach ändern → veraltet', async () => {
    const d = disk(), a = session(d); await a.open();
    uhr(a, T + 60000); a.edit('a.jpg', 'schnelle Uhr'); assert.equal(await a.flushProject(), true);
    const b = session(d); await b.open(); uhr(b, T);
    b.ctx.bilddokuVermerken(['Bilddokumentation_B.pdf'], 'Anlage 2'); assert.equal(await b.flushProject(), true);
    let j = d.json(); assert.ok(j.dokuGeaendert < j.bilddoku.erstellt, `PDF enthält die Änderung → aktuell (${j.dokuGeaendert} / ${j.bilddoku.erstellt})`);
    uhr(b, T + 10); b.edit('b.jpg', 'danach'); assert.equal(await b.flushProject(), true);
    j = d.json(); assert.ok(j.dokuGeaendert > j.bilddoku.erstellt, 'spätere Änderung → veraltet');
    // ohne Doku-Änderung bleibt „erstellt“ die echte Zeit
    const e = disk(), c = session(e); await c.open(); uhr(c, T); c.ctx.bilddokuVermerken(['x.pdf'], '');
    assert.equal(c.P.data.extensions.bilddoku.erstellt, new Date(T).toISOString());
  });

  console.log(`${n} Fälle bestanden.`);
}
run().catch(e => { console.error(e); process.exit(1); });

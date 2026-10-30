// FotoKit 1.30.0 – Deckblatt und Probenübersicht der Bilddokumentation nach dem Testlauf 26.0512 (30.10.2026):
//  • „zum Untersuchungsbericht <Nr>“ statt „zum Gutachten <Nr>“ (Deckblatt und KI-Anweisung im ZIP)
//  • Schadendatum leer oder „nicht bekannt“ (gespeichert „unbekannt“) → Zeile entfällt
//  • Rubrik „Bearbeitung“ statt „Sachverständiger“ – passt auch, wenn die Person im Bericht als Messtechniker unterschreibt
//  • Probenübersicht ohne Spalte „Abschnitt“, wenn keine Probe einen Abschnitt hat
const assert = require('node:assert/strict'), vm = require('node:vm');
const { parse, check, meta, items, html, start, end } = require('./pdf-layout.cjs');

// wie pdf-layout.cjs, aber mit dem echten deDate aus index.html (dort gilt „unbekannt“ → „nicht bekannt“)
const deDateSrc = /const deDate = iso => \{.*\};/.exec(html)[0];
function harness(){
  const c = { Blob, TextEncoder, Uint8Array, atob, APP_NAME: 'FotoKit', APP_VERSION: 'test', store: { get: () => ({}) }, docBaseName: () => 'Muster',
    fmtDate: () => '22.10.2026', fmtTime: () => '09:30', canRotate: () => true, rotOf: () => 0,
    renderJpeg: async f => ({ data: Buffer.from([255, 216, 255, 217]), w: 1200, h: 800 }) };
  vm.runInNewContext(deDateSrc + '\nthis.deDate=deDate;\n' + html.slice(start, end) + '\nthis.build=buildAnnex;', c);
  return c.build;
}
const build = harness();
// Text einer Seite ohne Silben-/Laufweiten-Zerlegung (Rubriken werden zeichenweise gesetzt)
const seite = p => p.text.join('').replace(/\x96/g, '–'); // WinAnsi 0x96 = Gedankenstrich
const pdfOf = async (m, its) => { const r = await build(m, its, () => {}); return check(await r.parts[0].blob.arrayBuffer(), its.map(i => i.docNr)); };
// Probenübersicht = Seite mit dem Tabellenkopf „Probe-Nr.“ (das Deckblatt nennt „Probenahmestellen“ nur im Inhalt)
const probenSeite = pdf => pdf.pages.find(p => seite(p).includes('PROBE-NR.'));

let n = 0;
const test = async (title, fn) => { await fn(); n++; console.log('OK Deckblatt: ' + title); };

(async () => {
  await test('„zum Untersuchungsbericht“ statt „zum Gutachten“', async () => {
    const pdf = await pdfOf(meta(), items(2)), d = seite(pdf.pages[0]);
    assert.ok(d.includes('zum Untersuchungsbericht 26.0101'), d);
    assert.ok(!pdf.pages.some(p => seite(p).includes('Gutachten')), 'nirgends „Gutachten“');
  });

  await test('Schadendatum bekannt → steht da; leer oder „unbekannt“ → Zeile entfällt', async () => {
    const mit = seite((await pdfOf(meta(), items(2))).pages[0]);
    assert.ok(mit.includes('SCHADENDATUM') && mit.includes('12.10.2026'), mit);
    for (const v of ['unbekannt', ' Unbekannt ', '']) {
      const m = meta(); m.sdatum = v;
      const d = seite((await pdfOf(m, items(2))).pages[0]);
      assert.ok(!d.includes('SCHADENDATUM'), `Rubrik fehlt bei „${v}“`);
      assert.ok(!d.includes('nicht bekannt'), `kein „nicht bekannt“ bei „${v}“`);
      assert.ok(d.includes('ORTSTERMIN') && d.includes('22.10.2026'), 'übrige Angaben bleiben');
    }
  });

  await test('Rubrik „Bearbeitung“ statt „Sachverständiger“, Name bleibt', async () => {
    const d = seite((await pdfOf(meta(), items(2))).pages[0]);
    assert.ok(d.includes('BEARBEITUNG') && d.includes('Dipl.-Ing. Beispiel'), d);
    assert.ok(!/SACHVERST/i.test(d), 'keine Rolle „Sachverständiger“ auf dem Deckblatt');
    const m = meta(); m.sv = '';
    assert.ok(!seite((await pdfOf(m, items(2))).pages[0]).includes('BEARBEITUNG'), 'ohne Namen keine leere Rubrik');
  });

  await test('Probenübersicht: Spalte „Abschnitt“ nur, wenn eine Probe einen Abschnitt hat', async () => {
    const ohne = items(3); ohne.forEach((it, i) => { it.secEff = ''; it.probe = 'P' + (i + 1); });
    const s1 = seite(probenSeite(await pdfOf(meta(), ohne)));
    assert.ok(s1.includes('PROBE-NR.') && s1.includes('BESCHREIBUNG'), s1);
    assert.ok(!s1.includes('ABSCHNITT'), 'keine Spalte Abschnitt');
    assert.ok(!s1.includes('–'), 'keine „–“-Platzhalter');
    for (let i = 1; i <= 3; i++) assert.ok(s1.includes('P' + i) && s1.includes(`Motiv ${i}`), 'jede Probe mit Beschreibung');

    const teils = items(3); teils.forEach((it, i) => { it.secEff = i === 1 ? 'Küche' : ''; it.probe = 'P' + (i + 1); });
    const s2 = seite(probenSeite(await pdfOf(meta(), teils)));
    assert.ok(s2.includes('ABSCHNITT') && s2.includes('Küche'), 'Spalte bleibt, sobald ein Abschnitt da ist');
    assert.ok(s2.includes('–'), 'Proben ohne Abschnitt behalten „–“');
  });

  await test('Lange Beschreibung ohne Abschnittsspalte nutzt die freie Breite und geht nicht verloren', async () => {
    const a = items(1); a[0].secEff = ''; a[0].probe = 'P1'; a[0].desc = 'Wort '.repeat(300) + 'ENDEPROBE';
    const pdf = await pdfOf(meta(), a), s = pdf.pages.filter(p => !/\/Im\d+ Do/.test(p.ops)).map(seite).join(' ');
    assert.ok(s.includes('ENDEPROBE'));
    // Beschreibung beginnt dort, wo sonst „Abschnitt“ stand (x ≈ 56.69 + 114 + 4)
    const ops = probenSeite(pdf).ops;
    assert.match(ops, /174\.69 [\d.]+ Td \(Wort/, 'Beschreibung rückt in die dritte Spalte');
  });

  // KI-Anweisung im ZIP (DEFAULT_TEMPLATE)
  await test('KI-Anweisung: Untersuchungsbericht, „Bearbeitung“, fehlende/unbekannte Angaben weglassen', async () => {
    const tpl = /const DEFAULT_TEMPLATE = `([\s\S]*?)`;/.exec(html)[1];
    assert.ok(tpl.includes('{Anlage} zum Untersuchungsbericht {Projektnummer}'));
    assert.ok(!tpl.includes('Gutachten'));
    assert.ok(tpl.includes('Bearbeitung = {Sachverständiger}'));
    assert.ok(tpl.includes('"nicht bekannt" sind, weglassen'));
  });

  console.log(n + ' Deckblatt-Tests bestanden');
})().catch(e => { console.error(e); process.exitCode = 1; });

// FotoKit 2.6.0 – Audit 2026-11 Lauf 5 im echten Browser: node tests/probe-labelkit-browser.cjs [chromium]
// E2: FotoKit merkt sich beim Zuordnen die LabelKit-Beschreibung der Probe (Feld „probeLabelKit“ je Bild in _Bildumbenenner.json).
//     Nummeriert LabelKit vor der ersten festen Nummer neu (P1 gelöscht → aus P2 wird P1), zeigt FotoKit danach einen Hinweis –
//     oben, auf der Kachel und in der Fotokarte –, auch wenn die Nummern inzwischen fest sind (die A4-Zeile ist dann weg).
//     „✓ Zuordnung stimmt“ merkt den heutigen Text; eine neue Zuordnung merkt den Text der neuen Probe. Die Bilddoku gilt dadurch nicht
//     als geändert. Ein Foto aus einer älteren Projektdatei (ohne das Feld) bekommt den Text beim Lesen der LabelKit-Datei.
// A18: „Noch ohne Foto: P2“ über den Kacheln – nur Hinweis, erst wenn überhaupt ein Foto einer Probe zugeordnet ist.
// Synthetisches OPFS-Projekt, nur erfundene Namen. LabelKit-Datei wird nur gelesen.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const A = '26.0905 Probenweg Teststadt Dr.Ka';
const FEST = { am: '2026-11-21T08:00:00.000Z', anlass: 'Etiketten' };
const K = { id: 1, z2: 'EG Küche', z3: 'verrußt', z4: 'Aufsicht' }, F = { id: 2, z2: 'EG Flur', z3: 'verrußt', z4: 'Aufsicht' }, H = { id: 3, z2: 'EG Wohnen Heizkörper', z3: 'gereinigt', z4: 'Ansicht' };
const D = { id: 4, z2: 'OG Bad', z3: 'verrußt', z4: 'Wand' };
// Vorher: P1 Küche, P2 Flur, P3 Heizkörper (Chlorid), P4 Bad – noch nichts fest
const vorher = { version: '5.1.1', projekt: { nr: '26.0905' }, probenStartNr: 1,
  proben: [{ ...K, _nr: 1 }, { ...F, _nr: 2 }], chloridProben: [{ ...H, _nr: 3 }], asbestProben: [], sonstigeProben: [{ ...D, _nr: 4 }] };
// Nachher: Küche gelöscht, LabelKit hat neu nummeriert und dann Etiketten gedruckt (fest): P1 Flur, P2 Heizkörper, P3 Bad
const nachher = { version: '5.1.1', projekt: { nr: '26.0905' }, probenStartNr: 1,
  proben: [{ ...F, _nr: 1, nrFest: FEST }], chloridProben: [{ ...H, _nr: 2, nrFest: FEST }], asbestProben: [], sonstigeProben: [{ ...D, _nr: 3, nrFest: FEST }] };
const KUECHE = 'EG Küche verrußt Aufsicht', FLUR = 'EG Flur verrußt Aufsicht', HEIZ = 'EG Wohnen Heizkörper gereinigt Ansicht', BAD = 'OG Bad verrußt Wand';
let browser, server;
(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await playwright[browserName].launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const canWrite = await page.evaluate(async () => {
    try { const d = await navigator.storage.getDirectory(), h = await d.getFileHandle('probe', { create: true });
      if (!('showDirectoryPicker' in window) || !h.createWritable) return false;
      const w = await h.createWritable(); await w.write('test'); await w.close(); return true;
    } catch { return false; }
  });
  if (!canWrite) { console.log(`SKIP (${browserName}): kein schreibbarer Ordnerzugriff`); assert.deepEqual(errors, []); await browser.close(); server.close(); return; }

  const bild = (name, i) => page.evaluate(async ([proj, name, i]) => {
    const p = await (await navigator.storage.getDirectory()).getDirectoryHandle(proj, { create: true });
    const d = await p.getDirectoryHandle('Fotos', { create: true });
    const c = document.createElement('canvas'); c.width = 64 + i; c.height = 48;
    const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 67},70%,50%)`; g.fillRect(0, 0, c.width, c.height);
    const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(await new Promise(r => c.toBlob(r, 'image/jpeg'))); await w.close();
  }, [A, name, i]);
  const schreiben = (ordner, name, o) => page.evaluate(async ([proj, ordner, name, t]) => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(proj, { create: true });
    for (const o of ordner) d = await d.getDirectoryHandle(o, { create: true });
    const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(t); await w.close();
  }, [A, ordner, name, JSON.stringify(o)]);
  const lkSchreiben = o => schreiben(['_Spektron', 'LabelKit'], '26.0905_Daten.json', o);
  const projektdatei = () => page.evaluate(async proj => {
    const p = await (await navigator.storage.getDirectory()).getDirectoryHandle(proj);
    const d = await (await p.getDirectoryHandle('_Spektron')).getDirectoryHandle('FotoKit');
    return JSON.parse(await (await (await d.getFileHandle('_Bildumbenenner.json')).getFile()).text());
  }, A);
  const gespeichert = async (pruefen, was) => { const t0 = Date.now(); let o;
    while (Date.now() - t0 < 10000) { try { o = await projektdatei(); if (pruefen(o)) return o; } catch {} await page.waitForTimeout(150); }
    assert.fail(`${was} – nicht gespeichert: ${JSON.stringify(o && o.bilder)}`); };

  for (let i = 0; i < 4; i++) await bild(`IMG_${1001 + i}.jpg`, i);
  // Projektdatei einer älteren FotoKit-Fassung: IMG_1004 ist schon P4 zugeordnet, ohne gemerkten Text
  await schreiben(['_Spektron', 'FotoKit'], '_Bildumbenenner.json', { app: 'Bildumbenenner', format: 1, version: '2.5.0', projekt: {}, benennung: {}, reihenfolge: [],
    bilder: { 'IMG_1004.jpg': { probe: 'P4' } } });
  await lkSchreiben(vorher);
  await page.evaluate(async a => { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle(a); window.showDirectoryPicker = async () => p; }, A);
  await ui.oeffnen(page);
  await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 4);
  await page.waitForFunction(() => document.querySelectorAll('#probeList option').length === 4);   // LabelKit-Datei gelesen
  const row = name => page.locator(`#list .row[aria-label^="${name}"]`);
  const waehle = async name => { const r = row(name); if (!(await r.evaluate(e => e.classList.contains('active')))) await r.locator('.tinfo').click(); };
  const sichtbar = sel => page.locator(sel).evaluate(e => e.hidden ? '' : e.textContent);
  const zuordnen = async (name, p) => { await waehle(name); await page.locator('#fProbe').fill(p); await page.locator('#fProbe').press('Tab'); };

  // A18: nur IMG_1004 (P4) zugeordnet → P1, P2, P3 ohne Foto
  await page.waitForFunction(() => !document.getElementById('ohneFoto').hidden);
  assert.equal(await sichtbar('#ohneFoto'), 'Noch ohne Foto: P1, P2, P3');
  await zuordnen('IMG_1001', 'P1');
  await zuordnen('IMG_1002', 'P3');
  await page.waitForFunction(() => document.getElementById('ohneFoto').textContent === 'Noch ohne Foto: P2');
  // „Weg“-Fotos zählen nicht: IMG_1004 aussortiert → P4 wieder ohne Foto
  await ui.inDoku(page, 3, false);
  await page.waitForFunction(() => document.getElementById('ohneFoto').textContent === 'Noch ohne Foto: P2, P4');
  await ui.inDoku(page, 3, true);
  await page.waitForFunction(() => document.getElementById('ohneFoto').textContent === 'Noch ohne Foto: P2');

  // E2: gemerkt wird der Text beim Zuordnen; das Foto aus der alten Datei bekommt ihn mit dem nächsten Speichern
  let o = await gespeichert(o => o.bilder['IMG_1002.jpg'] && o.bilder['IMG_1002.jpg'].probeLabelKit, 'Zuordnung P3');
  assert.deepEqual(o.bilder['IMG_1001.jpg'].probeLabelKit, { P1: KUECHE });
  assert.deepEqual(o.bilder['IMG_1002.jpg'].probeLabelKit, { P3: HEIZ });
  assert.deepEqual(o.bilder['IMG_1004.jpg'].probeLabelKit, { P4: BAD }, 'alte Zuordnung: Text beim Lesen der LabelKit-Datei gemerkt');
  assert.equal(await sichtbar('#lkAndersZeile'), '', 'nichts verschoben: kein Hinweis');
  assert.equal(await sichtbar('#nrZeile') !== '', true, 'A4-Zeile, solange nichts fest ist');

  // LabelKit: Küche gelöscht, neu nummeriert, dann Etiketten gedruckt
  await lkSchreiben(nachher);
  await ui.mehr(page, 'mehrReload');
  await page.waitForFunction(() => !document.getElementById('lkAndersZeile').hidden, null, { timeout: 8000 });
  assert.equal(await sichtbar('#nrZeile'), '', 'Nummern fest: A4-Zeile weg');
  // P1 ist jetzt der Flur, P3 das Bad; P4 gibt es nicht mehr
  assert.match(await sichtbar('#lkAndersZeile'), /^⚠ Seit der Zuordnung sind in LabelKit die Proben P1 und P3 anders beschrieben \(2 Fotos, mit ⚠ markiert\)\. .*bitte prüfen\.$/);
  assert.equal(await row('IMG_1001').locator('.tnote.storno').textContent(), '⚠ P1 in LabelKit geändert');
  assert.equal(await row('IMG_1002').locator('.tnote.storno').textContent(), '⚠ P3 in LabelKit geändert');
  assert.equal(await row('IMG_1004').locator('.tnote.storno').textContent(), '⚠ P4 nicht in LabelKit', 'Nummer gibt es nicht mehr: Hinweis wie bisher');
  assert.equal(await sichtbar('#ohneFoto'), 'Noch ohne Foto: P2');
  await waehle('IMG_1001');
  assert.equal(await sichtbar('#fLkAnders span'), `⚠ P1 hieß beim Zuordnen „${KUECHE}“, in LabelKit heißt sie jetzt „${FLUR}“. Hat sich die Nummer verschoben, bitte die richtige Probe eintragen. Gehört das Foto noch dazu: „Zuordnung stimmt“.`);
  assert.equal(await page.locator('#fProbe').inputValue(), 'P1', 'FotoKit ändert die Zuordnung nicht selbst');
  assert.match(await page.locator('#fProbe').evaluate(e => e.getAttribute('aria-describedby').split(' ').map(id => document.getElementById(id).textContent).join(' ')), /P1 hieß beim Zuordnen/, 'Hinweis am Feld angesagt');
  await waehle('IMG_1004');
  assert.match(await sichtbar('#fStorno'), /^⚠ P4 gibt es in LabelKit nicht/);
  assert.equal(await page.locator('#fLkAnders').evaluate(e => e.hidden), true, 'nur ein Hinweis je Foto');

  // Neue Zuordnung: IMG_1002 gehört zum Heizkörper (jetzt P2), IMG_1004 zum Bad (jetzt P3) → Text der neuen Probe, kein Hinweis
  await zuordnen('IMG_1002', 'P2'); await zuordnen('IMG_1004', 'P3');
  o = await gespeichert(o => (o.bilder['IMG_1004.jpg'].probeLabelKit || {}).P3, 'neue Zuordnung');
  assert.deepEqual(o.bilder['IMG_1002.jpg'].probeLabelKit, { P2: HEIZ }); assert.deepEqual(o.bilder['IMG_1004.jpg'].probeLabelKit, { P3: BAD });
  assert.deepEqual(o.bilder['IMG_1001.jpg'].probeLabelKit, { P1: KUECHE }, 'der alte Text bleibt der Vergleich, bis jemand bestätigt');

  // „✓ Zuordnung stimmt“ (das Foto zeigt doch den Flur): Hinweis weg, heutiger Text gemerkt, Bilddoku gilt nicht als geändert
  await waehle('IMG_1001'); await page.locator('#bLkStimmt').click();
  await page.waitForFunction(() => document.getElementById('lkAndersZeile').hidden && document.getElementById('fLkAnders').hidden);
  assert.equal(await row('IMG_1001').locator('.tnote.storno').evaluate(e => e.hidden), true);
  assert.equal(await page.locator('#fProbe').inputValue(), 'P1');
  o = await gespeichert(o => (o.bilder['IMG_1001.jpg'].probeLabelKit || {}).P1 === FLUR, 'bestätigt');
  const dokuNach = o.dokuGeaendert;
  assert.equal(await sichtbar('#ohneFoto'), '', 'jede Probe hat ein Foto');

  // Bestätigen allein ändert „Doku geändert“ nicht: Vergleich mit einem zweiten Bestätigen nach erneutem Verschieben
  await lkSchreiben({ ...nachher, proben: [{ ...F, z3: 'gereinigt', _nr: 1, nrFest: FEST }] });
  await ui.mehr(page, 'mehrReload');
  await page.waitForFunction(() => !document.getElementById('lkAndersZeile').hidden, null, { timeout: 8000 });
  await waehle('IMG_1001'); await page.locator('#bLkStimmt').click();
  o = await gespeichert(o => (o.bilder['IMG_1001.jpg'].probeLabelKit || {}).P1 === 'EG Flur gereinigt Aufsicht', 'zweites Bestätigen');
  assert.equal(o.dokuGeaendert, dokuNach, '„Zuordnung stimmt“ ändert nichts an der Bilddoku');

  assert.deepEqual(errors, []);
  console.log(`OK (${browserName}): LabelKit-Beschreibung beim Zuordnen gemerkt, Hinweis nach dem Verschieben auch mit festen Nummern, „Zuordnung stimmt“, noch ohne Foto`);
  await browser.close(); server.close();
})().catch(async e => { console.error(e); try { await browser?.close(); } catch {} server?.close(); process.exit(1); });

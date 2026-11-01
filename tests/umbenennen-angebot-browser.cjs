// FotoKit 2.0: „Dateien umbenennen“ ist nicht Teil des Ablaufs (unter „Mehr …“). Beim ersten Erstellen der Bilddoku eines Projekts
// bietet der Dialog es EINMAL an – vorher, damit das PDF die neuen Dateinamen nennt und die Bilddoku für BerichtKit aktuell bleibt.
// Dazu: „Gehört zu Probe“ schlägt die Proben aus LabelKit vor. node tests/umbenennen-angebot-browser.cjs [chromium|webkit]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');

const name = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await playwright[name].launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('willkommen-gelesen', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(base);
  await page.waitForSelector('#btnOpen2');
  const kann = await page.evaluate(async () => {
    if (!('showDirectoryPicker' in window) || !navigator.storage || !navigator.storage.getDirectory) return false;
    try{ const r = await navigator.storage.getDirectory(); const h = await r.getFileHandle('probe', { create: true }); if (!h.createWritable) return false; await r.removeEntry('probe'); return true; }catch(e){ return false; }
  });
  if (!kann){ assert.deepEqual(errors, []); await browser.close(); server.close(); console.log(`OK (${name}, ohne Ordnerzugriff: nur Laden geprüft)`); return; }

  // Projekt mit 3 Fotos und einer LabelKit-Datei (erfundene Proben)
  await page.evaluate(async () => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    const p = await r.getDirectoryHandle('26.0998 Teststadt', { create: true });
    const fotos = await p.getDirectoryHandle('Fotos', { create: true });
    const put = async (d, n, x) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(x); await w.close(); };
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    for (let i = 1; i <= 3; i++) await put(fotos, `IMG_${String(i).padStart(4, '0')}.png`, png);
    await put(await p.getDirectoryHandle('Laboraufträge', { create: true }), '26.0998_Daten.json',
      JSON.stringify({ proben: [{ _nr: 1, z2: 'EG Kueche', z3: 'verrusst', z4: 'Untersicht' }, { _nr: 2, z2: 'EG Flur', z3: 'leicht', z4: 'Ansicht' }] }));
    window.showDirectoryPicker = async () => p;
  });
  await ui.oeffnen(page);
  await page.waitForFunction(() => document.querySelectorAll('#list .row').length === 3, null, { timeout: 15000 });

  // „Gehört zu Probe“: Vorschläge aus LabelKit
  await page.waitForFunction(() => document.querySelectorAll('#probeList option').length === 2, null, { timeout: 10000 });
  assert.deepEqual(await page.$$eval('#probeList option', os => os.map(o => o.value)), ['P1', 'P2']);
  assert.match(await page.locator('#probeList option').first().getAttribute('label'), /^P1 – EG Kueche/);

  for (const [i, t] of ['Kueche Decke', 'Flur Wand', 'Keller Treppe'].entries()) await ui.feld(page, 'desc', i).fill(t);
  await ui.feld(page, 'probe', 0).fill('P1');

  // 1. Mal „Bilddokumentation erstellen“: Angebot im Dialog, nicht angehakt
  await page.click('#btnPdf');
  await page.waitForSelector('#overlay.show #zOk');
  assert.equal(await page.locator('#pRenameBox').isVisible(), true, 'einmaliges Angebot im Dialog');
  assert.equal(await page.locator('#pRename').isChecked(), false, 'nicht vorgehakt');
  assert.match(await page.locator('#pRenameBox code').textContent(), /^01_P1_Kueche_Decke\.png$/);
  await page.check('#pRename');
  await page.click('#zOk');
  await page.waitForFunction(() => /PDF erstellt/.test(document.getElementById('banner').textContent), null, { timeout: 30000 });

  const stand = await page.evaluate(async () => {
    const such = async (d, nm) => { for await (const [n, h] of d.entries()){ if (h.kind === 'file' && n === nm) return h; if (h.kind === 'directory'){ const x = await such(h, nm); if (x) return x; } } return null; };
    const r = await navigator.storage.getDirectory(), fotos = await (await r.getDirectoryHandle('26.0998 Teststadt')).getDirectoryHandle('Fotos');
    const namen = []; for await (const [n, h] of fotos.entries()) if (h.kind === 'file') namen.push(n);
    let letzte = '';
    for (let i = 0; i < 100; i++){
      try{ const t = await (await (await such(r, '_Bildumbenenner.json')).getFile()).text(); letzte = t.slice(0, 300); const e = JSON.parse(t);   // bilddoku und dokuGeaendert stehen oben in der Projektdatei
        if (e.bilddoku) return { namen: namen.sort(), erstellt: e.bilddoku.erstellt, geaendert: e.dokuGeaendert || '', dateien: e.bilddoku.dateien }; }catch(e){}
      await new Promise(res => setTimeout(res, 100));
    }
    return { namen, letzte };
  });
  assert.ok(stand.namen.includes('01_P1_Kueche_Decke.png') && stand.namen.includes('02_Flur_Wand.png') && stand.namen.includes('03_Keller_Treppe.png'), 'erst umbenannt: ' + stand.namen.join(', '));
  assert.ok(stand.namen.some(n => /^Bilddokumentation_.*\.pdf$/.test(n)), 'dann das PDF');
  assert.ok(stand.erstellt && stand.erstellt > stand.geaendert, `Bilddoku bleibt aktuell (erstellt ${stand.erstellt} nach ${stand.geaendert || '–'})`);
  assert.equal(await page.locator('#list .row').first().getAttribute('aria-label'), '01_P1_Kueche_Decke.png');

  // 2. Mal: kein Angebot mehr – Umbenennen bleibt unter „Mehr …“
  await page.click('#btnPdf');
  await page.waitForSelector('#overlay.show #zOk');
  assert.equal(await page.locator('#pRenameBox').count(), 0, 'nur einmal angeboten');
  await page.click('#zCancel');

  // Review: offener Vorschlag beim Verschieben gehört zum verschobenen Foto, nicht zum Nachbarn
  await ui.foto(page, 2);
  await page.fill('#fDesc', '');
  await page.locator('#fDesc').pressSequentially('Ku');
  assert.equal(await page.locator('#fDesc').inputValue(), 'Kueche Decke', 'Vorschlag erscheint');
  await page.keyboard.press('Alt+ArrowLeft');
  const tiles = page.locator('#list .row .tdesc');
  assert.equal(await tiles.nth(1).textContent(), 'Ku', 'verschobenes Foto: nur das Getippte');
  assert.equal(await tiles.nth(2).textContent(), 'Flur Wand', 'Nachbar unverändert');

  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log(`OK (${name}): einmaliges Umbenennen-Angebot vor dem PDF, Bilddoku bleibt aktuell; LabelKit-Proben als Vorschläge; Vorschlag beim Verschieben`);
})().catch(e => { console.error(e); process.exit(1); });

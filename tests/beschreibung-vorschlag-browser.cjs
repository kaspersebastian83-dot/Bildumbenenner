// Vorschläge beim Tippen der Beschreibung (FotoKit 1.16): echte Tastatur auf einem synthetischen OPFS-Projekt.
// LabelKit-Projektdatei in „Laboraufträge“ (nur gelesen): P1/P2 PAK, P3 Asbest, P9 Sonstige mit eigener _nr.
// Prüft: „P2“ + Enter → Beschreibung aus LabelKit, P2 ins Feld Probe-Nr.; Ergänzung aus vorherigen Beschreibungen;
// Weitertippen ersetzt; Esc verwirft; Tab übernimmt und man tippt weiter; Verlassen ohne Übernahme behält nur das Getippte;
// abschaltbar; LabelKit-Datei unverändert. Nur erfundene Namen.
// FotoKit 2.0: eine Fotokarte (#fDesc/#fProbe) für das gewählte Foto statt Eingabefeldern je Zeile; „Dateinamen …“ unter „Mehr …“.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const LABELKIT = { version: '4.39.1', projekt: { nr: '26.0901' }, probenStartNr: 1,
  proben: [{ id: 11, z2: 'Küche', z3: 'verrußt', z4: 'Untersicht' }, { id: 12, z2: 'Flur', z3: 'mit Ruß', z4: 'Ansicht' }],
  chloridProben: [], asbestProben: [{ id: 13, z2: 'Keller', z3: 'Floor-Flex-Platte', z4: 'fest' }],
  sonstigeProben: [{ id: 14, _nr: 9, z2: 'Bad', z3: '', z4: 'Aufsicht' }] };
let browser, server;
(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await playwright[browserName].launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const canWrite = await page.evaluate(async () => {
    try { const d = await navigator.storage.getDirectory(), h = await d.getFileHandle('probe', { create: true });
      if (!('showDirectoryPicker' in window) || !h.createWritable) return false;
      const w = await h.createWritable(); await w.write('test'); await w.close(); return true;
    } catch { return false; }
  });
  if (!canWrite) { console.log(`SKIP (${browserName}): kein schreibbarer Ordnerzugriff`); assert.deepEqual(errors, []); await browser.close(); server.close(); return; }
  const labelkitText = JSON.stringify(LABELKIT);
  await page.evaluate(async lk => {
    const root = await navigator.storage.getDirectory();
    const put = async (d, name, data) => { const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); };
    const p = await root.getDirectoryHandle('26.0901 Vorschlag', { create: true });
    const d = await p.getDirectoryHandle('Fotos', { create: true });
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas'); c.width = 64 + i; c.height = 48;
      const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 47},70%,50%)`; g.fillRect(0, 0, c.width, c.height);
      await put(d, `IMG_${String(i + 1).padStart(4, '0')}.jpg`, await new Promise(r => c.toBlob(r, 'image/jpeg')));
    }
    await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'Vorschlag' }));
    await put(await p.getDirectoryHandle('Laboraufträge', { create: true }), '26.0901_25.10.2026_Daten.json', lk);
    window.showDirectoryPicker = async () => p;
  }, labelkitText);
  await ui.oeffnen(page);
  await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 6);
  const rows = page.locator('#list .row'), fDesc = page.locator('#fDesc');
  // Foto i ist gewählt (Kachel .active) – die Fotokarte zeigt also seine Felder
  const gewaehlt = async i => assert.equal(await rows.nth(i).evaluate(e => e.classList.contains('active')), true, `Foto ${i + 1} gewählt`);
  const zustand = async i => { await gewaehlt(i); return fDesc.evaluate(e => ({ wert: e.value, markiert: e.value.slice(e.selectionStart, e.selectionEnd) })); };
  const imFeld = async i => { await gewaehlt(i); return fDesc.evaluate(e => e === document.activeElement); };
  const tippe = async t => { for (const ch of t) await page.keyboard.type(ch); };

  // 1) „P2“ → Beschreibung aus LabelKit, markiert; Enter übernimmt, P2 wandert ins Feld Probe-Nr.
  // LabelKit-Datei wird beim Öffnen im Hintergrund gelesen: bis zu 5 s erneut versuchen
  for (const ende = Date.now() + 5000; ;){
    await ui.feld(page, 'desc', 0).click(); await ui.feld(page, 'desc', 0).fill(''); await tippe('P2');
    if ((await zustand(0)).wert !== 'P2' || Date.now() > ende) break;
    await page.waitForTimeout(200);
  }
  assert.deepEqual(await zustand(0), { wert: 'P2 Flur mit Ruß Ansicht', markiert: ' Flur mit Ruß Ansicht' });
  await page.keyboard.press('Enter');
  assert.equal(await imFeld(1), true, 'Enter geht zum nächsten Bild');
  assert.equal(await rows.nth(0).locator('.tdesc').textContent(), 'Flur mit Ruß Ansicht');
  assert.match(await rows.nth(0).locator('.tsub').textContent(), /^Probe 2 · /, 'P2 in der Kachel');

  // 2) Ergänzung aus der vorherigen Beschreibung; Weitertippen ersetzt den Vorschlag
  await tippe('Fl');
  assert.deepEqual(await zustand(1), { wert: 'Flur mit Ruß Ansicht', markiert: 'ur mit Ruß Ansicht' });
  await tippe('ur Decke');
  assert.deepEqual(await zustand(1), { wert: 'Flur Decke', markiert: '' });
  await page.keyboard.press('Enter');
  assert.equal(await imFeld(2), true);
  assert.equal(await rows.nth(1).locator('.tdesc').textContent(), 'Flur Decke');
  assert.equal(await rows.nth(1).locator('.tsub').textContent(), 'IMG_0002.jpg', 'ohne bekannte Probennummer bleibt Probe-Nr. leer');

  // 3) Esc verwirft; Tab übernimmt und man tippt weiter (Vorschlag aus LabelKit)
  await tippe('Kü');
  assert.deepEqual(await zustand(2), { wert: 'Küche verrußt Untersicht', markiert: 'che verrußt Untersicht' });
  await page.keyboard.press('Escape');
  assert.deepEqual(await zustand(2), { wert: 'Kü', markiert: '' });
  await tippe('che');
  assert.equal((await zustand(2)).wert, 'Küche verrußt Untersicht');
  await page.keyboard.press('Tab');
  assert.equal(await imFeld(2), true, 'Tab bleibt im Feld, solange ein Vorschlag offen war');
  await tippe(' Detail');
  assert.equal((await zustand(2)).wert, 'Küche verrußt Untersicht Detail');
  await page.keyboard.press('Enter');

  // 4) Verlassen ohne Übernahme (Klick woandershin) → nur das Getippte bleibt
  await tippe('Ke');
  assert.equal((await zustand(3)).wert, 'Keller Floor-Flex-Platte');
  await ui.foto(page, 5);
  assert.equal(await rows.nth(3).locator('.tdesc').textContent(), 'Ke');
  assert.equal(await ui.feld(page, 'desc', 3).inputValue(), 'Ke');

  // 5) Probe mit eigener Nummer aus „Sonstige“ (P9); „p9“ klein geschrieben
  await ui.feld(page, 'desc', 4).click(); await tippe('p9');
  assert.equal((await zustand(4)).wert, 'p9 Bad Aufsicht');
  await page.keyboard.press('Enter');
  assert.equal(await ui.feld(page, 'probe', 4).inputValue(), 'P9');
  assert.equal(await page.locator('#fDesc').inputValue(), 'Bad Aufsicht');
  assert.match(await page.locator('#pvNew').textContent(), /05_P9_Bad_Aufsicht\.jpg/, 'Dateiname mit Probe-Nr. und Beschreibung');

  // 6) Abschaltbar
  await ui.namen(page); await page.locator('#oVorschlag').uncheck(); await ui.namenZu(page);
  await ui.feld(page, 'desc', 5).click(); await tippe('Kü');
  assert.deepEqual(await zustand(5), { wert: 'Kü', markiert: '' }, 'ohne Vorschläge keine Ergänzung');
  await ui.namen(page); await page.locator('#oVorschlag').check(); await ui.namenZu(page);

  // LabelKit-Datei wird nur gelesen
  const nachher = await page.evaluate(async () => { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0901 Vorschlag');
    return (await (await (await p.getDirectoryHandle('Laboraufträge')).getFileHandle('26.0901_25.10.2026_Daten.json')).getFile()).text(); });
  assert.equal(nachher, labelkitText, 'LabelKit-Datei unverändert');
  assert.deepEqual(errors, []);
  console.log(`OK (${browserName}): Vorschläge beim Tippen – LabelKit-Probe, Projektbeschreibungen, ersetzen, Esc, Tab, Verlassen, abschaltbar`);
  await browser.close(); server.close();
})().catch(async e => { console.error(e); console.log(`::error title=Browsertest Vorschläge ${browserName}::${String(e && e.message || e).split('\n')[0]}`); try { await browser?.close(); server?.close(); } catch {} process.exit(1); });

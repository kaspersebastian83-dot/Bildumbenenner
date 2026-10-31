// FotoKit 1.31.0 – in LabelKit stornierte Proben (Nachzug zu LabelKit 4.49.0 „Proben stornieren“) im echten Browser.
// Synthetisches OPFS-Projekt, LabelKit-Datei in „Laboraufträge“ (nur gelesen): P1 PAK, P2 PAK storniert, P3 Asbest.
// Prüft: P2 wird nicht vorgeschlagen (P2 + Enter, Ergänzung); P2 von Hand eingetippt → Hinweis in der Zeile und Zählung oben;
// vor PDF und ZIP Rückfrage (Abbrechen exportiert nichts, springt zum Foto; „Trotzdem exportieren“ erstellt die PDF), keine bei aussortiert;
// Zuordnung, Dateiname und Ordner bleiben; nach „Fotos neu einlesen“ ist das Foto noch P2 zugeordnet → Hinweis wieder da;
// aussortiert → kein Hinweis; Storno in LabelKit aufgehoben + „Fotos neu einlesen“ → wieder angeboten, Hinweis weg;
// LabelKit-Datei unverändert. Nur erfundene Namen.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const FEST = { am: '2026-10-29T08:00:00.000Z', anlass: 'Etiketten' };
const LABELKIT = { version: '4.49.0', nrSchutz: 1, projekt: { nr: '26.0902' }, probenStartNr: 1,
  proben: [{ id: 11, _nr: 1, z2: 'Küche', z3: 'verrußt', z4: 'Untersicht', nrFest: FEST },
           { id: 12, _nr: 2, z2: 'Dachboden', z3: 'stark verrußt', z4: 'Sparren', nrFest: FEST, storniert: { am: '2026-10-30T10:00:00.000Z', kuerzel: 'Ka', grund: 'doppelt genommen' } }],
  chloridProben: [], asbestProben: [{ id: 13, _nr: 3, z2: 'Keller', z3: 'Floor-Flex-Platte', nrFest: FEST }], sonstigeProben: [] };
const DATEI = '26.0902_Daten.json';
const HINWEIS = '⚠ P2 ist in LabelKit storniert – dieses Foto ist noch P2 zugeordnet. Ordne es einer anderen Probe zu oder sortiere es mit ✕ aus.';
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
  const lkSchreiben = text => page.evaluate(async ([name, t]) => {
    const p = await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0902 Storno', { create: true });
    const w = await (await (await p.getDirectoryHandle('Laboraufträge', { create: true })).getFileHandle(name, { create: true })).createWritable(); await w.write(t); await w.close();
  }, [DATEI, text]);
  const lkLesen = () => page.evaluate(async name => { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0902 Storno');
    return (await (await (await p.getDirectoryHandle('Laboraufträge')).getFileHandle(name)).getFile()).text(); }, DATEI);
  const fotos = () => page.evaluate(async () => { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0902 Storno');
    const out = []; for await (const h of (await p.getDirectoryHandle('Fotos')).values()) if (/\.jpg$/i.test(h.name)) out.push(h.name); return out.sort(); });
  const gespeicherteProbe = name => page.evaluate(async n => { try { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0902 Storno');
    const d = await (await p.getDirectoryHandle('_Spektron')).getDirectoryHandle('FotoKit');   // neues Projekt: Projektdatei in „_Spektron/FotoKit“
    const o = JSON.parse(await (await (await d.getFileHandle('_Bildumbenenner.json')).getFile()).text()); return (o.bilder[n] || {}).probe || ''; } catch { return null; } }, name);
  const pdfs = () => page.evaluate(async () => { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0902 Storno');
    const out = []; for await (const h of (await p.getDirectoryHandle('Fotos')).values()) if (/\.(pdf|zip)$/i.test(h.name)) out.push(h.name); return out.sort(); });
  const dialogOffen = () => page.locator('#overlay').evaluate(e => e.classList.contains('show'));
  const picker = () => page.evaluate(async () => { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0902 Storno'); window.showDirectoryPicker = async () => p; });
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const put = async (d, name, data) => { const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); };
    const p = await root.getDirectoryHandle('26.0902 Storno', { create: true });
    const d = await p.getDirectoryHandle('Fotos', { create: true });
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('canvas'); c.width = 64 + i; c.height = 48;
      const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 67},70%,50%)`; g.fillRect(0, 0, c.width, c.height);
      await put(d, `IMG_${String(i + 1).padStart(4, '0')}.jpg`, await new Promise(r => c.toBlob(r, 'image/jpeg')));
    }
    await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'Storno' }));
  });
  await picker();
  await lkSchreiben(labelkitText);
  const vorher = await fotos();
  await page.locator('#btnOpen').click();
  await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 4);
  const row = name => page.locator('#list .row', { has: page.locator('.orig', { hasText: name }) });
  const desc = name => row(name).locator('.desc'), probe = name => row(name).locator('.probe'), hinweis = name => row(name).locator('.storno');
  const zustand = name => desc(name).evaluate(e => ({ wert: e.value, markiert: e.value.slice(e.selectionStart, e.selectionEnd) }));
  const tippe = async t => { for (const ch of t) await page.keyboard.type(ch); };
  const sichtbar = name => hinweis(name).evaluate(e => !e.hidden && e.offsetHeight > 0);

  // LabelKit-Datei wird beim Öffnen im Hintergrund gelesen: warten, bis P1 vorgeschlagen wird
  for (const ende = Date.now() + 5000; ;){
    await desc('IMG_0001').click(); await desc('IMG_0001').fill(''); await tippe('P1');
    if ((await zustand('IMG_0001')).wert !== 'P1' || Date.now() > ende) break;
    await page.waitForTimeout(200);
  }
  assert.deepEqual(await zustand('IMG_0001'), { wert: 'P1 Küche verrußt Untersicht', markiert: ' Küche verrußt Untersicht' });
  await page.keyboard.press('Enter');
  assert.equal(await probe('IMG_0001').inputValue(), 'P1');

  // 1) P2 ist storniert: weder P2 + Enter noch die Ergänzung bieten sie an
  await desc('IMG_0002').click(); await tippe('P2');
  assert.deepEqual(await zustand('IMG_0002'), { wert: 'P2', markiert: '' }, 'kein Vorschlag für die stornierte P2');
  await page.keyboard.press('Enter');
  assert.equal(await probe('IMG_0002').inputValue(), '', 'P2 wandert nicht ins Feld Probe-Nr.');
  await desc('IMG_0002').click(); await desc('IMG_0002').fill(''); await tippe('Dach');
  assert.deepEqual(await zustand('IMG_0002'), { wert: 'Dach', markiert: '' }, 'Raum der stornierten Probe wird nicht ergänzt');
  await desc('IMG_0002').fill('Dachboden Sparren');
  assert.equal(await sichtbar('IMG_0001'), false, 'gültige Probe: kein Hinweis');

  // 2) P2 von Hand eingetippt → geht, aber Hinweis in der Zeile und Zählung oben; Zuordnung und geplanter Name bleiben
  await probe('IMG_0002').click(); await tippe('P2');
  assert.equal(await probe('IMG_0002').inputValue(), 'P2');
  assert.equal(await sichtbar('IMG_0002'), true);
  assert.equal(await hinweis('IMG_0002').textContent(), HINWEIS);
  assert.match(await page.locator('#stats').textContent(), /⚠ 1 Foto bei stornierter Probe/);
  assert.equal(await probe('IMG_0002').evaluate(e => document.getElementById(e.getAttribute('aria-describedby')).textContent), HINWEIS, 'Hinweis am Feld Probe-Nr. angesagt');
  await probe('IMG_0003').click(); await tippe('P1, p2');
  assert.match(await page.locator('#stats').textContent(), /⚠ 2 Fotos bei stornierter Probe/);
  await probe('IMG_0003').fill('P3');
  assert.equal(await sichtbar('IMG_0003'), false);
  assert.match(await page.locator('#stats').textContent(), /⚠ 1 Foto bei stornierter Probe/);

  // 3) Gespeichert, Seite neu geladen und Projekt neu geöffnet: Foto ist noch P2 zugeordnet → Hinweis wieder da (nichts automatisch gelöst)
  for (const ende = Date.now() + 8000; (await gespeicherteProbe('IMG_0002.jpg')) !== 'P2';){ assert.ok(Date.now() < ende, 'Zuordnung P2 gespeichert'); await page.waitForTimeout(200); }
  await page.reload(); await picker();
  await page.locator('#btnOpen').click();
  await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 4);
  await page.waitForFunction(() => [...document.querySelectorAll('#list .row')].some(r => !r.querySelector('.storno').hidden), null, { timeout: 5000 });
  assert.equal(await probe('IMG_0002').inputValue(), 'P2', 'Zuordnung bleibt');
  assert.equal(await hinweis('IMG_0002').textContent(), HINWEIS);
  assert.equal(await sichtbar('IMG_0002'), true);
  assert.match(await page.locator('#stats').textContent(), /⚠ 1 Foto bei stornierter Probe/);
  assert.deepEqual(await fotos(), vorher, 'keine Datei umbenannt oder verschoben');

  // 4) Aussortiert (✕) → kein Hinweis mehr, Zuordnung bleibt; ↺ → Hinweis wieder da
  await row('IMG_0002').locator('button.x').click();
  assert.equal(await sichtbar('IMG_0002'), false, 'aussortiert: kein Hinweis');
  assert.doesNotMatch(await page.locator('#stats').textContent(), /stornierter Probe/);
  assert.equal(await probe('IMG_0002').inputValue(), 'P2');
  // … und vor dem Export keine Rückfrage: das aussortierte Foto kommt nicht in die Doku
  await page.locator('#btnPdf').click();
  await page.waitForSelector('#overlay.show #zOk');
  assert.equal(await page.locator('#dStorno').count(), 0, 'aussortiert: keine Storno-Rückfrage vor dem PDF');
  await page.locator('#zCancel').click();
  await row('IMG_0002').locator('button.x').click();
  assert.equal(await sichtbar('IMG_0002'), true, 'wiederhergestellt: Hinweis wieder da');

  // 5) Vor PDF und ZIP: Rückfrage mit Probe und Fotozahl; Abbrechen exportiert nichts und springt zum ersten betroffenen Foto
  await probe('IMG_0003').fill('P2');
  const FRAGE = '2 Fotos sind noch P2 zugeordnet – P2 ist in LabelKit storniert. In der Bilddokumentation stehen sie dann weiter unter P2. Trotzdem exportieren?';
  const exporteVorher = await pdfs();
  for (const knopf of ['#btnPdf', '#btnZip']) {
    await page.locator(knopf).click();
    await page.waitForSelector('#overlay.show #dStorno');
    assert.equal(await page.locator('#dialog h3').textContent(), '2 Fotos bei stornierter Probe');
    assert.equal(await page.locator('#dStorno').textContent(), FRAGE);
    assert.equal(await page.locator('#dCancel').evaluate(e => e === document.activeElement), true, 'Abbrechen ist vorgewählt');
    await page.keyboard.press('Enter');   // vorgewählt = Abbrechen
    assert.equal(await dialogOffen(), false, knopf + ': Abbrechen schließt, kein Exportdialog');
    assert.equal(await page.evaluate(() => { const e = document.activeElement; return e.classList.contains('probe') ? e.value : ''; }), 'P2', 'Fokus im Feld Probe-Nr. des ersten betroffenen Fotos');
  }
  assert.deepEqual(await pdfs(), exporteVorher, 'Abbrechen: nichts exportiert');
  // „Trotzdem exportieren“ → PDF wie bisher, Zuordnungen unverändert
  await page.locator('#btnPdf').click();
  await page.waitForSelector('#overlay.show #dStorno');
  await page.locator('#dOk').click();
  await page.waitForSelector('#overlay.show #zOk');
  await page.locator('#zOk').click();
  await page.waitForFunction(() => !document.querySelector('#overlay').classList.contains('show') && document.querySelector('#banner .pdfOpen'), null, { timeout: 60000 });
  const neu = (await pdfs()).filter(n => !exporteVorher.includes(n));
  assert.equal(neu.length, 1, 'eine PDF erstellt'); assert.match(neu[0], /^Bilddokumentation_.*\.pdf$/);
  assert.equal(await probe('IMG_0002').inputValue(), 'P2'); assert.equal(await probe('IMG_0003').inputValue(), 'P2');
  assert.equal(await sichtbar('IMG_0003'), true);

  // 6) LabelKit-Datei nur gelesen
  assert.equal(await lkLesen(), labelkitText, 'LabelKit-Datei unverändert');

  // 7) Storno in LabelKit aufgehoben → „Fotos neu einlesen“ → Hinweis weg, P2 wird wieder angeboten
  const aufgehoben = JSON.parse(labelkitText); delete aufgehoben.proben[1].storniert; aufgehoben.proben[1].nrFest = { am: '2026-10-31T09:00:00.000Z', anlass: 'Storno aufgehoben' };
  await lkSchreiben(JSON.stringify(aufgehoben));
  await page.locator('#btnReload').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#list .row')].every(r => r.querySelector('.storno').hidden), null, { timeout: 5000 });
  assert.doesNotMatch(await page.locator('#stats').textContent(), /stornierter Probe/);
  assert.equal(await probe('IMG_0002').inputValue(), 'P2');
  await desc('IMG_0004').click(); await tippe('P2');
  assert.deepEqual(await zustand('IMG_0004'), { wert: 'P2 Dachboden stark verrußt Sparren', markiert: ' Dachboden stark verrußt Sparren' }, 'nach aufgehobenem Storno wieder angeboten');
  await page.keyboard.press('Enter');
  assert.equal(await probe('IMG_0004').inputValue(), 'P2');
  assert.equal(await sichtbar('IMG_0004'), false);
  await page.locator('#btnPdf').click();
  await page.waitForSelector('#overlay.show #zOk');
  assert.equal(await page.locator('#dStorno').count(), 0, 'ohne stornierte Zuordnung keine Rückfrage');
  await page.locator('#zCancel').click();
  assert.deepEqual(await fotos(), vorher, 'keine Datei umbenannt oder verschoben');

  assert.deepEqual(errors, []);
  console.log(`OK (${browserName}): stornierte Proben – nicht angeboten, Hinweis bei Zuordnung, Rückfrage vor PDF/ZIP, nichts geändert, Storno aufgehoben → wieder angeboten`);
  await browser.close(); server.close();
})().catch(async e => { console.error(e); console.log(`::error title=Browsertest Storno ${browserName}::${String(e && e.message || e).split('\n')[0]}`); try { await browser?.close(); server?.close(); } catch {} process.exit(1); });

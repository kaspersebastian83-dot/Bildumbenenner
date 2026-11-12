// iPhone-Fotos (HEIC) umwandeln im echten Browser (FotoKit 2.3.0, Plan E1–E9): Ordner mit 2 HEIC + 1 JPG (+ .MOV/.AAE,
// HEIC in _aussortiert) → Karte → Knopf → 3 JPG in „Fotos“, 2 HEIC unverändert in „Fotos/_Originale“, Nachweis „heic“ in der
// Projektdatei, Beschreibung wandert mit. Abbrüche mitten drin (JPG nicht schreibbar, Original nicht verschiebbar) lassen das
// HEIC liegen und kein JPG zurück. Nachfrage vor der Bilddokumentation, kein Umwandeln im geschützten Projektmodus.
// Testbild: tests/fixtures/testbild.heic (künstlich, tools/heic-testbild.py). Synthetische OPFS-Projekte, echte Klicks.
// node tests/heic-umwandeln-browser.cjs [chromium]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const heic = fs.readFileSync(path.join(__dirname, 'fixtures', 'testbild.heic'));
const heicSha = crypto.createHash('sha256').update(heic).digest('hex');
let browser, server;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const profil = browserName === 'chromium' ? fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fk-profil-')) : null;
  const ctx = profil ? await playwright.chromium.launchPersistentContext(profil, { viewport: { width: 1280, height: 900 } })
    : await (await playwright[browserName].launch()).newContext({ viewport: { width: 1280, height: 900 } });
  browser = profil ? { close: async () => { await ctx.close(); try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {} } } : ctx.browser();
  const page = ctx.pages()[0] || await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const supported = await page.evaluate(async () => {
    if (!('showDirectoryPicker' in window) || !navigator.storage?.getDirectory || typeof OffscreenCanvas !== 'function') return false;
    try { const d = await navigator.storage.getDirectory(), f = await d.getFileHandle('probe', { create: true }); return !!f.createWritable; } catch { return false; }
  });
  if (!supported) { console.log(`SKIP (${browserName}): kein schreibbarer Ordnerzugriff`); await browser.close(); server.close(); return; }

  await page.evaluate(async heicBytes => {
    const r = await navigator.storage.getDirectory(), bytes = new Uint8Array(heicBytes);
    const put = async (dir, name, data) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); };
    const jpg = async () => { const c = document.createElement('canvas'); c.width = 40; c.height = 30; c.getContext('2d').fillRect(0, 0, 40, 30); return new Promise(res => c.toBlob(res, 'image/jpeg')); };
    const projekt = async (name, json) => {
      const p = await r.getDirectoryHandle(name, { create: true }), d = await p.getDirectoryHandle('Fotos', { create: true });
      await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'Fiktives Testobjekt' }));
      if (json) await put(d, '_Bildumbenenner.json', JSON.stringify(json));
      return { p, d };
    };
    const a = await projekt('26.0998 iPhone');
    await put(a.d, 'IMG_0001.HEIC', bytes); await put(a.d, 'IMG_0002.heic', bytes); await put(a.d, 'IMG_0002.jpg', await jpg());
    await put(a.d, 'IMG_0001.MOV', 'kein echtes Video'); await put(a.d, 'IMG_0001.AAE', '<plist/>');
    await put(await a.d.getDirectoryHandle('_aussortiert', { create: true }), 'X.HEIC', bytes);
    const b = await projekt('26.0999 Geschuetzt', { app: 'Bildumbenenner', format: 1, version: '99.0.0', bilder: {} });
    await put(b.d, 'IMG_0009.HEIC', bytes);
    window.testA = a; window.testB = b;
    window.showDirectoryPicker = async () => window.testZiel || a.p;
  }, [...heic]);
  const idle = () => page.waitForFunction(() => !document.body.inert && !document.querySelector('#overlay').classList.contains('show'));
  const inhalt = (wo = '') => page.evaluate(async wo => { let d = window.testA.d; for (const t of wo.split('/').filter(Boolean)) d = await d.getDirectoryHandle(t); const o = {}; for await (const [n, h] of d.entries()) o[n] = h.kind === 'file' ? (await h.getFile()).size : 'dir'; return o; }, wo);
  const bytesVon = wo => page.evaluate(async wo => { const t = wo.split('/'); let d = window.testA.d; for (const x of t.slice(0, -1)) d = await d.getDirectoryHandle(x); return [...new Uint8Array(await (await (await d.getFileHandle(t.at(-1))).getFile()).arrayBuffer())]; }, wo);
  const projektDatei = () => page.evaluate(async () => { try { const d = await (await window.testA.p.getDirectoryHandle('_Spektron')).getDirectoryHandle('FotoKit'); return JSON.parse(await (await (await d.getFileHandle('_Bildumbenenner.json')).getFile()).text()); } catch (e) { return null; } });
  const tiles = () => page.locator('#list .row').evaluateAll(rs => rs.map(r => r.getAttribute('aria-label')));
  const decoderImFenster = () => page.evaluate(() => [...document.scripts].some(s => /libheif-bundle|heic-worker/.test(s.src)) || typeof window.FotoKitHeic !== 'undefined');

  // Öffnen: Karte mit Anzahl, Kachel ohne Vorschau, Decoder noch nicht geladen
  await ui.oeffnen(page);
  await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 3);
  assert.deepEqual(await tiles(), ['IMG_0001.HEIC', 'IMG_0002.heic', 'IMG_0002.jpg'], '.MOV/.AAE sind keine Fotos, _aussortiert bleibt außen vor');
  await page.locator('#heicCard:not([hidden]) #btnHeic').waitFor();
  assert.equal(await page.locator('#btnHeic').textContent(), '2 iPhone-Fotos umwandeln');
  assert.match(await page.locator('#heicText').textContent(), /liegen 2 iPhone-Fotos \(HEIC\).*Fotos\/_Originale/);
  await page.locator('#list .row').first().locator('.thumb.heic').waitFor();
  assert.equal(await page.locator('#list .row').first().locator('.thumb').textContent(), 'iPhone-Foto – noch nicht umgewandelt');
  assert.equal(await decoderImFenster(), false, 'Decoder wird erst beim Umwandeln geladen');
  await ui.feld(page, 'desc', 0).fill('Küche, Decke verrußt');
  await ui.feld(page, 'sec', 0).fill('Küche');
  console.log(`OK ${browserName}: Karte „2 iPhone-Fotos umwandeln“, Kachel „noch nicht umgewandelt“, Decoder nicht geladen`);

  // Vor der Bilddokumentation: Nachfrage statt Platzhalter (Abbrechen ändert nichts)
  await page.click('#btnPdf'); await page.locator('#dHeic').waitFor();
  assert.match(await page.locator('#dHeic').textContent(), /2 Fotos in der Doku sind im iPhone-Format.*Platzhalter/s);
  assert.equal(await page.locator('#dOk').textContent(), '2 iPhone-Fotos umwandeln');
  await page.click('#dCancel'); await idle();
  assert.deepEqual(Object.keys(await inhalt()).sort(), ['IMG_0001.AAE', 'IMG_0001.HEIC', 'IMG_0001.MOV', 'IMG_0002.heic', 'IMG_0002.jpg', '_aussortiert']);
  console.log(`OK ${browserName}: Nachfrage vor „Bilddokumentation erstellen“, Abbrechen ändert nichts`);

  // Abbruch 1: das zweite Original lässt sich nicht verschieben (Schritt 5) → dessen JPG wird entfernt, HEIC bleibt
  await page.evaluate(() => {
    const move = FileSystemFileHandle.prototype.move;
    window.testMove = move;
    FileSystemFileHandle.prototype.move = function (...a) { if (this.name === 'IMG_0002.heic') return Promise.reject(new DOMException('gesperrt', 'NotAllowedError')); return move.apply(this, a); };
  });
  // 2.3.1 (Arbeitsspeicher): je Foto erst ein Decoder-Worker, der beendet ist, bevor der Kodier-Worker startet; das zweite Foto bekommt frische Worker
  await page.evaluate(() => {
    const W = window.Worker, log = window.testWorkerLog = []; window.testWorkerEcht = W;
    window.Worker = function (url, opt) {
      const w = new W(url, opt), e = { arten: [], zu: false, offenBeiStart: log.filter(x => !x.zu).length };
      log.push(e);
      const pm = w.postMessage.bind(w), term = w.terminate.bind(w);
      w.postMessage = (m, t) => { e.arten.push(m && m.art); pm(m, t); if (m && m.rgba) e.rgbaDanach = m.rgba.byteLength; };
      w.terminate = () => { e.zu = true; term(); };
      return w;
    };
  });
  await page.click('#btnHeic'); await idle();
  assert.match(await page.locator('#banner').textContent(), /1 iPhone-Foto umgewandelt, 1 nicht: IMG_0002\.heic.*unverändert in „Fotos“/s);
  const worker = await page.evaluate(() => { window.Worker = window.testWorkerEcht; return window.testWorkerLog; });
  assert.deepEqual(worker.map(w => w.arten), [['dekodieren'], ['kodieren'], ['dekodieren'], ['kodieren']], 'je Foto zwei Worker, je eine Nachricht');
  assert.ok(worker.every(w => w.zu && w.offenBeiStart === 0), 'jeder Worker beendet, bevor der nächste startet');
  assert.ok(worker.filter(w => w.arten[0] === 'kodieren').every(w => w.rgbaDanach === 0), 'Pixel ohne Kopie übergeben');
  console.log(`OK ${browserName}: zwei Fotos nacheinander – je Foto Decoder-Worker beendet vor dem Kodieren, frische Worker für das zweite`);
  let f = await inhalt();
  assert.deepEqual(Object.keys(f).sort(), ['IMG_0001.AAE', 'IMG_0001.MOV', 'IMG_0001.jpg', 'IMG_0002.heic', 'IMG_0002.jpg', '_Originale', '_aussortiert'], 'kein IMG_0002_2.jpg, kein Zwischenname');
  assert.equal(f['IMG_0002.heic'], heic.length);
  assert.deepEqual(await inhalt('_Originale'), { 'IMG_0001.HEIC': heic.length });
  let pd = await projektDatei();
  assert.equal(pd.bilder['IMG_0002_2.jpg'], undefined, 'Nachweis des zurückgenommenen JPG wieder entfernt');
  assert.deepEqual(Object.keys(pd.bilder).filter(n => /heic$/i.test(n)), [], 'Projektdaten zeigen nicht mehr auf das HEIC');
  console.log(`OK ${browserName}: Abbruch beim Ablegen des Originals – JPG wieder weg, HEIC bleibt, Projektdaten zurückgestellt`);

  // Abbruch 2: JPG lässt sich nicht schreiben (Schritt 1) → nichts verändert
  await page.evaluate(() => {
    FileSystemFileHandle.prototype.move = window.testMove;
    const cw = FileSystemFileHandle.prototype.createWritable; window.testCw = cw;
    FileSystemFileHandle.prototype.createWritable = function (...a) { if (this.name.startsWith('umb-tmp_heic_')) return Promise.reject(new DOMException('Datenträger voll', 'QuotaExceededError')); return cw.apply(this, a); };
  });
  assert.equal(await page.locator('#btnHeic').textContent(), '1 iPhone-Foto umwandeln');
  await page.click('#btnHeic'); await idle();
  assert.match(await page.locator('#banner').textContent(), /1 nicht: IMG_0002\.heic/);
  assert.deepEqual(Object.keys(await inhalt()).sort(), Object.keys(f).sort(), 'kein halbes JPG');
  console.log(`OK ${browserName}: Abbruch beim Schreiben des JPG – nichts verändert, kein Zwischenname bleibt`);

  // Unfertiges JPG eines abgebrochenen Laufs liegt noch da → beim Öffnen entfernt
  await page.evaluate(async () => { FileSystemFileHandle.prototype.createWritable = window.testCw; const w = await (await window.testA.d.getFileHandle('umb-tmp_heic_abc_0.jpg', { create: true })).createWritable(); await w.write('halb'); await w.close(); });
  await ui.oeffnen(page); await idle();
  await page.waitForFunction(() => /unfertiges JPG entfernt/.test(document.querySelector('#banner').textContent));
  assert.equal((await inhalt())['umb-tmp_heic_abc_0.jpg'], undefined);
  console.log(`OK ${browserName}: liegengebliebener Zwischenname wird beim Öffnen entfernt (mit Hinweis)`);

  // Jetzt klappt es: IMG_0002.jpg ist belegt → IMG_0002_2.jpg
  await page.click('#btnHeic'); await idle();
  assert.match(await page.locator('#banner').textContent(), /✓ 1 iPhone-Foto in JPG umgewandelt.*Originale liegen unverändert in „Fotos\/_Originale“/s);
  await page.locator('#heicCard[hidden]').waitFor({ state: 'attached' });
  f = await inhalt();
  assert.deepEqual(Object.keys(f).sort(), ['IMG_0001.AAE', 'IMG_0001.MOV', 'IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0002_2.jpg', '_Originale', '_aussortiert']);
  assert.deepEqual((await tiles()).sort(), ['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0002_2.jpg']);
  assert.deepEqual(await inhalt('_Originale'), { 'IMG_0001.HEIC': heic.length, 'IMG_0002.heic': heic.length });
  for (const n of ['_Originale/IMG_0001.HEIC', '_Originale/IMG_0002.heic', '_aussortiert/X.HEIC']) assert.equal(Buffer.compare(Buffer.from(await bytesVon(n)), heic), 0, n + ' bytegleich');
  assert.equal(f['IMG_0001.MOV'], 'kein echtes Video'.length); assert.equal(f['IMG_0001.AAE'], 8);
  assert.equal(await decoderImFenster(), false, 'Decoder lief im Web Worker');
  console.log(`OK ${browserName}: 3 JPG in „Fotos“, 2 HEIC bytegleich in „_Originale“, .MOV/.AAE und _aussortiert unangetastet, Web Worker`);

  // JPG: Maße, Drehung, EXIF (Datum, Gerät, GPS) mit Orientation 1, Farbprofil
  const bild = await page.evaluate(async () => {
    const f = await (await window.testA.d.getFileHandle('IMG_0001.jpg')).getFile(), b = await createImageBitmap(f, { imageOrientation: 'none' });
    const c = new OffscreenCanvas(b.width, b.height), g = c.getContext('2d'); g.drawImage(b, 0, 0);
    const px = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
    return { w: b.width, h: b.height, oL: px(4, 4), oR: px(91, 4), uR: px(91, 123), uL: px(4, 123), typ: f.type };
  });
  const nahe = (a, b) => a.every((x, i) => Math.abs(x - b[i]) <= 20);
  assert.deepEqual([bild.w, bild.h], [96, 128]);
  assert.ok(nahe(bild.oL, [30, 30, 220]) && nahe(bild.oR, [220, 30, 30]) && nahe(bild.uR, [30, 200, 30]) && nahe(bild.uL, [240, 240, 240]), 'Drehung eingebacken: ' + JSON.stringify(bild));
  const j = Buffer.from(await bytesVon('IMG_0001.jpg'));
  const exifAt = j.indexOf(Buffer.from('Exif\0\0')), iccAt = j.indexOf(Buffer.from('ICC_PROFILE\0'));
  assert.ok(exifAt > 0 && iccAt > exifAt && j.indexOf(Buffer.from([0xff, 0xda])) > iccAt, 'EXIF und Farbprofil vor den Bilddaten');
  for (const t of ['FotoKit-Test', 'Kunstbild 1', '2026:11:03 10:42:17']) assert.ok(j.includes(Buffer.from(t)), t);
  const t0 = exifAt + 6, le = j[t0] === 0x49, u16 = o => le ? j.readUInt16LE(t0 + o) : j.readUInt16BE(t0 + o), u32 = o => le ? j.readUInt32LE(t0 + o) : j.readUInt32BE(t0 + o);
  const ifd = u32(4), tags = new Map([...Array(u16(ifd)).keys()].map(i => [u16(ifd + 2 + i * 12), ifd + 2 + i * 12]));
  assert.equal(u16(tags.get(0x0112) + 8), 1, 'Orientation = 1'); assert.ok(tags.has(0x8825), 'GPS übernommen');
  // die Kachel liest das Aufnahmedatum jetzt aus dem EXIF
  await ui.foto(page, 0);
  assert.match(await page.locator('#pvInfo').textContent(), /03\.11\.2026/);
  console.log(`OK ${browserName}: JPG 96 × 128 richtig gedreht, EXIF (Datum, Gerät, GPS) mit Orientation 1, Farbprofil, Aufnahmedatum aus EXIF`);

  // Projektdatei: Nachweis je JPG, Beschreibung/Abschnitt gewandert
  for (let i = 0; i < 40 && !(pd = await projektDatei())?.bilder?.['IMG_0002_2.jpg']?.heic; i++) await page.waitForTimeout(150);
  const n1 = pd.bilder['IMG_0001.jpg'];
  assert.deepEqual({ b: n1.beschreibung, a: n1.abschnitt }, { b: 'Küche, Decke verrußt', a: 'Küche' });
  for (const [jpg, heicName] of [['IMG_0001.jpg', 'IMG_0001.HEIC'], ['IMG_0002_2.jpg', 'IMG_0002.heic']]) {
    const h = pd.bilder[jpg].heic;
    assert.deepEqual({ ...h, umgewandelt: typeof h.umgewandelt }, { original: heicName, ablage: '_Originale/' + heicName, sha256: heicSha, bytes: heic.length, umgewandelt: 'string',
      decoder: 'libheif-js 1.23.5', qualitaet: 92, breite: 96, hoehe: 128, exif: true, farbprofil: true, fotokit: '2.3.1' }, jpg);
    assert.ok(!Number.isNaN(Date.parse(h.umgewandelt)));
  }
  assert.equal(pd.version, '2.3.1');
  console.log(`OK ${browserName}: Nachweis „heic“ je JPG (Original, Ablage, SHA-256, Zeit, Decoder), Beschreibung und Abschnitt gewandert`);

  // Abbruch nach dem Speichern, vor dem Ablegen: HEIC liegt noch in „Fotos“, sein JPG mit Nachweis schon da → nur noch ablegen, kein zweites JPG
  await page.evaluate(async b => { const w = await (await window.testA.d.getFileHandle('IMG_0001.HEIC', { create: true })).createWritable(); await w.write(new Uint8Array(b)); await w.close(); }, [...heic]);
  await ui.mehr(page, 'mehrReload'); await idle();
  await page.click('#btnHeic'); await idle();
  assert.match(await page.locator('#banner').textContent(), /✓ 1 iPhone-Foto/);
  assert.deepEqual(Object.keys(await inhalt()).filter(n => /\.(jpe?g|heic)$/i.test(n)).sort(), ['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0002_2.jpg']);
  assert.deepEqual(Object.keys(await inhalt('_Originale')).sort(), ['IMG_0001.HEIC', 'IMG_0001_2.HEIC', 'IMG_0002.heic'], 'Name in _Originale belegt → _2');
  for (let i = 0; i < 40 && (pd = await projektDatei())?.bilder?.['IMG_0001.jpg']?.heic?.ablage !== '_Originale/IMG_0001_2.HEIC'; i++) await page.waitForTimeout(150);
  assert.equal(pd.bilder['IMG_0001.jpg'].heic.ablage, '_Originale/IMG_0001_2.HEIC');
  console.log(`OK ${browserName}: schon umgewandelt (Nachweis passt) → nur das Original abgelegt, kein zweites JPG`);

  // Dasselbe Angebot direkt nach „Fotos übernehmen“
  await page.evaluate(async b => { const d = await window.testA.d.getDirectoryHandle('Begehung Ben', { create: true }); const w = await (await d.getFileHandle('IMG_0003.HEIC', { create: true })).createWritable(); await w.write(new Uint8Array(b)); await w.close(); }, [...heic]);
  await ui.mehr(page, 'mehrReload'); await idle();
  await page.locator('#importCard:not([hidden]) #btnImport').click(); await page.locator('#impOk').click(); await idle();
  await page.locator('#bHeicJetzt').waitFor();
  assert.equal(await page.locator('#bHeicJetzt').textContent(), '1 iPhone-Foto umwandeln');
  // erst ohne Web Worker (wie bei index.html als lokale Datei): verständliche Meldung, nichts verändert
  await page.evaluate(() => { window.testWorker = window.Worker; window.Worker = function () { throw new DOMException('Worker aus file:// nicht erlaubt', 'SecurityError'); }; });
  await page.click('#bHeicJetzt'); await idle();
  assert.match(await page.locator('#banner').textContent(), /startet den HEIC-Decoder hier nicht.*Online-Fassung.*unverändert in „Fotos“/s);
  assert.equal((await inhalt())['IMG_0003.HEIC'], heic.length); assert.equal((await inhalt())['IMG_0003.jpg'], undefined);
  await page.evaluate(() => { window.Worker = window.testWorker; });
  await page.click('#btnHeic'); await idle();
  assert.match(await page.locator('#banner').textContent(), /✓ 1 iPhone-Foto in JPG umgewandelt/);
  assert.ok((await inhalt())['IMG_0003.jpg'] > 0 && (await inhalt('_Originale'))['IMG_0003.HEIC'] === heic.length);
  assert.equal(await decoderImFenster(), false);
  console.log(`OK ${browserName}: Angebot direkt nach „Fotos übernehmen“; ohne Web Worker klare Meldung, nichts verändert`);

  // Geschützter Projektmodus: keine Karte, keine Nachfrage, nichts verändert
  await page.evaluate(() => { window.testZiel = window.testB.p; });
  await ui.oeffnen(page); await idle();
  await page.waitForFunction(() => [...document.querySelectorAll('#list .row')].map(e => e.getAttribute('aria-label')).join() === 'IMG_0009.HEIC');
  assert.equal(await page.locator('#heicCard').isHidden(), true);
  const geschuetzt = await page.evaluate(async () => { const o = []; for await (const k of window.testB.d.keys()) o.push(k); return o.sort(); });
  assert.deepEqual(geschuetzt, ['IMG_0009.HEIC', '_Bildumbenenner.json']);
  console.log(`OK ${browserName}: geschützter Projektmodus – kein Angebot, nichts umgewandelt`);

  assert.deepEqual(errors, []);
  await browser.close(); server.close();
})().catch(async e => { console.error(e); try { await browser?.close(); server?.close(); } catch {} process.exit(1); });

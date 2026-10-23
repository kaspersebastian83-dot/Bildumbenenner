// Real browser/UI and production functions, synthetic in-memory directory handles.
// Runs fully in Chromium AND WebKit; does not claim native Windows/SMB coverage.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const pw = require('playwright'), { fixture } = require('./unknown-fields.cjs');
const root = path.resolve(__dirname, '..'), engine = process.argv[2] || 'chromium';
let server, browser;
const hook = 'window.f6 = { flush: () => { flushDrafts(); saveExtra(); return flushProject(); }, external: checkExternal, readOnly: () => P.readOnly };';
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.equal(source.split('/* ---------- wiring ---------- */').length, 2);
const html = source.replace('/* ---------- wiring ---------- */', hook + '\n/* ---------- wiring ---------- */');
const keep = (actual, expected = fixture(), name = 'a.jpg') => {
  assert.deepEqual(actual.extension, expected.extension);
  assert.deepEqual(actual.projekt.extension, expected.projekt.extension);
  assert.deepEqual(actual.benennung.extension, expected.benennung.extension);
  const a = actual.bilder[name], b = expected.bilder['a.jpg'];
  assert.ok(a, name); for (const k of ['futureFlag', 'nested']) assert.deepEqual(a[k], b[k], k);
  for (const k of ['original', 'sha256']) assert.deepEqual(a[k].extension, b[k].extension, k);
  assert.deepEqual(actual.bilder['b.jpg'].futureFlag, expected.bilder['b.jpg'].futureFlag);
};
(async () => {
  server = http.createServer((req, res) => {
    const p = path.resolve(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!p.startsWith(root + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'application/javascript' : 'application/octet-stream');
    res.end(p.endsWith('index.html') ? html : fs.readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); browser = await pw[engine].launch();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let count = 0;
  async function scenario(title, input, run) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
    try {
      await ctx.addInitScript(data => {
        const missing = () => { throw new DOMException('Synthetisch nicht vorhanden', 'NotFoundError'); };
        const files = new Map(), dirs = new Map(); window.f6disk = { fail: false, writes: 0 };
        class Dir {
          constructor(name) { this.name = name; this.kind = 'directory'; this.files = new Map(); this.dirs = new Map(); }
          async queryPermission() { return 'granted'; } async requestPermission() { return 'granted'; }
          async isSameEntry(h) { return h === this; }
          async getFileHandle(n, opts = {}) {
            if (!this.files.has(n)) { if (!opts.create) missing(); this.files.set(n, new FH(n, this)); }
            return this.files.get(n);
          }
          async getDirectoryHandle(n, opts = {}) {
            if (!this.dirs.has(n)) { if (!opts.create) missing(); this.dirs.set(n, new Dir(n)); }
            return this.dirs.get(n);
          }
          async removeEntry(n) { if (!this.files.delete(n) && !this.dirs.delete(n)) missing(); }
          async *values() { yield* this.files.values(); yield* this.dirs.values(); }
          async *entries() { for await (const h of this.values()) yield [h.name, h]; }
          [Symbol.asyncIterator]() { return this.entries(); }
        }
        class FH {
          constructor(name, dir, value = '') { this.name = name; this.kind = 'file'; this.dir = dir; this.value = new Blob([value]); }
          async getFile() { return new File([this.value], this.name, { lastModified: 1234567890000, type: this.name.endsWith('.jpg') ? 'image/jpeg' : 'application/json' }); }
          async createWritable() {
            if (window.f6disk.fail && this.name === '_Bildumbenenner.json') throw Error('Synthetischer Schreibfehler');
            const chunks = []; return { write: async v => { chunks.push(v); }, close: async () => { this.value = new Blob(chunks); window.f6disk.writes++; }, abort: async () => {} };
          }
        }
        const d = new Dir('Synthetischer Fotoordner');
        const put = (name, value) => d.files.set(name, new FH(name, d, value));
        put('_Bildumbenenner.json', JSON.stringify(data));
        // Tiny, valid JPEG generated in-browser after navigation, before opening.
        window.f6disk.dir = d;
        window.f6disk.put = (value) => put('_Bildumbenenner.json', JSON.stringify(value));
        window.f6disk.read = async () => JSON.parse(await d.files.get('_Bildumbenenner.json').value.text());
        window.f6disk.text = async () => d.files.get('_Bildumbenenner.json').value.text();
        window.f6disk.images = async () => {
          const out = {}; for (const [n, f] of d.files) if (n.endsWith('.jpg')) out[n] = Array.from(new Uint8Array(await f.value.arrayBuffer())); return out;
        };
        window.f6disk.init = async () => {
          const c = document.createElement('canvas'); c.width = 16; c.height = 12;
          const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg')); put('a.jpg', jpg); put('b.jpg', jpg);
        };
        window.showDirectoryPicker = async () => d;
        window.showSaveFilePicker = async opts => d.getFileHandle(opts.suggestedName, { create: true });
      }, input);
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('dialog', d => d.accept());
      await page.goto(url); await page.evaluate(() => window.f6disk.init());
      await page.locator('#btnOpen').click();
      await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 2);
      await run(page); assert.deepEqual(errors, []); console.log(`OK F6 (${engine}): ${title}`); count++;
    } finally { await ctx.close(); }
  }
  const flush = page => page.evaluate(() => window.f6.flush());
  const read = page => page.evaluate(() => window.f6disk.read());
  const edit = async (page, value = 'Neu') => { await page.locator('#list .desc').first().fill(value); assert.equal(await flush(page), true); };
  await scenario('Bekanntes Feld ändern, speichern, neu einlesen', fixture(), async page => {
    await edit(page); keep(await read(page)); assert.equal((await read(page)).bilder['a.jpg'].beschreibung, 'Neu');
    await page.locator('#btnReload').click(); await page.waitForFunction(() => !document.body.inert && document.querySelector('#list .desc').value === 'Neu'); keep(await read(page));
  });
  await scenario('Beschriftung löschen, Nummerierung/Sortierung behalten', fixture(), async page => {
    await edit(page, ''); const out = await read(page); keep(out); assert.equal(out.bilder['a.jpg'].beschreibung, undefined); assert.deepEqual(out.reihenfolge, ['a.jpg', 'b.jpg']);
  });
  await scenario('Umbenennen mit Kopierfallback und Rückgängig', fixture(), async page => {
    const before = await page.evaluate(() => window.f6disk.images());
    await edit(page, 'Neu'); await page.locator('#btnRename').click(); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor();
    let out = await read(page); const renamed = out.reihenfolge[0]; assert.notEqual(renamed, 'a.jpg'); keep(out, fixture(), renamed);
    assert.equal(out.bilder['a.jpg'], undefined); assert.deepEqual((await page.evaluate(() => window.f6disk.images()))[renamed], before['a.jpg']);
    await page.locator('#bUndo').click(); await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('Rückgängig gemacht'));
    out = await read(page); keep(out); assert.deepEqual(await page.evaluate(() => window.f6disk.images()), before);
  });
  await scenario('Schreibfehler, weitere Eingabe, Retry', fixture(), async page => {
    const before = await page.evaluate(() => window.f6disk.text()); await page.evaluate(() => window.f6disk.fail = true);
    await page.locator('#list .desc').first().fill('Fehler'); assert.equal(await flush(page), false);
    assert.equal(await page.evaluate(() => window.f6disk.text()), before); await page.locator('#bSaveRetry').waitFor();
    await page.locator('#list .desc').first().fill('Nach Fehler'); await page.evaluate(() => window.f6disk.fail = false);
    await page.locator('#bSaveRetry').click(); await page.waitForFunction(() => !document.querySelector('#bSaveRetry'));
    keep(await read(page)); assert.equal((await read(page)).bilder['a.jpg'].beschreibung, 'Nach Fehler');
  });
  await scenario('Fremde Erweiterungen beim Speichern und bei Fokus übernehmen', fixture(), async page => {
    const theirs = fixture(); theirs.extension = { newest: [false, 0, null] }; theirs.bilder['a.jpg'].nested = { newer: [1] };
    await page.evaluate(x => window.f6disk.put(x), theirs); await edit(page, 'Lokal'); keep(await read(page), theirs);
    const again = await read(page); again.bilder['b.jpg'].futureFlag = ['Fokus']; await page.evaluate(x => window.f6disk.put(x), again);
    await page.evaluate(() => window.f6.external()); await edit(page, 'Danach'); keep(await read(page), again);
  });
  await scenario('Projektdialog, Benennung sowie echte PDF-/ZIP-Ausgabe', fixture(), async page => {
    await page.locator('#btnMeta').click(); await page.locator('#m_objekt').fill('Neues Objekt'); await page.locator('#zCancel').click(); await flush(page);
    keep(await read(page)); assert.equal((await read(page)).projekt.objekt, 'Neues Objekt');
    await page.locator('#btnPdf').click(); await page.locator('#zOk').click(); await page.locator('.pdfOpen').waitFor(); await flush(page); keep(await read(page));
    await page.locator('#btnZip').click(); await page.locator('#zOk').click(); await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('ZIP gespeichert'));
    await flush(page); keep(await read(page));
    const outputs = await page.evaluate(async () => {
      const out = {}; for (const [n, f] of window.f6disk.dir.files) if (/\.(pdf|zip)$/.test(n)) out[n] = Array.from(new Uint8Array(await f.value.arrayBuffer()).slice(0, 4)); return out;
    });
    assert.ok(Object.entries(outputs).some(([n, b]) => n.endsWith('.pdf') && Buffer.from(b).toString() === '%PDF'));
    assert.ok(Object.entries(outputs).some(([n, b]) => n.endsWith('.zip') && Buffer.from(b).readUInt32LE() === 0x04034b50));
  });
  const legacy = fixture(); delete legacy.format; delete legacy.version;
  await scenario('Ältere Datei ohne Format-/Versionskennzeichen', legacy, async page => { assert.equal(await page.evaluate(() => window.f6.readOnly()), false); await edit(page); keep(await read(page)); });
  for (const route of ['load', 'save', 'focus']) await scenario('Neuere Version: Schreibschutz bei ' + route, route === 'load' ? { ...fixture(), version: '99.0.0' } : fixture(), async page => {
    if (route !== 'load') { const next = { ...fixture(), version: '99.0.0' }; await page.evaluate(x => window.f6disk.put(x), next); }
    const before = await page.evaluate(() => window.f6disk.text());
    if (route === 'save') { await page.locator('#list .desc').first().fill('Nicht schreiben'); assert.equal(await flush(page), false); }
    if (route === 'focus') await page.evaluate(() => window.f6.external());
    assert.equal(await page.evaluate(() => window.f6.readOnly()), true); assert.equal(await page.locator('#btnRename').isDisabled(), true);
    assert.match(await page.locator('#banner').textContent(), /nicht unterstützt|neuere/); await flush(page);
    assert.equal(await page.evaluate(() => window.f6disk.text()), before);
  });
  console.log(`F6 ${engine}: ${count} vollständige Browserszenarien bestanden (synthetische Handles, keine API-Skips)`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

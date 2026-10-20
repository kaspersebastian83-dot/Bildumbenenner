// Only synthetic OPFS files. The served test copy exposes references to the real
// functions inside the IIFE to test direct calls; production has no test API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const name = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const archiveName = 'Schutzmodus-Testarchiv';
const projects = { A: '26.0801 Test A', B: '26.0802 Test B' };
const hook = `window.fotoTest = { doRename, undo, runPairs, runMoves, undoMoves, transfer, renameFile, moveBetween,
  dir: () => S.dir, readOnly: () => P.readOnly, staleUndo: run => { S.lastRun = run; } };`;
let browser, server;

(async () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(source.split('/* ---------- wiring ---------- */').length, 2);
  const html = source.replace('/* ---------- wiring ---------- */', hook + '\n/* ---------- wiring ---------- */');
  server = http.createServer((req, res) => {
    const f = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(f.endsWith('index.html') ? html : fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await playwright[name].launch();

  async function scenario(title, mode, run) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base);
      const supported = await page.evaluate(async () => {
        try { const r = await navigator.storage.getDirectory(), h = await r.getFileHandle('probe', { create: true });
          if (!('showDirectoryPicker' in window) || !h.createWritable) return false;
          const w = await h.createWritable(); await w.write('test'); await w.close(); await r.removeEntry('probe'); return true;
        } catch (e) { return false; }
      });
      if (!supported) { assert.deepEqual(errors, []); console.log(`SKIP (${name}): ${title} – kein schreibbarer Ordnerzugriff, nur Laden geprüft`); return false; }
      await page.evaluate(async ({ archiveName, projects, mode }) => {
        const r = await navigator.storage.getDirectory(), a = await r.getDirectoryHandle(archiveName, { create: true });
        const put = async (d, n, data) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(data); await w.close(); };
        const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 12;
        canvas.getContext('2d').fillRect(0, 0, 16, 12);
        const jpg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
        for (const [key, n] of Object.entries(projects)) {
          const p = await a.getDirectoryHandle(n, { create: true }), f = await p.getDirectoryHandle('Fotos', { create: true });
          await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: `Objekt ${key}`, notizen: 'Unverändert', sachverstaendiger: 'Testperson' }, null, 2));
          const data = { app: 'Bildumbenenner', format: 1, version: '1.8.2',
            projekt: { proj: n.split(' ')[0], objekt: `Objekt ${key}` },
            benennung: { prefix: '', date: false, num: true, start: 1, digits: 2, sep: '_', spaces: true, uml: false, lower: true, probe: true, discard: 'move', sort: 'manual' },
            reihenfolge: ['IMG_0001.jpg', 'IMG_0002.jpg'],
            bilder: { 'IMG_0001.jpg': { beschreibung: 'Decke', abschnitt: 'Küche', probe: 'P1', original: { name: 'Original.jpg' }, sha256: { wert: 'synthetisch', bytes: 0, geaendert: 0 } },
              'IMG_0002.jpg': { beschreibung: 'Wand', abschnitt: 'Flur', drehung: 90 } } };
          if (key === 'A' && mode === 'future') { data.format = 2; data.version = '9.0.0'; }
          if (key === 'A' && mode === 'string-format') data.format = 'unbekannt';
          if (key === 'A' && mode === 'zero-format') data.format = 0;
          if (key === 'A' && mode === 'legacy') delete data.format;
          let json = JSON.stringify(data, null, 2) + '\n';
          if (key === 'A' && mode === 'broken') json = '{"format": 1, "bilder": { UNVOLLSTÄNDIG\n';
          if (key === 'A' && mode === 'array') json = '[]\n';
          if (key === 'A' && mode === 'null') json = 'null\n';
          if (key === 'A' && mode === 'empty') json = '';
          if (!(key === 'A' && mode === 'missing')) await put(f, '_Bildumbenenner.json', json);
          await put(f, 'IMG_0001.jpg', jpg); await put(f, 'IMG_0002.jpg', jpg);
          const sub = await f.getDirectoryHandle('_aussortiert', { create: true }); await put(sub, 'Alt.jpg', jpg);
        }
        await new Promise((resolve, reject) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
          q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(a, 'archiv'); t.objectStore('kv').put(Object.values(projects), 'zuletzt'); t.oncomplete = resolve; t.onerror = reject; }; q.onerror = reject; });
        window.testNext = 'A'; window.showDirectoryPicker = () => a.getDirectoryHandle(projects[window.testNext]);
        window.showSaveFilePicker = async opts => {
          const f = window.fotoTest.dir();
          return f.getFileHandle(window.zipTarget || opts.suggestedName, { create: true });
        };
        window.mutations = [];
        const wrap = (proto, key, changes) => {
          if (!proto[key]) return;
          const original = proto[key];
          proto[key] = function (...args) { if (changes(...args)) window.mutations.push(key + ':' + (args[0] || this.name)); return original.apply(this, args); };
        };
        wrap(FileSystemDirectoryHandle.prototype, 'getFileHandle', (n, opts) => !!opts?.create);
        wrap(FileSystemDirectoryHandle.prototype, 'getDirectoryHandle', (n, opts) => !!opts?.create);
        wrap(FileSystemDirectoryHandle.prototype, 'removeEntry', () => true);
        wrap(FileSystemFileHandle.prototype, 'createWritable', () => true);
        wrap(FileSystemFileHandle.prototype, 'move', () => true);
        window.realGetFile = FileSystemFileHandle.prototype.getFile;
        FileSystemFileHandle.prototype.getFile = function () {
          if (mode === 'unreadable' && this.name === '_Bildumbenenner.json' && window.testNext === 'A') throw new DOMException('Synthetischer Lesefehler', 'NotReadableError');
          return window.realGetFile.call(this);
        };
      }, { archiveName, projects, mode });
      const snapshot = async () => {
        const h = await page.waitForFunction(async ({ archiveName }) => {
          try {
            const a = await (await navigator.storage.getDirectory()).getDirectoryHandle(archiveName), files = {};
            const walk = async (d, prefix) => {
              for await (const [n, entry] of d.entries()) {
                const key = prefix + n;
                if (entry.kind === 'directory') { files[key + '/'] = 'directory'; await walk(entry, key + '/'); }
                else { const f = await (window.realGetFile ? window.realGetFile.call(entry) : entry.getFile()); files[key] = Array.from(new Uint8Array(await f.arrayBuffer())); }
              }
            };
            await walk(a, ''); return files;
          } catch (e) { if (e.name === 'NotReadableError') return false; throw e; }
        }, { archiveName });
        try { return await h.jsonValue(); } finally { await h.dispose(); }
      };
      const open = async key => {
        await page.evaluate(key => { window.testNext = key; }, key); await page.locator('#btnOpen').click();
        await page.waitForFunction(nr => !document.body.inert && document.querySelectorAll('#list .row').length === 2 && document.querySelector('#projBadge').textContent.includes(nr), projects[key].split(' ')[0]);
      };
      const before = await snapshot();
      await run({ page, open, snapshot, before, base });
      assert.deepEqual(errors, [], 'Keine JavaScript-/Konsolenfehler');
      console.log(`OK (${name}): ${title}`);
      return true;
    } finally { await ctx.close(); }
  }

  if (!(await scenario('Unterstütztes Projekt: Umbenennen, Aussortieren und Rückgängig', 'normal', async ({ page, open, snapshot, before }) => {
    await open('A'); await page.locator('#list .desc').first().fill('Neu beschrieben');
    await page.locator('#list .row').nth(1).locator('.x').click();
    assert.equal(await page.locator('#btnRename').isEnabled(), true);
    await page.locator('#btnRename').click(); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor();
    let files = await snapshot();
    const prefix = projects.A + '/Fotos/';
    assert.deepEqual(files[prefix + '01_P1_Neu_beschrieben.jpg'], before[prefix + 'IMG_0001.jpg']);
    assert.deepEqual(files[prefix + '_aussortiert/IMG_0002.jpg'], before[prefix + 'IMG_0002.jpg']);
    assert.equal(files[prefix + 'IMG_0001.jpg'], undefined);
    assert.equal(files[prefix + 'IMG_0002.jpg'], undefined);
    await page.locator('#bUndo').click(); await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('Rückgängig gemacht'));
    files = await snapshot();
    for (const [n, bytes] of Object.entries(before)) if (!n.endsWith('_Bildumbenenner.json')) assert.deepEqual(files[n], bytes, n);
    assert.deepEqual(Object.keys(files).sort(), Object.keys(before).sort(), 'Keine temporären Bilddateien');
    assert.equal(JSON.parse(Buffer.from(files[prefix + '_Bildumbenenner.json']).toString()).bilder['IMG_0001.jpg'].beschreibung, 'Neu beschrieben');
  }))) return;

  await scenario('Unterstütztes Projekt: Kopierfallback und Rückgängig', 'normal', async ({ page, open, snapshot, before }) => {
    await open('A');
    await page.evaluate(() => { FileSystemFileHandle.prototype.move = async () => { throw new DOMException('Synthetisch kein natives Umbenennen', 'NotSupportedError'); }; });
    await page.locator('#btnRename').click(); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor();
    assert.match(await page.locator('#banner').textContent(), /Kopiermodus/);
    await page.locator('#bUndo').click(); await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('Rückgängig gemacht'));
    const after = await snapshot();
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    for (const [n, bytes] of Object.entries(before)) if (!n.endsWith('_Bildumbenenner.json')) assert.deepEqual(after[n], bytes, n);
  });

  for (const action of ['rename', 'undo']) {
    for (const stage of ['create', 'write', 'close']) {
      for (const copyFallback of [false, true]) {
        await scenario(`Metadatenfehler ${action}/${stage}, Kopiermodus=${copyFallback}: Retry erhält Dateizuordnung`, 'normal', async ({page, open, snapshot, before, base}) => {
          await open('A');
          await page.locator('#list .desc').first().fill('Neue Eingabe');
          await page.locator('#list .row').nth(1).locator('.x').click();
          // Änderungen vor der Dateiaktion sicher abschließen. Der injizierte
          // Fehler betrifft damit die Metadaten nach der physischen Aktion.
          await page.locator('#btnReload').click();
          await page.waitForFunction(() => !document.body.inert && document.querySelector('#list .desc')?.value === 'Neue Eingabe');
          if (copyFallback) await page.evaluate(() => {
            FileSystemFileHandle.prototype.move = async () => { throw new DOMException('Synthetischer Kopierfallback', 'NotSupportedError'); };
          });
          const renamed = '01_P1_Neue_Eingabe.jpg', prefix = projects.A + '/Fotos/';
          if (action === 'undo') {
            await page.locator('#btnRename').click();await page.locator('#dOk').click();await page.locator('#bUndo').waitFor();
          }
          const savedBefore = await snapshot();
          await page.evaluate(stage => {
            window.failMetadataSave = true;
            const create = FileSystemFileHandle.prototype.createWritable;
            FileSystemFileHandle.prototype.createWritable = async function(...args) {
              if (this.name !== '_Bildumbenenner.json') return create.apply(this, args);
              if (window.failMetadataSave && stage === 'create') throw new Error('Synthetischer Metadatenfehler');
              const w = await create.apply(this, args), write = w.write.bind(w), close = w.close.bind(w);
              w.write = async data => {
                if (window.failMetadataSave && stage === 'write') throw new Error('Synthetischer Metadatenfehler');
                return write(data);
              };
              w.close = async () => {
                if (window.failMetadataSave && stage === 'close') throw new Error('Synthetischer Metadatenfehler');
                return close();
              };
              return w;
            };
          }, stage);
          if (action === 'rename') {await page.locator('#btnRename').click();await page.locator('#dOk').click();}
          else await page.locator('#bUndo').click();
          await page.locator('#bSaveRetry').waitFor({timeout: 10000});
          assert.match(await page.locator('#banner').getAttribute('class'), /err/);
          assert.doesNotMatch(await page.locator('#banner').textContent(), /✓|Rückgängig gemacht/);
          assert.equal(await page.locator('#list .desc').first().inputValue(), 'Neue Eingabe');
          assert.equal(await page.locator('#list .sec').first().inputValue(), 'Küche');
          assert.equal(await page.locator('#list .probe').first().inputValue(), 'P1');
          const failed = await snapshot();
          assert.deepEqual(failed[prefix + '_Bildumbenenner.json'], savedBefore[prefix + '_Bildumbenenner.json'], 'Fehlerhafte Speicherung verändert die bisherige JSON nicht');
          const currentName = action === 'rename' ? renamed : 'IMG_0001.jpg';
          assert.deepEqual(failed[prefix + currentName], before[prefix + 'IMG_0001.jpg']);
          assert.deepEqual(failed[prefix + (action === 'rename' ? '_aussortiert/' : '') + 'IMG_0002.jpg'], before[prefix + 'IMG_0002.jpg']);
          assert.equal(failed[prefix + (action === 'rename' ? 'IMG_0001.jpg' : renamed)], undefined);
          // Ein weiterer fehlgeschlagener Retry darf weder die Dateiaktion
          // wiederholen noch die Fortsetzung für einen späteren Erfolg verlieren.
          await page.locator('#bSaveRetry').click();
          await page.waitForFunction(() => !document.body.inert && document.querySelector('#bSaveRetry'));
          assert.deepEqual(await snapshot(), failed);
          await page.locator('#list .desc').first().fill('Neu nach Speicherfehler');
          await page.evaluate(() => window.failMetadataSave = false);
          await page.locator('#bSaveRetry').click();
          await page.waitForFunction(() => !document.body.inert && !document.querySelector('#bSaveRetry') && document.querySelector('#banner').classList.contains('ok'));
          const after = await snapshot();
          const data = JSON.parse(Buffer.from(after[prefix + '_Bildumbenenner.json']).toString());
          assert.equal(data.bilder[currentName].beschreibung, 'Neu nach Speicherfehler');
          assert.equal(data.bilder[currentName].abschnitt, 'Küche');
          assert.equal(data.bilder[currentName].probe, 'P1');
          assert.equal(data.bilder['IMG_0002.jpg'].drehung, 90);
          assert.deepEqual(data.bilder[currentName].sha256, {wert: 'synthetisch', bytes: 0, geaendert: 0});
          assert.equal(data.bilder[currentName].original.name, 'Original.jpg');
          assert.deepEqual(data.reihenfolge, action === 'rename' ? [renamed] : ['IMG_0001.jpg', 'IMG_0002.jpg']);
          if (action === 'rename') assert.equal(data.bilder['IMG_0001.jpg'], undefined);
          else {assert.equal(data.bilder[renamed], undefined);assert.equal(data.bilder['IMG_0002.jpg'].aussortiert, true);}
          for (const [n, bytes] of Object.entries(failed)) if (!n.endsWith('_Bildumbenenner.json')) assert.deepEqual(after[n], bytes, n);
          for (const [n, bytes] of Object.entries(before)) if (n.startsWith(projects.B + '/') || n.endsWith('_Projekt.json')) assert.deepEqual(after[n], bytes, n);
          const fresh = await page.context().newPage();
          await fresh.goto(base + '?projekt=' + encodeURIComponent(projects.A));
          await fresh.waitForFunction(() => !document.body.inert && document.querySelector('#list .desc')?.value === 'Neu nach Speicherfehler');
          assert.equal(await fresh.locator('#list .sec').first().inputValue(), 'Küche');
          assert.equal(await fresh.locator('#list .probe').first().inputValue(), 'P1');
          await fresh.close();
          if (action === 'rename') {
            // Rückgängig bleibt auch nach wiederholtem Speicher-Retry erreichbar.
            await page.locator('#bUndo').click();
            await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('Rückgängig gemacht'));
            const undone = await snapshot();
            assert.deepEqual(undone[prefix + 'IMG_0001.jpg'], before[prefix + 'IMG_0001.jpg']);
            assert.deepEqual(undone[prefix + 'IMG_0002.jpg'], before[prefix + 'IMG_0002.jpg']);
          } else assert.equal(await page.locator('#bUndo').count(), 0);
        });
      }
    }
  }

  for (const mode of ['future', 'string-format', 'zero-format', 'broken', 'unreadable', 'array', 'null', 'empty']) {
    await scenario(`Geschütztes Projekt (${mode}): UI und sämtliche direkten Dateiaktionen`, mode, async ({ page, open, snapshot, before }) => {
      await open('A');
      assert.equal(await page.evaluate(() => window.fotoTest.readOnly()), true);
      assert.equal(await page.locator('#btnRename').isDisabled(), true);
      assert.match(await page.locator('#banner').textContent(), /Originalfotos.*geschützt.*kompatible FotoKit-Version/);
      assert.deepEqual(await snapshot(), before, 'Öffnen erhält alle Bytes');
      await page.locator('#list .desc').first().fill('Nur Sitzung');
      await page.locator('#list .desc').first().press('Alt+x');
      assert.equal(await page.locator('#btnRename').isDisabled(), true);
      assert.match(await page.locator('#stats').textContent(), /geschützter Modus/);
      assert.deepEqual(await snapshot(), before, 'Tastaturweg verändert keine Dateien');
      const actions = ['button-handler', 'doRename', 'undo', 'runPairs', 'runMoves', 'undoMoves', 'transfer', 'renameFile', 'moveBetween'];
      for (const action of actions) {
        const count = await page.evaluate(() => window.mutations.length);
        const result = await page.evaluate(async action => {
          const api = window.fotoTest, dir = api.dir(), sub = await dir.getDirectoryHandle('_aussortiert');
          const pairs = [{ from: 'IMG_0001.jpg', to: 'Unerlaubt.jpg' }], moves = [{ from: 'IMG_0002.jpg', to: 'Unerlaubt.jpg' }];
          try {
            let value;
            if (action === 'button-handler') value = document.querySelector('#btnRename').onclick();
            else if (action === 'doRename') value = await api.doRename(pairs, moves);
            else if (action === 'undo') {
              api.staleUndo({ pairs: [{ from: 'Unerlaubt.jpg', to: 'IMG_0001.jpg' }], moves: [], rows: [], discardRows: [] });
              value = await api.undo();
            } else if (action === 'runPairs') value = await api.runPairs(pairs, () => {});
            else if (action === 'runMoves') value = await api.runMoves(moves, () => {});
            else if (action === 'undoMoves') value = await api.undoMoves([{ from: 'Unerlaubt.jpg', to: 'Alt.jpg' }]);
            else if (action === 'transfer') value = await api.transfer(dir, sub, 'IMG_0001.jpg', 'Unerlaubt.jpg');
            else if (action === 'renameFile') value = await api.renameFile(dir, 'IMG_0001.jpg', 'Unerlaubt.jpg');
            else value = await api.moveBetween(sub, dir, 'Alt.jpg', 'Unerlaubt.jpg');
            return { value };
          } catch (e) { return { error: e.message }; }
        }, action);
        assert.ok(result.value === false || /Originalfotos.*geschützt/.test(result.error || ''), `${action} muss blockieren`);
        assert.equal(await page.evaluate(() => window.mutations.length), count, `${action}: kein mutierender Dateisystemaufruf, auch keine temporäre Datei`);
        assert.deepEqual(await snapshot(), before, `${mode}/${action}: alle Dateinamen, Verzeichnisse und Inhalte bytegenau erhalten`);
      }
      assert.equal(await page.locator('#bUndo').count(), 0, 'Kein erfolgreicher Änderungsabschluss');
      await open('B'); assert.equal(await page.evaluate(() => window.fotoTest.readOnly()), false);
      await page.locator('#list .desc').first().fill('B regulär'); assert.equal(await page.locator('#btnRename').isEnabled(), true);
      await page.locator('#btnRename').click(); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor();
      const after = await snapshot();
      for (const [n, bytes] of Object.entries(before)) if (n.startsWith(projects.A + '/')) assert.deepEqual(after[n], bytes, `A bleibt nach Wechsel geschützt: ${n}`);
      assert.ok(after[projects.B + '/Fotos/01_P1_B_regulär.jpg'], 'Reguläre Dateiumbenennung nach Projektwechsel wieder möglich');
    });
  }

  await scenario('Älteres Projekt ohne Formatkennzeichen bleibt bearbeitbar', 'legacy', async ({ page, open }) => {
    await open('A'); assert.equal(await page.evaluate(() => window.fotoTest.readOnly()), false);
    await page.locator('#btnRename').click(); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor();
  });

  await scenario('Neues Projekt ohne Projektdatei bleibt bearbeitbar', 'missing', async ({ page, open, snapshot }) => {
    await open('A'); assert.equal(await page.evaluate(() => window.fotoTest.readOnly()), false);
    await page.locator('#list .desc').first().fill('Erstes Bild');
    await page.locator('#btnRename').click(); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor();
    const after = await snapshot();
    assert.ok(after[projects.A + '/Fotos/_Bildumbenenner.json']);
    assert.ok(after[projects.A + '/Fotos/01_Erstes_Bild.jpg']);
  });

  await scenario('Geschütztes Projekt: sichere PDF-/ZIP-Ausgabe und Suite-Navigation bleiben verfügbar', 'future', async ({ page, open, snapshot, before, base }) => {
    // URL-Projektkontext für die echte gemeinsame Suite-Navigation.
    await page.goto(base + '?projekt=' + encodeURIComponent(projects.A));
    await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 2);
    assert.match(await page.locator('#mosaikLeiste .ml-proj').textContent(), /26\.0801/);
    assert.equal(await page.locator('#btnPdf').isEnabled(), true);
    assert.equal(await page.locator('#btnZip').isEnabled(), true);
    await page.locator('#pvImgWrap').click(); assert.equal(await page.locator('#lightbox').evaluate(e => e.classList.contains('show')), true);
    await page.keyboard.press('Escape');
    await page.locator('#btnPdf').click(); await page.locator('#m_objekt').fill('Nur für diese Ausgabe'); await page.locator('#zOk').click();
    await page.locator('.pdfOpen').waitFor();
    await page.evaluate(() => { window.showSaveFilePicker = async opts => window.fotoTest.dir().getFileHandle(opts.suggestedName, { create: true }); });
    await page.locator('#btnZip').click(); await page.locator('#zOk').click();
    await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('ZIP gespeichert'));
    let after = await snapshot();
    for (const [n, bytes] of Object.entries(before)) assert.deepEqual(after[n], bytes, `Export erhält Original-/Projektdatei ${n}`);
    const pdf = Object.keys(after).find(n => n.endsWith('.pdf')), zip = Object.keys(after).find(n => n.endsWith('.zip'));
    assert.ok(pdf && zip); assert.equal(Buffer.from(after[pdf]).subarray(0, 4).toString(), '%PDF'); assert.equal(Buffer.from(after[zip]).readUInt32LE(), 0x04034b50);
    // Ein Speicherdialog darf im Schutzmodus auch direkt gelieferte Original-
    // oder Projektdateihandles nicht als ZIP-Ziel überschreiben.
    for (const target of ['IMG_0001.jpg', '_Bildumbenenner.json', '_Projekt.json']) {
      const beforeBadTarget = await snapshot();
      await page.evaluate(target => { window.showSaveFilePicker = async () => {
        if (target === '_Projekt.json') { const a = await (await navigator.storage.getDirectory()).getDirectoryHandle('Schutzmodus-Testarchiv'); return (await a.getDirectoryHandle('26.0801 Test A')).getFileHandle(target); }
        return window.fotoTest.dir().getFileHandle(target);
      }; }, target);
      await page.locator('#btnZip').click(); await page.locator('#zOk').click();
      await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('ZIP-Export fehlgeschlagen'));
      assert.deepEqual(await snapshot(), beforeBadTarget, `ZIP darf ${target} nicht ersetzen`);
    }
    await page.locator('#mosaikLeiste .ml-proj').click();
    await Promise.all([page.waitForURL(/projekt=26\.0802/), page.locator('#mosaikLeistePop a', { hasText: projects.B }).click()]);
    await page.waitForFunction(() => !document.body.inert && document.querySelector('#projBadge').textContent.includes('26.0802'));
    assert.equal(await page.evaluate(() => window.fotoTest.readOnly()), false);
    after = await snapshot(); for (const [n, bytes] of Object.entries(before)) assert.deepEqual(after[n], bytes, `Navigation erhält ${n}`);
  });
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

const { waitForAsync } = require('./await-condition.cjs');
// Synthetische Projekte im OPFS; echte UI und echte Dateiinhalte, keine App-Interna.
// node tests/sicherer-projektwechsel-browser.cjs [chromium|webkit]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const name = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const projects = { A: '26.0901 Test A', B: '26.0902 Test B', C: '26.0903 Test C' };
let browser, server;

(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await playwright[name].launch();

  async function scenario(title, run) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base);
      const canWrite = await page.evaluate(async () => {
        try { const d = await navigator.storage.getDirectory(), h = await d.getFileHandle('probe', { create: true });
          if (!('showDirectoryPicker' in window) || !h.createWritable) return false;
          const w = await h.createWritable(); await w.write('test'); await w.close(); return true;
        } catch (e) { return false; }
      });
      if (!canWrite) { assert.deepEqual(errors, []); console.log(`SKIP (${name}): ${title} – kein schreibbarer Ordnerzugriff; nur Laden geprüft`); return false; }
      await page.evaluate(async projects => {
        const r = await navigator.storage.getDirectory();
        const put = async (dir, n, data) => { const w = await (await dir.getFileHandle(n, { create: true })).createWritable(); await w.write(data); await w.close(); };
        const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
        canvas.getContext('2d').fillRect(0, 0, 8, 8);
        const jpg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
        for (const [key, n] of Object.entries(projects)) {
          const p = await r.getDirectoryHandle(n, { create: true }), f = await p.getDirectoryHandle('Fotos', { create: true });
          await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: `Objekt ${key}`, notizen: 'erhalten' }));
          await put(f, '_Bildumbenenner.json', JSON.stringify({ app: 'Bildumbenenner', format: 1, version: '1.8.1',
            projekt: { proj: n.split(' ')[0], objekt: `Objekt ${key}` },
            benennung: { prefix: '', date: false, num: true, start: 1, digits: 2, sep: '_', spaces: true, uml: false, lower: true, probe: true, discard: 'move', sort: 'manual' },
            reihenfolge: ['IMG_0002.jpg', 'IMG_0001.jpg'],
            bilder: { 'IMG_0001.jpg': { beschreibung: `${key} alt 1`, abschnitt: 'Küche', probe: 'P1' }, 'IMG_0002.jpg': { beschreibung: `${key} alt 2`, abschnitt: 'Flur', drehung: 90 } }
          }));
          await put(f, 'IMG_0001.jpg', jpg); await put(f, 'IMG_0002.jpg', jpg);
        }
        window.testProjects = projects; window.testNext = 'A';
        window.showDirectoryPicker = () => r.getDirectoryHandle(projects[window.testNext]);
        window.io = { fail: '', stage: 'create', error: 'Error', hold: '', starts: [], ends: [] };
        const create = FileSystemFileHandle.prototype.createWritable;
        FileSystemFileHandle.prototype.createWritable = async function (...args) {
          const n = this.name, io = window.io;
          if (io.fail === n && io.stage === 'create') throw new DOMException('Synthetischer Schreibfehler', io.error);
          const w = await create.apply(this, args), close = w.close.bind(w), write = w.write.bind(w);
          w.write = async data => {
            if (io.fail === n && io.stage === 'write') throw new DOMException('Synthetischer Schreibfehler im Stream', io.error);
            return write(data);
          };
          w.close = async () => {
            io.starts.push(n);
            if (io.hold === n) await new Promise(resolve => { window.releaseWrite = () => { io.hold = ''; resolve(); }; });
            if (io.fail === n && io.stage === 'close') throw new DOMException('Synthetischer Abschlussfehler', io.error);
            await close(); io.ends.push(n);
          };
          return w;
        };
      }, projects);
      const read = async key => {
        // A native File snapshot can become unreadable if an autosave commits
        // between getFile() and text(). Retry that transient filesystem race.
        const snapshot = await waitForAsync(page, async ([key, projects]) => {
          try {
            const r = await navigator.storage.getDirectory(), p = await r.getDirectoryHandle(projects[key]), f = await p.getDirectoryHandle('Fotos');
            const text = await (await (await f.getFileHandle('_Bildumbenenner.json')).getFile()).text();
            const pj = await (await (await p.getFileHandle('_Projekt.json')).getFile()).text();
            const images = {};
            for (const n of ['IMG_0001.jpg', 'IMG_0002.jpg']) images[n] = Array.from(new Uint8Array(await (await (await f.getFileHandle(n)).getFile()).arrayBuffer()));
            return { text, json: JSON.parse(text), pj: JSON.parse(pj), pjText: pj, images };
          } catch (e) { if (e.name === 'NotReadableError') return false; throw e; }
        }, [key, projects]);
        try { return await snapshot.jsonValue(); } finally { await snapshot.dispose(); }
      };
      const idle = () => page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 2);
      const open = async key => {
        await page.evaluate(key => { window.testNext = key; }, key); await page.locator('#btnOpen').click();
        await page.waitForFunction(nr => !document.body.inert && document.querySelectorAll('#list .row').length === 2 && document.querySelector('#projBadge').textContent.includes(nr), projects[key].split(' ')[0]);
      };
      const description = page.locator('#list .desc').first();
      const assertA = async value => { await idle(); assert.match(await page.locator('#projBadge').textContent(), /26\.0901/); assert.equal(await description.inputValue(), value); };
      const fail = async (file = '_Bildumbenenner.json', stage = 'create', error = 'Error') => page.evaluate(([file, stage, error]) => Object.assign(window.io, { fail: file, stage, error }), [file, stage, error]);
      const recover = () => page.evaluate(() => { window.io.fail = ''; });
      const hold = file => page.evaluate(file => { window.io.hold = file; window.releaseWrite = null; }, file);
      const started = () => page.waitForFunction(() => typeof window.releaseWrite === 'function');
      const release = () => page.evaluate(() => window.releaseWrite());
      const nextWithoutWaiting = async key => {
        await page.evaluate(key => { window.testNext = key; }, key); await page.locator('#btnOpen').click();
      };
      const rejected = async text => {
        await page.waitForFunction(text => !document.body.inert && document.querySelector('#banner').textContent.includes(text), text);
        assert.equal(await page.locator('#bSaveRetry').isVisible(), true);
      };
      const before = { A: await read('A'), B: await read('B'), C: await read('C') };
      await run({ page, open, read, description, idle, assertA, fail, recover, hold, started, release, nextWithoutWaiting, rejected, before });
      assert.deepEqual((await read('A')).images, before.A.images, 'Originalbilder A unverändert');
      assert.deepEqual(await read('C'), before.C, 'Unbeteiligtes Projekt C vollständig unverändert');
      assert.deepEqual(errors, [], 'Keine JavaScript-/Konsolenfehler');
      console.log(`OK (${name}): ${title}`);
      return true;
    } finally { await ctx.close(); }
  }

  const supported = await scenario('Normales Öffnen und erfolgreicher Wechsel sichern den Dateiinhalt', async ({ open, read, description, before }) => {
    await open('A');
    await description.fill('A neu vor Wechsel');
    await open('B');
    const a = await read('A');
    assert.equal(a.json.bilder['IMG_0002.jpg'].beschreibung, 'A neu vor Wechsel');
    assert.deepEqual(a.json.reihenfolge, before.A.json.reihenfolge);
    assert.equal(a.json.bilder['IMG_0001.jpg'].probe, 'P1');
    assert.equal(a.json.bilder['IMG_0002.jpg'].drehung, 90);
    assert.deepEqual(await read('B'), before.B, 'B enthält keine A-Daten');
  });
  if (!supported) return;

  await scenario('Schreibfehler/Abschlussfehler verhindern Wechsel; Retry erhält letzte Eingabe', async t => {
    const { page, open, fail, description, nextWithoutWaiting, rejected, assertA, read, before, recover } = t;
    await open('A'); await fail('_Bildumbenenner.json', 'close');
    await description.fill('A letzte ungesicherte Beschreibung');
    await nextWithoutWaiting('B'); await rejected('Projektwechsel wurde deshalb abgebrochen');
    await assertA('A letzte ungesicherte Beschreibung');
    assert.deepEqual(await read('B'), before.B);
    assert.equal((await read('A')).json.bilder['IMG_0002.jpg'].beschreibung, 'A alt 2');
    await recover(); await page.locator('#bSaveRetry').click();
    await page.waitForFunction(() => !document.body.inert && document.querySelector('#banner').textContent.includes('wurden im Projektordner gespeichert'));
    assert.equal((await read('A')).json.bilder['IMG_0002.jpg'].beschreibung, 'A letzte ungesicherte Beschreibung');
    await open('B'); assert.deepEqual(await read('B'), before.B);
  });

  await scenario('Während der Arbeit entzogene Schreibberechtigung', async ({ open, fail, description, nextWithoutWaiting, rejected, assertA, recover, read, before }) => {
    await open('A'); await fail('_Bildumbenenner.json', 'create', 'NotAllowedError');
    await description.fill('A ohne Berechtigung');
    await nextWithoutWaiting('B'); await rejected('Projektwechsel wurde deshalb abgebrochen');
    await assertA('A ohne Berechtigung'); assert.deepEqual(await read('B'), before.B);
    await recover(); await open('B');
    assert.equal((await read('A')).json.bilder['IMG_0002.jpg'].beschreibung, 'A ohne Berechtigung');
  });

  await scenario('Fehler beim Schreiben bricht den Stream ab und erlaubt einen neuen Versuch', async ({ open, fail, description, nextWithoutWaiting, rejected, assertA, recover, read, before }) => {
    await open('A'); await fail('_Bildumbenenner.json', 'write'); await description.fill('A nach Streamfehler');
    await nextWithoutWaiting('B'); await rejected('Projektwechsel wurde deshalb abgebrochen');
    await assertA('A nach Streamfehler'); assert.equal((await read('A')).text, before.A.text);
    await recover(); await open('B');
    assert.equal((await read('A')).json.bilder['IMG_0002.jpg'].beschreibung, 'A nach Streamfehler');
  });

  await scenario('Laufender Autosave, schnelle Änderungen und konkurrierende Wechsel', async ({ page, open, read, description, hold, started, release, nextWithoutWaiting, before }) => {
    await open('A'); await hold('_Bildumbenenner.json');
    await description.fill('A erster Stand'); await started();
    // Der erste Schreibvorgang ist begonnen, aber noch nicht abgeschlossen.
    await description.fill('A zweiter Stand'); await description.fill('A letzter Stand');
    await nextWithoutWaiting('B');
    await page.waitForFunction(() => document.body.inert);
    assert.equal(await page.locator('body').evaluate(e => e.inert), true);
    assert.match(await page.locator('#projBadge').textContent(), /26\.0901/);
    assert.deepEqual(await read('B'), before.B);
    // Ein weiterer programmatischer Klick darf den laufenden Wechsel nicht überholen.
    await page.evaluate(() => document.querySelector('#btnReload').click());
    await release();
    await page.waitForFunction(() => !document.body.inert && document.querySelector('#projBadge').textContent.includes('26.0902'));
    assert.equal((await read('A')).json.bilder['IMG_0002.jpg'].beschreibung, 'A letzter Stand');
    assert.deepEqual(await read('B'), before.B);
  });

  await scenario('Neu einlesen verwirft bei Speicherfehler keine Eingaben', async ({ page, open, description, fail, rejected, assertA, recover, idle, read }) => {
    await open('A'); await fail(); await description.fill('A vor Neu einlesen');
    await page.locator('#btnReload').click(); await rejected('erneute Einlesen wurde deshalb abgebrochen');
    await assertA('A vor Neu einlesen');
    await recover(); await page.locator('#btnReload').click(); await idle();
    assert.equal(await description.inputValue(), 'A vor Neu einlesen');
    assert.equal((await read('A')).json.bilder['IMG_0002.jpg'].beschreibung, 'A vor Neu einlesen');
  });

  await scenario('Gemeinsame Projektdaten: fehlgeschlagenen Patch erhalten und erneut speichern', async ({ page, open, fail, read, before, recover, nextWithoutWaiting, rejected }) => {
    await open('A'); await fail('_Projekt.json', 'close');
    await page.locator('#btnMeta').click(); await page.locator('#m_objekt').fill('A gemeinsamer neuer Stand'); await page.locator('#zCancel').click();
    await nextWithoutWaiting('B'); await rejected('Projektwechsel wurde deshalb abgebrochen');
    assert.match(await page.locator('#projBadge').textContent(), /26\.0901/);
    assert.equal((await read('A')).pj.objekt, 'Objekt A');
    assert.deepEqual(await read('B'), before.B);
    await recover(); await open('B');
    const a = await read('A'); assert.equal(a.pj.objekt, 'A gemeinsamer neuer Stand'); assert.equal(a.pj.notizen, 'erhalten');
    assert.equal(a.json.projekt.objekt, 'A gemeinsamer neuer Stand');
  });

  await scenario('Neuere gemeinsame Eingaben überleben Fehler eines laufenden Schreibvorgangs', async ({ page, open, fail, hold, started, release, recover, read }) => {
    await open('A'); await hold('_Projekt.json'); await fail('_Projekt.json', 'close');
    await page.locator('#btnMeta').click(); await page.locator('#m_objekt').fill('A älterer Patch'); await started();
    await page.locator('#m_objekt').fill('A neuester Patch');
    await release();
    await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('nicht gespeichert'));
    await page.locator('#zCancel').click(); await recover(); await open('B');
    assert.equal((await read('A')).pj.objekt, 'A neuester Patch');
  });

  await scenario('Gemeinsamen laufenden Schreibvorgang vor dem Wechsel abwarten', async ({ page, open, hold, started, release, nextWithoutWaiting, read, before }) => {
    await open('A'); await hold('_Projekt.json');
    await page.locator('#btnMeta').click(); await page.locator('#m_objekt').fill('A verzögerte Projektdaten'); await page.locator('#zCancel').click(); await started();
    await nextWithoutWaiting('B');
    assert.match(await page.locator('#projBadge').textContent(), /26\.0901/); assert.deepEqual(await read('B'), before.B);
    await release(); await page.waitForFunction(() => !document.body.inert && document.querySelector('#projBadge').textContent.includes('26.0902'));
    assert.equal((await read('A')).pj.objekt, 'A verzögerte Projektdaten');
  });

  for (const file of ['_Bildumbenenner.json', '_Projekt.json']) {
    await scenario(`App-Update schützt ${file} und lädt erst nach erfolgreichem Retry neu`, async ({ page, open, fail, recover, description, rejected, read, assertA }) => {
      await open('A');
      // Nur den vorhandenen Updateknopf sichtbar machen; sein echter Handler bleibt unverändert.
      await page.evaluate(() => { document.querySelector('#btnUpd').hidden = false; });
      await fail(file);
      if (file === '_Projekt.json') {
        await page.locator('#btnMeta').click(); await page.locator('#m_objekt').fill('A vor Update'); await page.locator('#zCancel').click();
      }
      await description.fill('A Bild vor Update');
      let navigations = 0; page.on('framenavigated', f => { if (f === page.mainFrame()) navigations++; });
      await page.locator('#btnUpd').click(); await rejected('Update wurde deshalb abgebrochen');
      await assertA('A Bild vor Update'); assert.equal(navigations, 0);
      await recover(); await Promise.all([page.waitForEvent('framenavigated', f => f === page.mainFrame()), page.locator('#btnUpd').click()]);
      await page.waitForLoadState('load');
      assert.equal((await read('A')).json.bilder['IMG_0002.jpg'].beschreibung, 'A Bild vor Update');
      if (file === '_Projekt.json') assert.equal((await read('A')).pj.objekt, 'A vor Update');
      assert.equal(navigations, 1);
    });
  }

  for (const file of ['_Bildumbenenner.json', '_Projekt.json']) {
    await scenario(`Browser-Reload warnt auch während ${file} noch geschrieben wird`, async ({ page, open, hold, started, release, description, read }) => {
      await open('A'); await hold(file);
      if (file === '_Projekt.json') {
        await page.locator('#btnMeta').click(); await page.locator('#m_objekt').fill('A vor Browser-Reload'); await page.locator('#zCancel').click();
      } else await description.fill('A vor Browser-Reload');
      await started();
      const dialog = page.waitForEvent('dialog');
      // page.reload() waits for navigation even when the user cancels it. The
      // browser's reload call lets us verify that cancellation without a timeout.
      const reload = page.evaluate(() => location.reload());
      const d = await dialog; assert.equal(d.type(), 'beforeunload'); await d.dismiss(); await reload;
      assert.match(await page.locator('#projBadge').textContent(), /26\.0901/);
      await release();
      await page.waitForFunction(file => window.io.ends.includes(file), file);
      if (file === '_Projekt.json') assert.equal((await read('A')).pj.objekt, 'A vor Browser-Reload');
      else assert.equal((await read('A')).json.bilder['IMG_0002.jpg'].beschreibung, 'A vor Browser-Reload');
    });
  }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

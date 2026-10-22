// Synthetische OPFS-Projekte; echte App, URL, Leiste und Picker-Bedienung.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const name = process.argv[2] || 'chromium';
const projects = {A: '26.0901 Köln & Süd + 50% #Hof', B: '26.0902 Kontext B', U: '26.0904 Kontext U'};
let browser, server;
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
  server = http.createServer((req, res) => {
    if(new URL(req.url,'http://x').pathname === '/project-store.js'){
      res.writeHead(200,{'content-type':'application/javascript'});res.end(fs.readFileSync(path.join(__dirname,'..','project-store.js')));return;
    }
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});res.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await playwright[name].launch();
  async function scenario(title, run, initialRead = '') {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    try {
      const page = await ctx.newPage(), errors = [], dialogs = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', d => {dialogs.push(d.message());d.dismiss();});
      await page.goto(base);
      const canWrite = await page.evaluate(async () => {
        try {const r = await navigator.storage.getDirectory(), f = await r.getFileHandle('probe', {create: true});
          if (!('showDirectoryPicker' in window) || !f.createWritable) return false;
          const w = await f.createWritable();await w.write('synthetisch');await w.close();return true;
        } catch {return false;}
      });
      if (!canWrite) {
        await page.goto(base + '?projekt=' + encodeURIComponent(projects.A));
        await page.waitForSelector('#mosaikLeiste');
        assert.equal(await page.locator('#mosaikLeiste .ml-proj b').count(), 0, 'URL allein bestätigt kein geöffnetes Projekt');
        assert.equal(await page.locator('#projBadge').isVisible(), false);
        assert.deepEqual(errors, []);
        console.log(`SKIP (${name}): ${title} – kein schreibbarer Ordnerzugriff; ungeöffneter URL-Kontext geprüft`);
        return false;
      }
      // App vor dem Fixture-Aufbau stoppen; keine ausstehenden App-Schreibvorgänge.
      await page.route('**/__fixtures', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Synthetische Ordner</title>'}));
      await page.goto(new URL('__fixtures', base).href);
      await page.evaluate(async projects => {
        const r = await navigator.storage.getDirectory(), archive = await r.getDirectoryHandle('Archiv', {create: true});
        const put = async (d, n, data) => {const w = await (await d.getFileHandle(n, {create: true})).createWritable();await w.write(data);await w.close();};
        const c = document.createElement('canvas');c.width = 8;c.height = 8;c.getContext('2d').fillRect(0, 0, 8, 8);
        const jpg = await new Promise(resolve => c.toBlob(resolve, 'image/jpeg'));
        for (const [key, n] of Object.entries(projects)) {
          const p = await (key === 'U' ? r : archive).getDirectoryHandle(n, {create: true});
          const f = await p.getDirectoryHandle('Fotos', {create: true});
          await put(p, '_Projekt.json', JSON.stringify({format: 'mosaik-projekt', version: 1, objekt: 'Objekt ' + key, notizen: 'Erhalten'}));
          await put(f, key + '_01.jpg', jpg);
          await put(f, '_Bildumbenenner.json', JSON.stringify({app: 'Bildumbenenner', format: 1, version: '1.9.2',
            projekt: {proj: n.split(' ')[0], objekt: 'Objekt ' + key},
            benennung: {prefix: '', date: false, num: true, start: 1, digits: 2, sep: '_', spaces: true, uml: false, lower: true, probe: true, discard: 'move', sort: 'manual'},
            reihenfolge: [key + '_01.jpg'], bilder: {[key + '_01.jpg']: {beschreibung: key + ' Beschreibung', abschnitt: 'Flur ' + key, probe: 'P1', drehung: 90}}}));
        }
        await new Promise((resolve, reject) => {
          const q = indexedDB.open('mosaik-suite', 1);q.onupgradeneeded = () => q.result.createObjectStore('kv');
          q.onsuccess = () => {const t = q.result.transaction('kv', 'readwrite');t.objectStore('kv').put(archive, 'archiv');t.objectStore('kv').put([], 'zuletzt');t.oncomplete = () => {q.result.close();resolve();};t.onerror = () => reject(t.error);};q.onerror = () => reject(q.error);
        });
      }, projects);
      await ctx.addInitScript(({projects, initialRead}) => {
        window.io = {failSave: '', holdSave: '', holdRead: initialRead, failRead: false, failList: false, started: '', readStarted: false};
        window.nextFolder = 'B';
        window.showDirectoryPicker = async () => {
          const root = await navigator.storage.getDirectory();
          if (nextFolder === 'unknown') return (await root.getDirectoryHandle(projects.U)).getDirectoryHandle('Fotos');
          return (nextFolder === 'U' ? root : await root.getDirectoryHandle('Archiv')).getDirectoryHandle(projects[nextFolder]);
        };
        const create = FileSystemFileHandle.prototype.createWritable;
        FileSystemFileHandle.prototype.createWritable = async function(...args) {
          const w = await create.apply(this, args), close = w.close.bind(w), file = this.name;
          w.close = async () => {
            if (io.holdSave === file) {io.holdSave = '';io.started = file;await new Promise(resolve => window.releaseSave = resolve);}
            if (io.failSave === file) {await w.abort();throw new Error('Synthetischer Speicherfehler');}
            return close();
          };
          return w;
        };
        const get = FileSystemFileHandle.prototype.getFile;
        FileSystemFileHandle.prototype.getFile = async function(...args) {
          if (this.name === io.holdRead) {io.holdRead = '';io.readStarted = true;await new Promise(resolve => window.releaseRead = resolve);}
          if (io.failRead && this.name === 'B_01.jpg') throw new Error('Synthetischer Bild-Lesefehler');
          return get.apply(this, args);
        };
        const values = FileSystemDirectoryHandle.prototype.values;
        FileSystemDirectoryHandle.prototype.values = async function* (...args) {
          if (io.failList && this.name === 'Fotos') {
            const root = await navigator.storage.getDirectory(), p = await root.resolve(this);
            if (p && p.includes(projects.B)) throw new Error('Synthetischer Ordner-Lesefehler');
          }
          yield* values.apply(this, args);
        };
      }, {projects, initialRead});
      const start = async () => {
        await page.goto(base + '?projekt=' + encodeURIComponent(projects.A) + '&ansicht=liste&extra=1&extra=2#fotos');
        await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .desc').length === 1);
        await contextIs('A');
        await page.evaluate(() => history.replaceState({synthetic: 'erhalten'}, '', location.href));
      };
      const contextIs = async key => {
        await page.waitForFunction(([key, n]) => !document.body.inert && document.querySelector('#projBadge').textContent.includes(n.split(' ')[0]) && document.querySelector('#mosaikLeiste .ml-proj b')?.textContent === n, [key, projects[key]]);
        assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('projekt'), projects[key]);
        assert.ok((await page.locator('#folderName').textContent()).includes(projects[key]));
        assert.equal(await page.locator('#list .desc').first().inputValue(), key + ' Beschreibung');
        for (const a of await page.locator('#mosaikLeiste a.ml-step, #mosaikLeiste a.ml-weiter').all()) {
          const url = new URL(await a.getAttribute('href'), page.url());
          assert.equal(url.searchParams.has('projekt'), false);
          assert.equal(new URLSearchParams(url.hash.slice(1)).get('projekt'), projects[key]);
        }
      };
      const stillA = async description => {
        assert.match(await page.locator('#projBadge').textContent(), /26\.0901/);
        assert.equal(await page.locator('#mosaikLeiste .ml-proj b').textContent(), projects.A);
        assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('projekt'), projects.A);
        assert.equal(await page.locator('#list .desc').first().inputValue(), description);
      };
      const disk = key => page.evaluate(async ([key, n]) => {
        const root = await navigator.storage.getDirectory();
        const p = await (key === 'U' ? root : await root.getDirectoryHandle('Archiv')).getDirectoryHandle(n), f = await p.getDirectoryHandle('Fotos');
        const raw = await (await (await f.getFileHandle('_Bildumbenenner.json')).getFile()).text();
        const bytes = Array.from(new Uint8Array(await (await (await f.getFileHandle(key + '_01.jpg')).getFile()).arrayBuffer()));
        const sharedRaw = await (await (await p.getFileHandle('_Projekt.json')).getFile()).text();
        return {raw, json: JSON.parse(raw), bytes, sharedRaw};
      }, [key, projects[key]]);
      const open = async key => {await page.evaluate(key => window.nextFolder = key, key);await page.locator('#btnOpen').click();};
      await run({page, start, open, contextIs, stillA, disk, base});
      assert.deepEqual(errors, [], 'Keine JavaScript-Fehler');assert.deepEqual(dialogs, [], 'Keine unerwarteten Dialoge');
      console.log(`OK (${name}): ${title}`);
      return true;
    } finally {await ctx.close();}
  }

  const supported = await scenario('Zentrale A → manueller Wechsel B → Navigation und Reload', async ({page, start, open, contextIs, disk}) => {
    await start();
    assert.equal(new URL(page.url()).searchParams.has('projekt'), false, 'Query-Link früh bereinigt');
    await page.goto(base + '?projekt=falsch&ansicht=liste&extra=1&extra=2#fotos&projekt=' + encodeURIComponent(projects.A));
    await contextIs('A');
    assert.equal(new URL(page.url()).searchParams.has('projekt'), false, 'Fragment gewinnt vor Query');
    await page.goto(base + '?ansicht=liste&extra=1&extra=2#fotos&projekt=' + encodeURIComponent(projects.A));
    await contextIs('A');
    await page.evaluate(() => history.replaceState({synthetic: 'erhalten'}, '', location.href));
    const beforeB = await disk('B'), historyLength = await page.evaluate(() => history.length);
    let navigations = 0;page.on('load', () => navigations++);
    await open('B');
    await page.waitForFunction(() => !document.body.inert && document.getElementById('projBadge').textContent.includes('26.0902'));
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('projekt'), projects.B, 'Erfolgreich geöffnetes B bestimmt die URL');
    await contextIs('B');
    const url = new URL(page.url());assert.equal(url.searchParams.get('ansicht'), 'liste');assert.deepEqual(url.searchParams.getAll('extra'), ['1', '2']);assert.ok(url.hash.startsWith('#fotos&'));assert.equal(url.searchParams.has('projekt'), false);
    assert.deepEqual(await page.evaluate(() => history.state), {synthetic: 'erhalten'});assert.equal(await page.evaluate(() => history.length), historyLength);assert.equal(navigations, 0);
    assert.deepEqual(await disk('B'), beforeB, 'Bloßes Öffnen erzeugt weder Projektkopie noch Speichervorgang');
    await page.reload();await contextIs('B');assert.equal(navigations, 1);
  });
  if (!supported) return;

  await scenario('Angeforderter URL-Kontext wird nicht vor dem erfolgreichen Öffnen angezeigt', async ({page, contextIs, base}) => {
    await page.goto(base + '?projekt=' + encodeURIComponent(projects.A));
    await page.waitForFunction(() => io.readStarted);
    await page.waitForSelector('#mosaikLeiste');
    assert.equal(await page.locator('#mosaikLeiste .ml-proj b').count(), 0);
    assert.equal(await page.locator('#projBadge').isVisible(), false);
    await page.evaluate(() => releaseRead());await contextIs('A');
  }, 'A_01.jpg');

  for (const file of ['_Bildumbenenner.json', '_Projekt.json']) {
    await scenario(`Speicherfehler ${file}: A und Navigationskontext bleiben erhalten`, async ({page, start, open, stillA, disk}) => {
      await start();const b = await disk('B');await page.evaluate(file => io.failSave = file, file);
      if (file === '_Projekt.json') {await page.locator('#btnMeta').click();await page.locator('#m_objekt').fill('A neue Projektdaten');await page.locator('#zCancel').click();}
      await page.locator('#list .desc').fill('A ungesicherte Eingabe');await open('B');
      await page.waitForFunction(() => !document.body.inert && document.getElementById('bSaveRetry'));
      await stillA('A ungesicherte Eingabe');assert.deepEqual(await disk('B'), b);
    });
    for (const failAfterDelay of [false, true]) {
      await scenario(`Verzögerte Speicherung ${file}, Fehler=${failAfterDelay}`, async ({page, start, open, stillA, contextIs}) => {
        await start();await page.evaluate(file => io.holdSave = file, file);
        if (file === '_Projekt.json') {await page.locator('#btnMeta').click();await page.locator('#m_objekt').fill('A verzögerter Objektname');await page.locator('#zCancel').click();}
        await page.locator('#list .desc').fill('A verzögerte Eingabe');
        // Bereits gestarteten Autosave und den danach gestarteten Wechsel prüfen.
        await page.waitForFunction(() => io.started);await open('B');
        await page.waitForFunction(() => document.body.inert);
        await page.evaluate(() => MosaikLeiste.aktualisieren());await stillA('A verzögerte Eingabe');
        await page.evaluate(([file, fail]) => {if (fail) io.failSave = file;releaseSave();}, [file, failAfterDelay]);
        if (failAfterDelay) {
          await page.waitForFunction(() => !document.body.inert && document.getElementById('bSaveRetry'));
          await stillA('A verzögerte Eingabe');
        } else await contextIs('B');
      });
    }
  }
  for (const failure of ['failRead', 'failList']) {
    await scenario(`Zielordner nicht lesbar (${failure}): A bleibt bearbeitbar`, async ({page, start, open, stillA, disk}) => {
      await start();const b = await disk('B');await page.locator('#list .desc').fill('A vor Lesefehler');
      await page.evaluate(failure => io[failure] = true, failure);await open('B');
      await page.waitForFunction(() => !document.body.inert && document.querySelector('#banner').textContent.includes('konnte nicht geöffnet'));
      await stillA('A vor Lesefehler');
      await page.evaluate(failure => io[failure] = false, failure);assert.deepEqual(await disk('B'), b);
      await page.locator('#list .desc').fill('A nach Lesefehler');
      await page.waitForFunction(async () => {
        const root = await navigator.storage.getDirectory(), a = await (await root.getDirectoryHandle('Archiv')).getDirectoryHandle('26.0901 Köln & Süd + 50% #Hof');
        const data = JSON.parse(await (await (await (await a.getDirectoryHandle('Fotos')).getFileHandle('_Bildumbenenner.json')).getFile()).text());
        return data.bilder['A_01.jpg'].beschreibung === 'A nach Lesefehler';
      });
      assert.deepEqual(await disk('B'), b, 'Keine A-Eingaben in B geschrieben');
    });
  }
  await scenario('Zielbilder verzögert: erst vollständig geladene Zuordnung veröffentlichen', async ({page, start, open, stillA, contextIs}) => {
    await start();await page.evaluate(() => io.holdRead = 'B_01.jpg');await open('B');
    await page.waitForFunction(() => io.readStarted);
    await page.evaluate(() => MosaikLeiste.aktualisieren());await stillA('A Beschreibung');
    await page.evaluate(() => releaseRead());await contextIs('B');
  });
  await scenario('Ziel-Autosave bei spätem Bildfehler: keine A-Daten in B', async ({page, start, open, stillA, disk}) => {
    await start();
    await page.locator('#list .desc').fill('A erhaltene Eingabe');
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const p = await (await root.getDirectoryHandle('Archiv')).getDirectoryHandle('26.0902 Kontext B');
      const h = await p.getFileHandle('_Projekt.json');
      const data = JSON.parse(await (await h.getFile()).text());
      data.objekt = 'B aus gemeinsamer Datei';
      const w = await h.createWritable();await w.write(JSON.stringify(data));await w.close();
      const get = FileSystemFileHandle.prototype.getFile;
      FileSystemFileHandle.prototype.getFile = async function(...args) {
        if (io.holdJSON && this.name === '_Bildumbenenner.json') {
          io.holdJSON = false;io.jsonStarted = true;
          await new Promise(resolve => window.releaseJSON = resolve);
        }
        return get.apply(this, args);
      };
    });
    const beforeB = await disk('B');
    await page.evaluate(() => io.holdRead = 'B_01.jpg');
    await open('B');await page.waitForFunction(() => io.readStarted);
    await page.evaluate(() => io.holdJSON = true);
    // Den 400-ms-Autosave während des angehaltenen Bildlesens auslösen lassen.
    // Auf dem fehlerhaften Stand wartet er danach im Lesen der Zieldatei.
    await page.waitForTimeout(650);
    await page.evaluate(() => {io.failRead = true;releaseRead();});
    await page.waitForFunction(() => !document.body.inert && document.querySelector('#banner').textContent.includes('konnte nicht geöffnet'));
    await stillA('A erhaltene Eingabe');
    await page.locator('[data-pj-recovery]').click();
    await page.locator('[data-pj-recovery-dialog] h3').filter({hasText:projects.A}).waitFor();
    await page.locator('[data-pj-recovery-dialog]').getByRole('button',{name:'Schließen',exact:true}).click();
    await page.evaluate(() => {io.failRead = false;io.holdJSON = false;if (window.releaseJSON) releaseJSON();});
    await page.waitForTimeout(700);
    assert.deepEqual(await disk('B'), beforeB, 'Fehlgeschlagener Wechsel darf B nicht verändern');
    await open('unknown');await page.waitForFunction(() => !document.body.inert && document.getElementById('btnAssign'));
    assert.equal((await disk('A')).json.bilder['A_01.jpg'].beschreibung, 'A erhaltene Eingabe');
    assert.equal((await disk('A')).json.bilder['B_01.jpg'], undefined);
  });

  await scenario('Verzögertes Ziel mit geänderten gemeinsamen Daten: erst nach Erfolg autospeichern', async ({page, start, open, disk, contextIs}) => {
    await start();
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const p = await (await root.getDirectoryHandle('Archiv')).getDirectoryHandle('26.0902 Kontext B');
      const h = await p.getFileHandle('_Projekt.json');
      const data = JSON.parse(await (await h.getFile()).text());data.objekt = 'B aus gemeinsamer Datei';
      const w = await h.createWritable();await w.write(JSON.stringify(data));await w.close();
    });
    const b = await disk('B');
    await page.evaluate(() => io.holdRead = 'B_01.jpg');
    await open('B');await page.waitForFunction(() => io.readStarted);
    await page.waitForTimeout(650);
    assert.deepEqual(await disk('B'), b, 'Beim Laden noch keine Ziel-Schreibvorgänge');
    await page.evaluate(() => releaseRead());await contextIs('B');
    await page.waitForFunction(async () => {
      const r = await navigator.storage.getDirectory();
      const p = await (await r.getDirectoryHandle('Archiv')).getDirectoryHandle('26.0902 Kontext B');
      const h = await (await p.getDirectoryHandle('Fotos')).getFileHandle('_Bildumbenenner.json');
      return JSON.parse(await (await h.getFile()).text()).projekt.objekt === 'B aus gemeinsamer Datei';
    });
    const saved = await disk('B');
    assert.equal(saved.json.projekt.proj, '26.0902');
    assert.deepEqual(saved.json.bilder, b.json.bilder);
    assert.deepEqual(saved.json.reihenfolge, b.json.reihenfolge);
    assert.equal(saved.sharedRaw, b.sharedRaw);
  });

  for (const malformed of ['reihenfolge', 'beschreibung', 'abschnitt']) {
    await scenario(`Später Zielfehler (${malformed}): Bildzustand und spätere Speicherung von A bleiben erhalten`, async ({page, start, open, stillA, disk}) => {
      await start();await page.locator('#list .desc').fill('A erhaltene Eingabe');
      await page.evaluate(async malformed => {
        const root = await navigator.storage.getDirectory();
        const p = await (await root.getDirectoryHandle('Archiv')).getDirectoryHandle('26.0902 Kontext B');
        const h = await (await p.getDirectoryHandle('Fotos')).getFileHandle('_Bildumbenenner.json');
        const data = JSON.parse(await (await h.getFile()).text());
        if (malformed === 'reihenfolge') data.reihenfolge = {};
        else data.bilder['B_01.jpg'][malformed] = {};
        const w = await h.createWritable();await w.write(JSON.stringify(data));await w.close();
      }, malformed);
      const b = await disk('B');
      await open('B');
      await page.waitForFunction(() => !document.body.inert && document.querySelector('#banner').textContent.includes('konnte nicht geöffnet'));
      await stillA('A erhaltene Eingabe');
      assert.equal(await page.locator('#list .desc').count(), 1);
      assert.equal(await page.locator('#list .sec').inputValue(), 'Flur A');
      assert.equal(await page.locator('#list .probe').inputValue(), 'P1');
      assert.equal(await page.locator('#list .row.rotated').count(), 1);
      await page.locator('#list .desc').fill('A nach spätem Ladefehler');
      await open('unknown');await page.waitForFunction(() => !document.body.inert && document.getElementById('btnAssign'));
      const a = await disk('A');
      assert.deepEqual(a.json.bilder, {'A_01.jpg': {beschreibung: 'A nach spätem Ladefehler', abschnitt: 'Flur A', probe: 'P1', drehung: 90}});
      assert.deepEqual(a.json.reihenfolge, ['A_01.jpg']);
      assert.deepEqual(await disk('B'), b);
    });
  }

  await scenario('Unbekannten Fotos-Ordner öffnen und nachträglich richtig zuordnen', async ({page, start, open, disk}) => {
    await start();const beforeU = await disk('U');await open('unknown');
    await page.waitForFunction(() => !document.body.inert && document.getElementById('btnAssign') && !document.querySelector('#mosaikLeiste .ml-proj b'));
    assert.equal(new URL(page.url()).searchParams.has('projekt'), false);assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).has('projekt'), false);assert.equal(new URL(page.url()).searchParams.get('ansicht'), 'liste');
    assert.equal(await page.locator('#projBadge').isVisible(), false);assert.equal(await page.locator('#mosaikLeiste .ml-proj b').count(), 0);
    assert.match(await page.locator('#folderName').textContent(), /Projekt unbekannt/);assert.equal(await page.locator('#mosaikLeiste a.ml-step').count(), 0);
    assert.equal(await page.locator('[data-pj-recovery]').count(),0,'unassigned folder has no stale recovery action');
    await page.locator('#list .desc').fill('U nachträgliche Beschreibung');
    await page.evaluate(() => window.nextFolder = 'A');await page.locator('#btnAssign').click();
    await page.waitForFunction(() => document.getElementById('banner').textContent.includes('nicht der Projektordner'));
    assert.equal(new URL(page.url()).searchParams.has('projekt'), false);assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).has('projekt'), false);
    await page.evaluate(() => window.nextFolder = 'U');await page.locator('#btnAssign').click();
    await page.waitForFunction(() => !document.body.inert && document.querySelector('#mosaikLeiste .ml-proj b')?.textContent === '26.0904 Kontext U');
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('projekt'), projects.U);assert.match(await page.locator('#projBadge').textContent(), /26\.0904/);
    assert.equal(await page.locator('#list .desc').inputValue(), 'U nachträgliche Beschreibung');
    const u = await disk('U');assert.deepEqual(u.bytes, beforeU.bytes);
    assert.deepEqual(u.json.bilder['U_01.jpg'], {...beforeU.json.bilder['U_01.jpg'], beschreibung: 'U nachträgliche Beschreibung'});
  });
})().catch(e => {console.error(e);process.exitCode = 1;}).finally(async () => {if (browser) await browser.close();if (server) await new Promise(r => server.close(r));});

// Projekt-Sperre nie endlos (FotoKit 2.3.2, Nachzug zu Projektzentrale 1.48.0): hält ein anderes Spektron-Fenster
// die Sperre „mosaik:projekt:<Ordner>“, gibt FotoKit nach ProjectStore.WARTEN (20 s) auf und sagt es – statt still zu hängen.
// node tests/sperre-belegt-browser.cjs [chromium]
//  • Das „andere Fenster“ ist eine zweite Seite im selben Browserprofil (dieselben Web Locks wie zwei echte Fenster).
//  • Die Wartezeit wird im Test verkürzt: setTimeout(…, 20000) läuft hier nach SPERRE_TEST_MS (Standard 1500 ms). Der Test
//    prüft, dass genau dieser 20-s-Zeitgeber gestellt wurde – die App selbst bleibt unverändert.
//  • Geprüft: Meldung nach Ablauf, nichts geschrieben (weder _Projekt.json noch Sicherungen), Eingabe bleibt, kein
//    Nachschreiben im Hintergrund nach Freigabe, „Erneut speichern“ speichert dann; dasselbe für „Erneut speichern“ bei
//    weiter belegter Sperre und für „Fassung wiederherstellen“.
// Ohne Zeitlimit (Stand 2.3.1) schlägt der Test fehl: es erscheint keine Meldung.
process.env.TZ = 'Europe/Berlin';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');

const name = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const PROJ = '26.0142 Teststadt';
const KURZ = Number(process.env.SPERRE_TEST_MS || 1500);
const BELEGT = 'Das Projekt ist gerade in einem anderen Spektron-Fenster belegt – bitte das andere Fenster schließen und erneut versuchen.';

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  // Wie projektdaten-browser.cjs: eigenes (persistentes) Chromium-Profil je Lauf.
  const profil = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fk-sperre-'));
  const ctx = await playwright[name].launchPersistentContext(profil, { viewport: { width: 1300, height: 900 }, serviceWorkers: 'block' });
  const errors = [];
  try{
    // Nur der 20-s-Zeitgeber der Projekt-Sperre wird verkürzt; jede Anforderung wird mitgezählt.
    await ctx.addInitScript(kurz => {
      const st = window.setTimeout.bind(window);
      window.__sperrUhren = 0;
      window.setTimeout = (f, ms, ...a) => { if (ms === 20000){ window.__sperrUhren++; ms = kurz; } return st(f, ms, ...a); };
    }, KURZ);
    const page = ctx.pages()[0] || await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(base);
    await page.waitForSelector('#btnOpen2');
    await page.evaluate(async proj => {
      const r = await navigator.storage.getDirectory();
      for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
      const archiv = await r.getDirectoryHandle('Mosaik Archivordner', { create: true });
      const p = await archiv.getDirectoryHandle(proj, { create: true });
      const fotos = await p.getDirectoryHandle('Fotos', { create: true });
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
      const wf = await (await fotos.getFileHandle('IMG_0001.png', { create: true })).createWritable(); await wf.write(png); await wf.close();
      const w = await (await p.getFileHandle('_Projekt.json', { create: true })).createWritable();
      await w.write(JSON.stringify({ format: 'mosaik-projekt', version: 1, hinweis: 'alt', objekt: 'EFH, Altweg 1', sachverstaendiger: 'Dr. A', ortstermin: '2026-10-01', notizen: 'bleibt' }, null, 2)); await w.close();
      await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
        q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(archiv, 'archiv'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); });
    }, PROJ);
    await page.goto(base + '?projekt=' + encodeURIComponent(PROJ));
    await page.waitForFunction(() => !document.body.inert && !document.getElementById('btnPdf').disabled, null, { timeout: 8000 });

    const projekt = async () => page.evaluate(async proj => {
      const p = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(proj);
      const sich = [];
      try{ for await (const [n] of (await p.getDirectoryHandle('_Projekt_Sicherungen')).entries()) sich.push(n); }catch(e){ if (e.name !== 'NotFoundError') throw e; }
      return { text: await (await (await p.getFileHandle('_Projekt.json')).getFile()).text(), sicherungen: sich.sort() };
    }, PROJ);
    const objekt = async () => JSON.parse((await projekt()).text).objekt;
    const deckblatt = async wert => {
      await page.locator('#btnPdf').click(); await page.locator('#overlay.show #m_objekt').waitFor();
      const v = await page.locator('#m_objekt').inputValue();
      if (wert !== undefined) await page.locator('#m_objekt').fill(wert);
      await page.locator('#zCancel').click();
      return v;
    };
    // „Anderes Fenster“: zweite Seite im selben Profil hält die Projekt-Sperre, bis freigegeben wird.
    const zweites = await ctx.newPage();
    await zweites.goto(base);   // zweites FotoKit-Fenster (Startseite); die Sperre nimmt der Test dort direkt
    const halten = () => zweites.evaluate(proj => new Promise(ok => { navigator.locks.request('mosaik:projekt:' + proj, () => new Promise(r => { window.__frei = r; ok(); })); }), PROJ);
    const freigeben = () => zweites.evaluate(() => window.__frei());
    const meldung = () => page.waitForFunction(t => (document.querySelector('#banner.err')?.textContent || '').includes(t), BELEGT, { timeout: KURZ + 8000 });

    // 1) Eingabe speichern, während das andere Fenster die Sperre hält → nach dem Limit Meldung, nichts geschrieben
    const vorher = await projekt();
    await halten();
    await deckblatt('EFH, Lokal 3');
    const start = Date.now();
    await meldung();
    const dauer = Date.now() - start;
    assert.ok(dauer >= KURZ - 100, 'Meldung erst nach dem Limit (' + dauer + ' ms)');
    assert.ok(await page.evaluate(() => window.__sperrUhren) >= 1, 'die 20-s-Grenze (ProjectStore.WARTEN) wurde gestellt');
    assert.match(await page.locator('#banner').textContent(), /Gemeinsame Projektdaten \(„_Projekt\.json“\) nicht gespeichert: Das Projekt ist gerade in einem anderen Spektron-Fenster belegt/);
    assert.match(await page.locator('#banner').textContent(), /Deine Eingaben sind weiterhin geöffnet/);
    assert.deepEqual(await projekt(), vorher, 'unter fremder Sperre nichts geschrieben (auch keine Sicherung)');
    assert.equal(await deckblatt(), 'EFH, Lokal 3', 'Eingabe bleibt im Fenster');

    // 2) „Erneut speichern“, solange weiter belegt → wieder dieselbe Meldung (mit Grund), nichts geschrieben
    await page.locator('#bSaveRetry').click();
    await page.waitForFunction(t => { const b = document.querySelector('#banner.err')?.textContent || ''; return b.includes('Das Speichern wurde deshalb abgebrochen') && b.includes(t); }, BELEGT, { timeout: KURZ + 8000 });
    assert.ok(await page.evaluate(() => !document.body.inert), 'Oberfläche wieder bedienbar');
    assert.deepEqual(await projekt(), vorher, 'weiter nichts geschrieben');

    // 3) Anderes Fenster gibt frei → kein Nachschreiben im Hintergrund ohne den Nutzer
    await freigeben();
    await page.waitForTimeout(KURZ + 2500);
    assert.deepEqual(await projekt(), vorher, 'nach Freigabe schreibt FotoKit nicht von selbst');
    assert.equal(await page.evaluate(async proj => (await navigator.locks.query()).pending.filter(l => l.name === 'mosaik:projekt:' + proj).length, PROJ), 0, 'keine wartende Anforderung übrig');

    // 4) Nutzer speichert erneut → geht durch, mit der gemerkten Eingabe
    await page.locator('#bSaveRetry').click();
    await page.waitForFunction(() => /gespeichert/.test(document.querySelector('#banner.ok')?.textContent || ''), null, { timeout: 8000 });
    assert.equal(await objekt(), 'EFH, Lokal 3', 'Eingabe mit dem nächsten Speichern geschrieben');
    assert.equal(JSON.parse((await projekt()).text).notizen, 'bleibt');

    // 5) „Fassung wiederherstellen“ bei belegter Sperre → Meldung im Dialog, nichts geschrieben
    const nachSpeichern = await projekt();
    await halten();
    await ui.sicher(page);
    await page.locator('[data-pj-recovery]').click();
    await page.locator('[data-pj-recovery-dialog]').waitFor();
    const wahl = page.locator('[data-pj-recovery-dialog] button').filter({ hasText: /Fassung prüfen:/ });
    await wahl.first().click();
    await page.locator('[data-pj-restore]').click();
    await page.waitForFunction(t => [...document.querySelectorAll('[data-pj-recovery-dialog] p')].some(p => p.textContent.includes('Nicht wiederhergestellt: ' + t)), BELEGT, { timeout: KURZ + 8000 });
    assert.ok(await page.locator('[data-pj-restore]').isEnabled(), 'erneut versuchen möglich');
    assert.deepEqual(await projekt(), nachSpeichern, 'Wiederherstellen schreibt unter fremder Sperre nichts');
    await freigeben();
    await page.locator('[data-pj-restore]').click();
    await page.locator('[data-pj-recovery-dialog]').waitFor({ state: 'detached' });
    assert.equal(await objekt(), 'EFH, Altweg 1', 'nach Freigabe wiederhergestellt');

    assert.deepEqual(errors, []);
    console.log(`OK (${name}): Sperre belegt → Meldung nach dem Limit, nichts geschrieben, Eingabe bleibt, kein Nachschreiben, nächstes Speichern geht; Wiederherstellen ebenso`);
  }finally{
    await ctx.close(); try{ fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }catch(_){}
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });

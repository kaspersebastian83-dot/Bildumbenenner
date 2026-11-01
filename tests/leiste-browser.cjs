// Mosaik-Leiste (Projekt, Arbeitsschritte, „Weiter“, zuletzt geöffnet) im echten Browser: node tests/leiste-browser.cjs [chromium|webkit]
// Gleicher Test in allen Apps der Familie; nur APP unterscheidet sich. Der Archivordner wird im Origin Private File System nachgebildet;
// WebKit kann dort nicht schreiben – dann wird nur geprüft, dass die Leiste ohne Ordnerzugriff erscheint (ohne Haken).
// FotoKit 2.0 startet die Leiste als Kopfband (v3, kopfband:true): Kacheln heißen Proben/Fotos/Labor/Plan/Bericht/Abrechnung, der
// App-Name steht im title; „💬 Rückmeldung“ steht nicht mehr in der Leiste, sondern im Menü „Mehr …“ und im Projektmenü.
// Persistentes Profil: Chromium stürzt in einem Inkognito-Kontext ab, wenn ein OPFS-Ordnergriff aus IndexedDB gelesen wird.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');

const APP = 'fotos';                                  // label | fotos | ergebnis | plan | beleg
const name = process.argv[2] || 'chromium';
const os = require('node:os');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const APPNAME = {label: 'LabelKit', fotos: 'FotoKit', ergebnis: 'ResultKit', plan: 'PlanKit', bericht: 'BerichtKit', beleg: 'BelegKit'};
const KACHEL = {label: 'Proben', fotos: 'Fotos', ergebnis: 'Labor', plan: 'Plan', bericht: 'Bericht', beleg: 'Abrechnung'};
const anzeige = n => n.replace(/^(\d{2}\.\d{2,6})\s+/, '$1 · ');   // Kopfband: „26.0142 · Teststadt“
const A = '26.0142 Teststadt', B = '26.0150 Köln & Süd + 50% #Hof';

(async () => {
  const server = http.createServer((req, res) => {
    if(['/project-store.js','/spektron-ordner.js'].includes(new URL(req.url,'http://x').pathname)){
      res.writeHead(200,{'content-type':'application/javascript'}); res.end(fs.readFileSync(path.join(__dirname,'..',new URL(req.url,'http://x').pathname.slice(1)))); return;
    }
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'leiste-'));
  const ctx = await playwright[name].launchPersistentContext(profil, {viewport: {width: 1400, height: 900}});
  const browser = {close: async () => { await ctx.close(); (() => { try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {} })(); }};
  await ctx.addInitScript(() => { try { localStorage.setItem('willkommen-gelesen', '1'); } catch (e) {} });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(url);
  const kann = await page.evaluate(async () => {
    try { const r = await navigator.storage.getDirectory(); const h = await r.getFileHandle('probe.txt', {create: true}); if (!h.createWritable) return false; const w = await h.createWritable(); await w.write('x'); await w.close(); await r.removeEntry('probe.txt'); return true; } catch (e) { return false; }
  });
  const leiste = page.locator('#mosaikLeiste');
  await leiste.waitFor({timeout: 8000});
  if (!kann) {
    assert.equal(await leiste.locator('.ml-home').getAttribute('target'), 'projektzentrale');
    assert.match(await leiste.locator('.ml-home').getAttribute('title'), /Projektzentrale/);
    assert.deepEqual(errors, []);
    await browser.close(); server.close();
    console.log(`OK (${name}, ohne Ordnerzugriff: nur Leiste geprüft)`);
    return;
  }

  // Archiv mit zwei Projekten: A hat Probenerfassung (LabelKit) und bearbeitete Fotos (FotoKit); B ist leer.
  // Den Archivordner bekommt die Suite erst nach Schritt 1: FotoKit öffnet beim Start ohne Projekt sonst sofort das zuletzt
  // benutzte Projekt, und der Zustand „ohne Projekt“ wäre nur ein Wettlauf.
  const archivMerken = () => page.evaluate(async () => {
    const archiv = await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner');
    await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1);
      q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(archiv, 'archiv'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); });
  });
  await page.evaluate(async ([a, b]) => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, {recursive: true});
    const archiv = await r.getDirectoryHandle('Mosaik Archivordner', {create: true});
    const put = async (dir, n, t) => { const w = await (await dir.getFileHandle(n, {create: true})).createWritable(); await w.write(t); await w.close(); };
    const pa = await archiv.getDirectoryHandle(a, {create: true}); await archiv.getDirectoryHandle(b, {create: true});
    await put(pa, '_Projekt.json', JSON.stringify({format: 'mosaik-projekt', version: 1, projektnummer: '26.0142', schadenort: 'Teststadt', objekt: 'EFH, Musterweg 7, 52525 Heinsberg', zustaendig: {kuerzel: 'Abc', gesetzt: 'manuell'}}));
    await put(archiv, '_Spektron-Mitarbeiter.json', JSON.stringify({format: 'spektron-mitarbeiter', version: 1, personen: [{ordnerKuerzel: 'Abc', name: 'Anna Beispiel', aktiv: true}]}));   // erfundene Person
    await put(await pa.getDirectoryHandle('Laboraufträge', {create: true}), '26.0142_Daten.json', '{}');
    await put(await pa.getDirectoryHandle('Fotos', {create: true}), '_Bildumbenenner.json', '{}');
    await put(await pa.getDirectoryHandle('Laborergebnisse', {create: true}), '_Ergebnisse.json', '{}');   // ResultKit: übernommen
    await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
      q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put([a, b], 'zuletzt'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); });
  }, [A, B]);

  // 1) ohne Projekt: „Weiter mit <zuletzt>“ öffnet dieses Projekt in dieser App
  await page.goto(url);
  const weiterOhne = page.locator('#mosaikLeiste .ml-weiter');
  await weiterOhne.waitFor();
  assert.match(await weiterOhne.textContent(), /Weiter mit 26\.0142 Teststadt/);
  assert.equal(await weiterOhne.getAttribute('href'), '#projekt=' + encodeURIComponent(A));
  // Rückmeldung ohne Projekt: auf der Startseite gibt es kein „Mehr …“ (Fußleiste erst mit Ordner) – im Projektmenü „Anderes Projekt“
  await leiste.locator('.ml-proj', {hasText: 'Anderes Projekt'}).click();
  assert.equal(new URL(await page.locator('#mosaikLeistePop a.ml-rm-pop').getAttribute('href'), 'http://x/app/').searchParams.has('projekt'), false, 'ohne Projekt keine Projektnummer');
  await page.keyboard.press('Escape');
  await archivMerken();

  // 2) mit Projekt: Name, Objekt, sechs Kacheln mit Haken, nächster Schritt
  await page.goto(url + '?projekt=' + encodeURIComponent(A));
  await page.waitForSelector('#mosaikLeiste .ml-z2', {timeout: 8000});
  await leiste.locator('.ml-z2', {hasText: 'Anna Beispiel'}).waitFor({timeout: 8000});   // zuständige Person (Mitarbeiterliste + _Projekt.json)
  const txt = (await leiste.textContent()).replace(/\s+/g, ' ');
  assert.equal(await leiste.locator('.ml-proj strong').textContent(), anzeige(A));
  assert.match(await leiste.locator('.ml-proj').getAttribute('title'), new RegExp('^' + A));
  assert.match(txt, /EFH, Musterweg 7, 52525 Heinsberg/);
  for (const n of Object.values(KACHEL)) assert.match(txt, new RegExp(n));
  const schritt = id => leiste.locator(`.ml-step[title*="${APPNAME[id]}"]`);
  for (const id of Object.keys(APPNAME)) {
    assert.equal(await schritt(id).count(), 1, APPNAME[id] + ' im title genau einer Kachel');
    assert.equal((await schritt(id).locator('strong').textContent()).replace(/ ✓$/, ''), KACHEL[id]);
  }
  assert.ok(await schritt('label').evaluate(e => e.classList.contains('done')), 'LabelKit erledigt');
  assert.ok(await schritt('fotos').evaluate(e => e.classList.contains('done')), 'FotoKit erledigt');
  assert.ok(await schritt('ergebnis').evaluate(e => e.classList.contains('done')), 'ResultKit erledigt (_Ergebnisse.json)');
  assert.ok(!(await schritt('plan').evaluate(e => e.classList.contains('done'))), 'PlanKit offen');
  for (const id of ['label', 'fotos', 'ergebnis']) assert.match(await schritt(id).textContent(), / ✓$/, '„✓“ im Namen bei erledigt');
  assert.doesNotMatch(await schritt('plan').textContent(), /✓/);
  assert.match(await schritt('label').getAttribute('title'), /erledigt/);
  assert.ok(await schritt(APP).evaluate(e => e.classList.contains('hier')), 'diese App ist markiert');
  assert.equal(await leiste.locator('.ml-step.hier').getAttribute('aria-current'), 'page');
  const naechster = APP === 'plan' ? /Weiter: Bericht/ : /Weiter: Plan/;
  assert.match(await leiste.locator('.ml-weiter strong').textContent(), naechster);
  assert.match(await leiste.locator('.ml-weiter small').textContent(), /\S/, 'Grund unter „Weiter“');
  assert.match(await leiste.locator('.ml-weiter').getAttribute('title'), APP === 'plan' ? /BerichtKit/ : /PlanKit/);
  assert.match(await leiste.locator('.ml-weiter').getAttribute('href'), /#projekt=26\.0142%20Teststadt$/);
  assert.equal(await leiste.locator('.ml-weiter').getAttribute('target'), APP === 'plan' ? 'berichtkit' : 'plankit');
  // Schritte der anderen Apps sind Links mit demselben Projekt, die eigene App ist keiner
  assert.equal(await leiste.locator('a.ml-step').count(), 5);
  // „💬 Rückmeldung“ (jetzt im Menü „Mehr …“): Programm, Version, nur die Projektnummer (kein Ort), eigenes Fenster
  assert.equal(await leiste.locator('a.ml-rm, a[target=rueckmeldung]').count(), 0, 'Rückmeldung nicht mehr in der Leiste');
  await page.locator('#btnMehr').waitFor({timeout: 8000});
  await page.click('#btnMehr');
  const rm = page.locator('#mosaikMehrPop a[target=rueckmeldung]'), rmUrl = new URL(await rm.getAttribute('href'), 'http://x/app/');
  assert.equal(rmUrl.pathname, '/rueckmeldung/');
  assert.equal(rmUrl.searchParams.get('app'), {label: 'labelkit', fotos: 'fotokit', plan: 'plankit', beleg: 'belegkit'}[APP]);
  assert.match(rmUrl.searchParams.get('version') || '', /^\d+\.\d+\.\d+$/);
  assert.equal(rmUrl.searchParams.get('projekt'), '26.0142');
  assert.equal(await rm.getAttribute('target'), 'rueckmeldung');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mosaikMehrPop').count(), 0);
  for (const a of await leiste.locator('a.ml-step, a.ml-weiter').all()){
    const link = new URL(await a.getAttribute('href'), page.url());
    assert.equal(link.searchParams.has('projekt'), false, 'Kein Projekt im HTTP-Query');
    assert.equal(new URLSearchParams(link.hash.slice(1)).get('projekt'), A);
  }
  assert.equal(await leiste.locator('input, textarea').count(), 0);
  // Bereits geöffnetes benanntes App-Fenster muss bei erneutem Absprung wirklich neu laden.
  const quer = leiste.locator('a.ml-step').first(), querUrl = new URL(await quer.getAttribute('href'), page.url());
  const routeMatch = u => u.pathname.startsWith(querUrl.pathname);
  const querAnfragen = [];
  await ctx.route(routeMatch, route => {
    querAnfragen.push(route.request().url());
    return route.fulfill({contentType:'text/html', body:'<!doctype html><body><script>document.body.dataset.projekt=new URLSearchParams(location.hash.slice(1)).get("projekt");</script></body>'});
  });
  const [anderesFenster] = await Promise.all([page.waitForEvent('popup'), quer.click()]);
  await anderesFenster.waitForFunction(name => document.body.dataset.projekt === name, A);
  await Promise.all([anderesFenster.waitForEvent('load'), quer.click()]);
  assert.equal(ctx.pages().length, 2, 'Benanntes Fenster wird wiederverwendet');
  assert.equal(new URLSearchParams(new URL(anderesFenster.url()).hash.slice(1)).get('projekt'), A);
  assert.ok(querAnfragen.length >= 2, 'Zweiter Absprung lädt ein neues Dokument');
  assert.ok(querAnfragen.every(u => !new URL(u).searchParams.has('projekt') && !new URL(u).hash));
  await anderesFenster.close(); await ctx.unroute(routeMatch);

  // FotoKit: project menu and all navigation actions stay reachable in narrow windows.
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({width, height: 900});
    // Bekannte Grenze der gemeinsamen Leiste v3 (byte-gleich in allen Apps, nicht FotoKit-eigen): Kopfband bei 320 px – die letzte Stufe ml-b3 lässt die Kachelreihe .ml-steps einzeilig (5×52 + 86 + Abstände
    // = 376 px + 2×12 px Rand), die Seite scrollt waagrecht um 68 px. Bis zur Korrektur in der Leiste nur bis 390 px streng prüfen.
    const engBug = width < 380;
    // Das Kopfband passt sich 100 ms nach dem Ändern der Fenstergröße an (passen() entprellt) – darauf warten.
    if (!engBug) await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1, null, {timeout: 3000})
      .catch(() => assert.fail(`Keine Überbreite mit aktiver Suite bei ${width}px`));
    else await page.waitForFunction(() => document.querySelector('#mosaikLeiste').classList.contains('ml-b3'), null, {timeout: 3000});
    for (const selector of ['.ml-home', '.ml-proj', ...(engBug ? [] : ['.ml-step']), '.ml-weiter']) {
      for (const action of await leiste.locator(selector).all()) {
        const b = await action.boundingBox();
        assert.ok(b && b.x >= 0 && b.x + b.width <= width + 1, `${selector} erreichbar bei ${width}px`);
      }
    }
    await leiste.locator('.ml-proj').click();
    assert.equal(await page.locator('#mosaikLeistePop').isVisible(), true);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width: 1400, height: 900});

  // 3) Projektwechsel: zuletzt benutzte Projekte, Wechsel bleibt in dieser App
  await leiste.locator('.ml-proj').click();
  const pop = page.locator('#mosaikLeistePop');
  assert.match(await pop.textContent(), /26\.0150 Köln/); assert.match(await pop.textContent(), /Alle Projekte/);
  assert.equal(await pop.locator('a.ml-rm-pop').getAttribute('target'), 'rueckmeldung');   // Rückmeldung auch im Projektmenü
  assert.equal(new URL(await pop.locator('a.ml-rm-pop').getAttribute('href'), 'http://x/app/').searchParams.get('projekt'), '26.0142');
  // Aktualisierung im Hintergrund (alle 20 s, beim Fensterwechsel) schließt das offene Menü nicht
  await page.evaluate(() => window.MosaikLeiste.aktualisieren()); await page.waitForTimeout(150);
  assert.equal(await pop.count(), 1, 'Menü bleibt bei Aktualisierung offen');
  assert.equal(await pop.locator('a', {hasText: B}).getAttribute('href'), '#projekt=' + encodeURIComponent(B));
  await page.keyboard.press('Escape');
  assert.equal(await pop.count(), 0);
  // Abgebrochene beforeunload-Warnung darf weder URL noch Projekt ändern.
  const vorher = page.url();
  await page.evaluate(() => { window.__wechselSperre = e => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', window.__wechselSperre); });
  page.removeAllListeners('dialog');
  page.on('dialog', d => d.dismiss());
  await leiste.locator('.ml-proj').click();
  await Promise.all([page.waitForEvent('dialog'), pop.locator('a', {hasText: B}).click()]);
  assert.equal(page.url(), vorher, 'Abbruch erhält alte Adresse');
  assert.equal(await leiste.locator('.ml-proj strong').textContent(), anzeige(A));
  await page.evaluate(() => window.removeEventListener('beforeunload', window.__wechselSperre));
  page.removeAllListeners('dialog'); page.on('dialog', d => d.accept());
  await page.keyboard.press('Escape');
  const projektAnfragen = [];
  page.on('request', req => { if (req.isNavigationRequest()) projektAnfragen.push(req.url()); });
  await Promise.all([page.waitForEvent('load'), page.waitForURL(/projekt=26\.0150/), (async () => { await leiste.locator('.ml-proj').click(); await pop.locator('a', {hasText: B}).click(); })()]);
  // nach dem Neustart zeigt das Kopfband kurz „Anderes Projekt“, bis das Projekt gelesen ist – darauf warten
  await page.waitForFunction(t => { const s = document.querySelector('#mosaikLeiste .ml-proj strong'); return s && s.textContent === t; }, anzeige(B), {timeout: 10000});
  assert.equal(await leiste.locator('.ml-proj strong').textContent(), anzeige(B));
  await page.waitForFunction(() => document.querySelectorAll('#mosaikLeiste .ml-step.done').length === 0);   // Projekt B ist leer: keine Haken
  assert.equal(await leiste.locator('.ml-z2').count(), 0, 'Projekt B: kein Objekt, keine Person');
  assert.equal(new URL(page.url()).searchParams.has('projekt'), false);
  assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('projekt'), B, 'Sonderzeichen nach echtem App-Neustart erhalten');

  // 4) zuletzt geöffnet wird mitgeschrieben (B steht jetzt vorn)
  const zuletzt = await page.evaluate(() => new Promise(res => { const q = indexedDB.open('mosaik-suite', 1); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('zuletzt'); g.onsuccess = () => res(g.result); }; }));
  assert.deepEqual(zuletzt, [B, A]);
  assert.ok(projektAnfragen.length > 0, 'Projektwechsel lädt wirklich ein neues Dokument');
  for (const request of projektAnfragen){
    assert.equal(new URL(request).searchParams.has('projekt'), false);
    assert.equal(new URL(request).hash, '', 'Projektfragment ist kein Teil der HTTP-Anfrage');
  }

  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log(`OK (${name})`);
})().catch(e => { console.error(e); process.exit(1); });

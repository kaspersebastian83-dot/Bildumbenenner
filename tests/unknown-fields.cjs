// Real FotoKit storage/merge functions; synthetic file handles only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const version = /const APP_VERSION = '([^']+)'/.exec(html)[1];
const copy = x => JSON.parse(JSON.stringify(x));
const fixture = () => ({ app: 'Bildumbenenner', format: 1, version: '1.8.2',
  extension: { enabled: false, amount: 0, empty: '', nested: [{ x: null, list: [true, 'ä', {}] }] },
  projekt: { objekt: 'ALT', extension: { future: [1, 2] } },
  benennung: { prefix: '', sort: 'manual', extension: { future: true } },
  reihenfolge: ['a.jpg', 'b.jpg'], bilder: {
    'a.jpg': { beschreibung: 'Alt', abschnitt: 'Raum', probe: 'P1', drehung: 90,
      futureFlag: false, nested: { arbitrary: [null, { answer: 42 }] },
      original: { name: 'original.jpg', extension: { camera: ['future'] } },
      sha256: { wert: 'alt', bytes: 7, geaendert: 12, extension: { verified: false } } },
    'b.jpg': { futureFlag: { nested: 'only unknown data' } }, 'empty.jpg': {} } });

function harness(input = fixture()) {
  const {disk,session,encode}=require('./n2-speichersicherheit.cjs');
  const d=disk(JSON.stringify(input)),s=session(d);
  return {...s,dir:d.dir,read:()=>d.json(),text:()=>d.text(),writes:()=>d.writes(),
    external:value=>d.files.set('_Bildumbenenner.json',encode(JSON.stringify(value))),
    fail:value=>Object.assign(d.fail,{path:'_Bildumbenenner.json',stage:value?'write':''})};
}

async function run() {
  let count = 0;
  async function test(title, fn) { await fn(); console.log('OK F6: ' + title); count++; }
  const preserve = (actual, expected = fixture()) => {
    assert.deepEqual(actual.extension, expected.extension);
    for (const n of ['a.jpg', 'b.jpg']) assert.deepEqual(actual.bilder[n].futureFlag, expected.bilder[n].futureFlag);
    assert.deepEqual(actual.bilder['a.jpg'].nested, expected.bilder['a.jpg'].nested);
    assert.deepEqual(actual.bilder['a.jpg'].original.extension, expected.bilder['a.jpg'].original.extension);
    assert.deepEqual(actual.bilder['a.jpg'].sha256.extension, expected.bilder['a.jpg'].sha256.extension);
    assert.deepEqual(actual.projekt.extension, expected.projekt.extension);
    assert.deepEqual(actual.benennung.extension, expected.benennung.extension);
  };
  await test('unveränderter Roundtrip, unbekannte/leere Bildeinträge und verschachtelte Metadaten', () => {
    const h = harness(); const before = fixture(), after = JSON.parse(h.projToJson(h.projFromJson(before)));
    preserve(after); assert.deepEqual(after.reihenfolge, before.reihenfolge); assert.deepEqual(after.bilder['empty.jpg'], {});
    assert.equal(after.bilder['a.jpg'].drehung, 90); assert.deepEqual(before, fixture(), 'Eingabe nicht verändert');
  });
  await test('bekanntes Feld ändern, tatsächlich schreiben und erneut laden', async () => {
    const h = harness(); await h.loadProject(h.dir); h.projSet('drafts', { 'a.jpg': 'NEU' });
    assert.equal(await h.flushProject(), true); preserve(h.read()); assert.equal(h.read().bilder['a.jpg'].beschreibung, 'NEU');
    await h.loadProject(h.dir); preserve(JSON.parse(h.projToJson()));
  });
  await test('bekannte Bildwerte löschen ohne unbekannte Werte zu löschen', () => {
    const h = harness(), d = h.projFromJson(fixture()); d.drafts = {}; d.rot = {}; d.extra = {}; d.orig = {}; d.hash = {};
    const out = JSON.parse(h.projToJson(d)); assert.equal(out.bilder['a.jpg'].beschreibung, undefined);
    assert.equal(out.bilder['a.jpg'].drehung, undefined); preserve(out);
  });
  await test('Einstellungen behalten unbekannte Felder', async () => {
    const h = harness(); await h.loadProject(h.dir); h.store.set('bu-settings', { prefix: 'NEU', sort: 'name' });
    assert.equal(await h.flushProject(), true); preserve(h.read()); assert.equal(h.read().benennung.prefix, 'NEU');
  });
  await test('fremde unbekannte Felder und lokale Beschriftung beim Speicherabgleich', async () => {
    const h = harness(); await h.loadProject(h.dir); h.projSet('drafts', { 'a.jpg': 'Lokal' });
    const theirs = fixture(); theirs.extension.nested.push('fremd'); theirs.bilder['a.jpg'].futureFlag = { changed: true }; h.external(theirs);
    assert.equal(await h.flushProject(), true); preserve(h.read(), theirs); assert.equal(h.read().bilder['a.jpg'].beschreibung, 'Lokal');
  });
  await test('Fokusabgleich und folgende Speicherung erhalten Erweiterungen', async () => {
    const h = harness(); await h.loadProject(h.dir); const theirs = fixture(); theirs.extension = ['NEU', { x: false }]; h.external(theirs);
    await h.checkExternal(); h.projSet('drafts', { 'a.jpg': 'Danach' }); assert.equal(await h.flushProject(), true); preserve(h.read(), theirs);
  });
  for (const variant of [{}, { version: '1.0.0' }, { version: '1.8.2', format: 1 }]) {
    await test('ältere gültige Datei: ' + JSON.stringify(variant), async () => {
      const old = fixture(); delete old.version; delete old.format; Object.assign(old, variant);
      const h = harness(old); await h.loadProject(h.dir); assert.equal(h.P.readOnly, false);
      h.projSet('drafts', { 'a.jpg': 'Altformat bearbeitet' }); assert.equal(await h.flushProject(), true); preserve(h.read());
    });
  }
  for (const variant of [{ version: '99.0.0' }, { format: 2 }, { version: '1.9.5-future' }, { version: 99 }]) {
    for (const route of ['load', 'save', 'focus']) await test('Schreibschutz ' + route + ': ' + JSON.stringify(variant), async () => {
      const h = harness(); if (route !== 'load') await h.loadProject(h.dir);
      const future = { ...fixture(), ...variant }; h.external(future); const before = h.text();
      if (route === 'load') await h.loadProject(h.dir);
      else if (route === 'focus') await h.checkExternal();
      else { h.projSet('drafts', { 'a.jpg': 'Niemals schreiben' }); assert.equal(await h.flushProject(), false); }
      assert.equal(h.P.readOnly, true); h.projSet('drafts', {}); await h.flushProject();
      assert.equal(h.text(), before); assert.equal(h.writes(), 0);
    });
  }
  for (const invalid of [null, [], { bilder: [] }, { bilder: { 'a.jpg': null } }, { bilder: { 'a.jpg': { original: [] } } }, { projekt: [] }]) {
    await test('beschädigte Struktur bleibt geschützt: ' + JSON.stringify(invalid), async () => {
      const h = harness(invalid); const before = h.text(); await h.loadProject(h.dir); assert.equal(h.P.readOnly, true);
      h.projSet('drafts', {}); await h.flushProject(); assert.equal(h.text(), before);
    });
  }
  await test('Schreibfehler und Retry verlieren keine Erweiterungen', async () => {
    const h = harness(); await h.loadProject(h.dir); const before = h.text(); h.fail(true); h.projSet('drafts', { 'a.jpg': 'Retry' });
    assert.equal(await h.flushProject(), false); assert.equal(h.text(), before); h.fail(false);
    assert.equal(await h.flushProject(), true); preserve(h.read()); assert.equal(h.read().bilder['a.jpg'].beschreibung, 'Retry');
  });
  await test('JSON-Schlüssel __proto__ bleiben als Daten erhalten, auch nach Abgleich', async () => {
    const original = fixture(); Object.defineProperty(original, '__proto__', { value: { opaque: true }, enumerable: true });
    const h = harness(original); await h.loadProject(h.dir); const theirs = copy(original); theirs.__proto__.opaque = ['fremd']; h.external(theirs);
    h.projSet('drafts', { 'a.jpg': 'Lokal' }); await h.flushProject(); assert.deepEqual(h.read().__proto__, { opaque: ['fremd'] });
  });
  console.log(`F6: ${count} Regressionstests bestanden`);
}
module.exports = { fixture };
if (require.main === module) run().catch(e => { console.error(e); process.exitCode = 1; });

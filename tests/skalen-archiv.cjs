// Gemeinsame Bewertungsskalen im Archivordner (_Spektron-Skalen.json): Abgleich, erstes Teilen, Löschen anderer,
// Änderungen ohne Recht bleiben erhalten, kaputte Datei wird nie überschrieben. Node, synthetische Daten.
// Der Block zwischen SPEKTRON-SKALEN und SPEKTRON-SKALEN-ENDE ist wörtlich gleich in PlanKit (src/skalen-archiv.js).
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('/* SPEKTRON-SKALEN v1'), b = html.indexOf('/* SPEKTRON-SKALEN-ENDE */');
assert.ok(a > 0 && b > a, 'Block SPEKTRON-SKALEN in index.html');
const code = html.slice(a, b);

function welt({ archiv = true, lesen = 'granted', schreiben = 'granted', datei, lokal, merker, offen } = {}){
  const files = new Map(), ls = new Map(), log = { geschrieben: 0, gefragt: 0 };
  if (datei !== undefined) files.set('_Spektron-Skalen.json', typeof datei === 'string' ? datei : JSON.stringify(datei));
  if (lokal) ls.set('bu-scales', JSON.stringify(lokal));
  if (merker) ls.set('bu-scales-geteilt', '1');
  if (offen) ls.set('bu-scales-offen', JSON.stringify(offen));
  const perm = { read: lesen, readwrite: schreiben };
  const dir = {
    async queryPermission({ mode }){ return perm[mode]; },
    async requestPermission({ mode }){ log.gefragt++; return perm[mode] === 'prompt' ? (perm[mode] = 'granted') : perm[mode]; },
    async getFileHandle(name, o = {}){
      if (!files.has(name) && !o.create){ const e = new Error('fehlt'); e.name = 'NotFoundError'; throw e; }
      if (o.create && !files.has(name)) files.set(name, '');   // wie der Browser: „create“ legt sofort eine leere Datei an
      return { async getFile(){ const t = files.get(name) ?? ''; return { async text(){ return t; } }; },
        async createWritable(){ const o = log.beimOeffnen; log.beimOeffnen = null; if (o) await o(); let buf = ''; return { async write(x){ buf += x; }, async close(){ const f = log.beimSchreiben; log.beimSchreiben = null; if (f) await f(); files.set(name, buf); log.geschrieben++; } }; } };
    }
  };
  const idb = { open(){ const r = {}; setTimeout(() => { r.result = { close(){}, transaction(){ return { objectStore(){ return { get(){ const q = {}; setTimeout(() => { q.result = archiv ? dir : undefined; q.onsuccess(); }); return q; } }; } }; } }; r.onsuccess(); }); return r; } };
  const ctx = { indexedDB: idb, setTimeout, clearTimeout, Promise, JSON, Object, Array, Error,
    localStorage: { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)) } };
  vm.runInNewContext(code + '\nthis.api = { skalenAbgleich, skalaTeilen };', ctx);
  return { ...ctx.api, lokal: () => JSON.parse(ls.get('bu-scales') || '{}'), offen: () => JSON.parse(ls.get('bu-scales-offen') || '{}'),
    merker: () => ls.get('bu-scales-geteilt'), datei: () => files.has('_Spektron-Skalen.json') ? JSON.parse(files.get('_Spektron-Skalen.json')) : null,
    roh: () => files.get('_Spektron-Skalen.json'), setDatei: v => files.set('_Spektron-Skalen.json', JSON.stringify(v)), setLokal: v => ls.set('bu-scales', JSON.stringify(v)), log, perm };
}
const S = (name, ...ab) => ({ name, cats: [{ name: 'gering', from: 0 }, ...ab.map((from, i) => ({ name: 'Stufe ' + (i + 2), from }))] });
const MKW = 'Kohlenwasserstoffe C10-C40|mg/kg TS', PCB = 'PCB|mg/kg', BAP = 'Benzo[a]pyren|µg/m²';
const plain = x => JSON.parse(JSON.stringify(x));
let n = 0; const check = async (name, fn) => { await fn(); n++; console.log('OK Skalen: ' + name); };

(async () => {
  await check('ohne Archivordner bleibt alles lokal', async () => {
    const w = welt({ archiv: false, lokal: { [MKW]: S('MKW', 1000) } });
    assert.equal(await w.skalenAbgleich(), 'lokal'); assert.deepEqual(Object.keys(w.lokal()), [MKW]);
    assert.equal(await w.skalaTeilen(PCB, S('PCB', 5)), false, 'ohne Archiv nicht geteilt'); assert.deepEqual(plain(w.offen()), { [PCB]: 1 }, 'als offen gemerkt');
  });
  await check('erster Abgleich lädt eigene Skalen hoch (Datei fehlt noch)', async () => {
    const w = welt({ lokal: { [MKW]: S('MKW', 1000, 5000) } });
    assert.equal(await w.skalenAbgleich(), 'datei');
    const d = w.datei(); assert.equal(d.format, 'spektron-skalen'); assert.equal(d.version, 1); assert.deepEqual(Object.keys(d.skalen), [MKW]);
    assert.equal(w.merker(), '1'); assert.deepEqual(plain(w.offen()), {});
  });
  await check('Kollege mit leerem Browser bekommt die Skalen der Datei, schreibt nichts', async () => {
    const w = welt({ datei: { format: 'spektron-skalen', version: 1, skalen: { [MKW]: S('MKW', 1000), [PCB]: S('PCB', 5) } } });
    assert.equal(await w.skalenAbgleich(), 'datei'); assert.deepEqual(Object.keys(w.lokal()).sort(), [MKW, PCB].sort());
    assert.equal(w.log.geschrieben, 0); assert.equal(w.merker(), '1');
  });
  await check('nach dem ersten Abgleich gilt die Datei – auch Löschungen anderer', async () => {
    const w = welt({ merker: true, lokal: { [MKW]: S('MKW', 1000), [PCB]: S('PCB alt', 5) }, datei: { format: 'spektron-skalen', version: 1, skalen: { [PCB]: S('PCB neu', 10) } } });
    await w.skalenAbgleich(); assert.deepEqual(Object.keys(w.lokal()), [PCB], 'MKW wurde im Büro gelöscht'); assert.equal(w.lokal()[PCB].name, 'PCB neu');
    assert.equal(w.log.geschrieben, 0);
  });
  await check('Ändern schreibt nur diese Skala, Änderungen anderer bleiben', async () => {
    const w = welt({ merker: true, datei: { format: 'spektron-skalen', version: 1, skalen: { [MKW]: S('MKW', 1000) }, extra: 'bleibt' } });
    await w.skalenAbgleich();
    const l = w.lokal(); l[PCB] = S('PCB', 5); w.setLokal(l);
    // währenddessen ändert jemand anderes MKW in der Datei
    const d0 = w.datei(); d0.skalen[MKW] = S('MKW von Kollegin', 800); w.setDatei(d0);
    assert.equal(await w.skalaTeilen(PCB, l[PCB]), true);
    const d = w.datei(); assert.equal(d.extra, 'bleibt', 'unbekannte Felder bleiben'); assert.deepEqual(Object.keys(d.skalen).sort(), [MKW, PCB].sort());
    assert.equal(d.skalen[MKW].name, 'MKW von Kollegin', 'fremde Änderung nicht überschrieben'); assert.equal(w.lokal()[MKW].name, 'MKW von Kollegin');
    assert.deepEqual(plain(w.offen()), {});
  });
  await check('Löschen wirkt in der Datei', async () => {
    const w = welt({ merker: true, datei: { format: 'spektron-skalen', version: 1, skalen: { [MKW]: S('MKW', 1000), [PCB]: S('PCB', 5) } } });
    await w.skalenAbgleich(); const l = w.lokal(); delete l[PCB]; w.setLokal(l);
    assert.equal(await w.skalaTeilen(PCB, null), true); assert.deepEqual(Object.keys(w.datei().skalen), [MKW]);
  });
  await check('ohne Schreibrecht: Änderung bleibt lokal und offen, wird beim nächsten Abgleich mit Recht nachgereicht', async () => {
    const w = welt({ merker: true, schreiben: 'denied', datei: { format: 'spektron-skalen', version: 1, skalen: { [MKW]: S('MKW', 1000) } } });
    await w.skalenAbgleich(); const l = w.lokal(); l[BAP] = S('BaP', 2); w.setLokal(l);
    assert.equal(await w.skalaTeilen(BAP, l[BAP]), false); assert.deepEqual(plain(w.offen()), { [BAP]: 1 });
    await w.skalenAbgleich(); assert.ok(w.lokal()[BAP], 'eigene Änderung nicht durch die Datei überschrieben');
    assert.deepEqual(Object.keys(w.datei().skalen), [MKW], 'Datei unverändert');
    w.perm.readwrite = 'granted'; await w.skalenAbgleich();
    assert.deepEqual(Object.keys(w.datei().skalen).sort(), [BAP, MKW].sort()); assert.deepEqual(plain(w.offen()), {});
  });
  await check('Schreibrecht wird nur beim Teilen (nach Klick) erfragt, nie beim Öffnen', async () => {
    const w = welt({ schreiben: 'prompt', lokal: { [MKW]: S('MKW', 1000) } });
    assert.equal(await w.skalenAbgleich(), 'lokal'); assert.equal(w.log.gefragt, 0, 'Öffnen fragt nicht');
    const l = w.lokal(); l[PCB] = S('PCB', 5); w.setLokal(l);
    assert.equal(await w.skalaTeilen(PCB, l[PCB]), true); assert.equal(w.log.gefragt, 1);
    assert.deepEqual(Object.keys(w.datei().skalen).sort(), [MKW, PCB].sort(), 'beim ersten Teilen auch die übrigen eigenen Skalen');
  });
  await check('kaputte oder fremde Datei wird nie überschrieben, Arbeitskopie bleibt', async () => {
    for (const datei of ['{kaputt', JSON.stringify({ format: 'anderes', skalen: {} })]){
      const w = welt({ lokal: { [MKW]: S('MKW', 1000) }, datei });
      assert.equal(await w.skalenAbgleich(), 'lokal'); assert.deepEqual(Object.keys(w.lokal()), [MKW]);
      assert.equal(await w.skalaTeilen(MKW, w.lokal()[MKW]), false); assert.equal(w.roh(), datei, 'Datei unverändert');
    }
  });
  await check('mehrere schnelle Änderungen = eine Schreiboperation', async () => {
    const w = welt({ merker: true, datei: { format: 'spektron-skalen', version: 1, skalen: {} } });
    await w.skalenAbgleich(); const l = {}; const ps = [];
    for (const [k, s] of [[MKW, S('MKW', 1000)], [PCB, S('PCB', 5)], [BAP, S('BaP', 2)]]){ l[k] = s; w.setLokal(l); ps.push(w.skalaTeilen(k, s)); }
    assert.deepEqual(await Promise.all(ps), [true, true, true]); assert.equal(w.log.geschrieben, 1); assert.equal(Object.keys(w.datei().skalen).length, 3);
  });
  await check('Änderung während des Schreibens bleibt lokal erhalten und wird nachgereicht (Review 1.38.0)', async () => {
    const w = welt({ merker: true, datei: { format: 'spektron-skalen', version: 1, skalen: { [MKW]: S('MKW', 1000), [PCB]: S('PCB alt', 5) } } });
    await w.skalenAbgleich(); const setze = (k, s) => { const l = w.lokal(); l[k] = s; w.setLokal(l); return w.skalaTeilen(k, s); };
    let spaeter; w.log.beimSchreiben = async () => { spaeter = setze(PCB, S('PCB neu', 10)); };   // PCB wird geändert, während MKW geschrieben wird
    assert.equal(await setze(MKW, S('MKW neu', 800)), true);
    assert.equal(w.lokal()[PCB].name, 'PCB neu', 'Arbeitskopie nicht mit dem alten Stand überschrieben'); assert.deepEqual(plain(w.offen()), { [PCB]: 1 }, 'PCB bleibt offen');
    assert.equal(w.lokal()[MKW].name, 'MKW neu');
    assert.equal(await spaeter, true); assert.equal(w.datei().skalen[PCB].name, 'PCB neu'); assert.equal(w.datei().skalen[MKW].name, 'MKW neu'); assert.deepEqual(plain(w.offen()), {});
  });
  await check('Kollege teilt gleichzeitig: nichts überschrieben, eigene Skala bleibt offen und geht beim nächsten Mal mit (Audit F12)', async () => {
    const w = welt({ merker: true, datei: { format: 'spektron-skalen', version: 1, skalen: {} } });
    await w.skalenAbgleich(); const l = w.lokal(); l[MKW] = S('MKW', 1000); w.setLokal(l);
    w.log.beimOeffnen = async () => { w.setDatei({ format: 'spektron-skalen', version: 1, skalen: { [PCB]: S('PCB Kollege', 5) } }); };
    assert.equal(await w.skalaTeilen(MKW, l[MKW]), false, 'nicht als geteilt gemeldet');
    assert.deepEqual(Object.keys(w.datei().skalen), [PCB], 'Skala des Kollegen bleibt'); assert.deepEqual(plain(w.offen()), { [MKW]: 1 }, 'eigene bleibt offen');
    assert.equal(await w.skalaTeilen(MKW, w.lokal()[MKW]), true, 'zweiter Versuch');
    assert.deepEqual(Object.keys(w.datei().skalen).sort(), [MKW, PCB].sort(), 'jetzt beide'); assert.deepEqual(plain(w.offen()), {});
  });
  await check('leere Datei (abgebrochenes erstes Anlegen) gilt als „noch keine Skalen“', async () => {
    const w = welt({ lokal: { [MKW]: S('MKW', 1000) }, datei: '' });
    assert.equal(await w.skalenAbgleich(), 'datei'); assert.deepEqual(Object.keys(w.datei().skalen), [MKW]);
  });
  console.log(`${n} Prüfungen gemeinsame Skalen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });

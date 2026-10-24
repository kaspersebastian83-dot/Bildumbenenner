// Bohrkern-IDs auf Fotos → Probe-Nr. aus der LabelKit-Projektdatei (Ergebnistabelle). node tests/bohrkern-fotos.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('const normProbe = '), b = html.indexOf('const BK = { map:');
assert.ok(a > 0 && b > a, 'Block normProbe … fotoProben in index.html');
const ctx = {};
vm.runInNewContext(html.slice(a, b) + '\nthis.bohrkernNummern = bohrkernNummern; this.fotoProben = fotoProben;', ctx);
const { bohrkernNummern, fotoProben } = ctx;
const P = x => JSON.parse(JSON.stringify(x));

const seg = (nr, t, extra) => Object.assign({ id: 100 + nr, _nr: nr, matrix: 'Bohrkern', bkBez: 'EG-WZ-B-7', bkId: `EG-WZ-B-7-T${t}`, bkStatus: 'A', notiz: 'MKW' }, extra);
const daten = { proben: [{ _nr: 1, matrix: 'Wischprobe' }], sonstigeProben: [
  seg(2, 1), seg(3, 2), seg(4, 3, { bkStatus: 'R', notiz: 'Rückstellprobe – nicht analysieren' }),
  seg(5, 1, { bkBez: 'EG-WZ-B-7a', bkId: 'EG-WZ-B-7a-T1' }),
  { _nr: 6, matrix: 'Bohrkern', bkId: '1OG-KZ2-A-3-T1' },            // ohne bkBez: Kern aus der Segment-ID
  { _nr: 7, matrix: 'Feststoff', bkBez: 'EG-WZ-B-7', notiz: 'PAK' } ] };   // keine Bohrkernprobe
const bk = bohrkernNummern(daten);

assert.deepEqual(P(fotoProben('EG-WZ-B-7', bk)), ['P2', 'P3'], 'Kern-ID → alle analysierten Segmente, ohne Rückstellprobe');
assert.deepEqual(P(fotoProben('eg-wz-b-7-t2', bk)), ['P3'], 'Segment-ID, Groß/Klein egal');
assert.deepEqual(P(fotoProben('EG-WZ-B-7-T3', bk)), ['EG-WZ-B-7-T3'], 'Rückstellprobe bleibt unaufgelöst');
assert.deepEqual(P(fotoProben('EG-WZ-B-7a', bk)), ['P5'], 'zweiter Kern am Punkt (a) getrennt');
assert.deepEqual(P(fotoProben('1OG-KZ2-A-3', bk)), ['P6']);
assert.deepEqual(P(fotoProben('P1, EG-WZ-B-7; Probe 3', bk)), ['P1', 'P2', 'P3'], 'gemischt, ohne Doppelte');
assert.deepEqual(P(fotoProben('EG-XX-A-1', bk)), ['EG-XX-A-1'], 'unbekannte ID bleibt wie geschrieben');
assert.deepEqual(P(fotoProben('EG-WZ-B-7', new Map())), ['EG-WZ-B-7'], 'ohne LabelKit-Datei keine Zuordnung');
assert.deepEqual(P(fotoProben('P 3a', bk)), ['P3a'], 'bisherige Probe-Nr. unverändert');
assert.equal(bohrkernNummern(null).size, 0);
assert.equal(bohrkernNummern({ sonstigeProben: [null, 5, { matrix: 'Bohrkern', bkBez: 'X' }] }).size, 0, 'ohne Nummer keine Zuordnung');
// Die Ergebnistabelle nutzt diese Zuordnung
assert.ok(/function photoNumbers\(\)[\s\S]{0,200}fotoProben\(it\.probe, BK\.map\)/.test(html));
console.log('OK Bohrkern-Fotos: Kern-ID, Segment-ID, Rückstellprobe, gemischt, unbekannt');

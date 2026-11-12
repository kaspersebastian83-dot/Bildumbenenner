// HEIC → JPG (FotoKit 2.3.0, Plan E4/E5/E8) ohne Browser: echter Decoder (vendor/libheif-bundle.js, unverändert) mit dem
// künstlichen Testbild tests/fixtures/testbild.heic (tools/heic-testbild.py, kein Kundenfoto). Geprüft: Datei unverändert,
// Maße und Drehung nach dem Dekodieren, EXIF (Datum, Gerät, GPS) vollständig übernommen, Orientation = 1, Farbprofil mit.
// Das eigentliche JPEG-Kodieren macht der Browser – das prüft tests/heic-umwandeln-browser.cjs.
// node tests/heic-umwandeln.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const H = require('../heic-worker.js');
const root = path.join(__dirname, '..');
const heic = fs.readFileSync(path.join(__dirname, 'fixtures', 'testbild.heic'));
let n = 0; const ok = t => { n++; console.log('OK HEIC: ' + t); };

// --- kleine TIFF/JPEG-Leser für die Prüfung (unabhängig vom Code unter Test) ---
function tiffLesen(t) {
  const v = new DataView(t.buffer, t.byteOffset, t.byteLength), le = t[0] === 0x49;
  const ifd = o => { const k = v.getUint16(o, le), m = new Map(); for (let i = 0; i < k; i++) { const e = o + 2 + i * 12; m.set(v.getUint16(e, le), { typ: v.getUint16(e + 2, le), anz: v.getUint32(e + 4, le), wert: e + 8 }); } return m; };
  const str = x => { const o = x.anz > 4 ? v.getUint32(x.wert, le) : x.wert; return Buffer.from(t.subarray(o, o + x.anz - 1)).toString('latin1'); };
  const i0 = ifd(v.getUint32(4, le)), ex = i0.has(0x8769) ? ifd(v.getUint32(i0.get(0x8769).wert, le)) : new Map();
  const gps = i0.has(0x8825) ? ifd(v.getUint32(i0.get(0x8825).wert, le)) : new Map();
  return { orientierung: i0.has(0x0112) ? v.getUint16(i0.get(0x0112).wert, le) : null, hersteller: i0.has(0x010f) ? str(i0.get(0x010f)) : '',
    modell: i0.has(0x0110) ? str(i0.get(0x0110)) : '', aufnahme: ex.has(0x9003) ? str(ex.get(0x9003)) : '', gps: [...gps.keys()].sort((a, b) => a - b) };
}
function jpegSegmente(j) {
  const out = []; let o = 2;
  assert.equal(j[0] === 0xff && j[1] === 0xd8, true, 'SOI');
  while (o < j.length && j[o] === 0xff) {
    const mk = j[o + 1]; if (mk === 0xda) { out.push({ mk, rest: j.subarray(o) }); break; }
    const len = j.readUInt16BE(o + 2); out.push({ mk, daten: j.subarray(o + 4, o + 2 + len) }); o += 2 + len;
  }
  return out;
}
/** Minimales „JPEG“ wie vom Browser: SOI, JFIF, SOF0 mit Maßen, SOS-Rest, EOI (Pixel egal – geprüft wird der Zusammenbau). */
function jpegAttrappe(breite, hoehe, extra = []) {
  const seg = (mk, d) => Buffer.concat([Buffer.from([0xff, mk, (d.length + 2) >> 8, (d.length + 2) & 255]), Buffer.from(d)]);
  const sof = [8, hoehe >> 8, hoehe & 255, breite >> 8, breite & 255, 1, 1, 0x11, 0];
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, [...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...extra.map(([m, d]) => seg(m, d)),
    seg(0xc0, sof), Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9])]));
}

(async () => {
  // 1. Decoder unverändert (E8)
  const bundle = fs.readFileSync(path.join(root, 'vendor', 'libheif-bundle.js'));
  assert.equal(crypto.createHash('sha256').update(bundle).digest('hex'), '074b2b55ef3de477ba9f794ca381f3f0324c1cba8c91b4af07395f39c22d54cc', 'vendor/libheif-bundle.js ist nicht mehr die Datei aus libheif-js 1.23.5');
  for (const f of ['LICENSE', 'LICENSE-libheif-js', 'README.md']) assert.ok(fs.existsSync(path.join(root, 'vendor', f)), 'vendor/' + f);
  assert.equal(H.DECODER, 'libheif-js 1.23.5');
  ok('vendor/libheif-bundle.js bytegleich mit libheif-js 1.23.5, Lizenzen daneben');

  // 2. Metadaten aus dem HEIF-Container
  const meta = H.heifMetadaten(heic);
  const vorher = tiffLesen(meta.exif);
  assert.deepEqual({ ...vorher, gps: vorher.gps.length > 0 }, { orientierung: 6, hersteller: 'FotoKit-Test', modell: 'Kunstbild 1', aufnahme: '2026:11:03 10:42:17', gps: true });
  assert.ok(meta.icc && meta.icc.length > 128 && Buffer.from(meta.icc.subarray(36, 40)).toString() === 'acsp', 'Farbprofil (ICC) des Hauptbilds');
  assert.throws(() => H.heifMetadaten(new Uint8Array(jpegAttrappe(4, 4))), /Keine HEIF-Datei/);
  ok('EXIF (Datum, Gerät, GPS, Ausrichtung 6) und Farbprofil aus dem HEIF-Container gelesen');

  // 3. Dekodieren: Drehung aus dem Container angewendet (128 × 96 quer gespeichert → 96 × 128 hochkant)
  const bild = await H.dekodieren(heic);
  assert.deepEqual([bild.breite, bild.hoehe], [96, 128]);
  const px = (x, y) => [...bild.rgba.subarray((y * bild.breite + x) * 4, (y * bild.breite + x) * 4 + 3)];
  const nahe = (a, b) => a.every((x, i) => Math.abs(x - b[i]) <= 12);
  const ecken = { oL: px(4, 4), oR: px(91, 4), uL: px(4, 123), uR: px(91, 123) };
  assert.ok(nahe(ecken.oL, [30, 30, 220]) && nahe(ecken.oR, [220, 30, 30]) && nahe(ecken.uR, [30, 200, 30]) && nahe(ecken.uL, [240, 240, 240]), 'Farbfelder nach Drehung: ' + JSON.stringify(ecken));
  ok('dekodiert 96 × 128, Drehung eingebacken (Farbfelder an der richtigen Ecke)');

  // 4. Orientation auf 1, sonst bytegleich
  const o = H.orientierungEins(meta.exif);
  assert.equal(o.vorher, 6); assert.equal(tiffLesen(o.tiff).orientierung, 1);
  assert.equal([...o.tiff].filter((b, i) => b !== meta.exif[i]).length, 1, 'nur das Orientation-Byte ändert sich');
  assert.equal(tiffLesen(meta.exif).orientierung, 6, 'Original-Block bleibt unverändert');
  ok('Orientation 6 → 1, übriger EXIF-Block bytegleich');

  // 5. Umwandeln mit Attrappe statt Browser-Kodierer: Reihenfolge, EXIF vollständig, ICC, Maße
  let gesehen = null;
  const r = await H.umwandeln(heic, { kodieren: async (rgba, b, h, q) => { gesehen = { b, h, q, n: rgba.length }; return jpegAttrappe(b, h); } });
  assert.deepEqual(gesehen, { b: 96, h: 128, q: 0.92, n: 96 * 128 * 4 });
  assert.deepEqual({ b: r.breite, h: r.hoehe, exif: r.exif, icc: r.icc, vorher: r.orientierungVorher, decoder: r.decoder, q: r.qualitaet },
    { b: 96, h: 128, exif: true, icc: meta.icc.length, vorher: 6, decoder: 'libheif-js 1.23.5', q: 92 });
  const segs = jpegSegmente(Buffer.from(r.jpeg));
  assert.deepEqual(segs.map(s => s.mk.toString(16)), ['e0', 'e1', 'e2', 'c0', 'da'], 'JFIF, EXIF, ICC vor den Bilddaten');
  const ex = segs[1].daten; assert.equal(Buffer.from(ex.subarray(0, 6)).toString('latin1'), 'Exif\0\0');
  const nachher = tiffLesen(ex.subarray(6));
  assert.deepEqual(nachher, { ...vorher, orientierung: 1 }, 'EXIF vollständig übernommen, nur Orientation = 1');
  assert.equal(Buffer.compare(Buffer.from(ex.subarray(6)), Buffer.from(o.tiff)), 0);
  const icc = segs[2].daten; assert.equal(Buffer.from(icc.subarray(0, 12)).toString('latin1'), 'ICC_PROFILE\0'); assert.deepEqual([icc[12], icc[13]], [1, 1]);
  assert.equal(Buffer.compare(Buffer.from(icc.subarray(14)), Buffer.from(meta.icc)), 0);
  assert.deepEqual([segs[3].daten.readUInt16BE(1), segs[3].daten.readUInt16BE(3)], [128, 96], 'SOF: Höhe 128, Breite 96');
  ok('JPG zusammengesetzt: EXIF (Datum, Gerät, GPS) mit Orientation 1, Farbprofil, Maße 96 × 128');

  // 6. Zusammenbau-Grenzen: großes Profil in Stücken, vorhandenes EXIF/ICC ersetzt, zu großes EXIF abgelehnt
  const gross = crypto.randomBytes(150000);
  const mitAlt = jpegAttrappe(8, 8, [[0xe1, [...Buffer.from('Exif\0\0'), 1, 2, 3]], [0xe2, [...Buffer.from('ICC_PROFILE\0'), 1, 1, 9]], [0xed, [1, 2, 3]]]);
  const s2 = jpegSegmente(Buffer.from(H.jpegMitMetadaten(mitAlt, o.tiff, gross)));
  assert.deepEqual(s2.map(s => s.mk.toString(16)), ['e0', 'e1', 'e2', 'e2', 'e2', 'ed', 'c0', 'da']);
  assert.equal(Buffer.compare(Buffer.concat(s2.slice(2, 5).map(s => { assert.equal(s.daten[13], 3); return Buffer.from(s.daten.subarray(14)); })), gross), 0, 'ICC in 3 Stücken, wieder zusammengesetzt gleich');
  assert.throws(() => H.jpegMitMetadaten(mitAlt, new Uint8Array(70000), null), /zu groß/);
  ok('Farbprofil > 64 KB in Stücken, altes EXIF/ICC ersetzt, übrige Segmente bleiben, zu großes EXIF wird abgelehnt');

  console.log(`HEIC: ${n} Prüfungen bestanden`);
})().catch(e => { console.error(e); process.exit(1); });

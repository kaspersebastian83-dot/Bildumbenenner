/* FotoKit – iPhone-Fotos (HEIC/HEIF) in ein echtes JPG umwandeln (2.3.0, Plan „fotokit-heic-plan“ E4/E5/E8)
   Läuft als Web Worker (new Worker('heic-worker.js')), damit die Oberfläche beim Dekodieren nicht einfriert – und weil die
   Sicherheitsregel von index.html (CSP ohne 'wasm-unsafe-eval') WebAssembly im Fenster selbst nicht zulässt.
   In Node (tests/heic-umwandeln.cjs) liefert require() dieselben Funktionen.

   Ablauf je Foto: HEIF-Container lesen (EXIF-Block, Farbprofil des Hauptbilds) → mit libheif dekodieren (die Drehung aus
   dem Container – irot/imir – wendet libheif selbst an) → JPEG 92 %, volle Auflösung → EXIF unverändert übernehmen, nur
   „Orientation“ auf 1 (die Drehung ist eingebacken) → Farbprofil (z. B. Display P3) als ICC_PROFILE mitgeben.
   Das HEIC selbst wird nie verändert; Dateien schreibt nur index.html. */
(function (root) {
  'use strict';
  const DECODER = 'libheif-js 1.23.5';
  const DECODER_DATEI = 'vendor/libheif-bundle.js';
  const QUALITAET = 0.92;

  /* ---------- HEIF-Container (ISO-BMFF) ---------- */
  const fourcc = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  function boxen(u8, start, end) {
    const out = [], v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = start;
    while (o + 8 <= end) {
      let size = v.getUint32(o), kopf = 8;
      const type = fourcc(u8, o + 4);
      if (size === 1) { if (o + 16 > end) break; size = Number(v.getBigUint64(o + 8)); kopf = 16; }
      else if (size === 0) size = end - o;
      if (size < kopf || o + size > end) break;
      out.push({ type, start: o + kopf, end: o + size });
      o += size;
    }
    return out;
  }
  const kind = (liste, type) => liste.find(b => b.type === type);
  function lesen(u8) {
    const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    return {
      u8: o => u8[o], u16: o => v.getUint16(o), u32: o => v.getUint32(o),
      n: (o, bytes) => bytes === 0 ? 0 : bytes === 2 ? v.getUint16(o) : bytes === 4 ? v.getUint32(o) : bytes === 8 ? Number(v.getBigUint64(o)) : NaN
    };
  }
  /** EXIF-Block (TIFF ab „II*\0“/„MM\0*“) und rohes Farbprofil (ICC) des Hauptbilds; beides null, wenn nicht vorhanden. */
  function heifMetadaten(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), r = lesen(u8);
    const oben = boxen(u8, 0, u8.length), ftyp = kind(oben, 'ftyp'), meta = kind(oben, 'meta');
    if (!ftyp || !meta) throw new Error('Keine HEIF-Datei (ftyp/meta fehlt)');
    const m = boxen(u8, meta.start + 4, meta.end);   // meta ist eine FullBox
    let primaer = null;
    const pitm = kind(m, 'pitm');
    if (pitm) primaer = u8[pitm.start] === 0 ? r.u16(pitm.start + 4) : r.u32(pitm.start + 4);
    // Einträge (infe): Typ je item_ID
    const typen = new Map(), iinf = kind(m, 'iinf');
    if (iinf) {
      const ver = u8[iinf.start], erst = iinf.start + 4 + (ver === 0 ? 2 : 4);
      for (const b of boxen(u8, erst, iinf.end)) {
        if (b.type !== 'infe') continue;
        const iv = u8[b.start];
        if (iv < 2) continue;
        const id = iv === 2 ? r.u16(b.start + 4) : r.u32(b.start + 4), p = b.start + 4 + (iv === 2 ? 2 : 4) + 2;
        typen.set(id, fourcc(u8, p));
      }
    }
    // Lage der Daten (iloc), ggf. in idat
    const lage = new Map(), iloc = kind(m, 'iloc'), idat = kind(m, 'idat');
    if (iloc) {
      const ver = u8[iloc.start]; let o = iloc.start + 4;
      const offS = u8[o] >> 4, lenS = u8[o] & 15, baseS = u8[o + 1] >> 4, idxS = ver >= 1 ? u8[o + 1] & 15 : 0; o += 2;
      const anzahl = ver < 2 ? r.u16(o) : r.u32(o); o += ver < 2 ? 2 : 4;
      for (let i = 0; i < anzahl; i++) {
        const id = ver < 2 ? r.u16(o) : r.u32(o); o += ver < 2 ? 2 : 4;
        let methode = 0; if (ver >= 1) { methode = r.u16(o) & 15; o += 2; }
        o += 2;   // data_reference_index
        const basis = r.n(o, baseS); o += baseS;
        const n = r.u16(o); o += 2; const teile = [];
        for (let k = 0; k < n; k++) {
          if (ver >= 1 && idxS) o += idxS;
          const off = r.n(o, offS); o += offS; const len = r.n(o, lenS); o += lenS;
          teile.push({ off: basis + off, len });
        }
        lage.set(id, { methode, teile });
      }
    }
    const daten = id => {
      const l = lage.get(id); if (!l) return null;
      const basis = l.methode === 1 ? (idat ? idat.start : NaN) : l.methode === 0 ? 0 : NaN;
      if (!Number.isFinite(basis)) return null;
      const stuecke = l.teile.map(t => { const a = basis + t.off, e = t.len ? a + t.len : (l.methode === 1 ? idat.end : u8.length); return e <= u8.length && a >= 0 && e >= a ? u8.subarray(a, e) : null; });
      if (stuecke.some(s => !s)) return null;
      const g = new Uint8Array(stuecke.reduce((s, x) => s + x.length, 0)); let p = 0;
      for (const s of stuecke) { g.set(s, p); p += s.length; }
      return g;
    };
    // Verweise (iref): cdsc = Metadaten „beschreibt“ Bild, dimg = Kacheln eines Rasterbilds
    const refs = [], iref = kind(m, 'iref');
    if (iref) {
      const ver = u8[iref.start], s = ver === 0 ? 2 : 4, rd = o => s === 2 ? r.u16(o) : r.u32(o);
      for (const b of boxen(u8, iref.start + 4, iref.end)) {
        let o = b.start; const von = rd(o); o += s; const n = r.u16(o); o += 2; const nach = [];
        for (let k = 0; k < n; k++) { nach.push(rd(o)); o += s; }
        refs.push({ typ: b.type, von, nach });
      }
    }
    // EXIF: der Exif-Eintrag, der das Hauptbild beschreibt (sonst der erste)
    const exifIds = [...typen].filter(([, t]) => t === 'Exif').map(([id]) => id);
    const exifId = exifIds.find(id => refs.some(x => x.typ === 'cdsc' && x.von === id && x.nach.includes(primaer))) ?? exifIds[0];
    let exif = null;
    const roh = exifId !== undefined ? daten(exifId) : null;
    if (roh && roh.length > 4) {
      const kopf = (roh[0] << 24 | roh[1] << 16 | roh[2] << 8 | roh[3]) >>> 0;
      const tiff = s => roh.length >= s + 8 && ((roh[s] === 0x49 && roh[s + 1] === 0x49 && roh[s + 2] === 42 && roh[s + 3] === 0) || (roh[s] === 0x4d && roh[s + 1] === 0x4d && roh[s + 2] === 0 && roh[s + 3] === 42));
      let s = 4 + kopf;
      if (!tiff(s)) { s = -1; for (let i = 0; i + 8 < roh.length && i < 64; i++) if (tiff(i)) { s = i; break; } }
      if (s >= 0) exif = roh.slice(s);
    }
    // Farbprofil: colr („prof“/„rICC“) am Hauptbild, sonst an der ersten Kachel
    let icc = null;
    const iprp = kind(m, 'iprp');
    if (iprp) {
      const ip = boxen(u8, iprp.start, iprp.end), ipco = kind(ip, 'ipco'), props = ipco ? boxen(u8, ipco.start, ipco.end) : [];
      const zuordnung = new Map();
      for (const ipma of ip.filter(b => b.type === 'ipma')) {
        const ver = u8[ipma.start], flags = u8[ipma.start + 3]; let o = ipma.start + 4;
        const n = r.u32(o); o += 4;
        for (let i = 0; i < n; i++) {
          const id = ver < 1 ? r.u16(o) : r.u32(o); o += ver < 1 ? 2 : 4;
          const k = u8[o++], liste = zuordnung.get(id) || [];
          for (let j = 0; j < k; j++) { const idx = flags & 1 ? r.u16(o) & 0x7fff : u8[o] & 0x7f; o += flags & 1 ? 2 : 1; liste.push(idx); }
          zuordnung.set(id, liste);
        }
      }
      const profil = id => {
        for (const idx of zuordnung.get(id) || []) {
          const p = props[idx - 1];
          if (p && p.type === 'colr' && p.end - p.start > 4) { const t = fourcc(u8, p.start); if (t === 'prof' || t === 'rICC') return u8.slice(p.start + 4, p.end); }
        }
        return null;
      };
      icc = profil(primaer);
      if (!icc) { const g = refs.find(x => x.typ === 'dimg' && x.von === primaer); if (g && g.nach.length) icc = profil(g.nach[0]); }
    }
    return { exif, icc };
  }

  /* ---------- EXIF: Orientation auf 1 ---------- */
  /** Kopie des TIFF-Blocks mit Orientation (0x0112) in IFD0 = 1. vorher = alter Wert (oder null, wenn der Eintrag fehlt). */
  function orientierungEins(tiff) {
    const t = tiff.slice(), v = new DataView(t.buffer), le = t[0] === 0x49;
    const ifd0 = v.getUint32(4, le);
    if (ifd0 + 2 > t.length) throw new Error('EXIF-Block ist beschädigt (IFD0)');
    const n = v.getUint16(ifd0, le);
    for (let i = 0; i < n; i++) {
      const e = ifd0 + 2 + i * 12;
      if (e + 12 > t.length) break;
      if (v.getUint16(e, le) !== 0x0112) continue;
      if (v.getUint16(e + 2, le) !== 3) throw new Error('EXIF-Orientation hat ein unbekanntes Format');
      const vorher = v.getUint16(e + 8, le);
      v.setUint16(e + 8, 1, le);
      return { tiff: t, vorher };
    }
    return { tiff: t, vorher: null };
  }

  /* ---------- JPEG: EXIF (APP1) und Farbprofil (APP2) einsetzen ---------- */
  const APP1_MAX = 65533 - 6, ICC_STUECK = 65533 - 14;
  function segment(marker, nutz) {
    const s = new Uint8Array(4 + nutz.length);
    s[0] = 0xff; s[1] = marker; s[2] = (nutz.length + 2) >> 8; s[3] = (nutz.length + 2) & 255; s.set(nutz, 4);
    return s;
  }
  const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0));
  /** jpeg (vom Browser kodiert, ohne EXIF/ICC) + EXIF-TIFF + ICC → neue Bytes. Vorhandene APP1-Exif/APP2-ICC werden ersetzt. */
  function jpegMitMetadaten(jpeg, tiff, icc) {
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Kein JPEG');
    if (tiff && tiff.length > APP1_MAX) throw new Error('EXIF-Block ist zu groß für ein JPG (' + tiff.length + ' Bytes)');
    const vorne = [], v = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
    let o = 2, jfif = null;
    while (o + 4 <= jpeg.length && jpeg[o] === 0xff) {
      const mk = jpeg[o + 1];
      if (mk === 0xda || mk === 0xd9 || (mk >= 0xd0 && mk <= 0xd7) || mk === 0x01) break;
      const len = v.getUint16(o + 2), seg = jpeg.subarray(o, o + 2 + len);
      const ist = (m, kennung) => mk === m && len >= 2 + kennung.length && kennung.every((c, i) => seg[4 + i] === c);
      if (ist(0xe0, [0x4a, 0x46, 0x49, 0x46, 0])) jfif = seg;
      else if (!ist(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0]) && !ist(0xe2, [...ascii('ICC_PROFILE'), 0])) vorne.push(seg);
      o += 2 + len;
    }
    const teile = [new Uint8Array([0xff, 0xd8])];
    if (jfif) teile.push(jfif);
    if (tiff) { const n = new Uint8Array(6 + tiff.length); n.set(ascii('Exif\0\0')); n.set(tiff, 6); teile.push(segment(0xe1, n)); }
    if (icc && icc.length) {
      const anzahl = Math.ceil(icc.length / ICC_STUECK);
      if (anzahl > 255) throw new Error('Farbprofil ist zu groß');
      for (let i = 0; i < anzahl; i++) {
        const stueck = icc.subarray(i * ICC_STUECK, (i + 1) * ICC_STUECK), n = new Uint8Array(14 + stueck.length);
        n.set(ascii('ICC_PROFILE\0')); n[12] = i + 1; n[13] = anzahl; n.set(stueck, 14); teile.push(segment(0xe2, n));
      }
    }
    teile.push(...vorne, jpeg.subarray(o));
    const out = new Uint8Array(teile.reduce((s, x) => s + x.length, 0)); let p = 0;
    for (const x of teile) { out.set(x, p); p += x.length; }
    return out;
  }

  /* ---------- Dekodieren und kodieren ---------- */
  let lib = null;
  function decoder() {
    if (lib) return lib;
    let f = root.libheif;
    if (!f && typeof importScripts === 'function') { importScripts(new URL(DECODER_DATEI, root.location.href).href); f = root.libheif; }
    if (!f && typeof require === 'function') f = require('./' + DECODER_DATEI);
    if (typeof f !== 'function') throw new Error('Der HEIC-Decoder konnte nicht geladen werden');
    lib = f();
    return lib;
  }
  /** HEIC → { rgba (Uint8ClampedArray), breite, hoehe } des Hauptbilds, Drehung aus dem Container angewendet. */
  async function dekodieren(bytes) {
    const l = decoder(), d = new l.HeifDecoder();
    let bilder = [];
    try {
      bilder = d.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      if (!bilder.length) throw new Error('Die Datei enthält kein lesbares Bild');
      const bild = bilder.find(b => b.is_primary()) || bilder[0], breite = bild.get_width(), hoehe = bild.get_height();
      if (!(breite > 0 && hoehe > 0)) throw new Error('Unbekannte Bildgröße');
      const ziel = { data: new Uint8ClampedArray(breite * hoehe * 4), width: breite, height: hoehe };
      const fertig = await new Promise(res => bild.display(ziel, res));
      if (!fertig) throw new Error('Das Bild konnte nicht dekodiert werden');
      return { rgba: ziel.data, breite, hoehe };
    } finally {
      for (const b of bilder) try { b.free(); } catch (_) {}
      try { if (d.decoder) { l.heif_context_free(d.decoder); d.decoder = null; } } catch (_) {}
    }
  }
  async function jpegKodieren(rgba, breite, hoehe, qualitaet) {
    const bild = new ImageData(rgba, breite, hoehe);
    let blob;
    if (typeof OffscreenCanvas === 'function') {
      const c = new OffscreenCanvas(breite, hoehe), g = c.getContext('2d');
      if (!g) throw new Error('Kein Zeichenbereich für ' + breite + ' × ' + hoehe + ' Pixel');
      g.putImageData(bild, 0, 0);
      blob = await c.convertToBlob({ type: 'image/jpeg', quality: qualitaet });
    } else {
      const c = document.createElement('canvas'); c.width = breite; c.height = hoehe;
      c.getContext('2d').putImageData(bild, 0, 0);
      blob = await new Promise(res => c.toBlob(res, 'image/jpeg', qualitaet));
    }
    if (!blob || blob.type !== 'image/jpeg') throw new Error('Der Browser konnte kein JPG erzeugen');
    return new Uint8Array(await blob.arrayBuffer());
  }
  /** Ein HEIC umwandeln: { jpeg, breite, hoehe, exif, icc, orientierungVorher, decoder, qualitaet, ms }
      opt.kodieren nur für den Node-Test (dort gibt es keinen Browser-JPEG-Kodierer). */
  async function umwandeln(bytes, opt = {}) {
    const t0 = Date.now(), q = opt.qualitaet || QUALITAET;
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const meta = heifMetadaten(u8);
    const bild = await dekodieren(u8);
    let jpeg = await (opt.kodieren || jpegKodieren)(bild.rgba, bild.breite, bild.hoehe, q);
    bild.rgba = null;
    const o = meta.exif ? orientierungEins(meta.exif) : { tiff: null, vorher: null };
    jpeg = jpegMitMetadaten(jpeg, o.tiff, meta.icc);
    return { jpeg, breite: bild.breite, hoehe: bild.hoehe, exif: !!o.tiff, icc: meta.icc ? meta.icc.length : 0, orientierungVorher: o.vorher,
      decoder: DECODER, qualitaet: Math.round(q * 100), ms: Date.now() - t0 };
  }

  const api = { DECODER, DECODER_DATEI, QUALITAET, heifMetadaten, orientierungEins, jpegMitMetadaten, dekodieren, umwandeln };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FotoKitHeic = api;

  // Als Worker: eine Nachricht { id, bytes } je Foto, Antwort { id, ok, ergebnis | fehler }
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = async e => {
      const { id, bytes, qualitaet } = e.data || {};
      try {
        const r = await umwandeln(bytes, { qualitaet });
        root.postMessage({ id, ok: true, ergebnis: r }, [r.jpeg.buffer]);
      } catch (err) {
        root.postMessage({ id, ok: false, fehler: String(err && err.message || err) });
      }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);

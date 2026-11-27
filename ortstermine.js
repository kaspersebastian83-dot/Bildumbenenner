/* Spektron – weitere Ortstermine eines Projekts (_Projekt.json), nur rechnen (kein Lesen, kein Schreiben).
   Entscheidungen O1, O9, O12 (claude/fotokit-ortstermine-entscheidungen.md):
   - „ortstermin“ (JJJJ-MM-TT) bleibt allein Termin 1, Kennung fest „t1“; optional „ortsterminBezeichnung“, „ortsterminWer“.
   - Weitere Termine nur, wenn es einen zweiten gibt: weitereOrtstermine: [{ id: "t2", datum, bezeichnung, wer }, …].
   - Kennungen werden nie neu vergeben (Basti, 26.11.2026): Zähler „ortsterminZaehler“ (Zahl) = höchste je vergebene
     Termin-Nummer. Nächste Kennung = Zähler + 1. Der Zähler wird im selben Patch wie „weitereOrtstermine“ geschrieben (die
     Widerspruchsprüfung gilt für beide), sinkt nie und bleibt, wenn der letzte weitere Termin entfernt wird. Ein Projekt,
     das nie einen zweiten Termin hatte, bekommt ihn nicht.
   - Fehlt der Zähler (erster weiterer Termin, Bestand), wird aus allem gerechnet, was irgendwo steht – weitereOrtstermine,
     FotoKit (bilddokus, dokuGeaendertJe, ordnerTermine, bilder[].termin), weitereMitteilungen[].termine – und der Zähler
     dabei angelegt. Nur dann braucht die Projektzentrale FotoKits Datei.
   - DIESELBE REGEL gilt für FotoKit 2.7.0 (legt Termine an, O9: Zähler lesen, +1, im selben Patch schreiben) und später für
     die Mitteilungen (weitereMitteilungen, M3 – mit eigenem Zähler nach demselben Muster).
   Unbekannte Felder in einem Eintrag bleiben erhalten (andere Apps dürfen dort mehr ablegen). */
(function(root){
  'use strict';
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const KENNUNG = /^t(\d+)$/;
  const VORSCHLAEGE = Object.freeze(['Erstbegehung', 'Nachbeprobung', 'Freimessung']);
  const gueltig = s => { if (typeof s !== 'string' || !ISO.test(s)) return false; const d = new Date(s + 'T12:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s; };
  const text = v => typeof v === 'string' ? v : v == null ? '' : String(v);
  const nummer = id => { const m = KENNUNG.exec(text(id)); return m ? +m[1] : 0; };

  /** Weitere Termine aus den Projektdaten (Einträge ohne gültige Kennung werden nicht gezeigt, bleiben aber in der Datei). */
  function liste(pj){
    const l = pj && Array.isArray(pj.weitereOrtstermine) ? pj.weitereOrtstermine : [];
    return l.filter(e => e && typeof e === 'object' && nummer(e.id) >= 2);
  }
  /** Gibt es mehr als einen Termin? */
  const mehrere = pj => liste(pj).length > 0;

  /** Zum Speichern: Texte der vier Felder getrimmt, alles andere unverändert (auch Einträge, die die Projektzentrale nicht
      zeigt); leere Liste → null (das Feld wird entfernt – ein Projekt mit einem Termin hat kein „weitereOrtstermine“). */
  function bereinigt(l){
    const out = (Array.isArray(l) ? l : []).map(e => {
      if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
      const o = { ...e };
      for (const k of ['id', 'datum', 'bezeichnung', 'wer']) if (typeof o[k] === 'string') o[k] = o[k].trim();
      return o;
    });
    return out.length ? out : null;
  }

  /** Kennungen (als Zahl), die irgendwo stehen: in den Projektdaten und – falls gelesen – in FotoKits _Bildumbenenner.json. */
  function inGebrauch(pj, fk){
    const n = new Set([1]);
    const dazu = id => { const x = nummer(id); if (x) n.add(x); };
    for (const e of (pj && Array.isArray(pj.weitereOrtstermine) ? pj.weitereOrtstermine : [])) if (e) dazu(e.id);
    // Mitteilungen-Ebene (M3, noch nicht gebaut): weitereMitteilungen[].termine
    for (const m of (pj && Array.isArray(pj.weitereMitteilungen) ? pj.weitereMitteilungen : [])) if (m && Array.isArray(m.termine)) m.termine.forEach(dazu);
    if (fk && typeof fk === 'object'){
      for (const k of ['bilddokus', 'dokuGeaendertJe']) if (fk[k] && typeof fk[k] === 'object') Object.keys(fk[k]).forEach(dazu);
      if (fk.ordnerTermine && typeof fk.ordnerTermine === 'object') for (const v of Object.values(fk.ordnerTermine)) if (v) dazu(v.termin);
      if (fk.bilder && typeof fk.bilder === 'object') for (const v of Object.values(fk.bilder)) if (v) dazu(v.termin);
    }
    return n;
  }
  /** Zähler aus den Projektdaten (ganze Zahl ≥ 1) oder null, wenn es keinen (gültigen) gibt. */
  function zaehler(pj){
    const z = pj ? pj.ortsterminZaehler : null;
    return typeof z === 'number' && Number.isInteger(z) && z >= 1 ? z : null;
  }
  /** Nächste Kennung: Zähler + 1. Ohne Zähler: höchste irgendwo stehende + 1 (mindestens „t2“); fk dann nötig.
      Zur Sicherheit nie unter einer Kennung, die schon in der Liste steht (auch mit Zähler). */
  function naechsteKennung(pj, fk, auchDiese = []){
    const z = zaehler(pj);
    const n = z ? new Set([z]) : inGebrauch(pj, fk);
    if (z) for (const e of (pj && Array.isArray(pj.weitereOrtstermine) ? pj.weitereOrtstermine : [])) if (e && nummer(e.id)) n.add(nummer(e.id));
    for (const id of auchDiese) { const x = nummer(id); if (x) n.add(x); }
    return 't' + (Math.max(...n) + 1);
  }
  /** Zählerstand nach dem Vergeben von id: nie kleiner als vorher. */
  const zaehlerNach = (pj, id) => Math.max(zaehler(pj) || 0, nummer(id));

  /** Was FotoKit zu einer Kennung gemerkt hat (für die Rückfrage beim Entfernen). */
  function inFotoKit(fk, id){
    const r = { ordner: [], fotos: 0, bilddoku: [] };
    if (!fk || typeof fk !== 'object') return r;
    if (fk.ordnerTermine && typeof fk.ordnerTermine === 'object')
      for (const [ordner, v] of Object.entries(fk.ordnerTermine)) if (v && v.termin === id) r.ordner.push(ordner === '' ? 'direkt in „Fotos“' : ordner);
    if (fk.bilder && typeof fk.bilder === 'object') for (const v of Object.values(fk.bilder)) if (v && v.termin === id) r.fotos++;
    const d = fk.bilddokus && typeof fk.bilddokus === 'object' ? fk.bilddokus[id] : null;
    if (d) r.bilddoku = (Array.isArray(d.dateien) ? d.dateien : [d.dateien]).map(text).filter(Boolean).map(x => x.split('/').pop());
    r.ordner.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    return r;
  }

  /** Kopfzeile: „Ortstermin 12.08.2026“ (ein Termin) bzw. „Ortstermine 12.08. · 20.08.2026“ (mehrere; nach Datum, ohne leere). */
  function zusammenfassung(pj){
    const t1 = pj && gueltig(pj.ortstermin) ? pj.ortstermin : '';
    if (!mehrere(pj)) return t1 ? 'Ortstermin ' + de(t1) : '';
    const daten = [t1, ...liste(pj).map(e => e.datum)].filter(gueltig).sort();
    if (!daten.length) return '';
    const letztesJahr = daten[daten.length - 1].slice(0, 4);
    const kurz = (d, i) => i === daten.length - 1 || d.slice(0, 4) !== letztesJahr ? de(d) : de(d).slice(0, 6);
    return 'Ortstermine ' + daten.map(kurz).join(' · ');
  }
  function de(iso){ const m = ISO.exec(iso) ? iso.split('-') : null; return m ? `${m[2]}.${m[1]}.${m[0]}` : text(iso); }

  const api = Object.freeze({ liste, mehrere, bereinigt, inGebrauch, zaehler, zaehlerNach, naechsteKennung, inFotoKit, zusammenfassung, gueltig, nummer, VORSCHLAEGE });
  root.Ortstermine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

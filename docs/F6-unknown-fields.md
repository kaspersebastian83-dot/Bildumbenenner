# F6 – unbekannte FotoKit-Projektfelder erhalten

Ausgangsbasis: `main` b616164f5ab24faa5371f4eb714276f6080a8bf3.

`projFromJson()` reduzierte die Datei auf bekannte Arbeitsfelder. `projToJson()`
erzeugte daraus eine neue Datei. Erweiterungen auf der obersten Ebene, in
Bildeinträgen und in `original`/`sha256` gingen dabei verloren. Die vorhandene
Versionswarnung erlaubte außerdem das Überschreiben neuerer App-Dateien.

## Änderung

Unbekannte Felder werden als geklonte JSON-Werte neben den normalisierten
Arbeitsfeldern mitgeführt. Beim Serialisieren überlagern ausschließlich bekannte
Felder die jeweiligen Arbeitswerte. Unbekannte verschachtelte Objekte, Arrays,
Null-, Boolean-, Zahlen- und Zeichenkettenwerte werden nicht interpretiert.
Auch Bildeinträge ohne bekannte Felder bleiben erhalten. Bildbezogene Erweiterungen
wandern beim Umbenennen und Rückgängig mit dem Dateinamen mit. Erweiterungen in
Projektangaben und Benennung bleiben auch bei Änderungen über deren Dialoge erhalten.

Der vorhandene Dreiwegeabgleich führt die Erweiterungen ebenfalls mit. Eine
zwischenzeitlich geänderte fremde Erweiterung wird wie andere fremde Daten
übernommen, wenn sie lokal unverändert blieb. Bestehende Konfliktanzeigen bleiben
erhalten. Es wird keine neue automatische fachliche Zusammenführung eingeführt.

Nicht unterstützte Formatkennzeichen, neuere App-Versionen und nicht eindeutig
lesbare Versionsangaben aktivieren den vorhandenen geschützten Modus. Dies wird
beim Laden und beim Lesen fremder Änderungen vor dem Schreiben beziehungsweise
beim Fokuswechsel geprüft. Originale und Projektdateien werden in diesem Modus
nicht überschrieben; Ansicht und sichere Exporte bleiben verfügbar. Ältere Dateien
einschließlich fehlender Format-/Versionskennzeichen bleiben bearbeitbar.

Das Dateiformat bleibt `format: 1`. Zeitstempel, App-Version, Einrückung und die
Reihenfolge von Objektschlüsseln sind weiterhin normale Ausgabeparameter. Der
Erhalt bezieht sich auf geparste JSON-Werte, nicht auf ein byteidentisches Dokument.

## Reproduzierbare Prüfung

- `node tests/unknown-fields.cjs`: 29 Fälle mit echten Speicher-, Lade- und
  Abgleichfunktionen und synthetischen Dateihandles; einschließlich unverändertem
  Roundtrip, bekanntem Edit, verschachtelten Erweiterungen, Fremdänderung, Retry,
  älteren Dateien und Schutz bei Laden/Speichern/Fokus.
- `node tests/unknown-fields-browser.cjs chromium` bzw. `webkit`: zehn vollständige
  UI-Szenarien ohne API-Skips, mit synthetischen Dateihandles; insbesondere echte
  Metadatenschreibvorgänge, Umbenennen/Kopierfallback/Rückgängig, PDF/ZIP-Ausgabe,
  Wiederöffnen, Schreibfehler und neuerer App-Version bei drei Einstiegspunkten.
- Alle bisherigen Node- und Browserdateien werden unverändert ausgeführt.
  Bestehende Chromium-OPFS-Tests prüfen zusätzlich die native Browserdateischnittstelle,
  Bildnummerierung, CSV/PDF/ZIP, Sortierung, geschützten Modus und Speicherfehler.
  Bestehende Tests melden ihre fehlende native Dateischnittstelle in WebKit als Skip;
  die neuen zehn F6-UI-Szenarien laufen dort vollständig mit synthetischen Handles.

## F3-Kompatibilität

Der zusätzliche Workflow `f3-compatibility.yml` wendet den Produkt- und Testpatch
aus FotoKit Draft-PR #31, fest auf
`5617ff033cd29c0a3fa43bb4246be598830cbfcd`, auf einen temporären CI-Checkout von F6
an. Er verändert keine bestehenden PR-Branches und führt dort alle FotoKit-Node-
und Browsersuites sowie die F3-Speicher-/Wiederherstellungsregressionen aus.
Die Änderung betrifft `_Bildumbenenner.json`; F3 schützt die separate `_Projekt.json`.

## Grenzen

Nur synthetische Projektdaten. Keine praktischen Windows-/SMB-/RDP- oder
Stromausfallversuche. Browser- und JSON-Roundtriptests belegen den Werterhalt für
unterstützte JSON-Dateien, keine universelle Dateisystem- oder Ausfallsicherheit.
F6 ersetzt keine profilübergreifende Speicherabsicherung und repariert keine schon
vorher entfernten Erweiterungen. Geschützte Dateien benötigen zum dauerhaften
Bearbeiten eine kompatible FotoKit-Version.

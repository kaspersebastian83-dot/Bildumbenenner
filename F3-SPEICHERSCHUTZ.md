# F3: Geschütztes Speichern gemeinsamer Projektdaten

Gilt ausschließlich für `_Projekt.json`. Das bisherige JSON-Format bleibt erhalten.
`project-store.js` muss in Projektzentrale und FotoKit bytegleich sein. Keine echten
Projektordner werden für Entwicklung oder Tests verwendet.

## Speicherverfahren (Protokoll 1)

1. Eine vorhandene Web-Lock-Sperre `mosaik:projekt:<Ordnername>` koordiniert weiterhin
   kooperierende Tabs. Sie schützt **nicht** zwischen unabhängigen Profilen.
2. Vollständige aktuelle Datei lesen, UTF-8 und JSON-Objekt prüfen. Alte Objekte ohne
   Formatkopf bleiben gültig; leere, beschädigte, unbekannte und neuere Formate werden
   nicht automatisch überschrieben. Lesefehler sind keine fehlende Datei.
3. Änderungen bleiben Feld-Patches: unbekannte Felder, auch verschachtelte Daten und
   JSON-Schlüssel wie `__proto__`, bleiben erhalten. Hat sich ein vom Benutzer gerade
   bearbeitetes Feld seit der Anzeige geändert, wird die Speicherung blockiert.
   Unveränderte andere Felder werden wie bisher frisch mitgeführt. Abweichende
   vollständige Sicherungsfassungen werden niemals automatisch zusammengeführt.
4. Ausgangsdatei bytegenau als `vorher_<UTC>_<UUID>.json` und vollständigen neuen
   Schreibkandidaten als `kandidat_<UTC>_<UUID>.json` unter `_Projekt_Sicherungen/`
   ablegen. Kryptographische UUIDs, Prüfung auf bereits belegten Namen. Beide
   Sicherungen durch erneutes Lesen und Bytevergleich verifizieren. Ein Fehler
   verhindert das Ersetzen der Hauptdatei; unvollständige Sicherungen bleiben liegen.
5. SHA-256 des aktuellen Ausgangsstands vor dem Öffnen des Schreibstroms und direkt
   vor dem Schreiben vergleichen. Danach schließen und die Hauptdatei erneut lesen
   und bytegenau mit dem Kandidaten vergleichen. Erst dann Erfolg melden.
6. **Keine automatische Bereinigung.** Auch erfolgreich bestätigte Kandidaten und
   ihre Ausgangsstände bleiben dauerhaft erhalten. Ein späterer unabhängiger
   Schreiber kann die Hauptdatei überschreiben, aber nicht die vorher bereits
   verifizierten Kandidaten. Es gibt keine nachweislich sichere allgemeine Regel,
   einen abweichenden vollständigen Stand automatisch zu löschen. Daher kann der
   Sicherungsordner wachsen. Kapazitäts-/Schreibfehler blockieren weitere Speicherungen.

## Wiederherstellung

In beiden Anwendungen erscheint beim geöffneten Projekt „Projektfassungen prüfen“
mit der Zahl abweichender vollständiger Fassungen. Der Inhalt des gemeinsamen
Sicherungsordners wird beim Öffnen, nach Speicherung und bei erneuter Prüfung gelesen;
die Liste hängt nicht von Browser-Daten oder einer vorherigen Sitzung ab.

Alle unterschiedlichen gültigen Inhalte sind erreichbar (20 je Seite, keine
Gesamtbegrenzung); identische Kopien und der aktuelle Hauptstand werden in der Anzeige
zusammengefasst. Beschädigte/inkompatible Sicherungen werden gemeldet und erhalten.
Ein Dateiname bezeichnet nur den Zeitpunkt der Sicherung, keine fachliche Priorität.
Auch abgebrochene oder nicht bestätigte Schreibversuche können gültige Kandidaten
hinterlassen. Es wird keine Fassung automatisch als „richtig“ ausgewählt.

Nach „Fassung prüfen“ wird das vollständige JSON lesbar angezeigt. Nur „Diese
vollständige Fassung wiederherstellen“ ersetzt die Hauptdatei. Vorher werden offene
Eingaben gespeichert bzw. bei Fehler blockiert. Hauptstand und ausgewählter Kandidat
werden erneut geprüft; jede inzwischen erfolgte Änderung blockiert die Auswahl.
Die Wiederherstellung verwendet dasselbe gesicherte Speicherverfahren. Ein beschädigter
Hauptstand darf ausdrücklich ersetzt werden, nachdem seine rohen Bytes gesichert sind;
ein neueres/inkompatibles Format bleibt gesperrt. FotoKits geschützter Projektmodus bleibt
gesperrt. Die Projektnummer einer ausgewählten Fassung muss zum Ordner passen, sofern sie
vorhanden ist. Fotos und Büroaufträge werden von diesem Verfahren nicht geschrieben.

## Nachweis und Grenzen

`node tests/project-store.cjs [anderes-Repository]` prüft die echten Speicherfunktionen
in unabhängigen V8-Sitzungen über synthetische Dateihandles und echte temporäre Dateien.
Beide Schreiber passieren den letzten Vergleich; A bestätigt Erfolg, erst danach
schreibt und bestätigt B. Beide vollständigen Fassungen bleiben erhalten. Nach einem
neuen Lauf kann A bewusst wiederhergestellt werden, während B weiterhin erhalten bleibt.
Beide Reihenfolgen zwischen den Anwendungen sowie beide Anwendungen einzeln sind geprüft.
Zusätzlich: reguläres/erstes Speichern, unbekannte Felder, zwischenzeitliche Änderungen
vor/nach Schreiben, beschädigte/leere/inkompatible/nicht lesbare Dateien, Fehler bei
Sicherungs- und Hauptdateischreiben, beschädigte Sicherung, geänderte Auswahl,
UTF-8-BOM, rohe beschädigte Bytes bei ausdrücklicher Wiederherstellung und 42
abweichende Fassungen ohne Lösch-/Suchbegrenzung.

`node tests/project-store-browser.cjs chromium|webkit [anderes-Repository]` bedient
die echten Oberflächen in unabhängigen Browserkontexten mit gemeinsamem temporärem
Dateisystem. Auswahl, Anzeige und ausdrückliche Wiederherstellung werden nach einem
neuen Browserkontext geprüft. Dateihandles sind dabei simuliert, auch in WebKit;
dies ist kein Nachweis nativer WebKit-Dateischnittstellen. Die vorhandene
Spektron-Integration verwendet Chromium-OPFS mit simulierten Ordnerauswahlen.

Die Browser-Dateischnittstelle bietet hier keine profilübergreifende atomare
Compare-and-Swap-Operation und keine zugesicherte `fsync`-/Stromausfallgarantie.
Lesende Verifikation belegt den über die Schnittstelle sichtbaren Inhalt, nicht eine
physische Flush-Garantie. Windows-, RDP-, SMB-/Netzwerkcache-, Rechtewechsel- und
Stromausfalleigenschaften wurden nicht an einer realen Mehrbenutzerumgebung geprüft.
Manuelle Löschung/Änderung von Sicherungen und nicht aktualisierte Drittanwendungen
liegen außerhalb dieses Schutzes. Der Hauptstand allein ist keine gemeinsame Historie.

F5-Kompatibilität wird separat mit dem unveränderten F5-Commit
`1c8fa53bd362f6111e280c6478959f1b696bbb24` aus Draft-PR #30 in einem temporären Checkout
geprüft. Bestehende Draft-PRs werden dabei nicht verändert. Testergebnisse und genaue
geprüfte Commits sind in den zugehörigen CI-Läufen dokumentiert.

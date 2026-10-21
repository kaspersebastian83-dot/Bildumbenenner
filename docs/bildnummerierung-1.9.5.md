# Bildnummerierung in FotoKit 1.9.5

## Analyse vor der Änderung

Basis: main `ce793890656f9689ec1307ba9f69550b82d67dbb` (1.9.4).

- `applySort` sortiert `S.items` nach Name, Datum oder gespeicherter Reihenfolge. `buildRows` bildet `S.view` daraus: aktive Bilder, danach aussortierte Bilder; die Reihenfolge innerhalb beider Gruppen bleibt erhalten.
- Liste und Vorschau zeigten bereits aktive Positionen ab 1. Aussortieren, Wiederherstellen, Pfeiltasten und Drag & Drop bauten die Ansicht korrekt neu auf. Reihenfolge, Beschreibungen und Proben wurden bereits gespeichert. Diese Funktionen werden weiterverwendet.
- `recompute` vergab `it.nr` dagegen nur an beschriebene Bilder, ab der eingestellten Startnummer. Unbeschriebene aktive Bilder wurden dabei übersprungen. Beispiel: Bild 1 beschrieben, Bild 2 leer, Bild 3 beschrieben: Liste 1/2/3, Dateinummern 01/–/02; CSV übernahm diese Dateinummern.
- PDF (`buildAnnex`), ZIP-Bildverzeichnis (`buildTxt`) und Labortabelle (`photoNumbers`) zählten die Exportauswahl jeweils neu ab 1. Bei „nur Bilder mit Beschreibung“ wurde das dritte Listenbild zum zweiten PDF-/ZIP-Bild. Ohne Filter stimmten Liste und PDF bereits überein.
- Umbenennen war bereits ausdrücklich zu bestätigen. Unveränderte Namen wurden ausgelassen; Konfliktprüfung, temporäre Namen, Prüfung auf vorhandene Ziele, Kopierfallback und Rückgängig waren vorhanden. Sortieren änderte keine physischen Dateien.
- Nach Umbenennen wurde die Reihenfolge zwar gespeichert, aber `loadItems` konnte bei Namenssortierung nach den neuen Dateinamen neu sortieren. Das ist insbesondere bei ausgeschalteter Dateinummerierung und Beschreibungen in anderer alphabetischer Reihenfolge relevant.
- Die Liste zeigte den aktuellen Dateinamen und geplante Änderungen, aber nach dem Umbenennen fehlte die ursprüngliche Dateireferenz in der Oberfläche.
- Bei gleichen Beschreibungen können erneutes Sortieren und Umbenennen einen Namenskreislauf erzeugen (zwei Dateinamen tauschen ihre Plätze). Rückgängig las und überschrieb die Originalreferenzen dabei im selben Objekt; dadurch wurde eine Referenz vertauscht und eine andere verloren. Der neue echte Dateiaktionstest reproduzierte dies. Rückgängig liest diese Referenzen jetzt aus einem Snapshot und entfernt zuerst alle betroffenen Schlüssel, wie die vorhandenen anderen Metadaten-Umschlüsselungen.
- Aussortierte Dateien werden erst bei bestätigtem Ausführen physisch nach `_aussortiert/` verschoben. Danach stellt das vorhandene Rückgängig sie wieder her; eine Wiederherstellung aus dem Unterordner durch den Listenknopf wird nicht neu eingeführt.

## Regeln ab 1.9.5

`recompute` berechnet `it.docNr` aus der aktiven Reihenfolge, ab 1 und ohne Lücken. Dies ist ein abgeleiteter Sitzungswert, kein neues JSON-Feld. Liste, Vorschau, PDF-Bildunterschriften und Probenübersicht, ZIP-Anweisung, CSV-Snapshot und Labor-Fotoreferenzen verwenden diesen Wert.

Die bestehende Dateibenennung bleibt separat: `it.nr = cfg.start + it.docNr - 1` für beschriebene aktive Bilder. Ohne Beschreibung wird keine Umbenennung geplant. Präfix, Datum, Nummerierung an/aus, Stellenzahl, Trennzeichen, Proben und Dateiendung verwenden weiterhin `buildName`.

Gefilterte Exporte behalten die Bildnummern der aktiven Liste bei; dadurch können sie Lücken haben. Der Exportdialog erklärt dies. Der Standard und die vorhandene Auswahlmöglichkeit werden beibehalten.

Nach einer bestätigten Dateiaktion wird die gespeicherte Reihenfolge als manuelle Sortierung verwendet. Erneutes Umsortieren berechnet den Plan und die Bildnummern neu. Ein Hinweis und die geplanten Dateinamen zeigen Abweichungen an; die Originaldateien werden erst bei einer weiteren bestätigten Dateiaktion umbenannt.

## Nachweis und Grenzen

`tests/bildnummerierung-browser.cjs` erzeugt ausschließlich fiktive Projekte und synthetische JPEGs mit 5, 50 und 150 Bildern. Echte Klicks/Eingaben prüfen Liste und Vorschau, Aussortieren/Wiederherstellen, Verschieben in beide Richtungen, Dateiplan, bestätigte Umbenennung, keine implizite Dateiumbenennung, Rückgängig, Öffnen in einem weiteren Fenster sowie Nummerierung bei ausgeschalteter Dateinummerierung.

Der Test liest tatsächlich im Projektordner gespeicherte PDF-Dateien. Er löst deren Cross-Reference-Tabelle, Seiteninhalte und eingebettete Bildobjekte auf und vergleicht Nummern, Beschreibungen, Abschnittswechsel und Bildreihenfolge mit der Liste. Die JPEGs haben pro Motiv unterschiedliche Breiten, sodass auch die Reihenfolge der tatsächlichen Bildobjekte geprüft wird. Geprüft werden 1 und 2 Bilder pro Seite, eine Auswahl ohne unbeschriebene Bilder und Zustände vor/nach Aussortieren, Wiederherstellen, Sortieren und Umbenennen. Der Leser ist gezielt auf das bestehende unkomprimierte PDF-1.4-Ausgabeformat ausgelegt; er ersetzt keinen allgemeinen PDF-Validator oder eine Layoutprüfung.

CSV-Nummern und ZIP-Anweisung werden aus den gespeicherten Dateien gelesen. Die ZIP-Bildbytes und alle Originalbytes vor/nach Dateiaktionen werden verglichen. Bestehende Tests prüfen weiterhin Speicherfehler bei Erzeugen, Schreiben und Abschließen der Metadaten nach Umbenennen und Rückgängig, wiederholte Retries, Kopierfallback, geschützte Projekte und Projektsynchronisierung.

WebKit ohne schreibbaren Ordnerzugriff meldet ausdrücklich SKIP für diese Datei-/PDF-Szenarien. Ein erfolgreicher WebKit-Ladetest ist kein Nachweis dieser Dateiaktionen. Die bestehenden Browserprüfungen und der neue Test laufen zusätzlich in GitHub Actions für Chromium und WebKit.

Die Bildnummern ändern sich absichtlich beim Umsortieren, Aussortieren oder Wiederherstellen. Ein bereits erzeugtes PDF bzw. CSV bleibt ein Snapshot seines Erstellungszeitpunkts. Rückgängig bleibt wie bisher auf den letzten Dateivorgang der laufenden Projektsitzung begrenzt. Keine Schemaänderung, Migration oder neue Bibliothek.

## Spektron-Integration

`stand.json` des Spektron-Integrationstests in Projektzentrale wird in diesem PR nicht verändert. Nach einem späteren Merge von FotoKit 1.9.5 soll ein separater kleiner Integrations-PR den FotoKit-Commit im Manifest aktualisieren und den Integrationstest erneut ausführen. Dieser PR führt keinen Merge und kein Deployment aus.

## Lokaler Prüflauf vom 21.10.2026

Node 24.19.0, Playwright 1.62.1, vorhandenes Chromium Headless Shell (Revision 1248) unter Windows. Ein lokaler Launcher außerhalb des Repositorys wählt ausschließlich die vorhandene Browserdatei aus. Die CI verwendet weiterhin die bereits festgelegte Playwright-Version 1.56.1.

Bestanden: `laborwerte.cjs` sowie sämtliche bestehenden Chromium-Testdateien (`projektdaten`, `leiste`, `sortierung-export`, `sicherer-projektwechsel`, `geschuetzter-projektmodus`, `oberflaeche`, `serienbeschriftung`, `projektkontext`). Der neue Test `bildnummerierung-browser.cjs` bestand mit allen drei Seriengrößen einschließlich der gespeicherten PDF-/CSV-/ZIP-Inhalte, XML-Fotoreferenzen und des Namenskreislaufs. Nach der Korrektur der Originalreferenzen wurde der vollständige Schutz-/Speicherfehler-Test erneut ausgeführt. `git diff --check` ist fehlerfrei.

Ein erster Oberflächenlauf scheiterte bei 320 px während eines Dateisnapshots mit `NotFoundError`; die unveränderte Prüfung bestand beim Wiederholen auf allen vier Fensterbreiten sowie im geschützten Modus und nach der abschließenden Beschriftungsanpassung erneut vollständig. Diese lokale sporadische Dateizugriffsgrenze bleibt transparent dokumentiert. GitHub Actions prüft den endgültigen PR-Commit zusätzlich; dessen Status ist am PR einzusehen.

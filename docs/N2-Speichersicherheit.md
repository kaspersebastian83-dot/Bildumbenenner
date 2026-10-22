# N2 – vollständige FotoKit-Fassungen erhalten

SPEKTRON bleibt **NO-GO** bis zur unabhängigen Gesamtprüfung und praktischen Büroabnahme. Dieser Fix ist keine Freigabe, kein Deployment und keine Windows-/SMB-Abnahme.

## Fehler und deterministischer Nachweis

Ausgang: `main` = `b616164f5ab24faa5371f4eb714276f6080a8bf3`.

`tests/n2-speichersicherheit.cjs` führt die echten Speicherfunktionen aus `index.html` in zwei voneinander unabhängigen JavaScript-Sitzungen über einem ausschließlich synthetischen Dateisystem aus. Die Barriere liegt beim Schreiben **nach dem letzten Revisionsvergleich**. A ändert Bild 1, B Bild 2. Beide passieren den Vergleich. A schreibt und meldet Erfolg; danach schreibt B und meldet Erfolg.

Derselbe Test gegen das unveränderte Ausgangs-HTML scheitert mit `N2: confirmed full version A must survive B and restart`. Mit dem Fix werden beide vollständigen bestätigten Fassungen nach einem Neustart gefunden und einzeln bytegenau wiederhergestellt. Die Wiederherstellung kombiniert die Fassungen nicht.

`tests/n2-speichersicherheit-browser.cjs` führt diesen Ablauf mit der unveränderten produktiven Oberfläche in getrennten Chromium-/WebKit-Kontexten aus. Nur Dateiauswahl und synthetische Dateihandles werden ersetzt. Eine zweite Interleaving-Prüfung führt gleichzeitig disjunkte Bildumbenennungen aus und prüft beide Originalbilder sowie die vollständigen Metadatenkandidaten unter den neuen Namen.

## Speicherprotokoll

Im Fotoordner entsteht `_FotoKit_Fassungen/`. Die JSON-Dateien enthalten jeweils eine vollständige Metadatenfassung, keine Feld-Patches:

| Präfix | Bedeutung |
| --- | --- |
| `ausgang_` | Exakte Bytes des geladenen Ausgangsstands, auch vor Übernahme eines externen Stands |
| `vorher_` | Exakte Bytes der Hauptdatei vor einem Schreib-/Wiederherstellungsversuch |
| `kandidat_` | Vollständiger Schreibkandidat vor dem Ersetzen der Hauptdatei |
| `bestaetigt_` | Vollständige Fassung nach erfolgreichem Schreiben und erneuter Prüfung |

Zeitstempel und kryptographisch zufällige UUID bilden den Dateinamen. Bereits vorgefundene Namen werden nicht überschrieben. Jede Sicherung wird geschlossen, erneut gelesen und byteweise mit dem beabsichtigten Inhalt verglichen. Erst nach verifizierten Sicherungen wird die Hauptdatei ersetzt. Vor dem Ersetzen wird nochmals verglichen; anschließend wird auch die Hauptdatei erneut gelesen und byteweise geprüft. Bestätigte Fassungen werden dauerhaft zusätzlich erhalten. Scheitert etwa das Schreiben der Bestätigung, wird kein Erfolg gemeldet; der zuvor verifizierte vollständige Kandidat bleibt auffindbar.

Ein späterer unabhängiger Schreiber kann die Hauptdatei weiterhin ersetzen. Er entfernt damit keine zuvor gesicherten vollständigen Fassungen. Es gibt keine automatische Bereinigung, auch nicht für Duplikate oder fehlgeschlagene Kandidaten. Der Speicherbedarf wächst; ein volles oder nicht beschreibbares Sicherungsverzeichnis verhindert einen neuen bestätigten Speichervorgang. Externe Backup-, Aufbewahrungs- und Zugriffskonzepte bleiben erforderlich.

Unbekannte Projekt-, Einstellungs-, Bild-, Original- und Prüfsummenfelder bleiben entsprechend F6 erhalten. Umbenennen und Rückgängig schlüsseln auch unbekannte Bildfelder um. Beschädigte, leere oder nicht unterstützte Hauptdateien werden nicht automatisch überschrieben. Nicht widersprüchliche externe Änderungen können wie bisher übernommen werden; widersprüchliche Felder oder Bildreihenfolgen stoppen die Speicherung, statt still eine Fassung zu bevorzugen. Der lokale vollständige Vorschlag wird beim Speicherabgleich vorher gesichert.

## Ausdrückliche Wiederherstellung

Nach erneutem Öffnen des Fotoordners: **Gesicherte Fassungen … → Fassung ansehen … → Diese Fassung ausdrücklich wiederherstellen**.

Die Oberfläche unterscheidet Ausgangsstände, Kandidaten und bestätigte Fassungen. Sie zeigt die vollständige JSON-Fassung vor der Entscheidung. Beschädigte/unlesbare/nicht unterstützte Sicherungen werden als solche aufgeführt und bleiben erhalten. Vor der Wiederherstellung werden auch die aktuelle Hauptdatei und offene FotoKit-Eingaben gesichert. Eine seit der Auswahl geänderte Hauptdatei oder manipulierte Sicherung stoppt den Vorgang. Die ausgewählte Datei wird unverändert und bytegenau zurückgeschrieben; auch eine ausdrücklich ersetzte beschädigte Hauptdatei bleibt mit ihren ursprünglichen Bytes archiviert.

Originalbilder, physische Dateinamen und `_Projekt.json` werden durch die FotoKit-Wiederherstellung nicht verändert. Nach früheren Umbenennungen können Metadaten und vorhandene Bildnamen voneinander abweichen; eine Metadatenfassung ist kein Rückgängig für physische Bildoperationen. Ungesicherte gemeinsame Projektdaten müssen zuerst gesichert werden. Projektwechsel sind während einer Wiederherstellung gesperrt; asynchrone Arbeit verwendet die festgehaltenen Ordner-/Sitzungsreferenzen.

## F3/F6 und Testaufbau

Unveränderte Referenzen:

- F3 FotoKit #31: `5617ff033cd29c0a3fa43bb4246be598830cbfcd`.
- F6 FotoKit #32: `9c7929b6aebca4dc7fe8d95d7b518ea0946a66d0`.
- F3 Projektzentrale: `e7b8c4e3819a4ce54fe2dc2ac91bb731e040896f`.

N2 enthält die für den Feld-Erhalt nötigen F6-Serialisierungsregeln bereits. `tests/n2-compose-compat.cjs` kombiniert die festgeschriebenen PR-Stände ausschließlich in einem temporären Checkout. Es behandelt eng begrenzte, geprüfte Merge-Konflikte und behält alle F3-/F6-Testschritte. Der ursprüngliche F6-Unit-Dateisystem-Dummy bot nur `text()`. Er wird dort durch einen Byte-/Verzeichnis-fähigen synthetischen Dummy ersetzt; alle 29 F6-Testfälle und deren Assertions bleiben unverändert. F3s `project-store.js` wird nicht geändert; die Projektzentrale-Kompatibilität vergleicht die Dateien zusätzlich bytegleich und führt deren tatsächliche UI-Tests aus.

Bestehende Originalschutz-Inventarprüfungen berücksichtigen die neuen N2-Dateien ausdrücklich: Jede alte Datei muss weiterhin bytegleich sein; neue Pfade müssen gültige vollständige N2-Sicherungen sein. Alle bisherigen Bild-/JSON-/Retry-/Exportprüfungen bleiben erhalten. Der UI-Test wartet zusätzlich auf tatsächlich vorhandene PDF-/ZIP-Dateien; sein Inspektor wiederholt vorübergehend ungültige native Dateisnapshots unter dem bestehenden Test-Timeout. Keine Assertions werden entfernt, keine Fehler in Erfolg umgewandelt.

`tests/n2-adapt-suite.cjs` berücksichtigt dieselben ausdrücklich erlaubten Sicherungszugänge in genau einer Inventarprüfung des temporären SPEKTRON-Sicherheitstests. Produktdateien anderer Anwendungen werden dabei nicht geändert.

## Ausführen und Nachweise

Node.js 24 und Playwright 1.56.1 wie im vorhandenen CI. Playwright außerhalb des Checkouts installieren und `NODE_PATH` entsprechend setzen.

```sh
node tests/laborwerte.cjs
node tests/n2-speichersicherheit.cjs
node tests/n2-speichersicherheit-browser.cjs chromium
node tests/n2-speichersicherheit-browser.cjs webkit
# Zusätzlich sämtliche bestehenden tests/*-browser.cjs mit beiden Browsern.
```

Lokale Nachweise werden bei der Bearbeitung unter `/workspace/.fotokit-tools/n2-results/` gesammelt. Der N2-Node-Test enthält 21 Fälle: konkurrierende bestätigte Fassungen, erstmalige Erstellung, Byteprüfung beschädigter Sicherungen, create/write/close-Abbrüche und Retry, beschädigte/neue Hauptdateien, ausdrückliche Wiederherstellung, ältere Dateien, unangetastete vorhandene Sicherungen, widersprüchliche Beschreibungen/Reihenfolgen/Prüfsummen, Projektwechsel sowie F6-Felder.

In der Kombination werden zusätzlich 29 F6- und 22 F3-Node-Fälle, sämtliche zwölf Browser-Testdateien je Browser, die F3-Tests mit der tatsächlichen Projektzentrale sowie der bestehende SPEKTRON-Produzenten-/Konsumentenablauf mit Sicherheitsfällen ausgeführt. Der Suite-Lauf protokolliert die tatsächlich verwendeten App-SHAs, synthetische Produzentendateien und die Bereinigung des Testarchivs.

WebKit-SKIPs für fehlenden nativen Ordnerzugriff sind **keine bestandenen nativen Datei-/Exportprüfungen**. Der N2-Test und F3-Test mit synthetischer gemeinsamer Dateischnittstelle laufen dort vollständig. PDF-/ZIP-Bytes, native OPFS-Dateioperationen und Originalbildschutz werden vollständig in Chromium geprüft. Lokal verwendet WebKit die unveränderten Playwright-Binärdateien mit signiert bezogenen, lokal entpackten Debian-Bibliotheken und einem Startwrapper; CI installiert die offiziellen Systemabhängigkeiten.

`.github/workflows/tests.yml` ergänzt den N2-Node-/Browsertest. `.github/workflows/n2-compatibility.yml` führt die festgeschriebene F3/F6-Kombination mit beiden Browsern und die vollständige Suite einschließlich Sicherheitsfällen aus, mit Ergebnisartefakten und ausschließlich Leserechten. Lokale Läufe und bereitgestellte Workflows ersetzen keinen tatsächlich abgeschlossenen entfernten CI-Lauf; dessen URLs und Status sind gesondert auszuweisen.

## Verbindliche Grenzen für Windows / SMB / RDP

Die Browser-Dateischnittstelle bietet keine profil-/rechnerübergreifende Compare-and-Swap-Transaktion, keinen anwendungsseitig erzwingbaren exklusiven Create-Namen und kein `fsync` für einen SMB-Server. Web Locks koordinieren keine unabhängigen Browserprofile, Windows-Sitzungen oder Terminalserver. Eine erfolgreiche Close-/Rückleseprüfung beweist nicht, dass Daten bei Stromausfall, Server-/Controllerfehlern oder RDP-Abbruch bereits physisch dauerhaft gespeichert sind. Die UUID-Namensgebung vermeidet praktische Kollisionen, ist aber kein exklusives Dateisystem-Lock.

Der Fix erhält verifizierte Vollfassungen im geprüften API-Modell; er kann keine Zusicherung gegen externes Löschen, Beschädigen, unkooperative ältere Schreiber oder den Verlust des gesamten Projektlaufwerks geben. Gleichzeitige physische Umbenennungen desselben Originalbilds sind keine verteilte Dateisystemtransaktion und werden dadurch nicht automatisch rückgängig gemacht. Die Tests konkurrierender disjunkter Umbenennungen belegen Metadaten-Erhalt und unangetastete Bildbytes, keine allgemeine sichere gleichzeitige Bearbeitung desselben Originals.

Vor einer Bürofreigabe sind mindestens unabhängige Windows-/RDP-Sitzungen am tatsächlichen SMB-Speicher, beide Schreibreihenfolgen, Server-/Client-Caches, Verbindungs-/Prozessabbruch, Berechtigungs-/Speicherplatzfehler sowie Wiederherstellung nach Ab- und Anmeldung praktisch zu prüfen. Die Suite bleibt bis zur unabhängigen Gesamtprüfung und praktischen Büroabnahme auf **NO-GO**.

## Lokaler Prüfstand vom 22.10.2026

| Prüfung | Beobachtetes Ergebnis |
| --- | --- |
| Identischer N2-Test gegen unverändertes `main` | Erwarteter Fehler: bestätigte Fassung A nach B verloren |
| N2-Node-Fälle | 21 bestanden |
| Laborwerte/Word-Tabellen | Bestanden |
| Temporäre F6-Node-Suite | 29 bestanden, unveränderte Assertions |
| Temporäre F3-Node-Suite | 22 bestanden |
| FotoKit-Browser-Testdateien | Chromium vollständig; WebKit-Läufe mit ausgewiesenen nativen Datei-SKIPs |
| N2- und F3-UI über synthetische gemeinsame Handles | Chromium und WebKit vollständig bestanden |
| Gemeinsame F3-Datei mit Projektzentrale | Unverändert; UI-Abläufe beider Anwendungen geprüft |
| SPEKTRON einschließlich Sicherheitsfällen A/B/C | Alle 10 Prüfstationen bestanden; Originalassertions plus eng begrenzte Archiv-Inventarergänzung |
| Entfernte GitHub-Checks | Kein abgeschlossener CI-Nachweis; GitHub-API-Freigabe erforderlich |

Frühere fehlgeschlagene Inventarläufe bleiben als Diagnose erhalten. Der ergänzte Oberflächentest verlangt PDF und ZIP in demselben vollständigen Inspektionslauf und prüft anschließend weiterhin deren ursprüngliche Bytesignaturen. Wiederholte oder übersprungene native Dateiprüfungen sind keine eigenständigen zusätzlichen Erfolgsfälle.

# N3 – Testmatrix für die Auditkorrekturen

**NO-GO.** Dies ist das reproduzierbare Prüfprogramm. Tatsächliche lokale Exit-Codes, Skips, konkrete Commit-/CI-Zuordnung und etwaige Fehlversuche sind zusätzlich im Fix-PR und Übergabeprotokoll zu prüfen; die bloße Auflistung gilt nicht als bestandener Nachweis.

Basisvergleich: ursprüngliche unabhängige Matrix unter `/workspace/n3-audit/TESTMATRIX.md` mit 50 Browser-Dateiaufrufen (10 je Engine auf N3, 15 je Engine in der Kombination). Die neue Matrix umfasst **58 Browser-Dateiaufrufe**: je Engine 12 auf dem Fix-Einzelbranch und 17 in der gepinnten Kombination. Die Differenz sind `n3-offline-browser.cjs` und `n3-recovery-browser.cjs`, jeweils auf beiden Ständen und Engines. Zusätzliche gezielte Wiederholungen sind separat auszuweisen.

| Gruppe | Ausführung | Abdeckung / Grenze |
|---|---|---|
| Build | `node tools/build-identity.cjs --check` auf Einzelbranch/Kombination | Kennung passt zum vollständigen normalisierten HTML; keine Signatur |
| Node vorher | Kombination: `laborwerte.cjs`, `project-store.cjs`, `unknown-fields.cjs`, `n2-speichersicherheit.cjs`, `pdf-layout.cjs` (`PDF_COMBINED=1`) | 22 F3 + 29 F6 + 21 N2 + 9 PDF = 81 bestehende Fälle; Laborwerte zusätzlich |
| Node neu | `node tests/n3-await-condition.cjs` | dauerhaftes false, verspätetes Positiv, Lesefehler, hängende Abfrage |
| Kooperierende Schreiber | Kombination: `node tests/n3-writer-conflict.cjs` | widersprüchlicher veralteter Schreiber vor/nach explizitem Restore; neuere B-Fassung bytegleich |
| Bestehende Browserfunktionen | alle `tests/*-browser.cjs` je Engine; auf Einzelbranch echter Altclient-Angriff nur in Kombination | UI, Projektdaten, Projektkontext/-wechsel, geschützter Modus, Serienbeschriftung, Nummerierung, Sortierung/Export; auf Kombination zusätzlich F3/F6/N2/PDF |
| Updates | `n3-updates-browser.cjs chromium` und `webkit` | vollständige positive/abweichende/ältere/höhere Antwort; 10 ungültige/unerreichbare Antwortklassen; tatsächlicher Timeout; kein Verlust bekannter Updatehinweise; tatsächliche async-false-/Hänge-Negativprüfungen |
| Sitzungssicherung | `n3-recovery-browser.cjs` je Engine, beide Stände | Reloadwarnung abbrechen/zulassen, neuer Tab, realer Prozess-Neustart mit persistentem Profil, ausdrückliche Übernahme, unveränderte Schutzdatei/Originale; beschädigter Eintragskopf/Inhalt, neuere Foto-/Gemeinschaftsdaten, falscher Ordner, Quota-/Projektschreibfehler, Retry |
| Neuer Offlinecache | `n3-offline-browser.cjs` je Engine, beide Stände | Origin tatsächlich unterbrochen; gecachtes HTML und in der Kombination F3-Skript; keine erfolgreiche Originantwort; Update unbestätigt; kaltes Profil muss scheitern |
| Echter alter Client | Kombination: `N3_OLD_ROOT=<unverändertes b616164> node tests/n3-altclient-browser.cjs <engine>` | A bleibt bis nach dem erneuten Schreiben offen; echter Workerwechsel; tatsächlicher unbekannte-Felder-Verlust wird verlangt; B vollständig archiviert und nach Stoppen ausdrücklich bytegenau hergestellt; synthetische Commitverweigerung, kein SMB-Nachweis |
| F3 Cross-App | `node tests/project-store-browser.cjs <engine> <gepinntes Projektzentrale-F3>` | FotoKit→FotoKit sowie FotoKit→Zentrale; beide Engines; gemeinsamer Helfer per Bytevergleich |
| Suite | gepinnte Projektzentrale-F3: `node --test tests/integration/provenance.test.mjs`, `node tests/integration/run.mjs --security` | 2 Provenienzfälle und 10 Produzenten-/Konsumenten-/Sicherheitsstationen einschließlich A/B/C; synthetische Daten; bestehende Produktdateien anderer Anwendungen unverändert |

## Reproduktion

1. Den vollständigen Übergabe-SHA pinnen. `node tools/n3-compose-compat.cjs <neues-temporäres-Verzeichnis>` ausführen; erzeugte lokale Integrations-SHA und HTML-Build protokollieren. Bestehende Branches bleiben unverändert.
2. Playwright **1.56.1** mit seinen gepinnten Chromium-/WebKit-Browsern verwenden. Auf jedem Stand alle vorhandenen Browserdateien pro Engine ausführen; `n3-altclient-browser.cjs` nur auf der Kombination und mit unverändertem alten Checkout. Jeden Exit-Code und jede Skip-Meldung einzeln protokollieren. Die CI-Workflows enthalten die vollständigen Schleifen und Pins.
3. Browserprozess-Neustarttests verwenden ein eigenes persistentes synthetisches Testprofil. `N3_BROWSER_EXECUTABLE` kann ausschließlich für die lokale Browserinstallation einen expliziten Launcher auswählen; ohne diese Variable verwendet CI die regulär installierten Browser. Lokaler WebKit-Launcher setzt nur benötigte Bibliothekspfade für denselben gepinnten Browser, keine geänderten Assertions.
4. Suite ausschließlich in einem temporären zentralen Checkout ausführen; `n2-adapt-suite.cjs` gestattet nur erwartete N2-Archivzusätze und erhält die ursprünglichen Datei-Byteassertions. FotoKit auf die erzeugte Kombination pinnen, übrige Anwendungen auf den dokumentierten Ständen belassen.

## Skips und Aussagegrenzen

WebKit hat unverändert keine native Ordner-Dateischnittstelle. Pro Checkout entstehen 14 explizite SKIP-Meldungen: Bildnummerierung 3, Schutzmodus 1, Oberfläche 5, Projektkontext 1, Serienbeschriftung 3, Projektwechsel 1. Diese Zahl zählt Meldungen, keine vollständige Anzahl ausgelassener Unterfälle; manche Dateien beenden nach fehlender API ihren restlichen Testblock. `leiste`, `projektdaten` und `sortierung-export` prüfen dort nur die ausdrücklich bezeichneten Lade-/UI-Teile. Keine neuen Skips wurden eingeführt.

F6-, N2-, F3-Bridge-, PDF- und die neuen N3-Tests müssen in beiden Engines vollständig laufen. Synthetische Handles werden als solche bezeichnet. Chromium-OPFS ist ebenfalls kein Windows-/SMB-Dateisystemtest.

Der Offline-Test unterbindet tatsächlich erfolgreiche Originantworten einschließlich Workerpfad; es wird nicht mehr behauptet, `setOffline(true)` allein isoliere den Worker. Die vorher abgeschlossenen Schreib-/Recoverykontexte werden vor der eigenständigen Offlinephase geschlossen. Für den Update-Abbruchtest wird eine vollständige korrekt gehashte andere Antwort ausgeliefert; der Updateknopf wird nicht künstlich sichtbar gehalten und kann daher nicht durch eine parallele reguläre Updateprüfung verschwinden. Die Assertion gegen ungefangene Browserfehler bleibt erhalten.

Quellgleichheit, ungeänderte Testassertions und negative Kriterien sind separat zu kontrollieren. CI-Jobstatus ohne einsehbare Logs/Artefakte ist als begrenzter Nachweis zu kennzeichnen. Reale Windows-/SMB-/DFS-/CSC-/RDP-, Synchronisations-, Rechte- und Stromverlustprüfungen sind **nicht** durch diese Matrix abgedeckt. Der verbindliche unabhängige Folgeauftrag steht in [N3-Reaudit-Auftrag.md](N3-Reaudit-Auftrag.md).

# Qwen Code Runtime Diagnostics Benchmark Report

Datum: 2026-05-19

## Umfang

Dieser Durchlauf wiederholt die vorherigen Benchmark-Konfigurationen von Qwen Code mit den neuen opt-in Runtime-Diagnostiken, die aktiviert wurden. Es wird nur Qwen Code getestet, nicht Claude Code.

Ursprüngliche Modellmatrix:

- `pai/glm-5`
- `qwen3.6-plus`

Zusätzliche PR-große Nachverfolgung:

- `DeepSeek/deepseek-v4-pro` über Anthropic-kompatibles Protokoll

Fälle:

- kleines GitHub-PR-Review: PR `#4268`
- Code-Navigation: Kompressions-/Kompaktierungsbezogene Codesuche und -Lektüre
- synthetischer lokaler Diff: ca. 94,6 KiB
- synthetischer lokaler Diff: ca. 968,5 KiB
- synthetischer lokaler Diff: ca. 4,84 MiB

Der Durchlauf verwendete das lokale gebündelte CLI aus dem Diagnostics-Branch, mit
`QWEN_CODE_PROFILE_RUNTIME=1` und einem temporären CLI-Home. Globale MCP-Server und Hooks wurden für diesen Benchmark nicht geladen.

Wichtige Einschränkung: Diese absoluten RSS-Werte sind niedriger als die vorherigen
PATH-aufgelösten `qwen`-Durchläufe, weil dieser Durchlauf `node dist/cli.js` aus dem lokalen Branch plus einer bereinigten temporären Konfiguration verwendete. Behandeln Sie diesen Bericht als einen internen Diagnostics-Verteilungsdurchlauf, nicht als direkten Ersatz für den früheren RSS-Vergleich mit installiertem CLI.

## Installiertes CLI vs. Lokales Bundle – Sanity Check

Ein nachträglicher Sanity Check verwendete denselben minimalen Prompt, dasselbe Modell und den nicht-interaktiven Modus sowohl mit dem installierten CLI als auch mit dem lokalen Diagnostics-Bundle. Die einzige beabsichtigte Variable war, ob Qwen Code ein bereinigtes temporäres CLI-Home oder die normale Benutzerkonfiguration lädt.

| CLI                 | Konfigurationsmodus | Gesamt-Token | Tree RSS peak | Root RSS peak | Prozessanzahl peak | Runtime-Diagnostiken |
| ------------------- | ------------------- | -----------: | ------------: | ------------: | -----------------: | -------------------- |
| PATH `qwen`         | bereinigte Konfig.  |       33,965 |     542,4 MiB |     249,9 MiB |                  3 | nein                 |
| lokal `dist/cli.js` | bereinigte Konfig.  |       47,281 |     455,2 MiB |     214,2 MiB |                  4 | ja                   |
| PATH `qwen`         | normale Konfig.     |       97,615 |   1.099,9 MiB |     250,1 MiB |                  6 | nein                 |
| lokal `dist/cli.js` | normale Konfig.     |       97,954 |   1.105,4 MiB |     212,7 MiB |                  8 | ja                   |

Diese Prüfung ändert die Zuschreibung: Der frühere benutzersichtbare Peak von 1 GiB ist mit der normalen Konfiguration auch im lokalen Diagnostics-Bundle reproduzierbar. Er ist daher nicht primär durch den lokalen Branch inklusive PR `#4186` zu erklären.

Beim normalen Konfigurations-Peak wurde der lokale Prozessbaum von mehreren Node-/MCP-Prozessen dominiert, nicht nur vom Qwen-Root-Prozess:

| Rolle | Befehlsumriss              | RSS beim Baum-Peak |
| ----- | -------------------------- | -----------------: |
| Kind  | Node-Prozess               |         252,9 MiB  |
| Kind  | Chrome DevTools MCP        |         219,7 MiB  |
| Kind  | Node-Prozess               |         219,2 MiB  |
| Root  | Qwen Node-Prozess          |         215,1 MiB  |
| Kind  | Chrome DevTools MCP-Setup  |         175,2 MiB  |

PR `#4186` ist im lokalen Diagnostics-Branch enthalten, ist aber ein Sicherheitsnetz für die automatische Kompaktierung bei V8-Heap-Druck. Es wird bei etwa 70 % V8-Heap-Druck ausgelöst; in dieser Umgebung liegt das Node-Heap-Limit bei etwa 4,1 GiB, während der bereinigte Benchmark-End-Heap bei etwa 99–143 MiB lag. Basierend auf diesen Zahlen wird der niedrigere bereinigte Konfigurations-RSS nicht dadurch verursacht, dass `#4186` während dieser Benchmark-Durchläufe aktiv Kontext komprimiert.

### Bare Mode – Konfigurationsattributionsprüfung

Ein zweiter Nachfolgetest verwendete `qwen3.6-plus` mit derselben PR-Review-Prompt-Form sowohl mit dem installierten CLI als auch mit dem lokalen Bundle. Dies ist kein normaler End-to-End-Geschäftsbenchmark. Es ist eine kontrollierte Attributionsprüfung nur für Start-/Konfigurationsspeicher.

`--bare` ändert die Runtime-Eingaben: Es überspringt die normale globale Settings-Erkennung, den MCP-Start, Hooks, impliziten Kontext, Skills und andere Startintegrationen. Es kann daher fehlschlagen oder sich anders verhalten, wenn ein Modellanbieter nur in den globalen Einstellungen konfiguriert ist. Für diesen Durchlauf wurden die Modellanmeldedaten nur über die Umgebung des Kindprozesses bereitgestellt, da der Bare-Mode absichtlich die normalen Anbietereinstellungen nicht lädt. Es wurde nichts in die globale Konfiguration des Benutzers zurückgeschrieben.

Dieser Durchlauf lieferte keine brauchbaren Token-/Tool-Call-Statistiken: Das Modell beendete die Aufgabe in einem Durchgang und führte den angeforderten Shell-Befehl nicht aus. Verwenden Sie diese Zeilen nicht als normale Aufgaben-Benchmark-Ergebnisse und vergleichen Sie ihr Token-/Tool-Call-Verhalten nicht mit der obigen Matrix. Sie sind nur nützlich, um abzuschätzen, wie viel Prozessbaum-RSS von der normalen Konfiguration und konfigurierten Kindprozessen stammt.

| CLI                 | Modus     | Wand | Durchgänge | Tool-Aufrufe | Tree RSS peak | Root RSS peak | Prozessanzahl peak |
| ------------------- | --------- | ---: | --------: | ----------: | ------------: | ------------: | -----------------: |
| PATH `qwen`         | normal    | 5,5s |         1 |           0 |   1.021,3 MiB |     251,5 MiB |                  5 |
| PATH `qwen`         | `--bare`  | 2,4s |         1 |           0 |     525,7 MiB |     246,4 MiB |                  2 |
| lokal `dist/cli.js` | normal    | 4,9s |         1 |           0 |   1.046,2 MiB |     213,3 MiB |                  5 |
| lokal `dist/cli.js` | `--bare`  | 2,3s |         1 |           0 |     454,3 MiB |     216,5 MiB |                  3 |

Das Ergebnis bestätigt die Prozessbaum-Hypothese zur Start-/Konfigurationsattribution. Auf diesem Rechner fügt die normale Konfiguration etwa 0,50–0,59 GiB benutzersichtbaren Prozessbaum-RSS gegenüber `--bare` hinzu, während der Root-RSS im gleichen Bereich von 0,21–0,25 GiB bleibt. Beim normalen Konfigurationspeak stammte der zusätzliche RSS erneut von zusätzlichen Node-/MCP-Kindprozessen, darunter ein Chrome DevTools MCP-Prozess und dessen Setup-Wrapper. `--bare` entfernt diese Start-/Konfigurations-Kindprozesse und bringt die installierten/lokalen Durchläufe zurück in den Bereich von 0,45–0,53 GiB Baum-RSS.

### Temporäre Einstellungen – MCP / Hooks Isolation

Da `--bare` zu viele Runtime-Eingaben ändert, um als normaler Benchmark behandelt zu werden, wurde eine Nachverfolgung mit temporären `QWEN_HOME`-Verzeichnissen und generierten Einstellungsdateien durchgeführt, die von den normalen Einstellungen abgeleitet wurden. Der Durchlauf blieb auf dem normalen Einstellungslade-Pfad, schaltete aber nur zwei Konfigurationsdimensionen um:

- MCP deaktiviert: `mcpServers` geleert und MCP-Zulassungs-/Ausschlusslisten geleert.
- Hooks deaktiviert: `disableAllHooks` auf true gesetzt.

Es wurden keine globalen Einstellungen geändert. Der Fall verwendete `qwen3.6-plus` und einen minimalen Start-Prompt, misst also die Kosten für Start-/Konfigurations-Prozessbaum, nicht die Aufgabenlogikqualität.

| CLI                 | Temporäre Konfiguration | MCP-Server | Tools | Tree RSS peak | Root RSS peak | Prozessanzahl peak |
| ------------------- | ----------------------- | ---------: | ----: | ------------: | ------------: | -----------------: |
| PATH `qwen`         | vollständig             |          4 |    46 |   1.017,4 MiB |     249,8 MiB |                  5 |
| PATH `qwen`         | MCP deaktiviert         |          0 |    17 |     548,7 MiB |     252,4 MiB |                  2 |
| PATH `qwen`         | Hooks deaktiviert       |          4 |    46 |   1.003,8 MiB |     246,4 MiB |                  5 |
| PATH `qwen`         | MCP + Hooks deaktiviert |          0 |    17 |     542,5 MiB |     248,0 MiB |                  2 |
| lokal `dist/cli.js` | vollständig             |          4 |    48 |     865,9 MiB |     220,4 MiB |                  6 |
| lokal `dist/cli.js` | MCP deaktiviert         |          0 |    19 |     442,9 MiB |     209,6 MiB |                  2 |
| lokal `dist/cli.js` | Hooks deaktiviert       |          4 |    48 |     848,3 MiB |     212,6 MiB |                  5 |
| lokal `dist/cli.js` | MCP + Hooks deaktiviert |          0 |    19 |     447,2 MiB |     217,8 MiB |                  2 |

Interpretation:

1. Die Deaktivierung von MCP ist die dominante Änderung. Sie entfernt 4 MCP-Server, reduziert die angezeigte Tool-Anzahl um etwa 29 Tools und senkt den Prozessbaum-RSS in diesem Start-/Konfigurationsfall um etwa 0,42–0,47 GiB.
2. Die alleinige Deaktivierung von Hooks verändert den RSS in diesem Fall kaum. Das ist erwartbar, da der Prompt keine Tool-Aufrufe erzeugte und daher `PreToolUse`-/`PostToolUse`-Hooks nicht ausgeführt wurden.
3. Der Root-Prozess bleibt über alle Zeilen hinweg bei etwa 0,21–0,25 GiB. Der große Unterschied liegt wieder in der Prozessbaum-Zusammensetzung, nicht im Root-Qwen-RSS.

Zwei versuchte Code-Navigations-Nachfolgetests mit `qwen3.6-plus` und `pai/glm-5` reproduzierten ebenfalls die gleiche MCP-vs.-kein-MCP-Speichertrennung, aber keines der Modelle erzeugte Tool-Aufrufe in diesen Durchläufen. Diese Zeilen werden daher nicht als Hinweise auf die Hook-Ausführung verwendet. Ein gültiger Hooks-Benchmark benötigt noch eine Aufgaben-/Modellkombination, die zuverlässig Tool-Aufrufe erzeugt.

### Per-MCP-Isolation

Die vorherige Zeile zeigte, dass MCP als Gruppe der dominante Faktor für den Start-/Konfigurationsspeicher ist. Eine Nachverfolgung isolierte jeden konfigurierten MCP-Server, während die Hooks für alle Zeilen deaktiviert blieben. Dadurch bleibt der Test auf dem normalen Einstellungslade-Pfad, ändert aber nur die MCP-Server-Teilmenge.

Konfigurierte MCP-Servernamen:

- `approval-bridge`
- `env-center`
- `chrome-devtools`
- `code`

Einzeldurchlauf-Isolation:

| Variante                    | Aktivierte MCPs                                          | Tools | MCP-Server | Tree RSS peak | Root RSS peak | Interpretation                           |
| --------------------------- | -------------------------------------------------------- | ----: | ---------: | ------------: | ------------: | ---------------------------------------- |
| keine                       | keine                                                    |    19 |          0 |     444,4 MiB |     211,7 MiB | Baseline ohne MCP                        |
| vollständig                 | alle 4                                                   |    48 |          4 |     857,3 MiB |     215,9 MiB | Vollständige MCP-Start-Form              |
| nur `approval-bridge`       | `approval-bridge`                                        |    19 |          1 |     455,5 MiB |     214,0 MiB | nahe Baseline                            |
| nur `env-center`            | `env-center`                                             |    19 |          1 |     452,3 MiB |     214,4 MiB | nahe Baseline                            |
| nur `chrome-devtools`       | `chrome-devtools`                                        |    48 |          1 |     824,4 MiB |     209,5 MiB | großer RSS-Anstieg und Tool-Anstieg      |
| nur `code`                  | `code`                                                   |    19 |          1 |     452,1 MiB |     216,6 MiB | nahe Baseline                            |
| ohne `approval-bridge`      | `env-center`, `chrome-devtools`, `code`                  |    48 |          3 |     997,1 MiB |     215,4 MiB | immer noch hoch; Durchlauf zeigte Varianz|
| ohne `env-center`           | `approval-bridge`, `chrome-devtools`, `code`             |    48 |          3 |     863,8 MiB |     220,9 MiB | immer noch hoch                          |
| ohne `chrome-devtools`      | `approval-bridge`, `env-center`, `code`                  |    19 |          3 |     463,4 MiB |     221,6 MiB | kehrt nahe Baseline zurück               |
| ohne `code`                 | `approval-bridge`, `env-center`, `chrome-devtools`       |    48 |          3 |     858,1 MiB |     219,5 MiB | immer noch hoch                          |

Da der Start-RSS eine gewisse Varianz aufweist, wurden die wichtigsten Varianten zweimal wiederholt:

| Variante                    | Samples | Tree RSS-Bereich     | Durchschn. Tree RSS | Ergebnis                        |
| --------------------------- | ------: | -------------------- | -----------------: | ------------------------------- |
| keine                       |       2 | 443,3–451,9 MiB      |         447,6 MiB  | stabile Baseline ohne MCP       |
| vollständig                 |       2 | 856,1–922,8 MiB      |         889,5 MiB  | stabiler hoher MCP-Bereich      |
| nur `chrome-devtools`       |       2 | 1.007,1–1.021,2 MiB  |       1.014,2 MiB  | allein ausreichend für hohen RSS|
| ohne `chrome-devtools`      |       2 | 461,1–461,6 MiB      |         461,4 MiB  | entfernt den hohen RSS          |
| nur `approval-bridge`       |       2 | 449,1–449,9 MiB      |         449,5 MiB  | nahe Baseline                   |
| nur `env-center`            |       2 | 438,7–449,5 MiB      |         444,1 MiB  | nahe Baseline                   |
| nur `code`                  |       2 | 450,6–451,3 MiB      |         451,0 MiB  | nahe Baseline                   |

Interpretation:

1. `chrome-devtools` ist der dominante MCP-Beitrag in dieser Umgebung. Es allein reicht aus, um den hohen Prozessbaum-RSS zu reproduzieren.
2. Das Entfernen von `chrome-devtools` aus dem vollständigen MCP-Set bringt den RSS zurück in den Bereich ohne MCP. Das Entfernen anderer MCPs unter Beibehaltung von `chrome-devtools` tut dies nicht.
3. Die angezeigte Tool-Anzahl folgt demselben Muster: Baseline sind 19 Tools, während `chrome-devtools` die Tool-Anzahl auf 48 erhöht. Das bedeutet, dass dieser MCP wahrscheinlich auch die Größe des Tool-Schemas und den Tokendruck bei Anfragen erhöht, nicht nur den Prozessbaum-RSS.
4. `approval-bridge`, `env-center` und `code` bleiben einzeln in der Nähe der Baseline ohne MCP in diesen Start-/Konfigurations-Durchläufen. Sie gaben in dieser Umgebung Startwarnungen aus, daher sollte dieses Ergebnis als „kein anhaltender RSS-Besitzer beim Start beobachtet“ interpretiert werden, nicht als Beweis dafür, dass sie in allen Workflows keine Kosten verursachen.

## Runtime-Zusammenfassung

| Fall              | Modell          |  Wand | Durchgänge | Gesamt-Token | Tree RSS peak | Root RSS peak |  End-Heap |  End-RSS |
| ----------------- | --------------- | ----: | ---------: | -----------: | ------------: | ------------: | --------: | -------: |
| kleines PR `#4268`| `pai/glm-5`     | 20,1s |          7 |      173.216 |     362,1 MiB |     359,8 MiB | 103,1 MiB | 216,5 MiB|
| Code-Navigation   | `pai/glm-5`     | 18,4s |          2 |       49.127 |     378,0 MiB |     376,0 MiB | 102,4 MiB | 313,4 MiB|
| Diff 94,6 KiB     | `pai/glm-5`     | 16,6s |          6 |      135.716 |     367,9 MiB |     366,0 MiB |  99,1 MiB | 295,0 MiB|
| Diff 968,5 KiB    | `pai/glm-5`     | 11,4s |          2 |       42.590 |     373,2 MiB |     362,5 MiB | 106,4 MiB | 345,6 MiB|
| Diff 4,84 MiB     | `pai/glm-5`     | 12,0s |          4 |       95.119 |     414,2 MiB |     412,0 MiB | 123,6 MiB | 410,7 MiB|
| kleines PR `#4268`| `qwen3.6-plus`  | 35,0s |          6 |      156.556 |     358,9 MiB |     356,9 MiB | 102,6 MiB | 293,1 MiB|
| Code-Navigation   | `qwen3.6-plus`  | 28,9s |          4 |       99.800 |     370,3 MiB |     368,3 MiB | 105,8 MiB | 298,2 MiB|
| Diff 94,6 KiB     | `qwen3.6-plus`  | 28,3s |          4 |       90.808 |     358,8 MiB |     356,9 MiB | 105,9 MiB | 307,0 MiB|
| Diff 968,5 KiB    | `qwen3.6-plus`  | 30,9s |          6 |      151.782 |     366,1 MiB |     364,1 MiB | 101,0 MiB | 316,9 MiB|
| Diff 4,84 MiB     | `qwen3.6-plus`  | 24,1s |          4 |       93.271 |     372,8 MiB |     366,0 MiB | 142,8 MiB | 366,0 MiB|

Durchschnitt nach Modell:

| Modell          | Durchschn. Tree RSS peak | Durchschn. Root RSS peak | Durchschn. Durchgänge | Durchschn. Gesamt-Token | Durchschn. max. Wire-Body | Durchschn. gesamtes Tool-Ergebnis |
| --------------- | -----------------------: | -----------------------: | --------------------: | ----------------------: | ------------------------: | --------------------------------: |
| `pai/glm-5`     |                379,1 MiB |                375,3 MiB |                   4,2 |                 99.154 |                  111,8 KiB |                          335,1 KiB|
| `qwen3.6-plus`  |                365,4 MiB |                362,4 MiB |                   4,8 |                118.443 |                  119,3 KiB |                          344,3 KiB|

Überschneidende Momentaufnahme des Modells bei kleinem PR `#4268`:

| Modell                      | Protokoll |  Wand | Durchgänge | Gesamt-Token | Tree RSS peak | Root RSS peak | Max-Wire-Body |
| --------------------------- | --------- | ----: | ---------: | -----------: | ------------: | ------------: | ------------: |
| `pai/glm-5`                 | OpenAI    | 20,1s |          7 |      173.216 |     362,1 MiB |     359,8 MiB |     113,8 KiB |
| `qwen3.6-plus`              | OpenAI    | 35,0s |          6 |      156.556 |     358,9 MiB |     356,9 MiB |     134,1 KiB |
| `DeepSeek/deepseek-v4-pro`  | Anthropic | 39,7s |          2 |       43.362 |     346,9 MiB |     344,8 MiB |     103,0 KiB |

## Anfrage- und Tool-Diagnostik

| Fall              | Modell          | Anfragen | Max-Wire-Body | Max-System-Prompt | Max-Tool-Schema | Tool-Aufrufe | Gesamtes Tool-Ergebnis | Max-Tool-Ergebnis | Max-Funktionsantwort in Anfrage |
| ----------------- | --------------- | -------: | ------------: | ----------------: | --------------: | -----------: | ---------------------: | ----------------: | ------------------------------: |
| kleines PR `#4268`| `pai/glm-5`     |        7 |     113,8 KiB |          51,4 KiB |        40,2 KiB |            9 |               4,7 KiB |          3,9 KiB |                        15,3 KiB |
| Code-Navigation   | `pai/glm-5`     |        2 |     114,6 KiB |          51,5 KiB |        40,2 KiB |            3 |              17,5 KiB |          6,2 KiB |                        18,4 KiB |
| Diff 94,6 KiB     | `pai/glm-5`     |        6 |     111,2 KiB |          39,1 KiB |        37,2 KiB |            9 |              94,9 KiB |         92,6 KiB |                        29,2 KiB |
| Diff 968,5 KiB    | `pai/glm-5`     |        2 |     104,8 KiB |          39,1 KiB |        37,2 KiB |            2 |             772,1 KiB |        771,9 KiB |                        25,6 KiB |
| Diff 4,84 MiB     | `pai/glm-5`     |        4 |     114,7 KiB |          39,1 KiB |        37,2 KiB |            4 |             786,3 KiB |        783,2 KiB |                        34,7 KiB |
| kleines PR `#4268`| `qwen3.6-plus`  |        6 |     134,1 KiB |          51,4 KiB |        40,2 KiB |            5 |              34,6 KiB |         15,6 KiB |                        36,6 KiB |
| Code-Navigation   | `qwen3.6-plus`  |        4 |     114,9 KiB |          51,5 KiB |        40,2 KiB |            3 |              17,5 KiB |          6,2 KiB |                        18,4 KiB |
| Diff 94,6 KiB     | `qwen3.6-plus`  |        4 |     112,8 KiB |          39,1 KiB |        37,2 KiB |            3 |              92,9 KiB |         92,6 KiB |                        33,0 KiB |
| Diff 968,5 KiB    | `qwen3.6-plus`  |        6 |     113,1 KiB |          39,1 KiB |        37,2 KiB |            5 |             778,0 KiB |        771,9 KiB |                        32,1 KiB |
| Diff 4,84 MiB     | `qwen3.6-plus`  |        4 |     121,5 KiB |          39,1 KiB |        37,2 KiB |            4 |             798,5 KiB |        783,2 KiB |                        41,3 KiB |

## Beobachtungen

1. Der Prozessbaum-RSS ist in diesem lokalen Bundle-Durchlauf fast identisch mit dem Root-RSS. Die Lücke zwischen Root und Baum liegt normalerweise unter 10 MiB. Das bedeutet, dass diese Durchläufe keinen anhaltenden Speicherbesitzer in einem Kindprozess zeigten. Der dominante Prozess ist der Haupt-Node-Prozess.
2. Der lokale Bundle-Durchlauf erreicht einen Peak von etwa 0,36–0,41 GiB, nicht die früheren 0,83–1,04 GiB, da die Matrix eine bereinigte temporäre Konfiguration verwendete. Ein nachträglicher Sanity Check mit normaler Konfiguration reproduzierte etwa 1,1 GiB Baum-RSS sowohl mit PATH `qwen` als auch mit lokalem `dist/cli.js`, wobei der zusätzliche Speicher von Kind-MCP/Node-Prozessen im Prozessbaum stammte.
3. Der V8-Heap ist viel kleiner als der RSS. Der End-Heap beträgt etwa 99–143 MiB, während der End-RSS etwa 216–411 MiB beträgt. Der verbleibende Speicherbedarf ist wahrscheinlich auf geladene Module, native Allokationen, externe Puffer oder Runtime-Overhead außerhalb des Live-JS-Heaps zurückzuführen.
4. Der statische Anfrage-Overhead ist groß und wiederholt sich. Der System-Prompt beträgt etwa 39–51 KiB pro Anfrage und das Tool-Schema etwa 37–40 KiB pro Anfrage. Dies erklärt, warum selbst kleine Aufgaben hohe kumulierte Token-Anzahlen erzeugen können, wenn das Modell mehrere Durchgänge benötigt.
5. Große Diff-Ausgaben werden begrenzt, bevor sie die Modellanfrage erreichen. Die Fälle mit 968 KiB und 4,84 MiB Diff erzeugten etwa 772–799 KiB erfasstes Tool-Ergebnis, aber die größte modellseitige Funktionsantwort in einer Anfrage blieb bei etwa 25–41 KiB, und der maximale Wire-Body blieb bei etwa 105–122 KiB. Dies deutet darauf hin, dass die Kürzung / gespeicherte Ausgabeverarbeitung auf dem modellseitigen Pfad funktioniert.
6. Der Speicher steigt bei großen Ausgabefällen dennoch an, obwohl der Wire-Body begrenzt bleibt. Beispielsweise erreichte der 4,84 MiB GLM-Durchlauf 414,2 MiB Baum-RSS und 410,7 MiB End-RSS, und der 4,84 MiB qwen3.6-plus-Durchlauf endete mit 142,8 MiB Heap. Das deutet darauf hin, dass große Tool-Ausgaben die lokale Erfassung, Normalisierung oder den beibehaltenen Runtime-Zustand beeinflussen können, selbst wenn die endgültige Anfragenutzlast begrenzt ist.
7. Die Modellwahl veränderte die Durchgänge und Token-Summen in diesem Durchlauf stärker als den RSS. `qwen3.6-plus` erzielte im Durchschnitt mehr Token und Durchgänge als `pai/glm-5`, aber sein durchschnittlicher Baum-RSS-Peak war etwas niedriger. Dies unterstützt die frühere Schlussfolgerung, dass die Modellwahl nicht die Hauptursache für den Prozessspeicher ist.
## Aktualisierte Arbeitshypothese

Die neuen Diagnosen präzisieren die frühere Hypothese:

- Der benutzersichtbare 1-GiB-Spitzenwert der installierten CLI ist jetzt mit der normalen Konfiguration im lokalen Diagnosepaket reproduzierbar. Der bereinigte Lauf sollte für die interne Qwen-Laufzeitattribution verwendet werden; der Lauf mit normaler Konfiguration sollte für die benutzersichtbare Prozessbaum-Attribution verwendet werden.
- Der größte beobachtete Unterschied zwischen bereinigter und normaler Konfiguration ist die Form des Prozessbaums: Die normale Konfiguration startet zusätzliche MCP/Node-Kindprozesse. Diese Kindprozesse erklären den Großteil des absoluten Anstiegs von etwa 0,35-0,55 GiB auf etwa 1,1 GiB beim minimalen Prompt-Sanity-Check.
- Der `--bare`-Folgetest bestätigt die gleiche Richtung bei `qwen3.6-plus`: Die normale Konfiguration kostet etwa 0,50-0,59 GiB mehr Prozessbaum-RSS als der Bare-Modus bei gleicher Prompt-Form, während sich das Root-RSS nur geringfügig ändert.
- Die Isolierung temporärer Einstellungen ist ein besserer Attributionstest als `--bare`: Das alleinige Deaktivieren von MCP reduziert das Prozessbaum-RSS um etwa 0,42-0,47 GiB, während der normale Einstiegsladepfad erhalten bleibt. Das alleinige Deaktivieren von Hooks zeigt bei Fällen ohne Tool-Aufrufe keine nennenswerte RSS-Änderung.
- Die Pro-MCP-Isolierung zeigt, dass `chrome-devtools` der dominante MCP-Beitragende ist: Es reicht allein aus, um das hohe RSS-Band zu reproduzieren, und seine Entfernung bringt den Lauf nahe an die MCP-freie Baseline zurück.
- Innerhalb der lokalen Qwen-Laufzeit sind die verdächtigsten Bereiche nicht mehr die "rohen Diff-Bytes, die an das Modell gesendet werden". Der modellseitige Request-Body ist begrenzt.
- Die stärkeren Verdächtigen sind die statischen Pro-Request-Kontextkosten, wiederholte Request-Runden, die Tool-Schema-Größe und die lokale Aufbewahrung/Erfassung großer Tool-Ausgaben vor oder außerhalb der modellseitigen Kürzung.
- Da RSS deutlich höher bleibt als der V8-Heap, sollte die nächste Profiling-Ebene die Modul-/Startup-Abrechnung, den externen Speicher und Heap-Snapshots rund um die Tool-Ausführung und die Ausgabe der endgültigen Antwort umfassen.

## RSS-Attribution aus aktuellen Diagnosen

Die aktuellen Zähler identifizieren kein exaktes zurückgehaltenes Objekt oder keine Quellcodedatei, aber sie grenzen ein, was das RSS in diesen lokalen Läufen treibt und was nicht:

| Signal                          | Aktuelle Evidenz                                                                                                                             | RSS-Implikation                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root-RSS vs. Prozessbaum-RSS    | Root- und Baumspitzenwerte liegen normalerweise innerhalb von etwa 2-10 MiB; DeepSeek large PR hat mit etwa 23,6 MiB die größte Lücke          | Kein persistenter Kindprozess erklärt das RSS in diesem lokalen Bundle-Lauf; der Haupt-Node-Prozess dominiert                                    |
| Normaler Konfigurationsprozessbaum | Läufe mit minimalem Prompt und normaler Konfiguration erreichen etwa 1,1 GiB Baum-RSS, während das Root-RSS bei etwa 213-250 MiB bleibt       | Benutzersichtbare 1-GiB-Spitzenwerte können von MCP/Node-Kindprozessen dominiert werden und nicht allein vom Qwen-Root-RSS                       |
| `--bare`-Vergleich              | Normale `qwen3.6-plus`-Läufe erreichen Spitzenwerte von etwa 1,02-1,05 GiB Baum-RSS; Bare-Läufe erreichen Spitzenwerte von etwa 0,45-0,53 GiB | Das Laden der normalen Konfiguration fügt in dieser Umgebung etwa 0,50-0,59 GiB Prozessbaum-RSS hinzu                                            |
| Temporäre MCP-Isolierung        | Das Entfernen der MCP-Server senkt das Startup/Konfig-Baum-RSS von 865-1.017 MiB auf 443-549 MiB                                             | MCP-Startup und MCP-Kindprozesse erklären etwa 0,42-0,47 GiB des Prozessbaum-RSS beim kontrollierten Konfigurationscheck                         |
| Pro-MCP-Isolierung              | `chrome-devtools` allein erreicht etwa 1,0 GiB in wiederholten Samples; ohne ihn bleibt der Lauf bei etwa 461 MiB                            | `chrome-devtools` ist der dominante MCP-Prozessbaum-RSS-Beitragende in dieser Umgebung                                                           |
| Temporäre Hooks-Isolierung      | `disableAllHooks=true` bei weiterhin aktiviertem MCP ändert das Baum-RSS bei Fällen ohne Tool-Aufrufe nur um etwa 13-18 MiB                   | Die Hook-Konfiguration allein ist hier kein sichtbarer Startup-RSS-Treiber; die Hook-Ausführung benötigt noch einen Tool-Call-Benchmark          |
| V8-Heap vs. RSS                 | End-Heap liegt bei etwa 99-143 MiB, während End-RSS bei etwa 216-411 MiB liegt                                                               | Der Live-JS-Heap ist nicht der gesamte Footprint; geladene Module, native Allokationen, externe Puffer oder Laufzeit-Overhead sind wahrscheinlich signifikant |
| PR/Diff-Größe vs. RSS           | DeepSeek small/medium/large PRs skalieren von 1 bis 4.750 geänderten Zeilen, aber das Baum-RSS bleibt in einem engen Band von 340,7-360,0 MiB | Die rohe PR-Größe treibt das RSS nicht linear, sobald die Tool-Ausgabe begrenzt ist                                                              |
| Tool-Ausgabegröße               | Läufe mit großen Diffs erfassen etwa 772-799 KiB Tool-Ergebnisse und zeigen etwas höheres End-RSS / Heap, aber das RSS skaliert nicht linear   | Die Erfassung/Normalisierung von Tool-Ergebnissen trägt Druck bei, insbesondere bei großen Ausgaben, ist aber wahrscheinlich nicht der einzige RSS-Treiber |
| Request-Body-Größe              | Der maximale modellseitige Body liegt zwischen etwa 103-289 KiB, während das RSS im gleichen Band bleibt                                     | Die Request-Serialisierungsgröße beeinflusst Tokens und Latenz deutlicher als die RSS-Spitze                                                     |
| Statischer Pro-Request-Kontext  | System-Prompt ist etwa 39-51 KiB und Tool-Schema etwa 37-48 KiB pro Request                                                                  | Wiederholte Runden sind ein Token-/Kostenverstärker; dies allein erklärt kein RSS, ist aber ein wahrscheinliches Optimierungsziel für Tokendruck  |

Vorläufige Attribution: Im bereinigten lokalen Bundle-Benchmark sieht der RSS-Boden größtenteils wie ein Laufzeit-/Modul-/Native-Footprint während der Aufgabenausführung aus, wobei große Tool-Ausgaben inkrementellen Druck hinzufügen. Im Lauf mit normaler Konfiguration ist die benutzersichtbare 1-GiB-Baumspitze größtenteils eine Frage der Prozessbaum-Zusammensetzung: Qwen-Root plus MCP/Node-Kindprozesse. Die nächste gezielte Messung sollte die Qwen-Root-Diagnosen von den Diagnosen der konfigurierten MCP-Server trennen und dann Startup-/Modul-/Externalspeicher-Checkpoints innerhalb des Qwen-Root-Prozesses hinzufügen.

## Fortschrittsübersicht

Derzeit bestätigte Signale:

1. Der benutzersichtbare 1-GiB-Startup/Konfig-Spitzenwert ist sowohl mit der installierten CLI als auch mit dem lokalen Diagnosepaket reproduzierbar, wenn die normale Konfiguration geladen wird. Er wird nicht primär durch den Diagnose-Branch oder PR `#4186` erklärt.
2. In dieser Umgebung ist diese 1-GiB-Spitze größtenteils das Ergebnis der Prozessbaum-Zusammensetzung: Qwen-Root-Prozess plus Relaunch-Kindprozess plus MCP-Kindprozesse.
3. `chrome-devtools` ist der dominante konfigurierte MCP-Beitragende in der aktuellen Konfiguration. Es reicht allein aus, um das hohe Prozessbaum-RSS-Band zu reproduzieren, selbst wenn der Prompt dieses MCP nicht explizit verwendet.
4. Die normale Relaunch-Form ohne MCP liegt immer noch bei etwa 0,45 GiB Prozessbaum-RSS. Ein einzelner Qwen-Laufzeitprozess ohne den Relaunch-Elternprozess liegt näher an 0,22-0,24 GiB beim Startup-Attributionscheck. Das bedeutet, dass die 0,45-GiB-Baseline keine Einzelprozess-Root-RSS-Zahl ist.
5. In bereinigten nicht-interaktiven Aufgabenläufen ändert die Modellwahl Turns, Token-Summen, Latenz und Request-Größen deutlicher als das RSS. Das RSS blieb in einem relativ engen Bereich über `pai/glm-5`, `qwen3.6-plus` und `DeepSeek/deepseek-v4-pro`.
6. Die aktuellen Kurzaufgaben-Diagnosen zeigen, dass modellseitige Tool/Funktions-Antworten begrenzt sind, aber die lokale Tool-Ergebnis-Erfassung und der Laufzeitzustand können den Heap/RSS bei großen Ausgaben dennoch erhöhen. Dies hält die Aufbewahrung großer Ausgaben auf dem Untersuchungspfad.

Derzeitige Lücken:

1. Die Kurzaufgaben-Benchmark-Matrix ist noch kurzlebig. Ein späterer interaktiver langer Review-Lauf hat einen 41,9-minütigen Fehler reproduziert, aber es ist immer noch nur ein Sample und benötigt Wiederholungsläufe plus Heap-/Objekt-Attribution.
2. Die aktuellen Zähler reichen aus, um Prozessbaum-RSS und Request-Größe zu attribuieren, aber nicht, um den zurückgehaltenen JS-Objektgraphen während langer Sitzungen zu benennen.
3. Startup/Konfig-RSS und OOM bei langen Sitzungen müssen getrennte Spuren bleiben. MCP und Relaunch erklären ein großes Leerlauf-/Startup-RSS-Band; sie erklären nicht von selbst den V8-Heap-OOM nach langen Aufgaben.
4. Das interaktive TUI-Speicherverhalten benötigt noch einen separaten Lauf vom nicht-interaktiven Modus, da die UI-Historie und die statische Ink-Ausgabe nicht auf die gleiche Weise durchlaufen werden.

## OOM-Hinweise aus Issues und PRs bei langen Aufgaben

Die Hinweise aus Issues/PRs deuten auf mehrere verschiedene OOM-Formen hin, nicht auf einen einzigen Fehlermodus:

| Quelle                                                                                                                 | Evidenzzusammenfassung                                                                                                                                      | Zu testende Hypothese                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`#4309`](https://github.com/QwenLM/qwen-code/issues/4309)                                                             | Benutzer berichtet 5,84 GiB Speichernutzung / 7,02 GiB Warnung mit YOLO-Modus und DeepSeek-Backend; Erhöhung des Node-Speichers auf 8 GiB behob das Symptom nicht | Lange autonome Tool-Schleifen können so viel Zustand behalten, dass eine einfache Erhöhung des Old-Space-Limits keine grundlegende Lösung ist |
| [`#4149`](https://github.com/QwenLM/qwen-code/issues/4149)                                                             | Mehrere Berichte zeigen `Ineffective mark-compacts near heap limit`, einschließlich 4 GiB und viel größerer Heap-Limit-Fälle                                  | Ein großer Teil des Heaps ist erreichbarer Anwendungszustand, kein sofort einsammelbarer Müll                                      |
| [`#4116`](https://github.com/QwenLM/qwen-code/issues/4116)                                                             | OOM trat auf, während die Kontextanzeige bei etwa 9,5 % lag; Analyse deutet auf `structuredClone`, UI-Historie, Ink-Statikbaum und große Kontextfenster hin   | Tokennutzung kann niedrig sein, während der JS-Heap-Druck hoch ist; der Tokenschwellwert allein ist keine zuverlässige Speichergrenze |
| [`#4167`](https://github.com/QwenLM/qwen-code/issues/4167)                                                             | Benutzer gibt an, dass der Absturz während der Komprimierung auftrat; Analyse identifiziert den Komprimierungsspeicherspitzenwert als eine eigene Form          | Die Komprimierung kann selbst einen Spitzenwert erzeugen, wenn der Heap bereits hoch ist, insbesondere wenn die Historie gleichzeitig geklont/stringifiziert wird |
| [`#2128`](https://github.com/QwenLM/qwen-code/issues/2128)                                                             | Bericht identifiziert unbegrenzte UI-Historie, zurückgehaltene Datei-Diffs / Terminalausgaben, String-Width-Caches und Checkpoint-Serialisierung              | Interaktive TUI-Langsitzungen können Speicher außerhalb der Modellhistorie und außerhalb nicht-interaktiver Benchmarks behalten      |
| [`#2562`](https://github.com/QwenLM/qwen-code/issues/2562)                                                             | Bericht konzentriert sich auf `GeminiChat.getHistory()`, das die gesamte Historie in langen Sitzungen tief klont                                              | Das vollständige Klonen der Historie kann Speicherspitzen verstärken und sollte getrennt von der gehaltenen stationären Größe gemessen werden |
| [`#4185`](https://github.com/QwenLM/qwen-code/issues/4185)                                                             | Verfolgt V8-Heap-Druck, der das Limit überschreitet, bevor tokenbasierte Kompaktierungen ausgeführt werden                                                    | Eine Heap-Druck-Absicherung ist notwendig, mildert aber nur Symptome, wenn die zurückgehaltenen Daten groß bleiben                   |
| [`#4184`](https://github.com/QwenLM/qwen-code/issues/4184)                                                             | Schlägt Diagnosen und Auslagerung/Vorschau für große zurückgehaltene Tool-Ergebnisse vor                                                                     | Große Tool-Ausgaben können für Modellrequests begrenzt sein, während sie lokal im heißen Speicher verbleiben                         |
| [`#4186`](https://github.com/QwenLM/qwen-code/pull/4186)                                                               | Zusammengeführte Heap-Druck-Autokompaktierung als Sicherheitsnetz und O(1)-Letzte-Historie-Zugriff für `nextSpeakerChecker`                                    | Deckt einen Teil der Heap-Druck- und Klonverstärkung ab, behauptet aber nicht, alle OOM-Klassen zu lösen                             |
| [`#4127`](https://github.com/QwenLM/qwen-code/pull/4127), [`#4168`](https://github.com/QwenLM/qwen-code/pull/4168)     | Offene Kompaktierungsschwellwert-PRs; einer verwendet feste Heap-Schwellwerte, der andere entwirft Token-Schwellwerte und Komprimierungsverhalten neu        | Nützliche verwandte Arbeit, aber Langaufgaben-Tests müssen verifizieren, ob Heap-, Token- und Komprimierungssignale in realen Läufen übereinstimmen |
| [`#3000`](https://github.com/QwenLM/qwen-code/issues/3000), [`#4183`](https://github.com/QwenLM/qwen-code/issues/4183) | Der Diagnose-Fahrplan nennt `/doctor memory`, Heap-Snapshot und begrenzten Speicherzeitstrahl                                                               | Snapshot-/Zeitstrahl-Unterstützung ist erforderlich, um von der RSS-Attribution zur zurückgehaltenen Objektattribution zu gelangen   |

Erste Interpretation:

- Unbenutztes konfiguriertes MCP kann Speicher verbrauchen, weil der normale Startup eine Verbindung zu konfigurierten MCP-Servern herstellt und deren Tools bekannt gibt, bevor die Aufgabe sie benötigt. In der gemessenen Konfiguration startet `chrome-devtools` zusätzliche Node/npm-MCP-Prozesse und erhöht auch die Anzahl der Tool-Schemata von 19 auf 48. Dies erklärt ein großes Startup/Konfig-RSS-Band und kann auch den wiederholten Request-Overhead erhöhen.
- Die OOM-Berichte bei langen Sitzungen sind eine andere Ebene. GC-Logs, bei denen Mark-Compact sehr wenig Speicher freigibt, deuten darauf hin, dass der Heap voller erreichbarer Zustände ist. Die stärksten Kandidaten sind zurückgehaltene Historie/Tool/UI-Objekte, vollständige Historienklone, Komprimierungszwischenergebnisse und Streaming-/Logging-Akkumulatoren.
- PR `#4186` ist eine nützliche Abschwächung, da es basierend auf dem Heap-Druck kompaktieren kann, bevor Tokenschwellwerte ausgelöst werden, und es einen unnötigen vollständigen Historienklon entfernt. Es sollte nicht als Beweis dafür angesehen werden, dass die Aufbewahrung großer Tool-Ausgaben, die Aufbewahrung der UI-Historie oder der Komprimierungsspeicherspitzenwert bereits gelöst sind.

## Validierungsplan für lange Aufgaben

Der nächste Benchmark sollte zwei Spuren getrennt halten:

1. Startup/Konfig-Attribution: normale Konfiguration vs. MCP-deaktiviert vs. nur `chrome-devtools` vs. Kein-Relaunch-Attribution. Dies erklärt, was Benutzer sehen, bevor sinnvolle Arbeit beginnt.
2. Laufzeitwachstum bei langen Aufgaben: wiederholte Tool-Aufrufe, große Ausgaben, Komprimierung, Fortsetzen und interaktive UI-Historie. Dies erklärt OOM nach echter Arbeit.

Empfohlene Testfälle für lange Aufgaben:

| Fall                          | Form                                                                                                  | Warum wichtig                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lange PR-Review-Schleife      | Wiederhole mittlere/große PR-Review-Prompts für 30, 60 und 120 Minuten, mit festem Modell und Konfig   | Ähnelt am meisten berichteten Agent-Workflows; erfasst Turns, Tool-Aufrufe, Token-Wachstum und RSS/Heap-Trend                                       |
| Aufbewahrung großer Tool-Ausgaben | Erzeuge wiederholt begrenzte 1-MiB-/5-MiB-/20-MiB-Befehlsausgaben und stelle dann Folgefragen           | Testet, ob rohe Ausgaben nach der modellseitigen Kürzung lokal beibehalten werden                                                                   |
| Komprimierungsdruck           | Verwende eine niedrigere kontrollierte Old-Space-Grenze und Prompts mit großem Kontext, um Heap-Druck-Kompaktierung auszulösen | Überprüft, ob PR `#4186` vor OOM auslöst und ob die Komprimierung selbst einen neuen Spitzenwert erzeugt                                            |
| Interaktive TUI-Historie      | Führe dieselbe lange Schleife im tmux-TUI-Modus aus und vergleiche mit dem nicht-interaktiven Modus    | Isoliert UI-Historie, statische Ink-Ausgabe, gerenderte Diffs und die Aufbewahrung der Terminalausgabe                                              |
| Fortsetzungs-Stresstest       | Setze eine große gespeicherte Sitzung fort und arbeite sofort weiter                                  | Adressiert `/resume`-OOM-Berichte und die Kosten der Sitzungsrekonstruktion                                                                          |
| Streaming-/Logging-Akkumulator | Erzwinge lange gestreamte Antworten mit aktivierter vs. deaktivierter Telemetrie/Logging               | Testet den vermuteten `collected responses`-/Logging-Aufbewahrungspfad aus der Issue-Analyse                                                         |
| MCP im Leerlauf vs. aktiv     | Führe Varianten ohne MCP, mit konfiguriertem aber ungenutztem `chrome-devtools` und mit aktiv genutztem `chrome-devtools` aus | Trennt das MCP-Kind-RSS im Leerlauf von der tatsächlichen MCP-Tool-Ausführung und dem Tool-Schema-/Token-Overhead                                    |

Metriken, die pro Turn oder Abtastintervall aufgezeichnet werden sollten:

- Root-RSS aktuell/Spitze und Prozessbaum-RSS aktuell/Spitze.
- Anzahl der Kindprozesse und Formen der wichtigsten Kindkommandos.
- V8 `heapUsed`, `heapTotal`, `heap_size_limit`, `external` und `arrayBuffers`.
- Turn-Anzahl, Request-Anzahl, Tool-Call-Anzahl und Tool-Call-Runden.
- Input/Output/Cache/Total Tokens pro Request und pro gesamter Aufgabe.
- Request-Body-Bytes, System-Prompt-Bytes, Tool-Schema-Bytes und Funktionsantwort-Bytes.
- Tool-Ergebnis-Anzahl, gesamte erfasste Tool-Ergebnis-Bytes, maximale Tool-Ergebnis-Bytes und beibehaltene Tool-Ergebnis-Bytes (falls verfügbar).
- Konversationshistorie Nachrichtenanzahl und ungefähre Historie-Bytgröße.
- Nur interaktiv: UI-Historie Elementanzahl und ungefähre beibehaltene Anzeigegröße.
- Komprimierungsversuche, Komprimierungsauslösegrund, Tokens vorher/nachher, Heap-Druck vorher/nachher und Komprimierungsfehlerstatus.
- Heap-Snapshot oder Artefakte eines begrenzten Speicherzeitstrahls, wenn der Heap-Druck einen konfigurierten Schwellwert überschreitet.

Validierungskriterien:

1. Wiederhole mindestens die wichtigsten Langaufgaben-Fälle zweimal. Das Startup-RSS hat sichtbare Varianz, daher sollten Einzellauf-Schlussfolgerungen vermieden werden.
2. Berichte Root-RSS und Prozessbaum-RSS getrennt. Der benutzerseitige Speicherdruck kann von Kindprozessen kommen, während V8-OOM vom Qwen-Root-Heap kommt.
3. Behandle eine flache RSS-Linie als wichtige Evidenz. Wenn Tokens und Tool-Aufrufe wachsen, aber Heap/RSS flach bleibt, liegt das Problem wahrscheinlich woanders.
4. Wenn RSS oder Heap wachsen, korreliere das Wachstum mit einem spezifischen Signal: Tool-Ergebnis-Bytes, Historie-Bytes, UI-Historie-Anzahl, Komprimierungsereignis, Streaming-Akkumulator-Größe oder MCP-Prozessstart.
5. Wenn ein Heap-Snapshot erstellt wird, schreibe zuerst ein strukturiertes Diagnose-JSON, dann den Snapshot. Heap-Snapshots können groß sein und sensible Zeichenfolgen enthalten, daher sollten sie Opt-in und lokal bleiben.

## Reproduktion eines interaktiven langen Reviews

Nachdem die kurzen nicht-interaktiven Prompts immer vor dem Zielfenster beendet waren, wurde ein interaktiver TUI-Benchmark mit Remote-Eingabe ausgeführt. Der CLI-Prozess blieb in einer Sitzung aktiv, während ein Controller jeweils einen echten PR-Review-Turn einreichte. Der nächste Turn wurde erst eingereicht, nachdem der Assistent den Abschlussmarker dieses Turns ausgegeben hatte. Dies vermeidet, dass ein kurzer One-Shot-Prompt als Reproduktion einer langen Aufgabe behandelt wird.
**Setup:**

- Installiert: Qwen Code `0.15.11`, Modell `qwen-latest-series-invite-beta-v28`.
- Temporäres CLI-Home aus den normalen Einstellungen abgeleitet, MCP- und Hook-Konfiguration entfernt. Keine globale Konfiguration wurde geändert.
- Interaktiver TUI-Modus mit dualem JSON-Event-Output und Remote-JSONL-Input.
- Nur statisches PR-Review. Der Prompt hat Dependency-Installation, Build, Test, Playwright, Docker und andere langwierige externe Build-Befehle ausgeschlossen.
- Externe RSS-Sampler haben sowohl den Prozessbaum-RSS als auch den Qwen-Node-Root-RSS alle 5 Sekunden aufgezeichnet.

**Ergebnis:**

| Signal                        |       Wert |
| ----------------------------- | ---------: |
| Wandzeit bis zum Beenden      |   41,9 min |
| Exit-Status                   |          1 |
| Abgeschlossene PR-Review-Durchläufe |          6 |
| Haupt-Chat-Einträge           |      1.076 |
| API-Response-Telemetrie       |        335 |
| Tool-Call-Telemetrie          |        607 |
| MCP-Tool-Call-Telemetrie      |          0 |
| Haupt-/Root-API-Responses     |         36 |
| Subagent-API-Responses        |        299 |
| Root-Total-Tokens             |      2,08M |
| Subagent-Total-Tokens         |     17,24M |
| API-Telemetrie-Tokens gesamt  |     19,32M |
| Max. Root-Input-Tokens        |     85.655 |
| Max. Subagent-Input-Tokens    |    215.207 |
| `/usr/bin/time -l` max. RSS   | 1.072,4 MiB |
| Sampled Qwen Root RSS Peak    | 1.028,2 MiB |
| Sampled Process-Tree RSS Peak | 1.038,1 MiB |

Der Prozess wurde mit folgendem Fehler beendet:

```text
libc++abi: terminating due to uncaught exception of type std::__1::system_error: thread constructor failed: Resource temporarily unavailable
```

Dies ist ein **Thread-Exhaustion**-Fehler, kein V8-Heap-OOM. Der Fehlermechanismus ist anders: Das OS hat sich geweigert, einen neuen Thread zu erstellen, wahrscheinlich aufgrund von Prozess-Ressourcenlimits (`RLIMIT_NPROC`) oder Speicherfragmentierung, die die Stack-Allokation verhindert hat. Er ist trotzdem relevant, weil er in einem deaktivierten MCP-, Build/Test-freien, interaktiven Langzeit-Review aufgetreten ist, bei dem der Qwen-Node-Prozess selbst etwa 1 GiB RSS überschritten hat.
Der Fehler trat während der finalen Zusammenfassungsphase auf, nachdem der Controller bereits sechs Review-Durchläufe abgeschlossen hatte.

Durchlauf-Zeitstrahl und gesampelter Qwen-Root-RSS:

| Zeitfenster     | Durchlauf-Status      | Qwen Root RSS max | Qwen Root RSS am Fensterende |
| --------------- | --------------------- | ----------------: | ---------------------------: |
| 0,0–9,0 min     | Durchlauf 1 beendet   |         701,2 MiB |                    255,3 MiB |
| 9,0–15,1 min    | Durchlauf 2 beendet   |         503,2 MiB |                    494,4 MiB |
| 15,1–24,1 min   | Durchlauf 3 beendet   |         468,7 MiB |                    457,5 MiB |
| 24,1–31,9 min   | Durchlauf 4 beendet   |         619,3 MiB |                    602,3 MiB |
| 31,9–40,3 min   | Durchlauf 5 beendet   |         955,5 MiB |                    955,5 MiB |
| 40,3–40,4 min   | Durchlauf 6 beendet   |         988,6 MiB |                    988,6 MiB |
| 40,4–41,9 min   | Finale Zusammenfassung / Beenden |       1.028,2 MiB |                  1.028,2 MiB |

Token- und Tool-Verteilung:

| Besitzer      | API-Responses | Input-Tokens | Output-Tokens | Tokens gesamt | Max. Input |
| ------------- | ------------: | -----------: | ------------: | ------------: | ---------: |
| Root-Session  |            36 |        2,06M |        22,2 K |        2,08 M |     85.655 |
| Subagents     |           299 |       17,08M |       154,6 K |       17,24 M |    215.207 |

Tool-Call-Telemetrie nach Funktion:

| Tool                | Aufrufe | Erfasste Inhaltslänge |
| ------------------- | ------: | --------------------: |
| `read_file`         |     271 |               1,46 MB |
| `run_shell_command` |     181 |              164,4 KB |
| `web_fetch`         |      80 |              846,3 KB |
| `grep_search`       |      25 |               15,0 KB |
| `glob`              |      15 |               27,8 KB |
| `todo_write`        |      16 |               16,1 KB |
| `list_directory`    |       8 |                6,2 KB |
| `agent`             |      10 |                     0 |
| `tool_search`       |       1 |                2,1 KB |

Der oberste sichtbare TUI-Tokenzähler für einen einzelnen Agenten erreichte etwa 3,83 Mio. Tokens. Die Telemetrie zeigt außerdem, dass der schwerste Subagent bei etwa 4,05 Mio. Gesamt-Tokens lag, mit einer maximalen Input-Anfrage von 215 K Tokens. Damit ist die Subagenten-Verstärkung das dominante Signal in dieser Reproduktion.

**Interpretation:**

1. Dieser Durchlauf trennt das Langzeit-Session-Wachstum vom MCP-Startup-/Konfigurationsspeicher. MCP war deaktiviert und es gab keine MCP-Tool-Aufrufe, trotzdem erreichte der Qwen-Root-Prozess etwa 1 GiB RSS.
2. Der späte Speicherpeak fällt mit subagenten-intensiven Review-Durchläufen und der finalen Zusammenfassung/Rückführung zusammen, nicht mit externen Build/Test-Kindprozessen.
3. Die RSS-Kurve ist kein einfaches lineares Leck. Sie fällt nach frühen Durchläufen, steigt dann nach späteren Subagenten-Durchläufen stark an und bleibt nahe des Endes hoch.
4. Der Fehlermodus ist native Ressourcenerschöpfung und kein V8-Heap-Limit-Stack. Daher sollte der nächste Durchlauf Heap-/External-/ArrayBuffer-/Thread-Count-Sampling hinzufügen. RSS allein kann JS-Heap nicht von nativen Allokationen oder Thread-Ressourcendruck unterscheiden.
5. Die stärksten zu untersuchenden Codepfade bleiben die Aufbewahrung von Subagenten-Transkripten, die Rückführung von Agentenergebnissen, das Klonen des vollständigen Verlaufs, die Checkpoint-/Session-Aufzeichnung und die finale Zusammenfassung/Verlaufsassemblierung.

## Deterministische Huge-Task-Clone-Pressure-Reproduktion

Ein deterministischer Stress-Harness wurde als `scripts/memory-pressure-repro.mjs` hinzugefügt. Er ruft kein Modell auf. Stattdessen konstruiert er einen Qwen-ähnlichen Long-Session-Object-Graphen mit Root-Review-Durchläufen, Subagenten-Transkripten, großen Tool-Ergebnissen, Checkpoint-JSON und zurückgehaltenen `structuredClone()`-Kopien. Dies ergibt eine wiederholbare Reproduktion für den Clone- und Checkpoint-Peak, der aus dem vom Benutzer bereitgestellten OOM-Stack vermutet wird.

Der Harness hat einen leichten Skript-Test:

```bash
npx vitest run --config ./scripts/tests/vitest.config.ts \
  scripts/tests/memory-pressure-repro.test.js
```

Ergebnis: bestanden, 1 Test.

Kontrollierte Durchläufe verwendeten `node --max-old-space-size=256`, sofern nicht anders angegeben.

| Fall                                                | History-Form                                                                 | Clone/Checkpoint-Druck                             | Ergebnis                             |   Max RSS |
| --------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------ | --------: |
| Kleiner Sanity-Test                                 | 2 Durchläufe, 2 KiB Tool-Ergebnis, 1 Subagent                                 | 1 Clone + 1 Checkpoint                            | Bestanden; 2,6 MiB History-JSON      |  89,7 MiB |
| Nur großer Build                                    | 12 Durchläufe, 256 KiB Tool-Ergebnis, 2 Subagents x 12 Subagent-Durchläufe   | Kein zurückgehaltener Clone/Checkpoint            | Bestanden; 76,2 MiB History-JSON     | 491,5 MiB |
| Groß + 1 Clone                                      | wie oben                                                                      | 1 zurückgehaltener `structuredClone()`            | Bestanden                            | 569,6 MiB |
| Groß + 2 Clones                                     | wie oben                                                                      | 2 zurückgehaltene `structuredClone()`-Kopien      | OOM, Exit 134                        | 496,5 MiB |
| Groß + 1 Checkpoint                                 | wie oben                                                                      | Ein Checkpoint mit originalem + geklontem History-JSON | Bestanden; 152,5 MiB Checkpoint-JSON | 926,9 MiB |
| Groß + 2 Checkpoints                                | wie oben                                                                      | Zwei Checkpoint-Kopien                            | OOM, Exit 134                        | 920,1 MiB |
| Groß + 2 Clones, keine zurückgehaltenen Subagent-Transkripte | Gleicher generierter Subagent-Output, aber Parent-History behält nur Zusammenfassungen | Bestanden; Parent-History-JSON sinkt auf 3,8 MiB  | 136,8 MiB |

Der fehlgeschlagene Huge-Clone-Durchlauf erzeugte:

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

Der native Stack enthielt:

- `v8::internal::ValueDeserializer::ReadObjectInternal`
- `v8::internal::ValueDeserializer::ReadDenseJSArray`
- `node::worker::Message::Deserialize`
- `node::worker::StructuredClone`

Dies stimmt mit derselben Stack-Familie überein wie der vom Benutzer bereitgestellte OOM-Log. Die kontrollierte Reproduktion zeigt auch, warum Berichte über 4 GiB / 8 GiB plausibel sind: Der Fehler wird nicht durch ein einzelnes großes Objekt verursacht, sondern durch einen großen zurückgehaltenen History-/Tool-Result-/Subagenten-Status plus eine oder mehrere vollständige History-Clone- oder Checkpoint-Kopien. Ein Erhöhen von `--max-old-space-size` kann den Absturz verzögern, während dasselbe Verstärkungsmuster erhalten bleibt.

Wichtige Erkenntnisse aus diesem deterministischen Durchlauf:

1. Das Erstellen eines 76,2 MiB Parent-History-JSONs kann unter dem reduzierten Heap gelingen. Der OOM tritt auf, wenn zusätzliche vollständige History-Clone-/Checkpoint-Kopien zurückgehalten werden.
2. Eine einzelne Checkpoint-Kopie kann den RSS auf nahe 1 GiB treiben, noch vor dem OOM.
3. Das Entfernen von zurückgehaltenen Subagenten-Transkripten aus der Parent-Hot-History verwandelt dieselbe generierte Workload von OOM in einen kleinen 136,8 MiB RSS-Durchlauf. Das ist das bisher klarste Mitigationssignal.
4. Dieser Reproducer ist synthetisch und absichtlich adversariell, aber er trainiert dieselbe Object-Graph-Form wie das lange interaktive Review: Parent-Session, Subagents, große Tool-Outputs, Transkript-Rückführung und Full-History-Clone-Druck.

## DeepSeek-PR-Größen-Follow-Up

Nach der initialen Modellmatrix wurde ein zusätzlicher Qwen-Code-only-Durchlauf durchgeführt, der `DeepSeek/deepseek-v4-pro` über drei reale PR-Größen getestet hat. Dieses Modell wird über das Anthropic-kompatible Protokoll konfiguriert; die OpenAI-kompatible Ausführung gab bei einem Smoke-Check einen 404 zurück, daher verwendet der erfolgreiche Benchmark `--auth-type anthropic`.

Der Diagnose-Branch wurde erweitert, um Anthropic-Wire-Request-Zusammenfassungen mit derselben Datenschutzregel wie der OpenAI-Pfad aufzuzeichnen: nur aggregierte Zählungen und Byte-Größen, kein Prompt-Text, Diff-Inhalt, Tool-Argumente, Header, Base-URL oder API-Key.

PR-Größen:

| Größe   | PR      | Status  | Dateien | Geänderte Zeilen | Titel                                                                   |
| ------- | ------- | ------- | ------: | ---------------: | ----------------------------------------------------------------------- |
| klein   | `#4268` | gemergt |       1 |                1 | fix(serve): add mcp_guardrails to E2E capabilities expectation          |
| mittel  | `#4186` | gemergt |       6 |              494 | fix(core): add heap-pressure auto-compaction safety net                 |
| groß    | `#4168` | offen   |      25 |            4.750 | feat(core)!: redesign auto-compaction thresholds with three-tier ladder |

Laufzeit:

| Größe   | PR      |   Wandzeit | Durchläufe | Tokens gesamt | Cache-Read-Tokens | Tree RSS Peak | Root RSS Peak | End-Heap |  End-RSS |
| ------- | ------- | ---------: | ---------: | ------------: | ----------------: | ------------: | ------------: | -------: | -------: |
| klein   | `#4268` |     39,7 s |          2 |       43.362  |           28.672  |     346,9 MiB |     344,8 MiB | 115,2 MiB | 304,3 MiB |
| mittel  | `#4186` |    142,6 s |          4 |      135.120  |          115.840  |     340,7 MiB |     337,3 MiB | 103,5 MiB | 285,6 MiB |
| groß    | `#4168` |    191,1 s |          8 |      386.891  |          332.928  |     360,0 MiB |     336,3 MiB | 119,3 MiB | 237,9 MiB |

Request- und Tool-Diagnostik:

| Größe   | PR      | Requests | Anthropic-Wire-Requests | Max. Anthropic-Body | Max. System | Max. Tool-Schema | Tool-Calls | Tool-Ergebnis gesamt | Max. Tool-Ergebnis | Max. Funktionsantwort im Request |
| ------- | ------- | -------: | ----------------------: | -----------------: | ---------: | --------------: | ---------: | ----------------: | --------------: | -------------------------------: |
| klein   | `#4268` |        2 |                       2 |          103,0 KiB |   50,8 KiB |        47,6 KiB |          3 |           0,6 KiB |         0,5 KiB |                          1,1 KiB |
| mittel  | `#4186` |        4 |                       4 |          159,8 KiB |   50,8 KiB |        47,6 KiB |          5 |          30,2 KiB |        29,3 KiB |                         56,7 KiB |
| groß    | `#4168` |        8 |                       8 |          289,5 KiB |   50,8 KiB |        47,6 KiB |         11 |         235,0 KiB |       232,1 KiB |                        182,4 KiB |

DeepSeek-Beobachtungen:

1. Die PR-Größe skalierte Durchläufe, Tokens, Anthropic-Wire-Body-Größe und Tool-Ergebnisgröße klar, aber nicht den RSS proportional. Die Tree-RSS-Peaks für klein/mittel/groß blieben in einem engen `340,7–360,0 MiB`-Band.
2. Der große PR war hauptsächlich teuer in Bezug auf Modellrunden und Token-Volumen: 8 Requests und 386.891 Gesamt-Tokens. Sein maximaler Anthropic-Body war 289,5 KiB, viel größer als die OpenAI-kompatiblen Durchläufe, aber der RSS blieb dennoch in der Nähe desselben lokalen Bundle-Bandes.
3. Die statischen Anthropic-Request-Kosten sind ebenfalls sichtbar: System-Prompt etwa 50,8 KiB und Tool-Schema etwa 47,6 KiB pro Request. Wiederholte Runden sind daher ein wichtiger Token-Verstärker.
4. Der große PR erzeugte 235,0 KiB an erfassten Tool-Ergebnissen und 182,4 KiB maximale Funktionsantwort in einem Request. Dies ist höher als die früheren kleinen PR-/Code-Navigationsfälle und zeigt, dass große PRs immer noch Druck auf die lokale Tool-Ergebnisverarbeitung und Request-Assemblierung ausüben, auch wenn der RSS nicht ansteigt.
5. Der DeepSeek-Durchlauf verstärkt die Modellauswahl-Schlussfolgerung: Die Provider/Modell-Wahl verändert Durchläufe, Latenz, Token-Volumen und Wire-Payload-Form stark, aber der lokale Bundle-RSS-Peak bleibt von der Qwen-Code-Laufzeitform dominiert und skaliert nicht linear mit der PR-Größe.

## Long-Review-JSONL-Replay: History-Clone-Druck

Ein aktueller langer PR-Review-Chat-Datensatz wurde als Post-Mortem-Form für die berichtete OOM-Klasse analysiert. Das rohe JSONL ist hier nicht enthalten, da es Prompt- und Tool-Output-Text enthält. Die aggregierte Form ist:

| Signal                  | Wert                         |
| ----------------------- | ----------------------------- |
| Dauer                   | 87,0 min                      |
| Qwen Code Version       | 0.15.10                       |
| Modell                  | qwen-latest-series beta model |
| API-Responses           | 380                           |
| Tool-Call-Telemetrie    | 507 Ereignisse                |
| MCP-Tool-Call-Telemetrie | 4 Ereignisse                  |
| Subagent-API-Responses  | 313                           |
| Root-API-Responses      | 67                            |
| Root-Prompt-Wachstum    | 38.622 -> 168.555 Tokens      |
| Max. Prompt-Tokens      | 168.555                       |
| Antwort-Tokens gesamt   | 31,28M                        |

Diese Form unterstützt MCP nicht als primäre OOM-Ursache für diesen Fall. Nur 4 von 507 Tool-Call-Telemetrie-Ereignissen waren MCP, und alle vier hatten `content_length=0`. Die dominante Form ist die Long-Session/Subagent-Verstärkung: 15 `agent`-Aufrufe erzeugten 313 Subagent-API-Responses und 403 Subagent-Tool-Call-Ereignisse.

Das Replay hat dann die Chat-`Content[]`-Message-Form aus dem JSONL wiederhergestellt und kontrollierte Clone-/Stringify-Drucktests durchgeführt. Die Basis-retained-Message-Payload ist klein, daher reicht sie allein nicht für einen OOM aus:

| Replay-Skalierung | Zurückgehaltene Clones | History-JSON | Checkpoint-JSON | End-Heap | End-RSS |
| ----------------- | --------------------: | -----------: | --------------: | -------: | ------: |
| 1x                |                     8 |      0,54 MB |         1,08 MB |  18,0 MB | 88,8 MB |
| 30x               |                     8 |     14,46 MB |        28,92 MB | 260,0 MB | 577,8 MB |
| 60x               |                     8 |     28,86 MB |        57,71 MB | 510,3 MB | 960,8 MB |

Das skalierte Replay ist kein Benutzerdaten-Anspruch; es ist eine kontrollierte Verstärkung der beobachteten JSONL-Form, um zu testen, ob Full-History-Clone und Checkpoint-Serialisierung denselben Fehlermodus wie die Berichte erzeugen können.

Eine Low-Heap-Reproduktion mit `--max-old-space-size=256` bestätigt den Mechanismus:

| Fall                        | History-JSON | Ergebnis                                               |
| --------------------------- | -----------: | ------------------------------------------------------ |
| Nur History erstellen       |      38,4 MB | Erfolgreich; Heap 131,6 MB, RSS 378,2 MB               |
| Erstellen + ein Clone       |      38,4 MB | Erfolgreich; Heap 183,3 MB, RSS 463,4 MB               |
| Erstellen + wiederholte Clones |      38,4 MB | OOM nach mehreren zurückgehaltenen `structuredClone()`-Kopien |
| Checkpoint-Doppel-History   |      38,4 MB | OOM beim Halten von History plus geklonter Client-History |

Der Repeated-Clone-OOM-Stack enthält `ValueDeserializer::ReadObjectInternal`, `ValueDeserializer::ReadDenseJSArray`, `node::worker::Message::Deserialize` und `node::worker::StructuredClone`, was mit derselben Stack-Familie übereinstimmt, die im vom Benutzer bereitgestellten OOM-Log zu sehen ist. Dies beweist, dass Full-History-`structuredClone()` der unmittelbare OOM-Auslöser sein kann, ohne dass ein MCP-Server beteiligt ist.

Aktuelle Arbeitshypothese für diese JSONL-Klasse:

1. MCP kann den Startup-RSS in separaten Benchmarks in normaler Konfiguration erklären, ist aber nicht der wahrscheinliche Auslöser für diese Long-Review-OOM-Form.
2. Das Long-Task-Wachstum stammt von zurückgehaltener Chat-History, großen Tool-Outputs, Subagenten-Historien, beobachtbaren Agenten-Messages und UI-/Tool-Result-Status.
3. Der unmittelbare OOM-Auslöser kann ein Full-History-Clone oder eine Checkpoint-artige Doppelserialisierung sein, nachdem der Heap bereits hoch ist.
4. Kompression kann die zurückgehaltene History verringern, aber die Kompression selbst kann einen temporären Peak erzeugen, wenn sie zuerst große History klont oder serialisiert.

### Lokale Mitigation-Validierung: Disabled-MCP-PR-Review-Fall

Zwei gezielte Mitigationen wurden lokal angewendet und validiert, bevor ein Disabled-MCP-PR-Review-Fall erneut ausgeführt wurde:

1. `checkNextSpeaker()` liest jetzt nur die letzte kuratierte Message mit `getHistoryTail(1, true)` und sendet nur diese Message an die Next-Speaker-Seitenabfrage. Der Next-Speaker-Prompt fragt nur nach der unmittelbar vorherigen Modellantwort, daher war das Senden der gesamten History unnötiger Clone- und Token-Druck.
2. `AgentToolInvocation` behält keine vollständigen `responseParts`-Arrays mehr innerhalb der Live-`task_execution.toolCalls`-Anzeige. Die echten Response-Parts fließen weiterhin durch Transcript-/History-Pfade, aber die Parent-UI-Anzeige behält jetzt nur eine begrenzte Textzusammenfassung für verschachteltes Tool-Result-Streaming, anstatt während langer Durchläufe eine weitere vollständige Kopie großer Subagent-Tool-Outputs zu halten.
3. `GeminiChat.sendMessageStream()` erstellt jetzt Modell-Request-Inhalte über eine interne kuratierte History-Ansicht, anstatt die öffentliche `getHistory(true)` aufzurufen. Die öffentliche `getHistory()` gibt immer noch eine defensive `structuredClone()` für externe Aufrufer zurück, aber der Request-Hot-Path klont nicht mehr die gesamte zurückgehaltene Chat-History vor jedem Modellaufruf.

TDD-Prüfungen für diese Mitigationen wurden hinzugefügt:

| Test                                                                                                           | Erwarteter Schutz                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `checkNextSpeaker > should send only the last curated model message to the side query`                         | Verhindert Full-History-Clone/-Send in Next-Speaker-Prüfungen                             |
| `AgentTool > should not retain responseParts in live tool call display after TOOL_RESULT`                      | Verhindert, dass die Live-Subagent-Anzeige große Tool-Responses zurückhält                 |
| `AgentTool > should keep only a bounded result summary in live tool call display`                              | Bewahrt die Lesbarkeit verschachtelter Ergebnisse, ohne den vollständigen Response-Body zurückzuhalten |
| `GeminiChat > sendMessageStream > does not deep-clone the full curated history when building request contents` | Verhindert, dass die Request-Einrichtung den `ValueDeserializer` / `StructuredClone` OOM-Pfad trifft |
Zusätzliche Reproduktion und Fehlerbehebungsvalidierung:

| Schritt                                 | Befehlsschema                                                                                                                                | Ergebnis                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Prä-Fix deterministischer Clone-Druck   | `node --max-old-space-size=256 scripts/memory-pressure-repro.mjs ... --clone-count=2 --mode=clone`                                           | OOM, Exit 134; stderr enthielt `Reached heap limit` und `ValueDeserializer` / `StructuredClone`; max RSS 528,1 MiB im Wiederholungslauf  |
| Red-Test                                | Gezielter `GeminiChat`-Test mit erzwungenem `structuredClone`-Fehler während der Request-Initialisierung                                       | Fehlgeschlagen bei `GeminiChat.getHistory()` vor der Entschärfung                                                                      |
| Green-Test                              | Gleicher gezielter `GeminiChat`-Test nach der Entschärfung                                                                                  | Bestanden                                                                                                                              |
| Built-Code-Rauchtest                    | `node --max-old-space-size=256` gegen das gebaute Core-Paket, mit einem 96‑Einträge / ca. 48 MiB History und erzwungenem `structuredClone`-Fehler | Bestanden; Request hatte 97 Einträge; Prozess-RSS 161,4 MiB, `/usr/bin/time -l` max RSS 161,6 MiB                                      |

Dies präzisiert die frühere Aussage zur „gleichen Stack-Familie“: Der deterministische synthetische OOM belegt weiterhin, dass zurückgehaltene vollständige History-Clones in derselben V8-Stack-Familie wie das Benutzer-Log fehlschlagen können, während der neue `GeminiChat`-Red/Green-Test belegt, dass ein realer Produktions-Request-Setup-Pfad diesen Clone-Punkt nicht mehr erreicht.
Checkpoint/Resume- und Kompressions-Interna benötigen weiterhin separate Langlauf-Validierung, da sie legitimerweise dauerhafte kopierte History benötigen können.

Verifikationsbefehle:

| Befehl                                                                                                                              | Ergebnis                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run src/core/geminiChat.test.ts`                                                                                        | bestanden, 89 Tests                                                                                                                         |
| `npx vitest run src/utils/nextSpeakerChecker.test.ts --coverage=false`                                                              | bestanden, 13 Tests                                                                                                                         |
| `npx vitest run src/tools/agent/agent.test.ts --coverage=false`                                                                     | bestanden, 77 Tests                                                                                                                         |
| `npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/memory-pressure-repro.test.js`                              | bestanden, 1 Test                                                                                                                           |
| `npm run build --workspace=packages/core`                                                                                           | bestanden                                                                                                                                   |
| `npm run build --workspace=packages/cli`                                                                                            | bestanden                                                                                                                                   |
| `npm run typecheck --workspace=packages/core`                                                                                       | bestanden                                                                                                                                   |
| `npm run typecheck --workspace=packages/cli`                                                                                        | bestanden                                                                                                                                   |
| `npm run bundle`                                                                                                                    | bestanden                                                                                                                                   |
| `npm run build`                                                                                                                     | fehlgeschlagen im `packages/vscode-ide-companion` Lint wegen bestehender `import/no-internal-modules`-Regeln; Core, CLI, Bundle und gezielte Tests oben bestanden |

Der vollständige root `npm run build` war in diesem Worktree nicht sauber, weil das `vscode-ide-companion`-Paket auf bestehende `import/no-internal-modules`-Lint-Fehler traf. Der Core/CLI-Build und das Bundle, die für den lokalen Laufzeittest benötigt wurden, wurden erfolgreich abgeschlossen.

Derselbe PR-Review-Prompt wurde dann mit einer temporären Konfiguration ausgeführt, bei der MCP und Hooks deaktiviert waren. Beide Zeilen wurden nach einem begrenzten Langlauf-Fenster unterbrochen, anstatt auf einen vollständigen Review-Abschluss zu warten. **Einschränkung**: Die beiden Läufe sind durch die Workload-Größe (79K vs. 390K Token) konfundiert und können nicht als kontrolliertes Experiment verglichen werden. Der Vergleich zeigt nur richtungsweisende Evidenz.

| Variante               | Laufzeit | MCP-Server | Werkzeuge | Assistant-Nachrichten | Tool-Use/Result-Blöcke | Übergeordnete Tool-IDs | Gesamt-Token | Max. Input-Tokens | Root max RSS |
| ---------------------- | -------- | ---------- | --------- | --------------------- | ---------------------- | ---------------------- | ------------ | ---------------- | ------------ |
| vor Entschärfung       | 365,08s  | 0          | 19        | 42                    | 42 / 42                | 3                      | 79.439       | 26.807           | 357,7 MiB    |
| nach Entschärfung      | 404,52s  | 0          | 19        | 58                    | 52 / 42                | 2                      | 390.339      | 54.000           | 310,5 MiB    |

Dies ist kein deterministischer Apfel-zu-Apfel-Modell-Benchmark: Der gepatchte Lauf hat mehr Arbeit geleistet und deutlich mehr Gesamt-Token vor dem manuellen Abbruch verbraucht. Das nützliche Signal ist enger gefasst: Bei einem deaktivierten MCP-Review-Fall mit mehr beobachteter Arbeit stieg der Root max RSS nicht an und lag etwa 47,2 MiB niedriger. Das unterstützt die Richtung der Entschärfung, beweist aber nicht, dass die gesamte Langlauf-OOM-Klasse behoben ist.

Verbleibende Hochrisiko-Clone/Retention-Pfade zur nächsten Inspektion:

1. Kompression ruft immer noch die vollständige `getHistory(true)` vor der Zusammenfassung auf. Wenn der Heap bereits hoch ist, kann der Kompressionsversuch den Peak erzeugen, der den OOM auslöst.
2. Die Checkpoint-Erstellung kann gleichzeitig die originäre History, geklonte Client-History und eine serialisierte Checkpoint-Payload halten.
3. Fork-Subagenten seeden weiterhin von der Parent-History mit `getHistory(true)`.
4. ACP/History-Export/Summary/Copy-Pfade rufen immer noch die vollständige `getHistory()` auf und sollten separat vom normalen Review-Loop auditiert werden.

Versionstiming:

| Issue  | Erstellt   | Gemeldete Version         | Signal                                                 |
| ------ | ---------- | ------------------------- | ------------------------------------------------------ |
| #2128  | 2026-03-05 | nicht angegeben           | Speicherwachstum in langen UI-Sitzungen                |
| #2562  | 2026-03-21 | nicht angegeben           | `structuredClone` OOM bei langen Sitzungen             |
| #2868  | 2026-04-03 | 0.13.2                    | Heap OOM                                               |
| #2945  | 2026-04-07 | 0.14.0                    | V8 Heap OOM                                            |
| #4116  | 2026-05-13 | 0.15.11                   | OOM mit structured-clone-artiger Analyse               |
| #4134  | 2026-05-14 | 0.15.11                   | OOM                                                     |
| #4149  | 2026-05-14 | 0.15.10-nightly.20260513 | V8 Heap OOM                                            |
| #4167  | 2026-05-15 | 0.15.11                   | Absturz nahe der Kompression                           |
| #4185  | 2026-05-15 | 0.15.11                   | Heap-Druck vor der Token-Kompaktierung                 |
| #4254  | 2026-05-17 | nicht angegeben           | Speicher steigt kontinuierlich                         |
| #4276  | 2026-05-18 | 0.15.11                   | V8 Heap OOM                                            |
| #4309  | 2026-05-19 | 0.15.11                   | Hohe Speicherwarnung um 7 GiB                          |

Der Issue-Verlauf beweist nicht, dass 0.15.10 die OOM-Klasse eingeführt hat; ähnliche Berichte gab es bereits im März und April. Er unterstützt jedoch ein kürzliches Cluster ab etwa 2026-05-13, das sich mit den Releases `v0.15.10`/`v0.15.11` überschneidet. Das relevante Diff zwischen `v0.15.9` und `v0.15.10` hat Subagent-Runtime, nicht-interaktive Ausführung, `GeminiChat` und Kompressionscode stark verändert, daher ist dieser Bereich ein vernünftiges erstes Bisect-Fenster.

## Anmerkungen

- Der erste Code-Navigations-Prompt erlaubte offene Exploration und erreichte `maxSessionTurns`; die erfolgreichen Zeilen oben verwenden eine eingeschränkte Befehlskette.
- Der erste synthetische Diff-Versuch verwendete einen relativen Bundle-Pfad aus den temporären Repositorien; diese schlugen sofort fehl und sind aus den Tabellen ausgeschlossen. Die erfolgreichen Zeilen verwenden den absoluten lokalen Bundle-Pfad.
- Rohe JSONL-Streams werden nicht committet, da sie Prompts, Tool-Befehle und Tool-Output enthalten. Der Bericht enthält nur aggregierte Diagnosen.
# Qwen Code Laufzeit-Speicher-Benchmark-Bericht

Datum: 2026-05-18

## Zusammenfassung

Dieser Bericht dokumentiert lokale Speicher-Benchmarks für das Laufzeitverhalten von Qwen Code. Er vergleicht Qwen Code über Modelle hinweg und zieht einen Vergleich mit Claude Code bei gleichen Aufgabenprofilen, sofern äquivalente Modell-Endpunkte verfügbar waren.

Das Hauptergebnis ist über die aktuelle Matrix hinweg konsistent (ein einzelner Durchlauf pro Zelle, nicht statistisch wiederholt):

- Qwen Code Process-tree RSS-Spitze: etwa `852-1062 MiB` (`0,83-1,04 GiB`).
- Claude Code Process-tree RSS-Spitze: etwa `279-366 MiB` (`0,27-0,36 GiB`).
- Qwen Code lag in den getesteten nicht-interaktiven CLI-Task-Benchmarks etwa `2,3x-3,6x` höher.

Hinweis: Der Process-tree RSS beinhaltet MCP Child-Prozesse (~350 MiB Overhead auf der Qwen-Seite). Dies erhöht die absoluten Zahlen, der relative Vergleich bleibt jedoch aussagekräftig, da beide CLIs auf die gleiche Weise gemessen wurden.

Der Unterschied reproduzierte sich in kleinen PR-Reviews, Code-Navigation und synthetischen Diff-Workloads. Daher ist es unwahrscheinlich, dass er allein durch einen großen PR oder einen einzelnen Modellanbieter erklärt werden kann.

Dieser Bericht soll die aktuelle Performance-Untersuchung transparent machen: was gemessen wurde, welche Schlussfolgerung bereits gestützt wird, was noch unbekannt ist und welche Diagnostiken als nächstes hinzugefügt werden sollten.

## Testumgebung

| Element                                      | Wert                                        |
| -------------------------------------------- | ------------------------------------------- |
| Datum                                        | 2026-05-18                                  |
| Plattform                                    | macOS lokale Entwicklungsmaschine           |
| Qwen Code Version                            | `0.15.11`                                   |
| Qwen Code Binary                             | PATH-aufgelöste `qwen`-Binärdatei           |
| Claude Code Version in der aktuellen Matrix  | `2.1.129`                                   |
| Claude Code Binary in der aktuellen Matrix   | PATH-aufgelöste `claude`-Binärdatei         |
| Node.js Version                              | v22.x (systemweite Standardinstallation)    |
| Sampling-Methode                             | Externes `ps`-RSS-Sampling einmal pro Sekunde|
| Hauptkennzahl                                | Process-tree RSS-Spitze                     |

Der Process-tree RSS wird als Hauptkennzahl verwendet, da Qwen Code einen Root-Wrapper und einen Node/Qwen-Worker startet. Die Betrachtung nur des Root-Prozesses könnte den vom Benutzer wahrgenommenen Speicherverbrauch unterschätzen.

Für die Matrix-Läufe wurden temporäre CLI-Konfigurationsverzeichnisse verwendet, sodass die Benchmarks nicht vom globalen CLI-Zustand abhingen.

## Benchmark-Artefakte

Fünf lokale Berichte wurden vor diesem zusammenfassenden Bericht erstellt:

1. Qwen Code PR-Review-Speicherlauf.
2. Qwen Code Modellvergleichslauf.
3. Strikter Qwen Code vs. Claude Code Vergleich mit `pai/glm-5`.
4. Qwen Code vs. Claude Code, zwei CLIs, zwei Modelle.
5. Qwen Code vs. Claude Code, Fünf-Fälle-Matrix.

Dieser zusammenfassende Bericht deckt die Schlussfolgerungen und Hauptkennzahlen aus allen fünf Berichten ab. Er enthält nicht jede einzelne Rohdatenzeile, jedes Terminal-Transkript oder jedes temporäre Runner-Artefakt. Diese Rohdaten blieben in lokalen `tmp/`-Verzeichnissen, da es sich um Experimentausgaben und nicht um stabile Repository-Artefakte handelt.

Die aktuelle Matrix ist der stärkste Beleg, da sie mehrere Aufgabenprofile und nicht nur einen PR-Review-Workload abdeckt.

## Vorläufige Schlussfolgerung

Die aktuellen Daten sind ausreichend, um zu sagen, dass Qwen Code in diesen lokalen nicht-interaktiven CLI-Task-Benchmarks einen höheren Laufzeit-Speicherverbrauch als Claude Code aufweist. Sie reichen jedoch noch nicht aus, um eine endgültige Ursache zu benennen.

Die führende Erklärung ist ein Laufzeit-/Pfadunterschied von Qwen Code und nicht ein Unterschied der Modellanbieter:

- die Lücke reproduziert sich sowohl mit `pai/glm-5` als auch mit `qwen3.6-plus`;
- die Lücke reproduziert sich in kleinen PR- und Code-Navigationsaufgaben, nicht nur in großen Diff-Aufgaben;
- Qwen Code sendet oder verbucht wiederholt mehr Tokens als Claude Code für ähnliche Arbeit;
- Qwen Codes größte beobachtete Komponente ist der Child-Node/Qwen-Worker-Prozess, was auf den Prozess-Footprint während der Aufgabenausführung, Modulladung, Kontextzusammenstellung, Live-Historie, Tool-Ergebnisaufbewahrung oder Subagent-/gespeicherte Ausgabepfade hindeutet.

Die nützlichste nächste Messung ist daher nicht ein weiterer reiner externer RSS-Lauf. Die nächste Messung sollte RSS in V8-Heap, nativen Speicher, Sitzungs-/Historie-Größe, beibehaltene Tool-Ergebnisgröße und Subagent-/Prozessbaum-Aktivität aufteilen.

## Erste Ursachenanalyse

Der Benchmark beweist noch keine einzelne Ursache, grenzt aber den wahrscheinlichen Problembereich ein.

| Signal                                                                                         | Was es nahelegt                                                                                    | Was es nicht beweist                                                                                                  |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Qwen bleibt in kleinen PR- und Code-Navigationsfällen nahe `1 GiB`                             | Ein hoher nicht-interaktiver Laufzeitspeicher während der Aufgabenausführung ist wahrscheinlich    | Es identifiziert nicht, ob der Footprint V8-Heap, nativer Speicher, Modulladung oder beibehaltener Zustand ist        |
| Die Diff-Größe von 100 KiB bis 5 MiB skaliert nicht linear mit dem RSS                         | Reine Diff-Bytes sind wahrscheinlich nicht der primäre Treiber                                     | Große Ausgaben können den Speicher in realen PR-Review-Flows dennoch verstärken                                       |
| Qwen verwendet in jeder Matrix-Zelle mehr Tokens als Claude                                    | Qwen konstruiert oder behält wahrscheinlich größeren Prompt-/Kontext-/Tool-Ergebnis-Zustand bei     | Die Token-Anzahl ist nicht gleich dem Prozessspeicher und könnte eher eine Wirkung als eine Ursache sein               |
| Tool-Aufrufzahlen sind ähnlich, Claude verwendet manchmal mehr Runden/Tool-Aufrufe bei niedrigerem RSS | Eine längere Tool-Aufrufkette ist allein unwahrscheinlich als Haupterklärung                        | Tool-Ausgabegröße und -Aufbewahrung müssen noch gemessen werden                                                        |
| Frühere große PR-Läufe zeigten Wiederherstellung gespeicherter Ausgaben und Subagent-Verstärkung | Tool-Ausgabenkürzung und gespeicherte Ausgabepfade sind wahrscheinlich Verstärker bei schweren Workloads | Sie erklären nicht den gesamten Ausführungs-Footprint bei kleinen Aufgaben                                              |

Die derzeit beste Erklärung ist daher:

1. **Laufzeitspeicher zur Aufgabenzeit an erster Stelle**: Qwen Code initialisiert oder behält wahrscheinlich mehr Laufzeitzustand während der Ausführung nicht-interaktiver CLI-Tasks bei als Claude Code. Dies kann Agenten-Laufzeit, Tool-Registry, Provider-Adapter, Sitzungsdienste oder UI-/Historie-Strukturen umfassen, die für einen kurzen nicht-interaktiven Task nicht unbedingt benötigt werden.
2. **Kontext-/Tool-Ergebnisvolumen an zweiter Stelle**: Qwen Code scheint für ähnliche Arbeit größeren modellseitigen oder sitzungsseitigen Kontext mitzuführen. Die Token-Lücke macht die Kontextzusammenstellung, Tool-Ergebnisnormalisierung und Historieaufbewahrung zu wichtigen Verdächtigen.
3. **Verstärkung durch große Ausgaben an dritter Stelle**: Große PR-Reviews können zusätzliche gespeicherte Ausgabe- und Subagent-Pfade auslösen. Dies ist wahrscheinlich nicht die alleinige Ursache, kann aber den Speicher- und Token-Druck bei realistischen Review-Aufgaben verschärfen.

Der nächste diagnostische Lauf sollte beantworten, wo das `~1 GiB` sitzt:

- hoch direkt nach dem Start: Modul-/Laufzeit-Startkosten;
- Sprünge nach Tool-Ausführung: Tool-Ausgabeaufbewahrung oder Ergebnisnormalisierung;
- Sprünge während der Request-Zusammenstellung: Konstruktion des Kontexts oder doppelte Historien;
- Anstieg nach Streaming/Kompression: Antwortaufbewahrung oder Kompressionszustand;
- hauptsächlich RSS außerhalb des V8-Heaps: native Puffer, geladene Module oder externer Speicher.

## Aktuelle Matrix

Der aktuelle Benchmark lief mit:

- 2 CLIs: Qwen Code und Claude Code.
- 2 Modellbezeichnungen: `pai/glm-5` und `qwen3.6-plus`.
- 5 Fälle:
  - kleines PR-Review: PR `#4268`, Änderung einer Zeile
  - Code-Navigation: `rg` plus `sed` auf kompressionsbezogenen Dateien
  - synthetischer lokaler Diff, etwa 100 KiB
  - synthetischer lokaler Diff, etwa 1 MiB
  - synthetischer lokaler Diff, etwa 5 MiB

Alle 20 Läufe beendeten mit `0` und ohne Timeout.

## Matrix-Ergebnisse

| Fall             | Modell          | Qwen-Baumspitze | Claude-Baumspitze | Qwen / Claude |
| ---------------- | --------------- | ---------------: | -----------------: | -------------: |
| kleines PR `#4268` | `pai/glm-5`    |     1032,7 MiB   |         357,8 MiB  |         2,89x  |
| kleines PR `#4268` | `qwen3.6-plus` |      852,2 MiB   |         365,5 MiB  |         2,33x  |
| Code-Navigation  | `pai/glm-5`    |      993,1 MiB   |         359,6 MiB  |         2,76x  |
| Code-Navigation  | `qwen3.6-plus` |      996,9 MiB   |         349,0 MiB  |         2,86x  |
| Diff 100 KiB     | `pai/glm-5`    |     1012,1 MiB   |         350,8 MiB  |         2,89x  |
| Diff 100 KiB     | `qwen3.6-plus` |     1001,1 MiB   |         336,2 MiB  |         2,98x  |
| Diff 1 MiB       | `pai/glm-5`    |     1008,3 MiB   |         278,8 MiB  |         3,62x  |
| Diff 1 MiB       | `qwen3.6-plus` |     1003,3 MiB   |         340,5 MiB  |         2,95x  |
| Diff 5 MiB       | `pai/glm-5`    |      858,8 MiB   |         323,2 MiB  |         2,66x  |
| Diff 5 MiB       | `qwen3.6-plus` |     1062,0 MiB   |         331,2 MiB  |         3,21x  |

Durchschnittliche Process-tree RSS-Spitze nach Fall:

| Fall             | Durchschn. Qwen-Baumspitze | Durchschn. Claude-Baumspitze |
| ---------------- | --------------------------: | ----------------------------: |
| kleines PR `#4268` |                  942,5 MiB |                    361,6 MiB  |
| Code-Navigation  |                  995,0 MiB |                    354,3 MiB  |
| Diff 100 KiB     |                 1006,6 MiB |                    343,5 MiB  |
| Diff 1 MiB       |                 1005,8 MiB |                    309,6 MiB  |
| Diff 5 MiB       |                  960,4 MiB |                    327,2 MiB  |

## Laufzeit- und Token-Signale

Die gleiche Matrix zeigte auch, dass Qwen Code in jedem getesteten Fall mehr modellseitige Tokens verwendete.

Ausgewählte Beispiele:

| Fall             | Modell          | CLI    | Dauer  | Runden | Gesamt-Tokens | Tool-Aufrufe |
| ---------------- | --------------- | ------ | ------: | -----: | ------------: | -----------: |
| kleines PR       | `pai/glm-5`    | Qwen   |  25,2s |      2 |        32.567 |           3  |
| kleines PR       | `pai/glm-5`    | Claude |  21,1s |      4 |         7.899 |           3  |
| Code-Navigation  | `qwen3.6-plus` | Qwen   |  25,2s |      2 |        38.151 |           3  |
| Code-Navigation  | `qwen3.6-plus` | Claude |  46,9s |      6 |        25.861 |           5  |
| Diff 100 KiB     | `qwen3.6-plus` | Qwen   |  16,5s |      3 |        57.185 |           2  |
| Diff 100 KiB     | `qwen3.6-plus` | Claude |  17,2s |      3 |         6.377 |           2  |
| Diff 5 MiB       | `pai/glm-5`    | Qwen   |  23,2s |      2 |        38.574 |           2  |
| Diff 5 MiB       | `pai/glm-5`    | Claude |   9,8s |      3 |         5.285 |           2  |

Diese Token-Lücke beweist nicht, dass das Token-Volumen die Speicherursache ist, deutet aber darauf hin, dass Kontextzusammenstellung, Tool-Ergebnisaufbewahrung oder Antwortnormalisierung zusammen mit RSS- und V8-Heap-Statistiken gemessen werden sollten.

## Token-Nutzungsanalyse

Die Token-Lücke ist einer der stärksten Hinweise, benötigt jedoch interne Request-Metriken, bevor sie als Ursache behandelt werden kann.

Was die Daten heute stützen:

- Qwen Code verwendete in jeder Matrix-Zelle mehr Gesamt-Tokens als Claude Code.
- Die Lücke tritt auch auf, wenn die Tool-Aufrufzahlen ähnlich sind.
- Claude verwendete manchmal mehr Runden oder Tool-Aufrufe bei gleichzeitig geringerem Speicher.

Was dies nahelegt:

- Das Token-Delta kommt wahrscheinlich nicht nur von einer längeren Tool-Aufrufkette.
- Qwen könnte größeren statischen Prompt-/Kontextzustand, größere Tool-Schemata, größere serialisierte Tool-Ergebnisse oder mehr beibehaltene Gesprächs-/Sitzungsinhalte mitführen.
- Große Ausgabe-Flows könnten durch Kürzung, Wiederherstellung gespeicherter Ausgaben oder Subagent-Pfade eine weitere Ebene hinzufügen.

Was noch fehlt:

- Aufschlüsselung der Eingabe-Tokens pro Request;
- System-Prompt- und Tool-Schema-Token-Größen;
- Beibehaltene Nachrichten- und Tool-Ergebnisgrößen vor jedem Modell-Request;
- Ob große Ausgaben an mehreren Stellen aufbewahrt werden, z. B. Modell-Historie, UI-Historie, Sitzungsaufzeichnung oder gespeicherter Ausgabespeicher.

Diese fehlenden Metriken sind der Grund, warum der nächste Schritt interne Diagnostiken hinzufügen sollte, anstatt nur den externen RSS-Benchmark zu wiederholen.

## Früheres Signal eines großen PR-Reviews

Ein früherer strikter PR-Review-Benchmark verwendete PR `#4186` und zeigte das gleiche allgemeine Muster:

| Modell          | CLI         | Process-tree RSS-Spitze |
| -------------- | ----------- | ----------------------: |
| `pai/glm-5`    | Qwen Code   |            1000,7 MiB   |
| `pai/glm-5`    | Claude Code |             349,0 MiB   |
| `qwen3.6-plus` | Qwen Code   |            1095,8 MiB   |
| `qwen3.6-plus` | Claude Code |             341,1 MiB   |

Dieser frühere Lauf allein war nicht ausreichend, da ein großer PR ungewöhnliche Tool-Ausgabe- und gespeicherte Ausgabepfade auslösen kann. Die aktuelle Fünf-Fälle-Matrix macht die Erkenntnis stärker, da auch kleine PR- und Code-Navigationsaufgaben die Lücke reproduzieren.

## Arbeitshypothese

Die aktuellen Belege stützen die folgenden Hypothesen, sortiert nach Priorität:

1. Qwen Code hat einen höheren nicht-interaktiven Prozess-Footprint zur Aufgabenzeit als Claude Code. Der Qwen-Child-Node-Worker war typischerweise der größte Prozess im lokalen Sampling, oft um `0,7-0,8 GiB`.
2. Die Modellwahl ist nicht die Haupterklärung. Sowohl `pai/glm-5` als auch `qwen3.6-plus` zeigten die gleiche grundsätzliche Qwen-vs.-Claude-Lücke.
3. Die alleinige Diff-Größe ist nicht die Haupterklärung. Die synthetische Diff-Größe skalierte nicht linear von 100 KiB auf 5 MiB, wahrscheinlich weil die Tool-Ausgabenkürzung begrenzt, wie viel Ausgabe das Modell erreicht.
4. Die Kontext-/Tool-Ergebnisbehandlung ist immer noch ein wahrscheinlicher Beitragsfaktor. Qwen Code verwendete in jeder Matrix-Zelle mehr Tokens als Claude Code, und frühere große-PR-Läufe zeigten Wiederherstellung gespeicherter Tool-Ausgaben und Subagent-Verstärkungspfade.
5. Die nächste diagnostische Ebene sollte V8-Heap, natives RSS, Kosten für Modulladung/Laufzeitstart, Sitzungshistorie, UI-Historie, Tool-Ergebnisaufbewahrung und Subagent-Aktivität trennen. Externes RSS allein kann diese Ursachen nicht unterscheiden.

## Einschränkungen

- Es handelt sich um einzelne Läufe pro Matrix-Zelle, nicht um wiederholte statistische Stichproben.
- RSS ist externer Prozess-RSS. Er kann nicht zwischen V8-Heap, nativen Puffern, Modulladung, beibehaltenen Tool-Ausgaben, UI-Zustand oder Sitzungshistorie unterscheiden.
- Claude Code und Qwen Code verwenden unterschiedliche Laufzeitimplementierungen und Protokolladapter, selbst wenn die Modellbezeichnungen identisch sind.
- Der Benchmark wurde lokal auf macOS durchgeführt. Linux-Server sollten getestet werden, bevor deploymentspezifische Schlussfolgerungen gezogen werden.

## Empfohlene Folgemessungen

Der nächste lokale Untersuchungszweig sollte Diagnostiken hinzufügen oder nutzen für:

- `process.memoryUsage()` vor und nach Start, Tool-Ausführung, Streaming, Kompression und Sitzungsabschluss.
- V8-Heap-Statistiken und Heap-Bereiche.
- Aktive Handles und Requests.
- Sitzungsnachrichtenzahl und ungefähres beibehaltenes Zeichen-/Token-Volumen.
- Tool-Ergebnisanzahl, Gesamtgröße der beibehaltenen Tool-Ergebnisse, größte Tool-Ergebnisgröße und ob große Ausgaben von der UI-Historie oder der Modell-Historie aufbewahrt werden.
- Subagent-Anzahl und Child-Prozess-/Prozessbaum-RSS.
- Tool-Ausgabenkürzungs- und Wiederherstellungsereignisse für gespeicherte Ausgaben.

Diese Messungen sollten mit der gleichen Benchmark-Matrix erhoben werden, damit der aktuelle RSS-Vergleich mit dem internen Zustand von Qwen Code verknüpft werden kann.
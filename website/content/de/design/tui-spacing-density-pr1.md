# TUI Spacing und Density PR1

## Warum

Die aktuelle TUI verbraucht oft zusätzliche Zeilen für Abstände vor der Assistant-Ausgabe, zwischen Status-/Tool-Blöcken und innerhalb erweiterter Tool-Gruppen. In gängigen Sessions erschwert dies das Überfliegen von einfachen Antworten, Dateilisten, Tool-Ausgaben, Fehlerzuständen, Diffs und langen Streaming-Ausgaben, da Nutzer durch leeren Raum statt durch Inhalte scrollen müssen.

Dieser PR ist der erste fokussierte Durchlauf für QwenLM/qwen-code#4588. Er behandelt ausschließlich Abstände und Dichte, damit im Review die Zeilennutzung vorher und nachher verglichen werden kann, ohne gleichzeitig die Thinking-Sichtbarkeit, Tool-Ränder, SubAgent-Layout, Branding oder Theme-Farbänderungen zu prüfen.

## Wie

Die Implementierung lässt die bestehende Informationsstruktur und Rendering-Oberflächen intakt:

- Die Abstände der History-Items werden in der Nähe von `HistoryItemDisplay` zentralisiert. User-Prompts und eigenständige Command-Views beginnen weiterhin mit einem Turn-Separator, während Assistant-Fortsetzungen, Tool-Gruppen, Statusnachrichten, Tool-Zusammenfassungen und damit verbundene In-Turn-Ausgaben keine zusätzliche führende Spacer-Zeile mehr hinzufügen.
- Erweiterte Tool-Gruppen behalten ihre aktuelle Border- und Status/Title-Struktur bei, fügen aber keine Leerzeilen mehr zwischen benachbarten Tool-Einträgen ein.
- Tool-Ergebnisse werden direkt unter der Tool-Title/Status-Zeile gerendert. Dies entfernt die zusätzliche Leerzeile zwischen dem Tool-Header und seiner Ausgabe, ohne den Inhalt der Ausgabe, Truncation, Shell-Fokus, Bestätigungs-Prompts oder das Compact-Mode-Verhalten zu ändern.

Das Verhalten von Markdown-Leerzeilen bleibt absichtlich unverändert. Der Renderer fasst bereits aufeinanderfolgende Leerzeilen zu einem einzigen Spacer zusammen und bewahrt komplexe Blöcke wie Tabellen, Code-Blöcke und Mathe-Blöcke.

## Spacing-Standard

- Unabhängige User-Turns behalten einen visuellen Separator.
- Assistant-Ausgaben und In-Turn-Folgeblöcke fügen keinen zweiten Separator hinzu.
- Tool-Header und Tool-Ergebnisinhalt liegen direkt aneinander.
- Erweiterte Multi-Tool-Gruppen fügen keine Leerzeilen zwischen den einzelnen Tool-Einträgen ein.
- Komplexe Markdown-Blöcke behalten ihr bestehendes internes Layout.

## Erwarteter Effekt

Bei gleicher Terminalbreite und gleichem gerenderten Inhalt sollten Zielszenarien weniger sichtbare Zeilen verbrauchen:

- Einfache Q&A sollten mindestens eine sichtbare Zeile einsparen.
- Erweiterte Tool-Ausgaben sollten für jedes gerenderte Tool-Ergebnis, das zuvor einen leeren Header/Ergebnis-Spacer hatte, mindestens eine Zeile einsparen.
- Multi-Tool-Gruppen sollten eine Zeile zwischen jedem benachbarten Tool-Eintrag einsparen.
- Szenarien für Projektinspektion, Diff, Dateiliste, Fehler und Long-Stream sollten keine Zeilen hinzufügen, es sei denn, Änderungen beim Terminal-Wrapping machen dies unvermeidbar.

## Messung

Die automatisierten Spacing-Assertions und Terminal-Nachweise verwenden 100-Spalten-Fixtures für die geänderten Regeln:

| Szenario                                        | Breite | Baseline-Zeilen | PR1-Zeilen | Delta | Nachweis                                                                                                     |
| ----------------------------------------------- | -----: | --------------: | ---------: | ----: | ------------------------------------------------------------------------------------------------------------ |
| Einfache Assistant-Antwort                      |   100 |             2 |        1 |    -1 | führender History-Spacer entfernt                                                                            |
| Tool-Header mit einzeiligem Ergebnis            |   100 |             3 |        2 |    -1 | Header und Ergebnis liegen direkt aneinander                                                                 |
| Erweiterte 3-Tool-Gruppe mit Ergebnissen        |   100 |            16 |       11 |    -5 | ein Header/Ergebnis-Spacer pro Tool-Ergebnis und ein Tool-Separator zwischen benachbarten Tools entfernt     |
| Vollständige repräsentative Fixture             |   100 |            26 |       19 |    -7 | gleicher gerenderter Inhalt in tmux erfasst                                                                  |

Die Snapshot-Diffs decken auch die bestehenden 80-Spalten-Fixtures ab, um dieselben Zeilenanzahl-Deltas im aktuellen Komponententest-Harness zu bestätigen.

## Nicht im Scope

- Ausblenden von Thinking-Traces.
- Entfernen von Tool-Borders.
- Neugestaltung der SubAgent-Ausgabe.
- Ändern des Startup-Brandings oder des Banners.
- Ändern der Theme-Farben.
- Hinzufügen der verstrichenen Zeit pro Assistant-Turn.
- Ändern der Inline-Code-Hervorhebung in Tabellen.
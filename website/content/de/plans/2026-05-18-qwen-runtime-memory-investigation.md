# Qwen Code Laufzeitspeicher-Untersuchungsplan

Datum: 2026-05-18

## Kontext

Lokale Benchmarks zeigen, dass Qwen Code bei ähnlichen nicht-interaktiven CLI-Aufgabenformen deutlich mehr process-tree RSS verwendet als Claude Code. Die letzte Fünf-Fall-Matrix ergab Spitzenwerte von etwa `0.83-1.04 GiB` für Qwen Code, während Claude Code bei etwa `0.27-0.36 GiB` blieb.

Dieses Dokument schlägt einen Entwurf für eine Untersuchungs- und Optimierungsrichtung vor. Es ist nicht dazu gedacht, bereits eine endgültige Ursache zu benennen. Das unmittelbare Ziel ist es, die Speicherlücke überprüfbar, reproduzierbar und mit internen Diagnosen erklärbar zu machen.

## Bisheriger Fortschritt

Die Untersuchung hat die Phase der Belege und Richtungsbestimmung erreicht:

- Eine wiederholbare lokale Matrix wurde für kleine PR-Reviews, Codenavigation und synthetische Diff-Workloads erstellt.
- Qwen Code wurde mit mehreren Modellen verglichen.
- Qwen Code und Claude Code wurden bei denselben Aufgabenformen verglichen, wo gleichwertige Modell-Endpunkte verfügbar waren.
- Die beobachtete RSS-Lücke ist konsistent genug, um tiefere Laufzeitdiagnosen zu rechtfertigen.
- Verwandte vorgelagerte Arbeiten wurden kartiert, sodass diese Untersuchung auf bestehenden `/doctor memory`- und Speicherdiagnose-Folgearbeiten aufbauen kann.

Die Untersuchung hat noch nicht die Phase der endgültigen Ursachenfindung erreicht, da externer Prozess-RSS nicht zeigen kann, ob der zurückgehaltene Speicher aus V8-Heap, nativem Speicher, geladenen Modulen, Live-Verlauf, Tool-Ergebnissen oder Request-Assembly-Zustand besteht.

## Aktuelle Belege

Der begleitende Benchmarkbericht ist:

- `docs/e2e-tests/2026-05-18-qwen-memory-benchmark-report.md`

Die Hauptbelege sind:

- Die RSS-Lücke zwischen Qwen und Claude reproduzierte sich bei kleinen PR-Reviews, Codenavigation und synthetischen Diff-Workloads.
- Die Lücke reproduzierte sich sowohl mit `pai/glm-5` als auch mit `qwen3.6-plus`.
- Qwen Code verwendete in jeder getesteten Matrixzelle mehr Tokens als Claude Code.
- Große Diff-Größe führte nicht zu einem sauberen linearen Speicheranstieg, was darauf hindeutet, dass die Basislinien- und begrenzten/gekürzten Ausgabepfade mehr zählen als die reinen Diff-Bytes.

## Verwandte Arbeiten

Es gibt bereits relevante vorgelagerte Arbeiten:

| Punkt    | Status               | Rolle in der Speicherarbeit                                                                                         |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `#4180`  | gemergter PR         | Fügt Basis-`/doctor memory`-Diagnose hinzu. Dies ist das erste Instrumentierungsstück.                             |
| `#4181`  | offenes Ticket, kein PR | Fügt Interpretation und Druckklassifikation für `/doctor memory` hinzu.                                           |
| `#4182`  | offenes Ticket, kein PR | Fügt strukturierte `/doctor memory --json`-Ausgabe und sichere Session-skalierte Statistiken hinzu.                |
| `#4183`  | offenes Ticket, kein PR | Fügt optionale Heap-Snapshots und begrenzte Speicher-Zeitachsen-Diagnosen hinzu.                                    |
| `#4184`  | offenes Ticket, kein PR | Fügt große Tool-Ergebnis-Aufbewahrungsdiagnosen hinzu und entwirft Offload/Preview-Minderung.                     |
| `#4127`  | offener PR, widersprüchlich | Fügt Heap-Druck-Sicherheitsnetze für langzeitige OOM-Prävention hinzu. Nützliche Minderung, nicht ausreichend für Attribution. |
| `#4168`  | offener PR           | Überarbeitet Auto-Kompaktionsschwellen. Nützlich für Kontextdruck, nicht ausreichend für Analyse der Aufgabenzeit-Fußabdrucks. |
| `#4172`  | offener PR           | Entkoppelt Auto-Speicher-Abruf vom Hauptanforderungspfad. Nützlich für Latenz/Blockierung, kein direkter RSS-Nachweis. |
| `#4188`  | gemergter PR         | Begrenzt Build/Test-Caches, um OOM in parallelen Testläufen zu verhindern. Wichtig, aber getrennt von Laufzeitbenchmarks. |

Diese Untersuchung sollte auf dieser Richtung aufbauen, anstatt darauf zu warten, dass alle Folgetickets umgesetzt werden.

Der Großteil der verbleibenden Arbeit ist instrumentierungsorientiert. Die offenen Diagnose-Tickets sind darauf ausgelegt, Speicherberichte erklärbar zu machen, bevor ein Laufzeit-Fix versucht wird. Die offenen Minderungs-PRs können bestimmte OOM-Pfade reduzieren, erklären aber noch nicht, warum kurze nicht-interaktive CLI-Aufgaben wiederholt Spitzenwerte von nahe `1 GiB` erreichen.

## Warum Dieser Entwurf Mit Dokumentation Beginnt

Dieser Entwurf beginnt absichtlich mit Benchmark-Belegen und einem Untersuchungsplan, anstatt eine Laufzeit-Codeänderung zu bündeln.

Gründe:

1. Das aktuelle Ziel ist es, das Leistungsproblem und die Richtung sichtbar zu machen, nicht eine sofortige Lösung zu beanspruchen.
2. Das Hinzufügen von Instrumentierung und Optimierung im selben PR würde die Überprüfung erschweren, weil es Messung, Diagnose und Verhaltensänderungen vermischt.
3. Der bestehende Benchmark unterstützt bereits die Notwendigkeit tieferer Diagnosen.
4. Der nächste PR kann enger und leichter zu validieren sein: nur Diagnostik, dann erneutes Ausführen derselben Matrix und Vergleich interner Metriken.

Der nächste Implementierungs-PR sollte die fehlenden Zähler und Zeitachsenpunkte hinzufügen, dann die Benchmark-Matrix erneut ausführen. Erst danach sollte ein gezielter Optimierungs-PR versuchen, den Speicher zu reduzieren.

## Arbeitshypothese

Die aktuellen Daten deuten eher auf ein Qwen Code-Laufzeit-/Pfadproblem hin als auf ein Modellanbieterproblem.

Die stärkste aktuelle Schlussfolgerung ist:

> Qwen Code scheint einen hohen Fußabdruck bei der Ausführung nicht-interaktiver CLI-Aufgaben zu haben, der wahrscheinlich durch größeres Kontext-/Tool-Ergebnis-/Session-Handling verstärkt wird. Der wahrscheinliche Problembereich ist die CLI-Laufzeit und der Agent-Datenpfad, nicht das ausgewählte Modell allein.

Genauer gesagt, die Belege deuten darauf hin, dass „zu viele Tool-Aufrufe“ nicht die Hauptursache sind. Die Anzahl der Tool-Aufrufe war über verschiedene CLIs hinweg ähnlich, und Claude verwendete manchmal mehr Runden oder Tool-Aufrufe, während es einen niedrigeren RSS beibehielt. Das plausiblere Problem ist, dass Qwen Code für dieselbe kurze nicht-interaktive CLI-Aufgabe einen schwereren Zustand initialisiert oder beibehält und diesen Ausführungsfußabdruck dann mit größeren Kontext-, Tool-Ergebnis-, gespeicherten Ausgabe- oder Session-Verlaufsdaten verstärkt.

Die wahrscheinlichsten Bereiche sind:

1. **Prozess- und Modulstart-/Ausführungskosten**: Qwen Code initialisiert möglicherweise mehr Laufzeit, Tools, UI/Session-Infrastruktur oder Provider-Mechanismen als für nicht-interaktive CLI-Aufgaben erforderlich.
2. **Verlaufs- und Kontextzusammenstellung**: Qwen Code behält oder erstellt möglicherweise einen größeren modellseitigen Kontext als Claude Code für dieselbe Aufgabenform.
3. **Tool-Ergebnis-Aufbewahrung**: große oder wiederholte Tool-Ergebnisse können im Live-Verlauf, UI-Verlauf, Chat-Aufzeichnungen oder in Wiederherstellungspfaden für gespeicherte Ausgaben aufbewahrt werden.
4. **Subagent- und gespeicherte Ausgaben-Verstärkung**: frühere große PR-Tests zeigten Wiederherstellung gespeicherter Ausgaben und Subagent-Aktivität, was Speicher- und Token-Druck hinzufügen kann.
5. **MCP-Kindprozesse**: der begleitende Diagnosebericht zeigte, dass MCP-Server (z.B. chrome-devtools) zu ~350 MiB zum process-tree RSS beitragen. Dies bläht die absoluten Zahlen auf, ist aber ein konstanter Overhead, der unabhängig von der Sitzungslänge ist.
6. **Nativer Speicher vs. JS-Heap-Aufteilung**: externer RSS kann nicht sagen, ob der Druck vom V8-Heap, nativen Puffern, geladenen Modulen oder aufbewahrten Daten ausgeht.

Dies ist bewusst als Schlussfolgerung formuliert. Der nächste Schritt ist, genügend interne Messungen hinzuzufügen, um jeden Bereich zu bestätigen oder auszuschließen.

## Vorgeschlagener Entwurf-PR-Umfang

Der erste Entwurf-PR sollte sich auf Belege und Diagnostik konzentrieren:

1. Den Benchmarkbericht und Untersuchungsplan committen.
2. Lokale Diagnoseausgabe hinzufügen oder erweitern, damit Qwen Code Folgendes melden kann:
   - V8-Heap- und Heap-Space-Statistiken.
   - RSS vs. Heap-Aufteilung.
   - Session-Nachrichtenanzahl und ungefähre aufbewahrte Größe.
   - Tool-Ergebnisanzahl, gesamte aufbewahrte Größe und größte aufbewahrte Ergebnisgröße.
   - Kürzungs- und Wiederherstellungszähler für gespeicherte Ausgaben.
   - Subagent-/Prozessbaum-Aktivität, sofern verfügbar.
3. Führen Sie die vorhandene Matrix erneut aus gegen:
   - aktuell veröffentlichter Qwen Code,
   - aktueller `main`,
   - diagnose-only Branch,
   - Kandidaten-Optimierungs-Branch.
4. Verwenden Sie diese Messungen, um ein kleines Optimierungsziel auszuwählen.

Der erste PR sollte vermeiden, mehrere nicht zusammenhängende Optimierungen zu mischen. Er sollte entweder nur Dokumentation bleiben oder nur Diagnosecode hinzufügen. Ein separater PR sollte die erste Laufzeitspeicherreduzierung durchführen, sobald die Ursache klarer ist.

## Kandidaten-Optimierungsrichtungen

Dies sind Kandidaten, keine Schlussfolgerungen:

1. **Begrenzte Tool-Ausgabe-Aufbewahrung**: speichern Sie große Ausgaben außerhalb des heißen Pfads und behalten nur Vorschau, Metadaten und Abrufzeiger im Live-Verlauf.
2. **Nicht-interaktives Lazy Loading**: vermeiden Sie die Initialisierung von TUI-only oder interaktiven Subsystemen während der Ausführung nicht-interaktiver CLI-Aufgaben.
3. **Session/UI-Verlaufsbegrenzungen**: stufen Sie alte oder schwere Verlaufselemente zu kompakten Transkripteinträgen herab.
4. **Kontextzusammenstellungs-Buchhaltung**: messen und begrenzen Sie große Tool-Ergebnisse vor der Modellanforderungskonstruktion.
5. **Subagent-Buchhaltung**: legen Sie Subagent-Lebenszyklus und Speicherauswirkungen in Diagnosen offen.

Claude Code und OpenAI Codex (OpenAIs CLI-Codierungsagent) sollten als Design-Referenzen für Diagnosetrennung, begrenzte Ausgabeaufbewahrung und verzögertes Laden des Verlaufs verwendet werden. Die Implementierung sollte dennoch der eigenen Architektur und den Tests von Qwen Code folgen.

## Validierungsplan

Die Untersuchung sollte dieselbe Benchmark-Matrix beibehalten, damit Vorher-/Nachher-Ergebnisse vergleichbar bleiben:

- kleines PR-Review
- Codenavigation
- synthetischer Diff etwa 100 KiB
- synthetischer Diff etwa 1 MiB
- synthetischer Diff etwa 5 MiB

Für jeden Lauf erfassen:

- process-tree RSS-Spitze
- Root-Prozess RSS-Spitze
- V8-Heap-Spitze
- Heap-Space-Zusammenfassung
- Dauer
- Runden
- Token-Anzahl
- Tool-Aufruf-Anzahl
- größtes aufbewahrtes Tool-Ergebnis
- gesamte aufbewahrte Tool-Ergebnis-Größe
- Session/Verlauf-Elementanzahl
- Subagent-Anzahl

Die Mindesterfolgsbedingung für eine Kandidatenlösung ist nicht nur „RSS gesunken“. Sie sollte auch identifizieren, welche interne Metrik sich geändert hat und warum.

## Nächster PR-Kandidat

Der nächste PR sollte nur Diagnose enthalten und das Laufzeitverhalten nicht ändern. Ein minimaler nützlicher Ausschnitt würde Folgendes hinzufügen:

- Buchhaltung der Modellanforderungseingabegröße;
- Buchhaltung der System-Prompt- und Tool-Schema-Größe;
- Anzahl der aufbewahrten Nachrichten und ungefähre aufbewahrte Zeichengröße;
- Anzahl der aufbewahrten Tool-Ergebnisse, Gesamtgröße und größte Elementgröße;
- Lebenszyklus-Stichproben rund um Start, erste Anforderungszusammenstellung, Tool-Ausführung, Streaming-Abschluss, Komprimierung und endgültige Antwort;
- Prozessspeicher-Stichproben, die RSS, Heap belegt, Heap gesamt, extern und Heap-Space-Statistiken enthalten.

Nachdem das lokal eingespielt ist, führen Sie dieselbe Qwen-Modell-Matrix erneut aus und vergleichen Sie:

- veröffentlichter Qwen Code;
- aktueller `main`;
- diagnose-only Branch;
- Kandidaten-Optimierungs-Branch.

## Nicht-Ziele

Dieser Entwurf behauptet nicht, dass:

- der gesamte Speicherdruck durch Tool-Ausgabe verursacht wird;
- ein bestehender offener PR den beobachteten Aufgabenzeits-Fußabdruck lösen wird;
- Modellanbieterunterschiede in jeder Umgebung irrelevant sind;
- einzelne lokale Messungen für Leistungsaussagen auf Release-Ebene ausreichen.

Die beabsichtigte Aussage ist enger: Qwen Code zeigt eine konsistente lokale RSS-Lücke in den getesteten Workloads, und das Projekt benötigt interne Diagnosen, um diese Lücke zu erklären und zu reduzieren.
# Agent Loop Rundenreduzierungsstrategie: Vom Skill-Design ausgehen

> Im selben Verzeichnis wie `rt-optimization-design.md` und ergänzend dazu: Jenes Dokument diskutiert die Rundenreduzierung auf **Framework-Ebene** (D1 Überspringen der letzten Zusammenfassungsrunde, D2 Fast-Routing, D4 Prevalidation); dieses Dokument argumentiert, dass der **wirkliche Hebel der Rundenreduzierung auf der Skill-/Tool-Design-Ebene liegt** und schlägt einen umsetzbaren Pfad vor, der weder Framework-Modifikationen noch Cache-Hit-Rate-Daten benötigt.

---

## 0. Abnahmespezifikation (Entwicklungs-Gate)

> Dieser Abschnitt ist das **vorgeschaltete Gate** für die Entwicklung – er listet auf, welche Spezifikationen vor Beginn der Arbeit bestätigt werden müssen und welche datengetrieben später folgen. Die Spezifikationen vorzuziehen statt „erst nach dem Schreiben auf die Metriken zu schauen" soll vermeiden: (a) dass man nach dem Schreiben feststellt, dass die Metriken nicht messbar sind, (b) dass Schwellenwerte aufgrund von Ergebnisschwankungen zu verzerrten Schlussfolgerungen führen, (c) dass keine Abbremschwelle gesetzt wird und das Projekt in „sieht nach Arbeit aus, bringt aber nichts" verfällt.
>
> **Anwendungsbereich dieses Spezifikationsrahmens**: Der Rahmen geht davon aus, dass die Richtigkeit der Richtung nach der P1.5-Baseline gemessen werden kann. Diese Annahme gilt für das Szenario „Rundenreduzierung", da es klare messbare Signale gibt (Anzahl Runden, Followup-Rate, Batch-Größe). **Szenarien außerhalb dieser Annahme** (z. B. zukünftige Verwendung desselben Rahmens für schwer quantifizierbare Richtungen wie „Qualitätsoptimierung") – hier kann die Vorab-Spezifikation das schnelle Lernen behindern; in diesem Fall auf den Governance-Prozess in §0.5 zurückfallen und den Rahmen nicht mechanisch anwenden.

**Spezifikation in vier Schichten – unterschiedliche Zeitpunkte**:

| Ebene | Typ                                  | Festlegungszeitpunkt                 |
| ----- | ------------------------------------ | ------------------------------------ |
| §0.1  | Engineering-Spec (Datenpipeline, Code-Korrektheit) | **Vorab**, sofort festlegbar         |
| §0.2  | Statistik-Spec („Erfolgskriterien")  | **Vorab**, Schwellenwerte nach P1.5-Baseline festlegbar |
| §0.3  | Abbremschwellen („Abbruch, wenn...") | **Vorab**, nicht verschiebbar        |
| §0.4  | Per-Skill-Spec (welche Änderung, welches Ziel) | **Nachgelagert**, datengetrieben durch Layer 1 |

### 0.1 Engineering-Spec (muss vorab sein · sofort festlegbar)

Korrektheitsspezifikationen für Datenpipeline und Code-Änderungen – unabhängig von Geschäftsentscheidungen oder Basisdaten, vor der Entwicklung festzulegen:

- **qwen-logger-Pipeline intakt** (§4.1.1b): Das Ereignis `skill_launch` muss gleichzeitig auf OTLP und die qwen-logger-Pipeline fallen
- **`prompt_id` verknüpft**: Ein einzelner User-Prompt, der `skill_launch` + nachfolgende `tool_call` auslöst, soll mit derselben `prompt_id` als vollständige Spur greppbar sein
- **`batch_size` nicht undefined** (§4.3.2 Richtung A): Bei einzelnen Tool-Batches explizit `batch_size = 1` / `batch_position = 0` setzen
- **SQL ausführbar** (§4.1.2): Offline-SQL liefert im echten Telemetry-Backend nicht leere Ergebnisse und kann Skills mit hoher/niedriger Followup-Rate unterscheiden
- **Basisvarianz < P50 × 20%** (P1.5): Die Basismessung muss stabil sein (sonst ist der spätere A/B-Vergleich nicht vertrauenswürdig) – Anmerkung: Obwohl dieser Punkt unter §0.1 Engineering-Spec aufgeführt ist, **hängt seine Festlegung von den P1.5-Basisdaten ab**; es ist der einzige nachgelagerte Prüfpunkt in §0.1. Wenn P1.5 nicht bestanden wird, können die Schwellenwerte in §0.2 nicht vertrauenswürdig festgelegt werden.
- **Skill-Größenbudget** (Layer-2-Umbau): Nach Inline-Followup darf die Anzahl Tokens der Skill-Beschreibung nicht mehr als das 2× vor dem Umbau betragen, und der absolute Wert ≤ 500 Tokens (der kleinere Wert gilt). Bei Überschreitung den Skill nach §4.2 aufteilen, nicht zusammenlegen. Diese Regel ist konsistent mit §7 Punkt 2 und §4.2 (bestehende Einschränkung) und wird auf Spec-Ebene vorgezogen.
- **`npm run preflight` vollständig bestanden**: Harte Hürde für jeden PR

### 0.2 Statistik-Spec (muss vorab sein · Schwellenwerte nach P1.5 festlegen)

Indikatoren dafür, dass das Projekt „statistisch signifikant erfolgreich" ist – **Richtung** vorab festgelegt, **Schwellenwerte** nach der Baseline-Messung (um das Erfinden von Zahlen zu vermeiden):

| Indikator                                          | Richtung | Festlegungszeitpunkt | Aktueller Platzhalter-Schwellenwert (zu kalibrieren) |
| -------------------------------------------------- | -------- | -------------------- | ---------------------------------------------------- |
| Gewichtete `followup_rate` der Top-3-Skills        | ↓        | Ende P1.5            | ≥ 30%                                                |
| Session-Ende-zu-Ende-RT P50 mit Skill              | ↓        | Ende P1.5            | ≥ 2s                                                 |
| Anteil `tool_call` mit `batch_size > 1`            | ↑        | vor P3               | ≥ 30%                                                |
| A/B-Signifikanz für umgebaute Skill-Auslöseszenarien | p < 0.05 | vor Ende P2-Umbau    | n noch offen                                         |

> **Wichtige Einschränkung**: Die Platzhalter-Schwellenwerte sind keine Zusagen. Wenn die P1.5-Baseline zeigt, dass „die gewichtete Followup-Rate der Top-5-Skills < 30%" ist (Auslösen der Abbremschwelle Nr. 1 in §0.3), wird das Projekt beendet; **der Schwellenwert darf nicht nach unten korrigiert werden, nur damit er „erreicht" wird**.
>
> **Wie wird gemessen?**: Messmethode, SQL-Vorlage und A/B-Design für jeden Indikator siehe §5.1–§5.2; Berechnung des Stichprobenumfangs für statistische Signifikanz (p < 0.05) siehe §5.1.

### 0.3 Abbremschwellen (muss vorab sein · nach P-1-Festlegung eingeschränkt änderbar)

Bereits in §5.3 aufgeführt. Das sind harte Bedingungen für „wenn das eintritt, wird abgebrochen" – **unter keinen Umständen dürfen die Abbremschwellen gelockert werden, um die statistischen Ziele in §0.2 zu erreichen**.

- **Ergebnisindikatoren** (3): Gewichtete Followup-Rate der Top-5 < 30% / Nach Umbau von 2 Skills RT P50 ↓ < 1s / Nach Layer 3 `batch_size P50` immer noch = 1
- **Prozessindikatoren** (3): Skill-Trefferquote ↓ ≥ 5 Prozentpunkte / Fehlerrate bei Inline-Followup ≥ 5% / Stornierungsrate durch Benutzer ↑ ≥ 2 Prozentpunkte

Siehe §5.3 für Details.

**Regel zur Änderbarkeit** (um disziplinarische Starrheit ohne Datenbasis zu vermeiden):

| Phase                    | Änderbar?                              | Änderungsrichtung                                                                    |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------ |
| Bei P-1-Festlegung       | ✅ Beliebig änderbar (basierend auf historischen Telemetriedaten oder Konsens) | Beliebig |
| Nach P-1-Festlegung → Ende P1.5 | ❌ Nicht änderbar                   | —                                                                                    |
| Ende P1.5 (Baseline liegt vor)  | ✅ Nur **eine** Lockerung erlaubt  | Lockerung (z. B. 30% → 25%) erfordert Datenbelege + 2-Personen-Review; **Verschärfung nicht erlaubt** (um nachträgliches Hinzufügen von Abbremschwellen zu vermeiden) |
| Nach P1.5                | ❌ Nicht änderbar                      | —                                                                                    |

> Die Platzhalterwerte (30%/1s/5 Prozentpunkte usw.) basieren derzeit **auf keiner historischen Datenbasis**, sondern auf Ingenieursintuition vor dem P-1-Review. Falls zum P-1-Review historische Telemetriedaten der letzten 4 Wochen verfügbar sind, sollten die Abbremschwellen darauf basierend kalibriert werden; falls nicht, bleiben die Platzhalterwerte und am Ende von P1.5 wird die oben genannte „Einmal-Lockerungsregel" angewendet.

### 0.4 Per-Skill-Spec (muss nachgelagert sein · datengetrieben)

Welcher Skill konkret geändert wird und auf welche Ziel-Followup-Rate – **wird erst nach Layer-1-Daten festgelegt**.

Begründung: A-priori-Design und a-posteriori-Daten können stark abweichen. Ein erzwungenes Vorziehen würde das Schicksal der D2-Route in `rt-optimization-design.md` §7 wiederholen – dort wurde die Annahme „Fast-Modell ist 2–3s schneller" durch die a-posteriori-Tatsache des Cache-Einsatzes widerlegt, sodass der Nettonutzen nahe Null oder negativ war.

**Ergebnisort**: Die Per-Skill-Spec wird am Ende von P1.5 datengetrieben erstellt; jedes Layer-2-PR deklariert sie unabhängig in seiner Beschreibung (nicht im Design-Dokument, um Änderungen bei jedem Skill zu vermeiden).

**Vorlage für Per-Skill-Spec-Struktur** (konsistent mit der Muss-Liste in §4.2 PR-Beschreibung – diese beiden Listen sind identisch, §4.2 aus Prozesssicht, dieser Abschnitt aus Spec-Sicht):

| Feld                | Inhalt                                                                                               | Datenquelle               |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------- |
| 1. Aktuelle Daten   | invocation_count, followup_rate, Top-Followup-Tools                                                  | Layer-1-Telemetrie        |
| 2. Ziel             | Followup-Rate von X% auf Y% senken                                                                   | Basierend auf §0.2 Verbesserungsrichtung, absoluter Wert im PR selbst festgelegt |
| 3. Umbauumfang      | Welche Followups werden inline gesetzt (read/grep/shell read-only), explizit **nicht** inline gesetzt (Schreiboperationen / Cross-Skill / tiefes Reasoning) | §4.2 Umbau-Modell-Tabelle |
| 4. Output-Contract-Update | Vorabdeklaration in der Skill-Beschreibung („Returns: ...")                                     | §3.2 Umbau-Beispiel       |
| 5. A/B-Plan         | Nach Umbau 2 Wochen Beobachtung von followup_rate / RT P50 / Prozessindikatoren, Abgleich mit §5.1 Abnahmelinie | §5.1                      |
| 6. Größenbeleg      | Token-Anzahl der Skill-Beschreibung vor/nach Umbau (geschätzt mit tiktoken), darf §0.1 „Skill-Größenbudget" nicht überschreiten | §0.1 Punkt 6              |
### 0.5 spec 治理

- **Änderung von §0.1 / §0.3 spec** erfordert Design-Dokument-Update + PR-Review; §0.3 folgt ausschließlich der „Anpassbarkeitsregel" aus §0.3, um innerhalb des P1.5-Endfensters aufzuweichen
- **Änderung der §0.2-Schwellwerte (nach P1.5-Lock)** erfordert mindestens einen der folgenden Datennachweise:
  - (a) Abweichungsanalyse der P1.5-Baseline-Messung gegenüber den gesperrten Schwellwerten (mit Link zu den Rohmessdaten)
  - (b) Öffentliche Benchmark-Daten eines ähnlichen Projekts (mit Quellenangabe)
  - (c) Abweichungsbegründung mit interner Unterschrift von ≥ 2 Personen

  Liegt beim PR-Review keiner der obigen Nachweise vor, ist der Reviewer **verpflichtet**, den PR zu blocken — „Anpassung nach Bauchgefühl des Entwicklers" ist nicht akzeptabel

- **§0.4 per-skill spec** wird nach datengetriebener Erstellung in die PR-Beschreibung geschrieben (gemäß §0.4 6-Punkte-Vorlage), nicht in das Design-Dokument

---

## 1. Hintergrund und Positionierung

### 1.1 Problem

Die Baseline aus `rt-optimization-design.md` §1.2: 3 Runden Agenten-Loop, 13,4s Ende-zu-Ende, davon 78 % LLM-Aufrufe. Jede Runde ~3-4s.

```
Runde 1 (3,8s, 28 %): LLM entscheidet, Skill aufzurufen
Runde 2 (3,0s, 22 %): LLM entscheidet, Shell aufzurufen
Runde 3 (3,8s, 28 %): LLM fasst zusammen
```

`rt-optimization-design.md` §6/§7 wurden nach zwei Review-Runden D2/D4 abgelehnt, D1/D3 ebenfalls auf „nach Abschluss der Ölarbeiten neu bewerten" herabgestuft. Aber **das gesamte Originaldokument konzentriert sich auf die letzte Runde (Zusammenfassungsrunde) oder Mikrooptimierungen innerhalb einer Runde (D4), ohne auch nur im Ansatz zu diskutieren, warum Runde 1 → Runde 2 existiert und ob sie eliminiert werden kann.**

Der Fakt ist: Runde 2 existiert, **weil der in Runde 1 aufgerufene Skill in den allermeisten Fällen keine vollständige Antwort geliefert hat**, sodass das Modell einen ergänzenden Shell-Aufruf zur Vervollständigung nachschiebt. Wenn Skills so entworfen wären, dass sie „auf einmal das vollständige Ergebnis liefern", würde sich die Anzahl der Runden von 3 auf 2 reduzieren, und die ~3s von Runde 2 würden eingespart – ein Gewinnbereich, der sich mit D1 gar nicht überschneidet.

### 1.2 Beziehung zu `rt-optimization-design`

| Richtung der Rundenreduktion           | Betroffene Runde                           | Hebelpunkt                     | Positionierung dieses Dokuments                 |
| -------------------------------------- | ------------------------------------------ | ------------------------------ | ----------------------------------------------- |
| D1 `skipLlmRound`                      | Letzte Zusammenfassungsrunde                | Framework-Mechanismus + per-tool Opt-in | Sicherheitsnetz, **nach Layer 2**       |
| D2 Fast Routing                        | Latenz einer einzelnen Runde                | Framework-Mechanismus          | Bereits verschoben, **nicht im Rahmen dieses Dokuments** |
| D3 Summarizing State                   | Letzte Zusammenfassungsrunde (Wahrnehmungsebene) | UI-Zustandsmaschine            | Optional, orthogonal zu dieser Lösung           |
| D4 Prevalidate                         | Latenz einer einzelnen Runde                | Framework-Mechanismus          | Bereits verschoben, **nicht im Rahmen dieses Dokuments** |
| **Diese Lösung Layer 1-3**             | **Mittlere Entscheidungsrunde + concurrent nicht ausgelöste Runden** | **Skill-Design + Prompt-Engineering** | **Neue Richtung**                               |

### 1.3 Kernargument

Der wahre Hebel zur Rundenreduktion liegt auf der Skill/Tool-Entwurfsebene, nicht im Agenten-Framework. Drei Gründe:

1. **Die Baseline aus §1.2 zeigt das Problem bereits auf der Skill-Seite** – der Sprung von Runde 1 zu Runde 2 passiert, weil der Skill nicht vollständig zurückliefert; das Framework macht alles richtig, der Skill macht Fehler
2. **Framework-basierte Rundenreduktion erfordert letztlich ebenfalls per-tool Opt-in** – D1s `skipLlmRound` muss von jedem Tool explizit markiert werden, was wieder beim Skill-Engineering landet, plus zusätzliche Kosten für Invarianten-Reparatur und Entscheidungs-Gating
3. **Der ROI ist lokal messbar und einfach zu graustufen** – ein Skill geändert spart eine Runde × Anzahl der Aufrufe dieses Skills, unabhängig von Cache-Hit-Rate-Daten und systemübergreifenden Änderungen

> **Vor der Implementierung muss zuerst das §0-Abnahme-Spec vorab reviewed werden (P-1 Phase, 0,5d)** – §0.1 Engineering-Spec und §0.3 Stopp-Loss müssen vor dem Start gesperrt werden; die Richtung des §0.2 statistischen Schwellwerts muss ebenfalls vorab bestätigt werden (konkrete Werte nach der P1.5-Baseline festlegen). Ein Überspringen von §0 und direkter Einstieg in P0-Implementierung bedeutet standardmäßig „erst fertig, dann Metriken ansehen" – dieses Dokument befürwortet diese Vorgehensweise nicht.

---

## 2. Entwurfsprinzipien

1. **Keine Änderungen am Agenten-Framework** – `useGeminiStream` / `coreToolScheduler` / `geminiChat` Kernpfad bleibt unberührt
2. **Datengetriebene Priorisierung** – erst Telemetrie aufbauen, Daten sagen dir, welchen Skill du ändern sollst, nicht Bauchgefühl
3. **Per-Skill messbar und graustufbar** – jeder Skill-Umbau unabhängig A/B-testbar, bei Fehlschlag lokaler Rollback
4. **Zinseszins priorisieren** – Nutzen = Einsparung pro Runde × Auslösefrequenz, hochfrequente Skills zuerst
5. **Nicht an D1 gebunden** – der Erfolg dieser Lösung hängt nicht von D1 ab

---

## 3. Drei-Schichten-Lösung

### 3.1 Layer 1: Rundenreduktions-Telemetrie (Goldmine finden)

**Ziel**: Daten sagen dir, welche Skills sich am meisten lohnen – d.h. „Nachdem dieser Skill verwendet wurde, mit welcher Wahrscheinlichkeit führt das Modell einen weiteren Tool-Aufruf aus".

**Kernfelder** (pro Runde, pro Skill-Aufruf):

```typescript
interface SkillFollowupRecord {
  skill_name: string;
  prompt_id: string; // Verknüpft alle Events innerhalb derselben user prompt
  turn_index: number; // In welcher Runde des Loops der Skill ausgeführt wurde
  followup_tool_names: string[]; // Welche Tools unter derselben prompt_id nach dem Skill noch aufgerufen wurden
  followup_count: number; // followup_tool_names.length
  followup_kinds: Kind[]; // Read/Edit/Execute/...
  next_turn_is_terminal: boolean; // Ob nach dem Skill die nächste Runde nur Text ausgibt (kein Tool mehr)
  user_followup_within_30s: boolean; // Ob der Benutzer innerhalb von 30s nach Ergebnissen einen neuen Prompt eingegeben hat (Qualitätsregressionssignal)
}
```

**Schlüsselkennzahlen**:

- `skill_followup_rate = sum(followup_count > 0) / total_invocations`
- `terminal_after_skill_rate = sum(next_turn_is_terminal) / total_invocations`
- Aggregation nach `(skill_name, top followup tool)` – sehen, nach welchem Skill am häufigsten welches Tool nachgefragt wird

**Goldmine-Erkennung**:

```
(invocation_count_weekly × skill_followup_rate) ≥ threshold
↓
Dieser Skill ist eine Goldmine zur Rundenreduktion, priorisiert für Layer 2-Umbau
```

Schwellwertempfehlung: Top-3 Skills nach obiger Formel sortiert, zuerst die ersten 2 umbauen.

### 3.2 Layer 2: Skill-Ausgabe vervollständigen

**Ziel**: Als Goldmine identifizierte Skills liefern auf einmal die vollständige Antwort, um den Sprung von Runde 1 zu Runde 2 zu eliminieren.

**Umbau-Muster (nach Followup-Typ klassifiziert)**:

| Followup-Muster               | Typisches Szenario                          | Umbau-Richtung                                        |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| skill → `read_file`           | Skill gibt Pfad, Modell liest nach          | Skill intern direkt lesen, Inhalt zurückgeben         |
| skill → `grep/glob`           | Skill gibt Verzeichnis, Modell sucht nach   | Skill intern suchen, Treffer zurückgeben              |
| skill → `shell` (read-only)   | Skill gibt Befehl, Modell führt aus         | Skill intern Befehl ausführen, Ausgabe zurückgeben    |
| skill → `shell` (write)       | Skill gibt Lösung, Modell führt Schreibaktion aus | **Behalten** (Schreibaktion muss bestätigt werden, nicht zusammenlegen) |
| skill → another skill         | Verkettete Aufrufe                          | **Nicht zusammenlegen** (Kombinierbarkeit erhalten)   |

**Umbau-Checkliste (per-Skill PR-Vorlage)**:

1. **Vorab deklarieren des Ausgabe-Vertrags** in der Skill-Beschreibung: Explizit schreiben „Returns: full file content / matched lines / command output", damit das Modell weiß, dass kein Nachfragen nötig ist
2. **Alle read-only Followups innerhalb des Skills erledigen**: Die in der Telemetrie identifizierten read/search-Operationen mit >50 % Nachfragerate in den Skill integrieren
3. **Write-Operationen nicht integrieren**: Schreiboperationen benötigen Benutzerbestätigung, müssen eine eigene Runde bleiben
4. **Tiefgehende Reasoning-Followups nicht integrieren**: Wenn der Followup „darauf basierend weiter analysieren" ist, ist das Sache des Modells, nicht des Skills
5. **A/B-Telemetrie anfügen**: 2 Wochen nach Umbau `followup_rate` auf <20 % überprüfen

**Typisches Umbau-Beispiel (skizziert)**:

Vor dem Umbau:

```
skill "list-workspaces" returns: ["ws_a", "ws_b"]
→ Runde 2: model calls shell to get details for each workspace
```

Nach dem Umbau:

```
skill "list-workspaces" returns:
  - ws_a (owner: foo, last_active: 2026-05-20, status: active)
  - ws_b (owner: bar, last_active: 2026-05-01, status: archived)
description updated: "Returns workspaces with owner, last_active, status"
→ Runde 2 disappears for ~80% of queries
```
### 3.3 Layer 3: Prompt lehrt Modell Parallelität

**Ziel**: Für unabhängige Tools (mehrere Dateien lesen, mehrere Verzeichnisse durchsuchen) soll das Modell in derselben Runde gleichzeitig tool_calls auslösen, um N Runden auf 1 Runde zu reduzieren.

**Voraussetzung**: Die Infrastruktur ist bereits bereit – `CONCURRENCY_SAFE_KINDS` in `tools/tools.ts:818` und `partitionToolCalls` in `coreToolScheduler` können bereits gleichzeitige Ausführungen von read/search/fetch-Tools innerhalb desselben Batches durchführen. **Es fehlt lediglich die Bereitschaft des Modells, gleichzeitige tool_calls aktiv auszulösen**, qwen-coder neigt standardmäßig zur seriellen Ausführung.

**Änderungsort**: `packages/core/src/core/prompts.ts` (bereits geprüft, Einfügen in der Nähe von L396 im Abschnitt `# Final Reminder` beeinträchtigt nichts außerhalb des Cache-Treffers – nur einmalige Aufwärmkosten).

**Leittext (beispielhaft, erfordert A/B-Optimierung)**:

```
When you need to call multiple independent read-only tools (read_file,
grep, glob, web_fetch), emit them in a SINGLE tool_calls batch — do NOT
call them sequentially across rounds. They will execute concurrently.

Examples:
- Reading 3 files for comparison: emit 3 read_file calls in one batch
- Searching for 2 patterns: emit 2 grep calls in one batch

Do NOT batch when the second call depends on the first call's result.
```

**Wirksamkeitsmessung**: Neues Telemetriefeld `batch_size` (Anzahl der tool_calls innerhalb derselben Runde) – Vergleich der Verteilung vor und nach der Prompt-Änderung.

#### 3.3.1 Erweiterung von `CONCURRENCY_SAFE_KINDS` (Unterpunkt von Layer 3)

Das Prompt lehrt das Modell nur auf der Angebotsseite (das Modell ist bereit, mehrere tool_calls auf einmal zu senden), aber `CONCURRENCY_SAFE_KINDS = { Read, Search, Fetch }` in `tools/tools.ts:818` bestimmt den **tatsächlich ausführbaren Bereich paralleler Tools**: `partitionToolCalls` (`coreToolScheduler.ts:775`) packt „aufeinanderfolgende sichere Tools“ in einen parallelen Batch, der Rest wird seriell ausgeführt.

Wenn das Modell gemäß der Anleitung 3 tool_calls auf einmal sendet, aber einer davon zu `Kind.Execute` gehört und nicht im sicheren Set ist, wird der gesamte Batch aufgeteilt und seriell ausgeführt – der Nutzen der Layer-3-Prompt-Änderung wird durch die Laufzeitplanung zunichtegemacht.

**Erweiterungskandidaten** (nach Risiko aufsteigend):

- `Kind.Think` (enthält save_memory / todo_write) – **Nicht hinzufügen**, hat implizite Schreibvorgänge
- Nur-Lese-Shell (Execute, bei dem `isShellCommandReadOnly()` true zurückgibt) – `partitionToolCalls` hat bereits eine Sonderbehandlung (im Kommentar von `partitionToolCalls` in `coreToolScheduler.ts` wird erwähnt: "Execute (shell) is safe only when isShellCommandReadOnly() returns true"), der aktuelle Zustand deckt dies ab, keine Änderung an `CONCURRENCY_SAFE_KINDS` erforderlich
- MCP-Tools nach `Kind` klassifizieren – Das Verhalten der MCP-Server variiert stark, eine explizite Opt-in bei der Tool-Registrierung ist erforderlich

**Fazit**: Die aktuelle Menge ist bereits sinnvoll, **Layer 3 ist nicht von der Erweiterung von `CONCURRENCY_SAFE_KINDS` abhängig**. Der Zweck dieses Abschnitts: Nachdem die `batch_size`-Telemetriedaten gesammelt wurden, **wenn festgestellt wird, dass „paralleles Batch P50 < erwarteter Wert“, zuerst prüfen, ob dies durch `partitionToolCalls` unterbrochen wird und nicht, weil das Modell nicht parallel arbeitet**. Dies ist ein Diagnosepfad für den Fall, dass Layer 3 A/B fehlschlägt, kein muss.

> Anerkennung: codex review schlug vor, dass „Erweiterung von `CONCURRENCY_SAFE_KINDS` ein übersehener Hebel ist“. Nach Prüfung wurde festgestellt: Der aktuelle Zustand deckt bereits den größten Teil mit der Sonderbehandlung von `isShellCommandReadOnly` ab, die Erweiterung der Menge selbst bringt geringen Nutzen und hohes Risiko; wird als Diagnosepfad beibehalten.

---

## 4. Detaillierte Implementierung

### 4.1 Layer 1: Telemetrie-Erweiterung (1-2d)

#### 4.1.1 Hinzufügen von `prompt_id` zu `SkillLaunchEvent`

**Ort**: `packages/core/src/telemetry/types.ts:896`

Derzeit enthält `SkillLaunchEvent` nur `skill_name` + `success`, **kein `prompt_id`** – es kann nicht mit anderen `ToolCallEvent` in derselben Runde verknüpft werden.

```typescript
// types.ts:896
export class SkillLaunchEvent implements BaseTelemetryEvent {
  'event.name': 'skill_launch';
  'event.timestamp': string;
  skill_name: string;
  success: boolean;
  prompt_id: string;                    // 新增
  turn_index?: number;                  // 新增

  constructor(
    skill_name: string,
    success: boolean,
    prompt_id: string,                  // 新增
    turn_index?: number,                // 新增
  ) { ... }
}
```

**Aufrufer-Update**: Die 4 `logSkillLaunch`-Aufrufsstellen in `packages/core/src/tools/skill.ts` (L386, L399, L426, L482) können über `this.params` nicht auf `prompt_id` zugreifen – `BaseToolInvocation` hat nur `params`, kein Feld `request.prompt_id`. **Tatsächliche Implementierung** erfolgt per Duck-Typing-Injektion: `SkillToolInvocation` exponiert einen Setter `setPromptId(id)` + privates Feld `promptId`, `CoreToolScheduler.buildInvocation` (`coreToolScheduler.ts:1253`) ruft nach dem Build duck-typisiert `setPromptId(request.prompt_id)` auf, analog zum bestehenden Hook `setCallId`; die Invocation übergibt `this.promptId` in allen 4 `logSkillLaunch` innerhalb von `execute()`. **Die frühere Version dieses Abschnitts („BaseToolInvocation hat bereits request.prompt_id“) war falsch und wurde nach PR #4565 Review korrigiert.**

#### 4.1.1b Reparatur der qwen-logger-Kette (vorgelagert)

Vor dem Hinzufügen von `prompt_id` muss zunächst ein **bestehender Kettenbruch** behoben werden: In `packages/core/src/telemetry/qwen-logger/qwen-logger.ts:908` ist die Methode `logSkillLaunchEvent(event)` definiert, aber **es gibt nirgendwo im Repository einen Aufrufer** – `logSkillLaunch` in `loggers.ts:958` läuft direkt über den OTLP-Pfad `logs.getLogger(SERVICE_NAME).emit()` und umgeht den qwen-logger.

Konsequenzen:

- Das skill_launch-Ereignis auf dem OTLP-Pfad erreicht den OTLP-Collector (funktioniert bereits), aber die dedizierte Berichtskette des qwen-logger ist derzeit tot.
- Wenn das Telemetrie-Backend vom qwen-logger konsumiert (nicht von OTLP), wird das skill_launch-Ereignis **überhaupt nicht gemeldet**.
- §4.1.2 Offline SQL-Ableitung von `SkillFollowupRecord` hängt davon ab, dass skill_launch-Ereignisse in die Datenbank geschrieben werden – **zuerst muss verifiziert werden, ob skill_launch im Backend derzeit sichtbar ist**.

Zwei Reparaturrichtungen zur Auswahl:

- **A** (empfohlen) Fügen Sie in `logSkillLaunch` in `loggers.ts:958` eine Zeile `QwenLogger.getInstance(config)?.logSkillLaunchEvent(event)` hinzu, analog zur Schreibweise von `logToolCall` in `loggers.ts:230`.
- **B** Bestätigen Sie, dass das Backend nur von OTLP konsumiert, und markieren Sie `logSkillLaunchEvent` im qwen-logger als `@deprecated` oder löschen Sie es.

**Warum nur den QwenLogger-Pfad ergänzen und nicht alle 4 Pfade von `logToolCall` anpassen?**

`logToolCall` (`loggers.ts:220-247`) hat tatsächlich 4 Ausgänge:

1. `uiTelemetryService.addEvent(...)` – UI-Anzeige
2. `config.getChatRecordingService()?.recordUiTelemetryEvent(...)` – Chat-Verlauf
3. `QwenLogger.getInstance(config)?.logToolCallEvent(...)` – qwen-logger Backend-Telemetrie
4. OTLP `logger.emit(...)` – OpenTelemetry

skill_launch ist ein **reines Backend-Telemetrieereignis**, es muss weder in der UI angezeigt werden (der Benutzer sieht bereits die returnDisplay des SkillTool) noch in den ChatRecording-Verlauf aufgenommen werden (die Tool-Aufrufe innerhalb des Skills werden bereits einzeln von recordUiTelemetryEvent erfasst). Daher wird nur der 3. Pfad (QwenLogger) ergänzt, der 4. Pfad (OTLP) beibehalten, und das Überspringen von 1/2 ist beabsichtigt, keine Lücke.

**Detail zur Feldweitergabe**: In `loggers.ts:961-966` werden neue Felder automatisch durch den Spread `{ ...event }` weitergegeben (nachdem `prompt_id` zu `SkillLaunchEvent` hinzugefügt wurde, funktioniert dieser Pfad automatisch), aber wenn `logSkillLaunchEvent` in `qwen-logger.ts:908` intern explizit `event.skill_name` / `event.success` destrukturiert, werden neue Felder nicht automatisch einbezogen, manuelle Synchronisation erforderlich.

Aufwand: Pfad A ca. 0.5d (inkl. Backend-Bestätigung); Pfad B ca. 0.2d (Code löschen + Dokumentation).

#### 4.1.2 Ableitung von `SkillFollowupRecord` (Offline-Aggregation)
Keine neuen Ereignistypen erforderlich – sowohl `ToolCallEvent` als auch `SkillLaunchEvent` haben bereits `prompt_id`, die Offline-SQL-Abfragen ermöglicht:

```sql
-- Pseudo-SQL, je nach tatsächlichem Telemetrie-Backend anpassen
WITH skill_events AS (
  SELECT prompt_id, skill_name, timestamp FROM events
  WHERE event_name = 'skill_launch' AND success = true
),
tool_events AS (
  SELECT prompt_id, function_name, timestamp FROM events
  WHERE event_name = 'tool_call'
),
followups AS (
  SELECT s.skill_name, s.prompt_id,
         COUNT(t.function_name) AS followup_count,
         ARRAY_AGG(t.function_name) AS followup_tool_names
  FROM skill_events s
  LEFT JOIN tool_events t
    ON s.prompt_id = t.prompt_id AND t.timestamp > s.timestamp
  GROUP BY s.skill_name, s.prompt_id
)
SELECT skill_name,
       COUNT(*) AS invocations,
       AVG(followup_count) AS avg_followup,
       SUM(CASE WHEN followup_count > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) AS followup_rate
FROM followups
GROUP BY skill_name
ORDER BY invocations * followup_rate DESC;
```

#### 4.1.3 Telemetrie für 1 Woche laufen lassen, um Daten zu sammeln

- Keine Änderungen am User-facing-Verhalten
- Kein Konfigurations-Schalter erforderlich – Telemetrie hat bereits ein Opt-In-Framework (`telemetry.target`-Einstellung)
- Nach 1 Woche wird ein Skill-Ranking-Bericht erstellt

### 4.2 Layer 2: Skill-Überarbeitung (pro Skill 0,5–1 Tag)

Überarbeitung von Top-down basierend auf den Layer-1-Daten. Jeder Skill erhält einen eigenen PR, dessen Beschreibung Folgendes enthalten muss:

1. **Daten**: Aktuelle invocation_count, followup_rate, Top-Followup-Tools
2. **Überarbeitungsumfang**: Welche Followups wurden inline eingebaut (klar angeben, was nicht inline gemacht wird)
3. **Aktualisierung des ausgegebenen Vertrags**: Welche Vorabdeklarationen wurden in der Skill-Beschreibung hinzugefügt
4. **A/B-Plan**: Nach der Überarbeitung 2 Wochen lang die followup_rate erneut beobachten

**Hinweise**:

- Wenn ein Skill Leseoperationen inline einbaut, nicht alle Randfallbehandlungen von read_file (Kodierung, Binärerkennung usw.) wiederholen – stattdessen das `read_file`-Tool selbst aufrufen, nicht neu schreiben
- Ähnlich für Grep/Glob
- Shell-Befehle im Skill müssen den Standardpfad `executeToolCall` nehmen (Telemetrie erhalten)
- **Skill-Volumen nicht explodieren lassen**: Wenn die Skill-Beschreibung nach dem Inline-Einbau von Followups > 500 Tokens beträgt, den Skill aufteilen statt zusammenführen

### 4.3 Layer 3: Prompt-Anleitung (0,5 Tage Änderung + praktische Optimierung)

#### 4.3.1 Parallele Anleitung hinzufügen

**Position**: `packages/core/src/core/prompts.ts` Abschnitt `# Final Reminder` (L396)

Text der Anleitung aus Abschnitt 3.3 hinzufügen. Konkrete Formulierung muss A/B-getestet werden – zuerst mit der einfachsten Version, dann je nach Steigerung der Parallelisierungsrate verfeinern.

#### 4.3.2 `batch_size`-Telemetrie hinzufügen

**Position**: `ToolCallEvent` in `packages/core/src/telemetry/types.ts` oder neues leichtgewichtiges `ToolBatchEvent`

```typescript
// Option A: Feld auf ToolCallEvent hinzufügen (weniger invasiv)
export class ToolCallEvent {
  ...
  batch_size?: number;        // Anzahl der tool_call im selben Batch
  batch_position?: number;    // Position im Batch (0-basiert)
}

// Option B: Neues ToolBatchEvent (semantisch klarer, erfordert vollständigen neuen Event-Typ-Prozess)
```

**Empfehlung Option A** – Weniger Aufwand, bei Abfragen einfacher zu aggregieren.

**Statusweitergabe-Pfad** (kritisch – dieser Schritt wurde in frühen Versionen unterschätzt):

In `coreToolScheduler.ts:2456` gibt `partitionToolCalls(callsToExecute)` die `batches` zurück, **aber die Batch-Information geht sofort im Scheduling-Pfad verloren**:

```
executeToolCalls
  └─ batches = partitionToolCalls(...)           // weiß batch.calls.length
     └─ for batch of batches:
        └─ this.runConcurrently(batch.calls, ...) // weiß batch.calls.length
           └─ executeSingleToolCall(call, ...)   // ❌ kennt Batch nicht
              └─ ...
                 └─ finalizeToolCalls
                    └─ logToolCall(config, new ToolCallEvent(call)) // ❌ kein Batch-Kontext
```

Der Konstruktor von `ToolCallEvent` (`types.ts:189`) empfängt nur ein einzelnes `CompletedToolCall`, ohne Batch-Felder.

Reparaturrichtung:

- **Richtung A** (empfohlen): `ScheduledToolCall` um `batchSize?: number` + `batchPosition?: number` erweitern. Beide Zweige füllen diese:
  - Nebenläufiger Zweig (`coreToolScheduler.ts:2459-2460`, `batch.calls.length > 1`): Vor der Schleife `runConcurrently(batch.calls, ...)` jedem `call` `batchSize = batch.calls.length`, `batchPosition = i` setzen
  - Serieller Zweig (`L2462-2464` `for (const call of batch.calls)`): Bei Ein-Tool-Batch explizit `batchSize = 1`, `batchPosition = 0` setzen (**nicht undefiniert lassen**, sonst werden Runden ohne Parallelisierung in der Downstream-Telemetrie-Aggregation fälschlich als fehlende Daten gewertet)

  `new ToolCallEvent(call)` liest diese beiden Felder im Konstruktor aus `call`

- **Richtung B**: Signatur von `ToolCallEvent`-Konstruktor ändern zu `new ToolCallEvent(call, batchInfo?)`, alle Aufrufer anpassen (4 logToolCall-Aufrufstellen + Tests). Mehr Änderungen als A

Aufwand: Richtung A etwa 0,5 Tage inkl. Unit-Tests; Richtung B etwa 1 Tag (viele Aufrufer).

**Gleichzeitige Messung der „Modell-Parallelisierungsbereitschaft"** – Vor und nach der Änderung von prompts.ts (Layer 3) den Anteil der tool_calls mit `batch_size > 1` vergleichen. Dies ist der Schlüsselindikator, ob Layer 3 wirkt; ohne diese Daten kann der A/B-Test von Layer 3 nicht abgeschlossen werden.

#### 4.3.3 Cache-Auswirkungsbewertung

Die Änderung von `prompts.ts` führt dazu, dass der DashScope-ephemeral-Cache auf einmal ungültig wird (erste Anfrage Cache-Miss, danach wieder normal). Dies ist ein bekannter einmaliger Aufwand, siehe §7.8 der Datei `rt-optimization-design.md` zur Prompt-Steady-State-Audit.

---

## 5. Abnahme und Metriken

> **Dieser Abschnitt ist die methodische Ergänzung zur Abnahme-Spezifikation in §0** – §0 definiert „welche Indikatoren als Erfolg gelten + Schwellwerte vor/nach", §5 erklärt „wie gemessen wird, wie SQL geschrieben wird, wie A/B entworfen wird". Die Schwellwerte in diesem Abschnitt sind die aktuellen Platzhalter aus §0.2; die endgültigen Werte werden nach der P1.5-Basismessung festgelegt.

### 5.1 Per-Skill-A/B-Indikatoren (2 Wochen nach Überarbeitung)

| Indikator                                      | Abnahmekriterium                   | Hinweis                       |
| ---------------------------------------------- | ---------------------------------- | ----------------------------- |
| `followup_rate` dieses Skills                  | < 20 % (vorher falls 70 %+)       | Hauptindikator                |
| End-to-End-RT P50 des durch den Skill ausgelösten Szenarios | Senkung ≥ 2 s          | Durch einen LLM-Aufruf weniger |
| `user_followup_within_30s`-Rate dieses Skills  | Steigt nicht an                  | Nutzer fragt nicht zurück = Antwort vollständig |
| `success`-Rate dieses Skills                   | Sinkt nicht                      | Inline-Followup hat keine neuen Fehler eingeführt |

### 5.2 Gesamt-RT-Indikatoren

| Indikator                               | Basislinie                                  | Ziel nach Überarbeitung der Top-3-Skills in Layer 2 |
| --------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| End-to-End-RT P50 (Sitzungen mit Skill) | 13,4 s (einmalige Stichprobe) / Basislinie für ≥3 Szenarien noch ergänzen | Senkung um 2–3 s                                    |
| Tool batch P50 Größe (Layer 3)          | Noch zu messen                              | ≥ 1,3 (>30 % der Aufrufe betreffen parallelen Batch) |
| Skill-Gesamt-followup_rate (gewichteter Durchschnitt) | Noch zu messen                      | Senkung ≥ 30 %                                      |
### 5.3 Fehlersignale – Wann man eine Richtung aufgibt

**Ergebnis-Kennzahlen-Stopplinie**:

- Nach Layer 1 Daten: **gewichtete Followup-Rate der Top-5 Skills < 30%** → Reduktionsspielraum gering, Layer 2 nicht lohnenswert
- Nach Änderung von 2 Skills in Layer 2: **Ende-zu-Ende RT P50 Abnahme < 1s** → Optimierungsrichtung falsch (möglicherweise Followup-Schreiboperation, die nicht zusammengelegt werden sollte), Stopp und Review
- Nach 2 Wochen Layer-3-Prompt-Änderung: **batch_size P50 immer noch = 1** → Modell akzeptiert Concurrent-Anweisungen nicht, Layer 3 aufgeben, nur Layer 1+2 behalten

**Prozess-Kennzahlen-Stopplinie (Frühwarnung, um zu vermeiden, dass die Lösung „aussieht, als würde sie arbeiten, aber keinen Nutzen bringt")**:

- **Skill-Trefferquote (intended skill vs. selected skill) fällt ≥ 5 Prozentpunkte** → Skill-Beschreibung verschlechtert, sodass das Modell den falschen Skill wählt. Typisches Szenario: Vor der Optimierung traf Benutzerfrage X immer Skill_a, nach der Optimierung wird sie gelegentlich an Skill_b geroutet, ohne einen Fehler zu erzeugen (Modell verwendet falschen Skill, liefert aber notdürftig eine Antwort). Ergebnis-Kennzahlen sehen normal aus, aber die Followup-Rate steigt. **Messmethode**: Füge `skill_invocation_pattern` in Telemetry hinzu – clustere nach den ersten N Schlüsselwörtern des User-Prompts, siehe welcher Cluster welchen Skill hauptsächlich auslöst; vergleiche Top-1-Verschiebung vor/nach Optimierung
- **Skill-inline-Followup-Fehlerrate ≥ 5%** → Skill-Optimierung hat Fehlermuster eingeführt, die es vorher nicht gab (z. B. Inline-`read_file` bei großen Dateien führt zu Speicherüberlauf). Messung: `SkillLaunchEvent.success` vor/nach Optimierung
- **Pro-Skill-Benutzer-Abbruchrate (Strg+C) steigt ≥ 2 Prozentpunkte** → Skill-Ausgabe wird langsamer oder länger, Benutzer verliert Geduld. Messung: Anteil `ToolCallEvent.status === 'cancelled'`

---

## 6. Verknüpfung mit D1/D3

### 6.1 Beziehung zu D1

Nachdem Layer 2 die Top-Skills optimiert hat, sind **die verbleibenden Followup-lastigen Skills die tatsächlichen Einsatzbereiche von D1 `skipLlmRound`** – diese Skills liefern bereits vollständige Ausgaben (kein Round 2 nötig) und sind tatsächlich terminale Abfragen (auch Round 3 Zusammenfassung ist Verschwendung).

Ablaufreihenfolge:

1. Layer 1 Telemetry online → 1 Woche Daten
2. Layer 2 Optimierung der Top 2-3 Skills → A/B 2 Wochen
3. Layer 3 Prompt Concurrent → Test 1 Woche
4. **Dann** D1 bewerten: Wie viele der verbleibenden häufigen Skills sind vom Typ „Ausgabe vollständig + terminale Abfrage" → ob sich 2-3d Framework-Anpassung lohnt

### 6.2 Beziehung zu D3

D3 (`StreamingState.Summarizing`) ist eine Optimierung der Wahrnehmungsebene und vollständig orthogonal zu diesem Plan. Layer 1-3 reduzieren **echte Runden**, D3 reduziert **vom Benutzer wahrgenommene Wartezeit**. Wenn Layer 2 die RT bereits auf einen für den Benutzer akzeptablen Bereich gesenkt hat, sinkt der Wert von D3; andernfalls kann D3 additiv wirken.

---

## 7. Einschränkungen und bekannte Risiken

1. **Abdeckung durch Optimierungsumfang begrenzt** – Optimierung von 10 Skills deckt nur die Szenarien dieser 10 ab. Aber der Nutzen ist messbar und hat Zinseszinseffekt
2. **Skill-inline-Followup kann einzelne Skills schwerer machen** – Beschreibungsaufblähung, langsameres Laden, geringere Wiederverwendbarkeit. Layer 2 Checkliste Punkt 5 verhindert dies
3. **Layer 3 Modell befolgt möglicherweise Concurrent-Anweisungen nicht** – qwen-coder Trainingsdaten neigen zu serieller Ausführung; A/B-Daten könnten zeigen, dass Prompt-Änderungen wirkungslos sind – als bekanntes Fehlermuster
4. **Telemetry Privatsphäregrenzen** – `SkillFollowupRecord` sollte keine Tool-Parameter protokollieren (standardmäßig aus `ToolCallEvent.function_args` geholt, aber auditieren, ob skill_name Benutzerabsicht preisgibt)
5. **Nicht anwendbar für Sub-Agenten / Cron / Benachrichtigungen** – diese Pfade nutzen nicht das Skill-System, dieser Plan deckt sie nicht ab
6. **Baseline-Daten dünn** – übernimmt die Einzelstichprobe aus `rt-optimization-design.md` §1.2, vor Layer 2 Umsetzung müssen ≥3 Szenario-Baselines ergänzt werden
7. **Erweiterung des `logSkillLaunch`-Feldes zerstört bestehende Telemetry-Consumer** – 4 Aufrufstellen + nachgelagerte Logger müssen synchron geändert werden
8. **`qwen-logger.ts:908` `logSkillLaunchEvent` ist derzeit toter Code** – keine Aufrufer im Repository, §4.1.1b listet vorherige Reparatur auf

### 7.1 Abgrenzung zu bestehenden Framework-Mechanismen (nicht im Umfang dieses Plans)

Das Repository hat bereits mehrere Framework-Mechanismen, die indirekt mit Rundenteduktion zusammenhängen. **Dieser Plan erfindet sie nicht neu und ersetzt sie auch nicht**:

| Bestehender Mechanismus                                        | Ort                                | Beziehung zu diesem Plan                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `partitionToolCalls` + `runConcurrently` (Concurrent-Ausführung) | `coreToolScheduler.ts:775, 2473`     | Layer 3 nutzt direkt; dieser Plan ändert es nicht                                                                             |
| `CONCURRENCY_SAFE_KINDS` (legt fest, welche Tools concurrent sein können) | `tools/tools.ts:818`                 | §3.3.1 hat bereits begründet, dass der Status quo sinnvoll ist, wird nicht erweitert                                          |
| `FileReadCache` (vermeidet wiederholtes Lesen derselben Datei)    | `services/fileReadCache.ts`          | Beeinflusst indirekt Runden, in denen das Modell dieselbe Datei wiederholt liest; bereits wirksam; dieser Plan verlässt sich nicht darauf und verstärkt es nicht |
| `chatCompressionService` (Verlaufskomprimierung)                 | `services/chatCompressionService.ts` | Orthogonal zu Runden (beeinflusst Kosten pro Runde, nicht Anzahl); identisch mit dem `wouldTriggerCompression`-Gate der Fast-Route in `rt-optimization-design.md` §3.2 |

Diese Auflistung dient dazu, zu vermeiden, dass der Plan so verstanden wird, als hätte er bestehende Mechanismen ignoriert.

---

## 8. Implementierungszeitplan

> **Voraussetzung: Dieser Zeitplan beginnt bei P-1 und kann nicht übersprungen werden.** P-1 ist das vorherige Review der Akzeptanz-Spezifikation aus §0, 0,5d Aufwand aber **zwingend** – ohne Bestehen kein P0. Diese Einschränkung soll die Anti-Pattern „erst Code schreiben, dann Spezifikation nachreichen" vermeiden: Eine nachträgliche Spezifikation verschiebt die „Erfolgsbewertung" auf nach der Ergebnisphase, was leicht zu Abweichungen führen kann, um die Kennzahlen gut aussehen zu lassen (siehe `rt-optimization-design.md` §7 D2 Routen-Fiasko).

| Phase     | Inhalt                                                                    | Aufwand               | Output                          | Spezifikations-Lock-Aktion                    |
| --------- | ------------------------------------------------------------------------- | --------------------- | ------------------------------- | --------------------------------------------- |
| **P-1**   | Spezifikations-Review vorab                                               | 0,5d                  | §0.1 / §0.3 Lock                | **Lock §0.1 Engineering-Spez + §0.3 Stopplinie** |
| **P0**    | qwen-logger-Link-Reparatur (§4.1.1b vorher)                               | 0,5d                  | Bestätigung Sichtbarkeit von skill_launch-Ereignissen | Verifizierung §0.1 Punkt 1                    |
| **P1**    | Layer 1 Telemetry: `prompt_id`-Feld ergänzen + Offline-SQL                | 1-2d                  | Skill-Ranking-Bericht           | Verifizierung §0.1 Punkte 2/3/4               |
| **P1.5**  | 1 Woche Datensammlung + Baseline-Messung (≥3 Szenarien × ≥10 Durchläufe) | 1w                    | Entscheidung, welche 2-3 Skills geändert werden | **Lock §0.2 Schwelle + Verifizierung §0.1 Punkt 5** |
| **P2**    | Layer 2 Optimierung Top-1 Skill (PR + A/B)                                | 0,5-1d Optimierung + 2w Beobachtung | Rückgang followup_rate ↓, RT P50 ↓ Verifizierung | **Pro-PR-Deklaration von §0.4 per-Skill-Spez**  |
| **P3**    | Layer 3 Prompt-Concurrent-Anleitung + `batch_size` Telemetry (inkl. §4.3.2 Zustandsweitergabe) | 1-1,5d Änderung + 1w Test | batch_size Verteilung           | Verifizierung §0.2 Punkt 3                    |
| **P4**    | Layer 2 weitere Optimierung Top-2 / Top-3 Skills (parallel zu P3)         | 0,5-1d × N            | Kumulierter RT P50 Rückgang     | Pro-PR-Deklaration von §0.4                   |
| **P5**    | Bewertung, ob D1 noch wertvoll ist                                        | Entscheidungsmeeting  | Routenplan-Update               | —                                             |
**Entscheidungspunkte (siehe §0.3 Stopp-Loss-Linie)**:

- **P-1 Ende**: Wenn bei §0.1 / §0.3 kein Konsens erzielt wird → nicht in P0 eintreten
- **P1.5 Ende**: Wenn Ergebnisindikator #1 nach §0.3 ausgelöst wird (gewichtet top-5 followup_rate < 30%) → Richtung abbrechen; andernfalls §0.2 Schwellenwert festlegen
- **P2 Ende**: Wenn Ergebnisindikator #2 nach §0.3 ausgelöst wird (RT P50 nach Transformation top-1 Reduktion < 1s) oder irgendein Prozessindikator → anhalten und überprüfen
- **P3 Ende**: Wenn Ergebnisindikator #3 nach §0.3 ausgelöst wird (batch_size P50 immer noch = 1) → Layer 3 aufgeben
- **P5**: Entscheidung über D1 ROI basierend auf der verbleibenden Skill-Form

---

## 9. Wichtige Code-Standorte

| Datei                                                     | Wichtige Symbole                                                      | Position                              |
| -------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| `packages/core/src/telemetry/types.ts`                   | `ToolCallEvent` (enthält `prompt_id` / `duration_ms`)                 | L170                                  |
| `packages/core/src/telemetry/types.ts`                   | `SkillLaunchEvent` (muss `prompt_id` ergänzen)                        | L896                                  |
| `packages/core/src/telemetry/loggers.ts`                 | `logToolCall`                                                         | L220                                  |
| `packages/core/src/telemetry/loggers.ts`                 | `logSkillLaunch` (über OTLP; fehlt qwen-logger Weiterleitung)        | L958                                  |
| `packages/core/src/telemetry/loggers.ts`                 | `logToolCall` (doppelter Pfad: OTLP + qwen-logger, als Reparaturvorlage) | L220, L230                        |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts` | `logSkillLaunchEvent` (**derzeit toter Code**, §4.1.1b vorgelagertes Reparaturziel) | L908                              |
| `packages/core/src/core/coreToolScheduler.ts`            | `partitionToolCalls`                                                   | L775                                  |
| `packages/core/src/core/coreToolScheduler.ts`            | `runConcurrently` / Batch-Scheduling                                  | L2456, L2473                          |
| `packages/core/src/core/coreToolScheduler.ts`            | `logToolCall` Aufrufstelle (Endpunkt für batch_size-Zustandsübergabe) | L3163                                 |
| `packages/core/src/services/fileReadCache.ts`            | `FileReadCache` (bereits vorhanden, beeinflusst wiederholte Lesevorgänge) | L135                              |
| `packages/core/src/tools/skill.ts`                       | `SkillTool` + 4 Aufrufstellen von `logSkillLaunch`                    | L386, L399, L426, L482                |
| `packages/core/src/skills/skill-manager.ts`              | `SkillManager` (Skill-Registrierung/Laden)                            | ganze Datei                           |
| `packages/core/src/skills/skill-load.ts`                 | Skill-Beschreibung laden (Eingang für Output-Contract-Änderungen)     | ganze Datei                           |
| `packages/core/src/tools/tools.ts`                       | `Kind` + `CONCURRENCY_SAFE_KINDS`                                     | L793, L818                            |
| `packages/core/src/core/coreToolScheduler.ts`            | `partitionToolCalls` + `runConcurrently` (vorhandene Parallelitätsinfrastruktur) | siehe rt-optimization-design.md §5.7 |
| `packages/core/src/core/prompts.ts`                      | `# Final Reminder` Abschnitt (Ort, an dem Layer 3 Parallelitätsanweisungen hinzugefügt werden) | L396                              |
| `.qwen/skills/`                                          | Verzeichnis der einzelnen Skill-Definitionen (Transformationsobjekt für Layer 2) | Verzeichnis                        |

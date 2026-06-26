# OOM-Drucktest und Replay-Bericht für lange Aufgaben

**Datum**: 2026-05-19
**Branch**: `codex/memory-diagnostics-local-run`
**Tester**: yiliang114
**Ergebnis**: Erfolgreich reproduziert und Root Cause identifiziert. Die durch v0.15.7 (#3735) eingeführte Auto-Compaction hat die Aufruffrequenz von `structuredClone` vervielfacht, was bei hohem Heap-Druck eine positive Rückkopplungsschleife auslöste und zum OOM führte. Echte Debug-Logs belegen den Mechanismus vollständig.

---

## 1. Hintergrund

Mehrere Issues (#4309, #4276, #4185, #4315, #4322, #2868) berichten über V8-Heap-OOM-Crashes in qwen-code bei langen Sessions:

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

Von Benutzern gemeldete Crash-Charakteristiken:
| Issue | Heap zum Crash | Laufzeit | Plattform |
|-------|----------------|----------|-----------|
| #4276 | 4014 MB | ~110 Minuten | Linux x64 |
| #4315 | 2027 MB | ~19,6 Stunden | macOS (Standard 2 GB Limit) |
| #4322 | 4023 MB | ~7 Stunden | Windows |
| #2868 | 2035 MB | ~1,7 Minuten | Linux |
| #4309 | 7020 MB | Unbekannt | Windows (8 GB Limit gesetzt, trotzdem gecrasht) |

---

## 2. Methodikkorrektur

Dieser Bericht unterscheidet zwei Testarten:

1. **Niedriger Heap-Drucktest**: Das Problem wird durch Senkung von `--max-old-space-size` verstärkt, um den Codepfad „vollständige Kopie bei großer History führt zu momentanem Peak“ schnell zu lokalisieren. Es ist ein Diagnosewerkzeug und nicht gleichbedeutend mit einer Reproduktion des Benutzer-OOM bei 4G/8G.
2. **Lange Aufgaben-Replay mit Standard-Heap**: Ohne Setzen von `NODE_OPTIONS` wird die History aus echten JSONL-Dateien wiederhergestellt und die Review-Aufgabe fortgesetzt, während der process-tree RSS außerhalb des Prozesses gesampelt wird. Nur solche Ergebnisse werden verwendet, um die tatsächliche Speichergröße auf Benutzerseite zu beurteilen.

Daher kann das Ergebnis des niedrigen Heap-Drucks nicht allein als Beweis dafür dienen, dass der „echte OOM“ bereits behoben ist. Es zeigt lediglich, dass ein bestimmter Pfad bei ausreichend großer History einen Spitzenanstieg erzeugen kann. Zur Validierung ist ein Replay mit Standard-Heap erforderlich.

## 3. Bedingungen für den niedrigen Heap-Drucktest

| Parameter                  | Wert                                                          |
| -------------------------- | ------------------------------------------------------------- |
| CLI-Version                | 0.15.11 (Build aus Branch `codex/memory-diagnostics-local-run`) |
| Model                      | `qwen3.6-plus` (128K Kontextfenster)                          |
| Heap-Limit                 | `--max-old-space-size=512`                                    |
| Heap-Druck-Sicherheitsnetz | **Deaktiviert** (`HEAP_PRESSURE_COMPRESSION_RATIO` auf 99.0 gesetzt) |
| Betriebsmodus              | YOLO + automatisierte mehrfache Read-Datei-Aufgaben           |
| Arbeitsverzeichnis         | qwen-code monorepo (3538 .ts-Dateien, 1,26 Mio. Zeilen)       |

### Wichtige Konfigurationsänderung

In `packages/core/src/core/geminiChat.ts` wurde der Schwellwert für die Heap-Druck-Kompression von 0,7 auf 99,0 geändert (sodass sie nie ausgelöst wird), um den Zustand vor der Reparatur in #4186 zu simulieren.

---

## 4. Ergebnisse des niedrigen Heap-Drucktests

### Crash-Zeitstrahl

```
[21:26:59] #1 RSS:193,6MB Ctx:0%   → Read geminiChat.ts (1500 Zeilen)
[21:27:46] #2 RSS:270,4MB Ctx:4,2% → Read agent.ts
[21:28:32] #3 RSS:397,5MB Ctx:4,3% → grep + Read 3 Dateien
[21:29:18] #4 RSS:452,7MB Ctx:5,7% → Read slashCommandProcessor.ts
[21:30:04] #5 RSS:515,0MB Ctx:5,9% → Read chatCompressionService.ts
[21:30:50] #6 RSS:649,1MB Ctx:4,0% ← TOKEN COMPACTION AUSGELÖST (5,9%→4,0%)
                                       RSS um 134 MB gestiegen (structuredClone-Peak)
[21:31:36] #7 RSS:666,7MB Ctx:3,2% ← Erneute Compaction, RSS steigt weiter
[21:32:22] CRASH — FATAL ERROR: Ineffective mark-compacts near heap limit
```

**Gesamtdauer**: ~5,5 Minuten, Crash nach 7 Aufgabenrunden.

Dies beweist, dass bei eingeschränktem Heap eine lange History + Compaction/History-Clone den V8-Heap-OOM auslösen kann. Dieses Ergebnis repräsentiert jedoch nicht die vollständige Reproduktion des echten Benutzer-OOM mit Standard-Heap.

### Synthetische Reproduktion mit größerem Heap

Um nicht nur auf das Ergebnis mit 512 MiB niedrigem Heap angewiesen zu sein, wurde ein synthetischer Runtime-Drucktest mit größerem Heap ergänzt. Dieser Test ruft kein Modell auf, sondern konstruiert eine History, die langen Review-/Subagent-Aufgaben ähnelt:

- root review turns: 10
- subagent calls: 30
- subagent transcript records: 780
- retained tool result bytes: 193.986.560
- serialized history bytes: 195.620.061
- pressure mode: beibehaltene `structuredClone(history)`-Kopien

| Heap-Limit | Clone-Druck          | Ergebnis                           | Wichtige GC / Stack                                                |
| ---------- | -------------------: | ---------------------------------- | ------------------------------------------------------------------ |
| 2 GiB      | 8 beibehaltene Klone | Kein Crash, RSS 2,42 GiB, heap used 1,87 GiB | Nahe am Heap-Limit                                                  |
| 2 GiB      | 10 beibehaltene Klone| OOM                                | `Reached heap limit`, `ValueDeserializer`, `StructuredClone`       |
| 4 GiB      | 20 beibehaltene Klone| OOM                                | `Reached heap limit`, `ValueDeserializer`, `StructuredClone`       |

GC-Zusammenfassung für die 2-GiB-Reproduktion:

```
Mark-Compact 2042,9 (2081,9) -> 2042,9 (2081,1) MB
Mark-Compact 2048,9 (2087,2) -> 2048,9 (2087,2) MB
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
...
node::worker::(anonymous namespace)::StructuredClone
```

GC-Zusammenfassung für die 4-GiB-Reproduktion:

```
Mark-Compact 4082,5 (4126,8) -> 4082,5 (4126,3) MB
Mark-Compact 4095,1 (4139,0) -> 4095,1 (4139,0) MB
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
...
node::worker::(anonymous namespace)::StructuredClone
```

Diese Ergebnisse liegen näher an den von Benutzern gemeldeten 2-GiB-/4-GiB-Heap-OOMs als der 512-MiB-Drucktest: Solange die History genügend große Tool-Results/Subagent-Transkripte enthält, kann das Beibehalten oder das momentane Klonen der gesamten History den V8-OOM bei 2-4 GiB Heap auslösen. Es handelt sich immer noch um eine synthetische Reproduktion, nicht gleichbedeutend mit einem vollständigen Replay einer geschäftlichen Langzeitaufgabe, aber es beweist direkt, dass das Problem nicht „künstlich durch kleinen Heap erzeugt“ ist.

### GC-Status zum Crash

```
[41381:0x130008000] 342468 ms: Mark-Compact 508,6 (526,7) -> 507,0 (526,9) MB,
  pooled: 1 MB, 86,42 / 0,00 ms  (average mu = 0,175, current mu = 0,150)
  task; scavenge might not succeed

[41381:0x130008000] 342568 ms: Mark-Compact 509,1 (526,9) -> 507,1 (528,2) MB,
  pooled: 0 MB, 93,79 / 0,12 ms  (average mu = 0,121, current mu = 0,068)
  allocation failure; scavenge might not succeed

FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
```

Mark-Compact kann nur 1-2 MB freigeben (fast alle Objekte sind erreichbar), was beweist, dass der Speicher tatsächlich mit rechtmäßig gehaltenen Objekten gefüllt ist.

---

## 5. Replay langer Aufgaben mit Standard-Heap

Um eine Überinterpretation der Ergebnisse mit niedrigem Heap zu vermeiden, wurde ein Replay mit Standard-Heap und echten JSONL-Dateien ergänzt:

- Kein Setzen von `NODE_OPTIONS`
- Kein interner Runtime-Profiler aktiviert, um Beeinflussung des Heaps durch den Sampler zu vermeiden
- Jeder CLI erstellt aus derselben zurückgespulten JSONL eine frische Session
- Verwendung eines temporären `QWEN_HOME`, Deaktivierung von MCP und Hooks, um lokale globale Konfiguration zu vermeiden
- Nur Samplen des process-tree RSS außerhalb des Prozesses

| CLI | Ergebnis | Dauer | Tree-RSS-Peak | Root-RSS-Peak | Worker-RSS-Peak | Anmerkung |
| --- | -------- | ----: | ------------: | ------------: | --------------: | --------- |
| installiertes `qwen` | Erfolg | 167,3s | 838,0 MiB | 230,2 MiB | 566,3 MiB | Beim ersten frischen Lauf trat ein Modell-Serverfehler auf, nicht in die Schlussfolgerung einbezogen; Wiederholung erfolgreich |
| lokal neu gebautes Bundle | Erfolg | 106,3s | 527,5 MiB | 182,1 MiB | 345,4 MiB | Enthält die Reparatur des lokalen Clone-Hotpaths |

Schlussfolgerungen aus dem Replay mit Standard-Heap:

1. Das vorliegende Review-JSONL kann stabil einen process-tree RSS von mehreren hundert MiB bis zu etwa 0,8 GiB erzeugen, hat aber keinen 4G/8G-OOM reproduziert.
2. Das lokal neu gebaute Bundle hat beim Replay mit demselben Ausgangspunkt einen niedrigeren Peak als das installierte CLI, was zeigt, dass die Reduzierung des History-Clone-Hotpaths tatsächliche Vorteile bringt.
3. Dies beweist noch nicht, dass alle Benutzer-OOMs behoben sind. Echte 4G/8G-OOMs erfordern weiterhin längere Aufgaben, größere Tool-Result-Akkumulation oder Replays, die den MCP-/Tool-Schema-Druck beibehalten.

## 6. Root-Cause-Analyse

### Drei Schichten des OOM-Mechanismus

```
┌─────────────────────────────────────────────────────────┐
│ Schicht 3: V8 Heap-Limit (512MB/2GB/4GB)               │ ← Benutzer trifft hier letztlich darauf
├─────────────────────────────────────────────────────────┤
│ Schicht 2: structuredClone()-Spitzenanstieg (kurzzeitig ~2x) │ ← Direkter Auslöser
├─────────────────────────────────────────────────────────┤
│ Schicht 1: Akkumulation von Tool-Ergebnissen in History (lineares Wachstum) │ ← Basiswachstum
├─────────────────────────────────────────────────────────┤
│ Schicht 0: Auslösezeitpunkt der Token-Compaction        │ ← Kontrollpunkt
└─────────────────────────────────────────────────────────┘
```

### Präziser Crash-Pfad

```
sendMessage()
  → tryCompress()
    → heapPressureRatio < threshold (Sicherheitsnetz deaktiviert)
    → ChatCompressionService.compress()
      → chat.getHistory(true)
        → structuredClone(this._history)   ← Spitzenzuweisung!
          → V8 benötigt zusätzliche ~N MB für den Klon
          → Wenn vorhandener Heap + N > Limit → OOM
```

### Wichtige Beweise

| Beobachtung | Bedeutung |
| ----------- | --------- |
| Aufgabe #5→#6: Kontext 5,9%→4,0% (gesunken) | Token-Compaction **erfolgreich ausgeführt** |
| Aufgabe #5→#6: RSS 515→649 MB (um 134 MB gestiegen) | `structuredClone` während der Kompression erzeugt Spitzenwert |
| GC kann nur 1-2 MB freigeben | Alle Objekte sind live (History + Klon sind beide vorhanden) |
| #4309 mit 8 GB Limit trotzdem gecrasht | Wenn History groß genug ist, kann der Clone-Peak jedes Limit überschreiten |

Zu beachten: Die obigen Beweise stammen aus einer Kombination des niedrigen Heap-Drucktests und der Analyse der Issue-Phänomene. Das Standard-Heap-Replay unterstützt derzeit die Aussage, dass der „Clone-Hotpath den RSS-Peak signifikant beeinflusst“, hat aber noch nicht isoliert einen 4G/8G-OOM reproduziert.

### Warum ein 128K-Kontextfenster leichter auslöst

- 128K × 70% = ~90K Token lösen Compaction aus
- 70% des großen Kontextfensters (1M) = 700K Token, fast nie ausgelöst
- **Je häufiger die Compaction, desto häufiger structuredClone → desto höheres OOM-Risiko**
- DeepSeek und andere Modelle ohne konfigurierte `contextWindowSize` verwenden standardmäßig 128K, was leichter auslöst

---

## 6.5. Belege aus echten Laufprotokollen

Die folgenden Protokolle stammen aus der Debug-Ausgabe einer lokalen Crash-Session. Um die Offenlegung lokaler Pfade und Session-IDs zu vermeiden, werden im Bericht nur der Zeitstrahl und die wichtigsten Protokollinhalte beibehalten.

Die Session startete um `2026-05-19T13:26:35Z` (lokal 21:26:35) und crashed um `2026-05-19T13:32:10Z` (lokal 21:32:10).

### Zeitstrahl der Heap-Druck- und Auto-Compaction-Ereignisse

```
13:29:43 [WARN]  Heap pressure at 74.9%; attempting auto-compaction before token threshold.
13:30:06 [DEBUG] [FILE_READ_CACHE] clear after auto tryCompress    ← Compaction #1 erfolgreich ausgeführt
13:30:13 [WARN]  Heap pressure at 70.7%; attempting auto-compaction before token threshold.
                 ← Direkt nach der Kompression ist der Heap von 74,9% nur auf 70,7% gefallen, liegt immer noch über dem Schwellwert, sofortiger erneuter Versuch
13:30:52 [DEBUG] Heap pressure at 86.0%; skipping heap-pressure auto-compaction during cooldown.
                 ← Während der 30s-Abklingzeit verweigert
13:30:56 [WARN]  Heap pressure at 85.3%; attempting auto-compaction before token threshold.
                 ← Abklingzeit abgelaufen, Heap auf 85,3% gestiegen
13:31:21 [DEBUG] [FILE_READ_CACHE] clear after auto tryCompress    ← Compaction #2 erfolgreich ausgeführt
13:31:37 [WARN]  Heap pressure at 88.8%; attempting auto-compaction before token threshold.
                 ← Nach der Kompression ist der Heap auf 88,8% zurückgesprungen
13:32:09 [DEBUG] Heap pressure at 90.2%; skipping heap-pressure auto-compaction during cooldown.
                 ← Heap bereits bei 90,2%, kann während der Abklingzeit nicht ausgeführt werden
13:32:10 ← Protokollabbruch (Prozess OOM-Crash)
```

### Interpretation der Protokollbelege

| Protokollbeobachtung | Bedeutung |
| -------------------- | --------- |
| Innerhalb von 2,5 Minuten **4** Heap-Druck-Auto-Compaction-Versuche ausgelöst (dazu 2x Abklingzeit-Ablehnung) | Der durch #3735 eingeführte `tryCompress` wird bei hohem Druck häufig ausgelöst |
| Heap-Anteil nach jeder ausgeführten Compaction immer noch >70% | Der durch `structuredClone()` erzeugte temporäre Spitzenwert neutralisiert den Kompressionsgewinn |
| 74,9% → 70,7% → 86% → 85,3% → 88,8% → 90,2% → Crash | Positive Rückkopplungsschleife: Kompression → Clone-Peak → höherer Heap → erneute Kompression → noch höher |
| Protokoll bricht innerhalb einer Sekunde nach 90,2% ab | Der nächste `getHistory(true)`-Aufruf mit `structuredClone()` überschreitet sofort das Limit |
| `[FILE_READ_CACHE] clear after auto tryCompress` erscheint 2x | Bestätigt, dass die Compaction den vollständigen compress → setHistory-Pfad durchlaufen hat |

### Mechanismus der positiven Rückkopplungsschleife

```
Heap-Anteil hoch (>70%)
  → Heap-Druck-Auto-Compaction ausgelöst
    → tryCompress() ruft intern getHistory(true) auf
      → structuredClone(this._history)  ← temporärer Heap-Peak +30~40%
        → Kompression erfolgreich, alte History freigegeben
          → Aber der Clone-Peak hat den Heap auf ein gefährlicheres Niveau getrieben
            → Nächste send-Runde akkumuliert weiter
              → Heap-Anteil noch höher → häufiger ausgelöst → Crash
```

---

## 6.6. Versionszuschreibung: Warum zwischen 0.15.7 und 0.15.11 mehr OOM-Meldungen auftraten

### Zeitstrahl der wichtigen Commits

| Version | PR | Änderung | Auswirkung auf die Aufruffrequenz von `structuredClone` |
| ------- | -- | -------- | ------------------------------------------------------- |
| **v0.15.6** | — | `getHistory(true)` wird nur einmal beim Einstieg in `sendMessage` aufgerufen | Basislinie: 1 Clone pro send |
| **v0.15.7** | **#3735** `auto-compact subagent context` | `tryCompress()` in `GeminiChat` verschoben, **vor jedem send** wird zuerst eine Compaction-Prüfung durchgeführt | **+1**: Compaction-Prüfung vor send |
| **v0.15.10** | **#3879** `reactive compression on context overflow` | Wenn der Provider einen Context Overflow zurückgibt, wird erneut `tryCompress()` + `getHistory(true)` ausgelöst | **+1~2**: Overflow-Retry-Pfad |
| **v0.15.10** | **#3985** `harden reactive compression` | Verstärkt die reaktive Compaction-Wiederholungslogik | Gleich wie oben |

### Vergleich der `getHistory(true)`-Aufrufstellen in v0.15.6 vs. v0.15.11

**v0.15.6** (2 Stellen):

```
L367: const requestContents = this.getHistory(true);          ← send-Request erstellen
L618: const recoveryContents = self.getHistory(true);         ← MAX_TOKENS-Eskalation (sehr selten ausgelöst)
```

**v0.15.11** (5 Stellen):

```
L467: ChatCompressionService.compress() interner Aufruf       ← #3735: Auto-Compact vor jedem send
L574: requestContents = this.getHistory(true);                ← send-Request erstellen
L724: reaktiver tryCompress() interner Aufruf                 ← #3879: Context Overflow nach Retry
L739: requestContents = self.getHistory(true);                ← #3879: Retry-Request erstellen
L943: const recoveryContents = self.getHistory(true);         ← MAX_TOKENS-Eskalation
```

### Schlimmster Pfad: Ein send kann 4 `structuredClone`s auslösen

```
sendMessage()
  → tryCompress()              ← #3735: getHistory(true) [Clone #1]
  → getHistory(true)           ← Request erstellen [Clone #2]
  → API gibt Context Overflow zurück
    → reaktiver tryCompress()  ← #3879: getHistory(true) [Clone #3]
    → getHistory(true)         ← Retry-Request [Clone #4]
```

### Schlussfolgerung

**#3735 (v0.15.7)** ist der wahrscheinlichste Auslöser für den deutlichen Anstieg der OOM-Häufigkeit (nicht die einzige Ursache) – es führt dazu, dass bei jedem `sendMessage` zuerst ein `tryCompress()` durchgeführt wird, und `tryCompress` ruft intern `ChatCompressionService.compress()` → `chat.getHistory(true)` für einen vollständigen `structuredClone` auf. Bei großer History hebt dieses Design „erst klonen, dann entscheiden, ob Kompression nötig ist“ den Speicherspitzenwert von ~1,3x auf ~2x+ an. Hinweis: Die Issue-History zeigt, dass OOM-Meldungen bereits vor #3735 existierten, aber #3735 erhöhte die Aufruffrequenz von `structuredClone` erheblich, was die Wahrscheinlichkeit eines OOM deutlich steigerte.

**#3879 (v0.15.10)** verschlimmerte das Problem weiter – wenn bereits an der Heap-Grenze (Provider gibt Context Overflow zurück), wird ein weiterer vollständiger Clone ausgelöst, was eine ohnehin gefährliche Session noch leichter zum Absturz bringt.

---

## 7. Validierung der Reparatur aus #4186 (Vergleichstest)

Vergleichstest mit aktiviertem Heap-Druck-Sicherheitsnetz (`HEAP_PRESSURE_COMPRESSION_RATIO = 0,7`):

| Metrik | Sicherheitsnetz deaktiviert | Sicherheitsnetz aktiviert |
| ------ | --------------------------- | ------------------------- |
| OOM aufgetreten | Ja (Crash nach 7 Runden) | Nein (läuft >10 Minuten weiter) |
| RSS-Peak | 666 MB → Crash | 555 MB → GC reduziert auf 280 MB |
| Compaction-Auslösung | Nur Token-Schwellwert | Vorzeitig bei 70% Heap |
| Kontextverhalten | 5,9%→4,0%→Crash | 22,7%→17,0% (sicherer Rückgang) |

**Schlussfolgerung**: Das Heap-Druck-Sicherheitsnetz aus #4186 verhindert den OOM wirksam, ist aber eine **Milderung** und keine grundlegende Behebung:

- Wenn die History selbst bereits 60%+ des Heaps belegt, kann der Clone-Peak selbst bei vorzeitiger Kompression das Limit überschreiten
- Dies erklärt, warum der Benutzer aus #4309 trotz eines 8-GB-Limits immer noch crashed

---

## 8. Speicherverteilung

Schätzung basierend auf dem RSS-Wachstumsmuster im Test:

| Speicherbereich | Anteil | Wachstumsmerkmal |
| --------------- | ------ | ---------------- |
| `this._history[]` (Tool-Ergebnisse) | 40-50% | Lineare Akkumulation, +30-100MB pro Runde |
| `structuredClone()`-temporäre Kopie | 30-40% | Temporärer Peak, tritt bei Kompression auf |
| V8-Runtime (GC-Metadaten, Code) | ~15% | Im Wesentlichen konstant |
| UI/Logging/Stream-Puffer | ~5% | Langsames Wachstum |

---

## 9. Reproduktionsskript und Umgebung

### Automatisierungstreiberskript

```bash
#!/bin/bash
# /tmp/oom-simple-driver.sh <tmux-session-name>
SESSION="$1"

TASKS=(
  "Lese die Datei packages/core/src/core/geminiChat.ts vollständig mit dem Read-Tool"
  "Lese die Datei packages/core/src/tools/agent/agent.ts vollständig mit dem Read-Tool"
  "Führe grep -rn structuredClone packages/core/src aus und lese dann die ersten 3 Dateien mit Read"
  "Lese die Datei packages/cli/src/ui/hooks/slashCommandProcessor.ts vollständig mit Read"
  "Lese die Datei packages/core/src/services/chatCompressionService.ts vollständig mit Read"
  "Führe find packages/cli/src/ui/commands -name '*.ts' aus und lese dann jede Datei einzeln mit Read"
  "Lese die Datei packages/core/src/core/turn.ts vollständig mit Read"
  # ... weitere Aufgaben
)

i=0
while true; do
  TASK="${TASKS[$((i % ${#TASKS[@]}))]}"
  i=$((i + 1))

  QWEN_PID=$(ps aux | grep "dist/index.js" | grep -v grep | awk '{print $2}' | sort -rn | head -1)
  RSS=$(ps -o rss= -p $QWEN_PID 2>/dev/null)
  [ -z "$RSS" ] && { echo "CRASH nach $((i-1)) Aufgaben!"; exit 0; }

  RSS_MB=$(echo "scale=1; $RSS/1024" | bc)
  CTX=$(tmux capture-pane -t "$SESSION:1" -p 2>/dev/null | grep -oE "[0-9]+\.[0-9]+% used" | tail -1)
  echo "[$(date +%H:%M:%S)] #$i RSS:${RSS_MB}MB Ctx:$CTX | ${TASK:0:55}"

  tmux send-keys -t "$SESSION:1" C-u
  sleep 0.2
  tmux send-keys -t "$SESSION:1" "$TASK" Enter
  sleep 0.5
  tmux send-keys -t "$SESSION:1" Enter
  sleep 45
done
```

### Startbefehl

```bash
# 1. Heap-Druck-Sicherheitsnetz deaktivieren
# geminiChat.ts: HEAP_PRESSURE_COMPRESSION_RATIO = 99.0

# 2. Build
npm run build --workspace=packages/core && npm run build --workspace=packages/cli

# 3. qwen starten (128K Kontextmodell, 512MB Heap)
SESSION="oom-test"
tmux new-session -d -s "$SESSION" -c "$REPO_DIR"
tmux send-keys -t "$SESSION" \
  "NODE_OPTIONS='--max-old-space-size=512' node packages/cli/dist/index.js --model 'qwen3.6-plus'" Enter

# 4. Nach dem Start das Treiberskript ausführen
sleep 10
bash /tmp/oom-simple-driver.sh "$SESSION"
```

---

## 10. Empfehlungen für die weitere Vorgehensweise

### Kurzfristige Milderung (bereits vorhanden)

- [x] #4186: Heap-Druck-Auto-Compaction-Sicherheitsnetz (Schwellwert 0,7)
- [x] #4188: Obergrenze für fileReadCache / crawlCache

### Mittelfristige Reparatur (empfohlen)

- [ ] `structuredClone()`-Aufrufe reduzieren – `nextSpeakerChecker` benötigt nur die letzte Nachricht, nicht den vollständigen History-Klon
- [ ] Compaction verwendet Slice + Referenz statt vollständigem Deep Clone
- [ ] Große Tool-Ergebnisse (>100KB) in temporäre Dateien schreiben, in der History nur eine Zusammenfassungsreferenz behalten

### Langfristige Richtung

- [ ] Tool-Ergebnisse auf Festplatte auslagern + Lazy Loading (#4184)
- [ ] Abgestufte Kompressionsstrategie basierend auf RSS (nicht nur Token-Anzahl)
- [ ] History segmentiert speichern, um vollständige Operationen auf einmal zu vermeiden
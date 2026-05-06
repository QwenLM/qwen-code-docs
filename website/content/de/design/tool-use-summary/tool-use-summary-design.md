# Tool-Use Summary Design

> Fast-Model-Labels für parallele Tool-Batches – Motivation, Wettbewerbsanalyse mit Claude Code, Architektur und die Begründung für das append-only-Static-Verhalten, das das aktuelle Full-Mode-Rendering bestimmt hat.
>
> Benutzerdokumentation: [Tool-Use Summaries](../../users/features/tool-use-summaries.md).

## 1. Zusammenfassung

Nach Abschluss jedes Tool-Batches löst Qwen Code einen kurzen Fast-Model-Aufruf aus, der ein Label im Stil einer Git-Commit-Subject-Zeile zurückgibt und den Batch zusammenfasst. Das Label wird im Full-Mode als ausgeblendete Inline-Zeile `● <label>` angezeigt und ersetzt im Compact-Mode den generischen Header `Tool × N`. Die Generierung läuft im Fire-and-Forget-Modus parallel zum API-Stream des nächsten Turns, sodass die Latenz von ~1 s durch das Streaming des Hauptmodells verdeckt wird.

| Dimension             | Claude Code                                                           | Qwen Code                                                                                  |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Trigger-Punkt         | `query.ts` – nach Finalisierung eines Tool-Batches                    | `useGeminiStream.ts` → `handleCompletedTools` – derselbe Lifecycle-Punkt                   |
| Generierungsmodell    | Haiku über `queryHaiku`                                               | Konfiguriertes `fastModel` über `GeminiClient.generateContent`                             |
| Subagent-Verhalten    | `!toolUseContext.agentId` – nur Hauptsession                          | Implizit – Subagents laufen über `agents/runtime/`, nicht über `useGeminiStream`           |
| Scheduling            | Fire-and-Forget, awaited direkt vor Stream-Emission des nächsten Turns| Fire-and-Forget, bei Auflösung zur History hinzugefügt                                     |
| Ausgabeformat         | `ToolUseSummaryMessage` in den SDK-Stream geyieldet                   | `HistoryItemToolUseSummary` zur UI-History hinzugefügt + Factory für zukünftige SDK-Nutzung exportiert |
| Feature-Gate          | `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES` Env, Standard **off**           | `experimental.emitToolUseSummaries` Setting (Standard **on**) + Env-Override               |
| Primärer Consumer     | Mobile / SDK-Clients                                                  | CLI Compact-Mode + Full-Mode, zukünftiges SDK                                              |
| Prompt                | Git-Commit-Subject, Vergangenheit, markantestes Nomen (1:1 portiert)  | Identischer System-Prompt                                                                  |
| Input-Trunkierung     | 300 Zeichen pro Tool-Feld über `truncateJson`                         | Identisch                                                                                  |
| Intent-Präfix         | Erste 200 Zeichen der letzten Assistant-Message                       | Identisch                                                                                  |
| Prompt-Caching        | `enablePromptCaching: true` beim Haiku-Aufruf                         | Noch nicht angebunden (forked-agent-Route verfügbar; als zukünftige Optimierung markiert)  |
| Label-Nachbearbeitung | Raw Model-Text                                                        | `cleanSummary` (entfernt Markdown, Anführungszeichen, Error-Präfixe; capped bei 100 Zeichen, ReDoS-sicher begrenzt) |
| Session-Persistenz    | Nur Stream; jede Session regeneriert                                  | Nur UI-History; `ChatRecordingService` persistiert keine `tool_use_summary`-Einträge       |

## 2. Analyse der Claude-Code-Implementierung

### 2.1 Ablauf

Claude Code führt die Tool-Schleife in `query.ts` aus. Nachdem ein Tool-Batch ausgeführt und seine Ergebnisse normalisiert wurden, forked die Generator-Funktion einen Haiku-Aufruf, speichert das ausstehende Promise in `nextPendingToolUseSummary` und fährt mit dem API-Aufruf des nächsten Turns fort. Die Latenz von Haiku (~1 s) überlappt mit dem Streaming des Hauptmodells (5–30 s), sodass für den Nutzer keine zusätzliche Latenz sichtbar ist. Kurz vor der Ausgabe des Inhalts des nächsten Turns wartet der Generator auf die ausstehende Zusammenfassung und yieldet eine `tool_use_summary`-Message in den Stream.

```
tool_batch_complete → fork queryHaiku (fire-and-forget)
                          ↓
               next_turn_stream_starts
                          ↓
       ← summary Promise resolves during streaming →
                          ↓
       await pendingToolUseSummary → yield ToolUseSummaryMessage
                          ↓
                continue with next turn
```

### 2.2 Wichtige Quelldateien

| Komponente       | Datei                                                      | Kernlogik                                                                               |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Generator        | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97` | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })` |
| Trigger          | `query.ts:1411-1482`                                       | Guard durch `emitToolUseSummaries`-Gate + kein Subagent; fork Haiku; Promise weitertragen |
| Await + Emit     | `query.ts:1055-1060`                                       | Await `pendingToolUseSummary` an Next-Turn-Boundary, Message yielden                    |
| Message-Factory  | `utils/messages.ts:5105-5116`                              | `createToolUseSummaryMessage(summary, precedingToolUseIds)`                             |
| Feature-Gate     | `query/config.ts:23,36-38`                                 | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)`                |

### 2.3 Designentscheidungen

1. **Immer generieren, wenn das Gate aktiv ist, unabhängig vom Compact-/Detail-Status.** Die Zusammenfassung ist ein Stream-Level-Artefakt; die UI entscheidet, ob sie gerendert wird.
2. **Als erstklassiger Message-Typ ausgeben.** `tool_use_summary` steht im SDK-Stream neben `user`, `assistant` und `tool_result` und enthält ein `precedingToolUseIds`-Feld, damit Consumer sie dem Batch zuordnen können.
3. **Subagents sind ausgeschlossen.** `!toolUseContext.agentId` – Die Ausgabe von Subagents wird upstream aggregiert; einzelne Subagent-Batches würden verrauschte Labels erzeugen, die nie in der primären UI erscheinen.
4. **Standardmäßig deaktiviert.** Das reine Env-Gate hält die Kosten bei null, solange kein downstream SDK-Consumer es aktiviert. Das CC-Terminal selbst rendert die Message nicht.
5. **Input-Trunkierung auf 300 Zeichen pro Feld.** Deckt das größte Kostenrisiko ab – ein einzelnes großes Tool-Ergebnis, das den Prompt aufbläht –, während genug Signal für das Label erhalten bleibt.

## 3. Qwen-Code-Implementierung

### 3.1 Ablauf

Qwen Code hookt denselben Lifecycle-Punkt (`useGeminiStream.handleCompletedTools`), rendert aber auf beiden Seiten von `ui.compactMode`, sodass das Feature auch für CLI-Nutzer ohne SDK-Integration nützlich ist.

```
tool_batch_complete (handleCompletedTools)
           ↓
  config.getEmitToolUseSummaries()?
           ↓
   fork generateToolUseSummary (fire-and-forget)
           ↓
  submitQuery() for next turn (streaming starts)
           ↓
   ← summary Promise resolves during streaming →
           ↓
  addItem({type:'tool_use_summary', summary, precedingToolUseIds})
           ↓
  HistoryItemDisplay renders:
    compactMode=false → ● <label> standalone line
    compactMode=true  → hidden; MainContent lookup injects into CompactToolGroupDisplay header
```

### 3.2 Wichtige Quelldateien

| Komponente           | Datei                                                                 | Kernlogik                                                                 |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Service              | `packages/core/src/services/toolUseSummary.ts`                        | `generateToolUseSummary`, `truncateJson`, `cleanSummary`, Message-Factory |
| Config-Gate          | `packages/core/src/config/config.ts:getEmitToolUseSummaries`          | Env-Override → Settings → Standard (true)                                 |
| Trigger              | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools`   | Löst Fast-Model-Aufruf aus, fügt `addItem` bei Auflösung hinzu            |
| Full-Mode-Rendering  | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Rendert `● <label>`-Zeile, wenn `!compactMode`                            |
| Compact-Mode-Lookup  | `packages/cli/src/ui/components/MainContent.tsx`                      | `summaryByCallId`-Map → `compactLabel`-Prop für jede `tool_group`         |
| Compact-Header       | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Ersetzt Standard `Tool × N` durch `<Summary> · N tools`, wenn Label vorhanden |
| Merge-Handling       | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts`                 | Behandelt `tool_use_summary` als hidden-in-compact für Adjazenz           |
| UI-Typ               | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary`              | `{ type: 'tool_use_summary', summary, precedingToolUseIds }`              |

### 3.3 Die `<Static>`-Append-Only-Einschränkung

Die zentrale Architektur-Entscheidung in diesem PR ist die Frage, warum das Full-Mode-Label ein eigenständiges History-Item ist und keine Dekoration am `tool_group` selbst.

Qwen Code rendert das Transkript über Inks `<Static>`. Static ist append-only: Sobald ein Item im Terminal-Buffer committed ist, zeichnet Ink diesen Bereich nicht neu, es sei denn, `refreshStatic()` wird aufgerufen, um das gesamte Transkript zu löschen und neu zu rendern. Dies ist das Performance-Modell, auf das die CLI angewiesen ist – statische Items werden nicht bei jedem Tastendruck neu gerendert.

Betrachtet man nun das Timing des Fast-Model-Aufrufs:

```
T0   tool batch completes, tool_group is pushed to history
T0+ε tool_group renders through <Static> and is committed to the buffer
T0+1s fast-model call resolves with a label
```

Bei T0+1s können wir das Label nicht nachträglich zum bereits committed `tool_group` hinzufügen. Es gibt zwei Optionen:

1. **Props des `tool_group` aktualisieren + `refreshStatic()` aufrufen.** Funktioniert, verursacht aber bei jedem Batch ein vollständiges Neuzeichnen des Transkripts – eine der teuersten UI-Operationen in der App. Sichtbares Flackern. Für ein kosmetisches Label inakzeptabel.
2. **Die Zusammenfassung als eigenes neues History-Item rendern, das _nach_ dem `tool_group` angehängt wird.** Static verarbeitet dies nativ – neue Items werden sauber angehängt, kein Neuzeichnen.

Dieser PR wählt im Full-Mode Option 2. Der `tool_use_summary`-Eintrag ist ein echtes History-Item, das von `HistoryItemDisplay` als einzelne ausgeblendete Zeile `● <label>` gerendert wird. Kein `refreshStatic` erforderlich.

Im Compact-Mode ist es aufgrund von `mergeCompactToolGroups` anders. Wenn aufeinanderfolgende `tool_group`s gemergt werden, ruft `MainContent` bereits `refreshStatic()` auf – das ist ein bestehender Code-Pfad, der die gemergte Gruppe mit dem aus der History nachgeschlagenen Label neu rendert. Der Compact-Mode erhält das Label also als Header-Ersatz. Um zu vermeiden, dass dasselbe Label zweimal gerendert wird (einmal als Compact-Header, einmal als nachgestellte `● <label>`-Zeile), blendet `HistoryItemDisplay` die eigenständige Zeile aus, wenn `compactMode` true ist.

```
Full mode              Compact mode (with merge)
───────────            ─────────────────────────
[tool_group]           [merged tool_group — header replaced via lookup]
● <label>              (● <label> line is hidden)
```

### 3.4 Gate-Semantik

Drei Schichten, aufgelöst in folgender Prioritätsreihenfolge:

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` – Env-Override, höchste Priorität.
2. `experimental.emitToolUseSummaries` in `settings.json` – Standardwert `true`.
3. Implizites Skippen – wenn `config.getFastModel()` `undefined` zurückgibt, wird die Generierung unabhängig vom Gate übersprungen. Kein Fehler, keine für den Nutzer sichtbare Änderung.

### 3.5 Ausgabe-Bereinigung

`cleanSummary` wird auf jede Model-Antwort angewendet, bevor sie zur History hinzugefügt wird:

1. Nur die erste Zeile übernehmen (verwirft Model-Reasoning-Präambeln).
2. Bullet-Präfixe (`-`, `*`, `•`) entfernen – Models geben das Label manchmal als Listenelement zurück.
3. Umgebende Anführungszeichen/Backticks über einen begrenzten `{1,10}`-Regex entfernen (CodeQL-sicher; kein echtes Label hat mehr als eine Handvoll umschließender Zeichen).
4. Präfix-Labels (`Label:`, `Summary:`, `Result:`, `Output:`) entfernen, die einige Models voranstellen.
5. Error-Message-Formate ablehnen (`API error: ...`, `Error: ...`, `I cannot ...`, `I can't ...`, `Unable to ...`) – gibt einen leeren String zurück, sodass kein History-Item hinzugefügt wird.
6. Länge hart auf 100 Zeichen begrenzen (Mobile-UI kürzt bei ~30; der Puffer deckt CJK-Phrasen ab).

### 3.6 Telemetrie

Der Aufruf zur Zusammenfassungsgenerierung setzt `promptId: 'tool_use_summary_generation'`, sodass seine Token-Nutzung separat in `/stats` erfasst wird. Dies ermöglicht Nutzern, die exakten inkrementellen Kosten des Features zu sehen, ohne sie mit Prompt-Vorschlägen oder der Nutzung der Hauptsession zu vermischen.

## 4. Abweichungen von Claude Code (und warum)

| Abweichung                                                               | Warum                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einstellungsschicht zusätzlich zum Env-Gate                              | Qwen Code rendert das Label in der CLI; Nutzer benötigen einen persistenten Schalter, keinen Env-Export pro Shell.                                                                        |
| Standardmäßig aktiviert statt deaktiviert                                | Das Label ist in beiden Anzeigemodi sofort für den Nutzer sichtbar; Nutzer, die `fastModel` konfigurieren, haben sich bereits für Fast-Model-Features entschieden.                        |
| Dedizierte `cleanSummary`-Nachbearbeitung                                | Qwen Code unterstützt heterogenere Provider als CC; einige Models stellen `Label:` voran oder umschließen es mit Anführungszeichen. Die Normalisierung an der Boundary hält die UI konsistent. |
| Speichert `HistoryItemToolUseSummary` statt eine Stream-Message auszugeben | CLI-first-Implementierung; der SDK-Stream-Pfad ist ein zukünftiger PR. Die `ToolUseSummaryMessage`-Factory ist für diese Arbeit bereits exportiert.                                     |
| Prompt-Caching noch nicht angebunden                                     | Das Fast-Model ist für Nutzer ohne separates Konfiguration oft dasselbe wie das Hauptmodel. Das Hinzufügen von Cache-Sharing erfordert Routing über `forkedAgent.ts`; als Follow-up getrackt. |
| Duale Render-Pfade (Full-Mode-Inline + Compact-Mode-Header)              | Der Standardwert von Qwen Code ist `ui.compactMode: false`; ohne das Inline-Full-Mode-Rendering wäre das Feature für die meisten Nutzer unsichtbar.                                     |

## 5. Bekannte Einschränkungen

- **Keine Session-Persistenz.** `tool_use_summary` wird nicht in die Chat-Recording-JSONL geschrieben. Beim Fortsetzen einer Session gehen Labels verloren; Tool-Groups rendern als Fallback mit dem generischen Header. Niedrige Priorität: Labels werden natürlich neu generiert, sobald der Nutzer die Session fortsetzt.
- **Noch keine SDK-Stream-Ausgabe.** Die Message-Factory ist exportiert, aber die CLI speist `tool_use_summary` noch nicht in die SDK-Bridge ein. Follow-up-PR.
- **Kein Prompt-Caching.** Jeder Batch verursacht neue Input-Token-Kosten. Absolut vernachlässigbar (~300 Token), aber messbar, wenn Dutzende Batches pro Turn ausgeführt werden.
- **Zusammenfassung für gemergte Compact-Groups übernimmt das Label des ersten beitragenden Batches.** Wenn ein Nutzer zehn unterschiedliche Batches direkt hintereinander ausführt (enge Schleife, nicht typisch), zeigt der gemergte Compact-Header nur die Intent des ersten Batches. Akzeptierter Trade-off: Das Aufdröseln von Pro-Batch-Labels in einer gemergten Ansicht ist visuell verrauschter als die Übernahme des ersten.
- **Fast-Model erforderlich.** Ohne konfiguriertes `fastModel` wird die Generierung übersprungen. Ein Fallback auf das Hauptmodel ist bewusst deaktiviert, um das Kostenprofil begrenzt zu halten.

## 6. Zukünftige Arbeiten

1. `ToolUseSummaryMessage` in die SDK-Bridge einbinden, sodass die bestehende Factory downstream genutzt wird.
2. Generierung über `forkedAgent.ts` mit `enablePromptCaching` routen, sodass wiederholte Tool-Name-Präfixe Provider-Caches treffen.
3. Optional: `tool_use_summary`-Einträge in `ChatRecordingService` persistieren und beim Session-Resume wiedergeben.
4. Optional: Pro-Tool-Name-Label-Shortcuts (z. B. immer `Read <filename>` für einen einzelnen `read_file`-Aufruf) als Pre-LLM-Fast-Path.
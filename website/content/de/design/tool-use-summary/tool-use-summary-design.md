# Zusammenfassung Tool-Nutzung

> Schnellmodell-Labels für parallele Tool-Batches – Motivation, Wettbewerbsanalyse mit Claude Code, Architektur und die rationale Begründung für das Append-Only-`<Static>`, das zur aktuellen Vollmodus-Darstellung führte.
>
> Benutzerdokumentation: [Tool-Use-Zusammenfassungen](../../users/features/tool-use-summaries.md).

## 1. Zusammenfassung für die Geschäftsleitung

Nachdem jeder Tool-Batch abgeschlossen ist, sendet Qwen Code einen kurzen Fast-Model-Aufruf, der ein Label im Git-Commit-Betreff-Stil zurückgibt, das den Batch zusammenfasst. Das Label wird im Vollmodus als eine eingerückte, abgedunkelte `● <label>`-Zeile angezeigt und ersetzt im kompakten Modus den generischen `Tool × N`-Header. Die Generierung läuft fire-and-forget parallel zum API-Stream des nächsten Durchgangs, sodass die ~1s Latenz hinter dem Streaming des Hauptmodells verborgen bleibt.

| Dimension             | Claude Code                                                           | Qwen Code                                                                                  |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Auslösepunkt          | `query.ts` – nachdem ein Tool-Batch finalisiert wurde                 | `useGeminiStream.ts` → `handleCompletedTools` – gleicher Lebenszykluspunkt                 |
| Generierungsmodell    | Haiku via `queryHaiku`                                                | Konfigurierter `fastModel` via `GeminiClient.generateContent`                               |
| Subagentenverhalten   | `!toolUseContext.agentId` – nur Hauptsitzung                          | Implizit – Subagenten laufen über `agents/runtime/`, nicht `useGeminiStream`               |
| Planung               | Fire-and-forget, wird direkt vor dem nächsten Turn-Stream erwartet    | Fire-and-forget, wird bei Auflösung an den Verlauf angehängt                               |
| Ausgabeform           | `ToolUseSummaryMessage` in den SDK-Stream eingefügt                   | `HistoryItemToolUseSummary` zur UI-Historie hinzugefügt + Factory für zukünftige SDK-Nutzung exportiert |
| Schalter              | `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES`-Env, Standard **aus**           | `experimental.emitToolUseSummaries`-Einstellung (Standard **an**) + Env-Override           |
| Primärer Konsument    | Mobile / SDK-Clients                                                  | CLI Kompaktmodus + Vollmodus, zukünftig SDK                                                |
| Prompt                | Git-Commit-Betreff, Vergangenheitsform, markantestes Nomen (wörtlich übernommen) | Identischer Systemprompt                                                            |
| Eingabeabschneidung   | 300 Zeichen pro Tool-Feld via `truncateJson`                          | Identisch                                                                                  |
| Absichtspräfix        | Erste 200 Zeichen der letzten Nachricht des Assistenten               | Identisch                                                                                  |
| Prompt-Caching        | `enablePromptCaching: true` beim Haiku-Aufruf                         | Noch nicht implementiert (forked-agent-Route verfügbar; als zukünftige Optimierung markiert) |
| Nachbearbeitung Label | Roher Modelltext                                                      | `cleanSummary` (entfernt Markdown, Anführungszeichen, Fehlerpräfixe; begrenzt auf 100 Zeichen, ReDoS-begrenzt) |
| Sitzungspersistenz    | Nur Stream; jede Sitzung generiert neu                                 | Nur UI-Verlauf; `ChatRecordingService` speichert `tool_use_summary`-Einträge nicht          |

## 2. Analyse der Claude Code-Implementierung

### 2.1 Ablauf

Claude Code führt die Tool-Schleife in `query.ts` aus. Nachdem ein Tool-Batch ausgeführt und seine Ergebnisse normalisiert wurden, verzweigt die Generatorfunktion einen Haiku-Aufruf, behält das ausstehende Promise in `nextPendingToolUseSummary` und fährt mit dem API-Aufruf des nächsten Durchgangs fort. Die Haiku-Latenz (~1s) überlappt sich mit dem Streaming des Hauptmodells (5–30s), sodass der Benutzer keine zusätzliche Latenz sieht. Direkt vor dem Senden des nächsten Durchgangsinhalts wartet der Generator auf die ausstehende Zusammenfassung und gibt eine `tool_use_summary`-Nachricht in den Stream aus.

```
tool_batch_complete → queryHaiku verzweigen (fire-and-forget)
                          ↓
               Nächster_Turn_Stream_startet
                          ↓
       ← summary Promise wird während des Streamings aufgelöst →
                          ↓
       await pendingToolUseSummary → yield ToolUseSummaryMessage
                          ↓
                mit nächstem Turn fortfahren
```

### 2.2 Wichtige Quelldateien

| Komponente       | Datei                                                       | Schlüssellogik                                                                               |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Generator       | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97` | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })`      |
| Auslöser        | `query.ts:1411-1482`                                       | Guard durch `emitToolUseSummaries`-Gate + kein Subagent; Haiku verzweigen; Promise weitertragen |
| Warten + Senden | `query.ts:1055-1060`                                       | `pendingToolUseSummary` an der nächsten Turn-Grenze erwarten, Nachricht senden                |
| Nachrichten-Factory | `utils/messages.ts:5105-5116`                              | `createToolUseSummaryMessage(summary, precedingToolUseIds)`                                 |
| Feature-Gate    | `query/config.ts:23,36-38`                                 | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)`                     |

### 2.3 Design-Entscheidungen

1. **Immer generieren, wenn das Gate aktiv ist, unabhängig vom Kompakt-/Detailzustand.** Die Zusammenfassung ist ein Artefakt auf Stream-Ebene; die UI entscheidet, ob sie dargestellt wird.
2. **Als erstklassigen Nachrichtentyp senden.** `tool_use_summary` steht neben `user`, `assistant`, `tool_result` im SDK-Stream mit einem `precedingToolUseIds`-Feld, damit Konsumenten es dem Batch zuordnen können.
3. **Subagenten sind ausgeschlossen.** `!toolUseContext.agentId` – die Ausgabe von Subagenten wird vorgelagert aggregiert; einzelne Subagenten-Batches würden verrauschte Labels erzeugen, die nie in der primären UI auftauchen.
4. **Standardmäßig aus.** Das reine Env-Gate hält die Kosten bei Null, es sei denn, ein nachgelagerter SDK-Konsument aktiviert es. Das CC-Terminal selbst stellt die Nachricht nicht dar.
5. **Eingabeabschneidung bei 300 Zeichen pro Feld.** Deckt das dominante Kostenrisiko ab – ein einzelnes großes Tool-Ergebnis, das den Prompt aufbläht – während genug Signal für das Label erhalten bleibt.

## 3. Qwen Code-Implementierung

### 3.1 Ablauf

Qwen Code greift am selben Lebenszykluspunkt ein (`useGeminiStream.handleCompletedTools`), rendert aber auf beiden Seiten von `ui.compactMode`, sodass die Funktion für CLI-Benutzer ohne SDK-Infrastruktur nützlich ist.

```
tool_batch_complete (handleCompletedTools)
           ↓
  config.getEmitToolUseSummaries()?
           ↓
   generateToolUseSummary verzweigen (fire-and-forget)
           ↓
  submitQuery() für nächsten Turn (Streaming beginnt)
           ↓
   ← summary Promise wird während des Streamings aufgelöst →
           ↓
  addItem({type:'tool_use_summary', summary, precedingToolUseIds})
           ↓
  HistoryItemDisplay rendert:
    compactMode=false → ● <label> eigenständige Zeile
    compactMode=true  → versteckt; MainContent-Suche injiziert in CompactToolGroupDisplay-Header
```

### 3.2 Wichtige Quelldateien

| Komponente           | Datei                                                                  | Schlüssellogik                                                                 |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Service             | `packages/core/src/services/toolUseSummary.ts`                        | `generateToolUseSummary`, `truncateJson`, `cleanSummary`, Nachrichten-Factory |
| Konfigurations-Gate | `packages/core/src/config/config.ts:getEmitToolUseSummaries`          | Env-Override → Einstellungen → Standard (true)                              |
| Auslöser            | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools`   | Ruft Fast-Model auf, addItem bei Auflösung                                  |
| Vollmodus-Darstellung | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Rendert `● <label>`-Zeile wenn `!compactMode`                              |
| Kompaktmodus-Suche  | `packages/cli/src/ui/components/MainContent.tsx`                      | `summaryByCallId`-Map → `compactLabel`-Prop an jede tool_group              |
| Kompakt-Header      | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Ersetzt Standard `Tool × N` durch `<Summary> · N tools` wenn Label vorhanden |
| Merge-Handling      | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts`                 | Behandelt `tool_use_summary` als versteckt-im-Kompaktmodus für Adjazenz    |
| UI-Typ              | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary`              | `{ type: 'tool_use_summary', summary, precedingToolUseIds }`              |

### 3.3 Die `<Static>`-Anhänge-nur-Einschränkung

Die zentrale architektonische Entscheidung in diesem PR ist, **warum das Vollmodus-Label ein eigenständiges History-Item und keine Verzierung der tool_group selbst ist.**

Qwen Code rendert das Transkript über Inks `<Static>`. Static ist append-only: Sobald ein Element im Terminalpuffer festgeschrieben ist, wird Ink diesen Bereich nicht neu zeichnen, es sei denn, `refreshStatic()` wird aufgerufen, um das gesamte Transkript zu löschen und neu zu rendern. Dies ist das Leistungsmodell, auf das die CLI angewiesen ist – statische Elemente werden bei jedem Tastendruck nicht neu gerendert.

Betrachten wir nun das Timing des Fast-Model-Aufrufs:

```
T0   Tool-Batch abgeschlossen, tool_group wird zum Verlauf hinzugefügt
T0+ε tool_group rendert über <Static> und wird in den Puffer geschrieben
T0+1s Fast-Model-Aufruf wird mit einem Label aufgelöst
```

Bei T0+1s können wir das Label nicht nachträglich zur bereits festgeschriebenen tool_group hinzufügen. Es gibt zwei Optionen:

1. **Die Props der tool_group aktualisieren + `refreshStatic()` aufrufen.** Funktioniert, verursacht aber bei jedem Batch eine vollständige Neuzeichnung des Transkripts – eine der teuersten UI-Operationen in der App. Sichtbares Flackern. Für ein kosmetisches Label inakzeptabel.
2. **Die Zusammenfassung als eigenes neues History-Item rendern, das _nach_ der tool_group angehängt wird.** Static handhabt dies nativ – neue Elemente werden sauber angehängt, kein Neuzeichnen erforderlich.

Dieser PR wählt im Vollmodus Option 2. Der `tool_use_summary`-Eintrag ist ein echtes History-Item, das von `HistoryItemDisplay` als einzelne abgedunkelte `● <label>`-Zeile gerendert wird. Kein `refreshStatic` erforderlich.

Der Kompaktmodus ist anders wegen `mergeCompactToolGroups`. Wenn aufeinanderfolgende tool*groups zusammengeführt werden, ruft `MainContent` bereits `refreshStatic()` auf – das ist ein bestehender Codepfad, und er rendert die zusammengeführte Gruppe mit dem aus dem Verlauf gesuchten Label neu. Der Kompaktmodus \_erhält* also das Label als Header-Ersatz. Um zu vermeiden, dass das Label zweimal gerendert wird (einmal als Kompakt-Header, einmal als nachgestellte `● <label>`-Zeile), blendet `HistoryItemDisplay` die eigenständige Zeile aus, wenn `compactMode` true ist.

```
Vollmodus              Kompaktmodus (mit Merge)
───────────            ─────────────────────────
[tool_group]           [gemergte tool_group — Header via Suche ersetzt]
● <label>              (● <label>-Zeile ist ausgeblendet)
```

### 3.4 Gate-Semantik

Drei Ebenen, in der Reihenfolge der Priorität aufgelöst:

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` – Env-Override, höchste Priorität.
2. `experimental.emitToolUseSummaries` in `settings.json` – Standard `true`.
3. Implizites Überspringen – wenn `config.getFastModel()` `undefined` zurückgibt, wird die Generierung unabhängig vom Gate übersprungen. Kein Fehler, keine für den Benutzer sichtbare Änderung.

### 3.5 Ausgabebereinigung

`cleanSummary` wird für jede Modellantwort ausgeführt, bevor sie zum Verlauf hinzugefügt wird:

1. Nur die erste Zeile verwenden (verwirft Präambeln der Modellbegründung).
2. Aufzählungspräfixe entfernen (`-`, `*`, `•`) – Modelle geben das Label manchmal als Listenelement zurück.
3. Umliegende Anführungszeichen/Backticks via eines begrenzten `{1,10}`-Regex entfernen (CodeQL-sicher; kein echtes Label hat mehr als eine Handvoll umschließender Anführungszeichen).
4. Präfix-Labels entfernen (`Label:`, `Summary:`, `Result:`, `Output:`) die einige Modelle voranstellen.
5. Fehlermeldungs-Formen ablehnen (`API error: ...`, `Error: ...`, `I cannot ...`, `I can't ...`, `Unable to ...`) – gibt leeren String zurück, sodass kein History-Item hinzugefügt wird.
6. Harte Längenbegrenzung auf 100 Zeichen (Mobile UI kürzt bei etwa 30; der Spielraum deckt CJK-Phrasen ab).

### 3.6 Telemetrie

Der Zusammenfassungsgenerierungs-Aufruf setzt `promptId: 'tool_use_summary_generation'`, sodass seine Token-Nutzung separat in `/stats` erfasst wird. So können Benutzer die genauen inkrementellen Kosten der Funktion sehen, ohne sie mit Prompt-Vorschlägen oder der Nutzung der Hauptsitzung zu vermischen.

## 4. Abweichungen von Claude Code (und warum)

| Abweichung                                                                | Warum                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einstellungsebene zusätzlich zum Env-Gate                                   | Qwen Code rendert das Label in der CLI; Benutzer benötigen einen dauerhaften Schalter, keinen pro-Shell-Env-Export.                                                                                     |
| Standardmäßig **an** statt aus                                            | Das Label ist sofort in beiden Anzeigemodi für den Benutzer sichtbar; Benutzer, die `fastModel` konfigurieren, aktivieren bereits Fast-Model-Funktionen.                                                     |
| Dedizierte `cleanSummary`-Nachbearbeitung                                 | Qwen Code unterstützt mehr heterogene Anbieter als CC; einige Modelle stellen `Label:` voran oder setzen es in Anführungszeichen. Die Normalisierung an der Grenze hält die UI konsistent.                           |
| Speichert `HistoryItemToolUseSummary` anstatt eine Stream-Nachricht zu senden | CLI-first-Implementierung; der SDK-Stream-Weg ist ein zukünftiger PR. Die `ToolUseSummaryMessage`-Factory ist für diese Arbeit bereits exportiert.                                                   |
| Prompt-Caching noch nicht implementiert                                     | Das Fast-Model ist oft dasselbe wie das Hauptmodell für Benutzer, die kein separates konfiguriert haben. Das Hinzufügen von Cache-Sharing erfordert eine Weiterleitung über `forkedAgent.ts`; als Folgeaufgabe erfasst. |
| Doppelter Rendering-Pfad (Vollmodus inline + Kompaktmodus Header)               | Qwen Code’s Standard ist `ui.compactMode: false`; ohne die Inline-Vollmodus-Darstellung wäre die Funktion für die meisten Benutzer unsichtbar.                                                      |

## 5. Bekannte Einschränkungen

- **Keine Sitzungspersistenz.** `tool_use_summary` wird nicht in das Chat-Aufzeichnungs-JSONL geschrieben. Das Fortsetzen einer Sitzung verliert Labels; Tool-Gruppen werden mit dem generischen Header als Fallback dargestellt. Niedrige Priorität: Labels werden natürlich neu generiert, wenn der Benutzer die Sitzung fortsetzt.
- **Noch keine SDK-Stream-Ausgabe.** Die Nachrichten-Factory ist exportiert, aber die CLI speist `tool_use_summary` noch nicht in die SDK-Brücke ein. Folge-PR.
- **Kein Prompt-Caching.** Jeder Batch verursacht frische Input-Token-Kosten. In absoluten Zahlen vernachlässigbar (~300 Tokens), aber messbar, wenn man Dutzende von Batches pro Turn ausführt.
- **Zusammenfassung für gemergte kompakte Gruppen übernimmt das Label des ersten beitragenden Batches.** Wenn ein Benutzer zehn unterschiedliche Batches hintereinander ausführt (enge Schleife, nicht typisch), zeigt der gemergte kompakte Header nur die Absicht des führenden Batches. Kompromiss akzeptiert: das Aufteilen von Labels pro Batch in einer gemergten Ansicht ist visuell lauter, als das erste zu nehmen.
- **Fast-Model erforderlich.** Ohne ein konfiguriertes `fastModel` wird die Generierung übersprungen. Ein Fallback auf das Hauptmodell wird bewusst nicht zugelassen, um das Kostenprofil begrenzt zu halten.

## 6. Zukünftige Arbeiten

1. `ToolUseSummaryMessage` in die SDK-Brücke einbinden, damit die vorhandene Factory downstream genutzt wird.
2. Generierung via `forkedAgent.ts` mit `enablePromptCaching` leiten, sodass wiederholte Tool-Name-Präfixe Provider-Caches treffen.
3. Optional: `tool_use_summary`-Einträge in `ChatRecordingService` persistieren und bei Sitzungsfortsetzung wiedergeben.
4. Optional: shortcuts für Tool-Name-Labels (z.B. immer `Read <filename>` für einen einzelnen `read_file`-Aufruf) als schnellen Pfad vor dem LLM.
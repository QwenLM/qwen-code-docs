# Einheitliche Darstellung von Tool-Ergebnissen

## Hintergrund

Die TUI hatte zuvor zwei Rendering-Modi für Tool-Ergebnisse:

- **Compact mode** (Strg+O): klappte abgeschlossene Tool-Ergebnisse in eine einzeilige Zusammenfassung ein
- **Normal mode**: zeigte vollständige Tool-Ergebnisse inline an, was zu übermäßigem vertikalem Rauschen führte

Benutzer mussten manuell zwischen den Modi umschalten. Meistens brachten abgeschlossene Tool-Ergebnisse (Dateiinhalte, Suchergebnisse usw.) keinen Mehrwert für den Gesprächsablauf.

## Design

### Kernprinzip

**Ein einziger, vereinheitlichter Modus**: Die Tool-Darstellung wird durch die Tool-Kategorie bestimmt, nicht durch einen benutzergesteuerten Modus. Informationssammlungs-Tools (read/search/list) werden zu einer Zusammenfassung eingeklappt; Mutations-Tools (edit/write/command/agent) werden immer einzeln mit vollständigen Ergebnissen dargestellt.

### Semantische Zusammenfassung (`buildToolSummary`)

Anstatt rohe Tool-Namen und Anzahlen (`ReadFile x 3`) anzuzeigen, werden menschenlesbare Zusammenfassungen in einem zählbasierten Format generiert:

| Szenario                 | Ausgabe                                             |
| ------------------------ | --------------------------------------------------- |
| Einzelnes Tool           | `Read 1 file` / `Ran 1 command`                     |
| Mehrere gleiche Art      | `Read 3 files`                                      |
| Gemischte Arten          | `Ran 1 command, read 3 files, edited 2 files`       |
| Aktiv (wird ausgeführt)  | `Reading 1 file` (Gegenwartsform)                   |
| Abgeschlossen            | `Read 1 file` (Vergangenheitsform)                  |

### Tool-Kategorien

| Kategorie | Anzeigenamen                    | Vergangenheitsform | Gegenwartsform | Einklappbar |
| --------- | ------------------------------- | ------------------ | -------------- | ----------- |
| read      | ReadFile, Read File(s)          | Read               | Reading        | Ja          |
| edit      | Edit, NotebookEdit              | Edited             | Editing        | Nein        |
| write     | WriteFile                       | Wrote              | Writing        | Nein        |
| search    | Grep, Glob                      | Searched           | Searching      | Ja          |
| list      | ListFiles, Read Directory       | Listed             | Listing        | Ja          |
| command   | Shell                           | Ran                | Running        | Nein        |
| agent     | Agent, Workflow, SendMessage    | Ran                | Running        | Nein        |
| other     | (alles andere)                  | Used               | Using          | Nein        |

### Rendering-Regeln

1. **Typbasierte Aufteilung**: Tools werden mit `isCollapsibleTool()` aufgeteilt – einklappbare Tools (read/search/list) werden als eine Zusammenfassungszeile (`CompactToolGroupDisplay`) dargestellt; nicht einklappbare Tools (edit/write/command/agent/other) werden einzeln über `ToolMessage` dargestellt
2. **Nur-Speicher-Gruppen** haben einen eigenen Darstellungspfad (Lese-/Schreibanzahl-Abzeichen), der priorisiert wird, aber nur wenn alle Operationen erfolgreich waren (`!hasErrorTool && every status === Success`)
3. **Ergebnis-Einklappung**: Nur einklappbare Tools mit dem Status `Success` haben ihren Text/ANSI-Output eingeklappt. Nicht einklappbare Tools (einschließlich MCP-Tools, WebFetch usw.) zeigen immer Ergebnisse. Abgebrochene Tools behalten ihre teilweise sichtbare Ausgabe
4. **Tool-Namen** werden unabhängig vom Status fett dargestellt, was ein konsistentes Styling sowohl bei `CompactToolGroupDisplay` als auch bei einzelnen `ToolMessage`-Pfaden sicherstellt
5. **Erzwungene Aufklappbedingungen**: Wenn ein Tool in einer Gruppe bestätigt, fehlerhaft, benutzerinitiiert, in einer fokussierten Shell oder ein Terminal-Subagent ist, werden ALLE Tools einzeln dargestellt (keine Aufteilung) – die Ergebnisse sind nur für die auslösenden Tools (fehlerhaft, bestätigend, Terminal-Subagent) sichtbar – erfolgreiche Geschwister behalten normales Einklappverhalten
6. **`tool_use_summary`**-Einträge (LLM-generierte semantische Zusammenfassungen) werden bedingungslos zusammen mit der mechanischen Zählung von `CompactToolGroupDisplay` dargestellt – sie dienen unterschiedlichen Zwecken (semantischer Kontext vs. Tool-Zählung)
7. **Speicher-Abzeichen**: wird sowohl im rein einklappbaren Pfad als auch im gemischten Pfad dargestellt, wenn Speicheroperationen in einer nicht reinen Speichergruppe vorhanden sind

### Wichtige Änderungen

| Datei                            | Änderung                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CompactToolGroupDisplay.tsx`    | `buildToolSummary()` mit Zählformat hinzugefügt, `isCollapsibleTool()`, Rahmenstile entfernt                                                                                  |
| `ToolMessage.tsx`                | `shouldCollapseResult` beschränkt auf `isCollapsibleTool()` und `Success`; `isDim` entfernt                                                                                   |
| `ToolGroupMessage.tsx`           | Typbasierte Aufteilung ersetzt `showCompact`; `forceShowResult` vereinfacht zu `forceExpandAll`; Höhenbudget berücksichtigt einklappbare Zusammenfassungszeile                |
| `MainContent.tsx`                | `mergedHistory`-Alias, `absorbedCallIds`, `summaryByCallId`, gruppenübergreifende Zusammenführung entfernt                                                                   |
| `HistoryItemDisplay.tsx`         | `tool_use_summary` wird bedingungslos dargestellt (`summaryAbsorbed`-Sperre entfernt)                                                                                         |
| `mergeCompactToolGroups.ts`      | `compactToggleHasVisualEffect` löst nicht mehr bei `tool_group` aus (der kompakte Modus hat keine Auswirkung auf die Tool-Darstellung)                                        |

## Alternativen, die in Betracht gezogen wurden

1. **Beide Modi mit verbesserten Zusammenfassungen beibehalten**: Abgelehnt – unnötige kognitive Belastung für Benutzer
2. **Zusammenfassung pro Tool (Gemini CLI-Stil)**: Jedes Tool erhält einen eigenen Zusammenfassungspfeil. Abgelehnt – immer noch zu ausführlich für große Tool-Batches
3. **Gestaffelte Einführung**: Abgelehnt – Benutzer bevorzugen einen einzigen Implementierungsdurchlauf
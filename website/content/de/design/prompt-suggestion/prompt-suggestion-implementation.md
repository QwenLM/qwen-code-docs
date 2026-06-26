# Status der Implementierung von Prompt Vorschlägen

> Verfolgt den Implementierungsstatus der Prompt-Vorschlags-Funktion (NES) in allen Paketen.

## Kernmodul (`packages/core/src/followup/`)

| Komponente                  | Status        | Zeilen | Beschreibung                                                       |
| --------------------------- | ------------- | ------ | ------------------------------------------------------------------ |
| `followupState.ts`          | ✅ Erledigt   | ~230   | Framework-unabhängiger Controller mit Timer/Debounce               |
| `suggestionGenerator.ts`    | ✅ Erledigt   | ~260   | LLM-Generierung + 12 Filterregeln + Forked-Query-Unterstützung     |
| `forkedQuery.ts`            | ✅ Erledigt   | ~240   | CacheSafeParams + createForkedChat + runForkedQuery                |
| `overlayFs.ts`              | ✅ Erledigt   | ~140   | Copy-on-Write-Overlay-Dateisystem                                  |
| `speculationToolGate.ts`    | ✅ Erledigt   | ~150   | Tool-Grenzenerzwingung mit AST-Shell-Parser                        |
| `speculation.ts`            | ✅ Erledigt   | ~540   | Spekulations-Engine mit pipeline-basiertem Vorschlag + Modell-Override |

## CLI-Integration (`packages/cli/`)

| Komponente                      | Status        | Beschreibung                                                      |
| ------------------------------- | ------------- | ----------------------------------------------------------------- |
| `AppContainer.tsx`              | ✅ Erledigt   | Vorschlagsgenerierung, Spekulations-Lebenszyklus, UI-Rendering    |
| `InputPrompt.tsx`               | ✅ Erledigt   | Tab/Eingabe/Rechtspfeil-Akzeptanz, Verwerfen + Abbrechen           |
| `Composer.tsx`                  | ✅ Erledigt   | Durchreichung von Props                                           |
| `UIStateContext.tsx`            | ✅ Erledigt   | promptSuggestion + dismissPromptSuggestion                        |
| `useFollowupSuggestions.tsx`    | ✅ Erledigt   | React-Hook mit Telemetrie + Tastaturverfolgung                    |
| `settingsSchema.ts`             | ✅ Erledigt   | 3 Feature-Flags + fastModel-Einstellung                           |
| `settings.schema.json`          | ✅ Erledigt   | VSCode-Einstellungsschema                                         |

## WebUI-Integration (`packages/webui/`)

| Komponente                     | Status        | Beschreibung                                      |
| ------------------------------ | ------------- | ------------------------------------------------- |
| `InputForm.tsx`                | ✅ Erledigt   | Tab/Eingabe/Rechtspfeil + explicitText-Übermittlung |
| `useFollowupSuggestions.ts`    | ✅ Erledigt   | React-Hook mit onOutcome-Unterstützung            |
| `followup.ts`                  | ✅ Erledigt   | Subpfad-Einstieg                                  |
| `components.css`               | ✅ Erledigt   | Geistertext-Styling                               |
| `vite.config.followup.ts`      | ✅ Erledigt   | Separate Build-Konfiguration                      |

## Telemetrie (`packages/core/src/telemetry/`)

| Komponente                 | Status        | Beschreibung              |
| -------------------------- | ------------- | ------------------------- |
| `PromptSuggestionEvent`    | ✅ Erledigt   | 10 Felder                 |
| `SpeculationEvent`         | ✅ Erledigt   | 7 Felder                  |
| `logPromptSuggestion()`    | ✅ Erledigt   | OpenTelemetry-Logger      |
| `logSpeculation()`         | ✅ Erledigt   | OpenTelemetry-Logger      |

## Testabdeckung

| Testdatei                       | Tests | Beschreibung                                                      |
| ------------------------------- | ----- | ----------------------------------------------------------------- |
| `followupState.test.ts`         | 14    | Controller-Timer, Debounce, Accept-Callback, onOutcome, Clear     |
| `suggestionGenerator.test.ts`   | 16    | Alle 12 Filterregeln + Randfälle + falsch Positive                |
| `overlayFs.test.ts`             | 15    | COW-Schreiben, Leseauflösung, Anwenden, Bereinigung, Pfad-Traversal |
| `speculationToolGate.test.ts`   | 27    | Tool-Kategorien, Genehmigungsmodus, Shell-AST, Pfadumschreibung   |
| `forkedQuery.test.ts`           | 6     | Cache-Parameter speichern/holen/löschen, Deep Clone, Versionserkennung |
| `speculation.test.ts`           | 7     | ensureToolResultPairing-Randfälle                                 |
| `smoke.test.ts`                 | 21    | Modulübergreifender E2E-Test: Filter + Overlay + ToolGate + Cache + Pairing |
| `InputPrompt.test.tsx`          | 4     | Tab, Eingabe+Senden, Rechtspfeil, Completion-Guard                 |

## Audit-Verlauf

| Runde             | Gefundene Probleme | Behobene Probleme                                           |
| ----------------- | ------------------ | ----------------------------------------------------------- |
| R1-R4             | 10                 | 10 (Regel-Engine → LLM, Zustandsvereinfachung)              |
| R5-R6             | 2                  | 2 (Eingabe-Tastenkombinationskonflikt, Rechtspfeil-Telemetrie) |
| R7-R8             | 3                  | 3 (WebUI-Telemetrie, toter Typ, Testabdeckung)               |
| R9                | 0                  | — (Konvergenz)                                              |
| R10-R11           | 1                  | 1 (historyManager-Abhängigkeit)                             |
| R12-R13           | 1                  | 1 (evaluative Regex-Wortgrenzen)                            |
| Phase 1+2 R1-R4   | 20+                | 20+ (Berechtigungsumgehung, Overlay-Sicherheit, Race Conditions) |
| **Gesamt**        | **37+**            | **37+**                                                     |

## Claude Code-Ausrichtung

| Funktion                              | Ausrichtung | Anmerkungen                                    |
| ------------------------------------- | ----------- | ---------------------------------------------- |
| Prompt-Text                           | 100%        | Identisch (nur Markenname)                     |
| 12 Filterregeln                       | 100%+       | \b-Wortgrenzen-Verbesserung                    |
| UI-Interaktion (Tab/Eingabe/Rechts)   | 100%        |                                                |
| Guard-Bedingungen                     | 100%        | 13 Prüfungen                                   |
| Telemetrie                            | 100%        | 10+7 Felder                                    |
| Cache-Sharing                         | ✅          | DashScope cache_control                        |
| Spekulation                           | ✅          | COW-Overlay + Tool-Gating                      |
| Pipeline-basierter Vorschlag          | ✅          | Wird nach Abschluss der Spekulation generiert  |
| Zustandsverwaltung                    | 100%+       | Controller-Pattern, Object.freeze              |
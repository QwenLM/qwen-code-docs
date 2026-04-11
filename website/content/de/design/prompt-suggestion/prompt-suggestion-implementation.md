# Implementierungsstatus der Prompt-Vorschläge

> Verfolgt den Implementierungsstatus der Prompt-Vorschlagsfunktion (NES) in allen Paketen.

## Core-Modul (`packages/core/src/followup/`)

| Komponente               | Status  | Zeilen | Beschreibung                                                   |
| ------------------------ | ------- | ------ | -------------------------------------------------------------- |
| `followupState.ts`       | ✅ Done | ~230   | Framework-agnostischer Controller mit Timer/Debounce           |
| `suggestionGenerator.ts` | ✅ Done | ~260   | LLM-Generierung + 12 Filterregeln + Forked-Query-Unterstützung |
| `forkedQuery.ts`         | ✅ Done | ~240   | CacheSafeParams + createForkedChat + runForkedQuery            |
| `overlayFs.ts`           | ✅ Done | ~140   | Copy-on-Write-Overlay-Dateisystem                              |
| `speculationToolGate.ts` | ✅ Done | ~150   | Durchsetzung von Tool-Grenzen mit AST-Shell-Parser             |
| `speculation.ts`         | ✅ Done | ~540   | Speculation-Engine mit gepipelinten Vorschlägen + Model-Override |

## CLI-Integration (`packages/cli/`)

| Komponente                   | Status  | Beschreibung                                                |
| ---------------------------- | ------- | ----------------------------------------------------------- |
| `AppContainer.tsx`           | ✅ Done | Vorschlagsgenerierung, Speculation-Lifecycle, UI-Rendering  |
| `InputPrompt.tsx`            | ✅ Done | Akzeptanz via Tab/Enter/Rechter Pfeil, Verwerfen + Abbrechen |
| `Composer.tsx`               | ✅ Done | Props-Threading                                             |
| `UIStateContext.tsx`         | ✅ Done | promptSuggestion + dismissPromptSuggestion                  |
| `useFollowupSuggestions.tsx` | ✅ Done | React-Hook mit Telemetrie + Tastenanschlag-Tracking         |
| `settingsSchema.ts`          | ✅ Done | 3 Feature-Flags + fastModel-Einstellung                     |
| `settings.schema.json`       | ✅ Done | VSCode-Einstellungsschema                                   |

## WebUI-Integration (`packages/webui/`)

| Komponente                  | Status  | Beschreibung                                |
| --------------------------- | ------- | ------------------------------------------- |
| `InputForm.tsx`             | ✅ Done | Tab/Enter/Rechter Pfeil + explicitText-Submit |
| `useFollowupSuggestions.ts` | ✅ Done | React-Hook mit onOutcome-Unterstützung      |
| `followup.ts`               | ✅ Done | Subpath-Eintrag                             |
| `components.css`            | ✅ Done | Ghost-Text-Styling                          |
| `vite.config.followup.ts`   | ✅ Done | Separate Build-Konfiguration                |

## Telemetrie (`packages/core/src/telemetry/`)

| Komponente              | Status  | Beschreibung         |
| ----------------------- | ------- | -------------------- |
| `PromptSuggestionEvent` | ✅ Done | 10 Felder            |
| `SpeculationEvent`      | ✅ Done | 7 Felder             |
| `logPromptSuggestion()` | ✅ Done | OpenTelemetry-Logger |
| `logSpeculation()`      | ✅ Done | OpenTelemetry-Logger |

## Testabdeckung

| Testdatei                     | Tests | Beschreibung                                                     |
| ----------------------------- | ----- | ---------------------------------------------------------------- |
| `followupState.test.ts`       | 14    | Controller-Timer, Debounce, Accept-Callback, onOutcome, Clear    |
| `suggestionGenerator.test.ts` | 16    | Alle 12 Filterregeln + Edge Cases + False Positives              |
| `overlayFs.test.ts`           | 15    | COW-Schreibvorgang, Read-Resolution, Apply, Cleanup, Path Traversal |
| `speculationToolGate.test.ts` | 27    | Tool-Kategorien, Approval-Modus, Shell-AST, Path Rewrite         |
| `forkedQuery.test.ts`         | 6     | Cache-Params save/get/clear, Deep Clone, Versionserkennung       |
| `speculation.test.ts`         | 7     | ensureToolResultPairing Edge Cases                               |
| `smoke.test.ts`               | 21    | Cross-Module-E2E: Filter + Overlay + toolGate + Cache + Pairing  |
| `InputPrompt.test.tsx`        | 4     | Tab, Enter+Submit, Rechter Pfeil, Completion-Guard               |

## Audit-Verlauf

| Runde           | Gefundene Issues | Behobene Issues                                            |
| --------------- | ---------------- | ---------------------------------------------------------- |
| R1-R4           | 10               | 10 (Rule Engine → LLM, State-Vereinfachung)                |
| R5-R6           | 2                | 2 (Enter-Keybinding-Konflikt, Right-Arrow-Telemetrie)      |
| R7-R8           | 3                | 3 (WebUI-Telemetrie, Dead Type, Testabdeckung)             |
| R9              | 0                | — (Konvergenz)                                             |
| R10-R11         | 1                | 1 (historyManager-Abhängigkeit)                            |
| R12-R13         | 1                | 1 (evaluative Regex-Wortgrenzen)                           |
| Phase 1+2 R1-R4 | 20+              | 20+ (Permission-Bypass, Overlay-Sicherheit, Race Conditions) |
| **Gesamt**      | **37+**          | **37+**                                                    |

## Abgleich mit Claude Code

| Feature                          | Übereinstimmung | Hinweise                                |
| -------------------------------- | --------------- | --------------------------------------- |
| Prompt-Text                      | 100%            | Identisch (nur Markenname)              |
| 12 Filterregeln                  | 100%+           | \b-Wortgrenzen-Verbesserung             |
| UI-Interaktion (Tab/Enter/Right) | 100%            |                                         |
| Guard-Bedingungen                | 100%            | 13 Prüfungen                            |
| Telemetrie                       | 100%            | 10+7 Felder                             |
| Cache-Sharing                    | ✅              | DashScope cache_control                 |
| Speculation                      | ✅              | COW-Overlay + Tool-Gating               |
| Pipelined Suggestion             | ✅              | Wird nach Abschluss der Speculation generiert |
| State-Management                 | 100%+           | Controller-Pattern, Object.freeze       |
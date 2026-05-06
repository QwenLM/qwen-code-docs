# Compact-Mode-Design: Wettbewerbsanalyse und Optimierung

> Ctrl+O-Umschaltung zwischen Compact- und Verbose-Modus – Wettbewerbsanalyse mit Claude Code, Überprüfung der aktuellen Implementierung und Optimierungsempfehlungen.
>
> Benutzerdokumentation: [Settings — ui.compactMode](../../users/configuration/settings.md).

## 1. Zusammenfassung

Sowohl Qwen Code als auch Claude Code bieten einen Ctrl+O-Shortcut zum Umschalten zwischen kompakten und detaillierten Tool-Ausgaben, aber die **Designphilosophie, der Standardzustand und das Interaktionsmodell unterscheiden sich grundlegend**. Dieses Dokument bietet einen tiefgehenden Vergleich auf Quellcode-Ebene, identifiziert UX-Lücken und schlägt Optimierungen für Qwen Code vor.

| Dimension            | Claude Code                                 | Qwen Code                                     |
| -------------------- | ------------------------------------------- | --------------------------------------------- |
| Standardmodus        | Compact (verbose=false)                     | Verbose (compactMode=false)                   |
| Umschaltlogik        | Temporäre Detailansicht                     | Persistente Präferenzumschaltung              |
| Persistenz           | Nur Sitzung, Reset bei Neustart             | In settings.json gespeichert                  |
| Geltungsbereich      | Globaler Bildschirmwechsel (Prompt ↔ Transkript) | Komponentenweises Rendering-Toggle        |
| Eingefrorener Snapshot | Keiner (kein Konzept)                     | Keiner (entfernt)                             |
| Expand-Hinweis pro Tool | Ja ("ctrl+o to expand")                  | Ja ("Drücke Ctrl+O, um die vollständige Tool-Ausgabe anzuzeigen") |

## 2. Analyse der Claude-Code-Implementierung

### 2.1 Architektur

Claude Code verwendet einen **bildschirmbasierten** Ansatz anstelle eines komponentenbasierten Rendering-Toggles:

```
┌──────────────────────────────────┐
│         AppState (Zustand)       │
│  verbose: boolean (Standard: false)│
│  screen: 'prompt' | 'transcript' │
└──────────┬───────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  wechselt Bildschirmmodus
     │  Handler    │  KEIN Rendering-Flag
     └─────┬──────┘
           │
     ┌─────▼──────────────┐
     │    REPL.tsx         │
     │  screen='prompt'  → Compact-Ansicht (Standard)
     │  screen='transcript'→ Detailansicht
     └────────────────────┘
```

### 2.2 Wichtige Quelldateien

| Komponente        | Datei                                               | Kernlogik                                               |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------- |
| Umschalt-Handler   | `src/hooks/useGlobalKeybindings.tsx:90-132`        | Wechselt `screen` zwischen `'prompt'` und `'transcript'` |
| Tastenkombination       | `src/keybindings/defaultBindings.ts:44`            | `app:toggleTranscript`                                  |
| Zustandsdefinition | `src/state/AppStateStore.ts:472`                   | `verbose: false` (nur Sitzung)                         |
| Expand-Hinweis      | `src/components/CtrlOToExpand.tsx:29-46`           | Tool-spezifischer Text "(ctrl+o to expand)"                      |
| Nachrichtenfilter   | `src/components/Messages.tsx:93-151`               | `filterForBriefTool()` für Compact-Ansicht                 |
| Berechtigung       | `src/components/permissions/PermissionRequest.tsx` | Wird im Overlay-Layer gerendert, nie ausgeblendet                 |

### 2.3 Designentscheidungen

1. **Compact ist der Standard.** Benutzer sehen sofort eine aufgeräumte Oberfläche; Details sind opt-in.
2. **Sitzungsbasiert.** `verbose` wird bei jeder neuen Sitzung auf `false` zurückgesetzt – Claude Code geht davon aus, dass Benutzer generell die Compact-Ansicht bevorzugen und Details nur temporär benötigen.
3. **Bildschirmweites Toggle.** Ctrl+O ändert nicht, wie Komponenten gerendert werden; es schaltet die gesamte Anzeige zwischen einem "Prompt"-Bildschirm (compact) und einem "Transcript"-Bildschirm (detailed) um.
4. **Kein eingefrorener Snapshot.** Es gibt kein Konzept zum Einfrieren von Snapshots. Beim Umschalten aktualisiert sich die Anzeige sofort mit dem aktuellen Zustand.
5. **Berechtigungsdialoge sind separat.** Tool-Freigaben werden in einem dedizierten Overlay-Layer gerendert, der niemals vom verbose/compact-Toggle beeinflusst wird.
6. **Hinweis pro Tool.** Die Komponente `CtrlOToExpand` zeigt einen kontextuellen Hinweis bei einzelnen Tools an, wenn diese große Ausgaben erzeugen; in Sub-Agenten wird er unterdrückt.

### 2.4 Benutzerablauf

```
Sitzungsstart → Compact-Modus (Standard)
     │
     ├─ Tool-Ausgaben werden in einer Zeile zusammengefasst
     ├─ Große Tool-Ausgaben zeigen den Hinweis "(ctrl+o to expand)"
     │
     ├─ Benutzer drückt Ctrl+O
     │     └─→ Bildschirm wechselt zu Transcript (Detailansicht)
     │         └─ Benutzer sieht alle Tool-Ausgaben, Thinking usw.
     │
     ├─ Benutzer drückt erneut Ctrl+O
     │     └─→ Bildschirm wechselt zurück zu Prompt (Compact)
     │
     └─ Sitzungsende → verbose wird auf false zurückgesetzt
```

## 3. Analyse der Qwen-Code-Implementierung

### 3.1 Architektur

Qwen Code verwendet ein **komponentenbasiertes Rendering-Flag**, das jede UI-Komponente aus dem Context ausliest:

```
┌─────────────────────────────────────┐
│      CompactModeContext             │
│  compactMode: boolean (Standard: false)│
│  setCompactMode: (v) => void        │
└──────────┬──────────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  toggles compactMode
     │  Handler    │  persistiert in Einstellungen
     └─────┬──────┘
           │
     ┌─────▼──────────────────┐
     │  Jede Komponente liest │
     │  compactMode und       │
     │  entscheidet, wie sie  │
     │  rendert               │
     └────────────────────────┘
           │
     ┌─────▼──────────────────────────────┐
     │  ToolGroupMessage                   │
     │    showCompact = compactMode        │
     │      && !hasConfirmingTool          │
     │      && !hasErrorTool               │
     │      && !isEmbeddedShellFocused     │
     │      && !isUserInitiated            │
     └────────────────────────────────────┘
```

### 3.2 Wichtige Quelldateien

| Komponente       | Datei                                  | Kernlogik                                       |
| --------------- | ------------------------------------- | ----------------------------------------------- |
| Umschalt-Handler  | `AppContainer.tsx:1684-1690`          | Toggelt `compactMode`, persistiert in Einstellungen     |
| Context         | `CompactModeContext.tsx`              | `compactMode`, `setCompactMode`                 |
| Tool-Gruppe      | `ToolGroupMessage.tsx:105-110`        | `showCompact` mit 4 Force-Expand-Bedingungen    |
| Tool-Nachricht    | `ToolMessage.tsx:346-350`             | Blendet `displayRenderer` im Compact-Modus aus         |
| Compact-Anzeige | `CompactToolGroupDisplay.tsx:49-108`  | Einzeilige Zusammenfassung mit Status + Hinweis          |
| Bestätigung    | `ToolConfirmationMessage.tsx:113-147` | Vereinfachte 3-Optionen-Compact-Bestätigung            |
| Tipps            | `Tips.tsx:14-29`                      | Startup-Tipp-Rotation enthält Compact-Mode-Hinweis |
| Einstellungen-Sync   | `SettingsDialog.tsx:189-193`          | Synchronisiert mit CompactModeContext + refreshStatic   |
| MainContent     | `MainContent.tsx:60-76`               | Rendert live `pendingHistoryItems`                |
| Thinking        | `HistoryItemDisplay.tsx:123-133`      | Blendet `gemini_thought` im Compact-Modus aus          |

### 3.3 Designentscheidungen

1. **Verbose ist der Standard.** Benutzer sehen standardmäßig alle Tool-Ausgaben und Thinking.
2. **Persistente Präferenz.** `compactMode` wird in `settings.json` gespeichert und überlebt Sitzungen.
3. **Komponentenbasiertes Rendering.** Jede Komponente liest `compactMode` aus dem Context und passt ihr eigenes Rendering an.
4. **Force-Expand-Schutz.** Vier Bedingungen überschreiben den Compact-Modus, um sicherzustellen, dass kritische UI-Elemente immer sichtbar sind (Bestätigungen, Fehler, Shell, benutzerinitiiert).
5. **Kein Snapshot-Einfrieren.** Das Toggle zeigt immer Live-Ausgaben – keine eingefrorenen Snapshots.
6. **Sync mit Einstellungsdialog.** Das Umschalten des Compact-Modus in den Einstellungen aktualisiert den React-State sofort über `setCompactMode`.
7. **Unauffällige Entdeckbarkeit.** Der Compact-Modus wird über die Startup-Tipp-Rotation eingeführt, anstatt über einen persistenten Footer-Indikator, um UI-Überladung zu vermeiden.

### 3.4 Benutzerablauf

```
Sitzungsstart → Verbose-Modus (Standard)
     │
     ├─ Alle Tool-Ausgaben, Thinking, Details sichtbar
     │
     ├─ Benutzer drückt Ctrl+O (oder toggelt in Einstellungen)
     │     └─→ compactMode = true, persistiert
     │         ├─ Tool-Gruppen zeigen einzeilige Zusammenfassung
     │         ├─ Thinking/Thought-Inhalte ausgeblendet
     │         └─ Bestätigungen, Fehler, Shell bleiben aufgeklappt
     │
     ├─ Benutzer drückt erneut Ctrl+O
     │     └─→ compactMode = false, persistiert
     │         └─ Alle Details wieder sichtbar
     │
     └─ Nächste Sitzung → gleicher Modus wie letzte Sitzung
```

## 4. Detaillierte Analyse der Hauptunterschiede

### 4.1 Philosophie des Standardmodus

| Aspekt               | Claude Code (Compact-Standard)         | Qwen Code (Verbose-Standard)                   |
| -------------------- | ------------------------------------- | --------------------------------------------- |
| Erster Eindruck     | Aufgeräumt, minimal – professionelles Gefühl    | Informationsreich – volle Transparenz          |
| Lernkurve       | Benutzer muss Ctrl+O lernen, um Details zu sehen | Benutzer sieht sofort alles           |
| Zielgruppe      | Erfahrene Benutzer, die dem Tool vertrauen  | Benutzer, die verstehen wollen, was passiert |
| Informationsüberflutung | Standardmäßig vermieden                    | Für neue Benutzer möglich                        |
| Entdeckbarkeit      | Tool-spezifische "(ctrl+o to expand)"-Hinweise   | Startup-Tipp-Rotation + ?-Shortcuts + /help   |

**Analyse:** Der Compact-Standard von Claude Code funktioniert, weil seine Nutzerbasis im Allgemeinen aus erfahrenen Entwicklern besteht, die dem Tool vertrauen und nicht jede Tool-Invocation sehen müssen. Der Verbose-Standard von Qwen Code ist für seine frühere Phase angemessen, in der der Aufbau von Benutzervertrauen durch Transparenz wichtig ist.

### 4.2 Persistenzmodell

| Aspekt           | Claude Code               | Qwen Code                  |
| ---------------- | ------------------------- | -------------------------- |
| Persistiert?       | Nein – nur Sitzung         | Ja – in settings.json     |
| Begründung        | Verbose ist temporäre Einsicht | Modus ist Benutzerpräferenz    |
| Verhalten bei Neustart | Startet immer im Compact-Modus     | Startet mit zuletzt verwendetem Modus |

**Analyse:** Claude Code betrachtet die Detailansicht als kurzfristiges Bedürfnis – man schaut nach und kehrt zurück. Qwen Code behandelt es als stabile Präferenz – einige Benutzer wollen immer Details, andere immer Compact. Beide Ansätze sind valide; der Ansatz von Qwen Code ist flexibler.

### 4.3 Bestätigungsschutz

| Aspekt                  | Claude Code                                 | Qwen Code                                            |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Mechanismus               | Overlay/Modal-Layer (strukturell getrennt) | Force-Expand-Bedingungen in `showCompact`             |
| Abdeckung                | Vollständig – Freigaben können nie ausgeblendet werden    | Vollständig – 4 Bedingungen decken alle interaktiven Zustände ab |
| Compact-Bestätigungs-UI | N/A (Overlay ist immer vollständig)                | Vereinfachte 3-Optionen-RadioButtonSelect                |

**Analyse:** Die architektonische Trennung von Claude Code (Overlay-Layer) ist robuster. Der Force-Expand-Ansatz von Qwen Code ist effektiv, erfordert aber, dass jeder neue interaktive Zustand explizit zur Bedingungsliste hinzugefügt wird.

### 4.4 Rendering-Ansatz

| Aspekt       | Claude Code                         | Qwen Code                                  |
| ------------ | ----------------------------------- | ------------------------------------------ |
| Toggle-Geltungsbereich | Bildschirmebene (Prompt ↔ Transkript) | Komponentenebene (jede Komponente entscheidet)   |
| Granularität  | Alles oder nichts                      | Feingranular pro Komponente                 |
| Flexibilität  | Niedrig – globaler Switch                 | Hoch – Komponenten können überschreiben             |
| Konsistenz  | Garantiert                          | Hängt von der Implementierung jeder Komponente ab |

**Analyse:** Der komponentenbasierte Ansatz von Qwen Code ist flexibler (z. B. Force-Expand für spezifische Bedingungen), erfordert aber mehr Disziplin, um Konsistenz zu wahren. Der bildschirmbasierte Ansatz von Claude Code ist einfacher und garantiert konsistentes Verhalten.

## 5. Optimierungsempfehlungen

### 5.1 [P0] Verbose als Standard beibehalten – Keine Änderung erforderlich

Der Verbose-Standard von Qwen Code ist die richtige Wahl für die aktuelle Phase. Neue Benutzer benötigen Transparenz, um Vertrauen aufzubauen. Mit zunehmender Produktreife kann erwogen werden, Compact zum Standard zu machen (wie bei Claude Code).

### 5.2 [P1] Tool-spezifisches Aufklappen bei großen Ausgaben

Claude Code zeigt "(ctrl+o to expand)" bei einzelnen Tools an, die große Ausgaben erzeugen. Qwen Code hat aktuell nur ein globales Toggle. In Betracht ziehen:

- Wenn ein einzelnes Tool Ausgaben erzeugt, die N Zeilen überschreiten, einen tool-spezifischen "Expand"-Hinweis im Compact-Modus anzeigen.
- Umfang: Zukünftige Erweiterung, keine aktuelle Priorität.

### 5.3 [P2] Sitzungsbasierte Überschreibung in Betracht ziehen

Einige Benutzer möchten Compact als Standard, benötigen aber gelegentlich Verbose für eine bestimmte Sitzung. In Betracht ziehen, beides zu unterstützen:

- `settings.json` → persistenter Standard (aktuelles Verhalten)
- Ctrl+O während der Sitzung → temporäre Überschreibung nur für die aktuelle Sitzung (Verhalten von Claude Code)
- Bei Sitzungsneustart → Rückkehr zum Wert aus `settings.json`

Dies bietet Benutzern das Beste aus beiden Welten. Die Implementierung würde erfordern, den "Einstellungs-Standard" vom "Sitzungs-Überschreibungs"-State zu trennen.

### 5.4 [P2] Strukturelle Trennung für Bestätigungen

Aktuell basiert der Bestätigungsschutz auf `showCompact`-Bedingungen in `ToolGroupMessage`. Ein robusterer Ansatz wäre:

- Bestätigungen in einem separaten Layer rendern (ähnlich dem Overlay-Ansatz von Claude Code).
- Dies würde es architektonisch unmöglich machen, dass der Compact-Modus Bestätigungen beeinflusst.
- Niedrigere Priorität, da der aktuelle Force-Expand-Ansatz korrekt funktioniert.

## 6. Aktueller Implementierungsstatus

Nach den Änderungen im Branch `feat/compact-mode-optimization`:

| Feature                          | Status | Hinweise                                             |
| -------------------------------- | ------ | ------------------------------------------------- |
| Startup-Tipp-Hinweis                | Erledigt   | Compact-Mode-Tipp in Tipp-Rotation (unauffällig) |
| Ctrl+O in Tastenkombinationen (?) | Erledigt   | Zu KeyboardShortcuts-Komponente hinzugefügt              |
| Ctrl+O in /help                  | Erledigt   | Zu Help-Komponente hinzugefügt                           |
| Sync mit Einstellungsdialog             | Erledigt   | Synchronisiert compactMode mit CompactModeContext         |
| Kein Snapshot-Einfrieren             | Erledigt   | Toggle zeigt immer Live-Ausgaben                   |
| Bestätigungsschutz          | Erledigt   | Force-Expand + WaitingForConfirmation-Guard       |
| Shell-Schutz                 | Erledigt   | `!isEmbeddedShellFocused` Force-Expand            |
| Fehlerschutz                 | Erledigt   | `!hasErrorTool` Force-Expand                      |
| Benutzerdokumentation aktualisiert                | Erledigt   | settings.md, keyboard-shortcuts.md                |

## 7. Dateireferenz

### Qwen Code

| Datei                                                                  | Zweck                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/cli/src/ui/AppContainer.tsx`                                | Umschalt-Handler, State-Initialisierung, Context-Provider |
| `packages/cli/src/ui/contexts/CompactModeContext.tsx`                 | Context-Definition                                     |
| `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`        | Force-Expand-Logik                                     |
| `packages/cli/src/ui/components/messages/ToolMessage.tsx`             | Tool-spezifisches Ausblenden von Ausgaben                                 |
| `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Rendering der Compact-Ansicht                                 |
| `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` | Compact-Bestätigungs-UI                                |
| `packages/cli/src/ui/components/MainContent.tsx`                      | Rendering ausstehender History-Items                        |
| `packages/cli/src/ui/components/Tips.tsx`                             | Startup-Tipp mit Compact-Mode-Hinweis                     |
| `packages/cli/src/ui/components/Help.tsx`                             | /help-Shortcut-Eintrag                                   |
| `packages/cli/src/ui/components/KeyboardShortcuts.tsx`                | ?-Shortcut-Eintrag                                       |
| `packages/cli/src/ui/components/SettingsDialog.tsx`                   | Einstellungen-Sync                                          |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Ausblenden von Thinking-Inhalten                                |
| `packages/cli/src/config/settingsSchema.ts`                           | Einstellungsdefinition                                     |
| `packages/cli/src/config/keyBindings.ts`                              | Ctrl+O-Bindung                                         |

### Claude Code (Referenz)

| Datei                                               | Zweck                           |
| -------------------------------------------------- | --------------------------------- |
| `src/hooks/useGlobalKeybindings.tsx`               | Umschalt-Handler                    |
| `src/state/AppStateStore.ts`                       | State-Definition (verbose: false) |
| `src/components/CtrlOToExpand.tsx`                 | Tool-spezifischer Expand-Hinweis              |
| `src/components/Messages.tsx`                      | Filter für kurze Nachrichten              |
| `src/screens/REPL.tsx`                             | Moduswechsel auf Bildschirmebene       |
| `src/components/permissions/PermissionRequest.tsx` | Overlay-basierte Bestätigung        |
# Compact Mode Design: Wettbewerbsanalyse & Optimierung

> Ctrl+O Compact/Verbose-Modus-Umschaltung – Wettbewerbsanalyse mit Claude Code, Überprüfung der aktuellen Implementierung und Optimierungsempfehlungen.
>
> Benutzerdokumentation: [Einstellungen — ui.compactMode](../../users/configuration/settings.md).

## 1. Zusammenfassung

Qwen Code und Claude Code bieten beide eine Ctrl+O-Tastenkombination zum Umschalten zwischen kompakten und detaillierten Tool-Ausgabeansichten, aber die **Designphilosophie, der Standardzustand und das Interaktionsmodell unterscheiden sich grundlegend**. Dieses Dokument bietet einen detaillierten Quellcode-Vergleich, identifiziert UX-Lücken und schlägt Optimierungen für Qwen Code vor.

| Dimension            | Claude Code                                 | Qwen Code                                     |
| -------------------- | ------------------------------------------- | --------------------------------------------- |
| Standardmodus        | Compact (verbose=false)                     | Verbose (compactMode=false)                   |
| Umschaltsemantik     | Temporärer Einblick in Details              | Dauerhafter Präferenzwechsel                  |
| Persistenz           | Nur für Sitzung, wird beim Neustart zurückgesetzt | In settings.json persistent gespeichert |
| Gültigkeitsbereich   | Globaler Bildschirmwechsel (Prompt ↔ Transkript) | Umbruch pro Komponente                  |
| Eingefrorener Snapshot | Kein (kein Konzept)                       | Kein (entfernt)                               |
| Erweiterungshinweis pro Tool | Ja („ctrl+o to expand“)             | Ja („Drücken Sie Ctrl+O, um die vollständige Tool-Ausgabe anzuzeigen“) |

## 2. Analyse der Claude Code-Implementierung

### 2.1 Architektur

Claude Code verwendet einen **bildschirmbasierten** Ansatz anstelle eines Render-Umschalters auf Komponentenebene:

```
┌──────────────────────────────────┐
│         AppState (Zustand)       │
│  verbose: boolean (default: false)│
│  screen: 'prompt' | 'transcript' │
└──────────┬───────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  schaltet Bildschirmmodus um
     │  Handler    │  KEIN Rendering-Flag
     └─────┬──────┘
           │
     ┌─────▼──────────────┐
     │    REPL.tsx         │
     │  screen='prompt'  → kompakte Ansicht (Standard)
     │  screen='transcript'→ detaillierte Ansicht
     └────────────────────┘
```

### 2.2 Wichtige Quelldateien

| Komponente        | Datei                                               | Kernlogik                                               |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------- |
| Toggle-Handler    | `src/hooks/useGlobalKeybindings.tsx:90-132`         | Schaltet `screen` zwischen `'prompt'` und `'transcript'` |
| Tastenkombination | `src/keybindings/defaultBindings.ts:44`             | `app:toggleTranscript`                                  |
| Zustandsdefinition| `src/state/AppStateStore.ts:472`                    | `verbose: false` (nur für Sitzung)                      |
| Erweiterungshinweis | `src/components/CtrlOToExpand.tsx:29-46`          | Text pro Tool „(ctrl+o to expand)"                      |
| Nachrichtenfilter | `src/components/Messages.tsx:93-151`                | `filterForBriefTool()` für kompakte Ansicht             |
| Berechtigung      | `src/components/permissions/PermissionRequest.tsx`  | Wird in Überlagerungsebene gerendert, nie ausgeblendet  |

### 2.3 Designentscheidungen

1. **Compact ist der Standard.** Benutzer sehen sofort eine saubere Oberfläche; Details sind optional.
2. **Auf Sitzung beschränkt.** `verbose` wird bei jeder neuen Sitzung auf `false` zurückgesetzt — Claude Code geht davon aus, dass Benutzer in der Regel die kompakte Ansicht bevorzugen und Details nur vorübergehend benötigen.
3. **Umschaltung auf Bildschirmebene.** Ctrl+O ändert nicht, wie Komponenten rendern; es schaltet die gesamte Anzeige zwischen einem „Prompt"-Bildschirm (kompakt) und einem „Transkript"-Bildschirm (detailliert) um.
4. **Kein eingefrorener Snapshot.** Es gibt kein Snapshot-Einfrierkonzept. Beim Umschalten wird die Anzeige sofort mit dem aktuellen Zustand aktualisiert.
5. **Berechtigungsdialoge sind getrennt.** Tool-Genehmigungen werden in einer eigenen Überlagerungsebene gerendert, die niemals vom Verbose/Compact-Umschalter beeinflusst wird.
6. **Hinweis pro Tool.** Die `CtrlOToExpand`-Komponente zeigt einen kontextbezogenen Hinweis bei einzelnen Tools an, wenn diese große Ausgaben produzieren, unterdrückt in Sub-Agents.

### 2.4 Benutzerablauf

```
Sitzungsstart → Compact-Modus (Standard)
     │
     ├─ Tool-Ausgaben werden in einer einzigen Zeile zusammengefasst
     ├─ Große Tool-Ausgabe zeigt Hinweis „(ctrl+o to expand)"
     │
     ├─ Benutzer drückt Ctrl+O
     │     └─→ Bildschirm wechselt zu Transkript (detaillierte Ansicht)
     │         └─ Benutzer sieht gesamte Tool-Ausgabe, Denkprozesse usw.
     │
     ├─ Benutzer drückt erneut Ctrl+O
     │     └─→ Bildschirm wechselt zurück zu Prompt (kompakt)
     │
     └─ Sitzung endet → verbose wird auf false zurückgesetzt
```

## 3. Analyse der Qwen Code-Implementierung

### 3.1 Architektur

Qwen Code verwendet ein **Rendering-Flag auf Komponentenebene**, das jede UI-Komponente aus dem Kontext liest:

```
┌─────────────────────────────────────┐
│      CompactModeContext             │
│  compactMode: boolean (default: false)│
│  setCompactMode: (v) => void        │
└──────────┬──────────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  schaltet compactMode um
     │  Handler    │  persistiert in Einstellungen
     └─────┬──────┘
           │
     ┌─────▼──────────────────┐
     │  Jede Komponente liest │
     │  compactMode und       │
     │  entscheidet, wie sie rendert │
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

| Komponente        | Datei                                  | Kernlogik                                             |
| ----------------- | -------------------------------------- | ----------------------------------------------------- |
| Toggle-Handler    | `AppContainer.tsx:1684-1690`           | Schaltet `compactMode` um, persistiert in Einstellungen |
| Kontext           | `CompactModeContext.tsx`               | `compactMode`, `setCompactMode`                       |
| Tool-Gruppe       | `ToolGroupMessage.tsx:105-110`         | `showCompact` mit 4 Force-Expand-Bedingungen          |
| Tool-Nachricht    | `ToolMessage.tsx:346-350`              | Blendet `displayRenderer` im Compact-Modus aus        |
| Kompakte Anzeige  | `CompactToolGroupDisplay.tsx:49-108`   | Einzeilige Zusammenfassung mit Status + Hinweis       |
| Bestätigung       | `ToolConfirmationMessage.tsx:113-147`  | Vereinfachte 3-Optionen-Compact-Genehmigung           |
| Tipps             | `Tips.tsx:14-29`                       | Start-Tipp-Rotation enthält Compact-Modus-Hinweis     |
| Einstellungen-Sync| `SettingsDialog.tsx:189-193`           | Synchronisiert mit CompactModeContext + refreshStatic |
| MainContent       | `MainContent.tsx:60-76`                | Rendert live-pendingHistoryItems                      |
| Denkprozesse      | `HistoryItemDisplay.tsx:123-133`       | Blendet `gemini_thought` im Compact-Modus aus         |

### 3.3 Designentscheidungen

1. **Verbose ist der Standard.** Benutzer sehen standardmäßig sämtliche Tool-Ausgaben und Denkprozesse.
2. **Dauerhafte Präferenz.** `compactMode` wird in `settings.json` gespeichert und überlebt sitzungsübergreifend.
3. **Rendering auf Komponentenebene.** Jede Komponente liest `compactMode` aus dem Kontext und passt ihr eigenes Rendering an.
4. **Force-Expand-Schutz.** Vier Bedingungen überschreiben den Compact-Modus, um sicherzustellen, dass kritische UI-Elemente immer sichtbar sind (Bestätigungen, Fehler, Shell, benutzerinitiiert).
5. **Kein eingefrorener Snapshot.** Der Umschalter zeigt immer Live-Ausgaben – keine eingefrorenen Snapshots.
6. **Synchronisation mit Einstellungsdialog.** Das Umschalten des Compact-Modus aus den Einstellungen aktualisiert den React-Status sofort über `setCompactMode`.
7. **Unaufdringliche Auffindbarkeit.** Der Compact-Modus wird über die Start-Tipp-Rotation eingeführt, anstatt durch einen persistenten Fußzeilenindikator, um UI-Überfrachtung zu vermeiden.

### 3.4 Benutzerablauf

```
Sitzungsstart → Verbose-Modus (Standard)
     │
     ├─ Alle Tool-Ausgaben, Denkprozesse, Details sichtbar
     │
     ├─ Benutzer drückt Ctrl+O (oder schaltet in Einstellungen um)
     │     └─→ compactMode = true, gespeichert
     │         ├─ Tool-Gruppen zeigen einzeilige Zusammenfassung
     │         ├─ Denkprozess-/Inhalte ausgeblendet
     │         ├─ Bestätigungen, Fehler, Shell bleiben erweitert
     │
     ├─ Benutzer drückt erneut Ctrl+O
     │     └─→ compactMode = false, gespeichert
     │         └─ Alle Details wieder sichtbar
     │
     └─ Nächste Sitzung → gleicher Modus wie letzte Sitzung
```

## 4. Wesentliche Unterschiede im Detail

### 4.1 Philosophie des Standardmodus

| Aspekt               | Claude Code (Compact-Standard)           | Qwen Code (Verbose-Standard)                      |
| -------------------- | ---------------------------------------- | ------------------------------------------------ |
| Erster Eindruck      | Sauber, minimalistisch – professionell   | Informationsreich – volle Transparenz            |
| Lernkurve            | Benutzer muss Ctrl+O lernen, um Details zu sehen | Benutzer kann sofort alles sehen          |
| Zielgruppe           | Erfahrene Benutzer, die dem Tool vertrauen | Benutzer, die verstehen wollen, was passiert   |
| Informationsüberflutung | Standardmäßig vermieden               | Für neue Benutzer möglich                       |
| Auffindbarkeit       | Hinweise pro Tool „(ctrl+o to expand)"  | Start-Tipp-Rotation + ? Tastenkombinationen + /help |

**Analyse:** Claude Codes Compact-Standard funktioniert, weil seine Benutzerbasis im Allgemeinen aus erfahrenen Entwicklern besteht, die dem Tool vertrauen und nicht jeden Tool-Aufruf sehen müssen. Qwen Codes Verbose-Standard ist für die frühere Phase angemessen, in der der Aufbau von Benutzervertrauen durch Transparenz wichtig ist.

### 4.2 Persistenzmodell

| Aspekt           | Claude Code               | Qwen Code                  |
| ---------------- | ------------------------- | -------------------------- |
| Persistiert?     | Nein – nur für Sitzung    | Ja – in settings.json      |
| Begründung       | Verbose ist temporärer Einblick | Modus ist Benutzerpräferenz |
| Verhalten beim Neustart | Startet immer kompakt | Startet mit zuletzt verwendetem Modus |

**Analyse:** Claude Code behandelt die Detailansicht als vorübergehendes Bedürfnis – man schaut kurz rein und geht dann zurück. Qwen Code behandelt sie als stabile Präferenz – manche Benutzer wollen immer Details, andere immer kompakt. Beide Ansätze sind gültig; Qwen Codes Ansatz ist flexibler.

### 4.3 Bestätigungsschutz

| Aspekt                  | Claude Code                                 | Qwen Code                                            |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Mechanismus             | Überlagerungs-/Modal-Ebene (strukturell getrennt) | Force-Expand-Bedingungen in `showCompact`      |
| Abdeckung               | Vollständig – Genehmigungen können nie ausgeblendet werden | Vollständig – 4 Bedingungen decken alle interaktiven Zustände ab |
| Compact-Bestätigungs-UI | N/A (Überlagerung ist immer vollständig)    | Vereinfachte 3-Optionen-RadioButtonSelect            |

**Analyse:** Claude Codes architektonische Trennung (Überlagerungsebene) ist robuster. Qwen Codes Force-Expand-Ansatz ist effektiv, erfordert aber, dass jeder neue interaktive Zustand explizit zur Bedingungsliste hinzugefügt wird.

### 4.4 Rendering-Ansatz

| Aspekt       | Claude Code                         | Qwen Code                                  |
| ------------ | ----------------------------------- | ------------------------------------------ |
| Umschaltbereich | Bildschirmebene (Prompt ↔ Transkript) | Komponentenebene (jede Komponente entscheidet) |
| Granularität | Alles oder nichts                   | Fein granular pro Komponente               |
| Flexibilität | Niedrig – globaler Schalter         | Hoch – Komponenten können überschreiben    |
| Konsistenz   | Garantiert                          | Hängt von der Implementierung jeder Komponente ab |

**Analyse:** Qwen Codes komponentenbasierter Ansatz ist flexibler (z. B. Force-Expand für bestimmte Bedingungen), erfordert aber mehr Disziplin, um Konsistenz zu wahren. Claude Codes bildschirmbasierter Ansatz ist einfacher und garantiert konsistentes Verhalten.

## 5. Optimierungsempfehlungen

### 5.1 [P0] Verbose als Standard beibehalten – Keine Änderung nötig

Qwen Codes Verbose-Standard ist die richtige Wahl für die aktuelle Phase. Benutzer, die mit dem Tool neu sind, brauchen Transparenz, um Vertrauen aufzubauen. Mit zunehmender Produktreife sollte in Betracht gezogen werden, Compact zum Standard zu machen (wie bei Claude Code).

### 5.2 [P1] Pro-Tool-Erweiterung für große Ausgaben

Claude Code zeigt „(ctrl+o to expand)" bei einzelnen Tools an, die große Ausgaben produzieren. Qwen Code hat derzeit nur einen globalen Umschalter. Ziehen Sie in Betracht:

- Wenn ein einzelnes Tool eine Ausgabe mit mehr als N Zeilen produziert, zeigen Sie im Compact-Modus einen „Erweitern"-Hinweis pro Tool an.
- Umfang: zukünftige Verbesserung, keine aktuelle Priorität.

### 5.3 [P2] Sitzungsbezogene Überschreibung in Betracht ziehen

Manche Benutzer möchten vielleicht Compact als Standard, benötigen aber gelegentlich Verbose für eine bestimmte Sitzung. Ziehen Sie die Unterstützung beider Varianten in Betracht:

- `settings.json` → dauerhafter Standard (aktuelles Verhalten)
- Ctrl+O während der Sitzung → temporäre Überschreibung nur für die aktuelle Sitzung (Claude Code-Verhalten)
- Beim Sitzungsneustart → auf den Wert in settings.json zurückfallen

Dies gibt Benutzern das Beste aus beiden Welten. Die Implementierung würde erfordern, den „Einstellungsstandard" vom „Sitzungs-Override"-Zustand zu trennen.

### 5.4 [P2] Strukturelle Trennung für Bestätigungen

Derzeit basiert der Bestätigungsschutz auf `showCompact`-Bedingungen in `ToolGroupMessage`. Ziehen Sie einen robusteren Ansatz in Betracht:

- Bestätigungen in einer separaten Ebene rendern (wie Claude Codes Überlagerungsansatz).
- Dies würde es architektonisch unmöglich machen, dass der Compact-Modus Bestätigungen beeinflusst.
- Niedrigere Priorität, da der aktuelle Force-Expand-Ansatz korrekt funktioniert.

## 6. Aktueller Implementierungsstatus

Nach den Änderungen des Branches `feat/compact-mode-optimization`:

| Funktion                          | Status | Hinweise                                             |
| -------------------------------- | ------ | ---------------------------------------------------- |
| Start-Tipp-Hinweis               | Erledigt | Compact-Modus-Tipp in Tipp-Rotation (unaufdringlich) |
| Ctrl+O in Tastenkombinationen (?) | Erledigt | Zur KeyboardShortcuts-Komponente hinzugefügt         |
| Ctrl+O in /help                  | Erledigt | Zur Help-Komponente hinzugefügt                      |
| Einstellungsdialog-Synchronisation | Erledigt | Synchronisiert compactMode mit CompactModeContext    |
| Kein Snapshot-Einfrieren         | Erledigt | Umschalter zeigt immer Live-Ausgabe                  |
| Bestätigungsschutz               | Erledigt | Force-Expand + WaitingForConfirmation-Sicherung      |
| Shell-Schutz                     | Erledigt | `!isEmbeddedShellFocused` Force-Expand               |
| Fehlerschutz                     | Erledigt | `!hasErrorTool` Force-Expand                         |
| Benutzerdokumentation aktualisiert | Erledigt | settings.md, keyboard-shortcuts.md                   |

## 7. Dateireferenz

### Qwen Code

| Datei                                                                  | Zweck                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/cli/src/ui/AppContainer.tsx`                                 | Toggle-Handler, Zustandsinitialisierung, Kontextanbieter |
| `packages/cli/src/ui/contexts/CompactModeContext.tsx`                  | Kontextdefinition                                      |
| `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`         | Force-Expand-Logik                                     |
| `packages/cli/src/ui/components/messages/ToolMessage.tsx`             | Ausblenden der Tool-Ausgabe pro Tool                   |
| `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Rendering der kompakten Ansicht                        |
| `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` | Compact-Bestätigungs-UI                                |
| `packages/cli/src/ui/components/MainContent.tsx`                      | Rendering ausstehender History-Elemente               |
| `packages/cli/src/ui/components/Tips.tsx`                             | Start-Tipp mit Compact-Modus-Hinweis                   |
| `packages/cli/src/ui/components/Help.tsx`                             | /help-Tastenkombinationseintrag                        |
| `packages/cli/src/ui/components/KeyboardShortcuts.tsx`                | ?-Tastenkombinationseintrag                            |
| `packages/cli/src/ui/components/SettingsDialog.tsx`                   | Einstellungs-Synchronisation                           |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Ausblenden von Denkprozess-Inhalten                    |
| `packages/cli/src/config/settingsSchema.ts`                           | Einstellungsdefinition                                 |
| `packages/cli/src/config/keyBindings.tsx`                              | Ctrl+O-Bindung                                         |

### Claude Code (Referenz)

| Datei                                               | Zweck                             |
| --------------------------------------------------- | --------------------------------- |
| `src/hooks/useGlobalKeybindings.tsx`                | Toggle-Handler                    |
| `src/state/AppStateStore.ts`                        | Zustandsdefinition (verbose: false) |
| `src/components/CtrlOToExpand.tsx`                  | Erweiterungshinweis pro Tool      |
| `src/components/Messages.tsx`                       | Kurznachrichtenfilter             |
| `src/screens/REPL.tsx`                              | Bildschirmebenen-Modusumschaltung |
| `src/components/permissions/PermissionRequest.tsx` | Überlagerungsbasierte Bestätigung |
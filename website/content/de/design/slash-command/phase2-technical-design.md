# Phase 2 Technisches Design-Dokument: Fähigkeitserweiterung

## 1. Designziele und Einschränkungen

### 1.1 Ziele

- Die `supportedModes` der 13 eingebauten Befehle um `non_interactive` und/oder `acp` erweitern
- Sicherstellen, dass jeder erweiterte Befehl im ACP/Nicht-interaktiven Pfad Textinhalte zurückgibt, die für die IDE geeignet sind
- Den Modellaufrufpfad für Prompt-Befehle öffnen (`SkillTool` konsumiert `getModelInvocableCommands()`)
- Grundlegende Erkennung von Mid-Input-Slash-Befehlen implementieren

### 1.2 Harte Einschränkungen

- **Null-Verschlechterung des interaktiven Pfads**: Das bestehende interaktive Verhalten aller erweiterten Befehle bleibt strikt unverändert, es werden nur innerhalb der Aktion neue Modus-Zweige hinzugefügt. Der interaktive Pfad-Code wird nicht berührt.
- **Implementierungsstrategie: Modus-Zweige, keine doppelte Registrierung**: Alle 13 Befehle verwenden eine `executionMode`-Prüfung innerhalb der `action`, nicht das in §10.2 des Phase-1-Design-Dokuments beschriebene doppelte Registrierungsmuster (Doppelte Registrierung ist nur dann notwendig, wenn sich interaktive und nicht-interaktive Logik drastisch unterscheiden; die Komplexität der Befehle in dieser Phase erreicht diese Schwelle nicht).
- **ACP-Nachrichtenformat**: Von ACP-Pfaden zurückgegebene Textinhalte enthalten keine ANSI-Stile, sollten als Markdown oder reiner Text vorliegen und für IDE-Plugins konsumierbar sein.
- **Umgebungsabhängige Seiteneffekte überspringen**: Operationen, die eine grafische Umgebung erfordern, wie das Öffnen eines Browsers (`open()`) oder das Bearbeiten der Zwischenablage (`copyToClipboard()`), müssen im nicht-interaktiven/ACP-Pfad übersprungen werden.

---

## 2. Ausgangszustand nach Abschluss von Phase 1

Architekturpunkte nach Phase 1 (Phase 2 baut direkt darauf auf):

- Das Feld `commandType` wurde aus dem `SlashCommand`-Interface entfernt, alle Befehle verwenden jetzt explizite `supportedModes`.
- `getEffectiveSupportedModes()` ist eine zweistufige Ableitung: explizite `supportedModes` → `CommandKind` Fallback.
- `CommandService.getCommandsForMode(mode)` ersetzt die alte Whitelist `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`.
- `btw`, `bug`, `compress`, `context`, `init`, `summary` wurden bereits in Phase 1 auf alle Modi erweitert und **sind nicht in der Liste dieser Phase**.
- In `createNonInteractiveUI()` sind alle Methoden No-ops: `addItem`, `clear`, `setDebugMessage`, `setPendingItem`, `reloadCommands` ignorieren Aufrufe stillschweigend.

---

## 3. Änderungsumfang im Überblick

Diese Phase umfasst 13 Befehle, unterteilt in vier Kategorien basierend auf der Implementierungskomplexität:

| Kategorie       | Befehle                                       | Änderungsschwerpunkte                                                                             |
| --------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Typ A**       | `export`                                      | Nur `supportedModes` ändern, alle Pfade der Aktion geben bereits gültige Typen zurück             |
| **Nur interaktiv** | `plan`, `statusline`                        | Designentscheidung: Diese Befehle sind semantisch eng mit der interaktiven Oberfläche gekoppelt; `supportedModes: ['interactive']` beibehalten |
| **Typ A+**      | `language`                                    | `supportedModes` ändern + geringe nicht-interaktive Zweigverarbeitung                             |
| **Nur interaktiv** | `copy`, `restore`                           | Designentscheidung: Zwischenablage und Snapshot-Wiederherstellung sind im Kern interaktive Operationen; `supportedModes: ['interactive']` beibehalten |
| **Typ A'**      | `model`, `approval-mode`                      | Mit Argument-Pfad gibt bereits `message` zurück; ohne Argument-Pfad muss neuer nicht-interaktiver Zweig hinzugefügt werden (aktuell wird Dialog ausgelöst) |
| **Typ B**       | `about`, `stats`, `insight`, `docs`, `clear` | Alle Pfade der Aktion geben entweder `void` zurück oder rufen `addItem`/`clear` auf; müssen einen vollständigen nicht-interaktiven Zweig erhalten |

---

## 4. Typ A: Nur `supportedModes` ändern

Alle `action`-Pfade dieser drei Befehle geben bereits `message` oder `submit_prompt` zurück, haben keine UI-Abhängigkeiten, `handleCommandResult` kann sie direkt verarbeiten.

### 4.1 `/export` (und Unterbefehle)

**Aktueller Zustand**: `supportedModes: ['interactive']`, alle Unterbefehl-Aktionen geben `MessageActionReturn` zurück.

**Änderung**: `supportedModes` des Elternbefehls und aller vier Unterbefehle (`md`, `html`, `json`, `jsonl`) auf `['interactive', 'non_interactive', 'acp']` ändern.

**ACP-Nachrichteninhalt**: Der aktuell von der Aktion zurückgegebene Inhalt enthält bereits den vollständigen Dateipfad (z. B. `Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`) und ist für die IDE nutzbar; keine Textänderung erforderlich.

> **Hinweis**: Der Elternbefehl `/export` selbst hat keine `action`, nur Unterbefehle. Wenn `supportedModes` des Elternbefehls auf alle Modi geändert wird, kann `parseSlashCommand` die Unterbefehl-Routen matchen. Wenn jedoch der Benutzer nur `/export` ohne Unterbefehl eingibt, ist `commandToExecute.action` undefiniert, `handleSlashCommand` gibt `no_command` zurück und der Aufrufer zeigt einen Hinweis auf verfügbare Unterbefehle an. Dies ist das erwartete Verhalten.

### 4.2 `/plan`

**Aktueller Zustand**: `supportedModes: ['interactive']`, alle Pfade der Aktion geben `MessageActionReturn` oder `SubmitPromptActionReturn` zurück.

**Designentscheidung**: `/plan` ist ein Befehl, der den Benutzer durch eine mehrstufige interaktive Planung führt; semantisch eng mit der interaktiven Oberfläche gekoppelt. Nach Diskussion bleibt `supportedModes: ['interactive']` erhalten; keine Erweiterung auf nicht-interaktive/ACP-Modi.

### 4.3 `/statusline`

**Aktueller Zustand**: `supportedModes: ['interactive']`, die Aktion gibt immer `SubmitPromptActionReturn` zurück (reicht den Subagent-Aufruf-Prompt an das Modell weiter).

**Designentscheidung**: `/statusline` ist ein Befehl, der den Subagent zur Zusammenfassung des aktuellen Status auffordert; semantisch eng mit der interaktiven Oberfläche gekoppelt. Nach Diskussion bleibt `supportedModes: ['interactive']` erhalten; keine Erweiterung auf nicht-interaktive/ACP-Modi.

---

## 5. Typ A+: Geringe nicht-interaktive Zweigverarbeitung

### 5.1 `/language`

**Aktueller Zustand**: Alle Pfade der Aktion geben `MessageActionReturn` zurück (Spracheinstellungen lesen/setzen).

**Zu behandelnde Seiteneffekte**: `setUiLanguage()` ruft `context.ui.reloadCommands()` auf; in der nicht-interaktiven UI ist dies bereits ein No-op, keine weitere Behandlung erforderlich.

**Änderungen**:

- `supportedModes` des Elternbefehls und der Unterbefehle (`ui`, `output` sowie der dynamisch generierten `SUPPORTED_LANGUAGES`-Unterbefehle) auf `['interactive', 'non_interactive', 'acp']` ändern.
- Keine Modus-Zweige in der Aktion erforderlich; der bestehende Rückgabetext ist bereits maschinenlesbar.

**ACP-Semantik**: Die Ausführung von `/language ui zh-CN` im nicht-interaktiven Modus (Einzelaufruf) ändert die dauerhaften Einstellungen (schreibt in die Einstellungsdatei). Diese Änderung wirkt sich auf nachfolgende Sitzungen aus, und die i18n in der aktuellen Sitzung wird sofort wirksam. Dies entspricht den Benutzererwartungen.

### 5.2 `/copy`

**Aktueller Zustand**: Die Aktion ruft `copyToClipboard()` auf; in der ACP-/Headless-Umgebung könnte dies eine Ausnahme auslösen oder stillschweigend fehlschlagen (Zwischenablage nicht verfügbar).

**Änderungen**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Neuen Modus-Zweig in der Aktion hinzufügen:

```typescript
// Letzte AI-Nachricht abrufen (bestehende Logik, wiederverwendbar)
if (context.executionMode !== 'interactive') {
  // Nicht-interaktiv/ACP: Zwischenablage überspringen, Inhalt direkt zurückgeben
  if (!lastAiOutput) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No output in history.',
    };
  }
  return {
    type: 'message',
    messageType: 'info',
    content: lastAiOutput,
  };
}
// Interaktiver Pfad: bestehende Zwischenablage-Logik unverändert
await copyToClipboard(lastAiOutput);
return {
  type: 'message',
  messageType: 'info',
  content: 'Last output copied to the clipboard',
};
```

**ACP-Semantik**: Die IDE erhält den Originaltext der letzten Modellausgabe und kann selbst entscheiden, ob sie ihn in die Zwischenablage kopiert oder dem Benutzer anzeigt.

### 5.3 `/restore`

**Aktueller Zustand**: `supportedModes: ['interactive']`.

**Designentscheidung**: Die Snapshot-Wiederherstellung führt weitere Tool-Aufrufe aus; semantisch eng mit der interaktiven Oberfläche gekoppelt. Nach Diskussion bleibt `supportedModes: ['interactive']` erhalten; keine Erweiterung auf nicht-interaktive/ACP-Modi.

**ACP-Semantik**: Die Wiederherstellung des Git-Status des Checkpoints und das Setzen des Gemini-Client-Verlaufs werden als Seiteneffekte ausgeführt; die IDE erhält eine Bestätigungsnachricht und kann den Benutzer darauf hinweisen, dass der Status wiederhergestellt wurde. Die erneute Ausführung des Tools liegt im Ermessen der IDE.

---

## 6. Typ A': Nicht-interaktive Verarbeitung des argumentlosen Dialog-Pfads

### 6.1 `/model`

**Aktueller Zustand**:

| Eingabe                           | Aktuelles Verhalten                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/model` (kein Argument)          | → `{ type: 'dialog', dialog: 'model' }` (im nicht-interaktiven Modus wird es zu unsupported)          |
| `/model <model-id>`               | Nicht implementiert (nur `--fast`-Zweig existiert)                                                    |
| `/model --fast` (kein model name) | → `{ type: 'dialog', dialog: 'fast-model' }` (im nicht-interaktiven Modus wird es zu unsupported)     |
| `/model --fast <model-id>`        | → `MessageActionReturn` ✅                                                                            |

**Änderungen**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Vor jedem Dialog-Pfad in der Aktion einen nicht-interaktiven Zweig einfügen:

```typescript
// Argumentloser Pfad (ursprünglich Rückgabe dialog: 'model')
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentModel = config.getModel() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current model: ${currentModel}\nUse "/model <model-id>" to switch models.`,
    };
  }
  return { type: 'dialog', dialog: 'model' };
}

// --fast ohne Argument (ursprünglich Rückgabe dialog: 'fast-model')
if (args.startsWith('--fast') && !modelName) {
  if (context.executionMode !== 'interactive') {
    const fastModel = context.services.settings?.merged?.fastModel ?? 'not set';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current fast model: ${fastModel}\nUse "/model --fast <model-id>" to set fast model.`,
    };
  }
  return { type: 'dialog', dialog: 'fast-model' };
}
```

**ACP-Semantik**: Die IDE zeigt den aktuellen Modellnamen als Referenz an; das Wechseln des Modells erfolgt über einen Aufruf mit Argument (`/model <model-id>`).

> **Hinweis**: `/model <model-id>` (ohne `--fast`) hat derzeit keine implementierte Logik zum Setzen des aktuellen Session-Modells; nur `--fast <model-id>` hat eine. Wenn Phase 2 das Wechseln des Hauptmodells unter ACP unterstützen soll, muss die Set-Logik für `/model <model-id>` parallel implementiert werden. Dieses Design reserviert diesen Pfad, markiert ihn jedoch als optional für Phase 2; Priorität hat der schreibgeschützte Pfad "Aktuelles Modell anzeigen".

### 6.2 `/approval-mode`

**Aktueller Zustand**:

| Eingabe                         | Aktuelles Verhalten                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/approval-mode` (kein Argument) | → `{ type: 'dialog', dialog: 'approval-mode' }` (im nicht-interaktiven Modus wird es zu unsupported)          |
| `/approval-mode <mode>`          | → `MessageActionReturn` ✅                                                                                     |
| `/approval-mode <invalid>`       | → `MessageActionReturn` (Fehler) ✅                                                                            |

**Änderungen**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Im argumentlosen Pfad (`!args.trim()`) einen nicht-interaktiven Zweig einfügen:

```typescript
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentMode = config?.getApprovalMode() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current approval mode: ${currentMode}\nAvailable modes: ${APPROVAL_MODES.join(', ')}\nUse "/approval-mode <mode>" to change.`,
    };
  }
  return { type: 'dialog', dialog: 'approval-mode' };
}
```

---

## 7. Typ B: Vollständiger nicht-interaktiver Zweig erforderlich

Bei diesen fünf Befehlen rendert die Aktion im interaktiven Modus React-Komponenten über `context.ui.addItem()` oder ruft `context.ui.clear()` auf; der Rückgabewert ist `void`. Im nicht-interaktiven Modus sind diese Aufrufe No-ops, sodass `handleSlashCommand` die fehlende Rückgabe als `"Command executed successfully."` behandelt – ohne tatsächlichen Ausgabeinhalt.

**Implementierungsprinzip**: Zu **Beginn** der Aktion `executionMode` prüfen; bei nicht-interaktivem Modus **vorzeitig** eine `message` mit tatsächlichem Inhalt zurückgeben; der interaktive Pfad-Code wird nicht angetastet.

### 7.1 `/about` (altName: `status`)

**Datenquelle**: `getExtendedSystemInfo(context)` gibt `ExtendedSystemInfo` zurück, das Folgendes enthält: `cliVersion`, `osPlatform`, `osArch`, `osRelease`, `nodeVersion`, `modelVersion`, `selectedAuthType`, `ideClient`, `sessionId`, `memoryUsage`, `baseUrl`, `apiKeyEnvKey`, `gitCommit`, `fastModel`. Alle Felder sind im nicht-interaktiven Modus verfügbar (context.services.config und settings sind bereits injiziert).

**Änderungen**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Nach dem Aufruf von `getExtendedSystemInfo` und vor dem interaktiven Pfad einen Modus-Zweig einfügen:

```typescript
action: async (context) => {
  const systemInfo = await getExtendedSystemInfo(context);

  if (context.executionMode !== 'interactive') {
    const lines = [
      `Qwen Code v${systemInfo.cliVersion}`,
      `Model: ${systemInfo.modelVersion}`,
      `Fast Model: ${systemInfo.fastModel ?? 'not set'}`,
      `Auth: ${systemInfo.selectedAuthType}`,
      `Platform: ${systemInfo.osPlatform} ${systemInfo.osArch} (${systemInfo.osRelease})`,
      `Node.js: ${systemInfo.nodeVersion}`,
      `Session: ${systemInfo.sessionId}`,
      ...(systemInfo.gitCommit ? [`Git commit: ${systemInfo.gitCommit}`] : []),
      ...(systemInfo.ideClient ? [`IDE: ${systemInfo.ideClient}`] : []),
    ];
    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
    };
  }

  // Interaktiver Pfad: bestehende addItem-Logik unverändert
  const aboutItem: Omit<HistoryItemAbout, 'id'> = { type: MessageType.ABOUT, systemInfo };
  context.ui.addItem(aboutItem, Date.now());
},
```

### 7.2 `/stats` (und Unterbefehle `model`, `tools`)

**Datenquelle**: `context.session.stats` (`SessionStatsState`) enthält `sessionStartTime`, `metrics` (`SessionMetrics`: `models`, `tools`, `files`), `promptCount`. Im nicht-interaktiven Modus ist `sessionStartTime` der Zeitpunkt des aktuellen Aufrufs, `metrics` stammt von `uiTelemetryService.getMetrics()` (kumulierter Wert des aktuellen Aufrufs, normalerweise Null), `promptCount` ist 1.

**Änderungen**:

1. `supportedModes` des Elternbefehls `stats` und der Unterbefehle `model`, `tools` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. In den Aktionen des Elternbefehls und jedes Unterbefehls einen Modus-Zweig einfügen, der eine Textstatistik zurückgibt:

```typescript
// /stats Hauptbefehl
action: (context) => {
  if (context.executionMode !== 'interactive') {
    const now = new Date();
    const { sessionStartTime, promptCount, metrics } = context.session.stats;
    if (!sessionStartTime) {
      return { type: 'message', messageType: 'error', content: 'Session start time unavailable.' };
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    // Token-Anzahl aller Modelle summieren
    let totalPromptTokens = 0, totalCandidateTokens = 0, totalRequests = 0;
    for (const modelMetrics of Object.values(metrics.models)) {
      totalPromptTokens += modelMetrics.tokens.prompt;
      totalCandidateTokens += modelMetrics.tokens.candidates;
      totalRequests += modelMetrics.api.totalRequests;
    }

    const lines = [
      `Session duration: ${formatDuration(wallDuration)}`,
      `Prompts: ${promptCount}`,
      `API requests: ${totalRequests}`,
      `Tokens — prompt: ${totalPromptTokens}, output: ${totalCandidateTokens}`,
      `Tool calls: ${metrics.tools.totalCalls} (${metrics.tools.totalSuccess} ok, ${metrics.tools.totalFail} fail)`,
      `Files: +${metrics.files.totalLinesAdded} / -${metrics.files.totalLinesRemoved} lines`,
    ];
    return { type: 'message', messageType: 'info', content: lines.join('\n') };
  }

  // Interaktiver Pfad: bestehende addItem-Logik unverändert
  const statsItem: HistoryItemStats = { type: MessageType.STATS, duration: formatDuration(wallDuration) };
  context.ui.addItem(statsItem, Date.now());
},
```

Die Unterbefehle `model` und `tools` erhalten ebenfalls jeweils einen Modus-Zweig, der textuelle Statistiken für die entsprechende Dimension zurückgibt (für Modelldimension nach Modellname aufgeschlüsselte Token-Nutzung; für Tool-Dimension Anzahl der Aufrufe pro Tool).

**Hinweis**: Bei einem einzelnen nicht-interaktiven Aufruf sind die Metriken normalerweise Null (neue Sitzung), aber die Struktur ist vollständig und beeinträchtigt das Format nicht. In einer ACP-Sitzung können kumulierte Werte vorhanden sein, die aussagekräftig sind.

### 7.3 `/insight`

**Aktueller Zustand**: Die Aktion gibt `void` zurück, zeigt via `addItem` Fortschritt und Ergebnis an, und ruft am Ende `open(outputPath)` auf, um den Browser zu öffnen. Die Kernlogik ist `insightGenerator.generateStaticInsight()`, die eine HTML-Datei generiert.

**Änderungen**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Dreifache Verzweigung nach `executionMode`:
   - `non_interactive`: Synchron generieren, Fortschritts-Callback ignorieren, keinen Browser öffnen, direkt `message` (Dateipfad) zurückgeben
   - `acp`: Asynchrone Generierung starten, Fortschritt (`encodeInsightProgressMessage`) und Fertigstellung (`encodeInsightReadyMessage`) über `stream_messages` an die IDE senden
   - `interactive`: Vorhandene `addItem` + `setPendingItem` + `open()`-Logik unverändert

```typescript
// Nicht-interaktiver Pfad
if (context.executionMode === 'non_interactive') {
  const outputPath = await insightGenerator.generateStaticInsight(
    projectsDir,
    () => {}, // No-op Fortschritt
  );
  return {
    type: 'message',
    messageType: 'info',
    content: t('Insight report generated at: {{path}}', { path: outputPath }),
  };
}

// ACP-Pfad: stream_messages
if (context.executionMode === 'acp') {
  // ... streamMessages async generator konstruieren, encodeInsightProgressMessage / encodeInsightReadyMessage yielden ...
  return { type: 'stream_messages', messages: streamMessages() };
}

// Interaktiver Pfad: bestehende Implementierung unverändert
```

**Designbegründung**: Der `non_interactive`-Modus (CLI-Pipe) unterstützt kein `stream_messages` und kann nur eine einzelne `message` zurückgeben; der ACP-Modus (IDE-Plugin) kann `stream_messages` konsumieren und den Fortschritt in Echtzeit anzeigen, daher wird für diesen der Streaming-Pfad beibehalten.

**ACP-Nachrichtenformat**: `encodeInsightProgressMessage(stage, progress, detail?)` erzeugt eine von der IDE interpretierbare Fortschrittsbalkennachricht; `encodeInsightReadyMessage(outputPath)` benachrichtigt die IDE, dass die Datei bereit ist; die IDE entscheidet, wie der Link angezeigt wird.

### 7.4 `/docs`

**Aktueller Zustand**: Die Aktion gibt `void` zurück, zeigt via `addItem` eine Nachricht an und ruft `open(docsUrl)` auf, um den Browser zu öffnen. Es gibt einen `SANDBOX`-Umgebungsvariablen-Zweig (in der Sandbox nur addItem, kein Browser öffnen).

**Änderungen**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Rückgabetyp der Aktion auf `Promise<void | MessageActionReturn>` ändern.
3. Am Anfang der Aktion einen nicht-interaktiven Zweig einfügen:

```typescript
action: async (context) => {
  const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
  const docsUrl = `https://qwenlm.github.io/qwen-code-docs/${langPath}`;

  if (context.executionMode !== 'interactive') {
    // Nicht-interaktiv/ACP: URL direkt zurückgeben, keinen Browser öffnen, kein addItem
    return {
      type: 'message',
      messageType: 'info',
      content: `Qwen Code documentation: ${docsUrl}`,
    };
  }

  // Interaktiver Pfad: bestehende SANDBOX-Prüfung + addItem + open() unverändert
  if (process.env['SANDBOX'] && ...) {
    context.ui.addItem(...);
  } else {
    context.ui.addItem(...);
    await open(docsUrl);
  }
},
```

### 7.5 `/clear` (altNames: `reset`, `new`)

**Aktueller Zustand**: Die Aktion führt folgende Operationen aus und gibt `void` zurück:

1. `config.getHookSystem()?.fireSessionEndEvent()` — Hook auslösen (Seiteneffekt)
2. `config.startNewSession()` — Neue Session-ID starten (Seiteneffekt)
3. `uiTelemetryService.reset()` — Telemetriezähler zurücksetzen (Seiteneffekt)
4. `skillTool.clearLoadedSkills()` — Skill-Cache löschen (Seiteneffekt)
5. `context.ui.clear()` — Terminal-UI leeren (**UI-Seiteneffekt, im nicht-interaktiven Modus No-op**)
6. `geminiClient.resetChat()` — Chat-Verlauf zurücksetzen (Seiteneffekt)
7. `config.getHookSystem()?.fireSessionStartEvent()` — Hook auslösen (Seiteneffekt)

**Semantikanalyse für nicht-interaktiven/ACP-Modus**:

- `ui.clear()` ist im nicht-interaktiven Modus bereits No-op; keine Behandlung erforderlich
- `geminiClient.resetChat()`: in einer ACP-Sitzung ein sinnvoller Seiteneffekt (Chat-Verlauf leeren); sollte beibehalten werden. In einem einzelnen nicht-interaktiven Aufruf ist jeder Aufruf eine neue Sitzung; `resetChat` ist semantisch redundant, aber harmlos
- `config.startNewSession()`: in ACP sinnvoll (neue Session-ID starten); in einem einzelnen nicht-interaktiven Aufruf ebenfalls semantisch redundant, aber harmlos
- `fireSessionEndEvent` / `fireSessionStartEvent`: in ACP sinnvoll (Hooks auslösen)

**Entscheidung**: Im nicht-interaktiven/ACP-Pfad werden alle sinnvollen Seiteneffekte beibehalten (resetChat, startNewSession, Hook-Ereignisse); nur `ui.clear()` wird übersprungen (bereits No-op). Zusätzlich wird eine Nachricht zurückgegeben, die die Kontextgrenze markiert.

**Änderungen**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Rückgabetyp der Aktion auf `Promise<void | MessageActionReturn>` ändern.
3. Innerhalb der Aktion, nach dem Aufruf von `context.ui.clear()` (oder als Ersatz), je nach Modus verzweigen:

```typescript
action: async (context, _args) => {
  const { config } = context.services;

  if (config) {
    config.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Clear).catch(...);

    const newSessionId = config.startNewSession();
    uiTelemetryService.reset();

    const skillTool = config.getToolRegistry()?.getAllTools().find(...);
    if (skillTool instanceof SkillTool) skillTool.clearLoadedSkills();

    if (newSessionId && context.session.startNewSession) {
      context.session.startNewSession(newSessionId);
    }

    // ui.clear() ist im nicht-interaktiven Modus bereits No-op, wird aber trotzdem aufgerufen (keine Bedingung erforderlich)
    context.ui.clear();

    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.resetChat();
    }

    config.getHookSystem()?.fireSessionStartEvent(...).catch(...);
  } else {
    context.ui.clear();
  }

  // Rückgabewert je nach Modus
  if (context.executionMode !== 'interactive') {
    return {
      type: 'message',
      messageType: 'info',
      content: 'Context cleared. Previous messages are no longer in context.',
    };
  }
  // Interaktiver Pfad: void (keine Rückgabe, React-UI wird von ui.clear() aktualisiert)
},
```

**ACP-Semantik**: Die IDE erhält eine Kontextgrenzenmarkierung und kann sie als Sitzungstrenner anzeigen (z. B. Hinweis "Neue Sitzung gestartet") und den lokalen Chat-Verlaufscache leeren.

---

## 8. Änderungen an `handleCommandResult`

**Schlussfolgerung: Keine Änderung erforderlich.**

Nach den Änderungen an allen Befehlen in Phase 2 ist der Rückgabetyp im nicht-interaktiven/ACP-Pfad entweder `message` oder `submit_prompt`, die beide bereits im switch von `handleCommandResult` korrekt verarbeitet werden.

---

## 9. Änderungen an `createNonInteractiveUI()`

**Schlussfolgerung: Keine Änderung erforderlich.**

Die aktuelle No-op-Implementierung ist ausreichend. No-ops wie `addItem`, `clear`, `setPendingItem` werden im nicht-interaktiven Pfad der Typ-B-Befehle nicht aufgerufen (wegen vorzeitiger Rückgabe); der interaktive Pfad ist nicht betroffen.

---

## 10. Phase 2.2: Prompt-Befehl Modellaufruf öffnen

In Phase 1 wurden `CommandService.getModelInvocableCommands()` bereits implementiert, und `BundledSkillLoader`, `FileCommandLoader` (Benutzer-/Projektbefehle) und `McpPromptLoader` haben `modelInvocable: true` gesetzt.

Phase 2.2 besteht darin, `SkillTool` so zu ändern, dass es nicht nur `SkillManager.listSkills()`, sondern auch `CommandService.getModelInvocableCommands()` konsumiert und so einen einheitlichen Einstiegspunkt für modellaufrufbare Befehle schafft.

**Zu ändernde Datei**: `packages/core/src/tools/SkillTool.ts` (oder entsprechender Pfad)

**Konkrete Änderungen**:

1. `SkillTool` erhält bei der Initialisierung `CommandService` (oder dessen `getModelInvocableCommands()`-Ergebnis) als Abhängigkeit per Dependency Injection.
2. Beim Erstellen der Tool-Beschreibung werden die Ergebnisse von `listSkills()` und `getModelInvocableCommands()` zusammengeführt.
3. Sicherstellen, dass eingebaute Befehle (`modelInvocable: false`) nicht in der Tool-Beschreibung erscheinen.

> **Anmerkung**: Die konkrete Implementierung von `SkillTool` hängt von der internen Architektur von `packages/core` ab. Dieses Dokument beschreibt nur die Schnittstellenänderung; die Implementierungsdetails müssen unter Berücksichtigung der bestehenden Struktur des Core-Pakets ermittelt werden.

---

## 11. Phase 2.3: Mid-Input Slash-Befehl Erkennung (Basisversion)

In der `InputPrompt`-Komponente wird ein Slash-Token in der Nähe des Cursors erkannt (nicht nur am Zeilenanfang) und ein Vervollständigungsmenü ausgelöst.

**Erkennungsregeln**:

- Wenn vor dem Cursor ein Token existiert, das mit `/` beginnt und keine Leerzeichen enthält, wird eine Befehlsvervollständigung ausgelöst.
- Die Vervollständigungsvorschläge stammen aus der Liste der sichtbaren Befehle von `getCommandsForMode('interactive')`.
- Das Vervollständigungsmenü zeigt den Befehlsnamen + Beschreibung (ohne argumentHint etc.; wird in Phase 3 ergänzt).

> Diese Funktion ist eine UI-Ebenen-Änderung und ein unabhängiger Untertask von Phase 2.3, der die Implementierung von Phase 2.1/2.2 nicht beeinflusst.

---

## 12. Dateiänderungen im Überblick

### 12.1 Befehlsdateiänderungen (Phase 2.1)

| Datei                       | Typ      | Änderungsdetails                                                                                    |
| --------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `exportCommand.ts`          | Typ A    | Elternbefehl + 4 Unterbefehle: `supportedModes` → alle Modi                                         |
| `planCommand.ts`            | Nur interaktiv | Designentscheidung: `supportedModes: ['interactive']` beibehalten, keine Änderung            |
| `statuslineCommand.ts`      | Nur interaktiv | Designentscheidung: `supportedModes: ['interactive']` beibehalten, keine Änderung            |
| `languageCommand.ts`        | Typ A+   | Elternbefehl + `ui`/`output`-Unterbefehle + dynamische Sprachunterbefehle: `supportedModes` → alle Modi |
| `copyCommand.ts`            | Nur interaktiv | Designentscheidung: `supportedModes: ['interactive']` beibehalten, keine Änderung            |
| `restoreCommand.ts`         | Nur interaktiv | Designentscheidung: `supportedModes: ['interactive']` beibehalten, keine Änderung            |
| `modelCommand.ts`           | Typ A'   | `supportedModes` → alle Modi + neuer nicht-interaktiver Zweig für argumentlosen/ohne-fast-modell-Pfad |
| `approvalModeCommand.ts`    | Typ A'   | `supportedModes` → alle Modi + neuer nicht-interaktiver Zweig für argumentlosen Pfad                 |
| `aboutCommand.ts`           | Typ B    | `supportedModes` → alle Modi + nicht-interaktiver Pfad gibt `message` zurück (Version/Modell/Umgebungsübersicht) |
| `statsCommand.ts`           | Typ B    | `supportedModes` → alle Modi + nicht-interaktiver Pfad gibt `message` zurück (Statistik-Text); Unterbefehle synchron behandelt |
| `insightCommand.ts`         | Typ B    | `supportedModes` → alle Modi + `non_interactive`-Pfad generiert synchron und gibt `message` (Dateipfad) zurück; `acp`-Pfad gibt `stream_messages` mit Fortschrittsaktualisierungen zurück |
| `docsCommand.ts`            | Typ B    | `supportedModes` → alle Modi + nicht-interaktiver Pfad gibt `message` (Dokumentations-URL) zurück, ohne Browser zu öffnen |
| `clearCommand.ts`           | Typ B    | `supportedModes` → alle Modi + Aktion gibt je nach Modus `message` oder `void` zurück               |
### 12.2 Andere Dateiänderungen

| Datei                                                     | Änderungen                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts`                    | Phase 2.2: Integration von `getModelInvocableCommands()` (detailliertes Design wird später festgelegt) |
| `packages/cli/src/ui/InputPrompt.tsx` (oder äquivalente Komponente) | Phase 2.3: Mid-Input-Slash-Erkennungslogik                                                     |

### 12.3 Unveränderte Dateien

- `packages/cli/src/nonInteractiveCliCommands.ts` (`handleCommandResult`, `handleSlashCommand` müssen nicht geändert werden)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (Stub-UI muss nicht geändert werden)
- `packages/cli/src/services/commandUtils.ts` (`filterCommandsForMode`, `getEffectiveSupportedModes` müssen nicht geändert werden)
- `packages/cli/src/services/CommandService.ts` (`getCommandsForMode`, `getModelInvocableCommands` wurden bereits in Phase 1 implementiert)

---

## 13. Teststrategie

### 13.1 Befehls-Unit-Tests

Für jeden geänderten Befehl werden im selben Verzeichnis Testdateien (`*.test.ts`) neu erstellt oder aktualisiert, die folgende Fälle abdecken:

**A/A+-Klasse-Befehle** (`export`, `language`):

- `supportedModes` enthält korrekt `non_interactive` und `acp`
- Unter `executionMode: 'non_interactive'` gibt die Aktion `MessageActionReturn` oder `SubmitPromptActionReturn` zurück und ruft weder `ui.addItem` noch `ui.clear` auf
- Das interaktive Pfadverhalten ist identisch mit vor dem Refactoring (Snapshot-Tests)

**Nur-interaktive Befehle** (`plan`, `statusline`, `copy`, `restore`):

- `supportedModes` ist `['interactive']` – dies ist eine Designentscheidung
- Stellen Sie sicher, dass bei Ausführung im nicht-interaktiven Modus korrekt `unsupported` zurückgegeben wird

**A'-Klasse-Befehle** (`model`, `approval-mode`):

- Keine Parameter + `executionMode: 'non_interactive'` → gibt aktuellen Status als `message` zurück, kein `dialog`
- Mit Parametern + `executionMode: 'non_interactive'` → die vorhandene `message`-Logik wird normal ausgeführt
- Interaktiver Pfad: Keine Parameter → `dialog`, mit Parametern → `message` (unverändert)

**B-Klasse-Befehle** (`about`, `stats`, `insight`, `docs`, `clear`):

- Unter `executionMode: 'non_interactive'` gibt die Aktion `MessageActionReturn` zurück und ruft keine `ui.*`-Methode auf
- Die zurückgegebene `content`-Zeichenfolge enthält die erwarteten Schlüsselfelder (Versionsnummer, Modellname, URL usw.)
- Interaktiver Pfad: `ui.addItem` wird aufgerufen, die Aktion gibt `void` zurück (unverändert)

**Spezialfall `clear`**:

- Unter `executionMode: 'non_interactive'` wird `geminiClient.resetChat()` weiterhin aufgerufen (Nebeneffekte bleiben erhalten)
- Gibt eine Kontextgrenzen-`message` zurück, mit dem Inhalt `'Context cleared. Previous messages are no longer in context.'`

### 13.2 Integrationstests (`handleSlashCommand`)

In `nonInteractiveCli.test.ts` oder einer neuen Integrationstestdatei:

- `handleSlashCommand('/about', ...)` gibt im nicht-interaktiven Modus `{ type: 'message', content: enthält Versionsnummer }` zurück
- `handleSlashCommand('/stats', ...)` gibt im nicht-interaktiven Modus `{ type: 'message', content: enthält 'Session duration' }` zurück
- `handleSlashCommand('/docs', ...)` gibt im nicht-interaktiven Modus `{ type: 'message', content: enthält 'qwenlm.github.io' }` zurück
- `handleSlashCommand('/clear', ...)` gibt im nicht-interaktiven Modus `{ type: 'message', content: 'Context cleared.' }` zurück
- `handleSlashCommand('/plan', ...)` gibt im nicht-interaktiven Modus `unsupported` zurück (nur-interaktiver Befehl)
- Vorhandene nicht-interaktive Befehle (`btw`, `bug` usw.) zeigen keine Regressionen

### 13.3 `commandUtils`-Tests

In `commandUtils.test.ts` neu hinzugefügt (oder bestehende Tests decken weiterhin ab):

- Die erweiterten Befehle (`export`, `language` usw.) bestehen sowohl den Filter `filterCommandsForMode(commands, 'non_interactive')` als auch `filterCommandsForMode(commands, 'acp')`
- Nur-interaktive Befehle (`plan`, `statusline`, `copy`, `restore`) werden unter `filterCommandsForMode(commands, 'non_interactive')` korrekt herausgefiltert

---

## 14. Analyse der Verhaltensauswirkungen

| Szenario                                               | Verhalten vor Phase 2                                           | Verhalten nach Phase 2               | Art                          |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------ | ---------------------------- |
| Ausführung von `/export md` im nicht-interaktiven Modus | ❌ nicht unterstützt (gefiltert)                                | ✅ gibt Dateipfad als message zurück | Erweiterung                  |
| Ausführung von `/plan <task>` im nicht-interaktiven Modus | ❌ nicht unterstützt                                            | ❌ nicht unterstützt (Designentscheidung: nur interaktiv) | Unverändert                  |
| Ausführung von `/statusline` im nicht-interaktiven Modus | ❌ nicht unterstützt                                            | ❌ nicht unterstützt (Designentscheidung: nur interaktiv) | Unverändert                  |
| Ausführung von `/language ui zh-CN` im nicht-interaktiven Modus | ❌ nicht unterstützt                                            | ✅ Sprache gesetzt, Bestätigungs-message zurückgegeben | Erweiterung                  |
| Ausführung von `/copy` im nicht-interaktiven Modus    | ❌ nicht unterstützt                                            | ❌ nicht unterstützt (Designentscheidung: nur interaktiv) | Unverändert                  |
| Ausführung von `/restore` (keine Parameter) im nicht-interaktiven Modus | ❌ nicht unterstützt                                            | ❌ nicht unterstützt (Designentscheidung: nur interaktiv) | Unverändert                  |
| Ausführung von `/restore <id>` im nicht-interaktiven Modus | ❌ nicht unterstützt                                            | ❌ nicht unterstützt (Designentscheidung: nur interaktiv) | Unverändert                  |
| Ausführung von `/model` im nicht-interaktiven Modus   | ❌ nicht unterstützt (dialog)                                  | ✅ gibt aktuellen Modellnamen zurück | Erweiterung                  |
| Ausführung von `/model <id>` im nicht-interaktiven Modus | ❌ nicht unterstützt                                            | 🔄 Phase 2 optional: Implementierung der Wechsellogik | Erweiterung (optional)       |
| Ausführung von `/approval-mode` im nicht-interaktiven Modus | ❌ nicht unterstützt (dialog)                                  | ✅ gibt aktuellen Genehmigungsmodus zurück | Erweiterung                  |
| Ausführung von `/approval-mode yolo` im nicht-interaktiven Modus | ❌ nicht unterstützt                                            | ✅ Modus gesetzt, Bestätigung zurückgegeben | Erweiterung                  |
| Ausführung von `/about` im nicht-interaktiven Modus   | ❌ gibt "Command executed successfully." zurück (addItem no-op) | ✅ gibt Zusammenfassung (Version/Modell/Umgebung) zurück | Bugfix + Erweiterung         |
| Ausführung von `/stats` im nicht-interaktiven Modus   | ❌ gibt "Command executed successfully." zurück                | ✅ gibt Session-Statistiktext zurück | Bugfix + Erweiterung         |
| Ausführung von `/insight` im nicht-interaktiven Modus | ❌ gibt "Command executed successfully." zurück (generiert aber keine Ausgabe) | ✅ generiert und gibt Dateipfad zurück | Bugfix + Erweiterung         |
| Ausführung von `/docs` im nicht-interaktiven Modus    | ❌ gibt "Command executed successfully." zurück                | ✅ gibt Dokumentations-URL zurück   | Bugfix + Erweiterung         |
| Ausführung von `/clear` im nicht-interaktiven Modus   | ❌ gibt "Command executed successfully." zurück                | ✅ gibt Kontextgrenzen-message zurück | Bugfix + Erweiterung         |
| Ausführung eines obigen Befehls im interaktiven Modus | ✅ Vorhandenes Verhalten                                        | ✅ Vorhandenes Verhalten (keine Regression) | Unverändert                  |

---

## 15. Implementierungsreihenfolge

Es wird empfohlen, in der folgenden Reihenfolge zu implementieren. Jede Gruppe kann als separater Commit und Review behandelt werden:

**Batch 1** (~30min): Klasse A — nur `supportedModes` ändern

Ändern Sie `exportCommand.ts` (und seine Unterbefehle) und stellen Sie sicher, dass die Tests bestehen.

**Batch 2** (~45min): A+-Klasse — wenige Verzweigungen

Ändern Sie `languageCommand.ts`, fügen Sie nicht-interaktive Verzweigungen für Pfade mit Nebeneffekten hinzu und aktualisieren Sie die zugehörigen Tests. (`copyCommand.ts` und `restoreCommand.ts` bleiben nach Diskussion nur interaktiv.)

**Batch 3** (~45min): A'-Klasse — dialog-Pfade

Ändern Sie `modelCommand.ts`, `approvalModeCommand.ts`, fügen Sie nicht-interaktive Verzweigungen für parameterlose Pfade hinzu und aktualisieren Sie die zugehörigen Tests.

**Batch 4** (~1.5h): B-Klasse — vollständige Verzweigungen

Ändern Sie `aboutCommand.ts`, `statsCommand.ts` (inkl. Unterbefehle), `docsCommand.ts`.

**Batch 5** (~1h): B-Klasse speziell — `insightCommand.ts`, `clearCommand.ts`

Diese beiden Befehle haben viele Nebeneffekte. Ein eigener Commit, aktualisieren Sie die zugehörigen Tests und Integrationstests.

**Batch 6** (~2h): Phase 2.2 — Modelleinbindung für prompt-Befehl

Ändern Sie `SkillTool`, integrieren Sie `getModelInvocableCommands()`, aktualisieren Sie die SkillTool-Tests.

**Batch 7** (~2h): Phase 2.3 — Mid-Input-Slash-Erkennung

Ändern Sie die `InputPrompt`-Komponente, fügen Sie Vervollständigungsauslöser-Logik und UI-Tests hinzu.

**Batch 8** (~30min): Vollständige Tests + Typprüfung

Führen Sie `npm run typecheck` und `cd packages/cli && npx vitest run` aus. Beheben Sie verbleibende Probleme.

---

## 16. Akzeptanz-Checkliste

**Phase 2.1: Befehlserweiterungen**

- [ ] Klasse A: `/export` (und Unterbefehle), `/plan`, `/statusline` können im nicht-interaktiven und acp-Modus normal ausgeführt werden und geben sinnvolle Ausgaben zurück
- [ ] A+-Klasse: `/language` (und Unterbefehle) wird im nicht-interaktiven Modus normal ausgeführt, die Einstellung wird persistent gespeichert
- [ ] A+-Klasse: `/copy` gibt im nicht-interaktiven/acp-Modus den letzten AI-Ausgabetext zurück (keine Zwischenablage-Operation)
- [ ] A+-Klasse: `/restore` ohne Parameter gibt im nicht-interaktiven Modus eine Checkpoint-Liste zurück; mit Parameter stellt es den Zustand wieder her und gibt eine Bestätigungs-message zurück (kein `type: 'tool'`)
- [ ] A'-Klasse: `/model` ohne Parameter gibt im nicht-interaktiven/acp-Modus den aktuellen Modellnamen zurück (kein dialog); `/model --fast <id>` wird normal gesetzt
- [ ] A'-Klasse: `/approval-mode` ohne Parameter gibt im nicht-interaktiven/acp-Modus den aktuellen Modus zurück (kein dialog); mit Parameter wird normal gesetzt
- [ ] B-Klasse: `/about` gibt im nicht-interaktiven/acp-Modus eine reine Textzusammenfassung mit Versionsnummer und Modellnamen zurück
- [ ] B-Klasse: `/stats` (inkl. Unterbefehle) gibt im nicht-interaktiven/acp-Modus reine Textstatistiken zurück
- [ ] B-Klasse: `/insight` generiert im nicht-interaktiven/acp-Modus eine Insight-Datei und gibt den Dateipfad zurück (kein Öffnen des Browsers)
- [ ] B-Klasse: `/docs` gibt im nicht-interaktiven/acp-Modus eine Dokumentations-URL zurück (kein Öffnen des Browsers)
- [ ] B-Klasse: `/clear` gibt im nicht-interaktiven/acp-Modus eine Kontextgrenzen-Markierungs-message zurück, `geminiClient.resetChat()` wird normal ausgeführt
- [ ] Alle 13 Befehle verhalten sich im interaktiven Modus identisch wie vor dem Refactoring (keine Regression)
- [ ] TypeScript-Kompilierung fehlerfrei (`npm run typecheck`)
- [ ] `npm run lint` keine neuen Fehler
- [ ] Alle vorhandenen Tests bestehen (`cd packages/cli && npx vitest run`)

**Phase 2.2: Modelleinbindung**

- [ ] Das Modell kann über `SkillTool` im Dialog bundled skills, file commands (Benutzer/Projekt) und MCP prompts aufrufen
- [ ] Das Modell kann keine built-in commands aufrufen
- [ ] Die Tool-Beschreibung von `SkillTool` enthält Namen und description aller `modelInvocable: true`-Befehle

**Phase 2.3: Mid-Input-Slash**

- [ ] Nach Eingabe von `/` im Eingabebereich (nicht auf Zeilenanfang beschränkt) wird ein Befehlsvervollständigungsmenü ausgelöst
- [ ] Das Vervollständigungsmenü zeigt Befehlsname + description an
- [ ] Nach Auswahl einer Vervollständigung wird der Befehl korrekt in das Eingabefeld eingefügt
# Phase 2 Technisches Design-Dokument: Erweiterung der Fähigkeiten

## 1. Designziele und Einschränkungen

### 1.1 Ziele

- Erweiterung der `supportedModes` für 13 Built-in-Befehle um `non_interactive` und/oder `acp`
- Sicherstellung, dass jeder erweiterte Befehl im ACP/Non-Interactive-Pfad textbasierte Inhalte zurückgibt, die für die IDE-Verarbeitung geeignet sind
- Freischaltung des Modell-Aufrufpfads für Prompt-Befehle (`SkillTool` konsumiert `getModelInvocableCommands()`)
- Implementierung der grundlegenden Erkennung von Mid-Input-Slash-Befehlen

### 1.2 Harte Constraints

- **Keine Regression im Interactive-Pfad**: Das bestehende Interactive-Verhalten aller erweiterten Befehle bleibt strikt unverändert. Neue Modus-Branches werden ausschließlich innerhalb der `action` hinzugefügt, ohne den Interactive-Pfad-Code zu berühren
- **Implementierungsstrategie: Modus-Branching statt Double-Registration**: Alle 13 Befehle nutzen eine `executionMode`-Prüfung innerhalb der `action`. Das in Phase 1 Design-Dokument §10.2 beschriebene Double-Registration-Pattern wird nicht verwendet (dies ist nur bei stark divergierender Logik zwischen Interactive und Non-Interactive erforderlich; die Komplexität der Befehle in dieser Phase erreicht diese Schwelle nicht)
- **ACP-Nachrichtenformat**: Der im ACP-Pfad zurückgegebene Text enthält keine ANSI-Styles und sollte idealerweise Markdown oder Plain Text sein, optimiert für die Verarbeitung durch IDE-Plugins
- **Überspringen umgebungsabhängiger Side-Effects**: Operationen, die eine GUI-Umgebung voraussetzen, wie das Öffnen eines Browsers (`open()`) oder das Bearbeiten der Zwischenablage (`copyToClipboard()`), müssen im Non-Interactive/ACP-Pfad übersprungen werden

---

## 2. Basisstatus nach Abschluss von Phase 1

Architektonische Eckpunkte nach Phase 1 (Phase 2 baut direkt darauf auf):

- Das Feld `commandType` wurde aus dem `SlashCommand`-Interface entfernt. Alle Befehle verwenden nun explizite `supportedModes`
- `getEffectiveSupportedModes()` nutzt eine zweistufige Inferenz: explizite `supportedModes` → Fallback auf `CommandKind`
- `CommandService.getCommandsForMode(mode)` ersetzt die bisherige Whitelist `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- `btw`, `bug`, `compress`, `context`, `init`, `summary` wurden bereits in Phase 1 auf alle Modi erweitert und sind **nicht Teil dieser Phase**
- Alle Methoden in `createNonInteractiveUI()` sind No-Ops: `addItem`, `clear`, `setDebugMessage`, `setPendingItem`, `reloadCommands` ignorieren Aufrufe stillschweigend

---

## 3. Übersicht des Änderungsumfangs

Diese Phase umfasst 13 Befehle, die nach Implementierungskomplexität in vier Kategorien unterteilt sind:

| Kategorie       | Befehle                                         | Änderungsschwerpunkte                                                                             |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Kategorie A**   | `export`                                     | Nur `supportedModes` ändern; alle Action-Pfade geben bereits gültige Typen zurück                                 |
| **Nur Interactive** | `plan`, `statusline`                         | Designentscheidung: Diese Befehle sind semantisch eng an die interaktive UI gekoppelt. `supportedModes: ['interactive']` bleibt unverändert |
| **Kategorie A+**  | `language`                                   | `supportedModes` ändern + minimale Non-Interactive-Branch-Logik                                  |
| **Nur Interactive** | `copy`, `restore`                            | Designentscheidung: Zwischenablage und Snapshot-Wiederherstellung sind inhärent interaktiv. `supportedModes: ['interactive']` bleibt unverändert   |
| **Kategorie A'**  | `model`, `approval-mode`                     | Parameter-Pfade geben bereits `message` zurück; parameterlose Pfade benötigen einen neuen Non-Interactive-Branch (aktuell Dialog-Trigger)   |
| **Kategorie B**   | `about`, `stats`, `insight`, `docs`, `clear` | Alle Action-Pfade geben `void` zurück oder rufen `addItem`/`clear` auf; vollständiger Non-Interactive-Branch erforderlich   |

---

## 4. Kategorie A: Nur `supportedModes` ändern

Alle `action`-Pfade dieser drei Befehle geben bereits `message` oder `submit_prompt` zurück, haben keinerlei UI-Abhängigkeiten und können direkt von `handleCommandResult` verarbeitet werden.

### 4.1 `/export` (und Subcommands)

**Aktueller Status**: `supportedModes: ['interactive']`, alle Subcommand-Actions geben `MessageActionReturn` zurück.

**Änderung**: `supportedModes` des Parent-Befehls und aller vier Subcommands (`md`, `html`, `json`, `jsonl`) auf `['interactive', 'non_interactive', 'acp']` ändern.

**ACP-Nachrichteninhalt**: Der aktuelle Rückgabewert der Action enthält bereits den vollständigen Dateipfad (z. B. `Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`). Dies ist IDE-freundlich und erfordert keine Textanpassung.

> **Hinweis**: `/export` als Parent-Befehl besitzt keine eigene `action`, nur Subcommands. Nach der Änderung von `supportedModes` auf alle Modi kann `parseSlashCommand` die Subcommand-Routen korrekt matchen. Gibt der Nutzer jedoch nur `/export` ohne Subcommand ein, ist `commandToExecute.action` `undefined`. `handleSlashCommand` gibt `no_command` zurück und der Aufrufer zeigt eine Liste verfügbarer Subcommands an. Dies ist das erwartete Verhalten.

### 4.2 `/plan`

**Aktueller Status**: `supportedModes: ['interactive']`, alle Action-Pfade geben `MessageActionReturn` oder `SubmitPromptActionReturn` zurück.

**Designentscheidung**: `/plan` ist ein Befehl zur mehrstufigen interaktiven Planung und ist semantisch eng an die interaktive UI gekoppelt. Nach Diskussion wird `supportedModes: ['interactive']` beibehalten und keine Erweiterung auf Non-Interactive/ACP-Modi vorgenommen.

### 4.3 `/statusline`

**Aktueller Status**: `supportedModes: ['interactive']`, Action gibt stets `SubmitPromptActionReturn` zurück (reicht den Subagent-Aufruf-Prompt an das Modell weiter).

**Designentscheidung**: `/statusline` triggert eine Subagent-Zusammenfassung des aktuellen Status und ist semantisch eng an die interaktive UI gekoppelt. Nach Diskussion wird `supportedModes: ['interactive']` beibehalten und keine Erweiterung auf Non-Interactive/ACP-Modi vorgenommen.

---

## 5. Kategorie A+: Minimale Non-Interactive-Branch-Logik

### 5.1 `/language`

**Aktueller Status**: Alle Action-Pfade geben `MessageActionReturn` zurück (Lesen/Setzen der Spracheinstellungen).

**Zu behandelnde Side-Effects**: `setUiLanguage()` ruft intern `context.ui.reloadCommands()` auf. Dies ist in der Non-Interactive-UI bereits ein No-Op und erfordert keine zusätzliche Behandlung.

**Änderung**:

- `supportedModes` des Parent-Befehls und der Subcommands (`ui`, `output` sowie dynamisch generierte Subcommands aus `SUPPORTED_LANGUAGES`) auf `['interactive', 'non_interactive', 'acp']` ändern.
- Die `action` benötigt keine Modus-Branches; der bestehende Rückgabetext ist bereits maschinenlesbar.

**ACP-Semantik**: Die Ausführung von `/language ui zh-CN` im Non-Interactive-Modus (Single-Call) ändert die persistente Einstellung (Schreiben in die Settings-Datei). Diese Änderung gilt für nachfolgende Sessions und die i18n wird innerhalb der aktuellen Session sofort wirksam. Dies entspricht der Nutzererwartung.

### 5.2 `/copy`

**Aktueller Status**: Action ruft `copyToClipboard()` auf, was in ACP/Headless-Umgebungen zu Exceptions oder silent failures führen kann (Zwischenablage nicht verfügbar).

**Änderung**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Neuen Modus-Branch innerhalb der `action` hinzufügen:

```typescript
// 获取 last AI message（现有逻辑，可复用）
if (context.executionMode !== 'interactive') {
  // 非交互/ACP：跳过剪贴板，返回内容本身
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
// interactive 路径：原有剪贴板逻辑不变
await copyToClipboard(lastAiOutput);
return {
  type: 'message',
  messageType: 'info',
  content: 'Last output copied to the clipboard',
};
```

**ACP-Semantik**: Die IDE erhält den Originaltext der letzten Modellausgabe und kann selbst entscheiden, ob sie ihn in die Zwischenablage kopiert oder dem Nutzer anzeigt.

### 5.3 `/restore`

**Aktueller Status**: `supportedModes: ['interactive']`.

**Designentscheidung**: Die Snapshot-Wiederherstellung löst erneut Tool-Aufrufe aus und ist semantisch eng an die interaktive UI gekoppelt. Nach Diskussion wird `supportedModes: ['interactive']` beibehalten und keine Erweiterung auf Non-Interactive/ACP-Modi vorgenommen.

**ACP-Semantik**: Die Wiederherstellung des Git-Status aus dem Checkpoint und die Konfiguration des Gemini-Client-History werden als Side-Effects ausgeführt. Nach Erhalt der Bestätigungsnachricht kann die IDE den Nutzer über "Status wiederhergestellt" informieren. Die erneute Ausführung der Tools liegt im Ermessen der IDE.

---

## 6. Kategorie A': Non-Interactive-Verarbeitung für parameterlose Dialog-Pfade

### 6.1 `/model`

**Aktueller Status**:

| Eingabe                             | Aktuelles Verhalten                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `/model` (ohne Parameter)               | → `{ type: 'dialog', dialog: 'model' }` (wird im Non-Interactive-Modus zu `unsupported`)      |
| `/model <model-id>`              | Nicht implementiert (nur `--fast`-Branch)                                                     |
| `/model --fast` (ohne Model-Name) | → `{ type: 'dialog', dialog: 'fast-model' }` (wird im Non-Interactive-Modus zu `unsupported`) |
| `/model --fast <model-id>`       | → `MessageActionReturn` ✅                                                       |

**Änderung**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Non-Interactive-Branch vor jedem Dialog-Pfad in der `action` einfügen:

```typescript
// 无参数路径（原返回 dialog: 'model'）
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

// --fast 无参数路径（原返回 dialog: 'fast-model'）
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

**ACP-Semantik**: Die IDE zeigt den aktuellen Modellnamen zur Referenz an. Der Modellwechsel erfolgt über den parametrisierten Aufruf (`/model <model-id>`).

> **Hinweis**: `/model <model-id>` (ohne `--fast`) implementiert aktuell keine Logik zum Setzen des Modells für die aktuelle Session; dies ist nur für `--fast <model-id>` vorhanden. Falls Phase 2 den Wechsel des Hauptmodells unter ACP unterstützen soll, muss die Set-Logik für `/model <model-id>` synchron implementiert werden. Dieses Design reserviert den Pfad, markiert ihn jedoch als optionales Feature für Phase 2. Priorität hat der Read-Only-Pfad "Aktuelles Modell anzeigen".

### 6.2 `/approval-mode`

**Aktueller Status**:

| Eingabe                       | Aktuelles Verhalten                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `/approval-mode` (ohne Parameter) | → `{ type: 'dialog', dialog: 'approval-mode' }` (wird im Non-Interactive-Modus zu `unsupported`) |
| `/approval-mode <mode>`    | → `MessageActionReturn` ✅                                                          |
| `/approval-mode <invalid>` | → `MessageActionReturn` (error) ✅                                                  |

**Änderung**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Non-Interactive-Branch im parameterlosen Pfad (`!args.trim()`) einfügen:

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

## 7. Kategorie B: Vollständiger Non-Interactive-Branch erforderlich

Die Actions dieser fünf Befehle rendern im Interactive-Modus React-Komponenten über `context.ui.addItem()` oder rufen `context.ui.clear()` auf und geben `void` zurück. Im Non-Interactive-Modus sind diese Aufrufe No-Ops, was dazu führt, dass `handleSlashCommand` das fehlende Return-Value als `"Command executed successfully."` interpretiert, ohne tatsächlichen Inhalt auszugeben.

**Implementierungsprinzip**: Prüfung von `executionMode` **am Anfang** der Action. Bei Non-Interactive **Early Return** mit einem `message`, das den tatsächlichen Inhalt enthält. Der Code des Interactive-Pfads bleibt vollständig unberührt.

### 7.1 `/about` (altName: `status`)

**Datenquelle**: `getExtendedSystemInfo(context)` gibt `ExtendedSystemInfo` zurück, enthält: `cliVersion`, `osPlatform`, `osArch`, `osRelease`, `nodeVersion`, `modelVersion`, `selectedAuthType`, `ideClient`, `sessionId`, `memoryUsage`, `baseUrl`, `apiKeyEnvKey`, `gitCommit`, `fastModel`. Alle Felder sind im Non-Interactive-Modus verfügbar (`context.services.config` und Settings sind bereits injiziert).

**Änderung**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Modus-Branch nach dem `getExtendedSystemInfo`-Aufruf, vor dem Interactive-Pfad einfügen:

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

  // interactive 路径：原有 addItem 逻辑不变
  const aboutItem: Omit<HistoryItemAbout, 'id'> = { type: MessageType.ABOUT, systemInfo };
  context.ui.addItem(aboutItem, Date.now());
},
```

### 7.2 `/stats` (und Subcommands `model`, `tools`)

**Datenquelle**: `context.session.stats` (`SessionStatsState`) enthält `sessionStartTime`, `metrics` (`SessionMetrics`: `models`, `tools`, `files`), `promptCount`. Im Non-Interactive-Modus ist `sessionStartTime` der Zeitpunkt des aktuellen Aufrufs, `metrics` stammen von `uiTelemetryService.getMetrics()` (kumulierte Werte dieses Aufrufs, typischerweise null), `promptCount` ist 1.

**Änderung**:

1. `supportedModes` des Parent-Befehls `stats` und der Subcommands `model`, `tools` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Modus-Branch in der Action des Parent-Befehls und jedes Subcommands einfügen, um textbasierte Statistiken vorab zurückzugeben:

```typescript
// /stats 主命令
action: (context) => {
  if (context.executionMode !== 'interactive') {
    const now = new Date();
    const { sessionStartTime, promptCount, metrics } = context.session.stats;
    if (!sessionStartTime) {
      return { type: 'message', messageType: 'error', content: 'Session start time unavailable.' };
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    // 汇总所有 model 的 token 数
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

  // interactive 路径：原有 addItem 逻辑不变
  const statsItem: HistoryItemStats = { type: MessageType.STATS, duration: formatDuration(wallDuration) };
  context.ui.addItem(statsItem, Date.now());
},
```

Die Subcommands `model` und `tools` fügen ebenfalls jeweils einen Modus-Branch ein und geben textbasierte Statistiken der entsprechenden Dimension zurück (Model-Dimension listet Token-Verbrauch pro Model-Name auf; Tools-Dimension listet Aufrufzahlen pro Tool auf).

**Hinweis**: Im Non-Interactive-Single-Call sind die Metrics typischerweise null (neue Session), die Struktur bleibt jedoch intakt und beeinträchtigt das Format nicht. In ACP-Sessions können kumulierte Werte vorliegen, die eine tatsächliche Aussagekraft besitzen.

### 7.3 `/insight`

**Aktueller Status**: Action gibt `void` zurück, zeigt Progress und Ergebnisse via `addItem` an und ruft abschließend `open(outputPath)` auf, um den Browser zu öffnen. Die Kernlogik ist `insightGenerator.generateStaticInsight()` zur Generierung einer HTML-Datei.

**Änderung**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Dreifache Verzweigung nach `executionMode`:
   - `non_interactive`: Synchron generieren, Progress-Callbacks ignorieren, Browser nicht öffnen, direkt `message` (Dateipfad) zurückgeben
   - `acp`: Asynchron starten, Progress (`encodeInsightProgressMessage`) und Fertigstellung (`encodeInsightReadyMessage`) via `stream_messages` an die IDE pushen
   - `interactive`: Bestehende `addItem` + `setPendingItem` + `open()`-Logik unverändert

```typescript
// non_interactive 路径
if (context.executionMode === 'non_interactive') {
  const outputPath = await insightGenerator.generateStaticInsight(
    projectsDir,
    () => {}, // no-op progress
  );
  return {
    type: 'message',
    messageType: 'info',
    content: t('Insight report generated at: {{path}}', { path: outputPath }),
  };
}

// acp 路径：stream_messages
if (context.executionMode === 'acp') {
  // ... 构造 streamMessages async generator，yield encodeInsightProgressMessage / encodeInsightReadyMessage ...
  return { type: 'stream_messages', messages: streamMessages() };
}

// interactive 路径：原有实现不变
```

**Designbegründung**: Der `non_interactive`-Modus (CLI-Pipeline) unterstützt kein `stream_messages` und kann nur eine einzelne `message` zurückgeben. Der ACP-Modus (IDE-Plugin) kann `stream_messages` konsumieren und Progress in Echtzeit anzeigen, daher wird der Streaming-Pfad hierfür beibehalten.

**ACP-Nachrichtenformat**: `encodeInsightProgressMessage(stage, progress, detail?)` erzeugt eine von der IDE parsebare Progressbar-Nachricht. `encodeInsightReadyMessage(outputPath)` benachrichtigt die IDE, dass die Datei bereit ist. Die IDE entscheidet über die Darstellung des Links.

### 7.4 `/docs`

**Aktueller Status**: Action gibt `void` zurück, zeigt eine Nachricht via `addItem` an und ruft `open(docsUrl)` auf, um den Browser zu öffnen. Es existiert ein `SANDBOX`-Environment-Variable-Branch (in der Sandbox nur `addItem`, kein Browser-Öffnen).

**Änderung**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Rückgabetyp der Action auf `Promise<void | MessageActionReturn>` ändern.
3. Non-Interactive-Branch am Anfang der Action einfügen:

```typescript
action: async (context) => {
  const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
  const docsUrl = `https://qwenlm.github.io/qwen-code-docs/${langPath}`;

  if (context.executionMode !== 'interactive') {
    // 非交互/ACP：直接返回 URL，不打开浏览器，不调用 addItem
    return {
      type: 'message',
      messageType: 'info',
      content: `Qwen Code documentation: ${docsUrl}`,
    };
  }

  // interactive 路径：原有 SANDBOX 判断 + addItem + open() 不变
  if (process.env['SANDBOX'] && ...) {
    context.ui.addItem(...);
  } else {
    context.ui.addItem(...);
    await open(docsUrl);
  }
},
```

### 7.5 `/clear` (altNames: `reset`, `new`)

**Aktueller Status**: Action führt folgende Schritte aus und gibt `void` zurück:

1. `config.getHookSystem()?.fireSessionEndEvent()` — Trigger Hook (Side-Effect)
2. `config.startNewSession()` — Starte neue Session-ID (Side-Effect)
3. `uiTelemetryService.reset()` — Setze Telemetry-Counter zurück (Side-Effect)
4. `skillTool.clearLoadedSkills()` — Lösche Skill-Cache (Side-Effect)
5. `context.ui.clear()` — Leere Terminal-UI (**UI-Side-Effect, im Non-Interactive-Modus No-Op**)
6. `geminiClient.resetChat()` — Setze Chat-History zurück (Side-Effect)
7. `config.getHookSystem()?.fireSessionStartEvent()` — Trigger Hook (Side-Effect)

**Non-Interactive/ACP-Semantikanalyse**:

- `ui.clear()` ist im Non-Interactive-Modus bereits ein No-Op und benötigt keine Behandlung
- `geminiClient.resetChat()`: In ACP-Sessions ein sinnvoller Side-Effect (Leeren der Chat-History), sollte beibehalten werden. Im Non-Interactive-Single-Call ist jeder Aufruf eine neue Session; `resetChat` ist semantisch redundant, aber harmlos
- `config.startNewSession()`: In ACP sinnvoll (Start einer neuen Session-ID). Im Non-Interactive-Single-Call ebenfalls redundant, aber harmlos
- `fireSessionEndEvent` / `fireSessionStartEvent`: In ACP sinnvoll (Trigger Hooks)

**Entscheidung**: Der Non-Interactive/ACP-Pfad behält alle sinnvollen Side-Effects bei (`resetChat`, `startNewSession`, Hook-Events). Nur `ui.clear()` wird übersprungen (bereits No-Op) und ein Context-Boundary-Marker-Message zurückgegeben.

**Änderung**:

1. `supportedModes` auf `['interactive', 'non_interactive', 'acp']` ändern.
2. Rückgabetyp der Action auf `Promise<void | MessageActionReturn>` ändern.
3. In der Action nach dem `context.ui.clear()`-Aufruf (oder als Ersatz) Modus-Branch einfügen:

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

    // ui.clear() 在非交互下已是 no-op，但依然调用（不需要条件分支）
    context.ui.clear();

    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.resetChat();
    }

    config.getHookSystem()?.fireSessionStartEvent(...).catch(...);
  } else {
    context.ui.clear();
  }

  // 根据模式决定返回值
  if (context.executionMode !== 'interactive') {
    return {
      type: 'message',
      messageType: 'info',
      content: 'Context cleared. Previous messages are no longer in context.',
    };
  }
  // interactive 路径：void（不返回，React UI 由 ui.clear() 驱动更新）
},
```

**ACP-Semantik**: Nach Erhalt des Context-Boundary-Markers kann die IDE diesen als Session-Trennzeichen anzeigen (z. B. "Neue Sitzung gestartet") und den lokalen Chat-History-Cache leeren.

---

## 8. Änderungen an `handleCommandResult`

**Fazit: Keine Änderungen erforderlich.**

Nach den Änderungen aller Befehle in Phase 2 sind die Rückgabetypen im Non-Interactive/ACP-Pfad stets `message` oder `submit_prompt`, die bereits im `switch` von `handleCommandResult` korrekt verarbeitet werden.

---

## 9. Änderungen an `createNonInteractiveUI()`

**Fazit: Keine Änderungen erforderlich.**

Die aktuelle No-Op-Implementierung ist ausreichend. Die No-Ops `addItem`, `clear`, `setPendingItem` etc. werden im Non-Interactive-Pfad der Kategorie-B-Befehle nicht aufgerufen (wegen Early Return). Der Interactive-Pfad bleibt unberührt.

---

## 10. Phase 2.2: Freischaltung des Modell-Aufrufs für Prompt-Befehle

In Phase 1 wurde `CommandService.getModelInvocableCommands()` bereits implementiert. `BundledSkillLoader`, `FileCommandLoader` (User/Project-Befehle) und `McpPromptLoader` setzen `modelInvocable: true`.

Die Aufgabe von Phase 2.2 besteht darin, `SkillTool` so anzupassen, dass es nicht nur `SkillManager.listSkills()`, sondern auch `CommandService.getModelInvocableCommands()` konsumiert, um einen einheitlichen Einstiegspunkt für modellaufrufbare Befehle zu schaffen.

**Betroffene Dateien**: `packages/core/src/tools/SkillTool.ts` (oder entsprechender Pfad)

**Konkrete Änderungen**:

1. `SkillTool` erhält bei der Initialisierung `CommandService` (oder das Ergebnis von `getModelInvocableCommands()`) als Dependency Injection
2. Beim Aufbau der Tool-Description werden die Ergebnisse von `listSkills()` und `getModelInvocableCommands()` zusammengeführt
3. Sicherstellung, dass Built-in-Commands (`modelInvocable: false`) nicht in der Tool-Description erscheinen

> **Hinweis**: Die konkrete Implementierung von `SkillTool` hängt von der internen Architektur von `packages/core` ab. Dieses Dokument beschreibt nur die Interface-Änderungen. Implementierungsdetails müssen anhand der bestehenden Struktur des Core-Pakets bestimmt werden.

---

## 11. Phase 2.3: Erkennung von Mid-Input-Slash-Befehlen (Basisversion)

Erkennung von Slash-Tokens in der Nähe des Cursors innerhalb der `InputPrompt`-Komponente (nicht nur am Zeilenanfang), um das Vervollständigungsmenü zu triggern.

**Erkennungsregeln**:

- Wenn vor dem Cursor ein Token existiert, das mit `/` beginnt und keine Leerzeichen enthält, wird die Befehlsvervollständigung getriggert
- Die Vervollständigungskandidaten stammen aus der Liste sichtbarer Befehle von `getCommandsForMode('interactive')`
- Das Vervollständigungsmenü zeigt Befehlsname + Description an (ohne `argumentHint` etc., Ergänzung in Phase 3)

> Diese Funktion ist eine UI-Änderung und stellt eine unabhängige Teilaufgabe von Phase 2.3 dar. Sie hat keine Auswirkungen auf die Implementierung von Phase 2.1/2.2.

---

## 12. Übersicht der Dateiänderungen

### 12.1 Änderungen an Befehlsdateien (Phase 2.1)

| Datei                     | Änderungstyp | Konkreter Inhalt                                                                                                                             |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `exportCommand.ts`       | Kategorie A     | Parent + 4 Subcommands: `supportedModes` → alle Modi                                                                                    |
| `planCommand.ts`         | Nur Interactive   | Designentscheidung: `supportedModes: ['interactive']` beibehalten, keine Änderung                                                                             |
| `statuslineCommand.ts`   | Nur Interactive   | Designentscheidung: `supportedModes: ['interactive']` beibehalten, keine Änderung                                                                             |
| `languageCommand.ts`     | Kategorie A+    | Parent + `ui`/`output` Subcommands + dynamische Language-Subcommands: `supportedModes` → alle Modi                                                   |
| `copyCommand.ts`         | Nur Interactive   | Designentscheidung: `supportedModes: ['interactive']` beibehalten, keine Änderung                                                                             |
| `restoreCommand.ts`      | Nur Interactive   | Designentscheidung: `supportedModes: ['interactive']` beibehalten, keine Änderung                                                                             |
| `modelCommand.ts`        | Kategorie A'    | `supportedModes` → alle Modi + Non-Interactive-Branch für parameterlose/parameterlose Fast-Model-Pfade                                                               |
| `approvalModeCommand.ts` | Kategorie A'    | `supportedModes` → alle Modi + Non-Interactive-Branch für parameterlosen Pfad                                                                              |
| `aboutCommand.ts`        | Kategorie B     | `supportedModes` → alle Modi + Non-Interactive-Pfad gibt `message` zurück (Version/Modell/Umgebungs-Zusammenfassung)                                                        |
| `statsCommand.ts`        | Kategorie B     | `supportedModes` → alle Modi + Non-Interactive-Pfad gibt `message` zurück (Stats-Text); Subcommands synchron behandelt                                                |
| `insightCommand.ts`      | Kategorie B     | `supportedModes` → alle Modi + `non_interactive`-Pfad generiert synchron und gibt `message` (Dateipfad) zurück; `acp`-Pfad gibt `stream_messages` mit Progress-Push zurück |
| `docsCommand.ts`         | Kategorie B     | `supportedModes` → alle Modi + Non-Interactive-Pfad gibt `message` (Dokument-URL) zurück, Browser wird nicht geöffnet                                                    |
| `clearCommand.ts`        | Kategorie B     | `supportedModes` → alle Modi + Action gibt am Ende je nach Modus `message` oder `void` zurück                                                           |

### 12.2 Änderungen an anderen Dateien

| Datei                                                | Änderungsinhalt                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts`              | Phase 2.2: Integration von `getModelInvocableCommands()` (detailliertes Design separat) |
| `packages/cli/src/ui/InputPrompt.tsx` (oder äquivalente Komponente) | Phase 2.3: Mid-Input-Slash-Erkennungslogik                               |

### 12.3 Unveränderte Dateien

- `packages/cli/src/nonInteractiveCliCommands.ts` (`handleCommandResult`, `handleSlashCommand` benötigen keine Änderung)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (Stub-UI benötigt keine Änderung)
- `packages/cli/src/services/commandUtils.ts` (`filterCommandsForMode`, `getEffectiveSupportedModes` benötigen keine Änderung)
- `packages/cli/src/services/CommandService.ts` (`getCommandsForMode`, `getModelInvocableCommands` bereits in Phase 1 implementiert)

---

## 13. Teststrategie

### 13.1 Unit-Tests für Befehle

Für jeden geänderten Befehl werden im selben Verzeichnis Testdateien (`*.test.ts`) hinzugefügt oder aktualisiert, um folgende Cases abzudecken:

**Kategorie A/A+ Befehle** (`export`, `language`):

- `supportedModes` enthält korrekt `non_interactive` und `acp`
- Unter `executionMode: 'non_interactive'` gibt die Action `MessageActionReturn` oder `SubmitPromptActionReturn` zurück, ruft `ui.addItem` oder `ui.clear` nicht auf
- Interactive-Pfad-Verhalten bleibt exakt wie vor dem Refactoring (Snapshot-Tests)

**Nur Interactive Befehle** (`plan`, `statusline`, `copy`, `restore`):

- `supportedModes` ist `['interactive']` (Designentscheidung)
- Verifikation, dass bei Ausführung im Non-Interactive-Modus korrekt `unsupported` zurückgegeben wird

**Kategorie A' Befehle** (`model`, `approval-mode`):

- Ohne Parameter + `executionMode: 'non_interactive'` → gibt aktuellen Status als `message` zurück, kein `dialog`
- Mit Parameter + `executionMode: 'non_interactive'` → bestehende `message`-Logik funktioniert normal
- Interactive-Pfad: Ohne Parameter → `dialog`, mit Parameter → `message` (unverändert)

**Kategorie B Befehle** (`about`, `stats`, `insight`, `docs`, `clear`):

- Unter `executionMode: 'non_interactive'` gibt die Action `MessageActionReturn` zurück, ruft keine `ui.*`-Methoden auf
- Der zurückgegebene `content`-String enthält die erwarteten Schlüsselfelder (Version, Modellname, URL etc.)
- Interactive-Pfad: `ui.addItem` wird aufgerufen, `action` gibt `void` zurück (unverändert)

**Spezialfall `clear`**:

- Unter `executionMode: 'non_interactive'` wird `geminiClient.resetChat()` weiterhin aufgerufen (Side-Effect beibehalten)
- Gibt Context-Boundary-`message` zurück, Inhalt: `'Context cleared. Previous messages are no longer in context.'`

### 13.2 Integrationstests (`handleSlashCommand`)

In `nonInteractiveCli.test.ts` oder einer neuen Integrationstest-Datei:

- `handleSlashCommand('/about', ...)` gibt im Non-Interactive-Modus `{ type: 'message', content: enthält Version }` zurück
- `handleSlashCommand('/stats', ...)` gibt im Non-Interactive-Modus `{ type: 'message', content: enthält 'Session duration' }` zurück
- `handleSlashCommand('/docs', ...)` gibt im Non-Interactive-Modus `{ type: 'message', content: enthält 'qwenlm.github.io' }` zurück
- `handleSlashCommand('/clear', ...)` gibt im Non-Interactive-Modus `{ type: 'message', content: 'Context cleared.' }` zurück
- `handleSlashCommand('/plan', ...)` gibt im Non-Interactive-Modus `unsupported` zurück (Nur Interactive Befehl)
- Bestehende Non-Interactive-Befehle (`btw`, `bug` etc.) zeigen keine Regression

### 13.3 `commandUtils`-Tests

Neu in `commandUtils.test.ts` (oder bestehende Tests erweitern):

- Erweiterte Befehle (`export`, `language` etc.) passieren erfolgreich die Filterung durch `filterCommandsForMode(commands, 'non_interactive')` und `filterCommandsForMode(commands, 'acp')`
- Nur Interactive Befehle (`plan`, `statusline`, `copy`, `restore`) werden unter `filterCommandsForMode(commands, 'non_interactive')` korrekt herausgefiltert

---

## 14. Analyse der Verhaltensauswirkungen

| Szenario                                         | Verhalten vor Phase 2                                            | Verhalten nach Phase 2                     | Art der Änderung               |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------- | ------------------ |
| Ausführung von `/export md` im Non-Interactive-Modus          | ❌ unsupported (gefiltert)                                  | ✅ Gibt Dateipfad-Message zurück            | Fähigkeitserweiterung           |
| Ausführung von `/plan <task>` im Non-Interactive-Modus        | ❌ unsupported                                            | ❌ unsupported (Designentscheidung: Nur Interactive) | Unverändert               |
| Ausführung von `/statusline` im Non-Interactive-Modus         | ❌ unsupported                                            | ❌ unsupported (Designentscheidung: Nur Interactive) | Unverändert               |
| Ausführung von `/language ui zh-CN` im Non-Interactive-Modus  | ❌ unsupported                                            | ✅ Setzt Sprache, gibt Bestätigungs-Message zurück      | Fähigkeitserweiterung           |
| Ausführung von `/copy` im Non-Interactive-Modus               | ❌ unsupported                                            | ❌ unsupported (Designentscheidung: Nur Interactive) | Unverändert               |
| Ausführung von `/restore` (ohne Parameter) im Non-Interactive-Modus  | ❌ unsupported                                            | ❌ unsupported (Designentscheidung: Nur Interactive) | Unverändert               |
| Ausführung von `/restore <id>` im Non-Interactive-Modus       | ❌ unsupported                                            | ❌ unsupported (Designentscheidung: Nur Interactive) | Unverändert               |
| Ausführung von `/model` im Non-Interactive-Modus              | ❌ unsupported (dialog)                                  | ✅ Gibt aktuellen Modellnamen zurück                | Fähigkeitserweiterung           |
| Ausführung von `/model <id>` im Non-Interactive-Modus         | ❌ unsupported                                            | 🔄 Phase 2 optional: Switch-Logik implementieren      | Fähigkeitserweiterung (optional)   |
| Ausführung von `/approval-mode` im Non-Interactive-Modus      | ❌ unsupported (dialog)                                  | ✅ Gibt aktuellen Approval-Modus zurück                | Fähigkeitserweiterung           |
| Ausführung von `/approval-mode yolo` im Non-Interactive-Modus | ❌ unsupported                                            | ✅ Setzt Modus, gibt Bestätigung zurück              | Fähigkeitserweiterung           |
| Ausführung von `/about` im Non-Interactive-Modus              | ❌ Gibt "Command executed successfully." zurück (`addItem` No-Op) | ✅ Gibt Version/Modell/Umgebungs-Zusammenfassung zurück          | Bugfix + Fähigkeitserweiterung |
| Ausführung von `/stats` im Non-Interactive-Modus              | ❌ Gibt "Command executed successfully." zurück                  | ✅ Gibt Session-Statistik-Text zurück           | Bugfix + Fähigkeitserweiterung |
| Ausführung von `/insight` im Non-Interactive-Modus            | ❌ Gibt "Command executed successfully." zurück (generiert, aber keine Ausgabe)  | ✅ Generiert und gibt Dateipfad zurück              | Bugfix + Fähigkeitserweiterung |
| Ausführung von `/docs` im Non-Interactive-Modus               | ❌ Gibt "Command executed successfully." zurück                  | ✅ Gibt Dokument-URL zurück                    | Bugfix + Fähigkeitserweiterung |
| Ausführung von `/clear` im Non-Interactive-Modus              | ❌ Gibt "Command executed successfully." zurück                  | ✅ Gibt Context-Boundary-Message zurück          | Bugfix + Fähigkeitserweiterung |
| Ausführung beliebiger obiger Befehle im Interactive-Modus               | ✅ Bestehendes Verhalten                                               | ✅ Bestehendes Verhalten (keine Regression)              | Unverändert               |

---

## 15. Implementierungsreihenfolge

Es wird empfohlen, die Implementierung in der folgenden Reihenfolge durchzuführen. Jeder Batch kann unabhängig committet und reviewed werden:

**Batch 1** (~30 Min.): Kategorie A – Nur `supportedModes` ändern

Änderung von `exportCommand.ts` (und Subcommands), Verifikation der Tests.

**Batch 2** (~45 Min.): Kategorie A+ – Minimale Branches

Änderung von `languageCommand.ts`, Hinzufügen von Non-Interactive-Branches für Side-Effect-Pfade, Aktualisierung entsprechender Tests. (`copyCommand.ts` und `restoreCommand.ts` bleiben nach Diskussion auf Nur Interactive.)

**Batch 3** (~45 Min.): Kategorie A' – Dialog-Pfade

Änderung von `modelCommand.ts`, `approvalModeCommand.ts`, Hinzufügen von Non-Interactive-Branches für parameterlose Pfade, Aktualisierung entsprechender Tests.

**Batch 4** (~1,5 Std.): Kategorie B – Vollständige Branches

Änderung von `aboutCommand.ts`, `statsCommand.ts` (inkl. Subcommands), `docsCommand.ts`.

**Batch 5** (~1 Std.): Kategorie B Spezial – `insightCommand.ts`, `clearCommand.ts`

Diese Befehle haben umfangreichere Side-Effects. Separater Commit, Aktualisierung entsprechender Tests und Integrationstests.

**Batch 6** (~2 Std.): Phase 2.2 – Freischaltung des Modell-Aufrufs für Prompt-Befehle

Änderung von `SkillTool`, Integration von `getModelInvocableCommands()`, Aktualisierung der SkillTool-Tests.

**Batch 7** (~2 Std.): Phase 2.3 – Mid-Input-Slash-Erkennung

Änderung der `InputPrompt`-Komponente, Hinzufügen der Vervollständigungs-Trigger-Logik und UI-Tests.

**Batch 8** (~30 Min.): Vollständige Tests + Type-Check

Ausführung von `npm run typecheck`, `cd packages/cli && npx vitest run`, Behebung verbleibender Probleme.

---

## 16. Abnahme-Checkliste

**Phase 2.1 Befehlserweiterung**

- [ ] Kategorie A: `/export` (und Subcommands), `/plan`, `/statusline` funktionieren im Non-Interactive- und ACP-Modus korrekt und geben sinnvolle Ausgaben zurück
- [ ] Kategorie A+: `/language` (und Subcommands) funktioniert im Non-Interactive-Modus korrekt, setzt persistente Einstellungen
- [ ] Kategorie A+: `/copy` gibt im Non-Interactive/ACP-Modus den letzten AI-Output-Text zurück (keine Zwischenablagen-Operation)
- [ ] Kategorie A+: `/restore` gibt im Non-Interactive-Modus ohne Parameter eine Checkpoint-Liste zurück; mit Parameter wird der Status wiederhergestellt und ein Bestätigungs-Message zurückgegeben (kein `type: 'tool'`)
- [ ] Kategorie A': `/model` gibt im Non-Interactive/ACP-Modus ohne Parameter den aktuellen Modellnamen zurück (kein Dialog-Trigger); `/model --fast <id>` setzt korrekt
- [ ] Kategorie A': `/approval-mode` gibt im Non-Interactive/ACP-Modus ohne Parameter den aktuellen Modus zurück (kein Dialog-Trigger); mit Parameter setzt korrekt
- [ ] Kategorie B: `/about` gibt im Non-Interactive/ACP-Modus eine Plain-Text-Zusammenfassung mit Version und Modellnamen zurück
- [ ] Kategorie B: `/stats` (inkl. Subcommands) gibt im Non-Interactive/ACP-Modus Plain-Text-Statistiken zurück
- [ ] Kategorie B: `/insight` generiert im Non-Interactive/ACP-Modus die Insight-Datei und gibt den Dateipfad zurück (Browser wird nicht geöffnet)
- [ ] Kategorie B: `/docs` gibt im Non-Interactive/ACP-Modus die Dokument-URL zurück (Browser wird nicht geöffnet)
- [ ] Kategorie B: `/clear` gibt im Non-Interactive/ACP-Modus ein Context-Boundary-Marker-Message zurück, `geminiClient.resetChat()` wird korrekt ausgeführt
- [ ] Alle 13 Befehle verhalten sich im Interactive-Modus exakt wie vor dem Refactoring (keine Regression)
- [ ] TypeScript-Kompilierung fehlerfrei (`npm run typecheck`)
- [ ] `npm run lint` ohne neue Fehler
- [ ] Alle bestehenden Tests erfolgreich (`cd packages/cli && npx vitest run`)

**Phase 2.2 Modell-Aufruf**

- [ ] Das Modell kann im Dialog via `SkillTool` Bundled-Skills, File-Commands (User/Project) und MCP-Prompts aufrufen
- [ ] Das Modell kann keine Built-in-Commands aufrufen
- [ ] Die Tool-Description von `SkillTool` enthält Namen und Description aller Befehle mit `modelInvocable: true`

**Phase 2.3 Mid-Input-Slash**

- [ ] Eingabe von `/` im Haupttext der Input-Box triggert das Befehlsvervollständigungsmenü (nicht nur am Zeilenanfang)
- [ ] Das Vervollständigungsmenü zeigt Befehlsname + Description an
- [ ] Nach Auswahl wird der Befehl korrekt in die Input-Box eingefügt
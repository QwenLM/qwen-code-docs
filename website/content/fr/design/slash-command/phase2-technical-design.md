# Document de conception technique Phase 2 : Extension des fonctionnalités

## 1. Objectifs de conception et contraintes

### 1.1 Objectifs

- Étendre les `supportedModes` de 13 commandes intégrées pour inclure `non_interactive` et/ou `acp`
- Garantir que chaque commande étendue retourne un contenu texte adapté à la consommation par l'IDE dans les chemins ACP/non-interactive
- Activer le canal d'appel de modèle pour les commandes prompt (`SkillTool` consommant `getModelInvocableCommands()`)
- Implémenter la détection de base des commandes slash en milieu de saisie

### 1.2 Contraintes strictes

- **Zéro régression sur le chemin interactif** : le comportement interactif existant de toutes les commandes étendues reste strictement inchangé. Les branches par mode sont ajoutées uniquement à l'intérieur de `action`, sans toucher au code du chemin interactif.
- **Stratégie d'implémentation : branchement par mode, et non double enregistrement** : les 13 commandes utilisent toutes une vérification `executionMode` à l'intérieur de `action`. Le mode de double enregistrement décrit dans la Phase 1 §10.2 n'est pas utilisé (il n'est nécessaire que lorsque la logique interactive et non-interactive diffère radicalement, ce qui n'est pas le cas ici).
- **Format des messages ACP** : le texte retourné par le chemin ACP ne contient pas de styles ANSI et doit être en Markdown ou en texte brut, optimisé pour la consommation par les plugins IDE.
- **Ignorer les effets secondaires liés à l'environnement** : les opérations dépendant d'un environnement graphique comme l'ouverture d'un navigateur (`open()`) ou la manipulation du presse-papiers (`copyToClipboard()`) doivent être ignorées dans les chemins non-interactive/ACP.

---

## 2. État de base après la Phase 1

Points clés de l'architecture à l'issue de la Phase 1 (la Phase 2 s'appuie directement dessus) :

- Le champ `commandType` a été supprimé de l'interface `SlashCommand` ; toutes les commandes utilisent désormais `supportedModes` de manière explicite
- `getEffectiveSupportedModes()` utilise une inférence à deux niveaux : `supportedModes` explicite → fallback sur `CommandKind`
- `CommandService.getCommandsForMode(mode)` remplace l'ancienne liste blanche `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- `btw`, `bug`, `compress`, `context`, `init`, `summary` ont déjà été étendus à tous les modes en Phase 1 et **ne font pas partie de la liste de cette phase**
- Toutes les méthodes dans `createNonInteractiveUI()` sont des no-op : `addItem`, `clear`, `setDebugMessage`, `setPendingItem`, `reloadCommands` ignorent silencieusement les appels

---

## 3. Vue d'ensemble du périmètre des modifications

Cette phase couvre 13 commandes, classées en quatre catégories selon leur complexité d'implémentation :

| Catégorie | Commandes | Points de modification |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Catégorie A** | `export` | Modification de `supportedModes` uniquement ; tous les chemins `action` retournent déjà un type valide |
| **Interactif uniquement** | `plan`, `statusline` | Décision de conception : ces commandes sont sémantiquement couplées à l'interface interactive ; `supportedModes: ['interactive']` est conservé |
| **Catégorie A+** | `language` | Modification de `supportedModes` + gestion légère de branches non-interactive |
| **Interactif uniquement** | `copy`, `restore` | Décision de conception : le presse-papiers et la restauration d'instantanés sont intrinsèquement interactifs ; `supportedModes: ['interactive']` est conservé |
| **Catégorie A'** | `model`, `approval-mode` | Les chemins avec arguments retournent déjà un `message` ; les chemins sans argument nécessitent une nouvelle branche non-interactive (déclenchent actuellement un `dialog`) |
| **Catégorie B** | `about`, `stats`, `insight`, `docs`, `clear` | Aucun chemin `action` ne retourne de valeur ou n'appelle `addItem`/`clear` ; nécessite une branche non-interactive complète |

---

## 4. Catégorie A : Modification de `supportedModes` uniquement

Tous les chemins `action` de ces trois commandes retournent déjà `message` ou `submit_prompt`, sans aucune dépendance UI. `handleCommandResult` peut les traiter directement.

### 4.1 `/export` (et sous-commandes)

**État actuel** : `supportedModes: ['interactive']`, tous les chemins `action` des sous-commandes retournent `MessageActionReturn`.

**Modification** : Passer les `supportedModes` de la commande parente et des quatre sous-commandes (`md`, `html`, `json`, `jsonl`) à `['interactive', 'non_interactive', 'acp']`.

**Contenu du message ACP** : le contenu retourné par `action` inclut déjà le chemin complet du fichier (ex. `Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`), ce qui est adapté à la consommation par l'IDE. Aucun changement de texte n'est nécessaire.

> **Remarque** : la commande parente `/export` n'a pas de `action`, uniquement des sous-commandes. Après avoir étendu `supportedModes` à tous les modes, `parseSlashCommand` peut router vers les sous-commandes. Si l'utilisateur saisit uniquement `/export` sans sous-commande, `commandToExecute.action` est `undefined`, `handleSlashCommand` retourne `no_command` et l'appelant affiche l'invite des sous-commandes disponibles. C'est le comportement attendu.

### 4.2 `/plan`

**État actuel** : `supportedModes: ['interactive']`, tous les chemins `action` retournent `MessageActionReturn` ou `SubmitPromptActionReturn`.

**Décision de conception** : `/plan` est une commande guidant l'utilisateur dans une planification interactive multi-tours, sémantiquement couplée à l'interface interactive. Il a été décidé de conserver `supportedModes: ['interactive']` et de ne pas l'étendre aux modes non-interactive/acp.

### 4.3 `/statusline`

**État actuel** : `supportedModes: ['interactive']`, `action` retourne toujours `SubmitPromptActionReturn` (soumet le prompt d'appel de subagent au modèle).

**Décision de conception** : `/statusline` déclenche un subagent pour résumer l'état actuel, sémantiquement couplé à l'interface interactive. Il a été décidé de conserver `supportedModes: ['interactive']` et de ne pas l'étendre aux modes non-interactive/acp.

---

## 5. Catégorie A+ : Gestion légère de branches non-interactive

### 5.1 `/language`

**État actuel** : tous les chemins `action` retournent `MessageActionReturn` (lecture/définition des paramètres de langue).

**Effets secondaires à gérer** : `setUiLanguage()` appelle `context.ui.reloadCommands()`, qui est déjà un no-op dans l'UI non-interactive. Aucun traitement supplémentaire n'est requis.

**Modification** :

- Passer les `supportedModes` de la commande parente et des sous-commandes (`ui`, `output`, ainsi que les sous-commandes générées dynamiquement via `SUPPORTED_LANGUAGES`) à `['interactive', 'non_interactive', 'acp']`.
- `action` ne nécessite pas de branche par mode ; le texte retourné est déjà adapté à la consommation machine.

**Sémantique ACP** : l'exécution de `/language ui zh-CN` en non-interactive (appel unique) modifie le paramètre persistant (écriture dans le fichier settings). Ce changement s'applique aux sessions suivantes et l'i18n est immédiatement active dans la session courante. Cela correspond aux attentes de l'utilisateur.

### 5.2 `/copy`

**État actuel** : `action` appelle `copyToClipboard()`, ce qui peut lever une exception ou échouer silencieusement dans un environnement ACP/headless (presse-papiers indisponible).

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Ajouter une branche par mode dans `action` :

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

**Sémantique ACP** : l'IDE reçoit le texte brut de la dernière sortie du modèle et peut décider de l'écrire dans le presse-papiers ou de l'afficher à l'utilisateur.

### 5.3 `/restore`

**État actuel** : `supportedModes: ['interactive']`.

**Décision de conception** : la restauration d'instantanés entraîne la réexécution d'appels d'outils, sémantiquement couplée à l'interface interactive. Il a été décidé de conserver `supportedModes: ['interactive']` et de ne pas l'étendre aux modes non-interactive/acp.

**Sémantique ACP** : la restauration de l'état git du checkpoint et la configuration de l'historique du client gemini sont exécutées comme effets secondaires ; après réception du message de confirmation, l'IDE peut indiquer à l'utilisateur que "l'état a été restauré", et la réexécution des outils est déclenchée ou non selon la logique de l'IDE.

---

## 6. Catégorie A' : Gestion non-interactive des chemins dialog sans argument

### 6.1 `/model`

**État actuel** :

| 输入                             | 当前行为                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `/model`（无参数）               | → `{ type: 'dialog', dialog: 'model' }`（non-interactive 下变 unsupported）      |
| `/model <model-id>`              | 未实现（只有 `--fast` 分支）                                                     |
| `/model --fast`（无 model name） | → `{ type: 'dialog', dialog: 'fast-model' }`（non-interactive 下变 unsupported） |
| `/model --fast <model-id>`       | → `MessageActionReturn` ✅                                                       |

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Insérer une branche non-interactive avant chaque chemin `dialog` dans `action` :

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

**Sémantique ACP** : l'IDE affiche le nom du modèle actuel pour référence ; le changement de modèle s'effectue via un appel avec argument (`/model <model-id>`).

> **Remarque** : `/model <model-id>` (sans `--fast`) n'implémente actuellement pas la logique de définition du modèle pour la session courante, seul `--fast <model-id>` le fait. Si la Phase 2 doit prendre en charge le changement de modèle principal en ACP, la logique `set` de `/model <model-id>` devra être implémentée simultanément. Cette conception réserve ce chemin mais le marque comme optionnel pour la Phase 2, en priorisant le chemin read-only "afficher le modèle actuel".

### 6.2 `/approval-mode`

**État actuel** :

| 输入                       | 当前行为                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `/approval-mode`（无参数） | → `{ type: 'dialog', dialog: 'approval-mode' }`（non-interactive 下变 unsupported） |
| `/approval-mode <mode>`    | → `MessageActionReturn` ✅                                                          |
| `/approval-mode <invalid>` | → `MessageActionReturn`（error）✅                                                  |

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Insérer une branche non-interactive dans le chemin sans argument (`!args.trim()`) :

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

## 7. Catégorie B : Nécessite une branche non-interactive complète

Dans le mode interactif, l'`action` de ces cinq commandes rend des composants React via `context.ui.addItem()` ou appelle `context.ui.clear()`, et retourne `void`. En mode non-interactive, ces appels sont des no-op, ce qui amène `handleSlashCommand` à traiter l'absence de valeur de retour comme `"Command executed successfully."`, sans sortie réelle.

**Principe d'implémentation** : vérifier `executionMode` **en haut** de `action`. En mode non-interactive, **retourner anticipativement** un `message` contenant le contenu réel. Le code du chemin interactif reste strictement inchangé.

### 7.1 `/about` (altName : `status`)

**Source des données** : `getExtendedSystemInfo(context)` retourne `ExtendedSystemInfo`, contenant : `cliVersion`, `osPlatform`, `osArch`, `osRelease`, `nodeVersion`, `modelVersion`, `selectedAuthType`, `ideClient`, `sessionId`, `memoryUsage`, `baseUrl`, `apiKeyEnvKey`, `gitCommit`, `fastModel`. Tous les champs sont accessibles en non-interactive (`context.services.config` et `settings` sont déjà injectés).

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Insérer une branche par mode après l'appel à `getExtendedSystemInfo`, avant le chemin interactif :

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

### 7.2 `/stats` (et sous-commandes `model`, `tools`)

**Source des données** : `context.session.stats` (`SessionStatsState`) contient `sessionStartTime`, `metrics` (`SessionMetrics` : `models`, `tools`, `files`), `promptCount`. En non-interactive, `sessionStartTime` correspond au moment de l'appel, `metrics` provient de `uiTelemetryService.getMetrics()` (valeur cumulée de l'appel courant, généralement zéro), `promptCount` vaut 1.

**Modification** :

1. Passer les `supportedModes` de la commande parente `stats` et des sous-commandes `model`, `tools` à `['interactive', 'non_interactive', 'acp']`.
2. Insérer une branche par mode dans `action` de la commande parente et de chaque sous-commande pour retourner anticipativement les statistiques au format texte :

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

Les sous-commandes `model` et `tools` insèrent également leurs propres branches par mode pour retourner les statistiques textuelles correspondantes (dimension `model` : liste des tokens par nom de modèle ; dimension `tools` : liste des appels par outil).

**Remarque** : lors d'un appel unique non-interactive, les métriques sont généralement à zéro (nouvelle session), mais la structure est complète et n'affecte pas le formatage. Dans une session ACP, les valeurs cumulées peuvent avoir un sens concret.

### 7.3 `/insight`

**État actuel** : `action` retourne `void`, affiche la progression et les résultats via `addItem`, et appelle enfin `open(outputPath)` pour ouvrir le navigateur. La logique principale est `insightGenerator.generateStaticInsight()` qui génère un fichier HTML.

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Diviser en trois branches selon `executionMode` :
   - `non_interactive` : génération synchrone, ignore les callbacks de progression, n'ouvre pas le navigateur, retourne directement un `message` (chemin du fichier)
   - `acp` : lancement asynchrone de la génération, pousse la progression (`encodeInsightProgressMessage`) et la fin (`encodeInsightReadyMessage`) à l'IDE via `stream_messages`
   - `interactive` : logique `addItem` + `setPendingItem` + `open()` existante inchangée

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

**Justification de la conception** : le mode `non_interactive` (pipeline CLI) ne prend pas en charge `stream_messages` et ne peut retourner qu'un seul `message`. Le mode ACP (plugin IDE) peut consommer `stream_messages` et afficher la progression en temps réel, d'où la conservation du chemin streaming pour ce mode.

**Format des messages ACP** : `encodeInsightProgressMessage(stage, progress, detail?)` génère un message de barre de progression analysable par l'IDE ; `encodeInsightReadyMessage(outputPath)` notifie l'IDE que le fichier est prêt, laissant l'IDE décider comment afficher le lien.

### 7.4 `/docs`

**État actuel** : `action` retourne `void`, affiche un message via `addItem` et appelle `open(docsUrl)` pour ouvrir le navigateur. Il existe une branche pour la variable d'environnement `SANDBOX` (en sandbox, seul `addItem` est appelé, pas d'ouverture de navigateur).

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Modifier le type de retour de `action` en `Promise<void | MessageActionReturn>`.
3. Insérer une branche non-interactive au début de `action` :

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

### 7.5 `/clear` (altNames : `reset`, `new`)

**État actuel** : `action` exécute les opérations suivantes et retourne `void` :

1. `config.getHookSystem()?.fireSessionEndEvent()` — déclenche le hook (effet secondaire)
2. `config.startNewSession()` — démarre un nouvel ID de session (effet secondaire)
3. `uiTelemetryService.reset()` — réinitialise les compteurs de télémétrie (effet secondaire)
4. `skillTool.clearLoadedSkills()` — vide le cache des skills (effet secondaire)
5. `context.ui.clear()` — vide l'UI du terminal (**effet secondaire UI, no-op en non-interactive**)
6. `geminiClient.resetChat()` — réinitialise l'historique du chat (effet secondaire)
7. `config.getHookSystem()?.fireSessionStartEvent()` — déclenche le hook (effet secondaire)

**Analyse sémantique non-interactive/ACP** :

- `ui.clear()` est déjà un no-op en non-interactive, aucun traitement requis
- `geminiClient.resetChat()` : effet secondaire significatif dans une session ACP (vide l'historique du chat), doit être conservé ; en appel unique non-interactive, chaque appel est une session entièrement nouvelle, la sémantique `resetChat` est redondante mais inoffensive
- `config.startNewSession()` : significatif en ACP (démarre un nouvel ID de session) ; redondant mais inoffensif en appel unique non-interactive
- `fireSessionEndEvent` / `fireSessionStartEvent` : significatifs en ACP (déclenchent les hooks)

**Décision** : le chemin non-interactive/ACP conserve tous les effets secondaires significatifs (`resetChat`, `startNewSession`, événements hook), ignore uniquement `ui.clear()` (déjà no-op) et retourne un message de délimitation de contexte.

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Modifier le type de retour de `action` en `Promise<void | MessageActionReturn>`.
3. Dans `action`, après l'appel à `context.ui.clear()` (ou en remplacement), brancher selon le mode :

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

**Sémantique ACP** : après réception du marqueur de délimitation de contexte, l'IDE peut l'afficher comme un séparateur de session (ex. invite "Nouvelle session commencée") et vider le cache local de l'historique du chat.

---

## 8. Modifications de `handleCommandResult`

**Conclusion : aucune modification nécessaire.**

Après les modifications de toutes les commandes de la Phase 2, les types de retour pour les chemins non-interactive/ACP sont `message` ou `submit_prompt`, déjà correctement gérés dans le `switch` de `handleCommandResult`.

---

## 9. Modifications de `createNonInteractiveUI()`

**Conclusion : aucune modification nécessaire.**

L'implémentation no-op actuelle est suffisante. Les no-op `addItem`, `clear`, `setPendingItem`, etc., ne seront pas appelés dans les chemins non-interactive des commandes de Catégorie B (car retour anticipé) ; le chemin interactif n'est pas affecté.

---

## 10. Phase 2.2 : Activation de l'appel de modèle pour les commandes prompt

Dans la Phase 1, `CommandService.getModelInvocableCommands()` a déjà été implémenté, et `BundledSkillLoader`, `FileCommandLoader` (commandes utilisateur/projet), `McpPromptLoader` ont défini `modelInvocable: true`.

Le travail de la Phase 2.2 consiste à modifier `SkillTool` pour qu'il consomme à la fois `SkillManager.listSkills()` et `CommandService.getModelInvocableCommands()`, unifiant ainsi le point d'entrée des commandes invocables par le modèle.

**Fichiers modifiés** : `packages/core/src/tools/SkillTool.ts` (ou chemin équivalent)

**Modifications détaillées** :

1. `SkillTool` reçoit `CommandService` (ou le résultat de `getModelInvocableCommands()`) comme injection de dépendance lors de l'initialisation
2. Lors de la construction de la description de l'outil, fusionner les résultats de `listSkills()` et `getModelInvocableCommands()`
3. Garantir que les commandes intégrées (`modelInvocable: false`) n'apparaissent pas dans la description de l'outil

> **Note** : l'implémentation spécifique de `SkillTool` dépend de l'architecture interne de `packages/core`. Ce document ne décrit que les changements d'interface ; les détails d'implémentation doivent être déterminés en fonction de la structure existante du package core.

---

## 11. Phase 2.3 : Détection des commandes slash en milieu de saisie (version de base)

Détecte le token slash près du curseur dans le composant `InputPrompt` (pas uniquement en début de ligne) pour déclencher le menu de complétion.

**Règles de détection** :

- Lorsqu'un token commençant par `/` et ne contenant pas d'espace précède le curseur, déclencher la complétion des commandes
- Les candidats de complétion proviennent de la liste des commandes visibles de `getCommandsForMode('interactive')`
- Le menu de complétion affiche le nom de la commande + description (sans `argumentHint`, etc., ajouté en Phase 3)

> Cette fonctionnalité est une modification au niveau de l'UI, constituant une sous-tâche indépendante de la Phase 2.3, et n'affecte pas l'implémentation des Phases 2.1/2.2.

---

## 12. Vue d'ensemble des modifications de fichiers

### 12.1 Modifications des fichiers de commandes (Phase 2.1)

| Fichier | Type de modification | Contenu spécifique |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `exportCommand.ts` | Catégorie A | Commande parente + 4 sous-commandes : `supportedModes` → tous les modes |
| `planCommand.ts` | Interactif uniquement | Décision de conception : `supportedModes: ['interactive']` conservé, aucune modification |
| `statuslineCommand.ts` | Interactif uniquement | Décision de conception : `supportedModes: ['interactive']` conservé, aucune modification |
| `languageCommand.ts` | Catégorie A+ | Commande parente + sous-commandes `ui`/`output` + sous-commandes dynamiques : `supportedModes` → tous les modes |
| `copyCommand.ts` | Interactif uniquement | Décision de conception : `supportedModes: ['interactive']` conservé, aucune modification |
| `restoreCommand.ts` | Interactif uniquement | Décision de conception : `supportedModes: ['interactive']` conservé, aucune modification |
| `modelCommand.ts` | Catégorie A' | `supportedModes` → tous les modes + nouvelle branche non-interactive pour les chemins sans argument/sans fast model |
| `approvalModeCommand.ts` | Catégorie A' | `supportedModes` → tous les modes + nouvelle branche non-interactive pour le chemin sans argument |
| `aboutCommand.ts` | Catégorie B | `supportedModes` → tous les modes + retour `message` en chemin non-interactive (résumé version/modèle/environnement) |
| `statsCommand.ts` | Catégorie B | `supportedModes` → tous les modes + retour `message` en chemin non-interactive (stats texte) ; sous-commandes traitées simultanément |
| `insightCommand.ts` | Catégorie B | `supportedModes` → tous les modes + chemin `non_interactive` génère de manière synchrone et retourne `message` (chemin fichier) ; chemin `acp` retourne `stream_messages` avec progression |
| `docsCommand.ts` | Catégorie B | `supportedModes` → tous les modes + retour `message` en chemin non-interactive (URL documentation), n'ouvre pas le navigateur |
| `clearCommand.ts` | Catégorie B | `supportedModes` → tous les modes + retour `message` ou `void` à la fin de `action` selon le mode |

### 12.2 Autres modifications de fichiers

| Fichier | Contenu de la modification |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts` | Phase 2.2 : intégration de `getModelInvocableCommands()` (conception détaillée à définir) |
| `packages/cli/src/ui/InputPrompt.tsx` (ou composant équivalent) | Phase 2.3 : logique de détection slash en milieu de saisie |

### 12.3 Fichiers inchangés

- `packages/cli/src/nonInteractiveCliCommands.ts` (`handleCommandResult`, `handleSlashCommand` ne nécessitent aucune modification)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (UI stub ne nécessite aucune modification)
- `packages/cli/src/services/commandUtils.ts` (`filterCommandsForMode`, `getEffectiveSupportedModes` ne nécessitent aucune modification)
- `packages/cli/src/services/CommandService.ts` (`getCommandsForMode`, `getModelInvocableCommands` déjà implémentés en Phase 1)

---

## 13. Stratégie de test

### 13.1 Tests unitaires des commandes

Ajouter ou mettre à jour les fichiers de test (`*.test.ts`) dans le même répertoire pour chaque commande modifiée, couvrant les cas suivants :

**Commandes Catégorie A/A+** (`export`, `language`) :

- `supportedModes` inclut correctement `non_interactive` et `acp`
- Avec `executionMode: 'non_interactive'`, `action` retourne `MessageActionReturn` ou `SubmitPromptActionReturn`, sans appeler `ui.addItem` ou `ui.clear`
- Le comportement du chemin interactif reste strictement identique à avant le refactoring (tests snapshot)

**Commandes interactives uniquement** (`plan`, `statusline`, `copy`, `restore`) :

- `supportedModes` est `['interactive']`, conformément à la décision de conception
- Vérifier que l'exécution en mode non-interactive retourne correctement `unsupported`

**Commandes Catégorie A'** (`model`, `approval-mode`) :

- Sans argument + `executionMode: 'non_interactive'` → retourne un `message` d'état actuel, pas de `dialog`
- Avec argument + `executionMode: 'non_interactive'` → la logique `message` existante s'exécute normalement
- Chemin interactif : sans argument → `dialog`, avec argument → `message` (inchangé)

**Commandes Catégorie B** (`about`, `stats`, `insight`, `docs`, `clear`) :

- Avec `executionMode: 'non_interactive'`, `action` retourne `MessageActionReturn`, sans appeler de méthode `ui.*`
- La chaîne `content` retournée contient les champs clés attendus (version, nom du modèle, URL, etc.)
- Chemin interactif : `ui.addItem` est appelé, `action` retourne `void` (inchangé)

**Cas spécifique pour `clear`** :

- Avec `executionMode: 'non_interactive'`, `geminiClient.resetChat()` est toujours appelé (effet secondaire conservé)
- Retourne un `message` de délimitation de contexte avec le contenu `'Context cleared. Previous messages are no longer in context.'`

### 13.2 Tests d'intégration (`handleSlashCommand`)

Dans `nonInteractiveCli.test.ts` ou un nouveau fichier de test d'intégration :

- `handleSlashCommand('/about', ...)` en mode non-interactive retourne `{ type: 'message', content: contenant la version }`
- `handleSlashCommand('/stats', ...)` en mode non-interactive retourne `{ type: 'message', content: contenant 'Session duration' }`
- `handleSlashCommand('/docs', ...)` en mode non-interactive retourne `{ type: 'message', content: contenant 'qwenlm.github.io' }`
- `handleSlashCommand('/clear', ...)` en mode non-interactive retourne `{ type: 'message', content: 'Context cleared.' }`
- `handleSlashCommand('/plan', ...)` en mode non-interactive retourne `unsupported` (commande interactive uniquement)
- Aucun comportement dégradé pour les commandes non-interactive existantes (`btw`, `bug`, etc.)

### 13.3 Tests `commandUtils`

Ajouter dans `commandUtils.test.ts` (ou continuer à couvrir avec les tests existants) :

- Les commandes étendues (`export`, `language`, etc.) passent correctement les filtres `filterCommandsForMode(commands, 'non_interactive')` et `filterCommandsForMode(commands, 'acp')`
- Les commandes interactives uniquement (`plan`, `statusline`, `copy`, `restore`) sont correctement filtrées par `filterCommandsForMode(commands, 'non_interactive')`

---

## 14. Analyse d'impact comportemental

| Scénario | Comportement avant Phase 2 | Comportement après Phase 2 | Nature |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------- | ------------------ |
| Exécution de `/export md` en non-interactive | ❌ `unsupported` (filtré) | ✅ Retourne un `message` avec le chemin du fichier | Extension de fonctionnalité |
| Exécution de `/plan <task>` en non-interactive | ❌ `unsupported` | ❌ `unsupported` (décision de conception : interactif uniquement) | Inchangé |
| Exécution de `/statusline` en non-interactive | ❌ `unsupported` | ❌ `unsupported` (décision de conception : interactif uniquement) | Inchangé |
| Exécution de `/language ui zh-CN` en non-interactive | ❌ `unsupported` | ✅ Définit la langue, retourne un `message` de confirmation | Extension de fonctionnalité |
| Exécution de `/copy` en non-interactive | ❌ `unsupported` | ❌ `unsupported` (décision de conception : interactif uniquement) | Inchangé |
| Exécution de `/restore` (sans argument) en non-interactive | ❌ `unsupported` | ❌ `unsupported` (décision de conception : interactif uniquement) | Inchangé |
| Exécution de `/restore <id>` en non-interactive | ❌ `unsupported` | ❌ `unsupported` (décision de conception : interactif uniquement) | Inchangé |
| Exécution de `/model` en non-interactive | ❌ `unsupported` (`dialog`) | ✅ Retourne le nom du modèle actuel | Extension de fonctionnalité |
| Exécution de `/model <id>` en non-interactive | ❌ `unsupported` | 🔄 Optionnel Phase 2 : implémenter la logique de basculement | Extension de fonctionnalité (optionnel) |
| Exécution de `/approval-mode` en non-interactive | ❌ `unsupported` (`dialog`) | ✅ Retourne le mode d'approbation actuel | Extension de fonctionnalité |
| Exécution de `/approval-mode yolo` en non-interactive | ❌ `unsupported` | ✅ Définit le mode, retourne une confirmation | Extension de fonctionnalité |
| Exécution de `/about` en non-interactive | ❌ Retourne `"Command executed successfully."` (`addItem` no-op) | ✅ Retourne un résumé version/modèle/environnement | Correction de bug + extension |
| Exécution de `/stats` en non-interactive | ❌ Retourne `"Command executed successfully."` | ✅ Retourne les statistiques de session en texte | Correction de bug + extension |
| Exécution de `/insight` en non-interactive | ❌ Retourne `"Command executed successfully."` (généré mais sans sortie) | ✅ Génère et retourne le chemin du fichier | Correction de bug + extension |
| Exécution de `/docs` en non-interactive | ❌ Retourne `"Command executed successfully."` | ✅ Retourne l'URL de la documentation | Correction de bug + extension |
| Exécution de `/clear` en non-interactive | ❌ Retourne `"Command executed successfully."` | ✅ Retourne un `message` de délimitation de contexte | Correction de bug + extension |
| Exécution de l'une des commandes ci-dessus en interactif | ✅ Comportement existant | ✅ Comportement existant (zéro régression) | Inchangé |

---

## 15. Ordre d'implémentation

Il est recommandé de procéder dans l'ordre suivant, chaque lot pouvant faire l'objet d'un commit et d'une review indépendants :

**Lot 1** (~30 min) : Catégorie A — Modification de `supportedModes` uniquement

Modifier `exportCommand.ts` (et ses sous-commandes), vérifier que les tests passent.

**Lot 2** (~45 min) : Catégorie A+ — Branches légères

Modifier `languageCommand.ts`, ajouter des branches non-interactive pour les chemins à effets secondaires, mettre à jour les tests correspondants. (`copyCommand.ts` et `restoreCommand.ts` restent interactifs uniquement après discussion.)

**Lot 3** (~45 min) : Catégorie A' — Chemins dialog

Modifier `modelCommand.ts`, `approvalModeCommand.ts`, ajouter des branches non-interactive pour les chemins sans argument, mettre à jour les tests correspondants.

**Lot 4** (~1,5 h) : Catégorie B — Branches complètes

Modifier `aboutCommand.ts`, `statsCommand.ts` (avec sous-commandes), `docsCommand.ts`.

**Lot 5** (~1 h) : Catégorie B spéciale — `insightCommand.ts`, `clearCommand.ts`

Ces deux commandes ont de nombreux effets secondaires ; commit séparé, mise à jour des tests et tests d'intégration correspondants.

**Lot 6** (~2 h) : Phase 2.2 — Activation de l'appel de modèle pour les commandes prompt

Modifier `SkillTool`, intégrer `getModelInvocableCommands()`, mettre à jour les tests `SkillTool`.

**Lot 7** (~2 h) : Phase 2.3 — Détection slash en milieu de saisie

Modifier le composant `InputPrompt`, ajouter la logique de déclenchement de la complétion et les tests UI.

**Lot 8** (~30 min) : Tests complets + vérification de type

Exécuter `npm run typecheck`, `cd packages/cli && npx vitest run`, corriger les problèmes restants.

---

## 16. Checklist de validation

**Extension des commandes Phase 2.1**

- [ ] Catégorie A : `/export` (et sous-commandes), `/plan`, `/statusline` s'exécutent correctement en modes non-interactive et acp et retournent une sortie significative
- [ ] Catégorie A+ : `/language` (et sous-commandes) s'exécute correctement en non-interactive, applique la persistance
- [ ] Catégorie A+ : `/copy` retourne le dernier texte de sortie IA en non-interactive/acp (sans manipuler le presse-papiers)
- [ ] Catégorie A+ : `/restore` sans argument retourne la liste des checkpoints en non-interactive ; avec argument, restaure l'état et retourne un `message` de confirmation (ne retourne pas `type: 'tool'`)
- [ ] Catégorie A' : `/model` sans argument retourne le nom du modèle actuel en non-interactive/acp (ne déclenche pas de `dialog`) ; `/model --fast <id>` configure correctement
- [ ] Catégorie A' : `/approval-mode` sans argument retourne le mode actuel en non-interactive/acp (ne déclenche pas de `dialog`) ; configure correctement avec argument
- [ ] Catégorie B : `/about` retourne un résumé texte brut contenant la version et le nom du modèle en non-interactive/acp
- [ ] Catégorie B : `/stats` (avec sous-commandes) retourne des statistiques en texte brut en non-interactive/acp
- [ ] Catégorie B : `/insight` génère le fichier insight et retourne son chemin en non-interactive/acp (n'ouvre pas le navigateur)
- [ ] Catégorie B : `/docs` retourne l'URL de la documentation en non-interactive/acp (n'ouvre pas le navigateur)
- [ ] Catégorie B : `/clear` retourne un `message` de délimitation de contexte en non-interactive/acp, `geminiClient.resetChat()` s'exécute correctement
- [ ] Les 13 commandes se comportent exactement comme avant le refactoring en mode interactif (zéro régression)
- [ ] Compilation TypeScript sans erreur (`npm run typecheck`)
- [ ] `npm run lint` sans nouvelle erreur
- [ ] Tous les tests existants passent (`cd packages/cli && npx vitest run`)

**Appel de modèle Phase 2.2**

- [ ] Le modèle peut appeler les bundled skills, file commands (utilisateur/projet) et prompts MCP via `SkillTool` pendant la conversation
- [ ] Le modèle ne peut pas appeler les commandes intégrées (`built-in commands`)
- [ ] La description d'outil de `SkillTool` inclut le nom et la description de toutes les commandes avec `modelInvocable: true`

**Phase 2.3 slash en milieu de saisie**

- [ ] La saisie de `/` dans le corps de la zone de texte déclenche le menu de complétion des commandes (pas limité au début de la ligne)
- [ ] Le menu de complétion affiche le nom de la commande + description
- [ ] La sélection de la complétion remplit correctement la zone de saisie
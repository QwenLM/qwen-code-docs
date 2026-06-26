# Document de conception technique Phase 2 : Extension des capacités

## 1. Objectifs de conception et contraintes

### 1.1 Objectifs

- Étendre le `supportedModes` des 13 commandes intégrées pour inclure `non_interactive` et/ou `acp`
- Garantir que chaque commande étendue retourne, sous le chemin ACP/non-interactive, un contenu textuel adapté à la consommation par un IDE
- Mettre en place le pipeline d’appel de modèle pour la commande prompt (`SkillTool` consomme `getModelInvocableCommands()`)
- Implémenter la détection de base des slash commandes en milieu de saisie (mid-input)

### 1.2 Contraintes strictes

- **Zéro régression du chemin interactif** : le comportement interactif existant de toutes les commandes étendues reste strictement inchangé ; seules de nouvelles branches de mode sont ajoutées à l’intérieur de l’action, sans toucher au code du chemin interactif
- **Stratégie d’implémentation : branche de mode, pas de double enregistrement** : les 13 commandes utilisent toutes une vérification `executionMode` interne à l’`action`, sans recourir au double enregistrement décrit dans la §10.2 du document de conception Phase 1 (le double enregistrement n’est nécessaire que si les logiques interactive et non-interactive divergent fortement, ce qui n’est pas le cas pour la complexité de cette phase)
- **Format des messages ACP** : le contenu textuel retourné par le chemin ACP ne contient pas de style ANSI, de préférence en Markdown ou en texte brut, destiné à être consommé par un plugin IDE
- **Sauter les effets de bord liés à l’environnement** : les opérations dépendant d’un environnement graphique (ouverture de navigateur `open()`, manipulation du presse-papiers `copyToClipboard()`, etc.) doivent être ignorées dans les chemins non-interactive/ACP

---

## 2. État de base après la Phase 1

Points d’architecture après la Phase 1 (sur lesquels la Phase 2 étend directement) :

- Le champ `commandType` a été supprimé de l’interface `SlashCommand` ; toutes les commandes utilisent désormais un `supportedModes` explicite
- `getEffectiveSupportedModes()` suit une inférence à deux niveaux : `supportedModes` explicite → `CommandKind` de repli
- `CommandService.getCommandsForMode(mode)` remplace l’ancienne liste blanche `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- `btw`, `bug`, `compress`, `context`, `init`, `summary` ont déjà été étendus à tous les modes en Phase 1 et **ne font pas partie de la liste de cette phase**
- Dans `createNonInteractiveUI()`, toutes les méthodes sont des no-op : `addItem`, `clear`, `setDebugMessage`, `setPendingItem`, `reloadCommands` ignorent silencieusement les appels

---

## 3. Vue d’ensemble du périmètre des modifications

Cette phase concerne 13 commandes, classées en quatre catégories selon leur complexité d’implémentation :

| Catégorie      | Commande                                    | Points de modification                                                                 |
|----------------|---------------------------------------------|----------------------------------------------------------------------------------------|
| **Classe A**  | `export`                                    | Modification uniquement de `supportedModes` ; tous les chemins de l’action retournent déjà un type valide |
| **Uniquement interactif** | `plan`, `statusline`          | Décision de conception : ces commandes sont sémantiquement couplées à l’interface interactive, `supportedModes: ['interactive']` conservé |
| **Classe A+** | `language`                                  | Modification de `supportedModes` + quelques branches non-interactives mineures          |
| **Uniquement interactif** | `copy`, `restore`             | Décision de conception : presse-papiers et restauration de snapshot sont des opérations interactives, `supportedModes: ['interactive']` conservé |
| **Classe A'** | `model`, `approval-mode`                   | Chemins avec paramètres retournant déjà `message` ; chemins sans paramètre nécessitant une nouvelle branche non-interactive (déclenchent actuellement une dialog) |
| **Classe B**   | `about`, `stats`, `insight`, `docs`, `clear` | Aucun retour ou appels à `addItem`/`clear` sur tous les chemins de l’action ; nécessitent une branche non-interactive complète |

---

## 4. Classe A : modification uniquement de `supportedModes`

Tous les chemins `action` de ces trois commandes retournent déjà `message` ou `submit_prompt`, sans aucune dépendance UI ; `handleCommandResult` peut les traiter directement.

### 4.1 `/export` (et ses sous-commandes)

**État actuel** : `supportedModes: ['interactive']`, toutes les sous-commandes retournent un `MessageActionReturn`.

**Modification** : passer le `supportedModes` de la commande parente et des quatre sous-commandes (`md`, `html`, `json`, `jsonl`) à `['interactive', 'non_interactive', 'acp']`.

**Contenu du message ACP** : le contenu retourné par l’action contient déjà le chemin complet du fichier (ex. `Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`), adapté à la consommation IDE, aucun changement de texte nécessaire.

> **Remarque** : la commande parente `/export` n’a pas d’`action` propre, seulement des sous-commandes. En passant son `supportedModes` à tous les modes, `parseSlashCommand` pourra correspondre aux sous-commandes, mais si l’utilisateur tape simplement `/export` sans sous-commande, `commandToExecute.action` est `undefined`, `handleSlashCommand` retourne `no_command` et l’appelant affichera l’aide des sous-commandes disponibles. C’est un comportement attendu.

### 4.2 `/plan`

**État actuel** : `supportedModes: ['interactive']`, tous les chemins de l’action retournent `MessageActionReturn` ou `SubmitPromptActionReturn`.

**Décision de conception** : `/plan` est une commande guidant l’utilisateur dans une planification multi-tours, sémantiquement couplée à l’interface interactive. Après discussion, on conserve `supportedModes: ['interactive']`, sans extension aux modes non-interactive/acp.

### 4.3 `/statusline`

**État actuel** : `supportedModes: ['interactive']`, l’action retourne toujours `SubmitPromptActionReturn` (soumet un prompt de résumé du subagent au modèle).

**Décision de conception** : `/statusline` déclenche un subagent pour résumer l’état actuel, sémantiquement couplée à l’interface interactive. Après discussion, on conserve `supportedModes: ['interactive']`, sans extension aux modes non-interactive/acp.

---

## 5. Classe A+ : quelques branches non-interactives

### 5.1 `/language`

**État actuel** : tous les chemins de l’action retournent `MessageActionReturn` (lecture/définition de la langue).

**Effet de bord à traiter** : `setUiLanguage()` appelle `context.ui.reloadCommands()`, qui est déjà un no-op dans l’UI non-interactive. Aucun traitement supplémentaire nécessaire.

**Modification** :

- Passer le `supportedModes` de la commande parente et des sous-commandes (`ui`, `output`, ainsi que les sous-commandes générées dynamiquement depuis `SUPPORTED_LANGUAGES`) à `['interactive', 'non_interactive', 'acp']`.
- Aucune branche de mode à ajouter dans l’action ; le texte retourné existant est déjà adapté à une consommation machine.

**Sémantique ACP** : exécuter `/language ui zh-CN` en mode non-interactive (appel unique) modifie le paramétrage persistant (écriture dans le fichier de settings). Cette modification prend effet pour les sessions suivantes, et la i18n de la session courante est également appliquée immédiatement. Cela correspond aux attentes de l’utilisateur.

### 5.2 `/copy`

**État actuel** : l’action appelle `copyToClipboard()`, qui peut lever une exception ou échouer silencieusement dans un environnement ACP/headless (presse-papiers indisponible).

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Ajouter une branche de mode dans l’action :

```typescript
// Récupérer le dernier message AI (logique existante, réutilisable)
if (context.executionMode !== 'interactive') {
  // Non-interactif/ACP : ignorer le presse-papiers, retourner le contenu lui-même
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
// Chemin interactif : logique de presse-papiers inchangée
await copyToClipboard(lastAiOutput);
return {
  type: 'message',
  messageType: 'info',
  content: 'Last output copied to the clipboard',
};
```

**Sémantique ACP** : l’IDE reçoit le texte brut de la dernière sortie du modèle et peut décider s’il souhaite l’écrire dans le presse-papiers ou l’afficher à l’utilisateur.

### 5.3 `/restore`

**État actuel** : `supportedModes: ['interactive']`.

**Décision de conception** : la restauration de snapshot ré-exécute des appels d’outils, sémantiquement couplée à l’interface interactive. Après discussion, on conserve `supportedModes: ['interactive']`, sans extension aux modes non-interactive/acp.

**Sémantique ACP** : la restauration du statut git du checkpoint et la configuration de l’historique du client Gemini sont exécutées comme effets de bord ; l’IDE reçoit un message de confirmation et peut indiquer à l’utilisateur que l’état a été restauré. La ré-exécution de l’outil est laissée à la discrétion de l’IDE.

---

## 6. Classe A' : traitement non-interactif des chemins de dialog sans paramètre

### 6.1 `/model`

**État actuel** :

| Entrée                         | Comportement actuel                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `/model` (sans paramètre)      | → `{ type: 'dialog', dialog: 'model' }` (devient unsupported en non-interactif)    |
| `/model <model-id>`            | Non implémenté (seule la branche `--fast` existe)                                   |
| `/model --fast` (sans nom de modèle) | → `{ type: 'dialog', dialog: 'fast-model' }` (devient unsupported en non-interactif) |
| `/model --fast <model-id>`     | → `MessageActionReturn` ✅                                                         |

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Insérer une branche non-interactive avant chaque chemin de dialog dans l’action :

```typescript
// Chemin sans paramètre (retournait dialog: 'model')
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

// Chemin --fast sans paramètre (retournait dialog: 'fast-model')
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

**Sémantique ACP** : l’IDE affiche le nom du modèle courant pour information ; le changement de modèle se fait via un appel avec paramètre (`/model <model-id>`).

> **Remarque** : `/model <model-id>` (sans `--fast`) n’a actuellement pas de logique pour définir le modèle de la session courante ; seul `--fast <model-id>` en a. Si la Phase 2 doit supporter le changement du modèle principal sous ACP, il faudra implémenter simultanément la logique de set pour `/model <model-id>`. Cette conception réserve ce chemin mais le marque comme optionnel pour la Phase 2, en priorisant le chemin read-only « voir le modèle courant ».

### 6.2 `/approval-mode`

**État actuel** :

| Entrée                           | Comportement actuel                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `/approval-mode` (sans paramètre) | → `{ type: 'dialog', dialog: 'approval-mode' }` (devient unsupported en non-interactif) |
| `/approval-mode <mode>`          | → `MessageActionReturn` ✅                                                               |
| `/approval-mode <invalid>`       | → `MessageActionReturn` (erreur) ✅                                                      |

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Insérer une branche non-interactive dans le chemin sans paramètre (`!args.trim()`) :

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

## 7. Classe B : besoin d’une branche non-interactive complète

Ces cinq commandes, en mode interactif, utilisent `context.ui.addItem()` pour afficher des composants React ou `context.ui.clear()` ; leur valeur de retour est `void`. En mode non-interactif, ces appels sont des no-op, ce qui fait que `handleSlashCommand` traite l’absence de retour comme `"Command executed successfully."`, sans contenu réel.

**Principe d’implémentation** : vérifier `executionMode` **en haut** de l’action, et **retourner par avance** un `message` contenant le contenu réel si le mode n’est pas interactif, sans toucher au code du chemin interactif.

### 7.1 `/about` (altName: `status`)

**Source de données** : `getExtendedSystemInfo(context)` retourne un `ExtendedSystemInfo` contenant : `cliVersion`, `osPlatform`, `osArch`, `osRelease`, `nodeVersion`, `modelVersion`, `selectedAuthType`, `ideClient`, `sessionId`, `memoryUsage`, `baseUrl`, `apiKeyEnvKey`, `gitCommit`, `fastModel`. Tous ces champs sont accessibles en mode non-interactif (context.services.config et settings sont déjà injectés).

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Après l’appel à `getExtendedSystemInfo`, avant le chemin interactif, insérer une branche de mode :

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

  // Chemin interactif : logique addItem inchangée
  const aboutItem: Omit<HistoryItemAbout, 'id'> = { type: MessageType.ABOUT, systemInfo };
  context.ui.addItem(aboutItem, Date.now());
},
```

### 7.2 `/stats` (et sous-commandes `model`, `tools`)

**Source de données** : `context.session.stats` (`SessionStatsState`) contient `sessionStartTime`, `metrics` (`SessionMetrics` : `models`, `tools`, `files`), `promptCount`. En mode non-interactif, `sessionStartTime` correspond au moment de l’appel courant, `metrics` provient de `uiTelemetryService.getMetrics()` (cumul de l’appel courant, généralement zéro), et `promptCount` vaut 1.

**Modification** :

1. Passer le `supportedModes` de la commande parente `stats` et des sous-commandes `model`, `tools` à `['interactive', 'non_interactive', 'acp']`.
2. Insérer une branche de mode dans l’action de la commande parente et de chaque sous-commande, retournant par avance des statistiques textuelles formatées :

```typescript
// Commande principale /stats
action: (context) => {
  if (context.executionMode !== 'interactive') {
    const now = new Date();
    const { sessionStartTime, promptCount, metrics } = context.session.stats;
    if (!sessionStartTime) {
      return { type: 'message', messageType: 'error', content: 'Session start time unavailable.' };
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    // Agréger les tokens de tous les modèles
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

  // Chemin interactif : logique addItem inchangée
  const statsItem: HistoryItemStats = { type: MessageType.STATS, duration: formatDuration(wallDuration) };
  context.ui.addItem(statsItem, Date.now());
},
```

Les sous-commandes `model` et `tools` insèrent également leur propre branche de mode, retournant des statistiques textuelles pour leur dimension respective (dimension modèle : utilisation token par nom de modèle ; dimension outils : nombre d’appels par outil).

**Explication** : dans un appel non-interactif unique, les métriques sont généralement nulles (nouvelle session), mais la structure est complète et n’affecte pas le format. Dans une session ACP, elles peuvent avoir une valeur cumulée significative.

### 7.3 `/insight`

**État actuel** : l’action retourne `void`, affiche la progression et le résultat via `addItem`, puis appelle `open(outputPath)` pour ouvrir le navigateur. La logique principale est `insightGenerator.generateStaticInsight()` qui génère un fichier HTML.

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Embranchement à trois voies selon `executionMode` :
   - `non_interactive` : génération synchrone, ignorer le callback de progression, ne pas ouvrir le navigateur, retourner directement un `message` (chemin du fichier)
   - `acp` : lancer la génération de manière asynchrone, pousser la progression (`encodeInsightProgressMessage`) et la complétion (`encodeInsightReadyMessage`) vers l’IDE via `stream_messages`
   - `interactive` : logique existante `addItem` + `setPendingItem` + `open()` inchangée

```typescript
// Chemin non_interactive
if (context.executionMode === 'non_interactive') {
  const outputPath = await insightGenerator.generateStaticInsight(
    projectsDir,
    () => {}, // callback de progression no-op
  );
  return {
    type: 'message',
    messageType: 'info',
    content: t('Insight report generated at: {{path}}', { path: outputPath }),
  };
}

// Chemin acp : stream_messages
if (context.executionMode === 'acp') {
  // ... construction du générateur async streamMessages, yield encodeInsightProgressMessage / encodeInsightReadyMessage ...
  return { type: 'stream_messages', messages: streamMessages() };
}

// Chemin interactif : implémentation existante inchangée
```

**Justification** : le mode `non_interactive` (pipeline CLI) ne supporte pas `stream_messages`, il ne peut retourner qu’un seul `message` ; le mode ACP (plugin IDE) peut consommer `stream_messages` et afficher la progression en temps réel, d’où la conservation du chemin streaming pour ce mode.

**Format des messages ACP** : `encodeInsightProgressMessage(stage, progress, detail?)` produit un message de barre de progression interprétable par l’IDE ; `encodeInsightReadyMessage(outputPath)` notifie l’IDE que le fichier est prêt, l’IDE décide comment afficher le lien.

### 7.4 `/docs`

**État actuel** : l’action retourne `void`, affiche un message via `addItem` et appelle `open(docsUrl)` pour ouvrir le navigateur. Il existe une branche pour la variable d’environnement `SANDBOX` (dans le bac à sable, seulement addItem, pas d’ouverture de navigateur).

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Modifier le type de retour de l’action en `Promise<void | MessageActionReturn>`.
3. Insérer une branche non-interactive au début de l’action :

```typescript
action: async (context) => {
  const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
  const docsUrl = `https://qwenlm.github.io/qwen-code-docs/${langPath}`;

  if (context.executionMode !== 'interactive') {
    // Non-interactif/ACP : retourner l'URL directement, sans ouvrir le navigateur, sans addItem
    return {
      type: 'message',
      messageType: 'info',
      content: `Qwen Code documentation: ${docsUrl}`,
    };
  }

  // Chemin interactif : logique SANDBOX + addItem + open() inchangée
  if (process.env['SANDBOX'] && ...) {
    context.ui.addItem(...);
  } else {
    context.ui.addItem(...);
    await open(docsUrl);
  }
},
```

### 7.5 `/clear` (altNames: `reset`, `new`)

**État actuel** : l’action effectue les opérations suivantes et retourne `void` :

1. `config.getHookSystem()?.fireSessionEndEvent()` — déclenche un hook (effet de bord)
2. `config.startNewSession()` — commence un nouvel ID de session (effet de bord)
3. `uiTelemetryService.reset()` — réinitialise les compteurs de télémétrie (effet de bord)
4. `skillTool.clearLoadedSkills()` — vide le cache des compétences (effet de bord)
5. `context.ui.clear()` — vide l’UI du terminal (**effet de bord UI, no-op en non-interactif**)
6. `geminiClient.resetChat()` — réinitialise l’historique de la conversation (effet de bord)
7. `config.getHookSystem()?.fireSessionStartEvent()` — déclenche un hook (effet de bord)

**Analyse sémantique non-interactive/ACP** :

- `ui.clear()` est déjà no-op en non-interactif, aucun traitement nécessaire
- `geminiClient.resetChat()` : dans une session ACP, c’est un effet de bord significatif (vider l’historique) ; dans un appel non-interactif unique, chaque appel est une toute nouvelle session, `resetChat` est redondant mais inoffensif
- `config.startNewSession()` : significatif en ACP (commencer un nouvel ID de session) ; redondant mais inoffensif dans un appel non-interactif unique
- `fireSessionEndEvent` / `fireSessionStartEvent` : significatif en ACP (déclencher des hooks)

**Décision** : dans les chemins non-interactive/ACP, conserver tous les effets de bord significatifs (resetChat, startNewSession, events hooks), sauter uniquement `ui.clear()` (déjà no-op) et retourner un message marqueur de limite de contexte.

**Modification** :

1. Passer `supportedModes` à `['interactive', 'non_interactive', 'acp']`.
2. Modifier le type de retour de l’action en `Promise<void | MessageActionReturn>`.
3. Dans l’action, après l’appel à `context.ui.clear()` (ou à sa place), branche selon le mode :

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

    // ui.clear() est déjà no-op en non-interactif, on l'appelle quand même (pas besoin de branche conditionnelle)
    context.ui.clear();

    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.resetChat();
    }

    config.getHookSystem()?.fireSessionStartEvent(...).catch(...);
  } else {
    context.ui.clear();
  }

  // Retour selon le mode
  if (context.executionMode !== 'interactive') {
    return {
      type: 'message',
      messageType: 'info',
      content: 'Context cleared. Previous messages are no longer in context.',
    };
  }
  // Chemin interactif : void (pas de retour, l'UI React est mise à jour par ui.clear())
},
```

**Sémantique ACP** : l’IDE reçoit la marque de limite de contexte et peut l’afficher comme séparateur de session (ex. notification « Nouvelle session ») et vider son cache local d’historique de conversation.

---

## 8. Modification de `handleCommandResult`

**Conclusion : aucune modification nécessaire.**

Après les modifications de toutes les commandes de la Phase 2, les types de retour des chemins non-interactive/ACP sont tous `message` ou `submit_prompt`, déjà correctement traités dans le switch de `handleCommandResult`.

---

## 9. Modification de `createNonInteractiveUI()`

**Conclusion : aucune modification nécessaire.**

L’implémentation actuelle no-op est suffisante. Les méthodes no-op `addItem`, `clear`, `setPendingItem` ne sont pas appelées dans les chemins non-interactifs des commandes de classe B (car retour anticipé) ; les chemins interactifs ne sont pas affectés.

---

## 10. Phase 2.2 : ouverture de l’appel de modèle pour les commandes prompt

Dans la Phase 1, `CommandService.getModelInvocableCommands()` a été implémenté, et `BundledSkillLoader`, `FileCommandLoader` (commandes utilisateur/projet), `McpPromptLoader` ont défini `modelInvocable: true`.

Le travail de la Phase 2.2 est de modifier `SkillTool` pour qu’il consomme non seulement `SkillManager.listSkills()` mais aussi `CommandService.getModelInvocableCommands()`, unifiant ainsi le point d’entrée des commandes invocables par le modèle.

**Fichier modifié** : `packages/core/src/tools/SkillTool.ts` (ou chemin correspondant)

**Modifications concrètes** :

1. `SkillTool` reçoit `CommandService` (ou le résultat de `getModelInvocableCommands()`) en injection de dépendance lors de l’initialisation
2. Lors de la construction de la description de l’outil, fusionner les résultats de `listSkills()` et de `getModelInvocableCommands()`
3. S’assurer que les commandes intégrées (`modelInvocable: false`) n’apparaissent pas dans la description de l’outil

> **Note** : l’implémentation concrète de `SkillTool` dépend de l’architecture interne de `packages/core`. Ce document ne décrit que les changements d’interface ; les détails d’implémentation doivent être déterminés en fonction de la structure existante du package core.

---

## 11. Phase 2.3 : détection de slash commande en milieu de saisie (version de base)

Dans le composant `InputPrompt`, détecter un token slash près du curseur (pas seulement en début de ligne) et déclencher un menu de complétion.

**Règle de détection** :

- Lorsqu’un token commençant par `/` et ne contenant pas d’espace est présent devant le curseur, déclencher la complétion de commande
- Les candidates de complétion proviennent de la liste des commandes visibles de `getCommandsForMode('interactive')`
- Le menu de complétion affiche le nom de la commande + sa description (sans argumentHint, complété en Phase 3)

> Cette fonctionnalité est un changement au niveau UI, sous-tâche indépendante de la Phase 2.3. Elle n’affecte pas la mise en œuvre des autres phases 2.1/2.2.

---

## 12. Récapitulatif des fichiers modifiés

### 12.1 Modifications des fichiers de commandes (Phase 2.1)

| Fichier                    | Type de modification | Contenu concret                                                                                                                        |
| -------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `exportCommand.ts`         | Classe A             | Commande parente + 4 sous-commandes : `supportedModes` → tous les modes                                                                 |
| `planCommand.ts`           | Uniquement interactif | Décision de conception : conserver `supportedModes: ['interactive']`, pas de modification                                                |
| `statuslineCommand.ts`     | Uniquement interactif | Décision de conception : conserver `supportedModes: ['interactive']`, pas de modification                                                |
| `languageCommand.ts`       | Classe A+            | Commande parente + sous-commandes `ui`/`output` + sous-commandes dynamiques de langue : `supportedModes` → tous les modes               |
| `copyCommand.ts`           | Uniquement interactif | Décision de conception : conserver `supportedModes: ['interactive']`, pas de modification                                                |
| `restoreCommand.ts`        | Uniquement interactif | Décision de conception : conserver `supportedModes: ['interactive']`, pas de modification                                                |
| `modelCommand.ts`          | Classe A'            | `supportedModes` → tous les modes + nouvelle branche non-interactive pour les chemins sans paramètre / sans fast model                  |
| `approvalModeCommand.ts`   | Classe A'            | `supportedModes` → tous les modes + nouvelle branche non-interactive pour le chemin sans paramètre                                      |
| `aboutCommand.ts`          | Classe B             | `supportedModes` → tous les modes + chemin non-interactif retourne `message` (résumé version/modèle/environnement)                       |
| `statsCommand.ts`          | Classe B             | `supportedModes` → tous les modes + chemin non-interactif retourne `message` (texte des stats) ; sous-commandes traitées en parallèle   |
| `insightCommand.ts`        | Classe B             | `supportedModes` → tous les modes + chemin `non_interactive` génère de manière synchrone et retourne `message` (chemin du fichier) ; chemin `acp` retourne `stream_messages` avec progression |
| `docsCommand.ts`           | Classe B             | `supportedModes` → tous les modes + chemin non-interactif retourne `message` (URL de la documentation), sans ouvrir le navigateur       |
| `clearCommand.ts`          | Classe B             | `supportedModes` → tous les modes + retourne `message` ou `void` en fonction du mode à la fin de l’action                               |
### 12.2 Autres modifications de fichiers

| Fichier                                               | Modification                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts`                | Phase 2.2 : Intégration de `getModelInvocableCommands()` (détail à définir) |
| `packages/cli/src/ui/InputPrompt.tsx` (ou composant équivalent) | Phase 2.3 : Logique de détection du slash en milieu de saisie               |

### 12.3 Fichiers inchangés

- `packages/cli/src/nonInteractiveCliCommands.ts` (`handleCommandResult`, `handleSlashCommand` ne nécessitent aucune modification)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (UI stub inchangée)
- `packages/cli/src/services/commandUtils.ts` (`filterCommandsForMode`, `getEffectiveSupportedModes` ne nécessitent aucune modification)
- `packages/cli/src/services/CommandService.ts` (`getCommandsForMode`, `getModelInvocableCommands` déjà implémentées dans la Phase 1)

---

## 13. Stratégie de test

### 13.1 Tests unitaires des commandes

Ajouter ou mettre à jour les fichiers de test (`*.test.ts`) dans le même répertoire pour chaque commande modifiée, en couvrant les cas suivants :

**Commandes de classe A/A+** (`export`, `language`) :

- `supportedModes` inclut correctement `non_interactive` et `acp`
- En `executionMode: 'non_interactive'`, l'action retourne `MessageActionReturn` ou `SubmitPromptActionReturn`, sans appeler `ui.addItem` ou `ui.clear`
- Le comportement en mode interactif est strictement identique à avant le refactoring (test snapshot)

**Commandes interactives uniquement** (`plan`, `statusline`, `copy`, `restore`) :

- `supportedModes` est `['interactive']`, décision de conception
- Vérifier que l’exécution en mode non-interactive retourne correctement `unsupported`

**Commandes de classe A'** (`model`, `approval-mode`) :

- Sans argument + `executionMode: 'non_interactive'` → retourne le `message` d'état courant, pas de `dialog`
- Avec argument + `executionMode: 'non_interactive'` → la logique `message` existante s'exécute normalement
- Chemin interactif : sans argument → `dialog`, avec argument → `message` (inchangé)

**Commandes de classe B** (`about`, `stats`, `insight`, `docs`, `clear`) :

- En `executionMode: 'non_interactive'`, l'action retourne `MessageActionReturn`, sans appeler aucune méthode `ui.*`
- La chaîne `content` retournée contient les champs clés attendus (numéro de version, nom du modèle, URL, etc.)
- Chemin interactif : `ui.addItem` est appelé, `action` retourne `void` (inchangé)

**Cas spécial `clear`** :

- En `executionMode: 'non_interactive'`, `geminiClient.resetChat()` est toujours appelé (effet de bord conservé)
- Retourne un `message` de frontière de contexte, avec le contenu `'Context cleared. Previous messages are no longer in context.'`

### 13.2 Tests d'intégration (`handleSlashCommand`)

Dans `nonInteractiveCli.test.ts` ou un nouveau fichier de test d'intégration :

- `handleSlashCommand('/about', ...)` en mode non-interactive retourne `{ type: 'message', content: contient le numéro de version }`
- `handleSlashCommand('/stats', ...)` en mode non-interactive retourne `{ type: 'message', content: contient 'Session duration' }`
- `handleSlashCommand('/docs', ...)` en mode non-interactive retourne `{ type: 'message', content: contient 'qwenlm.github.io' }`
- `handleSlashCommand('/clear', ...)` en mode non-interactive retourne `{ type: 'message', content: 'Context cleared.' }`
- `handleSlashCommand('/plan', ...)` en mode non-interactive retourne `unsupported` (commande interactive uniquement)
- Les commandes non-interactive existantes (`btw`, `bug`, etc.) ne présentent pas de régression

### 13.3 Tests de `commandUtils`

Ajouter (ou couvrir via des tests existants) dans `commandUtils.test.ts` :

- Les commandes étendues (`export`, `language`, etc.) passent bien le filtre `filterCommandsForMode(commands, 'non_interactive')` et `filterCommandsForMode(commands, 'acp')`
- Les commandes interactives uniquement (`plan`, `statusline`, `copy`, `restore`) sont correctement filtrées par `filterCommandsForMode(commands, 'non_interactive')`

---

## 14. Analyse de l'impact comportemental

| Scénario                                        | Comportement avant Phase 2                                         | Comportement après Phase 2                    | Nature                    |
| ----------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- | ------------------------- |
| Exécution de `/export md` en non-interactive    | ❌ unsupported (filtré)                                            | ✅ retourne un message avec le chemin du fichier | Extension de capacité    |
| Exécution de `/plan <task>` en non-interactive  | ❌ unsupported                                                     | ❌ unsupported (décision de conception : interactif uniquement) | Inchangé                  |
| Exécution de `/statusline` en non-interactive   | ❌ unsupported                                                     | ❌ unsupported (décision de conception : interactif uniquement) | Inchangé                  |
| Exécution de `/language ui zh-CN` en non-interactive | ❌ unsupported                                                | ✅ définit la langue, retourne un message de confirmation | Extension de capacité    |
| Exécution de `/copy` en non-interactive         | ❌ unsupported                                                     | ❌ unsupported (décision de conception : interactif uniquement) | Inchangé                  |
| Exécution de `/restore` (sans argument) en non-interactive | ❌ unsupported                                        | ❌ unsupported (décision de conception : interactif uniquement) | Inchangé                  |
| Exécution de `/restore <id>` en non-interactive | ❌ unsupported                                                     | ❌ unsupported (décision de conception : interactif uniquement) | Inchangé                  |
| Exécution de `/model` en non-interactive        | ❌ unsupported (dialog)                                            | ✅ retourne le nom du modèle courant           | Extension de capacité    |
| Exécution de `/model <id>` en non-interactive   | ❌ unsupported                                                     | 🔄 Phase 2 optionnelle : implémenter la logique de changement | Extension de capacité (optionnelle) |
| Exécution de `/approval-mode` en non-interactive | ❌ unsupported (dialog)                                          | ✅ retourne le mode d'approbation courant      | Extension de capacité    |
| Exécution de `/approval-mode yolo` en non-interactive | ❌ unsupported                                              | ✅ définit le mode, retourne une confirmation  | Extension de capacité    |
| Exécution de `/about` en non-interactive        | ❌ retourne "Command executed successfully." (addItem no-op)       | ✅ retourne un résumé version/modèle/environnement | Correction de bug + extension de capacité |
| Exécution de `/stats` en non-interactive        | ❌ retourne "Command executed successfully."                       | ✅ retourne les statistiques de session        | Correction de bug + extension de capacité |
| Exécution de `/insight` en non-interactive      | ❌ retourne "Command executed successfully." (généré mais sans sortie) | ✅ génère et retourne le chemin du fichier | Correction de bug + extension de capacité |
| Exécution de `/docs` en non-interactive         | ❌ retourne "Command executed successfully."                       | ✅ retourne l'URL de la documentation          | Correction de bug + extension de capacité |
| Exécution de `/clear` en non-interactive        | ❌ retourne "Command executed successfully."                       | ✅ retourne un message de frontière de contexte | Correction de bug + extension de capacité |
| Exécution de n'importe quelle commande ci-dessus en interactif | ✅ Comportement existant                              | ✅ Comportement existant (zéro régression)     | Inchangé                  |

---

## 15. Ordre d'implémentation

Il est recommandé d'implémenter dans l'ordre suivant, chaque groupe pouvant faire l'objet d'un commit et d'une review indépendants :

**Batch 1** (~30 min) : Classe A — modifier uniquement `supportedModes`

Modifier `exportCommand.ts` (et ses sous-commandes), vérifier que les tests passent.

**Batch 2** (~45 min) : Classe A+ — quelques branches

Modifier `languageCommand.ts`, ajouter une branche non-interactive pour les chemins avec effets de bord, mettre à jour les tests correspondants. (`copyCommand.ts` et `restoreCommand.ts` restent en interactif uniquement suite à la discussion.)

**Batch 3** (~45 min) : Classe A' — chemins dialog

Modifier `modelCommand.ts`, `approvalModeCommand.ts`, ajouter une branche non-interactive pour les chemins sans argument, mettre à jour les tests correspondants.

**Batch 4** (~1.5 h) : Classe B — branches complètes

Modifier `aboutCommand.ts`, `statsCommand.ts` (avec sous-commandes), `docsCommand.ts`.

**Batch 5** (~1 h) : Classe B spéciale — `insightCommand.ts`, `clearCommand.ts`

Ces deux commandes ont plus d'effets de bord, un commit séparé, mise à jour des tests correspondants et des tests d'intégration.

**Batch 6** (~2 h) : Phase 2.2 — intégration de l'appel modèle pour la commande prompt

Modifier `SkillTool`, intégrer `getModelInvocableCommands()`, mettre à jour les tests de SkillTool.

**Batch 7** (~2 h) : Phase 2.3 — détection du slash en milieu de saisie

Modifier le composant `InputPrompt`, ajouter la logique de déclenchement de l'autocomplétion et des tests UI.

**Batch 8** (~30 min) : Tests complets + vérification de types

Exécuter `npm run typecheck`, `cd packages/cli && npx vitest run`, corriger les problèmes restants.

---

## 16. Checklist de validation

**Phase 2.1 Extension des commandes**

- [ ] Classe A : `/export` (et sous-commandes), `/plan`, `/statusline` s'exécutent correctement en mode non-interactive et acp et retournent une sortie significative
- [ ] Classe A+ : `/language` (et sous-commandes) s'exécute correctement en mode non-interactive, les paramètres sont persistés
- [ ] Classe A+ : `/copy` en mode non-interactive/acp retourne le dernier texte de sortie de l'IA (n'utilise pas le presse-papiers)
- [ ] Classe A+ : `/restore` sans argument retourne la liste des checkpoints en mode non-interactive ; avec argument, restaure l'état et retourne un message de confirmation (ne retourne pas `type: 'tool'`)
- [ ] Classe A' : `/model` sans argument retourne le nom du modèle courant en mode non-interactive/acp (sans déclencher de dialog) ; `/model --fast <id>` fonctionne normalement
- [ ] Classe A' : `/approval-mode` sans argument retourne le mode courant en mode non-interactive/acp (sans déclencher de dialog) ; avec argument, le mode est défini normalement
- [ ] Classe B : `/about` en mode non-interactive/acp retourne un résumé texte contenant le numéro de version et le nom du modèle
- [ ] Classe B : `/stats` (avec sous-commandes) en mode non-interactive/acp retourne des statistiques texte
- [ ] Classe B : `/insight` en mode non-interactive/acp génère un fichier insight et retourne son chemin (sans ouvrir le navigateur)
- [ ] Classe B : `/docs` en mode non-interactive/acp retourne l'URL de la documentation (sans ouvrir le navigateur)
- [ ] Classe B : `/clear` en mode non-interactive/acp retourne un message de marqueur de frontière de contexte, `geminiClient.resetChat()` s'exécute normalement
- [ ] Les 13 commandes en mode interactif ont un comportement strictement identique à avant le refactoring (aucune régression)
- [ ] La compilation TypeScript ne génère aucune erreur (`npm run typecheck`)
- [ `npm run lint` n'ajoute aucune nouvelle erreur
- [ ] Tous les tests existants passent (`cd packages/cli && npx vitest run`)

**Phase 2.2 Appel modèle**

- [ ] Le modèle peut appeler via `SkillTool` les compétences intégrées (bundled skill), les commandes de fichier (utilisateur/projet) et les prompts MCP dans la conversation
- [ ] Le modèle ne peut pas appeler les commandes intégrées (built-in commands)
- [ ] La description de l'outil `SkillTool` contient le nom et la description de toutes les commandes avec `modelInvocable: true`

**Phase 2.3 Slash en milieu de saisie**

- [ ] La saisie de `/` dans le corps du champ de saisie déclenche un menu d'autocomplétion des commandes (pas seulement en début de ligne)
- [ ] Le menu d'autocomplétion affiche le nom de la commande + sa description
- [ ] La sélection d'une complétion remplit correctement le champ de saisie
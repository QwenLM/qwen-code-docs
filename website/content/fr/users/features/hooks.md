# Qwen Code Hooks

## Vue d'ensemble

Les hooks de Qwen Code offrent un mécanisme puissant pour étendre et personnaliser le comportement de l'application Qwen Code. Les hooks permettent aux utilisateurs d'exécuter des scripts ou des programmes personnalisés à des points spécifiques du cycle de vie de l'application, comme avant l'exécution d'un outil, après son exécution, au début/fin d'une session, et lors d'autres événements clés.

Les hooks sont activés par défaut. Vous pouvez désactiver temporairement tous les hooks en définissant `disableAllHooks` sur `true` dans votre fichier de configuration (au niveau supérieur, à côté de `hooks`) :

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

Cela désactive tous les hooks sans supprimer leurs configurations.

## Que sont les hooks ?

Les hooks sont des scripts ou des programmes définis par l'utilisateur qui sont automatiquement exécutés par Qwen Code à des points prédéfinis du flux de l'application. Ils permettent aux utilisateurs de :

- Surveiller et auditer l'utilisation des outils
- Appliquer des politiques de sécurité
- Injecter du contexte supplémentaire dans les conversations
- Personnaliser le comportement de l'application en fonction des événements
- S'intégrer à des systèmes et services externes
- Modifier programmatiquement les entrées ou les réponses des outils

## Types de hooks

Qwen Code prend en charge quatre types d'exécuteurs de hooks :

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Exécute une commande shell. Reçoit du JSON via `stdin`, renvoie les résultats via `stdout`.    |
| `http`     | Envoie du JSON dans le corps d'une requête `POST` vers une URL spécifiée. Renvoie les résultats via le corps de la réponse HTTP. |
| `function` | Appelle directement une fonction JavaScript enregistrée (hooks au niveau de la session uniquement). |
| `prompt`   | Utilise un LLM pour évaluer l'entrée du hook et renvoyer une décision.                         |

### Command Hooks

Les command hooks exécutent des commandes via des processus enfants. Le JSON d'entrée est transmis via stdin, et la sortie est renvoyée via stdout.

**Configuration :**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Yes      | Type de hook                                |
| `command`       | `string`                 | Yes      | Commande à exécuter                         |
| `name`          | `string`                 | No       | Nom du hook (pour les logs)                 |
| `description`   | `string`                 | No       | Description du hook                         |
| `timeout`       | `number`                 | No       | Délai d'expiration en millisecondes, 60000 par défaut |
| `async`         | `boolean`                | No       | Exécution asynchrone en arrière-plan        |
| `env`           | `Record<string, string>` | No       | Variables d'environnement                   |
| `shell`         | `"bash" \| "powershell"` | No       | Shell à utiliser                            |
| `statusMessage` | `string`                 | No       | Message de statut affiché pendant l'exécution |

**Exemple :**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WriteFile",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/security-check.sh",
            "name": "security-check",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### HTTP Hooks

Les HTTP hooks envoient l'entrée du hook sous forme de requêtes POST vers des URL spécifiées. Ils prennent en charge les listes blanches d'URL, la protection SSRF au niveau DNS, l'interpolation de variables d'environnement et d'autres fonctionnalités de sécurité.

**Configuration :**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | Type de hook                                              |
| `url`            | `string`                 | Yes      | URL cible                                                 |
| `headers`        | `Record<string, string>` | No       | En-têtes de requête (prend en charge l'interpolation des variables d'environnement) |
| `allowedEnvVars` | `string[]`               | No       | Liste blanche des variables d'environnement autorisées dans l'URL/les en-têtes |
| `timeout`        | `number`                 | No       | Délai d'expiration en secondes, 600 par défaut            |
| `name`           | `string`                 | No       | Nom du hook (pour les logs)                               |
| `statusMessage`  | `string`                 | No       | Message de statut affiché pendant l'exécution             |
| `once`           | `boolean`                | No       | Exécuter une seule fois par événement et par session (HTTP hooks uniquement) |

**Fonctionnalités de sécurité :**

- **Liste blanche d'URL** : Configurez les modèles d'URL autorisés via `allowedUrls`
- **Protection SSRF** : Bloque les IP privées (10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.) mais autorise les adresses de boucle locale (127.0.0.1, ::1)
- **Validation DNS** : Valide la résolution du domaine avant les requêtes pour prévenir les attaques par rebinding DNS
- **Interpolation de variables d'environnement** : Syntaxe `${VAR}`, autorise uniquement les variables présentes dans la liste blanche `allowedEnvVars`

**Exemple :**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:8080/hooks/pre-tool-use",
            "headers": {
              "Authorization": "Bearer ${HOOK_API_KEY}"
            },
            "allowedEnvVars": ["HOOK_API_KEY"],
            "timeout": 10,
            "name": "remote-security-check"
          }
        ]
      }
    ]
  }
}
```

### Function Hooks

Les function hooks appellent directement des fonctions JavaScript/TypeScript enregistrées. Ils sont utilisés en interne par le système de Skills et ne sont actuellement pas exposés en tant qu'API publique pour les utilisateurs finaux.

**Remarque** : Pour la plupart des cas d'usage, utilisez plutôt des **command hooks** ou des **HTTP hooks**, qui peuvent être configurés dans les fichiers de paramètres.

### Prompt Hooks

Les prompt hooks utilisent un LLM pour évaluer l'entrée du hook et renvoyer une décision. Cela s'avère utile pour prendre des décisions intelligentes basées sur le contexte, comme déterminer s'il faut autoriser ou bloquer une opération.

**Fonctionnement :**

1. Le JSON d'entrée du hook est injecté dans votre prompt à l'aide du placeholder `$ARGUMENTS`
2. Le prompt est envoyé à un LLM (par défaut : votre modèle actuel)
3. Le LLM renvoie une réponse JSON avec la décision
4. Qwen Code traite la décision et poursuit ou bloque l'exécution en conséquence

**Configuration :**

| Field           | Type       | Required | Description                                         |
| :-------------- | :--------- | :------- | :-------------------------------------------------- |
| `type`          | `"prompt"` | Yes      | Type de hook                                        |
| `prompt`        | `string`   | Yes      | Prompt envoyé au LLM. Utilisez `$ARGUMENTS` pour l'entrée du hook |
| `model`         | `string`   | No       | Modèle à utiliser (par défaut : votre modèle actuel) |
| `timeout`       | `number`   | No       | Délai d'expiration en secondes, 30 par défaut       |
| `name`          | `string`   | No       | Nom du hook (pour les logs)                         |
| `description`   | `string`   | No       | Description du hook                                 |
| `statusMessage` | `string`   | No       | Message de statut affiché pendant l'exécution       |

**Format de réponse :**

Le LLM doit renvoyer du JSON avec la structure suivante :

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| Field               | Description                                                                |
| :------------------ | :------------------------------------------------------------------------- |
| `ok`                | `true` pour autoriser/poursuivre, `false` pour bloquer/arrêter             |
| `reason`            | Requis lorsque `ok` est `false`. Affiché au modèle pour expliquer le blocage |
| `additionalContext` | Optionnel. Contexte supplémentaire à injecter dans la conversation lors de l'autorisation |

**Événements pris en charge :**

Les prompt hooks peuvent être utilisés avec la plupart des événements de hooks, notamment :

- `PreToolUse` - Évalue s'il faut autoriser un appel d'outil
- `PostToolUse` - Évalue les résultats de l'outil et injecte potentiellement du contexte
- `Stop` - Détermine s'il faut poursuivre ou arrêter
- `SubagentStop` - Évalue les résultats du sous-agent
- `UserPromptSubmit` - Évalue ou enrichit les prompts de l'utilisateur

**Exemple : Stop Hook**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether Qwen Code should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Lorsque `ok` est `false`, Qwen Code continuera à travailler et utilisera la `reason` comme contexte pour la réponse suivante.

**Exemple : PreToolUse Hook**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate this tool call for security concerns. Tool input: $ARGUMENTS\n\nCheck for:\n- Dangerous commands (rm -rf, curl | sh, etc.)\n- Unauthorized access attempts\n- Data exfiltration patterns\n\nRespond with {\"ok\": true} if safe, or {\"ok\": false, \"reason\": \"concern\"} if blocked.",
            "model": "sonnet",
            "timeout": 30,
            "name": "security-evaluator"
          }
        ]
      }
    ]
  }
}
```

## Événements des hooks

Les hooks se déclenchent à des moments spécifiques lors d'une session Qwen Code. Différents événements prennent en charge différents matchers pour filtrer les conditions de déclenchement.

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | Avant l'exécution de l'outil              | Nom de l'outil (`WriteFile`, `ReadFile`, `Bash`, etc.)    |
| `PostToolUse`        | Après l'exécution réussie de l'outil      | Nom de l'outil                                            |
| `PostToolUseFailure` | Après l'échec de l'exécution de l'outil   | Nom de l'outil                                            |
| `UserPromptSubmit`   | Après que l'utilisateur soumet un prompt  | Aucun (se déclenche toujours)                             |
| `SessionStart`       | Lorsque la session démarre ou reprend     | Source (`startup`, `resume`, `clear`, `compact`)          |
| `SessionEnd`         | Lorsque la session se termine             | Raison (`clear`, `logout`, `prompt_input_exit`, etc.)     |
| `Stop`               | Lorsque Claude se prépare à conclure sa réponse | Aucun (se déclenche toujours)                             |
| `SubagentStart`      | Lorsque le sous-agent démarre             | Type d'agent (`Bash`, `Explorer`, `Plan`, etc.)           |
| `SubagentStop`       | Lorsque le sous-agent s'arrête            | Type d'agent                                              |
| `PreCompact`         | Avant la compaction de la conversation    | Déclencheur (`manual`, `auto`)                            |
| `Notification`       | Lorsque des notifications sont envoyées   | Type (`permission_prompt`, `idle_prompt`, `auth_success`) |
| `PermissionRequest`  | Lorsque la boîte de dialogue de permission s'affiche | Nom de l'outil                                     |
| `TodoCreated`        | Lorsqu'un nouvel élément todo est créé    | Aucun (se déclenche toujours)                             |
| `TodoCompleted`      | Lorsqu'un élément todo est marqué comme terminé | Aucun (se déclenche toujours)                       |
### Patterns de matcher

`matcher` est une expression régulière utilisée pour filtrer les conditions de déclenchement.

| Type d'événement    | Événements                                                             | Support du matcher | Cible du matcher                                         |
| :------------------ | :--------------------------------------------------------------------- | :----------------- | :------------------------------------------------------- |
| Événements d'outils | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex           | Nom de l'outil : `WriteFile`, `ReadFile`, `Bash`, etc.   |
| Événements de sous-agent | `SubagentStart`, `SubagentStop`                                   | ✅ Regex           | Type d'agent : `Bash`, `Explorer`, etc.                  |
| Événements de session | `SessionStart`                                                       | ✅ Regex           | Source : `startup`, `resume`, `clear`, `compact`         |
| Événements de session | `SessionEnd`                                                         | ✅ Regex           | Raison : `clear`, `logout`, `prompt_input_exit`, etc.    |
| Événements de notification | `Notification`                                                  | ✅ Correspondance exacte | Type : `permission_prompt`, `idle_prompt`, `auth_success` |
| Événements de compactage | `PreCompact`                                                      | ✅ Correspondance exacte | Déclencheur : `manual`, `auto`                           |
| Événements Todo     | `TodoCreated`, `TodoCompleted`                                         | ❌ Non             | N/A                                                      |
| Événements de prompt | `UserPromptSubmit`                                                    | ❌ Non             | N/A                                                      |
| Événements d'arrêt  | `Stop`                                                                 | ❌ Non             | N/A                                                      |

**Syntaxe du matcher :**

- Une chaîne vide `""` ou `"*"` correspond à tous les événements de ce type
- Syntaxe regex standard prise en charge (par ex., `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

**Exemples :**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "Write.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'write check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "echo 'all tools' >> /tmp/hooks.log" }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'subagent check' >> /tmp/hooks.log"
          }
        ]
      }
    ]
  }
}
```

## Règles d'entrée/sortie

### Structure d'entrée des hooks

Tous les hooks reçoivent une entrée standardisée au format JSON via stdin (command) ou le corps de la requête POST (http).

**Champs communs :**

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

Des champs spécifiques à l'événement sont ajoutés en fonction du type de hook. Lors de l'exécution dans un sous-agent, `agent_id` et `agent_type` sont également inclus.

### Structure de sortie des hooks

La sortie du hook est renvoyée via `stdout` (command) ou le corps de la réponse HTTP (http) au format JSON.

**Comportement des codes de sortie (Command Hooks) :**

| Code de sortie | Comportement                                                                        |
| :------------- | :---------------------------------------------------------------------------------- |
| `0`            | Succès. Analyse le JSON dans `stdout` pour contrôler le comportement.               |
| `2`            | **Erreur bloquante**. Ignore `stdout`, transmet `stderr` comme retour d'erreur au modèle. |
| Autre          | Erreur non bloquante. `stderr` affiché uniquement en mode debug, l'exécution continue. |

**Structure de sortie :**

La sortie du hook prend en charge trois catégories de champs :

1. **Champs communs** : `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Décision de premier niveau** : `decision`, `reason` (utilisés par certains événements)
3. **Contrôle spécifique à l'événement** : `hookSpecificOutput` (doit inclure `hookEventName`)

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "Operation approved",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Additional context information"
  }
}
```

### Détails des événements de hook individuels

#### PreToolUse

**Objectif** : Exécuté avant l'utilisation d'un outil pour permettre des vérifications de permissions, la validation des entrées ou l'injection de contexte.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "nom de l'outil en cours d'exécution",
  "tool_input": "objet contenant les paramètres d'entrée de l'outil",
  "tool_use_id": "identifiant unique pour cette instance d'utilisation de l'outil (format interne, par ex., toolu_xxx)",
  "tool_call_id": "ID d'appel API original du fournisseur LLM (par ex., call_xxx pour OpenAI/Qwen) (optionnel)"
}
```

**Options de sortie** :

- `hookSpecificOutput.permissionDecision` : "allow", "deny" ou "ask" (OBLIGATOIRE)
- `hookSpecificOutput.permissionDecisionReason` : explication de la décision (OBLIGATOIRE)
- `hookSpecificOutput.updatedInput` : paramètres d'entrée de l'outil modifiés à utiliser à la place de l'original
- `hookSpecificOutput.additionalContext` : informations de contexte supplémentaires

La valeur de `permissionDecision` contrôle si l'outil s'exécute :

- `"allow"` — exécute l'outil sans la demande d'approbation habituelle.
- `"deny"` — bloque l'outil ; il ne s'exécute pas et une erreur est renvoyée au modèle.
- `"ask"` — met en pause et demande à l'utilisateur de confirmer l'appel de l'outil dans la TUI avant son exécution. Confirmer exécute l'outil une fois ; refuser l'annule. Dans les contextes qui ne peuvent pas demander de confirmation — exécutions headless (`--prompt`) et sous-agents en arrière-plan — `"ask"` revient à `"deny"`.

**Remarque** : Bien que les champs de sortie standard des hooks comme `decision` et `reason` soient techniquement pris en charge par la classe sous-jacente, l'interface officielle attend le `hookSpecificOutput` avec `permissionDecision` et `permissionDecisionReason`.

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "La politique de sécurité bloque les écritures en base de données",
    "additionalContext": "Environnement actuel : production. Procédez avec prudence."
  }
}
```

#### PostToolUse

**Objectif** : Exécuté après la réussite d'un outil pour traiter les résultats, journaliser les résultats ou injecter du contexte supplémentaire.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "nom de l'outil qui a été exécuté",
  "tool_input": "objet contenant les paramètres d'entrée de l'outil",
  "tool_response": "objet contenant la réponse de l'outil",
  "tool_use_id": "identifiant unique pour cette instance d'utilisation de l'outil (format interne, par ex., toolu_xxx)",
  "tool_call_id": "ID d'appel API original du fournisseur LLM (par ex., call_xxx pour OpenAI/Qwen) (optionnel)"
}
```

**Options de sortie** :

- `decision` : "allow", "deny", "block" (par défaut à "allow" si non spécifié)
- `reason` : raison de la décision
- `hookSpecificOutput.additionalContext` : informations supplémentaires à inclure

**Exemple de sortie** :

```json
{
  "decision": "allow",
  "reason": "Outil exécuté avec succès",
  "hookSpecificOutput": {
    "additionalContext": "Modification du fichier enregistrée dans le journal d'audit"
  }
}
```

#### PostToolUseFailure

**Objectif** : Exécuté lorsqu'une exécution d'outil échoue pour gérer les erreurs, envoyer des alertes ou enregistrer les échecs.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "identifiant unique pour l'utilisation de l'outil (format interne, par ex., toolu_xxx)",
  "tool_call_id": "ID d'appel API original du fournisseur LLM (par ex., call_xxx pour OpenAI/Qwen) (optionnel)",
  "tool_name": "nom de l'outil qui a échoué",
  "tool_input": "objet contenant les paramètres d'entrée de l'outil",
  "error": "message d'erreur décrivant l'échec",
  "is_interrupt": "booléen indiquant si l'échec est dû à une interruption de l'utilisateur (optionnel)"
}
```

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : informations de gestion des erreurs
- Champs de sortie standard des hooks

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Erreur : Fichier introuvable. Échec enregistré dans le système de monitoring."
  }
}
```

#### UserPromptSubmit

**Objectif** : Exécuté lorsque l'utilisateur soumet un prompt pour modifier, valider ou enrichir l'entrée.

**Champs spécifiques à l'événement** :

```json
{
  "prompt": "texte du prompt soumis par l'utilisateur"
}
```

**Options de sortie** :

- `decision` : "allow", "deny", "block" ou "ask"
- `reason` : explication lisible par un humain pour la décision
- `hookSpecificOutput.additionalContext` : contexte supplémentaire à ajouter au prompt (optionnel)

**Remarque** : Étant donné que `UserPromptSubmitOutput` étend `HookOutput`, tous les champs standard sont disponibles, mais seul `additionalContext` dans `hookSpecificOutput` est spécifiquement défini pour cet événement.

**Exemple de sortie** :

```json
{
  "decision": "allow",
  "reason": "Prompt examiné et approuvé",
  "hookSpecificOutput": {
    "additionalContext": "N'oubliez pas de suivre les standards de codage de l'entreprise."
  }
}
```

#### SessionStart

**Objectif** : Exécuté au démarrage d'une nouvelle session pour effectuer les tâches d'initialisation.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "modèle utilisé",
  "agent_type": "type d'agent le cas échéant (optionnel)"
}
```

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : contexte à rendre disponible dans la session
- Champs de sortie standard des hooks

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session démarrée avec les politiques de sécurité activées."
  }
}
```

#### SessionEnd

**Objectif** : Exécuté à la fin d'une session pour effectuer les tâches de nettoyage.

**Champs spécifiques à l'événement** :

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Options de sortie** :

- Champs de sortie standard des hooks (généralement non utilisés pour le blocage)

#### Stop

**Objectif** : Exécuté avant que Qwen ne conclue sa réponse pour fournir un retour final ou des résumés.

**Champs spécifiques à l'événement** :

```json
{
  "stop_hook_active": "booléen indiquant si le hook d'arrêt est actif",
  "last_assistant_message": "dernier message de l'assistant",
  "context_usage": "ratio de la fenêtre de contexte utilisée (peut dépasser 1 lorsque les tokens dépassent la fenêtre ; optionnel)",
  "context_limit": "taille de la fenêtre de contexte en tokens (optionnel)",
  "input_tokens": "nombre de tokens du prompt (peut inclure les tokens de sortie selon le fournisseur ; optionnel)"
}
```

Les champs `context_usage`, `context_limit` et `input_tokens` permettent aux scripts de hook d'observer l'utilisation du contexte et d'implémenter des stratégies de compactage personnalisées — par exemple, un script qui affiche un rappel pour exécuter `/compact` lorsque l'utilisation dépasse un seuil personnalisé.

**Options de sortie** :

- `decision` : "allow", "deny", "block" ou "ask"
- `reason` : explication lisible par un humain pour la décision
- `stopReason` : retour à inclure dans la réponse d'arrêt
- `continue` : définir à false pour arrêter l'exécution
- `hookSpecificOutput.additionalContext` : informations de contexte supplémentaires

**Remarque** : Étant donné que `StopOutput` étend `HookOutput`, tous les champs standard sont disponibles, mais le champ `stopReason` est particulièrement pertinent pour cet événement.

**Exemple de sortie** :

```json
{
  "decision": "block",
  "reason": "Doit être fourni lorsque Qwen Code est empêché de s'arrêter"
}
```

#### StopFailure

**Objectif** : Exécuté lorsque le tour se termine en raison d'une erreur API (au lieu de Stop). Il s'agit d'un événement **fire-and-forget** - la sortie du hook et les codes de sortie sont ignorés.

**Champs spécifiques à l'événement** :

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "message d'erreur détaillé (optionnel)",
  "last_assistant_message": "dernier message de l'assistant avant l'erreur (optionnel)"
}
```
**Matcher** : Correspond au champ `error`. Par exemple, `"matcher": "rate_limit"` ne se déclenchera que pour les erreurs de rate limit.

**Options de sortie** :

- **None** - StopFailure fonctionne en mode fire-and-forget. Toutes les sorties des hooks et les codes de retour sont ignorés.

**Gestion des codes de retour** :

| Code de retour | Comportement              |
| -------------- | ------------------------- |
| Tous           | Ignoré (fire-and-forget)  |

**Exemple de configuration** :

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/rate-limit-alert.sh",
            "name": "rate-limit-alerter"
          }
        ]
      }
    ]
  }
}
```

**Cas d'usage** :

- Surveillance et alertes de rate limit
- Journalisation des échecs d'authentification
- Notifications d'erreurs de facturation
- Collecte de statistiques d'erreurs

#### SubagentStart

**Objectif** : Exécuté lorsqu'un sous-agent (comme l'outil Task) est démarré pour configurer le contexte ou les permissions.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : contexte initial pour le sous-agent
- Champs de sortie standards des hooks

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**Objectif** : Exécuté lorsqu'un sous-agent se termine pour effectuer les tâches de finalisation.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "boolean indicating if stop hook is active",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent",
  "agent_transcript_path": "path to the subagent's transcript",
  "last_assistant_message": "the last message from the subagent"
}
```

**Options de sortie** :

- `decision` : "allow", "deny", "block" ou "ask"
- `reason` : explication lisible par un humain pour la décision

**Exemple de sortie** :

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Objectif** : Exécuté avant la compaction de la conversation pour préparer ou journaliser la compaction.

**Champs spécifiques à l'événement** :

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : contexte à inclure avant la compaction
- Champs de sortie standards des hooks

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**Objectif** : Exécuté après la fin de la compaction de la conversation pour archiver les résumés ou suivre l'utilisation.

**Champs spécifiques à l'événement** :

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher** : Correspond au champ `trigger`. Par exemple, `"matcher": "manual"` ne se déclenchera que pour la compaction manuelle via la commande `/compact`.

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : contexte supplémentaire (pour la journalisation uniquement)
- Champs de sortie standards des hooks (pour la journalisation uniquement)

**Note** : PostCompact n'est **pas** dans la liste officielle des événements pris en charge en mode décision. Le champ `decision` et les autres champs de contrôle ne produisent aucun effet de contrôle - ils sont uniquement utilisés à des fins de journalisation.

**Gestion des codes de retour** :

| Code de retour | Comportement                                                  |
| -------------- | ------------------------------------------------------------- |
| 0              | Succès - stdout affiché à l'utilisateur en mode verbeux       |
| Autre          | Erreur non bloquante - stderr affiché à l'utilisateur en mode verbeux |

**Exemple de configuration** :

```json
{
  "hooks": {
    "PostCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/save-compact-summary.sh",
            "name": "save-summary"
          }
        ]
      }
    ]
  }
}
```

**Cas d'usage** :

- Archivage des résumés dans des fichiers ou des bases de données
- Suivi des statistiques d'utilisation
- Surveillance des changements de contexte
- Journalisation d'audit pour les opérations de compaction

#### Notification

**Objectif** : Exécuté lorsque des notifications sont envoyées pour les personnaliser ou les intercepter.

**Champs spécifiques à l'événement** :

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Note** : le type `elicitation_dialog` est défini mais n'est pas encore implémenté.

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : informations supplémentaires à inclure
- Champs de sortie standards des hooks

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Objectif** : Exécuté lorsque des boîtes de dialogue de permission sont affichées pour automatiser les décisions ou mettre à jour les permissions.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**Options de sortie** :

- `hookSpecificOutput.decision` : objet structuré avec les détails de la décision de permission :
  - `behavior` : "allow" ou "deny"
  - `updatedInput` : entrée de l'outil modifiée (optionnel)
  - `updatedPermissions` : permissions modifiées (optionnel)
  - `message` : message à afficher à l'utilisateur (optionnel)
  - `interrupt` : indique s'il faut interrompre le workflow (optionnel)

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "decision": {
      "behavior": "allow",
      "message": "Permission granted based on security policy",
      "interrupt": false
    }
  }
}
```

#### TodoCreated

**Objectif** : Exécuté lorsqu'un nouvel élément todo est créé via l'outil `todo_write`. Permet la validation, la journalisation ou le blocage de la création du todo.

Les hooks de todo s'exécutent en deux phases :

- `validation` : s'exécute avant la persistance. Utilisez cette phase uniquement pour la validation ; retourner `block` ou `deny` empêche l'écriture.
- `postWrite` : s'exécute après la persistance. Utilisez cette phase pour les effets de bord tels que la journalisation ou la synchronisation ; `block` ou `deny` est ignoré dans cette phase.

**Champs spécifiques à l'événement** :

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**Options de sortie** :

- `decision` : "allow", "block" ou "deny"
- `reason` : explication lisible par un humain pour la décision (requis en cas de blocage)

**Comportement de blocage** :

Pendant la phase `validation`, lorsque `decision` est `block` ou `deny` (code de retour 2), la création du todo est empêchée. La liste des todos reste inchangée et la raison est fournie comme feedback au modèle.

Pendant la phase `postWrite`, le todo a déjà été persisté. Les hooks peuvent toujours retourner une sortie, mais `block` / `deny` n'annule pas l'écriture et ne doit pas être utilisé pour la validation.

**Exemple de sortie (Allow)** :

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**Exemple de sortie (Block)** :

```json
{
  "decision": "block",
  "reason": "Todo content too short. Minimum 5 characters required."
}
```

**Exemple de script de hook** :

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Validates todo content before creation

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Check minimum length
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# Block test-related todos
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "Test todos are not allowed in production"}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Exemple de configuration** :

```json
{
  "hooks": {
    "TodoCreated": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-validator.sh",
            "name": "todo-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

#### TodoCompleted

**Objectif** : Exécuté lorsqu'un élément todo est marqué comme terminé. Permet la validation, la journalisation ou le blocage de l'achèvement du todo.

Les hooks de todo s'exécutent en deux phases :

- `validation` : s'exécute avant la persistance. Utilisez cette phase uniquement pour la validation ; retourner `block` ou `deny` empêche l'écriture.
- `postWrite` : s'exécute après la persistance. Utilisez cette phase pour les effets de bord tels que la journalisation ou la synchronisation ; `block` ou `deny` est ignoré dans cette phase.

**Champs spécifiques à l'événement** :

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "previous_status": "pending | in_progress (status before completion)",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**Options de sortie** :

- `decision` : "allow", "block" ou "deny"
- `reason` : explication lisible par un humain pour la décision (requis en cas de blocage)

**Comportement de blocage** :

Pendant la phase `validation`, lorsque `decision` est `block` ou `deny` (code de retour 2), l'achèvement du todo est empêché. L'élément todo reste dans son statut précédent et la raison est fournie comme feedback au modèle.

Pendant la phase `postWrite`, le todo a déjà été persisté. Les hooks peuvent toujours retourner une sortie, mais `block` / `deny` n'annule pas l'écriture et ne doit pas être utilisé pour la validation.

**Exemple de sortie (Allow)** :

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**Exemple de sortie (Block)** :

```json
{
  "decision": "block",
  "reason": "Cannot complete this todo until dependent tasks are finished."
}
```

**Exemple de script de hook** :

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Validates todo completion conditions

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Check if there are incomplete dependent todos (example logic)
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "Too many incomplete todos. Complete other tasks first."}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Exemple de configuration** :

```json
{
  "hooks": {
    "TodoCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-completion-validator.sh",
            "name": "completion-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**Cas d'usage** :

- **Journalisation** : Suivre la création et l'achèvement des todos pour l'audit ou l'analyse
- **Validation** : Appliquer des standards de qualité de contenu (longueur minimale, mots-clés requis)
- **Contrôle de workflow** : Bloquer l'achèvement jusqu'à ce que les prérequis soient remplis
- **Intégration** : Synchroniser les todos avec des systèmes de gestion de tâches externes (Jira, Trello, etc.)

## Configuration des hooks

Les hooks sont configurés dans les paramètres de Qwen Code, généralement dans `.qwen/settings.json` ou les fichiers de configuration utilisateur :

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/security-check.sh",
            "name": "security-check",
            "description": "Run security checks before tool execution",
            "timeout": 30000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'",
            "name": "session-init"
          }
        ]
      }
    ]
  }
}
```

## Exécution des hooks
### Exécution parallèle vs séquentielle

- Par défaut, les hooks s'exécutent en parallèle pour de meilleures performances
- Utilisez `sequential: true` dans la définition du hook pour forcer une exécution dépendante de l'ordre
- Les hooks séquentiels peuvent modifier l'entrée pour les hooks suivants dans la chaîne

### Hooks asynchrones

Seul le type `command` prend en charge l'exécution asynchrone. Définir `"async": true` exécute le hook en arrière-plan sans bloquer le flux principal.

**Fonctionnalités :**

- Ne peut pas retourner de contrôle de décision (l'opération a déjà eu lieu)
- Les résultats sont injectés dans le tour de conversation suivant via `systemMessage` ou `additionalContext`
- Adapté pour l'audit, la journalisation, les tests en arrière-plan, etc.

**Exemple :**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "WriteFile|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/run-tests-async.sh",
            "async": true,
            "timeout": 300000
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.js ]]; then exit 0; fi
RESULT=$(npm test 2>&1)
if [ $? -eq 0 ]; then
  echo "{\"systemMessage\": \"Tests passed after editing $FILE_PATH\"}"
else
  echo "{\"systemMessage\": \"Tests failed: $RESULT\"}"
fi
```

### Modèle de sécurité

- Les hooks s'exécutent dans l'environnement de l'utilisateur avec les privilèges de celui-ci
- Les hooks au niveau du projet nécessitent que le dossier soit considéré comme fiable
- Les timeouts empêchent les hooks de bloquer indéfiniment (par défaut : 60 secondes)

## Bonnes pratiques

### Exemple 1 : Hook de validation de sécurité

Un hook `PreToolUse` qui journalise et bloque potentiellement les commandes dangereuses :

**security_check.sh**

```bash
#!/bin/bash

# Read input from stdin
INPUT=$(cat)

# Parse the input to extract tool info
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Check for potentially dangerous operations
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # Blocking error
fi

# Log the operation
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Security check passed",
    "additionalContext": "Command approved by security policy"
  }
}'
exit 0
```

Configurez dans `.qwen/settings.json` :

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${SECURITY_CHECK_SCRIPT}",
            "name": "security-checker",
            "description": "Security validation for bash commands",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### Exemple 2 : Hook d'audit HTTP

Un hook HTTP `PostToolUse` qui envoie tous les enregistrements d'exécution des outils à un service d'audit distant :

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "https://audit.example.com/api/tool-execution",
            "headers": {
              "Authorization": "Bearer ${AUDIT_API_TOKEN}",
              "Content-Type": "application/json"
            },
            "allowedEnvVars": ["AUDIT_API_TOKEN"],
            "timeout": 10,
            "name": "audit-logger"
          }
        ]
      }
    ]
  }
}
```

### Exemple 3 : Hook de validation des prompts utilisateur

Un hook `UserPromptSubmit` qui valide les prompts utilisateur pour détecter des informations sensibles et fournit du contexte pour les prompts longs :

**prompt_validator.py**

```python
import json
import sys
import re

# Load input from stdin
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# Sensitive words list
sensitive_words = ["password", "secret", "token", "api_key"]

# Check for sensitive information
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # Block prompts containing sensitive information
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    exit(0)

# No processing needed for normal cases
exit(0)
```

## Dépannage

- Vérifiez les logs de l'application pour les détails d'exécution des hooks
- Vérifiez les permissions et l'exécutabilité des scripts de hooks
- Assurez-vous que le format JSON est correct dans les sorties des hooks
- Utilisez des patterns de matcher spécifiques pour éviter l'exécution involontaire des hooks
- Utilisez le mode `--debug` pour voir les informations détaillées sur le matching et l'exécution des hooks
- Désactivez temporairement tous les hooks : ajoutez `"disableAllHooks": true` dans les paramètres
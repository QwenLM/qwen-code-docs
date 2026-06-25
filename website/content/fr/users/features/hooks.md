# Qwen Code Hooks

## Aperçu

Les hooks Qwen Code offrent un mécanisme puissant pour étendre et personnaliser le comportement de l'application Qwen Code. Les hooks permettent aux utilisateurs d'exécuter des scripts ou programmes personnalisés à des points spécifiques du cycle de vie de l'application, comme avant l'exécution d'un outil, après l'exécution d'un outil, au démarrage/fin d'une session, et lors d'autres événements clés.

Les hooks sont activés par défaut. Vous pouvez désactiver temporairement tous les hooks en définissant `disableAllHooks` sur `true` dans votre fichier de paramètres (au niveau supérieur, à côté de `hooks`) :

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

Les hooks sont des scripts ou programmes définis par l'utilisateur qui sont automatiquement exécutés par Qwen Code à des points prédéfinis du flux applicatif. Ils permettent aux utilisateurs de :

- Surveiller et auditer l'utilisation des outils
- Appliquer des politiques de sécurité
- Injecter du contexte supplémentaire dans les conversations
- Personnaliser le comportement de l'application en fonction des événements
- Intégrer des systèmes et services externes
- Modifier programmatiquement les entrées ou réponses des outils

## Types de hooks

Qwen Code prend en charge quatre types d'exécution de hooks :

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Exécute une commande shell. Reçoit du JSON via `stdin`, renvoie les résultats via `stdout`.    |
| `http`     | Envoie du JSON en tant que corps d'une requête `POST` à une URL spécifiée. Renvoie les résultats via le corps de la réponse HTTP. |
| `function` | Appelle directement une fonction JavaScript enregistrée (hooks au niveau session uniquement).  |
| `prompt`   | Utilise un LLM pour évaluer l'entrée du hook et retourner une décision.                        |

### Hooks de commande

Les hooks de commande exécutent des commandes via des processus enfants. Le JSON d'entrée est passé via stdin, et la sortie est renvoyée via stdout.

**Configuration :**

| Champ           | Type                     | Requis | Description                                   |
| :-------------- | :----------------------- | :----- | :------------------------------------------ |
| `type`          | `"command"`              | Oui    | Type de hook                                 |
| `command`       | `string`                 | Oui    | Commande à exécuter                          |
| `name`          | `string`                 | Non    | Nom du hook (pour la journalisation)          |
| `description`   | `string`                 | Non    | Description du hook                          |
| `timeout`       | `number`                 | Non    | Délai d'attente en millisecondes, défaut 60000 |
| `async`         | `boolean`                | Non    | Exécution asynchrone en arrière-plan          |
| `env`           | `Record<string, string>` | Non    | Variables d'environnement                    |
| `shell`         | `"bash" \| "powershell"` | Non    | Shell à utiliser                             |
| `statusMessage` | `string`                 | Non    | Message d'état affiché pendant l'exécution   |

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

### Hooks HTTP

Les hooks HTTP envoient l'entrée du hook en tant que requêtes POST vers des URL spécifiées. Ils prennent en charge les listes blanches d'URL, la protection SSRF au niveau DNS, l'interpolation de variables d'environnement et d'autres fonctionnalités de sécurité.

**Configuration :**

| Champ            | Type                     | Requis | Description                                                 |
| :--------------- | :----------------------- | :----- | :---------------------------------------------------------- |
| `type`           | `"http"`                 | Oui    | Type de hook                                                |
| `url`            | `string`                 | Oui    | URL cible                                                   |
| `headers`        | `Record<string, string>` | Non    | En-têtes de requête (prend en charge l'interpolation de vars d'env.) |
| `allowedEnvVars` | `string[]`               | Non    | Liste blanche des variables d'env. autorisées dans l'URL/les en-têtes |
| `timeout`        | `number`                 | Non    | Délai d'attente en secondes, défaut 600                     |
| `name`           | `string`                 | Non    | Nom du hook (pour la journalisation)                        |
| `statusMessage`  | `string`                 | Non    | Message d'état affiché pendant l'exécution                  |
| `once`           | `boolean`                | Non    | Exécuter une seule fois par événement par session (hooks HTTP uniquement) |

**Fonctionnalités de sécurité :**

- **Liste blanche d'URL** : Configurer les motifs d'URL autorisés via `allowedUrls`
- **Protection SSRF** : Bloque les adresses IP privées (10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.) mais autorise les adresses de boucle locale (127.0.0.1, ::1)
- **Validation DNS** : Valide la résolution de domaine avant les requêtes pour prévenir les attaques de rebinding DNS
- **Interpolation de variables d'environnement** : Syntaxe `${VAR}`, autorise uniquement les variables de la liste blanche `allowedEnvVars`
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

### Hooks de fonction

Les hooks de fonction appellent directement des fonctions JavaScript/TypeScript enregistrées. Ils sont utilisés en interne par le système Skill et ne sont actuellement pas exposés en tant qu'API publique pour les utilisateurs finaux.

**Remarque :** Pour la plupart des cas d'utilisation, utilisez plutôt les **hooks de commande** ou les **hooks HTTP**, qui peuvent être configurés dans les fichiers de paramètres.

### Hooks de prompt

Les hooks de prompt utilisent un LLM pour évaluer l'entrée du hook et renvoyer une décision. Cela est utile pour prendre des décisions intelligentes en fonction du contexte, comme autoriser ou bloquer une opération.

**Fonctionnement :**

1. L'entrée JSON du hook est injectée dans votre prompt à l'aide du placeholder `$ARGUMENTS`
2. Le prompt est envoyé à un LLM (par défaut : votre modèle actuel)
3. Le LLM renvoie une réponse JSON avec la décision
4. Qwen Code traite la décision et poursuit ou bloque l'exécution en conséquence

**Configuration :**

| Champ            | Type       | Requis | Description                                           |
| :--------------- | :--------- | :----- | :---------------------------------------------------- |
| `type`           | `"prompt"` | Oui    | Type de hook                                          |
| `prompt`         | `string`   | Oui    | Prompt envoyé au LLM. Utilisez `$ARGUMENTS` pour l'entrée du hook |
| `model`          | `string`   | Non    | Modèle à utiliser (par défaut, votre modèle actuel)   |
| `timeout`        | `number`   | Non    | Délai d'attente en secondes, défaut 30                |
| `name`           | `string`   | Non    | Nom du hook (pour la journalisation)                  |
| `description`    | `string`   | Non    | Description du hook                                   |
| `statusMessage`  | `string`   | Non    | Message d'état affiché pendant l'exécution            |

**Format de la réponse :**

Le LLM doit renvoyer du JSON avec la structure suivante :

```json
{
  "ok": true,
  "reason": "Explication de la décision",
  "additionalContext": "Contexte optionnel à injecter dans la conversation"
}
```

| Champ               | Description                                                                |
| :------------------ | :------------------------------------------------------------------------- |
| `ok`                | `true` pour autoriser/continuer, `false` pour bloquer/arrêter              |
| `reason`            | Requis quand `ok` est `false`. Affiché au modèle pour expliquer le blocage |
| `additionalContext` | Optionnel. Contexte supplémentaire à injecter dans la conversation lors de l'autorisation |

**Événements pris en charge :**

Les hooks de prompt peuvent être utilisés avec la plupart des événements de hook, notamment :

- `PreToolUse` – Évaluer si un appel d'outil doit être autorisé
- `PostToolUse` – Évaluer les résultats de l'outil et potentiellement injecter un contexte
- `Stop` – Déterminer s'il faut continuer ou s'arrêter
- `SubagentStop` – Évaluer les résultats du sous-agent
- `UserPromptSubmit` – Évaluer ou enrichir les prompts utilisateur

**Exemple : Hook Stop**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Vous évaluez si Qwen Code doit s'arrêter de travailler. Contexte : $ARGUMENTS\n\nAnalysez la conversation et déterminez si :\n1. Toutes les tâches demandées par l'utilisateur sont terminées\n2. Des erreurs doivent être traitées\n3. Un travail de suivi est nécessaire\n\nRépondez avec du JSON : {\"ok\": true} pour autoriser l'arrêt, ou {\"ok\": false, \"reason\": \"votre explication\"} pour continuer à travailler.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Lorsque `ok` est `false`, Qwen Code continue de travailler et utilise le `reason` comme contexte pour la réponse suivante.

**Exemple : Hook PreToolUse**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Évaluez cet appel d'outil pour des problèmes de sécurité. Entrée de l'outil : $ARGUMENTS\n\nVérifiez :\n- Les commandes dangereuses (rm -rf, curl | sh, etc.)\n- Les tentatives d'accès non autorisées\n- Les modèles d'exfiltration de données\n\nRépondez avec {\"ok\": true} si sûr, ou {\"ok\": false, \"reason\": \"préoccupation\"} si bloqué.",
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

## Événements de hook

Les hooks se déclenchent à des points spécifiques pendant une session Qwen Code. Différents événements prennent en charge différents matchers pour filtrer les conditions de déclenchement.

| Événement             | Déclenché quand                            | Cible du matcher                                            |
| :-------------------- | :----------------------------------------- | :---------------------------------------------------------- |
| `PreToolUse`          | Avant l'exécution d'un outil               | Nom de l'outil (`WriteFile`, `ReadFile`, `Bash`, etc.)      |
| `PostToolUse`         | Après l'exécution réussie d'un outil       | Nom de l'outil                                              |
| `PostToolUseFailure`  | Après l'échec de l'exécution d'un outil    | Nom de l'outil                                              |
| `UserPromptSubmit`    | Après la soumission d'un prompt utilisateur | Aucun (se déclenche toujours)                               |
| `SessionStart`        | Au démarrage ou à la reprise de session    | Source (`startup`, `resume`, `clear`, `compact`)            |
| `SessionEnd`          | À la fin de la session                     | Raison (`clear`, `logout`, `prompt_input_exit`, etc.)       |
| `Stop`                | Quand Claude se prépare à conclure une réponse | Aucun (se déclenche toujours)                               |
| `SubagentStart`       | Au démarrage d'un sous-agent               | Type d'agent (`Bash`, `Explorer`, `Plan`, etc.)             |
| `SubagentStop`        | À l'arrêt d'un sous-agent                  | Type d'agent                                                |
| `PreCompact`          | Avant la compaction de la conversation     | Déclencheur (`manual`, `auto`)                              |
| `Notification`        | Lors de l'envoi de notifications           | Type (`permission_prompt`, `idle_prompt`, `auth_success`)   |
| `PermissionRequest`   | Quand une boîte de dialogue d'autorisation est affichée | Nom de l'outil                |
| `TodoCreated`         | Quand un nouvel élément todo est créé      | Aucun (se déclenche toujours)                               |
| `TodoCompleted`       | Quand un élément todo est marqué comme terminé | Aucun (se déclenche toujours)                           |
### Modèles de correspondance

`matcher` est une expression régulière utilisée pour filtrer les conditions de déclenchement.

| Type d'événement          | Événements                                                            | Support du matcher | Cible du matcher                                             |
| :------------------------ | :-------------------------------------------------------------------- | :----------------- | :----------------------------------------------------------- |
| Événements d'outil        | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex           | Nom de l'outil : `WriteFile`, `ReadFile`, `Bash`, etc.       |
| Événements de sous-agent  | `SubagentStart`, `SubagentStop`                                       | ✅ Regex           | Type d'agent : `Bash`, `Explorer`, etc.                      |
| Événements de session     | `SessionStart`                                                        | ✅ Regex           | Source : `startup`, `resume`, `clear`, `compact`             |
| Événements de session     | `SessionEnd`                                                          | ✅ Regex           | Raison : `clear`, `logout`, `prompt_input_exit`, etc.        |
| Événements de notification| `Notification`                                                        | ✅ Correspondance exacte | Type : `permission_prompt`, `idle_prompt`, `auth_success` |
| Événements de compactage  | `PreCompact`                                                          | ✅ Correspondance exacte | Déclencheur : `manual`, `auto`                             |
| Événements de tâche       | `TodoCreated`, `TodoCompleted`                                        | ❌ Non             | N/A                                                          |
| Événements d'invite       | `UserPromptSubmit`                                                    | ❌ Non             | N/A                                                          |
| Événements d'arrêt        | `Stop`                                                                | ❌ Non             | N/A                                                          |

**Syntaxe du matcher :**

- Chaîne vide `""` ou `"*"` correspond à tous les événements de ce type
- Syntaxe regex standard prise en charge (par exemple, `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

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

Tous les hooks reçoivent une entrée standardisée au format JSON via stdin (commande) ou le corps de la requête POST (http).

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

La sortie du hook est renvoyée via `stdout` (commande) ou le corps de la réponse HTTP (http) au format JSON.

**Comportement des codes de sortie (hooks de commande) :**

| Code de sortie | Comportement                                                                                |
| :------------- | :------------------------------------------------------------------------------------------ |
| `0`            | Succès. Analyser le JSON dans `stdout` pour contrôler le comportement.                       |
| `2`            | **Erreur bloquante**. Ignore `stdout`, transmet `stderr` comme retour d'erreur au modèle.   |
| Autre          | Erreur non bloquante. `stderr` affiché uniquement en mode débogage, l'exécution continue.   |

**Structure de sortie :**

La sortie du hook prend en charge trois catégories de champs :

1. **Champs communs** : `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Décision de haut niveau** : `decision`, `reason` (utilisé par certains événements)
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

**Objectif** : Exécuté avant l'utilisation d'un outil pour permettre des vérifications de permissions, une validation d'entrée ou une injection de contexte.

**Champs spécifiques à l'événement :**

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```
**Options de sortie** :

- `hookSpecificOutput.permissionDecision` : « allow », « deny » ou « ask » (OBLIGATOIRE)
- `hookSpecificOutput.permissionDecisionReason` : explication de la décision (OBLIGATOIRE)
- `hookSpecificOutput.updatedInput` : paramètres d’entrée de l’outil modifiés à utiliser à la place de l’original
- `hookSpecificOutput.additionalContext` : informations de contexte supplémentaires

**Remarque** : Bien que les champs de sortie standard comme `decision` et `reason` soient techniquement pris en charge par la classe sous-jacente, l’interface officielle attend le `hookSpecificOutput` avec `permissionDecision` et `permissionDecisionReason`.

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

**Objectif** : Exécuté après qu’un outil s’est terminé avec succès pour traiter les résultats, journaliser les conclusions ou injecter un contexte supplémentaire.

**Champs spécifiques à l’événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "nom de l’outil qui a été exécuté",
  "tool_input": "objet contenant les paramètres d’entrée de l’outil",
  "tool_response": "objet contenant la réponse de l’outil",
  "tool_use_id": "identifiant unique de cette instance d’utilisation de l’outil (format interne, ex. toolu_xxx)",
  "tool_call_id": "identifiant d’appel API d’origine du fournisseur LLM (ex. call_xxx pour OpenAI/Qwen) (optionnel)"
}
```

**Options de sortie** :

- `decision` : « allow », « deny », « block » (par défaut « allow » si non spécifié)
- `reason` : raison de la décision
- `hookSpecificOutput.additionalContext` : information supplémentaire à inclure

**Exemple de sortie** :

```json
{
  "decision": "allow",
  "reason": "Outil exécuté avec succès",
  "hookSpecificOutput": {
    "additionalContext": "Modification de fichier enregistrée dans le journal d’audit"
  }
}
```

#### PostToolUseFailure

**Objectif** : Exécuté en cas d’échec de l’exécution d’un outil pour gérer les erreurs, envoyer des alertes ou enregistrer les échecs.

**Champs spécifiques à l’événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "identifiant unique de l’utilisation de l’outil (format interne, ex. toolu_xxx)",
  "tool_call_id": "identifiant d’appel API d’origine du fournisseur LLM (ex. call_xxx pour OpenAI/Qwen) (optionnel)",
  "tool_name": "nom de l’outil qui a échoué",
  "tool_input": "objet contenant les paramètres d’entrée de l’outil",
  "error": "message d’erreur décrivant l’échec",
  "is_interrupt": "booléen indiquant si l’échec est dû à une interruption de l’utilisateur (optionnel)"
}
```

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : informations de gestion des erreurs
- Champs de sortie standard du hook

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Erreur : fichier introuvable. Échec journalisé dans le système de surveillance."
  }
}
```

#### UserPromptSubmit

**Objectif** : Exécuté lorsque l’utilisateur soumet une invite pour modifier, valider ou enrichir l’entrée.

**Champs spécifiques à l’événement** :

```json
{
  "prompt": "le texte de l’invite soumise par l’utilisateur"
}
```

**Options de sortie** :

- `decision` : « allow », « deny », « block » ou « ask »
- `reason` : explication lisible de la décision
- `hookSpecificOutput.additionalContext` : contexte supplémentaire à ajouter à l’invite (optionnel)

**Remarque** : Étant donné que UserPromptSubmitOutput étend HookOutput, tous les champs standard sont disponibles, mais seul `additionalContext` dans `hookSpecificOutput` est spécifiquement défini pour cet événement.

**Exemple de sortie** :

```json
{
  "decision": "allow",
  "reason": "Invite vérifiée et approuvée",
  "hookSpecificOutput": {
    "additionalContext": "N’oubliez pas de respecter les normes de codage de l’entreprise."
  }
}
```

#### SessionStart

**Objectif** : Exécuté lorsqu’une nouvelle session démarre pour effectuer des tâches d’initialisation.

**Champs spécifiques à l’événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "le modèle utilisé",
  "agent_type": "le type d’agent si applicable (optionnel)"
}
```

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : contexte à rendre disponible dans la session
- Champs de sortie standard du hook

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session démarrée avec les politiques de sécurité activées."
  }
}
```

#### SessionEnd

**Objectif** : Exécuté lorsqu’une session se termine pour effectuer des tâches de nettoyage.

**Champs spécifiques à l’événement** :

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Options de sortie** :

- Champs de sortie standard du hook (généralement non utilisés pour le blocage)

#### Stop

**Objectif** : Exécuté avant que Qwen ne conclue sa réponse pour fournir un retour final ou des résumés.

**Champs spécifiques à l’événement** :

```json
{
  "stop_hook_active": "booléen indiquant si le hook stop est actif",
  "last_assistant_message": "le dernier message de l’assistant"
}
```

**Options de sortie** :

- `decision` : « allow », « deny », « block » ou « ask »
- `reason` : explication lisible de la décision
- `stopReason` : retour à inclure dans la réponse de stop
- `continue` : mettre à false pour arrêter l’exécution
- `hookSpecificOutput.additionalContext` : informations de contexte supplémentaires
**Note** : Puisque StopOutput étend HookOutput, tous les champs standards sont disponibles, mais le champ stopReason est particulièrement pertinent pour cet événement.

**Exemple de sortie** :

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Objectif** : Exécuté lorsque le tour se termine en raison d'une erreur API (au lieu de Stop). Il s'agit d'un événement **fire-and-forget** - les sorties des hooks et les codes de sortie sont ignorés.

**Champs spécifiques à l'événement** :

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher** : Correspond au champ `error`. Par exemple, `"matcher": "rate_limit"` ne se déclenchera que pour les erreurs de limite de taux.

**Options de sortie** :

- **Aucune** - StopFailure est un événement fire-and-forget. Toutes les sorties de hooks et tous les codes de sortie sont ignorés.

**Gestion des codes de sortie** :

| Code de sortie | Comportement                  |
| -------------- | ----------------------------- |
| Any            | Ignoré (fire-and-forget)      |

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

**Cas d'utilisation** :

- Surveillance et alertes de limite de taux
- Journalisation des échecs d'authentification
- Notifications d'erreurs de facturation
- Collecte de statistiques d'erreurs

#### SubagentStart

**Objectif** : Exécuté lorsqu'un sous-agent (comme l'outil Tâche) est démarré pour configurer le contexte ou les permissions.

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
- Champs de sortie standard des hooks

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**Objectif** : Exécuté lorsqu'un sous-agent se termine pour effectuer des tâches de finalisation.

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
- `reason` : explication lisible pour la décision

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
- Champs de sortie standard des hooks

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**Objectif** : Exécuté après la compaction de la conversation pour archiver les résumés ou suivre l'utilisation.

**Champs spécifiques à l'événement** :

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher** : Correspond au champ `trigger`. Par exemple, `"matcher": "manual"` ne se déclenchera que pour une compaction manuelle via la commande `/compact`.

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : contexte supplémentaire (uniquement pour journalisation)
- Champs de sortie standard des hooks (uniquement pour journalisation)

**Note** : PostCompact n'est **pas** dans la liste officielle des événements supportés en mode décision. Les champs `decision` et autres champs de contrôle ne produisent aucun effet de contrôle - ils sont uniquement utilisés à des fins de journalisation.

**Gestion des codes de sortie** :

| Code de sortie | Comportement                                                  |
| -------------- | ------------------------------------------------------------- |
| 0              | Succès - stdout affiché à l'utilisateur en mode verbeux      |
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

**Cas d'utilisation** :

- Archivage de résumés dans des fichiers ou bases de données
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

> **Remarque** : le type `elicitation_dialog` est défini mais pas encore implémenté.

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : informations supplémentaires à inclure
- Champs de sortie standard du hook

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Objectif** : Exécuté lorsque des boîtes de dialogue d'autorisation sont affichées pour automatiser les décisions ou mettre à jour les autorisations.

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

- `hookSpecificOutput.decision` : objet structuré avec les détails de la décision d'autorisation :
  - `behavior` : "allow" ou "deny"
  - `updatedInput` : entrée de l'outil modifiée (optionnel)
  - `updatedPermissions` : autorisations modifiées (optionnel)
  - `message` : message à afficher à l'utilisateur (optionnel)
  - `interrupt` : indique s'il faut interrompre le flux de travail (optionnel)

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

**Objectif** : Exécuté lorsqu'un nouvel élément todo est créé via l'outil `todo_write`. Permet la validation, la journalisation ou le blocage de la création de todo.

Les hooks Todo s'exécutent en deux phases :

- `validation` : s'exécute avant la persistance. Utilisez cette phase uniquement pour la validation ; retourner `block` ou `deny` empêche l'écriture.
- `postWrite` : s'exécute après la persistance. Utilisez cette phase pour les effets secondaires tels que la journalisation ou la synchronisation ; `block` ou `deny` est ignoré dans cette phase.

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
- `reason` : explication lisible par un humain de la décision (requis en cas de blocage)

**Comportement de blocage** :

Pendant la phase `validation`, lorsque `decision` est `block` ou `deny` (code de sortie 2), la création du todo est empêchée. La liste des todos reste inchangée et la raison est fournie comme retour au modèle.

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

Les hooks Todo s'exécutent en deux phases :

- `validation` : s'exécute avant la persistance. Utilisez cette phase uniquement pour la validation ; retourner `block` ou `deny` empêche l'écriture.
- `postWrite` : s'exécute après la persistance. Utilisez cette phase pour les effets secondaires tels que la journalisation ou la synchronisation ; `block` ou `deny` est ignoré dans cette phase.

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
- `reason` : explication lisible par un humain de la décision (requis en cas de blocage)

**Comportement de blocage** :

Pendant la phase `validation`, lorsque `decision` est `block` ou `deny` (code de sortie 2), l'achèvement du todo est empêché. Le todo reste inchangé et la raison est fournie comme retour au modèle.
Pendant la phase de `validation`, lorsque la `decision` est `block` ou `deny` (code de sortie 2), l'achèvement de la tâche est empêché. L'élément de tâche reste dans son statut précédent, et la raison est fournie comme retour au modèle.

Pendant la phase `postWrite`, la tâche a déjà été persistée. Les hooks peuvent encore retourner une sortie, mais `block`/`deny` n'annule pas l'écriture et ne doit pas être utilisé pour la validation.

**Exemple de sortie (Autoriser)** :

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**Exemple de sortie (Bloquer)** :

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

**Cas d'utilisation** :

- **Journalisation** : Suivre la création et l'achèvement des tâches pour l'audit ou les analyses
- **Validation** : Appliquer des normes de qualité de contenu (longueur minimale, mots-clés requis)
- **Contrôle du flux de travail** : Bloquer l'achèvement jusqu'à ce que les prérequis soient satisfaits
- **Intégration** : Synchroniser les tâches avec des systèmes de gestion de tâches externes (Jira, Trello, etc.)

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
- Utilisez `sequential: true` dans la définition du hook pour imposer une exécution dépendante de l'ordre
- Les hooks séquentiels peuvent modifier l'entrée pour les hooks suivants dans la chaîne

### Hooks asynchrones

Seul le type `command` prend en charge l'exécution asynchrone. Définir `"async": true` exécute le hook en arrière-plan sans bloquer le flux principal.

**Fonctionnalités :**

- Ne peuvent pas retourner le contrôle de décision (l'opération a déjà eu lieu)
- Les résultats sont injectés dans le tour de conversation suivant via `systemMessage` ou `additionalContext`
- Adapté à l'audit, la journalisation, les tests en arrière-plan, etc.

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

- Les hooks s'exécutent dans l'environnement de l'utilisateur avec ses privilèges
- Les hooks au niveau du projet nécessitent le statut de dossier de confiance
- Les délais d'attente empêchent les hooks de bloquer (par défaut : 60 secondes)

## Bonnes pratiques

### Exemple 1 : Hook de validation de sécurité

Un hook PreToolUse qui journalise et potentiellement bloque les commandes dangereuses :

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
            "description": "Validation de sécurité pour les commandes bash",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### Exemple 2 : Hook d'audit HTTP

Un hook HTTP PostToolUse qui envoie tous les enregistrements d'exécution d'outils vers un service d'audit distant :

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

### Exemple 3 : Hook de validation des invites utilisateur

Un hook UserPromptSubmit qui valide les invites utilisateur pour les informations sensibles et fournit un contexte pour les longues invites :

**prompt_validator.py**

```python
import json
import sys
import re

# Charge les données depuis stdin
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Erreur : Entrée JSON invalide : {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# Liste des mots sensibles
sensitive_words = ["password", "secret", "token", "api_key"]

# Vérifie la présence d'informations sensibles
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # Bloque les invites contenant des informations sensibles
        output = {
            "decision": "block",
            "reason": f"L'invite contient des informations sensibles '{word}'. Veuillez supprimer le contenu sensible et soumettre à nouveau.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        exit(0)

# Vérifie la longueur de l'invite et ajoute un contexte d'avertissement si trop longue
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note : L'utilisateur a soumis une longue invite. Veuillez lire attentivement et vous assurer que toutes les exigences sont comprises."
        }
    }
    print(json.dumps(output))
    exit(0)

# Aucun traitement nécessaire pour les cas normaux
exit(0)
```

## Dépannage

- Consultez les journaux de l'application pour les détails d'exécution des hooks
- Vérifiez les permissions et l'exécutabilité des scripts de hook
- Assurez-vous du format JSON correct dans les sorties des hooks
- Utilisez des motifs de correspondance spécifiques pour éviter une exécution involontaire des hooks
- Utilisez le mode `--debug` pour voir les informations détaillées de correspondance et d'exécution des hooks
- Désactivez temporairement tous les hooks : ajoutez `"disableAllHooks": true` dans les paramètres

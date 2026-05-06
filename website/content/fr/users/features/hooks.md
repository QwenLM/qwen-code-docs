# Qwen Code Hooks

## Présentation

Les hooks Qwen Code offrent un mécanisme puissant pour étendre et personnaliser le comportement de l'application Qwen Code. Les hooks permettent aux utilisateurs d'exécuter des scripts ou des programmes personnalisés à des moments précis du cycle de vie de l'application, par exemple avant l'exécution d'un outil, après l'exécution d'un outil, au démarrage/à la fin d'une session, et lors d'autres événements clés.

Les hooks sont activés par défaut. Vous pouvez les désactiver temporairement en définissant `disableAllHooks` sur `true` dans votre fichier de paramètres (au niveau supérieur, à côté de `hooks`) :

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

Cela désactive tous les hooks sans supprimer leurs configurations.

## Qu'est-ce qu'un hook ?

Les hooks sont des scripts ou des programmes définis par l'utilisateur et exécutés automatiquement par Qwen Code à des points prédéfinis du flux de l'application. Ils permettent aux utilisateurs de :

- Surveiller et auditer l'utilisation des outils
- Appliquer des politiques de sécurité
- Injecter du contexte supplémentaire dans les conversations
- Personnaliser le comportement de l'application en fonction des événements
- S'intégrer à des systèmes et services externes
- Modifier les entrées ou les réponses des outils par programmation

## Types de hooks

Qwen Code prend en charge trois types d'exécuteurs de hooks :

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Exécute une commande shell. Reçoit du JSON via `stdin` et renvoie les résultats via `stdout`.  |
| `http`     | Envoie du JSON dans le corps d'une requête `POST` vers une URL spécifiée. Renvoie les résultats via le corps de la réponse HTTP. |
| `function` | Appelle directement une fonction JavaScript enregistrée (uniquement pour les hooks au niveau de la session).                     |

### Hooks de type command

Les hooks de type `command` exécutent des commandes via des processus enfants. Le JSON d'entrée est transmis via stdin et la sortie est renvoyée via stdout.

**Configuration :**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Oui      | Type de hook                                |
| `command`       | `string`                 | Oui      | Commande à exécuter                         |
| `name`          | `string`                 | Non      | Nom du hook (pour les journaux)             |
| `description`   | `string`                 | Non      | Description du hook                         |
| `timeout`       | `number`                 | Non      | Délai d'expiration en millisecondes, par défaut 60000 |
| `async`         | `boolean`                | Non      | Indique si l'exécution est asynchrone en arrière-plan |
| `env`           | `Record<string, string>` | Non      | Variables d'environnement                   |
| `shell`         | `"bash" \| "powershell"` | Non      | Shell à utiliser                            |
| `statusMessage` | `string`                 | Non      | Message d'état affiché pendant l'exécution  |

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

### Hooks de type http

Les hooks de type `http` envoient les données d'entrée du hook sous forme de requêtes POST vers des URL spécifiées. Ils prennent en charge les listes blanches d'URL, la protection SSRF au niveau DNS, l'interpolation de variables d'environnement et d'autres fonctionnalités de sécurité.

**Configuration :**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Oui      | Type de hook                                              |
| `url`            | `string`                 | Oui      | URL cible                                                 |
| `headers`        | `Record<string, string>` | Non      | En-têtes de requête (prend en charge l'interpolation de variables d'environnement) |
| `allowedEnvVars` | `string[]`               | Non      | Liste blanche des variables d'environnement autorisées dans l'URL/les en-têtes |
| `timeout`        | `number`                 | Non      | Délai d'expiration en secondes, par défaut 600            |
| `name`           | `string`                 | Non      | Nom du hook (pour les journaux)                           |
| `statusMessage`  | `string`                 | Non      | Message d'état affiché pendant l'exécution                |
| `once`           | `boolean`                | Non      | Exécuter une seule fois par événement et par session (uniquement pour les hooks HTTP) |

**Fonctionnalités de sécurité :**

- **Liste blanche d'URL** : Configurez les modèles d'URL autorisés via `allowedUrls`
- **Protection SSRF** : Bloque les adresses IP privées (10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.) mais autorise les adresses de loopback (127.0.0.1, ::1)
- **Validation DNS** : Valide la résolution de domaine avant les requêtes pour prévenir les attaques par rebinding DNS
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

### Hooks de type function

Les hooks de type `function` appellent directement des fonctions JavaScript/TypeScript enregistrées. Ils sont utilisés en interne par le système Skill et ne sont pas actuellement exposés en tant qu'API publique pour les utilisateurs finaux.

**Note** : Pour la plupart des cas d'utilisation, utilisez plutôt les **hooks de type `command`** ou les **hooks de type `http`**, qui peuvent être configurés dans les fichiers de paramètres.

## Événements de hooks

Les hooks se déclenchent à des moments précis d'une session Qwen Code. Différents événements prennent en charge différents matchers pour filtrer les conditions de déclenchement.

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | Avant l'exécution d'un outil              | Nom de l'outil (`WriteFile`, `ReadFile`, `Bash`, etc.)    |
| `PostToolUse`        | Après l'exécution réussie d'un outil      | Nom de l'outil                                            |
| `PostToolUseFailure` | Après l'échec de l'exécution d'un outil   | Nom de l'outil                                            |
| `UserPromptSubmit`   | Après la soumission d'un prompt par l'utilisateur | Aucun (toujours déclenché)                          |
| `SessionStart`       | Au démarrage ou à la reprise d'une session | Source (`startup`, `resume`, `clear`, `compact`)          |
| `SessionEnd`         | À la fin d'une session                    | Raison (`clear`, `logout`, `prompt_input_exit`, etc.)     |
| `Stop`               | Lorsque l'assistant prépare la conclusion de sa réponse | Aucun (toujours déclenché)                          |
| `SubagentStart`      | Au démarrage d'un sous-agent              | Type d'agent (`Bash`, `Explorer`, `Plan`, etc.)           |
| `SubagentStop`       | À l'arrêt d'un sous-agent                 | Type d'agent                                              |
| `PreCompact`         | Avant la compaction de la conversation    | Déclencheur (`manual`, `auto`)                            |
| `Notification`       | Lors de l'envoi de notifications          | Type (`permission_prompt`, `idle_prompt`, `auth_success`) |
| `PermissionRequest`  | Lors de l'affichage de la boîte de dialogue de permission | Nom de l'outil                                  |

### Modèles de matcher

Le `matcher` est une expression régulière utilisée pour filtrer les conditions de déclenchement.

| Event Type          | Events                                                                 | Matcher Support | Matcher Target                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| Événements d'outils | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex        | Nom de l'outil : `WriteFile`, `ReadFile`, `Bash`, etc.   |
| Événements de sous-agents | `SubagentStart`, `SubagentStop`                                | ✅ Regex        | Type d'agent : `Bash`, `Explorer`, etc.                  |
| Événements de session | `SessionStart`                                                     | ✅ Regex        | Source : `startup`, `resume`, `clear`, `compact`         |
| Événements de session | `SessionEnd`                                                       | ✅ Regex        | Raison : `clear`, `logout`, `prompt_input_exit`, etc.    |
| Événements de notification | `Notification`                                                | ✅ Correspondance exacte | Type : `permission_prompt`, `idle_prompt`, `auth_success` |
| Événements de compaction | `PreCompact`                                                    | ✅ Correspondance exacte | Déclencheur : `manual`, `auto`                     |
| Événements de prompt | `UserPromptSubmit`                                                  | ❌ Non          | N/A                                                      |
| Événements d'arrêt  | `Stop`                                                               | ❌ Non          | N/A                                                      |

**Syntaxe du matcher :**

- Une chaîne vide `""` ou `"*"` correspond à tous les événements de ce type
- Syntaxe regex standard prise en charge (ex. `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

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

### Structure d'entrée du hook

Tous les hooks reçoivent une entrée standardisée au format JSON via stdin (`command`) ou le corps d'une requête POST (`http`).

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

### Structure de sortie du hook

La sortie du hook est renvoyée via `stdout` (`command`) ou le corps de la réponse HTTP (`http`) au format JSON.

**Comportement des codes de sortie (hooks `command`) :**

| Exit Code | Behavior                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | Succès. Analysez le JSON dans `stdout` pour contrôler le comportement.                |
| `2`       | **Erreur bloquante**. Ignore `stdout` et transmet `stderr` comme retour d'erreur au modèle. |
| Autre     | Erreur non bloquante. `stderr` affiché uniquement en mode debug, l'exécution se poursuit. |

**Structure de sortie :**

La sortie du hook prend en charge trois catégories de champs :

1. **Champs communs** : `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Décision de niveau supérieur** : `decision`, `reason` (utilisés par certains événements)
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

### Détails des événements de hooks individuels

#### PreToolUse

**Objectif** : Exécuté avant l'utilisation d'un outil pour permettre des vérifications de permissions, la validation des entrées ou l'injection de contexte.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Options de sortie** :

- `hookSpecificOutput.permissionDecision` : "allow", "deny" ou "ask" (OBLIGATOIRE)
- `hookSpecificOutput.permissionDecisionReason` : explication de la décision (OBLIGATOIRE)
- `hookSpecificOutput.updatedInput` : paramètres d'entrée de l'outil modifiés à utiliser à la place des originaux
- `hookSpecificOutput.additionalContext` : informations de contexte supplémentaires

**Note** : Bien que les champs de sortie standard comme `decision` et `reason` soient techniquement pris en charge par la classe sous-jacente, l'interface officielle attend `hookSpecificOutput` avec `permissionDecision` et `permissionDecisionReason`.

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Security policy blocks database writes",
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**Objectif** : Exécuté après la réussite d'un outil pour traiter les résultats, journaliser les résultats ou injecter du contexte supplémentaire.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Options de sortie** :

- `decision` : "allow", "deny" ou "block" (par défaut "allow" si non spécifié)
- `reason` : raison de la décision
- `hookSpecificOutput.additionalContext` : informations supplémentaires à inclure

**Exemple de sortie** :

```json
{
  "decision": "allow",
  "reason": "Tool executed successfully",
  "hookSpecificOutput": {
    "additionalContext": "File modification recorded in audit log"
  }
}
```

#### PostToolUseFailure

**Objectif** : Exécuté lorsqu'une exécution d'outil échoue pour gérer les erreurs, envoyer des alertes ou enregistrer les échecs.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : informations de gestion des erreurs
- Champs de sortie standard du hook

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**Objectif** : Exécuté lorsque l'utilisateur soumet un prompt pour modifier, valider ou enrichir l'entrée.

**Champs spécifiques à l'événement** :

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Options de sortie** :

- `decision` : "allow", "deny", "block" ou "ask"
- `reason` : explication lisible par un humain pour la décision
- `hookSpecificOutput.additionalContext` : contexte supplémentaire à ajouter au prompt (facultatif)

**Note** : Puisque `UserPromptSubmitOutput` étend `HookOutput`, tous les champs standard sont disponibles, mais seul `additionalContext` dans `hookSpecificOutput` est spécifiquement défini pour cet événement.

**Exemple de sortie** :

```json
{
  "decision": "allow",
  "reason": "Prompt reviewed and approved",
  "hookSpecificOutput": {
    "additionalContext": "Remember to follow company coding standards."
  }
}
```

#### SessionStart

**Objectif** : Exécuté au démarrage d'une nouvelle session pour effectuer des tâches d'initialisation.

**Champs spécifiques à l'événement** :

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : contexte à rendre disponible dans la session
- Champs de sortie standard du hook

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**Objectif** : Exécuté à la fin d'une session pour effectuer des tâches de nettoyage.

**Champs spécifiques à l'événement** :

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Options de sortie** :

- Champs de sortie standard du hook (généralement non utilisés pour le blocage)

#### Stop

**Objectif** : Exécuté avant que Qwen ne conclue sa réponse pour fournir un retour final ou des résumés.

**Champs spécifiques à l'événement** :

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**Options de sortie** :

- `decision` : "allow", "deny", "block" ou "ask"
- `reason` : explication lisible par un humain pour la décision
- `stopReason` : retour à inclure dans la réponse d'arrêt
- `continue` : définir sur false pour arrêter l'exécution
- `hookSpecificOutput.additionalContext` : informations de contexte supplémentaires

**Note** : Puisque `StopOutput` étend `HookOutput`, tous les champs standard sont disponibles, mais le champ `stopReason` est particulièrement pertinent pour cet événement.

**Exemple de sortie** :

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Objectif** : Exécuté lorsque le tour se termine en raison d'une erreur API (au lieu de `Stop`). Il s'agit d'un événement de type fire-and-forget : la sortie du hook et les codes de sortie sont ignorés.

**Champs spécifiques à l'événement** :

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher** : Correspond au champ `error`. Par exemple, `"matcher": "rate_limit"` ne se déclenchera que pour les erreurs de limite de débit.

**Options de sortie** :

- **Aucune** - `StopFailure` est de type fire-and-forget. Toute sortie du hook et les codes de sortie sont ignorés.

**Gestion des codes de sortie** :

| Exit Code | Behavior                  |
| --------- | ------------------------- |
| Tout      | Ignoré (fire-and-forget)  |

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

- Surveillance et alerte des limites de débit
- Journalisation des échecs d'authentification
- Notifications d'erreurs de facturation
- Collecte de statistiques d'erreurs

#### SubagentStart

**Objectif** : Exécuté au démarrage d'un sous-agent (comme l'outil Task) pour configurer le contexte ou les permissions.

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
- Champs de sortie standard du hook

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
- Champs de sortie standard du hook

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

**Matcher** : Correspond au champ `trigger`. Par exemple, `"matcher": "manual"` ne se déclenchera que pour une compaction manuelle via la commande `/compact`.

**Options de sortie** :

- `hookSpecificOutput.additionalContext` : contexte supplémentaire (uniquement pour la journalisation)
- Champs de sortie standard du hook (uniquement pour la journalisation)

**Note** : `PostCompact` ne figure pas dans la liste officielle des événements prenant en charge le mode de décision. Le champ `decision` et les autres champs de contrôle ne produisent aucun effet de contrôle : ils sont uniquement utilisés à des fins de journalisation.

**Gestion des codes de sortie** :

| Exit Code | Behavior                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Succès - `stdout` affiché à l'utilisateur en mode verbeux |
| Autre     | Erreur non bloquante - `stderr` affiché à l'utilisateur en mode verbeux |

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

- Archivage des résumés dans des fichiers ou des bases de données
- Suivi des statistiques d'utilisation
- Surveillance des changements de contexte
- Journalisation d'audit pour les opérations de compaction

#### Notification

**Objectif** : Exécuté lors de l'envoi de notifications pour les personnaliser ou les intercepter.

**Champs spécifiques à l'événement** :

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Note** : Le type `elicitation_dialog` est défini mais n'est pas actuellement implémenté.

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

**Objectif** : Exécuté lors de l'affichage des boîtes de dialogue de permission pour automatiser les décisions ou mettre à jour les permissions.

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

- `hookSpecificOutput.decision` : objet structuré contenant les détails de la décision de permission :
  - `behavior` : "allow" ou "deny"
  - `updatedInput` : entrée d'outil modifiée (facultatif)
  - `updatedPermissions` : permissions modifiées (facultatif)
  - `message` : message à afficher à l'utilisateur (facultatif)
  - `interrupt` : indique s'il faut interrompre le flux de travail (facultatif)

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

## Configuration des hooks

Les hooks sont configurés dans les paramètres de Qwen Code, généralement dans `.qwen/settings.json` ou dans les fichiers de configuration utilisateur :

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

- Ne peut pas renvoyer de contrôle de décision (l'opération a déjà eu lieu)
- Les résultats sont injectés lors du prochain tour de conversation via `systemMessage` ou `additionalContext`
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

- Les hooks s'exécutent dans l'environnement de l'utilisateur avec ses privilèges
- Les hooks au niveau du projet nécessitent un statut de dossier de confiance
- Les délais d'expiration empêchent les hooks de rester bloqués (par défaut : 60 secondes)

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

Configuration dans `.qwen/settings.json` :

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

Un hook HTTP `PostToolUse` qui envoie tous les enregistrements d'exécution d'outils à un service d'audit distant :

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

### Exemple 3 : Hook de validation de prompt utilisateur

Un hook `UserPromptSubmit` qui valide les prompts utilisateur pour détecter les informations sensibles et fournit un contexte pour les prompts longs :

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

- Consultez les journaux de l'application pour obtenir des détails sur l'exécution des hooks
- Vérifiez les permissions et l'exécutabilité des scripts de hook
- Assurez-vous du formatage JSON correct dans les sorties des hooks
- Utilisez des modèles de matcher spécifiques pour éviter l'exécution involontaire de hooks
- Utilisez le mode `--debug` pour voir les informations détaillées sur la correspondance et l'exécution des hooks
- Désactivez temporairement tous les hooks : ajoutez `"disableAllHooks": true` dans les paramètres
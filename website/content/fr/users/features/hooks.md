# Documentation des hooks Qwen Code

## Vue d'ensemble

Les hooks Qwen Code offrent un mécanisme puissant pour étendre et personnaliser le comportement de l'application Qwen Code. Les hooks permettent aux utilisateurs d'exécuter des scripts ou programmes personnalisés à des points précis du cycle de vie de l'application, comme avant l'exécution d'un outil, après l'exécution d'un outil, au début/à la fin d'une session, et lors d'autres événements clés.

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

Les hooks sont des scripts ou programmes définis par l'utilisateur qui sont automatiquement exécutés par Qwen Code à des points prédéfinis du flux de l'application. Ils permettent aux utilisateurs de :

- Surveiller et auditer l'utilisation des outils
- Appliquer des politiques de sécurité
- Injecter du contexte supplémentaire dans les conversations
- Personnaliser le comportement de l'application en fonction des événements
- S'intégrer à des systèmes et services externes
- Modifier les entrées ou les réponses des outils par programmation

## Architecture des hooks

Le système de hooks de Qwen Code se compose de plusieurs composants clés :

1. **Hook Registry** : Stocke et gère tous les hooks configurés
2. **Hook Planner** : Détermine quels hooks doivent s'exécuter pour chaque événement
3. **Hook Runner** : Exécute les hooks individuels avec le contexte approprié
4. **Hook Aggregator** : Combine les résultats de plusieurs hooks
5. **Hook Event Handler** : Coordonne le déclenchement des hooks pour les événements

## Événements de hooks

Les hooks se déclenchent à des moments précis d'une session Qwen Code. Lorsqu'un événement se produit et qu'un matcher correspond, Qwen Code transmet un contexte JSON sur l'événement à votre gestionnaire de hook. Pour les hooks de commande, l'entrée arrive sur stdin. Votre gestionnaire peut inspecter l'entrée, effectuer une action et éventuellement renvoyer une décision. Certains événements se déclenchent une fois par session, tandis que d'autres se répètent à l'intérieur de la boucle agentique.

<div align="center">
<img src="https://img.alicdn.com/imgextra/i4/O1CN01sYWUTh1RDJl7Lz2ne_!!6000000002077-2-tps-812-1212.png" alt="Hook Lifecycle Diagram" width="400"/>
</div>

Le tableau suivant répertorie tous les événements de hooks disponibles dans Qwen Code :

| Event Name           | Description                                 | Use Case                                        |
| -------------------- | ------------------------------------------- | ----------------------------------------------- |
| `PreToolUse`         | Déclenché avant l'exécution d'un outil                 | Vérification des permissions, validation des entrées, journalisation  |
| `PostToolUse`        | Déclenché après l'exécution réussie d'un outil       | Journalisation, traitement des sorties, surveillance          |
| `PostToolUseFailure` | Déclenché en cas d'échec d'exécution d'un outil             | Gestion des erreurs, alertes, remédiation           |
| `Notification`       | Déclenché lors de l'envoi de notifications           | Personnalisation des notifications, journalisation             |
| `UserPromptSubmit`   | Déclenché lorsque l'utilisateur soumet un prompt            | Traitement des entrées, validation, injection de contexte |
| `SessionStart`       | Déclenché au démarrage d'une nouvelle session             | Initialisation, configuration du contexte                   |
| `Stop`               | Déclenché avant que Qwen ne conclue sa réponse    | Finalisation, nettoyage                           |
| `SubagentStart`      | Déclenché au démarrage d'un sous-agent                | Initialisation du sous-agent                         |
| `SubagentStop`       | Déclenché à l'arrêt d'un sous-agent                 | Finalisation du sous-agent                           |
| `PreCompact`         | Déclenché avant la compaction de la conversation        | Traitement pré-compaction                       |
| `SessionEnd`         | Déclenché à la fin d'une session                   | Nettoyage, rapports                              |
| `PermissionRequest`  | Déclenché lors de l'affichage des boîtes de dialogue de permission | Automatisation des permissions, application des politiques       |

## Règles d'entrée/sortie

### Structure d'entrée des hooks

Tous les hooks reçoivent une entrée standardisée au format JSON via stdin. Les champs communs inclus dans chaque événement de hook sont :

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

Des champs spécifiques à l'événement sont ajoutés en fonction du type de hook. Voici les champs spécifiques pour chaque événement de hook :

### Détails des événements de hook individuels

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

- `hookSpecificOutput.permissionDecision`: `"allow"`, `"deny"` ou `"ask"` (OBLIGATOIRE)
- `hookSpecificOutput.permissionDecisionReason`: explication de la décision (OBLIGATOIRE)
- `hookSpecificOutput.updatedInput`: paramètres d'entrée de l'outil modifiés à utiliser à la place de l'original
- `hookSpecificOutput.additionalContext`: informations de contexte supplémentaires

**Remarque** : Bien que les champs de sortie standard des hooks comme `decision` et `reason` soient techniquement pris en charge par la classe sous-jacente, l'interface officielle attend `hookSpecificOutput` avec `permissionDecision` et `permissionDecisionReason`.

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "My reason here",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**Objectif** : Exécuté après l'exécution réussie d'un outil pour traiter les résultats, journaliser les résultats ou injecter du contexte supplémentaire.

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

- `decision`: `"allow"`, `"deny"`, `"block"` (vaut `"allow"` par défaut si non spécifié)
- `reason`: raison de la décision
- `hookSpecificOutput.additionalContext`: informations supplémentaires à inclure

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

- `hookSpecificOutput.additionalContext`: informations de gestion des erreurs
- Champs de sortie standard des hooks

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

- `decision`: `"allow"`, `"deny"`, `"block"` ou `"ask"`
- `reason`: explication lisible par un humain pour la décision
- `hookSpecificOutput.additionalContext`: contexte supplémentaire à ajouter au prompt (facultatif)

**Remarque** : Puisque `UserPromptSubmitOutput` étend `HookOutput`, tous les champs standard sont disponibles, mais seul `additionalContext` dans `hookSpecificOutput` est spécifiquement défini pour cet événement.

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

- `hookSpecificOutput.additionalContext`: contexte à rendre disponible dans la session
- Champs de sortie standard des hooks

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

- Champs de sortie standard des hooks (généralement non utilisés pour le blocage)

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

- `decision`: `"allow"`, `"deny"`, `"block"` ou `"ask"`
- `reason`: explication lisible par un humain pour la décision
- `stopReason`: retour à inclure dans la réponse d'arrêt
- `continue`: définir sur `false` pour arrêter l'exécution
- `hookSpecificOutput.additionalContext`: informations de contexte supplémentaires

**Remarque** : Puisque `StopOutput` étend `HookOutput`, tous les champs standard sont disponibles, mais le champ `stopReason` est particulièrement pertinent pour cet événement.

**Exemple de sortie** :

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

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

- `hookSpecificOutput.additionalContext`: contexte initial pour le sous-agent
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

- `decision`: `"allow"`, `"deny"`, `"block"` ou `"ask"`
- `reason`: explication lisible par un humain pour la décision

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

- `hookSpecificOutput.additionalContext`: contexte à inclure avant la compaction
- Champs de sortie standard des hooks

**Exemple de sortie** :

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

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

> **Remarque** : Le type `elicitation_dialog` est défini mais n'est pas encore implémenté.

**Options de sortie** :

- `hookSpecificOutput.additionalContext`: informations supplémentaires à inclure
- Champs de sortie standard des hooks

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

- `hookSpecificOutput.decision`: objet structuré contenant les détails de la décision de permission :
  - `behavior`: `"allow"` ou `"deny"`
  - `updatedInput`: entrée de l'outil modifiée (facultatif)
  - `updatedPermissions`: permissions modifiées (facultatif)
  - `message`: message à afficher à l'utilisateur (facultatif)
  - `interrupt`: indique s'il faut interrompre le flux de travail (facultatif)

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

Les hooks sont configurés dans les paramètres de Qwen Code, généralement dans `.qwen/settings.json` ou les fichiers de configuration utilisateur :

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$", // Regex to match tool names
        "sequential": false, // Whether to run hooks sequentially
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
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

### Modèles de matcher (Matcher Patterns)

Les matchers permettent de filtrer les hooks en fonction du contexte. Tous les événements de hook ne prennent pas en charge les matchers :

| Event Type          | Events                                                                 | Matcher Support | Matcher Target (Values)                                                                |
| ------------------- | ---------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| Tool Events         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Yes (regex)  | Tool name: `bash`, `read_file`, `write_file`, `edit`, `glob`, `grep_search`, etc.      |
| Subagent Events     | `SubagentStart`, `SubagentStop`                                        | ✅ Yes (regex)  | Agent type: `Bash`, `Explorer`, etc.                                                   |
| Session Events      | `SessionStart`                                                         | ✅ Yes (regex)  | Source: `startup`, `resume`, `clear`, `compact`                                        |
| Session Events      | `SessionEnd`                                                           | ✅ Yes (regex)  | Reason: `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| Notification Events | `Notification`                                                         | ✅ Yes (exact)  | Type: `permission_prompt`, `idle_prompt`, `auth_success`                               |
| Compact Events      | `PreCompact`                                                           | ✅ Yes (exact)  | Trigger: `manual`, `auto`                                                              |
| Prompt Events       | `UserPromptSubmit`                                                     | ❌ No           | N/A                                                                                    |
| Stop Events         | `Stop`                                                                 | ❌ No           | N/A                                                                                    |

**Syntaxe des matchers** :

- Modèle regex comparé au champ cible
- La chaîne vide `""` ou `"*"` correspond à tous les événements de ce type
- Syntaxe regex standard prise en charge (ex. `^bash$`, `read.*`, `(bash|run_shell_command)`)

**Exemples** :

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$",           // Only match bash tool
        "hooks": [...]
      },
      {
        "matcher": "read.*",           // Match read_file, read_multiple_files, etc.
        "hooks": [...]
      },
      {
        "matcher": "",                 // Match all tools (same as "*" or omitting matcher)
        "hooks": [...]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$", // Only match Bash and Explorer agents
        "hooks": [...]
      }
    ],
    "SessionStart": [
      {
        "matcher": "^(startup|resume)$", // Only match startup and resume sources
        "hooks": [...]
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

### Modèle de sécurité

- Les hooks s'exécutent dans l'environnement de l'utilisateur avec ses privilèges
- Les hooks au niveau du projet nécessitent un statut de dossier de confiance
- Les délais d'expiration empêchent les hooks de rester bloqués (par défaut : 60 secondes)

### Codes de sortie

Les scripts de hooks communiquent leur résultat via des codes de sortie :

| Exit Code | Meaning            | Behavior                                        |
| --------- | ------------------ | ----------------------------------------------- |
| `0`       | Success            | stdout/stderr not shown                         |
| `2`       | Blocking error     | Show stderr to model and block tool call        |
| Other     | Non-blocking error | Show stderr to user only but continue tool call |

**Exemples** :

```bash
#!/bin/bash

# Success (exit 0 is default, can be omitted)
echo '{"decision": "allow"}'
exit 0

# Blocking error - prevents operation
echo "Dangerous operation blocked by security policy" >&2
exit 2
```

> **Remarque** : Si aucun code de sortie n'est spécifié, le script utilise `0` (succès) par défaut.

## Bonnes pratiques

### Exemple 1 : Hook de validation de sécurité

Un hook PreToolUse qui journalise et bloque potentiellement les commandes dangereuses :

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
    "decision": "deny",
    "reason": "Potentially dangerous operation detected",
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Dangerous command blocked by security policy"
    }
  }'
  exit 2  # Blocking error
fi

# Allow the operation with a log
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "decision": "allow",
  "reason": "Operation approved by security checker",
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

### Exemple 2 : Hook de validation de prompt utilisateur

Un hook UserPromptSubmit qui valide les prompts utilisateur pour détecter des informations sensibles et fournit du contexte pour les prompts longs :

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
- Vérifiez les permissions et l'exécutabilité des scripts de hooks
- Assurez-vous du formatage JSON correct dans les sorties des hooks
- Utilisez des modèles de matcher spécifiques pour éviter l'exécution involontaire de hooks
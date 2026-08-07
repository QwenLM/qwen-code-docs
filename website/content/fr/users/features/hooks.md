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
        "matcher": "write_file",
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

#### Autoriser les hooks vers le réseau privé (environnements managés uniquement)

Par défaut, les HTTP hooks ne peuvent pas cibler des plages IP privées ou link-local. Dans les environnements gérés par une plateforme où le récepteur de hook est un endpoint interne premier parti, VPC (par exemple, une passerelle API interne résolue vers `172.16.0.0/12`), vous pouvez assouplir les vérifications de plage IP avec :

```json
{
  "security": {
    "allowPrivateNetworkHooks": true
  }
}
```

- Ce paramètre est **uniquement honoré depuis les scopes de paramètres User, System et SystemDefaults**. Une valeur définie dans les paramètres Workspace (projet) est ignorée et journalisée comme un avertissement, afin qu'un dépôt cloné ne puisse jamais s'accorder lui-même ce contournement.
- Le flag assouplit uniquement les vérifications de **plage** privées/CGNAT/link-local générales. Les endpoints de métadonnées cloud restent bloqués dans toutes les configurations : la liste `BLOCKED_HOSTS` est comparée littéralement (`metadata.google.internal`, `metadata.azure.internal`, ...), et les IP de métadonnées `169.254.169.254` et `100.100.100.200` sont bloquées sous toutes leurs formes sérialisées (y compris IPv4-mapped IPv6 comme `::ffff:a9fe:a9fe`) et après résolution DNS.
- La liste blanche `security.allowedHttpHookUrls` s'applique toujours indépendamment. Dans les environnements managés, associez ce flag à une liste blanche pour que seuls les endpoints internes souhaités soient accessibles.

> **Avertissement :** Activer ce flag permet aux hooks d'atteindre l'infrastructure interne de votre réseau. Activez-le uniquement dans des paramètres gérés et fiables — jamais dans un dépôt que vous ne contrôlez pas.

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

**Exemple : Adaptateur de service de jugement externe**

La configuration `remote-security-check` ci-dessus suppose que `http://127.0.0.1:8080/hooks/pre-tool-use`
exécute déjà un service qui respecte ce contrat (POST `{tool_name, tool_input, ...}` en entrée,
`hookSpecificOutput.permissionDecision` en sortie). Voici un adaptateur minimal, stdlib uniquement, qui
complète cette partie manquante, câblé à un backend de jugement concret pour que l'ensemble soit
exécutable et testable de bout en bout plutôt qu'un simple stub. Seule la fonction `review()` est
spécifique au backend — échangez son corps et la forme de requête/réponse pour le service que vous
utilisez ; tout le reste (le serveur, la gestion fail-open, la forme de réponse du hook) reste
identique quel que soit le backend.

_Divulgation : le backend utilisé ci-dessous, [invinoveritas](https://api.babyblueviper.com), est un
service auquel l'auteur est affilié — utilisé ici parce que c'était le seul qui pouvait être
vérifié de bout en bout pour cet exemple, pas une endorsement. Tout service HTTP renvoyant un
verdict JSON fonctionne tout aussi bien ; seule `review()` doit changer._

_Traitement des données : avec `matcher: "*"`, le `tool_input` complet de **chaque** appel d'outil
est envoyé au backend de jugement — traitez cette entrée comme sensible (elle peut contenir du
contenu de fichiers, des chemins ou des secrets). Restreignez le matcher (par ex. à
`run_shell_command`) si vous n'avez besoin de juger que les commandes shell._

```python
#!/usr/bin/env python3
# judgment_hook.py -- run: JUDGMENT_API_KEY=... python3 judgment_hook.py
import json, os, sys, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

JUDGMENT_API_KEY = os.environ["JUDGMENT_API_KEY"]
JUDGMENT_URL = os.environ.get("JUDGMENT_URL", "https://api.babyblueviper.com/review")

def review(tool_name, tool_input):
    """POST the call to the judgment backend and return its verdict. This is the
    one function to change for a different backend -- request/response shape
    below matches invinoveritas's /review; adapt both to your own backend's
    contract if you swap it out."""
    body = json.dumps({
        "artifact": json.dumps({"tool_name": tool_name, "tool_input": tool_input}),
        "artifact_type": "shell_command" if tool_name in ("run_shell_command", "shell") else "general",
        "context": f"qwen-code PreToolUse: {tool_name}",
    }).encode()
    req = urllib.request.Request(
        JUDGMENT_URL, data=body,
        headers={"Authorization": f"Bearer {JUDGMENT_API_KEY}", "Content-Type": "application/json"},
    )
    # Keep this below the HTTP hook's own timeout (10s in the config above), so a "deny"
    # verdict is always returned before the hook gives up and fails open on its own.
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read())  # response includes a "verdict" field: "reject" denies, anything else allows

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        tool_name, tool_input = payload.get("tool_name", "unknown"), payload.get("tool_input", {})
        try:
            verdict = review(tool_name, tool_input)
            decision = "deny" if verdict.get("verdict") == "reject" else "allow"
            reason = verdict.get("summary", f"judgment verdict: {verdict.get('verdict')}")
        except Exception as e:
            decision, reason = "allow", "judgment backend unavailable, failing open"  # never block on a review-side outage
            print(f"judgment backend unavailable for {tool_name}, failing open: {e}", file=sys.stderr)
        out = {"continue": True, "decision": decision, "hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": decision, "permissionDecisionReason": reason,
        }}
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
```

Testé de bout en bout en conditions réelles avec l'API de production ci-dessus : une entrée
réellement destructive (`{"tool_name": "run_shell_command", "tool_input": {"command": "rm -rf /important_data"}}`)
a renvoyé `permissionDecision: "deny"` avec une vraie explication ; une entrée bénigne (`ls -la`)
a renvoyé `"allow"`. Fail-open sur tout problème de réseau/timeout/réponse malformée du backend
de jugement, afin qu'une panne ne bloque jamais les appels d'outil légitimes — même discipline
que les exemples de `command` hooks ci-dessus appliquent avec leurs propres codes de sortie.

### Function Hooks

Les function hooks appellent directement des fonctions JavaScript/TypeScript enregistrées. Ils sont utilisés en interne par le système de Skills et ne sont actuellement pas exposés en tant qu'API publique pour les utilisateurs finaux.

**Remarque** : Pour la plupart des cas d'usage, utilisez plutôt des **command hooks** ou des **HTTP hooks**, qui peuvent être configurés dans les fichiers de paramètres.

### Prompt Hooks

Les prompt hooks utilisent un LLM pour évaluer l'entrée du hook et renvoyer une décision. Cela s'avère utile pour prendre des décisions intelligentes basées sur le contexte, comme déterminer s'il faut autoriser ou bloquer une opération.

> **Traitement des données :** Un prompt hook envoie son entrée d'événement au fournisseur de modèle configuré. Lorsque la journalisation de debug basée sur les fichiers est activée, la requête entièrement développée du prompt-hook est également écrite dans le log de debug de la session. Traitez l'entrée du hook et les logs de debug comme potentiellement sensibles.

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
- `SubagentStop` - Évalue les résultats des sous-agents
- `UserPromptSubmit` - Évalue ou enrichit les prompts éligibles liés au modèle

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
        "matcher": "run_shell_command",
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

| Event                | Triggered When                                  | Matcher Target                                                 |
| :------------------- | :---------------------------------------------- | :------------------------------------------------------------- |
| `PreToolUse`         | Avant l'exécution de l'outil                    | ID de l'outil (`write_file`, `read_file`, `run_shell_command`, etc.) |
| `PostToolUse`        | Après l'exécution réussie de l'outil            | ID de l'outil                                                  |
| `PostToolUseFailure` | Après l'échec de l'exécution de l'outil         | ID de l'outil                                                  |
| `UserPromptSubmit`   | Avant les invocations de modèle prises en charge | Aucun                                                          |
| `SessionStart`       | Lorsque la session démarre ou reprend           | Source (`startup`, `resume`, `clear`, `compact`)               |
| `SessionEnd`         | Lorsque la session se termine                   | Raison (`clear`, `logout`, `prompt_input_exit`, etc.)          |
| `SessionDelete`      | Après la suppression explicite d'une session    | Aucun                                                          |
| `MessageDisplay`     | Répétitivement, pendant le streaming de la réponse | Aucun (se déclenche toujours)                                |
| `Stop`               | Lorsque Qwen se prépare à conclure sa réponse   | Aucun (se déclenche toujours)                                  |
| `SubagentStart`      | Lorsque le sous-agent démarre                   | Type d'agent (`Bash`, `Explorer`, `Plan`, etc.)                |
| `SubagentStop`       | Lorsque le sous-agent s'arrête                  | Type d'agent                                                   |
| `PreCompact`         | Avant la compaction de la conversation          | Déclencheur (`manual`, `auto`)                                 |
| `Notification`       | Lorsque des notifications sont envoyées         | Type (`permission_prompt`, `idle_prompt`, `auth_success`)      |
| `PermissionRequest`  | Lorsque la boîte de dialogue de permission s'affiche | ID de l'outil                                            |
| `PermissionDenied`   | Lorsque la permission d'un outil est refusée    | ID de l'outil                                                  |
| `TodoCreated`        | Lorsqu'un nouvel élément todo est créé          | Aucun (se déclenche toujours)                                  |
| `TodoCompleted`      | Lorsqu'un élément todo est marqué comme terminé | Aucun (se déclenche toujours)                                  |
### Patterns de matcher

`matcher` est une expression régulière utilisée pour filtrer les conditions de déclenchement.

| Type d'événement    | Événements                                                                               | Support du matcher | Cible du matcher                                                 |
| :------------------ | :--------------------------------------------------------------------------------------- | :----------------- | :--------------------------------------------------------------- |
| Événements d'outils | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` | ✅ Regex           | ID de l'outil : `write_file`, `read_file`, `run_shell_command`, etc. |
| Événements de sous-agent | `SubagentStart`, `SubagentStop`                                                     | ✅ Regex           | Type d'agent : `Bash`, `Explorer`, etc.                          |
| Événements de session | `SessionStart`                                                                         | ✅ Regex           | Source : `startup`, `resume`, `clear`, `compact`                 |
| Événements de session | `SessionEnd`                                                                           | ✅ Regex           | Raison : `clear`, `logout`, `prompt_input_exit`, etc.            |
| Événements de session | `SessionDelete`                                                                        | ❌ Non             | N/A                                                              |
| Événements de notification | `Notification`                                                                    | ✅ Correspondance exacte | Type : `permission_prompt`, `idle_prompt`, `auth_success`         |
| Événements de compactage | `PreCompact`                                                                        | ✅ Correspondance exacte | Déclencheur : `manual`, `auto`                                    |
| Événements Todo     | `TodoCreated`, `TodoCompleted`                                                           | ❌ Non             | N/A                                                              |
| Événements de prompt | `UserPromptSubmit`                                                                      | ❌ Non             | N/A                                                              |
| Événements d'arrêt  | `Stop`                                                                                   | ❌ Non             | N/A                                                              |
| Affichage de message | `MessageDisplay`                                                                        | ❌ Non             | N/A                                                              |

**Syntaxe du matcher :**

- Une chaîne vide `""` ou `"*"` correspond à tous les événements de ce type
- Syntaxe regex standard prise en charge (par ex., `^run_shell_command$`, `read_.*`, `(write_file|edit)`)
- Les hooks d'outil reçoivent l'ID d'outil runtime dans `tool_name` (par exemple, `write_file`). Les noms d'affichage intégrés tels que `WriteFile` et `ReadFile` sont également acceptés comme alias de matcher pour la compatibilité, mais les nouvelles configurations devraient préférer les IDs runtime.

**Exemples :**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "write_.*",
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

Tous les exécuteurs de hooks reçoivent l'entrée d'événement standardisée. La limite de livraison dépend de l'exécuteur :

| Type de hook | Destinataire de l'entrée                                    |
| :----------- | :---------------------------------------------------------- |
| `command`    | Processus enfant via JSON sur `stdin`                       |
| `http`       | Endpoint configuré via un corps `POST` JSON                 |
| `function`   | Callback de confiance in-process                            |
| `prompt`     | Fournisseur de modèle configuré après remplacement de `$ARGUMENTS` |

Les function hooks sont du code de confiance s'exécutant dans le processus Qwen. Ils reçoivent un objet in-process, donc les champs ne doivent pas être traités comme immuables face à un function hook.

Qwen ne contrôle pas si un processus de hook, un endpoint, un callback ou un fournisseur de modèle conserve ou transmet son entrée. Consultez la politique de traitement des données de chaque exécuteur configuré.

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

L'entrée des hooks est un contrat JSON extensible vers l'avant : de nouveaux champs optionnels peuvent être ajoutés aux événements existants. Les consommateurs doivent ignorer les champs inconnus. Un décodeur strict qui rejette les propriétés inconnues doit être mis à jour pour autoriser explicitement chaque nouveau champ optionnel avant de mettre à jour Qwen Code. Pour les hooks sensibles à la sécurité, une défaillance de décodeur peut modifier le comportement fail-open ou fail-closed, donc les administrateurs doivent valider le payload mis à jour face au hook déployé avant le déploiement.

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

**Objectif** : Exécuté avant les invocations de modèle prises en charge pour valider, bloquer ou enrichir le prompt lié au modèle actuel. L'événement couvre actuellement les envois `UserQuery`, `ToolResult` et `Hook`, tandis que les envois `Retry`, `Steer`, `Cron`, `Notification` et `Teammate` sont ignorés. Il peut donc se produire sur des chemins de continuation, et `prompt` ne doit pas être considéré comme une entrée utilisateur brute.

**Champs spécifiques à l'événement** :

```json
{
  "prompt": "prompt lié au modèle actuel pour cette invocation de hook",
  "submitted_prompt": "texte utilisateur optionnel capturé à une limite de soumission TUI interactive prise en charge"
}
```

`submitted_prompt` est optionnel. Il n'est présent que lorsque Qwen peut transporter la provenance d'une soumission TUI interactive prise en charge vers un fresh `UserQuery`. Il est omis pour les producteurs non pris en charge et les chemins pilotés par machine tels que le steering dans le même tour, les continuations de résultats d'outils, les retries, les cron, les notifications et le trafic teammate. Les chemins ACP, headless, `serve`, SDK et d'entrée distante ne le produisent pas dans cette version.

Les entrées différées peuvent conserver le champ lorsque leur provenance reste complète. Un batch combiné ne conserve la provenance que lorsque chaque élément constitutif la possède ; une entrée éditée, partiellement connue ou autrement ambiguë omet le champ. La navigation dans l'historique des prompts/shell, les correspondances de recherche sélectionnées, les restaurations de stash post-redémarrage et les restaurations de rewind de conversation l'omettent également car ces chemins peuvent faire surface du texte lié au modèle sans sa provenance originale. Les consommateurs qui nécessitent du texte soumis par l'utilisateur doivent traiter l'absence comme indisponible plutôt que de revenir à `prompt`.

Après que l'entrée liée au modèle restaurée ou sans provenance est effacée ou soumise, le composer efface également son historique d'annulation et de rétablissement. Cela empêche l'annulation de restaurer du texte développé après que son marqueur ou sidecar a été consommé.

Les placeholders de collage volumineux restent compacts dans `submitted_prompt` ; le contenu collé développé apparaît uniquement dans `prompt`. Les consommateurs doivent traiter le champ comme une projection de texte TUI plutôt qu'un enregistrement byte-for-byte de l'entrée du presse-papiers.

Toute entrée non vide présente lorsque le mode Vim est activé omet `submitted_prompt`, y compris après la désactivation de Vim, car les registres Vim ne transportent pas la provenance dans cette version. Cette règle conservative couvre également les brouillons saisis avant l'activation de Vim. Effacer le composer démarre une nouvelle entrée éligible.

Ce champ est de la provenance, pas de l'authentification, de l'identité tenant, de l'autorisation ou du DLP. Ce sont des données fournies par l'appelant. Chaque exécuteur configuré pour cet événement les reçoit ; en particulier, les HTTP hooks les envoient à leur endpoint et les prompt hooks les envoient à leur fournisseur de modèle.

Lorsque les deux champs sont présents, les payloads de prompt-hook contiennent du texte qui se chevauche et peuvent consommer des tokens d'entrée de modèle supplémentaires. Il n'y a pas de suppression de champ par hook dans cette version.

Les hooks UserPromptSubmit séquentiels peuvent ajouter du `additionalContext` à `prompt` ; `submitted_prompt` continue de représenter la soumission capturée. Les function hooks sont du code de confiance dans le même processus et ne sont pas contraints par une garantie d'immutabilité.

Lorsqu'il est envoyé au modèle, l'`additionalContext` injecté est ajouté comme sa propre partie de message encapsulée dans une balise réservée `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>`, afin qu'il reste distinguable du texte rédigé par l'utilisateur dans l'historique du modèle et les transcriptions de session. Les crochets angulaires dans la sortie du hook sont échappés avant l'encapsulation, donc le contenu du hook ne peut pas fermer ou falsifier la balise. La transcription de session enregistre également le texte original du prompt de l'utilisateur séparément ; le TUI interactif et le chemin de replay de transcription ACP/export affichent ce texte original plutôt que le contexte injecté.

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

#### SessionDelete

**Objectif** : S'exécute après qu'une session explicitement sélectionnée a été supprimée de manière permanente. Cet événement est fire-and-forget : la sortie et les échecs ne peuvent pas annuler la suppression.

**Champs spécifiques à l'événement** :

```json
{
  "deleted_session_id": "la session qui a été supprimée"
}
```

Le hook utilise les champs de session normaux du runtime qui supprime (`session_id`, `transcript_path` et `cwd`) ; via ACP, `transcript_path` est vide car le runtime qui supprime n'a pas sa propre transcription. `SessionDelete` se déclenche actuellement pour le flux interactif `/delete` et la méthode `deleteSession` explicite d'ACP ; la suppression par lot REST du démon et le nettoyage interne ne l'émettent pas.

#### MessageDisplay

**Objectif** : Se déclenche de manière répétée pendant le streaming de la réponse de l'assistant — avant `Stop`, qui se déclenche une fois à la fin du tour. Utile pour la narration en direct, la journalisation incrémentale ou tout consommateur qui veut réagir à la réponse pendant son écriture plutôt qu'après coup. C'est un événement **fire-and-forget** - la sortie du hook et les codes de sortie sont ignorés.

**Champs spécifiques à l'événement** :

```json
{
  "message_id": "ID stable pour l'ensemble du message streamé",
  "displayed_text": "le texte CUMULATIF streamé jusqu'ici pour ce message (pas un delta)",
  "is_final": "true lors du dernier déclenchement pour ce message, false sinon"
}
```

`displayed_text` est cumulatif plutôt qu'un delta pour que les scripts de hook n'aient jamais besoin de réassembler les morceaux eux-mêmes — chaque déclenchement porte le texte complet jusqu'ici. Le déclenchement est debounce (au maximum toutes les ~200ms) sauf pour le dernier déclenchement (`is_final: true`), qui se déclenche toujours une fois le message terminé, donc la fin de la réponse n'est jamais perdue en attendant la fenêtre de debounce.

**Sémantique de livraison** — ce sur quoi un script de hook peut compter :

- **Les hooks lents voient moins de payloads, plus récents.** Au maximum une exécution de hook mid-stream par message est en cours à la fois ; pendant qu'une s'exécute, les nouveaux payloads debounce _remplacent_ celui en file d'attente plutôt que de s'accumuler derrière. Un hook plus lent que la fenêtre de debounce saute donc les snapshots intermédiaires — sans perte, puisque chaque payload porte le texte cumulatif complet.
- **`is_final` n'est jamais mis en file d'attente derrière une livraison obsolète.** Le payload final est distribué au moment où le message se termine — aux côtés d'une exécution mid-stream encore en cours s'il y en a une (la seule exception à la règle une-à-la-fois, justifiée de la même manière : le texte cumulatif final remplace strictement ce que cette exécution traite). Votre hook reçoit toujours le payload `is_final`, et le reçoit avant que le hook `Stop` se déclenche. Une conséquence pour les hooks à état : lorsque l'exécution finale chevauche une exécution mid-stream supersédée, leur ordre de _complétion_ est non spécifié — l'exécution obsolète peut se terminer après la finale (même après `Stop`). Traitez `is_final` comme terminal par `message_id` et laissez le texte cumulatif gagner, plutôt que de supposer que la dernière exécution à se terminer porte l'état le plus récent.
- **Le tour attend que la livraison `is_final` se termine — mais pas indéfiniment.** La fin du tour (et le hook `Stop`, quand il se déclenche) attend jusqu'à 5 secondes que la livraison finale se termine. Un hook qui se termine dans ce budget conserve la garantie la plus forte : une exécution headless (`qwen -p ...`) quitte seulement après que le hook s'est terminé, et l'exécution `is_final` se termine avant que `Stop` ne démarre. Un hook plus lent reçoit toujours `is_final` en premier — seule l'attente de sa complétion est bornée : dans le TUI ou une session ACP, l'exécution se termine simplement en arrière-plan, tandis qu'une exécution headless quitte sans attendre. Le processus de hook n'est pas tué à la sortie ; il est laissé se terminer de lui-même, donc un script enchaînant `qwen -p … && next-step` peut observer `next-step` démarrer pendant qu'un hook lent est encore en cours d'exécution. Atteindre ce timeout affiche un avertissement sur stderr.
- **Le comportement d'annulation dépend du timing.** Un tour annulé _avant les dispatchs `is_final`_ ne déclenche pas de `is_final` — le message est traité comme abandonné, et un consommateur qui bufferise jusqu'à `is_final` doit traiter le silence d'annulation comme son signal de flush/discard (par ex. un fallback de timeout). Le critère est l'état du signal d'abort au moment où le tour se termine, pas si chaque chunk avait déjà streamé — un abort arrivant dans le bref intervalle avant cette vérification peut encore supprimer `is_final` pour un message dont le texte était, en pratique, arrivé à complétion. Annuler _après que `is_final` a été distribué_ (pendant l'attente de drain) est différent : l'exécution de hook encore en cours peut être terminée en plein vol (SIGTERM), mais le payload lui-même a déjà été livré.
- **`displayed_text` est provisoire jusqu'à `is_final`.** Il reflète ce qui a été streamé jusqu'ici ; traitez les payloads intermédiaires comme un état d'affichage, pas comme du contenu final faisant autorité.
- **Un tour utilisant des outils produit plusieurs messages.** Chaque appel de modèle obtient son propre `message_id` avec son propre déclenchement `is_final: true` : le texte avant un appel d'outil est un message, la continuation après le résultat de l'outil en est un autre. Les appels de modèle qui ne produisent pas de texte affiché (uniquement des appels d'outils) ne déclenchent rien.

**Remarque** : Se déclenche dans le TUI, le mode headless (`-p`) et les sessions ACP (IDE/éditeur/`qwen serve`), avec le même contrat de payload sur chaque surface.

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

**Objectif** : Exécuté lorsque le tour se termine en raison d'une erreur API ou d'une détection de boucle (au lieu de Stop). Il s'agit d'un événement **fire-and-forget** - la sortie du hook et les codes de sortie sont ignorés.

**Champs spécifiques à l'événement** :

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | loop_detected | unknown",
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
        "matcher": "^run_shell_command$",
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
        "matcher": "write_file|edit",
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
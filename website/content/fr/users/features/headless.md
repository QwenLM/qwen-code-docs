# Mode Headless

Le mode headless vous permet d'exécuter Qwen Code de manière programmatique depuis des scripts en ligne de commande et des outils d'automatisation, sans aucune interface interactive. C'est idéal pour le scripting, l'automatisation, les pipelines CI/CD et la création d'outils basés sur l'IA.

## Vue d'ensemble

Le mode headless fournit une interface headless à Qwen Code qui :

- Accepte les prompts via des arguments en ligne de commande ou stdin
- Retourne une sortie structurée (texte ou JSON)
- Prend en charge la redirection de fichiers et le piping
- Permet les workflows d'automatisation et de scripting
- Fournit des codes de sortie cohérents pour la gestion des erreurs
- Peut reprendre les sessions précédentes du projet actuel pour l'automatisation en plusieurs étapes

## Utilisation de base

### Prompts directs

Utilisez le flag `--prompt` (ou `-p`) pour l'exécuter en mode headless :

```bash
qwen --prompt "What is machine learning?"
```

### Entrée Stdin

Transmettez l'entrée à Qwen Code via un pipe depuis votre terminal :

```bash
echo "Explain this code" | qwen
```

### Combinaison avec une entrée de fichier

Lisez des fichiers et traitez-les avec Qwen Code :

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Reprendre les sessions précédentes (Headless)

Réutilisez le contexte de conversation du projet actuel dans les scripts headless :

```bash
# Continue la session la plus récente pour ce projet et exécute un nouveau prompt
qwen --continue -p "Run the tests again and summarize failures"

# Reprend directement un ID de session spécifique (sans UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Les données de session sont des fichiers JSONL propres au projet, situés sous `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restaure l'historique des conversations, les sorties des outils et les points de contrôle de compression de chat avant d'envoyer le nouveau prompt.

## Exécuter un objectif persistant

Le mode headless accepte `/goal` comme prompt entier. L'état du Goal est stocké avec la session, donc utilisez `--continue` ou `--resume <sessionId>` pour inspecter ou contrôler le même Goal depuis un processus ultérieur. Cela nécessite que `general.chatRecording` reste activé (valeur par défaut).

```bash
# Créer un Goal et démarrer son worker
qwen -p "/goal Finish the release checklist"

# Inspecter son état sauvegardé dans la même session
qwen --continue -p "/goal"
```

Utilisez le même pattern `qwen --continue -p "<control>"` pour les autres opérations :

| Control                              | Behavior                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `/goal`                              | Rapporte l'état stocké sans appeler le modèle.                                           |
| `/goal <objective>` or `/goal set …` | Crée ou remplace le Goal et démarre le travail headless du Goal.                         |
| `/goal edit <objective>`             | Révise un Goal non terminé ; le travail démarre immédiatement lorsque l'état résultant est actif. |
| `/goal pause`                        | Met en pause un Goal actif sans appeler le modèle.                                       |
| `/goal resume`                       | Reprend un Goal éligible et démarre le travail headless du Goal.                         |
| `/goal clear`                        | Efface le Goal sans confirmation ni appel de modèle.                                     |

Les segments de continuation de Goal planifiés à l'exécution ne comptent pas dans `--max-session-turns`, mais les prompts utilisateur réels oui. Les budgets explicites `--max-wall-time` et `--max-tool-calls` continuent de s'appliquer ; dépasser l'un ou l'autre met en pause le travail actif du Goal avant que l'exécution ne se termine avec l'erreur spécifique au budget.

Avec `--output-format stream-json`, chaque changement d'état du Goal émet un `stream_event` dont `event.type` est `goal_state`. Cet événement d'état canonique est émis même sans `--include-partial-messages`. Lorsque les messages partiels sont activés, l'événement `active_goal` plus ancien suit comme une projection de compatibilité ; l'automatisation doit traiter `goal_state` comme faisant autorité.

> [!note]
>
> Ce comportement s'applique aux exécutions CLI headless standard. ACP utilise toujours le chemin de commande Goal hérité.

## Personnaliser le prompt de la session principale

Vous pouvez modifier le prompt système de la session principale pour une seule exécution CLI sans modifier les fichiers de mémoire partagée.

### Remplacer le prompt système intégré

Utilisez `--system-prompt` pour remplacer le prompt système principal intégré de Qwen Code pour l'exécution en cours :

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Ajouter des instructions supplémentaires

Utilisez `--append-system-prompt` pour conserver le prompt intégré et ajouter des instructions supplémentaires pour cette exécution :

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Vous pouvez combiner les deux flags lorsque vous souhaitez un prompt de base personnalisé ainsi qu'une instruction supplémentaire spécifique à l'exécution :

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

### Choisir un style de sortie

Utilisez `--output-style` pour choisir l'un des styles de sortie intégrés pour cette exécution. Un style est un bloc d'instructions nommé ajouté au prompt intégré qui modifie la manière dont la réponse est rédigée — `Concise` commence par le résultat et supprime le préambule et les narrations, `Proactive` commence à travailler au lieu de proposer, `Explanatory` ajoute de courtes notes sur le code en cours de route. Il remplace le paramètre `general.outputStyle` ; `default` ne sélectionne aucun style.

```bash
qwen -p "Why does the build fail on Windows?" --output-style Concise
```

> [!note]
>
> - `Learning` vous demande d'écrire une partie du code et attend une réponse, il est donc ignoré dans les exécutions headless.
> - Un nom de style inconnu affiche un avertissement et l'exécution continue avec le style par défaut.
> - `--output-style` n'a aucun effet lorsque `--system-prompt` ou `QWEN_SYSTEM_MD` remplace le prompt intégré — un style est uniquement ajouté au prompt intégré.

> [!note]
>
> - `--system-prompt` s'applique uniquement à la session principale de l'exécution en cours.
> - Les fichiers de mémoire et de contexte chargés, tels que `QWEN.md`, sont toujours ajoutés après `--system-prompt`.
> - `--append-system-prompt` est appliqué après le prompt intégré et la mémoire chargée, et peut être utilisé conjointement avec `--system-prompt`.

## Formats de sortie

Qwen Code prend en charge plusieurs formats de sortie pour différents cas d'usage :

### Sortie texte (par défaut)

Sortie standard lisible par un humain :

```bash
qwen -p "What is the capital of France?"
```

Format de la réponse :

```
The capital of France is Paris.
```

### Sortie JSON

Retourne des données structurées sous forme de tableau JSON. Tous les messages sont mis en mémoire tampon et affichés ensemble à la fin de la session. Ce format est idéal pour le traitement programmatique et les scripts d'automatisation.

La sortie JSON est un tableau d'objets message. La sortie inclut plusieurs types de messages : les messages système (initialisation de la session), les messages de l'assistant (réponses de l'IA) et les messages de résultat (résumé de l'exécution).

#### Exemple d'utilisation

```bash
qwen -p "What is the capital of France?" --output-format json
```

Sortie (à la fin de l'exécution) :

```json
[
  {
    "type": "system",
    "subtype": "session_start",
    "uuid": "...",
    "session_id": "...",
    "model": "qwen3-coder-plus",
    ...
  },
  {
    "type": "assistant",
    "uuid": "...",
    "session_id": "...",
    "message": {
      "id": "...",
      "type": "message",
      "role": "assistant",
      "model": "qwen3-coder-plus",
      "content": [
        {
          "type": "text",
          "text": "The capital of France is Paris."
        }
      ],
      "usage": {...}
    },
    "parent_tool_use_id": null
  },
  {
    "type": "result",
    "subtype": "success",
    "uuid": "...",
    "session_id": "...",
    "is_error": false,
    "duration_ms": 1234,
    "result": "The capital of France is Paris.",
    "usage": {...}
  }
]
```

### Sortie Stream-JSON

Le format Stream-JSON émet des messages JSON immédiatement au fur et à mesure de leur génération pendant l'exécution, permettant une surveillance en temps réel. Ce format utilise du JSON délimité par des sauts de ligne, où chaque message est un objet JSON complet sur une seule ligne.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Sortie (en streaming au fur et à mesure des événements) :

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Lorsqu'il est combiné avec `--include-partial-messages`, des événements de stream supplémentaires sont émis en temps réel (message_start, content_block_delta, etc.) pour les mises à jour de l'UI en temps réel.

Pour les sorties JSON et stream-JSON, les valeurs textuelles de `tool_result.content` sont limitées à 65 536 octets UTF-8 après sérialisation en chaîne JSON. Les valeurs trop volumineuses sont émises sous forme d'aperçus déterministes tête/queue. La même limite s'applique aux sessions stream-JSON persistantes, aux transports SDK, aux résultats d'outils de sous-agents et à la Dual Output. Le mode texte continue d'afficher uniquement la réponse finale, tout en conservant en interne uniquement l'aperçu borné. Cette limite ne plafonne pas une session JSON entière, un événement JSONL, une entrée d'outil ou un message partiel.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Format d'entrée

Le paramètre `--input-format` contrôle la manière dont Qwen Code consomme l'entrée depuis l'entrée standard :

- **`text`** (par défaut) : Entrée texte standard depuis stdin ou les arguments en ligne de commande
- **`stream-json`** : Protocole de messages JSON via stdin pour une communication bidirectionnelle

> **Remarque :** Le mode d'entrée stream-json est actuellement en cours de développement et est destiné à l'intégration SDK. Il nécessite que `--output-format stream-json` soit défini.

### Redirection de fichier

Enregistrez la sortie dans des fichiers ou redirigez-la vers d'autres commandes via un pipe :

```bash
# Enregistrer dans un fichier
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Ajouter au fichier
qwen -p "Add more details" >> docker-explanation.txt

# Rediriger vers d'autres outils
qwen -p "What is Kubernetes?" --output-format json | jq -r '.[-1].result'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Sortie Stream-JSON pour le traitement en temps réel
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Options de configuration

Principales options en ligne de commande pour l'utilisation en mode headless :

| Option                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                    | Exemple                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | S'exécute en mode headless                                                                                                                                                                                                                                                                                                                                                                                                     | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Spécifie le format de sortie (text, json, stream-json)                                                                                                                                                                                                                                                                                                                                                                         | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Spécifie le format d'entrée (text, stream-json)                                                                                                                                                                                                                                                                                                                                                                                | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Inclut les messages partiels dans la sortie stream-json                                                                                                                                                                                                                                                                                                                                                                        | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Remplace le prompt système de la session principale pour cette exécution                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Ajoute des instructions supplémentaires au prompt système de la session principale pour cette exécution                                                                                                                                                                                                                                                                                                                        | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--output-style`             | Style de sortie pour cette exécution (`Concise`, `Proactive`, `Explanatory`, `Learning` ou `default` pour aucun) ; remplace `general.outputStyle`                                                                                                                                                                                                                                                                             | `qwen -p "query" --output-style Concise`                                 |
| `--debug`, `-d`              | Active le mode debug                                                                                                                                                                                                                                                                                                                                                                                                           | `qwen -p "query" --debug`                                                |
| `--safe-mode`                | Désactive toutes les personnalisations — fichiers de contexte, hooks, extensions, skills, serveurs MCP, sous-agents personnalisés (seuls les sous-agents intégrés sont chargés), règles de permission, remplacements du mode d'approbation provenant des paramètres, fonctionnalités de mémoire et paramètres de sandbox — pour isoler les problèmes ; les flags CLI `--yolo` et `--approval-mode` restent effectifs. Voir [Troubleshooting](../support/troubleshooting). Également configurable via `QWEN_CODE_SAFE_MODE=true`. | `qwen -p "query" --safe-mode`                                            |
| `--model`, `-m`              | Modèle à utiliser pour cette exécution                                                                                                                                                                                                                                                                                                                                                                                         | `qwen -p "query" --model qwen3-coder-plus`                               |
| `--include-directories`      | Inclut des répertoires supplémentaires                                                                                                                                                                                                                                                                                                                                                                                         | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Approuve automatiquement toutes les actions                                                                                                                                                                                                                                                                                                                                                                                    | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Définit le mode d'approbation (`plan`, `default`, `auto-edit`, `auto`, `yolo`)                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "query" --approval-mode auto-edit`                              |
| `--continue`                 | Reprend la session la plus récente pour ce projet                                                                                                                                                                                                                                                                                                                                                                              | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Reprend une session spécifique (ou la choisit de manière interactive)                                                                                                                                                                                                                                                                                                                                                          | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | Limite le nombre de tours utilisateur/modèle/outil dans l'exécution                                                                                                                                                                                                                                                                                                                                                            | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | Budget en temps horloge ; accepte `90` (s), `30s`, `5m`, `1h`, `1.5h`                                                                                                                                                                                                                                                                                                                                                          | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | Budget cumulatif d'appels d'outils pour l'exécution                                                                                                                                                                                                                                                                                                                                                                            | `qwen -p "..." --max-tool-calls 50`                                      |
Pour plus de détails sur toutes les options de configuration, les fichiers de paramètres et les variables d'environnement disponibles, consultez le [Guide de configuration](../configuration/settings).

## Sécurité lors des exécutions non supervisées

Les exécutions headless / CI combinées avec `--yolo` (ou `--approval-mode=yolo`) approuvent automatiquement chaque appel d'outil, y compris `shell`, `write` et `edit`. **`--yolo` n'active pas de sandbox** : ces outils s'exécutent avec le niveau de privilège du processus hôte. Lorsque Qwen Code détecte cette combinaison sans qu'aucune sandbox ne soit configurée, il affiche un avertissement d'une ligne sur stderr au démarrage. Supprimez cet avertissement avec `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` une fois que vous avez évalué les compromis.

### Budgets au niveau de l'exécution

Qwen Code peut interrompre une exécution non supervisée lorsqu'elle dépasse l'un des seuils suivants. Chacun est défini sur `-1` (illimité) par défaut ; la configuration d'un seul d'entre eux suffit pour limiter les comportements incontrôlés. Ils sont appliqués de manière coopérative via le même `AbortController` qui gère déjà SIGINT. Ainsi, une interruption pour dépassement de budget émet une `FatalBudgetExceededError` structurée (code de sortie **55**) — distincte du code de sortie 53 pour la limite de tours et du 130 pour SIGINT, afin que les scripts CI puissent agir en fonction de la raison.

| Flag                  | Clé de paramètre               | Ce qu'il limite                                                                                                                                                                                                |
| --------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds`     | Durée réelle de l'ensemble de l'exécution. Le flag accepte `90` (s), `30s`, `5m`, `1h`, `1.5h` (unités fractionnaires prises en charge). Minimum 1s : les valeurs inférieures à la seconde sont rejetées comme des erreurs de frappe. Le paramètre est en secondes. |
| `--max-tool-calls`    | `model.maxToolCalls`           | Appels d'outils de premier niveau cumulatifs distribués par la boucle d'exécution principale (compte les succès _et_ les échecs : le modèle consomme toujours des tokens en cas d'erreur). Voir "Portée" ci-dessous pour les exemptions concernant les sous-agents / sorties structurées. |
| `--max-session-turns` | `model.maxSessionTurns`        | Nombre de tours utilisateur/modèle/outil ; préexistant. Quitte avec le code 53 en cas de dépassement (distinct du code de sortie de budget 55).                                                                                                  |

#### Portée

- **`--max-tool-calls` ne compte que les distributions de premier niveau.** Lorsque le modèle appelle l'outil `agent`, la distribution compte pour **1** ; les appels d'outils internes effectués par le sous-agent généré ne sont **pas** comptés. Un modèle qui canalise le travail via des sous-agents peut effectuer un travail interne illimité avec un petit budget de premier niveau. Combinez avec `--exclude-tools agent` si vous avez besoin d'une limite plus stricte.
- **`structured_output` est exempté de `--max-tool-calls`.** Avec `--json-schema`, l'appel terminal `structured_output` du modèle est le contrat "j'ai terminé", pas un travail réel : il ne compte pas dans `--max-tool-calls`, afin qu'une complétion à la limite du budget ne soit pas interrompue comme un faux positif. L'exemption est inconditionnelle (y compris les validations Ajv échouées), donc un modèle bloqué dans une boucle de retry de sortie malformée n'est **PAS** limité par `--max-tool-calls` ; combinez avec `--max-session-turns` ou `--max-wall-time` pour limiter les retries.
- **`structured_output` n'est PAS exempté de `--max-session-turns`.** Ce compteur est préexistant et s'incrémente à chaque tour, y compris le contrat terminal. Dimensionnez `--max-session-turns` à `N+1` si vous souhaitez autoriser `N` tours de travail réel avec `--json-schema`.
- **Single-shot vs `--input-format stream-json` :** en mode d'entrée stream-json, le daemon réinitialise les compteurs de budget au début de chaque message utilisateur ; le budget est par message, et non par processus.
- **Sessions `qwen serve` / ACP :** le chemin de session ACP du daemon ne consulte actuellement PAS `--max-wall-time` / `--max-tool-calls` depuis settings.json. Ces budgets s'appliquent uniquement aux exécutions single-shot `qwen -p` et aux sessions `--input-format stream-json`. (`qwen serve` émet tout de même l'avertissement YOLO-no-sandbox au démarrage si `tools.approvalMode: 'yolo'` est défini dans les paramètres.)

### Combinaisons recommandées

- **Environnement isolé et de confiance (runner CI éphémère, conteneur) :** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Fixez un budget de tours et un budget de temps réel afin qu'un agent bloqué ne puisse pas épuiser vos minutes CI, et capturez `--output-format json` pour l'audit post-exécution de l'utilisation / des appels d'outils.
- **Machine locale ou infrastructure partagée :** passez également `--sandbox` (ou définissez `QWEN_SANDBOX=1`) pour que les outils shell / write / edit s'exécutent à l'intérieur de l'image sandbox.
- **CI de longue durée avec retry-on-rate-limit :** combinez `QWEN_CODE_UNATTENDED_RETRY=1` avec `--max-wall-time`. La variable d'environnement de retry maintient l'exécution en vie après des réponses 429 / 529 transitoires ; le budget de temps réel garantit qu'un fournisseur en échec persistant ne peut pas prolonger la tâche indéfiniment.
- **Audit / exploration bornés :** pour les tâches en lecture seule, `--max-tool-calls 25` limite l'agressivité avec laquelle le modèle peut faire des grep / read. Combinez avec `--exclude-tools shell,write,edit` pour rendre cette limite pertinente.

## Exemples

### Revue de code

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### Génération de messages de commit

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.[-1].result'
```

### Documentation d'API

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.[-1].result' > openapi.json
```

### Analyse de code par lot

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.[-1].result' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### Revue de code de PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.[-1].result' > pr-review.json
```

### Analyse de logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Génération des notes de version

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.[-1].result')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Suivi de l'utilisation des modèles et des outils

```bash
result=$(qwen -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.[-1].stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.[-1].stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.[-1].stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.[-1].stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.[-1].result' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## Mode de retry persistant

Lorsque Qwen Code s'exécute dans des pipelines CI/CD ou en tant que daemon en arrière-plan, une courte panne d'API (rate limiting ou surcharge) ne devrait pas interrompre une tâche de plusieurs heures. Le **mode de retry persistant** permet à Qwen Code de réessayer indéfiniment face aux erreurs API transitoires jusqu'à ce que le service se rétablisse.

### Fonctionnement

- **Erreurs transitoires uniquement** : les HTTP 429 (Rate Limit) et 529 (Overloaded) font l'objet de retries infinis. Les autres erreurs (400, 500, etc.) échouent normalement.
- **Backoff exponentiel avec plafond** : les délais de retry augmentent de façon exponentielle mais sont plafonnés à **5 minutes** par retry.
- **Keepalive par heartbeat** : lors de longues attentes, une ligne de statut est affichée sur stderr toutes les **30 secondes** pour éviter que les runners CI ne tuent le processus pour cause d'inactivité.
- **Dégradation gracieuse** : les erreurs non transitoires et le mode interactif ne sont pas affectés du tout.

### Activation

Définissez la variable d'environnement `QWEN_CODE_UNATTENDED_RETRY` sur `true` ou `1` (correspondance stricte, sensible à la casse) :

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Le mode de retry persistant nécessite un **opt-in explicite**. `CI=true` seul ne l'active **pas** : transformer silencieusement une tâche CI à échec rapide en une tâche à attente infinie serait dangereux. Définissez toujours `QWEN_CODE_UNATTENDED_RETRY` explicitement dans la configuration de votre pipeline.

### Exemples

#### GitHub Actions

```yaml
- name: Automated code review
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Review all files in src/ for security issues" \
      --output-format json \
      --yolo > review.json
```

#### Traitement par lot nocturne

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migrate all callback-style functions to async/await in src/" --yolo
```

#### Daemon en arrière-plan

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### Monitoring

Lors d'un retry persistant, les messages de heartbeat sont affichés sur **stderr** :

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Ces messages maintiennent les runners CI en vie et vous permettent de suivre la progression. Ils n'apparaissent pas dans stdout, afin que la sortie JSON redirigée vers d'autres outils reste propre.

## Ressources

- [Configuration CLI](../configuration/settings#command-line-arguments) - Guide de configuration complet
- [Authentification](../configuration/auth.md) - Configuration de l'authentification
- [Commandes](../features/commands) - Référence des commandes interactives
- [Tutoriels](../quickstart) - Guides d'automatisation étape par étape

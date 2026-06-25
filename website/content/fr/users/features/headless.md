# Mode Headless

Le mode Headless vous permet d'exécuter Qwen Code de manière programmatique à partir de scripts en ligne de commande et d'outils d'automatisation, sans interface utilisateur interactive. Il est idéal pour le scripting, l'automatisation, les pipelines CI/CD et la construction d'outils basés sur l'IA.

## Vue d'ensemble

Le mode Headless fournit une interface sans affichage à Qwen Code qui :

- Accepte les invites via les arguments de ligne de commande ou l'entrée standard
- Renvoie une sortie structurée (texte ou JSON)
- Prend en charge la redirection de fichiers et les pipes
- Permet les workflows d'automatisation et de scripting
- Fournit des codes de sortie cohérents pour la gestion des erreurs
- Peut reprendre des sessions précédentes limitées au projet en cours pour une automatisation en plusieurs étapes

## Utilisation de base

### Invites directes

Utilisez le drapeau `--prompt` (ou `-p`) pour exécuter en mode Headless :

```bash
qwen --prompt "What is machine learning?"
```

### Entrée standard

Dirigez l'entrée vers Qwen Code depuis votre terminal :

```bash
echo "Explain this code" | qwen
```

### Combinaison avec l'entrée depuis un fichier

Lisez depuis des fichiers et traitez avec Qwen Code :

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Reprendre des sessions précédentes (Headless)

Réutilisez le contexte de conversation du projet en cours dans des scripts Headless :

```bash
# Continue the most recent session for this project and run a new prompt
qwen --continue -p "Run the tests again and summarize failures"

# Resume a specific session ID directly (no UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Les données de session sont au format JSONL, limitées au projet, sous `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restaure l'historique de la conversation, les sorties des outils et les points de contrôle de compression de chat avant d'envoyer la nouvelle invite.

## Personnaliser l'invite de session principale

Vous pouvez modifier l'invite système de la session principale pour une seule exécution en CLI sans modifier les fichiers de mémoire partagée.

### Remplacer l'invite système intégrée

Utilisez `--system-prompt` pour remplacer l'invite intégrée de la session principale de Qwen Code pour l'exécution en cours :

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Ajouter des instructions supplémentaires

Utilisez `--append-system-prompt` pour conserver l'invite intégrée et ajouter des instructions supplémentaires pour cette exécution :

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Vous pouvez combiner les deux drapeaux lorsque vous souhaitez une invite de base personnalisée plus une instruction supplémentaire spécifique à l'exécution :

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` s'applique uniquement à la session principale de l'exécution en cours.
> - Les fichiers de mémoire et de contexte chargés, tels que `QWEN.md`, sont toujours ajoutés après `--system-prompt`.
> - `--append-system-prompt` est appliqué après l'invite intégrée et la mémoire chargée, et peut être utilisé conjointement avec `--system-prompt`.

## Formats de sortie

Qwen Code prend en charge plusieurs formats de sortie pour différents cas d'utilisation :

### Sortie texte (par défaut)

Sortie standard lisible par un humain :

```bash
qwen -p "What is the capital of France?"
```

Format de réponse :

```
The capital of France is Paris.
```

### Sortie JSON

Renvoie des données structurées sous forme de tableau JSON. Tous les messages sont mis en mémoire tampon et sortis ensemble lorsque la session se termine. Ce format est idéal pour le traitement programmatique et les scripts d'automatisation.

La sortie JSON est un tableau d'objets message. Elle comprend plusieurs types de messages : messages système (initialisation de session), messages assistant (réponses IA) et messages résultat (résumé d'exécution).

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

Le format Stream-JSON émet des messages JSON immédiatement dès qu'ils se produisent pendant l'exécution, permettant une surveillance en temps réel. Ce format utilise du JSON délimité par ligne, où chaque message est un objet JSON complet sur une seule ligne.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Sortie (en streaming au fur et à mesure des événements) :

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```
Lorsqu'il est combiné avec `--include-partial-messages`, des événements de flux supplémentaires sont émis en temps réel (message_start, content_block_delta, etc.) pour des mises à jour UI en temps réel.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Format d'entrée

Le paramètre `--input-format` contrôle la manière dont Qwen Code consomme les entrées depuis l'entrée standard :

- **`text`** (par défaut) : Entrée texte standard depuis stdin ou les arguments de la ligne de commande
- **`stream-json`** : Protocole JSON par messages via stdin pour la communication bidirectionnelle

> **Note :** Le mode d'entrée stream-json est actuellement en construction et est destiné à l'intégration avec le SDK. Il nécessite que `--output-format stream-json` soit défini.

### Redirection de fichiers

Enregistrez la sortie dans des fichiers ou redirigez-la vers d'autres commandes :

```bash
# Enregistrer dans un fichier
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Ajouter à un fichier
qwen -p "Add more details" >> docker-explanation.txt

# Rediriger vers d'autres outils
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Sortie Stream-JSON pour traitement en temps réel
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Options de configuration

Options clés en ligne de commande pour une utilisation sans interface :

| Option                       | Description                                                              | Exemple                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Exécuter en mode sans interface                                          | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Spécifier le format de sortie (text, json, stream-json)                  | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Spécifier le format d'entrée (text, stream-json)                         | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Inclure les messages partiels dans la sortie stream-json                 | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Remplacer la consigne système de la session principale pour cette exécution   | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Ajouter des instructions supplémentaires à la consigne système principale   | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Activer le mode débogage                                                  | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Inclure tous les fichiers dans le contexte                                | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Inclure des répertoires supplémentaires                                 | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Approuver automatiquement toutes les actions                             | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Définir le mode d'approbation                                            | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Reprendre la session la plus récente pour ce projet                      | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Reprendre une session spécifique (ou choisir interactivement)            | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | Limiter le nombre de tours utilisateur/modèle/outil dans l'exécution     | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | Budget en temps réel ; accepte `90` (s), `30s`, `5m`, `1h`, `1.5h`       | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | Budget cumulé d'appels d'outils pour l'exécution                         | `qwen -p "..." --max-tool-calls 50`                                      |

Pour tous les détails sur les options de configuration disponibles, les fichiers de paramètres et les variables d'environnement, voir le [Guide de configuration](../configuration/settings).

## Sécurité dans les exécutions sans surveillance

Les exécutions sans surveillance / CI combinées avec `--yolo` (ou `--approval-mode=yolo`) approuvent automatiquement chaque appel d'outil, y compris `shell`, `write` et `edit`. **`--yolo` n'active pas de bac à sable** — ces outils s'exécutent avec le niveau de privilège du processus hôte. Lorsque Qwen Code détecte cette combinaison sans bac à sable configuré, il affiche un avertissement d'une ligne sur stderr au démarrage. Supprimez l'avertissement avec `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` une fois que vous avez examiné le compromis.
### Budgets au niveau de l'exécution

Qwen Code peut interrompre une exécution non supervisée lorsqu'elle dépasse l'un des seuils suivants. Chacun est `-1` (illimité) par défaut ; en définir un seul suffit pour limiter un comportement incontrôlé. Ils sont appliqués de manière coopérative via le même `AbortController` qui gère déjà SIGINT, donc une annulation pour dépassement de budget émet une erreur structurée `FatalBudgetExceededError` (code de sortie **55**) — distincte du code de sortie 53 pour le plafond de tours et du code 130 de SIGINT, afin que les scripts CI puissent bifurquer selon la raison.

| Drapeau                | Clé de configuration        | Ce qu'il limite                                                                                                                                                                                                                   |
| ---------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | Durée réelle de l'ensemble de l'exécution. Le drapeau accepte `90` (s), `30s`, `5m`, `1h`, `1.5h` (unités fractionnaires supportées). Minimum 1s — les valeurs inférieures à la seconde sont rejetées comme des fautes de frappe. La configuration est en secondes. |
| `--max-tool-calls`    | `model.maxToolCalls`       | Appels d'outils cumulés de premier niveau émis par la boucle d'exécution principale (compte les succès _et_ les échecs — le modèle consomme toujours des jetons en cas d'erreur). Voir « Portée » ci-dessous pour les exemptions des sous-agents / sorties structurées. |
| `--max-session-turns` | `model.maxSessionTurns`    | Nombre de tours utilisateur/modèle/outil ; préexistant. Se termine avec le code 53 en cas de dépassement (distinct du code de sortie budgétaire 55).                                                                              |

#### Portée

- **`--max-tool-calls` ne compte que les émissions de premier niveau.** Lorsque le modèle appelle l'outil `agent`, l'émission compte pour **1** ; les appels d'outils internes effectués par le sous-agent créé ne sont **pas** comptés. Un modèle qui canalise le travail via des sous-agents peut effectuer un travail interne illimité avec un petit budget de premier niveau. Combinez avec `--exclude-tools agent` si vous avez besoin d'un plafond plus strict.
- **`structured_output` est exempté de `--max-tool-calls`.** Sous `--json-schema`, l'appel terminal `structured_output` du modèle est le contrat « j'ai fini », pas un vrai travail — il n'est pas compté dans `--max-tool-calls` afin qu'une complétion en limite de budget ne soit pas annulée comme un faux positif. L'exemption est inconditionnelle (y compris les échecs de validation Ajv), donc un modèle bloqué dans une boucle de reprise sur sortie malformée N'EST PAS limité par `--max-tool-calls` ; combinez avec `--max-session-turns` ou `--max-wall-time` pour plafonner les reprises.
- **`structured_output` n'est PAS exempté de `--max-session-turns`.** Ce compteur est préexistant et s'incrémente à chaque tour, y compris le contrat terminal. Définissez `--max-session-turns` à `N+1` si vous voulez autoriser `N` tours de travail réel sous `--json-schema`.
- **Exécution unique vs `--input-format stream-json` :** en mode d'entrée stream-json, le démon réinitialise les compteurs budgétaires au début de chaque message utilisateur ; le budget est par message, pas par processus.
- **`qwen serve` / sessions ACP :** le chemin de session ACP du démon ne consulte PAS actuellement `--max-wall-time` / `--max-tool-calls` depuis settings.json. Ces budgets s'appliquent uniquement aux exécutions uniques `qwen -p` et aux sessions `--input-format stream-json`. (`qwen serve` émet l'avertissement YOLO-sans-sandbox au démarrage si `tools.approvalMode: 'yolo'` est défini dans les paramètres.)

### Combinaisons recommandées

- **Environnement de confiance et isolé (exécuteur CI éphémère, conteneur) :** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Fixez un budget de tours et un budget de temps réel pour qu'un agent bloqué ne puisse pas grignoter vos minutes CI, et capturez `--output-format json` pour l'utilisation post-exécution et l'audit des appels d'outils.
- **Machine locale ou infrastructure partagée :** passez également `--sandbox` (ou définissez `QWEN_SANDBOX=1`) pour que les outils shell / write / edit s'exécutent dans l'image sandbox.
- **CI de longue durée avec reprise sur limite de débit :** combinez `QWEN_CODE_UNATTENDED_RETRY=1` avec `--max-wall-time`. La variable d'environnement de reprise maintient l'exécution en vie au-delà des réponses temporaires 429 / 529 ; le budget de temps réel garantit qu'un fournisseur qui échoue de manière persistante ne peut pas prolonger le travail indéfiniment.
- **Audit / exploration limités :** pour les tâches en lecture seule, `--max-tool-calls 25` plafonne l'agressivité avec laquelle le modèle peut grep / lire. Combinez avec `--exclude-tools shell,write,edit` pour donner un sens à la limite.

## Exemples

### Revue de code

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### Générer des messages de commit

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### Documentation d'API

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```
### Analyse par lots de code

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### Revue de code de PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Analyse de logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Génération de notes de version

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Suivi de l'utilisation des modèles et outils

```bash
result=$(qwen -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## Mode de réessai persistant

Lorsque Qwen Code s'exécute dans des pipelines CI/CD ou en tant que démon en arrière-plan, une brève interruption de l'API (limitation de débit ou surcharge) ne devrait pas interrompre une tâche de plusieurs heures. Le **mode de réessai persistant** permet à Qwen Code de réessayer indéfiniment les erreurs API transitoires jusqu'à ce que le service se rétablisse.

### Fonctionnement

- **Erreurs transitoires uniquement** : les codes HTTP 429 (Rate Limit) et 529 (Overloaded) sont réessayés indéfiniment. Les autres erreurs (400, 500, etc.) échouent normalement.
- **Backoff exponentiel avec plafond** : les délais de réessai croissent de manière exponentielle, mais sont plafonnés à **5 minutes** par réessai.
- **Signal de maintien en vie (heartbeat)** : pendant les longues attentes, une ligne d'état est imprimée sur stderr toutes les **30 secondes** pour éviter que les exécuteurs CI ne tuent le processus en raison d'inactivité.
- **Dégradation gracieuse** : les erreurs non transitoires et le mode interactif ne sont pas du tout affectés.

### Activation

Définissez la variable d'environnement `QWEN_CODE_UNATTENDED_RETRY` sur `true` ou `1` (correspondance stricte, sensible à la casse) :

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Le réessai persistant nécessite une **souscription explicite**. `CI=true` seul **ne l'active pas** — transformer silencieusement un travail CI à échec rapide en un travail à attente infinie serait dangereux. Définissez toujours `QWEN_CODE_UNATTENDED_RETRY` explicitement dans votre configuration de pipeline.

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

#### Traitement par lots de nuit

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migrate all callback-style functions to async/await in src/" --yolo
```

#### Démon en arrière-plan

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### Surveillance

Pendant le réessai persistant, des messages de signal de maintien en vie sont imprimés sur **stderr** :

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Ces messages maintiennent les exécuteurs CI en vie et vous permettent de suivre la progression. Ils n'apparaissent pas sur stdout, donc la sortie JSON redirigée vers d'autres outils reste propre.

## Ressources

- [Configuration CLI](../configuration/settings#command-line-arguments) - Guide de configuration complet
- [Authentification](../configuration/auth.md) - Configurer l'authentification
- [Commandes](../features/commands) - Référence des commandes interactives
- [Tutoriels](../quickstart) - Guides d'automatisation pas à pas

# Mode headless

Le mode headless vous permet d'exécuter Qwen Code de manière programmatique depuis des scripts en ligne de commande et des outils d'automatisation, sans aucune interface interactive. Il est idéal pour le scripting, l'automatisation, les pipelines CI/CD et la création d'outils alimentés par l'IA.

## Vue d'ensemble

Le mode headless fournit une interface headless pour Qwen Code qui :

- Accepte les prompts via des arguments en ligne de commande ou stdin
- Retourne une sortie structurée (texte ou JSON)
- Prend en charge la redirection de fichiers et les pipes
- Permet les workflows d'automatisation et de scripting
- Fournit des codes de sortie cohérents pour la gestion des erreurs
- Peut reprendre les sessions précédentes limitées au projet actuel pour l'automatisation en plusieurs étapes

## Utilisation de base

### Prompts directs

Utilisez l'option `--prompt` (ou `-p`) pour exécuter en mode headless :

```bash
qwen --prompt "What is machine learning?"
```

### Entrée via stdin

Transmettez l'entrée à Qwen Code depuis votre terminal :

```bash
echo "Explain this code" | qwen
```

### Combinaison avec une entrée fichier

Lisez des fichiers et traitez-les avec Qwen Code :

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Reprendre des sessions précédentes (Headless)

Réutilisez le contexte de conversation du projet actuel dans des scripts headless :

```bash
# Continue the most recent session for this project and run a new prompt
qwen --continue -p "Run the tests again and summarize failures"

# Resume a specific session ID directly (no UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Les données de session sont au format JSONL, limitées au projet et stockées sous `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restaure l'historique des conversations, les sorties des outils et les points de contrôle de compression de chat avant d'envoyer le nouveau prompt.

## Personnaliser le prompt principal de la session

Vous pouvez modifier le prompt système principal de la session pour une seule exécution CLI sans modifier les fichiers de mémoire partagée.

### Remplacer le prompt système intégré

Utilisez `--system-prompt` pour remplacer le prompt principal de session intégré de Qwen Code pour l'exécution actuelle :

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Ajouter des instructions supplémentaires

Utilisez `--append-system-prompt` pour conserver le prompt intégré et ajouter des instructions supplémentaires pour cette exécution :

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Vous pouvez combiner les deux options lorsque vous souhaitez un prompt de base personnalisé ainsi qu'une instruction spécifique à l'exécution :

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` s'applique uniquement à la session principale de l'exécution actuelle.
> - Les fichiers de mémoire et de contexte chargés, tels que `QWEN.md`, sont toujours ajoutés après `--system-prompt`.
> - `--append-system-prompt` est appliqué après le prompt intégré et la mémoire chargée, et peut être utilisé conjointement avec `--system-prompt`.

## Formats de sortie

Qwen Code prend en charge plusieurs formats de sortie pour différents cas d'utilisation :

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

La sortie JSON est un tableau d'objets message. Elle inclut plusieurs types de messages : les messages système (initialisation de session), les messages assistant (réponses IA) et les messages de résultat (résumé d'exécution).

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

Le format Stream-JSON émet les messages JSON immédiatement au fur et à mesure de leur génération pendant l'exécution, permettant une surveillance en temps réel. Ce format utilise du JSON délimité par des lignes, où chaque message est un objet JSON complet sur une seule ligne.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Sortie (streaming au fil des événements) :

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Lorsqu'il est combiné avec `--include-partial-messages`, des événements de stream supplémentaires sont émis en temps réel (`message_start`, `content_block_delta`, etc.) pour les mises à jour d'interface en temps réel.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Format d'entrée

Le paramètre `--input-format` contrôle la manière dont Qwen Code consomme l'entrée depuis l'entrée standard :

- **`text`** (par défaut) : Entrée texte standard depuis stdin ou les arguments en ligne de commande
- **`stream-json`** : Protocole de messages JSON via stdin pour une communication bidirectionnelle

> **Remarque :** Le mode d'entrée stream-json est actuellement en cours de développement et est destiné à l'intégration SDK. Il nécessite que `--output-format stream-json` soit défini.

### Redirection de fichiers

Enregistrez la sortie dans des fichiers ou transmettez-la à d'autres commandes :

```bash
# Save to file
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Append to file
qwen -p "Add more details" >> docker-explanation.txt

# Pipe to other tools
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Stream-JSON output for real-time processing
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Options de configuration

Principales options en ligne de commande pour l'utilisation en mode headless :

| Option                       | Description                                                              | Exemple                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Exécute en mode headless                                                 | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Spécifie le format de sortie (text, json, stream-json)                   | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Spécifie le format d'entrée (text, stream-json)                          | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Inclut les messages partiels dans la sortie stream-json                  | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Remplace le prompt système principal de la session pour cette exécution  | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Ajoute des instructions supplémentaires au prompt système principal de la session pour cette exécution | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Active le mode debug                                                     | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Inclut tous les fichiers dans le contexte                                | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Inclut des répertoires supplémentaires                                   | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Approuve automatiquement toutes les actions                              | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Définit le mode d'approbation                                            | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Reprend la session la plus récente pour ce projet                        | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Reprend une session spécifique (ou choix interactif)                     | `qwen --resume 123e... -p "Finish the refactor"`                         |

Pour plus de détails sur toutes les options de configuration disponibles, les fichiers de paramètres et les variables d'environnement, consultez le [Guide de configuration](../configuration/settings).

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

### Documentation API

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Analyse de code par lots

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### Revue de code pour les PR

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

### Suivi de l'utilisation des modèles et des outils

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

## Ressources

- [Configuration CLI](../configuration/settings#command-line-arguments) - Guide de configuration complet
- [Authentification](../configuration/settings#environment-variables-for-api-access) - Configurer l'authentification
- [Commandes](../features/commands) - Référence des commandes interactives
- [Tutoriels](../quickstart) - Guides d'automatisation étape par étape
```markdown
# Mode Headless

Le mode headless vous permet d'exécuter Qwen Code de manière programmatique à partir de scripts en ligne de commande
et d'outils d'automatisation sans interface utilisateur interactive. C'est idéal pour
le scripting, l'automatisation, les pipelines CI/CD, et la création d'outils alimentés par l'IA.

- [Mode Headless](#mode-headless)
  - [Aperçu](#aperçu)
  - [Utilisation de base](#utilisation-de-base)
    - [Prompts directs](#prompts-dirents)
    - [Entrée via Stdin](#entrée-via-stdin)
    - [Combinaison avec une entrée fichier](#combinaison-avec-une-entrée-fichier)
  - [Formats de sortie](#formats-de-sortie)
    - [Sortie texte (par défaut)](#sortie-texte-par-défaut)
    - [Sortie JSON](#sortie-json)
      - [Exemple d'utilisation](#exemple-dutilisation)
    - [Sortie Stream-JSON](#sortie-stream-json)
    - [Format d'entrée](#format-dentrée)
    - [Redirection de fichiers](#redirection-de-fichiers)
  - [Options de configuration](#options-de-configuration)
  - [Exemples](#exemples)
    - [Revue de code](#revue-de-code)
    - [Génération de messages de commit](#génération-de-messages-de-commit)
    - [Documentation API](#documentation-api)
    - [Analyse de code en lot](#analyse-de-code-en-lot)
    - [Revue de code PR](#revue-de-code-pr)
    - [Analyse de logs](#analyse-de-logs)
    - [Génération de notes de version](#génération-de-notes-de-version)
    - [Suivi de l'utilisation des modèles et outils](#suivi-de-lutilisation-des-modèles-et-outils)
  - [Ressources](#ressources)
```

## Aperçu

Le mode headless fournit une interface headless pour Qwen Code qui :

- Accepte les prompts via des arguments de ligne de commande ou stdin
- Retourne une sortie structurée (texte ou JSON)
- Supporte la redirection de fichiers et le piping
- Permet l'automatisation et les workflows de script
- Fournit des codes de sortie cohérents pour la gestion d'erreurs

## Utilisation de base

### Prompts directs

Utilisez le flag `--prompt` (ou `-p`) pour exécuter en mode headless :

```bash
qwen --prompt "Qu'est-ce que le machine learning ?"
```

### Entrée Stdin

Envoyez une entrée à Qwen Code depuis votre terminal :

```bash
echo "Explique ce code" | qwen
```

### Combiner avec une entrée fichier

Lisez depuis des fichiers et traitez avec Qwen Code :

```bash
cat README.md | qwen --prompt "Résume cette documentation"
```

## Formats de sortie

Qwen Code supporte plusieurs formats de sortie pour différents cas d'utilisation :

### Sortie texte (par défaut)

Sortie standard lisible par un humain :

```bash
qwen -p "Quelle est la capitale de la France ?"
```

Format de réponse :

```
La capitale de la France est Paris.
```

### Sortie JSON

Retourne des données structurées sous forme de tableau JSON. Tous les messages sont mis en tampon et affichés ensemble lorsque la session est terminée. Ce format est idéal pour le traitement programmatique et les scripts d'automatisation.

La sortie JSON est un tableau d'objets message. La sortie inclut plusieurs types de messages : les messages système (initialisation de la session), les messages de l'assistant (réponses de l'IA) et les messages de résultat (résumé de l'exécution).

#### Exemple d'utilisation

```bash
qwen -p "Quelle est la capitale de la France ?" --output-format json
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
          "text": "La capitale de la France est Paris."
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
    "result": "La capitale de la France est Paris.",
    "usage": {...}
  }
]
```

### Sortie Stream-JSON

Le format Stream-JSON émet des messages JSON immédiatement lorsqu'ils surviennent pendant l'exécution, permettant un monitoring en temps réel. Ce format utilise du JSON délimité par des lignes, où chaque message est un objet JSON complet sur une seule ligne.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Sortie (streaming au fur et à mesure des événements) :

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Lorsqu'il est combiné avec `--include-partial-messages`, des événements de flux supplémentaires sont émis en temps réel (message_start, content_block_delta, etc.) pour les mises à jour d'interface utilisateur en temps réel.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Format d'entrée

Le paramètre `--input-format` contrôle la façon dont Qwen Code consomme l'entrée depuis l'entrée standard :

- **`text`** (par défaut) : Entrée texte standard depuis stdin ou les arguments de ligne de commande
- **`stream-json`** : Protocole de message JSON via stdin pour une communication bidirectionnelle

> **Note :** Le mode d'entrée stream-json est actuellement en construction et destiné à l'intégration avec le SDK. Il nécessite que `--output-format stream-json` soit défini.

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
```

# Sortie Stream-JSON pour le traitement en temps réel
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Options de Configuration

Options principales en ligne de commande pour une utilisation headless :

| Option                       | Description                                           | Exemple                                                                      |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--prompt`, `-p`             | Exécuter en mode headless                             | `qwen -p "query"`                                                            |
| `--output-format`, `-o`      | Spécifier le format de sortie (text, json, stream-json) | `qwen -p "query" --output-format json`                                       |
| `--input-format`             | Spécifier le format d'entrée (text, stream-json)      | `qwen --input-format text --output-format stream-json`                       |
| `--include-partial-messages` | Inclure les messages partiels dans la sortie stream-json | `qwen -p "query" --output-format stream-json --include-partial-messages`   |
| `--debug`, `-d`              | Activer le mode debug                                 | `qwen -p "query" --debug`                                                    |
| `--all-files`, `-a`          | Inclure tous les fichiers dans le contexte            | `qwen -p "query" --all-files`                                                |
| `--include-directories`      | Inclure des répertoires supplémentaires               | `qwen -p "query" --include-directories src,docs`                             |
| `--yolo`, `-y`               | Approuver automatiquement toutes les actions          | `qwen -p "query" --yolo`                                                     |
| `--approval-mode`            | Définir le mode d’approbation                         | `qwen -p "query" --approval-mode auto_edit`                                  |

Pour plus de détails sur toutes les options de configuration disponibles, les fichiers de paramètres et les variables d’environnement, consultez le [Guide de Configuration](./cli/configuration.md).

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

### Analyse de code par lot

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### Revue de code PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Analyse des logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Génération des release notes

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

- [Configuration du CLI](./cli/configuration.md) - Guide complet de configuration
- [Authentification](./cli/authentication.md) - Configuration de l'authentification
- [Commandes](./cli/commands.md) - Référence interactive des commandes
- [Tutoriels](./cli/tutorials.md) - Guides d'automatisation pas à pas
# Mode Headless

Le mode headless permet d'exécuter Qwen Code de manière programmatique à partir de scripts en ligne de commande et d'outils d'automatisation, sans interface utilisateur interactive. C'est idéal pour le scripting, l'automatisation, les pipelines CI/CD, et la création d'outils alimentés par l'IA.

- [Mode Headless](#mode-headless)
  - [Aperçu](#aperçu)
  - [Utilisation basique](#utilisation-basique)
    - [Prompts directs](#prompts-dirents)
    - [Entrée via Stdin](#entrée-via-stdin)
    - [Combinaison avec une entrée fichier](#combinaison-avec-une-entrée-fichier)
  - [Formats de sortie](#formats-de-sortie)
    - [Sortie texte (par défaut)](#sortie-texte-par-défaut)
    - [Sortie JSON](#sortie-json)
      - [Schéma de réponse](#schéma-de-réponse)
      - [Exemple d'utilisation](#exemple-dutilisation)
    - [Redirection vers un fichier](#redirection-vers-un-fichier)
  - [Options de configuration](#options-de-configuration)
  - [Exemples](#exemples)
    - [Revue de code](#revue-de-code)
    - [Génération de messages de commit](#génération-de-messages-de-commit)
    - [Documentation API](#documentation-api)
    - [Analyse de code en lot](#analyse-de-code-en-lot)
    - [Revue de code](#revue-de-code-1)
    - [Analyse de logs](#analyse-de-logs)
    - [Génération de notes de version](#génération-de-notes-de-version)
    - [Suivi de l'utilisation des modèles et outils](#suivi-de-lutilisation-des-modèles-et-outils)
  - [Ressources](#ressources)

## Aperçu

Le mode headless fournit une interface headless pour Qwen Code qui :

- Accepte les prompts via des arguments de ligne de commande ou stdin
- Retourne une sortie structurée (texte ou JSON)
- Supporte la redirection de fichiers et le piping
- Permet l'automatisation et les workflows de scripting
- Fournit des codes de sortie cohérents pour la gestion des erreurs

## Utilisation de base

### Prompts directs

Utilisez le flag `--prompt` (ou `-p`) pour exécuter en mode headless :

```bash
qwen --prompt "Qu'est-ce que le machine learning ?"
```

### Entrée stdin

Envoyez des données à Qwen Code depuis votre terminal :

```bash
echo "Explique ce code" | qwen
```

### Combinaison avec une entrée fichier

Lisez depuis des fichiers et traitez avec Qwen Code :

```bash
cat README.md | qwen --prompt "Résume cette documentation"
```

## Formats de sortie

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

Retourne des données structurées incluant la réponse, les statistiques et les métadonnées. Ce format est idéal pour le traitement programmatique et les scripts d'automatisation.

#### Schéma de réponse

La sortie JSON suit cette structure de haut niveau :

```json
{
  "response": "string", // Le contenu principal généré par l'IA en réponse à votre prompt
  "stats": {
    // Métriques d'utilisation et données de performance
    "models": {
      // Statistiques d'utilisation de l'API et des tokens par modèle
      "[model-name]": {
        "api": {
          /* nombre de requêtes, erreurs, latence */
        },
        "tokens": {
          /* compte des tokens du prompt, de la réponse, mis en cache, total */
        }
      }
    },
    "tools": {
      // Statistiques d'exécution des outils
      "totalCalls": "number",
      "totalSuccess": "number",
      "totalFail": "number",
      "totalDurationMs": "number",
      "totalDecisions": {
        /* compte des décisions : accept, reject, modify, auto_accept */
      },
      "byName": {
        /* statistiques détaillées par outil */
      }
    },
    "files": {
      // Statistiques de modification des fichiers
      "totalLinesAdded": "number",
      "totalLinesRemoved": "number"
    }
  },
  "error": {
    // Présent uniquement lorsqu'une erreur s'est produite
    "type": "string", // Type d'erreur (ex. : "ApiError", "AuthError")
    "message": "string", // Description de l'erreur lisible par un humain
    "code": "number" // Code d'erreur optionnel
  }
}
```

#### Exemple d'utilisation

```bash
qwen -p "Quelle est la capitale de la France ?" --output-format json
```

Réponse :

```json
{
  "response": "La capitale de la France est Paris.",
  "stats": {
    "models": {
      "qwen3-coder-plus": {
        "api": {
          "totalRequests": 2,
          "totalErrors": 0,
          "totalLatencyMs": 5053
        },
        "tokens": {
          "prompt": 24939,
          "candidates": 20,
          "total": 25113,
          "cached": 21263,
          "thoughts": 154,
          "tool": 0
        }
      }
    },
    "tools": {
      "totalCalls": 1,
      "totalSuccess": 1,
      "totalFail": 0,
      "totalDurationMs": 1881,
      "totalDecisions": {
        "accept": 0,
        "reject": 0,
        "modify": 0,
        "auto_accept": 1
      },
      "byName": {
        "google_web_search": {
          "count": 1,
          "success": 1,
          "fail": 0,
          "durationMs": 1881,
          "decisions": {
            "accept": 0,
            "reject": 0,
            "modify": 0,
            "auto_accept": 1
          }
        }
      }
    },
    "files": {
      "totalLinesAdded": 0,
      "totalLinesRemoved": 0
    }
  }
}
```

### Redirection de fichiers

Enregistre la sortie dans des fichiers ou redirige vers d'autres commandes :

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

## Options de Configuration

Options principales en ligne de commande pour une utilisation headless :

| Option                  | Description                           | Exemple                                          |
| ----------------------- | ------------------------------------- | ------------------------------------------------ |
| `--prompt`, `-p`        | Exécuter en mode headless             | `qwen -p "query"`                                |
| `--output-format`       | Spécifier le format de sortie (text, json) | `qwen -p "query" --output-format json`      |
| `--model`, `-m`         | Spécifier le modèle Qwen              | `qwen -p "query" -m qwen3-coder-plus`            |
| `--debug`, `-d`         | Activer le mode debug                 | `qwen -p "query" --debug`                        |
| `--all-files`, `-a`     | Inclure tous les fichiers dans le contexte | `qwen -p "query" --all-files`               |
| `--include-directories` | Inclure des répertoires supplémentaires | `qwen -p "query" --include-directories src,docs` |
| `--yolo`, `-y`          | Approuver automatiquement toutes les actions | `qwen -p "query" --yolo`                   |
| `--approval-mode`       | Définir le mode d'approbation         | `qwen -p "query" --approval-mode auto_edit`      |

Pour plus de détails sur toutes les options de configuration disponibles, les fichiers de paramètres et les variables d’environnement, consultez le [Guide de Configuration](./cli/configuration.md).

## Exemples

#### Revue de code

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

#### Générer des messages de commit

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

#### Documentation d'API

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

#### Analyse de code par lot

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

#### Revue de code

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

#### Analyse des logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

#### Génération des release notes

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

#### Suivi de l'utilisation des modèles et des outils

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
# Mode sans interface graphique

Le mode sans interface graphique vous permet d'exécuter Qwen Code par programme à partir de scripts en ligne de commande et d'outils d'automatisation sans aucune interface utilisateur interactive. C'est idéal pour les scripts, l'automatisation, les pipelines CI/CD et la création d'outils alimentés par l'IA.

## Aperçu

Le mode sans interface graphique fournit une interface sans interface graphique à Qwen Code qui :

- Accepte les invites via des arguments de ligne de commande ou stdin
- Retourne une sortie structurée (texte ou JSON)
- Prend en charge la redirection de fichiers et le piping
- Permet l'automatisation et les flux de travail par script
- Fournit des codes de sortie cohérents pour la gestion des erreurs
- Peut reprendre les sessions précédentes limitées au projet actuel pour l'automatisation en plusieurs étapes

## Utilisation de base

### Invites directes

Utilisez l'option `--prompt` (ou `-p`) pour exécuter en mode sans interface graphique :

```bash
qwen --prompt "Qu'est-ce que le machine learning ?"
```

### Entrée Stdin

Transférez l'entrée vers Qwen Code depuis votre terminal :

```bash
echo "Explique ce code" | qwen
```

### Combinaison avec l'entrée de fichiers

Lire à partir de fichiers et traiter avec Qwen Code :

```bash
cat README.md | qwen --prompt "Résumer cette documentation"
```

### Reprise des sessions précédentes (mode sans interface)

Réutiliser le contexte de conversation du projet actuel dans des scripts en mode sans interface :

```bash

# Poursuivre la session la plus récente pour ce projet et exécuter une nouvelle invite
qwen --continue -p "Relancer les tests et résumer les échecs"

# Reprendre directement une session spécifique par son ID (sans interface utilisateur)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Appliquer le refactoring demandé"
```

> [!note]
>
> - Les données de session sont stockées au format JSONL dans `~/.qwen/projects/<répertoire-courant-sanitisé>/chats`.
> - Restaure l'historique des conversations, les sorties d'outils et les points de contrôle de compression de discussion avant d'envoyer la nouvelle invite.

## Formats de sortie

Qwen Code prend en charge plusieurs formats de sortie pour différents cas d'utilisation :

### Sortie texte (par défaut)

Sortie standard lisible par l'humain :

```bash
qwen -p "Quelle est la capitale de la France ?"
```

Format de réponse :

```
La capitale de la France est Paris.
```

### Sortie JSON

Retourne des données structurées sous forme d'un tableau JSON. Tous les messages sont mis en mémoire tampon et affichés ensemble lorsque la session se termine. Ce format est idéal pour le traitement programmé et les scripts d'automatisation.

La sortie JSON est un tableau d'objets message. La sortie inclut plusieurs types de messages : messages système (initialisation de la session), messages de l'assistant (réponses de l'IA) et messages de résultat (résumé de l'exécution).

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

Le format Stream-JSON émet immédiatement des messages JSON au fur et à mesure de leur occurrence pendant l'exécution, permettant une surveillance en temps réel. Ce format utilise du JSON délimité par des lignes où chaque message est un objet JSON complet sur une seule ligne.

```bash
qwen -p "Expliquez TypeScript" --output-format stream-json
```

Sortie (diffusion en continu au fur et à mesure des événements) :

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Lorsqu'il est combiné avec `--include-partial-messages`, des événements de flux supplémentaires sont émis en temps réel (message_start, content_block_delta, etc.) pour les mises à jour d'interface utilisateur en temps réel.

```bash
qwen -p "Écrivez un script Python" --output-format stream-json --include-partial-messages
```

### Format d'entrée

Le paramètre `--input-format` contrôle la manière dont Qwen Code consomme l'entrée depuis l'entrée standard :

- **`text`** (par défaut) : Entrée texte standard depuis stdin ou les arguments de ligne de commande
- **`stream-json`** : Protocole de message JSON via stdin pour une communication bidirectionnelle

> **Remarque :** Le mode d'entrée stream-json est actuellement en cours de développement et est destiné à l'intégration avec les SDK. Il nécessite que `--output-format stream-json` soit défini.

### Redirection de fichiers

Enregistrer la sortie dans des fichiers ou rediriger vers d'autres commandes :

```bash

# Enregistrer dans un fichier
qwen -p "Expliquer Docker" > docker-explanation.txt
qwen -p "Expliquer Docker" --output-format json > docker-explanation.json

# Ajouter à un fichier
qwen -p "Ajouter plus de détails" >> docker-explanation.txt

# Rediriger vers d'autres outils
qwen -p "Qu'est-ce que Kubernetes ?" --output-format json | jq '.response'
qwen -p "Expliquer les microservices" | wc -w
qwen -p "Lister les langages de programmation" | grep -i "python"
```

# Sortie Stream-JSON pour le traitement en temps réel
qwen -p "Expliquer Docker" --output-format stream-json | jq '.type'
qwen -p "Écrire du code" --output-format stream-json --include-partial-messages | jq '.event.type'

## Options de configuration

Principales options de ligne de commande pour une utilisation sans interface graphique :

| Option                       | Description                                         | Exemple                                                                  |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Exécuter en mode sans interface graphique           | `qwen -p "requête"`                                                      |
| `--output-format`, `-o`      | Spécifier le format de sortie (text, json, stream-json) | `qwen -p "requête" --output-format json`                             |
| `--input-format`             | Spécifier le format d'entrée (text, stream-json)    | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Inclure les messages partiels dans la sortie stream-json | `qwen -p "requête" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Activer le mode débogage                            | `qwen -p "requête" --debug`                                              |
| `--all-files`, `-a`          | Inclure tous les fichiers dans le contexte          | `qwen -p "requête" --all-files`                                          |
| `--include-directories`      | Inclure des répertoires supplémentaires             | `qwen -p "requête" --include-directories src,docs`                       |
| `--yolo`, `-y`               | Approuver automatiquement toutes les actions        | `qwen -p "requête" --yolo`                                               |
| `--approval-mode`            | Définir le mode d'approbation                       | `qwen -p "requête" --approval-mode auto_edit`                           |
| `--continue`                 | Reprendre la session la plus récente pour ce projet | `qwen --continue -p "Reprendre là où nous nous étions arrêtés"`          |
| `--resume [sessionId]`       | Reprendre une session spécifique (ou choisir de manière interactive) | `qwen --resume 123e... -p "Terminer le refactoring"`                |

Pour des détails complets sur toutes les options de configuration disponibles, les fichiers de paramètres et les variables d'environnement, consultez le [Guide de configuration](../configuration/settings).

## Exemples

### Revue de code

```bash
cat src/auth.py | qwen -p "Revoir ce code d'authentification pour les problèmes de sécurité" > security-review.txt
```

### Générer des messages de commit

```bash
result=$(git diff --cached | qwen -p "Écrire un message de commit concis pour ces modifications" --output-format json)
echo "$result" | jq -r '.response'
```

### Documentation d'API

```bash
result=$(cat api/routes.js | qwen -p "Générer la spécification OpenAPI pour ces routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Analyse de code par lots

```bash
for file in src/*.py; do
    echo "Analyse de $file..."
    result=$(cat "$file" | qwen -p "Trouver les bogues potentiels et suggérer des améliorations" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Analyse terminée pour $(basename "$file")" >> reports/progress.log
done
```

### Revue de code PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Examiner ces modifications à la recherche de bogues, problèmes de sécurité et qualité du code" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Analyse des logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyser ces erreurs et suggérer les causes racines et correctifs" > error-analysis.txt
```

### Génération des notes de version

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Générer les notes de version à partir de ces validations" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Suivi de l'utilisation des modèles et des outils

```bash
result=$(qwen -p "Expliquez ce schéma de base de données" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls appels d'outils ($tools_used) utilisés avec les modèles : $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Tendances récentes d'utilisation :"
tail -5 usage.log
```

## Ressources

- [Configuration de l'interface en ligne de commande](../configuration/settings#command-line-arguments) - Guide complet de configuration
- [Authentification](../configuration/settings#environment-variables-for-api-access) - Configuration de l'authentification
- [Commandes](../features/commands) - Référence des commandes interactives
- [Tutoriels](../quickstart) - Guides d'automatisation étape par étape
# Mode Headless

Le mode headless vous permet d'exécuter Qwen Code de manière programmatique à partir de scripts en ligne de commande et d'outils d'automatisation sans interface utilisateur interactive. C'est idéal pour les scripts, l'automatisation, les pipelines CI/CD et la création d'outils alimentés par l'IA.

## Aperçu

Le mode headless fournit une interface headless à Qwen Code qui :

- Accepte les invites via des arguments de ligne de commande ou stdin
- Retourne une sortie structurée (texte ou JSON)
- Prend en charge la redirection de fichiers et le piping
- Permet l'automatisation et les flux de travail de script
- Fournit des codes de sortie cohérents pour la gestion des erreurs
- Peut reprendre les sessions précédentes liées au projet actuel pour une automatisation en plusieurs étapes

## Utilisation de base

### Invites directes

Utilisez le drapeau `--prompt` (ou `-p`) pour exécuter en mode headless :

```bash
qwen --prompt "Qu'est-ce que l'apprentissage automatique ?"
```

### Entrée Stdin

Transférez l'entrée vers Qwen Code depuis votre terminal :

```bash
echo "Explique ce code" | qwen
```

### Combiner avec une entrée fichier

Lire depuis des fichiers et traiter avec Qwen Code :

```bash
cat README.md | qwen --prompt "Résume cette documentation"
```

### Reprendre les sessions précédentes (Headless)

Réutiliser le contexte de conversation du projet actuel dans des scripts headless :

```bash

# Continuer la session la plus récente pour ce projet et exécuter une nouvelle invite
qwen --continue -p "Exécute à nouveau les tests et résume les échecs"

# Reprendre directement un ID de session spécifique (pas d'interface utilisateur)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Applique le refactoring complémentaire"
```

> [!note]
>
> - Les données de session sont des fichiers JSONL scopés par projet sous `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restaure l'historique de conversation, les sorties d'outils et les points de contrôle de compression de discussion avant d'envoyer la nouvelle invite.

## Formats de sortie

Qwen Code prend en charge plusieurs formats de sortie pour différents cas d'utilisation :

### Sortie texte (par défaut)

Sortie standard lisible par l'homme :

```bash
qwen -p "Quelle est la capitale de la France ?"
```

Format de la réponse :

```
La capitale de la France est Paris.
```

### Sortie JSON

Retourne des données structurées sous forme de tableau JSON. Tous les messages sont mis en mémoire tampon et sortis ensemble lorsque la session se termine. Ce format est idéal pour le traitement programmatique et les scripts d'automatisation.

La sortie JSON est un tableau d'objets message. La sortie inclut plusieurs types de messages : messages système (initialisation de la session), messages d'assistant (réponses de l'IA) et messages de résultat (résumé de l'exécution).

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

Le format Stream-JSON émet des messages JSON immédiatement lorsqu'ils se produisent pendant l'exécution, permettant une surveillance en temps réel. Ce format utilise du JSON délimité par des lignes, où chaque message est un objet JSON complet sur une seule ligne.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Sortie (diffusée en continu au fur et à mesure des événements) :

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

Le paramètre `--input-format` contrôle la façon dont Qwen Code consomme les entrées depuis l'entrée standard :

- **`text`** (par défaut) : Entrée texte standard depuis stdin ou les arguments de ligne de commande
- **`stream-json`** : Protocole de messages JSON via stdin pour une communication bidirectionnelle

> **Remarque :** Le mode d'entrée Stream-json est actuellement en construction et destiné à l'intégration avec le SDK. Il nécessite que `--output-format stream-json` soit défini.

### Redirection de fichiers

Enregistrez la sortie dans des fichiers ou redirigez-la vers d'autres commandes :

```bash

# Enregistrer dans un fichier
qwen -p "Expliquer Docker" > docker-explanation.txt
qwen -p "Expliquer Docker" --output-format json > docker-explanation.json

# Ajouter à un fichier
qwen -p "Ajouter plus de détails" >> docker-explanation.txt

# Rediriger vers d'autres outils
qwen -p "Qu'est-ce que Kubernetes ?" --output-format json | jq '.response'
qwen -p "Expliquer les microservices" | wc -w
qwen -p "Lister les langages de programmation" | grep -i "python"```

# Sortie Stream-JSON pour le traitement en temps réel
qwen -p "Expliquer Docker" --output-format stream-json | jq '.type'
qwen -p "Écrire du code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Options de configuration

Options principales en ligne de commande pour une utilisation sans interface graphique :

| Option                       | Description                                         | Exemple                                                                  |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Exécuter en mode sans interface graphique           | `qwen -p "requête"`                                                      |
| `--output-format`, `-o`      | Spécifier le format de sortie (text, json, stream-json) | `qwen -p "requête" --output-format json`                                 |
| `--input-format`             | Spécifier le format d'entrée (text, stream-json)    | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Inclure les messages partiels dans la sortie stream-json | `qwen -p "requête" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Activer le mode débogage                            | `qwen -p "requête" --debug`                                              |
| `--all-files`, `-a`          | Inclure tous les fichiers dans le contexte          | `qwen -p "requête" --all-files`                                          |
| `--include-directories`      | Inclure des répertoires supplémentaires             | `qwen -p "requête" --include-directories src,docs`                       |
| `--yolo`, `-y`               | Approuver automatiquement toutes les actions        | `qwen -p "requête" --yolo`                                               |
| `--approval-mode`            | Définir le mode d'approbation                       | `qwen -p "requête" --approval-mode auto_edit`                            |
| `--continue`                 | Reprendre la session la plus récente pour ce projet | `qwen --continue -p "Reprendre là où nous nous étions arrêtés"`          |
| `--resume [sessionId]`       | Reprendre une session spécifique (ou choisir de manière interactive) | `qwen --resume 123e... -p "Terminer le refactoring"`                     |

Pour obtenir tous les détails sur les options de configuration disponibles, les fichiers de paramètres et les variables d'environnement, consultez le [Guide de configuration](../users/configuration/settings).

## Exemples

### Revue de code

```bash
cat src/auth.py | qwen -p "Examinez ce code d'authentification pour identifier les problèmes de sécurité" > security-review.txt
```

### Génération de messages de commit

```bash
result=$(git diff --cached | qwen -p "Écrivez un message de commit concis pour ces modifications" --output-format json)
echo "$result" | jq -r '.response'
```

### Documentation d'API

```bash
result=$(cat api/routes.js | qwen -p "Générez une spécification OpenAPI pour ces routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Analyse de code par lots

```bash
for file in src/*.py; do
    echo "Analyse de $file..."
    result=$(cat "$file" | qwen -p "Trouvez les bogues potentiels et suggérez des améliorations" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Analyse terminée pour $(basename "$file")" >> reports/progress.log
done
```

### Revue de code PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Examinez ces modifications pour détecter les bogues, les problèmes de sécurité et la qualité du code" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Analyse des journaux

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analysez ces erreurs et suggérez les causes principales et les corrections" > error-analysis.txt
```

### Génération des notes de version

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Générez les notes de version à partir de ces commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Suivi de l'utilisation des modèles et des outils

```bash
result=$(qwen -p "Expliquez ce schéma de base de données" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "aucun" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "aucun" else . end')
echo "$(date): $total_tokens jetons, $tool_calls appels d'outils ($tools_used) utilisés avec les modèles : $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Tendances d'utilisation récentes :"
tail -5 usage.log
```

## Ressources

- [Configuration de la CLI](../users/configuration/settings#command-line-arguments) - Guide complet de configuration
- [Authentification](../users/configuration/settings#environment-variables-for-api-access) - Configuration de l'authentification
- [Commandes](../users/reference/cli-reference) - Référence interactive des commandes
- [Tutoriels](../users/quickstart) - Guides d'automatisation pas à pas
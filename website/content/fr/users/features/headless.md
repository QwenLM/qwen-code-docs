# Mode sans interface graphique

Le mode sans interface graphique vous permet d’exécuter Qwen Code par programmation depuis des scripts en ligne de commande et des outils d’automatisation, sans aucune interface utilisateur interactive. Ce mode est idéal pour les scripts, l’automatisation, les pipelines CI/CD et la création d’outils pilotés par l’intelligence artificielle.

## Aperçu

Le mode sans interface graphique fournit une interface sans interface utilisateur à Qwen Code qui :

- Accepte les invites via des arguments de ligne de commande ou via l’entrée standard (stdin)  
- Renvoie une sortie structurée (texte ou JSON)
- Prend en charge la redirection de fichiers et le chaînage (piping)
- Permet l’automatisation et les workflows de script
- Fournit des codes de sortie cohérents pour la gestion des erreurs
- Peut reprendre des sessions précédentes limitées au projet courant, afin de prendre en charge des automatisations multi-étapes

## Utilisation de base

### Invites directes

Utilisez l’option `--prompt` (ou `-p`) pour exécuter Qwen Code en mode sans interface graphique :

```bash
qwen --prompt "Qu’est-ce que l’apprentissage automatique ?"
```

### Entrée via stdin

Transmettez une entrée à Qwen Code depuis votre terminal à l’aide d’un pipe :

```bash
echo "Explique ce code" | qwen
```

### Combinaison avec une entrée fichier

Lisez depuis des fichiers et traitez-les avec Qwen Code :

```bash
cat README.md | qwen --prompt "Résumez cette documentation"
```

### Reprise de sessions précédentes (mode sans interface)

Réutilisez le contexte de conversation issu du projet actuel dans des scripts exécutés en mode sans interface :

```bash

# Poursuivez la session la plus récente pour ce projet et exécutez une nouvelle instruction
qwen --continue -p "Exécutez à nouveau les tests et résumez les échecs"

# Reprenez directement une session spécifique à l’aide de son identifiant (sans interface utilisateur)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Appliquez la refactorisation complémentaire"
```

> [!note]
>
> - Les données de session sont stockées au format JSONL, par projet, dans `~/.qwen/projects/<répertoire-de-travail-normalisé>/chats`.
> - La reprise restaure l’historique des conversations, les sorties des outils et les points de contrôle de compression des discussions avant d’envoyer la nouvelle instruction.

## Formats de sortie

Qwen Code prend en charge plusieurs formats de sortie adaptés à divers cas d’usage :

### Sortie texte (par défaut)

Sortie lisible par un humain, au format standard :

```bash
qwen -p "Quelle est la capitale de la France ?"
```

Format de la réponse :

```
La capitale de la France est Paris.
```

### Sortie JSON

Renvoie des données structurées sous forme d’un tableau JSON. Tous les messages sont mis en mémoire tampon et émis ensemble une fois la session terminée. Ce format convient idéalement au traitement automatisé et aux scripts d’automatisation.

La sortie JSON est un tableau d’objets message. Elle inclut plusieurs types de messages : messages système (initialisation de la session), messages assistant (réponses de l’IA) et messages résultat (résumé de l’exécution).

#### Exemple d’utilisation

```bash
qwen -p "Quelle est la capitale de la France ?" --output-format json
```

Sortie (à la fin de l’exécution) :

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

Le format Stream-JSON émet des messages JSON immédiatement dès qu’ils surviennent pendant l’exécution, ce qui permet une surveillance en temps réel. Ce format utilise un JSON délimité par des lignes, où chaque message est un objet JSON complet sur une seule ligne.

```bash
qwen -p "Expliquez TypeScript" --output-format stream-json
```

Sortie (diffusée en continu au fur et à mesure que les événements se produisent) :

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Lorsqu’il est combiné avec l’option `--include-partial-messages`, des événements supplémentaires sont émis en temps réel (par exemple `message_start`, `content_block_delta`, etc.), permettant des mises à jour en temps réel de l’interface utilisateur.

```bash
qwen -p "Écrivez un script Python" --output-format stream-json --include-partial-messages
```

### Format d’entrée

Le paramètre `--input-format` contrôle la façon dont Qwen Code consomme les entrées depuis l’entrée standard :

- **`texte`** (par défaut) : Entrée texte standard depuis l’entrée standard ou depuis les arguments de ligne de commande  
- **`stream-json`** : Protocole de messages JSON via l’entrée standard, destiné à une communication bidirectionnelle  

> **Remarque :** Le mode d’entrée `stream-json` est actuellement en cours de développement et prévu pour l’intégration avec les SDK. Il nécessite que l’option `--output-format stream-json` soit également spécifiée.

### Redirection de fichiers

Enregistrer la sortie dans des fichiers ou la transmettre à d’autres commandes :

```bash

# Enregistrer dans un fichier
qwen -p "Expliquez Docker" > docker-explanation.txt
qwen -p "Expliquez Docker" --output-format json > docker-explanation.json

# Ajouter à un fichier existant
qwen -p "Ajoutez plus de détails" >> docker-explanation.txt

# Transmettre à d’autres outils
qwen -p "Qu’est-ce que Kubernetes ?" --output-format json | jq '.response'
qwen -p "Expliquez les microservices" | wc -w
qwen -p "Listez les langages de programmation" | grep -i "python"

# Sortie Stream-JSON pour le traitement en temps réel
qwen -p "Expliquer Docker" --output-format stream-json | jq '.type'
qwen -p "Écrire du code" --output-format stream-json --include-partial-messages | jq '.event.type'

## Options de configuration

Principales options en ligne de commande pour une utilisation sans interface graphique :

| Option                       | Description                                         | Exemple                                                                  |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Exécuter en mode sans interface graphique           | `qwen -p "requête"`                                                      |
| `--output-format`, `-o`      | Spécifier le format de sortie (texte, json, stream-json) | `qwen -p "requête" --output-format json`                                 |
| `--input-format`             | Spécifier le format d’entrée (texte, stream-json)    | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Inclure les messages partiels dans la sortie stream-json | `qwen -p "requête" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Activer le mode débogage                            | `qwen -p "requête" --debug`                                               |
| `--all-files`, `-a`          | Inclure tous les fichiers dans le contexte          | `qwen -p "requête" --all-files`                                           |
| `--include-directories`      | Inclure des répertoires supplémentaires             | `qwen -p "requête" --include-directories src,docs`                       |
| `--yolo`, `-y`               | Approuver automatiquement toutes les actions         | `qwen -p "requête" --yolo`                                               |
| `--approval-mode`            | Définir le mode d’approbation                      | `qwen -p "requête" --approval-mode auto_edit`                            |
| `--continue`                 | Reprendre la session la plus récente pour ce projet  | `qwen --continue -p "Reprendre là où nous nous étions arrêtés"`          |
| `--resume [sessionId]`       | Reprendre une session spécifique (ou choisir de façon interactive) | `qwen --resume 123e... -p "Terminer la refactorisation"`                  |

Pour obtenir tous les détails concernant les options de configuration disponibles, les fichiers de paramètres et les variables d’environnement, consultez le [Guide de configuration](../configuration/settings).

## Exemples

### Révision de code

```bash
cat src/auth.py | qwen -p "Examine ce code d’authentification pour détecter des problèmes de sécurité" > security-review.txt
```

### Génération de messages de validation (commit)

```bash
result=$(git diff --cached | qwen -p "Rédige un message de validation concis pour ces modifications" --output-format json)
echo "$result" | jq -r '.response'
```

### Documentation d’API

```bash
result=$(cat api/routes.js | qwen -p "Génère une spécification OpenAPI pour ces routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Analyse de code par lot

```bash
for file in src/*.py; do
    echo "Analyse de $file..."
    result=$(cat "$file" | qwen -p "Détecte les bogues potentiels et propose des améliorations" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Analyse terminée pour $(basename "$file")" >> reports/progress.log
done
```

### Révision de code pour les demandes d’intégration (PR)

```bash
result=$(git diff origin/main...HEAD | qwen -p "Examiner ces modifications à la recherche de bogues, de problèmes de sécurité et de défauts de qualité du code" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Analyse des journaux (logs)

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyser ces erreurs et proposer les causes racines ainsi que les correctifs appropriés" > error-analysis.txt
```

### Génération des notes de version

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Générer des notes de version à partir de ces validations (commits)" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Suivi de l’utilisation des modèles et des outils

```bash
result=$(qwen -p "Expliquez ce schéma de base de données" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens jetons, $tool_calls appels d’outils ($tools_used), utilisés avec les modèles : $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Tendances récentes d’utilisation :"
tail -5 usage.log
```

## Ressources

- [Configuration de l’interface en ligne de commande (CLI)](../configuration/settings#command-line-arguments) — Guide complet de configuration  
- [Authentification](../configuration/settings#environment-variables-for-api-access) — Configuration de l’authentification  
- [Commandes](../features/commands) — Référence des commandes interactives  
- [Tutoriels](../quickstart) — Guides pas à pas pour l’automatisation
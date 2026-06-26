# Mode Headless

Le mode headless vous permet d'exécuter Qwen Code par programmation à partir de scripts en ligne de commande et d'outils d'automatisation, sans aucune interface interactive. C'est idéal pour les scripts, l'automatisation, les pipelines CI/CD et la création d'outils basés sur l'IA.

## Aperçu

Le mode headless fournit une interface non interactive à Qwen Code qui :

- Accepte les invites via les arguments de ligne de commande ou stdin
- Renvoie une sortie structurée (texte ou JSON)
- Prend en charge la redirection de fichiers et le pipelinage
- Permet les workflows d'automatisation et de script
- Fournit des codes de sortie cohérents pour la gestion des erreurs
- Peut reprendre des sessions précédentes limitées au projet actuel pour une automatisation en plusieurs étapes

## Utilisation de base

### Prompts directs

Utilisez le drapeau `--prompt` (ou `-p`) pour exécuter en mode headless :

```bash
qwen --prompt "Qu'est-ce que l'apprentissage automatique ?"
```

### Entrée via stdin

Redirigez l'entrée vers Qwen Code depuis votre terminal :

```bash
echo "Explique ce code" | qwen
```

### Combinaison avec l'entrée fichier

Lisez des fichiers et traitez-les avec Qwen Code :

```bash
cat README.md | qwen --prompt "Résume cette documentation"
```

### Reprendre des sessions précédentes (Headless)

Réutilisez le contexte de conversation du projet actuel dans des scripts headless :

```bash
# Continuer la session la plus récente pour ce projet et exécuter une nouvelle invite
qwen --continue -p "Relance les tests et résume les échecs"

# Reprendre directement un ID de session spécifique (sans UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Applique le suivi de refactorisation"
```

> [!note]
>
> - Les données de session sont des fichiers JSONL limités au projet sous `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restaure l'historique de la conversation, les sorties des outils et les points de contrôle de compression du chat avant d'envoyer la nouvelle invite.

## Personnaliser l'invite de session principale

Vous pouvez modifier l'invite système de la session principale pour une seule exécution CLI sans modifier les fichiers de mémoire partagée.

### Remplacer l'invite système intégrée

Utilisez `--system-prompt` pour remplacer l'invite système intégrée de la session principale de Qwen Code pour l'exécution en cours :

```bash
qwen -p "Revue ce patch" --system-prompt "Tu es un relecteur de version concis. Signale uniquement les problèmes bloquants."
```

### Ajouter des instructions supplémentaires

Utilisez `--append-system-prompt` pour conserver l'invite intégrée et ajouter des instructions supplémentaires pour cette exécution :

```bash
qwen -p "Revue ce patch" --append-system-prompt "Sois concis et concentre-toi sur des résultats concrets."
```

Vous pouvez combiner les deux drapeaux lorsque vous voulez une invite de base personnalisée plus une instruction supplémentaire spécifique à l'exécution :

```bash
qwen -p "Résume ce dépôt" \
  --system-prompt "Tu es un planificateur de migration." \
  --append-system-prompt "Renvoie exactement trois puces."
```

> [!note]
>
> - `--system-prompt` s'applique uniquement à la session principale de l'exécution en cours.
> - Les fichiers de mémoire chargés et de contexte comme `QWEN.md` sont toujours ajoutés après `--system-prompt`.
> - `--append-system-prompt` est appliqué après l'invite intégrée et la mémoire chargée, et peut être utilisé conjointement avec `--system-prompt`.

## Formats de sortie

Qwen Code prend en charge plusieurs formats de sortie pour différents cas d'utilisation :

### Sortie texte (par défaut)

Sortie humaine standard :

```bash
qwen -p "Quelle est la capitale de la France ?"
```

Format de réponse :

```
La capitale de la France est Paris.
```

### Sortie JSON

Renvoie des données structurées sous forme de tableau JSON. Tous les messages sont mis en mémoire tampon et sortis ensemble lorsque la session se termine. Ce format est idéal pour le traitement programmatique et les scripts d'automatisation.

La sortie JSON est un tableau d'objets message. La sortie comprend plusieurs types de messages : messages système (initialisation de session), messages assistant (réponses IA) et messages résultat (résumé d'exécution).

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

Le format Stream-JSON émet des messages JSON immédiatement lorsqu'ils se produisent pendant l'exécution, permettant une surveillance en temps réel. Ce format utilise du JSON délimité par ligne où chaque message est un objet JSON complet sur une seule ligne.

```bash
qwen -p "Explique TypeScript" --output-format stream-json
```

Sortie (en flux au fur et à mesure des événements) :

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Lorsqu'il est combiné avec `--include-partial-messages`, des événements de flux supplémentaires sont émis en temps réel (message_start, content_block_delta, etc.) pour les mises à jour d'interface en temps réel.

```bash
qwen -p "Écris un script Python" --output-format stream-json --include-partial-messages
```

### Format d'entrée

Le paramètre `--input-format` contrôle la manière dont Qwen Code consomme l'entrée depuis l'entrée standard :

- **`text`** (par défaut) : Entrée texte standard depuis stdin ou les arguments de ligne de commande
- **`stream-json`** : Protocole de message JSON via stdin pour une communication bidirectionnelle

> **Note :** Le mode d'entrée stream-json est actuellement en construction et est destiné à l'intégration SDK. Il nécessite que `--output-format stream-json` soit défini.

### Redirection de fichiers

Sauvegardez la sortie dans des fichiers ou pipez-la vers d'autres commandes :

```bash
# Sauvegarder dans un fichier
qwen -p "Explique Docker" > docker-explanation.txt
qwen -p "Explique Docker" --output-format json > docker-explanation.json

# Ajouter à un fichier
qwen -p "Ajoute plus de détails" >> docker-explanation.txt

# Pipe vers d'autres outils
qwen -p "Qu'est-ce que Kubernetes ?" --output-format json | jq '.response'
qwen -p "Explique les microservices" | wc -w
qwen -p "Liste les langages de programmation" | grep -i "python"

# Sortie Stream-JSON pour traitement en temps réel
qwen -p "Explique Docker" --output-format stream-json | jq '.type'
qwen -p "Écris du code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Options de configuration

Options clés de ligne de commande pour l'utilisation headless :

| Option                       | Description                                                              | Exemple                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Exécuter en mode headless                                                | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Spécifier le format de sortie (text, json, stream-json)                  | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Spécifier le format d'entrée (text, stream-json)                         | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Inclure les messages partiels dans la sortie stream-json                 | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Remplacer l'invite système de la session principale pour cette exécution | `qwen -p "query" --system-prompt "Tu es un relecteur concis."`           |
| `--append-system-prompt`     | Ajouter des instructions supplémentaires à l'invite système              | `qwen -p "query" --append-system-prompt "Concentre-toi sur des résultats concrets."` |
| `--debug`, `-d`              | Activer le mode débogage                                                 | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Inclure tous les fichiers dans le contexte                               | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Inclure des répertoires supplémentaires                                  | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Approuver automatiquement toutes les actions                             | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Définir le mode d'approbation                                            | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Reprendre la session la plus récente pour ce projet                      | `qwen --continue -p "Reprends là où nous nous sommes arrêtés"`          |
| `--resume [sessionId]`       | Reprendre une session spécifique (ou choisir interactivement)            | `qwen --resume 123e... -p "Termine la refactorisation"`                 |
| `--max-session-turns`        | Limiter le nombre de tours utilisateur/modèle/outil dans l'exécution     | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | Budget temps réel ; accepte `90` (s), `30s`, `5m`, `1h`, `1.5h`          | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | Budget cumulatif d'appels d'outils pour l'exécution                      | `qwen -p "..." --max-tool-calls 50`                                      |

Pour tous les détails sur les options de configuration disponibles, les fichiers de paramètres et les variables d'environnement, voir le [Guide de configuration](../configuration/settings).

## Sécurité lors des exécutions sans surveillance

Les exécutions headless / CI combinées avec `--yolo` (ou `--approval-mode=yolo`) approuvent automatiquement chaque appel d'outil, y compris `shell`, `write` et `edit`. **`--yolo` n'active pas de sandbox** — ces outils s'exécutent au niveau de privilège du processus hôte. Lorsque Qwen Code détecte cette combinaison sans sandbox configurée, il imprime un avertissement d'une ligne sur stderr au démarrage. Supprimez l'avertissement avec `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` une fois que vous avez examiné le compromis.

### Budgets au niveau de l'exécution

Qwen Code peut interrompre une exécution sans surveillance lorsqu'elle dépasse l'un des seuils suivants. Chacun est `-1` (illimité) par défaut ; en définir un seul suffit pour limiter un comportement incontrôlé. Ils sont appliqués de manière coopérative via le même `AbortController` qui gère déjà SIGINT, donc une interruption due au budget émet une erreur structurée `FatalBudgetExceededError` (code de sortie **55**) — distincte du code de sortie 53 (limite de tours) et du code 130 de SIGINT, afin que les scripts CI puissent bifurquer selon la raison.

| Drapeau                | Clé de paramètres          | Ce qu'elle limite                                                                                                                                                                                                                    |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`      | `model.maxWallTimeSeconds` | Durée réelle de l'ensemble de l'exécution. Le drapeau accepte `90` (s), `30s`, `5m`, `1h`, `1.5h` (unités fractionnaires supportées). Minimum 1s — les valeurs inférieures à la seconde sont rejetées comme erreurs de frappe. Les paramètres sont en secondes. |
| `--max-tool-calls`     | `model.maxToolCalls`       | Appels d'outils de niveau supérieur cumulatifs émis par la boucle principale (compte les succès _et_ les échecs — le modèle consomme toujours des tokens en cas d'erreur). Voir « Portée » ci-dessous pour les exemptions des sous-agents / sorties structurées. |
| `--max-session-turns` | `model.maxSessionTurns`    | Nombre de tours utilisateur/modèle/outil ; préexistant. Quitte avec le code 53 en cas de dépassement (distinct du code de sortie budget 55).                                                                                         |

#### Portée

- **`--max-tool-calls` compte uniquement les dispatches de niveau supérieur.** Lorsque le modèle appelle l'outil `agent`, le dispatch compte pour **1** ; les appels d'outils internes effectués par le sous-agent créé ne sont **pas** comptés. Un modèle qui canalise le travail via des sous-agents peut effectuer un travail interne illimité avec un petit budget de niveau supérieur. Combinez avec `--exclude-tools agent` si vous avez besoin d'une limite plus stricte.
- **`structured_output` est exempté de `--max-tool-calls`.** Sous `--json-schema`, l'appel `structured_output` terminal du modèle est le contrat « j'ai terminé », pas un vrai travail — il ne compte pas dans `--max-tool-calls` afin qu'une exécution en limite de budget ne soit pas interrompue comme un faux positif. L'exemption est inconditionnelle (y compris les échecs de validation Ajv), donc un modèle bloqué dans une boucle de reprise avec sortie malformée N'EST PAS limité par `--max-tool-calls` ; combinez avec `--max-session-turns` ou `--max-wall-time` pour limiter les reprises.
- **`structured_output` n'est PAS exempté de `--max-session-turns`.** Ce compteur est préexistant et s'incrémente à chaque tour, y compris le contrat terminal. Dimensionnez `--max-session-turns` à `N+1` si vous voulez autoriser `N` tours de travail réel sous `--json-schema`.
- **Exécution unique vs `--input-format stream-json` :** en mode d'entrée stream-json, le démon réinitialise les compteurs de budget au début de chaque message utilisateur ; le budget est par message, pas par processus.
- **`qwen serve` / sessions ACP :** le chemin de session ACP du démon ne consulte PAS actuellement `--max-wall-time` / `--max-tool-calls` depuis settings.json. Ces budgets s'appliquent uniquement aux exécutions uniques `qwen -p` et aux sessions `--input-format stream-json`. (`qwen serve` émet tout de même l'avertissement YOLO-sans-sandbox au démarrage si `tools.approvalMode: 'yolo'` est défini dans les paramètres.)

### Combinaisons recommandées

- **Environnement isolé et de confiance (exécuteur CI éphémère, conteneur) :** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Fixez un budget de tours et un budget temps réel pour qu'un agent bloqué ne puisse pas brûler vos minutes CI, et capturez `--output-format json` pour l'analyse post-exécution / l'audit des appels d'outils.
- **Machine locale ou infrastructure partagée :** passez également `--sandbox` (ou définissez `QWEN_SANDBOX=1`) pour que les outils shell / write / edit s'exécutent dans l'image sandbox.
- **CI de longue durée avec reprise en cas de limite de débit :** combinez `QWEN_CODE_UNATTENDED_RETRY=1` avec `--max-wall-time`. La variable d'environnement de reprise maintient l'exécution en vie au-delà des réponses 429 / 529 transitoires ; le budget temps réel garantit qu'un fournisseur en échec persistant ne peut pas prolonger la tâche indéfiniment.
- **Audit / exploration limité :** pour les tâches en lecture seule, `--max-tool-calls 25` limite l'agressivité avec laquelle le modèle peut grep / lire. Combinez avec `--exclude-tools shell,write,edit` pour rendre la limite significative.

## Exemples

### Revue de code

```bash
cat src/auth.py | qwen -p "Revue ce code d'authentification pour des failles de sécurité" > security-review.txt
```

### Générer des messages de commit

```bash
result=$(git diff --cached | qwen -p "Écris un message de commit concis pour ces modifications" --output-format json)
echo "$result" | jq -r '.response'
```

### Documentation d'API

```bash
result=$(cat api/routes.js | qwen -p "Génère une spécification OpenAPI pour ces routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Analyse de code par lots

```bash
for file in src/*.py; do
    echo "Analyse de $file..."
    result=$(cat "$file" | qwen -p "Trouve des bugs potentiels et suggère des améliorations" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Analyse terminée pour $(basename "$file")" >> reports/progress.log
done
```

### Revue de code PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Revue ces modifications pour les bugs, les failles de sécurité et la qualité du code" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Analyse de logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyse ces erreurs et suggère la cause racine et les correctifs" > error-analysis.txt
```

### Génération de notes de version

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Génère des notes de version à partir de ces commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Suivi de l'utilisation du modèle et des outils

```bash
result=$(qwen -p "Explique ce schéma de base de données" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls appels d'outils ($tools_used) utilisés avec les modèles : $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Tendances d'utilisation récentes :"
tail -5 usage.log
```

## Mode de réessai persistant

Lorsque Qwen Code s'exécute dans des pipelines CI/CD ou en tant que démon en arrière-plan, une brève indisponibilité de l'API (limitation de débit ou surcharge) ne devrait pas tuer une tâche de plusieurs heures. Le **mode de réessai persistant** fait en sorte que Qwen Code réessaye indéfiniment les erreurs API transitoires jusqu'à ce que le service se rétablisse.

### Fonctionnement

- **Erreurs transitoires uniquement** : Les erreurs HTTP 429 (Limite de débit) et 529 (Surchargé) sont réessayées indéfiniment. Les autres erreurs (400, 500, etc.) échouent normalement.
- **Backoff exponentiel avec limite** : Les délais de réessai augmentent de manière exponentielle mais sont plafonnés à **5 minutes** par réessai.
- **Heartbeat keepalive** : Pendant les longues attentes, une ligne de statut est imprimée sur stderr toutes les **30 secondes** pour empêcher les exécuteurs CI de tuer le processus en raison d'inactivité.
- **Dégradation gracieuse** : Les erreurs non transitoires et le mode interactif ne sont pas du tout affectés.

### Activation

Définissez la variable d'environnement `QWEN_CODE_UNATTENDED_RETRY` à `true` ou `1` (correspondance stricte, sensible à la casse) :

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Le réessai persistant nécessite une **activation explicite**. `CI=true` seul ne l'active **pas** — transformer silencieusement un travail CI à échec rapide en un travail à attente infinie serait dangereux. Définissez toujours `QWEN_CODE_UNATTENDED_RETRY` explicitement dans la configuration de votre pipeline.

### Exemples

#### GitHub Actions

```yaml
- name: Revue de code automatisée
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Revue tous les fichiers dans src/ pour les failles de sécurité" \
      --output-format json \
      --yolo > review.json
```

#### Traitement par lots de nuit

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migre toutes les fonctions de style callback vers async/await dans src/" --yolo
```

#### Démon en arrière-plan

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audite toutes les dépendances pour les CVE connues" \
  --output-format json > audit.json 2> audit.log &
```

### Surveillance

Pendant le réessai persistant, des messages heartbeat sont imprimés sur **stderr** :

```
[qwen-code] Attente de capacité API... tentative 3, nouvel essai dans 45s
[qwen-code] Attente de capacité API... tentative 3, nouvel essai dans 15s
```

Ces messages maintiennent les exécuteurs CI en vie et vous permettent de surveiller la progression. Ils n'apparaissent pas dans stdout, donc la sortie JSON redirigée vers d'autres outils reste propre.

## Ressources

- [Configuration CLI](../configuration/settings#command-line-arguments) - Guide de configuration complet
- [Authentification](../configuration/auth.md) - Configurer l'authentification
- [Commandes](../features/commands) - Référence des commandes interactives
- [Tutoriels](../quickstart) - Guides d'automatisation pas à pas
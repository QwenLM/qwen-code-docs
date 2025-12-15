# Observabilité avec OpenTelemetry

Découvrez comment activer et configurer OpenTelemetry pour Qwen Code.

- [Observabilité avec OpenTelemetry](#observability-with-opentelemetry)
  - [Avantages clés](#key-benefits)
  - [Intégration OpenTelemetry](#opentelemetry-integration)
  - [Configuration](#configuration)
  - [Télémétrie Aliyun](#aliyun-telemetry)
    - [Prérequis](#prerequisites)
    - [Export direct (Recommandé)](#direct-export-recommended)
  - [Télémétrie locale](#local-telemetry)
    - [Sortie basée sur fichier (Recommandé)](#file-based-output-recommended)
    - [Export via collecteur (Avancé)](#collector-based-export-advanced)
  - [Journaux et métriques](#logs-and-metrics)
    - [Journaux](#logs)
    - [Métriques](#metrics)

## Avantages clés

- **🔍 Analyse d'utilisation** : Comprenez les modèles d'interaction et l'adoption des fonctionnalités
  au sein de votre équipe
- **⚡ Surveillance des performances** : Suivez les temps de réponse, la consommation de jetons et
  l'utilisation des ressources
- **🐛 Débogage en temps réel** : Identifiez les goulets d'étranglement, les échecs et les schémas d'erreur
  dès qu'ils surviennent
- **📊 Optimisation des flux de travail** : Prenez des décisions éclairées pour améliorer
  les configurations et les processus
- **🏢 Gouvernance d'entreprise** : Surveillez l'utilisation entre les équipes, suivez les coûts, assurez-vous de la conformité et intégrez-vous avec l'infrastructure de surveillance existante

## Intégration OpenTelemetry

Basé sur **[OpenTelemetry]** — le framework d'observabilité standard de l'industrie et neutre par rapport aux fournisseurs — le système d'observabilité de Qwen Code offre :

- **Compatibilité universelle** : Exportez vers n'importe quel backend OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Données standardisées** : Utilisez des formats et des méthodes de collecte cohérents dans toute votre chaîne d'outils
- **Intégration pérenne** : Connectez-vous aux infrastructures d'observabilité existantes et futures
- **Absence de verrouillage fournisseur** : Changez de backend sans modifier votre instrumentation

[OpenTelemetry]: https://opentelemetry.io/

## Configuration

> [!note]
>
> **⚠️ Remarque importante : Cette fonctionnalité nécessite des modifications de code correspondantes. Cette documentation est fournie à l'avance ; veuillez vous référer aux futures mises à jour du code pour la fonctionnalité réelle.**

Tout le comportement de télémétrie est contrôlé via votre fichier `.qwen/settings.json`.
Ces paramètres peuvent être remplacés par des variables d'environnement ou des drapeaux CLI.

| Paramètre      | Variable d'environnement       | Drapeau CLI                                              | Description                                        | Valeurs            | Par défaut              |
| -------------- | ------------------------------ | -------------------------------------------------------- | -------------------------------------------------- | ------------------ | ----------------------- |
| `enabled`      | `QWEN_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                         | Activer ou désactiver la télémétrie                | `true`/`false`     | `false`                 |
| `target`       | `QWEN_TELEMETRY_TARGET`        | `--telemetry-target <local\|qwen>`                       | Où envoyer les données de télémétrie               | `"qwen"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `QWEN_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                        | Point de terminaison du collecteur OTLP            | chaîne URL         | `http://localhost:4317` |
| `otlpProtocol` | `QWEN_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocole de transport OTLP                        | `"grpc"`/`"http"`  | `"grpc"`                |
| `outfile`      | `QWEN_TELEMETRY_OUTFILE`       | `--telemetry-outfile <chemin>`                           | Enregistrer la télémétrie dans un fichier (remplace `otlpEndpoint`) | chemin de fichier      | -                       |
| `logPrompts`   | `QWEN_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Inclure les invites dans les journaux de télémétrie | `true`/`false`     | `true`                  |
| `useCollector` | `QWEN_TELEMETRY_USE_COLLECTOR` | -                                                        | Utiliser un collecteur OTLP externe (avancé)       | `true`/`false`     | `false`                 |

**Remarque sur les variables d'environnement booléennes :** Pour les paramètres booléens (`enabled`,
`logPrompts`, `useCollector`), définir la variable d'environnement correspondante à
`true` ou `1` activera la fonctionnalité. Toute autre valeur la désactivera.

Pour des informations détaillées sur toutes les options de configuration, consultez le
[Guide de configuration](./cli/configuration.md).

## Télémétrie Aliyun

### Export direct (Recommandé)

Envoie la télémétrie directement aux services Aliyun. Aucun collecteur nécessaire.

1. Activez la télémétrie dans votre fichier `.qwen/settings.json` :
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Exécutez Qwen Code et envoyez des invites.
3. Consultez les journaux et métriques dans la console Aliyun.

## Télémétrie locale

Pour le développement local et le débogage, vous pouvez capturer les données de télémétrie localement :

### Sortie basée sur un fichier (Recommandé)

1. Activez la télémétrie dans votre fichier `.qwen/settings.json` :
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "local",
       "otlpEndpoint": "",
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```
2. Exécutez Qwen Code et envoyez des invites.
3. Consultez les journaux et métriques dans le fichier spécifié (par exemple, `.qwen/telemetry.log`).

### Export basé sur un collecteur (Avancé)

1. Exécutez le script d'automatisation :
   ```bash
   npm run telemetry -- --target=local
   ```
   Cela va :
   - Télécharger et démarrer Jaeger et le collecteur OTEL
   - Configurer votre espace de travail pour la télémétrie locale
   - Fournir une interface utilisateur Jaeger à l'adresse http://localhost:16686
   - Enregistrer les journaux/métriques dans `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Arrêter le collecteur à la sortie (par exemple, `Ctrl+C`)
2. Exécutez Qwen Code et envoyez des invites.
3. Consultez les traces à l'adresse http://localhost:16686 et les journaux/métriques dans le fichier journal du collecteur.

## Journaux et métriques

La section suivante décrit la structure des journaux et métriques générés pour
Qwen Code.

- Un `sessionId` est inclus en tant qu'attribut commun sur tous les journaux et métriques.

### Journaux

Les journaux sont des enregistrements horodatés d'événements spécifiques. Les événements suivants sont journalisés pour Qwen Code :

- `qwen-code.config` : Cet événement se produit une fois au démarrage avec la configuration de l'interface de ligne de commande.
  - **Attributs** :
    - `model` (chaîne de caractères)
    - `embedding_model` (chaîne de caractères)
    - `sandbox_enabled` (booléen)
    - `core_tools_enabled` (chaîne de caractères)
    - `approval_mode` (chaîne de caractères)
    - `api_key_enabled` (booléen)
    - `vertex_ai_enabled` (booléen)
    - `code_assist_enabled` (booléen)
    - `log_prompts_enabled` (booléen)
    - `file_filtering_respect_git_ignore` (booléen)
    - `debug_mode` (booléen)
    - `mcp_servers` (chaîne de caractères)
    - `output_format` (chaîne de caractères : "text" ou "json")

- `qwen-code.user_prompt` : Cet événement se produit lorsqu'un utilisateur soumet une invite.
  - **Attributs** :
    - `prompt_length` (entier)
    - `prompt_id` (chaîne de caractères)
    - `prompt` (chaîne de caractères, cet attribut est exclu si `log_prompts_enabled` est configuré à `false`)
    - `auth_type` (chaîne de caractères)

- `qwen-code.tool_call` : Cet événement se produit pour chaque appel de fonction.
  - **Attributs** :
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (booléen)
    - `decision` (chaîne de caractères : "accept", "reject", "auto_accept", ou "modify", le cas échéant)
    - `error` (le cas échéant)
    - `error_type` (le cas échéant)
    - `content_length` (entier, le cas échéant)
    - `metadata` (le cas échéant, dictionnaire de chaîne de caractères -> n'importe quel type)

- `qwen-code.file_operation` : Cet événement se produit pour chaque opération sur un fichier.
  - **Attributs** :
    - `tool_name` (chaîne de caractères)
    - `operation` (chaîne de caractères : "create", "read", "update")
    - `lines` (entier, le cas échéant)
    - `mimetype` (chaîne de caractères, le cas échéant)
    - `extension` (chaîne de caractères, le cas échéant)
    - `programming_language` (chaîne de caractères, le cas échéant)
    - `diff_stat` (chaîne JSON, le cas échéant) : Une chaîne JSON avec les membres suivants :
      - `ai_added_lines` (entier)
      - `ai_removed_lines` (entier)
      - `user_added_lines` (entier)
      - `user_removed_lines` (entier)

- `qwen-code.api_request` : Cet événement se produit lors d'une requête vers l'API Qwen.
  - **Attributs** :
    - `model`
    - `request_text` (le cas échéant)

- `qwen-code.api_error` : Cet événement se produit si la requête API échoue.
  - **Attributs** :
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response` : Cet événement se produit lors de la réception d'une réponse de l'API Qwen.
  - **Attributs** :
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (optionnel)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (le cas échéant)
    - `auth_type`

- `qwen-code.tool_output_truncated` : Cet événement se produit lorsque la sortie d'un appel d'outil est trop volumineuse et est tronquée.
  - **Attributs** :
    - `tool_name` (chaîne de caractères)
    - `original_content_length` (entier)
    - `truncated_content_length` (entier)
    - `threshold` (entier)
    - `lines` (entier)
    - `prompt_id` (chaîne de caractères)

- `qwen-code.malformed_json_response` : Cet événement se produit lorsqu'une réponse `generateJson` de l'API Qwen ne peut pas être analysée comme du JSON.
  - **Attributs** :
    - `model`

- `qwen-code.flash_fallback` : Cet événement se produit lorsque Qwen Code bascule sur flash comme solution de repli.
  - **Attributs** :
    - `auth_type`

- `qwen-code.slash_command` : Cet événement se produit lorsqu'un utilisateur exécute une commande slash.
  - **Attributs** :
    - `command` (chaîne de caractères)
    - `subcommand` (chaîne de caractères, le cas échéant)

- `qwen-code.extension_enable` : Cet événement se produit lorsqu'une extension est activée
- `qwen-code.extension_install` : Cet événement se produit lorsqu'une extension est installée
  - **Attributs** :
    - `extension_name` (chaîne de caractères)
    - `extension_version` (chaîne de caractères)
    - `extension_source` (chaîne de caractères)
    - `status` (chaîne de caractères)
- `qwen-code.extension_uninstall` : Cet événement se produit lorsqu'une extension est désinstallée

### Métriques

Les métriques sont des mesures numériques du comportement au fil du temps. Les métriques suivantes sont collectées pour Qwen Code (les noms des métriques restent `qwen-code.*` pour des raisons de compatibilité) :

- `qwen-code.session.count` (Compteur, Entier) : Incrémenté une fois à chaque démarrage de l'interface en ligne de commande (CLI).

- `qwen-code.tool.call.count` (Compteur, Entier) : Compte les appels d'outils.
  - **Attributs** :
    - `function_name`
    - `success` (booléen)
    - `decision` (chaîne : "accept", "reject" ou "modify", si applicable)
    - `tool_type` (chaîne : "mcp" ou "native", si applicable)

- `qwen-code.tool.call.latency` (Histogramme, ms) : Mesure la latence des appels d'outils.
  - **Attributs** :
    - `function_name`
    - `decision` (chaîne : "accept", "reject" ou "modify", si applicable)

- `qwen-code.api.request.count` (Compteur, Entier) : Compte toutes les requêtes API.
  - **Attributs** :
    - `model`
    - `status_code`
    - `error_type` (si applicable)

- `qwen-code.api.request.latency` (Histogramme, ms) : Mesure la latence des requêtes API.
  - **Attributs** :
    - `model`

- `qwen-code.token.usage` (Compteur, Entier) : Compte le nombre de jetons utilisés.
  - **Attributs** :
    - `model`
    - `type` (chaîne : "input", "output", "thought", "cache" ou "tool")

- `qwen-code.file.operation.count` (Compteur, Entier) : Compte les opérations sur les fichiers.
  - **Attributs** :
    - `operation` (chaîne : "create", "read", "update") : Le type d'opération sur le fichier.
    - `lines` (Entier, si applicable) : Nombre de lignes dans le fichier.
    - `mimetype` (chaîne, si applicable) : Type MIME du fichier.
    - `extension` (chaîne, si applicable) : Extension du fichier.
    - `model_added_lines` (Entier, si applicable) : Nombre de lignes ajoutées/modifiées par le modèle.
    - `model_removed_lines` (Entier, si applicable) : Nombre de lignes supprimées/modifiées par le modèle.
    - `user_added_lines` (Entier, si applicable) : Nombre de lignes ajoutées/modifiées par l'utilisateur dans les modifications proposées par l'IA.
    - `user_removed_lines` (Entier, si applicable) : Nombre de lignes supprimées/modifiées par l'utilisateur dans les modifications proposées par l'IA.
    - `programming_language` (chaîne, si applicable) : Langage de programmation du fichier.

- `qwen-code.chat_compression` (Compteur, Entier) : Compte les opérations de compression de discussion.
  - **Attributs** :
    - `tokens_before` (Entier) : Nombre de jetons dans le contexte avant compression.
    - `tokens_after` (Entier) : Nombre de jetons dans le contexte après compression.
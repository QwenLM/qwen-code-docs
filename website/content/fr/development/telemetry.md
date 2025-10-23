# Observabilité avec OpenTelemetry

Découvrez comment activer et configurer OpenTelemetry pour Qwen Code.

- [Observabilité avec OpenTelemetry](#observability-with-opentelemetry)
  - [Avantages clés](#key-benefits)
  - [Intégration OpenTelemetry](#opentelemetry-integration)
  - [Configuration](#configuration)
  - [Télémétrie Google Cloud](#google-cloud-telemetry)
    - [Prérequis](#prerequisites)
    - [Export direct (Recommandé)](#direct-export-recommended)
    - [Export via Collector (Avancé)](#collector-based-export-advanced)
  - [Télémétrie locale](#local-telemetry)
    - [Sortie vers fichier (Recommandé)](#file-based-output-recommended)
    - [Export via Collector (Avancé)](#collector-based-export-advanced-1)
  - [Logs et métriques](#logs-and-metrics)
    - [Logs](#logs)
    - [Métriques](#metrics)

## Avantages clés

- **🔍 Analytics d'utilisation** : Comprenez les modèles d'interaction et l'adoption des fonctionnalités
  au sein de votre équipe
- **⚡ Surveillance des performances** : Suivez les temps de réponse, la consommation de tokens et
  l'utilisation des ressources
- **🐛 Débogage en temps réel** : Identifiez les goulots d'étranglement, les échecs et les modèles d'erreur
  dès qu'ils surviennent
- **📊 Optimisation des workflows** : Prenez des décisions éclairées pour améliorer
  les configurations et les processus
- **🏢 Gouvernance d'entreprise** : Surveillez l'utilisation entre les équipes, suivez les coûts, assurez-vous de la conformité et intégrez-vous avec l'infrastructure de monitoring existante

## Intégration OpenTelemetry

Basé sur **[OpenTelemetry]** — le framework d'observabilité standard de l'industrie et neutre par rapport aux fournisseurs — le système d'observabilité de Qwen Code fournit :

- **Compatibilité universelle** : Exportez vers n'importe quel backend OpenTelemetry (Google Cloud, Jaeger, Prometheus, Datadog, etc.)
- **Données standardisées** : Utilisez des formats et des méthodes de collecte cohérents dans toute votre chaîne d'outils
- **Intégration pérenne** : Connectez-vous à l'infrastructure d'observabilité existante et future
- **Pas de verrouillage fournisseur** : Basculez entre les backends sans modifier votre instrumentation

[OpenTelemetry]: https://opentelemetry.io/

## Configuration

Tout le comportement de la télémétrie est contrôlé via votre fichier `.qwen/settings.json`.  
Ces paramètres peuvent être surchargés par des variables d’environnement ou des flags CLI.

| Paramètre      | Variable d’environnement         | Flag CLI                                                 | Description                                       | Valeurs           | Défaut                  |
| -------------- | -------------------------------- | -------------------------------------------------------- | ------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`      | `GEMINI_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                         | Activer ou désactiver la télémétrie                | `true`/`false`    | `false`                 |
| `target`       | `GEMINI_TELEMETRY_TARGET`        | `--telemetry-target <local\|gcp>`                        | Destination des données de télémétrie             | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `GEMINI_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                        | Endpoint du collecteur OTLP                       | URL string        | `http://localhost:4317` |
| `otlpProtocol` | `GEMINI_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocole de transport OTLP                       | `"grpc"`/`"http"` | `"grpc"`                |
| `outfile`      | `GEMINI_TELEMETRY_OUTFILE`       | `--telemetry-outfile <path>`                             | Sauvegarder la télémétrie dans un fichier (remplace `otlpEndpoint`) | file path         | -                       |
| `logPrompts`   | `GEMINI_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Inclure les prompts dans les logs de télémétrie   | `true`/`false`    | `true`                  |
| `useCollector` | `GEMINI_TELEMETRY_USE_COLLECTOR` | -                                                        | Utiliser un collecteur OTLP externe (avancé)      | `true`/`false`    | `false`                 |

**Note sur les variables d’environnement booléennes :** Pour les paramètres booléens (`enabled`, `logPrompts`, `useCollector`), définir la variable d’environnement correspondante à `true` ou `1` activera la fonctionnalité. Toute autre valeur la désactivera.

Pour plus d’informations détaillées sur toutes les options de configuration, consultez le [Guide de Configuration](./cli/configuration.md).

## Google Cloud Telemetry

### Prérequis

Avant d'utiliser l'une des méthodes ci-dessous, effectuez ces étapes :

1. Définissez votre ID de projet Google Cloud :
   - Pour la télémétrie dans un projet séparé de l'inférence :
     ```bash
     export OTLP_GOOGLE_CLOUD_PROJECT="your-telemetry-project-id"
     ```
   - Pour la télémétrie dans le même projet que l'inférence :
     ```bash
     export GOOGLE_CLOUD_PROJECT="your-project-id"
     ```

2. Authentifiez-vous avec Google Cloud :
   - Si vous utilisez un compte utilisateur :
     ```bash
     gcloud auth application-default login
     ```
   - Si vous utilisez un compte de service :
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
     ```
3. Assurez-vous que votre compte ou compte de service dispose de ces rôles IAM :
   - Cloud Trace Agent
   - Monitoring Metric Writer
   - Logs Writer

4. Activez les APIs Google Cloud requises (si elles ne sont pas déjà activées) :
   ```bash
   gcloud services enable \
     cloudtrace.googleapis.com \
     monitoring.googleapis.com \
     logging.googleapis.com \
     --project="$OTLP_GOOGLE_CLOUD_PROJECT"
   ```

### Export direct (Recommandé)

Envoie la télémétrie directement aux services Google Cloud. Aucun collecteur n'est nécessaire.

1. Activez la télémétrie dans votre fichier `.qwen/settings.json` :
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp"
     }
   }
   ```
2. Exécutez Qwen Code et envoyez des prompts.
3. Consultez les logs et métriques :
   - Ouvrez la console Google Cloud dans votre navigateur après avoir envoyé des prompts :
     - Logs : https://console.cloud.google.com/logs/
     - Métriques : https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces : https://console.cloud.google.com/traces/list

### Export via Collector (Avancé)

Pour un traitement personnalisé, un filtrage ou un routage spécifique, utilisez un collector OpenTelemetry pour transférer les données vers Google Cloud.

1. Configurez votre fichier `.qwen/settings.json` :
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "useCollector": true
     }
   }
   ```
2. Exécutez le script d'automatisation :
   ```bash
   npm run telemetry -- --target=gcp
   ```
   Cela va :
   - Démarrer un collector OTEL local qui envoie les données à Google Cloud
   - Configurer votre espace de travail
   - Fournir des liens pour visualiser les traces, métriques et logs dans la Google Cloud Console
   - Sauvegarder les logs du collector dans `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log`
   - Arrêter le collector à la sortie (ex. `Ctrl+C`)
3. Lancez Qwen Code et envoyez des prompts.
4. Consultez les logs et métriques :
   - Ouvrez la Google Cloud Console dans votre navigateur après avoir envoyé des prompts :
     - Logs : https://console.cloud.google.com/logs/
     - Métriques : https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces : https://console.cloud.google.com/traces/list
   - Ouvrez `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` pour voir les logs locaux du collector.

## Télémétrie locale

Pour le développement local et le débogage, vous pouvez capturer les données de télémétrie localement :

### Sortie vers fichier (Recommandé)

1. Activez la télémétrie dans votre `.qwen/settings.json` :
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
2. Exécutez Qwen Code et envoyez des prompts.
3. Consultez les logs et métriques dans le fichier spécifié (ex. : `.qwen/telemetry.log`).

### Export via Collector (Avancé)

1. Exécutez le script d'automatisation :
   ```bash
   npm run telemetry -- --target=local
   ```
   Cela va :
   - Télécharger et démarrer Jaeger et l'OTEL collector
   - Configurer votre workspace pour la télémétrie locale
   - Mettre à disposition une interface Jaeger sur http://localhost:16686
   - Sauvegarder les logs/métriques dans `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Arrêter le collector à la sortie (ex. `Ctrl+C`)
2. Lancez Qwen Code et envoyez des prompts.
3. Consultez les traces sur http://localhost:16686 et les logs/métriques dans le fichier de log du collector.

## Logs et Métriques

La section suivante décrit la structure des logs et métriques générés pour Qwen Code.

- Un `sessionId` est inclus comme attribut commun sur tous les logs et métriques.

### Logs

Les logs sont des enregistrements horodatés d'événements spécifiques. Les événements suivants sont loggués pour Qwen Code :

- `qwen-code.config` : Cet événement se produit une fois au démarrage avec la configuration du CLI.
  - **Attributs** :
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `code_assist_enabled` (boolean)
    - `log_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string : "text" ou "json")

- `qwen-code.user_prompt` : Cet événement se produit lorsqu'un utilisateur soumet un prompt.
  - **Attributs** :
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, cet attribut est exclu si `log_prompts_enabled` est configuré à `false`)
    - `auth_type` (string)

- `qwen-code.tool_call` : Cet événement se produit pour chaque appel de fonction.
  - **Attributs** :
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string : "accept", "reject", "auto_accept", ou "modify", si applicable)
    - `error` (si applicable)
    - `error_type` (si applicable)
    - `content_length` (int, si applicable)
    - `metadata` (si applicable, dictionnaire de string -> any)

- `qwen-code.file_operation` : Cet événement se produit pour chaque opération sur un fichier.
  - **Attributs** :
    - `tool_name` (string)
    - `operation` (string : "create", "read", "update")
    - `lines` (int, si applicable)
    - `mimetype` (string, si applicable)
    - `extension` (string, si applicable)
    - `programming_language` (string, si applicable)
    - `diff_stat` (chaîne JSON, si applicable) : Une chaîne JSON contenant les membres suivants :
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request` : Cet événement se produit lorsqu'une requête est envoyée à l'API Qwen.
  - **Attributs** :
    - `model`
    - `request_text` (si applicable)

- `qwen-code.api_error` : Cet événement se produit si la requête vers l'API échoue.
  - **Attributs** :
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response` : Cet événement se produit lorsqu'une réponse est reçue depuis l'API Qwen.
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
    - `response_text` (si applicable)
    - `auth_type`

- `qwen-code.tool_output_truncated` : Cet événement se produit lorsque la sortie d’un appel d’outil est trop grande et est tronquée.
  - **Attributs** :
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response` : Cet événement se produit lorsqu’une réponse `generateJson` de l’API Qwen ne peut pas être analysée comme du JSON.
  - **Attributs** :
    - `model`

- `qwen-code.flash_fallback` : Cet événement se produit lorsque Qwen Code bascule sur flash comme solution de repli.
  - **Attributs** :
    - `auth_type`

- `qwen-code.slash_command` : Cet événement se produit lorsqu’un utilisateur exécute une commande slash.
  - **Attributs** :
    - `command` (string)
    - `subcommand` (string, si applicable)

- `qwen-code.extension_enable` : Cet événement se produit lorsqu'une extension est activée.
- `qwen-code.extension_install` : Cet événement se produit lorsqu'une extension est installée.
  - **Attributs** :
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall` : Cet événement se produit lorsqu'une extension est désinstallée.

### Metrics

Les métriques sont des mesures numériques du comportement au fil du temps. Les métriques suivantes sont collectées pour Qwen Code (les noms des métriques restent `qwen-code.*` pour des raisons de compatibilité) :

- `qwen-code.session.count` (Compteur, Int) : Incrémenté une fois à chaque démarrage du CLI.

- `qwen-code.tool.call.count` (Compteur, Int) : Compte les appels d'outils.
  - **Attributs** :
    - `function_name`
    - `success` (booléen)
    - `decision` (chaîne : "accept", "reject", ou "modify", si applicable)
    - `tool_type` (chaîne : "mcp", ou "native", si applicable)

- `qwen-code.tool.call.latency` (Histogramme, ms) : Mesure la latence des appels d'outils.
  - **Attributs** :
    - `function_name`
    - `decision` (chaîne : "accept", "reject", ou "modify", si applicable)

- `qwen-code.api.request.count` (Compteur, Int) : Compte toutes les requêtes API.
  - **Attributs** :
    - `model`
    - `status_code`
    - `error_type` (si applicable)

- `qwen-code.api.request.latency` (Histogramme, ms) : Mesure la latence des requêtes API.
  - **Attributs** :
    - `model`

- `qwen-code.token.usage` (Compteur, Int) : Compte le nombre de tokens utilisés.
  - **Attributs** :
    - `model`
    - `type` (chaîne : "input", "output", "thought", "cache", ou "tool")

- `qwen-code.file.operation.count` (Compteur, Int) : Compte les opérations sur les fichiers.
  - **Attributs** :
    - `operation` (chaîne : "create", "read", "update") : Le type d'opération sur le fichier.
    - `lines` (Int, si applicable) : Nombre de lignes dans le fichier.
    - `mimetype` (chaîne, si applicable) : Type MIME du fichier.
    - `extension` (chaîne, si applicable) : Extension du fichier.
    - `model_added_lines` (Int, si applicable) : Nombre de lignes ajoutées/modifiées par le modèle.
    - `model_removed_lines` (Int, si applicable) : Nombre de lignes supprimées/modifiées par le modèle.
    - `user_added_lines` (Int, si applicable) : Nombre de lignes ajoutées/modifiées par l'utilisateur dans les modifications proposées par l'IA.
    - `user_removed_lines` (Int, si applicable) : Nombre de lignes supprimées/modifiées par l'utilisateur dans les modifications proposées par l'IA.
    - `programming_language` (chaîne, si applicable) : Langage de programmation du fichier.

- `qwen-code.chat_compression` (Compteur, Int) : Compte les opérations de compression du chat.
  - **Attributs** :
    - `tokens_before` (Int) : Nombre de tokens dans le contexte avant compression.
    - `tokens_after` (Int) : Nombre de tokens dans le contexte après compression.
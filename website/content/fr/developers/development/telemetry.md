# Observabilité avec OpenTelemetry

Découvrez comment activer et configurer OpenTelemetry pour Qwen Code.

- [Observabilité avec OpenTelemetry](#observability-with-opentelemetry)
  - [Principaux avantages](#key-benefits)
  - [Intégration OpenTelemetry](#opentelemetry-integration)
  - [Configuration](#configuration)
  - [Télémétrie Aliyun](#aliyun-telemetry)
    - [Export OTLP manuel](#manual-otlp-export)
  - [Télémétrie locale](#local-telemetry)
    - [Sortie basée sur un fichier (recommandé)](#file-based-output-recommended)
    - [Export via collecteur (avancé)](#collector-based-export-advanced)
  - [Logs et métriques](#logs-and-metrics)
    - [Logs](#logs)
    - [Métriques](#metrics)

## Principaux avantages

- **🔍 Analytique d'utilisation** : Comprenez les schémas d'interaction et l'adoption des fonctionnalités au sein de votre équipe
- **⚡ Monitoring des performances** : Suivez les temps de réponse, la consommation de tokens et l'utilisation des ressources
- **🐛 Débogage en temps réel** : Identifiez les goulots d'étranglement, les échecs et les schémas d'erreurs au fur et à mesure qu'ils surviennent
- **📊 Optimisation des workflows** : Prenez des décisions éclairées pour améliorer les configurations et les processus
- **🏢 Gouvernance d'entreprise** : Surveillez l'utilisation par équipe, suivez les coûts, garantissez la conformité et intégrez-vous à l'infrastructure de monitoring existante

## Intégration OpenTelemetry

Construit sur **[OpenTelemetry]** — le framework d'observabilité standard de l'industrie et indépendant des fournisseurs — le système d'observabilité de Qwen Code offre :

- **Compatibilité universelle** : Exportez vers n'importe quel backend OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Données standardisées** : Utilisez des formats et des méthodes de collecte cohérents dans toute votre toolchain
- **Intégration pérenne** : Connectez-vous à l'infrastructure d'observabilité existante et future
- **Pas de vendor lock-in** : Changez de backend sans modifier votre instrumentation

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Configuration

> [!note]
>
> **⚠️ Note importante : Cette fonctionnalité nécessite des modifications de code correspondantes. Cette documentation est fournie à titre anticipé ; veuillez vous référer aux futures mises à jour du code pour la fonctionnalité effective.**

Tous les comportements de télémétrie sont contrôlés via votre fichier `.qwen/settings.json`.
Ces paramètres peuvent être surchargés par des variables d'environnement ou des flags CLI.

| Paramètre             | Variable d'environnement               | Flag CLI                                                 | Description                                          | Valeurs           | Valeur par défaut       |
| --------------------- | -------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`             | `QWEN_TELEMETRY_ENABLED`               | `--telemetry` / `--no-telemetry`                         | Activer ou désactiver la télémétrie                  | `true`/`false`    | `false`                 |
| `target`              | `QWEN_TELEMETRY_TARGET`                | `--telemetry-target <local\|gcp>`                        | Destination des données de télémétrie                | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`        | `QWEN_TELEMETRY_OTLP_ENDPOINT`         | `--telemetry-otlp-endpoint <URL>`                        | Endpoint du collecteur OTLP                          | URL string        | `http://localhost:4317` |
| `otlpProtocol`        | `QWEN_TELEMETRY_OTLP_PROTOCOL`         | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocole de transport OTLP                          | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`  | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`  | -                                                        | Surcharge d'endpoint par signal pour les traces (HTTP uniquement)  | URL string        | -                       |
| `otlpLogsEndpoint`    | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`    | -                                                        | Surcharge d'endpoint par signal pour les logs (HTTP uniquement)    | URL string        | -                       |
| `otlpMetricsEndpoint` | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT` | -                                                        | Surcharge d'endpoint par signal pour les métriques (HTTP uniquement) | URL string        | -                       |
| `outfile`             | `QWEN_TELEMETRY_OUTFILE`               | `--telemetry-outfile <path>`                             | Enregistrer la télémétrie dans un fichier (surchage `otlpEndpoint`)    | file path         | -                       |
| `logPrompts`          | `QWEN_TELEMETRY_LOG_PROMPTS`           | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Inclure les prompts dans les logs de télémétrie                    | `true`/`false`    | `true`                  |
| `useCollector`        | `QWEN_TELEMETRY_USE_COLLECTOR`         | -                                                        | Utiliser un collecteur OTLP externe (avancé)               | `true`/`false`    | `false`                 |

**Note sur les variables d'environnement booléennes :** Pour les paramètres booléens (`enabled`,
`logPrompts`, `useCollector`), définir la variable d'environnement correspondante sur
`true` ou `1` active la fonctionnalité. Toute autre valeur la désactive.

**Routage des signaux OTLP HTTP :** Lors de l'utilisation du protocole HTTP (`otlpProtocol: "http"`),
Qwen Code ajoute automatiquement les chemins spécifiques au signal (`/v1/traces`, `/v1/logs`,
`/v1/metrics`) à l'`otlpEndpoint` de base. Par exemple, `http://collector:4318`
devient `http://collector:4318/v1/traces` pour les traces. Si l'URL se termine déjà
par un chemin de signal, elle est utilisée telle quelle. Les surcharges d'endpoint par signal
(`otlpTracesEndpoint`, etc.) priment sur l'endpoint de base et sont utilisées verbatim. Le protocole gRPC utilise un routage basé sur les services et n'ajoute pas de chemins.

Les variables d'environnement d'endpoint par signal acceptent également les noms standard
OpenTelemetry : `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`.
Les variantes `QWEN_TELEMETRY_OTLP_*` priment sur les variantes `OTEL_*`.

Pour plus d'informations sur toutes les options de configuration, consultez le
[Guide de configuration](./cli/configuration.md).

## Télémétrie Aliyun

### Export OTLP manuel

Pour visualiser la télémétrie de Qwen Code dans Alibaba Cloud Managed Service for
OpenTelemetry, configurez Qwen Code pour exporter vers l'endpoint OTLP
fourni par ARMS.

Définir uniquement `"target": "gcp"` ne configure pas la destination d'export.
Si `otlpEndpoint` n'est pas défini, Qwen Code utilise par défaut
`http://localhost:4317`. Si `outfile` est défini, il surcharge
`otlpEndpoint` et la télémétrie est écrite dans le fichier au lieu d'être
envoyée à Alibaba Cloud.

1. Activez la télémétrie dans votre `.qwen/settings.json` et définissez l'endpoint OTLP :

   **Option A : protocole gRPC** (endpoint OTLP standard) :

   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "otlpEndpoint": "https://<your-otlp-endpoint>",
       "otlpProtocol": "grpc"
     }
   }
   ```

   **Option B : protocole HTTP avec endpoints par signal** (pour les backends
   utilisant des chemins non standards, ex. `/api/otlp/traces` au lieu de `/v1/traces`) :

   ```json
   {
     "telemetry": {
       "enabled": true,
       "otlpProtocol": "http",
       "otlpTracesEndpoint": "http://<host>/<token>/api/otlp/traces",
       "otlpLogsEndpoint": "http://<host>/<token>/api/otlp/logs",
       "otlpMetricsEndpoint": "http://<host>/<token>/api/otlp/metrics"
     }
   }
   ```

   > **Note :** Lors de l'utilisation du protocole HTTP avec uniquement `otlpEndpoint` (sans
   > surcharge par signal), Qwen Code ajoute les chemins OTLP standards
   > (`/v1/traces`, `/v1/logs`, `/v1/metrics`) à l'URL de base. Si votre
   > backend utilise des chemins différents, utilisez les surcharges d'endpoint par signal
   > comme indiqué dans l'Option B.

2. Si votre endpoint Alibaba Cloud nécessite une authentification, fournissez les headers OTLP
   via les variables d'environnement OpenTelemetry standards telles que
   `OTEL_EXPORTER_OTLP_HEADERS` (ou les variantes spécifiques au signal). Qwen
   Code n'expose pas actuellement les headers d'authentification OTLP directement dans
   `.qwen/settings.json`.
3. Exécutez Qwen Code et envoyez des prompts.
4. Visualisez la télémétrie dans Managed Service for OpenTelemetry :
   - Présentation du produit :
     [What is Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - Guide de démarrage :
     [Get started with Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Points d'accès à la console :
     - Chine continentale :
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (ancienne console :
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - International :
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - Dans la console, utilisez `Applications` pour inspecter les traces et la topologie des services.
   - Pour localiser l'endpoint OTLP et les informations d'accès :
     - **Nouvelle console** (`trace.console.aliyun.com` ou international) :
       accédez à `Integration Center`.
     - **Ancienne console** (`tracing.console.aliyun.com`) : accédez à
       `Cluster Configurations` → `Access point information`.

## Télémétrie locale

Pour le développement et le débogage locaux, vous pouvez capturer les données de télémétrie localement :

### Sortie basée sur un fichier (recommandé)

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
3. Consultez les logs et métriques dans le fichier spécifié (ex. `.qwen/telemetry.log`).

### Export via collecteur (avancé)

1. Exécutez le script d'automatisation :
   ```bash
   npm run telemetry -- --target=local
   ```
   Cela permet de :
   - Télécharger et démarrer Jaeger et le collecteur OTEL
   - Configurer votre workspace pour la télémétrie locale
   - Fournir une interface Jaeger à http://localhost:16686
   - Enregistrer les logs/métriques dans `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Arrêter le collecteur à la sortie (ex. `Ctrl+C`)
2. Exécutez Qwen Code et envoyez des prompts.
3. Consultez les traces sur http://localhost:16686 et les logs/métriques dans le fichier de log du collecteur.

## Logs et métriques

La section suivante décrit la structure des logs et métriques générés pour
Qwen Code.

- Un `sessionId` est inclus comme attribut commun sur tous les logs et métriques.

### Logs

Les logs sont des enregistrements horodatés d'événements spécifiques. Les événements suivants sont enregistrés pour Qwen Code :

- `qwen-code.config` : Cet événement se produit une fois au démarrage avec la configuration du CLI.
  - **Attributs** :
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string, types d'événements hook séparés par des virgules, omis si les hooks sont désactivés)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string : "text" ou "json")

- `qwen-code.user_prompt` : Cet événement se produit lorsqu'un utilisateur soumet un prompt.
  - **Attributs** :
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, cet attribut est exclu si `log_prompts_enabled` est configuré sur `false`)
    - `auth_type` (string)

- `qwen-code.tool_call` : Cet événement se produit pour chaque appel de fonction.
  - **Attributs** :
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string : "accept", "reject", "auto_accept" ou "modify", si applicable)
    - `error` (si applicable)
    - `error_type` (si applicable)
    - `content_length` (int, si applicable)
    - `metadata` (si applicable, dictionnaire string -> any)

- `qwen-code.file_operation` : Cet événement se produit pour chaque opération sur un fichier.
  - **Attributs** :
    - `tool_name` (string)
    - `operation` (string : "create", "read", "update")
    - `lines` (int, si applicable)
    - `mimetype` (string, si applicable)
    - `extension` (string, si applicable)
    - `programming_language` (string, si applicable)
    - `diff_stat` (string JSON, si applicable) : Une chaîne JSON contenant les membres suivants :
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request` : Cet événement se produit lors d'une requête vers l'API Qwen.
  - **Attributs** :
    - `model`
    - `request_text` (si applicable)

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
    - `response_text` (si applicable)
    - `auth_type`

- `qwen-code.tool_output_truncated` : Cet événement se produit lorsque la sortie d'un appel d'outil est trop volumineuse et est tronquée.
  - **Attributs** :
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response` : Cet événement se produit lorsqu'une réponse `generateJson` de l'API Qwen ne peut pas être analysée comme un JSON.
  - **Attributs** :
    - `model`

- `qwen-code.flash_fallback` : Cet événement se produit lorsque Qwen Code bascule vers flash en tant que fallback.
  - **Attributs** :
    - `auth_type`

- `qwen-code.slash_command` : Cet événement se produit lorsqu'un utilisateur exécute une commande slash.
  - **Attributs** :
    - `command` (string)
    - `subcommand` (string, si applicable)

- `qwen-code.extension_enable` : Cet événement se produit lorsqu'une extension est activée
- `qwen-code.extension_install` : Cet événement se produit lorsqu'une extension est installée
  - **Attributs** :
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall` : Cet événement se produit lorsqu'une extension est désinstallée

### Métriques

Les métriques sont des mesures numériques du comportement dans le temps. Les métriques suivantes sont collectées pour Qwen Code (les noms de métriques restent `qwen-code.*` pour la compatibilité) :

- `qwen-code.session.count` (Counter, Int) : Incrémenté une fois par démarrage du CLI.

- `qwen-code.tool.call.count` (Counter, Int) : Compte les appels d'outils.
  - **Attributs** :
    - `function_name`
    - `success` (boolean)
    - `decision` (string : "accept", "reject" ou "modify", si applicable)
    - `tool_type` (string : "mcp" ou "native", si applicable)

- `qwen-code.tool.call.latency` (Histogram, ms) : Mesure la latence des appels d'outils.
  - **Attributs** :
    - `function_name`
    - `decision` (string : "accept", "reject" ou "modify", si applicable)

- `qwen-code.api.request.count` (Counter, Int) : Compte toutes les requêtes API.
  - **Attributs** :
    - `model`
    - `status_code`
    - `error_type` (si applicable)

- `qwen-code.api.request.latency` (Histogram, ms) : Mesure la latence des requêtes API.
  - **Attributs** :
    - `model`

- `qwen-code.token.usage` (Counter, Int) : Compte le nombre de tokens utilisés.
  - **Attributs** :
    - `model`
    - `type` (string : "input", "output", "thought" ou "cache")

- `qwen-code.file.operation.count` (Counter, Int) : Compte les opérations sur les fichiers.
  - **Attributs** :
    - `operation` (string : "create", "read", "update") : Le type d'opération sur le fichier.
    - `lines` (Int, si applicable) : Nombre de lignes dans le fichier.
    - `mimetype` (string, si applicable) : Mimetype du fichier.
    - `extension` (string, si applicable) : Extension du fichier.
    - `model_added_lines` (Int, si applicable) : Nombre de lignes ajoutées/modifiées par le modèle.
    - `model_removed_lines` (Int, si applicable) : Nombre de lignes supprimées/modifiées par le modèle.
    - `user_added_lines` (Int, si applicable) : Nombre de lignes ajoutées/modifiées par l'utilisateur dans les changements proposés par l'IA.
    - `user_removed_lines` (Int, si applicable) : Nombre de lignes supprimées/modifiées par l'utilisateur dans les changements proposés par l'IA.
    - `programming_language` (string, si applicable) : Le langage de programmation du fichier.

- `qwen-code.chat_compression` (Counter, Int) : Compte les opérations de compression de chat
  - **Attributs** :
    - `tokens_before` : (Int) : Nombre de tokens dans le contexte avant compression
    - `tokens_after` : (Int) : Nombre de tokens dans le contexte après compression
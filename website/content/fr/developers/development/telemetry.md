# Observabilité avec OpenTelemetry

Découvrez comment activer et configurer OpenTelemetry pour Qwen Code.

- [Observabilité avec OpenTelemetry](#observability-with-opentelemetry)
  - [Principaux avantages](#key-benefits)
  - [Intégration OpenTelemetry](#opentelemetry-integration)
  - [Configuration](#configuration)
  - [Télémétrie Aliyun](#aliyun-telemetry)
    - [Prérequis](#prerequisites)
    - [Export direct (recommandé)](#direct-export-recommended)
  - [Télémétrie locale](#local-telemetry)
    - [Sortie basée sur un fichier (recommandé)](#file-based-output-recommended)
    - [Export via collecteur (avancé)](#collector-based-export-advanced)
  - [Logs et métriques](#logs-and-metrics)
    - [Logs](#logs)
    - [Métriques](#metrics)

## Principaux avantages

- **🔍 Analyse d'utilisation** : Comprenez les schémas d'interaction et l'adoption des fonctionnalités au sein de votre équipe
- **⚡ Surveillance des performances** : Suivez les temps de réponse, la consommation de tokens et l'utilisation des ressources
- **🐛 Débogage en temps réel** : Identifiez les goulots d'étranglement, les échecs et les schémas d'erreurs au fur et à mesure qu'ils surviennent
- **📊 Optimisation des workflows** : Prenez des décisions éclairées pour améliorer les configurations et les processus
- **🏢 Gouvernance d'entreprise** : Surveillez l'utilisation par équipe, suivez les coûts, garantissez la conformité et intégrez-vous à l'infrastructure de surveillance existante

## Intégration OpenTelemetry

Construit sur **[OpenTelemetry]** — le framework d'observabilité standard de l'industrie et indépendant des fournisseurs — le système d'observabilité de Qwen Code offre :

- **Compatibilité universelle** : Exportez vers n'importe quel backend OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Données standardisées** : Utilisez des formats et des méthodes de collecte cohérents dans toute votre chaîne d'outils
- **Intégration pérenne** : Connectez-vous aux infrastructures d'observabilité existantes et futures
- **Absence de verrouillage fournisseur** : Changez de backend sans modifier votre instrumentation

[OpenTelemetry]: https://opentelemetry.io/

## Configuration

> [!note]
>
> **⚠️ Remarque importante : Cette fonctionnalité nécessite des modifications de code correspondantes. Cette documentation est fournie à titre anticipé ; veuillez vous référer aux futures mises à jour du code pour la fonctionnalité effective.**

Tous les comportements de télémétrie sont contrôlés via votre fichier `.qwen/settings.json`.
Ces paramètres peuvent être remplacés par des variables d'environnement ou des flags CLI.

| Setting        | Environment Variable           | CLI Flag                                                 | Description                                       | Values             | Default                 |
| -------------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------- | ------------------ | ----------------------- |
| `enabled`      | `QWEN_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                         | Activer ou désactiver la télémétrie               | `true`/`false`     | `false`                 |
| `target`       | `QWEN_TELEMETRY_TARGET`        | `--telemetry-target <local\|qwen>`                       | Destination des données de télémétrie             | `"qwen"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `QWEN_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                        | Endpoint du collecteur OTLP                       | Chaîne URL         | `http://localhost:4317` |
| `otlpProtocol` | `QWEN_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocole de transport OTLP                       | `"grpc"`/`"http"`  | `"grpc"`                |
| `outfile`      | `QWEN_TELEMETRY_OUTFILE`       | `--telemetry-outfile <path>`                             | Enregistrer la télémétrie dans un fichier (remplace `otlpEndpoint`) | Chemin de fichier  | -                       |
| `logPrompts`   | `QWEN_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Inclure les prompts dans les logs de télémétrie   | `true`/`false`     | `true`                  |
| `useCollector` | `QWEN_TELEMETRY_USE_COLLECTOR` | -                                                        | Utiliser un collecteur OTLP externe (avancé)      | `true`/`false`     | `false`                 |

**Remarque sur les variables d'environnement booléennes :** Pour les paramètres booléens (`enabled`,
`logPrompts`, `useCollector`), définir la variable d'environnement correspondante sur
`true` ou `1` activera la fonctionnalité. Toute autre valeur la désactivera.

Pour plus d'informations sur toutes les options de configuration, consultez le
[Guide de configuration](./cli/configuration.md).

## Télémétrie Aliyun

### Export direct (recommandé)

Envoie la télémétrie directement aux services Aliyun. Aucun collecteur n'est nécessaire.

1. Activez la télémétrie dans votre `.qwen/settings.json` :
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Exécutez Qwen Code et envoyez des prompts.
3. Consultez les logs et les métriques dans la console Aliyun.

## Télémétrie locale

Pour le développement local et le débogage, vous pouvez capturer les données de télémétrie localement :

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
3. Consultez les logs et les métriques dans le fichier spécifié (p. ex. `.qwen/telemetry.log`).

### Export via collecteur (avancé)

1. Exécutez le script d'automatisation :
   ```bash
   npm run telemetry -- --target=local
   ```
   Cela permettra de :
   - Télécharger et démarrer Jaeger et le collecteur OTEL
   - Configurer votre workspace pour la télémétrie locale
   - Fournir une interface Jaeger à http://localhost:16686
   - Enregistrer les logs/métriques dans `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Arrêter le collecteur à la sortie (p. ex. `Ctrl+C`)
2. Exécutez Qwen Code et envoyez des prompts.
3. Consultez les traces à http://localhost:16686 et les logs/métriques dans le fichier de log du collecteur.

## Logs et métriques

La section suivante décrit la structure des logs et des métriques générés pour
Qwen Code.

- Un `sessionId` est inclus en tant qu'attribut commun sur tous les logs et métriques.

### Logs

Les logs sont des enregistrements horodatés d'événements spécifiques. Les événements suivants sont journalisés pour Qwen Code :

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
    - `hooks` (string, types d'événements de hook séparés par des virgules, omis si les hooks sont désactivés)
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
    - `decision` (string : "accept", "reject", "auto_accept" ou "modify", le cas échéant)
    - `error` (le cas échéant)
    - `error_type` (le cas échéant)
    - `content_length` (int, le cas échéant)
    - `metadata` (le cas échéant, dictionnaire de string -> any)

- `qwen-code.file_operation` : Cet événement se produit pour chaque opération sur un fichier.
  - **Attributs** :
    - `tool_name` (string)
    - `operation` (string : "create", "read", "update")
    - `lines` (int, le cas échéant)
    - `mimetype` (string, le cas échéant)
    - `extension` (string, le cas échéant)
    - `programming_language` (string, le cas échéant)
    - `diff_stat` (chaîne JSON, le cas échéant) : Une chaîne JSON contenant les membres suivants :
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

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
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response` : Cet événement se produit lorsqu'une réponse `generateJson` de l'API Qwen ne peut pas être analysée en tant que JSON.
  - **Attributs** :
    - `model`

- `qwen-code.flash_fallback` : Cet événement se produit lorsque Qwen Code bascule vers flash en mode de secours.
  - **Attributs** :
    - `auth_type`

- `qwen-code.slash_command` : Cet événement se produit lorsqu'un utilisateur exécute une commande slash.
  - **Attributs** :
    - `command` (string)
    - `subcommand` (string, le cas échéant)

- `qwen-code.extension_enable` : Cet événement se produit lorsqu'une extension est activée
- `qwen-code.extension_install` : Cet événement se produit lorsqu'une extension est installée
  - **Attributs** :
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall` : Cet événement se produit lorsqu'une extension est désinstallée

### Métriques

Les métriques sont des mesures numériques du comportement dans le temps. Les métriques suivantes sont collectées pour Qwen Code (les noms des métriques restent `qwen-code.*` pour des raisons de compatibilité) :

- `qwen-code.session.count` (Counter, Int) : Incrémenté une fois par démarrage du CLI.

- `qwen-code.tool.call.count` (Counter, Int) : Compte les appels d'outils.
  - **Attributs** :
    - `function_name`
    - `success` (boolean)
    - `decision` (string : "accept", "reject" ou "modify", le cas échéant)
    - `tool_type` (string : "mcp" ou "native", le cas échéant)

- `qwen-code.tool.call.latency` (Histogram, ms) : Mesure la latence des appels d'outils.
  - **Attributs** :
    - `function_name`
    - `decision` (string : "accept", "reject" ou "modify", le cas échéant)

- `qwen-code.api.request.count` (Counter, Int) : Compte toutes les requêtes API.
  - **Attributs** :
    - `model`
    - `status_code`
    - `error_type` (le cas échéant)

- `qwen-code.api.request.latency` (Histogram, ms) : Mesure la latence des requêtes API.
  - **Attributs** :
    - `model`

- `qwen-code.token.usage` (Counter, Int) : Compte le nombre de tokens utilisés.
  - **Attributs** :
    - `model`
    - `type` (string : "input", "output", "thought", "cache" ou "tool")

- `qwen-code.file.operation.count` (Counter, Int) : Compte les opérations sur les fichiers.
  - **Attributs** :
    - `operation` (string : "create", "read", "update") : Le type d'opération sur le fichier.
    - `lines` (Int, le cas échéant) : Nombre de lignes dans le fichier.
    - `mimetype` (string, le cas échéant) : Type MIME du fichier.
    - `extension` (string, le cas échéant) : Extension du fichier.
    - `model_added_lines` (Int, le cas échéant) : Nombre de lignes ajoutées/modifiées par le modèle.
    - `model_removed_lines` (Int, le cas échéant) : Nombre de lignes supprimées/modifiées par le modèle.
    - `user_added_lines` (Int, le cas échéant) : Nombre de lignes ajoutées/modifiées par l'utilisateur dans les changements proposés par l'IA.
    - `user_removed_lines` (Int, le cas échéant) : Nombre de lignes supprimées/modifiées par l'utilisateur dans les changements proposés par l'IA.
    - `programming_language` (string, le cas échéant) : Le langage de programmation du fichier.

- `qwen-code.chat_compression` (Counter, Int) : Compte les opérations de compression de chat
  - **Attributs** :
    - `tokens_before` : (Int) : Nombre de tokens dans le contexte avant la compression
    - `tokens_after` : (Int) : Nombre de tokens dans le contexte après la compression
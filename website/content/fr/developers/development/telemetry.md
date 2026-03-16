# Observabilité avec OpenTelemetry

Découvrez comment activer et configurer OpenTelemetry pour Qwen Code.

- [Observabilité avec OpenTelemetry](#observabilité-avec-opentelemetry)
  - [Principaux avantages](#principaux-avantages)
  - [Intégration d’OpenTelemetry](#intégration-dopentelemetry)
  - [Configuration](#configuration)
  - [Télémesure Aliyun](#télémesure-aliyun)
    - [Conditions préalables](#conditions-préalables)
    - [Export direct (recommandé)](#export-direct-recommandé)
  - [Télémesure locale](#télémesure-locale)
    - [Sortie basée sur les fichiers (recommandée)](#sortie-basée-sur-les-fichiers-recommandée)
    - [Export basé sur un collecteur (avancé)](#export-basé-sur-un-collecteur-avancé)
  - [Journaux et métriques](#journaux-et-métriques)
    - [Journaux](#journaux)
    - [Métriques](#métriques)

## Principaux avantages

- **🔍 Analyse d’utilisation** : Comprenez les schémas d’interaction et l’adoption des fonctionnalités au sein de votre équipe  
- **⚡ Surveillance des performances** : Suivez les temps de réponse, la consommation de jetons et l’utilisation des ressources  
- **🐛 Débogage en temps réel** : Identifiez les goulots d’étranglement, les échecs et les motifs d’erreur dès qu’ils surviennent  
- **📊 Optimisation des flux de travail** : Prenez des décisions éclairées pour améliorer les configurations et les processus  
- **🏢 Gouvernance entreprise** : Surveillez l’utilisation par équipe, suivez les coûts, assurez la conformité et intégrez-vous à votre infrastructure existante de supervision

## Intégration OpenTelemetry

Construit sur **[OpenTelemetry]** — le cadre d’observabilité standard de l’industrie, indépendant des fournisseurs — le système d’observabilité de Qwen Code offre :

- **Compatibilité universelle** : Exportez vers n’importe quel backend OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Données standardisées** : Utilisez des formats et des méthodes de collecte cohérents dans l’ensemble de votre chaîne d’outils
- **Intégration pérenne** : Connectez-vous à vos infrastructures d’observabilité existantes et futures
- **Absence de verrouillage fournisseur** : Passez d’un backend à un autre sans modifier votre instrumentation

[OpenTelemetry]: https://opentelemetry.io/

## Configuration

> [!note]
>
> **⚠️ Remarque spéciale : Cette fonctionnalité nécessite des modifications de code correspondantes. Cette documentation est fournie à titre préventif ; veuillez consulter les mises à jour de code ultérieures pour connaître la fonctionnalité réelle.**

Tout le comportement lié à la télémétrie est contrôlé via votre fichier `.qwen/settings.json`.  
Ces paramètres peuvent être remplacés par des variables d’environnement ou des indicateurs CLI.

| Paramètre        | Variable d’environnement           | Indicateur CLI                                                 | Description                                       | Valeurs              | Par défaut                 |
| ---------------- | ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- | -------------------- | -------------------------- |
| `enabled`        | `QWEN_TELEMETRY_ENABLED`           | `--telemetry` / `--no-telemetry`                                | Active ou désactive la télémétrie                 | `true`/`false`       | `false`                    |
| `target`         | `QWEN_TELEMETRY_TARGET`            | `--telemetry-target <local\|qwen>`                             | Destination des données de télémétrie           | `"qwen"`/`"local"`   | `"local"`                  |
| `otlpEndpoint`   | `QWEN_TELEMETRY_OTLP_ENDPOINT`     | `--telemetry-otlp-endpoint <URL>`                              | Point de terminaison du collecteur OTLP         | Chaîne d’URL         | `http://localhost:4317`    |
| `otlpProtocol`   | `QWEN_TELEMETRY_OTLP_PROTOCOL`     | `--telemetry-otlp-protocol <grpc\|http>`                       | Protocole de transport OTLP                       | `"grpc"`/`"http"`    | `"grpc"`                   |
| `outfile`        | `QWEN_TELEMETRY_OUTFILE`           | `--telemetry-outfile <chemin>`                                 | Enregistre la télémétrie dans un fichier (remplace `otlpEndpoint`) | Chemin de fichier    | -                          |
| `logPrompts`     | `QWEN_TELEMETRY_LOG_PROMPTS`       | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`       | Inclut les invites dans les journaux de télémétrie | `true`/`false`       | `true`                     |
| `useCollector`   | `QWEN_TELEMETRY_USE_COLLECTOR`     | -                                                              | Utilise un collecteur OTLP externe (avancé)       | `true`/`false`       | `false`                    |

**Remarque concernant les variables d’environnement booléennes :** Pour les paramètres booléens (`enabled`, `logPrompts`, `useCollector`), définir la variable d’environnement correspondante sur `true` ou `1` active la fonctionnalité. Toute autre valeur la désactive.

Pour obtenir des informations détaillées sur toutes les options de configuration, consultez le [Guide de configuration](./cli/configuration.md).

## Télémétrie Aliyun

### Export direct (recommandé)

Envoie la télémétrie directement aux services Aliyun. Aucun collecteur n’est requis.

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
3. Consultez les journaux et les métriques dans la console Aliyun.

## Télémétrie locale

Pour le développement local et le débogage, vous pouvez capturer localement les données de télémétrie :

### Sortie basée sur un fichier (recommandée)

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
3. Consultez les journaux et les métriques dans le fichier spécifié (par exemple, `.qwen/telemetry.log`).

### Export basé sur un collecteur (avancé)

1. Exécutez le script d’automatisation :
   ```bash
   npm run telemetry -- --target=local
   ```
   Cette commande effectue les opérations suivantes :
   - Télécharge et démarre Jaeger ainsi que le collecteur OTEL.
   - Configure votre espace de travail pour la télémétrie locale.
   - Fournit une interface utilisateur Jaeger à l’adresse http://localhost:16686.
   - Enregistre les journaux (logs) et les métriques dans le fichier `~/.qwen/tmp/<projectHash>/otel/collector.log`.
   - Arrête le collecteur à la sortie (par exemple, avec `Ctrl+C`).
2. Lancez Qwen Code et envoyez des invites (prompts).
3. Consultez les traces à l’adresse http://localhost:16686 et les journaux/métriques dans le fichier journal du collecteur.

## Journaux (logs) et métriques

La section suivante décrit la structure des journaux et des métriques générés pour Qwen Code.

- Un `sessionId` est inclus comme attribut commun à tous les journaux et toutes les métriques.

### Journaux

Les journaux sont des enregistrements horodatés d’événements spécifiques. Les événements suivants sont journalisés pour Qwen Code :

- `qwen-code.config` : Cet événement se produit une seule fois au démarrage, avec la configuration de l’interface CLI.
  - **Attributs** :
    - `model` (chaîne de caractères)
    - `sandbox_enabled` (booléen)
    - `core_tools_enabled` (chaîne de caractères)
    - `approval_mode` (chaîne de caractères)
    - `file_filtering_respect_git_ignore` (booléen)
    - `debug_mode` (booléen)
    - `truncate_tool_output_threshold` (nombre)
    - `truncate_tool_output_lines` (nombre)
    - `hooks` (chaîne de caractères, types d’événements de hooks séparés par des virgules ; omis si les hooks sont désactivés)
    - `ide_enabled` (booléen)
    - `interactive_shell_enabled` (booléen)
    - `mcp_servers` (chaîne de caractères)
    - `output_format` (chaîne de caractères : « text » ou « json »)

- `qwen-code.user_prompt` : Cet événement se produit lorsqu’un utilisateur soumet une invite.
  - **Attributs** :
    - `prompt_length` (entier)
    - `prompt_id` (chaîne de caractères)
    - `prompt` (chaîne de caractères ; cet attribut est exclu si `log_prompts_enabled` est configuré à `false`)
    - `auth_type` (chaîne de caractères)

- `qwen-code.tool_call` : Cet événement se produit pour chaque appel de fonction.
  - **Attributs** :
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (booléen)
    - `decision` (chaîne de caractères : « accept », « reject », « auto_accept » ou « modify », si applicable)
    - `error` (si applicable)
    - `error_type` (si applicable)
    - `content_length` (entier, si applicable)
    - `metadata` (si applicable, dictionnaire de chaînes de caractères → n’importe quel type)

- `qwen-code.file_operation` : Cet événement se produit pour chaque opération sur un fichier.
  - **Attributs** :
    - `tool_name` (chaîne de caractères)
    - `operation` (chaîne de caractères : « create », « read » ou « update »)
    - `lines` (entier, si applicable)
    - `mimetype` (chaîne de caractères, si applicable)
    - `extension` (chaîne de caractères, si applicable)
    - `programming_language` (chaîne de caractères, si applicable)
    - `diff_stat` (chaîne JSON, si applicable) : Une chaîne JSON contenant les champs suivants :
      - `ai_added_lines` (entier)
      - `ai_removed_lines` (entier)
      - `user_added_lines` (entier)
      - `user_removed_lines` (entier)

- `qwen-code.api_request` : Cet événement se produit lors de l’envoi d’une requête à l’API Qwen.
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

- `qwen-code.api_response` : Cet événement se produit lors de la réception d’une réponse de l’API Qwen.
  - **Attributs** :
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (facultatif)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (si applicable)
    - `auth_type`

- `qwen-code.tool_output_truncated` : Cet événement se produit lorsque la sortie d’un appel d’outil est trop volumineuse et est tronquée.
  - **Attributs** :
    - `tool_name` (chaîne de caractères)
    - `original_content_length` (entier)
    - `truncated_content_length` (entier)
    - `threshold` (entier)
    - `lines` (entier)
    - `prompt_id` (chaîne de caractères)

- `qwen-code.malformed_json_response` : Cet événement se produit lorsqu’une réponse `generateJson` de l’API Qwen ne peut pas être analysée comme un JSON valide.
  - **Attributs** :
    - `model`

- `qwen-code.flash_fallback` : Cet événement se produit lorsque Qwen Code bascule vers Flash en tant que solution de secours.
  - **Attributs** :
    - `auth_type`

- `qwen-code.slash_command` : Cet événement se produit lorsqu’un utilisateur exécute une commande slash.
  - **Attributs** :
    - `command` (chaîne de caractères)
    - `subcommand` (chaîne de caractères, si applicable)

- `qwen-code.extension_enable` : Cet événement se produit lorsqu’une extension est activée.
- `qwen-code.extension_install` : Cet événement se produit lorsqu’une extension est installée.
  - **Attributs** :
    - `extension_name` (chaîne de caractères)
    - `extension_version` (chaîne de caractères)
    - `extension_source` (chaîne de caractères)
    - `status` (chaîne de caractères)
- `qwen-code.extension_uninstall` : Cet événement se produit lorsqu’une extension est désinstallée.

### Métriques

Les métriques sont des mesures numériques du comportement dans le temps. Les métriques suivantes sont collectées pour Qwen Code (les noms des métriques restent `qwen-code.*` pour assurer la compatibilité) :

- `qwen-code.session.count` (Compteur, entier) : Incrémenté une fois à chaque démarrage de l’interface en ligne de commande (CLI).

- `qwen-code.tool.call.count` (Compteur, entier) : Compte les appels d’outils.  
  - **Attributs** :  
    - `function_name`  
    - `success` (booléen)  
    - `decision` (chaîne de caractères : « accept », « reject » ou « modify », si applicable)  
    - `tool_type` (chaîne de caractères : « mcp » ou « native », si applicable)

- `qwen-code.tool.call.latency` (Histogramme, ms) : Mesure la latence des appels d’outils.  
  - **Attributs** :  
    - `function_name`  
    - `decision` (chaîne de caractères : « accept », « reject » ou « modify », si applicable)

- `qwen-code.api.request.count` (Compteur, entier) : Compte toutes les requêtes API.  
  - **Attributs** :  
    - `model`  
    - `status_code`  
    - `error_type` (si applicable)

- `qwen-code.api.request.latency` (Histogramme, ms) : Mesure la latence des requêtes API.  
  - **Attributs** :  
    - `model`

- `qwen-code.token.usage` (Compteur, entier) : Compte le nombre de jetons utilisés.  
  - **Attributs** :  
    - `model`  
    - `type` (chaîne de caractères : « input », « output », « thought », « cache » ou « tool »)

- `qwen-code.file.operation.count` (Compteur, entier) : Compte les opérations sur les fichiers.  
  - **Attributs** :  
    - `operation` (chaîne de caractères : « create », « read » ou « update ») : Type de l’opération sur le fichier.  
    - `lines` (entier, si applicable) : Nombre de lignes du fichier.  
    - `mimetype` (chaîne de caractères, si applicable) : Type MIME du fichier.  
    - `extension` (chaîne de caractères, si applicable) : Extension du fichier.  
    - `model_added_lines` (entier, si applicable) : Nombre de lignes ajoutées/modifiées par le modèle.  
    - `model_removed_lines` (entier, si applicable) : Nombre de lignes supprimées/modifiées par le modèle.  
    - `user_added_lines` (entier, si applicable) : Nombre de lignes ajoutées/modifiées par l’utilisateur dans les modifications proposées par l’IA.  
    - `user_removed_lines` (entier, si applicable) : Nombre de lignes supprimées/modifiées par l’utilisateur dans les modifications proposées par l’IA.  
    - `programming_language` (chaîne de caractères, si applicable) : Langage de programmation du fichier.

- `qwen-code.chat_compression` (Compteur, entier) : Compte les opérations de compression de discussion.  
  - **Attributs** :  
    - `tokens_before` (entier) : Nombre de jetons dans le contexte avant compression.  
    - `tokens_after` (entier) : Nombre de jetons dans le contexte après compression.
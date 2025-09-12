# Guide d'observabilité de Qwen Code

La télémétrie fournit des données sur les performances, la santé et l'utilisation de Qwen Code. En l'activant, vous pouvez surveiller les opérations, déboguer les problèmes et optimiser l'utilisation des outils grâce aux traces, métriques et logs structurés.

Le système de télémétrie de Qwen Code est basé sur la norme **[OpenTelemetry] (OTEL)**, ce qui vous permet d'envoyer des données à n'importe quel backend compatible.

[OpenTelemetry]: https://opentelemetry.io/

## Activer la télémétrie

Vous pouvez activer la télémétrie de plusieurs façons. La configuration est principalement gérée via le fichier [`.qwen/settings.json`](./cli/configuration.md) et les variables d'environnement, mais les flags CLI peuvent outrepasser ces paramètres pour une session spécifique.

### Ordre de priorité

Voici la liste des priorités d'application des paramètres de télémétrie, les éléments listés en premier ayant une priorité plus élevée :

1.  **Flags CLI (pour la commande `qwen`) :**
    - `--telemetry` / `--no-telemetry` : Remplace `telemetry.enabled`.
    - `--telemetry-target <local|gcp>` : Remplace `telemetry.target`.
    - `--telemetry-otlp-endpoint <URL>` : Remplace `telemetry.otlpEndpoint`.
    - `--telemetry-log-prompts` / `--no-telemetry-log-prompts` : Remplace `telemetry.logPrompts`.
    - `--telemetry-outfile <path>` : Redirige la sortie de télémétrie vers un fichier. Voir [Exporter vers un fichier](#exporting-to-a-file).

1.  **Variables d'environnement :**
    - `OTEL_EXPORTER_OTLP_ENDPOINT` : Remplace `telemetry.otlpEndpoint`.

1.  **Fichier de paramètres du workspace (`.qwen/settings.json`) :** Valeurs provenant de l'objet `telemetry` dans ce fichier spécifique au projet.

1.  **Fichier de paramètres utilisateur (`~/.qwen/settings.json`) :** Valeurs provenant de l'objet `telemetry` dans ce fichier global de l'utilisateur.

1.  **Valeurs par défaut :** appliquées si elles ne sont définies par aucun des moyens ci-dessus.
    - `telemetry.enabled` : `false`
    - `telemetry.target` : `local`
    - `telemetry.otlpEndpoint` : `http://localhost:4317`
    - `telemetry.logPrompts` : `true`

**Pour le script `npm run telemetry -- --target=<gcp|local>` :**
L'argument `--target` de ce script ne remplace _que_ `telemetry.target` le temps de l'exécution et dans le but de ce script (c'est-à-dire choisir quel collector démarrer). Il ne modifie pas de manière permanente votre `settings.json`. Le script regardera d'abord dans `settings.json` s'il y a un `telemetry.target` à utiliser comme valeur par défaut.

### Exemple de configuration

Le code suivant peut être ajouté à vos paramètres de workspace (`.qwen/settings.json`) ou utilisateur (`~/.qwen/settings.json`) pour activer la télémétrie et envoyer les données vers Google Cloud :

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp"
  },
  "sandbox": false
}
```

### Export vers un fichier

Vous pouvez exporter toutes les données de télémétrie vers un fichier pour inspection locale.

Pour activer l'export vers un fichier, utilisez le flag `--telemetry-outfile` avec un chemin vers le fichier de sortie souhaité. Cela doit être exécuté en utilisant `--telemetry-target=local`.

```bash

# Définissez le chemin du fichier de sortie souhaité
TELEMETRY_FILE=".qwen/telemetry.log"

# Exécutez Qwen Code avec la télémétrie locale

# NOTE : --telemetry-otlp-endpoint="" est requis pour remplacer l'exporter

# OTLP par défaut et s'assurer que la télémétrie est écrite dans le fichier local.
qwen --telemetry \
  --telemetry-target=local \
  --telemetry-otlp-endpoint="" \
  --telemetry-outfile="$TELEMETRY_FILE" \
  --prompt "What is OpenTelemetry?"
```

## Exécuter un OTEL Collector

Un OTEL Collector est un service qui reçoit, traite et exporte les données de télémétrie.
Le CLI peut envoyer des données en utilisant soit le protocole OTLP/gRPC, soit le protocole OTLP/HTTP.
Vous pouvez spécifier le protocole à utiliser via le flag `--telemetry-otlp-protocol`
ou le paramètre `telemetry.otlpProtocol` dans votre fichier `settings.json`. Consultez la
[documentation de configuration](./cli/configuration.md#--telemetry-otlp-protocol) pour plus
de détails.

Pour en savoir plus sur la configuration standard de l'exporter OTEL, consultez la [documentation][otel-config-docs].

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### Local

Utilisez la commande `npm run telemetry -- --target=local` pour automatiser la configuration d’un pipeline de télémétrie local, y compris la configuration des paramètres nécessaires dans votre fichier `.qwen/settings.json`. Le script sous-jacent installe `otelcol-contrib` (le OpenTelemetry Collector) et `jaeger` (l’interface Jaeger pour visualiser les traces). Pour l’utiliser :

1. **Exécutez la commande** :  
   Lancez la commande depuis la racine du repository :

   ```bash
   npm run telemetry -- --target=local
   ```

   Le script va :
   - Télécharger Jaeger et OTEL si nécessaire.
   - Démarrer une instance Jaeger locale.
   - Démarrer un collecteur OTEL configuré pour recevoir les données de Qwen Code.
   - Activer automatiquement la télémétrie dans les paramètres de votre espace de travail.
   - À l’arrêt, désactiver la télémétrie.

2. **Visualisez les traces** :  
   Ouvrez votre navigateur web et rendez-vous sur **http://localhost:16686** pour accéder à l’interface Jaeger. Vous pourrez ici inspecter les traces détaillées des opérations de Qwen Code.

3. **Inspectez les logs et métriques** :  
   Le script redirige la sortie du collecteur OTEL (incluant les logs et métriques) vers `~/.qwen/tmp/<projectHash>/otel/collector.log`. Le script fournira des liens pour visualiser et une commande pour suivre en temps réel vos données de télémétrie (traces, métriques, logs) localement.

4. **Arrêtez les services** :  
   Appuyez sur `Ctrl+C` dans le terminal où le script est en cours d’exécution pour arrêter le collecteur OTEL et les services Jaeger.

### Google Cloud

Utilisez la commande `npm run telemetry -- --target=gcp` pour automatiser la configuration d’un collecteur OpenTelemetry local qui transmet les données à votre projet Google Cloud, y compris la configuration des paramètres nécessaires dans votre fichier `.qwen/settings.json`. Le script sous-jacent installe `otelcol-contrib`. Pour l’utiliser :

1.  **Prérequis** :
    - Disposer d’un ID de projet Google Cloud.
    - Exporter la variable d’environnement `GOOGLE_CLOUD_PROJECT` pour la rendre disponible au collecteur OTEL.
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - Vous authentifier auprès de Google Cloud (par exemple, exécutez `gcloud auth application-default login` ou assurez-vous que `GOOGLE_APPLICATION_CREDENTIALS` est défini).
    - Vérifier que votre compte Google Cloud ou votre compte de service dispose des rôles IAM nécessaires : "Cloud Trace Agent", "Monitoring Metric Writer" et "Logs Writer".

1.  **Exécutez la commande** :
    Exécutez la commande depuis la racine du dépôt :

    ```bash
    npm run telemetry -- --target=gcp
    ```

    Le script va :
    - Télécharger le binaire `otelcol-contrib` si nécessaire.
    - Démarrer un collecteur OTEL configuré pour recevoir les données de Qwen Code et les exporter vers le projet Google Cloud spécifié.
    - Activer automatiquement la télémétrie et désactiver le mode sandbox dans les paramètres de votre espace de travail (`.qwen/settings.json`).
    - Fournir des liens directs pour visualiser les traces, métriques et logs dans la Google Cloud Console.
    - À l’arrêt (Ctrl+C), il tentera de restaurer vos paramètres initiaux de télémétrie et de sandbox.

1.  **Exécutez Qwen Code** :
    Dans un autre terminal, lancez vos commandes Qwen Code. Cela génère des données de télémétrie que le collecteur capture.

1.  **Visualisez la télémétrie dans Google Cloud** :
    Utilisez les liens fournis par le script pour accéder à la Google Cloud Console et consulter vos traces, métriques et logs.

1.  **Consultez les logs du collecteur local** :
    Le script redirige la sortie du collecteur OTEL local vers `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log`. Le script fournit des liens pour visualiser et une commande pour suivre en direct les logs du collecteur localement.

1.  **Arrêtez le service** :
    Appuyez sur `Ctrl+C` dans le terminal où le script est en cours d’exécution pour arrêter le collecteur OTEL.

## Référence des logs et métriques

La section suivante décrit la structure des logs et métriques générés pour Qwen Code.

- Un `sessionId` est inclus en tant qu'attribut commun sur tous les logs et métriques.

### Logs

Les logs sont des enregistrements horodatés d'événements spécifiques. Les événements suivants sont loggés pour Qwen Code :

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

- `qwen-code.user_prompt` : Cet événement se produit lorsqu'un utilisateur soumet un prompt.
  - **Attributs** :
    - `prompt_length`
    - `prompt` (cet attribut est exclu si `log_prompts_enabled` est configuré à `false`)
    - `auth_type`

- `qwen-code.tool_call` : Cet événement se produit pour chaque appel de fonction.
  - **Attributs** :
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string : "accept", "reject", "auto_accept", ou "modify", si applicable)
    - `error` (si applicable)
    - `error_type` (si applicable)
    - `metadata` (si applicable, dictionnaire de string -> any)

- `qwen-code.api_request` : Cet événement se produit lorsqu'une requête est envoyée à l'API Qwen.
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

- `qwen-code.api_response` : Cet événement se produit lorsqu'une réponse est reçue de l'API Qwen.
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

- `qwen-code.flash_fallback` : Cet événement se produit lorsque Qwen Code bascule sur flash comme solution de repli.
  - **Attributs** :
    - `auth_type`

- `qwen-code.slash_command` : Cet événement se produit lorsqu'un utilisateur exécute une commande slash.
  - **Attributs** :
    - `command` (string)
    - `subcommand` (string, si applicable)

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
    - `ai_added_lines` (Int, si applicable) : Nombre de lignes ajoutées/modifiées par l'IA.
    - `ai_removed_lines` (Int, si applicable) : Nombre de lignes supprimées/modifiées par l'IA.
    - `user_added_lines` (Int, si applicable) : Nombre de lignes ajoutées/modifiées par l'utilisateur dans les modifications proposées par l'IA.
    - `user_removed_lines` (Int, si applicable) : Nombre de lignes supprimées/modifiées par l'utilisateur dans les modifications proposées par l'IA.

- `qwen-code.chat_compression` (Compteur, Int) : Compte les opérations de compression du chat.
  - **Attributs** :
    - `tokens_before` (Int) : Nombre de tokens dans le contexte avant compression.
    - `tokens_after` (Int) : Nombre de tokens dans le contexte après compression.
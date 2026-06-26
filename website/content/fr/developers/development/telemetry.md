# Observabilité avec OpenTelemetry

Apprenez à activer et configurer OpenTelemetry pour Qwen Code.

- [Observabilité avec OpenTelemetry](#observabilité-avec-opentelemetry)
  - [Avantages clés](#avantages-clés)
  - [Intégration OpenTelemetry](#intégration-opentelemetry)
  - [Configuration](#configuration)
  - [Télémétrie Aliyun](#télémétrie-aliyun)
    - [Export OTLP manuel](#export-otlp-manuel)
  - [Télémétrie locale](#télémétrie-locale)
    - [Sortie fichier (recommandée)](#sortie-fichier-recommandée)
    - [Export via collecteur (avancé)](#export-via-collecteur-avancé)
  - [Journaux et métriques](#journaux-et-métriques)
    - [Journaux](#journaux)
    - [Métriques](#métriques)

## Avantages clés

- **🔍 Analytics d’utilisation** : Comprenez les schémas d’interaction et l’adoption des fonctionnalités au sein de votre équipe
- **⚡ Surveillance des performances** : Suivez les temps de réponse, la consommation de tokens et l’utilisation des ressources
- **🐛 Débogage en temps réel** : Identifiez les goulots d’étranglement, les échecs et les schémas d’erreur dès qu’ils se produisent
- **📊 Optimisation des workflows** : Prenez des décisions éclairées pour améliorer les configurations et les processus
- **🏢 Gouvernance d’entreprise** : Surveillez l’utilisation par équipe, suivez les coûts, assurez la conformité et intégrez-vous à l’infrastructure de surveillance existante

## Intégration OpenTelemetry

Construit sur **[OpenTelemetry]** — le framework d’observabilité standard de l’industrie, neutre vis-à-vis des fournisseurs — le système d’observabilité de Qwen Code offre :

- **Compatibilité universelle** : Exportez vers n’importe quel backend OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Données standardisées** : Utilisez des formats et des méthodes de collecte cohérents dans toute votre chaîne d’outils
- **Intégration pérenne** : Connectez-vous à votre infrastructure d’observabilité existante et future
- **Pas de verrouillage fournisseur** : Changez de backend sans modifier votre instrumentation

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Configuration

Tout le comportement de la télémétrie est contrôlé via votre fichier `.qwen/settings.json`. Ces paramètres peuvent être remplacés par des variables d’environnement ou des indicateurs CLI.

| Paramètre                         | Variable d’environnement                            | Indicateur CLI                                               | Description                                                                                                                                                                                                    | Valeurs            | Défaut                  |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------- |
| `enabled`                         | `QWEN_TELEMETRY_ENABLED`                            | `--telemetry` / `--no-telemetry`                            | Active ou désactive la télémétrie                                                                                                                                                                              | `true`/`false`     | `false`                 |
| `target`                          | `QWEN_TELEMETRY_TARGET`                             | `--telemetry-target <local\|gcp>` _(obsolète)_               | Étiquette de destination informative ; ne contrôle pas le routage de l’exportateur — définissez `otlpEndpoint` ou `outfile` pour configurer où les données sont envoyées                                       | `"gcp"`/`"local"`  | `"local"`               |
| `otlpEndpoint`                    | `QWEN_TELEMETRY_OTLP_ENDPOINT`                      | `--telemetry-otlp-endpoint <URL>`                            | Endpoint du collecteur OTLP                                                                                                                                                                                    | chaîne URL         | `http://localhost:4317` |
| `otlpProtocol`                    | `QWEN_TELEMETRY_OTLP_PROTOCOL`                      | `--telemetry-otlp-protocol <grpc\|http>`                     | Protocole de transport OTLP                                                                                                                                                                                    | `"grpc"`/`"http"`  | `"grpc"`                |
| `otlpTracesEndpoint`              | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`               | -                                                            | Remplacement d’endpoint par signal pour les traces (HTTP uniquement)                                                                                                                                           | chaîne URL         | -                       |
| `otlpLogsEndpoint`                | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                 | -                                                            | Remplacement d’endpoint par signal pour les journaux (HTTP uniquement)                                                                                                                                         | chaîne URL         | -                       |
| `otlpMetricsEndpoint`             | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`              | -                                                            | Remplacement d’endpoint par signal pour les métriques (HTTP uniquement)                                                                                                                                        | chaîne URL         | -                       |
| `outfile`                         | `QWEN_TELEMETRY_OUTFILE`                            | `--telemetry-outfile <chemin>`                               | Enregistre la télémétrie dans un fichier (remplace l’export OTLP)                                                                                                                                              | chemin de fichier  | -                       |
| `logPrompts`                      | `QWEN_TELEMETRY_LOG_PROMPTS`                        | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`    | Inclut les prompts dans les journaux de télémétrie                                                                                                                                                             | `true`/`false`     | `true`                  |
| `includeSensitiveSpanAttributes`  | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`  | -                                                            | Inclut les prompts utilisateur, les prompts système, les E/S des outils et la sortie du modèle en tant qu’attributs natifs de span (en plus des spans bridge log-à-span)                                       | `true`/`false`     | `false`                 |
| `sensitiveSpanAttributeMaxLength` | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH`| -                                                            | Longueur maximale (en chaîne JavaScript) pour chaque charge utile d’attribut natif sensible. Abaissez si votre backend rejette les attributs volumineux.                                                        | `1..104857600`     | `1048576`               |
| `resourceAttributes`              | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)  | -                                                            | Attributs de ressource statiques attachés à chaque span/journal/métrique exporté. Voir [Attributs de ressource](#attributs-de-ressource) ci-dessous.                                                            | `key=value,…`      | `{}`                    |
| `metrics.includeSessionId`        | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`         | -                                                            | Inclut `session.id` sur les points de données de métrique. **Désactivé par défaut** pour protéger les backends de métriques contre l’éclatement des séries temporelles.                                         | `true`/`false`     | `false`                 |

**Remarque sur les variables d’environnement booléennes :** Pour les paramètres booléens (`enabled`, `logPrompts`, `includeSensitiveSpanAttributes`), définir la variable d’environnement correspondante à `true` ou `1` active la fonctionnalité. Toute autre valeur la désactive.

**Remarque sur les variables d’environnement entières :** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` doit être un entier positif lorsqu’elle est définie. Les valeurs invalides font échouer la résolution de la configuration de télémétrie plutôt que de revenir silencieusement à une valeur par défaut.

**Attributs sensibles de span :** Lorsque `includeSensitiveSpanAttributes` est activé, deux choses se produisent :

1. **Attributs natifs de span (`qwen-code.interaction`, `api.generateContent*`, `tool.<name>`)** transportent le contenu textuel de la conversation :
   - Prompts utilisateur (`new_context`)
   - Prompts système (`system_prompt` — texte complet une fois par session, dédupliqué par hachage SHA-256 ; les spans suivantes ne portent que `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length`)
   - Schémas d’outils (émis comme événements `tool_schema`, également dédupliqués par hachage)
   - Entrées d’outil (`tool_input`) et résultats d’outil (`tool_result`)
   - Sortie du modèle (`response.model_output`)

   Chaque charge utile de contenu est tronquée à `sensitiveSpanAttributeMaxLength` unités de chaîne JavaScript. La valeur par défaut est 1 MiB (`1048576`), relevée de l’ancienne valeur par défaut de 60 KiB ; définissez `61440` pour conserver l’ancienne limite. La limite doit être comprise entre `1` et `104857600` (100 MiB). Pour les attributs étiquetés, les étiquettes fixes telles que `[USER PROMPT]`, `[TOOL INPUT: ...]` et `[TOOL RESULT: ...]` comptent dans cette limite ; le marqueur de troncature compte également dedans. La limite est mesurée en longueur de chaîne JavaScript plutôt qu’en octets UTF-8. Le contenu non-ASCII peut donc occuper plus d’octets après l’export OTLP. Pour la plupart des types de charge utile, la troncature ajoute à la fois `*_truncated` et `*_original_length`. Les prompts système définissent également `system_prompt_truncated` en cas de troncature, mais utilisent le toujours présent `system_prompt_length` pour la longueur originale.

2. **Spans bridge log-à-span** (utilisées lorsque les traces HTTP sont exportées sans endpoint de journaux) conservent leurs champs existants `prompt`, `function_args` et `response_text`, au lieu d’être supprimées.

⚠️ **Avertissement de sécurité :** Activer ce drapeau envoie l’historique complet de la conversation, le contenu des fichiers lus par `read_file`, les commandes shell et leur sortie (y compris les secrets dans les variables d’environnement ou les arguments), ainsi que les réponses du modèle vers le backend OTLP configuré. Traitez le backend comme un puits de données privilégié. Le drapeau est désactivé par défaut (`false`).

**Coût / taille de charge utile :** Un tour lourd à la limite par défaut (prompt système de 1 MiB plus 10 appels d’outil, chacun jusqu’à 1 MiB d’entrée + 1 MiB de résultat, plus 1 MiB de sortie du modèle) peut produire jusqu’à ~22 MiB de charge utile d’attribut avant compression OTLP, plus jusqu’à 1 MiB par schéma d’outil émis dans les espaces de travail avec de grandes définitions d’outils. C’est la limite côté application de Qwen Code, pas une garantie que chaque collecteur ou backend accepte un seul attribut aussi volumineux. Si des spans sont rejetées ou supprimées, abaissez `sensitiveSpanAttributeMaxLength` (par exemple, à `61440`) et surveillez le débit de l’exportateur.

Ce paramètre ne désactive pas les données sensibles dans les journaux OTel ou autres puits de télémétrie ; la télémétrie des réponses API non internes peut renseigner `response_text`, donc les journaux OTel, la télémétrie de l’interface utilisateur et l’enregistrement du chat peuvent recevoir le texte de réponse indépendamment de ce paramètre. QwenLogger n’inclut pas `response_text`.

**Routage des signaux HTTP OTLP :** Lors de l’utilisation du protocole HTTP (`otlpProtocol: "http"`), Qwen Code ajoute automatiquement des chemins spécifiques aux signaux (`/v1/traces`, `/v1/logs`, `/v1/metrics`) à l’`otlpEndpoint` de base. Par exemple, `http://collector:4318` devient `http://collector:4318/v1/traces` pour les traces. Si l’URL se termine déjà par un chemin de signal, elle est utilisée telle quelle. Les remplacements d’endpoint par signal (`otlpTracesEndpoint`, etc.) prennent le pas sur l’endpoint de base et sont utilisés textuellement. Le protocole gRPC utilise le routage par service et n’ajoute pas de chemins.

Les variables d’environnement d’endpoint par signal acceptent également les noms standard OpenTelemetry : `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`. Les variantes `QWEN_TELEMETRY_OTLP_*` prennent le pas sur les variantes `OTEL_*`.

Pour des informations détaillées sur toutes les options de configuration, consultez le [Guide de configuration](../../users/configuration/settings.md).

### Attributs de ressource

Les attributs de ressource sont des paires clé-valeur statiques attachées à chaque span, journal et métrique exportés via OTLP. Utilisez-les pour segmenter la télémétrie par équipe, environnement, région de déploiement, ou toute autre dimension pertinente pour votre backend.

Deux sources, fusionnées par ordre de priorité (la plus faible → la plus élevée) :

1. La variable d’environnement standard `OTEL_RESOURCE_ATTRIBUTES`
2. `telemetry.resourceAttributes` dans `.qwen/settings.json` (remplace la variable d’environnement en cas de conflit de clé)

`OTEL_SERVICE_NAME` est une échappatoire distincte — lorsqu’elle est définie, elle remplace `service.name` de toute autre source (conformément à la spécification OpenTelemetry).

#### Exemples

**Segmenter toute la télémétrie par équipe / environnement :**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**Router vers un collecteur par locataire via `service.name` :**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**Configuration de base de la flotte (`~/.qwen/settings.json`) + remplacement par hôte :**

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

```bash
# Ajoutez une balise ponctuelle sans toucher aux paramètres :
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### Clés réservées

Certaines clés sont contrôlées par l’exécution et ne peuvent pas être remplacées :

- `service.version` — toujours défini sur la version CLI en cours. Toute définition via une autre source est silencieusement ignorée avec un avertissement.
- `session.id` — injecté à l’exécution par session. Les valeurs fournies par l’utilisateur depuis la variable d’environnement ou les paramètres sont ignorées avec un avertissement. La raison est que les attributs de ressource s’attachent automatiquement à chaque point de données de métrique ; autoriser le remplacement par l’utilisateur contournerait les [Contrôles de cardinalité](#contrôles-de-cardinalité) ci-dessous. Les spans et les journaux portent toujours `session.id`.

`service.name` n’est **pas** réservé ; il suit la chaîne de priorité ci-dessus.

#### Format

`OTEL_RESOURCE_ATTRIBUTES` suit la spécification OpenTelemetry : `key1=value1,key2=value2` avec les valeurs encodées en pourcentage. Les espaces dans les valeurs doivent être encodés en `%20`, **les virgules en `%2C`** (les virgules non encodées fractionnent la valeur à la mauvaise limite et la seconde moitié est ignorée comme malformée). Les paires malformées sont ignorées avec un avertissement plutôt que de faire échouer le démarrage de la télémétrie.

#### Dépannage : quand un attribut fourni par l’utilisateur semble ne pas prendre effet

Les clés réservées (`service.version`, `session.id`), les paires malformées, les valeurs de paramètres non-chaîne et l’encodage pourcentage invalide sont tous silencieusement ignorés avec un avertissement enregistré via le canal de diagnostic OpenTelemetry. Ce canal est dirigé vers le fichier journal de débogage (`~/.qwen/log/otel-*.log`), **pas** la console, donc le comportement peut ressembler à un échec silencieux.

Si un attribut de ressource personnalisé n’apparaît pas sur la télémétrie exportée :

1. Vérifiez `~/.qwen/log/otel-*.log` pour les lignes correspondant à `cannot override` (clé réservée ignorée), `Skipping malformed` (mauvaise paire de variable d’environnement), ou `must be a string` (valeur de paramètre non-chaîne).
2. Vérifiez que la variable d’environnement est définie dans l’environnement du processus qwen-code (pas seulement dans votre shell) et que les valeurs sont encodées en pourcentage.
3. Confirmez que `telemetry.enabled` est `true` — l’initialisation de la télémétrie ne s’exécute que si activée.

### Contrôles de cardinalité

Les métriques sont agrégées par ensemble d’attributs au niveau du backend — chaque combinaison distincte de valeurs d’attributs produit une nouvelle série temporelle. Attacher un champ à haute cardinalité comme `session.id` à une métrique provoque un éclatement des séries temporelles proportionnel au nombre de sessions, ce qui épuise rapidement le stockage du backend de métriques.

Pour éviter cela, Qwen Code maintient les attributs à haute cardinalité en dehors des points de données de métrique par défaut. Les spans et les journaux sont par événement et ne sont pas affectés, donc ils continuent à porter `session.id` pour la corrélation des traces et des journaux.

#### `telemetry.metrics.includeSessionId` (défaut : `false`)

Définir ceci sur `true` (via les paramètres ou `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`) rattache `session.id` à chaque point de données de métrique.

⚠️ **Avertissement :** chaque session CLI crée une nouvelle valeur. Laisser ceci activé pour une flotte fera exploser le stockage des métriques. Recommandé uniquement pour le débogage à court terme. Pour une corrélation de session à long terme, interrogez plutôt les backends de traces ou de journaux.

#### Migration depuis des versions antérieures

Avant cette version, `session.id` était attaché aux métriques par défaut. Si vos requêtes Prometheus / tableaux de bord Grafana / règles d’alerte référencent `session_id` sur une métrique, vous avez deux options :

**Option A** — restaurer le comportement précédent pour le débogage à court terme :

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

ou :

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

**Option B (recommandée)** — déplacer l’analyse au niveau session hors des métriques. Les spans et les journaux portent toujours `session.id`, et les backends de traces / journaux (Jaeger, Tempo, Loki, Aliyun SLS / ARMS Tracing) gèrent le découpage par session nativement sans pression de cardinalité.

### Span HTTP côté client sur les requêtes fetch sortantes

Lorsque la télémétrie est activée, Qwen Code enregistre `UndiciInstrumentation` qui crée une span HTTP côté client pour chaque requête `fetch()` sortante initiée par le processus — y compris les SDK LLM (`openai`, `@google/genai`, `@anthropic-ai/sdk`), le client MCP StreamableHTTP, l’outil `WebFetch`, et les appels hors processus des extensions IDE. La span vous permet de voir la latence réseau (TTFB / transfert du corps de réponse) séparément du temps de traitement du modèle en amont, ce que la span existante `api.generateContent` seule ne peut pas distinguer.

Ces spans vont vers **votre** propre collecteur OTLP (ou fichier outfile) comme le reste de la télémétrie — elles n’affectent pas ce qui est écrit dans la requête HTTP sortante elle-même. La question de savoir si l’en-tête W3C `traceparent` est également écrit dans le flux de requête sortant est contrôlée par un paramètre **distinct et sensible à la sécurité** documenté dans [Corrélation sortante](#corrélation-sortante-sensible-à-la-sécurité) ci-dessous.

**Évitement des boucles de rétroaction.** Le SDK OTel utilise `fetch` en interne pour télécharger les données OTLP. Sans protection, instrumenter `fetch` tracerait ces téléchargements, qui seraient eux-mêmes téléchargés, créant une boucle infinie. L’instrumentation undici de Qwen Code est configurée avec un `ignoreRequestHook` qui ignore les URL correspondant aux préfixes configurés `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint`. En mode fichier-outfile, il n’y a pas de téléchargements HTTP sortants, donc le hook est sans effet.

## Corrélation sortante (SENSIBLE À LA SÉCURITÉ)

Ces paramètres résident dans un **espace de noms de premier niveau distinct** de `telemetry.*` intentionnellement : la télémétrie contrôle le flux de données vers le propre backend d’observabilité de l’opérateur, tandis que `outboundCorrelation.*` contrôle les données de corrélation côté client que qwen-code écrit **dans les flux de requêtes LLM sortants** qui atteignent les endpoints des fournisseurs LLM tiers (DashScope, OpenAI, Anthropic, etc.). Destinataires différents, décision de consentement différente. **Toutes les valeurs par défaut sont désactivées.** Voir la discussion de la revue de la PR #4390 pour la justification du cadrage.

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // défaut
}
```

Lorsque `false` (défaut), Qwen Code installe un `TextMapPropagator` sans effet sur le SDK OTel. UndiciInstrumentation crée toujours des spans HTTP client pour votre collecteur OTLP, mais `propagation.inject()` est sans effet, donc **aucun `traceparent` n’est écrit sur les requêtes sortantes**. Les IDs de trace restent internes au collecteur de l’opérateur.

Lorsque `true`, le propagateur composite W3C par défaut du SDK (`tracecontext` + `baggage`) est installé et l’en-tête standard `traceparent` est écrit sur chaque `fetch` sortant :

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

Optez pour `true` uniquement lorsque le fournisseur LLM rapporte également dans votre collecteur OTel pour le chaînage de traces entre processus — par exemple, ARMS Tracing servant DashScope. Pour la plupart des opérateurs, la valeur est `false` ; la continuation de trace entre fournisseurs est un cas d’usage de niche.
**Dépend de `telemetry.enabled: true`.** Le SDK OTel ne s'initialise que lorsque la télémétrie est activée, donc `propagateTraceContext` n'a d'effet que dans cet état. Le définir sur `true` alors que la télémétrie est désactivée est un no-op silencieux — pas de SDK, pas de propagateur, pas de `traceparent` sur le fil. Vérifiez les deux indicateurs lors de la mise en place d'une corrélation ARMS + DashScope :

```jsonc
{
  "telemetry": {
    "enabled": true,
    "otlpTracesEndpoint": "http://tracing-analysis-...",
  },
  "outboundCorrelation": {
    "propagateTraceContext": true,
  },
}
```

### Autres en-têtes de corrélation sortante

`X-Qwen-Code-Session-Id` et `X-Qwen-Code-Request-Id` **ne font pas partie de cette PR**. Ils seront conçus et proposés dans leurs propres PR de suivi sous le même espace de noms `outboundCorrelation.*`, chacun avec son propre modèle de menace et flux de consentement de l'opérateur. La revue de PR #4390 (LaZzyMan) a établi le principe : « le périmètre de la télémétrie n'inclut pas l'envoi d'identifiants aux fournisseurs de LLM » ; le travail sur les en-têtes de corrélation est transféré vers sa propre discussion de conception plutôt que d'atterrir sous la télémétrie.

## Télémétrie Aliyun

### Export OTLP manuel

Pour visualiser la télémétrie de Qwen Code dans Alibaba Cloud Managed Service for OpenTelemetry, configurez Qwen Code pour exporter vers le point de terminaison OTLP fourni par ARMS.

Définir `"target": "gcp"` seul ne configure pas la destination d'exportation. Si `otlpEndpoint` n'est pas défini, Qwen Code utilise toujours `http://localhost:4317` par défaut. Si `outfile` est défini, il remplace `otlpEndpoint` et la télémétrie est écrite dans le fichier au lieu d'être envoyée à Alibaba Cloud.

1. Activez la télémétrie dans votre `.qwen/settings.json` et définissez le point de terminaison OTLP :

   **Option A : Protocole gRPC** (point de terminaison OTLP standard) :

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

   **Option B : Protocole HTTP avec points de terminaison par signal** (pour les backends qui utilisent des chemins non standard, par ex. `/api/otlp/traces` au lieu de `/v1/traces`) :

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

   > **Remarque :** Lorsque vous utilisez le protocole HTTP avec uniquement `otlpEndpoint` (sans remplacements par signal), Qwen Code ajoute les chemins OTLP standards (`/v1/traces`, `/v1/logs`, `/v1/metrics`) à l'URL de base. Si votre backend utilise des chemins différents, utilisez les remplacements de point de terminaison par signal comme indiqué dans l'Option B.

2. Si votre point de terminaison Alibaba Cloud nécessite une authentification, fournissez les en-têtes OTLP via les variables d'environnement OpenTelemetry standard telles que `OTEL_EXPORTER_OTLP_HEADERS` (ou les variantes spécifiques au signal). Qwen Code n'expose pas actuellement les en-têtes d'authentification OTLP directement dans `.qwen/settings.json`.
3. Exécutez Qwen Code et envoyez des invites.
4. Visualisez la télémétrie dans Managed Service for OpenTelemetry :
   - Aperçu du produit :
     [Qu'est-ce que Managed Service for OpenTelemetry ?][aliyun-opentelemetry-overview]
   - Prise en main :
     [Démarrez avec Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Points d'entrée de la console :
     - Chine continentale :
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (console legacy :
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - International :
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - Dans la console, utilisez `Applications` pour inspecter les traces et la topologie des services.
   - Pour localiser le point de terminaison OTLP et les informations d'accès :
     - **Nouvelle console** (`trace.console.aliyun.com` ou internationale) : accédez à `Integration Center`.
     - **Console legacy** (`tracing.console.aliyun.com`) : accédez à `Cluster Configurations` → `Access point information`.

## Télémétrie locale

Pour le développement et le débogage locaux, vous pouvez capturer les données de télémétrie localement :

### Sortie basée sur fichier (recommandé)

1. Activez la télémétrie dans votre `.qwen/settings.json` :

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Remarque :** Lorsque `outfile` est défini, l'export OTLP est automatiquement désactivé. Les paramètres `target` et `otlpEndpoint` ne sont pas nécessaires pour une sortie fichier uniquement et peuvent être omis en toute sécurité de votre configuration.

2. Exécutez Qwen Code et envoyez des invites.
3. Consultez les logs et métriques dans le fichier spécifié (par ex. `.qwen/telemetry.log`).

### Export basé sur collecteur (avancé)

1. Exécutez le script d'automatisation :
   ```bash
   npm run telemetry -- --target=local
   ```
   Cela va :
   - Télécharger et démarrer Jaeger et le collecteur OTEL
   - Configurer votre espace de travail pour la télémétrie locale
   - Fournir une interface utilisateur Jaeger à http://localhost:16686
   - Enregistrer les logs/métriques dans `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Arrêter le collecteur à la sortie (par ex. `Ctrl+C`)
2. Exécutez Qwen Code et envoyez des invites.
3. Visualisez les traces à http://localhost:16686 et les logs/métriques dans le fichier de log du collecteur.

## Logs et Métriques

La section suivante décrit la structure des logs et métriques générés pour Qwen Code.

- Un `sessionId` est inclus comme attribut commun sur tous les logs et métriques.

### Logs

Les logs sont des enregistrements horodatés d'événements spécifiques. Les événements suivants sont enregistrés pour Qwen Code :

- `qwen-code.config` : Cet événement se produit une fois au démarrage avec la configuration de la CLI.
  - **Attributs** :
    - `model` (chaîne)
    - `sandbox_enabled` (booléen)
    - `core_tools_enabled` (chaîne)
    - `approval_mode` (chaîne)
    - `file_filtering_respect_git_ignore` (booléen)
    - `debug_mode` (booléen)
    - `truncate_tool_output_threshold` (nombre)
    - `truncate_tool_output_lines` (nombre)
    - `hooks` (chaîne, types d'événements de hook séparés par des virgules, omis si les hooks sont désactivés)
    - `ide_enabled` (booléen)
    - `interactive_shell_enabled` (booléen)
    - `mcp_servers` (chaîne)
    - `output_format` (chaîne : "text" ou "json")

- `qwen-code.user_prompt` : Cet événement se produit lorsqu'un utilisateur soumet une invite.
  - **Attributs** :
    - `prompt_length` (entier)
    - `prompt_id` (chaîne)
    - `prompt` (chaîne, cet attribut est exclu si `log_prompts_enabled` est configuré sur `false`)
    - `auth_type` (chaîne)

- `qwen-code.tool_call` : Cet événement se produit pour chaque appel de fonction.
  - **Attributs** :
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (booléen)
    - `decision` (chaîne : "accept", "reject", "auto_accept" ou "modify", si applicable)
    - `error` (si applicable)
    - `error_type` (si applicable)
    - `content_length` (entier, si applicable)
    - `metadata` (si applicable, dictionnaire de chaîne -> any)

- `qwen-code.file_operation` : Cet événement se produit pour chaque opération sur fichier.
  - **Attributs** :
    - `tool_name` (chaîne)
    - `operation` (chaîne : "create", "read", "update")
    - `lines` (entier, si applicable)
    - `mimetype` (chaîne, si applicable)
    - `extension` (chaîne, si applicable)
    - `programming_language` (chaîne, si applicable)
    - `diff_stat` (chaîne JSON, si applicable) : Une chaîne JSON avec les membres suivants :
      - `ai_added_lines` (entier)
      - `ai_removed_lines` (entier)
      - `user_added_lines` (entier)
      - `user_removed_lines` (entier)

- `qwen-code.api_request` : Cet événement se lors d'une requête à l'API Qwen.
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

- `qwen-code.tool_output_truncated` : Cet événement se produit lorsque la sortie d'un appel d'outil est trop grande et est tronquée.
  - **Attributs** :
    - `tool_name` (chaîne)
    - `original_content_length` (entier)
    - `truncated_content_length` (entier)
    - `threshold` (entier)
    - `lines` (entier)
    - `prompt_id` (chaîne)

- `qwen-code.malformed_json_response` : Cet événement se produit lorsqu'une réponse `generateJson` de l'API Qwen ne peut pas être analysée en JSON.
  - **Attributs** :
    - `model`

- `qwen-code.flash_fallback` : Cet événement se produit lorsque Qwen Code bascule vers flash en tant que solution de repli.
  - **Attributs** :
    - `auth_type`

- `qwen-code.slash_command` : Cet événement se produit lorsqu'un utilisateur exécute une commande slash.
  - **Attributs** :
    - `command` (chaîne)
    - `subcommand` (chaîne, si applicable)

- `qwen-code.extension_enable` : Cet événement se produit lorsqu'une extension est activée
- `qwen-code.extension_install` : Cet événement se produit lorsqu'une extension est installée
  - **Attributs** :
    - `extension_name` (chaîne)
    - `extension_version` (chaîne)
    - `extension_source` (chaîne)
    - `status` (chaîne)
- `qwen-code.extension_uninstall` : Cet événement se produit lorsqu'une extension est désinstallée

### Métriques

Les métriques sont des mesures numériques du comportement dans le temps. Les métriques suivantes sont collectées pour Qwen Code (les noms de métriques restent `qwen-code.*` pour la compatibilité) :

- `qwen-code.session.count` (Compteur, Entier) : Incrémenté une fois par démarrage de la CLI.

- `qwen-code.tool.call.count` (Compteur, Entier) : Compte les appels d'outil.
  - **Attributs** :
    - `function_name`
    - `success` (booléen)
    - `decision` (chaîne : "accept", "reject" ou "modify", si applicable)
    - `tool_type` (chaîne : "mcp" ou "native", si applicable)

- `qwen-code.tool.call.latency` (Histogramme, ms) : Mesure la latence des appels d'outil.
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
    - `type` (chaîne : "input", "output", "thought" ou "cache")

- `qwen-code.file.operation.count` (Compteur, Entier) : Compte les opérations sur fichier.
  - **Attributs** :
    - `operation` (chaîne : "create", "read", "update") : Le type d'opération sur fichier.
    - `lines` (Entier, si applicable) : Nombre de lignes dans le fichier.
    - `mimetype` (chaîne, si applicable) : Type MIME du fichier.
    - `extension` (chaîne, si applicable) : Extension du fichier.
    - `model_added_lines` (Entier, si applicable) : Nombre de lignes ajoutées/modifiées par le modèle.
    - `model_removed_lines` (Entier, si applicable) : Nombre de lignes supprimées/modifiées par le modèle.
    - `user_added_lines` (Entier, si applicable) : Nombre de lignes ajoutées/modifiées par l'utilisateur dans les modifications proposées par l'IA.
    - `user_removed_lines` (Entier, si applicable) : Nombre de lignes supprimées/modifiées par l'utilisateur dans les modifications proposées par l'IA.
    - `programming_language` (chaîne, si applicable) : Le langage de programmation du fichier.

- `qwen-code.chat_compression` (Compteur, Entier) : Compte les opérations de compression de chat
  - **Attributs** :
    - `tokens_before`: (Entier) : Nombre de jetons dans le contexte avant compression
    - `tokens_after`: (Entier) : Nombre de jetons dans le contexte après compression
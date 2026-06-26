# Observabilité avec OpenTelemetry

Apprenez à activer et configurer OpenTelemetry pour Qwen Code.

- [Observabilité avec OpenTelemetry](#observability-with-opentelemetry)
  - [Avantages clés](#key-benefits)
  - [Intégration OpenTelemetry](#opentelemetry-integration)
  - [Configuration](#configuration)
  - [Télémétrie Aliyun](#aliyun-telemetry)
    - [Export OTLP manuel](#manual-otlp-export)
  - [Télémétrie locale](#local-telemetry)
    - [Sortie fichier (recommandée)](#file-based-output-recommended)
    - [Export via collecteur (avancé)](#collector-based-export-advanced)
  - [Journaux et métriques](#logs-and-metrics)
    - [Journaux](#logs)
    - [Métriques](#metrics)

## Avantages clés

- **🔍 Analyse d'utilisation** : Comprenez les schémas d'interaction et l'adoption des fonctionnalités au sein de votre équipe
- **⚡ Surveillance des performances** : Suivez les temps de réponse, la consommation de jetons et l'utilisation des ressources
- **🐛 Débogage en temps réel** : Identifiez les goulots d'étranglement, les échecs et les schémas d'erreur dès leur apparition
- **📊 Optimisation des workflows** : Prenez des décisions éclairées pour améliorer les configurations et les processus
- **🏢 Gouvernance d'entreprise** : Surveillez l'utilisation par équipe, suivez les coûts, assurez la conformité et intégrez-vous à l'infrastructure de surveillance existante

## Intégration OpenTelemetry

Construit sur **[OpenTelemetry]** — le cadre d'observabilité standard de l'industrie, neutre vis-à-vis des fournisseurs — le système d'observabilité de Qwen Code offre :

- **Compatibilité universelle** : Exportez vers n'importe quel backend OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Données standardisées** : Utilisez des formats et des méthodes de collecte cohérents à travers votre chaîne d'outils
- **Intégration pérenne** : Connectez-vous à l'infrastructure d'observabilité existante et future
- **Pas de dépendance vis-à-vis d'un fournisseur** : Changez de backend sans modifier votre instrumentation

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Configuration

Tout le comportement télémétrique est contrôlé via votre fichier `.qwen/settings.json`. Ces paramètres peuvent être remplacés par des variables d'environnement ou des indicateurs en ligne de commande.

| Paramètre                        | Variable d'environnement                            | Indicateur CLI                                              | Description                                                                                                                           | Valeurs           | Défaut                  |
| -------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                        | `QWEN_TELEMETRY_ENABLED`                           | `--telemetry` / `--no-telemetry`                         | Activer ou désactiver la télémétrie                                                                                                   | `true`/`false`    | `false`                 |
| `target`                         | `QWEN_TELEMETRY_TARGET`                            | `--telemetry-target <local\|gcp>` _(obsolète)_           | Étiquette informative de destination ; ne contrôle pas le routage de l'exportateur — définissez `otlpEndpoint` ou `outfile` pour configurer l'envoi des données | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                   | `QWEN_TELEMETRY_OTLP_ENDPOINT`                     | `--telemetry-otlp-endpoint <URL>`                        | Point de terminaison du collecteur OTLP                                                                                               | Chaîne URL        | `http://localhost:4317` |
| `otlpProtocol`                   | `QWEN_TELEMETRY_OTLP_PROTOCOL`                     | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocole de transport OTLP                                                                                                           | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`             | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`              | -                                                        | Remplacement du point de terminaison par signal pour les traces (HTTP uniquement)                                                     | Chaîne URL        | -                       |
| `otlpLogsEndpoint`               | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                | -                                                        | Remplacement du point de terminaison par signal pour les journaux (HTTP uniquement)                                                   | Chaîne URL        | -                       |
| `otlpMetricsEndpoint`            | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`             | -                                                        | Remplacement du point de terminaison par signal pour les métriques (HTTP uniquement)                                                  | Chaîne URL        | -                       |
| `outfile`                        | `QWEN_TELEMETRY_OUTFILE`                           | `--telemetry-outfile <path>`                             | Enregistrer la télémétrie dans un fichier (remplace l'export OTLP)                                                                    | chemin fichier    | -                       |
| `logPrompts`                     | `QWEN_TELEMETRY_LOG_PROMPTS`                       | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Inclure les invites dans les journaux de télémétrie                                                                                   | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes` | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES` | -                                                        | Inclure les invites utilisateur, les invites système, les E/S des outils et la sortie du modèle comme attributs natifs des spans (en plus des spans du pont journal-vers-span) | `true`/`false`    | `false`                 |
| `resourceAttributes`             | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`) | -                                                        | Attributs de ressource statiques attachés à chaque span/journal/métrique exporté. Voir [Attributs de ressource](#resource-attributes) ci-dessous. | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`       | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`        | -                                                        | Inclure `session.id` sur les points de données métriques. **Désactivé par défaut** pour protéger les backends métriques du fan-out des séries temporelles. | `true`/`false`    | `false`                 |
**Note sur les variables d'environnement booléennes :** Pour les paramètres booléens (`enabled`,
`logPrompts`, `includeSensitiveSpanAttributes`), définir la variable
d'environnement correspondante à `true` ou `1` active la fonctionnalité. Toute
autre valeur la désactive.

**Attributs de span sensibles :** Lorsque `includeSensitiveSpanAttributes` est activé,
deux choses se produisent :

1. **Attributs de span natifs (`qwen-code.interaction`, `api.generateContent*`,
   `tool.<name>`)** transportent le contenu textuel des conversations :
   - Invites utilisateur (`new_context`)
   - Invites système (`system_prompt` — texte complet une fois par session, dédupliqué par
     hachage SHA-256 ; les spans suivantes ne portent que `system_prompt_hash` +
     `system_prompt_preview` + `system_prompt_length`)
   - Schémas d'outils (émis en tant qu'événements `tool_schema`, également dédupliqués par hachage)
   - Entrées d'outil (`tool_input`) et résultats d'outil (`tool_result`)
   - Sortie du modèle (`response.model_output`)

   Chaque valeur est tronquée à 60 Ko ; les indicateurs `*_truncated` et `*_original_length`
   signalent quand une troncature se produit.

2. **Spans de pont journal-à-span** (utilisées lorsque les traces HTTP sont exportées sans
   point de terminaison de journaux) conservent leurs champs existants `prompt`, `function_args`, et
   `response_text`, au lieu d'être supprimées.

⚠️ **Avertissement de sécurité :** l'activation de ce drapeau envoie l'historique complet de la conversation,
le contenu des fichiers lus par `read_file`, les commandes shell et leur sortie (y compris
les secrets dans les variables d'environnement ou les arguments), ainsi que les réponses du modèle au backend OTLP
configuré. Traitez le backend comme un puits de données privilégié. Le drapeau est par défaut à
`false`.

**Coût / taille des données utiles :** Un tour lourd (60 Ko d'invite système + 10 appels d'outil,
chacun jusqu'à 60 Ko d'entrée + 60 Ko de résultat, plus 60 Ko de sortie de modèle) peut produire jusqu'à
~1,5 Mo de données utiles d'attribut avant la compression OTLP. Lorsque vous pointez des outils
qui lisent de gros fichiers (`read_file`, etc.) vers des sessions de longue durée, surveillez
le débit de l'exportateur.

Ce paramètre ne désactive pas les données sensibles dans les journaux OTel ou les autres puits
de télémétrie ; la télémétrie de réponse API non interne peut alimenter `response_text`, donc
les journaux OTel, la télémétrie d'interface utilisateur et l'enregistrement de chat peuvent recevoir le texte de réponse
indépendamment de ce paramètre. QwenLogger n'inclut pas `response_text`.

**Routage des signaux OTLP HTTP :** Lors de l'utilisation du protocole HTTP (`otlpProtocol: "http"`),
Qwen Code ajoute automatiquement les chemins de signal spécifiques (`/v1/traces`, `/v1/logs`,
`/v1/metrics`) à la base `otlpEndpoint`. Par exemple, `http://collector:4318`
devient `http://collector:4318/v1/traces` pour les traces. Si l'URL se termine déjà
par un chemin de signal, elle est utilisée telle quelle. Les surcharges de point de terminaison par signal
(`otlpTracesEndpoint`, etc.) ont priorité sur le point de terminaison de base et sont utilisées
textuellement. Le protocole gRPC utilise le routage basé sur le service et n'ajoute pas de chemins.

Les variables d'environnement de point de terminaison par signal acceptent également les noms
standard OpenTelemetry : `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`.
Les variantes `QWEN_TELEMETRY_OTLP_*` ont priorité sur les variantes `OTEL_*`.

Pour des informations détaillées sur toutes les options de configuration, consultez le
[Guide de configuration](../../users/configuration/settings.md).

### Attributs de ressource

Les attributs de ressource sont des paires clé-valeur statiques attachées à chaque span, journal
et métrique exporté via OTLP. Utilisez-les pour segmenter la télémétrie par équipe, environnement,
région de déploiement, ou toute autre dimension importante pour votre backend.

Deux sources, fusionnées par ordre de priorité (la plus faible → la plus élevée) :

1. La variable d'environnement standard `OTEL_RESOURCE_ATTRIBUTES`
2. `telemetry.resourceAttributes` dans `.qwen/settings.json` (remplace la variable d'environnement en cas de conflit de clé)

`OTEL_SERVICE_NAME` est une échappatoire distincte — lorsqu'elle est définie, elle remplace
`service.name` de toute autre source (conformément à la spécification OpenTelemetry).

#### Exemples

**Segmenter toute la télémétrie par équipe / environnement :**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**Router vers un collecteur par locataire via `service.name` :**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**Configuration de base de la flotte (`~/.qwen/settings.json`) + surcharge par hôte :**

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
# Ajouter une balise ponctuelle sans toucher à la configuration :
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### Clés réservées

Certaines clés sont contrôlées par l'exécution et ne peuvent pas être remplacées :

- `service.version` — toujours définie sur la version CLI en cours. Toute définition à partir d'une
  source quelconque est silencieusement ignorée avec un avertissement.
- `session.id` — injectée par l'exécution par session. Les valeurs fournies par l'utilisateur à partir
  de la variable d'environnement ou des paramètres sont ignorées avec un avertissement. La raison est que
  les attributs de ressource s'attachent automatiquement à chaque point de données de métrique ; permettre une
  surcharge utilisateur contournerait les [contrôles de cardinalité](#cardinality-controls) ci-dessous.
  Les spans et les journaux portent toujours `session.id`.

`service.name` n'est **pas** réservé ; il suit la chaîne de priorité ci-dessus.

#### Format

`OTEL_RESOURCE_ATTRIBUTES` suit la spécification OpenTelemetry :
`key1=value1,key2=value2` avec les valeurs encodées en pourcentage. Les espaces dans les valeurs doivent
être encodés en `%20`, **les virgules en `%2C`** (les virgules non encodées divisent la valeur à la
mauvaise limite et la seconde moitié est ignorée comme malformée). Les paires malformées
sont ignorées avec un avertissement plutôt que de faire échouer le démarrage de la télémétrie.
#### Dépannage : quand un attribut fourni par l'utilisateur semble ne pas prendre effet

Les clés réservées (`service.version`, `session.id`), les paires mal formées,
les valeurs de paramètres non-chaîne, et le pourcent-encodage invalide sont
tous silencieusement ignorés avec un avertissement enregistré via le canal de
diagnostic OpenTelemetry. Ce canal est dirigé vers le fichier de log de débogage
(`~/.qwen/log/otel-*.log`), **pas** la console, donc le comportement peut
ressembler à un échec silencieux.

Si un attribut de ressource personnalisé n'apparaît pas sur la télémétrie exportée :

1. Vérifiez `~/.qwen/log/otel-*.log` pour des lignes correspondant à `cannot override` (clé réservée ignorée), `Skipping malformed` (mauvaise paire de variable d'env), ou `must be a string` (valeur de paramètre non-chaîne).
2. Vérifiez que la variable d'env est définie dans l'environnement du processus qwen-code (pas seulement votre shell) et que les valeurs sont pourcent-encodées.
3. Confirmez que `telemetry.enabled` est `true` — l'initialisation de la télémétrie ne s'exécute que si elle est activée.

### Contrôles de cardinalité

Les métriques sont agrégées par jeu d'attributs côté backend — chaque combinaison
distincte de valeurs d'attributs produit une nouvelle série temporelle. Attacher
un champ à haute cardinalité comme `session.id` à une métrique provoque un
fan-out de séries temporelles proportionnel au nombre de sessions, ce qui épuise
rapidement le stockage du backend de métriques.

Pour éviter cela, Qwen Code conserve par défaut les attributs à haute cardinalité
hors des points de données métriques. Les spans et les logs sont par événement et
non affectés, donc ils continuent à porter `session.id` pour la corrélation des
traces et des logs.

#### `telemetry.metrics.includeSessionId` (défaut : `false`)

Mettre ceci à `true` (via les paramètres ou
`QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`) rattache `session.id` à
chaque point de données métrique.

⚠️ **Avertissement :** chaque session CLI crée une nouvelle valeur. Laisser ceci
activé pour une flotte fera exploser le stockage des métriques. Recommandé
uniquement pour le débogage à court terme. Pour une corrélation de session à long
terme, interrogez plutôt les backends de traces ou de logs.

#### Migration depuis des versions antérieures

Avant cette version, `session.id` était attaché aux métriques par défaut. Si
vos requêtes Prometheus / tableaux de bord Grafana / règles d'alerte font
référence à `session_id` sur une métrique, vous avez deux options :

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

**Option B (recommandée)** — déplacer l'analyse au niveau session hors des métriques.
Les spans et les logs portent toujours `session.id`, et les backends de traces/logs
(Jaeger, Tempo, Loki, Aliyun SLS / ARMS Tracing) gèrent nativement le découpage
par session sans pression de cardinalité.

### Span HTTP côté client sur les requêtes sortantes

Quand la télémétrie est activée, Qwen Code enregistre `UndiciInstrumentation`
qui crée un span HTTP côté client pour chaque requête `fetch()` sortante
initiée par le processus — y compris les SDK LLM (`openai`,
`@google/genai`, `@anthropic-ai/sdk`), le client MCP StreamableHTTP, l'outil
`WebFetch`, et les appels hors processus des extensions IDE. Le span vous
permet de voir la latence réseau (TTFB / transfert du corps de la réponse)
séparément du temps de traitement du modèle en amont, ce que le span existant
`api.generateContent` seul ne peut pas distinguer.

Ces spans vont vers **votre** collecteur OTLP (ou fichier de sortie) comme
le reste de la télémétrie — ils n'affectent pas ce qui est écrit sur la
requête HTTP sortante elle-même. Que l'en-tête W3C `traceparent` soit
également écrit dans le flux de la requête sortante est contrôlé par un
**paramètre distinct, lié à la sécurité**, documenté dans
[corrélation sortante](#corrélation-sortante-lié-à-la-sécurité) ci-dessous.

**Éviter la boucle de rétroaction.** Le SDK OTel utilise `fetch` en interne
pour télécharger les données OTLP. Sans protection, instrumenter `fetch`
tracerait ces téléchargements, qui seraient eux-mêmes téléchargés, créant une
boucle infinie. L'instrumentation undici de Qwen Code est configurée avec un
`ignoreRequestHook` qui ignore les URL correspondant aux préfixes de
`telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` /
`telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint` configurés.
En mode fichier de sortie, il n'y a pas de téléchargements HTTP sortants,
donc le hook est sans effet.

## Corrélation sortante (LIÉ À LA SÉCURITÉ)

Ces paramètres se trouvent dans un **espace de noms global distinct** de
`telemetry.*` intentionnellement : la télémétrie contrôle le flux de données
vers le backend d'observabilité de l'opérateur lui-même, tandis que
`outboundCorrelation.*` contrôle les données de corrélation côté client que
qwen-code écrit **dans les flux de requêtes API LLM sortantes** qui atteignent
les points de terminaison des fournisseurs LLM tiers (DashScope, OpenAI,
Anthropic, etc.). Destinataires différents, décision de consentement différente.
**Toutes les valeurs sont désactivées par défaut.** Voir la discussion de la
relecture de la PR #4390 pour la justification du cadrage.

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // défaut
}
```

Lorsque `false` (défaut), Qwen Code installe un `TextMapPropagator` sans effet
sur le SDK OTel. UndiciInstrumentation crée toujours des spans HTTP client
pour votre collecteur OTLP, mais `propagation.inject()` est sans effet donc
**aucun `traceparent` n'est écrit sur les requêtes sortantes**. Les IDs de
trace restent internes au collecteur de l'opérateur.
Lorsque `true`, le propagateur composite W3C par défaut du SDK
(`tracecontext` + `baggage`) est installé et l'en-tête standard `traceparent`
est écrit sur chaque `fetch` sortant :

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

Activez cette option uniquement lorsque le fournisseur LLM envoie également des données dans votre collecteur OTel
pour un chaînage de traces inter-processus — par exemple, ARMS Tracing au service de DashScope.
Pour la plupart des opérateurs, la valeur est `false` ; la continuation de traces entre fournisseurs est un cas particulier.

**Dépend de `telemetry.enabled: true`.** Le SDK OTel ne s'initialise que
lorsque la télémétrie est activée, donc `propagateTraceContext` n'a d'effet
que dans cet état. Le définir à `true` alors que la télémétrie est désactivée est un
no-op silencieux — pas de SDK, pas de propagateur, pas de `traceparent` sur le réseau.
Vérifiez les deux indicateurs lors de la configuration d'un couplage ARMS+DashScope :

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

`X-Qwen-Code-Session-Id` et `X-Qwen-Code-Request-Id` **ne font pas partie de
cette PR**. Ils seront conçus et proposés dans leur(s) propre(s) PR(s) ultérieure(s)
sous le même espace de noms `outboundCorrelation.*`, chacun avec son propre
modèle de menace et son flux de consentement de l'opérateur. La revue de PR #4390 (LaZzyMan)
a établi le principe : "le périmètre de la télémétrie n'inclut pas l'envoi
d'identifiants aux fournisseurs LLM" ; le travail sur les en-têtes de corrélation
est déplacé vers sa propre discussion de conception plutôt que d'atterrir sous la télémétrie.

## Télémétrie Aliyun

### Export OTLP manuel

Pour afficher la télémétrie de Qwen Code dans le service géré Alibaba Cloud pour
OpenTelemetry, configurez Qwen Code pour exporter vers le point de terminaison OTLP
fourni par ARMS.

Le fait de définir `"target": "gcp"` seul ne configure pas la destination
d'export. Si `otlpEndpoint` n'est pas défini, Qwen Code utilise toujours
`http://localhost:4317` par défaut. Si `outfile` est défini, il remplace
`otlpEndpoint` et la télémétrie est écrite dans le fichier au lieu d'être
envoyée à Alibaba Cloud.

1. Activez la télémétrie dans votre `.qwen/settings.json` et définissez le point
   de terminaison OTLP :

   **Option A : protocole gRPC** (point de terminaison OTLP standard) :

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

   **Option B : protocole HTTP avec points de terminaison par signal** (pour les backends
   qui utilisent des chemins non standard, par exemple `/api/otlp/traces` au lieu de
   `/v1/traces`) :

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

   > **Note :** Lorsque vous utilisez le protocole HTTP avec uniquement `otlpEndpoint` (sans
   > remplacements par signal), Qwen Code ajoute les chemins OTLP standard
   > (`/v1/traces`, `/v1/logs`, `/v1/metrics`) à l'URL de base. Si votre
   > backend utilise des chemins différents, utilisez les remplacements de point de terminaison par signal
   > comme indiqué dans l'option B.

2. Si votre point de terminaison Alibaba Cloud nécessite une authentification, fournissez les en-têtes
   OTLP via les variables d'environnement standard OpenTelemetry telles que
   `OTEL_EXPORTER_OTLP_HEADERS` (ou les variantes spécifiques au signal). Qwen
   Code n'expose pas actuellement les en-têtes d'authentification OTLP directement dans
   `.qwen/settings.json`.
3. Exécutez Qwen Code et envoyez des prompts.
4. Affichez la télémétrie dans le service géré pour OpenTelemetry :
   - Aperçu du produit :
     [Qu'est-ce que Managed Service for OpenTelemetry ?][aliyun-opentelemetry-overview]
   - Prise en main :
     [Démarrer avec Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Points d'entrée de la console :
     - Chine continentale :
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (console héritée :
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - Internationale :
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - Dans la console, utilisez `Applications` pour inspecter les traces et la topologie des services.
   - Pour localiser le point de terminaison OTLP et les informations d'accès :
     - **Nouvelle console** (`trace.console.aliyun.com` ou internationale) :
       accédez à `Integration Center`.
     - **Console héritée** (`tracing.console.aliyun.com`) : accédez à
       `Cluster Configurations` → `Access point information`.

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

   > **Note :** Lorsque `outfile` est défini, l'export OTLP est automatiquement désactivé.
   > Les paramètres `target` et `otlpEndpoint` ne sont pas nécessaires pour une sortie
   > uniquement fichier et peuvent être omis en toute sécurité de votre configuration.

2. Exécutez Qwen Code et envoyez des prompts.
3. Affichez les logs et les métriques dans le fichier spécifié (par exemple, `.qwen/telemetry.log`).
### Export basé sur un collecteur (Avancé)

1. Exécutez le script d'automatisation :
   ```bash
   npm run telemetry -- --target=local
   ```
   Cela va :
   - Télécharger et démarrer Jaeger et le collecteur OTEL
   - Configurer votre espace de travail pour la télémétrie locale
   - Fournir une interface Jaeger à l'adresse http://localhost:16686
   - Enregistrer les logs/métriques dans `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Arrêter le collecteur à la sortie (par exemple `Ctrl+C`)
2. Exécutez Qwen Code et envoyez des prompts.
3. Consultez les traces à l'adresse http://localhost:16686 et les logs/métriques dans le fichier de logs du collecteur.

## Logs et métriques

La section suivante décrit la structure des logs et des métriques générés pour Qwen Code.

- Un `sessionId` est inclus comme attribut commun sur tous les logs et métriques.

### Logs

Les logs sont des enregistrements horodatés d'événements spécifiques. Les événements suivants sont enregistrés pour Qwen Code :

- `qwen-code.config` : Cet événement se produit une fois au démarrage avec la configuration de la CLI.
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
    - `output_format` (string: "text" or "json")

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
    - `decision` (string: "accept", "reject", "auto_accept", or "modify", si applicable)
    - `error` (si applicable)
    - `error_type` (si applicable)
    - `content_length` (int, si applicable)
    - `metadata` (si applicable, dictionnaire de string -> any)

- `qwen-code.file_operation` : Cet événement se produit pour chaque opération sur fichier.
  - **Attributs** :
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, si applicable)
    - `mimetype` (string, si applicable)
    - `extension` (string, si applicable)
    - `programming_language` (string, si applicable)
    - `diff_stat` (json string, si applicable) : Une chaîne JSON avec les membres suivants :
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

- `qwen-code.malformed_json_response` : Cet événement se produit lorsqu'une réponse `generateJson` de l'API Qwen ne peut pas être analysée comme du JSON.
  - **Attributs** :
    - `model`

- `qwen-code.flash_fallback` : Cet événement se produit lorsque Qwen Code bascule vers flash comme solution de repli.
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

Les métriques sont des mesures numériques du comportement dans le temps. Les métriques suivantes sont collectées pour Qwen Code (les noms des métriques restent `qwen-code.*` pour des raisons de compatibilité) :

- `qwen-code.session.count` (Counter, Int) : Incrémenté une fois par démarrage de la CLI.

- `qwen-code.tool.call.count` (Counter, Int) : Compte les appels d'outils.
  - **Attributs** :
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", or "modify", si applicable)
    - `tool_type` (string: "mcp", or "native", si applicable)
- `qwen-code.tool.call.latency` (Histogram, ms) : Mesure la latence des appels d'outils.
  - **Attributs** :
    - `function_name`
    - `decision` (chaîne : "accept", "reject" ou "modify", si applicable)

- `qwen-code.api.request.count` (Counter, entier) : Compte toutes les requêtes API.
  - **Attributs** :
    - `model`
    - `status_code`
    - `error_type` (si applicable)

- `qwen-code.api.request.latency` (Histogram, ms) : Mesure la latence des requêtes API.
  - **Attributs** :
    - `model`

- `qwen-code.token.usage` (Counter, entier) : Compte le nombre de tokens utilisés.
  - **Attributs** :
    - `model`
    - `type` (chaîne : "input", "output", "thought" ou "cache")

- `qwen-code.file.operation.count` (Counter, entier) : Compte les opérations sur les fichiers.
  - **Attributs** :
    - `operation` (chaîne : "create", "read", "update") : Le type d'opération sur le fichier.
    - `lines` (entier, si applicable) : Nombre de lignes dans le fichier.
    - `mimetype` (chaîne, si applicable) : Type MIME du fichier.
    - `extension` (chaîne, si applicable) : Extension du fichier.
    - `model_added_lines` (entier, si applicable) : Nombre de lignes ajoutées/modifiées par le modèle.
    - `model_removed_lines` (entier, si applicable) : Nombre de lignes supprimées/modifiées par le modèle.
    - `user_added_lines` (entier, si applicable) : Nombre de lignes ajoutées/modifiées par l'utilisateur dans les modifications proposées par l'IA.
    - `user_removed_lines` (entier, si applicable) : Nombre de lignes supprimées/modifiées par l'utilisateur dans les modifications proposées par l'IA.
    - `programming_language` (chaîne, si applicable) : Le langage de programmation du fichier.

- `qwen-code.chat_compression` (Counter, entier) : Compte les opérations de compression de chat
  - **Attributs** :
    - `tokens_before` : (entier) : Nombre de tokens dans le contexte avant compression
    - `tokens_after` : (entier) : Nombre de tokens dans le contexte après compression

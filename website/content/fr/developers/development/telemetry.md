# Observabilité avec OpenTelemetry

Découvrez comment activer et configurer OpenTelemetry pour Qwen Code.

- [Observabilité avec OpenTelemetry](#observability-with-opentelemetry)
  - [Principaux avantages](#key-benefits)
  - [Intégration d'OpenTelemetry](#opentelemetry-integration)
  - [Configuration](#configuration)
  - [Télémétrie Aliyun](#aliyun-telemetry)
    - [Exportation OTLP manuelle](#manual-otlp-export)
  - [Télémétrie locale](#local-telemetry)
    - [Sortie basée sur un fichier (Recommandé)](#file-based-output-recommended)
    - [Exportation basée sur un collecteur (Avancé)](#collector-based-export-advanced)
  - [Logs et métriques](#logs-and-metrics)
    - [Logs](#logs)
    - [Métriques](#metrics)
    - [Métriques du daemon](#daemon-metrics)
    - [Spans](#spans)
    - [Métriques de ressources](#resource-metrics)
    - [Surveillance des performances (Réservé)](#performance-monitoring-reserved)

## Notes de migration

- `tool_output_truncated` a été renommé en `qwen-code.tool_output_truncated` pour des raisons de cohérence de namespace — les consommateurs en aval filtrant sur l'ancien nom doivent mettre à jour leurs requêtes.

- La documentation de l'histogramme `tool.call.latency` listait précédemment un attribut `decision` — celui-ci n'a jamais été défini sur l'histogramme (seul `function_name` est enregistré). Le compteur `tool.call.count` continue d'inclure `decision`.

- La documentation de l'événement de log `qwen-code.file_operation` et de la métrique `file.operation.count` listait précédemment des attributs de statistiques de diff (`model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`) — ceux-ci n'ont jamais été définis sur l'un ou l'autre. Les données de statistiques de diff sont disponibles via l'attribut `metadata` de l'événement de log `tool_call`.

## Principaux avantages

- **🔍 Analyses d'utilisation** : Comprendre les schémas d'interaction et l'adoption des fonctionnalités
  au sein de votre équipe
- **⚡ Surveillance des performances** : Suivre les temps de réponse, la consommation de tokens et
  l'utilisation des ressources
- **🐛 Débogage en temps réel** : Identifier les goulots d'étranglement, les défaillances et les schémas d'erreurs
  au fur et à mesure qu'ils se produisent
- **📊 Optimisation du workflow** : Prendre des décisions éclairées pour améliorer
  les configurations et les processus
- **🏢 Gouvernance d'entreprise** : Surveiller l'utilisation au sein des équipes, suivre les coûts, garantir
  la conformité et s'intégrer à l'infrastructure de surveillance existante

## Intégration d'OpenTelemetry

Construit sur **[OpenTelemetry]** — le framework d'observabilité standard de l'industrie
et indépendant des fournisseurs — le système d'observabilité de Qwen Code fournit :

- **Compatibilité universelle** : Exportation vers n'importe quel backend OpenTelemetry (Aliyun,
  Jaeger, Prometheus, Datadog, etc.)
- **Données standardisées** : Utilisation de formats et de méthodes de collecte cohérents dans
  l'ensemble de votre chaîne d'outils
- **Intégration pérenne** : Connexion avec l'infrastructure d'observabilité
  existante et future
- **Aucun verrouillage fournisseur** : Basculement entre les backends sans modifier votre
  instrumentation

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Configuration

Tout le comportement de la télémétrie est contrôlé via votre fichier `.qwen/settings.json`.
Ces paramètres peuvent être remplacés par des variables d'environnement ou des flags CLI.

| Setting                           | Environment Variable                                 | CLI Flag                                                 | Description                                                                                                                                    | Values            | Default                 |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                         | `QWEN_TELEMETRY_ENABLED`                             | `--telemetry` / `--no-telemetry`                         | Activer ou désactiver la télémétrie                                                                                                            | `true`/`false`    | `false`                 |
| `target`                          | `QWEN_TELEMETRY_TARGET`                              | `--telemetry-target <local\|gcp>` _(deprecated)_         | Label de destination informatif ; ne contrôle pas le routage de l'exportateur — définissez `otlpEndpoint` ou `outfile` pour configurer l'endroit où les données sont envoyées           | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                    | `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | `--telemetry-otlp-endpoint <URL>`                        | Point de terminaison du collecteur OTLP                                                                                                                        | URL string        | `http://localhost:4317` |
| `otlpProtocol`                    | `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | `--telemetry-otlp-protocol <grpc\|http>`                 | Protocole de transport OTLP                                                                                                                        | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`              | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`                | -                                                        | Remplacement de point de terminaison par signal pour les traces (HTTP uniquement)                                                                                            | URL string        | -                       |
| `otlpLogsEndpoint`                | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                  | -                                                        | Remplacement de point de terminaison par signal pour les logs (HTTP uniquement)                                                                                              | URL string        | -                       |
| `otlpMetricsEndpoint`             | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`               | -                                                        | Remplacement de point de terminaison par signal pour les métriques (HTTP uniquement)                                                                                           | URL string        | -                       |
| `outfile`                         | `QWEN_TELEMETRY_OUTFILE`                             | `--telemetry-outfile <path>`                             | Enregistrer la télémétrie dans un fichier (remplace l'exportation OTLP)                                                                                                 | file path         | -                       |
| `logPrompts`                      | `QWEN_TELEMETRY_LOG_PROMPTS`                         | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Inclure les prompts dans les logs de télémétrie                                                                                                              | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes`  | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | -                                                        | Inclure les prompts utilisateur, les prompts système, les E/S des outils et la sortie du modèle en tant qu'attributs de span natifs (en plus des spans du pont log-to-span)           | `true`/`false`    | `false`                 |
| `sensitiveSpanAttributeMaxLength` | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | -                                                        | Longueur maximale de chaîne JavaScript pour chaque charge utile de contenu d'attribut de span natif sensible. Définissez une valeur plus faible si votre backend rejette les attributs volumineux. | `1..104857600`    | `1048576`               |
| `resourceAttributes`              | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)   | -                                                        | Attributs de ressources statiques attachés à chaque span / log / métrique exporté(e). Voir [Attributs de ressources](#resource-attributes) ci-dessous.              | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`        | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`          | -                                                        | Inclure `session.id` sur les points de données métriques. **Désactivé par défaut** pour protéger les backends de métriques contre la prolifération des séries temporelles.                       | `true`/`false`    | `false`                 |

**Note sur les variables d'environnement booléennes :** Pour les paramètres booléens (`enabled`,
`logPrompts`, `includeSensitiveSpanAttributes`), définir la
variable d'environnement correspondante sur `true` ou `1` activera la fonctionnalité. Toute
autre valeur la désactivera.

**Note sur les variables d'environnement entières :** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH`
doit être un entier positif lorsqu'il est défini. Les valeurs invalides font échouer la résolution de la configuration de télémétrie
au lieu de revenir silencieusement à une valeur par défaut.

**Attributs de span sensibles :** Lorsque `includeSensitiveSpanAttributes` est activé,
deux choses se produisent :

1. **Attributs de span natifs (`qwen-code.interaction`, `api.generateContent*`,
   `tool.<name>`)** portent le contenu de la conversation textuellement :
   - Prompts utilisateur (`new_context`)
   - Prompts système (`system_prompt` — texte complet une fois par session, dédupliqué par
     hachage SHA-256 ; les spans suivants ne portent que `system_prompt_hash` +
     `system_prompt_preview` + `system_prompt_length`)
   - Schémas d'outils (émis en tant qu'événements `tool_schema`, également dédupliqués par hachage)
   - Entrées d'outils (`tool_input`) et résultats d'outils (`tool_result`)
   - Sortie du modèle (`response.model_output`)

   Chaque charge utile de contenu est tronquée à `sensitiveSpanAttributeMaxLength`
   unités de chaîne JavaScript. La valeur par défaut est de 1 Mio (`1048576`), augmentée par rapport à
   l'ancienne valeur par défaut de 60 Kio ; définissez `61440` pour conserver l'ancienne limite. La limite
   doit être comprise entre `1` et `104857600` (100 Mio). Pour les attributs étiquetés, les étiquettes fixes
   telles que `[USER PROMPT]`, `[TOOL INPUT: ...]` et
   `[TOOL RESULT: ...]` comptent dans la limite ; le marqueur de troncature compte également
   dans celle-ci. La limite est mesurée en longueur de chaîne JavaScript plutôt qu'en
   octets UTF-8. Le contenu non ASCII peut donc occuper plus d'octets après l'exportation OTLP.
   Pour la plupart des types de charge utile, la troncature ajoute à la fois `*_truncated` et
   `*_original_length`. Les prompts système définissent également `system_prompt_truncated` lorsqu'ils sont
   tronqués, mais utilisent `system_prompt_length`, toujours présent, pour la longueur
   d'origine.

2. **Les spans du pont log-to-span** (utilisés lorsque les traces HTTP sont exportées sans
   point de terminaison de logs) conservent leurs champs existants `prompt`, `function_args` et
   `response_text`, au lieu d'être supprimés.

⚠️ **Avertissement de sécurité :** l'activation de ce flag diffuse l'historique complet des conversations,
le contenu des fichiers lus par `read_file`, les commandes shell et leur sortie (y compris
les secrets dans les variables d'environnement ou les arguments), ainsi que les réponses du modèle vers le backend OTLP
configuré. Traitez le backend comme un récepteur de données privilégié. Le flag est défini sur
`false` par défaut.

**Coût / taille de la charge utile :** Un tour intensif avec la limite par défaut (prompt système de 1 Mio
plus 10 appels d'outils, chacun avec jusqu'à 1 Mio d'entrée + 1 Mio de résultat, plus 1 Mio de sortie du modèle)
peut produire jusqu'à ~22 Mio de charge utile d'attributs avant la compression OTLP,
plus jusqu'à 1 Mio par schéma d'outil émis dans les espaces de travail avec de grandes définitions d'outils.
Il s'agit de la limite côté application de Qwen Code, et non d'une garantie que
chaque collecteur ou backend accepte un attribut aussi volumineux. Si les spans sont
rejetés ou supprimés, réduisez `sensitiveSpanAttributeMaxLength` (par exemple, à
`61440`) et surveillez le débit de l'exportateur.

Ce paramètre ne désactive pas les données sensibles dans les logs OTel ou les autres récepteurs de télémétrie
; la télémétrie de réponse API non interne peut remplir `response_text`, de sorte que
les logs OTel, la télémétrie de l'interface utilisateur et l'enregistrement du chat peuvent recevoir le texte de réponse
indépendamment de ce paramètre. QwenLogger n'inclut pas `response_text`.

**Routage de signal OTLP HTTP :** Lors de l'utilisation du protocole HTTP (`otlpProtocol: "http"`),
Qwen Code ajoute automatiquement des chemins spécifiques au signal (`/v1/traces`, `/v1/logs`,
`/v1/metrics`) au `otlpEndpoint` de base. Par exemple, `http://collector:4318`
devient `http://collector:4318/v1/traces` pour les traces. Si l'URL se termine déjà
avec un chemin de signal, elle est utilisée telle quelle. Les remplacements de point de terminaison par signal
(`otlpTracesEndpoint`, etc.) sont prioritaires sur le point de terminaison de base et sont utilisés
textuellement. Le protocole gRPC utilise un routage basé sur le service et n'ajoute pas de chemins.

Les variables d'environnement de point de terminaison par signal acceptent également les noms
OpenTelemetry standard : `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`.
Les variantes `QWEN_TELEMETRY_OTLP_*` sont prioritaires sur les variantes `OTEL_*`.

Pour des informations détaillées sur toutes les options de configuration, consultez le
[Guide de configuration](../../users/configuration/settings.md).

### Attributs de ressources

Les attributs de ressources sont des paires clé-valeur statiques attachées à chaque span, log
et métrique exporté(e) via OTLP. Utilisez-les pour segmenter la télémétrie par équipe, environnement,
région de déploiement ou toute autre dimension pertinente pour votre backend.

Deux sources, fusionnées par ordre de priorité (le plus bas → le plus élevé) :

1. La variable d'environnement standard `OTEL_RESOURCE_ATTRIBUTES`
2. `telemetry.resourceAttributes` dans `.qwen/settings.json` (remplace la variable d'environnement en
   cas de conflit de clé)

`OTEL_SERVICE_NAME` est une échappatoire distincte — lorsqu'elle est définie, elle remplace
`service.name` de n'importe quelle autre source (conformément à la spécification OpenTelemetry).

#### Exemples

**Segmenter toute la télémétrie par équipe / environnement :**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**Router vers un collecteur par locataire via `service.name` :**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**Référence de la flotte (`~/.qwen/settings.json`) + remplacement par hôte :**

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
# Ajouter un tag ponctuel sans modifier les paramètres :
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### Clés réservées

Certaines clés sont contrôlées au moment de l'exécution et ne peuvent pas être remplacées :

- `service.version` — toujours défini sur la version CLI en cours d'exécution. Le définir depuis
  n'importe quelle source est silencieusement ignoré avec un avertissement.
- `session.id` — injecté au moment de l'exécution par session. Les valeurs fournies par l'utilisateur provenant de
  la variable d'environnement ou des paramètres sont ignorées avec un avertissement. La raison est que
  les attributs de ressources s'attachent automatiquement à chaque point de données métriques ; permettre le remplacement par l'utilisateur
  contournerait les [Contrôles de cardinalité](#cardinality-controls) ci-dessous.
  Les spans et les logs portent toujours `session.id`.

`service.name` n'est **pas** réservé ; il suit la chaîne de priorité ci-dessus.

#### Format

`OTEL_RESOURCE_ATTRIBUTES` suit la spécification OpenTelemetry :
`key1=value1,key2=value2` avec des valeurs encodées en pourcentage. Les espaces dans les valeurs doivent
être encodés en `%20`, **les virgules en `%2C`** (les virgules non encodées divisent la valeur à
la mauvaise limite et la seconde moitié est supprimée car mal formée). Les paires
mal formées sont ignorées avec un avertissement plutôt que de faire échouer le démarrage de la télémétrie.

#### Dépannage : lorsqu'un attribut fourni par l'utilisateur semble ne pas prendre effet

Les clés réservées (`service.version`, `session.id`), les paires mal formées, les valeurs de paramètres non string
et l'encodage en pourcentage invalide sont tous silencieusement ignorés avec un
avertissement consigné via le canal de diagnostic OpenTelemetry. Ce canal route
vers le fichier de log de débogage (`~/.qwen/log/otel-*.log`), **et non** la console, de sorte que le
comportement peut ressembler à un échec silencieux.

Si un attribut de ressource personnalisé n'apparaît pas sur la télémétrie exportée :

1. Vérifiez `~/.qwen/log/otel-*.log` pour les lignes correspondant à `cannot override` (clé réservée
   ignorée), `Skipping malformed` (paire de variable d'environnement incorrecte) ou `must be a string`
   (valeur de paramètre non string).
2. Vérifiez que la variable d'environnement est définie dans l'environnement du processus qwen-code (et pas seulement
   dans votre shell) et que les valeurs sont encodées en pourcentage.
3. Confirmez que `telemetry.enabled` est sur `true` — l'initialisation de la télémétrie ne s'exécute que si elle est activée.

### Contrôles de cardinalité

Les métriques sont agrégées par ensemble d'attributs au niveau du backend — chaque combinaison distincte
de valeurs d'attributs produit une nouvelle série temporelle. L'attachement d'un
champ à haute cardinalité comme `session.id` à une métrique provoque une prolifération des séries temporelles
proportionnelle au nombre de sessions, ce qui épuise rapidement le stockage du backend
de métriques.

Pour éviter cela, Qwen Code conserve par défaut les attributs à haute cardinalité en dehors des points de données
métriques. Les spans et les logs sont par événement et ne sont pas affectés, ils
continuent donc de porter `session.id` pour la corrélation des traces et des logs.

#### `telemetry.metrics.includeSessionId` (par défaut : `false`)

Définir ceci sur `true` (via les paramètres ou
`QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`) rattache `session.id` à
chaque point de données métriques.

⚠️ **Avertissement :** chaque session CLI crée une nouvelle valeur. Laisser cela activé pour une
flotte fera exploser le stockage des métriques. Recommandé uniquement pour le débogage à court terme.
Pour la corrélation de session à long terme, interrogez plutôt les backends de traces ou de logs.

#### Migration depuis les versions antérieures

Avant cette version, `session.id` était attaché aux métriques par défaut. Si
vos requêtes Prometheus / tableaux de bord Grafana / règles d'alerte font référence à
`session_id` sur une métrique, vous avez deux options :

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

**Option B (recommandé)** — déplacer l'analyse au niveau de la session hors des métriques. Les spans
et les logs portent toujours `session.id`, et les backends de traces / logs (Jaeger, Tempo,
Loki, Aliyun SLS / ARMS Tracing) gèrent nativement la segmentation par session sans
pression de cardinalité.

### Span HTTP côté client sur les fetch sortants

Lorsque la télémétrie est activée, Qwen Code enregistre `UndiciInstrumentation`
qui crée un span HTTP côté client pour chaque requête `fetch()`
sortante initiée par le processus — y compris les SDK LLM (`openai`,
`@google/genai`, `@anthropic-ai/sdk`), le client MCP StreamableHTTP, l'outil
`WebFetch` et tout appel hors processus d'extension IDE. Le span
vous permet de voir la latence réseau (TTFB / transfert du corps de la réponse) séparément
du temps de traitement du modèle en amont, ce que le span
`api.generateContent` existant seul ne peut pas distinguer.

Ces spans vont vers **votre propre** collecteur OTLP (ou fichier de sortie) comme
le reste de la télémétrie — ils n'affectent pas ce qui est écrit sur la
requête HTTP sortante elle-même. Le fait que l'en-tête W3C `traceparent` soit
également écrit dans le flux de requête sortant est contrôlé par un
**paramètre distinct et pertinent pour la sécurité** documenté dans
[corrélation sortante](#outbound-correlation-security-relevant) ci-dessous.

**Évitement des boucles de rétroaction.** Le SDK OTel utilise `fetch` en interne pour télécharger les données OTLP.
Sans protection, l'instrumentation de `fetch` tracerait ces téléchargements,
qui seraient eux-mêmes téléchargés, provoquant une boucle infinie. L'instrumentation
undici de Qwen Code est configurée avec un `ignoreRequestHook` qui ignore
les URL correspondant aux préfixes configurés `telemetry.otlpEndpoint` /
`telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` /
`telemetry.otlpMetricsEndpoint`. En mode fichier de sortie, il n'y a pas de
téléchargements HTTP sortants, donc le hook est inopérant.

## Corrélation sortante (PERTINENT POUR LA SÉCURITÉ)

Ces paramètres vivent dans un **namespace de niveau supérieur distinct** de `telemetry.*`
à dessein : la télémétrie contrôle le flux de données vers le propre backend d'observabilité
de l'opérateur, tandis que `outboundCorrelation.*` contrôle les
données de corrélation côté client que qwen-code écrit **dans les flux de requêtes API LLM
sortants** qui atteignent les points de terminaison des fournisseurs LLM tiers
(DashScope, OpenAI, Anthropic, etc.). Destinataires différents, décision de consentement différente.
**Toutes les valeurs sont désactivées par défaut.** Consultez la discussion de révision de la PR #4390
pour la justification du cadrage.
### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // default
}
```

Lorsque la valeur est `false` (par défaut), Qwen Code installe un `TextMapPropagator` no-op sur le SDK OTel. `UndiciInstrumentation` crée toujours des spans HTTP client pour votre collecteur OTLP, mais `propagation.inject()` est un no-op, donc **aucun `traceparent` n'est écrit sur les requêtes sortantes**. Les Trace IDs restent internes au collecteur de l'opérateur.

Lorsque la valeur est `true`, le propagateur composite W3C par défaut du SDK (`tracecontext` + `baggage`) est installé et l'en-tête standard `traceparent` est écrit sur chaque `fetch` sortant :

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

De plus, les variables d'environnement `TRACEPARENT` et `TRACESTATE` sont définies dans les processus enfants du shell (outil Bash, hooks, monitor) afin que les commandes lancées puissent participer à la même trace distribuée.

N'activez cette option que si le fournisseur LLM envoie également des données à votre collecteur OTel pour le raboutement de traces inter-processus — par exemple, ARMS Tracing pour DashScope. Pour la plupart des opérateurs, la valeur est `false` ; la continuation de traces entre différents fournisseurs est un cas d'usage de niche.

**Dépend de `telemetry.enabled: true`.** Le SDK OTel ne s'initialise que lorsque la télémétrie est activée, donc `propagateTraceContext` ne prend effet que dans cet état. Le définir sur `true` alors que la télémétrie est désactivée est un no-op silencieux — pas de SDK, pas de propagateur, pas de `traceparent` sur le réseau. Vérifiez les deux indicateurs lors de la configuration d'une corrélation ARMS+DashScope :

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

`X-Qwen-Code-Session-Id` et `X-Qwen-Code-Request-Id` ne font **pas partie de cette PR**. Ils seront conçus et proposés dans leur(s) propre(s) PR de suivi sous le même namespace `outboundCorrelation.*`, chacun avec son propre modèle de menace et son flux de consentement de l'opérateur. La revue de la PR #4390 (LaZzyMan) a établi le principe suivant : "le périmètre de la télémétrie n'inclut pas l'envoi d'identifiants aux fournisseurs LLM" ; le travail sur les en-têtes de corrélation fait l'objet de sa propre discussion de conception plutôt que d'être intégré à la télémétrie.

## Télémétrie Aliyun

### Export OTLP manuel

Pour afficher la télémétrie de Qwen Code dans Alibaba Cloud Managed Service for OpenTelemetry, configurez Qwen Code pour exporter vers le point de terminaison OTLP fourni par ARMS.

Définir uniquement `"target": "gcp"` ne configure pas la destination d'exportation. Si `otlpEndpoint` n'est pas défini, Qwen Code utilise toujours `http://localhost:4317` par défaut. Si `outfile` est défini, il remplace `otlpEndpoint` et la télémétrie est écrite dans le fichier au lieu d'être envoyée à Alibaba Cloud.

1. Activez la télémétrie dans votre `.qwen/settings.json` et définissez le point de terminaison OTLP :

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

   **Option B : protocole HTTP avec des points de terminaison par signal** (pour les backends qui utilisent des chemins non standard, par exemple `/api/otlp/traces` au lieu de `/v1/traces`) :

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

   > **Note :** Lors de l'utilisation du protocole HTTP avec uniquement `otlpEndpoint` (sans remplacement par signal), Qwen Code ajoute les chemins OTLP standard (`/v1/traces`, `/v1/logs`, `/v1/metrics`) à l'URL de base. Si votre backend utilise des chemins différents, utilisez les remplacements de points de terminaison par signal comme indiqué dans l'Option B.

2. Si votre point de terminaison Alibaba Cloud nécessite une authentification, fournissez les en-têtes OTLP via les variables d'environnement OpenTelemetry standard telles que `OTEL_EXPORTER_OTLP_HEADERS` (ou les variantes spécifiques au signal). Qwen Code n'expose actuellement pas les en-têtes d'authentification OTLP directement dans `.qwen/settings.json`.
3. Lancez Qwen Code et envoyez des prompts.
4. Affichez la télémétrie dans Managed Service for OpenTelemetry :
   - Présentation du produit :
     [What is Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - Premiers pas :
     [Get started with Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Points d'entrée de la console :
     - Chine continentale :
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (ancienne console :
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - International :
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - Dans la console, utilisez `Applications` pour inspecter les traces et la topologie des services.
   - Pour localiser le point de terminaison OTLP et les informations d'accès :
     - **Nouvelle console** (`trace.console.aliyun.com` ou international) :
       accédez à `Integration Center`.
     - **Ancienne console** (`tracing.console.aliyun.com`) : accédez à
       `Cluster Configurations` → `Access point information`.

## Télémétrie locale

Pour le développement local et le débogage, vous pouvez capturer les données de télémétrie localement :

### Sortie basée sur un fichier (Recommandé)

1. Activez la télémétrie dans votre `.qwen/settings.json` :

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Note :** Lorsque `outfile` est défini, l'exportation OTLP est automatiquement désactivée.
   > Les paramètres `target` et `otlpEndpoint` ne sont pas nécessaires pour une sortie uniquement vers un fichier et peuvent être omis en toute sécurité de votre configuration.

2. Lancez Qwen Code et envoyez des prompts.
3. Affichez les logs et les métriques dans le fichier spécifié (par exemple, `.qwen/telemetry.log`).

### Exportation basée sur un collecteur (Avancé)

1. Exécutez le script d'automatisation :
   ```bash
   npm run telemetry -- --target=local
   ```
   Cela va :
   - Télécharger et démarrer Jaeger et le collecteur OTEL
   - Configurer votre espace de travail pour la télémétrie locale
   - Fournir une interface Jaeger UI à http://localhost:16686
   - Enregistrer les logs/métriques dans `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Arrêter le collecteur à la sortie (par exemple, `Ctrl+C`)
2. Lancez Qwen Code et envoyez des prompts.
3. Affichez les traces sur http://localhost:16686 et les logs/métriques dans le fichier de log du collecteur.

## Logs et métriques

La section suivante décrit la structure des logs, des métriques et des spans générés pour Qwen Code.

- Un `sessionId` est inclus en tant qu'attribut commun sur tous les logs et métriques.

### Logs

Les logs sont des enregistrements horodatés d'événements spécifiques. Tous les enregistrements de log incluent automatiquement les attributs `event.name` et `event.timestamp`.

Les événements suivants sont enregistrés :

#### Événements de session principaux

- `qwen-code.config` : Émis une fois au démarrage avec la configuration de la CLI.
  - **Attributs** : `model`, `sandbox_enabled`, `core_tools_enabled`, `approval_mode`, `file_filtering_respect_git_ignore`, `debug_mode`, `truncate_tool_output_threshold`, `truncate_tool_output_lines`, `hooks` (séparés par des virgules, omis si désactivés), `ide_enabled`, `interactive_shell_enabled`, `mcp_servers`, `mcp_servers_count`, `mcp_tools`, `mcp_tools_count`, `output_format`, `skills`, `subagents`

- `qwen-code.user_prompt` : L'utilisateur soumet un prompt.
  - **Attributs** : `prompt_length` (int), `prompt_id` (string), `prompt` (string, exclu si `log_prompts_enabled` est false), `auth_type` (string)

- `qwen-code.user_retry` : L'utilisateur réessaie le dernier prompt.
  - **Attributs** : `prompt_id` (string)

- `qwen-code.conversation_finished` : Une séquence de tours de conversation se termine.
  - **Attributs** : `approvalMode` (string), `turnCount` (int)

- `qwen-code.user_feedback` : L'utilisateur soumet un retour sur la session.
  - **Attributs** : `session_id` (string), `rating` (int : 1=mauvais, 2=correct, 3=bon), `model` (string), `approval_mode` (string), `prompt_id` (string, optionnel)

#### Événements d'outils

- `qwen-code.tool_call` : Chaque appel de fonction/outil.
  - **Attributs** : `function_name` (string), `function_args` (object), `duration_ms` (int), `status` (string : "success", "error", ou "cancelled"), `success` (boolean), `decision` (string : "accept", "reject", "auto_accept", ou "modify", optionnel), `error` (string, optionnel), `error_type` (string, optionnel), `prompt_id` (string), `response_id` (string, optionnel), `content_length` (int, optionnel), `tool_type` (string : "native" ou "mcp"), `mcp_server_name` (string, optionnel), `metadata` (object, optionnel — pour les outils d'écriture de fichiers, contient `model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`, `model_added_chars`, `model_removed_chars`, `user_added_chars`, `user_removed_chars`)

- `qwen-code.file_operation` : Chaque opération sur un fichier.
  - **Attributs** : `tool_name` (string), `operation` (string : "create", "read", "update"), `lines` (int, optionnel), `mimetype` (string, optionnel), `extension` (string, optionnel), `programming_language` (string, optionnel)

- `qwen-code.tool_output_truncated` : La sortie de l'outil a dépassé le seuil de taille.
  - **Attributs** : `tool_name` (string), `original_content_length` (int), `truncated_content_length` (int), `threshold` (int), `lines` (int), `prompt_id` (string)

#### Événements d'API

- `qwen-code.api_request` : Requête sortante vers l'API LLM.
  - **Attributs** : `model` (string), `prompt_id` (string), `request_text` (string, optionnel), `subagent_name` (string, optionnel)

- `qwen-code.api_response` : Réponse reçue de l'API LLM.
  - **Attributs** : `response_id` (string), `model` (string), `status_code` (int/string, optionnel), `duration_ms` (int), `input_token_count` (int), `output_token_count` (int), `cached_content_token_count` (int), `thoughts_token_count` (int), `total_token_count` (int), `prompt_id` (string), `auth_type` (string, optionnel), `response_text` (string, optionnel), `subagent_name` (string, optionnel)

- `qwen-code.api_error` : Échec de la requête API.
  - **Attributs** : `model` (string), `prompt_id` (string), `duration_ms` (int), `error_message` (string), `response_id` (string, optionnel), `auth_type` (string, optionnel), `error_type` (string, optionnel), `status_code` (int/string, optionnel), `subagent_name` (string, optionnel)

  De plus, des alias standard OTel (`http.status_code`, `error.message`, `model_name`, `duration`) sont émis pour la compatibilité.

- `qwen-code.api_cancel` : Requête API annulée par l'utilisateur.
  - **Attributs** : `model` (string), `prompt_id` (string), `auth_type` (string, optionnel), `loop_wakeups_cancelled` (int, optionnel)

- `qwen-code.api_retry` : Nouvelle tentative suite à un statut HTTP (429/5xx) sur un site d'appel LLM. Distinct de `chat.content_retry` qui gère les nouvelles tentatives `InvalidStreamError` sur un budget séparé.
  - **Attributs** : `model` (string), `prompt_id` (string, optionnel), `attempt_number` (int), `error_type` (string, optionnel), `error_message` (string), `status_code` (int/string, optionnel), `retry_delay_ms` (int), `duration_ms` (int, égal à retry_delay_ms — temps de sommeil du backoff, pas d'aller-retour HTTP ; pour la durée de la tentative, voir le span qwen-code.llm_request), `subagent_name` (string, optionnel)

- `qwen-code.malformed_json_response` : La réponse `generateJson` n'a pas pu être analysée.
  - **Attributs** : `model` (string)

- `qwen-code.flash_fallback` : Basculement vers le modèle flash en solution de repli.
  - **Attributs** : `auth_type` (string)

- `qwen-code.ripgrep_fallback` : Basculement vers grep en solution de repli.
  - **Attributs** : `use_ripgrep` (boolean), `use_builtin_ripgrep` (boolean), `error` (string, optionnel)

#### Événements de résilience

- `qwen-code.chat.content_retry` : Nouvelle tentative suite à une erreur de contenu (par exemple, flux vide).
  - **Attributs** : `attempt_number` (int), `error_type` (string), `retry_delay_ms` (int), `model` (string)

- `qwen-code.chat.content_retry_failure` : Toutes les nouvelles tentatives de contenu sont épuisées.
  - **Attributs** : `total_attempts` (int), `final_error_type` (string), `total_duration_ms` (int, optionnel), `model` (string)

- `qwen-code.chat.invalid_chunk` : Chunk invalide reçu du flux.
  - **Attributs** : `error.message` (string, optionnel)

#### Événements de commande et d'extension

- `qwen-code.slash_command` : L'utilisateur exécute une commande slash.
  - **Attributs** : `command` (string), `subcommand` (string, optionnel), `status` (string : "success" ou "error", optionnel)

- `qwen-code.slash_command.model` : L'utilisateur change de modèle via la commande `/model`.
  - **Attributs** : `model_name` (string)

- `qwen-code.skill_launch` : Un skill est lancé.
  - **Attributs** : `skill_name` (string), `success` (boolean), `prompt_id` (string)

- `qwen-code.extension_install` : Extension installée.
  - **Attributs** : `extension_name` (string), `extension_version` (string), `extension_source` (string), `status` (string : "success"/"error")

- `qwen-code.extension_uninstall` : Extension désinstallée.
  - **Attributs** : `extension_name` (string), `status` (string)

- `qwen-code.extension_enable` : Extension activée.
  - **Attributs** : `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_disable` : Extension désactivée.
  - **Attributs** : `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_update` : Extension mise à jour.
  - **Attributs** : `extension_name` (string), `extension_id` (string), `extension_previous_version` (string), `extension_version` (string), `extension_source` (string), `status` (string : "success"/"error")

- `qwen-code.ide_connection` : Événement de connexion à l'IDE.
  - **Attributs** : `connection_type` (string : "start" ou "session")

- `qwen-code.auth` : Événement d'authentification.
  - **Attributs** : `auth_type` (string), `action_type` ("auto", "manual", "coding-plan"), `status` ("success", "error", "cancelled"), `error_message` (optionnel)

#### Événements de sous-agent

- `qwen-code.subagent_execution` : Événement du cycle de vie du sous-agent.
  - **Attributs** : `subagent_name` (string), `status` ("started", "completed", "failed", "cancelled"), `terminate_reason` (optionnel), `result` (optionnel), `execution_summary` (optionnel)

#### Événements d'Arena

- `qwen-code.arena_session_started` : La session Arena commence.
  - **Attributs** : `arena_session_id` (string), `model_ids` (tableau de strings JSON), `task_length` (int)

- `qwen-code.arena_agent_completed` : Un agent Arena se termine.
  - **Attributs** : `arena_session_id` (string), `agent_session_id` (string), `agent_model_id` (string), `status` (string : "completed"/"failed"/"cancelled"), `duration_ms` (int), `rounds` (int), `total_tokens` (int), `input_tokens` (int), `output_tokens` (int), `tool_calls` (int), `successful_tool_calls` (int), `failed_tool_calls` (int)

- `qwen-code.arena_session_ended` : La session Arena se termine.
  - **Attributs** : `arena_session_id` (string), `status` (string : "selected"/"discarded"/"failed"/"cancelled"), `duration_ms` (int), `display_backend` (string, optionnel), `agent_count` (int), `completed_agents` (int), `failed_agents` (int), `cancelled_agents` (int), `winner_model_id` (string, optionnel)

#### Événements de workflow

- `qwen-code.workflow_keyword` : Le déclencheur de mot-clé de workflow est activé.

- `qwen-code.workflow_run` : L'exécution du workflow a atteint un état terminal.
  - **Attributs** : `status` (string), `agents_dispatched` (int), `agents_completed` (int), `phase_count` (int), `tokens_spent` (int), `duration_ms` (int)

#### Événements d'Auto-Memory

- `qwen-code.memory.extract` : L'exécution de l'extraction de mémoire est terminée.
  - **Attributs** : `trigger` ("auto"/"manual"), `status` ("completed"/"skipped"/"failed"), `skipped_reason` (optionnel), `patches_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.dream` : L'exécution de la consolidation de mémoire (dream) est terminée.
  - **Attributs** : `trigger` ("auto"/"manual"), `status` ("updated"/"noop"/"failed"/"cancelled"), `deduped_entries` (int), `touched_topics_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.recall` : L'opération de rappel de mémoire est terminée.
  - **Attributs** : `query_length` (int), `docs_scanned` (int), `docs_selected` (int), `strategy` ("none"/"heuristic"/"model"), `duration_ms` (int)

#### Événements de suggestion de prompt et de spéculation

- `qwen-code.prompt_suggestion` : Résultat de la suggestion de prompt.
  - **Attributs** : `outcome` ("accepted"/"ignored"/"suppressed"), `prompt_id` (optionnel), `accept_method` ("tab"/"enter"/"right", optionnel), `accept_source` ("live"/"fallback", optionnel), `time_to_accept_ms` (optionnel), `time_to_ignore_ms` (optionnel), `time_to_first_keystroke_ms` (optionnel), `suggestion_length` (optionnel), `similarity` (optionnel), `was_focused_when_shown` (optionnel), `reason` (optionnel)

- `qwen-code.speculation` : Résultat de l'exécution spéculative.
  - **Attributs** : `outcome` ("accepted"/"aborted"/"failed"), `turns_used` (int), `files_written` (int), `tool_use_count` (int), `duration_ms` (int), `boundary_type` (optionnel), `had_pipelined_suggestion` (boolean)

#### Autres événements

- `qwen-code.chat_compression` : Le contexte du chat est compressé.
  - **Attributs** : `tokens_before` (int), `tokens_after` (int), `compression_input_token_count` (int, optionnel), `compression_output_token_count` (int, optionnel)

- `qwen-code.next_speaker_check` : Détermination du prochain intervenant.
  - **Attributs** : `prompt_id` (string), `finish_reason` (string), `result` (string)

- `loop_detected` : Boucle détectée lors de l'exécution de l'agent. _(Note : émis sans le préfixe `qwen-code.` — incohérence préexistante.)_
  - **Attributs** : `loop_type` (string), `prompt_id` (string)

- `kitty_sequence_overflow` : La séquence du protocole graphique Kitty a dépassé la taille du tampon. _(Note : émis sans le préfixe `qwen-code.` — incohérence préexistante.)_
  - **Attributs** : `sequence_length` (int), `truncated_sequence` (string, 20 premiers caractères)

### Métriques

Les métriques sont des mesures numériques du comportement dans le temps. Les noms des métriques utilisent le préfixe `qwen-code.*`.

#### Métriques principales

- `qwen-code.session.count` (Counter, Int) : Incrémenté une fois à chaque démarrage de la CLI.

- `qwen-code.tool.call.count` (Counter, Int) : Compte les appels d'outils.
  - **Attributs** : `function_name`, `success` (boolean), `decision` ("accept"/"reject"/"auto_accept"/"modify", optionnel), `tool_type` ("mcp"/"native", optionnel)

- `qwen-code.tool.call.latency` (Histogram, ms) : Mesure la latence des appels d'outils.
  - **Attributs** : `function_name` (string)

- `qwen-code.api.request.count` (Counter, Int) : Compte toutes les requêtes API.
  - **Attributs** : `model`, `status_code`, `error_type` (optionnel)

- `qwen-code.api.request.latency` (Histogram, ms) : Mesure la latence des requêtes API.
  - **Attributs** : `model` (string)

- `qwen-code.token.usage` (Counter, Int) : Compte les tokens utilisés.
  - **Attributs** : `model`, `type` ("input"/"output"/"thought"/"cache")

- `qwen-code.file.operation.count` (Counter, Int) : Compte les opérations sur les fichiers.
  - **Attributs** : `operation` ("create"/"read"/"update"), `lines` (optionnel), `mimetype` (optionnel), `extension` (optionnel), `programming_language` (optionnel)

- `qwen-code.chat_compression` (Counter, Int) : Compte les opérations de compression du chat.
  - **Attributs** : `tokens_before` (int), `tokens_after` (int)

- `qwen-code.slash_command.model.call_count` (Counter, Int) : Compte les appels de la commande slash de modèle.
  - **Attributs** : `slash_command.model.model_name` (string)

- `qwen-code.subagent.execution.count` (Counter, Int) : Compte les événements d'exécution des sous-agents.
  - **Attributs** : `subagent_name`, `status` ("started"/"completed"/"failed"/"cancelled"), `terminate_reason` (optionnel)

#### Métriques de résilience

- `qwen-code.api.retry.count` (Counter, Int) : Nouvelles tentatives suite à un statut HTTP (429/5xx) sur les sites d'appel LLM.
  - **Attributs** : `model` (string)

- `qwen-code.chat.content_retry.count` (Counter, Int) : Nouvelles tentatives dues à des erreurs de contenu.

- `qwen-code.chat.content_retry_failure.count` (Counter, Int) : Toutes les nouvelles tentatives de contenu sont épuisées.

- `qwen-code.chat.invalid_chunk.count` (Counter, Int) : Chunks invalides provenant du flux.

#### Métriques d'Arena

- `qwen-code.arena.session.count` (Counter, Int) : Sessions Arena par statut.
  - **Attributs** : `status`, `display_backend` (optionnel)
- `qwen-code.arena.session.duration` (Histogram, ms) : Durée de la session Arena.
  - **Attributs** : `status`

- `qwen-code.arena.agent.count` (Counter, Int) : Nombre de complétions de l'agent Arena.
  - **Attributs** : `status`, `model_id`

- `qwen-code.arena.agent.duration` (Histogram, ms) : Durée d'exécution de l'agent Arena.
  - **Attributs** : `model_id`

- `qwen-code.arena.agent.tokens` (Counter, Int) : Utilisation des tokens par les agents Arena.
  - **Attributs** : `model_id`, `type` ("input"/"output")

- `qwen-code.arena.result.selected` (Counter, Int) : Sélections de résultats Arena.
  - **Attributs** : `model_id`

#### Métriques Auto-Memory

- `qwen-code.memory.extract.count` (Counter, Int) : Nombre d'exécutions d'extraction de l'auto-memory.
  - **Attributs** : `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.extract.duration` (Histogram, ms) : Durée de l'extraction.
  - **Attributs** : `trigger`, `status`

- `qwen-code.memory.dream.count` (Counter, Int) : Nombre d'exécutions dream de l'auto-memory.
  - **Attributs** : `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.dream.duration` (Histogram, ms) : Durée d'exécution dream.
  - **Attributs** : `trigger`, `status`

- `qwen-code.memory.recall.count` (Counter, Int) : Opérations de rappel de l'auto-memory.
  - **Attributs** : `strategy` ("none"/"heuristic"/"model")

- `qwen-code.memory.recall.duration` (Histogram, ms) : Durée du rappel.
  - **Attributs** : `strategy`

#### Répartition des requêtes API

- `qwen-code.api.request.breakdown` (Histogram, ms) : Répartition du temps des requêtes API par phase.
  - **Attributs** : `model`, `phase` ("request_preparation"/"network_latency"/"response_processing"/"token_processing")

### Métriques du Daemon

Le processus daemon (mode serveur HTTP à exécution longue) expose ses propres métriques.

> **Note :** Les trois Observable Gauges (`daemon.session.active`, `daemon.sse.active`, `daemon.process.heap_used`) sont des métriques basées sur des callbacks mises à jour à chaque intervalle de collecte ; `registerDaemonGaugeCallbacks()` doit être invoqué lors de l'initialisation du daemon pour enregistrer les callbacks d'observation.

#### HTTP

- `qwen-code.daemon.http.request.count` (Counter, Int) : Nombre de requêtes par route et classe de statut.
  - **Attributs** : `route`, `status_class` ("2xx"/"4xx"/"5xx")

- `qwen-code.daemon.http.request.duration` (Histogram, ms) : Durée de la requête.
  - **Attributs** : `route`
  - **Intervalles** : 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000

#### Sessions

- `qwen-code.daemon.session.active` (ObservableGauge, Int) : Sessions actives actuelles.

- `qwen-code.daemon.session.lifecycle` (Counter, Int) : Événements du cycle de vie des sessions.
  - **Attributs** : `action` ("spawn"/"close"/"die")

#### Canaux

- `qwen-code.daemon.channel.lifecycle` (Counter, Int) : Événements du cycle de vie des canaux ACP.
  - **Attributs** : `action` ("spawn"/"exit"), `expected` (booléen, optionnel)

#### Prompts

- `qwen-code.daemon.prompt.queue_wait` (Histogram, ms) : Temps d'attente dans la file FIFO des prompts.
  - **Intervalles** : 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000

- `qwen-code.daemon.prompt.duration` (Histogram, ms) : Durée de bout en bout du prompt.
  - **Intervalles** : 100, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000, 600000

#### Erreurs

- `qwen-code.daemon.bridge.error.count` (Counter, Int) : Erreurs de bridge par type.
  - **Attributs** : `error_type` (nom de classe connu ou "unknown")

- `qwen-code.daemon.cancel.count` (Counter, Int) : Nombre de requêtes d'annulation.

#### Ressources

- `qwen-code.daemon.sse.active` (ObservableGauge, Int) : Connexions SSE actives.

- `qwen-code.daemon.process.heap_used` (ObservableGauge, Int, bytes) : Utilisation de la mémoire heap.

### Spans

Les spans de traçage distribué forment un arbre enraciné à `qwen-code.interaction`. Chaque interaction est une racine de trace avec son propre `traceId` ; la corrélation inter-prompts utilise l'attribut `session.id`.

- `qwen-code.interaction` : Span racine pour chaque tour de prompt utilisateur.
  - **Attributs** : `session.id`, `qwen-code.prompt_id`, `qwen-code.message_type`, `qwen-code.model`, `qwen-code.approval_mode`, `interaction.sequence`, `interaction.duration_ms`, `qwen-code.turn_status` ("ok"/"error"/"cancelled")

- `qwen-code.llm_request` : Encapsule un seul appel API LLM.
  - **Attributs** : `session.id`, `qwen-code.model`, `qwen-code.prompt_id`, `llm_request.context` ("subagent"/"interaction"/"standalone"), `gen_ai.request.model`, `duration_ms`, `input_tokens`, `output_tokens`, `cached_input_tokens`, `ttft_ms`, `request_setup_ms`, `attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`, `success`, `error`, `response_id`, `finish_reason`, `thoughts_token_count`, `subagent_name`, `error_type`, `error_status_code`

- `qwen-code.tool` : Encapsule le cycle de vie complet de l'outil (attente d'approbation + exécution).
  - **Attributs** : `session.id`, `tool.name`, `duration_ms`, `success`, `error`

- `qwen-code.tool.execution` : Encapsule la phase d'exécution de l'outil (après approbation).
  - **Attributs** : `session.id`, `duration_ms`, `success`, `error`

- `qwen-code.tool.blocked_on_user` : Temps qu'un outil passe à attendre l'approbation de l'utilisateur.
  - **Attributs** : `session.id`, `tool.name`, `tool.call_id`, `duration_ms`, `decision` ("proceed_once"/"proceed_always"/"cancel"/"aborted"/"auto_approved"/"error"), `source` ("cli"/"ide"/"hook"/"auto"/"system")

- `qwen-code.hook` : Encapsule chaque site de déclenchement de hook pre/post-utilisation d'outil.
  - **Attributs** : `session.id`, `hook_event` ("PreToolUse"/"PostToolUse"/"PostToolUseFailure"/"PostToolBatch"), `tool.name`, `tool.use_id` (optionnel), `is_interrupt` (booléen, optionnel), `duration_ms`, `success`, `should_proceed` (optionnel), `should_stop` (optionnel), `block_type` (optionnel), `error` (optionnel)

- `qwen-code.subagent` : Encapsule une seule invocation de sous-agent.
  - **Attributs** : `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`, `qwen-code.subagent.id`, `qwen-code.subagent.name`, `qwen-code.subagent.invocation_kind` ("foreground"/"fork"/"background"), `qwen-code.subagent.is_built_in`, `qwen-code.subagent.depth`, `qwen-code.subagent.status`, `qwen-code.subagent.terminate_reason`, `qwen-code.subagent.duration_ms`

- `qwen-code.daemon.request` : Encapsule une requête HTTP du daemon.
  - **Attributs** : `http.request.method`, `http.route`, `qwen-code.daemon.operation`, `session.id`, `http.response.status_code`

- `qwen-code.daemon.bridge` : Encapsule les opérations de bridge du daemon.
  - **Attributs** : `qwen-code.daemon.operation`

#### Métriques de Ressources

- `qwen-code.memory.usage` (Histogram, bytes) : Utilisation de la mémoire. Enregistré par le moniteur de pression mémoire lorsque la télémétrie est activée.
  - **Attributs** : `memory_type` (string : "heap_used"/"rss")

- `qwen-code.cpu.usage` (Histogram, percent) : Pourcentage d'utilisation du CPU. Enregistré par le moniteur de pression mémoire lorsque la télémétrie est activée.
  - **Attributs** : (aucun)

### Surveillance des Performances (Réservé)

Les métriques suivantes sont définies mais **pas encore activées en production**. Elles seront activées via un flag de configuration dédié à la surveillance des performances.

- `qwen-code.startup.duration` (Histogram, ms) : Temps de démarrage de la CLI par phase.
  - **Attributs** : `phase` (string)

- `qwen-code.tool.queue.depth` (Histogram, count) : Outils dans la file d'exécution.

- `qwen-code.tool.execution.breakdown` (Histogram, ms) : Temps d'exécution de l'outil par phase.
  - **Attributs** : `function_name`, `phase` ("validation"/"preparation"/"execution"/"result_processing")

- `qwen-code.token.efficiency` (Histogram, ratio) : Métriques d'efficacité des tokens.
  - **Attributs** : `model`, `metric`, `context` (optionnel)

- `qwen-code.performance.score` (Histogram, score) : Score de performance composite (0-100).
  - **Attributs** : `category`, `baseline` (optionnel)

- `qwen-code.performance.regression` (Counter, Int) : Événements de détection de régression.
  - **Attributs** : `metric`, `severity` ("low"/"medium"/"high"), `current_value`, `baseline_value`

- `qwen-code.performance.regression.percentage_change` (Histogram, percent) : Variation en pourcentage par rapport à la baseline.
  - **Attributs** : `metric`, `severity`, `current_value`, `baseline_value`

- `qwen-code.performance.baseline.comparison` (Histogram, percent) : Performance par rapport à la baseline.
  - **Attributs** : `metric`, `category`, `current_value`, `baseline_value`
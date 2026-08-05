# Alignement des champs GenAI et ARMS

## Périmètre et base des standards

Ce design aligne le premier ensemble d'attributs de span Qwen Code dont les
noms, types et significations concordent entre les conventions sémantiques
OpenTelemetry GenAI et ARMS LLM Trace d'Alibaba Cloud. Il ne modifie ni les
noms de span, ni les types de span, ni le rattachement parent, ni la
topologie de retry.
Il documente aussi l'extension d'identité d'utilisateur final opt-in propre à
ARMS.

La convention OpenTelemetry GenAI est encore au statut Development. Ce
changement est épinglé au commit
[`2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b`](https://github.com/open-telemetry/semantic-conventions-genai/tree/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b) :

- [Spans d'inférence](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-spans.md)
- [Spans d'agent](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-agent-spans.md)
- [Registre GenAI](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/model/gen-ai/registry.yaml)

Les attributs de streaming sont un complément restreint épinglé à
[OpenTelemetry Semantic Conventions v1.41.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.41.0/docs/gen-ai/gen-ai-spans.md).
Ce complément adopte uniquement `gen_ai.request.stream` et
`gen_ai.response.time_to_first_chunk` ; il ne s'agit pas d'une mise à niveau
complète de la base ci-dessus.

La base ARMS est [LLM Trace field definitions](https://help.aliyun.com/zh/arms/application-monitoring/developer-reference/llm-trace-field-definition-description).
Une mise à niveau de l'une ou l'autre base exige de régénérer et revoir cette
matrice.

## Contrat de champs

| Span | Attributs standard émis dans cette phase | Source et règle d'omission |
| ---- | ---------------------------------------- | -------------------------- |
| LLM | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.conversation.id`, `gen_ai.request.model` | Écrits à la création du span. L'ID de conversation est l'ID de session existant. |
| LLM request | `gen_ai.request.choice.count`, `gen_ai.request.max_tokens`, `gen_ai.request.temperature`, `gen_ai.request.top_p`, `gen_ai.request.frequency_penalty`, `gen_ai.request.presence_penalty`, `gen_ai.request.stop_sequences` | Lus depuis le premier objet de requête SDK final côté provider. Les valeurs invalides ou indisponibles sont omises ; aucune valeur par défaut du SDK ou du serveur n'est déduite. |
| LLM stream | `gen_ai.request.stream`, `gen_ai.response.time_to_first_chunk` | Les requêtes en streaming émettent `true` ; les requêtes hors streaming omettent le flag de stream standard. Le délai du premier chunk est émis en secondes après l'arrivée de la première réponse normalisée. |
| LLM input | `gen_ai.input.messages`, `gen_ai.system_instructions`, `gen_ai.tool.definitions` | JSON compact sensible depuis la même première requête finale côté provider. Chaque valeur complète est omise indépendamment si elle est invalide ou trop volumineuse. |
| LLM response | `gen_ai.response.id`, `gen_ai.response.model`, `gen_ai.response.finish_reasons` | Données de réponse du provider uniquement. Un modèle de réponse manquant est omis plutôt que remplacé par le modèle de la requête. Toutes les raisons de fin candidates sont ordonnées par index de candidat. |
| LLM output | `gen_ai.output.type`, `gen_ai.output.messages` | Le type de sortie est émis pour les réglages de requête Gemini/Vertex pris en charge. Les messages de sortie sensibles proviennent de la dernière tentative de requête physique et préservent chaque candidat. |
| LLM usage | `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens` | Uniquement des entiers sûrs non négatifs rapportés par le provider. Un zéro explicite est conservé. Quand seul un total est rapporté, l'entrée/sortie est omise plutôt qu'estimée. |
| Tool | `gen_ai.operation.name=execute_tool`, `gen_ai.tool.name`, `gen_ai.tool.description`, `gen_ai.tool.type=function`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result` | La description est une métadonnée statique non sensible du registre. Les arguments sensibles reflètent l'invocation exécutée ; le résultat n'est émis que pour un appel d'outil réussi. |
| Agent | `gen_ai.operation.name=invoke_agent`, `gen_ai.agent.name`, `gen_ai.agent.description`, `gen_ai.conversation.id`, `gen_ai.request.model` optionnel | La description utilise le seuil de troncature existant de 1024 unités de code UTF-16 et ne coupe jamais les paires de substitution. Les ID d'invocation internes restent privés. |

Les attributs privés sans équivalent standard exact restent disponibles pour
la compatibilité, sauf s'ils sont explicitement listés pour suppression
ci-dessous. Les alias privés à équivalence exacte et les alias GenAI invalides
sont supprimés sans période de double écriture :

| Attribut supprimé | Remplacement |
| ----------------- | ------------ |
| LLM `qwen-code.model` | `gen_ai.request.model` ; les spans d'interaction continuent d'utiliser `qwen-code.model` car ce ne sont pas des spans d'inférence GenAI |
| LLM `response_id` | `gen_ai.response.id` ; les logs de réponse/erreur d'API conservent leur schéma `response_id` existant |
| LLM `input_tokens` | `gen_ai.usage.input_tokens` quand le provider rapporte un détail d'entrée |
| LLM `output_tokens` | `gen_ai.usage.output_tokens` quand le provider rapporte un détail de sortie |
| LLM `cached_input_tokens` | `gen_ai.usage.cache_read.input_tokens` quand le provider rapporte des lectures de cache |
| Span `tool.name` de `qwen-code.tool` | `gen_ai.tool.name` ; les spans bloqués sur l'utilisateur et les spans de hook continuent d'utiliser `tool.name` |
| `gen_ai.usage.cached_tokens` | `gen_ai.usage.cache_read.input_tokens` quand le provider rapporte des lectures de cache |
| LLM `llm_request.stream` | `gen_ai.request.stream` ; le streaming émet `true`, le non-streaming omet l'attribut selon la convention sémantique |
| `gen_ai.server.time_to_first_token` | Non émis ; il n'est pas équivalent à l'attribut standard de premier chunk |
| `gen_ai.usage.reasoning_tokens` | Aucun attribut commun ARMS/GenAI dans cette base ; continuer d'interroger le `thoughts_token_count` privé |
| LLM `system_prompt*` | `gen_ai.system_instructions` ; les messages system/developer d'OpenAI sont représentés dans `gen_ai.input.messages` |
| LLM `tools`, événements `tool_schema` | `gen_ai.tool.definitions` |
| LLM `response.model_output*` | `gen_ai.output.messages` |
| Tool `tool_input*` | `gen_ai.tool.call.arguments` |
| Tool `tool_result*` | `gen_ai.tool.call.result` |
| `tools_count`, métadonnées de hash/aperçu/longueur/troncature | Aucun équivalent standard ; supprimé |

`gen_ai.response.finish_reasons` préserve désormais les chaînes brutes du
provider pour tous les candidats au lieu des valeurs précédemment normalisées
Gemini. Les requêtes existantes qui filtrent des valeurs comme `STOP` ou
`MAX_TOKENS` doivent migrer vers les valeurs du provider, telles que `stop`,
`length`, `tool_calls` ou `end_turn`.

`gen_ai.response.time_to_first_chunk` utilise un minuteur monotone depuis
juste avant l'appel provider encapsulé jusqu'à la première
`GenerateContentResponse` normalisée observée par `LoggingContentGenerator`.
Les adaptateurs de provider peuvent filtrer ou fusionner des trames brutes de
protocole avant qu'elles n'atteignent le wrapper de logging, donc les trames
qu'un adaptateur supprime (par exemple, le filtre de réponse vide du pipeline
OpenAI) sont exclues de cette mesure et la valeur enregistrée peut être
postérieure à la véritable première trame réseau. Les réponses normalisées
contenant uniquement des métadonnées ou uniquement de l'usage qui survivent au
filtrage de l'adaptateur comptent comme des chunks. L'attribut est conservé si
le stream échoue ensuite, est interrompu ou dépasse son délai, et est omis
quand aucun chunk n'arrive.

Le minuteur interne `ttftMs` reste la latence de la première sortie visible
par l'utilisateur et continue de piloter `ApiResponseEvent.ttft_ms`,
`sampling_ms`, `output_tokens_per_second` et la métrique de détail des
requêtes API. Par conséquent,
`duration_ms - gen_ai.response.time_to_first_chunk * 1000` n'est pas
`sampling_ms`.

Les requêtes existantes sur les spans de streaming doivent remplacer
`llm_request.stream=true` par `gen_ai.request.stream=true` ; les spans hors
streaming sont identifiés par l'absence de `gen_ai.request.stream` (l'ancien
filtre `llm_request.stream=false` ne correspond désormais à aucune ligne). Le
`ttft_ms` du span reste disponible pour la latence de première sortie visible
par l'utilisateur ; `gen_ai.response.time_to_first_chunk` est un attribut
standard indépendant mesurant la latence du premier chunk normalisé en
secondes.

## Résolution du provider et de l'opération

La résolution est une fonction pure sur la configuration effective du
générateur de contenu. Elle ne renvoie jamais d'URL, d'identifiant secret, de
nom d'hôte de proxy arbitraire, ni de valeur déduite du nom du modèle.

1. Qwen OAuth et une correspondance exacte de `DASHSCOPE_PROXY_BASE_URL`
   résolvent vers `dashscope`.
2. Une correspondance de nom d'hôte sûre aux limites reconnaît les endpoints
   Alibaba Model Studio et les passerelles internes d'Alibaba, Azure OpenAI,
   ainsi que les endpoints tiers pris en charge (DeepSeek, xAI, Mistral,
   MiniMax, Z.AI, ModelScope, MiMo, OpenRouter et Requesty).
3. Si l'hôte est inconnu, un `apiKeyEnvKey` connu identifie le provider
   configuré. L'identité de l'hôte l'emporte en cas de conflit.
4. Les endpoints inconnus utilisent en fallback le provider du protocole :
   `openai`, `anthropic`, `gcp.gemini` ou `gcp.vertex_ai`.

Les requêtes compatibles OpenAI, Anthropic et Qwen OAuth utilisent l'opération
`chat`. Les requêtes Gemini et Vertex AI utilisent `generate_content`.

## Paramètres de requête

Les attributs de requête sont collectés après que les adaptateurs de provider
ont appliqué les valeurs par défaut, les surcharges, la suppression des champs
non pris en charge et les bornages de fenêtre de sortie, juste avant l'appel
du SDK du provider. Il s'agit du dernier objet de requête SDK visible par Qwen
Code, pas de la configuration logique d'origine ni du corps HTTP sérialisé. Un
span LLM logique n'enregistre que son premier snapshot de requête de ce type.

| Attribut standard | Compatible OpenAI et Qwen OAuth | Anthropic | Gemini et Vertex AI |
| ----------------- | ------------------------------- | --------- | ------------------- |
| `gen_ai.request.choice.count` | `n` | Non applicable | `config.candidateCount` |
| `gen_ai.request.max_tokens` | `max_tokens`, `max_completion_tokens` ou `max_new_tokens` | `max_tokens` | `config.maxOutputTokens` |
| `gen_ai.request.temperature` | `temperature` | `temperature` | `config.temperature` |
| `gen_ai.request.top_p` | `top_p` | `top_p` | `config.topP` |
| `gen_ai.request.frequency_penalty` | `frequency_penalty` | Non envoyé actuellement | `config.frequencyPenalty` |
| `gen_ai.request.presence_penalty` | `presence_penalty` | Non envoyé actuellement | `config.presencePenalty` |
| `gen_ai.request.stop_sequences` | `stop` | `stop_sequences` | `config.stopSequences` |

Les nombres finis et les entiers sûrs sont préservés exactement, y compris
zéro et les valeurs négatives sur les requêtes provider échouées. Le nombre de
choix est omis quand il vaut un. Les séquences d'arrêt doivent être un tableau
complet de chaînes ; la forme à chaîne unique d'OpenAI est normalisée en
tableau à un élément. Les tableaux vides sont conservés et les tableaux mixtes
sont omis plutôt que filtrés. Les valeurs par défaut explicites des
adaptateurs sont enregistrées, tandis que les valeurs par défaut implicites du
SDK ou du serveur ne sont pas déduites.

Lorsque plusieurs alias compatibles OpenAI de budget de sortie sont présents,
le maximum standard n'est émis que si toutes les valeurs présentes sont des
entiers sûrs valides et égaux. Les valeurs en conflit sont omises car les
endpoints compatibles n'ont pas de règle de priorité commune.

## Payloads de contenu et d'outils

Le contenu GenAI sensible est collecté uniquement lorsque
`telemetry.includeSensitiveSpanAttributes` est activé. Qwen Code ne lit pas
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`, il n'y a donc qu'un seul
interrupteur de capture de contenu. Les adaptateurs compatibles OpenAI,
Anthropic, Gemini et Vertex convertissent leur requête SDK finale côté
provider et leurs structures de réponse brutes vers les schémas JSON épinglés
par ce design.

La première tentative de requête physique fournit les messages d'entrée, les
instructions système et les définitions d'outils. Les réponses sont liées à
une génération : un fallback de provider ou un retry pour réflexion requise
démarre un nouvel accumulateur de réponse, et les chunks tardifs d'une
tentative plus ancienne sont ignorés. Les accumulateurs de streaming
conservent les parties canoniques plutôt que les chunks bruts. Les échecs
partiels marquent les candidats non terminés avec `error` ; une réponse
réussie avec un candidat dépourvu de raison de fin explicite omet l'attribut
complet de message de sortie.

Chaque attribut JSON est sérialisé de manière compacte et limité
indépendamment par `telemetry.sensitiveSpanAttributeMaxLength`. Les valeurs
d'attribut invalides, cycliques, incomplètes ou trop volumineuses sont omises
dans leur ensemble ; le JSON n'est jamais tronqué. Dans
`gen_ai.tool.definitions`, `type` et `name` sont des identités requises, donc
une identité invalide omet l'attribut complet. `parameters` est optionnel dans
le schéma standard ; quand un schéma de paramètres fourni par le provider ne
peut pas être normalisé en Draft-07, seule cette propriété optionnelle est
omise tandis que la liste ordonnée des identités d'outils est conservée. Les
tableaux et objets vides sont conservés quand le provider les envoie ou les
renvoie explicitement. Avec la limite par défaut de 1 MiB, le maximum
théorique côté application est d'environ 4 MiB d'attributs sensibles par span
LLM et 2 MiB par span Tool. Les collecteurs et backends peuvent imposer des
limites plus basses.

Les arguments d'outil sont capturés depuis les paramètres finaux d'invocation
juste avant l'exécution, après les hooks de permission et d'édition. Un
résultat d'outil n'est capturé qu'après un appel réussi et un post-traitement
réussi, depuis l'objet final `FunctionResponse.response` renvoyé au modèle.
Les deux racines doivent être des objets JSON. `gen_ai.tool.description`
provient de la description statique du registre et n'est pas sensible ; elle
est limitée à 4096 unités de code UTF-16, préserve les paires de substitution
et ajoute `…[truncated]` lorsqu'elle est raccourcie. Les descriptions d'agent
et les erreurs de span conservent leur limite de 1024 unités.

## Provenance de la réponse et de l'usage

Les convertisseurs de provider attachent une provenance interne aux objets
d'usage Gemini normalisés avec une `WeakMap`. Elle enregistre si un champ de
lecture de cache était réellement présent ainsi que les tokens de création de
cache d'Anthropic. Cela préserve la forme JSON publique de la réponse et
laisse le ramasse-miettes suivre l'objet d'usage normalisé.

Quand un provider compatible OpenAI ne rapporte que `total_tokens`, le total
normalisé reste disponible pour les consommateurs internes existants, mais
aucune répartition entrée/sortie n'est synthétisée et aucun des deux attributs
d'usage standard n'est émis.

Le `response.model`/`chunk.model` d'OpenAI et le modèle de message
d'Anthropic sont préservés en tant que `modelVersion`. Un modèle de provider
manquant reste manquant pour le traçage ; le fallback sur le modèle de requête
reste limité aux logs API et au comportement UI existants. La fusion de
streams transporte le dernier modèle de provider connu et la provenance
d'usage dans la réponse terminale. L'usage d'entrée et de cache de
`message_start` d'Anthropic est attaché au premier chunk produit ultérieur,
afin que les échecs partiels de stream conservent l'usage rapporté par le
provider sans synthétiser un nombre de sorties.

## Configuration d'ARMS

La reconnaissance automatique des applications GenAI par ARMS exige cet
attribut de ressource :

```json
{
  "telemetry": {
    "resourceAttributes": {
      "acs.arms.service.feature": "genai_app"
    }
  }
}
```

Qwen Code n'injecte pas cet attribut de ressource spécifique au fournisseur
ni `gen_ai.span.kind`. ARMS peut déduire les rôles LLM, Tool et Agent depuis
`gen_ai.operation.name`.

### Extension d'identité d'utilisateur final d'ARMS

`gen_ai.user.id` est un attribut commun des spans ARMS, qui ne fait pas partie
de la base OpenTelemetry GenAI épinglée ci-dessus. Qwen Code l'émet uniquement
lorsque l'opérateur configure explicitement `telemetry.userId` ou
`QWEN_TELEMETRY_USER_ID`. La valeur est placée sur le span d'interaction à la
création et propagée via le contexte in-process existant aux spans LLM, Tool
et Agent, y compris les agents fork/arrière-plan à racine liée. Les
continuations sur résultat d'outil résolvent la même interaction logique par
ID de prompt sans changer le rattachement parent du span ; cette entrée
d'identité minimale expire avec le TTL de filet de sécurité de 30 minutes des
spans existant.

La valeur n'est jamais déduite, générée, écrite dans Resource/les logs/les
métriques, ni placée dans le Baggage sortant. Qwen Code n'écrit pas en double
`enduser.id` ou `user.id`. Un ancien `telemetry.resourceAttributes.user.id`
reste une dimension générique de Resource et doit être supprimé explicitement
lors de la migration. Comme le réglage s'applique à tout le processus, il
n'est pris en charge que lorsqu'un processus représente un seul utilisateur
final ; l'identité à l'échelle de la requête pour les déploiements partagés de
démon et de canal est reportée jusqu'à ce que leur identité d'appelant fiable
puisse être câblée de bout en bout.

## Travail reporté

- `seed` et `top_k` ont des types ARMS et GenAI incompatibles dans les bases.
- L'embedding nécessite un cycle de vie correct du modèle demandé avant le
  traçage.
- Le délai du premier token d'ARMS et le délai du premier chunk d'OpenTelemetry
  diffèrent par leur nom, leur unité et leur signification. Qwen Code émet
  l'attribut standard `gen_ai.response.time_to_first_chunk` aux côtés du
  `ttft_ms` privé et ne promet pas un remplissage automatique d'un tableau de
  bord ARMS du premier token.
- Le nommage complet des spans GenAI, le type de span CLIENT et la topologie
  logique de retry constituent un projet de conformité distinct.

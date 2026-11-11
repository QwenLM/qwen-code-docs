# Fournisseurs de modèles

Qwen Code vous permet de configurer plusieurs fournisseurs de modèles via le paramètre `modelProviders` dans votre `settings.json`. Cela vous permet de basculer entre différents modèles et fournisseurs d'IA en utilisant la commande `/model`.

## Vue d'ensemble

Utilisez `modelProviders` pour déclarer les modèles par identifiant de fournisseur que le sélecteur `/model` peut basculer. Chaque clé est un identifiant de fournisseur et sa valeur est **un tableau de définitions de modèles** (`ModelConfig[]`). Pour les fournisseurs intégrés, la clé doit être un type d'authentification valide (`openai`, `anthropic`, `gemini`, `vertex-ai`) ; un identifiant de fournisseur personnalisé (par ex. `idealab`) est autorisé tant que vous le mappez à un protocole via le paramètre de niveau supérieur [`providerProtocol`](#custom-provider-ids-providerprotocol). Chaque entrée de modèle nécessite un `id` ; `envKey` est **facultatif et recommandé** (en cas d'omission, il revient à la clé d'environnement par défaut du type d'authentification, par ex. `OPENAI_API_KEY` pour `openai`), avec des champs facultatifs `name`, `description`, `baseUrl` et `generationConfig`. Les identifiants ne sont jamais persistés dans les paramètres ; le runtime les lit depuis `process.env[envKey]`. Les anciens modèles Qwen OAuth gratuits restent codés en dur et ne peuvent pas être remplacés.

> [!note]
>
> Les versions précédentes enveloppaient les modèles de chaque fournisseur dans un objet `{ "protocol": ..., "models": [...] }`. Cette forme a été abandonnée — la valeur actuelle est le tableau nu `ModelConfig[]` montré tout au long de cette page. Une entrée enveloppée dans un fichier de paramètres déjà migré (`$version: 4`) est silencieusement ignorée, donc mettez à jour toutes les anciennes configurations vers la forme tableau.

> [!note]
>
> Configurez les fournisseurs de clés API via `modelProviders`, puis sélectionnez-les avec `/model`. Pour la connexion au compte Qwen, choisissez [**Compte Qwen avec Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) dans `/auth` ; aucune configuration manuelle de clé API ou de `modelProviders` n'est nécessaire. Utilisez `/model` pour choisir parmi les modèles disponibles avec votre abonnement. Voir [Authentification](./auth.md) pour les instructions de connexion.

> [!note]
>
> **Unicité des modèles :** Les modèles sont identifiés par leur protocole API effectif, `id`, et leur `baseUrl` configuré. Vous pouvez définir le même modèle et URL avec à la fois `wireApi: "chat-completions"` et `wireApi: "responses"`, ou utiliser des URLs différentes pour le même modèle et l'API. Si les entrées partagent ces trois valeurs, la première occurrence gagne et les doublons suivants sont ignorés avec un avertissement.

> [!note]
>
> **Rechargement à chaud vs. redémarrage :** Les modifications de `modelProviders` dans `settings.json` sont prises en compte par une session interactive en cours sans redémarrage (le surveillant de fichiers débounce ~300ms ; rouvrez `/model` pour voir les nouvelles entrées, la sélection actuelle est conservée). Modifier le `wireApi` du modèle actif crée une route différente ; sélectionnez cette route explicitement ou redémarrez pour l'utiliser. Des modifications d'API invalides laissent le registre précédent utilisable. `providerProtocol` est lu une seule fois au démarrage et **nécessite un redémarrage**.

### Routes de génération d'images

Définissez `supportsImageGeneration: true` lorsqu'une route peut être utilisée par l'outil intégré `image_gen`. Cette capacité est indépendante de la prise en charge des entrées d'image telles que `capabilities.vision` ou `generationConfig.modalities.image`.

Utilisez `imageOnly: true` lorsque la route est dédiée à la génération d'images et ne doit pas apparaître dans les sélecteurs de modèles ordinaires. Pour la compatibilité ascendante, `imageOnly: true` implique également la capacité de génération d'images, de sorte que les paramètres existants n'ont pas besoin d'être migrés.

Une route à double rôle peut être sélectionnée à la fois comme modèle principal et via `/model --image` :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "omni-model",
        "envKey": "MODEL_API_KEY",
        "baseUrl": "https://gateway.example.com/model-api",
        "supportsImageGeneration": true
      }
    ]
  }
}
```

Une route d'image dédiée définit les deux champs. La forme héritée avec uniquement `imageOnly: true` reste valide :

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

La route sélectionnée doit déclarer un `baseUrl` HTTPS explicite et un `envKey` non vide. La génération d'images utilise le même point de terminaison et les mêmes identifiants que la route ; si le chat et la génération d'images nécessitent des points de terminaison ou des identifiants différents, configurez deux routes distinctes.

### Routes Live Voice

Définissez `realtimeOnly: true` sur une route qui parle le protocole DashScope Realtime (parole-à-parole). Une telle route n'est jamais proposée comme modèle de chat, rapide, vision, voix ou image ; elle ne peut être choisie que comme modèle Live Voice via `experimental.liveVoice.model` (un `modelId`, ou `provider:modelId` lorsque le même id existe sous plusieurs fournisseurs).

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.5-omni-plus-realtime",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY",
        "realtimeOnly": true
      }
    ]
  },
  "experimental": {
    "liveVoice": {
      "enabled": true,
      "model": "qwen3.5-omni-plus-realtime",
      "voice": "Tina"
    }
  }
}
```

Lorsque le modèle sélectionné nomme une route `realtimeOnly`, Live Voice lit la clé API via le `envKey` de la route (environnement du processus d'abord, puis le bloc `env` de `settings.json`) et dérive le point de terminaison WebSocket de son `baseUrl` (`https://<host>/compatible-mode/v1` devient `wss://<host>/api-ws/v1/realtime`). La route doit déclarer à la fois `baseUrl` et `envKey`, et l'hôte doit être un point de terminaison DashScope.

Deux règles sont délibérées :

- Les paramètres de l'espace de travail ne sont jamais consultés, seuls ceux au niveau utilisateur et système le sont. Le `.qwen/settings.json` d'un projet ne peut pas ajouter ni rediriger une route Live Voice.
- Un sélecteur `modelId` **nu** qui ne correspond à aucune route `realtimeOnly` utilise les champs autonomes `experimental.liveVoice.endpoint` et `experimental.liveVoice.apiKey` comme auparavant, afin que les configurations existantes continuent de fonctionner sans changement. Un sélecteur `provider:modelId` dont le fournisseur existe mais n'a pas une telle route constitue une erreur : une route supprimée ou mal saisie ne retombe jamais silencieusement sur une clé stockée.
- Tant qu'une route est sélectionnée, `experimental.liveVoice.apiKey` et `experimental.liveVoice.endpoint` sont inutilisés, et l'API de configuration refuse d'en enregistrer de nouveaux.

Sur le chemin autonome, les paramètres Qwen Live de Web Shell définissent directement le point de terminaison et le modèle. Entrez l'URL de base compatible OpenAI de la région ou du domaine dédié auquel votre clé appartient, tel que `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` ; laissé vide, Live utilise Pékin (`https://dashscope.aliyuncs.com/compatible-mode/v1`), et une clé provenant d'ailleurs est rejetée avec `401`. L'URL de base est stockée telle quelle et convertie en `wss://<host>/api-ws/v1/realtime` lors du démarrage d'un appel ; l'hôte doit être un point de terminaison DashScope ou `*.maas.aliyuncs.com`. Lorsque Live Voice est activé, un nouveau point de terminaison est vérifié par une poignée de main Realtime avant d'être enregistré.

## Remplacer les capacités de raisonnement [#override-reasoning-capabilities]

Définissez `capabilities.reasoning` sur une entrée de modèle pour remplacer son format de raisonnement, ses niveaux d'effort proposés et sa valeur par défaut. Les modèles connus héritent des champs omis du catalogue du fournisseur au point de terminaison sélectionné ; par exemple, `"capabilities": { "reasoning": { "defaultEffort": "medium" } }` fait qu'une route DashScope `qwen3.8-max` utilise medium lorsqu'aucun effort explicite n'est sélectionné. Pour un alias inconnu, déclarez les trois champs :

```json
{
  "id": "company-model-v2",
  "baseUrl": "https://gateway.example.com/v1",
  "envKey": "COMPANY_MODEL_API_KEY",
  "capabilities": {
    "reasoning": {
      "profile": "openai-effort",
      "efforts": ["low", "medium", "high"],
      "defaultEffort": "medium"
    }
  }
}
```

`efforts` remplace le sous-ensemble pris en charge de `low/medium/high/xhigh/max`. Une valeur par défaut explicite doit appartenir à ce sous-ensemble. Les profils réutilisent les formats existants : Chat accepte `openai-effort`, `openai-reasoning`, `deepseek-openai`, `dashscope-effort`, `dashscope-thinking` et `qwen-chat-template` ; Responses accepte `openai-reasoning` ; Anthropic accepte `anthropic-manual`, `anthropic-adaptive` et `deepseek-anthropic` ; Gemini/Vertex utilise `gemini`. Les deux profils à bascule uniquement omettent `efforts` et `defaultEffort`. Gemini utilise low/medium/high. Un profil adaptatif sélectionne la réflexion adaptative même lorsqu'un budget manuel hérité est configuré. Les déclarations complètes de capacités existantes continuent de fonctionner.

Les modifications du raisonnement s'appliquent avant la prochaine invite utilisateur. Ses requêtes, tentatives et agents enfants partagent la configuration de raisonnement capturée. Les mises à jour invalides conservent la configuration précédente et journalisent l'erreur modèle/champ. Les déclarations invalides dans de nouvelles sessions reviennent en toute sécurité au comportement existant du modèle. Les choix explicites de l'utilisateur et les remplacements natifs du fournisseur dans `reasoning`, `samplingParams` et `extra_body` conservent leur priorité existante ; une valeur par défaut du modèle n'est pas enregistrée comme un choix utilisateur. Ce mécanisme ne modifie pas les cycles de vie des points de terminaison, des identifiants ou des modèles d'images.

## Exemples de configuration par type d'authentification

Vous trouverez ci-dessous des exemples de configuration complets pour différents types d'authentification, montrant les paramètres disponibles et leurs combinaisons.

### Types d'authentification pris en charge

Utilisez l'un des identifiants de fournisseur intégrés ci-dessous, ou mappez un identifiant personnalisé avec `providerProtocol` :

| Protocole effectif | Description                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`           | API compatibles OpenAI. Par défaut Chat Completions ; définissez le `wireApi` d'un modèle sur `responses` pour l'API Responses.                             |
| `anthropic`  | API Anthropic Claude                                                                                                                            |
| `gemini`     | API Google Gemini                                                                                                                               |
| `vertex-ai`  | Google Vertex AI (utilise le protocole `gemini` et le SDK `@google/genai` en mode Vertex AI ; sa sélection définit `GOOGLE_GENAI_USE_VERTEXAI=true`) |

> [!note]
> Les entrées Vertex AI peuvent s'authentifier avec les **Application Default Credentials**. Définissez `GOOGLE_CLOUD_PROJECT` (et facultativement `GOOGLE_CLOUD_LOCATION`, qui vaut `global` par défaut) et laissez `envKey` non défini, ainsi que toutes les autres sources de clé lues par le résolveur : `GOOGLE_API_KEY`, `settings.security.auth.apiKey` et les indicateurs CLI de clé. Toute valeur de clé API qui atteint une entrée Vertex bascule le SDK Google en mode Vertex Express, qui ignore le projet, la localisation et vos identifiants ADC. Une entrée déclarant un `envKey` n'est jamais routée vers ADC, donc une clé dont l'injection échoue continue d'échouer sur cette variable au lieu de s'authentifier silencieusement auprès d'un autre principal.

> [!warning]
> Un id de fournisseur qui n'est ni un protocole intégré ni mappé via `providerProtocol` (par ex. une faute de frappe comme `"openai-custom"`) ne peut pas être routé, donc son entrée entière est **ignorée** avec un avertissement — ses modèles n'apparaîtront simplement pas dans le sélecteur `/model`. Utilisez l'une des valeurs de type d'authentification prises en charge ci-dessus pour les fournisseurs intégrés, ou ajoutez un mapping [`providerProtocol`](#custom-provider-ids-providerprotocol) pour un id personnalisé.

### Ids de fournisseurs personnalisés (`providerProtocol`) [#custom-provider-ids-providerprotocol]

Les identifiants de fournisseurs intégrés (`openai`, `gemini`, `anthropic`, `vertex-ai`, `qwen-oauth`) sont routés automatiquement vers leur protocole SDK. Pour utiliser un identifiant de fournisseur **personnalisé** — par exemple pour regrouper plusieurs points de terminaison compatibles OpenAI sous un nom plus convivial — déclarez-le sous `modelProviders` et mappez-le vers un protocole intégré avec le paramètre de niveau supérieur `providerProtocol` :

```json
{
  "modelProviders": {
    "idealab": [
      {
        "id": "my-model",
        "envKey": "IDEALAB_API_KEY",
        "baseUrl": "https://idealab.example.com/v1"
      }
    ]
  },
  "providerProtocol": {
    "idealab": "openai"
  }
}
```

Sans une entrée `providerProtocol` correspondante, un id de fournisseur personnalisé est ignoré (voir l'avertissement ci-dessus).

### Sélectionner l'API OpenAI

Définissez `wireApi` à côté de `id`, `envKey` et `baseUrl` sur un modèle compatible OpenAI :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "my-model",
        "wireApi": "responses",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ]
  },
  "security": { "auth": { "selectedType": "openai" } },
  "model": { "name": "my-model" }
}
```

Les valeurs prises en charge sont `chat-completions` et `responses`. Omettre `wireApi` utilise Chat Completions pour `openai`, y compris pour les fournisseurs personnalisés mappés vers `openai`. Les autres valeurs, ou `wireApi` sur un modèle Anthropic, Gemini, Vertex AI ou Qwen OAuth, constituent des erreurs de configuration.

Utilisez `openai` avec le `wireApi` par modèle pour les nouvelles configurations. Le format `modelProviders.openai-responses` et les mappings `providerProtocol` vers `openai-responses` publiés dans v0.23.3 restent lisibles. Les mappings de fournisseurs explicites ont priorité sur les noms de buckets ; un `wireApi` explicite a priorité sur l'un ou l'autre des protocoles OpenAI. Le chargement ne réécrit pas les paramètres ni ne modifie les références aux identifiants. La reconfiguration écrit les routes sélectionnées dans le nouveau format et supprime uniquement leurs entrées correspondantes dans l'ancienne portée inscriptible ; les entrées sous un identifiant de fournisseur contenant un point sont laissées en place, et les modèles, points de terminaison, API et portées non liés restent inchangés. `api` n'est pas un alias de `wireApi`.

`wireApi` est une métadonnée de routage locale ; elle n'appartient ni à `generationConfig` ni à `extra_body` et n'est pas envoyée dans le corps de la requête. Une nouvelle configuration personnalisée partage un seul emplacement d'identifiant pour le même point de terminaison OpenAI entre les deux API, donc la rotation de cette clé met à jour les deux routes. Les modèles configurés manuellement peuvent utiliser des références `envKey` explicites distinctes lorsque des identifiants indépendants sont nécessaires. Dans `/auth` → Custom Provider, sélectionnez OpenAI-compatible puis le format d'API.

Au démarrage, `selectedType: "openai"` peut résoudre un modèle explicitement configuré avec `wireApi: "responses"` lorsqu'il n'y a pas de route Chat correspondante sur le point d'accès configuré sélectionné. Le sélecteur de modèles et les sessions enregistrées conservent le protocole effectif (`openai` ou `openai-responses`) afin que les deux routes puissent être sélectionnées et reprises indépendamment. Aucune détection de point d'accès ni repli automatique ne se produit en cas d'échec d'une requête API.

### Transports utilisés pour les requêtes API

Le protocole de modèle effectif détermine le transport. Les deux API OpenAI utilisent le groupe de fournisseurs `openai` ; `wireApi` sélectionne Chat Completions ou Responses :

| Protocole effectif | Transport                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `openai`           | [`openai`](https://www.npmjs.com/package/openai) - SDK officiel OpenAI pour Node.js                                 |
| `openai-responses` | Appels HTTP/SSE directs vers `/v1/responses` (pas de SDK) ; les embeddings utilisent [`openai`](https://www.npmjs.com/package/openai) |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK officiel Anthropic |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK officiel Google GenAI      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) avec un fournisseur personnalisé (compatible DashScope) |

Cela signifie que le `baseUrl` que vous configurez doit être compatible avec le format d'API attendu par le transport correspondant. Par exemple, `wireApi: "responses"` nécessite un point d'accès compatible avec Responses.

### Fournisseurs compatibles avec OpenAI (`openai`)

Ce type d'authentification prend en charge non seulement l'API officielle d'OpenAI, mais aussi tout point de terminaison compatible avec OpenAI, y compris les fournisseurs de modèles agrégés comme OpenRouter et Requesty.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "retryInitialDelayMs": 3000,
          "retryMaxDelayMs": 30000,
          "enableCacheControl": true,
          "contextWindowSize": 128000,
          "modalities": {
            "image": true
          },
          "customHeaders": {
            "X-Client-Request-ID": "req-123"
          },
          "extra_body": {
            "enable_thinking": true,
            "service_tier": "priority"
          },
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 4096,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.1
          }
        }
      },
      {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 30000,
          "samplingParams": {
            "temperature": 0.5,
            "max_tokens": 2048
          }
        }
      },
      {
        "id": "openai/gpt-4o",
        "name": "GPT-4o (via OpenRouter)",
        "envKey": "OPENROUTER_API_KEY",
        "baseUrl": "https://openrouter.ai/api/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      },
      {
        "id": "openai/gpt-4o-mini",
        "name": "GPT-4o Mini (via Requesty)",
        "envKey": "REQUESTY_API_KEY",
        "baseUrl": "https://router.requesty.ai/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      }
    ]
  }
}
```

Lorsque vous dirigez une entrée vers une passerelle hébergée compatible OpenAI, définissez `baseUrl` sur la racine `/v1` de l'API (par exemple, `https://gateway.example.com/v1`) plutôt que sur le chemin complet `/v1/chat/completions` — le SDK ajoute lui-même le chemin de la requête.

### API OpenAI Responses (`openai-responses`) [#openai-responses-api-openai-responses]

Utilisez `openai` avec `wireApi: "responses"` pour cibler le point d'accès `/v1/responses` d'OpenAI. Lorsque le point d'accès renvoie un raisonnement chiffré avec du texte de pensée visible, il rejoue le raisonnement des tours précédents entre les tours et `--resume` via `reasoning.encrypted_content`. Les points d'accès compatibles qui diffusent `response.reasoning_text.delta` affichent également leur raisonnement, mais les points d'accès sans `encrypted_content` ne peuvent pas rejouer l'état opaque du raisonnement. Utilisez `reasoning.effort` (et non `extra_body.enable_thinking`, utilisé par les connexions Chat Completions) pour contrôler l'intensité du raisonnement.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-5.1",
        "wireApi": "responses",
        "name": "GPT-5.1 (Responses API)",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "reasoning": {
            "effort": "high"
          },
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

> [!note]
> `extra_body` sur ce wire est en remplissage uniquement : une clé n'est écrite dans le corps de la requête que lorsque la requête générée n'a pas de valeur pour celle-ci, donc il ne peut pas écraser un champ que le pipeline a déjà défini (`model`, `input`, `reasoning`, `temperature`, `max_output_tokens`, ...). La clé legacy `enable_thinking` est la seule exception même à cette règle — elle est supprimée plutôt que transmise (ce n'est pas un champ de l'API Responses), et traduite en `reasoning.effort: "medium"` lorsqu'aucun `reasoning` explicite n'est défini. Définissez `reasoning.effort` directement au lieu de `extra_body.enable_thinking` pour ce fournisseur.

### Anthropic (`anthropic`)

Claude Opus 5.5, Sonnet 5.5, Fable 5.1 et Mythos 5.1 rejettent la sélection forcée d'outils. Pour les requêtes latérales structurées, Qwen Code utilise la sélection automatique d'outils avec une instruction de réponse schématique explicite sur ces modèles. Les modèles qui prennent en charge la sélection forcée la conservent. La sélection automatique ne garantit pas un appel d'outil ; les requêtes latérales JSON peuvent également lire un objet JSON brut à partir du texte de la réponse, sans balises Markdown ni prose environnante. Voir [les restrictions de choix d'outils d'Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use).

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "contextWindowSize": 200000,
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 8192,
            "top_p": 0.9
          }
        }
      },
      {
        "id": "claude-3-opus",
        "name": "Claude 3 Opus",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 180000,
          "samplingParams": {
            "temperature": 0.3,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "capabilities": {
          "vision": true
        },
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 2,
          "contextWindowSize": 1000000,
          "schemaCompliance": "auto",
          "samplingParams": {
            "temperature": 0.4,
            "top_p": 0.95,
            "max_tokens": 8192,
            "top_k": 40
          }
        }
      }
    ]
  }
}
```

Pour un modèle vision qui peut également suivre la politique normale de l'agent Qwen Code et utiliser des outils, activez le routage d'images sur le tour complet avec les deux capacités :

```json
"capabilities": {
  "vision": true,
  "agent": true
}
```

Lorsqu'un primaire text-only utilise ce modèle comme fallback vision configuré, le tour complet portant l'image reste sur ce fournisseur, modèle et endpoint exact à travers les appels d'outils et les retries. Le tour indépendant suivant revient au primaire, et chaque demande de modèle ne reçoit que les modalités média prises en charge par sa cible. Omettez `agent` (ou définissez-le sur `false`) pour conserver le flux de transcription Vision Bridge plus sûr.

### Modèles auto-hébergés locaux (via une API compatible OpenAI)

La plupart des serveurs d'inférence locaux (vLLM, Ollama, LM Studio, etc.) fournissent un point de terminaison d'API compatible avec OpenAI. Configurez-les en utilisant le type d'authentification `openai` avec une `baseUrl` locale :

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen2.5-7b",
        "name": "Qwen2.5 7B (Ollama)",
        "envKey": "OLLAMA_API_KEY",
        "baseUrl": "http://localhost:11434/v1",
        "generationConfig": {
          "timeout": 300000,
          "streamIdleTimeoutMs": 600000,
          "maxRetries": 1,
          "contextWindowSize": 32768,
          "samplingParams": {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 4096
          }
        }
      },
      {
        "id": "llama-3.1-8b",
        "name": "Llama 3.1 8B (vLLM)",
        "envKey": "VLLM_API_KEY",
        "baseUrl": "http://localhost:8000/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 2,
          "contextWindowSize": 128000,
          "samplingParams": {
            "temperature": 0.6,
            "max_tokens": 8192
          }
        }
      },
      {
        "id": "local-model",
        "name": "Local Model (LM Studio)",
        "envKey": "LMSTUDIO_API_KEY",
        "baseUrl": "http://localhost:1234/v1",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": {
            "temperature": 0.5
          }
        }
      }
    ]
  }
}
```

Pour les serveurs locaux compatibles OpenAI mis en file d'attente ou lents, `streamIdleTimeoutMs` contrôle la durée pendant laquelle ce modèle peut rester silencieux entre les fragments diffusés. Il remplace la valeur globale `QWEN_STREAM_IDLE_TIMEOUT_MS` pour l'entrée du fournisseur sélectionné ; définissez-la sur `0` pour désactiver la protection contre l'inactivité. La limite séparée de durée de vie du flux de 15 minutes s'applique toujours sauf si `QWEN_STREAM_MAX_LIFETIME_MS` est augmenté ou désactivé.

Pour les serveurs locaux qui n'exigent pas d'authentification, vous pouvez utiliser n'importe quelle valeur fictive pour la clé API :

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Le paramètre `extra_body` est **pris en charge uniquement pour les fournisseurs compatibles OpenAI** (`openai`, `qwen-oauth`). Il est ignoré pour les fournisseurs Anthropic et Gemini. Sur `openai-responses`, la clé `enable_thinking` est traduite plutôt que transmise — voir la note sur [l'API OpenAI Responses](#openai-responses-api-openai-responses).

> [!note]
>
> **À propos de `envKey`** : Le champ `envKey` spécifie le **nom d'une variable d'environnement**, et non la valeur réelle de la clé API. Pour que la configuration fonctionne, vous devez vous assurer que la variable d'environnement correspondante est définie avec votre véritable clé API. Il y a deux façons de procéder :
>
> - **Option 1 : Utiliser un fichier `.env`** (recommandé pour des raisons de sécurité) :
>   ```bash
>   # ~/.qwen/.env (or project root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Assurez-vous d'ajouter `.env` à votre `.gitignore` pour éviter de committer accidentellement des secrets.
> - **Option 2 : Utiliser le champ `env` dans `settings.json`** (comme montré dans les exemples ci-dessus) :
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Chaque exemple de fournisseur inclut un champ `env` pour illustrer comment la clé API doit être configurée.

#### Qwen3.x servi sous un nom de modèle personnalisé

Le contrôle de la réflexion et la fenêtre de contexte sont déduits à partir de l'identifiant du modèle. Si un serveur vLLM ou SGLang expose un modèle Qwen3.x sous un identifiant qui ne commence pas par `qwen` (par exemple `--served-model-name chat`), aucune de ces règles ne s'applique : les requêtes annexes telles que le classificateur d'autorisations en mode automatique maintiennent la réflexion activée, et la fenêtre de contexte revient à la valeur par défaut de 200K. Déclarez les deux dans l'entrée du modèle, comme décrit dans [Override reasoning capabilities](#override-reasoning-capabilities) :

```json
{
  "id": "chat",
  "name": "Qwen3.6 35B A3B (vLLM)",
  "envKey": "VLLM_API_KEY",
  "baseUrl": "http://localhost:8000/v1",
  "capabilities": { "reasoning": { "profile": "qwen-chat-template" } },
  "generationConfig": { "contextWindowSize": 262144 }
}
```

`qwen-chat-template` envoie `chat_template_kwargs.enable_thinking`, que ces serveurs transmettent au gabarit de chat Qwen ; un champ `enable_thinking` de premier niveau n'est pas lu par eux. Définissez `contextWindowSize` sur la longueur maximale du modèle côté serveur (vLLM l'indique sous `max_model_len` dans `/v1/models`). Qwen Code envoie les définitions des outils dans chaque requête, donc le serveur doit également avoir l'appel d'outils et un analyseur de raisonnement activés ; sur vLLM, cela correspond à `--enable-auto-tool-choice`, un `--tool-call-parser` pour le modèle (par exemple `qwen3_xml`) et `--reasoning-parser qwen3`. Les noms des analyseurs changent entre les versions du serveur, consultez donc la documentation de votre serveur.

## Plan de codage Alibaba Cloud

Le Coding Plan d'Alibaba Cloud fournit un ensemble préconfiguré de modèles Qwen optimisés pour les tâches de codage. Cette fonctionnalité est disponible pour les utilisateurs disposant d'un accès API au Coding Plan d'Alibaba Cloud et offre une expérience de configuration simplifiée avec des mises à jour automatiques de la configuration des modèles.

### Vue d'ensemble

Lorsque vous vous authentifiez avec une clé API Alibaba Cloud Coding Plan à l'aide de la commande `/auth`, Qwen Code configure automatiquement les modèles suivants :

| ID du modèle           | Nom                  | Description                                               |
| ---------------------- | -------------------- | --------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Modèle avancé avec la réflexion activée                   |
| `qwen3.6-plus`         | qwen3.6-plus         | Dernier modèle avec la réflexion activée (abonnés Pro uniquement) |
| `qwen3.7-plus`         | qwen3.7-plus         | Modèle avancé avec la réflexion activée                   |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Optimisé pour les tâches de codage                        |
| `qwen3-coder-next`     | qwen3-coder-next     | Modèle de codage expérimental                             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Dernier modèle max avec la réflexion activée              |
| `glm-5`                | glm-5                | Modèle GLM avec la réflexion activée                      |
| `glm-4.7`              | glm-4.7              | Modèle GLM avec la réflexion activée                      |
| `kimi-k2.5`            | kimi-k2.5            | Modèle Kimi avec réflexion et prise en charge de la vision/vidéo |
| `MiniMax-M2.5`         | MiniMax-M2.5         | Modèle MiniMax avec la réflexion activée                  |

### Configuration

1. Obtenez une clé API Alibaba Cloud Coding Plan :
   - **Chine** : <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International** : <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Exécutez la commande `/auth` dans Qwen Code
3. Sélectionnez **Alibaba ModelStudio**, puis choisissez **Coding Plan** dans le sous-menu
4. Sélectionnez votre région
5. Saisissez votre clé API lorsque vous y êtes invité

Les modèles seront automatiquement configurés et ajoutés à votre sélecteur `/model`.

### Régions

Alibaba Cloud Coding Plan prend en charge deux régions :

| Région               | Endpoint                                        | Description             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| Chine                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpoint pour la Chine continentale |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Endpoint international  |

La région est sélectionnée lors de l'authentification et stockée dans `settings.json` sous la configuration `modelProviders`. Pour changer de région, réexécutez la commande `/auth` et sélectionnez une région différente.

### Stockage de la clé API

Lorsque vous configurez Coding Plan via la commande `/auth`, la clé API est stockée en utilisant le nom de variable d'environnement réservé `BAILIAN_CODING_PLAN_API_KEY`. Par défaut, elle est stockée dans le champ `env` de votre fichier `settings.json`.

> [!warning]
>
> **Recommandation de sécurité** : Pour une meilleure sécurité, il est recommandé de déplacer la clé API de `settings.json` vers un fichier `.env` séparé et de la charger en tant que variable d'environnement. Par exemple :
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Assurez-vous ensuite d'ajouter ce fichier à votre `.gitignore` si vous utilisez des paramètres au niveau du projet.

### Mises à jour automatiques

Les configurations des modèles Coding Plan sont versionnées. Lorsque Qwen Code détecte une version plus récente du modèle de configuration, vous serez invité à effectuer la mise à jour. L'acceptation de la mise à jour permettra de :

- Remplacer les configurations existantes des modèles Coding Plan par les dernières versions
- Préserver toutes les configurations de modèles personnalisées que vous avez ajoutées manuellement
- Laissez votre modèle sélectionné inchangé ; s'il ne figure plus dans la configuration mise à jour, utilisez `/model` pour en choisir un nouveau

Le processus de mise à jour actualise les configurations des modèles et les fonctionnalités sans modifier votre modèle sélectionné.

### Configuration manuelle (Avancé)

Si vous préférez configurer manuellement les modèles Coding Plan, vous pouvez les ajouter à votre `settings.json` comme n'importe quel fournisseur compatible OpenAI :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder via Alibaba Cloud Coding Plan",
        "envKey": "YOUR_CUSTOM_ENV_KEY",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
>
> Lors de l'utilisation de la configuration manuelle :
>
> - Vous pouvez utiliser n'importe quel nom de variable d'environnement pour `envKey`
> - Vous n'avez pas besoin de configurer `codingPlan.*`
> - **Les mises à jour automatiques ne s'appliqueront pas** aux modèles Coding Plan configurés manuellement

> [!warning]
>
> Si vous utilisez également la configuration automatique de Coding Plan, les mises à jour automatiques peuvent écraser vos configurations manuelles si elles utilisent le même `envKey` et la même `baseUrl` que la configuration automatique. Pour éviter cela, assurez-vous que votre configuration manuelle utilise un `envKey` différent si possible.

## Couches de résolution et atomicité

Les valeurs effectives d'authentification/modèle/identifiants sont choisies par champ en utilisant la priorité suivante (le premier présent l'emporte). Vous pouvez combiner `--auth-type` avec `--model` pour pointer directement vers une entrée de fournisseur ; ces indicateurs CLI s'exécutent avant les autres couches.

| Couche (de la plus haute à la plus basse) | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Remplacements programmatiques | `/auth`                             | Entrée `/auth`                                  | Entrée `/auth`                                         | Entrée `/auth`                                          | —                      | —                                 |
| Sélection du fournisseur de modèle | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| Arguments CLI              | `--auth-type`                       | `--model`                                       | `--openai-api-key`                                    | `--openai-base-url`                                    | —                      | —                                 |
| Variables d'environnement  | —                                   | Mapping spécifique au fournisseur (ex. `OPENAI_MODEL`) | Mapping spécifique au fournisseur (ex. `OPENAI_API_KEY`) | Mapping spécifique au fournisseur (ex. `OPENAI_BASE_URL`) | —                      | —                                 |
| Paramètres (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| Par défaut / calculé       | Repli vers `AuthType.QWEN_OAUTH`    | Valeur par défaut intégrée (OpenAI ⇒ `qwen3.5-plus`) | —                                                     | —                                                      | —                      | `Config.getProxy()` si configuré  |

\*Lorsqu'il est présent, les indicateurs d'authentification CLI remplacent les paramètres. Sinon, `security.auth.selectedType` ou la valeur par défaut implicite détermine le type d'authentification. Consultez [Authentication](./auth.md) pour connaître les options de connexion. Le fournisseur Qwen OAuth gratuit hérité est distinct de [Qwen Account with Subscription](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).

> [!note]
>
> `--openai-api-key` et `--openai-base-url` sont les seuls indicateurs CLI pour les identifiants. Ils s'appliquent au fournisseur compatible OpenAI actif, quel que soit son nom — il n'y a pas d'indicateurs d'identifiants `--anthropic-*` / `--gemini-*`. Les identifiants spécifiques au fournisseur qui ne sont pas passés en CLI sont résolus à partir des variables d'environnement (voir la ligne ci-dessous).

> [!warning]
>
> **Obsolescence de `security.auth.apiKey` et `security.auth.baseUrl` :** La configuration directe des identifiants API via `security.auth.apiKey` et `security.auth.baseUrl` dans `settings.json` est obsolète. Ces paramètres étaient utilisés dans les versions historiques pour les identifiants saisis via l'interface utilisateur, mais le flux de saisie des identifiants a été supprimé dans la version 0.10.1. Ces champs seront entièrement supprimés dans une prochaine version. **Il est fortement recommandé de migrer vers `modelProviders`** pour toutes les configurations de modèles et d'identifiants. Utilisez `envKey` dans `modelProviders` pour référencer des variables d'environnement pour une gestion sécurisée des identifiants au lieu de coder en dur les identifiants dans les fichiers de paramètres.

## Empilement de la configuration de génération : La couche fournisseur imperméable

La résolution de la configuration suit un modèle d'empilement strict avec une règle cruciale : **la couche modelProvider est imperméable**.

### Fonctionnement

1. **Lorsqu'un modèle modelProvider EST sélectionné** (par exemple, via la commande `/model` en choisissant un modèle configuré par le fournisseur) :
   - L'intégralité du `generationConfig` du fournisseur est appliquée **atomiquement**
   - **La couche fournisseur est complètement imperméable** — les couches inférieures (CLI, env, paramètres) ne participent pas du tout à la résolution du generationConfig
   - Tous les champs définis dans `modelProviders[].generationConfig` utilisent les valeurs du fournisseur
   - Tous les champs **non définis** par le fournisseur sont définis sur `undefined` (non hérités des paramètres)
   - Cela garantit que les configurations du fournisseur agissent comme un « paquet scellé » complet et autonome

   Si un modèle est répertorié dans `modelProviders`, placez tous les paramètres de génération spécifiques au modèle dans l'entrée du fournisseur correspondante. Les valeurs `model.generationConfig` de premier niveau, y compris `contextWindowSize`, `modalities`, `customHeaders` et `extra_body`, sont ignorées pour les modèles fournis par un fournisseur. Configurez ces champs sous `modelProviders[authType][].generationConfig` pour qu'ils soient appliqués.

2. **Lorsqu'AUCUN modèle modelProvider n'est sélectionné** (par exemple, en utilisant `--model` avec un ID de modèle brut, ou en utilisant directement CLI/env/paramètres) :
   - La résolution passe aux couches inférieures
   - Les champs sont remplis depuis CLI → env → paramètres → valeurs par défaut
   - Cela crée un **modèle d'exécution** (voir la section suivante)

### Précédence par champ pour `generationConfig`

| Priorité | Source                                        | Comportement                                                                                             |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Remplacements programmatiques                 | Modifications d'exécution `/model`, `/auth`                                                              |
| 2        | `modelProviders[authType][].generationConfig` | **Couche imperméable** - remplace complètement tous les champs de generationConfig ; les couches inférieures ne participent pas |
| 3        | `settings.model.generationConfig`             | Utilisé uniquement pour les **modèles d'exécution** (lorsqu'aucun modèle de fournisseur n'est sélectionné) |
| 4        | Valeurs par défaut du générateur de contenu   | Valeurs par défaut spécifiques au fournisseur (ex. OpenAI vs Gemini) - uniquement pour les modèles d'exécution |

### Valeurs dynamiques dans `customHeaders` [#dynamic-values-in-customheaders]

Une valeur `customHeaders` peut contenir l'espace réservé `${session_id}`, qui est développé à chaque requête avec l'identifiant de session Qwen Code actuel. Utilisez-le pour les passerelles qui exigent un identifiant stable par conversation — OpenCode Go, par exemple, rejette les requêtes sans `x-opencode-session` :

```json
{
  "generationConfig": {
    "customHeaders": {
      "x-opencode-session": "${session_id}"
    }
  }
}
```

Comme la valeur est résolue à chaque requête plutôt que figée dans le client SDK, `/new` et `/resume` font tourner cette valeur sans redémarrage.

⚠️ **Deux étapes sont nécessaires.** L'entrée du fournisseur ci-dessus n'en constitue que la moitié — un espace réservé reste inerte tant que vous n'activez pas également [`outboundCorrelation.allowDynamicHeaderValues`](./settings.md#outboundcorrelation) :

```json
{
  "outboundCorrelation": {
    "allowDynamicHeaderValues": true
  }
}
```

Tant que ce n'est pas fait, une valeur contenant un espace réservé est **supprimée** plutôt qu'envoyée, et Qwen Code affiche un avertissement au démarrage indiquant le nom de l'en-tête et ce paramètre. L'en-tête n'est jamais envoyé avec un `${session_id}` littéral dedans.

**Un en-tête est réservé.** Sur les points de terminaison MaaS de QwenCloud — les entrées `/auth` `China — Qianwen AI Platform` et `International — QwenCloud` — Qwen Code possède `X-DashScope-Source-Config` et y écrit la valeur d'attribution première partie. Une entrée portant ce nom — quelle que soit sa casse — est supprimée avant la construction de la requête, donc un espace réservé `${session_id}` ne survit jamais et `allowDynamicHeaderValues` ne change rien à cela. L'en-tête lui-même est toujours envoyé ; seule votre valeur est remplacée. Voir [`customHeaders`](./settings.md#model) pour la même règle énoncée du côté des paramètres.

Le commutateur est global car il s'agit d'une décision de consentement, distincte de _l'endroit_ où va la valeur : une valeur développée transporte l'état de session en direct vers quiconque la reçoit, et le commutateur contrôle uniquement si `${session_id}` peut être développé. Il n'identifie pas quelle source de paramètres a fourni l'en-tête.

**Note sur la confidentialité :** l'identifiant de session est un identifiant stable pour la durée d'une conversation, donc tout hôte auquel vous l'envoyez peut regrouper toutes les requêtes de cette conversation. Quels hôtes sont concernés dépend des entrées de fournisseur qui portent l'en-tête — il n'y a pas de liste d'hôtes séparée à maintenir en synchronisation avec votre `baseUrl`.

### Traitement atomique des champs

Les champs suivants sont traités comme des objets atomiques : les valeurs du fournisseur remplacent complètement l'objet entier, aucune fusion n'est effectuée :

- `samplingParams` - Température, top_p, max_tokens, etc.
- `customHeaders` - En-têtes HTTP personnalisés (peuvent contenir `${session_id}` ; voir [Valeurs dynamiques](#dynamic-values-in-customheaders))
- `extra_body` - Paramètres supplémentaires du corps de la requête

### Exemple

```jsonc
// User settings (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders configuration
{
  "modelProviders": {
    "openai": [{
      "id": "gpt-4o",
      "envKey": "OPENAI_API_KEY",
      "generationConfig": {
        "timeout": 60000,
        "samplingParams": { "temperature": 0.2 }
      }
    }]
  }
}
```

Lorsque `gpt-4o` est sélectionné dans modelProviders :

- `timeout` = 60000 (provenant du fournisseur, remplace les paramètres)
- `samplingParams.temperature` = 0.2 (provenant du fournisseur, remplace complètement l'objet de paramètres)
- `samplingParams.max_tokens` = **undefined** (non défini dans le fournisseur, et la couche fournisseur n'hérite pas des paramètres — les champs sont explicitement définis sur undefined s'ils ne sont pas fournis)

Lors de l'utilisation d'un modèle brut via `--model gpt-4` (non issu de modelProviders, crée un Runtime Model) :

- `timeout` = 30000 (provenant des paramètres)
- `samplingParams.temperature` = 0.5 (provenant des paramètres)
- `samplingParams.max_tokens` = 1000 (provenant des paramètres)

La stratégie de fusion pour `modelProviders` lui-même est REPLACE : l'intégralité de `modelProviders` provenant des paramètres du projet écrasera la section correspondante dans les paramètres utilisateur, au lieu de fusionner les deux.

## Configuration du raisonnement / thinking

Le champ optionnel `reasoning` sous `generationConfig` contrôle l'intensité avec laquelle le modèle raisonne avant de répondre. Les convertisseurs Anthropic et Gemini le respectent toujours. Le pipeline compatible OpenAI le respecte **sauf si** `generationConfig.samplingParams` est défini. Les modèles GPT-5 connus et GPT-6 Astra font exception : les clés d'échantillage non liées ne suppriment pas l'effort configuré. Voir « Interaction avec `samplingParams` » ci-dessous.

```jsonc
{
  "modelProviders": {
    "openai": [
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "baseUrl": "https://api.deepseek.com/v1",
        "envKey": "DEEPSEEK_API_KEY",
        "generationConfig": {
          // The effort tiers:
          //   'low'    — lightest reasoning
          //   'medium' | 'xhigh' — mapped to 'high' on DeepSeek
          //   'high'   — default reasoning intensity
          //   'max'    — DeepSeek-specific extra-strong tier
          // Or set `false` to disable reasoning entirely.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### Comportement par fournisseur

| Protocole / fournisseur                         | Forme sur le fil                                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope** (famille `qwen3.8-max`) | Paramètre de corps plat `reasoning_effort: <effort>` | Les paliers `/effort` sont transmis pour tout identifiant de modèle commençant par `qwen3.8-max` (y compris les instantanés datés et les alias `-latest`), les préversions `qwen-latest-series-invite-*` sur invitation uniquement, et la famille `qwen4*` (insensible à la casse) ; DashScope applique toute correspondance spécifique au modèle. L'échelle de cette famille s'arrête à `xhigh`, donc un `max` configuré est plafonné à `xhigh` (journalisé une fois) plutôt que d'être envoyé et rejeté. Un `reasoning_effort` explicite dans `samplingParams` ou `extra_body` est une substitution verbatim et n'est pas plafonné. En cas de conflit entre `reasoning_effort` et `thinking_budget`, la priorité normale `extra_body` > `samplingParams` > `reasoning` ne conserve que le champ de plus haute priorité ; une paire explicite au même niveau conserve `reasoning_effort`, correspondant au comportement du fournisseur avant la résolution inter-niveaux. Si un champ statique l'emporte, `/effort` signale ce champ au lieu de laisser entendre que le palier demandé est effectif. Lorsqu'un palier d'effort l'emporte, un `enable_thinking` conflictuel est également supprimé. Un `enable_thinking: false` explicite dans `extra_body` est honoré plutôt que supprimé : il remplace le palier configuré comme `reasoning_effort: 'none'`, l'un des rares cas où `extra_body` ne l'emporte pas verbatim. Les autres modèles Qwen continuent de mapper un effort sélectionné vers `enable_thinking: true` ; une substitution `reasoning_effort` passe en l'état sauf si elle entre en conflit avec un `thinking_budget` (une paire que DashScope rejette), auquel cas le `reasoning_effort` inerte est supprimé et à la fois `enable_thinking` et `thinking_budget` subsistent. |
| **OpenAI / DeepSeek** (`api.deepseek.com`) | Paramètre de corps plat `reasoning_effort: <effort>` | Lorsque `reasoning.effort` est défini dans la forme de configuration imbriquée, il est réécrit en `reasoning_effort` plat ; pour les modèles DeepSeek intégrés, `'low'`, `'high'` et `'max'` passent en l'état et `'medium'`/`'xhigh'` sont normalisés vers `'high'` — reflétant le [mappage d'effort](https://api-docs.deepseek.com/guides/thinking_mode) de DeepSeek. Ce passage en l'état et cette normalisation décrivent le point de terminaison officiel : sur MaaS et les hôtes tiers, les identifiants exacts `deepseek-v4-pro` / `deepseek-v4-flash` n'offrent que `high`/`max` (un `low` configuré est élevé à `high`, et `xhigh` se normalise vers `max`), tandis que les nouveaux alias Flash (`deepseek-v4.1-flash*`) conservent `low`/`high`/`max` avec `xhigh → high`. Les substitutions `samplingParams.reasoning_effort` ou `extra_body.reasoning_effort` de premier niveau ignorent cette normalisation et sont envoyées verbatim. `max` est accepté sur un vrai nom d'hôte DeepSeek et sur tout identifiant de modèle `deepseek-v4*` (insensible à la casse, y compris les instantanés datés), qui est reconnu sur tout hôte compatible OpenAI (les passerelles tierces obtiennent le contrat style MaaS `enable_thinking`) ; les autres modèles nommés `deepseek` sur un autre hôte conservent le plafond générique `xhigh`, correspondant à la restriction par nom d'hôte lors de la restructuration elle-même. |
| **OpenAI / Z.ai** (`z.ai`, `bigmodel.cn`)     | Paramètre de corps plat `reasoning_effort: <effort>`                                         | GLM-5.2+ sur un hôte Z.ai accepte l'échelle complète, y compris `max`, et le champ imbriqué `reasoning.effort` est réécrit vers le champ plat. Les identifiants GLM plus anciens, ainsi qu'un modèle `glm-*` atteint sur tout autre hôte, conservent la limite générique `xhigh` : le nom du seul modèle ne dit rien de ce que cet endpoint accepte.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OpenAI** (autres serveurs compatibles)         | GPT-5 / GPT-6 Astra connus : plat `reasoning_effort` ; autres modèles : imbriqué `reasoning`     | L'effort GPT est limité dans les deux sens au sous-ensemble pris en charge pour le modèle connu. GPT-5.6 et GPT-6 Astra permettent `max`, tandis que les modèles antérieurs ont des plafonds plus bas. Les niveaux inférieurs au plancher du modèle sont relevés : GPT-5 Pro n'accepte que `high` ; GPT-5.2 Pro, GPT-5.4 Pro et GPT-5.5 Pro relèvent `low` à `medium`. OpenRouter conserve l'imbriqué `reasoning`. Les noms de modèles inconnus conservent le plafond générique `xhigh` et la forme imbriquée. Les valeurs de raisonnement explicites dans `samplingParams` / `extra_body` contournent la limitation du niveau configuré.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **OpenAI Responses** (`openai-responses`)     | `reasoning: { effort, summary: "auto" }` plus `include: ["reasoning.encrypted_content"]` | Chaque niveau est transmis tel quel sans limitation. `extra_body.enable_thinking: true` est traduit en `reasoning: { effort: "medium" }` lorsqu'aucune valeur explicite `reasoning` n'est définie (et n'est jamais transmise elle-même — elle n'a pas de signification sur ce canal) ; il est préférable de définir directement `reasoning.effort`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Anthropic** (vrai `api.anthropic.com`)      | `output_config: { effort }` plus l'en-tête bêta `effort-2025-11-24`                     | Le vrai Anthropic n'accepte que `'low'`/`'medium'`/`'high'`. `'max'` est **limité à `'high'`** avec une ligne `debugLogger.warn` (une fois par générateur) ; si vous souhaitez un effort maximal, changez le baseURL pour un point de terminaison compatible DeepSeek qui le prend en charge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Anthropic** (`api.deepseek.com/anthropic`)  | Même `output_config: { effort }` + en-tête beta                                           | `'low'`, `'high'` et `'max'` passent sans modification ; `'medium'`/`'xhigh'` sont mappés vers `'high'`, correspondant au mapping côté serveur de DeepSeek.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                  | `thinkingConfig: { includeThoughts: true, thinkingLevel }`                               | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, autres → `THINKING_LEVEL_UNSPECIFIED` (Gemini n'a pas de niveau `MAX`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### `reasoning: false`

Définir `reasoning: false` (le booléen littéral) désactive explicitement la réflexion sur les modèles qui prennent en charge la désactivation — utile pour les requêtes secondaires peu coûteuses qui ne bénéficient pas du raisonnement. Ceci est également respecté au niveau de la requête via `request.config.thinkingConfig.includeThoughts: false` pour les appels ponctuels (par ex. génération de suggestions).

Sur une baseURL `api.deepseek.com`, le pipeline OpenAI émet le champ explicite `thinking: { type: 'disabled' }` requis par DeepSeek V4+ — la valeur par défaut côté serveur est `'enabled'`, donc omettre simplement `reasoning_effort` entraînerait toujours une latence/coût de réflexion. Les backends DeepSeek auto-hébergés (sglang/vllm) et les autres serveurs compatibles OpenAI ne reçoivent **pas** ce champ ; si vous devez désactiver la réflexion sur ceux-ci, injectez `thinking: { type: 'disabled' }` (ou tout paramètre exposé par votre framework d'inférence) via `samplingParams`/`extra_body`. Tout identifiant de modèle `deepseek-v4*` (insensible à la casse) constitue l'exception : sur tout hôte tiers compatible OpenAI, il suit le contrat MaaS et reçoit `enable_thinking: false` lorsque la réflexion est désactivée. Sur toute route nouvellement reconnue (un hôte tiers, ou un nouvel alias sur un hôte établi), une déclaration héritée `capabilities.reasoning` sans profil de raisonnement conserve sa propre sémantique de transmission : le normaliseur intégré se retire et n'aplatit ni ne remappe les efforts déclarés ou statiques. Une déclaration doit nommer le paramètre que le modèle lit dans `disableField` (`thinking`, `enable_thinking`, ou `reasoning_effort`) ; celle qui l'omette ne résout aucune capacité, donc aucun champ de désactivation n'est émis et la valeur par défaut du serveur (réflexion activée) s'applique.

Pour les modèles GPT connus qui permettent la désactivation, les points de terminaison non-OpenRouter reçoivent `reasoning_effort: 'none'` ; OpenRouter reçoit à la place `reasoning: { enabled: false }` imbriqué. Les modèles à réflexion obligatoire rejettent la désactivation dans les contrôles de modèle et omettent les valeurs de désactivation non prises en charge des requêtes, donc `reasoning: false` ne peut pas désactiver leur réflexion. Une capacité de raisonnement explicite du modèle l'emporte sur la liste de niveaux intégrée et sélectionne le champ de désactivation natif ; OpenRouter conserve son comportement de désactivation au niveau du fournisseur. L'ensemble obligatoire intégré est `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.2-codex`, `gpt-5.3-codex`, `gpt-5.2-pro`, `gpt-5.4-pro`, `gpt-5.5-pro` et `gpt-6-astra`.

Sur un baseURL `openrouter.ai`, le pipeline OpenAI émet le champ `reasoning: { enabled: false }` au niveau du fournisseur d'OpenRouter lorsque le raisonnement est désactivé. Les modèles à réflexion obligatoire ne reçoivent pas ce champ de désactivation. Les autres serveurs compatibles OpenAI ne reçoivent pas automatiquement ce champ spécifique à OpenRouter ; utilisez leur knob de désactivation natif.

### Interaction avec `samplingParams` (compatible OpenAI uniquement)

> [!warning]
>
> Sauf pour les modèles GPT connus et les modèles avec des capacités de raisonnement explicites, lorsque `generationConfig.samplingParams` est défini sur un fournisseur compatible OpenAI, le pipeline envoie ces clés sur le fil **telles quelles** et ignore complètement l'injection séparée de `reasoning`. Ainsi, une configuration comme `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` supprimera silencieusement le champ reasoning sur les requêtes OpenAI/DeepSeek. Un objet `reasoning` placé dans `samplingParams` est votre propre valeur et est envoyé inchangé tandis que le raisonnement est activé : le plafond d'effort ci-dessus s'applique uniquement au niveau que le pipeline injecte depuis `/effort`.
>
> Les modèles GPT-5 connus et GPT-6 Astra conservent l'effort configuré aux côtés de clés d'échantillage non liées. Par exemple, `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` envoie `temperature: 0.5` et `reasoning_effort: 'xhigh'` plat sur GPT-5.4, ou `'max'` sur GPT-5.6 / GPT-6 Astra. Sur un baseURL `openrouter.ai`, le même niveau limité est envoyé sous forme de `reasoning: { effort }` imbriqué à la place. Sur les points de terminaison non-OpenRouter, les remplacements plats explicites l'emportent ; les placeholders plats null ou vides permettent le niveau configuré. Sur OpenRouter, un remplacement plat d'échantillage supprime l'effort imbriqué configuré sauf si des capacités de modèle explicites l'injectent ; un remplacement plat extra-body uniquement ne remplace pas l'effort imbriqué configuré.
>
> Les modèles Qwen DashScope constituent une autre exception : leur fournisseur lit directement `reasoning` et le mappe vers `reasoning_effort` ou `enable_thinking`. Sur les familles à effort hiérarchisé (`qwen3.8-max`, `qwen-latest-series-invite-*`, `qwen4*`), les champs spécifiques au fournisseur `samplingParams` ont toujours la priorité lorsque les paramètres de transmission entrent en conflit ; sur les hybrides qwen plus anciens, un niveau d'effort configuré se réduit à `enable_thinking: true`, ce qui écrase une valeur `samplingParams.enable_thinking`.
>
> Pour les autres modèles, incluez le knob de raisonnement du fournisseur directement lorsque vous utilisez `samplingParams` — pour DeepSeek c'est `samplingParams.reasoning_effort`. Les modèles GPT connus mappent l'effort configuré automatiquement ; n'ajoutez un remplacement brut que lorsque vous contournez intentionnellement ce mappage. Le `reasoning` imbriqué brut, y compris `null`, reste un remplacement d'objet entier tandis que le raisonnement est activé. La désactivation via `reasoning: false` ou `includeThoughts: false` au niveau de la requête supprime la valeur imbriquée, y compris les remplacements bruts dans les deux couches. Les requêtes GPT non-OpenRouter envoient alors `reasoning_effort: 'none'` lorsque la désactivation est autorisée ; OpenRouter utilise son champ de désactivation imbriqué à la place. Les modèles à réflexion obligatoire ne reçoivent ni substitut. En dehors d'OpenRouter, sa signification dépend de la passerelle, donc les contrôles de modèle affichent la valeur par défaut du modèle. Tout remplacement brut qui bloque un niveau configuré fait échouer un changement explicite de niveau sans enregistrer de préférence. Le switch de réflexion restaure les valeurs brutes configurées par défaut après la désactivation uniquement lorsqu'elles permettent la réflexion. Si l'état brut ou la valeur par défaut de raisonnement configurée est désactivée, le switch de réflexion ne peut pas être activé et la préférence enregistrée est conservée. Cela s'applique également lorsque des capacités explicites omettent un niveau par défaut ou n'exposent qu'un toggle de réflexion. Une commande par défaut explicite réinitialise toujours la préférence. Supprimez le remplacement brut bloquant pour choisir un niveau différent.
>
> Les convertisseurs Anthropic et Gemini ne sont pas affectés — ils lisent toujours `reasoning.effort` directement, indépendamment de `samplingParams`.

### `budget_tokens`

Vous pouvez définir un budget exact de tokens de réflexion en incluant `budget_tokens` à côté de `effort` :

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Pour Anthropic, cela devient `thinking.budget_tokens`. Pour OpenAI/DeepSeek, le champ est conservé mais actuellement ignoré par le serveur — `reasoning_effort` est le knob déterminant.

## Modèles Provider vs Modèles Runtime

Qwen Code fait la distinction entre deux types de configurations de modèle :

### Modèle Provider

- Défini dans la configuration `modelProviders`
- Possède un package de configuration complet et atomique
- Lorsqu'il est sélectionné, sa configuration est appliquée comme une couche imperméable
- Apparaît dans la liste de commandes `/model` avec toutes les métadonnées (nom, description, capacités)
- Recommandé pour les workflows multi-modèles et la cohérence d'équipe

### Modèle Runtime

- Créé dynamiquement lors de l'utilisation d'IDs de modèle bruts via CLI (`--model`), variables d'environnement ou paramètres
- Non défini dans `modelProviders`
- La configuration est construite en « projetant » à travers les couches de résolution (CLI → env → settings → valeurs par défaut)
- Automatiquement capturé comme un **RuntimeModelSnapshot** lorsqu'une configuration complète est détectée
- Permet la réutilisation sans ressaisir les identifiants

### Cycle de vie du RuntimeModelSnapshot

Lorsque vous configurez un modèle sans utiliser `modelProviders`, Qwen Code crée automatiquement un RuntimeModelSnapshot pour préserver votre configuration :

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Le snapshot :

- Capture l'ID du modèle, la clé API, l'URL de base et la configuration de génération
- Persiste entre les sessions (stocké en mémoire pendant l'exécution)
- Apparaît dans la liste des commandes `/model` comme une option d'exécution
- Peut être activé en utilisant `/model $runtime|openai|my-custom-model`

### Différences clés

| Aspect                  | Modèle Provider                    | Modèle Runtime                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Source de configuration    | `modelProviders` dans les paramètres      | Couches CLI, env, paramètres                  |
| Atomicité de la configuration | Package complet et imperméable     | En couches, chaque champ résolu indépendamment |
| Réutilisabilité             | Toujours disponible dans la liste `/model` | Capturé en tant que snapshot, apparaît si complet  |
| Partage en équipe            | Oui (via les paramètres commités)      | Non (local à l'utilisateur)                            |
| Stockage des identifiants      | Référence via `envKey` uniquement       | Peut capturer la clé réelle dans le snapshot         |

### Quand utiliser chacun

- **Utilisez les Modèles Provider** lorsque : vous avez des modèles standard partagés dans une équipe, avez besoin de configurations cohérentes, ou souhaitez éviter les remplacements accidentels
- **Utilisez les Modèles Runtime** lorsque : vous testez rapidement un nouveau modèle, utilisez des identifiants temporaires, ou travaillez avec des points de terminaison ad hoc

## Persistance de la sélection et recommandations

> [!important]
>
> Définissez `modelProviders` dans le scope utilisateur `~/.qwen/settings.json` dans la mesure du possible et évitez de persister les remplacements d'identifiants dans n'importe quel scope. Conserver le catalogue de providers dans les paramètres utilisateur évite les conflits de fusion/remplacement entre les scopes projet et utilisateur, et garantit que les mises à jour de `/auth` et `/model` sont toujours réécrites dans un scope cohérent.

- `/model` et `/auth` persistent `model.name` (lorsque applicable) et `security.auth.selectedType` dans le scope inscriptible le plus proche qui définit déjà `modelProviders` ; sinon, ils reviennent au scope utilisateur. Cela maintient les fichiers workspace/utilisateur synchronisés avec le catalogue de providers actif.
- Sans `modelProviders`, le résolveur mélange les couches CLI/env/paramètres, créant des Runtime Models. C'est acceptable pour les configurations à provider unique, mais fastidieux lors de changements fréquents. Définissez des catalogues de providers chaque fois que les workflows multi-modèles sont courants afin que les changements restent atomiques, attribués à une source et débogables.

# Fournisseurs de modèles

Qwen Code vous permet de configurer plusieurs fournisseurs de modèles via le paramètre `modelProviders` dans votre `settings.json`. Cela vous permet de basculer entre différents modèles et fournisseurs d'IA en utilisant la commande `/model`.

## Vue d'ensemble

Utilisez `modelProviders` pour déclarer des modèles par id de fournisseur entre lesquels le sélecteur `/model` peut basculer. Chaque clé est un id de fournisseur et sa valeur est **un tableau de définitions de modèles** (`ModelConfig[]`). Pour les fournisseurs intégrés, la clé doit être un type d'authentification valide (`openai`, `anthropic`, `gemini`, `vertex-ai`) ; un id de fournisseur personnalisé (par ex. `idealab`) est autorisé tant que vous le mappez à un protocole via le paramètre de niveau supérieur [`providerProtocol`](#custom-provider-ids-providerprotocol). Chaque entrée de modèle nécessite un `id` ; `envKey` est **facultatif mais recommandé** (lorsqu'il est omis, il revient à la clé d'environnement par défaut du type d'authentification, par ex. `OPENAI_API_KEY` pour `openai`), avec des champs facultatifs `name`, `description`, `baseUrl` et `generationConfig`. Les identifiants ne sont jamais enregistrés dans les paramètres ; le runtime les lit depuis `process.env[envKey]`. Les modèles Qwen OAuth restent codés en dur et ne peuvent pas être remplacés.

> [!note]
>
> Les versions précédentes enveloppaient les modèles de chaque fournisseur dans un objet `{ "protocol": ..., "models": [...] }`. Cette forme a été abandonnée — la valeur actuelle est le tableau nu `ModelConfig[]` montré tout au long de cette page. Une entrée enveloppée dans un fichier de paramètres déjà migré (`$version: 4`) est silencieusement ignorée, donc mettez à jour toutes les anciennes configurations vers la forme tableau.

> [!note]
>
> Seule la commande `/model` expose les types d'authentification non par défaut. Anthropic, Gemini, etc., doivent être définis via `modelProviders`. La commande `/auth` liste trois options de premier niveau : **Alibaba ModelStudio** (avec Coding Plan, Token Plan et Standard API Key dans son sous-menu), **Third-party Providers** et **Custom Provider**. (Qwen OAuth n'est plus une entrée de dialogue sélectionnable ; son niveau gratuit a été interrompu le 15 avril 2026.)

> [!note]
>
> **Unicité des modèles :** Les modèles au sein du même `authType` sont identifiés de manière unique par la combinaison de `id` + `baseUrl`. Cela signifie que vous pouvez définir le même ID de modèle (par ex. `"gpt-4o"`) plusieurs fois sous un seul `authType`, tant que chaque entrée a une `baseUrl` différente — par exemple, l'une pointant directement vers OpenAI et l'autre vers un point de terminaison proxy. Si deux entrées partagent le même `id` et la même `baseUrl` (ou si les deux omettent `baseUrl`), la première occurrence l'emporte et les doublons suivants sont ignorés avec un avertissement.

## Exemples de configuration par type d'authentification

Vous trouverez ci-dessous des exemples de configuration complets pour différents types d'authentification, montrant les paramètres disponibles et leurs combinaisons.

### Types d'authentification pris en charge

Les clés de l'objet `modelProviders` doivent être des valeurs `authType` valides. Les types d'authentification actuellement pris en charge sont :

| Auth Type    | Description                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | API compatibles avec OpenAI (OpenAI, Azure OpenAI, serveurs d'inférence locaux comme vLLM/Ollama)                                               |
| `anthropic`  | API Anthropic Claude                                                                                                                            |
| `gemini`     | API Google Gemini                                                                                                                               |
| `qwen-oauth` | Qwen OAuth (codé en dur, ne peut pas être remplacé dans `modelProviders`)                                                                       |
| `vertex-ai`  | Google Vertex AI (utilise le protocole `gemini` et le SDK `@google/genai` en mode Vertex AI ; sa sélection définit `GOOGLE_GENAI_USE_VERTEXAI=true`) |

> [!warning]
> Un id de fournisseur qui n'est ni un protocole intégré ni mappé via `providerProtocol` (par ex. une faute de frappe comme `"openai-custom"`) ne peut pas être routé, donc son entrée entière est **ignorée** avec un avertissement — ses modèles n'apparaîtront simplement pas dans le sélecteur `/model`. Utilisez l'une des valeurs de type d'authentification prises en charge ci-dessus pour les fournisseurs intégrés, ou ajoutez un mapping [`providerProtocol`](#custom-provider-ids-providerprotocol) pour un id personnalisé.

### Ids de fournisseurs personnalisés (`providerProtocol`)

Les ids de fournisseurs intégrés (`openai`, `gemini`, `anthropic`, `vertex-ai`, `qwen-oauth`) sont routés automatiquement vers leur protocole SDK. Pour utiliser un id de fournisseur **personnalisé** — par exemple pour regrouper plusieurs endpoints compatibles OpenAI sous un nom plus convivial — déclarez-le sous `modelProviders` et mappez-le à un protocole intégré avec le paramètre de niveau supérieur `providerProtocol` :

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

### SDK utilisés pour les requêtes API

Qwen Code utilise les SDK officiels suivants pour envoyer des requêtes à chaque fournisseur :

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - SDK officiel OpenAI pour Node.js             |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK officiel Anthropic |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK officiel Google GenAI      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) avec un fournisseur personnalisé (compatible DashScope) |

Cela signifie que la `baseUrl` que vous configurez doit être compatible avec le format d'API attendu par le SDK correspondant. Par exemple, lors de l'utilisation du type d'authentification `openai`, le point de terminaison doit accepter les requêtes au format de l'API OpenAI.

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

### Anthropic (`anthropic`)

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

Pour les serveurs locaux qui ne nécessitent pas d'authentification, vous pouvez utiliser n'importe quelle valeur fictive pour la clé API :

```bash
# Pour Ollama (aucune authentification requise)
export OLLAMA_API_KEY="ollama"

# Pour vLLM (si aucune authentification n'est configurée)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Le paramètre `extra_body` est **uniquement pris en charge pour les fournisseurs compatibles avec OpenAI** (`openai`, `qwen-oauth`). Il est ignoré pour les fournisseurs Anthropic et Gemini.

> [!note]
>
> **À propos de `envKey`** : Le champ `envKey` spécifie le **nom d'une variable d'environnement**, et non la valeur réelle de la clé API. Pour que la configuration fonctionne, vous devez vous assurer que la variable d'environnement correspondante est définie avec votre véritable clé API. Il y a deux façons de procéder :
>
> - **Option 1 : Utiliser un fichier `.env`** (recommandé pour des raisons de sécurité) :
>   ```bash
>   # ~/.qwen/.env (ou racine du projet)
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
## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan fournit un ensemble préconfiguré de modèles Qwen optimisés pour les tâches de codage. Cette fonctionnalité est disponible pour les utilisateurs disposant d'un accès API à Alibaba Cloud Coding Plan et offre une expérience de configuration simplifiée avec des mises à jour automatiques de la configuration des modèles.

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
- Basculer automatiquement vers le premier modèle de la configuration mise à jour

Le processus de mise à jour garantit que vous avez toujours accès aux dernières configurations et fonctionnalités des modèles sans intervention manuelle.

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

\*Lorsqu'ils sont présents, les indicateurs d'authentification CLI remplacent les paramètres. Sinon, `security.auth.selectedType` ou la valeur par défaut implicite détermine le type d'authentification. Qwen OAuth et OpenAI sont les seuls types d'authentification exposés sans configuration supplémentaire.

> [!note]
>
> `--openai-api-key` et `--openai-base-url` sont les seuls indicateurs CLI pour les identifiants. Ils s'appliquent au fournisseur compatible OpenAI actif, quel que soit son nom — il n'y a pas d'indicateurs d'identifiants `--anthropic-*` / `--gemini-*`. Les identifiants spécifiques au fournisseur qui ne sont pas passés en CLI sont résolus à partir des variables d'environnement (voir la ligne ci-dessous).

> [!warning]
>
> **Obsolescence de `security.auth.apiKey` et `security.auth.baseUrl` :** La configuration directe des identifiants API via `security.auth.apiKey` et `security.auth.baseUrl` dans `settings.json` est obsolète. Ces paramètres étaient utilisés dans les versions historiques pour les identifiants saisis via l'interface utilisateur, mais le flux de saisie des identifiants a été supprimé dans la version 0.10.1. Ces champs seront entièrement supprimés dans une prochaine version. **Il est fortement recommandé de migrer vers `modelProviders`** pour toutes les configurations de modèles et d'identifiants. Utilisez `envKey` dans `modelProviders` pour référencer des variables d'environnement pour une gestion sécurisée des identifiants, au lieu de coder en dur les identifiants dans les fichiers de paramètres.

## Empilement de la configuration de génération : La couche fournisseur imperméable

La résolution de la configuration suit un modèle d'empilement strict avec une règle cruciale : **la couche modelProvider est imperméable**.

### Fonctionnement

1. **Lorsqu'un modèle modelProvider EST sélectionné** (par exemple, via la commande `/model` en choisissant un modèle configuré par le fournisseur) :
   - L'intégralité du `generationConfig` du fournisseur est appliquée **atomiquement**
   - **La couche fournisseur est complètement imperméable** — les couches inférieures (CLI, env, paramètres) ne participent pas du tout à la résolution du generationConfig
   - Tous les champs définis dans `modelProviders[].generationConfig` utilisent les valeurs du fournisseur
   - Tous les champs **non définis** par le fournisseur sont définis sur `undefined` (non hérités des paramètres)
   - Cela garantit que les configurations du fournisseur agissent comme un « paquet scellé » complet et autonome

   Si un modèle est listé dans `modelProviders`, placez tous les paramètres
   de génération spécifiques au modèle dans l'entrée du fournisseur correspondante. Les valeurs
   `model.generationConfig` de niveau supérieur, y compris `contextWindowSize`,
   `modalities`, `customHeaders` et `extra_body`, sont ignorées pour les modèles
   du fournisseur. Configurez ces champs sous
   `modelProviders[authType][].generationConfig` pour qu'ils s'appliquent.

2. **Lorsqu'AUCUN modèle modelProvider n'est sélectionné** (par exemple, en utilisant `--model` avec un ID de modèle brut, ou en utilisant directement CLI/env/paramètres) :
   - La résolution passe aux couches inférieures
   - Les champs sont remplis depuis CLI → env → paramètres → valeurs par défaut
   - Cela crée un **modèle d'exécution** (voir la section suivante)

### Priorité par champ pour le generationConfig

| Priorité | Source                                        | Comportement                                                                                             |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Remplacements programmatiques                 | Modifications d'exécution `/model`, `/auth`                                                              |
| 2        | `modelProviders[authType][].generationConfig` | **Couche imperméable** - remplace complètement tous les champs de generationConfig ; les couches inférieures ne participent pas |
| 3        | `settings.model.generationConfig`             | Utilisé uniquement pour les **modèles d'exécution** (lorsqu'aucun modèle de fournisseur n'est sélectionné) |
| 4        | Valeurs par défaut du générateur de contenu   | Valeurs par défaut spécifiques au fournisseur (ex. OpenAI vs Gemini) - uniquement pour les modèles d'exécution |

### Traitement atomique des champs

Les champs suivants sont traités comme des objets atomiques : les valeurs du fournisseur remplacent complètement l'objet entier, aucune fusion n'est effectuée :

- `samplingParams` - Température, top_p, max_tokens, etc.
- `customHeaders` - En-têtes HTTP personnalisés
- `extra_body` - Paramètres supplémentaires du corps de la requête

### Exemple
```jsonc
// Paramètres utilisateur (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// Configuration de modelProviders
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

Lorsque `gpt-4o` est sélectionné depuis `modelProviders` :

- `timeout` = 60000 (provenant du provider, écrase les paramètres)
- `samplingParams.temperature` = 0.2 (provenant du provider, remplace complètement l'objet settings)
- `samplingParams.max_tokens` = **undefined** (non défini dans le provider, et la couche provider n'hérite pas des paramètres — les champs sont explicitement définis sur undefined s'ils ne sont pas fournis)

Lors de l'utilisation d'un modèle brut via `--model gpt-4` (ne provenant pas de `modelProviders`, crée un Runtime Model) :

- `timeout` = 30000 (provenant des paramètres)
- `samplingParams.temperature` = 0.5 (provenant des paramètres)
- `samplingParams.max_tokens` = 1000 (provenant des paramètres)

La stratégie de fusion pour `modelProviders` lui-même est REPLACE : l'intégralité de `modelProviders` provenant des paramètres du projet écrasera la section correspondante dans les paramètres utilisateur, au lieu de fusionner les deux.

## Configuration du raisonnement / thinking

Le champ optionnel `reasoning` sous `generationConfig` contrôle l'intensité avec laquelle le modèle raisonne avant de répondre. Les convertisseurs Anthropic et Gemini le respectent toujours. Le pipeline compatible OpenAI le respecte **sauf si** `generationConfig.samplingParams` est défini — voir la mise en garde « Interaction avec `samplingParams` » ci-dessous.

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
          // L'échelle à quatre niveaux :
          //   'low'    | 'medium' — mappé côté serveur à 'high' sur DeepSeek
          //   'high'   — intensité de raisonnement par défaut
          //   'max'    — niveau extra-fort spécifique à DeepSeek
          // Ou définir sur `false` pour désactiver complètement le raisonnement.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### Comportement par provider

| Protocole / provider                          | Format réseau                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope** (famille `qwen3.8-max`) | Paramètre de corps plat `reasoning_effort: <effort>`                     | Les cinq niveaux de `/effort` (`low`, `medium`, `high`, `xhigh`, `max`) sont transmis tels quels pour tout id de modèle commençant par `qwen3.8-max` (y compris les snapshots datés et les alias `-latest`) ; DashScope applique tout mappage spécifique au modèle. Pour cette famille, le niveau est envoyé seul : un `enable_thinking` ou `thinking_budget` conflictuel est abandonné (warn-log, une fois par générateur) — DashScope rejette les requêtes combinant `reasoning_effort` avec `thinking_budget`, et deux contrôles de réflexion ne devraient pas être envoyés ensemble. Un `enable_thinking: false` explicite dans `extra_body` est honoré au lieu d'être abandonné : il remplace le niveau configuré comme `reasoning_effort: 'none'`, l'un des rares endroits où `extra_body` ne l'emporte pas tel quel. Les autres modèles Qwen continuent de mapper un effort sélectionné vers `enable_thinking: true` ; un override `reasoning_effort` y passe sauf s'il entre en conflit avec un `thinking_budget` (une paire que DashScope rejette), auquel cas le `reasoning_effort` inerte est abandonné et `enable_thinking` et `thinking_budget` survivent. |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | Paramètre de corps plat `reasoning_effort: <effort>`                     | Lorsque `reasoning.effort` est défini dans la forme de configuration imbriquée, il est réécrit en `reasoning_effort` plat et `'low'`/`'medium'` sont normalisés en `'high'`, `'xhigh'` en `'max'` — reflétant la [rétrocompatibilité côté serveur](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) de DeepSeek. Les overrides de `samplingParams.reasoning_effort` ou `extra_body.reasoning_effort` de haut niveau ignorent cette normalisation et sont envoyés tels quels. |
| **OpenAI** (autres serveurs compatibles)        | `reasoning: { effort, ... }` transmis tel quel                 | Défini via `samplingParams` (par ex. `samplingParams.reasoning_effort` pour GPT-5/o-series) lorsque le provider attend un format différent.                                                                                                                                                                                                                                                                                                |
| **Anthropic** (vrai `api.anthropic.com`)     | `output_config: { effort }` plus l'en-tête bêta `effort-2025-11-24` | Le vrai Anthropic accepte uniquement `'low'`/`'medium'`/`'high'`. `'max'` est **limité à `'high'`** avec une ligne `debugLogger.warn` (une fois par générateur) ; si vous voulez une intensité maximale, changez le baseURL pour un point de terminaison compatible DeepSeek qui le prend en charge.                                                                                                                                                                                  |
| **Anthropic** (`api.deepseek.com/anthropic`) | Même `output_config: { effort }` + en-tête bêta                       | `'max'` est transmis sans modification.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, autres → `THINKING_LEVEL_UNSPECIFIED` (Gemini n'a pas de niveau `MAX`).                                                                                                                                                                                                                                                                                                                    |

### `reasoning: false`

Définir `reasoning: false` (le booléen littéral) désactive explicitement la réflexion sur tous les providers — utile pour les requêtes secondaires peu coûteuses qui ne bénéficient pas du raisonnement. Ceci est également respecté au niveau de la requête via `request.config.thinkingConfig.includeThoughts: false` pour les appels ponctuels (par ex. génération de suggestions).

Sur un baseURL `api.deepseek.com`, le pipeline OpenAI émet le champ explicite `thinking: { type: 'disabled' }` requis par DeepSeek V4+ — la valeur par défaut côté serveur est `'enabled'`, donc omettre simplement `reasoning_effort` paierait tout de même la latence/coût de la réflexion. Les backends DeepSeek auto-hébergés (sglang/vllm) et les autres serveurs compatibles OpenAI ne reçoivent **pas** ce champ ; si vous devez désactiver la réflexion sur ceux-ci, injectez `thinking: { type: 'disabled' }` (ou tout autre paramètre exposé par votre framework d'inférence) via `samplingParams`/`extra_body`.

### Interaction avec `samplingParams` (compatible OpenAI uniquement)

> [!warning]
>
> Lorsque `generationConfig.samplingParams` est défini sur un provider compatible OpenAI, le pipeline envoie ces clés sur le fil **telles quelles** et ignore complètement l'injection séparée de `reasoning`. Ainsi, une configuration comme `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` supprimera silencieusement le champ reasoning sur les requêtes OpenAI/DeepSeek.
>
> Si vous définissez `samplingParams`, incluez le paramètre de raisonnement directement à l'intérieur — pour DeepSeek, c'est `samplingParams.reasoning_effort`, pour GPT-5/o-series c'est `samplingParams.reasoning_effort` (leur champ plat) ou `samplingParams.reasoning` (l'objet imbriqué). Pour OpenRouter et d'autres providers, le nom du champ varie ; consultez la documentation du provider.
>
> Les convertisseurs Anthropic et Gemini ne sont pas affectés — ils lisent toujours `reasoning.effort` directement, indépendamment de `samplingParams`.

### `budget_tokens`

Vous pouvez définir un budget exact de tokens de réflexion en incluant `budget_tokens` à côté de `effort` :

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Pour Anthropic, cela devient `thinking.budget_tokens`. Pour OpenAI/DeepSeek, le champ est conservé mais actuellement ignoré par le serveur — `reasoning_effort` est le paramètre principal.

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
- La configuration est construite en « projetant » à travers les couches de résolution (CLI → env → paramètres → défauts)
- Capturé automatiquement en tant que **RuntimeModelSnapshot** lorsqu'une configuration complète est détectée
- Permet la réutilisation sans ressaisir les identifiants

### Cycle de vie du RuntimeModelSnapshot

Lorsque vous configurez un modèle sans utiliser `modelProviders`, Qwen Code crée automatiquement un RuntimeModelSnapshot pour préserver votre configuration :

```bash
# Ceci crée un RuntimeModelSnapshot avec l'ID : $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Le snapshot :

- Capture l'ID du modèle, la clé API, l'URL de base et la configuration de génération
- Persiste à travers les sessions (stocké en mémoire pendant l'exécution)
- Apparaît dans la liste de commandes `/model` en tant qu'option runtime
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

- `/model` et `/auth` persistent `model.name` (lorsque applicable) et `security.auth.selectedType` dans le scope inscriptible le plus proche qui définit déjà `modelProviders` ; sinon, ils reviennent au scope utilisateur. Cela maintient les fichiers d'espace de travail/utilisateur synchronisés avec le catalogue de providers actif.
- Sans `modelProviders`, le résolveur mélange les couches CLI/env/paramètres, créant des Modèles Runtime. C'est acceptable pour les configurations à provider unique, mais fastidieux lors de changements fréquents. Définissez des catalogues de providers chaque fois que les workflows multi-modèles sont courants afin que les changements restent atomiques, attribués à une source et débogables.
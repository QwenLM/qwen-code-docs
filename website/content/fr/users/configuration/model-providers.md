# Fournisseurs de modèles

Qwen Code vous permet de configurer plusieurs fournisseurs de modèles via le paramètre `modelProviders` dans votre `settings.json`. Cela vous permet de basculer entre différents modèles et fournisseurs d'IA à l'aide de la commande `/model`.

## Vue d'ensemble

Utilisez `modelProviders` pour déclarer des listes de modèles prédéfinies par type d'authentification, entre lesquelles le sélecteur `/model` peut basculer. Les clés doivent correspondre à des types d'authentification valides (`openai`, `anthropic`, `gemini`, etc.). Chaque entrée nécessite un `id` et **doit inclure `envKey`**, avec des champs optionnels `name`, `description`, `baseUrl` et `generationConfig`. Les identifiants ne sont jamais persistés dans les paramètres ; le runtime les lit depuis `process.env[envKey]`. Les modèles Qwen OAuth restent codés en dur et ne peuvent pas être remplacés.

> [!note]
>
> Seule la commande `/model` expose les types d'authentification non par défaut. Anthropic, Gemini, etc., doivent être définis via `modelProviders`. La commande `/auth` liste Qwen OAuth, Alibaba Cloud Coding Plan et API Key comme options d'authentification intégrées.

> [!warning]
>
> **IDs de modèles dupliqués au sein du même `authType` :** Définir plusieurs modèles avec le même `id` sous un seul `authType` (par exemple, deux entrées avec `"id": "gpt-4o"` dans `openai`) n'est actuellement pas pris en charge. En cas de doublons, **la première occurrence est retenue** et les suivantes sont ignorées avec un avertissement. Notez que le champ `id` est utilisé à la fois comme identifiant de configuration et comme nom réel du modèle envoyé à l'API. Utiliser des IDs uniques (ex. `gpt-4o-creative`, `gpt-4o-balanced`) n'est donc pas une solution de contournement viable. Il s'agit d'une limitation connue que nous prévoyons de corriger dans une prochaine version.

## Exemples de configuration par type d'authentification

Vous trouverez ci-dessous des exemples de configuration complets pour différents types d'authentification, illustrant les paramètres disponibles et leurs combinaisons.

### Types d'authentification pris en charge

Les clés de l'objet `modelProviders` doivent être des valeurs `authType` valides. Les types d'authentification actuellement pris en charge sont :

| Auth Type    | Description                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `openai`     | APIs compatibles OpenAI (OpenAI, Azure OpenAI, serveurs d'inférence locaux comme vLLM/Ollama) |
| `anthropic`  | API Anthropic Claude                                                                    |
| `gemini`     | API Google Gemini                                                                       |
| `qwen-oauth` | Qwen OAuth (codé en dur, ne peut pas être remplacé dans `modelProviders`)               |

> [!warning]
> Si une clé de type d'authentification invalide est utilisée (par exemple, une faute de frappe comme `"openai-custom"`), la configuration sera **ignorée silencieusement** et les modèles n'apparaîtront pas dans le sélecteur `/model`. Utilisez toujours l'une des valeurs de type d'authentification prises en charge listées ci-dessus.

### SDK utilisés pour les requêtes API

Qwen Code utilise les SDK officiels suivants pour envoyer des requêtes à chaque fournisseur :

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - SDK Node.js officiel OpenAI                  |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK officiel Anthropic |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK officiel Google GenAI      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) avec fournisseur personnalisé (compatible DashScope)    |

Cela signifie que le `baseUrl` que vous configurez doit être compatible avec le format d'API attendu par le SDK correspondant. Par exemple, lors de l'utilisation du type d'authentification `openai`, le point de terminaison doit accepter les requêtes au format de l'API OpenAI.

### Fournisseurs compatibles OpenAI (`openai`)

Ce type d'authentification prend en charge non seulement l'API officielle d'OpenAI, mais également tout point de terminaison compatible OpenAI, y compris les fournisseurs de modèles agrégés comme OpenRouter.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here"
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

### Modèles locaux auto-hébergés (via API compatible OpenAI)

La plupart des serveurs d'inférence locaux (vLLM, Ollama, LM Studio, etc.) fournissent un point de terminaison d'API compatible OpenAI. Configurez-les en utilisant le type d'authentification `openai` avec un `baseUrl` local :

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

Pour les serveurs locaux ne nécessitant pas d'authentification, vous pouvez utiliser n'importe quelle valeur fictive pour la clé API :

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Le paramètre `extra_body` est **uniquement pris en charge pour les fournisseurs compatibles OpenAI** (`openai`, `qwen-oauth`). Il est ignoré pour les fournisseurs Anthropic et Gemini.

> [!note]
>
> **À propos de `envKey`** : Le champ `envKey` spécifie le **nom d'une variable d'environnement**, et non la valeur réelle de la clé API. Pour que la configuration fonctionne, vous devez vous assurer que la variable d'environnement correspondante est définie avec votre clé API réelle. Il existe deux méthodes pour ce faire :
>
> - **Option 1 : Utiliser un fichier `.env`** (recommandé pour la sécurité) :
>   ```bash
>   # ~/.qwen/.env (ou racine du projet)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Pensez à ajouter `.env` à votre `.gitignore` pour éviter de committer accidentellement des secrets.
> - **Option 2 : Utiliser le champ `env` dans `settings.json`** (comme illustré dans les exemples ci-dessus) :
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

Alibaba Cloud Coding Plan fournit un ensemble préconfiguré de modèles Qwen optimisés pour les tâches de développement. Cette fonctionnalité est disponible pour les utilisateurs disposant d'un accès API Alibaba Cloud Coding Plan et offre une expérience de configuration simplifiée avec des mises à jour automatiques des modèles.

### Vue d'ensemble

Lorsque vous vous authentifiez avec une clé API Alibaba Cloud Coding Plan via la commande `/auth`, Qwen Code configure automatiquement les modèles suivants :

| Model ID               | Name                 | Description                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Modèle avancé avec le mode réflexion activé   |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Optimisé pour les tâches de développement             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Dernier modèle max avec le mode réflexion activé |

### Configuration

1. Obtenez une clé API Alibaba Cloud Coding Plan :
   - **Chine** : <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International** : <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Exécutez la commande `/auth` dans Qwen Code
3. Sélectionnez **Alibaba Cloud Coding Plan**
4. Sélectionnez votre région
5. Saisissez votre clé API lorsque vous y êtes invité

Les modèles seront automatiquement configurés et ajoutés à votre sélecteur `/model`.

### Régions

Alibaba Cloud Coding Plan prend en charge deux régions :

| Region               | Endpoint                                        | Description             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Point de terminaison Chine continentale |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Point de terminaison international  |

La région est sélectionnée lors de l'authentification et stockée dans `settings.json` sous `codingPlan.region`. Pour changer de région, relancez la commande `/auth` et sélectionnez une autre région.

### Stockage de la clé API

Lorsque vous configurez Coding Plan via la commande `/auth`, la clé API est stockée à l'aide du nom de variable d'environnement réservé `BAILIAN_CODING_PLAN_API_KEY`. Par défaut, elle est stockée dans le champ `env` de votre fichier `settings.json`.

> [!warning]
>
> **Recommandation de sécurité** : Pour une meilleure sécurité, il est recommandé de déplacer la clé API de `settings.json` vers un fichier `.env` distinct et de la charger en tant que variable d'environnement. Par exemple :
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Assurez-vous ensuite d'ajouter ce fichier à votre `.gitignore` si vous utilisez des paramètres au niveau du projet.

### Mises à jour automatiques

Les configurations des modèles Coding Plan sont versionnées. Lorsque Qwen Code détecte une version plus récente du modèle de configuration, vous serez invité à effectuer la mise à jour. Accepter la mise à jour entraînera :

- Le remplacement des configurations existantes des modèles Coding Plan par les dernières versions
- La conservation de toutes les configurations de modèles personnalisées que vous avez ajoutées manuellement
- Le basculement automatique vers le premier modèle de la configuration mise à jour

Ce processus garantit que vous disposez toujours des dernières configurations et fonctionnalités des modèles sans intervention manuelle.

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
> Lors de l'utilisation d'une configuration manuelle :
>
> - Vous pouvez utiliser n'importe quel nom de variable d'environnement pour `envKey`
> - Vous n'avez pas besoin de configurer `codingPlan.*`
> - **Les mises à jour automatiques ne s'appliqueront pas** aux modèles Coding Plan configurés manuellement

> [!warning]
>
> Si vous utilisez également la configuration automatique de Coding Plan, les mises à jour automatiques peuvent écraser vos configurations manuelles si elles utilisent le même `envKey` et le même `baseUrl` que la configuration automatique. Pour éviter cela, assurez-vous que votre configuration manuelle utilise un `envKey` différent si possible.

## Couches de résolution et atomicité

Les valeurs effectives d'authentification/modèle/identifiants sont choisies par champ selon la précédence suivante (la première présente gagne). Vous pouvez combiner `--auth-type` avec `--model` pour pointer directement vers une entrée de fournisseur ; ces flags CLI s'exécutent avant les autres couches.

| Layer (highest → lowest)   | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Remplacements programmatiques     | `/auth`                             | entrée `/auth`                                   | entrée `/auth`                                       | entrée `/auth`                                        | —                      | —                                 |
| Sélection du fournisseur de modèles   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| Arguments CLI              | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (ou équivalents spécifiques au fournisseur) | `--openaiBaseUrl` (ou équivalents spécifiques au fournisseur) | —                      | —                                 |
| Variables d'environnement      | —                                   | Mapping spécifique au fournisseur (ex. `OPENAI_MODEL`) | Mapping spécifique au fournisseur (ex. `OPENAI_API_KEY`)   | Mapping spécifique au fournisseur (ex. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Paramètres (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Valeur par défaut / calculée         | Retour à `AuthType.QWEN_OAUTH` | Valeur par défaut intégrée (OpenAI ⇒ `qwen3-coder-plus`)  | —                                                   | —                                                    | —                      | `Config.getProxy()` si configuré |

\*Lorsqu'ils sont présents, les flags d'authentification CLI remplacent les paramètres. Sinon, `security.auth.selectedType` ou la valeur par défaut implicite détermine le type d'authentification. Qwen OAuth et OpenAI sont les seuls types d'authentification exposés sans configuration supplémentaire.

> [!warning]
>
> **Dépréciation de `security.auth.apiKey` et `security.auth.baseUrl` :** La configuration directe des identifiants API via `security.auth.apiKey` et `security.auth.baseUrl` dans `settings.json` est dépréciée. Ces paramètres étaient utilisés dans les versions historiques pour les identifiants saisis via l'interface, mais le flux de saisie des identifiants a été supprimé dans la version 0.10.1. Ces champs seront entièrement supprimés dans une prochaine version. **Il est fortement recommandé de migrer vers `modelProviders`** pour toutes les configurations de modèles et d'identifiants. Utilisez `envKey` dans `modelProviders` pour référencer des variables d'environnement afin de gérer les identifiants de manière sécurisée, plutôt que de les coder en dur dans les fichiers de paramètres.

## Empilement de la configuration de génération : La couche étanche du fournisseur

La résolution de la configuration suit un modèle d'empilement strict avec une règle cruciale : **la couche `modelProvider` est étanche**.

### Fonctionnement

1. **Lorsqu'un modèle `modelProvider` EST sélectionné** (par ex., via la commande `/model` choisissant un modèle configuré par fournisseur) :
   - L'intégralité du `generationConfig` du fournisseur est appliquée **atomiquement**
   - **La couche fournisseur est complètement étanche** — les couches inférieures (CLI, env, paramètres) ne participent pas du tout à la résolution de `generationConfig`
   - Tous les champs définis dans `modelProviders[].generationConfig` utilisent les valeurs du fournisseur
   - Tous les champs **non définis** par le fournisseur sont définis sur `undefined` (et non hérités des paramètres)
   - Cela garantit que les configurations des fournisseurs agissent comme un "package scellé" complet et autonome

2. **Lorsqu'AUCUN modèle `modelProvider` n'est sélectionné** (par ex., en utilisant `--model` avec un ID de modèle brut, ou en utilisant directement CLI/env/paramètres) :
   - La résolution passe aux couches inférieures
   - Les champs sont renseignés depuis CLI → env → paramètres → valeurs par défaut
   - Cela crée un **Modèle Runtime** (voir section suivante)

### Précédence par champ pour `generationConfig`

| Priority | Source                                        | Behavior                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Remplacements programmatiques                        | Modifications runtime `/model`, `/auth`                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **Couche étanche** - remplace complètement tous les champs `generationConfig` ; les couches inférieures ne participent pas |
| 3        | `settings.model.generationConfig`             | Utilisé uniquement pour les **Modèles Runtime** (lorsqu'aucun modèle fournisseur n'est sélectionné)                                    |
| 4        | Valeurs par défaut du générateur de contenu                    | Valeurs par défaut spécifiques au fournisseur (ex. OpenAI vs Gemini) - uniquement pour les Modèles Runtime                            |

### Traitement atomique des champs

Les champs suivants sont traités comme des objets atomiques : les valeurs du fournisseur remplacent entièrement l'objet, aucune fusion n'a lieu :

- `samplingParams` - Température, top_p, max_tokens, etc.
- `customHeaders` - En-têtes HTTP personnalisés
- `extra_body` - Paramètres supplémentaires du corps de la requête

### Exemple

```json
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

Lorsque `gpt-4o` est sélectionné depuis `modelProviders` :

- `timeout` = 60000 (depuis le fournisseur, remplace les paramètres)
- `samplingParams.temperature` = 0.2 (depuis le fournisseur, remplace complètement l'objet des paramètres)
- `samplingParams.max_tokens` = **undefined** (non défini dans le fournisseur, et la couche fournisseur n'hérite pas des paramètres — les champs sont explicitement définis sur undefined s'ils ne sont pas fournis)

Lors de l'utilisation d'un modèle brut via `--model gpt-4` (non issu de `modelProviders`, crée un Modèle Runtime) :

- `timeout` = 30000 (depuis les paramètres)
- `samplingParams.temperature` = 0.5 (depuis les paramètres)
- `samplingParams.max_tokens` = 1000 (depuis les paramètres)

La stratégie de fusion pour `modelProviders` elle-même est REMPLACER : l'intégralité du `modelProviders` des paramètres du projet remplacera la section correspondante dans les paramètres utilisateur, au lieu de fusionner les deux.

## Modèles fournisseur vs Modèles Runtime

Qwen Code distingue deux types de configurations de modèles :

### Modèle fournisseur

- Défini dans la configuration `modelProviders`
- Dispose d'un package de configuration complet et atomique
- Lorsqu'il est sélectionné, sa configuration est appliquée comme une couche étanche
- Apparaît dans la liste de la commande `/model` avec des métadonnées complètes (nom, description, capacités)
- Recommandé pour les workflows multi-modèles et la cohérence d'équipe

### Modèle Runtime

- Créé dynamiquement lors de l'utilisation d'IDs de modèles bruts via CLI (`--model`), variables d'environnement ou paramètres
- Non défini dans `modelProviders`
- La configuration est construite par "projection" à travers les couches de résolution (CLI → env → paramètres → valeurs par défaut)
- Capturé automatiquement sous forme de **RuntimeModelSnapshot** lorsqu'une configuration complète est détectée
- Permet la réutilisation sans ressaisir les identifiants

### Cycle de vie du RuntimeModelSnapshot

Lorsque vous configurez un modèle sans utiliser `modelProviders`, Qwen Code crée automatiquement un RuntimeModelSnapshot pour préserver votre configuration :

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

Le snapshot :

- Capture l'ID du modèle, la clé API, l'URL de base et la configuration de génération
- Persiste entre les sessions (stocké en mémoire pendant le runtime)
- Apparaît dans la liste de la commande `/model` comme une option runtime
- Peut être activé via `/model $runtime|openai|my-custom-model`

### Différences clés

| Aspect                  | Modèle fournisseur                    | Modèle Runtime                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Source de configuration    | `modelProviders` dans les paramètres      | Couches CLI, env, paramètres                  |
| Atomicité de la configuration | Package complet et étanche     | Empilé, chaque champ résolu indépendamment |
| Réutilisabilité             | Toujours disponible dans la liste `/model` | Capturé en snapshot, apparaît si complet  |
| Partage d'équipe            | Oui (via paramètres commités)      | Non (local à l'utilisateur)                            |
| Stockage des identifiants      | Référence via `envKey` uniquement       | Peut capturer la clé réelle dans le snapshot         |

### Quand utiliser chacun

- **Utilisez les Modèles fournisseur** lorsque : Vous disposez de modèles standards partagés au sein d'une équipe, avez besoin de configurations cohérentes ou souhaitez empêcher les remplacements accidentels
- **Utilisez les Modèles Runtime** lorsque : Vous testez rapidement un nouveau modèle, utilisez des identifiants temporaires ou travaillez avec des points de terminaison ad hoc

## Persistance de la sélection et recommandations

> [!important]
>
> Définissez `modelProviders` dans le fichier `~/.qwen/settings.json` (portée utilisateur) dans la mesure du possible et évitez de persister des remplacements d'identifiants dans n'importe quelle portée. Conserver le catalogue de fournisseurs dans les paramètres utilisateur évite les conflits de fusion/remplacement entre les portées projet et utilisateur, et garantit que les mises à jour `/auth` et `/model` réécrivent toujours dans une portée cohérente.

- `/model` et `/auth` persistent `model.name` (le cas échéant) et `security.auth.selectedType` dans la portée accessible en écriture la plus proche qui définit déjà `modelProviders` ; sinon, ils retombent sur la portée utilisateur. Cela maintient la synchronisation des fichiers workspace/utilisateur avec le catalogue de fournisseurs actif.
- Sans `modelProviders`, le résolveur mélange les couches CLI/env/paramètres, créant des Modèles Runtime. Cela convient pour les configurations à fournisseur unique, mais devient fastidieux lors de changements fréquents. Définissez des catalogues de fournisseurs dès que les workflows multi-modèles sont courants, afin que les basculements restent atomiques, attribuables à une source et débogables.
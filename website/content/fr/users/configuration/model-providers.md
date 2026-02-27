# Fournisseurs de modèles

Qwen Code vous permet de configurer plusieurs fournisseurs de modèles via le paramètre `modelProviders` dans votre fichier `settings.json`. Cela vous permet de basculer entre différents modèles et fournisseurs d'IA en utilisant la commande `/model`.

## Vue d'ensemble

Utilisez `modelProviders` pour déclarer des listes de modèles organisées par type d'authentification entre lesquelles le sélecteur `/model` peut basculer. Les clés doivent être des types d'authentification valides (`openai`, `anthropic`, `gemini`, `vertex-ai`, etc.). Chaque entrée nécessite un `id` et **doit inclure `envKey`**, avec des champs optionnels `name`, `description`, `baseUrl` et `generationConfig`. Les identifiants de connexion ne sont jamais persistés dans les paramètres ; le runtime les lit à partir de `process.env[envKey]`. Les modèles OAuth Qwen restent codés en dur et ne peuvent pas être remplacés.

> [!note]
>
> Seule la commande `/model` expose les types d'authentification non par défaut. Anthropic, Gemini, Vertex AI, etc., doivent être définis via `modelProviders`. La commande `/auth` liste intentionnellement uniquement les flux OAuth Qwen intégrés et OpenAI.

> [!warning]
>
> **ID de modèles en double au sein du même authType :** La définition de plusieurs modèles avec le même `id` sous un seul `authType` (par exemple, deux entrées avec `"id": "gpt-4o"` dans `openai`) n'est actuellement pas prise en charge. Si des doublons existent, **la première occurrence l'emporte** et les doublons suivants sont ignorés avec un avertissement. Notez que le champ `id` est utilisé à la fois comme identifiant de configuration et comme nom réel du modèle envoyé à l'API, donc l'utilisation d'ID uniques (par exemple, `gpt-4o-creative`, `gpt-4o-balanced`) n'est pas une solution viable. Il s'agit d'une limitation connue que nous prévoyons de corriger dans une version future.

## Exemples de configuration par type d'authentification

Voici ci-dessous des exemples complets de configuration pour différents types d'authentification, montrant les paramètres disponibles et leurs combinaisons.

### Types d'authentification pris en charge

Les clés de l'objet `modelProviders` doivent être des valeurs `authType` valides. Les types d'authentification actuellement pris en charge sont :

| Type d'authentification | Description                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `openai`                | API compatibles avec OpenAI (OpenAI, Azure OpenAI, serveurs d'inférence locaux comme vLLM/Ollama) |
| `anthropic`             | API Anthropic Claude                                                                          |
| `gemini`                | API Google Gemini                                                                             |
| `vertex-ai`             | Google Vertex AI                                                                              |
| `qwen-oauth`            | Qwen OAuth (codé en dur, ne peut pas être remplacé dans `modelProviders`)                   |

> [!warning]
> Si une clé de type d'authentification non valide est utilisée (par exemple, une faute de frappe comme `"openai-custom"`), la configuration sera **ignorée silencieusement** et les modèles n'apparaîtront pas dans le sélecteur `/model`. Utilisez toujours l'une des valeurs de type d'authentification prises en charge listées ci-dessus.

### Kits de développement logiciel utilisés pour les requêtes d'API

Qwen Code utilise les kits de développement logiciel officiels suivants pour envoyer des requêtes à chaque fournisseur :

| Type d'authentification | Kit de développement logiciel                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `openai`                | [`openai`](https://www.npmjs.com/package/openai) - Kit de développement officiel OpenAI pour Node.js |
| `anthropic`             | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - Kit de développement officiel Anthropic |
| `gemini` / `vertex-ai`  | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - Kit de développement officiel Google GenAI |
| `qwen-oauth`            | [`openai`](https://www.npmjs.com/package/openai) avec fournisseur personnalisé (compatible DashScope) |

Cela signifie que l'URL de base (`baseUrl`) que vous configurez doit être compatible avec le format d'API attendu par le kit de développement correspondant. Par exemple, lors de l'utilisation du type d'authentification `openai`, le point de terminaison doit accepter les requêtes au format de l'API OpenAI.

### Fournisseurs compatibles OpenAI (`openai`)

Ce type d'authentification prend en charge non seulement l'API officielle d'OpenAI, mais aussi n'importe quel point de terminaison compatible OpenAI, y compris les fournisseurs de modèles agrégés comme OpenRouter.

```json
{
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

### Google Vertex AI (`vertex-ai`)

```json
{
  "modelProviders": {
    "vertex-ai": [
      {
        "id": "gemini-1.5-pro-vertex",
        "name": "Gemini 1.5 Pro (Vertex AI)",
        "envKey": "GOOGLE_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "generationConfig": {
          "timeout": 90000,
          "contextWindowSize": 2000000,
          "samplingParams": {
            "temperature": 0.2,
            "max_tokens": 8192
          }
        }
      }
    ]
  }
}
```

### Modèles locaux auto-hébergés (via API compatible OpenAI)

La plupart des serveurs d'inférence locaux (vLLM, Ollama, LM Studio, etc.) fournissent un point de terminaison d'API compatible OpenAI. Configurez-les en utilisant le type d'authentification `openai` avec une `baseUrl` locale :

```json
{
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

Pour les serveurs locaux qui ne nécessitent pas d'authentification, vous pouvez utiliser n'importe quelle valeur factice pour la clé API :

```bash

# Pour Ollama (aucune authentification requise)
export OLLAMA_API_KEY="ollama"

# Pour vLLM (si aucune authentification n'est configurée)
export VLLM_API_KEY="not-needed"
```

> [!note]
> 
> Le paramètre `extra_body` est **uniquement pris en charge pour les fournisseurs compatibles OpenAI** (`openai`, `qwen-oauth`). Il est ignoré pour les fournisseurs Anthropic, Gemini et Vertex AI.

## Plan de codage Bailian

Le plan de codage Bailian fournit un ensemble préconfiguré de modèles Qwen optimisés pour les tâches de programmation. Cette fonctionnalité est disponible pour les utilisateurs disposant d'un accès à l'API Bailian et offre une expérience de configuration simplifiée avec des mises à jour automatiques de la configuration des modèles.

### Aperçu

Lorsque vous vous authentifiez avec une clé d'API Bailian Coding Plan à l'aide de la commande `/auth`, Qwen Code configure automatiquement les modèles suivants :

| ID du modèle           | Nom                  | Description                                                |
| ---------------------- | -------------------- | ---------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Modèle avancé avec fonctionnalité de réflexion activée     |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Optimisé pour les tâches de programmation                |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Dernier modèle max avec fonctionnalité de réflexion activée |

### Configuration

1. Obtenez une clé d'API Bailian Coding Plan :
   - **Chine** : <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International** : <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Exécutez la commande `/auth` dans Qwen Code
3. Sélectionnez la méthode d'authentification par API-KEY
4. Sélectionnez votre région (Chine ou Global/International)
5. Entrez votre clé API lorsque vous y êtes invité

Les modèles seront automatiquement configurés et ajoutés à votre sélecteur `/model`.

### Régions

Le plan Bailian Coding prend en charge deux régions :

| Région               | Point de terminaison                            | Description                      |
| -------------------- | ----------------------------------------------- | -------------------------------- |
| Chine                | `https://coding.dashscope.aliyuncs.com/v1`      | Point de terminaison pour la Chine continentale |
| Mondial/International| `https://coding-intl.dashscope.aliyuncs.com/v1` | Point de terminaison international |

La région est sélectionnée lors de l'authentification et stockée dans `settings.json` sous `codingPlan.region`. Pour changer de région, relancez la commande `/auth` et sélectionnez une autre région.

### Stockage de la clé API

Lorsque vous configurez Coding Plan via la commande `/auth`, la clé API est stockée en utilisant le nom de variable d'environnement réservé `BAILIAN_CODING_PLAN_API_KEY`. Par défaut, elle est stockée dans le champ `settings.env` de votre fichier `settings.json`.

> [!warning]
>
> **Recommandation de sécurité** : Pour une meilleure sécurité, il est recommandé de déplacer la clé API du fichier `settings.json` vers un fichier `.env` séparé et de le charger en tant que variable d'environnement. Par exemple :
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=votre-cle-api-ici
> ```
>
> Puis assurez-vous que ce fichier est ajouté à votre `.gitignore` si vous utilisez des paramètres au niveau du projet.

### Mises à jour automatiques

Les configurations du modèle Coding Plan sont versionnées. Lorsque Qwen Code détecte une version plus récente du modèle de configuration, vous serez invité à effectuer la mise à jour. En acceptant la mise à jour, vous :

- Remplacez les configurations existantes du modèle Coding Plan par les dernières versions
- Conservez toutes les configurations personnalisées que vous avez ajoutées manuellement
- Passez automatiquement au premier modèle de la configuration mise à jour

Le processus de mise à jour garantit que vous avez toujours accès aux dernières configurations et fonctionnalités du modèle sans intervention manuelle.

### Configuration manuelle (Avancé)

Si vous préférez configurer manuellement les modèles Coding Plan, vous pouvez les ajouter à votre fichier `settings.json` comme n'importe quel fournisseur compatible OpenAI :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder via Bailian Coding Plan",
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
> - Les **mises à jour automatiques ne s'appliqueront pas** aux modèles Coding Plan configurés manuellement

> [!warning]
>
> Si vous utilisez également la configuration automatique de Coding Plan, les mises à jour automatiques peuvent écraser vos configurations manuelles si elles utilisent le même `envKey` et `baseUrl` que la configuration automatique. Pour éviter cela, assurez-vous que votre configuration manuelle utilise un `envKey` différent si possible.

## Couches de résolution et atomicité

Les valeurs effectives d'authentification/modèle/identifiants sont choisies par champ en utilisant la précédence suivante (la première présente l'emporte). Vous pouvez combiner `--auth-type` avec `--model` pour pointer directement vers une entrée de fournisseur ; ces indicateurs CLI s'exécutent avant les autres couches.

| Couche (du plus élevé au plus bas) | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| ---------------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Remplacements programmatiques      | `/auth`                             | entrée `/auth`                                  | entrée `/auth`                                      | entrée `/auth`                                       | —                      | —                                 |
| Sélection du fournisseur de modèle | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| Arguments CLI                      | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (ou équivalents spécifiques au fournisseur) | `--openaiBaseUrl` (ou équivalents spécifiques au fournisseur) | —                      | —                                 |
| Variables d'environnement          | —                                   | Mappage spécifique au fournisseur (ex. `OPENAI_MODEL`) | Mappage spécifique au fournisseur (ex. `OPENAI_API_KEY`) | Mappage spécifique au fournisseur (ex. `OPENAI_BASE_URL`) | —                      | —                                 |
| Paramètres (`settings.json`)       | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Valeur par défaut / calculée       | Retour à `AuthType.QWEN_OAUTH`      | Valeur par défaut intégrée (OpenAI ⇒ `qwen3-coder-plus`) | —                                                   | —                                                    | —                      | `Config.getProxy()` si configuré |

\*Lorsqu'ils sont présents, les indicateurs CLI d'authentification remplacent les paramètres. Sinon, `security.auth.selectedType` ou la valeur implicite par défaut déterminent le type d'authentification. Qwen OAuth et OpenAI sont les seuls types d'authentification disponibles sans configuration supplémentaire.

> [!warning]
> 
> **Dépréciation de `security.auth.apiKey` et `security.auth.baseUrl` :** La configuration directe des identifiants API via `security.auth.apiKey` et `security.auth.baseUrl` dans `settings.json` est dépréciée. Ces paramètres étaient utilisés dans les versions antérieures pour les identifiants saisis via l'interface utilisateur, mais le flux de saisie des identifiants a été supprimé dans la version 0.10.1. Ces champs seront entièrement supprimés dans une prochaine version. **Il est fortement recommandé de migrer vers `modelProviders`** pour toutes les configurations de modèles et d'identifiants. Utilisez `envKey` dans `modelProviders` pour référencer des variables d'environnement afin de gérer les identifiants de manière sécurisée au lieu de les coder en dur dans les fichiers de paramètres.

## Imbrication de la configuration de génération : La couche de fournisseur imperméable

La résolution de la configuration suit un modèle d'imbrication strict avec une règle cruciale : **la couche modelProvider est imperméable**.

### Fonctionnement

1. **Lorsqu'un modèle modelProvider EST sélectionné** (par exemple, via la commande `/model` en choisissant un modèle configuré par le fournisseur) :
   - La totalité de `generationConfig` du fournisseur est appliquée **de manière atomique**
   - **La couche du fournisseur est complètement imperméable** — les couches inférieures (CLI, variables d'environnement, paramètres) ne participent absolument pas à la résolution de generationConfig
   - Tous les champs définis dans `modelProviders[].generationConfig` utilisent les valeurs du fournisseur
   - Tous les champs **non définis** par le fournisseur sont définis sur `undefined` (non hérités des paramètres)
   - Cela garantit que les configurations du fournisseur agissent comme un « package scellé » complet et autonome

2. **Lorsqu'aucun modèle modelProvider n'est sélectionné** (par exemple, en utilisant `--model` avec un identifiant brut de modèle, ou en utilisant directement la CLI/les variables d'environnement/les paramètres) :
   - La résolution remonte aux couches inférieures
   - Les champs sont remplis selon l'ordre CLI → variables d'environnement → paramètres → valeurs par défaut
   - Cela crée un **modèle d'exécution** (voir section suivante)

### Priorité par champ pour `generationConfig`

| Priorité | Source                                        | Comportement                                                                                            |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1        | Remplacements programmatiques                 | Changements runtime `/model`, `/auth`                                                                   |
| 2        | `modelProviders[authType][].generationConfig` | **Couche imperméable** - remplace complètement tous les champs generationConfig ; les couches inférieures ne participent pas |
| 3        | `settings.model.generationConfig`             | Utilisé uniquement pour les **Modèles d'exécution** (lorsqu'aucun modèle de fournisseur n'est sélectionné) |
| 4        | Valeurs par défaut du générateur de contenu   | Valeurs par défaut spécifiques au fournisseur (par exemple, OpenAI vs Gemini) - uniquement pour les modèles d'exécution |

### Traitement des champs atomiques

Les champs suivants sont traités comme des objets atomiques - les valeurs du fournisseur remplacent complètement l'objet entier, aucune fusion n'a lieu :

- `samplingParams` - Température, top_p, max_tokens, etc.
- `customHeaders` - En-têtes HTTP personnalisés
- `extra_body` - Paramètres supplémentaires du corps de la requête

### Exemple

```json
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

Lorsque `gpt-4o` est sélectionné depuis modelProviders :

- `timeout` = 60000 (provenant du fournisseur, remplace les paramètres)
- `samplingParams.temperature` = 0.2 (provenant du fournisseur, remplace complètement l'objet des paramètres)
- `samplingParams.max_tokens` = **indéfini** (non défini dans le fournisseur, et la couche du fournisseur n'hérite pas des paramètres — les champs sont explicitement définis comme indéfinis s'ils ne sont pas fournis)

Lors de l'utilisation d'un modèle brut via `--model gpt-4` (pas depuis modelProviders, crée un modèle d'exécution) :

- `timeout` = 30000 (provenant des paramètres)
- `samplingParams.temperature` = 0.5 (provenant des paramètres)
- `samplingParams.max_tokens` = 1000 (provenant des paramètres)

La stratégie de fusion pour `modelProviders` elle-même est REMPLACER : l'intégralité de `modelProviders` provenant des paramètres du projet remplacera la section correspondante dans les paramètres utilisateur, plutôt que de fusionner les deux.

## Modèles de fournisseur vs modèles d'exécution

Qwen Code distingue deux types de configurations de modèle :

### Modèle de fournisseur

- Défini dans la configuration `modelProviders`
- Possède un package de configuration complet et atomique
- Lorsqu'il est sélectionné, sa configuration est appliquée comme une couche imperméable
- Apparaît dans la liste de commande `/model` avec toutes les métadonnées (nom, description, capacités)
- Recommandé pour les flux de travail multi-modèles et la cohérence d'équipe

### Modèle d'exécution

- Créé dynamiquement lors de l'utilisation d'identifiants de modèle bruts via CLI (`--model`), variables d'environnement ou paramètres
- Non défini dans `modelProviders`
- La configuration est construite en "projetant" à travers les couches de résolution (CLI → env → paramètres → valeurs par défaut)
- Capturé automatiquement sous forme de **RuntimeModelSnapshot** lorsqu'une configuration complète est détectée
- Permet la réutilisation sans avoir à ressaisir les identifiants de connexion

### Cycle de vie de RuntimeModelSnapshot

Lorsque vous configurez un modèle sans utiliser `modelProviders`, Qwen Code crée automatiquement un RuntimeModelSnapshot pour conserver votre configuration :

```bash

# Cela crée un RuntimeModelSnapshot avec l'ID : $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

Le snapshot :

- Capture l'ID du modèle, la clé API, l'URL de base et la configuration de génération
- Persiste entre les sessions (stocké en mémoire pendant l'exécution)
- Apparaît dans la liste de la commande `/model` en tant qu'option d'exécution
- Peut être sélectionné via `/model $runtime|openai|my-custom-model`

### Différences clés

| Aspect                  | Modèle de fournisseur             | Modèle d'exécution                         |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Source de configuration | `modelProviders` dans les paramètres | Couches CLI, environnement, paramètres     |
| Atomicité de la configuration | Paquet complet, imperméable     | En couches, chaque champ résolu indépendamment |
| Réutilisabilité         | Toujours disponible dans la liste `/model` | Capturé sous forme d'instantané, apparaît si complet |
| Partage en équipe       | Oui (via les paramètres validés)  | Non (local à l'utilisateur)                |
| Stockage des identifiants | Référence uniquement via `envKey` | Peut capturer la clé réelle dans l'instantané |

### Quand utiliser chaque option

- **Utilisez les modèles de fournisseur** lorsque : vous avez des modèles standard partagés au sein d'une équipe, que vous avez besoin de configurations cohérentes ou que vous souhaitez éviter des modifications accidentelles
- **Utilisez les modèles d'exécion** lorsque : vous testez rapidement un nouveau modèle, utilisez des identifiants temporaires ou travaillez avec des points de terminaison ponctuels

## Persistance de la sélection et recommandations

> [!important]
> 
> Définissez `modelProviders` dans la portée utilisateur `~/.qwen/settings.json` chaque fois que possible et évitez de conserver les substitutions d'identifiants dans n'importe quelle portée. Conserver le catalogue du fournisseur dans les paramètres utilisateur empêche les conflits de fusion/remplacement entre les portées projet et utilisateur, et garantit que les mises à jour `/auth` et `/model` s'écrivent toujours dans une portée cohérente.

- `/model` et `/auth` conservent `model.name` (lorsque applicable) et `security.auth.selectedType` dans la portée inscriptible la plus proche qui définit déjà `modelProviders` ; sinon, ils reviennent à la portée utilisateur. Cela maintient la synchronisation des fichiers espace de travail/utilisateur avec le catalogue de fournisseurs actif.
- Sans `modelProviders`, le résolveur mélange les couches CLI/env/settings, créant des modèles d'exécution. C'est acceptable pour les configurations mono-fournisseur mais fastidieux lors de changements fréquents. Définissez des catalogues de fournisseurs chaque fois que les flux de travail multi-modèles sont courants afin que les changements restent atomiques, attribués à leur source et débogables.
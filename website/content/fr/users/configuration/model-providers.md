# Fournisseurs de modèles

Qwen Code vous permet de configurer plusieurs fournisseurs de modèles via le paramètre `modelProviders` dans votre fichier `settings.json`. Cela vous permet de basculer entre différents modèles et fournisseurs d’IA à l’aide de la commande `/model`.

## Aperçu

Utilisez `modelProviders` pour déclarer des listes de modèles préconfigurés, spécifiques à chaque type d’authentification, entre lesquelles le sélecteur `/model` peut basculer. Les clés doivent correspondre à des types d’authentification valides (`openai`, `anthropic`, `gemini`, etc.). Chaque entrée requiert un champ `id` et **doit inclure le champ `envKey`**, les champs `name`, `description`, `baseUrl` et `generationConfig` étant facultatifs. Les identifiants ne sont jamais persistés dans les paramètres ; le runtime les lit depuis `process.env[envKey]`. Les modèles Qwen utilisant l’authentification OAuth restent codés en dur et ne peuvent pas être remplacés.

> [!note]
>
> Seule la commande `/model` permet d’accéder aux types d’authentification non par défaut. Anthropic, Gemini, etc., doivent être définis via `modelProviders`. La commande `/auth` affiche quant à elle Qwen OAuth, le plan d’abonnement Alibaba Cloud Coding et la clé API comme options d’authentification intégrées.

> [!warning]
>
> **Identifiants de modèle en double au sein d’un même `authType` :** Définir plusieurs modèles portant le même `id` sous un `authType` unique (par exemple, deux entrées avec `"id": "gpt-4o"` dans `openai`) n’est actuellement pas pris en charge. En cas de doublons, **la première occurrence est retenue**, tandis que les occurrences suivantes sont ignorées avec un avertissement. Notez que le champ `id` sert à la fois d’identifiant de configuration et de nom réel du modèle transmis à l’API ; utiliser des identifiants uniques (par exemple `gpt-4o-creative`, `gpt-4o-balanced`) n’est donc pas une solution viable. Il s’agit d’une limitation connue que nous prévoyons de corriger dans une prochaine version.

## Exemples de configuration par type d’authentification

Ci-dessous figurent des exemples complets de configuration pour différents types d’authentification, illustrant les paramètres disponibles et leurs combinaisons.

### Types d’authentification pris en charge

Les clés de l’objet `modelProviders` doivent correspondre à des valeurs valides de `authType`. Les types d’authentification actuellement pris en charge sont les suivants :

| Type d’authentification | Description                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `openai`                | API compatibles avec OpenAI (OpenAI, Azure OpenAI, serveurs d’inférence locaux tels que vLLM/Ollama) |
| `anthropic`             | API Claude d’Anthropic                                                                            |
| `gemini`                | API Google Gemini                                                                                 |
| `qwen-oauth`            | OAuth Qwen (codé en dur, ne peut pas être remplacé dans `modelProviders`)                       |

> [!warning]
> Si une clé de type d’authentification non valide est utilisée (par exemple, une faute de frappe comme `"openai-custom"`), la configuration sera **ignorée silencieusement**, et les modèles n’apparaîtront pas dans le sélecteur `/model`. Utilisez toujours l’un des types d’authentification pris en charge listés ci-dessus.

### SDK utilisés pour les requêtes API

Qwen Code utilise les SDK officiels suivants pour envoyer des requêtes à chaque fournisseur :

| Type d’authentification | Package SDK                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `openai`                | [`openai`](https://www.npmjs.com/package/openai) — SDK officiel OpenAI pour Node.js             |
| `anthropic`             | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) — SDK officiel Anthropic |
| `gemini`                | [`@google/genai`](https://www.npmjs.com/package/@google/genai) — SDK officiel Google GenAI       |
| `qwen-oauth`            | [`openai`](https://www.npmjs.com/package/openai) avec un fournisseur personnalisé (compatible DashScope) |

Cela signifie que l’URL de base (`baseUrl`) que vous configurez doit être compatible avec le format d’API attendu par le SDK correspondant. Par exemple, lors de l’utilisation du type d’authentification `openai`, le point de terminaison doit accepter des requêtes au format de l’API OpenAI.

### Fournisseurs compatibles OpenAI (`openai`)

Ce type d’authentification prend en charge non seulement l’API officielle d’OpenAI, mais aussi tout point de terminaison compatible OpenAI, y compris les fournisseurs agrégés de modèles tels qu’OpenRouter.

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

### Modèles locaux auto-hébergés (via API compatible OpenAI)

La plupart des serveurs d’inférence locaux (vLLM, Ollama, LM Studio, etc.) fournissent un point de terminaison d’API compatible avec OpenAI. Configurez-les en utilisant le type d’authentification `openai` avec une `baseUrl` locale :

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
        "name": "Modèle local (LM Studio)",
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

Pour les serveurs locaux ne nécessitant pas d’authentification, vous pouvez utiliser n’importe quelle valeur factice pour la clé API :

```bash

# Pour Ollama (aucune authentification requise)
export OLLAMA_API_KEY="ollama"

# Pour vLLM (si aucune authentification n’est configurée)
export VLLM_API_KEY="non-nécessaire"
```

> [!note]
>
> Le paramètre `extra_body` est **uniquement pris en charge par les fournisseurs compatibles avec OpenAI** (`openai`, `qwen-oauth`). Il est ignoré par les fournisseurs Anthropic et Gemini.

## Plan de codage Alibaba Cloud

Le Plan de codage Alibaba Cloud fournit un ensemble préconfiguré de modèles Qwen optimisés pour les tâches de programmation. Cette fonctionnalité est disponible pour les utilisateurs disposant d’un accès à l’API du Plan de codage Alibaba Cloud et offre une configuration simplifiée avec des mises à jour automatiques de la configuration des modèles.

### Aperçu

Lorsque vous vous authentifiez avec une clé API Alibaba Cloud Coding Plan à l’aide de la commande `/auth`, Qwen Code configure automatiquement les modèles suivants :

| ID du modèle           | Nom                  | Description                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Modèle avancé avec raisonnement activé |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Optimisé pour les tâches de programmation |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Dernier modèle « max » avec raisonnement activé |

### Configuration

1. Obtenez une clé API Alibaba Cloud Coding Plan :
   - **Chine** : <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International** : <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Exécutez la commande `/auth` dans Qwen Code
3. Sélectionnez **Alibaba Cloud Coding Plan**
4. Sélectionnez votre région
5. Entrez votre clé API lorsque vous y êtes invité

Les modèles seront automatiquement configurés et ajoutés à votre sélecteur `/model`.

### Régions

Le plan de codage Alibaba Cloud prend en charge deux régions :

| Région               | Point de terminaison                                      | Description                     |
| -------------------- | --------------------------------------------------------- | ------------------------------- |
| Chine                | `https://coding.dashscope.aliyuncs.com/v1`                | Point de terminaison pour la Chine continentale |
| Mondiale/Internationale | `https://coding-intl.dashscope.aliyuncs.com/v1`         | Point de terminaison international |

La région est sélectionnée lors de l’authentification et stockée dans le fichier `settings.json`, sous la clé `codingPlan.region`. Pour changer de région, réexécutez la commande `/auth` et sélectionnez une autre région.

### Stockage de la clé API

Lorsque vous configurez Coding Plan via la commande `/auth`, la clé API est stockée en utilisant le nom de variable d’environnement réservé `BAILIAN_CODING_PLAN_API_KEY`. Par défaut, elle est stockée dans le champ `env` de votre fichier `settings.json`.

> [!warning]
>
> **Recommandation de sécurité** : Pour une meilleure sécurité, il est recommandé de déplacer la clé API depuis `settings.json` vers un fichier `.env` séparé, puis de la charger comme variable d’environnement. Par exemple :
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=votre-clé-api-ici
> ```
>
> Ensuite, assurez-vous d’ajouter ce fichier à votre `.gitignore` si vous utilisez des paramètres au niveau du projet.

### Mises à jour automatiques

Les configurations des modèles de planification de code sont versionnées. Lorsque Qwen Code détecte une version plus récente du modèle, vous êtes invité à effectuer la mise à jour. En l’acceptant, les actions suivantes sont réalisées :

- Remplacement des configurations existantes du modèle de planification de code par leurs versions les plus récentes  
- Conservation de toute configuration de modèle personnalisée que vous avez ajoutée manuellement  
- Passage automatique au premier modèle figurant dans la configuration mise à jour  

Ce processus de mise à jour garantit que vous disposez toujours des dernières configurations et fonctionnalités des modèles, sans intervention manuelle.

### Configuration manuelle (avancé)

Si vous préférez configurer manuellement les modèles Coding Plan, vous pouvez les ajouter à votre fichier `settings.json` comme n’importe quel fournisseur compatible OpenAI :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder via le plan Coding d’Alibaba Cloud",
        "envKey": "VOTRE_CLE_ENV_PERSONNALISEE",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
>
> Lors de l’utilisation de la configuration manuelle :
>
> - Vous pouvez utiliser n’importe quel nom de variable d’environnement pour `envKey`
> - Vous n’avez pas besoin de configurer `codingPlan.*`
> - **Les mises à jour automatiques ne s’appliqueront pas** aux modèles Coding Plan configurés manuellement

> [!warning]
>
> Si vous utilisez également la configuration automatique Coding Plan, les mises à jour automatiques peuvent écraser vos configurations manuelles si celles-ci utilisent la même clé `envKey` et la même URL `baseUrl` que la configuration automatique. Pour éviter cela, assurez-vous, dans la mesure du possible, que votre configuration manuelle utilise une clé `envKey` différente.

## Couches de résolution et atomicité

Les valeurs effectives d’authentification, de modèle et d’identifiants sont choisies pour chaque champ selon la priorité suivante (la première valeur présente l’emporte). Vous pouvez combiner `--auth-type` avec `--model` pour cibler directement une entrée de fournisseur ; ces indicateurs CLI sont traités avant les autres couches.

| Couche (du plus prioritaire au moins prioritaire) | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| ------------------------------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Remplacements programmatiques                     | `/auth`                             | Entrée `/auth`                                  | Entrée `/auth`                                      | Entrée `/auth`                                       | —                      | —                                 |
| Sélection du fournisseur de modèle               | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| Arguments CLI                                     | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (ou équivalents spécifiques au fournisseur) | `--openaiBaseUrl` (ou équivalents spécifiques au fournisseur) | —                      | —                                 |
| Variables d’environnement                         | —                                   | Mappage spécifique au fournisseur (ex. `OPENAI_MODEL`) | Mappage spécifique au fournisseur (ex. `OPENAI_API_KEY`)   | Mappage spécifique au fournisseur (ex. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Paramètres (`settings.json`)                      | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Valeurs par défaut / calculées                    | Retombe sur `AuthType.QWEN_OAUTH`   | Valeur par défaut intégrée (OpenAI ⇒ `qwen3-coder-plus`) | —                                                   | —                                                    | —                      | `Config.getProxy()` si configuré |

\*Lorsqu’elles sont présentes, les options d’authentification CLI remplacent les paramètres. Sinon, le type d’authentification est déterminé par `security.auth.selectedType` ou par la valeur implicite par défaut. Qwen OAuth et OpenAI sont les seuls types d’authentification disponibles sans configuration supplémentaire.

> [!warning]
>
> **Dépréciation de `security.auth.apiKey` et `security.auth.baseUrl` :** La configuration directe des identifiants API via `security.auth.apiKey` et `security.auth.baseUrl` dans `settings.json` est dépréciée. Ces paramètres étaient utilisés dans les versions antérieures pour stocker les identifiants saisis via l’interface utilisateur, mais le flux de saisie des identifiants a été supprimé à partir de la version 0.10.1. Ces champs seront entièrement supprimés dans une prochaine version. **Il est fortement recommandé de migrer vers `modelProviders`** pour toutes les configurations de modèles et d’identifiants. Utilisez `envKey` dans `modelProviders` pour référencer des variables d’environnement afin d’une gestion sécurisée des identifiants, plutôt que de les coder en dur dans les fichiers de paramètres.

## Superposition des configurations de génération : la couche fournisseur imperméable

La résolution des configurations suit un modèle de superposition strict avec une règle cruciale : **la couche `modelProvider` est imperméable**.

### Fonctionnement

1. **Lorsqu’un modèle `modelProvider` EST sélectionné** (par exemple, via la commande `/model` en choisissant un modèle configuré par un fournisseur) :
   - L’ensemble de la configuration `generationConfig` provenant du fournisseur est appliqué **de façon atomique**
   - **La couche fournisseur est totalement imperméable** : les couches inférieures (CLI, variables d’environnement, paramètres) ne participent *aucunement* à la résolution de `generationConfig`
   - Tous les champs définis dans `modelProviders[].generationConfig` utilisent les valeurs fournies par le fournisseur
   - Tous les champs **non définis** par le fournisseur sont fixés à `undefined` (ils ne sont *pas* hérités des paramètres)
   - Cela garantit que les configurations fournisseurs agissent comme un « package scellé » complet et autonome

2. **Lorsqu’aucun modèle `modelProvider` n’est sélectionné** (par exemple, en utilisant l’option `--model` avec un identifiant brut de modèle, ou en utilisant directement la CLI / les variables d’environnement / les paramètres) :
   - La résolution se propage aux couches inférieures
   - Les champs sont remplis selon l’ordre suivant : CLI → variables d’environnement → paramètres → valeurs par défaut
   - Cela crée un **modèle d’exécution** (voir la section suivante)

### Priorité par champ pour `generationConfig`

| Priorité | Source                                                | Comportement                                                                                                                               |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | Remplacements programmatiques                         | Modifications à l’exécution via `/model` et `/auth`                                                                                        |
| 2        | `modelProviders[authType][].generationConfig`       | **Couche imperméable** — remplace entièrement tous les champs de `generationConfig` ; les couches inférieures n’interviennent pas         |
| 3        | `settings.model.generationConfig`                   | Utilisé uniquement pour les **modèles à l’exécution** (lorsqu’aucun modèle fournisseur n’est sélectionné)                                 |
| 4        | Valeurs par défaut du générateur de contenu           | Valeurs par défaut spécifiques au fournisseur (par exemple OpenAI ou Gemini) — uniquement pour les modèles à l’exécution                  |

### Traitement atomique des champs

Les champs suivants sont traités comme des objets atomiques : les valeurs fournies par le fournisseur remplacent entièrement l’objet, aucune fusion n’est effectuée :

- `samplingParams` — Température, `top_p`, `max_tokens`, etc.
- `customHeaders` — En-têtes HTTP personnalisés
- `extra_body` — Paramètres supplémentaires du corps de la requête

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

// Configuration modelProviders
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

- `timeout` = 60000 (provenant du fournisseur, remplace les paramètres utilisateur)
- `samplingParams.temperature` = 0.2 (provenant du fournisseur, remplace entièrement l’objet `samplingParams` des paramètres utilisateur)
- `samplingParams.max_tokens` = **indéfini** (non défini dans la configuration du fournisseur, et la couche fournisseur n’hérite pas des paramètres utilisateur — les champs non fournis sont explicitement définis à `undefined`)

Lorsqu’un modèle brut est utilisé via `--model gpt-4` (pas issu de `modelProviders`, crée un modèle exécuté à l’exécution) :

- `timeout` = 30000 (provenant des paramètres utilisateur)
- `samplingParams.temperature` = 0.5 (provenant des paramètres utilisateur)
- `samplingParams.max_tokens` = 1000 (provenant des paramètres utilisateur)

La stratégie de fusion pour `modelProviders` est le REMPLACEMENT : l’ensemble de la section `modelProviders` provenant des paramètres du projet remplace entièrement la section correspondante des paramètres utilisateur, au lieu de fusionner les deux.

## Modèles fournisseurs vs modèles d’exécution

Qwen Code distingue deux types de configurations de modèles :

### Modèle fournisseur

- Défini dans la configuration `modelProviders`
- Dispose d’un ensemble de configuration complet et atomique
- Lorsqu’il est sélectionné, sa configuration est appliquée comme une couche imperméable
- Apparaît dans la liste des commandes `/model` avec tous ses métadonnées (nom, description, fonctionnalités)
- Recommandé pour les flux de travail multi-modèles et la cohérence au sein des équipes

### Modèle d’exécution

- Créé dynamiquement lors de l’utilisation d’identifiants bruts de modèle via l’interface CLI (`--model`), des variables d’environnement ou des paramètres
- Non défini dans `modelProviders`
- Sa configuration est construite en « projetant » à travers plusieurs couches de résolution (CLI → variable d’environnement → paramètres → valeurs par défaut)
- Capturé automatiquement sous forme de **RuntimeModelSnapshot** dès qu’une configuration complète est détectée
- Permet une réutilisation sans avoir à saisir à nouveau les identifiants

### Cycle de vie de RuntimeModelSnapshot

Lorsque vous configurez un modèle sans utiliser `modelProviders`, Qwen Code crée automatiquement un RuntimeModelSnapshot afin de conserver votre configuration :

```bash

# Cette commande crée un RuntimeModelSnapshot avec l’identifiant : $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

Ce snapshot :

- Capture l’identifiant du modèle, la clé API, l’URL de base et la configuration de génération ;
- Persiste entre les sessions (stocké en mémoire pendant l’exécution) ;
- Apparaît dans la liste des options runtime de la commande `/model` ;
- Peut être sélectionné à l’aide de `/model $runtime|openai|my-custom-model`.

### Principales différences

| Aspect                     | Modèle de fournisseur           | Modèle d’exécution                         |
| -------------------------- | -------------------------------- | ------------------------------------------ |
| Source de configuration    | `modelProviders` dans les paramètres | CLI, variables d’environnement, couches de paramètres |
| Atomicité de la configuration | Package complet et imperméable   | Organisation en couches : chaque champ est résolu indépendamment |
| Réutilisabilité            | Toujours disponible dans la liste `/model` | Capturée sous forme d’instantané ; n’apparaît que si complète |
| Partage au sein d’une équipe | Oui (via les paramètres validés) | Non (local à l’utilisateur)                |
| Stockage des identifiants  | Référence uniquement via `envKey` | Peut capturer la clé réelle dans l’instantané |

### Quand utiliser chacun

- **Utilisez les modèles fournisseurs** lorsque : vous disposez de modèles standard partagés au sein d’une équipe, vous avez besoin de configurations cohérentes ou vous souhaitez éviter les remplacements accidentels.  
- **Utilisez les modèles d’exécution** lorsque : vous testez rapidement un nouveau modèle, utilisez des identifiants temporaires ou travaillez avec des points de terminaison ponctuels.

## Persistance de la sélection et recommandations

> [!important]
>
> Définissez `modelProviders` dans le fichier `~/.qwen/settings.json` au niveau utilisateur chaque fois que possible, et évitez de persister des substitutions d’identifiants dans n’importe quel autre domaine. Conserver le catalogue de fournisseurs dans les paramètres utilisateur empêche les conflits de fusion ou de substitution entre les domaines projet et utilisateur, et garantit que les mises à jour effectuées via `/auth` et `/model` sont toujours écrites dans un domaine cohérent.

- `/model` et `/auth` persistent `model.name` (le cas échéant) et `security.auth.selectedType` dans le domaine modifiable le plus proche qui définit déjà `modelProviders` ; à défaut, ils se rabattent sur le domaine utilisateur. Cela maintient la synchronisation entre les fichiers de l’espace de travail et de l’utilisateur et le catalogue de fournisseurs actif.
- En l’absence de `modelProviders`, le résolveur mélange les couches CLI, variables d’environnement et paramètres, créant ainsi des modèles d’exécution (*Runtime Models*). Cela fonctionne correctement dans les configurations à fournisseur unique, mais devient contraignant lors de changements fréquents. Définissez des catalogues de fournisseurs dès que des workflows multi-modèles sont courants, afin que les changements restent atomiques, attribués à leur source et débogables.
# Fournisseurs de modèles

Qwen Code vous permet de configurer plusieurs fournisseurs de modèles via le paramètre `modelProviders` dans votre `settings.json`. Cela vous permet de basculer entre différents modèles d'IA et fournisseurs à l'aide de la commande `/model`.

## Aperçu

Utilisez `modelProviders` pour déclarer des modèles par type d'authentification que le sélecteur `/model` peut utiliser pour basculer. Les clés doivent être des types d'authentification valides (`openai`, `anthropic`, `gemini`, etc.). Chaque type d'authentification correspond à un objet `ProviderConfig` avec un champ `protocol` et un champ `models` (le tableau des définitions de modèles). Chaque entrée dans `models` nécessite un `id` ; `envKey` est **optionnel et recommandé** (lorsqu'il est omis, il revient à la clé d'environnement par défaut du type d'authentification, par exemple `OPENAI_API_KEY` pour `openai`), avec des champs optionnels `name`, `description`, `baseUrl` et `generationConfig`. Les informations d'identification ne sont jamais persistées dans les paramètres ; l'exécution les lit depuis `process.env[envKey]`. Les modèles Qwen OAuth restent codés en dur et ne peuvent pas être remplacés.

> [!note]
>
> Seule la commande `/model` expose les types d'authentification autres que ceux par défaut. Anthropic, Gemini, etc., doivent être définis via `modelProviders`. La commande `/auth` liste trois options de premier niveau : **Alibaba ModelStudio** (avec les abonnements Coding Plan, Token Plan et la clé API Standard dans son sous-menu), **Fournisseurs Tiers** et **Fournisseur Personnalisé**. (Qwen OAuth n'est plus une entrée de boîte de dialogue sélectionnable ; son niveau gratuit a été interrompu le 15/04/2026.)

> [!note]
>
> **Unicité des modèles :** Les modèles d'un même `authType` sont identifiés de manière unique par la combinaison `id` + `baseUrl`. Cela signifie que vous pouvez définir le même ID de modèle (par exemple, `"gpt-4o"`) plusieurs fois sous un même `authType` tant que chaque entrée a un `baseUrl` différent — par exemple, une pointant directement vers OpenAI et une autre vers un point de terminaison proxy. Si deux entrées partagent à la fois le même `id` et le même `baseUrl` (ou si les deux omettent `baseUrl`), la première occurrence prévaut et les doublons suivants sont ignorés avec un avertissement.

## Exemples de configuration par type d'authentification

Vous trouverez ci-dessous des exemples de configuration complets pour différents types d'authentification, montrant les paramètres disponibles et leurs combinaisons.

### Types d'authentification pris en charge

Les clés de l'objet `modelProviders` doivent être des valeurs `authType` valides. Les types d'authentification actuellement pris en charge sont :

| Type d'authentification | Description                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`                | API compatibles OpenAI (OpenAI, Azure OpenAI, serveurs d'inférence locaux comme vLLM/Ollama)                                                         |
| `anthropic`             | API Anthropic Claude                                                                                                                            |
| `gemini`                | API Google Gemini                                                                                                                               |
| `qwen-oauth`            | Qwen OAuth (codé en dur, ne peut pas être remplacé dans `modelProviders`)                                                                               |
| `vertex-ai`             | Google Vertex AI (utilise le protocole `gemini` et le SDK `@google/genai` en mode Vertex AI ; le sélectionner définit `GOOGLE_GENAI_USE_VERTEXAI=true`) |

> [!warning]
> Si une clé de type d'authentification inconnue est utilisée (par exemple, une faute de frappe comme `"openai-custom"`), une clé non vide est acceptée telle quelle en tant que groupe de son propre type d'authentification, mais elle ne correspondra à aucun protocole connu — ses modèles ne fonctionneront donc pas comme prévu et ne se comporteront pas correctement dans le sélecteur `/model`. Seules les clés vides (composées uniquement d'espaces) sont ignorées. Utilisez toujours l'une des valeurs de type d'authentification prises en charge listées ci-dessus.

### SDK utilisés pour les requêtes API

Qwen Code utilise les SDK officiels suivants pour envoyer des requêtes à chaque fournisseur :

| Type d'authentification | Package SDK                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `openai`                | [`openai`](https://www.npmjs.com/package/openai) - SDK Node.js officiel OpenAI                  |
| `anthropic`             | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK officiel Anthropic |
| `gemini`                | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK officiel Google GenAI      |
| `qwen-oauth`            | [`openai`](https://www.npmjs.com/package/openai) avec un fournisseur personnalisé (compatible DashScope)    |

Cela signifie que le `baseUrl` que vous configurez doit être compatible avec le format d'API attendu par le SDK correspondant. Par exemple, lors de l'utilisation du type d'authentification `openai`, le point de terminaison doit accepter les requêtes au format de l'API OpenAI.

### Fournisseurs compatibles OpenAI (`openai`)

Ce type d'authentification prend en charge non seulement l'API officielle d'OpenAI, mais aussi tout point de terminaison compatible OpenAI, y compris les fournisseurs de modèles agrégés comme OpenRouter et Requesty.
```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
}
```

### Anthropic (`anthropic`)

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": {
      "protocol": "anthropic",
      "models": [
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
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": {
      "protocol": "gemini",
      "models": [
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
}
```

### Modèles auto-hébergés locaux (via une API compatible OpenAI)

La plupart des serveurs d'inférence locaux (vLLM, Ollama, LM Studio, etc.) fournissent un point de terminaison d'API compatible OpenAI. Configurez-les en utilisant le type d'authentification `openai` avec une `baseUrl` locale :

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
> Le paramètre `extra_body` est **uniquement pris en charge pour les fournisseurs compatibles OpenAI** (`openai`, `qwen-oauth`). Il est ignoré pour les fournisseurs Anthropic et Gemini.

> [!note]
>
> **À propos de `envKey`** : Le champ `envKey` spécifie le **nom d'une variable d'environnement**, pas la valeur réelle de la clé API. Pour que la configuration fonctionne, vous devez vous assurer que la variable d'environnement correspondante est définie avec votre vraie clé API. Deux méthodes sont possibles :
>
> - **Option 1 : Utilisation d'un fichier `.env`** (recommandé pour la sécurité) :
>   ```bash
>   # ~/.qwen/.env (ou racine du projet)
>   OPENAI_API_KEY=sk-votre-cle-reelle-ici
>   ```
>   Veillez à ajouter `.env` à votre `.gitignore` pour éviter de commettre accidentellement des secrets.
> - **Option 2 : Utilisation du champ `env` dans `settings.json`** (comme montré dans les exemples ci-dessus) :
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-votre-cle-reelle-ici"
>     }
>   }
>   ```
>
> Chaque exemple de fournisseur inclut un champ `env` pour illustrer comment la clé API doit être configurée.

## Plan de codage Alibaba Cloud

Le Plan de codage Alibaba Cloud fournit un ensemble préconfiguré de modèles Qwen optimisés pour les tâches de codage. Cette fonctionnalité est disponible pour les utilisateurs ayant un accès API au Plan de codage Alibaba Cloud et offre une expérience de configuration simplifiée avec des mises à jour automatiques de la configuration des modèles.

### Présentation

Lorsque vous vous authentifiez avec une clé API du Plan de codage Alibaba Cloud via la commande `/auth`, Qwen Code configure automatiquement les modèles suivants :

| ID du modèle         | Nom                   | Description                                               |
| -------------------- | --------------------- | --------------------------------------------------------- |
| `qwen3.5-plus`       | qwen3.5-plus          | Modèle avancé avec raisonnement activé                    |
| `qwen3.6-plus`       | qwen3.6-plus          | Modèle le plus récent avec raisonnement activé (Abonnés Pro uniquement) |
| `qwen3.7-plus`       | qwen3.7-plus          | Modèle avancé avec raisonnement activé                    |
| `qwen3-coder-plus`   | qwen3-coder-plus      | Optimisé pour les tâches de codage                        |
| `qwen3-coder-next`   | qwen3-coder-next      | Modèle de codage expérimental                             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Dernier modèle max avec raisonnement activé               |
| `glm-5`              | glm-5                 | Modèle GLM avec raisonnement activé                       |
| `glm-4.7`            | glm-4.7               | Modèle GLM avec raisonnement activé                       |
| `kimi-k2.5`          | kimi-k2.5             | Modèle Kimi avec raisonnement et support vision/vidéo     |
| `MiniMax-M2.5`       | MiniMax-M2.5          | Modèle MiniMax avec raisonnement activé                   |

### Configuration

1. Obtenez une clé API du Plan de codage Alibaba Cloud :
   - **Chine** : <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International** : <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Exécutez la commande `/auth` dans Qwen Code
3. Sélectionnez **Alibaba ModelStudio**, puis choisissez **Coding Plan** dans le sous-menu
4. Sélectionnez votre région
5. Saisissez votre clé API lorsque vous y êtes invité

Les modèles seront automatiquement configurés et ajoutés à votre sélecteur `/model`.

### Régions

Le Plan de codage Alibaba Cloud prend en charge deux régions :

| Région             | Point de terminaison                              | Description                    |
| ------------------ | ------------------------------------------------- | ------------------------------ |
| Chine              | `https://coding.dashscope.aliyuncs.com/v1`        | Point de terminaison Chine continentale |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1`   | Point de terminaison international |

La région est sélectionnée lors de l'authentification et stockée dans `settings.json` sous la configuration `modelProviders`. Pour changer de région, relancez la commande `/auth` et choisissez une région différente.

### Stockage de la clé API

Lorsque vous configurez le Plan de codage via la commande `/auth`, la clé API est stockée en utilisant le nom de variable d'environnement réservé `BAILIAN_CODING_PLAN_API_KEY`. Par défaut, elle est stockée dans le champ `env` de votre fichier `settings.json`.

> [!warning]
>
> **Recommandation de sécurité** : Pour une meilleure sécurité, il est recommandé de déplacer la clé API de `settings.json` vers un fichier `.env` séparé et de la charger en tant que variable d'environnement. Par exemple :
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=votre-cle-api-ici
> ```
>
> Assurez-vous ensuite que ce fichier est ajouté à votre `.gitignore` si vous utilisez des paramètres au niveau du projet.

### Mises à jour automatiques

Les configurations de modèles du Plan de codage sont versionnées. Lorsque Qwen Code détecte une version plus récente du modèle de configuration, vous serez invité à mettre à jour. Accepter la mise à jour :
Remplacez les configurations existantes du modèle Coding Plan par les dernières versions
- Préservez toute configuration personnalisée que vous avez ajoutée manuellement
- Basculez automatiquement vers le premier modèle de la configuration mise à jour

Le processus de mise à jour vous garantit d'avoir toujours accès aux dernières configurations de modèle et fonctionnalités sans intervention manuelle.

### Configuration manuelle (Avancé)

Si vous préférez configurer manuellement les modèles Coding Plan, vous pouvez les ajouter à votre `settings.json` comme pour tout fournisseur compatible OpenAI :

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
}
```

> [!note]
>
> Lorsque vous utilisez une configuration manuelle :
>
> - Vous pouvez utiliser n'importe quel nom de variable d'environnement pour `envKey`
> - Vous n'avez pas besoin de configurer `codingPlan.*`
> - **Les mises à jour automatiques ne s'appliqueront pas** aux modèles Coding Plan configurés manuellement

> [!warning]
>
> Si vous utilisez également la configuration automatique Coding Plan, les mises à jour automatiques peuvent écraser vos configurations manuelles si elles utilisent le même `envKey` et `baseUrl` que la configuration automatique. Pour éviter cela, assurez-vous que votre configuration manuelle utilise un `envKey` différent si possible.

## Couches de résolution et atomicité

Les valeurs effectives d'auth/model/credential sont sélectionnées par champ selon la priorité suivante (la première présente l'emporte). Vous pouvez combiner `--auth-type` avec `--model` pour pointer directement vers une entrée de fournisseur ; ces indicateurs CLI sont traités avant les autres couches.

| Couche (la plus élevée → la plus basse) | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| ---------------------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Surcharges programmatiques              | `/auth`                             | Entrée `/auth`                                  | Entrée `/auth`                                        | Entrée `/auth`                                         | —                      | —                                 |
| Sélection du fournisseur de modèle      | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| Arguments CLI                           | `--auth-type`                       | `--model`                                       | `--openai-api-key` (ou équivalents spécifiques au fournisseur) | `--openai-base-url` (ou équivalents spécifiques au fournisseur) | —                      | —                                 |
| Variables d'environnement               | —                                   | Mappage propre au fournisseur (ex. `OPENAI_MODEL`) | Mappage propre au fournisseur (ex. `OPENAI_API_KEY`)  | Mappage propre au fournisseur (ex. `OPENAI_BASE_URL`)  | —                      | —                                 |
| Paramètres (`settings.json`)            | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| Par défaut / calculé                   | Repli sur `AuthType.QWEN_OAUTH`     | Valeur par défaut intégrée (OpenAI ⇒ `qwen3.5-plus`) | —                                                     | —                                                      | —                      | `Config.getProxy()` si configuré |

\*Lorsqu'ils sont présents, les indicateurs CLI d'authentification remplacent les paramètres. Sinon, `security.auth.selectedType` ou la valeur par défaut implicite détermine le type d'authentification. Qwen OAuth et OpenAI sont les seuls types d'authentification disponibles sans configuration supplémentaire.

> [!warning]
>
> **Dépréciation de `security.auth.apiKey` et `security.auth.baseUrl` :** La configuration directe des identifiants API via `security.auth.apiKey` et `security.auth.baseUrl` dans `settings.json` est dépréciée. Ces paramètres étaient utilisés dans les versions historiques pour les identifiants saisis via l'interface utilisateur, mais le flux de saisie des identifiants a été supprimé dans la version 0.10.1. Ces champs seront entièrement supprimés dans une version future. **Il est fortement recommandé de migrer vers `modelProviders`** pour toutes les configurations de modèle et d'identifiant. Utilisez `envKey` dans `modelProviders` pour référencer des variables d'environnement pour une gestion sécurisée des identifiants, plutôt que de coder en dur les identifiants dans les fichiers de paramètres.

## Génération des couches de configuration : la couche fournisseur imperméable
La résolution de configuration suit un modèle de couches strict avec une règle cruciale : **la couche modelProvider est imperméable**.

### Comment ça fonctionne

1. **Lorsqu'UN modèle modelProvider EST sélectionné** (par ex., via la commande `/model` en choisissant un modèle configuré par un fournisseur) :
   - L'intégralité de `generationConfig` du fournisseur est appliquée **atomiquement**
   - **La couche du fournisseur est complètement imperméable** — les couches inférieures (CLI, env, paramètres) ne participent pas du tout à la résolution de generationConfig
   - Tous les champs définis dans `modelProviders[].generationConfig` utilisent les valeurs du fournisseur
   - Tous les champs **non définis** par le fournisseur sont mis à `undefined` (non hérités des paramètres)
   - Cela garantit que les configurations des fournisseurs agissent comme un « package scellé » complet et autonome

   Si un modèle est listé dans `modelProviders`, placez tous les paramètres de
   génération spécifiques à ce modèle dans l'entrée du fournisseur correspondant. Les valeurs
   `model.generationConfig` de niveau supérieur, y compris `contextWindowSize`,
   `modalities`, `customHeaders` et `extra_body`, sont ignorées pour les modèles
   des fournisseurs. Configurez ces champs sous
   `modelProviders[authType][].generationConfig` pour qu'ils s'appliquent.

2. **Lorsqu'AUCUN modèle modelProvider n'est sélectionné** (par ex., en utilisant `--model` avec un ID de modèle brut, ou en utilisant directement CLI/env/paramètres) :
   - La résolution redescend vers les couches inférieures
   - Les champs sont peuplés depuis CLI → env → paramètres → valeurs par défaut
   - Cela crée un **Modèle Runtime** (voir la section suivante)

### Priorité par champ pour `generationConfig`

| Priorité | Source                                        | Comportement                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Surcharges programmatiques                    | Modifications runtime `/model`, `/auth`                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **Couche imperméable** - remplace complètement tous les champs de generationConfig ; les couches inférieures ne participent pas |
| 3        | `settings.model.generationConfig`             | Utilisé uniquement pour les **Modèles Runtime** (lorsqu'aucun modèle fournisseur n'est sélectionné)                                    |
| 4        | Valeurs par défaut du générateur de contenu   | Valeurs par défaut spécifiques au fournisseur (ex. OpenAI vs Gemini) - uniquement pour les Modèles Runtime                            |

### Traitement atomique des champs

Les champs suivants sont traités comme des objets atomiques - les valeurs du fournisseur remplacent complètement l'objet entier, sans aucune fusion :

- `samplingParams` - Temperature, top_p, max_tokens, etc.
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

// Configuration modelProviders
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [{
        "id": "gpt-4o",
        "envKey": "OPENAI_API_KEY",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": { "temperature": 0.2 }
        }
      }]
    }
  }
}
```

Lorsque `gpt-4o` est sélectionné depuis modelProviders :

- `timeout` = 60000 (depuis le fournisseur, surcharge les paramètres)
- `samplingParams.temperature` = 0.2 (depuis le fournisseur, remplace complètement l'objet des paramètres)
- `samplingParams.max_tokens` = **undefined** (non défini dans le fournisseur, et la couche du fournisseur n'hérite pas des paramètres — les champs sont explicitement définis à undefined s'ils ne sont pas fournis)

Lorsqu'on utilise un modèle brut via `--model gpt-4` (pas depuis modelProviders, crée un Modèle Runtime) :

- `timeout` = 30000 (depuis les paramètres)
- `samplingParams.temperature` = 0.5 (depuis les paramètres)
- `samplingParams.max_tokens` = 1000 (depuis les paramètres)

La stratégie de fusion pour `modelProviders` elle-même est REMPLACER : l'intégralité de `modelProviders` depuis les paramètres du projet remplacera la section correspondante dans les paramètres utilisateur, plutôt que de fusionner les deux.

## Configuration du raisonnement / réflexion

Le champ optionnel `reasoning` sous `generationConfig` contrôle l'intensité avec laquelle le modèle raisonne avant de répondre. Les convertisseurs Anthropic et Gemini le respectent toujours. Le pipeline compatible OpenAI le respecte **sauf** si `generationConfig.samplingParams` est défini — voir l'avis « Interaction avec `samplingParams` » ci-dessous.

```jsonc
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "deepseek-v4-pro",
          "name": "DeepSeek V4 Pro",
          "baseUrl": "https://api.deepseek.com/v1",
          "envKey": "DEEPSEEK_API_KEY",
          "generationConfig": {
            // Échelle à quatre niveaux :
            //   'low'    | 'medium' — mappé côté serveur vers 'high' sur DeepSeek
            //   'high'   — intensité de raisonnement par défaut
            //   'max'    — niveau extra-fort spécifique à DeepSeek
            // Ou définir à `false` pour désactiver complètement le raisonnement.
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```
### Comportement par fournisseur

| Protocole / fournisseur                     | Forme sur le fil                                                         | Remarques                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)  | Paramètre `reasoning_effort: <effort>` à plat dans le corps              | Lorsque `reasoning.effort` est défini dans la forme imbriquée, il est réécrit en `reasoning_effort` à plat, et `'low'`/`'medium'` sont normalisés en `'high'`, `'xhigh'` en `'max'` — ce qui reflète la [rétrocompatibilité côté serveur](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) de DeepSeek. Les valeurs `samplingParams.reasoning_effort` ou `extra_body.reasoning_effort` de premier niveau ignorent cette normalisation et sont transmises telles quelles. |
| **OpenAI** (autres serveurs compatibles)    | `reasoning: { effort, ... }` transmis tel quel                           | Défini via `samplingParams` (p. ex. `samplingParams.reasoning_effort` pour les séries GPT‑5/o) lorsque le fournisseur attend une forme différente.                                                                                                                                                                                                                                                                                        |
| **Anthropic** (vrai `api.anthropic.com`)    | `output_config: { effort }` plus l'en-tête bêta `effort-2025-11-24`      | Le véritable Anthropic n'accepte que `'low'`/`'medium'`/`'high'`. `'max'` est **ramené à `'high'`** accompagné d'un `debugLogger.warn` (une fois par générateur) ; si vous voulez un effort maximal, basculez l'URL de base vers un point de terminaison compatible DeepSeek qui le supporte.                                                                                                                                              |
| **Anthropic** (`api.deepseek.com/anthropic`) | Mêmes `output_config: { effort }` + en-tête bêta                        | `'max'` est transmis sans modification.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Gemini** (`@google/genai`)                | `thinkingConfig: { includeThoughts: true, thinkingLevel }`               | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, autres → `THINKING_LEVEL_UNSPECIFIED` (Gemini n'a pas de palier `MAX`).                                                                                                                                                                                                                                                                                                                     |

### `reasoning: false`

Définir `reasoning: false` (le booléen littéral) désactive explicitement la réflexion chez tous les fournisseurs — utile pour les requêtes annexes peu coûteuses qui ne bénéficient pas d'un raisonnement. Cela est également honoré au niveau de la requête via `request.config.thinkingConfig.includeThoughts: false` pour des appels ponctuels (p. ex. génération de suggestions).

Sur une URL de base `api.deepseek.com`, le pipeline OpenAI émet le champ `thinking: { type: 'disabled' }` explicite que DeepSeek V4+ exige — la valeur par défaut côté serveur est `'enabled'`, donc omettre simplement `reasoning_effort` paierait toujours la latence/le coût de la réflexion. Les backends DeepSeek auto-hébergés (sglang/vllm) et les autres serveurs compatibles OpenAI **ne reçoivent pas** ce champ ; si vous devez désactiver la réflexion sur ceux-ci, injectez `thinking: { type: 'disabled' }` (ou la commande qu'expose votre framework d'inférence) via `samplingParams`/`extra_body`.

### Interaction avec `samplingParams` (compatibles OpenAI uniquement)

> [!warning]
>
> Lorsque `generationConfig.samplingParams` est défini sur un fournisseur compatible OpenAI, le pipeline envoie ces clés vers le fil **telles quelles** et ignore complètement l'injection séparée de `reasoning`. Ainsi, une configuration comme `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` supprimera silencieusement le champ `reasoning` sur les requêtes OpenAI/DeepSeek.
>
> Si vous définissez `samplingParams`, incluez la commande de raisonnement directement dedans — pour DeepSeek, c'est `samplingParams.reasoning_effort`, pour les séries GPT‑5/o, c'est `samplingParams.reasoning_effort` (leur champ à plat) ou `samplingParams.reasoning` (l'objet imbriqué). Pour OpenRouter et d'autres fournisseurs, le nom du champ varie ; consultez la documentation du fournisseur.
>
> Les convertisseurs Anthropic et Gemini ne sont pas affectés — ils lisent toujours `reasoning.effort` directement, indépendamment de `samplingParams`.
### `budget_tokens`

Vous pouvez fixer un budget exact de jetons de réflexion en incluant `budget_tokens` avec `effort` :

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Pour Anthropic, cela devient `thinking.budget_tokens`. Pour OpenAI/DeepSeek, le champ est conservé mais actuellement ignoré par le serveur — `reasoning_effort` reste le paramètre déterminant.

## Modèles fournisseur vs modèles d'exécution

Qwen Code distingue deux types de configurations de modèles :

### Modèle fournisseur

- Défini dans la configuration `modelProviders`
- Possède un package de configuration complet et atomique
- Lorsqu'il est sélectionné, sa configuration est appliquée comme une couche imperméable
- Apparaît dans la liste de la commande `/model` avec les métadonnées complètes (nom, description, capacités)
- Recommandé pour les workflows multi-modèles et la cohérence d'équipe

### Modèle d'exécution

- Créé dynamiquement lors de l'utilisation d'ID de modèles bruts via la CLI (`--model`), les variables d'environnement ou les paramètres
- N'est pas défini dans `modelProviders`
- La configuration est construite par « projection » à travers les couches de résolution (CLI → env → paramètres → valeurs par défaut)
- Automatiquement capturé comme **RuntimeModelSnapshot** lorsqu'une configuration complète est détectée
- Permet la réutilisation sans avoir à ressaisir les identifiants

### Cycle de vie de RuntimeModelSnapshot

Lorsque vous configurez un modèle sans utiliser `modelProviders`, Qwen Code crée automatiquement un RuntimeModelSnapshot pour préserver votre configuration :

```bash
# Ceci crée un RuntimeModelSnapshot avec l'ID : $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Le snapshot :

- Capture l'ID du modèle, la clé API, l'URL de base et la configuration de génération
- Persiste d'une session à l'autre (stocké en mémoire pendant l'exécution)
- Apparaît dans la liste de la commande `/model` comme une option d'exécution
- Peut être sélectionné via `/model $runtime|openai|my-custom-model`

### Différences clés

| Aspect                  | Modèle fournisseur                | Modèle d'exécution                        |
| ----------------------- | -------------------------------- | ----------------------------------------- |
| Source de configuration | `modelProviders` dans les paramètres | CLI, env, couches de paramètres           |
| Atomicité de config     | Package complet et imperméable    | En couches, chaque champ résolu indépendamment |
| Réutilisabilité         | Toujours disponible dans la liste `/model` | Capturé comme snapshot, apparaît si complet |
| Partage en équipe       | Oui (via les paramètres partagés) | Non (local à l'utilisateur)              |
| Stockage des identifiants | Référence via `envKey` uniquement | Peut capturer la clé réelle dans le snapshot |

### Quand utiliser chaque type

- **Utilisez les modèles fournisseur** lorsque : vous avez des modèles standards partagés au sein d'une équipe, avez besoin de configurations cohérentes, ou souhaitez éviter les écrasements accidentels
- **Utilisez les modèles d'exécution** lorsque : vous testez rapidement un nouveau modèle, utilisez des identifiants temporaires, ou travaillez avec des endpoints ad-hoc

## Persistance de la sélection et recommandations

> [!important]
>
> Définissez `modelProviders` dans le scope utilisateur `~/.qwen/settings.json` autant que possible et évitez de persister des écrasements d'identifiants dans n'importe quel scope. Conserver le catalogue de fournisseurs dans les paramètres utilisateur évite les conflits de fusion/écrasement entre les scopes projet et utilisateur et garantit que les mises à jour de `/auth` et `/model` écrivent toujours dans un scope cohérent.

- Les commandes `/model` et `/auth` persistent `model.name` (le cas échéant) et `security.auth.selectedType` dans le scope modifiable le plus proche qui définit déjà `modelProviders` ; sinon, elles tombent par défaut sur le scope utilisateur. Cela maintient la cohérence des fichiers d'espace de travail/utilisateur avec le catalogue actif de fournisseurs.
- Sans `modelProviders`, le résolveur mélange les couches CLI/env/paramètres, créant des modèles d'exécution. Cela convient pour les configurations mono-fournisseur mais devient fastidieux lors de changements fréquents. Définissez des catalogues de fournisseurs dès que les workflows multi-modèles sont courants afin que les changements restent atomiques, attribués à une source et déboguables.

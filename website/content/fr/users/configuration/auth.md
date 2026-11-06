# Authentification

Le menu `/auth` du premier lancement de Qwen Code propose cinq options principales. Choisissez celle qui correspond à la manière dont vous souhaitez exécuter le CLI :

- [**Compte Qwen avec abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code) : connectez-vous à votre compte Qwen via **Qwen OAuth** pour accéder à **Qwen Code and Agent** grâce à votre **abonnement Plus ou Pro** depuis [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code). Si vous n'avez pas encore d'abonnement, rendez-vous sur [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code) pour souscrire à l'offre Plus ou Pro, puis revenez dans Qwen Code et sélectionnez [**Compte Qwen avec abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code).
- **QwenCloud** : configuration officielle recommandée. Ouvre un sous-menu avec **Token Plan** (abonnement avec un quota mensuel de Crédits · endpoint dédié, éditions Personal et Team) ou **Clé API Standard** (paiement à l'usage). Vous choisissez ensuite explicitement la plateforme — **Chine — Plateforme AI Qianwen** ou **International — QwenCloud** — afin que la langue de l'interface ne détermine jamais votre endpoint. Les deux méthodes d'accès activent également l'outil intégré [`web_search`](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) sans configuration supplémentaire.
- **Alibaba ModelStudio** : ouvre un sous-menu avec **Coding Plan** (pour les développeurs individuels · quota hebdomadaire inclus), **Token Plan** (pour les équipes et les entreprises · facturation à l'usage avec un endpoint dédié) ou **Clé API Standard** (connexion avec une clé API ModelStudio existante). Token Plan et Clé API Standard activent également l'outil intégré [`web_search`](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) sans configuration supplémentaire. Les identifiants, endpoints et modèles ModelStudio enregistrés continuent de fonctionner sans modification.
- **Third-party Providers** : choisissez un fournisseur intégré et connectez-vous avec une clé API (DeepSeek, Grok, MiniMax, Z.AI, Kimi, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider** : connectez manuellement un serveur local, un proxy ou un fournisseur non pris en charge — prend en charge OpenAI, Anthropic, Gemini et d'autres endpoints compatibles.

## **Option 1 : Qwen OAuth —** [**Compte Qwen avec abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code)

Qwen OAuth vous permet de vous connecter avec votre compte Qwen et d'utiliser votre **abonnement Plus ou Pro** depuis [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code) pour accéder à **Qwen Code and Agent**. Dans le menu du premier lancement ou la fenêtre de dialogue `/auth`, choisissez [**Compte Qwen avec abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code) pour commencer.

- **Fonctionnement** : sélectionnez [**Compte Qwen avec abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code) et suivez le flux de connexion dans le navigateur pour autoriser Qwen Code avec votre compte Qwen.
- **Prérequis** : un compte Qwen avec un **abonnement Plus ou Pro** actif depuis [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code) et un accès Internet.
- **Avantages** : accédez à **Qwen Code and Agent** via votre abonnement Qwen sans configurer manuellement une clé API.
- **Coût et quota** : l'utilisation est soumise aux conditions de votre plan d'abonnement. Consultez [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code) pour plus de détails sur les plans Plus et Pro.

### **Configuration interactive**

1. Si vous n'avez pas encore d'abonnement, rendez-vous sur [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code) et souscrivez à l'offre **Plus ou Pro**. Si vous avez déjà un abonnement actif, passez à l'étape suivante.
2. Démarrez Qwen Code dans votre terminal :

   ```bash
   qwen
   ```

3. Dans le menu du premier lancement, choisissez [**Compte Qwen avec abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code). Si Qwen Code est déjà en cours d'exécution, saisissez `/auth` pour ouvrir le menu d'authentification et sélectionnez la même option.
4. Terminez le flux de connexion et d'autorisation dans le navigateur en utilisant le **même compte Qwen que celui utilisé pour souscrire à** [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code).
5. Revenez dans Qwen Code pour commencer à travailler avec votre abonnement.

Pour les environnements non interactifs où vous ne pouvez pas terminer le flux de connexion dans le navigateur, tels que CI ou conteneurs sans supervision, utilisez plutôt une méthode d'authentification basée sur une clé API.

## ☁️ Option 2 : QwenCloud

L'entrée officielle de la plateforme. Choisissez-la lorsque votre clé API provient de la Plateforme AI Qianwen (Chine) ou de QwenCloud (International).

- **Fonctionnement** : choisissez une méthode d'accès, puis sélectionnez explicitement la plateforme — la langue de l'interface ne détermine jamais votre endpoint. Saisissez la clé émise par cette plateforme et Qwen Code configure l'endpoint correspondant.
- **Méthodes d'accès** : **Token Plan** (un abonnement avec un quota mensuel de Crédits sur un endpoint dédié ; éditions Personal et Team) ou **Clé API Standard** (paiement à l'usage). Le Coding Plan _n'est_ pas proposé ici — c'est un produit Alibaba ModelStudio, voir Option 3.
- **Prérequis** : une clé Token Plan (préfixée par `sk-sp-`) générée depuis la console Token Plan, ou une clé à usage payant (préfixée par `sk-` ou `sk-ws-`) depuis la page des clés API de la plateforme.
- **Avantages** : les deux méthodes d'accès activent l'outil intégré [`web_search`](../../developers/tools/web-search.md) sans configuration supplémentaire.

| Plateforme                | Méthode d'accès  | Point de terminaison                                          | Clé API                                                                                  |
| ------------------------- | ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Chine — Qianwen AI Platform        | Clé API standard | `https://maas.qianwenaiapi.com/compatible-mode/v1`            | [Clés API](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) |
| Chine — Qianwen AI Platform        | Plan Token       | `https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1` | [Plan Token](https://platform.qianwenai.com/docs/token-plan/overview)                    |
| International — QwenCloud | Clé API standard | `https://maas.qwencloudapi.com/compatible-mode/v1`            | [Clés API](https://docs.qwencloud.com/developer-guides/administration/api-keys)          |
| International — QwenCloud | Plan Token       | `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` | [Plan Token](https://docs.qwencloud.com/token-plan/overview)                             |

### Configuration interactive

Saisissez `qwen` dans le terminal pour lancer Qwen Code, puis exécutez la commande `/auth`, sélectionnez **QwenCloud**, et choisissez **Plan Token** ou **Clé API standard** dans le sous-menu. Choisissez la plateforme (**Chine — Qianwen AI Platform** ou **International — QwenCloud**), puis saisissez votre clé API.

Qwen Code vérifie la liste des modèles du point de terminaison au démarrage avec votre clé enregistrée ; voir [Mises à jour des fournisseurs intégrés](#built-in-provider-updates).

### Configuration headless ou scriptée

Pour les environnements CI, conteneurs ou scripts, configurez la plateforme via des variables d'environnement plutôt que le flux interactif `/auth`.

```bash
# Pay-as-you-go (Standard API Key), International
export QWENCLOUD_API_KEY="sk-your-api-key"
export OPENAI_BASE_URL="https://maas.qwencloudapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

```bash
# Token Plan, China
export QWENCLOUD_TOKEN_PLAN_API_KEY="sk-sp-your-api-key"
export OPENAI_BASE_URL="https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

### Alternative : configurer via `settings.json`

Si vous préférez ignorer le flux interactif `/auth`, ajoutez ce qui suit à `~/.qwen/settings.json` :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-max",
        "name": "qwen3.8-max (QwenCloud)",
        "baseUrl": "https://maas.qwencloudapi.com/compatible-mode/v1",
        "description": "qwen3.8-max from QwenCloud Standard API Key",
        "envKey": "QWENCLOUD_API_KEY"
      }
    ]
  },
  "env": {
    "QWENCLOUD_API_KEY": "sk-your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.8-max"
  }
}
```

> [!note]
>
> `capabilities` est le seul identifiant de fournisseur qui n'est jamais déduit du nom du modèle, de sorte qu'une entrée écrite à la main se résout sans déclaration de raisonnement et `/effort` propose la liste générique des niveaux plutôt que l'ensemble curaté `low` / `medium` / `xhigh` de QwenCloud. Utilisez `/auth` pour installer le fournisseur lorsque vous souhaitez l'ensemble curaté.

Comme pour les autres clés spécifiques aux fournisseurs, `QWENCLOUD_API_KEY` et `QWENCLOUD_TOKEN_PLAN_API_KEY` prennent effet une fois qu'une entrée de fournisseur `settings.json` les déclare comme étant `envKey` ; pour sélectionner l'authentification compatible OpenAI uniquement via des variables d'environnement, exportez plutôt `OPENAI_API_KEY`.

> [!note]
>
> QwenCloud et Alibaba ModelStudio sont des entrées distinctes avec des clés d'environnement et des points de terminaison séparés. Le choix de QwenCloud ne réécrit ni ne supprime les identifiants, points de terminaison ou sélections de modèles ModelStudio enregistrés.

## 💳 Option 3 : Alibaba Cloud Coding Plan [#-option-3-alibaba-cloud-coding-plan]

Utilisez cette option si vous souhaitez des coûts prévisibles avec des options de modèles diversifiées et des quotas d'utilisation plus élevés.

- **Fonctionnement** : Abonnez-vous au Coding Plan avec un tarif mensuel fixe, puis configurez Qwen Code pour utiliser l'endpoint dédié et votre clé API d'abonnement.
- **Prérequis** : Obtenez un abonnement actif au Coding Plan depuis [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) ou [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), selon la région de votre compte.
- **Avantages** : Options de modèles diversifiées, quotas d'utilisation plus élevés, coûts mensuels prévisibles, accès à une large gamme de modèles (Qwen, GLM, Kimi, Minimax et plus encore).
- **Coût et quota** : Consultez la documentation du Coding Plan d'Aliyun ModelStudio [Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Alibaba Cloud Coding Plan est disponible dans deux régions :

| Région                       | URL de la console                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Pékin) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Configuration interactive

Saisissez `qwen` dans le terminal pour lancer Qwen Code, puis exécutez la commande `/auth`, sélectionnez **Alibaba ModelStudio** et choisissez **Coding Plan** dans le sous-menu. Choisissez votre région, puis saisissez votre clé `sk-sp-xxxxxxxxx`.

Qwen Code vérifie la liste des modèles du point de terminaison au démarrage avec votre clé enregistrée ; voir [Mises à jour des fournisseurs intégrés](#built-in-provider-updates).

Après l'authentification, utilisez la commande `/model` pour basculer entre tous les modèles pris en charge par Alibaba Cloud Coding Plan (y compris qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 et MiniMax-M2.5).

### Configuration headless ou scriptée

Pour les CI, conteneurs ou scripts, configurez le Coding Plan avec des variables d'environnement ou `settings.json` au lieu de la commande supprimée `qwen auth coding-plan`.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Utilisez `https://coding.dashscope.aliyuncs.com/v1` pour l'endpoint Chine (Pékin), ou `https://coding-intl.dashscope.aliyuncs.com/v1` pour l'endpoint international.

### Alternative : configurer via `settings.json`

Si vous préférez ignorer le flux interactif `/auth`, ajoutez ce qui suit à `~/.qwen/settings.json` :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> Le Coding Plan utilise un endpoint dédié (`https://coding.dashscope.aliyuncs.com/v1`) différent de l'endpoint Dashscope standard. Assurez-vous d'utiliser le bon `baseUrl`.

## 🪙 Option 4 : Alibaba Cloud Token Plan

Utilisez cette option si votre équipe ou entreprise préfère la facturation à l'usage sur un endpoint ModelStudio dédié.

- **Fonctionnement** : Abonnez-vous au Token Plan dans Alibaba Cloud ModelStudio, puis configurez Qwen Code pour utiliser l'endpoint Token Plan spécifique à la région et votre clé API. Vous êtes facturé pour la consommation réelle de tokens au lieu d'un tarif mensuel fixe.
- **Prérequis** : Obtenez une clé API Token Plan depuis [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) ou [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model), selon la région de votre compte.
- **Avantages** : Facturation à l'usage pour les équipes et les entreprises, endpoints dédiés spécifiques à chaque région, accès à une large gamme de modèles (Qwen, DeepSeek, GLM, Kimi, Minimax et plus encore).
- **Coût et quota** : Consultez la documentation du Token Plan d'Alibaba Cloud ModelStudio [Beijing](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model).

Le Token Plan est disponible dans deux régions, chacune avec son propre endpoint dédié :

| Région                    | Endpoint                                                                 | URL de la console                                                                                         |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Chine (Pékin)           | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`     | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing)                         |
| Singapour (International) | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1) |

### Configuration interactive

Saisissez `qwen` dans le terminal pour lancer Qwen Code, puis exécutez la commande `/auth`, sélectionnez **Alibaba ModelStudio**, et choisissez **Plan Token** dans le sous-menu. Choisissez votre région (**Chine (Pékin)** ou **Singapour (International)**), puis saisissez votre clé API. L'assistant affiche ensuite son étape finale (Étape 3/3 · ID de modèles), où vous sélectionnez les ID de modèles à configurer : les modèles servis par votre point de terminaison sont proposés là-bas et ne sont appliqués que si vous les sélectionnez explicitement. Les clés API du Plan Token ModelStudio n'ont pas d'exigence de préfixe, contrairement aux clés Coding Plan qui commencent par `sk-sp-`, et contrairement aux clés distinctes du Plan Token QwenCloud de l'Option 2, qui commencent également par `sk-sp-`.

Après l'authentification, utilisez la commande `/model` pour parcourir et basculer entre les modèles configurés pour votre Token Plan. La gamme de modèles évolue au fil du temps, elle n'est donc volontairement pas listée ici ; la découverte des modèles depuis l'endpoint se produit lors de l'étape de configuration `/auth` ci-dessus (la propre liste de l'endpoint y est proposée et doit être sélectionnée explicitement), puis `/model` affiche les modèles configurés pour votre plan.

Qwen Code vérifie également la liste des modèles du point de terminaison au démarrage avec votre clé API enregistrée, comme décrit dans [Mises à jour des fournisseurs intégrés](#built-in-provider-updates).

### Configuration headless ou scriptée

Pour les CI, conteneurs ou scripts, configurez le Token Plan avec des variables d'environnement ou `settings.json` au lieu du flux interactif `/auth`.

```bash
export BAILIAN_TOKEN_PLAN_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.7-plus"
```

Utilisez `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` pour l'endpoint Chine (Pékin), ou `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` pour l'endpoint international (Singapour). Remplacez `qwen3.7-plus` par n'importe quel modèle inclus dans votre plan.

Notez que `BAILIAN_TOKEN_PLAN_API_KEY` est une clé spécifique au fournisseur : elle prend effet une fois que l'entrée fournisseur `settings.json` de la section suivante existe, car cette entrée la déclare comme `envKey`. Pour sélectionner l'authentification compatible OpenAI avec uniquement des variables d'environnement, exportez `OPENAI_API_KEY` à la place — les clés spécifiques au fournisseur ne sélectionnent pas le type d'authentification à elles seules.

### Alternative : configurer via `settings.json`

Si vous préférez ignorer le flux interactif `/auth`, ajoutez ce qui suit à `~/.qwen/settings.json` :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "name": "qwen3.7-plus (Token Plan)",
        "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        "description": "qwen3.7-plus from Alibaba Cloud Token Plan",
        "envKey": "BAILIAN_TOKEN_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_TOKEN_PLAN_API_KEY": "your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.7-plus"
  }
}
```

> [!note]
>
> Le Token Plan utilise des endpoints dédiés spécifiques à chaque région (`*.maas.aliyuncs.com`) différents de l'endpoint DashScope standard. Assurez-vous que le `baseUrl` correspond à la région de votre abonnement.

## 🚀 Option 5 : Clé API (flexible)

Utilisez cette option si vous souhaitez vous connecter à des fournisseurs tiers tels qu'OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope, ou un endpoint auto-hébergé. Prend en charge plusieurs protocoles et fournisseurs.

### Recommandé : Configuration en un seul fichier via `settings.json` [#recommended-one-file-setup-via-settingsjson]

Le moyen le plus simple de commencer avec l'authentification par clé API est de tout mettre dans un seul fichier `~/.qwen/settings.json`. Voici un exemple complet et prêt à l'emploi :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder via Dashscope",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

Fonction de chaque champ :

| Champ                        | Description                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Déclare les modèles disponibles et comment s'y connecter. Les clés (`openai`, `anthropic`, `gemini`) représentent le protocole API.              |
| `env`                        | Stocke les clés API directement dans `settings.json` comme solution de secours (priorité la plus basse — les `export` du shell et les fichiers `.env` sont prioritaires).                  |
| `security.auth.selectedType` | Indique à Qwen Code quel protocole utiliser au démarrage (par exemple `openai`, `anthropic`, `gemini`). Sans cela, vous devriez exécuter `/auth` de manière interactive. |
| `model.name`                 | Le modèle par défaut à activer au démarrage de Qwen Code. Doit correspondre à l'une des valeurs `id` de vos `modelProviders`.                                |

Après avoir enregistré le fichier, exécutez simplement `qwen` — aucune configuration interactive de `/auth` n'est nécessaire.

> [!tip]
>
> Les sections ci-dessous expliquent chaque partie plus en détail. Si l'exemple rapide ci-dessus fonctionne pour vous, n'hésitez pas à passer directement aux [Notes de sécurité](#security-notes).

Le concept clé est **Model Providers** (`modelProviders`) : Qwen Code prend en charge plusieurs protocoles API, pas seulement OpenAI. Vous configurez les fournisseurs et modèles disponibles en modifiant `~/.qwen/settings.json`, puis vous basculez entre eux au moment de l'exécution avec la commande `/model`.

#### Protocoles pris en charge

| Protocole          | Clé `modelProviders` | Variables d'environnement                                                                                | Fournisseurs                                                                                             |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Compatible OpenAI | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (alias : `QWEN_MODEL`)                            | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, tout endpoint compatible OpenAI |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                         | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                     | Google Gemini                                                                                         |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY` + `GOOGLE_MODEL` (définit `GOOGLE_GENAI_USE_VERTEXAI=true`) ou `GOOGLE_CLOUD_PROJECT` + `GOOGLE_MODEL` (ADC sans clé) ; utilise le protocole `gemini` | Google Vertex AI                                                                                      |

#### Étape 1 : Configurer les modèles et les fournisseurs dans `~/.qwen/settings.json`

Définissez les modèles disponibles pour chaque protocole. Chaque entrée de modèle nécessite au minimum un `id` ; `envKey` (le nom de la variable d'environnement qui contient votre clé API) est optionnel mais recommandé — s'il est omis, il revient à la clé d'environnement par défaut du type d'authentification (par exemple `OPENAI_API_KEY` pour `openai`).

> [!important]
>
> Il est recommandé de définir `modelProviders` dans le `~/.qwen/settings.json` de l'utilisateur pour éviter les conflits de fusion entre les paramètres du projet et ceux de l'utilisateur.

Modifiez `~/.qwen/settings.json` (créez-le s'il n'existe pas). Vous pouvez mélanger plusieurs protocoles dans un seul fichier — voici un exemple multi-fournisseur montrant uniquement la section `modelProviders` :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> N'oubliez pas de définir également `env`, `security.auth.selectedType` et `model.name` en même temps que `modelProviders` — consultez l'[exemple complet ci-dessus](#recommended-one-file-setup-via-settingsjson) pour référence.

**Champs `ModelConfig` (chaque entrée dans `modelProviders`) :**

| Champ              | Requis | Description                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Oui      | ID du modèle envoyé à l'API (par exemple `gpt-4o`, `claude-sonnet-4-20250514`)                                                                               |
| `wireApi`          | Non       | Format de requête compatible OpenAI : `chat-completions` ou `responses`. Omettre pour hériter du protocole du fournisseur.                                        |
| `name`             | Non       | Nom d'affichage dans le sélecteur `/model` (par défaut `id`)                                                                                             |
| `envKey`           | Non       | Nom de la variable d'environnement pour la clé API (par exemple `OPENAI_API_KEY`) ; optionnel/recommandé — revient à la clé d'environnement par défaut du type d'authentification s'il est omis |
| `baseUrl`          | Non       | Remplacement de l'endpoint API (utile pour les proxys ou les endpoints personnalisés)                                                                                     |
| `generationConfig` | Non       | Ajuste `timeout`, `maxRetries`, `samplingParams`, etc.                                                                                          |

> [!note]
>
> Lors de l'utilisation du champ `env` dans `settings.json`, les identifiants sont stockés en texte clair. Pour une meilleure sécurité, préférez les fichiers `.env` ou les `export` du shell — consultez l'[Étape 2](#step-2-set-environment-variables).

Pour le schéma complet de `modelProviders` et les options avancées comme `generationConfig`, `customHeaders` et `extra_body`, consultez la [Référence des Model Providers](./model-providers.md).

#### Étape 2 : Définir les variables d'environnement [#step-2-set-environment-variables]

Qwen Code lit les clés API à partir des variables d'environnement (spécifiées par `envKey` dans votre configuration de modèle). Il existe plusieurs façons de les fournir, listées ci-dessous de la **priorité la plus élevée à la plus basse** :

**1. Environnement du shell / `export` (priorité la plus élevée)**

Défini directement dans votre profil shell (`~/.zshrc`, `~/.bashrc`, etc.) ou en ligne avant le lancement :

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-compatible
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Fichiers `.env`**

Qwen Code charge automatiquement le **premier** fichier `.env` qu'il trouve (les variables ne sont **pas fusionnées** entre plusieurs fichiers). Seules les variables non déjà présentes dans `process.env` sont chargées.

Ordre de recherche (à partir du répertoire courant, en remontant vers `/`) :

1. `.qwen/.env` (recommandé — isole les variables de Qwen Code des autres outils)
2. `.env`

Si rien n'est trouvé, il revient à votre **répertoire personnel** :

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` est recommandé plutôt que `.env` pour éviter les conflits avec d'autres outils. Certaines variables (comme `DEBUG` et `DEBUG_MODE`) sont exclues des fichiers `.env` au niveau du projet pour éviter d'interférer avec le comportement de Qwen Code.

**3. Champ `settings.json` → `env` (priorité la plus basse)**

Vous pouvez également définir les clés API directement dans `~/.qwen/settings.json` sous la clé `env`. Celles-ci sont chargées comme **solution de secours de plus basse priorité** — appliquées uniquement lorsqu'une variable n'est pas déjà définie par l'environnement système ou les fichiers `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

C'est l'approche utilisée dans l'[exemple de configuration en un seul fichier](#recommended-one-file-setup-via-settingsjson) ci-dessus. C'est pratique pour tout garder au même endroit, mais gardez à l'esprit que `settings.json` peut être partagé ou synchronisé — préférez les fichiers `.env` pour les secrets sensibles.

**Résumé des priorités :**

| Priorité    | Source                         | Comportement de remplacement                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (la plus élevée) | Flags CLI (`--openai-api-key`) | L'emporte toujours                                  |
| 2           | Env système (`export`, en ligne)  | Remplace `.env` et `settings.json` → `env` |
| 3           | Fichier `.env`                    | Définit uniquement si absent de l'env système               |
| 4 (la plus basse)  | `settings.json` → `env`        | Définit uniquement si absent de l'env système ou `.env`     |

#### Étape 3 : Changer de modèle avec `/model`

Après avoir lancé Qwen Code, utilisez la commande `/model` pour basculer entre tous les modèles configurés. Les modèles sont regroupés par protocole :

```
/model
```

Le sélecteur affichera tous les modèles de votre configuration `modelProviders`, regroupés par leur protocole (par exemple `openai`, `anthropic`, `gemini`). Votre sélection est persistée entre les sessions.

Vous pouvez également changer de modèle directement avec un argument en ligne de commande, ce qui est pratique lorsque vous travaillez sur plusieurs terminaux.

```bash
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## Mises à jour des fournisseurs intégrés [#built-in-provider-updates]

Les fournisseurs installés avec une liste de modèles intégrée peuvent proposer une **Mise à jour du fournisseur intégré** lorsqu'un nouveau préréglage est disponible.

QwenCloud (Plan Token et Clé API standard) et Alibaba ModelStudio (Coding Plan, Plan Token et Clé API standard) vérifient également `/models` au démarrage. Cette vérification utilise la variable de clé API spécifique au fournisseur enregistrée par `/auth` (par exemple, `BAILIAN_TOKEN_PLAN_API_KEY`), y compris les valeurs provenant de `settings.env`. Une clé fournie uniquement via un indicateur CLI, `OPENAI_API_KEY`, ou des paramètres d'authentification génériques n'active pas cette vérification ; les clés génériques ne sont pas transmises aux points de terminaison d'autres fournisseurs.

La découverte réussie limite la mise à jour aux modèles intégrés servis par votre clé, tout en préservant les modèles ajoutés par l'utilisateur. Elle peut également proposer une mise à jour lorsque l'ensemble des modèles servis change sans nouvelle version prédéfinie, par exemple après un changement de plan. La découverte seule conserve le modèle sélectionné ; une fois que vous avez changé de modèle, une vérification au démarrage ultérieur peut proposer sa suppression. Si le filtrage ne laisse aucun modèle intégré à installer, la configuration du fournisseur existante est conservée sans demande. Lorsque seul l'ensemble des modèles servis change, la mise à jour ajoute uniquement les nouveaux modèles servis, afin qu'un modèle exclu lors de `/auth` ne soit pas réajouté. Si rien ne doit changer, la vérification est enregistrée sans demande.

Si la découverte n'est pas disponible, échoue ou ne correspond à aucun modèle intégré, une mise à jour prédéfinie utilise la liste complète des modèles intégrés ; une installation déjà à jour reste inchangée. Les fournisseurs sans découverte continuent d'utiliser la liste des modèles intégrés.

**Plus tard** attend 24 heures avant de redemander pour la même version ou le même ensemble de modèles servis ; un changement différent peut toujours déclencher une demande. Mettre à jour, ignorer ou enregistrer silencieusement une décision plus récente efface le report précédent. **Ignorer** conserve votre configuration, y compris les modèles retenus : une version prédéfinie ignorée n'est plus proposée tant qu'une version plus récente n'est pas publiée, et un ensemble de modèles servis ignoré n'est plus proposé tant qu'il ne change pas.

## Commande CLI `qwen auth` supprimée

La commande CLI autonome `qwen auth` a été supprimée. Utilisez plutôt ces remplacements :

| Cas d'utilisation précédent                | Remplacement                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Configuration interactive de l'authentification | Exécutez `qwen`, puis utilisez `/auth`                                                                |
| Configuration du Coding Plan                | Utilisez `/auth`, ou définissez `BAILIAN_CODING_PLAN_API_KEY` avec l'URL de base du Coding Plan             |
| Configuration du Token Plan                 | Utilisez `/auth`, ou définissez `BAILIAN_TOKEN_PLAN_API_KEY` avec l'URL de base du Token Plan pour votre région |
| Configuration d'OpenRouter                 | Utilisez `/auth`, ou définissez `OPENROUTER_API_KEY` et `OPENAI_BASE_URL=https://openrouter.ai/api/v1` |
| Configuration de Requesty                   | Utilisez `/auth`, ou définissez `REQUESTY_API_KEY` et `OPENAI_BASE_URL=https://router.requesty.ai/v1`  |
| Configuration de la clé API ou du fournisseur personnalisé | Configurez `~/.qwen/settings.json`, `.env` ou les variables d'environnement spécifiques au fournisseur       |
| Vérifier l'authentification actuelle     | Exécutez `/doctor` dans Qwen Code                                                              |
| Flux du navigateur OAuth               | Exécutez `qwen` de manière interactive et utilisez `/auth` ; OAuth ne peut pas être configuré uniquement avec des variables d'env    |

Les invocations héritées telles que `qwen auth status` affichent un avis de suppression résumant ces chemins de migration, y compris une entrée Token Plan avec les URL de base des deux régions.

## Notes de sécurité [#security-notes]

- Ne commitez pas les clés API dans le contrôle de version.
- Préférez `.qwen/.env` pour les secrets locaux au projet (et gardez-le hors de git).
- Considérez la sortie de votre terminal comme sensible si elle affiche des identifiants pour vérification.

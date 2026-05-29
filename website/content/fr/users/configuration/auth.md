---
description: "Comparez les 3 méthodes d’authentification Qwen Code : API Key, Alibaba Cloud Coding Plan et OAuth. Choisissez vite l’accès adapté à vos quotas."
---

# Authentification

Qwen Code prend en charge trois méthodes d'authentification. Choisissez celle qui correspond à votre façon d'utiliser la CLI :

- **Qwen OAuth** : connectez-vous avec votre compte `qwen.ai` dans un navigateur. **L'offre gratuite a été interrompue le 2026-04-15** — passez à une autre méthode.
- **Alibaba Cloud Coding Plan** : utilisez une clé API Alibaba Cloud. Abonnement payant offrant une large sélection de modèles et des quotas plus élevés.
- **API Key** : utilisez votre propre clé API. Flexible selon vos besoins — prend en charge OpenAI, Anthropic, Gemini et d'autres endpoints compatibles.

## Option 1 : Qwen OAuth (Interrompu)

> [!warning]
>
> L'offre gratuite Qwen OAuth a été interrompue le 2026-04-15. Les tokens mis en cache existants peuvent continuer à fonctionner brièvement, mais les nouvelles requêtes seront rejetées. Veuillez passer à Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) ou un autre fournisseur. Exécutez `qwen auth` pour configurer.

- **Fonctionnement** : au premier lancement, Qwen Code ouvre une page de connexion dans le navigateur. Une fois terminé, les identifiants sont mis en cache localement, ce qui évite généralement de devoir se reconnecter.
- **Prérequis** : un compte `qwen.ai` + un accès internet (au moins pour la première connexion).
- **Avantages** : aucune gestion de clé API, actualisation automatique des identifiants.
- **Coût et quota** : l'offre gratuite a été interrompue depuis le 2026-04-15.

Lancez la CLI et suivez le flux dans le navigateur :

```bash
qwen
```

Ou authentifiez-vous directement sans lancer de session :

```bash
qwen auth qwen-oauth
```

> [!note]
>
> Dans les environnements non interactifs ou headless (ex. : CI, SSH, conteneurs), vous ne pouvez généralement **pas** terminer le flux de connexion OAuth via navigateur.  
> Dans ces cas, veuillez utiliser la méthode d'authentification Alibaba Cloud Coding Plan ou API Key.

## 💳 Option 2 : Alibaba Cloud Coding Plan

Choisissez cette option si vous souhaitez des coûts prévisibles, une large sélection de modèles et des quotas d'utilisation plus élevés.

- **Fonctionnement** : abonnez-vous au Coding Plan avec un tarif mensuel fixe, puis configurez Qwen Code pour utiliser l'endpoint dédié et votre clé API d'abonnement.
- **Prérequis** : souscrivez à un abonnement Coding Plan actif via [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) ou [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), selon la région de votre compte.
- **Avantages** : large sélection de modèles, quotas d'utilisation plus élevés, coûts mensuels prévisibles, accès à une vaste gamme de modèles (Qwen, GLM, Kimi, Minimax, etc.).
- **Coût et quota** : consultez la documentation du Coding Plan Aliyun ModelStudio[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Alibaba Cloud Coding Plan est disponible dans deux régions :

| Région                       | URL de la console                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Configuration interactive

Vous pouvez configurer l'authentification Coding Plan de deux manières :

**Option A : Depuis le terminal (recommandé pour une première configuration)**

```bash
# Interactive — prompts for region and API key
qwen auth coding-plan

# Or non-interactive — pass region and key directly
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx
```

**Option B : Dans une session Qwen Code**

Saisissez `qwen` dans le terminal pour lancer Qwen Code, puis exécutez la commande `/auth` et sélectionnez **Alibaba Cloud Coding Plan**. Choisissez votre région, puis saisissez votre clé `sk-sp-xxxxxxxxx`.

Après l'authentification, utilisez la commande `/model` pour basculer entre tous les modèles pris en charge par Alibaba Cloud Coding Plan (dont qwen3.5-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max, glm-4.7 et kimi-k2.5).

### Alternative : configuration via `settings.json`

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

## 🚀 Option 3 : API Key (flexible)

Choisissez cette option si vous souhaitez vous connecter à des fournisseurs tiers tels qu'OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope ou un endpoint auto-hébergé. Prend en charge plusieurs protocoles et fournisseurs.

### Recommandé : configuration en un seul fichier via `settings.json`

La méthode la plus simple pour commencer avec l'authentification par clé API est de tout regrouper dans un seul fichier `~/.qwen/settings.json`. Voici un exemple complet et prêt à l'emploi :

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

Description de chaque champ :

| Champ                        | Description                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Déclare les modèles disponibles et comment s'y connecter. Les clés (`openai`, `anthropic`, `gemini`) représentent le protocole API.              |
| `env`                        | Stocke les clés API directement dans `settings.json` comme solution de secours (priorité la plus basse — les `export` shell et les fichiers `.env` sont prioritaires).                  |
| `security.auth.selectedType` | Indique à Qwen Code quel protocole utiliser au démarrage (ex. `openai`, `anthropic`, `gemini`). Sans cela, vous devrez exécuter `/auth` de manière interactive. |
| `model.name`                 | Le modèle par défaut à activer au démarrage de Qwen Code. Doit correspondre à l'une des valeurs `id` de vos `modelProviders`.                                |

Après avoir enregistré le fichier, exécutez simplement `qwen` — aucune configuration interactive `/auth` n'est nécessaire.

> [!tip]
>
> Les sections ci-dessous détaillent chaque partie. Si l'exemple rapide ci-dessus fonctionne pour vous, n'hésitez pas à passer directement aux [Notes de sécurité](#security-notes).

Le concept clé est celui des **Model Providers** (`modelProviders`) : Qwen Code prend en charge plusieurs protocoles API, pas seulement OpenAI. Vous configurez les fournisseurs et modèles disponibles en modifiant `~/.qwen/settings.json`, puis vous basculez entre eux à l'exécution avec la commande `/model`.

#### Protocoles pris en charge

| Protocole          | Clé `modelProviders` | Variables d'environnement                                        | Fournisseurs                                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| OpenAI-compatible | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud, tout endpoint compatible OpenAI |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                            |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                               |

#### Étape 1 : Configurer les modèles et fournisseurs dans `~/.qwen/settings.json`

Définissez les modèles disponibles pour chaque protocole. Chaque entrée de modèle nécessite au minimum un `id` et un `envKey` (le nom de la variable d'environnement contenant votre clé API).

> [!important]
>
> Il est recommandé de définir `modelProviders` dans le fichier `~/.qwen/settings.json` (scope utilisateur) pour éviter les conflits de fusion entre les paramètres du projet et ceux de l'utilisateur.

Modifiez `~/.qwen/settings.json` (créez-le s'il n'existe pas). Vous pouvez mélanger plusieurs protocoles dans un seul fichier — voici un exemple multi-fournisseurs affichant uniquement la section `modelProviders` :

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
> N'oubliez pas de définir également `env`, `security.auth.selectedType` et `model.name` en plus de `modelProviders` — consultez l'[exemple complet ci-dessus](#recommended-one-file-setup-via-settingsjson) pour référence.

**Champs `ModelConfig` (chaque entrée dans `modelProviders`) :**

| Champ              | Obligatoire | Description                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `id`               | Oui      | ID du modèle envoyé à l'API (ex. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `name`             | Non       | Nom d'affichage dans le sélecteur `/model` (par défaut `id`)               |
| `envKey`           | Oui      | Nom de la variable d'environnement pour la clé API (ex. `OPENAI_API_KEY`)    |
| `baseUrl`          | Non       | Remplacement de l'endpoint API (utile pour les proxies ou endpoints personnalisés)       |
| `generationConfig` | Non       | Ajustement fin de `timeout`, `maxRetries`, `samplingParams`, etc.            |

> [!note]
>
> Lors de l'utilisation du champ `env` dans `settings.json`, les identifiants sont stockés en texte clair. Pour une meilleure sécurité, privilégiez les fichiers `.env` ou les `export` shell — consultez l'[Étape 2](#step-2-set-environment-variables).

Pour le schéma complet `modelProviders` et les options avancées comme `generationConfig`, `customHeaders` et `extra_body`, consultez la [Référence des Model Providers](model-providers.md).

#### Étape 2 : Définir les variables d'environnement

Qwen Code lit les clés API depuis les variables d'environnement (spécifiées par `envKey` dans votre configuration de modèle). Il existe plusieurs façons de les fournir, listées ci-dessous de la **priorité la plus haute à la plus basse** :

**1. Environnement shell / `export` (priorité la plus haute)**

Définissez-les directement dans votre profil shell (`~/.zshrc`, `~/.bashrc`, etc.) ou en ligne avant le lancement :

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

Qwen Code charge automatiquement le **premier** fichier `.env` qu'il trouve (les variables ne sont **pas fusionnées** entre plusieurs fichiers). Seules les variables absentes de `process.env` sont chargées.

Ordre de recherche (depuis le répertoire courant, en remontant vers `/`) :

1. `.qwen/.env` (recommandé — isole les variables Qwen Code des autres outils)
2. `.env`

Si rien n'est trouvé, il utilise par défaut votre **répertoire personnel** :

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` est recommandé plutôt que `.env` pour éviter les conflits avec d'autres outils. Certaines variables (comme `DEBUG` et `DEBUG_MODE`) sont exclues des fichiers `.env` au niveau du projet pour éviter d'interférer avec le comportement de Qwen Code.

**3. Champ `env` dans `settings.json` (priorité la plus basse)**

Vous pouvez également définir les clés API directement dans `~/.qwen/settings.json` sous la clé `env`. Elles sont chargées comme **fallback de priorité la plus basse** — appliquées uniquement si la variable n'est pas déjà définie par l'environnement système ou les fichiers `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

C'est l'approche utilisée dans l'[exemple de configuration en un seul fichier](#recommended-one-file-setup-via-settingsjson) ci-dessus. C'est pratique pour tout centraliser, mais gardez à l'esprit que `settings.json` peut être partagé ou synchronisé — privilégiez les fichiers `.env` pour les secrets sensibles.

**Résumé des priorités :**

| Priorité    | Source                         | Comportement de remplacement                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (la plus haute) | Flags CLI (`--openai-api-key`) | Toujours prioritaire                                  |
| 2           | Env système (`export`, en ligne)  | Remplace `.env` et `settings.json` → `env` |
| 3           | Fichier `.env`                    | Défini uniquement si absent de l'env système               |
| 4 (la plus basse)  | `settings.json` → `env`        | Défini uniquement si absent de l'env système ou `.env`     |

#### Étape 3 : Basculer entre les modèles avec `/model`

Après avoir lancé Qwen Code, utilisez la commande `/model` pour basculer entre tous les modèles configurés. Les modèles sont regroupés par protocole :

```
/model
```

Le sélecteur affichera tous les modèles de votre configuration `modelProviders`, regroupés par protocole (ex. `openai`, `anthropic`, `gemini`). Votre sélection est conservée entre les sessions.

Vous pouvez également basculer directement de modèle via un argument en ligne de commande, ce qui est pratique lorsque vous travaillez sur plusieurs terminaux.

```bash
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## Commande CLI `qwen auth`

En plus de la commande slash `/auth` en session, Qwen Code propose la commande CLI autonome `qwen auth` pour gérer l'authentification directement depuis le terminal — sans avoir à lancer une session interactive au préalable.

### Mode interactif

Exécutez `qwen auth` sans arguments pour afficher un menu interactif :

```bash
qwen auth
```

Un sélecteur avec navigation aux flèches s'affiche :

```
Select authentication method:

  Alibaba Cloud Coding Plan - Paid · Up to 6,000 requests/5 hrs · All Alibaba Cloud Coding Plan Models
  API Key - Bring your own API key
  Qwen OAuth - Discontinued — switch to Coding Plan or API Key

(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)
```

### Sous-commandes

| Commande                                              | Description                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | Configuration interactive de l'authentification                  |
| `qwen auth coding-plan`                              | Authentification avec Alibaba Cloud Coding Plan       |
| `qwen auth coding-plan --region china --key sk-sp-…` | Configuration non interactive du Coding Plan (pour les scripts) |
| `qwen auth api-key`                                  | Authentification avec une clé API                      |
| `qwen auth qwen-oauth`                               | Authentification avec Qwen OAuth (interrompu)       |
| `qwen auth status`                                   | Afficher l'état actuel de l'authentification                |

**Exemples :**

```bash
# Authenticate with Qwen OAuth directly
qwen auth qwen-oauth

# Set up Coding Plan interactively (prompts for region and key)
qwen auth coding-plan

# Set up Coding Plan non-interactively (useful for CI/scripting)
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx

# Set up API key (ModelStudio Standard or custom provider)
qwen auth api-key

# Check your current auth configuration
qwen auth status
```

## Notes de sécurité

- Ne commitez pas de clés API dans le contrôle de version.
- Privilégiez `.qwen/.env` pour les secrets locaux au projet (et excluez-le de git).
- Considérez la sortie de votre terminal comme sensible si elle affiche des identifiants pour vérification.
# Authentification

Qwen Code prend en charge trois méthodes d’authentification. Choisissez celle qui correspond à la façon dont vous souhaitez exécuter l’interface CLI :

- **OAuth Qwen** : connectez-vous avec votre compte `qwen.ai` depuis un navigateur. Gratuit, avec un quota quotidien.
- **Plan de codage Alibaba Cloud** : utilisez une clé API fournie par Alibaba Cloud. Abonnement payant proposant divers modèles et des quotas plus élevés.
- **Clé API** : utilisez votre propre clé API. Flexible selon vos besoins — prend en charge les endpoints OpenAI, Anthropic, Gemini et d’autres compatibles.

## Option 1 : OAuth Qwen (gratuit)

Utilisez cette méthode si vous souhaitez la configuration la plus simple et que vous utilisez des modèles Qwen.

- **Fonctionnement** : au premier lancement, Qwen Code ouvre une page de connexion dans votre navigateur. Une fois celle-ci terminée, vos identifiants sont mis en cache localement, ce qui signifie que vous n’aurez généralement pas besoin de vous reconnecter.
- **Conditions requises** : un compte `qwen.ai` et une connexion Internet (au moins pour la première connexion).
- **Avantages** : aucune gestion manuelle de clé API, actualisation automatique des identifiants.
- **Coût et quota** : gratuit, avec un quota de **60 requêtes/minute** et **1 000 requêtes/jour**.

Démarrez l’interface CLI et suivez le flux dans le navigateur :

```bash
qwen
```

> [!note]
>
> Dans les environnements non interactifs ou sans interface graphique (par exemple, CI, SSH, conteneurs), vous ne pouvez **généralement pas** finaliser le flux de connexion OAuth via le navigateur.  
> Dans ces cas, veuillez utiliser le plan « Alibaba Cloud Coding » ou l’authentification par clé API.

## 💳 Option 2 : Plan de codage Alibaba Cloud

Utilisez cette option si vous souhaitez des coûts prévisibles, un large choix de modèles et des quotas d’utilisation plus élevés.

- **Fonctionnement** : Souscrivez au Plan de codage avec un abonnement mensuel fixe, puis configurez Qwen Code pour utiliser le point de terminaison dédié et la clé API associée à votre abonnement.
- **Conditions requises** : Obtenez un abonnement actif au Plan de codage depuis [Aliyun Bailian](https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan) ou [Alibaba Cloud](https://bailian.console.alibabacloud.com/?tab=model#/efm/coding_plan), selon la région de votre compte.
- **Avantages** : Choix étendu de modèles, quotas d’utilisation plus élevés, coûts mensuels prévisibles, accès à une vaste gamme de modèles (Qwen, GLM, Kimi, Minimax, etc.).
- **Coût et quota** : Consultez la [documentation du Plan de codage Aliyun Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

Le Plan de codage Alibaba Cloud est disponible dans deux régions :

| Région                           | URL de la console                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Aliyun Bailian (aliyun.com)      | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)                 |
| Alibaba Cloud (alibabacloud.com) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)     |

### Configuration interactive

Entrez `qwen` dans le terminal pour lancer Qwen Code, puis exécutez la commande `/auth` et sélectionnez **Plan de codage Alibaba Cloud**. Choisissez votre région, puis saisissez votre clé `sk-sp-xxxxxxxxx`.

Une fois l’authentification effectuée, utilisez la commande `/model` pour basculer entre tous les modèles pris en charge par le Plan de codage Alibaba Cloud (y compris `qwen3.5-plus`, `qwen3-coder-plus`, `qwen3-coder-next`, `qwen3-max`, `glm-4.7` et `kimi-k2.5`).

### Alternative : configuration via `settings.json`

Si vous préférez ignorer le flux interactif `/auth`, ajoutez ce qui suit à `~/.qwen/settings.json` :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Plan de codage)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus du Plan de codage d'Alibaba Cloud",
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
> Le Plan de codage utilise un point de terminaison dédié (`https://coding.dashscope.aliyuncs.com/v1`) différent de celui standard de Dashscope. Assurez-vous d’utiliser le `baseUrl` correct.

## 🚀 Option 3 : Clé API (souple)

Utilisez cette option si vous souhaitez vous connecter à des fournisseurs tiers tels qu’OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope ou un point de terminaison auto-hébergé. Prend en charge plusieurs protocoles et fournisseurs.

### Recommandé : Configuration en un seul fichier via `settings.json`

La méthode la plus simple pour commencer avec l’authentification par clé API consiste à tout placer dans un seul fichier `~/.qwen/settings.json`. Voici un exemple complet, prêt à l’emploi :

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

Rôle de chaque champ :

| Champ                        | Description                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Déclare quels modèles sont disponibles et comment s’y connecter. Les clés (`openai`, `anthropic`, `gemini`) représentent le protocole d’API utilisé. |
| `env`                        | Stocke les clés API directement dans `settings.json` comme solution de repli (priorité la plus faible — les variables d’environnement définies via `export` dans le shell ou les fichiers `.env` ont priorité). |
| `security.auth.selectedType` | Indique à Qwen Code quel protocole utiliser au démarrage (par exemple `openai`, `anthropic`, `gemini`). Sans cette entrée, vous devriez exécuter `/auth` de façon interactive. |
| `model.name`                 | Modèle par défaut activé au lancement de Qwen Code. Doit correspondre à l’une des valeurs `id` figurant dans votre section `modelProviders`. |

Une fois le fichier enregistré, lancez simplement `qwen` — aucune configuration interactive `/auth` n’est nécessaire.

> [!tip]
>
> Les sections suivantes détaillent chacune de ces parties. Si l’exemple rapide ci-dessus fonctionne pour vous, n’hésitez pas à passer directement aux [Notes sur la sécurité](#security-notes).

Le concept central est celui des **fournisseurs de modèles** (`modelProviders`) : Qwen Code prend en charge plusieurs protocoles d’API, pas uniquement OpenAI. Vous configurez les fournisseurs et modèles disponibles en éditant `~/.qwen/settings.json`, puis vous pouvez les basculer à l’exécution à l’aide de la commande `/model`.

#### Protocoles pris en charge

| Protocole             | Clé `modelProviders` | Variables d’environnement                                              | Fournisseurs                                                                                   |
| --------------------- | --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Compatible OpenAI     | `openai`              | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`                    | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud, tout point de terminaison compatible avec OpenAI |
| Anthropic               | `anthropic`           | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`           | Claude d’Anthropic                                                                               |
| Google GenAI            | `gemini`              | `GEMINI_API_KEY`, `GEMINI_MODEL`                                       | Google Gemini                                                                                    |

#### Étape 1 : Configurer les modèles et fournisseurs dans `~/.qwen/settings.json`

Définissez quels modèles sont disponibles pour chaque protocole. Chaque entrée de modèle requiert au minimum un champ `id` et un champ `envKey` (le nom de la variable d’environnement contenant votre clé API).

> [!important]
>
> Il est recommandé de définir `modelProviders` dans le fichier `~/.qwen/settings.json` au niveau utilisateur afin d’éviter les conflits de fusion entre les paramètres projet et les paramètres utilisateur.

Modifiez le fichier `~/.qwen/settings.json` (créez-le s’il n’existe pas). Vous pouvez combiner plusieurs protocoles dans un seul fichier — voici un exemple multi-fournisseur présentant uniquement la section `modelProviders` :

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
> N’oubliez pas de configurer également les champs `env`, `security.auth.selectedType` et `model.name` en complément de `modelProviders` — consultez l’[exemple complet ci-dessus](#recommended-one-file-setup-via-settingsjson) pour référence.

**Champs de `ModelConfig` (chaque entrée à l’intérieur de `modelProviders`) :**

| Champ               | Obligatoire | Description                                                                 |
| ------------------- | ----------- | --------------------------------------------------------------------------- |
| `id`                | Oui         | Identifiant du modèle envoyé à l’API (ex. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `name`              | Non         | Nom affiché dans le sélecteur `/model` (par défaut : valeur de `id`)        |
| `envKey`            | Oui         | Nom de la variable d’environnement contenant la clé API (ex. `OPENAI_API_KEY`) |
| `baseUrl`           | Non         | Remplacement de l’URL de l’endpoint API (utile pour les proxys ou endpoints personnalisés) |
| `generationConfig`  | Non         | Ajustement fin des paramètres tels que `timeout`, `maxRetries`, `samplingParams`, etc. |

> [!note]
>
> Lorsque vous utilisez le champ `env` dans `settings.json`, les identifiants sont stockés en clair. Pour une meilleure sécurité, privilégiez plutôt les fichiers `.env` ou les commandes shell `export` — voir l’[Étape 2](#step-2-set-environment-variables).

Pour le schéma complet de `modelProviders` et les options avancées telles que `generationConfig`, `customHeaders` et `extra_body`, consultez la [Référence des fournisseurs de modèles](model-providers.md).

#### Étape 2 : Définir les variables d’environnement

Qwen Code lit les clés API depuis les variables d’environnement (spécifiées par `envKey` dans la configuration de votre modèle). Plusieurs méthodes permettent de les fournir, listées ci-dessous par **ordre de priorité décroissante** :

**1. Environnement shell / commande `export` (priorité la plus élevée)**

Définissez-les directement dans le fichier de profil de votre shell (`~/.zshrc`, `~/.bashrc`, etc.) ou en ligne avant de lancer l’application :

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / Compatible avec OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Fichiers `.env`**

Qwen Code charge automatiquement le **premier** fichier `.env` qu’il trouve (les variables ne sont **pas fusionnées** entre plusieurs fichiers). Seules les variables encore absentes de `process.env` sont chargées.

Ordre de recherche (à partir du répertoire courant, en remontant vers `/`) :

1. `.qwen/.env` (recommandé — isole les variables Qwen Code des autres outils)
2. `.env`

Si aucun fichier n’est trouvé, la recherche se poursuit dans votre **répertoire personnel** :

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> Préférez `.qwen/.env` à `.env` afin d’éviter tout conflit avec d’autres outils. Certaines variables (telles que `DEBUG` et `DEBUG_MODE`) sont explicitement exclues des fichiers `.env` au niveau du projet pour ne pas interférer avec le comportement de Qwen Code.

**3. Champ `env` dans `settings.json` (priorité la plus faible)**

Vous pouvez également définir directement vos clés API dans `~/.qwen/settings.json`, sous la clé `env`. Ces valeurs sont chargées comme **dernier recours**, uniquement si la variable n’a pas déjà été définie via l’environnement système ou un fichier `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Cette méthode est utilisée dans l’[exemple de configuration mono-fichier](#recommended-one-file-setup-via-settingsjson) ci-dessus. Elle permet de centraliser tous les paramètres, mais soyez conscient que `settings.json` peut être partagé ou synchronisé — privilégiez les fichiers `.env` pour stocker des secrets sensibles.

**Résumé des priorités :**

| Priorité    | Source                         | Comportement de substitution                            |
| ----------- | ------------------------------ | ------------------------------------------------------- |
| 1 (la plus élevée) | Options CLI (`--openai-api-key`) | L’emporte toujours                                     |
| 2           | Environnement système (`export`, en ligne) | Remplace les valeurs provenant de `.env` et de `settings.json` → `env` |
| 3           | Fichier `.env`                 | Ne définit une variable que si elle n’est pas déjà présente dans l’environnement système |
| 4 (la plus faible) | `settings.json` → `env`        | Ne définit une variable que si elle n’est ni dans l’environnement système ni dans un fichier `.env` |

#### Étape 3 : Changer de modèle avec `/model`

Après avoir lancé Qwen Code, utilisez la commande `/model` pour basculer entre tous les modèles configurés. Les modèles sont regroupés par protocole :

```
/model
```

Le sélecteur affichera tous les modèles issus de votre configuration `modelProviders`, regroupés selon leur protocole (par exemple `openai`, `anthropic`, `gemini`). Votre sélection est conservée d’une session à l’autre.

Vous pouvez également changer de modèle directement à l’aide d’un argument en ligne de commande, ce qui est pratique lorsque vous travaillez dans plusieurs terminaux.

```bash

# Dans un terminal

qwen --model "qwen3-coder-plus"

# Dans un autre terminal

qwen --model "qwen3.5-plus"
```

## Remarques relatives à la sécurité

- Ne validez pas les clés API dans le système de contrôle de version.
- Préférez le fichier `.qwen/.env` pour stocker les secrets propres au projet (et assurez-vous qu’il n’est pas suivi par Git).
- Considérez la sortie de votre terminal comme sensible si elle affiche des identifiants à des fins de vérification.
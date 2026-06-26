# Authentification

Le menu `/auth` de premier lancement de Qwen Code propose trois options principales. Choisissez celle qui correspond à la façon dont vous souhaitez exécuter le CLI :

- **Alibaba ModelStudio** : configuration officielle recommandée. Ouvre un sous-menu avec **Coding Plan** (pour les développeurs individuels · quota hebdomadaire inclus), **Token Plan** (pour les équipes et les entreprises · facturation à l'usage avec un endpoint dédié) ou **Standard API Key** (connectez-vous avec une clé API ModelStudio existante).
- **Third-party Providers** : choisissez un fournisseur intégré et connectez-vous avec une clé API (DeepSeek, MiniMax, Z.AI, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider** : connectez manuellement un serveur local, un proxy ou un fournisseur non pris en charge – compatible avec OpenAI, Anthropic, Gemini et d'autres endpoints compatibles.

> [!note]
>
> **Qwen OAuth** n'est plus une entrée sélectionnable dans la boîte de dialogue – son offre gratuite a été interrompue le 15/04/2026. Il reste documenté ci-dessous en tant que fournisseur codé en dur et abandonné uniquement.

## Option 1 : Qwen OAuth (Abandonné)

> [!warning]
>
> L'offre gratuite Qwen OAuth a été interrompue le 15/04/2026. Les jetons mis en cache existants peuvent continuer à fonctionner brièvement, mais les nouvelles requêtes seront rejetées. Veuillez basculer vers Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai), ou un autre fournisseur. Exécutez `qwen` et utilisez `/auth` pour configurer.

- **Fonctionnement** : au premier démarrage, Qwen Code ouvre une page de connexion dans le navigateur. Après connexion, les identifiants sont mis en cache localement, ce qui évite généralement de devoir se reconnecter.
- **Prérequis** : un compte `qwen.ai` + un accès Internet (au moins pour la première connexion).
- **Avantages** : pas de gestion de clé API, actualisation automatique des identifiants.
- **Coût et quota** : l'offre gratuite a été interrompue à compter du 15/04/2026.

Lancez le CLI et suivez le flux du navigateur :

```bash
qwen
```

Qwen OAuth n'est plus proposé comme entrée sélectionnable dans la boîte de dialogue `/auth` ; exécutez `/auth` et choisissez l'une des options actuelles (Alibaba ModelStudio, Third-party Providers ou Custom Provider) à la place.

> [!note]
>
> Dans les environnements non interactifs ou sans tête (par exemple, CI, SSH, conteneurs), vous ne pouvez généralement **pas** terminer le flux de connexion OAuth via le navigateur.
> Dans ces cas, veuillez utiliser la méthode d'authentification Alibaba Cloud Coding Plan ou API Key.

## 💳 Option 2 : Alibaba Cloud Coding Plan

Utilisez cette option si vous souhaitez des coûts prévisibles avec diverses options de modèles et des quotas d'utilisation plus élevés.

- **Fonctionnement** : abonnez-vous au Coding Plan avec un forfait mensuel fixe, puis configurez Qwen Code pour utiliser l'endpoint dédié et votre clé API d'abonnement.
- **Prérequis** : obtenez un abonnement actif au Coding Plan depuis [Alibaba Cloud ModelStudio (Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) ou [Alibaba Cloud ModelStudio (intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), selon la région de votre compte.
- **Avantages** : diverses options de modèles, quotas d'utilisation plus élevés, coûts mensuels prévisibles, accès à une large gamme de modèles (Qwen, GLM, Kimi, Minimax et plus).
- **Coût et quota** : consultez la documentation d'Aliyun ModelStudio Coding Plan [Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Alibaba Cloud Coding Plan est disponible dans deux régions :

| Région                         | URL de la console                                                        |
| ------------------------------ | ------------------------------------------------------------------------ |
| Aliyun ModelStudio (Beijing)   | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)         |
| Alibaba Cloud (intl)           | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Configuration interactive

Exécutez `qwen` dans le terminal pour lancer Qwen Code, puis lancez la commande `/auth`, sélectionnez **Alibaba ModelStudio** et choisissez **Coding Plan** dans le sous-menu. Choisissez votre région, puis saisissez votre clé `sk-sp-xxxxxxxxx`.

Après authentification, utilisez la commande `/model` pour basculer entre tous les modèles pris en charge par Alibaba Cloud Coding Plan (y compris qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 et MiniMax-M2.5).

### Configuration sans tête ou scriptée

Pour CI, conteneurs ou scripts, configurez le Coding Plan avec des variables d'environnement ou `settings.json` au lieu de la commande supprimée `qwen auth coding-plan`.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Utilisez `https://coding.dashscope.aliyuncs.com/v1` pour l'endpoint Chine (Beijing), ou `https://coding-intl.dashscope.aliyuncs.com/v1` pour l'endpoint international.

### Alternative : configuration via `settings.json`

Si vous préférez ignorer le flux interactif `/auth`, ajoutez ce qui suit à `~/.qwen/settings.json` :

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus (Coding Plan)",
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
          "description": "qwen3-coder-plus du Alibaba Cloud Coding Plan",
          "envKey": "BAILIAN_CODING_PLAN_API_KEY"
        }
      ]
    }
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

## 🚀 Option 3 : Clé API (flexible)

Utilisez cette option si vous souhaitez vous connecter à des fournisseurs tiers tels qu'OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope ou un endpoint auto-hébergé. Prend en charge plusieurs protocoles et fournisseurs.

### Recommandé : configuration en un seul fichier via `settings.json`

Le moyen le plus simple de démarrer avec l'authentification par clé API est de tout mettre dans un seul fichier `~/.qwen/settings.json`. Voici un exemple complet et prêt à l'emploi :

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
          "description": "Qwen3-Coder via Dashscope",
          "envKey": "DASHSCOPE_API_KEY"
        }
      ]
    }
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

| Champ                        | Description                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Déclare les modèles disponibles et comment s'y connecter. Les clés (`openai`, `anthropic`, `gemini`) représentent le protocole API.      |
| `env`                        | Stocke les clés API directement dans `settings.json` comme solution de repli (priorité la plus basse — les `export` shell et les fichiers `.env` ont priorité). |
| `security.auth.selectedType` | Indique à Qwen Code quel protocole utiliser au démarrage (par ex. `openai`, `anthropic`, `gemini`). Sans cela, vous devriez exécuter `/auth` de manière interactive. |
| `model.name`                 | Le modèle par défaut à activer au démarrage de Qwen Code. Doit correspondre à l'un des `id` dans vos `modelProviders`.                  |

Après avoir enregistré le fichier, exécutez simplement `qwen` – aucune configuration interactive `/auth` n'est nécessaire.

> [!tip]
>
> Les sections ci-dessous expliquent chaque partie plus en détail. Si l'exemple rapide ci-dessus vous convient, n'hésitez pas à passer directement à [Notes de sécurité](#notes-de-sécurité).

Le concept clé est celui des **Model Providers** (`modelProviders`) : Qwen Code prend en charge plusieurs protocoles API, pas seulement OpenAI. Vous configurez les fournisseurs et modèles disponibles en éditant `~/.qwen/settings.json`, puis basculez entre eux à l'exécution avec la commande `/model`.

#### Protocoles pris en charge

| Protocole          | Clé `modelProviders` | Variables d'environnement                                                                        | Fournisseurs                                                                                         |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Compatible OpenAI  | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`                                              | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, tout endpoint compatible OpenAI |
| Anthropic          | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                     | Anthropic Claude                                                                                      |
| Google GenAI       | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                 | Google Gemini                                                                                         |
| Vertex AI          | `vertex-ai`          | `GOOGLE_API_KEY`, `GOOGLE_MODEL` (définit `GOOGLE_GENAI_USE_VERTEXAI=true` ; utilise le protocole `gemini`) | Google Vertex AI                                                                                      |

#### Étape 1 : Configurer les modèles et fournisseurs dans `~/.qwen/settings.json`

Définissez les modèles disponibles pour chaque protocole. Chaque entrée de modèle nécessite au minimum un `id` ; `envKey` (le nom de la variable d'environnement contenant votre clé API) est facultatif et recommandé – lorsqu'il est omis, le système utilise la clé d'environnement par défaut du type d'authentification (par ex. `OPENAI_API_KEY` pour `openai`).

> [!important]
>
> Il est recommandé de définir `modelProviders` dans le fichier `~/.qwen/settings.json` au niveau utilisateur pour éviter les conflits de fusion entre les paramètres du projet et de l'utilisateur.

Modifiez `~/.qwen/settings.json` (créez-le s'il n'existe pas). Vous pouvez mélanger plusieurs protocoles dans un seul fichier – voici un exemple multi-fournisseurs montrant uniquement la section `modelProviders` :

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "envKey": "OPENAI_API_KEY",
          "baseUrl": "https://api.openai.com/v1"
        }
      ]
    },
    "anthropic": {
      "protocol": "anthropic",
      "models": [
        {
          "id": "claude-sonnet-4-20250514",
          "name": "Claude Sonnet 4",
          "envKey": "ANTHROPIC_API_KEY"
        }
      ]
    },
    "gemini": {
      "protocol": "gemini",
      "models": [
        {
          "id": "gemini-2.5-pro",
          "name": "Gemini 2.5 Pro",
          "envKey": "GEMINI_API_KEY"
        }
      ]
    }
  }
}
```

> [!tip]
>
> N'oubliez pas de définir également `env`, `security.auth.selectedType` et `model.name` en plus de `modelProviders` – voir l'[exemple complet ci-dessus](#recommandé--configuration-en-un-seul-fichier-via-settingsjson) pour référence.

**Champs `ModelConfig` (chaque entrée dans `modelProviders`) :**

| Champ              | Obligatoire | Description                                                                                                                           |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Oui         | ID du modèle envoyé à l'API (par ex. `gpt-4o`, `claude-sonnet-4-20250514`)                                                             |
| `name`             | Non         | Nom affiché dans le sélecteur `/model` (par défaut, prend la valeur de `id`)                                                          |
| `envKey`           | Non         | Nom de la variable d'environnement pour la clé API (par ex. `OPENAI_API_KEY`) ; facultatif/recommandé – par défaut, utilise la clé d'environnement par défaut du type d'authentification si omis |
| `baseUrl`          | Non         | Surcharge de l'endpoint API (utile pour les proxies ou endpoints personnalisés)                                                       |
| `generationConfig` | Non         | Réglages fins pour `timeout`, `maxRetries`, `samplingParams`, etc.                                                                    |

> [!note]
>
> Lorsque vous utilisez le champ `env` dans `settings.json`, les identifiants sont stockés en texte brut. Pour une meilleure sécurité, préférez les fichiers `.env` ou les `export` shell – voir [Étape 2](#étape-2--définir-les-variables-denvironnement).

Pour le schéma complet de `modelProviders` et les options avancées comme `generationConfig`, `customHeaders` et `extra_body`, consultez la [Référence Model Providers](model-providers.md).

#### Étape 2 : Définir les variables d'environnement

Qwen Code lit les clés API depuis les variables d'environnement (spécifiées par `envKey` dans votre configuration de modèle). Il existe plusieurs façons de les fournir, listées ci-dessous de la **priorité la plus haute à la plus basse** :

**1. Environnement shell / `export` (priorité la plus élevée)**

Définissez directement dans votre profil shell (`~/.zshrc`, `~/.bashrc`, etc.) ou en ligne avant le lancement :

```bash
# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / compatible OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Fichiers `.env`**

Qwen Code charge automatiquement le **premier** fichier `.env` qu'il trouve (les variables ne sont **pas fusionnées** entre plusieurs fichiers). Seules les variables non encore présentes dans `process.env` sont chargées.

Ordre de recherche (à partir du répertoire courant, en remontant vers `/`) :

1. `.qwen/.env` (recommandé – isole les variables de Qwen Code des autres outils)
2. `.env`

Si rien n'est trouvé, le système utilise votre **répertoire personnel** :

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` est recommandé plutôt que `.env` pour éviter les conflits avec d'autres outils. Certaines variables (comme `DEBUG` et `DEBUG_MODE`) sont exclues des fichiers `.env` au niveau du projet pour éviter d'interférer avec le comportement de Qwen Code.

**3. `settings.json` → champ `env` (priorité la plus basse)**

Vous pouvez également définir les clés API directement dans `~/.qwen/settings.json` sous la clé `env`. Elles sont chargées comme **solution de repli de la plus basse priorité** – appliquées uniquement lorsqu'une variable n'est pas déjà définie par l'environnement système ou les fichiers `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

C'est l'approche utilisée dans l'[exemple de configuration en un seul fichier](#recommandé--configuration-en-un-seul-fichier-via-settingsjson) ci-dessus. C'est pratique pour tout garder au même endroit, mais sachez que `settings.json` peut être partagé ou synchronisé – préférez les fichiers `.env` pour les secrets sensibles.

**Récapitulatif des priorités :**

| Priorité    | Source                            | Comportement de surcharge                                    |
| ----------- | --------------------------------- | ------------------------------------------------------------ |
| 1 (la plus élevée) | Indicateurs CLI (`--openai-api-key`) | Toujours prioritaire                                         |
| 2          | Env. système (`export`, en ligne) | Surpasse `.env` et `settings.json` → `env`                   |
| 3          | Fichier `.env`                    | Définit uniquement si absent de l'environnement système      |
| 4 (la plus basse) | `settings.json` → `env`          | Définit uniquement si absent de l'environnement système et de `.env` |

#### Étape 3 : Basculer les modèles avec `/model`

Après avoir lancé Qwen Code, utilisez la commande `/model` pour basculer entre tous les modèles configurés. Les modèles sont regroupés par protocole :

```
/model
```

Le sélecteur affichera tous les modèles de votre configuration `modelProviders`, regroupés par protocole (par ex. `openai`, `anthropic`, `gemini`). Votre sélection est conservée entre les sessions.

Vous pouvez également basculer directement les modèles avec un argument de ligne de commande, ce qui est pratique lorsque vous travaillez dans plusieurs terminaux.

```bash
# Dans un terminal
qwen --model "qwen3-coder-plus"

# Dans un autre terminal
qwen --model "qwen3.5-plus"
```

## Commande CLI `qwen auth` supprimée

La commande CLI autonome `qwen auth` a été supprimée. Utilisez ces remplacements à la place :

| Cas d'utilisation précédent                     | Remplacement                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Configuration interactive de l'authentification | Exécutez `qwen`, puis utilisez `/auth`                                                                |
| Configuration du Coding Plan                    | Utilisez `/auth`, ou définissez `BAILIAN_CODING_PLAN_API_KEY` avec l'URL de base du Coding Plan       |
| Configuration d'OpenRouter                      | Utilisez `/auth`, ou définissez `OPENROUTER_API_KEY` et `OPENAI_BASE_URL=https://openrouter.ai/api/v1` |
| Configuration de Requesty                       | Utilisez `/auth`, ou définissez `REQUESTY_API_KEY` et `OPENAI_BASE_URL=https://router.requesty.ai/v1`  |
| Configuration de clé API ou de fournisseur personnalisé | Configurez `~/.qwen/settings.json`, `.env`, ou les variables d'environnement spécifiques au fournisseur |
| Vérification de l'authentification actuelle     | Exécutez `/doctor` dans Qwen Code                                                                     |
| Flux OAuth dans le navigateur                   | Exécutez `qwen` de manière interactive et utilisez `/auth` ; OAuth ne peut pas être configuré avec uniquement des variables d'environnement |

Les invocations héritées comme `qwen auth status` affichent désormais un avis de suppression avec ces chemins de migration.

## Notes de sécurité

- Ne commettez pas les clés API dans le contrôle de version.
- Préférez `.qwen/.env` pour les secrets propres au projet (et gardez-le hors de git).
- Traitez la sortie de votre terminal comme sensible si elle imprime des identifiants pour vérification.
# Authentification

Qwen Code prend en charge deux méthodes d'authentification. Choisissez celle qui correspond à la façon dont vous souhaitez exécuter le CLI :

- **OAuth Qwen (recommandé)** : connectez-vous avec votre compte `qwen.ai` dans un navigateur.
- **Clé API** : utilisez une clé API pour vous connecter à n'importe quel fournisseur pris en charge. Plus flexible — prend en charge OpenAI, Anthropic, Google GenAI, Alibaba Cloud Bailian et d'autres points de terminaison compatibles.

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

## 👍 Option 1 : Qwen OAuth (recommandé et gratuit)

Utilisez cette option si vous souhaitez la configuration la plus simple et que vous utilisez les modèles Qwen.

- **Fonctionnement** : au premier démarrage, Qwen Code ouvre une page de connexion dans le navigateur. Une fois la connexion terminée, les identifiants sont mis en cache localement, vous n'aurez donc généralement plus besoin de vous reconnecter.
- **Prérequis** : un compte `qwen.ai` + accès Internet (au moins pour la première connexion).
- **Avantages** : pas de gestion de clé API, actualisation automatique des identifiants.
- **Coût et quota** : gratuit, avec un quota de **60 requêtes/minute** et **1 000 requêtes/jour**.

Démarrez l'interface en ligne de commande et suivez le processus dans le navigateur :

```bash
qwen
```

> [!note]
>
> Dans les environnements non interactifs ou sans interface graphique (par exemple, CI, SSH, conteneurs), vous ne pouvez généralement **pas** effectuer le processus de connexion OAuth via le navigateur.  
> Dans ces cas, veuillez utiliser la méthode d'authentification par clé API.

## 🚀 Option 2 : Clé API (souple)

Utilisez cette option si vous souhaitez plus de flexibilité concernant le fournisseur et le modèle à utiliser. Prend en charge plusieurs protocoles et fournisseurs, notamment OpenAI, Anthropic, Google GenAI, Alibaba Cloud Bailian, Azure OpenAI, OpenRouter, ModelScope ou un point de terminaison compatible auto-hébergé.

### Option 1 : Coding Plan (Aliyun Bailian)

Utilisez cette option si vous souhaitez des coûts prévisibles avec des quotas d'utilisation plus élevés pour le modèle qwen3-coder-plus.

- **Fonctionnement** : souscrivez à l'abonnement Coding Plan avec des frais mensuels fixes, puis configurez Qwen Code pour utiliser le point de terminaison dédié et votre clé API d'abonnement.
- **Prérequis** : obtenir un abonnement actif au plan Coding Plan depuis [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan).
- **Avantages** : quotas d'utilisation plus élevés, coûts mensuels prévisibles, accès au dernier modèle qwen3-coder-plus.
- **Coût et quota** : consultez la [documentation du plan Coding Plan d'Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

Entrez `qwen` dans le terminal pour lancer Qwen Code, puis entrez la commande `/auth` et sélectionnez `API-KEY`

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

Après avoir entré, sélectionnez `Coding Plan` :

![](https://gw.alicdn.com/imgextra/i4/O1CN01Irk0AD1ebfop69o0r_!!6000000003890-2-tps-2308-830.png)

Entrez votre clé `sk-sp-xxxxxxxxx`, puis utilisez la commande `/model` pour basculer entre tous les modèles pris en charge par le `Coding Plan` de Bailian :

![](https://gw.alicdn.com/imgextra/i4/O1CN01fWArmf1kaCEgSmPln_!!6000000004699-2-tps-2304-1374.png)

### Option 2 : Clé API tierce

Utilisez cette option si vous souhaitez vous connecter à des fournisseurs tiers tels qu'OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope ou un point de terminaison auto-hébergé.

Le concept clé est celui des **Fournisseurs de modèles** (`modelProviders`) : Qwen Code prend en charge plusieurs protocoles d'API, pas uniquement OpenAI. Vous configurez les fournisseurs et modèles disponibles en éditant le fichier `~/.qwen/settings.json`, puis vous basculez entre eux au moment de l'exécution à l'aide de la commande `/model`.

#### Protocoles pris en charge

| Protocole         | Clé `modelProviders` | Variables d'environnement                                    | Fournisseurs                                                                                        |
| ----------------- | -------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Compatible OpenAI | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian, tout point de terminaison compatible OpenAI |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                                    |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                       |
| Google Vertex AI  | `vertex-ai`          | `GOOGLE_API_KEY`, `GOOGLE_MODEL`                             | Google Vertex AI                                                                                    |

#### Étape 1 : Configurer `modelProviders` dans `~/.qwen/settings.json`

Définissez quels modèles sont disponibles pour chaque protocole. Chaque entrée de modèle nécessite au minimum un `id` et un `envKey` (le nom de la variable d'environnement qui contient votre clé API).

> [!important]
>
> Il est recommandé de définir `modelProviders` dans le fichier utilisateur `~/.qwen/settings.json` pour éviter les conflits de fusion entre les paramètres du projet et ceux de l'utilisateur.

Modifiez `~/.qwen/settings.json` (créez-le s'il n'existe pas) :

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

Vous pouvez mélanger plusieurs protocoles et modèles dans une seule configuration. Les champs de `ModelConfig` sont :

| Champ              | Requis   | Description                                                                 |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| `id`               | Oui      | ID du modèle envoyé à l'API (ex. `gpt-4o`, `claude-sonnet-4-20250514`)      |
| `name`             | Non      | Nom affiché dans le sélecteur `/model` (valeur par défaut : `id`)           |
| `envKey`           | Oui      | Nom de la variable d'environnement pour la clé API (ex. `OPENAI_API_KEY`)   |
| `baseUrl`          | Non      | Remplacement du point de terminaison de l'API (utile pour les proxys ou points de terminaison personnalisés) |
| `generationConfig` | Non      | Ajustement fin de `timeout`, `maxRetries`, `samplingParams`, etc.           |

> [!note]
>
> Les identifiants de connexion ne sont **jamais** stockés dans `settings.json`. Le runtime les lit depuis la variable d'environnement spécifiée dans `envKey`.

Pour connaître le schéma complet de `modelProviders` ainsi que les options avancées telles que `generationConfig`, `customHeaders` et `extra_body`, consultez [Référence des paramètres → modelProviders](settings.md#modelproviders).

#### Étape 2 : Définir les variables d'environnement

Qwen Code lit les clés API à partir des variables d'environnement (spécifiées par `envKey` dans la configuration de votre modèle). Il existe plusieurs façons de les fournir, listées ci-dessous par **ordre de priorité décroissante** :

**1. Environnement du shell / `export` (priorité la plus élevée)**

Définissez-les directement dans votre profil shell (`~/.zshrc`, `~/.bashrc`, etc.) ou en ligne avant le lancement :

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / Compatible OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Fichiers `.env`**

Qwen Code charge automatiquement le **premier** fichier `.env` qu'il trouve (les variables ne sont **pas fusionnées** entre plusieurs fichiers). Seules les variables non déjà présentes dans `process.env` sont chargées.

Ordre de recherche (à partir du répertoire courant, en remontant vers `/`) :

1. `.qwen/.env` (préféré — isole les variables de Qwen Code des autres outils)
2. `.env`

Si rien n'est trouvé, il utilise votre **répertoire personnel** :

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` est recommandé au lieu de `.env` pour éviter les conflits avec d'autres outils. Certaines variables (comme `DEBUG` et `DEBUG_MODE`) sont exclues des fichiers `.env` au niveau du projet pour éviter d'interférer avec le comportement de Qwen Code.

**3. `settings.json` → champ `env` (priorité la plus faible)**

Vous pouvez également définir directement des variables d'environnement dans `~/.qwen/settings.json` sous la clé `env`. Celles-ci sont chargées comme solution de **secours à la priorité la plus faible** — uniquement appliquées lorsqu'une variable n'est pas déjà définie par l'environnement système ou les fichiers `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY":"sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "GEMINI_API_KEY": "AIza..."
  },
  "modelProviders": {
    ...
  }
}
```

> [!note]
>
> Ceci est utile lorsque vous souhaitez conserver toute la configuration (fournisseurs + identifiants) dans un seul fichier. Cependant, gardez à l'esprit que `settings.json` peut être partagé ou synchronisé — préférez les fichiers `.env` pour les secrets sensibles.

**Résumé des priorités :**

| Priorité    | Source                           | Comportement de substitution             |
| ----------- | -------------------------------- | ---------------------------------------- |
| 1 (max)     | Drapeaux CLI (`--openai-api-key`) | Toujours gagnant                         |
| 2           | Environnement système (`export`, en ligne) | Remplace `.env` et `settings.env`          |
| 3           | Fichier `.env`                     | Définit seulement si absent de l'environnement système |
| 4 (min)     | `settings.json` → `env`            | Définit seulement si absent de l'environnement système ou de `.env` |

#### Étape 3 : Changer de modèle avec `/model`

Après avoir lancé Qwen Code, utilisez la commande `/model` pour basculer entre tous les modèles configurés. Les modèles sont regroupés par protocole :

```
/model
```

Le sélecteur affichera tous les modèles de votre configuration `modelProviders`, regroupés par leur protocole (par exemple `openai`, `anthropic`, `gemini`). Votre sélection est conservée d'une session à l'autre.

Vous pouvez également changer de modèle directement via un argument en ligne de commande, ce qui est pratique lorsque vous travaillez sur plusieurs terminaux.

```bash

# Dans un premier terminal

qwen --model "qwen3-coder-plus"

# Dans un autre terminal

qwen --model "qwen3-coder-next"
```

## Notes de sécurité

- N'ajoutez pas les clés API au système de gestion de versions.
- Préférez le fichier `.qwen/.env` pour les secrets locaux au projet (et assurez-vous qu'il n'est pas suivi par git).
- Considérez la sortie de votre terminal comme sensible si elle affiche des identifiants à des fins de vérification.
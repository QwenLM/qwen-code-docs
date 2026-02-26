# Authentification

Qwen Code prend en charge deux méthodes d'authentification. Choisissez celle qui correspond à la façon dont vous souhaitez exécuter le CLI :

- **OAuth Qwen (recommandé)** : connectez-vous avec votre compte `qwen.ai` dans un navigateur.
- **Clé API** : utilisez une clé API pour vous connecter à n'importe quel fournisseur pris en charge. Plus flexible — prend en charge OpenAI, Anthropic, Google GenAI, Alibaba Cloud Bailian et autres points de terminaison compatibles.

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

## 👍 Option 1 : Qwen OAuth (recommandé et gratuit)

Utilisez cette option si vous souhaitez la configuration la plus simple et que vous utilisez les modèles Qwen.

- **Fonctionnement** : au premier démarrage, Qwen Code ouvre une page de connexion dans le navigateur. Une fois que vous avez terminé, les identifiants sont mis en cache localement, vous n'aurez donc généralement plus besoin de vous reconnecter.
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

### Recommandé : Configuration en un seul fichier via `settings.json`

La façon la plus simple de commencer avec l'authentification par clé API est de tout placer dans un seul fichier `~/.qwen/settings.json`. Voici un exemple complet et prêt à l'emploi :

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

| Champ                        | Description                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Déclare quels modèles sont disponibles et comment s'y connecter. Les clés (`openai`, `anthropic`, `gemini`, `vertex-ai`) représentent le protocole API. |
| `env`                        | Stocke les clés API directement dans `settings.json` comme solution de secours (priorité la plus basse — les variables d'environnement `export` du shell et les fichiers `.env` ont priorité). |
| `security.auth.selectedType` | Indique à Qwen Code quel protocole utiliser au démarrage (par exemple `openai`, `anthropic`, `gemini`). Sans cela, vous devriez exécuter `/auth` de manière interactive. |
| `model.name`                 | Le modèle par défaut à activer lorsque Qwen Code démarre. Doit correspondre à l'une des valeurs `id` dans vos `modelProviders`.                |

Après avoir sauvegardé le fichier, il suffit d'exécuter `qwen` — aucune configuration interactive `/auth` n'est nécessaire.

> [!tip]
>
> Les sections ci-dessous expliquent chaque partie plus en détail. Si l'exemple rapide ci-dessus fonctionne pour vous, n'hésitez pas à passer directement aux [Notes de sécurité](#notes-de-sécurité).

### Option 1 : Plan de codage (Aliyun Bailian)

Utilisez cette option si vous souhaitez des coûts prévisibles avec des quotas d'utilisation plus élevés pour le modèle qwen3-coder-plus.

- **Fonctionnement** : souscrivez au Plan de codage avec des frais mensuels fixes, puis configurez Qwen Code pour utiliser le point de terminaison dédié et votre clé API d'abonnement.
- **Prérequis** : obtenir un abonnement actif au Plan de codage sur [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan).
- **Avantages** : quotas d'utilisation plus élevés, coûts mensuels prévisibles, accès au dernier modèle qwen3-coder-plus.
- **Coût et quota** : consultez la [documentation du Plan de codage Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

Entrez `qwen` dans le terminal pour lancer Qwen Code, puis entrez la commande `/auth` et sélectionnez `API-KEY`

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

Après avoir entré, sélectionnez `Plan de codage` :

![](https://gw.alicdn.com/imgextra/i4/O1CN01Irk0AD1ebfop69o0r_!!6000000003890-2-tps-2308-830.png)

Entrez votre clé `sk-sp-xxxxxxxxx`, puis utilisez la commande `/model` pour basculer entre tous les modèles pris en charge par le `Plan de codage` Bailian (y compris qwen3.5-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max, glm-4.7 et kimi-k2.5) :

![](https://gw.alicdn.com/imgextra/i4/O1CN01fWArmf1kaCEgSmPln_!!6000000004699-2-tps-2304-1374.png)

**Alternative : configurer le Plan de codage via `settings.json`**

Si vous préférez ignorer le flux interactif `/auth`, ajoutez ce qui suit à `~/.qwen/settings.json` :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Plan de codage)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus du Plan de codage Bailian",
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
> Le Plan de codage utilise un point de terminaison dédié (`https://coding.dashscope.aliyuncs.com/v1`) différent du point de terminaison standard Dashscope. Assurez-vous d'utiliser le bon `baseUrl`.

### Option 2 : Clé API tierce

Utilisez cette option si vous souhaitez vous connecter à des fournisseurs tiers tels qu'OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope ou un point de terminaison auto-hébergé.

Le concept clé est celui des **Fournisseurs de modèles** (`modelProviders`) : Qwen Code prend en charge plusieurs protocoles d'API, pas uniquement OpenAI. Vous configurez les fournisseurs et modèles disponibles en modifiant le fichier `~/.qwen/settings.json`, puis vous basculez entre eux au moment de l'exécution à l'aide de la commande `/model`.

#### Protocoles pris en charge

| Protocole         | Clé `modelProviders` | Variables d'environnement                                    | Fournisseurs                                                                                        |
| ----------------- | -------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Compatible OpenAI | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian, tout point de terminaison compatible OpenAI |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                                    |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                       |
| Google Vertex AI  | `vertex-ai`          | `GOOGLE_API_KEY`, `GOOGLE_MODEL`                             | Google Vertex AI                                                                                    |

#### Étape 1 : Configurer les modèles et fournisseurs dans `~/.qwen/settings.json`

Définissez quels modèles sont disponibles pour chaque protocole. Chaque entrée de modèle nécessite au minimum un `id` et un `envKey` (le nom de la variable d'environnement qui contient votre clé API).

> [!important]
>
> Il est recommandé de définir `modelProviders` dans le fichier utilisateur `~/.qwen/settings.json` pour éviter les conflits de fusion entre les paramètres du projet et ceux de l'utilisateur.

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
> N'oubliez pas de définir également `env`, `security.auth.selectedType` et `model.name` en plus de `modelProviders` — consultez [l'exemple complet ci-dessus](#recommended-one-file-setup-via-settingsjson) pour référence.

**Champs `ModelConfig` (chaque entrée à l'intérieur de `modelProviders`) :**

| Champ              | Requis   | Description                                                                 |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| `id`               | Oui      | ID du modèle envoyé à l'API (ex. `gpt-4o`, `claude-sonnet-4-20250514`)      |
| `name`             | Non      | Nom affiché dans le sélecteur `/model` (valeur par défaut : `id`)           |
| `envKey`           | Oui      | Nom de la variable d'environnement pour la clé API (ex. `OPENAI_API_KEY`)   |
| `baseUrl`          | Non      | Remplacement du point de terminaison de l'API (utile pour les proxys ou points de terminaison personnalisés) |
| `generationConfig` | Non      | Ajustement fin de `timeout`, `maxRetries`, `samplingParams`, etc.           |

> [!note]
>
> Lorsque vous utilisez le champ `env` dans `settings.json`, les identifiants sont stockés en texte brut. Pour une meilleure sécurité, préférez les fichiers `.env` ou les exports shell — voir [Étape 2](#step-2-set-environment-variables).

Pour le schéma complet de `modelProviders` et les options avancées telles que `generationConfig`, `customHeaders` et `extra_body`, consultez [Référence des fournisseurs de modèles](model-providers.md).

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

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Fichiers `.env`**

Qwen Code charge automatiquement le **premier** fichier `.env` qu'il trouve (les variables ne sont **pas fusionnées** entre plusieurs fichiers). Seules les variables non présentes dans `process.env` sont chargées.

Ordre de recherche (à partir du répertoire courant, en remontant vers `/`) :

1. `.qwen/.env` (préféré — isole les variables de Qwen Code des autres outils)
2. `.env`

Si rien n'est trouvé, il utilise votre **répertoire personnel** :

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` est recommandé au lieu de `.env` pour éviter les conflits avec d'autres outils. Certaines variables (comme `DEBUG` et `DEBUG_MODE`) sont exclues des fichiers `.env` au niveau du projet pour ne pas interférer avec le comportement de Qwen Code.

**3. `settings.json` → champ `env` (priorité la plus basse)**

Vous pouvez également définir les clés API directement dans `~/.qwen/settings.json` sous la clé `env`. Elles sont chargées comme solution de **secours à la priorité la plus basse** — uniquement appliquées lorsqu'une variable n'est pas déjà définie par l'environnement système ou les fichiers `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

C'est l'approche utilisée dans l'[exemple de configuration en un seul fichier](#recommended-one-file-setup-via-settingsjson) ci-dessus. C'est pratique pour tout regrouper au même endroit, mais attention : `settings.json` peut être partagé ou synchronisé — préférez les fichiers `.env` pour les secrets sensibles.

**Résumé des priorités :**

| Priorité    | Source                           | Comportement de substitution             |
| ----------- | -------------------------------- | ---------------------------------------- |
| 1 (haute)   | Drapeaux CLI (`--openai-api-key`) | Toujours gagnant                         |
| 2           | Environnement système (`export`, en ligne) | Remplace `.env` et `settings.env`      |
| 3           | Fichier `.env`                     | Définit seulement si absent de l'environnement système |
| 4 (basse)   | `settings.json` → `env`            | Définit seulement si absent de l'environnement système ou `.env` |

#### Étape 3 : Changer de modèle avec `/model`

Après avoir lancé Qwen Code, utilisez la commande `/model` pour basculer entre tous les modèles configurés. Les modèles sont regroupés par protocole :

```
/model
```

Le sélecteur affichera tous les modèles de votre configuration `modelProviders`, regroupés par leur protocole (par exemple `openai`, `anthropic`, `gemini`). Votre sélection est conservée entre les sessions.

Vous pouvez également changer de modèle directement avec un argument en ligne de commande, ce qui est pratique lorsque vous travaillez sur plusieurs terminaux.

```bash
# Dans un terminal

qwen --model "qwen3-coder-plus"

# Dans un autre terminal

qwen --model "qwen3-coder-next"
```

## Notes de sécurité

- Ne commitez pas les clés API dans le contrôle de version.
- Préférez `.qwen/.env` pour les secrets locaux au projet (et gardez-le hors de git).
- Traitez la sortie de votre terminal comme sensible si elle affiche des identifiants à des fins de vérification.
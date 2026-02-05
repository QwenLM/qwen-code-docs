# Authentification

Qwen Code prend en charge deux méthodes d'authentification. Choisissez celle qui correspond à la façon dont vous souhaitez exécuter le CLI :

- **OAuth Qwen (recommandé)** : connectez-vous avec votre compte `qwen.ai` dans un navigateur.
- **API compatible OpenAI** : utilisez une clé API (OpenAI ou tout fournisseur/point de terminaison compatible OpenAI).

![](https://img.alicdn.com/imgextra/i2/O1CN01IxI1bt1sNO543AVTT_!!6000000005754-0-tps-1958-822.jpg)

## Option 1 : Qwen OAuth (recommandé & gratuit) 👍

Utilisez cette option si vous souhaitez la configuration la plus simple et que vous utilisez les modèles Qwen.

- **Fonctionnement** : au premier démarrage, Qwen Code ouvre une page de connexion dans le navigateur. Une fois la connexion terminée, les identifiants sont mis en cache localement, vous n'aurez donc généralement plus besoin de vous reconnecter.
- **Prérequis** : un compte `qwen.ai` + accès Internet (au moins pour la première connexion).
- **Avantages** : pas de gestion de clés API, actualisation automatique des identifiants.
- **Coût & quotas** : gratuit, avec un quota de **60 requêtes/minute** et **1 000 requêtes/jour**.

Lancez l'interface en ligne de commande et suivez le processus dans le navigateur :

```bash
qwen
```

## Option 2 : API compatible OpenAI (clé API)

Utilisez cette option si vous souhaitez utiliser les modèles OpenAI ou tout fournisseur proposant une API compatible OpenAI (par exemple OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian ou un point de terminaison auto-hébergé compatible).

### Recommandé : Plan de codage (basé sur un abonnement) 🚀

Utilisez ceci si vous souhaitez des coûts prévisibles avec des quotas d'utilisation plus élevés pour le modèle qwen3-coder-plus.

> [!IMPORTANT]
>
> Le Plan de codage n'est disponible que pour les utilisateurs en Chine continentale (région de Pékin).

- **Fonctionnement** : souscrivez au Plan de codage avec des frais mensuels fixes, puis configurez Qwen Code pour utiliser le point de terminaison dédié et votre clé API d'abonnement.
- **Prérequis** : un abonnement actif au Plan de codage provenant d'[Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan).
- **Avantages** : quotas d'utilisation plus élevés, coûts mensuels prévisibles, accès au dernier modèle qwen3-coder-plus.
- **Coût et quota** : varie selon le plan (voir tableau ci-dessous).

#### Tarification et quotas du plan de codage

| Fonctionnalité      | Plan Lite Basic       | Plan Pro Advanced     |
| :------------------ | :-------------------- | :-------------------- |
| **Prix**            | 40 ¥/mois             | 200 ¥/mois            |
| **Limite de 5 heures** | Jusqu'à 1 200 requêtes | Jusqu'à 6 000 requêtes |
| **Limite hebdomadaire** | Jusqu'à 9 000 requêtes | Jusqu'à 45 000 requêtes |
| **Limite mensuelle** | Jusqu'à 18 000 requêtes | Jusqu'à 90 000 requêtes |
| **Modèle pris en charge** | qwen3-coder-plus      | qwen3-coder-plus      |

#### Configuration rapide du plan de codage

Lorsque vous sélectionnez l'option compatible OpenAI dans le CLI, saisissez ces valeurs :

- **Clé API** : `sk-sp-xxxxx`
- **URL de base** : `https://coding.dashscope.aliyuncs.com/v1`
- **Modèle** : `qwen3-coder-plus`

> **Remarque** : Les clés API du plan de codage ont le format `sk-sp-xxxxx`, qui est différent des clés API standard d'Alibaba Cloud.

#### Configuration via variables d'environnement

Définissez ces variables d'environnement pour utiliser Coding Plan :

```bash
export OPENAI_API_KEY="your-coding-plan-api-key"  # Format : sk-sp-xxxxx
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Pour plus de détails sur Coding Plan, y compris les options d'abonnement et la résolution des problèmes, consultez la [documentation complète de Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

### Autres fournisseurs compatibles OpenAI

Si vous utilisez d'autres fournisseurs (OpenAI, Azure, modèles locaux, etc.), utilisez les méthodes de configuration suivantes.

### Configuration via arguments en ligne de commande

```bash

# Clé API uniquement
qwen-code --openai-api-key "your-api-key-here"

# URL de base personnalisée (endpoint compatible OpenAI)
qwen-code --openai-api-key "your-api-key-here" --openai-base-url "https://your-endpoint.com/v1"

# Modèle personnalisé
qwen-code --openai-api-key "your-api-key-here" --model "gpt-4o-mini"
```

### Configuration via variables d'environnement

Vous pouvez les définir dans votre profil shell, votre environnement CI ou un fichier `.env` :

```bash
export OPENAI_API_KEY="votre-clé-api-ici"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # optionnel
export OPENAI_MODEL="gpt-4o"                        # optionnel
```

#### Persistance des variables d'env avec `.env` / `.qwen/.env`

Qwen Code chargera automatiquement les variables d'environnement à partir du **premier** fichier `.env` qu'il trouve (les variables ne sont **pas fusionnées** entre plusieurs fichiers).

Ordre de recherche :

1. À partir du **répertoire courant**, en remontant vers `/` :
   1. `.qwen/.env`
   2. `.env`
2. Si rien n'est trouvé, il utilise votre **répertoire home** :
   - `~/.qwen/.env`
   - `~/.env`

`.qwen/.env` est recommandé pour isoler les variables de Qwen Code des autres outils. Certaines variables (comme `DEBUG` et `DEBUG_MODE`) sont exclues des fichiers `.env` du projet afin d'éviter d'interférer avec le comportement de qwen-code.

Exemples :

```bash

# Paramètres spécifiques au projet (recommandé)
```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

```bash
# Paramètres pour tous les projets (disponibles partout)
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## Changer la méthode d'authentification (sans redémarrer)

Dans l'interface utilisateur de Qwen Code, exécutez :

```bash
/auth
```

## Environnements non interactifs / sans interface graphique (CI, SSH, conteneurs)

Dans un terminal non interactif, vous ne pouvez généralement **pas** effectuer le flux de connexion OAuth via navigateur.
Utilisez plutôt la méthode de l'API compatible OpenAI via les variables d'environnement :

- Définissez au minimum `OPENAI_API_KEY`.
- Vous pouvez éventuellement définir `OPENAI_BASE_URL` et `OPENAI_MODEL`.

Si aucune de ces variables n'est définie dans une session non interactive, Qwen Code se terminera avec une erreur.

## Notes de sécurité

- Ne commitez pas les clés API dans le système de contrôle de version.
- Préférez `.qwen/.env` pour les secrets locaux au projet (et gardez-le en dehors de git).
- Considérez la sortie de votre terminal comme sensible si elle affiche des identifiants à des fins de vérification.
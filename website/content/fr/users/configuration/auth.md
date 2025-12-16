# Authentification

Qwen Code prend en charge deux méthodes d'authentification. Choisissez celle qui correspond à la façon dont vous souhaitez exécuter l'interface CLI :

- **Qwen OAuth (recommandé)** : connectez-vous avec votre compte `qwen.ai` dans un navigateur.
- **API compatible OpenAI** : utilisez une clé API (OpenAI ou tout fournisseur/endpoint compatible OpenAI).

## Option 1 : Qwen OAuth (recommandé et gratuit) 👍

Utilisez cette option si vous voulez une configuration simple et que vous utilisez les modèles Qwen.

- **Fonctionnement** : au premier démarrage, Qwen Code ouvre une page de connexion dans le navigateur. Une fois la procédure terminée, les identifiants sont mis en cache localement, vous n'aurez donc généralement pas besoin de vous reconnecter.
- **Prérequis** : un compte `qwen.ai` + accès à Internet (au moins pour la première connexion).
- **Avantages** : aucune gestion de clé API, actualisation automatique des identifiants.
- **Coût et quota** : gratuit, avec un quota de **60 requêtes/minute** et **2 000 requêtes/jour**.

Démarrez l'interface CLI et suivez le processus dans le navigateur :

```bash
qwen
```

## Option 2 : API compatible avec OpenAI (clé API)

Utilisez cette option si vous souhaitez utiliser des modèles OpenAI ou tout fournisseur exposant une API compatible avec OpenAI (par exemple, OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian, ou un point de terminaison auto-hébergé compatible).

### Démarrage rapide (interactif, recommandé pour un usage local)

Lorsque vous choisissez l'option compatible avec OpenAI dans la CLI, celle-ci vous demandera :

- **Clé API**
- **URL de base** (par défaut : `https://api.openai.com/v1`)
- **Modèle** (par défaut : `gpt-4o`)

> **Remarque :** la CLI peut afficher la clé en texte brut à des fins de vérification. Assurez-vous que votre terminal n'est pas enregistré ou partagé.

### Configuration via les arguments de ligne de commande

```bash

# Clé API uniquement
qwen-code --openai-api-key "votre-clé-api-ici"

# URL de base personnalisée (point de terminaison compatible OpenAI)
qwen-code --openai-api-key "votre-clé-api-ici" --openai-base-url "https://votre-point-de-terminaison.com/v1"

# Modèle personnalisé
qwen-code --openai-api-key "votre-clé-api-ici" --model "gpt-4o-mini"
```

### Configurer via des variables d'environnement

Vous pouvez définir ces variables dans votre profil shell, votre CI, ou un fichier `.env` :

```bash
export OPENAI_API_KEY="votre-clé-api-ici"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # optionnel
export OPENAI_MODEL="gpt-4o"                        # optionnel
```

#### Persistance des variables d’environnement avec `.env` / `.qwen/.env`

Qwen Code chargera automatiquement les variables d’environnement depuis le **premier** fichier `.env` trouvé (les variables ne sont **pas fusionnées** à partir de plusieurs fichiers).

Ordre de recherche :

1. Depuis le **répertoire courant**, en remontant vers `/` :
   1. `.qwen/.env`
   2. `.env`
2. Si rien n’est trouvé, il utilise par défaut votre **répertoire personnel** :
   - `~/.qwen/.env`
   - `~/.env`

Le fichier `.qwen/.env` est recommandé pour isoler les variables de Qwen Code des autres outils. Certaines variables (comme `DEBUG` et `DEBUG_MODE`) sont exclues des fichiers `.env` du projet afin d’éviter tout conflit avec le comportement de qwen-code.

Exemples :

```bash

# Paramètres spécifiques au projet (recommandé)
```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="votre-clé-api"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

```bash
# Paramètres au niveau de l'utilisateur (disponibles partout)
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="votre-clé-api"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## Changer de méthode d'authentification (sans redémarrer)

Dans l'interface utilisateur de Qwen Code, exécutez :

```bash
/auth
```

## Environnements non interactifs / sans interface graphique (CI, SSH, conteneurs)

Dans un terminal non interactif, vous ne pouvez généralement **pas** terminer le processus de connexion via le navigateur OAuth.
Utilisez la méthode compatible avec l'API OpenAI via des variables d'environnement :

- Définissez au moins `OPENAI_API_KEY`.
- Définissez éventuellement `OPENAI_BASE_URL` et `OPENAI_MODEL`.

Si aucune de ces variables n'est définie dans une session non interactive, Qwen Code se terminera avec une erreur.

## Notes de sécurité

- Ne commitez pas les clés API dans le contrôle de version.
- Préférez `.qwen/.env` pour les secrets locaux au projet (et gardez-le hors de git).
- Traitez la sortie de votre terminal comme sensible si elle affiche des identifiants à des fins de vérification.
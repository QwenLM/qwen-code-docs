# Configuration de l'authentification

Qwen Code prend en charge deux méthodes d'authentification principales pour accéder aux modèles AI. Choisissez celle qui convient le mieux à votre cas d'usage :

1.  **Qwen OAuth (Recommandé) :**
    - Utilisez cette option pour vous connecter avec votre compte qwen.ai.
    - Lors du premier démarrage, Qwen Code vous redirigera vers la page d'authentification de qwen.ai. Une fois authentifié, vos identifiants seront mis en cache localement afin d'éviter la connexion web lors des exécutions suivantes.
    - **Prérequis :**
      - Un compte qwen.ai valide
      - Connexion Internet pour l'authentification initiale
    - **Avantages :**
      - Accès fluide aux modèles Qwen
      - Actualisation automatique des identifiants
      - Pas de gestion manuelle des API keys requise

    **Pour commencer :**

    ```bash
    # Démarrez Qwen Code et suivez le flux OAuth
    qwen
    ```

    Le CLI ouvrira automatiquement votre navigateur et vous guidera à travers le processus d'authentification.

    **Pour les utilisateurs s'authentifiant via leur compte qwen.ai :**

    **Quota :**
    - 60 requêtes par minute
    - 2 000 requêtes par jour
    - L'utilisation de tokens n'est pas applicable

    **Coût :** Gratuit

    **Remarques :** Un quota spécifique pour différents modèles n'est pas précisé ; un fallback de modèle peut survenir afin de préserver la qualité de l'expérience partagée.

2.  **<a id="openai-api"></a>API compatible OpenAI :**
    - Utilisez des API keys pour OpenAI ou d'autres fournisseurs compatibles.
    - Cette méthode vous permet d'utiliser divers modèles AI via des API keys.

    **Méthodes de configuration :**

    a) **Variables d'environnement :**

    ```bash
    export OPENAI_API_KEY="your_api_key_here"
    export OPENAI_BASE_URL="your_api_endpoint"  # Optionnel
    export OPENAI_MODEL="your_model_choice"     # Optionnel
    ```

    b) **Fichier `.env` du projet :**
    Créez un fichier `.env` à la racine de votre projet :

    ```env
    OPENAI_API_KEY=your_api_key_here
    OPENAI_BASE_URL=your_api_endpoint
    OPENAI_MODEL=your_model_choice
    ```

    **Fournisseurs pris en charge :**
    - OpenAI (https://platform.openai.com/api-keys)
    - Alibaba Cloud Bailian
    - ModelScope
    - OpenRouter
    - Azure OpenAI
    - Toute API compatible OpenAI

## Changer de méthode d'authentification

Pour basculer entre les méthodes d'authentification pendant une session, utilisez la commande `/auth` dans l'interface CLI :

```bash

# Dans le CLI, tapez :
/auth
```

Cela vous permettra de reconfigurer votre méthode d'authentification sans redémarrer l'application.

### Persistance des variables d'environnement avec les fichiers `.env`

Vous pouvez créer un fichier **`.qwen/.env`** dans le répertoire de votre projet ou dans votre répertoire personnel. Créer un simple fichier **`.env`** fonctionne également, mais `.qwen/.env` est recommandé pour isoler les variables de Qwen Code des autres outils.

**Important :** Certaines variables d'environnement (comme `DEBUG` et `DEBUG_MODE`) sont automatiquement exclues des fichiers `.env` du projet afin d'éviter toute interférence avec le comportement de qwen-code. Utilisez les fichiers `.qwen/.env` pour les variables spécifiques à qwen-code.

Qwen Code charge automatiquement les variables d'environnement depuis le **premier** fichier `.env` qu'il trouve, en utilisant l'ordre de recherche suivant :

1. En commençant par le **répertoire courant** et en remontant vers `/`, pour chaque répertoire il vérifie :
   1. `.qwen/.env`
   2. `.env`
2. Si aucun fichier n'est trouvé, il utilise par défaut votre **répertoire personnel** :
   - `~/.qwen/.env`
   - `~/.env`

> **Important :** La recherche s'arrête au **premier** fichier rencontré — les variables ne sont **pas fusionnées** entre plusieurs fichiers.

#### Exemples

**Remplacements spécifiques au projet** (prioritaires lorsque vous êtes dans le répertoire du projet) :

```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

**Paramètres globaux à l'utilisateur** (disponibles dans tous les répertoires) :

```bash
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## Mode non interactif / Environnements headless

Lorsque vous exécutez Qwen Code dans un environnement non interactif, vous ne pouvez pas utiliser le flux de connexion OAuth.  
Vous devez alors configurer l'authentification en utilisant des variables d'environnement.

Le CLI détectera automatiquement s'il est exécuté dans un terminal non interactif et utilisera la méthode compatible avec l'API OpenAI si elle est configurée :

1. **API compatible OpenAI :**
   - Définissez la variable d'environnement `OPENAI_API_KEY`.
   - Vous pouvez également définir `OPENAI_BASE_URL` et `OPENAI_MODEL` pour des endpoints personnalisés.
   - Le CLI utilisera ces identifiants pour s'authentifier auprès du fournisseur d'API.

**Exemple pour les environnements headless :**

Si aucune de ces variables d'environnement n'est définie lors d'une session non interactive, le CLI se terminera avec une erreur.

Pour un guide complet sur l'utilisation programmatique de Qwen Code et son intégration dans des workflows automatisés, consultez le [Guide du mode headless](../headless.md).
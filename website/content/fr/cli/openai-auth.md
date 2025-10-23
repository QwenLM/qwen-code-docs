# Authentification OpenAI

Qwen Code CLI prend en charge l'authentification OpenAI pour les utilisateurs souhaitant utiliser les modèles OpenAI au lieu des modèles Gemini de Google.

## Méthodes d'authentification

### 1. Authentification interactive (recommandée)

Lorsque vous exécutez le CLI pour la première fois et sélectionnez OpenAI comme méthode d'authentification, vous serez invité à saisir :

- **API Key** : Votre clé API OpenAI depuis [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Base URL** : L'URL de base de l'API OpenAI (par défaut `https://api.openai.com/v1`)
- **Model** : Le modèle OpenAI à utiliser (par défaut `gpt-4o`)

Le CLI vous guidera à travers chaque champ :

1. Entrez votre API key et appuyez sur Entrée
2. Vérifiez/modifiez l'URL de base et appuyez sur Entrée
3. Vérifiez/modifiez le nom du modèle et appuyez sur Entrée

**Note** : Vous pouvez coller directement votre API key — le CLI supporte la fonctionnalité de collage et affichera la clé complète pour vérification.

### 2. Arguments de ligne de commande

Vous pouvez également fournir les identifiants OpenAI via des arguments de ligne de commande :

```bash

# Utilisation basique avec API key
qwen-code --openai-api-key "your-api-key-here"

# Avec une URL de base personnalisée
qwen-code --openai-api-key "your-api-key-here" --openai-base-url "https://your-custom-endpoint.com/v1"

# Avec un modèle personnalisé
qwen-code --openai-api-key "your-api-key-here" --model "gpt-4-turbo"
```

### 3. Variables d’environnement

Définissez les variables d’environnement suivantes dans votre shell ou dans votre fichier `.env` :

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # Optionnel, valeur par défaut
export OPENAI_MODEL="gpt-4o"  # Optionnel, par défaut gpt-4o
```

## Modèles supportés

Le CLI prend en charge tous les modèles OpenAI disponibles via l’API OpenAI, notamment :

- `gpt-4o` (par défaut)
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- Et autres modèles disponibles

## Endpoints personnalisés

Vous pouvez utiliser des endpoints personnalisés en définissant la variable d'environnement `OPENAI_BASE_URL` ou en utilisant l'argument de ligne de commande `--openai-base-url`. Cela est utile pour :

- Utiliser Azure OpenAI
- Utiliser d'autres APIs compatibles avec OpenAI
- Utiliser des serveurs locaux compatibles avec OpenAI

## Changer de méthode d'authentification

Pour basculer entre les méthodes d'authentification, utilisez la commande `/auth` dans l'interface CLI.

## Notes de sécurité

- Les clés API sont stockées en mémoire pendant la session
- Pour un stockage persistant, utilisez les variables d'environnement ou les fichiers `.env`
- Ne commitez jamais les clés API dans le version control
- Le CLI affiche les clés API en texte clair pour vérification - assurez-vous que votre terminal est sécurisé
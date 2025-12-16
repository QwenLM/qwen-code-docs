# Outil de recherche Web (`web_search`)

Ce document décrit l'outil `web_search` permettant d'effectuer des recherches sur le web en utilisant plusieurs fournisseurs.

## Description

Utilisez `web_search` pour effectuer une recherche sur le web et obtenir des informations provenant d'Internet. L'outil prend en charge plusieurs fournisseurs de recherche et renvoie une réponse concise avec des citations sources lorsque cela est disponible.

### Fournisseurs pris en charge

1. **DashScope** (Officiel, Gratuit) - Disponible automatiquement pour les utilisateurs OAuth Qwen (200 requêtes/minute, 2000 requêtes/jour)
2. **Tavily** - API de recherche de haute qualité avec génération de réponses intégrée
3. **Google Custom Search** - API JSON de recherche personnalisée Google

### Arguments

`web_search` prend deux arguments :

- `query` (chaîne de caractères, requis) : La requête de recherche
- `provider` (chaîne de caractères, optionnel) : Fournisseur spécifique à utiliser ("dashscope", "tavily", "google")
  - Si non spécifié, utilise le fournisseur par défaut défini dans la configuration

## Configuration

### Méthode 1 : Fichier de configuration (Recommandée)

Ajoutez à votre `settings.json` :

```json
{
  "webSearch": {
    "provider": [
      { "type": "dashscope" },
      { "type": "tavily", "apiKey": "tvly-xxxxx" },
      {
        "type": "google",
        "apiKey": "your-google-api-key",
        "searchEngineId": "your-search-engine-id"
      }
    ],
    "default": "dashscope"
  }
}
```

**Remarques :**

- DashScope ne nécessite pas de clé API (service officiel gratuit)
- **Utilisateurs OAuth Qwen :** DashScope est automatiquement ajouté à votre liste de fournisseurs, même s'il n'est pas explicitement configuré
- Configurez des fournisseurs supplémentaires (Tavily, Google) si vous souhaitez les utiliser en parallèle avec DashScope
- Définissez `default` pour spécifier le fournisseur à utiliser par défaut (si non défini, ordre de priorité : Tavily > Google > DashScope)

### Méthode 2 : Variables d'environnement

Définissez les variables d'environnement dans votre shell ou fichier `.env` :

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"```

# Google
export GOOGLE_API_KEY="votre-clé-api"
export GOOGLE_SEARCH_ENGINE_ID="votre-id-moteur"
```

### Méthode 3 : Arguments de ligne de commande

Passez les clés API lors de l'exécution de Qwen Code :

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key votre-clé --google-search-engine-id votre-id

# Spécifier le fournisseur par défaut
qwen --web-search-default tavily
```

### Compatibilité descendante (Obsolète)

⚠️ **OBSOLÈTE :** L'ancienne configuration `tavilyApiKey` est toujours prise en charge pour des raisons de compatibilité descendante, mais elle est obsolète :

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Obsolète
  }
}
```

**Important :** Cette configuration est obsolète et sera supprimée dans une prochaine version. Veuillez migrer vers le nouveau format de configuration `webSearch` indiqué ci-dessus. L'ancienne configuration configurera automatiquement Tavily comme fournisseur, mais nous vous recommandons fortement de mettre à jour votre configuration.

## Désactiver la recherche Web

Si vous souhaitez désactiver la fonctionnalité de recherche Web, vous pouvez exclure l'outil `web_search` dans votre fichier `settings.json` :

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Remarque :** Ce paramètre nécessite un redémarrage de Qwen Code pour prendre effet. Une fois désactivé, l'outil `web_search` ne sera plus disponible pour le modèle, même si des fournisseurs de recherche Web sont configurés.

## Exemples d'utilisation

### Recherche basique (utilisant le fournisseur par défaut)

```
web_search(query="dernières avancées en IA")
```

### Recherche avec un fournisseur spécifique

```
web_search(query="dernières avancées en IA", provider="tavily")
```

### Exemples concrets

```
web_search(query="météo à San Francisco aujourd'hui")
web_search(query="dernière version LTS de Node.js", provider="google")
web_search(query="bonnes pratiques pour React 19", provider="dashscope")
```

## Détails sur les fournisseurs

### DashScope (Officiel)

- **Coût :** Gratuit
- **Authentification :** Disponible automatiquement lors de l'utilisation de l'authentification OAuth Qwen
- **Configuration :** Aucune clé API requise, ajoutée automatiquement à la liste des fournisseurs pour les utilisateurs OAuth Qwen
- **Quota :** 200 requêtes/minute, 2000 requêtes/jour
- **Idéal pour :** Les requêtes générales, toujours disponible comme solution de secours pour les utilisateurs OAuth Qwen
- **Enregistrement automatique :** Si vous utilisez OAuth Qwen, DashScope est automatiquement ajouté à votre liste de fournisseurs même si vous ne le configurez pas explicitement

### Tavily

- **Coût :** Nécessite une clé API (service payant avec offre gratuite)
- **Inscription :** https://tavily.com
- **Fonctionnalités :** Résultats de haute qualité avec réponses générées par IA
- **Idéal pour :** La recherche, des réponses complètes avec citations

### Recherche personnalisée Google

- **Coût :** Niveau gratuit disponible (100 requêtes/jour)
- **Configuration :**
  1. Activer l'API Recherche personnalisée dans la console Google Cloud
  2. Créer un moteur de recherche personnalisé sur https://programmablesearchengine.google.com
- **Fonctionnalités :** Qualité de recherche de Google
- **Idéal pour :** Requêtes spécifiques et factuelles

## Notes importantes

- **Format de réponse :** Retourne une réponse concise avec des citations sources numérotées
- **Citations :** Les liens sources sont ajoutés sous forme de liste numérotée : [1], [2], etc.
- **Plusieurs fournisseurs :** Si un fournisseur échoue, spécifiez manuellement un autre fournisseur en utilisant le paramètre `provider`
- **Disponibilité de DashScope :** Disponible automatiquement pour les utilisateurs OAuth Qwen, aucune configuration nécessaire
- **Sélection du fournisseur par défaut :** Le système sélectionne automatiquement un fournisseur par défaut selon la disponibilité :
  1. Votre configuration explicite `default` (priorité la plus élevée)
  2. Argument CLI `--web-search-default`
  3. Premier fournisseur disponible par ordre de priorité : Tavily > Google > DashScope

## Dépannage

**Outil non disponible ?**

- **Pour les utilisateurs OAuth de Qwen :** L'outil est automatiquement enregistré avec le fournisseur DashScope, aucune configuration nécessaire
- **Pour les autres types d'authentification :** Assurez-vous qu'au moins un fournisseur (Tavily ou Google) est configuré
- Pour Tavily/Google : Vérifiez que vos clés API sont correctes

**Erreurs spécifiques à un fournisseur ?**

- Utilisez le paramètre `provider` pour essayer un autre fournisseur de recherche
- Vérifiez vos quotas API et limites de débit
- Assurez-vous que les clés API sont correctement définies dans la configuration

**Besoin d'aide ?**

- Vérifiez votre configuration : Exécutez `qwen` et utilisez la boîte de dialogue des paramètres
- Consultez vos paramètres actuels dans `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows)
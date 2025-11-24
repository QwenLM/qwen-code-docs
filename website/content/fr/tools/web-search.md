# Outil de recherche Web (`web_search`)

Ce document décrit l'outil `web_search` permettant d'effectuer des recherches sur le web en utilisant plusieurs fournisseurs.

## Description

Utilisez `web_search` pour effectuer une recherche web et obtenir des informations depuis Internet. L'outil prend en charge plusieurs fournisseurs de recherche et retourne une réponse concise avec des citations sources lorsque disponibles.

### Fournisseurs pris en charge

1. **DashScope** (Officiel, Gratuit) - Disponible automatiquement pour les utilisateurs Qwen OAuth (200 requêtes/minute, 2000 requêtes/jour)
2. **Tavily** - API de recherche de haute qualité avec génération de réponses intégrée
3. **Google Custom Search** - API JSON de recherche personnalisée Google

### Arguments

`web_search` accepte deux arguments :

- `query` (string, requis) : La requête de recherche
- `provider` (string, optionnel) : Fournisseur spécifique à utiliser ("dashscope", "tavily", "google")
  - Si non spécifié, utilise le fournisseur par défaut défini dans la configuration

## Configuration

### Méthode 1 : Fichier de configuration (Recommandée)

Ajoutez ceci à votre `settings.json` :

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
- **Utilisateurs Qwen OAuth :** DashScope est automatiquement ajouté à votre liste de fournisseurs, même s'il n'est pas explicitement configuré
- Configurez des fournisseurs supplémentaires (Tavily, Google) si vous souhaitez les utiliser en parallèle de DashScope
- Définissez `default` pour spécifier le fournisseur à utiliser par défaut (si non défini, ordre de priorité : Tavily > Google > DashScope)

### Méthode 2 : Variables d'environnement

Définissez les variables d’environnement dans votre shell ou fichier `.env` :

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"
```

```markdown
# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### Méthode 3 : Arguments de ligne de commande

Passez les clés API lors de l'exécution de Qwen Code :

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# Spécifier le fournisseur par défaut
qwen --web-search-default tavily
```

### Compatibilité descendante (Obsolète)

⚠️ **OBSOLÈTE :** L'ancienne configuration `tavilyApiKey` est toujours prise en charge pour des raisons de compatibilité, mais elle est désormais obsolète :

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Obsolète
  }
}
```

**Important :** Cette configuration est dépréciée et sera supprimée dans une prochaine version. Veuillez migrer vers le nouveau format de configuration `webSearch` indiqué ci-dessus. L’ancienne configuration configurera automatiquement Tavily comme fournisseur, mais nous vous recommandons fortement de mettre à jour votre configuration.

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

### Recherche basique (en utilisant le fournisseur par défaut)

```
web_search(query="latest advancements in AI")
```

### Recherche avec un fournisseur spécifique

```
web_search(query="latest advancements in AI", provider="tavily")
```

### Exemples concrets

```
web_search(query="weather in San Francisco today")
web_search(query="latest Node.js LTS version", provider="google")
web_search(query="best practices for React 19", provider="dashscope")
```

## Détails sur les fournisseurs

### DashScope (Officiel)

- **Coût :** Gratuit
- **Authentification :** Disponible automatiquement lors de l'utilisation de l'authentification Qwen OAuth
- **Configuration :** Aucune clé API requise, ajoutée automatiquement à la liste des providers pour les utilisateurs Qwen OAuth
- **Quota :** 200 requêtes/minute, 2000 requêtes/jour
- **Idéal pour :** Requêtes générales, toujours disponible comme solution de secours pour les utilisateurs Qwen OAuth
- **Enregistrement auto :** Si vous utilisez Qwen OAuth, DashScope est automatiquement ajouté à votre liste de providers même si vous ne le configurez pas explicitement

### Tavily

- **Coût :** Nécessite une clé API (service payant avec offre gratuite)
- **Inscription :** https://tavily.com
- **Fonctionnalités :** Résultats de haute qualité avec réponses générées par IA
- **Idéal pour :** Recherche, réponses complètes avec citations

### Google Custom Search

- **Coût :** Gratuit disponible (100 requêtes/jour)
- **Configuration :**
  1. Activez l'API Custom Search dans la console Google Cloud
  2. Créez un moteur de recherche personnalisé sur https://programmablesearchengine.google.com
- **Fonctionnalités :** Qualité de recherche de Google
- **Idéal pour :** Requêtes spécifiques et factuelles

## Notes importantes

- **Format de réponse :** Retourne une réponse concise avec des citations sources numérotées
- **Citations :** Les liens vers les sources sont ajoutés sous forme de liste numérotée : [1], [2], etc.
- **Multiples fournisseurs :** Si un fournisseur échoue, spécifiez manuellement un autre en utilisant le paramètre `provider`
- **Disponibilité DashScope :** Disponible automatiquement pour les utilisateurs Qwen OAuth, aucune configuration nécessaire
- **Sélection du fournisseur par défaut :** Le système sélectionne automatiquement un fournisseur par défaut selon la disponibilité :
  1. Votre configuration explicite `default` (priorité la plus élevée)
  2. Argument CLI `--web-search-default`
  3. Premier fournisseur disponible par ordre de priorité : Tavily > Google > DashScope

## Dépannage

**L'outil n'est pas disponible ?**

- **Pour les utilisateurs Qwen OAuth :** L'outil est automatiquement enregistré avec le provider DashScope, aucune configuration nécessaire
- **Pour les autres types d'authentification :** Assurez-vous qu'au moins un provider (Tavily ou Google) est configuré
- Pour Tavily/Google : Vérifiez que vos API keys sont correctes

**Des erreurs spécifiques à un provider ?**

- Utilisez le paramètre `provider` pour essayer un autre search provider
- Vérifiez vos quotas d'API et limites de requêtes
- Confirmez que les API keys sont correctement définies dans la configuration

**Besoin d'aide ?**

- Vérifiez votre configuration : Exécutez `qwen` et utilisez la boîte de dialogue des paramètres
- Consultez vos paramètres actuels dans `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows)
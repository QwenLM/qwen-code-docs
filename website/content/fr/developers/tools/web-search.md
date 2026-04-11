# Outil de recherche Web (`web_search`)

Ce document décrit l'outil `web_search` permettant d'effectuer des recherches sur le Web via plusieurs fournisseurs.

## Description

Utilisez `web_search` pour effectuer une recherche sur le Web et obtenir des informations depuis Internet. L'outil prend en charge plusieurs fournisseurs de recherche et renvoie une réponse concise avec des citations de sources lorsque celles-ci sont disponibles.

### Fournisseurs pris en charge

1. **DashScope** (Officiel, Gratuit) - Disponible automatiquement pour les utilisateurs Qwen OAuth (200 requêtes/minute, 1000 requêtes/jour)
2. **Tavily** - API de recherche haute qualité avec génération de réponses intégrée
3. **Google Custom Search** - API JSON Custom Search de Google

### Arguments

`web_search` accepte deux arguments :

- `query` (string, obligatoire) : La requête de recherche
- `provider` (string, facultatif) : Fournisseur spécifique à utiliser ("dashscope", "tavily", "google")
  - Si non spécifié, utilise le fournisseur par défaut défini dans la configuration

## Configuration

### Méthode 1 : Fichier de paramètres (Recommandé)

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

- DashScope ne nécessite pas de clé API (service officiel et gratuit)
- **Utilisateurs Qwen OAuth :** DashScope est automatiquement ajouté à votre liste de fournisseurs, même sans configuration explicite
- Configurez des fournisseurs supplémentaires (Tavily, Google) si vous souhaitez les utiliser en parallèle de DashScope
- Définissez `default` pour spécifier le fournisseur à utiliser par défaut (si non défini, l'ordre de priorité est : Tavily > Google > DashScope)

### Méthode 2 : Variables d'environnement

Définissez les variables d'environnement dans votre shell ou votre fichier `.env` :

```bash
# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### Méthode 3 : Arguments en ligne de commande

Transmettez les clés API lors de l'exécution de Qwen Code :

```bash
# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# Specify default provider
qwen --web-search-default tavily
```

### Rétrocompatibilité (Obsolète)

⚠️ **OBSOLÈTE :** L'ancienne configuration `tavilyApiKey` est toujours prise en charge pour des raisons de rétrocompatibilité, mais elle est obsolète :

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Deprecated
  }
}
```

**Important :** Cette configuration est obsolète et sera supprimée dans une version future. Veuillez migrer vers le nouveau format de configuration `webSearch` présenté ci-dessus. L'ancienne configuration configurera automatiquement Tavily comme fournisseur, mais nous vous recommandons vivement de mettre à jour votre configuration.

## Désactivation de la recherche Web

Si vous souhaitez désactiver la fonctionnalité de recherche Web, vous pouvez exclure l'outil `web_search` dans votre `settings.json` :

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Remarque :** Ce paramètre nécessite un redémarrage de Qwen Code pour prendre effet. Une fois désactivé, l'outil `web_search` ne sera plus disponible pour le modèle, même si des fournisseurs de recherche Web sont configurés.

## Exemples d'utilisation

### Recherche de base (utilisation du fournisseur par défaut)

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

## Détails des fournisseurs

### DashScope (Officiel)

- **Coût :** Gratuit
- **Authentification :** Disponible automatiquement lors de l'utilisation de l'authentification Qwen OAuth
- **Configuration :** Aucune clé API requise, ajouté automatiquement à la liste des fournisseurs pour les utilisateurs Qwen OAuth
- **Quota :** 200 requêtes/minute, 1000 requêtes/jour
- **Idéal pour :** Les requêtes générales, toujours disponible comme solution de secours pour les utilisateurs Qwen OAuth
- **Enregistrement automatique :** Si vous utilisez Qwen OAuth, DashScope est automatiquement ajouté à votre liste de fournisseurs, même sans configuration explicite

### Tavily

- **Coût :** Nécessite une clé API (service payant avec offre gratuite)
- **Inscription :** https://tavily.com
- **Fonctionnalités :** Résultats de haute qualité avec réponse générée par IA
- **Idéal pour :** La recherche, les réponses complètes avec citations

### Google Custom Search

- **Coût :** Offre gratuite disponible (100 requêtes/jour)
- **Configuration :**
  1. Activez l'API Custom Search dans Google Cloud Console
  2. Créez un moteur de recherche personnalisé sur https://programmablesearchengine.google.com
- **Fonctionnalités :** Qualité de recherche Google
- **Idéal pour :** Les requêtes spécifiques et factuelles

## Remarques importantes

- **Format de réponse :** Renvoie une réponse concise avec des citations de sources numérotées
- **Citations :** Les liens vers les sources sont ajoutés sous forme de liste numérotée : [1], [2], etc.
- **Fournisseurs multiples :** Si un fournisseur échoue, spécifiez-en manuellement un autre à l'aide du paramètre `provider`
- **Disponibilité de DashScope :** Disponible automatiquement pour les utilisateurs Qwen OAuth, aucune configuration requise
- **Sélection du fournisseur par défaut :** Le système sélectionne automatiquement un fournisseur par défaut en fonction de la disponibilité :
  1. Votre configuration `default` explicite (priorité la plus élevée)
  2. Argument CLI `--web-search-default`
  3. Premier fournisseur disponible par ordre de priorité : Tavily > Google > DashScope

## Dépannage

**L'outil n'est pas disponible ?**

- **Pour les utilisateurs Qwen OAuth :** L'outil est automatiquement enregistré avec le fournisseur DashScope, aucune configuration requise
- **Pour les autres types d'authentification :** Assurez-vous qu'au moins un fournisseur (Tavily ou Google) est configuré
- Pour Tavily/Google : Vérifiez que vos clés API sont correctes

**Erreurs spécifiques à un fournisseur ?**

- Utilisez le paramètre `provider` pour essayer un autre fournisseur de recherche
- Vérifiez vos quotas API et vos limites de requêtes
- Vérifiez que les clés API sont correctement définies dans la configuration

**Besoin d'aide ?**

- Vérifiez votre configuration : Exécutez `qwen` et utilisez la fenêtre des paramètres
- Consultez vos paramètres actuels dans `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows)
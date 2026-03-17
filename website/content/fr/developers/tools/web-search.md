# Outil de recherche web (`web_search`)

Ce document décrit l’outil `web_search`, utilisé pour effectuer des recherches sur le web via plusieurs fournisseurs.

## Description

Utilisez `web_search` pour effectuer une recherche sur le web et obtenir des informations provenant d’internet. Cet outil prend en charge plusieurs fournisseurs de recherche et renvoie une réponse concise accompagnée, le cas échéant, de références aux sources.

### Fournisseurs pris en charge

1. **DashScope** (officiel, gratuit) — Disponible automatiquement pour les utilisateurs Qwen authentifiés via OAuth (200 requêtes/minute, 1 000 requêtes/jour)  
2. **Tavily** — API de recherche de haute qualité avec génération intégrée de réponses  
3. **Google Custom Search** — API JSON de recherche personnalisée de Google  

### Arguments

`web_search` accepte deux arguments :

- `query` (chaîne de caractères, requis) : la requête de recherche  
- `provider` (chaîne de caractères, facultatif) : fournisseur spécifique à utiliser (`"dashscope"`, `"tavily"` ou `"google"`)  
  - Si non spécifié, l’outil utilise le fournisseur par défaut défini dans la configuration  

## Configuration

### Méthode 1 : Fichier de paramètres (recommandée)

Ajoutez ceci à votre fichier `settings.json` :

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
- **Utilisateurs OAuth Qwen :** DashScope est automatiquement ajouté à votre liste de fournisseurs, même si vous ne le configurez pas explicitement
- Configurez des fournisseurs supplémentaires (Tavily, Google) si vous souhaitez les utiliser en complément de DashScope
- Définissez `default` pour spécifier le fournisseur à utiliser par défaut (si non défini, l’ordre de priorité est : Tavily > Google > DashScope)

### Méthode 2 : Variables d’environnement

Définissez les variables d’environnement dans votre interpréteur de commandes ou dans votre fichier `.env` :

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="votre-clé-api"
export GOOGLE_SEARCH_ENGINE_ID="votre-id-moteur-recherche"
```

### Méthode 3 : Arguments de ligne de commande

Transmettez les clés API lors de l’exécution de Qwen Code :

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key votre-clé --google-search-engine-id votre-id

# Spécifier le fournisseur par défaut
qwen --web-search-default tavily
```

### Rétrocompatibilité (obsolète)

⚠️ **OBSOLÈTE :** La configuration héritée `tavilyApiKey` est toujours prise en charge pour des raisons de rétrocompatibilité, mais elle est obsolète :

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Obsolète
  }
}
```

**Important :** Cette configuration est obsolète et sera supprimée dans une version ultérieure. Veuillez migrer vers le nouveau format de configuration `webSearch` présenté ci-dessus. L’ancienne configuration configure automatiquement Tavily comme fournisseur, mais nous vous recommandons vivement de mettre à jour votre configuration.

## Désactivation de la recherche web

Si vous souhaitez désactiver la fonctionnalité de recherche web, vous pouvez exclure l’outil `web_search` dans votre fichier `settings.json` :

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Remarque :** Ce paramètre nécessite un redémarrage de Qwen Code pour prendre effet. Une fois désactivé, l’outil `web_search` ne sera plus disponible pour le modèle, même si des fournisseurs de recherche web sont configurés.

## Exemples d’utilisation

### Recherche basique (avec le fournisseur par défaut)

```
web_search(query="dernières avancées en intelligence artificielle")
```

### Recherche avec un fournisseur spécifique

```
web_search(query="dernières avancées en intelligence artificielle", provider="tavily")
```

### Exemples concrets

```
web_search(query="météo à San Francisco aujourd'hui")
web_search(query="dernière version LTS de Node.js", provider="google")
web_search(query="bonnes pratiques pour React 19", provider="dashscope")
```

## Détails des fournisseurs

### DashScope (officiel)

- **Coût :** Gratuit  
- **Authentification :** Disponible automatiquement lors de l’utilisation de l’authentification OAuth Qwen  
- **Configuration :** Aucune clé API requise ; ajoutée automatiquement à la liste des fournisseurs pour les utilisateurs Qwen OAuth  
- **Quota :** 200 requêtes/minute, 1 000 requêtes/jour  
- **Idéal pour :** Requêtes générales ; toujours disponible comme solution de repli pour les utilisateurs Qwen OAuth  
- **Inscription automatique :** Si vous utilisez l’authentification OAuth Qwen, DashScope est automatiquement ajouté à votre liste de fournisseurs, même sans configuration explicite  

### Tavily

- **Coût :** Nécessite une clé API (service payant avec un niveau gratuit)  
- **S’inscrire :** https://tavily.com  
- **Fonctionnalités :** Résultats de haute qualité accompagnés de réponses générées par IA  
- **Idéal pour :** Recherche approfondie, réponses complètes avec références bibliographiques

### Recherche personnalisée Google

- **Coût :** Niveau gratuit disponible (100 requêtes/jour)
- **Configuration :**
  1. Activez l’API Recherche personnalisée dans la console Google Cloud
  2. Créez un moteur de recherche personnalisé sur https://programmablesearchengine.google.com
- **Fonctionnalités :** Qualité de recherche de Google
- **Idéal pour :** Les requêtes spécifiques et factuelles

## Remarques importantes

- **Format de la réponse :** Renvoie une réponse concise accompagnée de références numérotées vers les sources
- **Références :** Les liens vers les sources sont ajoutés sous forme d’une liste numérotée : [1], [2], etc.
- **Plusieurs fournisseurs :** Si un fournisseur échoue, spécifiez-en un autre manuellement à l’aide du paramètre `provider`
- **Disponibilité DashScope :** Disponible automatiquement pour les utilisateurs Qwen avec authentification OAuth, aucune configuration nécessaire
- **Sélection automatique du fournisseur par défaut :** Le système choisit automatiquement un fournisseur par défaut en fonction de sa disponibilité :
  1. Votre configuration explicite `default` (priorité la plus élevée)
  2. Argument CLI `--web-search-default`
  3. Premier fournisseur disponible selon l’ordre de priorité suivant : Tavily > Google > DashScope

## Résolution des problèmes

**L’outil n’est pas disponible ?**

- **Pour les utilisateurs Qwen avec authentification OAuth :** L’outil est automatiquement enregistré auprès du fournisseur DashScope ; aucune configuration n’est nécessaire.
- **Pour les autres types d’authentification :** Assurez-vous qu’au moins un fournisseur (Tavily ou Google) est configuré.
- Pour Tavily/Google : Vérifiez que vos clés API sont correctes.

**Des erreurs spécifiques à un fournisseur ?**

- Utilisez le paramètre `provider` pour essayer un autre fournisseur de recherche.
- Vérifiez vos quotas et limites de débit API.
- Assurez-vous que vos clés API sont correctement définies dans la configuration.

**Besoin d’aide ?**

- Vérifiez votre configuration : Exécutez `qwen` et utilisez la boîte de dialogue des paramètres.
- Affichez vos paramètres actuels dans `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows).
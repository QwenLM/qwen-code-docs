# Outil de recherche web (`web_search`)

Ce document décrit l'outil `web_search` permettant d'effectuer des recherches web en utilisant plusieurs fournisseurs.

## Description

Utilisez `web_search` pour effectuer une recherche web et obtenir des informations depuis Internet. L'outil prend en charge plusieurs fournisseurs de recherche et renvoie une réponse concise avec les citations sources lorsque disponibles.

### Fournisseurs pris en charge

1. **DashScope** (Officiel, Gratuit) - Disponible automatiquement pour les utilisateurs Qwen OAuth (200 requêtes/minute, 1000 requêtes/jour)
2. **Tavily** - API de recherche de haute qualité avec génération de réponses intégrée
3. **Google Custom Search** - API JSON de recherche personnalisée de Google

### Arguments

`web_search` prend deux arguments :

- `query` (chaîne de caractères, requis) : La requête de recherche
- `provider` (chaîne de caractères, facultatif) : Fournisseur spécifique à utiliser ("dashscope", "tavily", "google")
  - Si non spécifié, utilise le fournisseur par défaut de la configuration

## Configuration

### Méthode 1 : Fichier de configuration (recommandée)

Ajoutez à votre fichier `settings.json` :

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
- **Utilisateurs de Qwen OAuth :** DashScope est automatiquement ajouté à votre liste de fournisseurs, même si ce n'est pas explicitement configuré
- Configurez des fournisseurs supplémentaires (Tavily, Google) si vous souhaitez les utiliser en plus de DashScope
- Définissez `default` pour spécifier quel fournisseur utiliser par défaut (si non défini, l'ordre de priorité est : Tavily > Google > DashScope)

### Méthode 2 : Variables d'environnement

Définissez les variables d'environnement dans votre terminal ou dans le fichier `.env` :

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"
```

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### Méthode 3 : Arguments de ligne de commande

Transmettez les clés API lors de l'exécution de Qwen Code :

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# Spécifier le fournisseur par défaut
qwen --web-search-default tavily
```

### Compatibilité descendante (Obsolète)

⚠️ **OBSOLÈTE :** L'ancienne configuration `tavilyApiKey` est toujours prise en charge pour des raisons de compatibilité descendante, mais elle est désormais dépréciée :

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Déprécié
  }
}
```

**Important :** Cette configuration est dépréciée et sera supprimée dans une future version. Veuillez migrer vers le nouveau format de configuration `webSearch` indiqué ci-dessus. L'ancienne configuration configurera automatiquement Tavily en tant que fournisseur, mais nous vous recommandons vivement de mettre à jour votre configuration.

## Désactiver la recherche web

Si vous souhaitez désactiver la fonctionnalité de recherche web, vous pouvez exclure l'outil `web_search` dans votre fichier `settings.json` :

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Remarque :** Ce paramètre nécessite un redémarrage de Qwen Code pour prendre effet. Une fois désactivé, l'outil `web_search` ne sera pas disponible pour le modèle, même si des fournisseurs de recherche web sont configurés.

## Exemples d'utilisation

### Recherche basique (en utilisant le fournisseur par défaut)

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
web_search(query="meilleures pratiques pour React 19", provider="dashscope")
```

## Détails sur les fournisseurs

### DashScope (Officiel)

- **Coût :** Gratuit
- **Authentification :** Disponible automatiquement lors de l'utilisation de l'authentification OAuth Qwen
- **Configuration :** Aucune clé API requise, ajoutée automatiquement à la liste des fournisseurs pour les utilisateurs de Qwen OAuth
- **Quota :** 200 requêtes/minute, 1000 requêtes/jour
- **Idéal pour :** Requêtes générales, toujours disponible comme solution de repli pour les utilisateurs de Qwen OAuth
- **Auto-inscription :** Si vous utilisez Qwen OAuth, DashScope est automatiquement ajouté à votre liste de fournisseurs même si vous ne le configurez pas explicitement

### Tavily

- **Coût :** Nécessite une clé API (service payant avec offre gratuite)
- **Inscription :** https://tavily.com
- **Fonctionnalités :** Résultats de haute qualité avec réponses générées par l'IA
- **Idéal pour :** Recherche, réponses complètes avec citations

### Recherche personnalisée Google

- **Coût :** Niveau gratuit disponible (100 requêtes/jour)
- **Configuration :**
  1. Activer l'API de recherche personnalisée dans la console Google Cloud
  2. Créer un moteur de recherche personnalisé sur https://programmablesearchengine.google.com
- **Fonctionnalités :** Qualité de recherche de Google
- **Idéal pour :** Requêtes spécifiques et factuelles

## Notes importantes

- **Format de réponse :** Renvoie une réponse concise avec des citations numérotées des sources
- **Citations :** Les liens sources sont ajoutés sous forme d'une liste numérotée : [1], [2], etc.
- **Plusieurs fournisseurs :** Si un fournisseur échoue, spécifiez manuellement un autre fournisseur à l'aide du paramètre `provider`
- **Disponibilité de DashScope :** Automatiquement disponible pour les utilisateurs OAuth de Qwen, aucune configuration nécessaire
- **Sélection du fournisseur par défaut :** Le système sélectionne automatiquement un fournisseur par défaut selon la disponibilité :
  1. Votre configuration explicite de `default` (priorité la plus élevée)
  2. Argument CLI `--web-search-default`
  3. Premier fournisseur disponible par priorité : Tavily > Google > DashScope

## Dépannage

**Outil non disponible ?**

- **Pour les utilisateurs OAuth Qwen :** L'outil est automatiquement enregistré auprès du fournisseur DashScope, aucune configuration nécessaire
- **Pour les autres types d'authentification :** Assurez-vous qu'au moins un fournisseur (Tavily ou Google) est configuré
- Pour Tavily/Google : Vérifiez que vos clés API sont correctes

**Erreurs spécifiques au fournisseur ?**

- Utilisez le paramètre `provider` pour essayer un fournisseur de recherche différent
- Vérifiez vos quotas API et limites de débit
- Assurez-vous que les clés API sont correctement définies dans la configuration

**Besoin d'aide ?**

- Vérifiez votre configuration : Exécutez `qwen` et utilisez la boîte de dialogue des paramètres
- Consultez vos paramètres actuels dans `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows)
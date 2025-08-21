# Web Search Tool (`web_search`)

Ce document décrit l'outil `web_search`.

## Description

Utilisez `web_search` pour effectuer une recherche web via l'API Tavily. L'outil renvoie une réponse concise avec des sources lorsque cela est possible.

### Arguments

`web_search` prend un seul argument :

- `query` (string, requis) : La requête de recherche.

## Comment utiliser `web_search`

`web_search` appelle directement l'API Tavily. Vous devez configurer la clé `TAVILY_API_KEY` en utilisant l'une des méthodes suivantes :

1. **Fichier de configuration** : Ajoutez `"tavilyApiKey": "your-key-here"` dans votre fichier `settings.json`
2. **Variable d'environnement** : Définissez `TAVILY_API_KEY` dans votre environnement ou dans votre fichier `.env`
3. **Ligne de commande** : Utilisez `--tavily-api-key your-key-here` lors de l'exécution du CLI

Si la clé n'est pas configurée, l'outil sera désactivé et ignoré.

Utilisation :

```
web_search(query="Votre requête ici.")
```

## Exemples avec `web_search`

Obtenir des informations sur un sujet :

```
web_search(query="dernières avancées dans la génération de code assistée par IA")
```

## Notes importantes

- **Réponse retournée :** L'outil `web_search` renvoie une réponse concise lorsque disponible, accompagnée d'une liste de liens sources.
- **Citations :** Les liens sources sont ajoutés sous forme de liste numérotée.
- **API key :** Configurez `TAVILY_API_KEY` via settings.json, les variables d'environnement, les fichiers .env, ou les arguments de ligne de commande. Si non configurée, l'outil n'est pas enregistré.
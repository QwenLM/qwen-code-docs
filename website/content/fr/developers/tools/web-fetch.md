# Outil Web Fetch (`web_fetch`)

Ce document décrit l'outil `web_fetch` pour Qwen Code.

## Description

Utilisez `web_fetch` pour récupérer le contenu d'une URL spécifiée et le traiter à l'aide d'un modèle d'IA. L'outil prend en entrée une URL et un prompt, récupère le contenu de l'URL, convertit le HTML en Markdown et traite le contenu avec le prompt à l'aide d'un modèle léger et rapide.

### Arguments

`web_fetch` prend deux arguments :

- `url` (string, required) : L'URL depuis laquelle récupérer le contenu. Doit être une URL valide et complète commençant par `http://` ou `https://`.
- `prompt` (string, required) : Le prompt décrivant les informations que vous souhaitez extraire du contenu de la page.

## Comment utiliser `web_fetch` avec Qwen Code

Pour utiliser `web_fetch` avec Qwen Code, fournissez une URL et un prompt décrivant ce que vous souhaitez extraire de cette URL. L'outil demandera une confirmation avant de récupérer l'URL. Une fois confirmée, l'outil récupérera directement le contenu et le traitera à l'aide d'un modèle d'IA.

L'outil convertit automatiquement le HTML en texte, gère les URL blob GitHub (en les convertissant en URL raw) et met à niveau les URL HTTP vers HTTPS pour des raisons de sécurité.

Utilisation :

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

## Exemples d'utilisation de `web_fetch`

Résumer un seul article :

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

Extraire des informations spécifiques :

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

Analyser la documentation GitHub :

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

## Notes importantes

- **Traitement d'une seule URL :** `web_fetch` traite une URL à la fois. Pour analyser plusieurs URL, effectuez des appels séparés à l'outil.
- **Format d'URL :** L'outil met automatiquement à niveau les URL HTTP vers HTTPS et convertit les URL blob GitHub au format raw pour un meilleur accès au contenu.
- **Traitement du contenu :** L'outil récupère directement le contenu et le traite à l'aide d'un modèle d'IA, en convertissant le HTML en un format texte lisible.
- **Qualité de la sortie :** La qualité du résultat dépendra de la clarté des instructions fournies dans le prompt.
- **Outils MCP :** Si un outil de récupération web fourni par MCP est disponible (commençant par "mcp\_\_"), privilégiez son utilisation car il peut comporter moins de restrictions.
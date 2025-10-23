# Web Fetch Tool (`web_fetch`)

Ce document décrit l'outil `web_fetch` pour Qwen Code.

## Description

Utilisez `web_fetch` pour récupérer le contenu d'une URL spécifiée et le traiter à l'aide d'un modèle IA. L'outil prend une URL et un prompt en entrée, récupère le contenu de l'URL, convertit le HTML en markdown, puis traite le contenu avec le prompt en utilisant un petit modèle rapide.

### Arguments

`web_fetch` prend deux arguments :

- `url` (string, requis) : L'URL à partir de laquelle récupérer le contenu. Doit être une URL valide et complète commençant par `http://` ou `https://`.
- `prompt` (string, requis) : Le prompt décrivant les informations que vous souhaitez extraire du contenu de la page.

## Comment utiliser `web_fetch` avec Qwen Code

Pour utiliser `web_fetch` avec Qwen Code, fournissez une URL et un prompt décrivant ce que vous souhaitez extraire de cette URL. L'outil demandera une confirmation avant de récupérer le contenu. Une fois confirmé, l'outil récupérera le contenu directement et le traitera en utilisant un modèle AI.

L'outil convertit automatiquement le HTML en texte, gère les URLs GitHub blob (en les convertissant en URLs raw), et met à niveau les URLs HTTP en HTTPS pour des raisons de sécurité.

Utilisation :

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

## Exemples `web_fetch`

Résumer un article unique :

```
web_fetch(url="https://example.com/news/latest", prompt="Pouvez-vous résumer les points principaux de cet article ?")
```

Extraire des informations spécifiques :

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="Quels sont les résultats clés et la méthodologie décrite dans ce papier ?")
```

Analyser la documentation GitHub :

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="Quelles sont les étapes d'installation et les principales fonctionnalités ?")
```

## Notes importantes

- **Traitement d'une seule URL :** `web_fetch` traite une URL à la fois. Pour analyser plusieurs URLs, effectuez des appels séparés à l'outil.
- **Format d'URL :** L'outil met automatiquement à niveau les URLs HTTP vers HTTPS et convertit les URLs GitHub blob au format raw pour un meilleur accès au contenu.
- **Traitement du contenu :** L'outil récupère le contenu directement et le traite en utilisant un modèle AI, convertissant le HTML en texte lisible.
- **Qualité de la sortie :** La qualité de la sortie dépendra de la clarté des instructions dans le prompt.
- **Outils MCP :** Si un outil web fetch fourni par MCP est disponible (commençant par "mcp__"), préférez utiliser cet outil car il peut avoir moins de restrictions.
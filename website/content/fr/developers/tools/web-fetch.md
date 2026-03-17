# Outil de récupération web (`web_fetch`)

Ce document décrit l’outil `web_fetch` pour Qwen Code.

## Description

Utilisez `web_fetch` pour récupérer du contenu à partir d’une URL spécifiée et le traiter à l’aide d’un modèle d’intelligence artificielle. Cet outil prend en entrée une URL et une instruction (« prompt »), récupère le contenu de l’URL, convertit le HTML en markdown, puis traite ce contenu avec l’instruction à l’aide d’un modèle léger et rapide.

### Arguments

`web_fetch` accepte deux arguments :

- `url` (chaîne de caractères, requis) : l’URL depuis laquelle récupérer le contenu. Doit être une URL valide et complète commençant par `http://` ou `https://`.
- `prompt` (chaîne de caractères, requis) : l’instruction décrivant les informations que vous souhaitez extraire du contenu de la page.

## Comment utiliser `web_fetch` avec Qwen Code

Pour utiliser `web_fetch` avec Qwen Code, fournissez une URL et une instruction décrivant ce que vous souhaitez extraire depuis cette URL. L’outil demandera une confirmation avant de récupérer l’URL. Une fois confirmée, il récupérera directement le contenu et le traitera à l’aide d’un modèle d’intelligence artificielle.

L’outil convertit automatiquement le HTML en texte, gère les URL GitHub de type « blob » (en les convertissant en URL brutes) et met à niveau les URL HTTP en HTTPS pour des raisons de sécurité.

Utilisation :

```
web_fetch(url="https://example.com", prompt="Résumez les points principaux de cet article")
```

## Exemples de `web_fetch`

Résumer un seul article :

```
web_fetch(url="https://example.com/news/latest", prompt="Pourriez-vous résumer les points principaux de cet article ?")
```

Extraire des informations spécifiques :

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="Quelles sont les principales conclusions et la méthodologie décrites dans cet article ?")
```

Analyser la documentation GitHub :

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="Quelles sont les étapes d’installation et les fonctionnalités principales ?")
```

## Remarques importantes

- **Traitement d’une seule URL à la fois :** `web_fetch` traite une seule URL à la fois. Pour analyser plusieurs URL, effectuez des appels distincts à cet outil.
- **Format des URL :** L’outil met automatiquement à niveau les URL HTTP en HTTPS et convertit les URL GitHub « blob » en format « raw » afin d’assurer un meilleur accès au contenu.
- **Traitement du contenu :** L’outil récupère directement le contenu puis le traite à l’aide d’un modèle d’intelligence artificielle, en convertissant le HTML en un format texte lisible.
- **Qualité de la sortie :** La qualité de la sortie dépendra de la clarté des instructions fournies dans l’invite.
- **Outils MCP :** Si un outil de récupération web fourni par MCP est disponible (dont le nom commence par « mcp__ »), privilégiez son utilisation, car il peut être soumis à moins de restrictions.
# Outil Web Fetch (`web_fetch`)

Ce document décrit l'outil `web_fetch` pour Qwen Code.

## Description

Utilisez `web_fetch` pour récupérer le contenu d'une URL spécifiée et le traiter à l'aide d'un modèle d'IA. L'outil prend en entrée une URL et un prompt, récupère le contenu de l'URL et le traite avec le prompt en utilisant un modèle léger et rapide.

### Arguments

`web_fetch` accepte trois arguments :

- `url` (string, required) : L'URL depuis laquelle récupérer le contenu. Doit être une URL valide et complète commençant par `http://` ou `https://`.
- `prompt` (string, required) : Le prompt décrivant les informations que vous souhaitez extraire du contenu de la page.
- `format` (string, optional) : Contrôle uniquement l'en-tête `Accept` envoyé au serveur, indiquant votre préférence de contenu. **Tout le contenu récupéré est normalisé en texte brut pour le traitement par le LLM**, quel que soit le format spécifié. La valeur par défaut est `"auto"` si non spécifié.
  - `"auto"` (default) : Privilégie le markdown via la négociation de contenu (`Accept: text/markdown, text/html`), accepte le HTML en secours. **Recommandé pour la plupart des cas d'utilisation** car il peut réduire la consommation de tokens jusqu'à 80 % pour les serveurs prenant en charge le markdown.
  - `"markdown"` : Envoie `Accept: text/markdown`. À utiliser lorsque vous avez explicitement besoin de contenu markdown.
  - `"html"` : Envoie `Accept: text/html`. À utiliser lorsque le serveur exige du HTML dans l'en-tête Accept. Le contenu est tout de même converti en texte brut pour le traitement par le LLM.
  - `"text"` : Envoie `Accept: text/plain`. À utiliser lorsque vous avez spécifiquement besoin de contenu en texte brut.

## Comment utiliser `web_fetch` avec Qwen Code

Pour utiliser `web_fetch` avec Qwen Code, fournissez une URL et un prompt décrivant ce que vous souhaitez extraire de cette URL. L'outil demandera une confirmation avant de récupérer l'URL. Une fois confirmé, l'outil récupérera directement le contenu et le traitera à l'aide d'un modèle d'IA.

L'outil effectue automatiquement les opérations suivantes :

- Convertit le HTML en texte lorsque nécessaire
- Gère les URL blob GitHub (en les convertissant en URL brutes)
- Met à niveau les URL HTTP vers HTTPS pour des raisons de sécurité
- Prend en charge la négociation de contenu pour le markdown (réduit considérablement la consommation de tokens)

Utilisation :

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

Avec spécification du format :

```
web_fetch(url="https://example.com", prompt="Get the raw content", format="markdown")
```

## Exemples `web_fetch`

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

Obtenir du contenu markdown (pour les serveurs prenant en charge Markdown for Agents) :

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extract the key information", format="markdown")
```

## Notes importantes

- **Traitement d'une seule URL :** `web_fetch` traite une URL à la fois. Pour analyser plusieurs URL, effectuez des appels séparés à l'outil.
- **Format d'URL :** L'outil met automatiquement à niveau les URL HTTP vers HTTPS et convertit les URL blob GitHub au format brut pour un meilleur accès au contenu.
- **Négociation de contenu :** L'outil prend en charge la négociation de contenu "Markdown for Agents". Lors de l'utilisation de `format="auto"` (par défaut), il envoie les en-têtes `Accept: text/markdown, text/html`, permettant aux serveurs prenant en charge le markdown de le retourner directement au lieu du HTML. Cela peut réduire la consommation de tokens jusqu'à 80 %.
- **Traitement du contenu :** L'outil récupère directement le contenu et le traite à l'aide d'un modèle d'IA. Lorsque le serveur retourne du HTML, il le convertit en format texte lisible. Lorsque le serveur retourne du markdown ou du texte brut, il utilise le contenu tel quel.
- **Qualité de la sortie :** La qualité du résultat dépendra de la clarté des instructions dans le prompt.
- **Outils MCP :** Si un outil de récupération web fourni par MCP est disponible (commençant par "mcp\_\_"), privilégiez son utilisation car il peut comporter moins de restrictions.

## Prise en charge de Markdown for Agents

L'outil `web_fetch` de Qwen Code implémente la prise en charge de la spécification [Markdown for Agents de Cloudflare](https://blog.cloudflare.com/markdown-for-agents/). Cette fonctionnalité permet aux sites web de servir directement du contenu markdown aux agents IA, réduisant considérablement la consommation de tokens par rapport à l'analyse du HTML.

### Fonctionnement

1. Le paramètre `format` contrôle **uniquement** l'en-tête `Accept` envoyé au serveur (il n'affecte pas le format de sortie) :
   - `format="auto"` : envoie `Accept: text/markdown, text/html`
   - `format="markdown"` : envoie `Accept: text/markdown`
   - `format="html"` : envoie `Accept: text/html`
   - `format="text"` : envoie `Accept: text/plain`
2. Si le serveur prend en charge le markdown, il retourne `Content-Type: text/markdown`
3. L'outil utilise directement le contenu markdown ou texte brut sans conversion
4. Si le serveur retourne du HTML, il est converti en format texte lisible pour le traitement par le LLM
5. Tout le contenu est normalisé en texte avant d'être traité par le modèle d'IA

### Avantages

- **Efficacité des tokens :** Le contenu markdown utilise généralement 80 % de tokens en moins qu'un HTML équivalent
- **Meilleure structure :** Le markdown préserve la structure sémantique (titres, listes, etc.)
- **Compatibilité descendante :** Fonctionne avec tous les sites web, expérience améliorée pour les serveurs compatibles

### Exemples de serveurs prenant en charge le markdown

- Documentation développeur Cloudflare
- Blog Cloudflare
- Tout site web utilisant la fonctionnalité "Markdown for Agents" de Cloudflare
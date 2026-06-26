# Outil de récupération web (`web_fetch`)

Ce document décrit l'outil `web_fetch` pour Qwen Code.

## Description

Utilisez `web_fetch` pour récupérer le contenu d'une URL spécifiée et le traiter à l'aide d'un modèle d'IA. L'outil prend une URL et une invite (prompt) en entrée, récupère le contenu de l'URL et traite ce contenu avec l'invite en utilisant un modèle petit et rapide.

### Arguments

`web_fetch` prend trois arguments :

- `url` (chaîne, obligatoire) : L'URL dont récupérer le contenu. Doit être une URL valide et complète commençant par `http://` ou `https://`.
- `prompt` (chaîne, obligatoire) : L'invite décrivant les informations que vous souhaitez extraire du contenu de la page.
- `format` (chaîne, facultatif) : Contrôle uniquement l'en-tête `Accept` envoyé au serveur, indiquant votre préférence de contenu. **Tout le contenu récupéré est normalisé en texte brut pour le traitement par LLM**, quel que soit le format spécifié. Par défaut `"auto"` si non spécifié.
  - `"auto"` (par défaut) : Préfère le Markdown via la négociation de contenu (`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`), puis se rabat sur HTML, texte brut ou d'autres types de contenu. **Recommandé pour la plupart des cas d'usage** car il peut réduire la consommation de jetons jusqu'à 80 % pour les serveurs qui prennent en charge le Markdown, tout en continuant à fonctionner avec les API uniquement JSON.
  - `"markdown"` : Préfère `Accept: text/markdown, */*;q=0.1`. À utiliser lorsque vous avez explicitement besoin de contenu Markdown.
  - `"html"` : Préfère `Accept: text/html, */*;q=0.1`. À utiliser lorsque le serveur exige HTML dans l'en-tête Accept. Le contenu est tout de même converti en texte brut pour le traitement par LLM.
  - `"text"` : Préfère `Accept: text/plain, */*;q=0.1`. À utiliser lorsque vous avez spécifiquement besoin de contenu texte brut.

## Comment utiliser `web_fetch` avec Qwen Code

Pour utiliser `web_fetch` avec Qwen Code, fournissez une URL et une invite décrivant ce que vous souhaitez extraire de cette URL. L'outil demandera une confirmation avant de récupérer l'URL. Une fois confirmé, l'outil récupérera le contenu directement et le traitera à l'aide d'un modèle d'IA.

L'outil fait automatiquement :

- Convertir le HTML en texte si nécessaire
- Gérer les URLs de blob GitHub (les convertit en URLs brutes)
- Mettre à niveau les URLs HTTP vers HTTPS pour la sécurité
- Prendre en charge la négociation de contenu pour le Markdown (réduit significativement la consommation de jetons)

Utilisation :

```
web_fetch(url="https://example.com", prompt="Résume les points principaux de cet article")
```

Avec spécification de format :

```
web_fetch(url="https://example.com", prompt="Obtenir le contenu brut", format="markdown")
```

## Exemples de `web_fetch`

Résumer un seul article :

```
web_fetch(url="https://example.com/news/latest", prompt="Peux-tu résumer les points principaux de cet article ?")
```

Extraire des informations spécifiques :

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="Quels sont les résultats clés et la méthodologie décrits dans cet article ?")
```

Analyser la documentation GitHub :

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="Quelles sont les étapes d'installation et les principales fonctionnalités ?")
```

Obtenir du contenu Markdown (pour les serveurs prenant en charge Markdown for Agents) :

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extrais les informations clés", format="markdown")
```

## Remarques importantes

- **Traitement d'une seule URL :** `web_fetch` traite une URL à la fois. Pour analyser plusieurs URLs, effectuez des appels séparés à l'outil.
- **Format d'URL :** L'outil met automatiquement à niveau les URLs HTTP vers HTTPS et convertit les URLs de blob GitHub en format brut pour un meilleur accès au contenu.
- **Négociation de contenu :** L'outil prend en charge la négociation de contenu "Markdown for Agents". Lorsque vous utilisez `format="auto"` (par défaut), il envoie `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`, permettant aux serveurs qui prennent en charge le Markdown de le renvoyer directement au lieu du HTML. La solution de secours `*/*` de faible priorité permet de continuer à récupérer les API uniquement JSON et autres points de terminaison non textuels. Cela peut réduire la consommation de jetons jusqu'à 80 %.
- **Traitement du contenu :** L'outil récupère le contenu directement et le traite à l'aide d'un modèle d'IA. Lorsque le serveur renvoie du HTML, il le convertit en un format texte lisible. Lorsque le serveur renvoie du Markdown, du texte brut ou un autre type de contenu de secours comme du JSON, il utilise le contenu tel quel.
- **Qualité de la sortie :** La qualité de la sortie dépendra de la clarté des instructions dans l'invite.
- **Outils MCP :** Si un outil de récupération web fourni par MCP est disponible (commençant par "mcp\_\_"), privilégiez l'utilisation de cet outil car il peut avoir moins de restrictions.

## Prise en charge de Markdown for Agents

L'outil `web_fetch` de Qwen Code implémente la prise en charge de la spécification [Markdown for Agents de Cloudflare](https://blog.cloudflare.com/markdown-for-agents/). Cette fonctionnalité permet aux sites web de servir du contenu Markdown directement aux agents IA, réduisant considérablement la consommation de jetons par rapport à l'analyse du HTML.

### Fonctionnement

1. Le paramètre `format` contrôle **uniquement** l'en-tête `Accept` envoyé au serveur (il n'affecte pas le format de sortie) :
   - `format="auto"` : envoie `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`
   - `format="markdown"` : envoie `Accept: text/markdown, */*;q=0.1`
   - `format="html"` : envoie `Accept: text/html, */*;q=0.1`
   - `format="text"` : envoie `Accept: text/plain, */*;q=0.1`
2. Si le serveur prend en charge le Markdown, il renvoie `Content-Type: text/markdown`
3. L'outil utilise le contenu Markdown ou texte brut directement sans conversion
4. Si le serveur renvoie du HTML, il le convertit en un format texte lisible pour le traitement par LLM ; le Markdown, le texte brut et les types de contenu de secours comme le JSON sont utilisés tels quels
5. Tout le contenu est normalisé en texte avant d'être traité par le modèle d'IA
### Avantages

- **Efficacité des tokens** : le contenu Markdown utilise généralement 80 % de tokens en moins que le HTML équivalent
- **Meilleure structure** : Markdown préserve la structure sémantique (titres, listes, etc.)
- **Rétrocompatible** : fonctionne avec tous les sites web, offre une expérience améliorée pour les serveurs compatibles

### Exemples de serveurs prenant en charge le markdown

- Documentation développeur de Cloudflare
- Blog de Cloudflare
- Tout site web utilisant la fonctionnalité « Markdown for Agents » de Cloudflare

# Outil de récupération Web (`web_fetch`)

Ce document décrit l'outil `web_fetch` pour Qwen Code.

## Description

Utilisez `web_fetch` pour récupérer le contenu d'une URL spécifiée et le traiter à l'aide d'un modèle d'IA. L'outil prend une URL et une invite (prompt) en entrée, récupère le contenu de l'URL et le traite avec l'invite à l'aide d'un modèle petit et rapide.

### Arguments

`web_fetch` prend trois arguments :

- `url` (string, obligatoire) : L'URL à partir de laquelle récupérer le contenu. Doit être une URL valide et complète commençant par `http://` ou `https://`.
- `prompt` (string, obligatoire) : L'invite décrivant les informations que vous souhaitez extraire du contenu de la page.
- `format` (string, optionnel) : Contrôle uniquement l'en-tête `Accept` envoyé au serveur, indiquant votre préférence de contenu. **Tout le contenu récupéré est normalisé en texte brut pour le traitement par LLM**, quel que soit le format spécifié. Par défaut à `"auto"` si non spécifié.
  - `"auto"` (défaut) : Préfère le markdown via la négociation de contenu (`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`), puis revient au HTML, texte brut ou autres types de contenu. **Recommandé pour la plupart des cas d'utilisation** car il peut réduire la consommation de tokens jusqu'à 80 % pour les serveurs qui prennent en charge le markdown tout en fonctionnant avec les API JSON uniquement.
  - `"markdown"` : Préfère `Accept: text/markdown, */*;q=0.1`. Utilisez lorsque vous avez explicitement besoin de contenu markdown.
  - `"html"` : Préfère `Accept: text/html, */*;q=0.1`. Utilisez lorsque le serveur nécessite du HTML dans l'en-tête Accept. Le contenu est toujours converti en texte brut pour le traitement par LLM.
  - `"text"` : Préfère `Accept: text/plain, */*;q=0.1`. Utilisez lorsque vous avez spécifiquement besoin de contenu en texte brut.

## Comment utiliser `web_fetch` avec Qwen Code

Pour utiliser `web_fetch` avec Qwen Code, fournissez une URL et une invite décrivant ce que vous souhaitez extraire de cette URL. L'outil demandera une confirmation avant de récupérer l'URL. Une fois confirmée, l'outil récupérera le contenu directement et le traitera à l'aide d'un modèle d'IA.

L'outil automatiquement :

- Convertit le HTML en texte si nécessaire
- Gère les URL de blobs GitHub (les convertit en URL brutes)
- Met à niveau les URL HTTP vers HTTPS pour la sécurité
- Prend en charge la négociation de contenu pour le markdown (réduit considérablement la consommation de tokens)

Utilisation :

```
web_fetch(url="https://example.com", prompt="Résumez les points principaux de cet article")
```

Avec spécification de format :

```
web_fetch(url="https://example.com", prompt="Obtenez le contenu brut", format="markdown")
```

## Exemples de `web_fetch`

Résumer un seul article :

```
web_fetch(url="https://example.com/news/latest", prompt="Pouvez-vous résumer les points principaux de cet article ?")
```

Extraire des informations spécifiques :

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="Quels sont les résultats clés et la méthodologie décrits dans cet article ?")
```

Analyser une documentation GitHub :

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="Quelles sont les étapes d'installation et les principales fonctionnalités ?")
```

Obtenir du contenu markdown (pour les serveurs prenant en charge Markdown for Agents) :

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extrayez les informations clés", format="markdown")
```

## Remarques importantes

- **Traitement d'une seule URL :** `web_fetch` traite une URL à la fois. Pour analyser plusieurs URL, effectuez des appels séparés à l'outil.
- **Format d'URL :** L'outil met automatiquement à niveau les URL HTTP vers HTTPS et convertit les URL de blobs GitHub en format brut pour un meilleur accès au contenu.
- **Négociation de contenu :** L'outil prend en charge la négociation de contenu « Markdown for Agents ». Lors de l'utilisation de `format="auto"` (défaut), il envoie `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`, permettant aux serveurs qui prennent en charge le markdown de le renvoyer directement au lieu du HTML. Le fallback `*/*` de faible priorité permet de garder les API JSON uniquement et autres points de terminaison non textuels accessibles. Cela peut réduire la consommation de tokens jusqu'à 80 %.
- **Traitement du contenu :** L'outil récupère le contenu directement et le traite à l'aide d'un modèle d'IA. Lorsque le serveur renvoie du HTML, il le convertit en un format texte lisible. Lorsque le serveur renvoie du markdown, du texte brut ou un autre type de contenu de repli tel que JSON, il utilise le contenu tel quel.
- **Qualité de sortie :** La qualité de la sortie dépendra de la clarté des instructions dans l'invite.
- **Outils MCP :** Si un outil de récupération web fourni par MCP est disponible (commençant par « mcp__ »), préférez utiliser cet outil car il peut avoir moins de restrictions.

## Prise en charge de Markdown for Agents

L'outil `web_fetch` de Qwen Code implémente la prise en charge de la spécification [Markdown for Agents de Cloudflare](https://blog.cloudflare.com/markdown-for-agents/). Cette fonctionnalité permet aux sites web de servir du contenu markdown directement aux agents IA, réduisant considérablement la consommation de tokens par rapport au parsing HTML.

### Comment ça fonctionne

1. Le paramètre `format` contrôle **uniquement** l'en-tête `Accept` envoyé au serveur (il n'affecte pas le format de sortie) :
   - `format="auto"` : envoie `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`
   - `format="markdown"` : envoie `Accept: text/markdown, */*;q=0.1`
   - `format="html"` : envoie `Accept: text/html, */*;q=0.1`
   - `format="text"` : envoie `Accept: text/plain, */*;q=0.1`
2. Si le serveur prend en charge le markdown, il renvoie `Content-Type: text/markdown`
3. L'outil utilise le contenu markdown ou texte brut directement sans conversion
4. Si le serveur renvoie du HTML, il le convertit en un format texte lisible pour le traitement par LLM ; le markdown, le texte brut et les types de contenu de repli tels que JSON sont utilisés tels quels
5. Tout le contenu est normalisé en texte avant d'être traité par le modèle d'IA

### Avantages

- **Efficacité des tokens :** Le contenu markdown utilise généralement 80 % moins de tokens que le HTML équivalent
- **Meilleure structure :** Le markdown préserve la structure sémantique (titres, listes, etc.)
- **Rétrocompatible :** Fonctionne avec tous les sites web, expérience améliorée pour les serveurs prenant en charge la fonctionnalité

### Exemples de serveurs prenant en charge le markdown

- Documentation développeur de Cloudflare
- Blog Cloudflare
- Tout site web utilisant la fonctionnalité « Markdown for Agents » de Cloudflare
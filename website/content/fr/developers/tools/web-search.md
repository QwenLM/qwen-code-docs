# Recherche Web

Qwen Code fournit la recherche web de deux manières :

1. **Outil intégré `web_search`** — basé sur la recherche côté serveur de l'API DashScope Responses ou, pour les sessions d'abonnement Qwen, le service de recherche MCP Qwen. Activé après la connexion à un abonnement Plus/Pro et activé par défaut au démarrage pour les configurations ModelStudio et compatibles OpenAI avec DashScope ; aucune configuration supplémentaire de fournisseur ou de MCP n'est nécessaire.
2. **Intégrations MCP (Model Context Protocol)** — connectez n'importe quel service de recherche externe (Tavily, GLM, et autres). Utilisez cette option lorsque votre fournisseur ne peut pas alimenter l'outil intégré.

## `web_search` intégré [#built-in-web_search]

Pour DashScope, l'outil intégré émet une demande de recherche autonome vers un petit modèle auxiliaire avec des outils `web_search` (et `web_extractor`) côté serveur, et renvoie les résultats narrés ainsi que les URL des sources. Avec [Compte Qwen avec Abonnement](../../users/configuration/auth.md), il utilise le service de recherche MCP Qwen et vos identifiants de connexion actuels. Aucune clé API de recherche distincte, aucun modèle auxiliaire ni aucune configuration `mcpServers` n'est nécessaire. `webExtractor` s'applique uniquement à la recherche DashScope.

### Quand il s'active tout seul

Si vous n'avez rien configuré sous `tools.webSearch`, l'outil s'enregistre lorsque le modèle que vous utilisez peut alimenter la requête de recherche avec les mêmes identifiants :

| Mode de connexion                                                                                                          | Recherche intégrée                              |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [Compte Qwen avec Abonnement](https://chat.qwen.ai/?memberPlan=qwen_code) — **Plus ou Pro**                             | activé                                              |
| Alibaba ModelStudio → **Clé API standard**                                                                                 | activée                                         |
| Alibaba ModelStudio → **Token Plan**                                                                                       | activée                                         |
| Alibaba ModelStudio → **Coding Plan**                                                                                      | désactivée — son point de terminaison n'est pas vérifié pour cette API |
| QwenCloud → **Clé API Standard**                                                                                           | activé                                              |
| QwenCloud → **Plan de Tokens**                                                                                                 | activé                                              |
| Entrée `modelProviders` compatible OpenAI ou fournisseur personnalisé sur un hôte DashScope Responses reconnu, avec une clé directe | activée                                         |
| Fournisseurs tiers (OpenRouter, DeepSeek, ModelScope, …), points de terminaison personnalisés sur d'autres hôtes, modèles locaux | désactivée                                      |

Les recherches DashScope facturent la même clé que votre modèle principal ; les recherches par abonnement réutilisent vos identifiants de connexion Qwen. La gestion des permissions suit le mode d'approbation actif et les règles ; dans le mode d'approbation `default`, la première recherche demande une confirmation. Lorsque votre fournisseur ne peut pas prendre en charge l'outil, celui-ci n'apparaît simplement pas au démarrage — sans avertissement au démarrage.

Pour le désactiver :

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

ou `ENABLE_WEB_SEARCH=false`. Le mode bare et le mode safe le désactivent toujours.

### Configuration explicite

Cette section configure la recherche DashScope. La recherche par abonnement réutilise les identifiants de votre adhésion et ne nécessite aucune configuration supplémentaire. Les paramètres explicites de recherche ont toujours priorité sur la recherche automatique par abonnement.

Pointez l'outil vers un ModelStudio Standard/Token Plan ou une autre entrée DashScope Responses vérifiée. Ceci est utile lorsque votre modèle principal tourne sur un autre fournisseur et que vous possédez également une clé DashScope prise en charge séparée. Les hôtes Coding Plan sont exclus de l'activation automatique car les outils de recherche Responses n'y sont pas vérifiés. Vous pouvez activer explicitement avec `tools.webSearch.model` ; si le point de terminaison ne les sert pas, la première recherche échoue bruyamment. Utilisez un fournisseur de recherche MCP si vous ne voulez pas dépendre de ce chemin non vérifié.

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-flash",
        "envKey": "DASHSCOPE_API_KEY",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
      }
    ]
  },
  "tools": {
    "webSearch": {
      "enabled": true,
      "model": "qwen3.8-flash"
    }
  }
}
```

| Paramètre                        | Remplacement env           | Signification                                                                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`        | `ENABLE_WEB_SEARCH`        | Mettez `false` pour désactiver l'outil. L'activation implicite au démarrage nécessite de laisser `enabled`, `model` et le backend env-only non définis. Mettre `true` permet la dérivation automatique uniquement lorsque le backend env-only est également non défini ; sinon un `model` est requis. |
| `tools.webSearch.model`          | `WEB_SEARCH_MODEL`         | Sélecteur de modèle de recherche pour le chemin explicite (`modelId` ou `authType:modelId`). Avec `WEB_SEARCH_BASE_URL`, c'est l'id de modèle brut pour ce point de terminaison ; sinon il doit correspondre à une entrée `modelProviders` compatible DashScope déclarée. Le chemin automatique utilise `qwen3.8-flash`. |
| `tools.webSearch.webExtractor`   | `WEB_SEARCH_EXTRACTOR`     | Permet à l'agent de recherche d'ouvrir les pages de résultats pour des réponses mieux fondées (par défaut `true` ; facturé séparément par DashScope).                                                                                                                                  |
| `tools.webSearch.timeoutMs`     | `WEB_SEARCH_TIMEOUT_MS`      | Budget de temps total pour une recherche, en millisecondes (par défaut `120000`, max `600000` ; les autres valeurs sont remplacées par la valeur par défaut). Une recherche qui dépasse son temps renvoie ce qui est arrivé sous forme de résultat partiel une fois qu'au moins un appel de recherche s'est terminé ; si le budget expire avant que le premier appel de recherche ne se termine, l'outil signale plutôt une erreur de délai d'attente, car une narration sans recherche exécutée n'est pas une preuve vérifiable. Une limite d'exécution par outil (`QWEN_CODE_TOOL_EXECUTION_TIMEOUT_MS`) inférieure à ce budget se déclenche en premier et annule le résultat partiel ; gardez-la supérieure à `timeoutMs`. |
| `tools.webSearch.allowedHosts`  | `WEB_SEARCH_ALLOWED_HOSTS`   | Suffixes d'hôtes supplémentaires approuvés pour un backend de recherche configuré explicitement — un hôte exact, ou tout sous-domaine d'un suffixe listé (séparés par des virgules dans la variable d'environnement). Vide par défaut, donc le comportement est inchangé sauf si défini. Seul le backend `WEB_SEARCH_BASE_URL` et le chemin `modelProviders` le consultent ; la dérivation automatique ne le fait jamais, donc un hôte personnalisé n'est utilisé que là où votre propre configuration le nomme. L'hôte configuré reçoit la clé API. Les entrées sont nettoyées et mises en minuscules, et les entrées sans point sont ignorées.                                                 |
| `tools.webSearch.maxPerSession` | `WEB_SEARCH_MAX_PER_SESSION` | Nombre maximal d'appels `web_search` dans une session (par défaut `200`, max `10000` ; les autres valeurs sont remplacées par la valeur par défaut). Le compteur est partagé avec les sous-agents et est réinitialisé lors du changement de session (`/clear`, `/resume`, branchement). Une fois atteint, les recherches suivantes sont ignorées et le modèle est informé de continuer avec ce qu'il a collecté.                                                                                                                                                  |

### Configuration par variables d'environnement uniquement (sans settings.json)

Pour les environnements où vous ne pouvez pas écrire de fichier de paramètres (conteneurs verrouillés, CI avec injection d'environnement uniquement), l'outil peut être configuré entièrement via des variables d'environnement — aucune entrée `modelProviders` n'est nécessaire :

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.8-flash
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export WEB_SEARCH_ALLOWED_HOSTS=llm-gw.example.com   # only for a gateway host
export DASHSCOPE_API_KEY=sk-...        # or set WEB_SEARCH_API_KEY instead
```

`WEB_SEARCH_BASE_URL` reflète le champ `baseUrl` d'une entrée `modelProviders` et doit être un point de terminaison compatible DashScope ; lorsqu'il est défini, il prend la priorité sur la résolution de `modelProviders` et `WEB_SEARCH_MODEL` est utilisé comme identifiant de modèle DashScope simple. La clé API est lue depuis `WEB_SEARCH_API_KEY` si elle est définie, sinon depuis `DASHSCOPE_API_KEY`. Si le point de terminaison est une passerelle sur votre propre domaine, listez cet hôte dans `WEB_SEARCH_ALLOWED_HOSTS` (ou `tools.webSearch.allowedHosts`) — sinon, la liste intégrée est la seule acceptée par la vérification. Une configuration incorrecte s'affiche toujours sous forme d'avis au démarrage.

Notes :

- Pour la recherche DashScope explicite, le sélecteur doit résoudre vers une entrée `modelProviders` compatible DashScope portant une clé API directe via `envKey`. Votre modèle principal peut provenir de n'importe quel fournisseur. Le fournisseur Qwen OAuth gratuit hérité ne peut pas prendre en charge ce chemin ; la recherche par Abonnement Qwen utilise le service MCP séparé décrit ci-dessus.
- L'enregistrement de la recherche est réévalué après des changements d'authentification réussis. La connexion à l'Abonnement Qwen active la recherche dans la session actuelle sans redémarrage. La désactivation explicite, le mode nu/sûr et les règles de permission d'outil s'appliquent toujours.
- La détection automatique de l'hôte accepte intentionnellement uniquement les hôtes régionaux DashScope connus, les hôtes Model Studio et QwenCloud MaaS (y compris leurs sous-domaines d'abonnement `token-plan.`), ainsi que les hôtes internes Alibaba. Les passerelles génériques `*.alicloudapi.com`, `DASHSCOPE_PROXY_BASE_URL` et tout hôte que vous avez simplement ajouté à `allowedHosts` sont exclus de ce chemin automatique, car il s'exécute sans votre intervention et risquerait autrement de transmettre la clé de votre fournisseur principal à un hôte non déclaré. Pour une passerelle que vous déclarez explicitement, listez-la dans `tools.webSearch.allowedHosts` et pointez `WEB_SEARCH_BASE_URL` (ou une entrée `modelProviders`) vers elle.
- Si activé explicitement mais mal configuré, l'outil reste désactivé et une notification au démarrage explique quelle condition a échoué. L'activation automatique n'émet jamais de notification.
- Les recherches DashScope facturent votre clé DashScope (`usage.x_tools` est compté). Le mode d'approbation automatique (par défaut) permet au classificateur d'approuver les recherches sans demander ; en mode d'approbation `default`, l'outil demande l'approbation, et approuver avec « toujours autoriser » persiste une règle de permission standard `WebSearch`, comme pour les autres outils.
- Il n'y a pas de liste d'autorisation de modèles côté client ; un modèle que le point de terminaison Responses ne sert pas échoue bruyamment à la première utilisation.
- Une recherche qui dépasse son budget de temps renvoie ce qui est arrivé sous forme de résultat partiel une fois qu'au moins un appel de recherche s'est terminé ; si le budget expire avant que le premier appel de recherche ne se termine, l'outil signale plutôt une erreur de délai d'attente, car une narration sans recherche exécutée n'est pas une preuve vérifiable. Lorsqu'un appel de recherche s'est terminé mais que la réponse narrée n'est jamais arrivée, le résultat contient au plus 6 000 caractères du texte de page que l'agent avait lu, étiqueté comme contenu de page brut.
- La limite par session compte les appels d'outil `web_search`, pas les recherches qu'un appel exécute en interne, et un appel qui échoue compte quand même car la requête a été envoyée. Un appel ignoré n'est pas une erreur : il indique au modèle que le budget est épuisé et qu'il doit vous demander d'augmenter `tools.webSearch.maxPerSession` si davantage de recherches sont réellement nécessaires.

## Alternatives MCP

Si votre fournisseur ne peut pas alimenter l'outil intégré, la recherche web est disponible en connectant un serveur MCP externe — voir les services ci-dessous.

## ⚠️ Breaking Change historique : l'ancien `web_search` intégré supprimé

> **Versions concernées :** `V0.0.7+` jusqu'à la dernière version avec la recherche web intégrée multi-fournisseur d'origine.

L'ancien outil intégré `web_search` (Tavily/Google/GLM/DashScope multi-fournisseur) et sa configuration ont été **supprimés**. L'outil intégré documenté ci-dessus est une implémentation différente avec une configuration différente. Si vous utilisiez l'un des éléments suivants, migrez soit vers le nouvel outil intégré (DashScope), soit vers MCP :

| Supprimé                                                               | Que faire                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Bloc `webSearch` dans `settings.json`                                  | Configurez plutôt un serveur MCP dans `mcpServers` (voir ci-dessous) |
| `advanced.tavilyApiKey` dans `settings.json`                           | Utilisez le [serveur MCP Tavily](#tavily-websearch)               |
| Variable d'environnement `TAVILY_API_KEY`                              | Utilisez le [serveur MCP Tavily](#tavily-websearch)               |
| `DASHSCOPE_API_KEY` pour la recherche web                              | Utilisez l'[outil intégré `web_search`](#built-in-web_search)     |
| `GLM_API_KEY` pour la recherche web                                    | Utilisez le [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) |
| Drapeaux CLI `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | Configurez via `mcpServers` dans `settings.json`                  |

### Exemples de migration

**Avant (Tavily via l’outil intégré) :**

```json
{
  "webSearch": {
    "provider": [{ "type": "tavily", "apiKey": "tvly-xxx" }],
    "default": "tavily"
  }
}
```

**Après (Tavily via MCP) :**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-xxx"
    }
  }
}
```

---

**Avant (DashScope via l’outil intégré) :**

```json
{
  "webSearch": {
    "provider": [{ "type": "dashscope", "apiKey": "sk-xxx" }],
    "default": "dashscope"
  }
}
```

**Après (Alibaba Cloud Bailian WebSearch via MCP) :**

```json
{
  "mcpServers": {
    "WebSearch": {
      "httpUrl": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
      "headers": {
        "Authorization": "Bearer sk-xxx"
      }
    }
  }
}
```

---

## Services de recherche web MCP pris en charge

### Alibaba Cloud Bailian WebSearch

Le service officiel de recherche web MCP fourni par la plateforme Alibaba Cloud Bailian, propulsé par DashScope. Si vous avez une clé DashScope, préférez l'outil intégré `web_search` ci-dessus — il utilise un chemin de recherche plus puissant que ce service MCP.

- **MCP Marketplace :** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **Coût :** Payant (facturé via Alibaba Cloud DashScope)
- **Obtenir une clé API :** https://help.aliyun.com/zh/model-studio/get-api-key
- **Idéal pour :** requêtes en chinois, accès au contenu web chinois, intégration avec l’écosystème Alibaba Cloud

#### Configuration

**Méthode 1 : commande CLI**

```bash
qwen mcp add WebSearch \
  -t http \
  "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}"
```

**Méthode 2 : `settings.json`**

```json
{
  "mcpServers": {
    "WebSearch": {
      "httpUrl": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
      "headers": {
        "Authorization": "Bearer ${DASHSCOPE_API_KEY}"
      }
    }
  }
}
```

Remplacez `${DASHSCOPE_API_KEY}` par votre propre clé API, ou définissez-la comme variable d’environnement pour que Qwen Code la récupère automatiquement.

---

### Tavily WebSearch

Un serveur MCP prêt pour la production offrant des capacités de recherche web en temps réel, d’extraction, de cartographie et de crawl.

- **Dépôt :** https://github.com/tavily-ai/tavily-mcp
- **Coût :** Payant (un niveau gratuit est disponible)
- **Obtenir une clé API :** https://app.tavily.com/home
- **Idéal pour :** recherche web généraliste avec des réponses de haute qualité générées par IA

#### Outils disponibles

- `tavily_search` — Recherche web en temps réel
- `tavily_extract` — Extraction intelligente de données depuis des pages web
- `tavily_map` — Créer une carte structurée d’un site web
- `tavily_crawl` — Explorer systématiquement des sites web

#### Configuration

**Méthode 1 : commande CLI (MCP distant)**

```bash
qwen mcp add tavily \
  -t http \
  "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
```

**Méthode 2 : `settings.json` (MCP distant)**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}
```

Remplacez `${TAVILY_API_KEY}` par votre propre clé API, ou définissez-la comme variable d’environnement.

**Méthode 3 : `settings.json` (NPX local)**

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

### GLM WebSearch Prime (ZhipuAI)

Le service MCP de recherche web distant officiel fourni par ZhipuAI (智谱AI), conçu pour les utilisateurs du GLM Coding Plan. Fournit une recherche web en temps réel incluant actualités, cours boursiers, météo, etc.

- **Documentation :** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **Coût :** Inclus dans l’abonnement GLM Coding Plan (Lite : 100 appels/mois, Pro : 1 000/mois, Max : 4 000/mois)
- **Obtenir une clé API :** https://open.bigmodel.cn/apikey/platform
- **Idéal pour :** requêtes en chinois, récupération d’informations en temps réel

#### Outils disponibles

- `webSearchPrime` — Recherche web retournant le titre, l’URL, le résumé, le nom du site et le favicon de la page

#### Configuration

**Méthode 1 : commande CLI**

```bash
qwen mcp add web-search-prime \
  -t http \
  "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp" \
  -H "Authorization: Bearer ${GLM_API_KEY}"
```

**Méthode 2 : `settings.json`**

```json
{
  "mcpServers": {
    "web-search-prime": {
      "httpUrl": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
      "headers": {
        "Authorization": "Bearer ${GLM_API_KEY}"
      }
    }
  }
}
```

Remplacez `${GLM_API_KEY}` par votre propre clé API ZhipuAI, ou définissez-la comme variable d’environnement.

---

### Firecrawl

Le serveur MCP hébergé officiel de Firecrawl, fournissant la recherche web, le scraping de pages, le crawl et la cartographie de sites web, l'interaction avec le navigateur et l'analyse de fichiers. Les résultats de recherche peuvent inclure le contenu de chaque page au format Markdown, permettant au modèle de lire ses sources sans étape de récupération séparée. Le serveur hébergé fonctionne sans clé API pour la recherche, le scraping et l'analyse. Les requêtes de recherche, les URLs que vous demandez de lire et tous les fichiers analysés sont envoyés à Firecrawl.

- **Documentation :** https://docs.firecrawl.dev/mcp-server
- **Coût :** Aucune clé API nécessaire pour la recherche, le scraping et l'analyse (limite quotidienne par IP) ; plans payants pour des limites plus élevées
- **Obtenir une clé API :** https://www.firecrawl.dev/app/api-keys
- **Idéal pour :** La recherche web où le modèle doit également lire les pages trouvées, et pour tester la recherche web MCP sans clé API

#### Outils disponibles

- `firecrawl_search` — Recherche web, renvoyant optionnellement le contenu de la page de chaque résultat au format Markdown
- `firecrawl_scrape` — Obtenir une seule page au format Markdown propre
- `firecrawl_parse` — Convertir un fichier local (PDF, Word, tableur, etc.) au format Markdown

Avec une clé API, le serveur offre également des outils pour cartographier et crawler des sites web, interagir avec les pages (cliquer, taper, naviguer) et rechercher dans des sources pour développeurs comme les issues GitHub et la documentation.

#### Configuration

**Méthode 1 : commande CLI (MCP distant)**

```bash
qwen mcp add firecrawl \
  -t http \
  "https://mcp.firecrawl.dev/v2/mcp" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}"
```

Pour essayer sans clé, omettez la ligne `-H`. Vous obtenez `firecrawl_search`, `firecrawl_scrape` et `firecrawl_parse` dans la limite quotidienne par IP.

**Méthode 2 : `settings.json` (MCP distant)**

```json
{
  "mcpServers": {
    "firecrawl": {
      "httpUrl": "https://mcp.firecrawl.dev/v2/mcp",
      "headers": {
        "Authorization": "Bearer ${FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

Remplacez `${FIRECRAWL_API_KEY}` par votre véritable clé API, ou définissez-la comme variable d'environnement. Si la clé est vide, le serveur se connecte toujours mais n'offre que les trois outils sans clé.

**Méthode 3 : `settings.json` (NPX local)**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp@latest"],
      "env": {
        "FIRECRAWL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

### SerpApi

Le serveur MCP hébergé officiel de SerpApi, fournissant des résultats de recherche structurés en temps réel depuis Google, Baidu, Bing et d'autres moteurs de recherche via un seul outil. Les requêtes de recherche et leurs paramètres sont envoyés à SerpApi.

- **Documentation :** https://serpapi.com/integrations/mcp
- **Coût :** Payant (plan gratuit disponible)
- **Obtenir une clé API :** https://serpapi.com/manage-api-key
- **Idéal pour :** Des résultats structurés provenant d'un large choix de moteurs de recherche

#### Outils disponibles

- `search` — Recherche web, renvoyant optionnellement les résultats au format Markdown

#### Configuration

**Méthode 1 : commande CLI**

```bash
qwen mcp add serpapi \
  -t http \
  "https://mcp.serpapi.com/mcp" \
  -H "Authorization: Bearer ${SERPAPI_API_KEY}"
```

**Méthode 2 : `settings.json`**

```json
{
  "mcpServers": {
    "serpapi": {
      "httpUrl": "https://mcp.serpapi.com/mcp",
      "headers": {
        "Authorization": "Bearer ${SERPAPI_API_KEY}"
      }
    }
  }
}
```

Remplacez `${SERPAPI_API_KEY}` par votre véritable clé API, ou définissez-la comme variable d'environnement. La clé n'est nécessaire que pour les recherches. Sans clé API valide, le serveur se connecte toujours et liste ses outils, mais `search` retourne une erreur.

---

### looot

Un serveur MCP hébergé de looot offrant la recherche web, les résultats SERP Google, la recherche d'actualités et la lecture de pages web. Les requêtes de recherche et les URLs que vous demandez de lire sont envoyées à looot.

- **Documentation :** https://docs.looot.ai
- **Coût :** Payant (solde prépayé, pas de niveau gratuit)
- **Obtenir une clé API :** https://looot.ai
- **Idéal pour :** La recherche web, les résultats SERP Google et actualités, et la lecture d'une page en texte

#### Outils disponibles

- `web_search` — Recherche web
- `google_search_results` — Résultats SERP Google
- `news_search` — Recherche d'actualités
- `read_web_page` — Lire une seule page en texte

Le serveur expose également des recherches d'entreprise et d'e-mail.

#### Configuration

**Méthode 1 : commande CLI (MCP distant)**

```bash
qwen mcp add looot \
  -t http \
  "https://api.looot.ai/mcp" \
  -H "Authorization: Bearer ${LOOOT_API_KEY}"
```

**Méthode 2 : `settings.json` (MCP distant)**

```json
{
  "mcpServers": {
    "looot": {
      "httpUrl": "https://api.looot.ai/mcp",
      "headers": {
        "Authorization": "Bearer ${LOOOT_API_KEY}"
      }
    }
  }
}
```

Remplacez `${LOOOT_API_KEY}` par votre clé API réelle, ou définissez-la comme variable d'environnement.

---

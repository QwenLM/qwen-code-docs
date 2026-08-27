# Recherche Web

Qwen Code fournit la recherche web de deux manières :

1. **Outil intégré `web_search`** (opt-in) — basé sur la recherche côté serveur de l'API DashScope Responses. Fonctionne avec une clé API Bailian (DashScope) standard ; aucune configuration supplémentaire de fournisseur ou MCP.
2. **Intégrations MCP (Model Context Protocol)** — connectez n'importe quel service de recherche externe (Tavily, GLM, et autres). Utilisez cette option lorsque vous n'avez pas de clé DashScope.

## `web_search` intégré (opt-in)

L'outil intégré émet une requête de recherche autonome vers un petit modèle auxiliaire avec les outils `web_search` (et `web_extractor`) côté serveur de DashScope, et renvoie les résultats narratifs ainsi que les URL sources. Il ne s'active jamais implicitement — deux paramètres sont requis :

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6-plus",
        "envKey": "DASHSCOPE_API_KEY",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
      }
    ]
  },
  "tools": {
    "webSearch": {
      "enabled": true,
      "model": "qwen3.6-plus"
    }
  }
}
```

| Paramètre                      | Remplacement env         | Signification                                                                                                                                                        |
| ------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`      | Flag opt-in. Requis.                                                                                                                                                 |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`       | Sélecteur de modèle de recherche, résolu contre `modelProviders` comme `fastModel` (`modelId` ou `authType:modelId`). Requis — pas de valeur par défaut. Recommandé : `qwen3.6-plus`. |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR`   | Permet à l'agent de recherche d'ouvrir les pages de résultats pour des réponses mieux fondées (par défaut `true` ; facturé séparément par DashScope).                |

### Configuration par variables d'environnement uniquement (sans settings.json)

Pour les environnements où vous ne pouvez pas écrire de fichier de paramètres (conteneurs verrouillés, CI avec injection d'environnement uniquement), l'outil peut être configuré entièrement via des variables d'environnement — aucune entrée `modelProviders` nécessaire :

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.6-plus
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export DASHSCOPE_API_KEY=sk-...        # ou définissez WEB_SEARCH_API_KEY à la place
```

`WEB_SEARCH_BASE_URL` reflète le `baseUrl` d'une entrée `modelProviders` et doit être un point de terminaison compatible DashScope ; lorsqu'il est défini, il est prioritaire sur la résolution `modelProviders` et `WEB_SEARCH_MODEL` est utilisé comme id de modèle DashScope brut. La clé API est lue depuis `WEB_SEARCH_API_KEY` si défini, sinon depuis `DASHSCOPE_API_KEY`. Une mauvaise configuration apparaît toujours comme une notification au démarrage.

Notes :

- Le sélecteur doit se résoudre en une entrée `modelProviders` compatible DashScope portant une clé API directe via `envKey`. Votre modèle principal peut être n'importe quel fournisseur — seule la requête latérale de recherche a besoin d'une entrée DashScope. Qwen OAuth ne peut pas alimenter l'outil.
- Si activé mais mal configuré, l'outil reste désactivé et une notification au démarrage explique quelle condition a échoué.
- Les recherches facturent votre clé DashScope (`usage.x_tools` compte). L'outil demande une confirmation par défaut ; approuver avec « toujours autoriser » persiste une règle de permission `WebSearch` standard, comme les autres outils.
- Il n'y a pas de liste d'autorisation de modèles côté client ; un modèle que le point de terminaison Responses ne sert pas échoue bruyamment à la première utilisation.

## Alternatives MCP

Si vous n'avez pas de clé DashScope, la recherche web est disponible en connectant un serveur MCP externe — voir les services ci-dessous.

## ⚠️ Breaking Change : ancien `web_search` intégré supprimé

> **Versions concernées :** de `V0.0.7+` à la dernière version avec le support de la recherche web intégrée.

L'ancien outil intégré `web_search` (Tavily/Google/GLM/DashScope multi-fournisseur) et sa configuration ont été **supprimés**. Le nouvel outil intégré opt-in ci-dessus est une implémentation différente avec une configuration différente. Si vous utilisiez l'un des éléments suivants, migrez vers le nouvel outil intégré (DashScope) ou vers MCP :

| Supprimé                                                                | Action à mener                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Bloc `webSearch` dans `settings.json`                                   | Configurez plutôt un serveur MCP dans `mcpServers` (voir ci-dessous)  |
| `advanced.tavilyApiKey` dans `settings.json`                            | Utilisez le [serveur MCP Tavily](#tavily-websearch)                   |
| Variable d'environnement `TAVILY_API_KEY`                               | Utilisez le [serveur MCP Tavily](#tavily-websearch)                   |
| `DASHSCOPE_API_KEY` pour la recherche web                               | Utilisez l'[outil intégré `web_search`](#web_search-intégré-opt-in)   |
| `GLM_API_KEY` pour la recherche web                                     | Utilisez le [serveur GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) |
| Drapeaux CLI `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | Configurez via `mcpServers` dans `settings.json`                      |

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

Le service officiel de recherche web MCP distant fourni par ZhipuAI (智谱AI), conçu pour les utilisateurs de GLM Coding Plan. Fournit une recherche web en temps réel incluant actualités, cours de bourse, météo, etc.

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
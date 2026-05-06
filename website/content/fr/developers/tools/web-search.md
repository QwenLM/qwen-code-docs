# Recherche Web

Qwen Code prend en charge la recherche Web via des intégrations **MCP (Model Context Protocol)**. Plutôt qu'un outil de recherche intégré, la recherche Web est fournie en se connectant à des serveurs MCP externes, ce qui vous offre une flexibilité totale pour choisir le service de recherche le mieux adapté à vos besoins.

## ⚠️ Changement majeur : suppression de l'outil intégré `web_search`

> **Versions concernées :** `V0.0.7+` jusqu'à la dernière version prenant en charge la recherche Web intégrée.

L'outil intégré `web_search` et toute sa configuration associée ont été **supprimés**. Si vous utilisiez l'un des éléments suivants, vous devez migrer vers l'approche basée sur MCP décrite dans ce document :

| Élément supprimé                                                       | Action à effectuer                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Bloc `webSearch` dans `settings.json`                                  | Configurez plutôt un serveur MCP dans `mcpServers` (voir ci-dessous)                        |
| `advanced.tavilyApiKey` dans `settings.json`                           | Utilisez le [serveur MCP Tavily](#tavily-websearch)                                         |
| Variable d'environnement `TAVILY_API_KEY`                              | Utilisez le [serveur MCP Tavily](#tavily-websearch)                                         |
| `DASHSCOPE_API_KEY` pour la recherche Web                              | Utilisez le [MCP Alibaba Cloud Bailian WebSearch](#alibaba-cloud-bailian-websearch-recommended) |
| `GLM_API_KEY` pour la recherche Web                                    | Utilisez le [MCP GLM WebSearch Prime](#glm-websearch-prime-zhipuai)                         |
| Flags CLI `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | Configurez via `mcpServers` dans `settings.json`                                            |

### Exemples de migration

**Avant (Tavily via l'outil intégré) :**

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

**Avant (DashScope via l'outil intégré) :**

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

## Services de recherche Web MCP pris en charge

### Alibaba Cloud Bailian WebSearch (Recommandé)

Le service MCP officiel de recherche Web fourni par la plateforme Alibaba Cloud Bailian, propulsé par DashScope.

- **Marketplace MCP :** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **Coût :** Payant (facturé via Alibaba Cloud DashScope)
- **Obtenir une clé API :** https://help.aliyun.com/zh/model-studio/get-api-key
- **Idéal pour :** les requêtes en chinois, l'accès au contenu Web chinois, l'intégration avec l'écosystème Alibaba Cloud

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

Remplacez `${DASHSCOPE_API_KEY}` par votre clé API réelle, ou définissez-la comme variable d'environnement pour que Qwen Code la détecte automatiquement.

---

### Tavily WebSearch

Un serveur MCP prêt pour la production offrant des capacités de recherche Web en temps réel, d'extraction, de cartographie et de crawl.

- **Dépôt :** https://github.com/tavily-ai/tavily-mcp
- **Coût :** Payant (offre gratuite disponible)
- **Obtenir une clé API :** https://app.tavily.com/home
- **Idéal pour :** la recherche Web généraliste avec des réponses de haute qualité générées par IA

#### Outils disponibles

- `tavily_search` — Recherche Web en temps réel
- `tavily_extract` — Extraction intelligente de données depuis des pages Web
- `tavily_map` — Création d'une carte structurée d'un site Web
- `tavily_crawl` — Exploration systématique de sites Web

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

Remplacez `${TAVILY_API_KEY}` par votre clé API réelle, ou définissez-la comme variable d'environnement.

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

Le service Remote MCP officiel de recherche Web fourni par ZhipuAI (智谱AI), conçu pour les utilisateurs du GLM Coding Plan. Il propose une recherche Web en temps réel incluant les actualités, les cours boursiers, la météo, et plus encore.

- **Documentation :** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **Coût :** Inclus dans l'abonnement GLM Coding Plan (Lite : 100 appels/mois, Pro : 1 000/mois, Max : 4 000/mois)
- **Obtenir une clé API :** https://open.bigmodel.cn/apikey/platform
- **Idéal pour :** les requêtes en chinois, la récupération d'informations en temps réel

#### Outils disponibles

- `webSearchPrime` — Recherche Web renvoyant le titre de la page, l'URL, le résumé, le nom du site et le favicon

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

Remplacez `${GLM_API_KEY}` par votre clé API ZhipuAI réelle, ou définissez-la comme variable d'environnement.

---
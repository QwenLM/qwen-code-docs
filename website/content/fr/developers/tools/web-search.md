# Recherche Web

Qwen Code fournit la recherche web de deux manières :

1. **Outil intégré `web_search`** — basé sur la recherche côté serveur de l'API DashScope Responses. Activé par défaut au démarrage pour les configurations ModelStudio et OpenAI-compatible DashScope prises en charge ; aucune configuration supplémentaire de fournisseur ou MCP.
2. **Intégrations MCP (Model Context Protocol)** — connectez n'importe quel service de recherche externe (Tavily, GLM, et autres). Utilisez cette option lorsque votre fournisseur ne peut pas alimenter l'outil intégré.

## `web_search` intégré

L'outil intégré émet une requête de recherche autonome vers un petit modèle auxiliaire avec les outils `web_search` (et `web_extractor`) côté serveur de DashScope, et renvoie les résultats narratifs ainsi que les URL sources.

### Quand il s'active tout seul

Si vous n'avez rien configuré sous `tools.webSearch`, l'outil s'enregistre lorsque le modèle que vous utilisez peut alimenter la requête de recherche avec les mêmes identifiants :

| Mode de connexion                                                                                                          | Recherche intégrée                              |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Alibaba ModelStudio → **Clé API standard**                                                                                 | activée                                         |
| Alibaba ModelStudio → **Token Plan**                                                                                       | activée                                         |
| Alibaba ModelStudio → **Coding Plan**                                                                                      | désactivée — son point de terminaison n'est pas vérifié pour cette API |
| Entrée `modelProviders` compatible OpenAI ou fournisseur personnalisé sur un hôte DashScope Responses reconnu, avec une clé directe | activée                                         |
| Fournisseurs tiers (OpenRouter, DeepSeek, ModelScope, …), points de terminaison personnalisés sur d'autres hôtes, modèles locaux | désactivée                                      |

Les recherches sont facturées sur la même clé que votre modèle principal. La gestion des permissions suit le mode d'approbation actif et ses règles ; en mode d'approbation `default`, la première recherche demande une confirmation. Lorsque votre fournisseur ne peut pas alimenter l'outil, celui-ci n'apparaît simplement pas au démarrage — pas d'avertissement au démarrage.

Pour le désactiver :

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

ou `ENABLE_WEB_SEARCH=false`. Le mode bare et le mode safe le désactivent toujours.

### Configuration explicite

Pointez l'outil vers un ModelStudio Standard/Token Plan ou une autre entrée DashScope Responses vérifiée. Ceci est utile lorsque votre modèle principal tourne sur un autre fournisseur et que vous possédez également une clé DashScope prise en charge séparée. Les hôtes Coding Plan sont exclus de l'activation automatique car les outils de recherche Responses n'y sont pas vérifiés. Vous pouvez activer explicitement avec `tools.webSearch.model` ; si le point de terminaison ne les sert pas, la première recherche échoue bruyamment. Utilisez un fournisseur de recherche MCP si vous ne voulez pas dépendre de ce chemin non vérifié.

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

| Paramètre                        | Remplacement env           | Signification                                                                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`        | `ENABLE_WEB_SEARCH`        | Mettez `false` pour désactiver l'outil. L'activation implicite au démarrage nécessite de laisser `enabled`, `model` et le backend env-only non définis. Mettre `true` permet la dérivation automatique uniquement lorsque le backend env-only est également non défini ; sinon un `model` est requis. |
| `tools.webSearch.model`          | `WEB_SEARCH_MODEL`         | Sélecteur de modèle de recherche pour le chemin explicite (`modelId` ou `authType:modelId`). Avec `WEB_SEARCH_BASE_URL`, c'est l'id de modèle brut pour ce point de terminaison ; sinon il doit correspondre à une entrée `modelProviders` compatible DashScope déclarée. Le chemin automatique utilise `qwen3.6-plus`. |
| `tools.webSearch.webExtractor`   | `WEB_SEARCH_EXTRACTOR`     | Permet à l'agent de recherche d'ouvrir les pages de résultats pour des réponses mieux fondées (par défaut `true` ; facturé séparément par DashScope).                                                                                                                                  |

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
- Les fournisseurs pouvant activer l'outil sont décidés au démarrage. Une fois actif, le backend de recherche suit le modèle actuellement sélectionné lors de la prochaine recherche ; passer à un fournisseur non pris en charge fait échouer cette invocation, tandis que passer d'une session où l'outil était absent nécessite toujours un redémarrage pour l'enregistrer.
- La détection automatique d'hôte n'accepte intentionnellement que les hôtes régionaux DashScope connus, Token Plan MaaS et les hôtes internes Alibaba. Les passerelles génériques `*.alicloudapi.com` et `DASHSCOPE_PROXY_BASE_URL` sont exclus car ils ne sont pas connus pour transmettre les outils de recherche Responses.
- Si activé explicitement mais mal configuré, l'outil reste désactivé et une notification au démarrage explique quelle condition a échoué. L'activation automatique n'émet jamais de notification.
- Les recherches facturent votre clé DashScope (`usage.x_tools` compte). Le mode d'approbation auto (par défaut) permet au classificateur d'approuver les recherches sans invite ; en mode d'approbation `default`, l'outil demande, et approuver avec « toujours autoriser » persiste une règle de permission `WebSearch` standard, comme les autres outils.
- Il n'y a pas de liste d'autorisation de modèles côté client ; un modèle que le point de terminaison Responses ne sert pas échoue bruyamment à la première utilisation.

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
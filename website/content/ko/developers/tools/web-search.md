
# 웹 검색

Qwen Code는 두 가지 방식으로 웹 검색을 제공합니다:

1. **내장 `web_search` 도구** — DashScope Responses API 서버 측 검색으로 지원됩니다. 지원되는 ModelStudio 및 OpenAI 호환 DashScope 구성에서 시작 시 기본적으로 켜져 있습니다; 추가 제공자 또는 MCP 설정이 필요 없습니다.
2. **MCP(모델 컨텍스트 프로토콜) 통합** — 외부 검색 서비스(Tavily, GLM 등)에 연결합니다. 제공자가 내장 도구를 지원할 수 없을 때 사용하세요.

## 내장 `web_search`

내장 도구는 DashScope의 서버 측 `web_search`(및 `web_extractor`) 도구를 사용하여 작은 보조 모델에 자체 포함 검색 요청을 실행하고 서술된 결과와 소스 URL을 반환합니다.

### 자동으로 켜지는 경우

`tools.webSearch` 아래에 아무것도 구성하지 않으면, 실행 중인 모델이 동일한 자격 증명으로 검색 요청을 지원할 수 있을 때 도구가 등록됩니다:

| 로그인 방법                                                                                                                 | 내장 검색                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Alibaba ModelStudio → **표준 API 키**                                                                                        | 켜짐                                              |
| Alibaba ModelStudio → **토큰 플랜**                                                                                          | 켜짐                                              |
| Alibaba ModelStudio → **코딩 플랜**                                                                                          | 꺼짐 — 이 API에 대해 엔드포인트가 검증되지 않음   |
| 인식된 DashScope Responses 호스트에 대한 OpenAI 호환 `modelProviders` 또는 Custom Provider 항목 (직접 키 포함)              | 켜짐                                              |
| 서드파티 제공자(OpenRouter, DeepSeek, ModelScope, …), 다른 호스트의 커스텀 엔드포인트, 로컬 모델                            | 꺼짐                                              |

검색은 메인 모델과 동일한 키로 청구됩니다. 권한 처리는 활성 승인 모드와 규칙을 따릅니다; `default` 승인 모드에서는 첫 번째 검색 시 확인을 요청합니다. 제공자가 도구를 지원할 수 없으면 시작 시 단순히 표시되지 않습니다 — 시작 경고 없음.

끄려면:

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

또는 `ENABLE_WEB_SEARCH=false`. Bare 모드와 safe 모드는 항상 비활성화합니다.

### 명시적으로 구성하기

도구를 ModelStudio 표준/토큰 플랜 또는 다른 검증된 DashScope Responses 항목으로 지정합니다. 이는 메인 모델이 다른 제공자에서 실행 중이고 별도의 지원되는 DashScope 키를 보유하고 있을 때 유용합니다. 코딩 플랜 호스트는 Responses 검색 도구가 검증되지 않아 자동 활성화에서 제외됩니다. `tools.webSearch.model`로 명시적으로 옵트인할 수 있습니다; 엔드포인트가 이를 제공하지 않으면 첫 번째 검색에서 오류가 발생합니다. 검증되지 않은 경로에 의존하고 싶지 않다면 MCP 검색 제공자를 사용하세요.

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

| 설정                           | 환경 변수 오버라이드    | 의미                                                                                                                                                                                                                                                                       |
| ------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`     | 도구를 끄려면 `false`로 설정. 암묵적 시작 활성화는 `enabled`, `model`, 환경 변수 전용 백엔드가 설정되지 않은 상태여야 함. `true`로 설정하면 환경 변수 전용 백엔드가 설정되지 않은 경우에만 자동 유도가 허용되며, 그렇지 않으면 `model`이 필요함.                    |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`     | 명시적 경로를 위한 검색 모델 선택기(`modelId` 또는 `authType:modelId`). `WEB_SEARCH_BASE_URL`과 함께 해당 엔드포인트의 일반 모델 id; 그렇지 않으면 선언된 DashScope 호환 `modelProviders` 항목과 일치해야 함. 자동 경로는 `qwen3.6-plus`를 사용.                            |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR` | 검색 에이전트가 더 나은 근거 기반 답변을 위해 결과 페이지를 열 수 있도록 허용(기본값 `true`; DashScope에서 별도로 청구됨).                                                                                                                                                          |

### 환경 변수 전용 설정(settings.json 없음)

설정 파일을 작성할 수 없는 환경(잠긴 컨테이너, 환경 변수 주입만 있는 CI)에서 이 도구는 전적으로 환경 변수를 통해 설정할 수 있습니다 — `modelProviders` 항목이 필요하지 않습니다:

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.6-plus
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export DASHSCOPE_API_KEY=sk-...        # 또는 WEB_SEARCH_API_KEY를 대신 설정
```

`WEB_SEARCH_BASE_URL`는 `modelProviders` 항목의 `baseUrl`을 미러링하며 DashScope 호환 엔드포인트여야 합니다; 설정되면 `modelProviders` 해석보다 우선하며 `WEB_SEARCH_MODEL`은 일반 DashScope 모델 id로 사용됩니다. API 키는 `WEB_SEARCH_API_KEY`가 설정되어 있으면 해당 키를 읽고, 그렇지 않으면 `DASHSCOPE_API_KEY`에서 읽습니다. 잘못된 설정은 여전히 시작 시 알림으로 표시됩니다.

참고:

- 선택기는 `envKey`를 통해 직접 API 키를 운반하는 DashScope 호환 `modelProviders` 항목으로 해석되어야 합니다. 메인 모델은 어떤 제공자든 사용할 수 있습니다 — 검색 측 요청만 DashScope 항목이 필요합니다. Qwen OAuth는 도구를 지원할 수 없습니다.
- 어떤 제공자가 도구를 활성화할 수 있는지는 시작 시 결정됩니다. 활성화된 후, 검색 백엔드는 다음 검색에서 현재 선택된 모델을 따릅니다; 지원되지 않는 제공자로 전환하면 해당 호출이 실패하고, 도구가 없었던 세션에서 전환하면 여전히 재시작하여 등록해야 합니다.
- 자동 호스트 감지는 알려진 DashScope 리저널, 토큰 플랜 MaaS 및 내부 Alibaba 호스트만 의도적으로 허용합니다. 일반 `*.alicloudapi.com` 게이트웨이와 `DASHSCOPE_PROXY_BASE_URL`은 Responses 검색 도구를 포워딩하는 것으로 알려지지 않아 제외됩니다.
- 명시적으로 활성화되었지만 잘못 구성된 경우, 도구는 꺼진 상태로 유지되며 시작 시 알림이 어떤 조건이 실패했는지 설명합니다. 자동 활성화는 알림을 발생시키지 않습니다.
- 검색은 DashScope 키로 청구됩니다(`usage.x_tools`가 카운트). 자동 승인 모드(기본값)는 분류기가 확인 없이 검색을 승인하도록 합니다; `default` 승인 모드에서는 도구가 질문하며, "항상 허용"으로 승인하면 다른 도구와 마찬가지로 표준 `WebSearch` 권한 규칙이 지속됩니다.
- 클라이언트 측 모델 허용 목록이 없습니다; Responses 엔드포인트가 제공하지 않는 모델은 첫 사용 시 오류가 발생합니다.

## MCP 대안

제공자가 내장 도구를 지원할 수 없으면, 외부 MCP 서버를 연결하여 웹 검색을 사용할 수 있습니다 — 아래 서비스를 참조하세요.

## ⚠️ 기록상 중단 변경 사항: 원래 내장 `web_search` 제거

> **영향 받는 버전:** `V0.0.7+`부터 원래 다중 제공자 내장 웹 검색이 포함된 마지막 릴리스까지.

원래 내장 `web_search` 도구(Tavily/Google/GLM/DashScope 다중 제공자) 및 해당 구성이 **제거되었습니다**. 위에 문서화된 내장 도구는 다른 구현과 다른 구성을 가집니다. 다음 중 하나를 사용하고 있었다면, 새로운 내장 도구(DashScope) 또는 MCP로 마이그레이션하세요:

| 제거된 항목                                                          | 대응 방법                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `settings.json`의 `webSearch` 블록                                   | 대신 `mcpServers`에 MCP 서버 구성(아래 참조)                    |
| `settings.json`의 `advanced.tavilyApiKey`                            | [Tavily MCP 서버](#tavily-websearch) 사용                       |
| `TAVILY_API_KEY` 환경 변수                                           | [Tavily MCP 서버](#tavily-websearch) 사용                       |
| 웹 검색용 `DASHSCOPE_API_KEY`                                        | [내장 `web_search` 도구](#built-in-web_search-opt-in) 사용      |
| 웹 검색용 `GLM_API_KEY`                                              | [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) 사용    |
| `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` CLI 플래그 | `settings.json`의 `mcpServers`를 통해 구성                     |

### 마이그레이션 예시

**이전 (내장 도구를 통한 Tavily):**

```json
{
  "webSearch": {
    "provider": [{ "type": "tavily", "apiKey": "tvly-xxx" }],
    "default": "tavily"
  }
}
```

**이후 (MCP를 통한 Tavily):**

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

**이전 (내장 도구를 통한 DashScope):**

```json
{
  "webSearch": {
    "provider": [{ "type": "dashscope", "apiKey": "sk-xxx" }],
    "default": "dashscope"
  }
}
```

**이후 (MCP를 통한 Alibaba Cloud Bailian WebSearch):**

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

## 지원되는 MCP 웹 검색 서비스

### Alibaba Cloud Bailian WebSearch

Alibaba Cloud Bailian 플랫폼에서 제공하는 공식 웹 검색 MCP 서비스로, DashScope로 구동됩니다. DashScope 키가 있으면 위의 내장 `web_search` 도구를 선호하세요 — 이 MCP 서비스보다 더 강력한 검색 경로를 사용합니다.

- **MCP 마켓플레이스:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **비용:** 유료(Alibaba Cloud DashScope를 통해 청구)
- **API 키 발급:** https://help.aliyun.com/zh/model-studio/get-api-key
- **추천 용도:** 중국어 쿼리, 중국 웹 콘텐츠 접근, Alibaba Cloud 생태계와의 통합

#### 설정

**방법 1: CLI 명령**

```bash
qwen mcp add WebSearch \
  -t http \
  "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}"
```

**방법 2: `settings.json`**

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

`${DASHSCOPE_API_KEY}`를 실제 API 키로 바꾸거나, 환경 변수로 설정하여 Qwen Code가 자동으로 가져가게 하세요.

---

### Tavily WebSearch

실시간 웹 검색, 추출, 맵핑 및 크롤링 기능을 제공하는 프로덕션 준비 MCP 서버입니다.

- **리포지토리:** https://github.com/tavily-ai/tavily-mcp
- **비용:** 유료(무료 티어 이용 가능)
- **API 키 발급:** https://app.tavily.com/home
- **추천 용도:** 고품질 AI 생성 답변을 제공하는 범용 웹 검색

#### 사용 가능한 도구

- `tavily_search` — 실시간 웹 검색
- `tavily_extract` — 웹 페이지에서 지능적 데이터 추출
- `tavily_map` — 웹사이트의 구조화된 맵 생성
- `tavily_crawl` — 웹사이트 체계적 탐색

#### 설정

**방법 1: CLI 명령 (Remote MCP)**

```bash
qwen mcp add tavily \
  -t http \
  "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
```

**방법 2: `settings.json` (Remote MCP)**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}
```

`${TAVILY_API_KEY}`를 실제 API 키로 바꾸거나 환경 변수로 설정하세요.

**방법 3: `settings.json` (Local NPX)**

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

ZhipuAI(智谱AI)에서 제공하는 공식 웹 검색 Remote MCP 서비스로, GLM Coding Plan 사용자를 위해 설계되었습니다. 뉴스, 주가, 날씨 등을 포함한 실시간 웹 검색을 제공합니다.

- **문서:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **비용:** GLM Coding Plan 구독에 포함(Lite: 월 100회, Pro: 월 1,000회, Max: 월 4,000회)
- **API 키 발급:** https://open.bigmodel.cn/apikey/platform
- **추천 용도:** 중국어 쿼리, 실시간 정보 검색

#### 사용 가능한 도구

- `webSearchPrime` — 페이지 제목, URL, 요약, 사이트 이름 및 파비콘을 반환하는 웹 검색

#### 설정

**방법 1: CLI 명령**

```bash
qwen mcp add web-search-prime \
  -t http \
  "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp" \
  -H "Authorization: Bearer ${GLM_API_KEY}"
```

**방법 2: `settings.json`**

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

`${GLM_API_KEY}`를 실제 ZhipuAI API 키로 바꾸거나 환경 변수로 설정하세요.

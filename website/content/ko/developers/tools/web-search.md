# 웹 검색

Qwen Code는 두 가지 방법으로 웹 검색을 제공합니다:

1. **내장 `web_search` 도구** — DashScope Responses API의 서버 측 검색 또는 Qwen 구독 세션의 경우 Qwen MCP 검색 서비스를 기반으로 합니다. Plus/Pro 구독 로그인 후 활성화되며, 지원되는 ModelStudio 및 OpenAI 호환 DashScope 구성에서는 시작 시 기본적으로 켜져 있습니다. 추가 제공자나 MCP 설정이 필요하지 않습니다.
2. **MCP(모델 컨텍스트 프로토콜) 통합** — 외부 검색 서비스(Tavily, GLM 등)에 연결합니다. 제공자가 내장 도구를 지원할 수 없을 때 사용하세요.

## 내장 `web_search` [#built-in-web_search]

DashScope의 경우 내장 도구는 서버 측 `web_search`(및 `web_extractor`) 도구가 포함된 소형 보조 모델로 자체 완결된 검색 요청을 발행하고, 서술된 결과와 출처 URL을 반환합니다. [구독이 포함된 Qwen 계정](../../users/configuration/auth.md)을 사용하는 경우 Qwen MCP 검색 서비스와 현재 로그인 자격 증명을 사용합니다. 별도의 검색 API 키, 보조 모델 또는 `mcpServers` 구성이 필요하지 않습니다. `webExtractor`은 DashScope 검색에만 적용됩니다.

### 자동으로 켜지는 경우

`tools.webSearch` 아래에 아무것도 구성하지 않으면, 실행 중인 모델이 동일한 자격 증명으로 검색 요청을 지원할 수 있을 때 도구가 등록됩니다:

| 로그인 방법                                                                                                                 | 내장 검색                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [구독이 포함된 Qwen 계정](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) — **Plus 또는 Pro**                             | 켜짐                                              |
| Alibaba ModelStudio → **표준 API 키**                                                                                        | 켜짐                                              |
| Alibaba ModelStudio → **토큰 플랜**                                                                                          | 켜짐                                              |
| Alibaba ModelStudio → **코딩 플랜**                                                                                          | 꺼짐 — 이 API에 대해 엔드포인트가 검증되지 않음   |
| QwenCloud → **표준 API 키**                                                                                           | 켜짐                                              |
| QwenCloud → **토큰 플랜**                                                                                                 | 켜짐                                              |
| 인식된 DashScope Responses 호스트에 대한 OpenAI 호환 `modelProviders` 또는 Custom Provider 항목 (직접 키 포함)              | 켜짐                                              |
| 서드파티 제공자(OpenRouter, DeepSeek, ModelScope, …), 다른 호스트의 커스텀 엔드포인트, 로컬 모델                            | 꺼짐                                              |

DashScope 검색은 메인 모델과 동일한 키로 청구되며, 구독 검색은 Qwen 로그인 자격 증명을 재사용합니다. 권한 처리는 활성 승인 모드 및 규칙을 따르며, `default` 승인 모드에서는 첫 번째 검색 시 확인을 요청합니다. 제공자가 도구를 지원하지 못하는 경우, 시작 시 표시되지 않으며 시작 경고도 없습니다.

끄려면:

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

또는 `ENABLE_WEB_SEARCH=false`. Bare 모드와 safe 모드는 항상 비활성화합니다.

### 명시적으로 구성하기

이 섹션에서는 DashScope 검색을 구성합니다. 구독 검색은 멤버십 자격 증명을 재사용하므로 추가 설정이 필요하지 않습니다. 명시적인 검색 설정은 자동 구독 검색보다 우선합니다.

도구를 ModelStudio 표준/토큰 플랜 또는 다른 검증된 DashScope Responses 항목으로 지정합니다. 이는 메인 모델이 다른 제공자에서 실행 중이고 별도의 지원되는 DashScope 키를 보유하고 있을 때 유용합니다. 코딩 플랜 호스트는 Responses 검색 도구가 검증되지 않아 자동 활성화에서 제외됩니다. `tools.webSearch.model`로 명시적으로 옵트인할 수 있습니다; 엔드포인트가 이를 제공하지 않으면 첫 번째 검색에서 오류가 발생합니다. 검증되지 않은 경로에 의존하고 싶지 않다면 MCP 검색 제공자를 사용하세요.

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

| 설정                           | 환경 변수 오버라이드    | 의미                                                                                                                                                                                                                                                                       |
| ------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`     | 도구를 끄려면 `false`로 설정. 암묵적 시작 활성화는 `enabled`, `model`, 환경 변수 전용 백엔드가 설정되지 않은 상태여야 함. `true`로 설정하면 환경 변수 전용 백엔드가 설정되지 않은 경우에만 자동 유도가 허용되며, 그렇지 않으면 `model`이 필요함.                    |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`     | 명시적 경로를 위한 검색 모델 선택기(`modelId` 또는 `authType:modelId`). `WEB_SEARCH_BASE_URL`과 함께 해당 엔드포인트의 일반 모델 id; 그렇지 않으면 선언된 DashScope 호환 `modelProviders` 항목과 일치해야 함. 자동 경로는 `qwen3.8-flash`를 사용.                            |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR` | 검색 에이전트가 더 나은 근거 기반 답변을 위해 결과 페이지를 열 수 있도록 허용(기본값 `true`; DashScope에서 별도로 청구됨).                                                                                                                                                          |
| `tools.webSearch.timeoutMs`     | `WEB_SEARCH_TIMEOUT_MS`      | 한 번의 검색에 대한 총 시간 예산(밀리초 단위, 기본값 `120000`, 최대 `600000`; 다른 값은 기본값으로 폴백). 시간이 초과된 검색은 최소 한 번의 검색 호출이 완료된 경우 도착한 내용을 부분 결과로 반환합니다; 첫 번째 검색 호출이 완료되기 전에 예산이 만료되면, 실행된 검색 없는 서술은 감사 가능한 증거가 아니므로 도구 대신 타임아웃 오류를 보고합니다. 이 예산 이하의 도구별 실행 캡(`QWEN_CODE_TOOL_EXECUTION_TIMEOUT_MS`)이 먼저 발생하여 부분 결과를 폐기합니다; `timeoutMs`보다 크게 유지하세요. |
| `tools.webSearch.allowedHosts`  | `WEB_SEARCH_ALLOWED_HOSTS`   | 명시적으로 구성한 검색 백엔드에 대해 신뢰하는 추가 호스트 접미사 목록 — 정확한 호스트 또는 나열된 접미사의 하위 도메인(any subdomain) (환경 변수에서 쉼표로 구분). 기본값은 비어 있어 설정되지 않는 한 동작이 변경되지 않습니다. `WEB_SEARCH_BASE_URL` 백엔드와 `modelProviders` 경로에서만 이를 참조하며, 자동 파생 과정에서는 절대 참조하지 않으므로 사용자 정의 호스트는 자신의 구성에서 지정된 경우에만 사용됩니다. 구성된 호스트에는 API 키가 전달됩니다. 항목은 공백이 제거되고 소문자로 변환되며, 점이 없는 항목은 무시됩니다.                                                 |
| `tools.webSearch.maxPerSession` | `WEB_SEARCH_MAX_PER_SESSION` | 한 세션에서의 최대 `web_search` 호출 수(기본값 `200`, 최대 `10000`; 다른 값은 기본값으로 폴백). 카운트는 서브에이전트와 공유되며 세션이 변경될 때 리셋됩니다(`/clear`, `/resume`, 분기). 한도에 도달하면 이후 검색은 건너뛰어지고 모델이 수집한 것으로 계속하도록 안내됩니다.                                                                                                                                                                                                                                                  |

### 환경 변수 전용 설정(settings.json 없음)

설정 파일을 작성할 수 없는 환경(잠긴 컨테이너, 환경 변수 주입만 가능한 CI)에서는 도구를 전적으로 환경 변수를 통해 구성할 수 있습니다 — `modelProviders` 항목이 필요하지 않습니다:

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.8-flash
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export WEB_SEARCH_ALLOWED_HOSTS=llm-gw.example.com   # only for a gateway host
export DASHSCOPE_API_KEY=sk-...        # or set WEB_SEARCH_API_KEY instead
```

`WEB_SEARCH_BASE_URL`은 `modelProviders` 항목의 `baseUrl`을 반영하며 DashScope 호환 엔드포인트여야 합니다. 설정되면 `modelProviders` 해석보다 우선시되며 `WEB_SEARCH_MODEL`는 순수한 DashScope 모델 ID로 사용됩니다. API 키는 `WEB_SEARCH_API_KEY`가 설정된 경우 해당 값에서 읽으며, 그렇지 않으면 `DASHSCOPE_API_KEY`에서 읽습니다. 엔드포인트가 자체 도메인의 게이트웨이인 경우 해당 호스트를 `WEB_SEARCH_ALLOWED_HOSTS`(또는 `tools.webSearch.allowedHosts`)에 나열해야 합니다 — 그렇지 않으면 내장 목록만이 검사가 허용하는 유일한 대상입니다. 잘못된 구성은 여전히 시작 시 알림으로 표시됩니다.

참고 사항:

- 명시적 DashScope 검색의 경우, 선택기가 `envKey`을 통해 직접 API 키를 포함하는 DashScope 호환 `modelProviders` 항목으로 해석되어야 합니다. 메인 모델은 어떤 제공자든 사용할 수 있습니다. 레거시 무료 Qwen OAuth 제공자는 이 경로를 지원하지 못하며, Qwen 구독 검색은 위에서 설명한 별도 MCP 서비스를 사용합니다.
- 검색 등록은 인증 변경 성공 후 다시 평가됩니다. Qwen 구독 로그인은 재시작 없이 현재 세션에서 검색을 활성화합니다. 명시적 비활성화, 안전(bare/safe) 모드 및 도구 권한 규칙은 여전히 적용됩니다.
- 자동 호스트 감지는 의도적으로 알려진 DashScope 지역 호스트, Model Studio 및 QwenCloud MaaS 호스트(해당 `token-plan.` 구독 하위 도메인 포함)와 내부 Alibaba 호스트만 허용합니다. 일반적인 `*.alicloudapi.com` 게이트웨이, `DASHSCOPE_PROXY_BASE_URL` 및 `allowedHosts`에 추가한 호스트는 자동 경로에서 제외됩니다. 이 경로는 사용자의 개입 없이 실행되므로, 아무도 선언하지 않은 호스트에 기본 제공업체의 키를 전달할 수 있기 때문입니다. 사용자가 선언한 게이트웨이의 경우 `tools.webSearch.allowedHosts`에 나열하고 `WEB_SEARCH_BASE_URL`(또는 `modelProviders` 항목)을 해당 게이트웨이로 지정하십시오.
- 명시적으로 활성화되었지만 잘못 구성된 경우, 도구는 꺼진 상태로 유지되며 시작 시 알림이 어떤 조건이 실패했는지 설명합니다. 자동 활성화는 알림을 발생시키지 않습니다.
- DashScope 검색은 DashScope 키에 청구됩니다(`usage.x_tools` 포함). 자동 승인 모드(기본값)에서는 분류기가 프롬프트 없이 검색을 승인합니다. `default` 승인 모드에서는 도구가 확인을 요청하며, "항상 허용"으로 승인하면 다른 도구와 마찬가지로 표준 `WebSearch` 권한 규칙이 영구 저장됩니다.
- 클라이언트 측 모델 허용 목록이 없습니다; Responses 엔드포인트가 제공하지 않는 모델은 첫 사용 시 오류가 발생합니다.
- 시간 예산을 초과한 검색은 최소 한 번의 검색 호출이 완료된 경우 도착한 내용을 부분 결과로 반환합니다; 첫 번째 검색 호출이 완료되기 전에 예산이 만료되면, 실행된 검색 없는 서술은 감사 가능한 증거가 아니므로 도구 대신 타임아웃 오류를 보고합니다. 검색 호출은 완료되었지만 서술된 답변이 도착하지 않은 경우, 결과는 에이전트가 읽은 페이지 텍스트의 최대 6,000자까지 포함하며 원시 페이지 콘텐츠로 레이블됩니다.
- 세션당 캡은 한 번의 호출이 내부에서 실행하는 검색이 아닌 `web_search` 도구 호출을 카운트하며, 요청이 전송되었기 때문에 실패한 호출도 카운트됩니다. 건너뛴 호출은 오류가 아닙니다: 모델에게 예산이 소진되었음을 알리고, 더 많은 검색이 실제로 필요한 경우 `tools.webSearch.maxPerSession`을 올리도록 요청합니다.

## MCP 대안

제공자가 내장 도구를 지원할 수 없으면, 외부 MCP 서버를 연결하여 웹 검색을 사용할 수 있습니다 — 아래 서비스를 참조하세요.

## ⚠️ 기록상 중단 변경 사항: 원래 내장 `web_search` 제거

> **영향 받는 버전:** `V0.0.7+`부터 원래 다중 제공자 내장 웹 검색이 포함된 마지막 릴리스까지.

원래 내장 `web_search` 도구(Tavily/Google/GLM/DashScope 다중 제공자) 및 해당 구성이 **제거되었습니다**. 위에 문서화된 내장 도구는 다른 구현과 다른 구성을 가집니다. 다음 중 하나를 사용하고 있었다면, 새로운 내장 도구(DashScope) 또는 MCP로 마이그레이션하세요:

| 제거된 항목                                                          | 대응 방법                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `settings.json`의 `webSearch` 블록                                   | 대신 `mcpServers`에서 MCP 서버 구성(아래 참조)     |
| `settings.json`의 `advanced.tavilyApiKey`                             | [Tavily MCP 서버](#tavily-websearch) 사용                  |
| `TAVILY_API_KEY` 환경 변수                                           | [Tavily MCP 서버](#tavily-websearch) 사용                       |
| 웹 검색용 `DASHSCOPE_API_KEY`                                     | [내장 `web_search` 도구](#built-in-web_search) 사용      |
| 웹 검색용 `GLM_API_KEY`                                              | [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) 사용    |
| `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` CLI 플래그 | `settings.json`의 `mcpServers`을 통해 구성                   |

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

GLM Coding Plan 사용자를 위해 설계된 ZhipuAI(智谱AI)가 제공하는 공식 웹 검색 원격 MCP 서비스입니다. 뉴스, 주가, 날씨 등을 포함한 실시간 웹 검색을 제공합니다.

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

---

### Firecrawl

웹 검색, 페이지 스크레이핑, 웹사이트 크롤링 및 매핑, 브라우저 상호작용, 파일 파싱을 제공하는 Firecrawl의 공식 호스팅 MCP 서버입니다. 검색 결과에는 각 페이지의 콘텐츠가 Markdown으로 포함될 수 있으므로 모델이 별도의 가져오기 단계 없이 소스를 읽을 수 있습니다. 호스팅 서버는 API 키 없이 검색, 스크레이핑, 파싱이 가능합니다. 검색 쿼리, 읽으려는 URL, 파싱하는 모든 파일은 Firecrawl로 전송됩니다.

- **문서:** https://docs.firecrawl.dev/mcp-server
- **비용:** 검색, 스크레이핑, 파싱에 API 키 불필요(IP별 일일 제한 있음); 더 높은 한도를 위한 유료 플랜
- **API 키 발급:** https://www.firecrawl.dev/app/api-keys
- **적합한 용도:** 모델이 찾은 페이지도 읽어야 하는 웹 검색 및 API 키 없이 MCP 웹 검색 시도

#### 사용 가능한 도구

- `firecrawl_search` — 웹 검색, 선택적으로 각 결과의 페이지 콘텐츠를 Markdown으로 반환
- `firecrawl_scrape` — 단일 페이지를 깔끔한 Markdown으로 가져오기
- `firecrawl_parse` — 로컬 파일(PDF, Word, 스프레드시트 등)을 Markdown으로 변환

API 키가 있으면 서버는 웹사이트 매핑 및 크롤링, 페이지 상호작용(클릭, 입력, 이동), GitHub 이슈나 문서와 같은 개발자 소스 검색을 위한 도구도 제공합니다.

#### 설정

**방법 1: CLI 명령 (Remote MCP)**

```bash
qwen mcp add firecrawl \
  -t http \
  "https://mcp.firecrawl.dev/v2/mcp" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}"
```

키 없이 사용하려면 `-H` 줄을 생략하십시오. IP별 일일 제한 내에서 `firecrawl_search`, `firecrawl_scrape`, `firecrawl_parse`을 사용할 수 있습니다.

**방법 2: `settings.json` (Remote MCP)**

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

`${FIRECRAWL_API_KEY}`을 실제 API 키로 바꾸거나 환경 변수로 설정하십시오. 키가 비어 있으면 서버는 연결되지만 세 가지 키 불필요 도구만 제공합니다.

**방법 3: `settings.json` (Local NPX)**

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

단일 도구를 통해 Google, Baidu, Bing 등 다양한 검색 엔진에서 실시간 구조화된 검색 결과를 제공하는 SerpApi의 공식 호스팅 MCP 서버입니다. 검색 쿼리와 해당 파라미터는 SerpApi로 전송됩니다.

- **문서:** https://serpapi.com/integrations/mcp
- **비용:** 유료(무료 플랜 이용 가능)
- **API 키 발급:** https://serpapi.com/manage-api-key
- **적합한 용도:** 다양한 검색 엔진 선택지에서의 구조화된 결과

#### 사용 가능한 도구

- `search` — 웹 검색, 선택적으로 결과를 Markdown으로 반환

#### 설정

**방법 1: CLI 명령**

```bash
qwen mcp add serpapi \
  -t http \
  "https://mcp.serpapi.com/mcp" \
  -H "Authorization: Bearer ${SERPAPI_API_KEY}"
```

**방법 2: `settings.json`**

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

`${SERPAPI_API_KEY}`을 실제 API 키로 바꾸거나 환경 변수로 설정하십시오. 키는 검색에만 필요합니다. 유효한 API 키가 없으면 서버는 연결되고 도구를 나열하지만 `search`은 오류를 반환합니다.

---

### looot

웹 검색, Google SERP 결과, 뉴스 검색, 웹 페이지 읽기를 제공하는 looot의 호스팅 MCP 서버입니다. 검색 쿼리와 읽으려는 URL은 looot으로 전송됩니다.

- **문서:** https://docs.looot.ai
- **비용:** 유료(선불 잔액, 무료 티어 없음)
- **API 키 발급:** https://looot.ai
- **적합한 용도:** 웹 검색, Google SERP 및 뉴스 결과, 페이지 텍스트 읽기

#### 사용 가능한 도구

- `web_search` — 웹 검색
- `google_search_results` — Google SERP 결과
- `news_search` — 뉴스 검색
- `read_web_page` — 단일 페이지를 텍스트로 읽기

서버는 회사 및 이메일 조회 기능도 제공합니다.

#### 설정

**방법 1: CLI 명령 (Remote MCP)**

```bash
qwen mcp add looot \
  -t http \
  "https://api.looot.ai/mcp" \
  -H "Authorization: Bearer ${LOOOT_API_KEY}"
```

**방법 2: `settings.json` (Remote MCP)**

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

`${LOOOT_API_KEY}`을 실제 API 키로 교체하거나 환경 변수로 설정하세요.

---

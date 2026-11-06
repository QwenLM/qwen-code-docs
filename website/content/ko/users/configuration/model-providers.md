# 모델 제공자

Qwen Code에서는 `settings.json`의 `modelProviders` 설정을 통해 여러 모델 제공자를 구성할 수 있습니다. 이를 통해 `/model` 명령어를 사용하여 다양한 AI 모델과 제공자 간에 전환할 수 있습니다.

## 개요

`modelProviders`를 사용하여 `/model` 선택기에서 전환할 수 있는 제공자 ID별 모델을 선언합니다. 각 키는 제공자 ID이며, 해당 값은 **모델 정의 배열**(`ModelConfig[]`)입니다. 내장 제공자의 경우 키는 유효한 인증 유형(`openai`, `anthropic`, `gemini`, `vertex-ai`)이어야 합니다. 사용자 지정 제공자 ID(예: `idealab`)는 최상위 [`providerProtocol`](#custom-provider-ids-providerprotocol) 설정을 통해 프로토콜로 매핑하는 한 허용됩니다. 각 모델 항목에는 `id`이 필수이며, `envKey`은 **선택 사항이지만 권장**됩니다(생략 시 인증 유형의 기본 환경 변수 키로 대체되며, 예를 들어 `openai`의 경우 `OPENAI_API_KEY`). 선택적인 `name`, `description`, `baseUrl` 및 `generationConfig`도 사용할 수 있습니다. 자격 증명은 설정에 저장되지 않으며, 런타임은 `process.env[envKey]`에서 이를 읽습니다. 레거시 무료 Qwen OAuth 모델은 하드코딩되어 있으며 재정의할 수 없습니다.

> [!note]
>
> 이전 미리보기에서는 각 제공자의 모델을 `{ "protocol": ..., "models": [...] }` 객체로 래핑했습니다. 해당 형태는 되돌려졌습니다 — 현재 값은 이 페이지 전체에 표시되는 베어 `ModelConfig[]` 배열입니다. 이미 마이그레이션된(`$version: 4`) 설정 파일의 래핑된 항목은 자동으로 건너뛰어지므로, 이전 구성을 배열 형식으로 업데이트하세요.

> [!note]
>
> `modelProviders`를 통해 API 키 제공자를 구성한 후 `/model`로 선택합니다. Qwen 계정 로그인의 경우 `/auth`에서 [**구독 포함 Qwen 계정**](https://chat.qwen.ai/?memberPlan=qwen_code)을 선택하세요. API 키나 수동 `modelProviders` 구성이 필요하지 않습니다. 구독으로 사용 가능한 모델 중에서 선택하려면 `/model`를 사용하세요. 로그인 지침은 [인증](./auth.md)을 참조하십시오.

> [!note]
>
> **모델 고유성:** 모델은 유효한 API 프로토콜, `id` 및 구성된 `baseUrl`로 식별됩니다. `wireApi: "chat-completions"`와 `wireApi: "responses"` 모두에서 동일한 모델과 URL을 정의하거나, 동일한 모델과 API에 대해 다른 URL을 사용할 수 있습니다. 항목이 세 가지 값을 모두 공유하는 경우 첫 번째 발생이 우선하며 이후 중복 항목은 경고와 함께 건너뜁니다.

> [!note]
>
> **핫 리로드 대 재시작:** `settings.json`에서의 `modelProviders` 편집은 재시작 없이 실행 중인 대화형 세션에서 반영됩니다(파일 감시자는 약 300ms 동안 디바운스; 새 항목을 보려면 `/model`를 다시 열면 되며, 현재 선택 항목은 유지됨). 활성 모델의 `wireApi` 변경은 다른 경로를 생성하므로, 해당 경로를 명시적으로 선택하거나 재시작하여 사용해야 합니다. 잘못된 API 편집은 이전 등록 테이블을 계속 사용할 수 있게 합니다. `providerProtocol`는 시작 시 한 번만 읽히며 **재시작이 필요합니다**.

### 이미지 생성 경로

내장 `image_gen` 도구에서 라우트를 사용할 수 있는 경우 `supportsImageGeneration: true`을 설정합니다. 이 기능은 `capabilities.vision` 또는 `generationConfig.modalities.image`과 같은 이미지 입력 지원과는 별개입니다.

라우트가 이미지 생성 전용이며 일반 모델 선택기에 표시되어서는 안 되는 경우 `imageOnly: true`을 사용합니다. 하위 호환성을 위해 `imageOnly: true`도 이미지 생성 기능을 암시하므로 기존 설정을 마이그레이션할 필요가 없습니다.

듀얼 역할 라우트는 메인 모델로도, `/model --image`을 통해서도 선택할 수 있습니다:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "omni-model",
        "envKey": "MODEL_API_KEY",
        "baseUrl": "https://gateway.example.com/model-api",
        "supportsImageGeneration": true
      }
    ]
  }
}
```

전용 이미지 라우트는 두 필드를 모두 설정합니다. `imageOnly: true`만 포함된 레거시 형식도 유효합니다:

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

선택된 라우트는 명시적인 HTTPS `baseUrl`과 비어 있지 않은 `envKey`을 선언해야 합니다. 이미지 생성은 라우트와 동일한 엔드포인트 및 자격 증명을 사용하며, 채팅과 이미지 생성에 서로 다른 엔드포인트나 자격 증명이 필요한 경우 두 개의 라우트를 별도로 구성하십시오.

### 실시간 음성 경로

DashScope Realtime(음성 간 대화) 프로토콜을 사용하는 라우트에 `realtimeOnly: true`을 설정합니다. 이러한 라우트는 채팅, 빠른 모드, 비전, 음성 또는 이미지 모델로 제공되지 않으며, 오직 `experimental.liveVoice.model`(`modelId` 또는 여러 공급자 아래에 동일한 ID가 존재하는 경우 `provider:modelId`)을 통해 Live Voice 모델로만 선택될 수 있습니다.

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.5-omni-plus-realtime",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY",
        "realtimeOnly": true
      }
    ]
  },
  "experimental": {
    "liveVoice": {
      "enabled": true,
      "model": "qwen3.5-omni-plus-realtime",
      "voice": "Tina"
    }
  }
}
```

선택된 모델이 `realtimeOnly` 라우트를 지정하는 경우, Live Voice는 라우트의 `envKey`(먼저 프로세스 환경 변수, 그 다음 `settings.json`의 `env` 블록)을 통해 API 키를 읽고, `baseUrl`에서 WebSocket 엔드포인트를 파생시킵니다(`https://<host>/compatible-mode/v1`가 `wss://<host>/api-ws/v1/realtime`으로 변환됨). 라우트는 `baseUrl`과 `envKey`을 모두 선언해야 하며, 호스트는 DashScope 엔드포인트여야 합니다.

두 가지 규칙은 의도된 것입니다:

- 작업 공간 설정은 참조되지 않으며, 사용자 및 시스템 수준 설정만 사용됩니다. 프로젝트의 `.qwen/settings.json`은 Live Voice 라우트를 추가하거나 리디렉션할 수 없습니다.
- 일치하는 `realtimeOnly` 라우트가 없는 **단독** `modelId`은 이전처럼 독립적인 `experimental.liveVoice.endpoint` 및 `experimental.liveVoice.apiKey` 필드를 사용하므로 기존 설정이 변경 없이 계속 작동합니다. 공급자는 존재하지만 해당 라우트가 없는 `provider:modelId` 선택기는 오류로 처리됩니다: 삭제되거나 오타가 있는 라우트는 저장된 키로 조용히 폴백되지 않습니다.
- 라우트가 선택된 동안 `experimental.liveVoice.apiKey`과 `experimental.liveVoice.endpoint`은 사용되지 않으며, 설정 API는 새로운 값을 저장하는 것을 거부합니다.

독립 경로에서는 Web Shell의 Qwen Live 설정이 엔드포인트와 모델을 직접 설정합니다. 키가 속한 지역이나 전용 도메인의 OpenAI 호환 기본 URL(예: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`)을 입력하십시오. 비워 두면 Live는 베이징(`https://dashscope.aliyuncs.com/compatible-mode/v1`)을 사용하며, 다른 지역의 키는 `401`로 거부됩니다. 기본 URL은 입력된 대로 저장되며 호출 시작 시 `wss://<host>/api-ws/v1/realtime`으로 변환됩니다. 호스트는 DashScope 또는 `*.maas.aliyuncs.com` 엔드포인트여야 합니다. Live Voice가 활성화된 동안 새 엔드포인트는 저장되기 전에 Realtime 핸드셰이크로 확인됩니다.

## 추론 기능 재정의 [#override-reasoning-capabilities]

모델 항목에서 추론 형식, 제공되는 노력 단계(effort tiers) 및 기본값을 재정의하려면 `capabilities.reasoning`을 설정합니다. 알려진 모델은 선택된 엔드포인트에서 공급자 카탈로그의 생략된 필드를 상속합니다. 예를 들어, `"capabilities": { "reasoning": { "defaultEffort": "medium" } }`은 명시적인 노력이 선택되지 않은 경우 DashScope `qwen3.8-max` 라우트가 medium을 사용하도록 합니다. 알 수 없는 별칭의 경우 세 필드를 모두 선언하십시오:

```json
{
  "id": "company-model-v2",
  "baseUrl": "https://gateway.example.com/v1",
  "envKey": "COMPANY_MODEL_API_KEY",
  "capabilities": {
    "reasoning": {
      "profile": "openai-effort",
      "efforts": ["low", "medium", "high"],
      "defaultEffort": "medium"
    }
  }
}
```

`efforts`은 `low/medium/high/xhigh/max`의 지원되는 하위 집합을 대체합니다. 명시적인 기본값은 해당 하위 집합에 속해야 합니다. 프로필은 기존 형식을 재사용합니다: Chat은 `openai-effort`, `openai-reasoning`, `deepseek-openai`, `dashscope-effort`, `dashscope-thinking` 및 `qwen-chat-template`을 허용하고; Responses는 `openai-reasoning`을 허용하며; Anthropic은 `anthropic-manual`, `anthropic-adaptive` 및 `deepseek-anthropic`을 허용하고; Gemini/Vertex는 `gemini`을 사용합니다. 토글 전용 프로필 두 가지는 `efforts`과 `defaultEffort`을 생략합니다. Gemini는 low/medium/high를 사용합니다. 적응형 프로필은 레거시 수동 예산이 구성된 경우에도 적응형 사고(adaptive thinking)를 선택합니다. 기존 완전한 기능 선언은 계속 작동합니다.

추론 변경 사항은 다음 사용자 프롬프트 전에 적용됩니다. 요청, 재시도 및 하위 에이전트는 캡처된 추론 구성을 공유합니다. 잘못된 업데이트는 이전 구성을 유지하고 모델/필드 오류를 기록합니다. 새 세션에서의 잘못된 선언은 기존 모델 동작으로 안전하게 폴백합니다. `reasoning`, `samplingParams` 및 `extra_body`에서의 명시적인 사용자 선택과 공급자 네이티브 재정의는 기존 우선순위를 유지합니다. 모델 기본값은 사용자 선택으로 저장되지 않습니다. 이 메커니즘은 엔드포인트, 자격 증명 또는 이미지 모델 라이프사이클을 변경하지 않습니다.

## 인증 유형별 구성 예시

아래에는 다양한 인증 유형에 대한 포괄적인 구성 예시가 있으며, 사용 가능한 매개변수와 그 조합을 보여줍니다.

### 지원되는 인증 유형

아래 내장 제공자 ID 중 하나를 사용하거나 `providerProtocol`로 커스텀 ID를 매핑하세요:

| 유효 프로토콜 | 설명                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`           | OpenAI 호환 API입니다. 기본적으로 Chat Completions를 사용하며, Responses API를 사용하려면 모델의 `wireApi`을 `responses`로 설정하세요.                             |
| `anthropic`        | Anthropic Claude API                                                                                                                            |
| `gemini`           | Google Gemini API                                                                                                                               |
| `vertex-ai`        | Google Vertex AI (Vertex AI 모드에서 `gemini` 프로토콜과 `@google/genai` SDK 사용; 선택 시 `GOOGLE_GENAI_USE_VERTEXAI=true` 설정됨) |

> [!note]
> Vertex AI 항목은 **Application Default Credentials**로 인증할 수 있습니다. `GOOGLE_CLOUD_PROJECT`를 설정하고(선택적으로 `GOOGLE_CLOUD_LOCATION`, 기본값 `global`), `envKey`를 설정하지 않은 채 해결자가 읽는 다른 모든 키 소스(`GOOGLE_API_KEY`, `settings.security.auth.apiKey`, CLI 키 플래그)도 설정하지 마세요. Vertex 항목에 도달하는 API 키 값은 Google SDK를 Vertex Express 모드로 전환하여 프로젝트, 위치 및 ADC 자격 증명을 무시합니다. `envKey`를 선언하는 항목은 절대 ADC로 라우팅되지 않으므로 주입에 실패한 키는 다른 principal로 조용히 인증하는 대신 해당 변수에서 계속 실패합니다.

> [!warning]
> 내장 프로토콜이 아니거나 `providerProtocol`을 통해 매핑되지 않은 제공자 id(예: `"openai-custom"`과 같은 오타)는 라우팅할 수 없으므로 전체 항목이 경고와 함께 **건너뛰어집니다** — 모델이 `/model` 선택기에 표시되지 않습니다. 내장 제공자의 경우 위의 지원되는 auth 유형 값 중 하나를 사용하거나, 사용자 정의 id에 대한 [`providerProtocol`](#custom-provider-ids-providerprotocol) 매핑을 추가하세요.

### 사용자 정의 제공자 id (`providerProtocol`) [#custom-provider-ids-providerprotocol]

내장 제공자 id(`openai`, `gemini`, `anthropic`, `vertex-ai`, `qwen-oauth`)는 자동으로 SDK 프로토콜로 라우팅됩니다. **사용자 정의** 제공자 id를 사용하려면 — 예를 들어 여러 OpenAI 호환 엔드포인트를 더 친근한 이름으로 그룹화 — `modelProviders` 아래에 선언하고 최상위 `providerProtocol` 설정으로 내장 프로토콜에 매핑하세요:

```json
{
  "modelProviders": {
    "idealab": [
      {
        "id": "my-model",
        "envKey": "IDEALAB_API_KEY",
        "baseUrl": "https://idealab.example.com/v1"
      }
    ]
  },
  "providerProtocol": {
    "idealab": "openai"
  }
}
```

일치하는 `providerProtocol` 항목이 없으면 사용자 정의 제공자 id는 건너뛰어집니다(위의 경고 참조).

### OpenAI API 선택

OpenAI 호환 모델에 대해 `id`, `envKey`, `baseUrl` 옆에 `wireApi`을(를) 설정합니다:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "my-model",
        "wireApi": "responses",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ]
  },
  "security": { "auth": { "selectedType": "openai" } },
  "model": { "name": "my-model" }
}
```

지원되는 값은 `chat-completions` 및 `responses`입니다. `wireApi`을 생략하면 `openai`에 매핑된 사용자 지정 제공자를 포함하여 `openai`에 대해 Chat Completions가 사용됩니다. 다른 값이거나 Anthropic, Gemini, Vertex AI 또는 Qwen OAuth 모델에 `wireApi`을 사용하는 것은 구성 오류입니다.

새로운 구성에서는 모델별 `wireApi`과 함께 `openai`을 사용합니다. v0.23.3에서 릴리스된 `modelProviders.openai-responses` 형식 및 `openai-responses`에 대한 `providerProtocol` 매핑은 계속 읽을 수 있습니다. 명시적 제공자 매핑은 버킷 이름보다 우선하며, 명시적 `wireApi`은 두 OpenAI 프로토콜 모두보다 우선합니다. 로딩 중에 설정이 재작성되거나 자격 증명 참조가 변경되지 않습니다. 재구성은 새 형식으로 선택된 경로를 기록하고 쓰기 가능한 범위에 있는 일치하는 이전 항목만 제거합니다. 점(.)이 포함된 제공자 ID 아래에 있는 항목은 그대로 유지되며, 관련 없는 모델, 엔드포인트, API 및 범위는 변경되지 않습니다. `api`은 `wireApi`의 별칭이 아닙니다.

`wireApi`은 로컬 라우팅 메타데이터이며, `generationConfig` 또는 `extra_body`에 속하지 않고 요청 본문에 전송되지 않습니다. 새로운 사용자 지정 설정은 두 API 모두에 동일한 OpenAI 엔드포인트에 대해 하나의 자격 증명 슬롯을 공유하므로 해당 키를 회전하면 두 경로가 모두 업데이트됩니다. 수동으로 구성된 모델은 독립적인 자격 증명이 필요한 경우 별도의 명시적 `envKey` 참조를 사용할 수 있습니다. `/auth` → Custom Provider에서 OpenAI-compatible을 선택한 다음 API 형식을 선택합니다.

시작 시, 선택된 구성 엔드포인트에 일치하는 Chat 경로가 없는 경우 `selectedType: "openai"`은 `wireApi: "responses"`로 명시적으로 구성된 모델을 해결할 수 있습니다. 모델 선택기 및 기록된 세션은 유효한 프로토콜(`openai` 또는 `openai-responses`)을 유지하므로 두 경로를 모두 독립적으로 선택하고 재개할 수 있습니다. API 요청이 실패할 때 엔드포인트 감지나 자동 폴백이 발생하지 않습니다.

### API 요청에 사용되는 전송 방식

유효한 모델 프로토콜이 전송 방식을 결정합니다. 두 OpenAI API 모두 `openai` 제공자 그룹을 사용하며, `wireApi`은 Chat Completions 또는 Responses를 선택합니다:

| 유효한 프로토콜 | 전송 방식                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `openai`           | [`openai`](https://www.npmjs.com/package/openai) - 공식 OpenAI Node.js SDK                                     |
| `openai-responses` | `/v1/responses`에 대한 직접 HTTP/SSE 호출(SDK 없음); 임베딩은 [`openai`](https://www.npmjs.com/package/openai) 사용 |
| `anthropic`        | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 공식 Anthropic SDK                    |
| `gemini`           | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 공식 Google GenAI SDK                         |
| `qwen-oauth`       | 사용자 지정 제공자(DashScope 호환)와 함께 [`openai`](https://www.npmjs.com/package/openai)                       |

이는 구성한 `baseUrl`이 해당 전송 방식의 예상 API 형식과 호환되어야 함을 의미합니다. 예를 들어, `wireApi: "responses"`은 Responses 호환 엔드포인트가 필요합니다.

### OpenAI 호환 제공자 (`openai`)

이 auth 유형은 OpenAI의 공식 API뿐만 아니라 OpenRouter 및 Requesty와 같은 집계 모델 제공자를 포함한 모든 OpenAI 호환 엔드포인트를 지원합니다.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "retryInitialDelayMs": 3000,
          "retryMaxDelayMs": 30000,
          "enableCacheControl": true,
          "contextWindowSize": 128000,
          "modalities": {
            "image": true
          },
          "customHeaders": {
            "X-Client-Request-ID": "req-123"
          },
          "extra_body": {
            "enable_thinking": true,
            "service_tier": "priority"
          },
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 4096,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.1
          }
        }
      },
      {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 30000,
          "samplingParams": {
            "temperature": 0.5,
            "max_tokens": 2048
          }
        }
      },
      {
        "id": "openai/gpt-4o",
        "name": "GPT-4o (via OpenRouter)",
        "envKey": "OPENROUTER_API_KEY",
        "baseUrl": "https://openrouter.ai/api/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      },
      {
        "id": "openai/gpt-4o-mini",
        "name": "GPT-4o Mini (via Requesty)",
        "envKey": "REQUESTY_API_KEY",
        "baseUrl": "https://router.requesty.ai/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      }
    ]
  }
}
```

항목을 호스팅된 OpenAI 호환 게이트웨이로 지정할 때, 전체 `/v1/chat/completions` 경로 대신 API의 `/v1` 루트(예: `https://gateway.example.com/v1`)로 `baseUrl`을 설정하십시오. SDK가 요청 경로를 자체적으로 추가합니다.

### OpenAI Responses API (`openai-responses`)

OpenAI의 `/v1/responses` 엔드포인트를 대상으로 하려면 `wireApi: "responses"`과 함께 `openai`을 사용합니다. 엔드포인트가 표시된 사고 텍스트와 함께 암호화된 추론을 반환하면 턴 간 이전 턴의 추론을 재생하고 `reasoning.encrypted_content`을 통해 `--resume`을 수행합니다. `response.reasoning_text.delta`을 스트리밍하는 호환 엔드포인트도 추론을 표시하지만, `encrypted_content`이 없는 엔드포인트는 불투명한 추론 상태를 재생할 수 없습니다. 추론 강도를 제어하려면 `extra_body.enable_thinking`(Chat Completions 와이어에서 사용됨)이 아닌 `reasoning.effort`을 사용하십시오.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-5.1",
        "wireApi": "responses",
        "name": "GPT-5.1 (Responses API)",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "reasoning": {
            "effort": "high"
          },
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

> [!note]
> 이 와이어에서의 `extra_body`은 채우기 전용입니다. 생성된 요청에 해당 값이 없을 때만 키가 요청 본문에 작성되므로 파이프라인이 이미 설정한 필드(`model`, `input`, `reasoning`, `temperature`, `max_output_tokens` 등)를 재정의할 수 없습니다. 레거시 `enable_thinking` 키는 예외로, 전달되는 대신 제거되며(Responses API 필드가 아님), 명시적 `reasoning`이 설정되지 않은 경우 `reasoning.effort: "medium"`로 변환됩니다. 이 제공자의 경우 `extra_body.enable_thinking` 대신 `reasoning.effort`을 직접 설정하십시오.

### Anthropic (`anthropic`)

Claude Opus 5.5, Sonnet 5.5, Fable 5.1 및 Mythos 5.1은 강제 도구 선택을 거부합니다. 구조화된 사이드 쿼리의 경우 Qwen Code는 이러한 모델에서 명시적인 스키마 응답 지침과 함께 자동 도구 선택을 사용합니다. 강제 선택을 지원하는 모델은 이를 유지합니다. 자동 선택은 도구 호출을 보장하지 않으며, JSON 사이드 쿼리는 Markdown 울타리나 주변 텍스트 없이 응답 텍스트에서 원시 JSON 객체를 읽을 수도 있습니다. [Anthropic의 도구 선택 제한](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use)을 참조하십시오.

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "contextWindowSize": 200000,
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 8192,
            "top_p": 0.9
          }
        }
      },
      {
        "id": "claude-3-opus",
        "name": "Claude 3 Opus",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 180000,
          "samplingParams": {
            "temperature": 0.3,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "capabilities": {
          "vision": true
        },
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 2,
          "contextWindowSize": 1000000,
          "schemaCompliance": "auto",
          "samplingParams": {
            "temperature": 0.4,
            "top_p": 0.95,
            "max_tokens": 8192,
            "top_k": 40
          }
        }
      }
    ]
  }
}
```

일반 Qwen Code 에이전트 정책을 따르면서 도구를 사용할 수 있는 vision 모델의 경우, 두 가지 기능을 모두 가진 전체 턴 이미지 라우팅에 옵트인하세요:

```json
"capabilities": {
  "vision": true,
  "agent": true
}
```

텍스트 전용 기본 모델이 해당 모델을 구성된 vision 폴백으로 사용하는 경우, 완전한 이미지 포함 턴은 도구 호출과 재시도 동안 정확히 해당 제공자, 모델 및 엔드포인트에 유지됩니다. 다음 독립 턴은 기본 모델로 돌아가며, 각 모델 요청은 대상이 지원하는 미디어 모달리티만 받습니다. 더 안전한 Vision Bridge 트랜스크립션 흐름을 유지하려면 `agent`를 생략(또는 `false`로 설정)하세요.

### 로컬 자체 호스팅 모델 (OpenAI 호환 API를 통해)

대부분의 로컬 추론 서버(vLLM, Ollama, LM Studio 등)는 OpenAI 호환 API 엔드포인트를 제공합니다. `openai` 인증 유형과 로컬 `baseUrl`을 사용하여 구성하세요:

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen2.5-7b",
        "name": "Qwen2.5 7B (Ollama)",
        "envKey": "OLLAMA_API_KEY",
        "baseUrl": "http://localhost:11434/v1",
        "generationConfig": {
          "timeout": 300000,
          "streamIdleTimeoutMs": 600000,
          "maxRetries": 1,
          "contextWindowSize": 32768,
          "samplingParams": {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 4096
          }
        }
      },
      {
        "id": "llama-3.1-8b",
        "name": "Llama 3.1 8B (vLLM)",
        "envKey": "VLLM_API_KEY",
        "baseUrl": "http://localhost:8000/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 2,
          "contextWindowSize": 128000,
          "samplingParams": {
            "temperature": 0.6,
            "max_tokens": 8192
          }
        }
      },
      {
        "id": "local-model",
        "name": "Local Model (LM Studio)",
        "envKey": "LMSTUDIO_API_KEY",
        "baseUrl": "http://localhost:1234/v1",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": {
            "temperature": 0.5
          }
        }
      }
    ]
  }
}
```

대기 중이거나 느린 로컬 OpenAI 호환 서버의 경우 `streamIdleTimeoutMs`은 스트리밍 청크 사이에 이 모델이 침묵할 수 있는 시간을 제어합니다. 이는 선택된 공급자 항목에 대한 전역 `QWEN_STREAM_IDLE_TIMEOUT_MS` 값을 재정의하며, 유휴 가드를 비활성화하려면 `0`로 설정하십시오. `QWEN_STREAM_MAX_LIFETIME_MS`이 상향 조정되거나 비활성화되지 않는 한 별도의 15분 스트림 수명 상한은 여전히 적용됩니다.

인증을 요구하지 않는 로컬 서버의 경우, API 키에 임의의 자리 표시자 값을 사용할 수 있습니다:

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` 매개변수는 **OpenAI 호환 제공업체**(`openai`, `qwen-oauth`)에서만 지원됩니다. Anthropic 및 Gemini 제공업체에서는 무시됩니다. `openai-responses`에서는 `enable_thinking` 키가 전달되는 대신 변환되므로 [OpenAI Responses API](#openai-responses-api-openai-responses) 노트를 참조하세요.

> [!note]
>
> **`envKey` 정보**: `envKey` 필드는 실제 API 키 값이 아닌 **환경 변수의 이름**을 지정합니다. 구성이 작동하려면 해당 환경 변수가 실제 API 키로 설정되어 있는지 확인해야 합니다. 두 가지 방법이 있습니다:
>
> - **옵션 1: `.env` 파일 사용**(보안에 권장):
>   ```bash
>   # ~/.qwen/.env (or project root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   실수로 비밀을 커밋하는 것을 방지하려면 `.env`를 `.gitignore`에 추가하세요.
> - **옵션 2: `settings.json`의 `env` 필드 사용** (위 예시에 표시됨):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 각 제공자 예시에는 API 키 구성 방법을 보여주기 위해 `env` 필드가 포함되어 있습니다.

#### 사용자 지정 모델 이름으로 제공되는 Qwen3.x

추론 제어 및 컨텍스트 윈도우는 모델 ID에서 유추됩니다. vLLM 또는 SGLang 서버가 `qwen`로 시작하지 않는 ID(예: `--served-model-name chat`)로 Qwen3.x 모델을 노출하는 경우, 두 기능 모두 적용되지 않습니다: 자동 모드 권한 분류기와 같은 사이드 요청은 추론을 계속 유지하며, 컨텍스트 윈도우는 200K 기본값으로 대체됩니다. [추론 기능 재정의](#override-reasoning-capabilities)에 설명된 대로 모델 항목에 두 기능을 모두 선언하십시오:

```json
{
  "id": "chat",
  "name": "Qwen3.6 35B A3B (vLLM)",
  "envKey": "VLLM_API_KEY",
  "baseUrl": "http://localhost:8000/v1",
  "capabilities": { "reasoning": { "profile": "qwen-chat-template" } },
  "generationConfig": { "contextWindowSize": 262144 }
}
```

`qwen-chat-template`은 `chat_template_kwargs.enable_thinking`을 전송하며, 이러한 서버는 이를 Qwen 채팅 템플릿에 전달합니다. 최상위 `enable_thinking` 필드는 해당 서버에서 읽지 않습니다. `contextWindowSize`을 서버의 최대 모델 길이(vLLM에서는 `/v1/models`의 `max_model_len`로 보고됨)로 설정하십시오. Qwen Code는 모든 요청에 도구 정의를 보내므로, 서버에서도 도구 호출 및 추론 파서가 활성화되어 있어야 합니다. vLLM의 경우 `--enable-auto-tool-choice`, 모델용 `--tool-call-parser`(예: `qwen3_xml`) 및 `--reasoning-parser qwen3`이 필요합니다. 파서 이름은 서버 릴리스 간에 변경되므로 서버 문서를 확인하십시오.

## BAILIAN_CODING_PLAN_API_KEY=your-api-key-here

Alibaba Cloud Coding Plan은 코딩 작업에 최적화된 사전 구성된 Qwen 모델 세트를 제공합니다. 이 기능은 Alibaba Cloud Coding Plan API 접근이 있는 사용자를 위해 자동 모델 구성 업데이트와 함께 간소화된 설정 경험을 제공합니다.

### 개요

`/auth` 명령을 사용하여 Alibaba Cloud Coding Plan API 키로 인증하면 Qwen Code가 자동으로 다음 모델을 구성합니다:

| 모델 ID                | 이름                 | 설명                                                |
| ---------------------- | -------------------- | --------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 추론 기능이 활성화된 고급 모델                      |
| `qwen3.6-plus`         | qwen3.6-plus         | 추론 기능이 활성화된 최신 모델(Pro 구독자 전용)     |
| `qwen3.7-plus`         | qwen3.7-plus         | 추론 기능이 활성화된 고급 모델                      |
| `qwen3-coder-plus`     | qwen3-coder-plus     | 코딩 작업에 최적화                                  |
| `qwen3-coder-next`     | qwen3-coder-next     | 실험적 코딩 모델                                    |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 추론 기능이 활성화된 최신 max 모델                  |
| `glm-5`                | glm-5                | 추론 기능이 활성화된 GLM 모델                       |
| `glm-4.7`              | glm-4.7              | 추론 기능이 활성화된 GLM 모델                       |
| `kimi-k2.5`            | kimi-k2.5            | 추론 및 vision/video 지원이 있는 Kimi 모델          |
| `MiniMax-M2.5`         | MiniMax-M2.5         | 추론 기능이 활성화된 MiniMax 모델                   |

### 설정

1. Alibaba Cloud Coding Plan API 키를 획득합니다:
   - **중국**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **국제**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Qwen Code에서 `/auth` 명령을 실행합니다
3. **Alibaba ModelStudio**를 선택한 후 하위 메뉴에서 **Coding Plan**을 선택합니다
4. 지역을 선택합니다
5. 프롬프트에 API 키를 입력합니다

모델이 자동으로 구성되어 `/model` 선택기에 추가됩니다.

### 지역

Alibaba Cloud Coding Plan은 두 지역을 지원합니다:

| 지역               | 엔드포인트                                    | 설명              |
| ------------------ | --------------------------------------------- | ----------------- |
| 중국               | `https://coding.dashscope.aliyuncs.com/v1`    | 중국 본토 엔드포인트 |
| 글로벌/국제        | `https://coding-intl.dashscope.aliyuncs.com/v1` | 국제 엔드포인트   |

지역은 인증 중에 선택되며 `settings.json`의 `modelProviders` 구성 아래에 저장됩니다. 지역을 변경하려면 `/auth` 명령을 다시 실행하고 다른 지역을 선택하세요.

### API 키 저장

`/auth` 명령을 통해 Coding Plan을 구성하면 API 키가 예약된 환경 변수 이름 `BAILIAN_CODING_PLAN_API_KEY`을 사용하여 저장됩니다. 기본적으로 `settings.json` 파일의 `env` 필드에 저장됩니다.

> [!warning]
>
> **보안 권장 사항**: 더 나은 보안을 위해 API 키를 `settings.json`에서 별도의 `.env` 파일로 이동하고 환경 변수로 로드하는 것이 좋습니다. 예를 들어:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> 프로젝트 수준 설정을 사용하는 경우 이 파일이 `.gitignore`에 추가되었는지 확인하세요.

### 자동 업데이트

Coding Plan 모델 구성은 버전 관리됩니다. Qwen Code가 모델 템플릿의 최신 버전을 감지하면 업데이트하라는 메시지가 표시됩니다. 업데이트를 수락하면 다음이 수행됩니다:

- 기존 Coding Plan 모델 구성을 최신 버전으로 교체
- 수동으로 추가한 사용자 지정 모델 구성을 유지합니다
- 선택한 모델을 변경하지 마십시오. 업데이트된 구성에 더 이상 존재하지 않는 경우 `/model`을(를) 사용하여 새 모델을 선택하십시오

업데이트 프로세스는 선택한 모델을 변경하지 않고 모델 구성 및 기능을 새로 고칩니다.

### 수동 구성 (고급)

Coding Plan 모델을 수동으로 구성하려면 다른 OpenAI 호환 제공자와 마찬가지로 `settings.json`에 추가할 수 있습니다:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder via Alibaba Cloud Coding Plan",
        "envKey": "YOUR_CUSTOM_ENV_KEY",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
>
> 수동 구성을 사용할 때:
>
> - `envKey`에 어떤 환경 변수 이름이든 사용할 수 있습니다
> - `codingPlan.*`을 구성할 필요가 없습니다
> - **자동 업데이트는 수동으로 구성된 Coding Plan 모델에 적용되지 않습니다**

> [!warning]
>
> 자동 Coding Plan 구성도 사용하는 경우, 자동 업데이트가 수동 구성과 동일한 `envKey`와 `baseUrl`을 사용하면 수동 구성을 덮어쓸 수 있습니다. 이를 피하려면 가능한 경우 수동 구성에서 다른 `envKey`를 사용하세요.

## 해석 계층 및 원자성

유효한 auth/model/credential 값은 필드별로 다음 우선 순위를 사용하여 선택됩니다(먼저 존재하는 것이 우선). `--auth-type`과 `--model`을 함께 사용하여 제공자 항목을 직접 가리킬 수 있습니다. 이러한 CLI 플래그는 다른 계층보다 먼저 실행됩니다.

| 계층 (최우선 → 최하위)          | authType                            | model                                           | apiKey                                            | baseUrl                                            | apiKeyEnvKey           | proxy                             |
| ------------------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ---------------------- | --------------------------------- |
| 프로그래밍 방식 재정의           | `/auth`                             | `/auth` 입력                                    | `/auth` 입력                                      | `/auth` 입력                                       | —                      | —                                 |
| 모델 제공자 선택                | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                       | `modelProvider.baseUrl`                            | `modelProvider.envKey` | —                                 |
| CLI 인수                        | `--auth-type`                       | `--model`                                       | `--openai-api-key`                                | `--openai-base-url`                                | —                      | —                                 |
| 환경 변수                       | —                                   | 제공자별 매핑(예: `OPENAI_MODEL`)               | 제공자별 매핑(예: `OPENAI_API_KEY`)               | 제공자별 매핑(예: `OPENAI_BASE_URL`)               | —                      | —                                 |
| 설정 (`settings.json`)          | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                            | `security.auth.baseUrl`                            | —                      | —                                 |
| 기본값 / 계산됨                 | `AuthType.QWEN_OAUTH`로 폴백        | 내장 기본값(OpenAI ⇒ `qwen3.5-plus`)            | —                                                 | —                                                  | —                      | 구성된 경우 `Config.getProxy()`   |

\*이(가) 존재하면 CLI 인증 플래그가 설정을 재정의합니다. 그렇지 않은 경우 `security.auth.selectedType` 또는 암시적 기본값이 인증 유형을 결정합니다. 로그인 옵션은 [인증](./auth.md)을(를) 참조하세요. 레거시 무료 Qwen OAuth 제공자는 [구독이 포함된 Qwen 계정](https://chat.qwen.ai/?memberPlan=qwen_code)과 별개입니다.

> [!note]
>
> `--openai-api-key`와 `--openai-base-url`는 유일한 자격 증명 CLI 플래그입니다. 이들은 이름과 관계없이 활성 OpenAI 호환 제공자에 적용됩니다 — `--anthropic-*` / `--gemini-*` 자격 증명 플래그는 없습니다. CLI에서 전달되지 않은 제공자별 자격 증명은 환경 변수에서 해석됩니다(아래 행 참조).

> [!warning]
>
> **`security.auth.apiKey` 및 `security.auth.baseUrl`의 지원 중단:** `settings.json`에서 `security.auth.apiKey` 및 `security.auth.baseUrl`을(를) 통해 API 자격 증명을 직접 구성하는 것은 지원 중단되었습니다. 이러한 설정은 UI를 통해 입력된 자격 증명을 위해 이전 버전에서 사용되었지만, 0.10.1 버전에서 자격 증명 입력 플로우가 제거되었습니다. 이 필드는 향후 릴리스에서 완전히 제거될 예정입니다. **모든 모델 및 자격 증명 구성에 대해 `modelProviders`로 마이그레이션할 것을 강력히 권장합니다.** 설정 파일에 자격 증명을 하드코딩하는 대신 안전한 자격 증명 관리를 위해 `modelProviders`에서 `envKey`을(를) 사용하여 환경 변수를 참조하세요.

## Generation Config 계층화: 침투 불가능한 제공자 계층

구성 해석은 하나의 중요한 규칙을 가진 엄격한 계층화 모델을 따릅니다: **modelProvider 계층은 침투 불가능합니다**.

### 작동 방식

1. **modelProvider 모델이 선택된 경우**(예: `/model` 명령으로 제공자 구성 모델 선택):
   - 제공자의 전체 `generationConfig`가 **원자적으로** 적용됩니다
   - **제공자 계층은 완전히 침투 불가능합니다** — 하위 계층(CLI, env, settings)은 generationConfig 해석에 전혀 참여하지 않습니다
   - `modelProviders[].generationConfig`에 정의된 모든 필드는 제공자의 값을 사용합니다
   - 제공자가 정의하지 **않은** 모든 필드는 `undefined`로 설정됩니다(settings에서 상속되지 않음)
   - 이는 제공자 구성이 완전하고 독립적인 "밀봉 패키지"로 작동하도록 보장합니다

   모델이 `modelProviders`에 나열된 경우, 해당 모델의 모든 모델별 생성 설정을 일치하는 공급자 항목에 넣으십시오. `contextWindowSize`, `modalities`, `customHeaders` 및 `extra_body`을 포함한 최상위 `model.generationConfig` 값은 공급자 모델에 대해 무시됩니다. 이러한 필드를 적용하려면 `modelProviders[authType][].generationConfig` 아래에서 구성하십시오.

2. **modelProvider 모델이 선택되지 않은 경우**(예: 원시 모델 ID와 함께 `--model` 사용, 또는 CLI/env/settings를 직접 사용):
   - 해석이 하위 계층으로 전달됩니다
   - 필드가 CLI → env → settings → 기본값에서 채워집니다
   - 이렇게 하면 **런타임 모델**이 생성됩니다(다음 섹션 참조)

### `generationConfig`의 필드별 우선 순위

| 우선 순위 | 소스                                          | 동작                                                                                                       |
| --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1         | 프로그래밍 방식 재정의                        | 런타임 `/model`, `/auth` 변경                                                                             |
| 2         | `modelProviders[authType][].generationConfig` | **침투 불가능한 계층** - 모든 generationConfig 필드를 완전히 대체; 하위 계층은 참여하지 않음              |
| 3         | `settings.model.generationConfig`             | **런타임 모델**에만 사용(제공자 모델이 선택되지 않은 경우)                                                 |
| 4         | 콘텐츠 생성기 기본값                          | 제공자별 기본값(예: OpenAI vs Gemini) - 런타임 모델에만                                                   |

### `customHeaders`의 동적 값 [#dynamic-values-in-customheaders]

`customHeaders` 값에는 현재 Qwen Code 세션 ID로 요청마다 확장되는 자리 표시자 `${session_id}`이 포함될 수 있습니다. 안정적인 대화별 식별자가 필요한 게이트웨이(예: OpenCode Go는 `x-opencode-session` 없이 요청을 거부함)에 사용하십시오:

```json
{
  "generationConfig": {
    "customHeaders": {
      "x-opencode-session": "${session_id}"
    }
  }
}
```

값이 SDK 클라이언트에 구워지는 대신 요청마다 해석되므로, `/new`과 `/resume`은 재시작 없이 이를 회전시킵니다.

⚠️ **두 단계가 필요합니다.** 위의 공급자 항목은 절반일 뿐입니다 — 자리 표시자는 [`outboundCorrelation.allowDynamicHeaderValues`](./settings.md#outboundcorrelation)도 켜기 전까지는 비활성 상태입니다:

```json
{
  "outboundCorrelation": {
    "allowDynamicHeaderValues": true
  }
}
```

그렇게 하기 전까지 자리 표시자가 포함된 값은 전송되는 대신 **삭제**되며, Qwen Code는 헤더와 이 설정을 명시하는 경고 메시지를 시작 시 출력합니다. 헤더에는 리터럴 `${session_id}`이 절대 포함되지 않습니다.

**하나의 헤더는 예약되어 있습니다.** QwenCloud MaaS 엔드포인트 — `/auth` 항목 `China — Qianwen AI Platform` 및 `International — QwenCloud` — 에서 Qwen Code는 `X-DashScope-Source-Config`을 소유하며 제1자 귀속 값을 여기에 씁니다. 해당 이름(대소문자 구분 없음)의 항목은 요청이 빌드되기 전에 제거되므로, 그 안의 `${session_id}` 자리 표시자는 결코 살아남지 않으며 `allowDynamicHeaderValues`도 이를 변경하지 않습니다. 헤더 자체는 여전히 전송되며, 오직 사용자 값만 대체됩니다. 설정 측면에서 동일한 규칙을 언급한 내용은 [`customHeaders`](./settings.md#model)을 참조하십시오.

스위치는 동의 결정 사항이며 값이 어디로 가는지(_where_)와는 별개이므로 전역적입니다. 확장된 값은 수신자에게 실시간 세션 상태를 전달하며, 스위치는 `${session_id}`이 확장될 수 있는지 여부만 제어합니다. 이는 헤더를 제공한 설정 소스를 식별하지 않습니다.

**개인정보 보호 참고:** 세션 ID는 대화 생명주기 동안 안정적인 식별자이므로, 이를 전송하는 호스트는 해당 대화의 모든 요청을 그룹화할 수 있습니다. 어떤 호스트인지 여부는 헤더를 포함하는 공급자 항목에 따라 결정됩니다 — `baseUrl`과 동기화해야 하는 별도의 호스트 목록은 없습니다.

### 원자적 필드 처리

다음 필드는 원자적 객체로 처리됩니다. 제공자 값은 전체 객체를 완전히 대체하며 병합이 발생하지 않습니다:

- `samplingParams` - Temperature, top_p, max_tokens 등
- `customHeaders` - 사용자 지정 HTTP 헤더 (`${session_id}` 포함 가능; [동적 값](#dynamic-values-in-customheaders) 참조)
- `extra_body` - 추가 요청 본문 매개변수

### 예시

```jsonc
// User settings (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders configuration
{
  "modelProviders": {
    "openai": [{
      "id": "gpt-4o",
      "envKey": "OPENAI_API_KEY",
      "generationConfig": {
        "timeout": 60000,
        "samplingParams": { "temperature": 0.2 }
      }
    }]
  }
}
```

`gpt-4o`가 modelProviders에서 선택되면:

- `timeout` = 60000(제공자에서, 설정을 재정의)
- `samplingParams.temperature` = 0.2(제공자에서, 설정 객체를 완전히 대체)
- `samplingParams.max_tokens` = **undefined**(제공자에 정의되지 않았고, 제공자 계층은 settings에서 상속하지 않음 — 제공되지 않으면 필드가 명시적으로 undefined로 설정됨)

`--model gpt-4`를 통해 원시 모델 사용(modelProviders가 아닌, 런타임 모델 생성):

- `timeout` = 30000(settings에서)
- `samplingParams.temperature` = 0.5(settings에서)
- `samplingParams.max_tokens` = 1000(settings에서)

`modelProviders` 자체의 병합 전략은 REPLACE입니다: 프로젝트 설정의 전체 `modelProviders`가 사용자 설정의 해당 섹션을 재정의하며, 두 설정을 병합하지 않습니다.

## 추론 / 사고 구성

`generationConfig` 하의 선택적 `reasoning` 필드는 모델이 응답하기 전에 얼마나 깊이 있게 추론하는지 제어합니다. Anthropic 및 Gemini 변환기는 항상 이를 따릅니다. OpenAI 호환 파이프라인은 `generationConfig.samplingParams`가 설정된 경우를 제외하고 **항상** 이를 따릅니다. 알려진 GPT-5 모델과 GPT-6 Astra는 예외입니다: 관련 없는 샘플링 키가 구성된 노력(effort)을 억제하지 않습니다. 아래 "`samplingParams`와의 상호작용"을 참조하세요.

```jsonc
{
  "modelProviders": {
    "openai": [
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "baseUrl": "https://api.deepseek.com/v1",
        "envKey": "DEEPSEEK_API_KEY",
        "generationConfig": {
          // The effort tiers:
          //   'low'    — lightest reasoning
          //   'medium' | 'xhigh' — mapped to 'high' on DeepSeek
          //   'high'   — default reasoning intensity
          //   'max'    — DeepSeek-specific extra-strong tier
          // Or set `false` to disable reasoning entirely.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### 제공자별 동작

| 프로토콜 / 제공자                           | 와이어 형식                                                                               | 참고 사항                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope** (`qwen3.8-max` 계열) | 평면 `reasoning_effort: <effort>` 본문 매개변수                                         | `/effort` 단계(tier)는 `qwen3.8-max`(으)로 시작하는 모든 모델 ID(날짜가 포함된 스냅샷 및 `-latest` 별칭 포함), 초대 전용 `qwen-latest-series-invite-*` 미리보기, `qwen4*` 계열(대소문자 구분 없음)에 대해 전달되며, DashScope는 모델별 특정 매핑을 적용합니다. 이 계열의 사다리는 `xhigh`에서 멈추므로, 구성된 `max`은 전송 후 거부되는 대신 `xhigh`로 클램프(한 번만 로깅됨)됩니다. `samplingParams` 또는 `extra_body` 내 명시적인 `reasoning_effort`은 그대로 오버라이드되며 클램프되지 않습니다. `reasoning_effort`과 `thinking_budget`가 충돌할 때, 일반적인 `extra_body` > `samplingParams` > `reasoning` 우선순위는 더 높은 우선순위 필드만 유지합니다. 동일한 계층의 명시적인 쌍은 교차 계층 해석 이전의 제공자 동작과 일치하도록 `reasoning_effort`을 유지합니다. 정적 필드가 승리하면 `/effort`는 요청된 단계를 유효하다고 암시하는 대신 해당 필드를 보고합니다. 노력 단계가 승리할 때, 충돌하는 `enable_thinking`도 드롭됩니다. `extra_body` 내 명시적인 `enable_thinking: false`은 드롭되는 대신 존중되며, `reasoning_effort: 'none'`로서 구성된 단계를 오버라이드합니다. 이는 `extra_body`가 그대로 승리하지 않는 몇 안 되는 위치 중 하나입니다. 다른 Qwen 모델은 선택된 노력을 `enable_thinking: true`에 계속 매핑합니다. `reasoning_effort` 오버라이드는 `thinking_budget`와 충돌하지 않는 한 그곳에서 통과됩니다(DashScope가 거부하는 쌍). 이 경우 비활성인 `reasoning_effort`은 드롭되고 `enable_thinking`와 `thinking_budget` 모두 생존합니다. |
| **OpenAI / DeepSeek** (`api.deepseek.com`)    | 평면 `reasoning_effort: <effort>` 본문 매개변수                                         | 중첩된 구성 형태에서 `reasoning.effort`가 설정되면 평면 `reasoning_effort`로 재작성됩니다. 내장 DeepSeek 모델의 경우 `'low'`, `'high'` 및 `'max'`은 그대로 전달되며 `'medium'`/`'xhigh'`은 `'high'`로 정규화되어 DeepSeek의 [노력도 매핑](https://api-docs.deepseek.com/guides/thinking_mode)을 반영합니다. 이러한 전달 및 정규화는 공식 엔드포인트에 대한 설명입니다. MaaS 및 서드파티 호스트에서는 정확한 `deepseek-v4-pro` / `deepseek-v4-flash` ID가 `high`/`max`만 제공하며(설정된 `low`는 `high`으로 상향 조정되고 `xhigh`은 `max`로 정규화됨), 최신 Flash 별칭(`deepseek-v4.1-flash*`)은 `low`/`high`/`max`를 유지하고 `xhigh → high`을 사용합니다. 최상위 `samplingParams.reasoning_effort` 또는 `extra_body.reasoning_effort` 재정의는 이 정규화를 건너뛰고 원본 그대로 전송됩니다. `max`은 실제 DeepSeek 호스트 이름과 모든 `deepseek-v4*` 모델 ID(대소문자 구분 없음, 날짜별 스냅샷 포함)에서 허용되며, 이는 모든 OpenAI 호환 호스트에서 인식됩니다(서드파티 게이트웨이는 MaaS 스타일의 `enable_thinking` 계약을 적용받음). 다른 호스트의 기타 `deepseek` 이름이 붙은 모델은 리셰이프 자체의 호스트 이름 가트와 일치하는 일반적인 `xhigh` 상한선을 유지합니다.                                                                                                                                                                                                                                                                                                                                           |
| **OpenAI / Z.ai** (`z.ai`, `bigmodel.cn`)     | 평면 `reasoning_effort: <effort>` 본문 매개변수                                         | Z.ai 호스트의 GLM-5.2+는 `max`을 포함한 전체 사다리를 사용하며, 중첩된 `reasoning.effort`는 평면 필드로 재작성됩니다. 이전 GLM ID와 다른 호스트에서 접근 가능한 `glm-*` 모델은 일반적인 `xhigh` 상한선을 유지합니다: 모델 이름만으로는 해당 엔드포인트가 무엇을 허용하는지 알 수 없습니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OpenAI** (기타 호환 서버)         | 알려진 GPT-5 / GPT-6 Astra: 평면 `reasoning_effort`; 기타 모델: 중첩 `reasoning`     | GPT 노력도는 알려진 모델에 대해 지원되는 하위 집합으로 양방향 모두 클램프됩니다. GPT-5.6 및 GPT-6 Astra는 `max`를 허용하지만, 이전 모델은 더 낮은 상한선을 가집니다. 모델 최소값보다 낮은 티어는 상향 조정됩니다: GPT-5 Pro는 `high`만 허용하며, GPT-5.2 Pro, GPT-5.4 Pro 및 GPT-5.5 Pro는 `low`를 `medium`로 상향 조정합니다. OpenRouter는 중첩된 `reasoning`을 유지합니다. 알려지지 않은 모델 이름은 일반적인 `xhigh` 상한선과 중첩 형태를 유지합니다. `samplingParams` / `extra_body`의 명시적 추론 값은 설정된 티어 클램프를 우회합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **OpenAI Responses** (`openai-responses`)     | `reasoning: { effort, summary: "auto" }` 및 `include: ["reasoning.encrypted_content"]` | 모든 티어는 클램핑 없이 그대로 전달됩니다. 명시적인 `reasoning`가 설정되지 않은 경우 `extra_body.enable_thinking: true`은 `reasoning: { effort: "medium" }`로 변환되며(이 자체는 절대 전달되지 않음 — 이 프로토콜에서는 의미가 없음), `reasoning.effort`를 직접 설정하는 것이 권장됩니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Anthropic** (실제 `api.anthropic.com`)      | `output_config: { effort }` 및 `effort-2025-11-24` 베타 헤더                     | 실제 Anthropic은 `'low'`/`'medium'`/`'high'`만 허용합니다. `'max'`은 `'high'`로 **클램프**되며, 한 줄의 `debugLogger.warn` 메시지가 표시됩니다(생성기당 한 번). 최대 효율을 원한다면 이를 지원하는 DeepSeek 호환 엔드포인트로 baseURL을 변경하세요.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Anthropic** (`api.deepseek.com/anthropic`)  | 동일한 `output_config: { effort }` + 베타 헤더                                           | `'low'`, `'high'` 및 `'max'`는 변경 없이 그대로 전달되며; `'medium'`/`'xhigh'`는 DeepSeek의 서버 측 매핑과 일치하도록 `'high'`로 매핑됩니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                  | `thinkingConfig: { includeThoughts: true, thinkingLevel }`                               | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, 기타 → `THINKING_LEVEL_UNSPECIFIED` (Gemini에는 `MAX` 티어가 없음).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### `reasoning: false`

`reasoning: false`(리터럴 부울 값)을 명시적으로 설정하면 비활성화 지원 모델에서 사고(thinking) 기능이 비활성화됩니다. 이는 추론이 필요하지 않은 저비용 보조 쿼리에 유용합니다. 이 설정은 일회성 호출(예: 제안 생성) 시 `request.config.thinkingConfig.includeThoughts: false`을 통해 요청 수준에서도 적용됩니다.

`api.deepseek.com` baseURL에서는 OpenAI 파이프라인이 DeepSeek V4+가 요구하는 명시적인 `thinking: { type: 'disabled' }` 필드를 전송합니다. 서버 측 기본값은 `'enabled'`이므로, 단순히 `reasoning_effort`을 생략하더라도 여전히 thinking 지연 시간 및 비용이 발생합니다. 자체 호스팅된 DeepSeek 백엔드(sglang/vllm) 및 기타 OpenAI 호환 서버는 이 필드를 **수신하지 않습니다**. 이러한 환경에서 thinking을 비활성화하려면 `samplingParams`/`extra_body`을 통해 `thinking: { type: 'disabled' }`(또는 추론 프레임워크가 제공하는 해당 제어 옵션)를 주입해야 합니다. 모든 `deepseek-v4*` 모델 ID(대소문자 구분 없음)는 예외입니다. 제3자 OpenAI 호스트에서는 MaaS 계약을 따르며 thinking이 비활성화된 경우 `enable_thinking: false`을 수신합니다. 새로 인식된 라우트(제3자 호스트 또는 기존 호스트의 새로운 별칭)에서는 reasoning 프로필이 없는 레거시 `capabilities.reasoning` 선언이 자체적인 wire semantics을 유지합니다. 내장 정규화기는 개입하지 않으며, 선언되거나 정적으로 지정된 effort를 평면화하거나 계층을 재조정하지 않습니다. 선언 시 모델이 `disableField`에서 읽는 제어 옵션(`thinking`, `enable_thinking` 또는 `reasoning_effort`)을 명시해야 합니다. 이를 생략하면 아무런 기능이 해석되지 않으므로 비활성화 필드가 전송되지 않고 서버 기본값(thinking 활성화)이 적용됩니다.

비활성화가 허용되는 알려진 GPT 모델의 경우, OpenRouter가 아닌 엔드포인트는 `reasoning_effort: 'none'`을 수신하고 OpenRouter는 대신 중첩된 `reasoning: { enabled: false }`을 수신합니다. 필수 사고(mandatory-thinking) 모델은 모델 컨트롤에서 'off'를 거부하며 요청에서 지원되지 않는 비활성화 값을 생략하므로, `reasoning: false`로는 이러한 모델의 사고 기능을 끌 수 없습니다. 명시적인 모델 추론 기능은 내장 티어 목록보다 우선하며 네이티브 비활성화 필드를 선택합니다. OpenRouter는 프로바이더 수준의 비활성화 동작을 유지합니다. 내장 필수 세트는 `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.2-codex`, `gpt-5.3-codex`, `gpt-5.2-pro`, `gpt-5.4-pro`, `gpt-5.5-pro` 및 `gpt-6-astra`입니다.

`openrouter.ai` baseURL에서는 추론 기능이 비활성화된 경우 OpenAI 파이프라인이 OpenRouter의 프로바이더 수준 `reasoning: { enabled: false }` 필드를 내보냅니다. 필수 사고 모델은 이 비활성화 필드를 수신하지 않습니다. 다른 OpenAI 호환 서버는 이 OpenRouter 전용 필드를 자동으로 수신하지 않으므로, 해당 서버의 네이티브 비활성화 제어 항목을 사용하십시오.

### `samplingParams`와의 상호 작용 (OpenAI 호환만)

> [!warning]
>
> 알려진 GPT 모델과 명시적인 추론 기능이 있는 모델을 제외하고, OpenAI 호환 제공업체에 `generationConfig.samplingParams`이 설정되면 파이프라인은 해당 키들을 **원본 그대로** 전송하며 별도의 `reasoning` 주입을 완전히 건너뜁니다. 따라서 `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }`와 같은 구성은 OpenAI/DeepSeek 요청에서 추론 필드를 조용히 삭제합니다. `samplingParams` 내부에 배치한 `reasoning` 객체는 사용자 정의 값이며 추론 기능이 활성화된 동안 변경되지 않고 전송됩니다. 위의 노력 상한선은 파이프라인이 `/effort`에서 주입하는 티어에만 적용됩니다.
>
> 알려진 GPT-5 모델과 GPT-6 Astra는 관련 없는 샘플링 키와 함께 설정된 effort를 유지합니다. 예를 들어, `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }`은 GPT-5.4에서 `temperature: 0.5` 및 평면 `reasoning_effort: 'xhigh'`을 전송하거나, GPT-5.6 / GPT-6 Astra에서는 `'max'`을 전송합니다. `openrouter.ai` baseURL에서는 동일한 클램프된 티어가 중첩된 `reasoning: { effort }`로 대신 전송됩니다. OpenRouter 엔드포인트가 아닌 경우, 명시적인 평면 reasoning 오버라이드가 우선시되며; nullish 또는 빈 문자열의 평면 플레이스홀더는 설정된 티어를 허용합니다. OpenRouter에서는 샘플링 평면 오버라이드가 명시적인 모델 기능이 이를 주입하지 않는 한 설정된 중첩 effort를 억제하며; extra-body 전용 평면 오버라이드는 설정된 중첩 effort를 대체하지 않습니다.
>
> DashScope Qwen 모델은 또 다른 예외입니다: 해당 제공자는 `reasoning`을 직접 읽고 `reasoning_effort` 또는 `enable_thinking`로 매핑합니다. 계층형 effort 패밀리에(`qwen3.8-max`, `qwen-latest-series-invite-*`, `qwen4*`)서는, 와이어 파라미터가 충돌할 때 제공자별 `samplingParams` 필드가 여전히 우선권을 가집니다; 이전 qwen 하이브리드의 경우, 설정된 effort 티어는 `enable_thinking: true`로 축소되어 `samplingParams.enable_thinking` 값을 재정의합니다.
>
> 다른 모델의 경우 `samplingParams` 사용 시 제공자의 reasoning 노브를 직접 포함하세요 — DeepSeek의 경우 `samplingParams.reasoning_effort`입니다. 알려진 GPT 모델은 설정된 effort를 자동으로 매핑합니다; 의도적으로 해당 매핑을 우회할 때만 원시(raw) 오버라이드를 추가하세요. `null`을 포함한 원시 중첩 `reasoning`은 reasoning이 활성화된 동안 전체 객체 오버라이드로 남습니다. `reasoning: false` 또는 요청 수준 `includeThoughts: false`을 통해 비활성화하면 두 레이어의 원시 오버라이드를 포함하여 중첩 값이 제거됩니다. OpenRouter가 아닌 GPT 요청은 비활성화가 허용될 때 `reasoning_effort: 'none'`을 전송합니다; OpenRouter는 대신 중첩 비활성화 필드를 사용합니다. 필수 사고(thinking) 모델은 어떤 대체제도 받지 않습니다. OpenRouter 외부에서는 그 의미가 게이트웨이에 따라 다르므로, 모델 제어는 모델 기본값을 표시합니다. 설정된 티어를 차단하는 모든 원시 오버라이드는 선호도를 저장하지 않고 명시적인 티어 변경을 실패시킵니다. thinking 스위치는 비활성화된 후에도 사고를 허용할 때만 설정된 원시 기본값을 복원합니다. 원시 상태나 설정된 reasoning 기본값이 off인 경우, thinking 스위치를 켤 수 없으며 저장된 선호도가 유지됩니다. 이는 명시적인 기능이 기본 티어를 생략하거나 thinking 토글만 노출할 때도 적용됩니다. 명시적인 기본 명령은 여전히 선호도를 재설정합니다. 다른 티어를 선택하려면 차단하는 원시 오버라이드를 제거하세요.
>
> Anthropic 및 Gemini 컨버터는 영향을 받지 않습니다 — `samplingParams`에 관계없이 항상 `reasoning.effort`을 직접 읽습니다.

### `budget_tokens`

`effort`과 함께 `budget_tokens`을 포함하여 정확한 thinking-token 예산을 고정할 수 있습니다:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Anthropic의 경우 `thinking.budget_tokens`가 됩니다. OpenAI/DeepSeek의 경우 필드는 보존되지만 현재 서버에서 무시됩니다 — `reasoning_effort`가 핵심 knob입니다.

## 제공자 모델 vs 런타임 모델

Qwen Code는 두 가지 유형의 모델 구성을 구분합니다:

### 제공자 모델

- `modelProviders` 구성에 정의됨
- 완전한 원자적 구성 패키지를 가짐
- 선택되면 구성이 침투 불가능한 계층으로 적용됨
- 전체 메타데이터(이름, 설명, 기능)와 함께 `/model` 명령 목록에 표시됨
- 다중 모델 워크플로우 및 팀 일관성에 권장

### 런타임 모델

- CLI(`--model`), 환경 변수 또는 설정을 통해 원시 모델 ID를 사용할 때 동적으로 생성됨
- `modelProviders`에 정의되지 않음
- 구성은 해결 레이어(CLI → env → settings → defaults)를 통한 "투영(projecting)"으로 빌드됩니다
- 완전한 구성이 감지되면 **RuntimeModelSnapshot**으로 자동 캡처됨
- 자격 증명을 다시 입력하지 않고 재사용 가능

### RuntimeModelSnapshot 라이프사이클

`modelProviders`을 사용하지 않고 모델을 구성하면, Qwen Code는 구성을 보존하기 위해 RuntimeModelSnapshot을 자동으로 생성합니다:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

스냅샷은:

- 모델 ID, API 키, base URL 및 생성 구성을 캡처합니다
- 세션 간에 지속됩니다(런타임 중 메모리에 저장됨)
- `/model` 명령 목록에서 런타임 옵션으로 표시됩니다
- `/model $runtime|openai|my-custom-model`을 사용하여 전환 가능

### 주요 차이점

| 측면                    | 제공자 모델                       | 런타임 모델                                |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| 구성 소스               | 설정의 `modelProviders`           | CLI, env, settings 계층                    |
| 구성 원자성             | 완전한 침투 불가능 패키지         | 계층적, 각 필드가 독립적으로 해석          |
| 재사용성                | `/model` 목록에서 항상 사용 가능  | 스냅샷으로 캡처, 완전한 경우 표시          |
| 팀 공유                 | 예(커밋된 설정을 통해)            | 아니오(사용자 로컬)                        |
| 자격 증명 저장          | `envKey`를 통한 참조만            | 스냅샷에 실제 키를 캡처할 수 있음          |

### 각각을 사용해야 하는 경우

- **제공자 모델 사용**: 팀에서 공유하는 표준 모델이 있거나, 일관된 구성이 필요하거나, 실수한 재정의 방지
- **런타임 모델 사용**: 새 모델을 빠르게 테스트하거나, 임시 자격 증명을 사용하거나, 임시 엔드포인트로 작업

## 선택 지속 및 권장 사항

> [!important]
>
> 가능한 한 사용자 범위 `~/.qwen/settings.json`에 `modelProviders`을 정의하고 모든 범위에서 자격 증명 오버라이드를 영구적으로 저장하지 마세요. 제공자 카탈로그를 사용자 설정에 유지하면 프로젝트 및 사용자 범위 간의 병합/오버라이드 충돌을 방지하고 `/auth` 및 `/model` 업데이트가 항상 일관된 범위로 다시 쓰여지도록 보장합니다.

- `/model` 및 `/auth`은 `model.name`(해당되는 경우) 및 `security.auth.selectedType`을 이미 `modelProviders`을 정의한 가장 가까운 쓰기 가능한 범위에 영구적으로 저장합니다; 그렇지 않으면 사용자 범위로 폴백합니다. 이는 워크스페이스/사용자 파일을 활성 제공자 카탈로그와 동기 상태로 유지합니다.
- `modelProviders`가 없으면 해석기가 CLI/env/settings 계층을 혼합하여 런타임 모델을 생성합니다. 단일 제공자 설정에는 괜찮지만 자주 전환할 때는 번거롭습니다. 다중 모델 워크플로우가 일반적인 경우 제공자 카탈로그를 정의하여 전환이 원자적이고, 소스가 추적 가능하며, 디버그하기 쉽게 합니다.

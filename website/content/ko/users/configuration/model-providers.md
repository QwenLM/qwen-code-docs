
# 모델 제공자

Qwen Code는 `settings.json`의 `modelProviders` 설정을 통해 여러 모델 제공자를 구성할 수 있습니다. 이를 통해 `/model` 명령을 사용하여 다양한 AI 모델과 제공자 간에 전환할 수 있습니다.

## 개요

`modelProviders`를 사용하여 `/model` 선택기가 전환할 수 있는 제공자 id별 모델을 선언합니다. 각 키는 제공자 id이며 값은 **모델 정의 배열**(`ModelConfig[]`)입니다. 내장 제공자의 경우 키는 유효한 auth 유형(`openai`, `anthropic`, `gemini`, `vertex-ai`)이어야 합니다. 사용자 정의 제공자 id(예: `idealab`)는 최상위 [`providerProtocol`](#custom-provider-ids-providerprotocol) 설정을 통해 프로토콜에 매핑하는 한 허용됩니다. 각 모델 항목에는 `id`가 필요합니다. `envKey`는 **선택 사항이며 권장됩니다**(생략 시 auth 유형의 기본 환경 키로 폴백, 예: `openai`의 경우 `OPENAI_API_KEY`). 선택적으로 `name`, `description`, `baseUrl` 및 `generationConfig`를 포함할 수 있습니다. 자격 증명은 설정에 영구 저장되지 않으며, 런타임은 `process.env[envKey]`에서 읽습니다. Qwen OAuth 모델은 하드코딩된 상태로 유지되며 재정의할 수 없습니다.

> [!note]
>
> 이전 미리보기에서는 각 제공자의 모델을 `{ "protocol": ..., "models": [...] }` 객체로 래핑했습니다. 해당 형태는 되돌려졌습니다 — 현재 값은 이 페이지 전체에 표시되는 베어 `ModelConfig[]` 배열입니다. 이미 마이그레이션된(`$version: 4`) 설정 파일의 래핑된 항목은 자동으로 건너뛰어지므로, 이전 구성을 배열 형식으로 업데이트하세요.

> [!note]
>
> `/model` 명령만 기본이 아닌 auth 유형을 노출합니다. Anthropic, Gemini 등은 `modelProviders`를 통해 정의해야 합니다. `/auth` 명령은 세 가지 최상위 옵션을 나열합니다: **Alibaba ModelStudio**(하위 메뉴에 Coding Plan, Token Plan 및 Standard API Key 포함), **Third-party Providers** 및 **Custom Provider**. (Qwen OAuth는 더 이상 선택 가능한 대화상자 항목이 아닙니다. 무료 티어는 2026-04-15에 중단되었습니다.)

> [!note]
>
> **모델 고유성:** 동일한 `authType` 내의 모델은 `id` + `baseUrl`의 조합으로 고유하게 식별됩니다. 즉, 각 항목이 다른 `baseUrl`을 가지는 한 동일한 모델 ID(예: `"gpt-4o"`)를 단일 `authType` 아래에 여러 번 정의할 수 있습니다 — 예를 들어, 하나는 OpenAI를 직접 가리키고 다른 하나는 프록시 엔드포인트를 가리킵니다. 두 항목이 동일한 `id`와 동일한 `baseUrl`을 공유하면(또는 둘 다 `baseUrl`을 생략하면) 첫 번째 항목이 우선하며 후속 중복은 경고와 함께 건너뛰어집니다.

> [!note]
>
> **핫 리로드 vs 재시작:** `settings.json`의 `modelProviders` 편집은 재시작 없이 실행 중인 대화형 세션에서 반영됩니다(파일 감시자는 약 300ms를 디바운스합니다; `/model`을 다시 열어 새 항목을 확인하세요, 현재 선택은 유지됩니다). `providerProtocol`은 시작 시 한 번 읽히며 **재시작이 필요합니다**.

### 이미지 생성 라우트

라우트가 내장 `image_gen` 도구에서 사용될 수 있으려면 `supportsImageGeneration: true`를 설정하세요. 이 기능은 `capabilities.vision`이나 `generationConfig.modalities.image`와 같은 이미지 입력 지원과는 독립적입니다.

라우트가 이미지 생성 전용이고 일반 모델 선택기에 나타나서는 안 되는 경우 `imageOnly: true`를 사용하세요. 하위 호환성을 위해 `imageOnly: true`는 이미지 생성 기능도 암시하므로 기존 설정을 마이그레이션할 필요는 없습니다.

이중 역할 라우트는 메인 모델로 선택될 수도 있고 `/model --image`를 통해서도 선택될 수 있습니다:

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

전용 이미지 라우트는 두 필드를 모두 설정합니다. `imageOnly: true`만 있는 레거시 형식도 유효합니다:

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

선택된 라우트는 명시적 HTTPS `baseUrl`과 비어 있지 않은 `envKey`를 선언해야 합니다. 이미지 생성은 라우트와 동일한 엔드포인트 및 자격 증명을 사용합니다. 채팅과 이미지 생성에 다른 엔드포인트나 자격 증명이 필요하면 두 개의 라우트를 구성하세요.

## Auth 유형별 구성 예시

아래는 다양한 인증 유형에 대한 포괄적인 구성 예시로, 사용 가능한 매개변수와 그 조합을 보여줍니다.

### 지원되는 Auth 유형

`modelProviders` 객체 키는 유효한 `authType` 값이어야 합니다. 현재 지원되는 auth 유형은:

| Auth 유형    | 설명                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 호환 API(OpenAI, Azure OpenAI, vLLM/Ollama와 같은 로컬 추론 서버)                                                                   |
| `anthropic`  | Anthropic Claude API                                                                                                                        |
| `gemini`     | Google Gemini API                                                                                                                           |
| `qwen-oauth` | Qwen OAuth(하드코딩됨, `modelProviders`에서 재정의 불가)                                                                                    |
| `vertex-ai`  | Google Vertex AI(`gemini` 프로토콜과 Vertex AI 모드의 `@google/genai` SDK 사용; 선택 시 `GOOGLE_GENAI_USE_VERTEXAI=true`를 설정) |

> [!note]
> Vertex AI 항목은 **Application Default Credentials**로 인증할 수 있습니다. `GOOGLE_CLOUD_PROJECT`를 설정하고(선택적으로 `GOOGLE_CLOUD_LOCATION`, 기본값 `global`), `envKey`를 설정하지 않은 채 해결자가 읽는 다른 모든 키 소스(`GOOGLE_API_KEY`, `settings.security.auth.apiKey`, CLI 키 플래그)도 설정하지 마세요. Vertex 항목에 도달하는 API 키 값은 Google SDK를 Vertex Express 모드로 전환하여 프로젝트, 위치 및 ADC 자격 증명을 무시합니다. `envKey`를 선언하는 항목은 절대 ADC로 라우팅되지 않으므로 주입에 실패한 키는 다른 principal로 조용히 인증하는 대신 해당 변수에서 계속 실패합니다.

> [!warning]
> 내장 프로토콜이 아니거나 `providerProtocol`을 통해 매핑되지 않은 제공자 id(예: `"openai-custom"`과 같은 오타)는 라우팅할 수 없으므로 전체 항목이 경고와 함께 **건너뛰어집니다** — 모델이 `/model` 선택기에 표시되지 않습니다. 내장 제공자의 경우 위의 지원되는 auth 유형 값 중 하나를 사용하거나, 사용자 정의 id에 대한 [`providerProtocol`](#custom-provider-ids-providerprotocol) 매핑을 추가하세요.

### 사용자 정의 제공자 id (`providerProtocol`)

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

### API 요청에 사용되는 SDK

Qwen Code는 각 제공자에 요청을 전송하기 위해 다음 공식 SDK를 사용합니다:

| Auth 유형    | SDK 패키지                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - 공식 OpenAI Node.js SDK                    |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 공식 Anthropic SDK   |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 공식 Google GenAI SDK        |
| `qwen-oauth` | 사용자 정의 제공자가 있는 [`openai`](https://www.npmjs.com/package/openai)(DashScope 호환)    |

즉, 구성한 `baseUrl`은 해당 SDK의 예상 API 형식과 호환되어야 합니다. 예를 들어, `openai` auth 유형을 사용할 때 엔드포인트는 OpenAI API 형식 요청을 수락해야 합니다.

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

### Anthropic (`anthropic`)

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

대부분의 로컬 추론 서버(vLLM, Ollama, LM Studio 등)는 OpenAI 호환 API 엔드포인트를 제공합니다. 로컬 `baseUrl`과 `openai` auth 유형을 사용하여 구성하세요:

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

큐에 대기되거나 느린 로컬 OpenAI 호환 서버의 경우, `streamIdleTimeoutMs`는 이 모델이 스트리밍된 청크 사이에 얼마나 오래 침묵할 수 있는지를 제어합니다. 선택된 제공자 항목에 대해 전역 `QWEN_STREAM_IDLE_TIMEOUT_MS` 값을 재정의합니다; `0`으로 설정하면 유휴 가드를 비활성화합니다. 별도의 15분 스트림 수명 상한은 `QWEN_STREAM_MAX_LIFETIME_MS`가 증가되거나 비활성화되지 않는 한 여전히 적용됩니다.

인증이 필요 없는 로컬 서버의 경우, API 키에 임의의 플레이스홀더 값을 사용할 수 있습니다:

```bash
# Ollama (인증 불필요)
export OLLAMA_API_KEY="ollama"

# vLLM (인증이 구성되지 않은 경우)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` 매개변수는 **OpenAI 호환 제공자(`openai`, `qwen-oauth`)에서만 지원됩니다.** Anthropic 및 Gemini 제공자에 대해서는 무시됩니다.

> [!note]
>
> **`envKey` 정보**: `envKey` 필드는 실제 API 키 값이 아닌 **환경 변수의 이름**을 지정합니다. 구성이 작동하려면 해당 환경 변수가 실제 API 키로 설정되어 있는지 확인해야 합니다. 두 가지 방법이 있습니다:
>
> - **옵션 1: `.env` 파일 사용**(보안에 권장):
>   ```bash
>   # ~/.qwen/.env (또는 프로젝트 루트)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   실수로 비밀을 커밋하는 것을 방지하려면 `.env`를 `.gitignore`에 추가하세요.
> - **옵션 2: `settings.json`의 `env` 필드 사용**(위 예시에 표시된 대로):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 각 제공자 예시에는 API 키 구성 방법을 보여주기 위해 `env` 필드가 포함되어 있습니다.

## Alibaba Cloud Coding Plan

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

지역은 인증 중에 선택되어 `modelProviders` 구성 아래의 `settings.json`에 저장됩니다. 지역을 전환하려면 `/auth` 명령을 다시 실행하고 다른 지역을 선택하세요.

### API 키 저장

`/auth` 명령을 통해 Coding Plan을 구성하면 API 키는 예약된 환경 변수 이름 `BAILIAN_CODING_PLAN_API_KEY`를 사용하여 저장됩니다. 기본적으로 `settings.json` 파일의 `env` 필드에 저장됩니다.

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

Coding Plan 모델 구성은 버전 관리됩니다. Qwen Code가 모델 템플릿의 새 버전을 감지하면 업데이트를 요청합니다. 업데이트를 수락하면:

- 기존 Coding Plan 모델 구성이 최신 버전으로 대체됩니다
- 수동으로 추가한 사용자 정의 모델 구성은 보존됩니다
- 선택한 모델은 변경되지 않습니다; 업데이트된 구성에 더 이상 없는 경우 `/model`을 사용하여 새 모델을 선택하세요

업데이트 과정은 선택한 모델을 변경하지 않고 모델 구성과 기능을 새로 고칩니다.

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
> - **자동 업데이트는** 수동으로 구성된 Coding Plan 모델에 적용되지 **않습니다**

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

\*존재하는 경우 CLI auth 플래그가 설정을 재정의합니다. 그렇지 않으면 `security.auth.selectedType` 또는 암묵적 기본값이 auth 유형을 결정합니다. Qwen OAuth와 OpenAI는 추가 구성 없이 노출되는 유일한 auth 유형입니다.

> [!note]
>
> `--openai-api-key`와 `--openai-base-url`는 유일한 자격 증명 CLI 플래그입니다. 이들은 이름과 관계없이 활성 OpenAI 호환 제공자에 적용됩니다 — `--anthropic-*` / `--gemini-*` 자격 증명 플래그는 없습니다. CLI에서 전달되지 않은 제공자별 자격 증명은 환경 변수에서 해석됩니다(아래 행 참조).

> [!warning]
>
> **`security.auth.apiKey` 및 `security.auth.baseUrl`의 지원 중단:** `settings.json`에서 `security.auth.apiKey`와 `security.auth.baseUrl`를 통해 API 자격 증명을 직접 구성하는 것은 지원 중단되었습니다. 이러한 설정은 역사적 버전에서 UI를 통해 입력된 자격 증명에 사용되었지만, 자격 증명 입력 흐름은 버전 0.10.1에서 제거되었습니다. 이 필드는 향후 릴리스에서 완전히 제거됩니다. **모든 모델 및 자격 증명 구성에 대해 `modelProviders`로 마이그레이션하는 것을 강력히 권장합니다.** 설정 파일에 자격 증명을 하드코딩하는 대신 `modelProviders`에서 `envKey`를 사용하여 환경 변수를 참조하여 안전한 자격 증명 관리를 하세요.

## Generation Config 계층화: 침투 불가능한 제공자 계층

구성 해석은 하나의 중요한 규칙을 가진 엄격한 계층화 모델을 따릅니다: **modelProvider 계층은 침투 불가능합니다**.

### 작동 방식

1. **modelProvider 모델이 선택된 경우**(예: `/model` 명령으로 제공자 구성 모델 선택):
   - 제공자의 전체 `generationConfig`가 **원자적으로** 적용됩니다
   - **제공자 계층은 완전히 침투 불가능합니다** — 하위 계층(CLI, env, settings)은 generationConfig 해석에 전혀 참여하지 않습니다
   - `modelProviders[].generationConfig`에 정의된 모든 필드는 제공자의 값을 사용합니다
   - 제공자가 정의하지 **않은** 모든 필드는 `undefined`로 설정됩니다(settings에서 상속되지 않음)
   - 이렇게 하면 제공자 구성이 완전한 자체 포함 "봉인된 패키지"로 작동합니다

   모델이 `modelProviders`에 나열되면, 해당 모델에 대한 모든 모델별 generation 설정을 일치하는 제공자 항목에 넣으세요. 최상위 `model.generationConfig` 값은 `contextWindowSize`, `modalities`, `customHeaders` 및 `extra_body`를 포함하여 제공자 모델에 대해 무시됩니다. 적용되려면 `modelProviders[authType][].generationConfig` 아래에서 이러한 필드를 구성하세요.

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

### 원자적 필드 처리

다음 필드는 원자적 객체로 취급됩니다 - 제공자 값이 전체 객체를 완전히 대체하며, 병합이 발생하지 않습니다:

- `samplingParams` - Temperature, top_p, max_tokens 등
- `customHeaders` - 사용자 정의 HTTP 헤더
- `extra_body` - 추가 요청 본문 매개변수

### 예시

```jsonc
// 사용자 설정 (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders 구성
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

`generationConfig` 아래의 선택적 `reasoning` 필드는 모델이 응답하기 전에 얼마나 적극적으로 추론하는지를 제어합니다. Anthropic 및 Gemini 변환기는 항상 이를 존중합니다. OpenAI 호환 파이프라인은 `generationConfig.samplingParams`가 설정되지 **않은 경우에만** 존중합니다 — 아래 "interaction with `samplingParams`" 주의 사항을 참조하세요.

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
          // 4단계 스케일:
          //   'low'    | 'medium' — DeepSeek에서 서버 측 'high'로 매핑
          //   'high'   — 기본 추론 강도
          //   'max'    — DeepSeek 전용 추가 강력한 티어
          // 또는 추론을 완전히 비활성화하려면 `false`를 설정합니다.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### 제공자별 동작

| 프로토콜 / 제공자                            | 전송 형태                                                            | 참고 사항                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OpenAI / DashScope** (`qwen3.8-max` 패밀리) | 플랫 `reasoning_effort: <effort>` 본문 매개변수                     | `/effort` 티어는 `qwen3.8-max`로 시작하는 모델 id(날짜 스냅샷 및 `-latest` 별칭 포함)에 대해 그대로 전달되며, DashScope는 모델별 매핑을 적용합니다. 이 패밀리의 사다리는 `xhigh`에서 멈추므로 구성된 `max`는 전송 후 거부되는 대신 `xhigh`로 제한됩니다(한 번 로그됨). `samplingParams` 또는 `extra_body`의 명시적 `reasoning_effort`는 그대로 재정의되며 제한되지 않습니다. `reasoning_effort`와 `thinking_budget`가 충돌하면 일반적인 `extra_body` > `samplingParams` > `reasoning` 우선순위로 더 높은 우선순위의 필드만 유지됩니다. 명시적 동일 계층 쌍은 `reasoning_effort`를 유지하여 교차 계층 해석 전 제공자의 동작과 일치합니다. 정적 필드가 이기면 `/effort`는 요청된 티어가 유효하다고 암시하는 대신 해당 필드를 보고합니다. effort 티어가 이기면 충돌하는 `enable_thinking`도 삭제됩니다. `extra_body`의 명시적 `enable_thinking: false`는 삭제되지 않고 존중됩니다: 구성된 티어를 `reasoning_effort: 'none'`으로 재정의하며, `extra_body`가 그대로 이기지 않는 몇 안 되는 장소 중 하나입니다. 다른 Qwen 모델은 선택된 effort를 `enable_thinking: true`로 계속 매핑합니다. `reasoning_effort` 재정의는 `thinking_budget`와 충돌하지 않는 한 그대로 전달됩니다(DashScope가 거부하는 쌍). 충돌하는 경우 비활성 `reasoning_effort`가 삭제되고 `enable_thinking`과 `thinking_budget` 모두 유지됩니다. |
| **OpenAI / DeepSeek** (`api.deepseek.com`)    | 플랫 `reasoning_effort: <effort>` 본문 매개변수                     | 중첩 구성 형태에서 `reasoning.effort`가 설정되면 플랫 `reasoning_effort`로 재작성되고 `'low'`/`'medium'`은 `'high'`로, `'xhigh'`는 `'max'`로 정규화됩니다 — DeepSeek의 [서버 측 하위 호환성](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)을 미러링합니다. 최상위 `samplingParams.reasoning_effort` 또는 `extra_body.reasoning_effort` 재정의는 이 정규화를 건너뛰고 그대로 전송됩니다. `max`는 실제 DeepSeek 호스트에서만 수락되며, 다른 호스트의 `deepseek` 이름 모델은 일반적인 `xhigh` 상한을 유지합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OpenAI / Z.ai** (`z.ai`, `bigmodel.cn`)     | 플랫 `reasoning_effort: <effort>` 본문 매개변수                     | Z.ai 호스트의 GLM-5.2+는 `max`를 포함한 전체 사다리를 사용하며, 중첩된 `reasoning.effort`가 플랫 필드로 재작성됩니다. 이전 GLM id와 다른 호스트의 `glm-*` 모델은 일반적인 `xhigh` 상한을 유지합니다: 모델 이름만으로는 해당 엔드포인트가 무엇을 수락하는지 알 수 없습니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **OpenAI** (기타 호환 서버)                   | `reasoning: { effort, ... }` 그대로 전달                             | 구성된 `max`는 `xhigh`로 제한됩니다(한 번 로그됨). `max`는 일반 OpenAI 사다리의 일부가 아닌 벤더 확장입니다. 제공자가 다른 형태를 예상하는 경우 `samplingParams`를 통해 설정합니다(예: GPT-5/o-series의 `samplingParams.reasoning_effort`). 명시적 `samplingParams` / `extra_body` 값은 제한되지 않습니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Anthropic** (실제 `api.anthropic.com`)      | `output_config: { effort }` 및 `effort-2025-11-24` 베타 헤더       | 실제 Anthropic은 `'low'`/`'medium'`/`'high'`만 수락합니다. `'max'`는 `debugLogger.warn` 라인과 함께 **`'high'`로 제한됩니다**(생성기당 한 번). 최대 effort를 원하려면 지원하는 DeepSeek 호환 엔드포인트로 baseURL을 전환하세요.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Anthropic** (`api.deepseek.com/anthropic`)  | 동일한 `output_config: { effort }` + 베타 헤더                     | `'max'`가 변경 없이 전달됩니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Gemini** (`@google/genai`)                  | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, 기타 → `THINKING_LEVEL_UNSPECIFIED`(Gemini에는 `MAX` 티어가 없음).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### `reasoning: false`

`reasoning: false`(리터럴 부울)를 설정하면 모든 제공자에서 추론이 명시적으로 비활성화됩니다 — 추론의 이점이 없는 저렴한 사이드 쿼리에 유용합니다. 이는 일회성 호출(예: 제안 생성)에 대해 `request.config.thinkingConfig.includeThoughts: false`를 통해 요청 수준에서도 존중됩니다.

`api.deepseek.com` baseURL에서 OpenAI 파이프라인은 DeepSeek V4+가 요구하는 명시적 `thinking: { type: 'disabled' }` 필드를 내보냅니다 — 서버 측 기본값은 `'enabled'`이므로 `reasoning_effort`를 생략하기만 하면 여전히 사고 지연/비용이 발생합니다. 자체 호스팅 DeepSeek 백엔드(sglang/vllm) 및 기타 OpenAI 호환 서버는 이 필드를 받지 **않습니다**. 이러한 서버에서 사고를 비활성화해야 하는 경우 `samplingParams`/`extra_body`를 통해 `thinking: { type: 'disabled' }`(또는 추론 프레임워크가 노출하는 Knob)를 주입하세요.

`openrouter.ai` baseURL에서 OpenAI 파이프라인은 추론이 비활성화되면 OpenRouter의 제공자 수준 `reasoning: { enabled: false }` 필드를 내보냅니다. 다른 OpenAI 호환 서버는 이 OpenRouter 전용 필드를 받지 않습니다. 해당 서버의 기본 비활성화 knob에는 `samplingParams`/`extra_body`를 사용하세요.

### `samplingParams`와의 상호 작용 (OpenAI 호환만)

> [!warning]
>
> OpenAI 호환 제공자에서 `generationConfig.samplingParams`가 설정되면 파이프라인은 해당 키를 **그대로** 전송하고 별도의 `reasoning` 주입을 완전히 건너뜁니다. 따라서 `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }`와 같은 구성은 OpenAI/DeepSeek 요청에서 추론 필드를 조용히 삭제합니다. `samplingParams` 안에 배치된 `reasoning` 객체는 사용자 자신의 값이며 변경 없이 전송됩니다. 위의 effort 상한은 파이프라인이 `/effort`에서 주입하는 티어에만 적용됩니다.
>
> DashScope Qwen 모델은 예외입니다. 해당 제공자는 `reasoning`을 직접 읽고 `reasoning_effort` 또는 `enable_thinking`으로 매핑합니다. qwen3.8-max 패밀리에서는 제공자별 `samplingParams` 필드가 와이어 매개변수가 충돌할 때 여전히 우선합니다. 이전 qwen 하이브리드에서는 구성된 effort 티어가 `enable_thinking: true`로 축약되어 `samplingParams.enable_thinking` 값을 재정의합니다.
>
> `samplingParams`를 설정하면 그 안에 추론 knob을 직접 포함하세요 — DeepSeek의 경우 `samplingParams.reasoning_effort`, GPT-5/o-series의 경우 `samplingParams.reasoning_effort`(플랫 필드) 또는 `samplingParams.reasoning`(중첩 객체). OpenRouter 및 기타 제공자의 경우 필드 이름이 다릅니다. 제공자 문서를 참조하세요.
>
> Anthropic 및 Gemini 변환기는 영향을 받지 않습니다 — `samplingParams`와 관계없이 항상 `reasoning.effort`를 직접 읽습니다.

### `budget_tokens`

`effort`와 함께 `budget_tokens`를 포함하여 정확한 사고 토큰 예산을 고정할 수 있습니다:

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
- 구성이 해석 계층(CLI → env → settings → 기본값)을 "투영"하여 구축됨
- 완전한 구성이 감지되면 **RuntimeModelSnapshot**으로 자동 캡처됨
- 자격 증명을 다시 입력하지 않고 재사용 가능

### RuntimeModelSnapshot 수명 주기

`modelProviders`를 사용하지 않고 모델을 구성하면 Qwen Code가 구성을 보존하기 위해 자동으로 RuntimeModelSnapshot을 생성합니다:

```bash
# ID가 $runtime|openai|my-custom-model인 RuntimeModelSnapshot을 생성
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

스냅샷:

- 모델 ID, API 키, 기본 URL 및 generation config를 캡처
- 세션 간 지속(런타임 중 메모리에 저장)
- 런타임 옵션으로 `/model` 명령 목록에 표시
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
> 가능한 경우 사용자 범위 `~/.qwen/settings.json`에 `modelProviders`를 정의하고 어떤 범위에서도 자격 증명 재정의을 지속하지 마세요. 제공자 카탈로그를 사용자 설정에 유지하면 프로젝트 범위와 사용자 범위 간의 병합/재정의 충돌을 방지하고 `/auth` 및 `/model` 업데이트가 항상 일관된 범위로 다시 쓰이도록 보장합니다.

- `/model` 및 `/auth`는 `modelProviders`를 이미 정의하는 가장 가까운 쓰기 가능한 범위에 `model.name`(해당되는 경우) 및 `security.auth.selectedType`을 지속합니다. 그렇지 않으면 사용자 범위로 폴백합니다. 이렇게 하면 작업 공간/사용자 파일이 활성 제공자 카탈로그와 동기화됩니다.
- `modelProviders`가 없으면 해석기가 CLI/env/settings 계층을 혼합하여 런타임 모델을 생성합니다. 단일 제공자 설정에는 괜찮지만 자주 전환할 때는 번거롭습니다. 다중 모델 워크플로우가 일반적인 경우 제공자 카탈로그를 정의하여 전환이 원자적이고, 소스가 추적 가능하며, 디버그하기 쉽게 합니다.

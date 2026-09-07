
# 인증

Qwen Code의 첫 실행 `/auth` 메뉴에는 세 가지 최상위 옵션이 있습니다. CLI를 실행하려는 방식에 맞는 것을 선택하세요:

- **Alibaba ModelStudio**: 공식 권장 설정. **Coding Plan**(개인 개발자용 · 주간 할당량 포함), **Token Plan**(팀 및 회사용 · 전용 엔드포인트의 사용량 기반 과금) 또는 **Standard API Key**(기존 ModelStudio API 키로 연결) 중 하나를 선택하는 하위 메뉴를 엽니다.
- **Third-party Providers**: 내장 제공자를 선택하고 API 키로 연결합니다(DeepSeek, Grok, MiniMax, Z.AI, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider**: 로컬 서버, 프록시 또는 지원되지 않는 제공자를 수동으로 연결합니다 — OpenAI, Anthropic, Gemini 및 기타 호환 엔드포인트를 지원합니다.

> [!note]
>
> **Qwen OAuth**는 더 이상 선택 가능한 대화상자 항목이 아닙니다 — 무료 티어는 2026-04-15에 중단되었습니다. 아래에는 하드코딩된 중단된 제공자로만 문서화되어 있습니다.

## 옵션 1: Qwen OAuth (중단됨)

> [!warning]
>
> Qwen OAuth 무료 티어는 2026-04-15에 중단되었습니다. 기존 캐시된 토큰은 잠시 계속 작동할 수 있지만, 새 요청은 거부됩니다. Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) 또는 다른 제공자로 전환하세요. `qwen`을 실행하고 `/auth`를 사용하여 구성하세요.

- **작동 방식**: 첫 시작 시 Qwen Code가 브라우저 로그인 페이지를 엽니다. 완료 후 자격 증명이 로컬에 캐시되어 일반적으로 다시 로그인할 필요가 없습니다.
- **요구 사항**: `qwen.ai` 계정 + 인터넷 접근(최소 첫 로그인 시).
- **이점**: API 키 관리 불필요, 자동 자격 증명 갱신.
- **비용 및 할당량**: 무료 티어는 2026-04-15부로 중단되었습니다.

CLI를 시작하고 브라우저 흐름을 따르세요:

```bash
qwen
```

Qwen OAuth는 더 이상 `/auth` 대화상자에서 선택 가능한 항목으로 제공되지 않습니다. `/auth`를 실행하고 현재 옵션 중 하나(Alibaba ModelStudio, Third-party Providers 또는 Custom Provider)를 대신 선택하세요.

> [!note]
>
> 비대화형 또는 헤드리스 환경(예: CI, SSH, 컨테이너)에서는 일반적으로 OAuth 브라우저 로그인 흐름을 **완료할 수 없습니다**.
> 이러한 경우 Alibaba Cloud Coding Plan 또는 API Key 인증 방법을 사용하세요.

## 💳 옵션 2: Alibaba Cloud Coding Plan

예측 가능한 비용과 다양한 모델 옵션 및 더 높은 사용량 할당량을 원하는 경우 사용하세요.

- **작동 방식**: 고정 월 요금으로 Coding Plan을 구독한 다음, 전용 엔드포인트와 구독 API 키를 사용하도록 Qwen Code를 구성합니다.
- **요구 사항**: [Alibaba Cloud ModelStudio(베이징)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) 또는 [Alibaba Cloud ModelStudio(국제)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)에서 계정 지역에 따라 활성 Coding Plan 구독을 획득합니다.
- **이점**: 다양한 모델 옵션, 더 높은 사용량 할당량, 예측 가능한 월 비용, 다양한 모델(Qwen, GLM, Kimi, Minimax 등)에 대한 접근.
- **비용 및 할당량**: Aliyun ModelStudio Coding Plan 문서 [베이징](https://bailian.console.aliyun.com/?tab=doc#/doc/?type=model&url=3005961)[국제](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)를 참조하세요.

Alibaba Cloud Coding Plan은 두 지역에서 사용 가능합니다:

| 지역                         | 콘솔 URL                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (베이징)  | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (국제)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### 대화형 설정

터미널에서 `qwen`을 입력하여 Qwen Code를 실행한 다음, `/auth` 명령을 실행하고 **Alibaba ModelStudio**를 선택한 후 하위 메뉴에서 **Coding Plan**을 선택합니다. 지역을 선택한 다음 `sk-sp-xxxxxxxxx` 키를 입력합니다.

인증 후 `/model` 명령을 사용하여 모든 Alibaba Cloud Coding Plan 지원 모델(qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 및 MiniMax-M2.5 포함) 간에 전환합니다.

### 헤드리스 또는 스크립트 설정

CI, 컨테이너 또는 스크립트의 경우 제거된 `qwen auth coding-plan` 명령 대신 환경 변수 또는 `settings.json`으로 Coding Plan을 구성합니다.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

중국(베이징) 엔드포인트에는 `https://coding.dashscope.aliyuncs.com/v1`을, 국제 엔드포인트에는 `https://coding-intl.dashscope.aliyuncs.com/v1`을 사용하세요.

### 대안: `settings.json`을 통한 구성

대화형 `/auth` 흐름을 건너뛰려면 `~/.qwen/settings.json`에 다음을 추가하세요:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> Coding Plan은 표준 Dashscope 엔드포인트와 다른 전용 엔드포인트(`https://coding.dashscope.aliyuncs.com/v1`)를 사용합니다. 올바른 `baseUrl`을 사용하세요.

## 🚀 옵션 3: API Key (유연한)

OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope 또는 자체 호스팅 엔드포인트와 같은 타사 제공자에 연결하려는 경우 사용하세요. 여러 프로토콜과 제공자를 지원합니다.

### 권장: `settings.json`을 통한 단일 파일 설정

API Key 인증으로 시작하는 가장 간단한 방법은 모든 것을 단일 `~/.qwen/settings.json` 파일에 넣는 것입니다. 다음은 완전하고 바로 사용할 수 있는 예시입니다:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder via Dashscope",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

각 필드의 역할:

| 필드                         | 설명                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | 사용 가능한 모델과 연결 방법을 선언합니다. 키(`openai`, `anthropic`, `gemini`)는 API 프로토콜을 나타냅니다.                                      |
| `env`                        | `settings.json`에 직접 API 키를 저장합니다(최하위 우선순위 — 셸 `export` 및 `.env` 파일이 우선).                                                  |
| `security.auth.selectedType` | 시작 시 Qwen Code가 사용할 프로토콜을 알려줍니다(예: `openai`, `anthropic`, `gemini`). 이 설정이 없으면 대화형으로 `/auth`를 실행해야 합니다.    |
| `model.name`                 | Qwen Code 시작 시 활성화할 기본 모델. `modelProviders`의 `id` 값 중 하나와 일치해야 합니다.                                                     |

파일을 저장한 후 `qwen`을 실행하면 됩니다 — 대화형 `/auth` 설정이 필요 없습니다.

> [!tip]
>
> 아래 섹션에서 각 부분을 더 자세히 설명합니다. 위의 빠른 예시가 잘 작동한다면 [보안 참고 사항](#security-notes)으로 건너뛰어도 됩니다.

핵심 개념은 **모델 제공자**(`modelProviders`)입니다: Qwen Code는 OpenAI 외에도 여러 API 프로토콜을 지원합니다. `~/.qwen/settings.json`을 편집하여 어떤 제공자와 모델을 사용할 수 있는지 구성한 다음, 런타임에 `/model` 명령으로 전환합니다.

#### 지원되는 프로토콜

| 프로토콜          | `modelProviders` 키 | 환경 변수                                                                                       | 제공자                                                                                             |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| OpenAI 호환       | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`(별칭: `QWEN_MODEL`)                        | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, 모든 OpenAI 호환 엔드포인트 |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                   | Anthropic Claude                                                                                    |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                | Google Gemini                                                                                       |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY` + `GOOGLE_MODEL`(`GOOGLE_GENAI_USE_VERTEXAI=true` 설정) 또는 `GOOGLE_CLOUD_PROJECT` + `GOOGLE_MODEL`(키 없는 ADC); `gemini` 프로토콜 사용 | Google Vertex AI                                                                                      |

#### 1단계: `~/.qwen/settings.json`에서 모델 및 제공자 구성

각 프로토콜에 대해 사용 가능한 모델을 정의합니다. 각 모델 항목에는 최소한 `id`가 필요합니다. `envKey`(API 키를 보관하는 환경 변수 이름)는 선택 사항이며 권장됩니다 — 생략 시 auth 유형의 기본 환경 키(예: `openai`의 경우 `OPENAI_API_KEY`)로 폴백됩니다.

> [!important]
>
> 프로젝트 설정과 사용자 설정 간의 병합 충돌을 피하기 위해 사용자 범위 `~/.qwen/settings.json`에 `modelProviders`를 정의하는 것이 권장됩니다.

`~/.qwen/settings.json`을 편집합니다(없으면 생성). 단일 파일에서 여러 프로토콜을 혼합할 수 있습니다 — 다음은 `modelProviders` 섹션만 보여주는 다중 제공자 예시입니다:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> `modelProviders`와 함께 `env`, `security.auth.selectedType` 및 `model.name`도 설정하는 것을 잊지 마세요 — 참조는 [위의 완전한 예시](#recommended-one-file-setup-via-settingsjson)를 참조하세요.

**`ModelConfig` 필드(`modelProviders` 내의 각 항목):**

| 필드               | 필수 | 설명                                                                                                                                          |
| ------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | 예   | API로 전송되는 모델 ID(예: `gpt-4o`, `claude-sonnet-4-20250514`)                                                                             |
| `name`             | 아니오 | `/model` 선택기의 표시 이름(기본값은 `id`)                                                                                                  |
| `envKey`           | 아니오 | API 키의 환경 변수 이름(예: `OPENAI_API_KEY`); 선택 사항/권장 — 생략 시 auth 유형의 기본 환경 키로 기본 설정                                 |
| `baseUrl`          | 아니오 | API 엔드포인트 재정의(프록시 또는 사용자 정의 엔드포인트에 유용)                                                                             |
| `generationConfig` | 아니오 | `timeout`, `maxRetries`, `samplingParams` 등을 미세 조정                                                                                      |

> [!note]
>
> `settings.json`의 `env` 필드를 사용할 때, 자격 증명은 평문으로 저장됩니다. 더 나은 보안을 위해 `.env` 파일 또는 셸 `export`를 선호합니다 — [2단계](#step-2-set-environment-variables)를 참조하세요.

`modelProviders`의 전체 스키마 및 `generationConfig`, `customHeaders` 및 `extra_body`와 같은 고급 옵션에 대해서는 [모델 제공자 레퍼런스](./model-providers.md)를 참조하세요.

#### 2단계: 환경 변수 설정

Qwen Code는 모델 구성의 `envKey`로 지정된 환경 변수에서 API 키를 읽습니다. 아래에 **최우선에서 최하위 우선순위** 순으로 나열된 여러 방법이 있습니다:

**1. 셸 환경 / `export`(최우선)**

셸 프로필(`~/.zshrc`, `~/.bashrc` 등)에서 직접 설정하거나 시작 전에 인라인으로 설정합니다:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI 호환
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` 파일**

Qwen Code는 찾는 **첫 번째** `.env` 파일을 자동 로드합니다(여러 파일 간에 변수가 **병합되지 않음**). `process.env`에 아직 없는 변수만 로드됩니다.

검색 순서(현재 디렉토리에서 `/`를 향해 위로 올라가며 검색):

1. `.qwen/.env`(권장 — Qwen Code 변수를 다른 도구와 격리)
2. `.env`

아무것도 찾지 못하면 **홈 디렉토리**로 폴백합니다:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 다른 도구와의 충돌을 피하기 위해 `.env`보다 `.qwen/.env`가 권장됩니다. 일부 변수(`DEBUG` 및 `DEBUG_MODE` 등)는 Qwen Code 동작에 간섭하는 것을 방지하기 위해 프로젝트 수준 `.env` 파일에서 제외됩니다.

**3. `settings.json` → `env` 필드(최하위 우선순위)**

`~/.qwen/settings.json`의 `env` 키 아래에 직접 API 키를 정의할 수도 있습니다. 이들은 **최하위 우선순위 폴백**으로 로드됩니다 — 시스템 환경 또는 `.env` 파일에서 변수가 이미 설정되지 않은 경우에만 적용됩니다.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

이것은 [단일 파일 설정 예시](#recommended-one-file-setup-via-settingsjson)에서 사용되는 접근 방식입니다. 모든 것을 한 곳에 보관하기에 편리하지만, `settings.json`이 공유되거나 동기화될 수 있으므로 민감한 비밀에는 `.env` 파일을 선호하세요.

**우선순위 요약:**

| 우선순위     | 소스                           | 재정의 동작                                 |
| ------------ | ------------------------------ | -------------------------------------------- |
| 1 (최우선)   | CLI 플래그(`--openai-api-key`) | 항상 우선                                    |
| 2            | 시스템 환경(`export`, 인라인)  | `.env` 및 `settings.json` → `env`를 재정의  |
| 3            | `.env` 파일                    | 시스템 환경에 없는 경우에만 설정             |
| 4 (최하위)   | `settings.json` → `env`        | 시스템 환경이나 `.env`에 없는 경우에만 설정  |

#### 3단계: `/model`로 모델 전환

Qwen Code를 시작한 후 `/model` 명령을 사용하여 구성된 모든 모델 간에 전환합니다. 모델은 프로토콜별로 그룹화됩니다:

```
/model
```

선택기는 `modelProviders` 구성의 모든 모델을 프로토콜별(예: `openai`, `anthropic`, `gemini`)로 그룹화하여 표시합니다. 선택은 세션 간에 지속됩니다.

명령줄 인수로 모델을 직접 전환할 수도 있으며, 여러 터미널에서 작업할 때 편리합니다.

```bash
# 한 터미널에서

qwen --model "qwen3-coder-plus"

# 다른 터미널에서

qwen --model "qwen3.5-plus"
```

## 제거된 `qwen auth` CLI 명령

독립 실행형 `qwen auth` CLI 명령이 제거되었습니다. 대신 다음 대체 방법을 사용하세요:

| 이전 사용 사례                   | 대체 방법                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| 대화형 인증 설정                 | `qwen`을 실행한 다음 `/auth` 사용                                                    |
| Coding Plan 설정                 | `/auth` 사용 또는 Coding Plan 기본 URL과 함께 `BAILIAN_CODING_PLAN_API_KEY` 설정     |
| OpenRouter 설정                  | `/auth` 사용 또는 `OPENROUTER_API_KEY` 및 `OPENAI_BASE_URL=https://openrouter.ai/api/v1` 설정 |
| Requesty 설정                    | `/auth` 사용 또는 `REQUESTY_API_KEY` 및 `OPENAI_BASE_URL=https://router.requesty.ai/v1` 설정  |
| API 키 또는 사용자 정의 제공자 설정 | `~/.qwen/settings.json`, `.env` 또는 제공자별 환경 변수 구성                        |
| 현재 인증 확인                   | Qwen Code 내부에서 `/doctor` 실행                                                    |
| OAuth 브라우저 흐름              | `qwen`을 대화형으로 실행하고 `/auth` 사용; OAuth는 환경 변수만으로는 구성할 수 없음  |

`qwen auth status`와 같은 레거시 호출은 이제 이러한 마이그레이션 경로와 함께 제거 알림을 출력합니다.

## 보안 참고 사항

- API 키를 버전 관리에 커밋하지 마세요.
- 프로젝트 로컬 비밀에는 `.qwen/.env`를 선호하세요(git에서 제외).
- 검증을 위해 자격 증명을 출력하는 경우 터미널 출력을 민감한 것으로 취급하세요.

# 인증

Qwen Code의 첫 실행 `/auth` 메뉴에는 다섯 가지 최상위 옵션이 있습니다. CLI를 실행하려는 방식에 맞는 항목을 선택하세요:

- [**구독이 포함된 Qwen 계정**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli): [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)에서 **Plus 또는 Pro 구독**으로 **Qwen Code 및 Agent**에 접근하기 위해 **Qwen OAuth**를 통해 Qwen 계정으로 로그인합니다. 아직 구독이 없다면, [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)를 방문하여 Plus 또는 Pro에 가입한 후 Qwen Code로 돌아와 [**구독이 포함된 Qwen 계정**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)을 선택하세요.
- **QwenCloud**: 공식적으로 권장되는 설정입니다. **Token Plan**(월간 Credit 할당량이 있는 구독 · 전용 엔드포인트, Personal 및 Team 에디션) 또는 **Standard API Key**(종량제)이 포함된 하위 메뉴가 열립니다. 그런 다음 플랫폼을 명시적으로 선택합니다 — **China — Qianwen AI Platform** 또는 **International — QwenCloud** — UI 언어가 엔드포인트를 결정하지 않도록 합니다. 두 접근 방법 모두 추가 설정 없이 내장된 [`web_search` 도구](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/)를 활성화합니다.
- **Alibaba ModelStudio**: **Coding Plan**(개인 개발자용 · 주간 할당량 포함), **Token Plan**(팀 및 기업용 · 사용량 기반 과금 및 전용 엔드포인트) 또는 **Standard API Key**(기존 ModelStudio API 키로 연결)가 포함된 하위 메뉴가 열립니다. Token Plan과 Standard API Key도 추가 설정 없이 내장된 [`web_search` 도구](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/)를 활성화합니다. 저장된 ModelStudio 자격 증명, 엔드포인트 및 모델은 변경되지 않고 계속 작동합니다.
- **Third-party Providers**: 내장 제공자를 선택하고 API 키로 연결합니다(DeepSeek, Grok, MiniMax, Z.AI, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider**: 로컬 서버, 프록시 또는 지원되지 않는 제공자를 수동으로 연결합니다 — OpenAI, Anthropic, Gemini 및 기타 호환 엔드포인트를 지원합니다.

## **옵션 1: Qwen OAuth —** [**구독이 포함된 Qwen 계정**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)

Qwen OAuth를 사용하면 Qwen 계정으로 로그인하고 [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)의 **Plus 또는 Pro 구독**을 사용하여 **Qwen Code 및 Agent**에 접근할 수 있습니다. 첫 실행 메뉴나 `/auth` 대화 상자를 열고 시작하려면 [**구독이 포함된 Qwen 계정**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)을 선택하세요.

- **작동 방식**: [**구독이 포함된 Qwen 계정**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)을 선택하고 브라우저 로그인 절차를 따라 Qwen 계정으로 Qwen Code를 인증하세요.
- **요구 사항**: [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)의 활성 **Plus 또는 Pro 구독**이 있는 Qwen 계정과 인터넷 접속 환경.
- **혜택**: API 키를 수동으로 구성하지 않고도 Qwen 구독을 통해 **Qwen Code 및 Agent**에 접근할 수 있습니다.
- **비용 및 할당량**: 사용량은 구독 플랜에 따릅니다. Plus 및 Pro 플랜 세부 정보는 [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)에서 확인하세요.

### **대화형 설정**

1. 아직 구독이 없다면 [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)를 방문하여 **Plus 또는 Pro**에 가입하세요. 이미 활성 구독이 있다면 다음 단계로 진행하세요.
2. 터미널에서 Qwen Code를 시작하세요:

   ```bash
   qwen
   ```

3. 첫 실행 메뉴에서 [**구독이 포함된 Qwen 계정**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)을 선택하세요. Qwen Code가 이미 실행 중이라면 `/auth`을 입력하여 인증 메뉴를 열고 동일한 옵션을 선택하세요.
4. [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)에서 **구독할 때 사용한 것과 동일한 Qwen 계정**을 사용하여 브라우저 로그인 및 인증 절차를 완료하세요.
5. Qwen Code로 돌아가 구독을 사용하여 작업을 시작하세요.

CI나 무인 컨테이너처럼 브라우저 로그인 절차를 완료할 수 없는 비대화형 환경에서는 대신 API 키 기반 인증 방법을 사용하세요.

## ☁️ 옵션 2: QwenCloud

공식 플랫폼 진입점입니다. API 키가 Qianwen AI Platform(중국) 또는 QwenCloud(국제)에서 발급된 경우 이 옵션을 선택하세요.

- **작동 방식**: 접근 방법을 선택한 후 플랫폼을 명시적으로 선택합니다 — UI 언어는 엔드포인트를 결정하지 않습니다. 해당 플랫폼에서 발급된 키를 입력하면 Qwen Code가 일치하는 엔드포인트를 구성합니다.
- **접근 방법**: **Token Plan**(전용 엔드포인트에서 월간 Credit 할당량이 있는 구독; Personal 및 Team 에디션) 또는 **Standard API Key**(종량제). Coding Plan은 여기서 제공 _되지_ 않습니다 — Alibaba ModelStudio 제품이며, 옵션 3을 참조하세요.
- **요구 사항**: Token Plan 콘솔에서 생성된 Token Plan 키(`sk-sp-` 접두사) 또는 플랫폼의 API 키 페이지에서 발급된 종량제 키(`sk-` 또는 `sk-ws-` 접두사).
- **혜택**: 두 접근 방법 모두 추가 설정 없이 내장된 [`web_search` 도구](../../developers/tools/web-search.md)를 활성화합니다.

| 플랫폼                  | 접근 방법    | 엔드포인트                                                      | API 키                                                                                  |
| ------------------------- | ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 중국 — Qianwen AI Platform | 표준 API 키 | `https://maas.qianwenaiapi.com/compatible-mode/v1` | [API 키](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) |
| 중국 — Qianwen AI Platform | 토큰 플랜 | `https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1` | [토큰 플랜](https://platform.qianwenai.com/docs/token-plan/overview) |
| 국제 — QwenCloud | 표준 API 키 | `https://maas.qwencloudapi.com/compatible-mode/v1` | [API 키](https://docs.qwencloud.com/developer-guides/administration/api-keys) |
| 국제 — QwenCloud | 토큰 플랜 | `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` | [토큰 플랜](https://docs.qwencloud.com/token-plan/overview) |

### 대화형 설정

터미널에 `qwen`을 입력하여 Qwen Code를 실행한 후, `/auth` 명령어를 실행하고 **QwenCloud**를 선택한 다음 하위 메뉴에서 **토큰 플랜** 또는 **표준 API 키**를 선택하세요. 플랫폼(**중국 — Qianwen AI Platform** 또는 **국제 — QwenCloud**)을 선택한 후 API 키를 입력합니다.

Qwen Code는 저장된 키로 시작 시 엔드포인트의 모델 목록을 확인합니다. [내장 제공자 업데이트](#built-in-provider-updates)를 참조하세요.

### 헤드리스 또는 스크립트 설정

CI, 컨테이너 또는 스크립트의 경우 대화형 `/auth` 흐름 대신 환경 변수를 사용하여 플랫폼을 구성하세요.

```bash
# Pay-as-you-go (Standard API Key), International
export QWENCLOUD_API_KEY="sk-your-api-key"
export OPENAI_BASE_URL="https://maas.qwencloudapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

```bash
# Token Plan, China
export QWENCLOUD_TOKEN_PLAN_API_KEY="sk-sp-your-api-key"
export OPENAI_BASE_URL="https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

### 대안: `settings.json`을 통한 구성

대화형 `/auth` 흐름을 건너뛰려면 `~/.qwen/settings.json`에 다음을 추가하세요:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-max",
        "name": "qwen3.8-max (QwenCloud)",
        "baseUrl": "https://maas.qwencloudapi.com/compatible-mode/v1",
        "description": "qwen3.8-max from QwenCloud Standard API Key",
        "envKey": "QWENCLOUD_API_KEY"
      }
    ]
  },
  "env": {
    "QWENCLOUD_API_KEY": "sk-your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.8-max"
  }
}
```

> [!note]
>
> `capabilities`은 모델 이름에서 절대 추론되지 않는 유일한 제공자 스탬프이므로, 수동으로 작성된 항목은 추론 선언 없이 해결되며 `/effort`은 QwenCloud의 큐레이션된 `low` / `medium` / `xhigh` 대신 일반 티어 목록을 제공합니다. 큐레이션된 세트가 필요할 때 `/auth`을 사용하여 제공자를 설치하세요.

다른 제공자별 키와 마찬가지로, `QWENCLOUD_API_KEY`과 `QWENCLOUD_TOKEN_PLAN_API_KEY`은 `settings.json` 제공자 항목이 이를 `envKey`로 선언할 때 적용됩니다. 환경 변수만으로 OpenAI 호환 인증을 선택하려면 `OPENAI_API_KEY`을 내보내세요.

> [!note]
>
> QwenCloud와 Alibaba ModelStudio는 별도의 환경 키와 엔드포인트를 가진 별개의 항목입니다. QwenCloud를 선택해도 저장된 ModelStudio 자격 증명, 엔드포인트 또는 모델 선택 사항이 재작성되거나 삭제되지 않습니다.

## 💳 옵션 3: Alibaba Cloud Coding Plan [#-option-3-alibaba-cloud-coding-plan]

예측 가능한 비용과 다양한 모델 옵션 및 더 높은 사용량 할당량을 원하는 경우 사용하세요.

- **작동 방식**: 고정 월 요금으로 Coding Plan을 구독한 다음, 전용 엔드포인트와 구독 API 키를 사용하도록 Qwen Code를 구성합니다.
- **요구 사항**: [Alibaba Cloud ModelStudio(베이징)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) 또는 [Alibaba Cloud ModelStudio(국제)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)에서 계정 지역에 따라 활성 Coding Plan 구독을 획득합니다.
- **이점**: 다양한 모델 옵션, 더 높은 사용량 할당량, 예측 가능한 월 비용, 다양한 모델(Qwen, GLM, Kimi, Minimax 등)에 대한 접근.
- **비용 및 할당량**: Aliyun ModelStudio Coding Plan 문서[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)를 참조하세요.

Alibaba Cloud Coding Plan은 두 지역에서 사용 가능합니다:

| 지역                         | 콘솔 URL                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (베이징)  | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (국제)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### 대화형 설정

터미널에서 `qwen`을 입력하여 Qwen Code를 실행한 다음, `/auth` 명령을 실행하고 **Alibaba ModelStudio**를 선택한 후 하위 메뉴에서 **Coding Plan**을 선택합니다. 지역을 선택한 다음 `sk-sp-xxxxxxxxx` 키를 입력합니다.

Qwen Code는 저장된 키로 시작 시 엔드포인트의 모델 목록을 확인합니다. [내장 제공자 업데이트](#built-in-provider-updates)를 참조하세요.

인증 후 `/model` 명령을 사용하여 모든 Alibaba Cloud Coding Plan 지원 모델(qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 및 MiniMax-M2.5 포함) 간에 전환합니다.

### 헤드리스 또는 스크립트 설정

CI, 컨테이너 또는 스크립트의 경우 제거된 `qwen auth coding-plan` 명령어 대신 환경 변수나 `settings.json`을 사용하여 Coding Plan을 구성하세요.

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

## 🪙 옵션 4: Alibaba Cloud Token Plan

팀이나 회사가 전용 ModelStudio 엔드포인트에서 사용량 기반 과금을 선호하는 경우 사용하세요.

- **작동 방식**: Alibaba Cloud ModelStudio에서 Token Plan을 구독한 다음, 지역별 Token Plan 엔드포인트와 API 키를 사용하도록 Qwen Code를 구성합니다. 고정 월 요금 대신 실제 토큰 사용량에 대해 과금됩니다.
- **요구 사항**: 계정 지역에 따라 [Alibaba Cloud ModelStudio(베이징)](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) 또는 [Alibaba Cloud ModelStudio(국제)](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)에서 Token Plan API 키를 획득합니다.
- **이점**: 팀 및 회사용 사용량 기반 과금, 전용 지역별 엔드포인트, 다양한 모델(Qwen, DeepSeek, GLM, Kimi, Minimax 등)에 대한 접근.
- **비용 및 할당량**: Alibaba Cloud ModelStudio Token Plan 문서 [베이징](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) [국제](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)를 참조하세요.

Token Plan은 두 지역에서 사용 가능하며, 각 지역마다 전용 엔드포인트가 있습니다:

| 지역                    | 엔드포인트                                                               | 콘솔 URL                                                                                          |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 중국(베이징)             | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`     | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing)                         |
| 싱가포르(국제)           | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1) |

### 대화형 설정

터미널에 `qwen`을 입력하여 Qwen Code를 실행한 후, `/auth` 명령어를 실행하고 **Alibaba ModelStudio**를 선택한 다음 하위 메뉴에서 **토큰 플랜**을 선택하세요. 지역(**중국 (Beijing)** 또는 **싱가포르 (International)**)을 선택한 후 API 키를 입력합니다. 마법사는 최종 단계(Step 3/3 · Model IDs)를 표시하며, 여기서 구성할 모델 ID를 선택합니다: 엔드포인트에서 제공하는 모델이 나열되며 명시적으로 선택할 때만 적용됩니다. ModelStudio 토큰 플랜 API 키에는 접두사 요구 사항이 없으며, 이는 `sk-sp-`로 시작하는 Coding Plan 키나 Option 2의 별도 QwenCloud 토큰 플랜 키(역시 `sk-sp-`로 시작함)와 다릅니다.

인증 후 `/model` 명령을 사용하여 Token Plan에 구성된 모델을 탐색하고 전환합니다. 모델 라인업은 시간이 지남에 따라 변화하므로 의도적으로 여기에 나열하지 않습니다. 엔드포인트에서의 모델 검색은 위의 `/auth` 설정 단계에서 발생합니다(엔드포인트 자체 목록이 여기에 표시되며 명시적으로 선택해야 함). `/model`은 그러면 계획에 구성된 모델을 표시합니다.

Qwen Code는 [내장 제공자 업데이트](#built-in-provider-updates)에 설명된 대로 저장된 API 키로 시작 시 엔드포인트의 모델 목록도 확인합니다.

### 헤드리스 또는 스크립트 설정

CI, 컨테이너 또는 스크립트의 경우 대화형 `/auth` 흐름 대신 환경 변수나 `settings.json`을 사용하여 토큰 플랜을 구성하세요.

```bash
export BAILIAN_TOKEN_PLAN_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.7-plus"
```

중국(베이징) 엔드포인트에는 `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`을, 국제(싱가포르) 엔드포인트에는 `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`을 사용하세요. `qwen3.7-plus`를 계획에 포함된 다른 모델로 교체하세요.

`BAILIAN_TOKEN_PLAN_API_KEY`는 제공자별 키입니다: 다음 섹션의 `settings.json` 제공자 항목이 존재하면 효과가 있는데, 해당 항목이 이를 `envKey`로 선언하기 때문입니다. 환경 변수만으로 OpenAI 호환 인증을 선택하려면 대신 `OPENAI_API_KEY`를 export하세요 — 제공자별 키만으로는 인증 유형을 선택할 수 없습니다.

### 대안: `settings.json`을 통한 구성

대화형 `/auth` 흐름을 건너뛰려면 `~/.qwen/settings.json`에 다음을 추가하세요:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "name": "qwen3.7-plus (Token Plan)",
        "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        "description": "qwen3.7-plus from Alibaba Cloud Token Plan",
        "envKey": "BAILIAN_TOKEN_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_TOKEN_PLAN_API_KEY": "your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.7-plus"
  }
}
```

> [!note]
>
> Token Plan은 표준 DashScope 엔드포인트와 다른 전용 지역별 엔드포인트(`*.maas.aliyuncs.com`)를 사용합니다. `baseUrl`이 구독 지역과 일치하는지 확인하세요.

## 🚀 옵션 5: API 키 (유연함)

OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope 또는 자체 호스팅 엔드포인트와 같은 타사 제공자에 연결하려는 경우 사용하세요. 여러 프로토콜과 제공자를 지원합니다.

### 권장: `settings.json`을 통한 단일 파일 설정 [#recommended-one-file-setup-via-settingsjson]

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
| `model.name` | Qwen Code가 시작될 때 활성화할 기본 모델입니다. `modelProviders`의 `id` 값 중 하나와 일치해야 합니다. |

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

각 프로토콜에 대해 사용 가능한 모델을 정의합니다. 각 모델 항목에는 최소한 `id`이 필요하며, `envKey`(API 키를 포함하는 환경 변수 이름)은 선택 사항이지만 권장됩니다. 생략하면 인증 유형의 기본 환경 키(예: `openai`의 `OPENAI_API_KEY`)로 대체됩니다.

> [!important]
>
> 프로젝트 및 사용자 설정 간의 병합 충돌을 방지하기 위해 사용자 범위 `~/.qwen/settings.json`에서 `modelProviders`을 정의하는 것이 좋습니다.

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
> `modelProviders`과 함께 `env`, `security.auth.selectedType`, `model.name`도 설정하는 것을 잊지 마세요. 참고를 위해 [위의 전체 예제](#recommended-one-file-setup-via-settingsjson)를 참조하세요.

**`ModelConfig` 필드(`modelProviders` 내의 각 항목):**

| 필드               | 필수 | 설명                                                                                                                                          |
| ------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | 예   | API로 전송되는 모델 ID(예: `gpt-4o`, `claude-sonnet-4-20250514`)                                                                             |
| `wireApi`          | 아니오 | OpenAI 호환 요청 형식: `chat-completions` 또는 `responses`. 생략 시 제공자 프로토콜을 상속합니다.                                        |
| `name`             | 아니오 | `/model` 선택기의 표시 이름(기본값은 `id`)                                                                                                  |
| `envKey`           | 아니오 | API 키의 환경 변수 이름(예: `OPENAI_API_KEY`); 선택 사항/권장 — 생략 시 auth 유형의 기본 환경 키로 기본 설정                                 |
| `baseUrl`          | 아니오 | API 엔드포인트 재정의(프록시 또는 사용자 정의 엔드포인트에 유용)                                                                             |
| `generationConfig` | 아니오 | `timeout`, `maxRetries`, `samplingParams` 등을 미세 조정                                                                                      |

> [!note]
>
> `settings.json`에서 `env` 필드를 사용할 때 자격 증명은 평문으로 저장됩니다. 보안을 위해 `.env` 파일이나 셸 `export`을 선호하세요. [단계 2](#step-2-set-environment-variables)를 참조하세요.

`modelProviders`의 전체 스키마 및 `generationConfig`, `customHeaders` 및 `extra_body`와 같은 고급 옵션에 대해서는 [모델 제공자 레퍼런스](./model-providers.md)를 참조하세요.

#### 2단계: 환경 변수 설정 [#step-2-set-environment-variables]

Qwen Code는 모델 구성의 `envKey`로 지정된 환경 변수에서 API 키를 읽습니다. 아래에 **최우선에서 최하위 우선순위** 순으로 나열된 여러 방법이 있습니다:

**1. 셸 환경 / `export`(최우선)**

셸 프로필(`~/.zshrc`, `~/.bashrc` 등)에서 직접 설정하거나 시작 전에 인라인으로 설정합니다:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-compatible
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
> 다른 도구와의 충돌을 방지하기 위해 `.env`보다 `.qwen/.env` 사용을 권장합니다. 일부 변수(예: `DEBUG`, `DEBUG_MODE`)는 Qwen Code 동작에 간섭하지 않도록 프로젝트 수준의 `.env` 파일에서 제외됩니다.

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

여러 터미널에서 작업할 때 편리하도록 명령줄 인수를 사용하여 모델을 직접 전환할 수도 있습니다.

```bash
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## 내장 제공자 업데이트 [#built-in-provider-updates]

내장 모델 목록이 포함된 설치된 제공자는 더 새로운 프리셋이 출시되면 **내장 제공자 업데이트**를 제공할 수 있습니다.

QwenCloud(Token Plan 및 표준 API 키)와 Alibaba ModelStudio(Coding Plan, Token Plan 및 표준 API 키)도 시작 시 `/models`을 확인합니다. 이 확인은 `/auth`이 저장한 제공자별 API 키 변수(예: `BAILIAN_TOKEN_PLAN_API_KEY`)를 사용하며, `settings.env`의 값도 포함됩니다. CLI 플래그, `OPENAI_API_KEY` 또는 일반 인증 설정을 통해 공급된 키만으로는 이 확인이 활성화되지 않으며, 일반 키는 다른 제공자의 엔드포인트로 전달되지 않습니다.

성공적인 검색은 사용자 추가 모델을 유지하면서 키가 제공하는 내장 모델로 업데이트를 제한합니다. 또한 프리셋 릴리스 없이 서비스되는 집합이 변경된 경우(예: 플랜 전환 후)에도 업데이트를 제공할 수 있습니다. 검색만으로는 선택된 모델이 유지되지만, 한 번 전환하면 이후 시작 시 확인을 통해 제거를 제안할 수 있습니다. 필터링으로 인해 설치할 내장 모델이 남지 않으면 기존 제공자 구성이 프롬프트 없이 유지됩니다. 서비스되는 집합만 변경되는 경우, 업데이트는 새로 서비스되는 모델만 추가하므로 `/auth` 중에 제외했던 모델은 다시 추가되지 않습니다. 변경 사항이 없으면 프롬프트 없이 확인이 기록됩니다.

검색을 사용할 수 없거나 실패하거나 내장 모델과 일치하지 않는 경우, 프리셋 업데이트는 전체 내장 목록을 사용하며 이미 최신인 설치는 변경되지 않습니다. 검색 기능이 없는 제공자는 계속 내장 목록을 사용합니다.

**나중에**는 동일한 버전이나 서비스되는 집합에 대해 24시간 후에 다시 묻습니다. 다른 변경 사항은 여전히 프롬프트를 표시할 수 있습니다. 업데이트, 건너뛰기 또는 더 새로운 결정을 조용히 기록하면 이전 연기 상태가 해제됩니다. **건너뛰기**는 유지된 모델을 포함하여 구성을 그대로 둡니다. 건너뛴 프리셋 버전은 더 새로운 버전이 출시될 때까지 다시 제공되지 않으며, 건너뛴 서비스되는 집합은 변경될 때까지 다시 제공되지 않습니다.

## 제거된 `qwen auth` CLI 명령

독립 실행형 `qwen auth` CLI 명령이 제거되었습니다. 대신 다음 대체 방법을 사용하세요:

| 이전 사용 사례                   | 대체 방법                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| 대화형 인증 설정                 | `qwen`을 실행한 다음 `/auth` 사용                                                    |
| Coding Plan 설정                 | `/auth` 사용 또는 Coding Plan 기본 URL과 함께 `BAILIAN_CODING_PLAN_API_KEY` 설정     |
| Token Plan 설정                  | `/auth` 사용 또는 지역에 대한 Token Plan 기본 URL과 함께 `BAILIAN_TOKEN_PLAN_API_KEY` 설정 |
| OpenRouter 설정                  | `/auth` 사용 또는 `OPENROUTER_API_KEY` 및 `OPENAI_BASE_URL=https://openrouter.ai/api/v1` 설정 |
| Requesty 설정                    | `/auth` 사용 또는 `REQUESTY_API_KEY` 및 `OPENAI_BASE_URL=https://router.requesty.ai/v1` 설정  |
| API 키 또는 사용자 정의 제공자 설정 | `~/.qwen/settings.json`, `.env` 또는 제공자별 환경 변수 구성                        |
| 현재 인증 확인                   | Qwen Code 내부에서 `/doctor` 실행                                                    |
| OAuth 브라우저 흐름              | `qwen`을 대화형으로 실행하고 `/auth` 사용; OAuth는 환경 변수만으로는 구성할 수 없음  |

`qwen auth status`와 같은 레거시 호출은 두 지역의 기본 URL을 포함한 Token Plan 항목과 함께 이러한 마이그레이션 경로를 요약하는 제거 알림을 출력합니다.

## 보안 참고 사항 [#security-notes]

- API 키를 버전 관리에 커밋하지 마세요.
- 프로젝트 로컬 비밀에는 `.qwen/.env`를 선호하세요(git에서 제외).
- 검증을 위해 자격 증명을 출력하는 경우 터미널 출력을 민감한 것으로 취급하세요.

# Qwen Code: 서비스 약관 및 개인정보 보호 안내

Qwen Code는 Qwen Code 팀에서 관리하는 오픈소스 AI 코딩 어시스턴트 도구입니다. 이 문서는 Qwen Code의 인증 방법과 AI 모델 서비스 사용 시 적용되는 서비스 약관 및 개인정보 보호 정책을 설명합니다.

## 인증 방법 확인 방법

Qwen Code는 AI 모델에 접근하기 위해 네 가지 인증 방법을 지원합니다. 인증 방법에 따라 적용되는 서비스 약관과 개인정보 보호 정책이 달라집니다:

1. **Qwen OAuth** — qwen.ai 계정으로 로그인(무료 티어는 2026-04-15에 서비스 중단)
2. **Alibaba Cloud Coding Plan** — Alibaba Cloud의 API 키 사용
3. **API Key** — 자체 API 키 지참
4. **Vertex AI** — Google Cloud Vertex AI 사용

각 인증 방법에 대해 기본 서비스 제공업체에 따라 다른 서비스 약관과 개인정보 보호 안내가 적용될 수 있습니다.

| 인증 방법                | 제공업체          | 서비스 약관                                                        | 개인정보 보호 안내                                                  |
| :----------------------- | :---------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------ |
| Qwen OAuth               | Qwen AI           | [Qwen 서비스 약관](https://qwen.ai/termsservice)                    | [Qwen 개인정보 보호 정책](https://qwen.ai/privacypolicy)             |
| Alibaba Cloud Coding Plan| Alibaba Cloud     | [아래 세부 정보 참조](#2-if-you-are-using-alibaba-cloud-coding-plan) | [아래 세부 정보 참조](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                  | 다양한 제공업체     | 선택한 API 제공업체에 따라 다름(OpenAI, Anthropic 등)                | 선택한 API 제공업체에 따라 다름                                      |
| Vertex AI                | Google Cloud      | [Google Cloud 약관](https://cloud.google.com/terms)                  | [Google Cloud 개인정보 보호](https://cloud.google.com/privacy)       |

## 1. Qwen OAuth 인증을 사용하는 경우

qwen.ai 계정으로 인증할 때 다음 서비스 약관 및 개인정보 보호 안내 문서가 적용됩니다:

- **서비스 약관:** 사용은 [Qwen 서비스 약관](https://qwen.ai/termsservice)의 적용을 받습니다.
- **개인정보 보호 안내:** 데이터 수집 및 사용은 [Qwen 개인정보 보호 정책](https://qwen.ai/privacypolicy)에 설명되어 있습니다.

인증 설정, 할당량 및 지원되는 기능에 대한 자세한 내용은 [인증 설정](../configuration/settings)을 참조하세요.

## 2. Alibaba Cloud Coding Plan을 사용하는 경우

Alibaba Cloud의 API 키로 인증할 때 적용되는 Alibaba Cloud의 서비스 약관 및 개인정보 보호 안내가 적용됩니다.

Alibaba Cloud Coding Plan은 두 지역에서 사용 가능합니다:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Alibaba Cloud Coding Plan을 사용할 때는 Alibaba Cloud의 약관 및 개인정보 보호 정책의 적용을 받습니다. 데이터 사용, 보관 및 개인정보 보호 실무에 대한 구체적인 세부 정보는 해당 문서를 검토해 주세요.

## 3. 자체 API 키를 사용하는 경우

다른 제공업체의 API 키로 인증할 때 적용되는 서비스 약관과 개인정보 보호 안내는 선택한 제공업체에 따라 다릅니다.

> [!important]
>
> 자체 API 키를 사용할 때는 Qwen Code의 약관이 아닌 선택한 API 제공업체의 약관 및 개인정보 보호 정책의 적용을 받습니다. 데이터 사용, 보관 및 개인정보 보호 실무에 대한 구체적인 세부 정보는 제공업체의 문서를 검토해 주세요.

Qwen Code는 다양한 OpenAI 호환 제공업체를 지원합니다. 자세한 내용은 특정 제공업체의 서비스 약관 및 개인정보 보호 정책을 참조하세요.

## 4. Vertex AI를 사용하는 경우

Google Cloud Vertex AI로 인증할 때 적용되는 서비스 약관과 개인정보 보호 안내는 Google Cloud의 것입니다.

> [!important]
>
> Vertex AI를 사용할 때는 Qwen Code의 약관이 아닌 [Google Cloud 서비스 약관](https://cloud.google.com/terms) 및 [Google Cloud 개인정보 보호 안내](https://cloud.google.com/privacy)의 적용을 받습니다. 데이터 사용, 보관 및 개인정보 보호 실무에 대한 구체적인 세부 정보는 Google Cloud의 문서를 검토해 주세요.

## 사용 통계 및 텔레메트리

Qwen Code는 사용자 경험과 제품 품질을 개선하기 위해 익명 사용 통계 및 [텔레메트리](../../developers/development/telemetry) 데이터를 수집할 수 있습니다. 이 데이터 수집은 선택 사항이며 구성 설정을 통해 제어할 수 있습니다.

### 수집되는 데이터

활성화되면 Qwen Code는 다음을 수집할 수 있습니다:

- 익명 사용 통계(실행된 명령어, 성능 메트릭)
- 오류 보고서 및 충돌 데이터
- 기능 사용 패턴

### 인증 방법별 데이터 수집

- **Qwen OAuth:** 사용 통계는 Qwen의 개인정보 보호 정책의 적용을 받습니다. Qwen Code의 구성 설정을 통해 옵트아웃할 수 있습니다.
- **Alibaba Cloud Coding Plan:** 사용 통계는 Alibaba Cloud의 개인정보 보호 정책의 적용을 받습니다. Qwen Code의 구성 설정을 통해 옵트아웃할 수 있습니다.
- **API Key:** 선택한 API 제공업체가 수집하는 데이터 외에 Qwen Code가 추가 데이터를 수집하지 않습니다.
- **Vertex AI:** 사용 통계는 Google Cloud의 개인정보 보호 정책의 적용을 받습니다. Google Cloud가 수집하는 데이터 외에 Qwen Code가 추가 데이터를 수집하지 않습니다.

## 자주 묻는 질문 (FAQ)

### 1. 코드(프롬프트 및 답변 포함)가 AI 모델 학습에 사용되나요?

코드(프롬프트 및 답변 포함)가 AI 모델 학습에 사용되는지는 인증 방법과 사용하는 특정 AI 서비스 제공업체에 따라 다릅니다:

- **Qwen OAuth**: 데이터 사용은 [Qwen의 개인정보 보호 정책](https://qwen.ai/privacypolicy)의 적용을 받습니다. 데이터 수집 및 모델 학습 실무에 대한 구체적인 세부 정보는 해당 정책을 참조하세요.

- **Alibaba Cloud Coding Plan**: 데이터 사용은 Alibaba Cloud의 개인정보 보호 정책의 적용을 받습니다. 데이터 수집 및 모델 학습 실무에 대한 구체적인 세부 정보는 해당 정책을 참조하세요.

- **API Key**: 데이터 사용은 전적으로 선택한 API 제공업체에 따라 다릅니다. 각 제공업체는 자체 데이터 사용 정책을 가지고 있습니다. 특정 제공업체의 개인정보 보호 정책과 서비스 약관을 검토하세요.

- **Vertex AI**: 데이터 사용은 [Google Cloud 서비스 약관](https://cloud.google.com/terms) 및 [개인정보 보호 안내](https://cloud.google.com/privacy)의 적용을 받습니다. 데이터 수집 및 모델 학습 실무에 대한 구체적인 세부 정보는 Google Cloud의 정책을 검토하세요.

**중요**: Qwen Code 자체는 모델 학습에 프롬프트, 코드 또는 응답을 사용하지 않습니다. 학습 목적의 데이터 사용은 인증하는 AI 서비스 제공업체의 정책에 의해 관리됩니다.

### 2. 사용 통계란 무엇이며 옵트아웃 제어는 무엇인가요?

**사용 통계** 설정은 사용자 경험과 제품 품질 개선을 위한 Qwen Code의 선택적 데이터 수집을 제어합니다.

활성화되면 Qwen Code는 다음을 수집할 수 있습니다:

- 익명 텔레메트리(실행된 명령어, 성능 메트릭, 기능 사용)
- 오류 보고서 및 충돌 데이터
- 일반적인 사용 패턴

**Qwen Code가 수집하지 않는 것:**

- 코드 내용
- AI 모델에 전송된 프롬프트
- AI 모델의 응답
- 개인정보

사용 통계 설정은 Qwen Code 자체의 데이터 수집만 제어합니다. 선택한 AI 서비스 제공업체(Qwen, OpenAI 등)가 자체 개인정보 보호 정책에 따라 수집할 수 있는 데이터에는 영향을 주지 않습니다.

### 3. 인증 방법 간 전환은 어떻게 하나요?

Qwen OAuth, Alibaba Cloud Coding Plan, 자체 API 키 및 Vertex AI 간 전환은 언제든지 가능합니다:

1. **시작 시**: 프롬프트가 표시될 때 선호하는 인증 방법을 선택하세요
2. **CLI 내에서**: `/auth` 명령어를 사용하여 인증 방법을 재구성하세요
3. **환경 변수**: 자동 API 키 인증을 위해 `.env` 파일을 설정하세요

자세한 지침은 [인증 설정](../configuration/auth.md) 문서를 참조하세요.

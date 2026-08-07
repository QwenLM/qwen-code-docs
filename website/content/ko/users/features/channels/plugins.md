---
title: Custom Channel Plugins
---

# 사용자 정의 채널 플러그인

[확장](../../extension/introduction)으로 패키징된 사용자 정의 플랫폼 어댑터로 채널 시스템을 확장할 수 있습니다. 이를 통해 Qwen Code를 어떤 메시징 플랫폼, 웹훅 또는 사용자 정의 전송에도 연결할 수 있습니다.

## 작동 방식

채널 플러그인은 시작 시 활성 확장에서 로드됩니다. `qwen channel start`가 실행되면:

1. 모든 활성화된 확장의 `qwen-extension.json`에서 `channels` 항목을 스캔합니다
2. 각 채널의 진입점을 동적으로 가져옵니다
3. `settings.json`에서 참조할 수 있도록 채널 유형을 등록합니다
4. 플러그인의 팩토리 함수를 사용하여 채널 인스턴스를 생성합니다

사용자 정의 채널은 발신자 게이팅, 그룹 정책, 세션 라우팅, 슬래시 명령어, 충돌 복구 및 에이전트 브리지 등 완전한 공유 파이프라인을 무료로 얻습니다. 독립 실행형 `qwen channel start`는 현재 `AcpBridge`를 제공합니다. 플러그인 어댑터 코드는 어댑터 측면의 `ChannelAgentBridge` 계약에 의존해야 합니다. 명시적 `AcpBridge` 브리지 파라미터가 있는 기존 TypeScript 플러그인은 해당 주석을 `ChannelAgentBridge`로 마이그레이션해야 합니다. JavaScript 플러그인은 런타임에서 영향을 받지 않습니다.

## 사용자 정의 채널 설치

채널 플러그인을 제공하는 확장을 설치하세요:

```bash
# 로컬 경로에서(개발 또는 프라이빗 플러그인용)
qwen extensions install /path/to/my-channel-extension

# 또는 개발을 위해 링크(변경 사항이 즉시 반영됨)
qwen extensions link /path/to/my-channel-extension
```

## 사용자 정의 채널 구성

확장에서 제공하는 사용자 정의 유형을 사용하여 `~/.qwen/settings.json`에 채널 항목을 추가하세요:

```json
{
  "channels": {
    "my-bot": {
      "type": "my-platform",
      "apiKey": "$MY_PLATFORM_API_KEY",
      "senderPolicy": "open",
      "cwd": "/path/to/project"
    }
  }
}
```

`type`은 설치된 확장이 등록한 채널 유형과 일치해야 합니다. 플러그인별 필수 필드(예: `apiKey`, `webhookUrl`)는 확장 문서를 확인하세요.

모든 표준 채널 옵션은 사용자 정의 채널에서도 작동합니다:

| 옵션           | 설명                                   |
| -------------- | -------------------------------------- |
| `senderPolicy` | `allowlist`, `pairing` 또는 `open`     |
| `allowedUsers` | 발신자 ID의 정적 허용 목록             |
| `sessionScope` | `user`, `thread` 또는 `single`         |
| `cwd`          | 에이전트의 작업 디렉토리               |
| `instructions` | 각 세션의 첫 번째 메시지에 앞에 추가   |
| `model`        | 채널의 모델 재정의                     |
| `groupPolicy`  | `disabled`, `allowlist` 또는 `open`    |
| `dmPolicy`     | `open` 또는 `disabled`                 |
| `groups`       | 그룹별 설정                            |

각 옵션에 대한 자세한 내용은 [Overview](./overview)를 참조하세요.

## 채널 시작

```bash
# 사용자 정의 채널을 포함한 모든 채널 시작
qwen channel start

# 사용자 정의 채널만 시작
qwen channel start my-bot
```

## 무료로 얻는 기능

사용자 정의 채널은 내장 채널이 지원하는 모든 것을 자동으로 지원합니다:

- **발신자 정책** — `allowlist`, `pairing` 및 `open` 접근 제어
- **그룹 정책** — 선택적 @mention 게이팅이 있는 그룹별 설정
- **세션 라우팅** — 사용자별, 스레드별 또는 단일 공유 세션
- **DM 페어링** — 알 수 없는 사용자를 위한 전체 페어링 코드 흐름
- **슬래시 명령어** — `/help`, `/clear`, `/status`가 바로 작동
- **사용자 정의 지시** — 각 세션의 첫 번째 메시지에 앞에 추가
- **충돌 복구** — 세션 보존과 함께 자동 재시작
- **세션별 직렬화** — 경쟁 상태를 방지하기 위해 메시지 큐잉

## 나만의 채널 플러그인 만들기

새 플랫폼용 채널 플러그인을 만들고 싶으신가요? `ChannelPlugin` 인터페이스, `Envelope` 형식 및 확장 포인트에 대한 자세한 내용은 [Channel Plugin Developer Guide](../../../developers/channel-plugins.md)를 참조하세요.

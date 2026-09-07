
# DingTalk(딩톡)

이 가이드는 DingTalk(钉钉)에 Qwen Code 채널을 설정하는 방법을 다룹니다.

## 사전 요구 사항

- DingTalk 조직 계정
- AppKey와 AppSecret이 있는 DingTalk 봇 애플리케이션(아래 참조)

## 봇 생성

1. [DingTalk 개발자 포털](https://open-dev.dingtalk.com)로 이동
2. 새 애플리케이션을 생성(또는 기존 것 사용)
3. 애플리케이션 아래에서 **Robot** 기능을 활성화
4. Robot 설정에서 **Stream Mode**(로봇 프로토콜 → Stream 모드)를 활성화
5. 애플리케이션 자격 증명 페이지에서 **AppKey**(Client ID)와 **AppSecret**(Client Secret)을 기록

### Stream Mode

DingTalk Stream 모드는 아웃바운드 WebSocket 연결을 사용하므로 공개 URL이나 서버가 필요하지 않습니다. 봇이 DingTalk 서버에 연결하면 WebSocket을 통해 메시지가 푸시됩니다. 이것이 가장 간단한 배포 모델입니다.

## 구성

채널을 `~/.qwen/settings.json`에 추가하세요:

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "useConnectionManager": true,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via DingTalk.",
      "groupPolicy": "open",
      "atSender": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

자격 증명을 환경 변수로 설정하세요:

```bash
export DINGTALK_CLIENT_ID=<your-app-key>
export DINGTALK_CLIENT_SECRET=<your-app-secret>
```

또는 `settings.json`의 `env` 섹션에서 정의하세요:

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "your-app-key",
    "DINGTALK_CLIENT_SECRET": "your-app-secret"
  }
}
```

### 인터랙티브 카드

`interactiveCards` 객체를 추가하여 DingTalk 상태 및 질문 카드를 활성화하세요. 이 객체를 생략하면 인터랙티브 카드가 비활성화됩니다. 객체가 존재하면 전체 스위치와 두 카드 유형 모두 기본적으로 활성화되며, 질문 카드는 270,000밀리초(270초) 후 시간 초과됩니다.

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "interactiveCards": {
        "enabled": true,
        "statusCard": { "enabled": true },
        "questionCard": {
          "enabled": true,
          "timeoutMs": 270000
        }
      }
    }
  }
}
```

모든 인터랙티브 카드를 비활성화하려면 `interactiveCards.enabled`를 `false`로 설정하세요. 하나의 카드 유형만 비활성화하려면 `statusCard.enabled` 또는 `questionCard.enabled`를 사용하고, `questionCard.timeoutMs`를 유한한 양수로 설정하여 Qwen Code가 질문 카드 응답을 기다리는 시간을 변경하세요. 2,147,483,647밀리초(약 24.8일)를 초과하는 값은 해당 최대값으로 제한됩니다. 인터랙티브 카드는 `settings.json` 또는 관리 API를 통해 구성되며, Web Shell 채널 편집기는 이를 렌더링하지 않고 다른 필드를 편집할 때 저장된 객체를 보존합니다.

### 연결 복구

`useConnectionManager`는 기본값이 `true`입니다. 연결 관리자는 Stream WebSocket을 모니터링하고 연결이 응답을 중단하면 DingTalk SDK 클라이언트를 교체합니다. 일반적으로 활성화 상태로 두어야 합니다.

`"useConnectionManager": false`로 설정하면 Qwen Code의 연결 관리자를 비활성화하고 SDK의 keepalive 및 자동 재연결 동작으로 폴백합니다.

## 실행

```bash
# DingTalk 채널만 시작
qwen channel start my-dingtalk

# 또는 구성된 모든 채널을 함께 시작
qwen channel start
```

DingTalk을 열고 봇에게 메시지를 보내세요. 에이전트가 처리하는 동안 👀 이모지 리액션이 나타났다가, 이어서 응답이 전송됩니다.

## 데몬 웹훅 전달

채널이 `qwen serve` 아래에서 실행될 때 인증된 외부 웹훅 이벤트는 무인 에이전트 작업을 트리거하고 최종 Markdown 응답을 DingTalk 사용자 또는 그룹에 전달할 수 있습니다. 기존 웹훅 대상 필드를 사용하며 별도의 채널 유형이 필요하지 않습니다:

```json
{
  "webhooks": {
    "sources": {
      "manual-test": {
        "secretEnv": "QWEN_CHANNEL_DINGTALK_TEST_SECRET",
        "targets": {
          "operator": {
            "chatId": "DINGTALK_USER_ID",
            "senderId": "webhook:manual-test",
            "isGroup": false
          },
          "team": {
            "chatId": "OPEN_CONVERSATION_ID",
            "senderId": "webhook:manual-test",
            "isGroup": true
          }
        }
      }
    }
  }
}
```

모든 대상은 `isGroup`을 명시적으로 설정해야 합니다. 직접 메시지의 경우 `chatId`는 수신자의 DingTalk 사용자 ID입니다. 그룹 메시지의 경우 `chatId`는 그룹의 `openConversationId`입니다. 스레드 대상 및 수신 로봇 웹훅 URL은 능동 전달에 지원되지 않습니다. 전체 채널 구성 및 요청 형식은 [웹훅 트리거 작업](./overview#webhook-triggered-tasks)을 참조하세요.

## 그룹 채팅

DingTalk 봇은 DM과 그룹 대화 모두에서 작동합니다. 그룹 지원을 활성화하려면:

1. 채널 구성에서 `groupPolicy`를 `"allowlist"`, `"pairing"` 또는 `"open"`으로 설정
2. DingTalk 그룹에 봇 추가
3. 그룹에서 봇을 @mention하여 응답 트리거
4. `groupPolicy: "pairing"`을 사용하는 경우, 응답이 시작되기 전에 그룹의 페어링 요청을 한 번 승인하세요

기본적으로 봇은 그룹 채팅에서 @mention을 필요로 합니다(`requireMention: true`). 특정 그룹에 대해 `"requireMention": false`로 설정하면 모든 메시지에 응답합니다. 전체 세부 정보는 [Group Chats](./overview#group-chats)를 참조하세요.

`"atSender": true`로 설정하면 봇이 그룹 메시지를 트리거한 멤버를 @mention합니다. 기본적으로 꺼져 있으며 DingTalk 직원 ID가 있는 에이전트 응답에만 적용됩니다. 응답은 mention 유무와 관계없이 DingTalk markdown으로 전송되며, mention 접두사는 첫 번째 메시지 청크에 포함됩니다.

### 그룹의 Conversation ID 찾기

DingTalk은 그룹을 식별하기 위해 `conversationId`를 사용합니다. 그룹에서 누군가 메시지를 보낼 때 채널 서비스 로그에서 찾을 수 있습니다 — 로그 출력에서 `conversationId` 필드를 찾으세요.

## 이미지 및 파일

텍스트뿐만 아니라 사진과 문서를 봇에게 보낼 수 있습니다.

**사진:** 이미지(스크린샷, 다이어그램 등)를 보내면 에이전트가 비전 기능을 사용하여 분석합니다. 멀티모달 모델이 필요합니다 — 채널 구성에 `"model": "qwen3.5-plus"`(또는 다른 비전 지원 모델)를 추가하세요. DingTalk은 이미지를 직접 보내거나 리치 텍스트 메시지(텍스트 + 이미지 혼합)의 일부로 보낼 수 있습니다.

**파일:** PDF, 코드 파일 또는 어떤 문서든 보낼 수 있습니다. 봇이 DingTalk 서버에서 다운로드하여 로컬에 저장하므로 에이전트가 파일 도구로 읽을 수 있습니다. 오디오 및 비디오 파일도 지원됩니다. 모든 모델에서 작동합니다.

## 전달된 채팅 기록

다른 채팅의 연속 메시지를 봇에게 병합 전달할 수 있습니다(DingTalk의 "combined forward"). 자체 메시지로 전달하거나 답글로 전달할 수 있습니다. 봇은 기록을 텍스트로 확장하여 에이전트에 전달합니다. 기록의 제목과 요약이 헤더 라인이 되고, 각 전달된 메시지는 `[Chat record messages]` 아래에 `Sender: message`로 나열됩니다. 본문이 텍스트가 아닌 전달된 메시지는 플레이스홀더로 표시됩니다 — `[image]`, `[file: <name>]`, `[audio]`, `[video]`.

긴 기록은 **상한이 적용되며 상한이 공지됩니다**: 최대 50개 메시지, 총 4000자 이하, 메시지당 500자 이하. 잘린 내용은 같은 텍스트 내에서 에이전트에게 보고됩니다 — 삭제된 메시지에 대한 후미 `[N more message(s) not shown]` 라인, 단축된 메시지의 ` [truncated]` 마커. 따라서 에이전트는 부분 기록에 대해 답변하고 있음을 알 수 있습니다. 전체가 필요하면 더 작은 배치로 전달하세요.

**답글로 전달하는** 기록은 전송되는 대신 인용되며, 인용된 텍스트는 모든 채널에서 500자로 제한됩니다 — 따라서 기록은 4000자 예산 대신 500자 예산으로 렌더링되며 동일한 상한 공감이 적용됩니다. 답글로 전달하는 기록은 헤더와 첫 번째 메시지 한두 개만 포함될 것으로 예상하세요. 전체를 전달하려면 자체 메시지로 전달하세요.

전달된 기록은 귀하가 아닌 다른 사람이 작성하므로, 기록에서 추출된 모든 내용 — 제목, 발신자 이름, 메시지 본문 — 은 에이전트에 도달하기 전에 중화되어 전달된 메시지가 봇에게 지시하는 것처럼 가장할 수 없습니다.

위 다중 줄 레이아웃은 1:1 채팅에서 에이전트가 보는 내용입니다. 그룹에서는 전체 메시지가 에이전트에 도달하기 전에 한 번 더 중화되어 한 줄로 접히고 마커의 대괄호가 제거됩니다. 내용과 상한 공지는 동일합니다.

## Telegram과의 주요 차이점

- **인증:** 정적 봇 토큰 대신 AppKey + AppSecret. SDK가 접근 토큰 갱신을 자동으로 관리합니다.
- **연결:** 폴링 대신 WebSocket 스트림 — 공개 IP나 웹훅 URL 불필요.
- **포맷:** 응답은 DingTalk의 markdown 방언을 사용합니다. Markdown 테이블은 DingTalk 클라이언트로 전달되며, 긴 메시지는 ~3800자 단위로 분할됩니다.
- **작업 표시기:** 처리 중 사용자의 메시지에 👀 이모지 리액션이 추가되었다가 응답이 전송되면 제거됩니다.
- **미디어 다운로드:** 2단계 과정 — 메시지의 `downloadCode`가 DingTalk API를 통해 임시 다운로드 URL로 교환됩니다.
- **그룹:** DingTalk은 메시지 엔티티 파싱 대신 @mention 감지에 `isInAtList`를 사용합니다.

## 팁

- **DingTalk markdown 인식 지시 사용** — DingTalk은 제목, 굵은 텍스트, 링크, 코드 블록 및 테이블을 지원합니다. 좁은 화면에서 수평 스크롤이 될 수 있으므로 테이블을 간결하게 유지하세요.
- **접근 제한** — 조직 컨텍스트에서 `senderPolicy: "open"`이 허용될 수 있습니다. 더 엄격한 제어를 위해 `"allowlist"` 또는 `"pairing"`을 사용하세요. 자세한 내용은 [DM Pairing](./overview#dm-pairing)을 참조하세요.
- **참조된 메시지** — 사용자 메시지를 인용(답글)하면 인용된 텍스트가 에이전트의 컨텍스트로 포함됩니다. 인용된 메시지가 사진, 파일, 오디오 또는 비디오 메시지인 경우, 봇이 직접 보냈을 때와 동일한 방식으로 다운로드하여 첨부합니다. 봇 응답 인용은 아직 지원되지 않습니다.

## 문제 해결

### 봇이 연결되지 않음

- AppKey와 AppSecret이 올바른지 확인
- `qwen channel start`를 실행하기 전에 환경 변수가 설정되어 있는지 확인
- DingTalk 개발자 포털의 봇 설정에서 **Stream Mode**가 활성화되어 있는지 확인
- 터미널 출력에서 연결 오류 확인

### 봇이 그룹에서 응답하지 않음

- `groupPolicy`가 `"allowlist"`, `"pairing"` 또는 `"open"`으로 설정되어 있는지 확인(기본값은 `"disabled"`)
- `"pairing"`을 사용하는 경우, 그룹의 페어링 요청이 승인되었는지 확인
- 그룹 메시지에서 봇을 @mention하고 있는지 확인
- 봇이 그룹에 추가되어 있는지 확인

### "No sessionWebhook in message"

DingTalk이 메시지 콜백에 응답 엔드포인트를 포함하지 않았다는 의미입니다. 봇의 권한이 잘못 구성되었을 수 있습니다. 개발자 포털에서 봇 설정을 확인하세요.

### "Unable to process this message"

응답이 실패 범식을 식별하고 다음 단계를 제안합니다. 문제가 지속되면 응답에 표시된 참조 코드를 봇 관리자에게 전달하세요. 동일한 참조 코드가 채널 프로세스 로그의 상세 오류 옆에 표시됩니다.

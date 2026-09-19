
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

### 턴 출력 모드

[공유 `outputMode` 설정](https://qwenlm.github.io/qwen-code-docs/en/users/features/channels/overview/#turn-output-mode)은 DingTalk이 어시스턴트 결과를 언제 전달하는지를 제어합니다. DingTalk은 현재 이 정책과 통합된 유일한 어댑터입니다. 기본값은 `per_turn`이며, `outputMode`가 생략된 경우에도 동일합니다:

- `per_task`: 메인 작업과 연관된 배경 작업 및 알림이 완료될 때까지 기다린 다음, 작업의 마지막 비어 있지 않은 어시스턴트 응답을 포함하는 하나의 최종 결과 카드를 전달합니다.
- `per_response`: 각 완전한 어시스턴트 응답이 자체 완료 결과 카드를 받습니다. 토큰 청크는 현재 카드를 업데이트하며 새 카드를 생성하지 않습니다. 배경 어시스턴트 응답도 별도로 전달됩니다.
- `per_turn`: 메인 프롬프트가 끝나면 메인 상태 카드가 해당 턴의 마지막 비어 있지 않은 어시스턴트 응답과 함께 완료됩니다. 이후 각 배경 알림 턴은 자체 마지막 비어 있지 않은 어시스턴트 응답을 유지하며 별도의 완료 카드로 전송합니다.

`per_turn` 및 `per_task`에서 배경 셸, 모니터 및 워크플로 출력에는 종류, 상태 및 작업 라벨(사용 가능한 경우)이 포함된 제목이 있습니다. `per_response`에서는 응답 본문이 그대로 전달됩니다. 배경 에이전트 응답은 모든 모드에서 원래 본문을 유지합니다.

기본 `per_turn` 모드에서 배경 작업은 메인 카드의 수명을 연장하지 않으며, 이후 콜백이 이를 덮어쓸 수 없습니다. 예를 들어, 메인 결과 뒤에 11개의 별도 배경 알림 턴이 이어지면 메인 결과 카드와 11개의 후속 결과 카드가 생성됩니다. 해당 작업의 연관된 배경 작업을 기다리고 하나의 최종 결과를 받으려면 `per_task`를 선택하세요. 결과는 어시스턴트에서 나오며, 추가 요약은 생성되지 않고 중간 응답은 연결되지 않습니다.

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "outputMode": "per_turn",
      "interactiveCards": {
        "enabled": true,
        "statusCard": { "enabled": true }
      }
    }
  }
}
```

인터랙티브 상태 카드는 네이티브 카드 프레젠테이션을 제공합니다. 상태 카드를 사용할 수 없거나 모든 인터랙티브 카드가 비활성화된 경우, 동일한 출력 정책이 일반 메시지를 통해 적용됩니다: `per_task`는 완전한 작업을 기다리고, `per_response`는 각 완전한 응답을 전송하며, `per_turn`은 턴당 하나의 결과를 전송합니다. 카드 내용 한도를 초과하는 배경 결과도 일반 메시지로 폴백합니다. 플랫폼 메시지 길이 한도로 인해 긴 텍스트가 분할될 수 있습니다. 파일 및 이미지 전달은 기존 규칙을 유지합니다.

이 설정은 DingTalk 대화 응답 및 연관된 배경 후속 작업에 적용됩니다. 같은 대화의 관련 없는 작업을 병합하지 않습니다. 채널 루프 및 웹훅 실행은 기존 프레젠테이션을 유지합니다.

`per_task`는 해당 프롬프트에 연결된 Agent, 배경 셸, 모니터 및 워크플로 작업을 기다리며, 알림 턴에서 시작된 작업도 포함됩니다. 일시 중지된 작업과 장기 실행 모니터는 완료되거나 취소할 때까지 열어둡니다. 향후 예약 실행과 독립적으로 관리되는 데몬 자식 세션은 별도 작업이며 이 작업 경계에 포함되지 않습니다.

Todo Stop Guard가 같은 세션에 대기 중인 메시지에 양보하면, 대기 중인 `per_task` 요청이 취소된 것으로 종료되어 대기 중인 메시지가 시작될 수 있습니다. 보유된 응답은 성공적인 작업 결과로 전달되지 않습니다. 연관된 배경 작업은 세션에서 계속 사용할 수 있습니다.

중단되거나 10분 후에 종료되지 않은 독립 배경 턴은 부분으로 표시된 결과를 전달할 수 있습니다. 이로써 완료된 메인 카드가 다시 열리지 않습니다.

`per_task`, `per_response`, `per_turn`만 허용됩니다. 공개되지 않은 `final_only` 및 `process_and_result` 값은 별칭이 아니며 원하는 모드로 교체하세요. `outputMode`를 제거하면 `per_turn` 기본값이 복원됩니다. 별도의 배경 집계 토글은 없습니다.

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

**생성된 파일:** 에이전트에게 완료된 로컬 파일을 보내라고 명시적으로 요청하면 파일을 네이티브 DingTalk 첨부파일로 반환할 수 있습니다. 파일은 비어있지 않아야 하며 20 MB 이하여야 하고, 구성된 워크스페이스 내부 또는 시스템 임시 디렉토리에 위치해야 합니다. 한 응답에서 최대 5개의 파일을 보낼 수 있습니다. 업로드 또는 전달 실패는 첨부파일 대신 최종 텍스트로 보고됩니다.

## 전달된 채팅 기록

다른 채팅의 연속 메시지를 봇에게 병합 전달할 수 있습니다(DingTalk의 "combined forward"). 자체 메시지로 전달하거나 답글로 전달할 수 있습니다. 봇은 기록을 텍스트로 확장하여 에이전트에 전달합니다. 기록의 제목과 요약이 헤더 라인이 되고, 각 전달된 메시지는 `[Chat record messages]` 아래에 `Sender: message`로 나열됩니다. 본문이 텍스트가 아닌 전달된 메시지는 플레이스홀더로 표시됩니다 — `[image]`, `[file: <name>]`, `[audio]`, `[video]`.

긴 기록은 **상한이 적용되며 상한이 공지됩니다**: 최대 50개 메시지, 총 4000자 이하, 메시지당 500자 이하. 잘린 내용은 같은 텍스트 내에서 에이전트에게 보고됩니다 — 삭제된 메시지에 대한 후미 `[N more message(s) not shown]` 라인, 단축된 메시지의 ` [truncated]` 마커. 따라서 에이전트는 부분 기록에 대해 답변하고 있음을 알 수 있습니다. 전체가 필요하면 더 작은 배치로 전달하세요.

**답글로 전달하는** 기록은 전송되는 대신 인용되며, 인용된 텍스트는 모든 채널에서 500자로 제한됩니다 — 따라서 기록은 4000자 예산 대신 500자 예산으로 렌더링되며 동일한 상한 공지가 적용됩니다. 답글로 전달하는 기록은 헤더와 첫 번째 메시지 한두 개만 포함될 것으로 예상하세요. 전체를 전달하려면 자체 메시지로 전달하세요.

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
- **참조된 메시지** — 사용자 메시지를 인용(답글)하면 인용된 텍스트가 에이전트의 컨텍스트로 포함됩니다. 리치 텍스트 인용은 텍스트 순서를 유지하고 임베디된 사진을 첨부합니다. 인용된 메시지가 사진, 파일, 오디오 또는 비디오 메시지인 경우, 봇이 직접 보냈을 때와 동일한 방식으로 다운로드하여 첨부합니다. 봇 응답 인용은 아직 지원되지 않습니다.

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

응답이 실패 범주를 식별하고 다음 단계를 제안합니다. 문제가 지속되면 응답에 표시된 참조 코드를 봇 관리자에게 전달하세요. 동일한 참조 코드가 채널 프로세스 로그의 상세 오류 옆에 표시됩니다.

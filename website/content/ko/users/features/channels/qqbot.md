# QQ Bot (QQ机器人)

이 가이드에서는 공식 QQ Bot Open Platform API를 통해 QQ에서 Qwen Code 채널을 설정하는 방법을 다룹니다.

## 사전 준비 사항

- QQ 계정 (QR 코드 스캔을 위한 모바일 앱)

## 설정

### QR 코드 로그인

채널을 시작하면 처음에 QR 코드가 표시됩니다. QQ 앱으로 스캔하여 활성화하세요. 개발자 계정이나 수동 등록이 필요 없습니다. 자격 증명은 자동으로 저장되고 재사용됩니다.

```json
{
  "channels": {
    "my-qq": {
      "type": "qq"
    }
  }
}
```

```bash
qwen channel start my-qq
# 터미널의 QR 코드를 QQ 앱으로 스캔하세요
```

### 수동 구성 (개발자 포털)

[QQ Bot Open Platform](https://q.qq.com/) 개발자 포털에서 이미 등록한 앱이 있는 경우 해당 자격 증명을 사용할 수도 있습니다:

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET"
    }
  }
}
```

비밀을 환경 변수로 설정하세요:

```bash
export QQ_APP_SECRET=<your-app-secret>
```

## 구성

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET",
      "sandbox": false,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "你是一个通过 QQ Bot 对话的 AI 助手。回复控制在 2000 字符以内。",
      "blockStreaming": "on",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### QQ 전용 옵션

| 옵션        | 기본값  | 설명                                                                                        |
| ----------- | ------- | ------------------------------------------------------------------------------------------- |
| `appID`     | —       | 개발자 포털의 QQ Bot AppID. 생략하면 QR 코드 로그인이 사용됩니다.                            |
| `appSecret` | —       | QQ Bot AppSecret. `$ENV_VAR` 구문을 지원합니다. 생략하면 QR 코드 로그인이 사용됩니다.        |
| `sandbox`   | `false` | QQ 샌드박스 API 환경(`sandbox.api.sgroup.qq.com`)을 사용하려면 `true`로 설정하세요.          |

모든 표준 채널 옵션([채널 개요](./overview#options) 참조)도 지원됩니다:
`senderPolicy`, `allowedUsers`, `sessionScope`, `cwd`, `instructions`, `groupPolicy`, `groups`, `dispatchMode`, `blockStreaming`, `blockStreamingChunk`, `blockStreamingCoalesce`.

## 실행

```bash
# QQ 채널만 시작
qwen channel start my-qq

# 또는 모든 구성된 채널을 함께 시작
qwen channel start
```

QQ를 열고 봇에게 메시지를 보내세요. 채팅에서 응답이 도착하는 것을 확인할 수 있습니다.

## 그룹 채팅

QQ 그룹에서 봇을 사용하려면:

1. 채널 구성에서 `groupPolicy`를 `"allowlist"` 또는 `"open"`으로 설정하세요
2. QQ Bot Open Platform 대시보드에서 그룹 관리자가 봇을 초대하여 QQ 그룹에 추가하세요
3. 그룹 멤버는 봇에게 **@멘션**해야 응답이 트리거됩니다

QQ Bot API V2는 봇을 @멘션한 그룹 메시지만 전달합니다 — 봇은 모든 그룹 메시지를 볼 수 없습니다. 기본적으로 `requireMention`은 `true`이며 QQ에서는 그대로 두는 것이 좋습니다.

그룹 정책 및 멘션 게이팅에 대한 자세한 내용은 [그룹 채팅](./overview#group-chats)을 참조하세요.

## Markdown 지원

QQ Bot 채널은 Markdown 포맷(`msg_type=2`)을 지원합니다. 에이전트의 Markdown 응답이 그대로 전송되며, QQ는 이를 풍부한 포맷(굵게, 기울임꼴, 코드 블록, 링크, 목록)으로 렌더링합니다.

QQ 서버가 어떤 이유로든 Markdown 메시지를 거부하면, 채널이 자동으로 일반 텍스트로 재시도합니다 — 봇의 Markdown 기능이 서버 측에서 제한되어 있어도 메시지가 항상 전달됩니다.

이는 모든 Markdown을 제거하는 WeChat 채널과 반대입니다. QQ 채널에서는 에이전트가 전체 Markdown을 자유롭게 사용할 수 있습니다.

## 토큰 관리

액세스 토큰은 약 2시간 후에 만료됩니다. 채널은 TTL의 80%(보통 ~1.6시간)에서 자동으로 갱신합니다. 갱신에 실패하면 60초 후에 재시도합니다.

토큰 갱신은 WebSocket 재연결 시에도 계속됩니다 — AppID와 AppSecret이 유효한 한, 채널이 만료된 토큰 때문에 오프라인 상태가 되는 일은 없습니다.

## 연결 복원력

- **자동 재연결:** WebSocket 연결이 끊어지면, 지수 백오프로 재시도합니다(최대 20회, 재시도 간격 최대 30초)
- **세션 복원:** WebSocket이 잠시 끊어지면, QQ의 `RESUME` opcode를 사용하여 진행 중 메시지를 잃지 않고 세션을 복원합니다
- **서버 간 컨텍스트 continuation:** 채팅 세션과 라우팅 상태가 디스크에 저장됩니다. 데몬이 재시작되면 대화가 중단된 지점에서 계속됩니다
- **하트비트 모니터링:** HEARTBEAT_ACK 타임아웃이 감지되면 좀비 연결을 방지하기 위해 재연결을 강제합니다
- **메시지 중복 제거:** 재연결 후 재생된 메시지가 감지되어 건너뜁니다

## 팁

- **Markdown 자유롭게 사용** — WeChat과 달리, QQ는 Markdown을 네이티브로 렌더링합니다. 굵게, 코드 블록, 목록, 링크가 모두 작동합니다.
- **응답을 2000자 이하로 유지** — 더 긴 응답은 자동으로 청크로 분할됩니다. 지시에 길이 힌트를 추가하면 에이전트가 간결하게 유지하는 데 도움이 됩니다.
- **테스트에 샌드박스 사용** — 개발 중에 샌드박스 API를 사용하려면 `"sandbox": true`로 설정하세요. 프로덕션 메시지에는 영향이 없습니다.
- **액세스 제한** — 고정된 QQ 사용자 집합에 대해 `senderPolicy: "allowlist"`를 사용하거나, CLI에서 새 사용자를 승인하려면 `"pairing"`을 사용하세요. 자세한 내용은 [DM 페어링](./overview#dm-pairing)을 참조하세요.

## Telegram과의 주요 차이점

| 영역             | QQ Bot                                        | Telegram                                      |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| 인증             | QR 코드 로그인 또는 AppID/AppSecret            | BotFather의 정적 봇 토큰                      |
| Markdown         | 일반 텍스트 폴백이 있는 네이티브 QQ Markdown   | 에이전트 Markdown에서 변환된 HTML              |
| 토큰 수명주기    | 2h TTL, 80%에서 자동 갱신                     | 영구 봇 토큰                                  |
| 그룹 메시지      | @멘션 메시지만 봇에게 전달됨                   | 봇이 모든 메시지를 봄 (privacy mode 해제 시)    |
| 타이핑 표시기    | 사용 불가 (QQ API 제한)                        | "Working..." 메시지                            |
| 샌드박스 모드    | 테스트용으로 지원                              | 사용 불가                                      |

## 문제 해결

### 봇이 응답하지 않음

- 터미널 출력에서 오류를 확인하세요
- 채널이 실행 중인지 확인하세요 (`qwen channel status`)
- `senderPolicy: "allowlist"`를 사용하는 경우, QQ 사용자 ID가 `allowedUsers`에 있는지 확인하세요
- 첫 시작 시 터미널에 QR 코드가 표시됩니다 — QQ 앱으로 스캔하세요

### 봇이 그룹에서 응답하지 않음

- `groupPolicy`가 `"allowlist"` 또는 `"open"`으로 설정되어 있는지 확인하세요 (기본값은 `"disabled"`)
- **봇을 @멘션해야 합니다** — QQ는 봇을 태그한 메시지만 전달합니다
- 봇이 그룹에 추가되었는지 확인하세요

### QR 코드 로그인이 멈춤

- QR 코드는 터미널에 표시됩니다. QQ 모바일 앱으로 스캔하세요 (Me → Scan)
- QR 코드가 만료되면(보통 몇 분 후), 채널을 재시작하여 새 QR 코드를 받으세요

### Markdown 메시지가 일반 텍스트로 표시됨

- QQ 서버가 Markdown 메시지를 거부하여 채널이 자동으로 일반 텍스트로 폴백했을 수 있습니다. 터미널에서 `"Markdown rejected"` 로그 메시지를 확인하세요
- QQ Bot Open Platform에서는 드물지만, 봇의 Markdown 기능이 서버 측에서 제한된 경우 발생할 수 있습니다

### 장시간 다운타임 후 토큰 만료

- 채널이 2시간 이상 오프라인이면 액세스 토큰이 만료됩니다. 채널은 재연결 시 새 토큰을 가져옵니다 — 조치할 필요가 없습니다
- AppSecret 자체가 유효하지 않은 경우(예: 개발자 포털에서 교체된 경우), `appSecret` 필드를 업데이트하거나 `~/.qwen/channels/<name>-credentials.json`을 삭제하여 QR 코드 로그인을 다시 트리거하세요

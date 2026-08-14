---
title: Channels
---

# 채널

채널을 사용하면 터미널 대신 Telegram, WeChat, QQ, DingTalk, WeCom 또는 Feishu 같은 메시징 플랫폼에서 Qwen Code 에이전트와 상호작용할 수 있습니다. 휴대전화나 데스크톱 채팅 앱에서 메시지를 보내면 에이전트가 CLI에서와 마찬가지로 응답합니다.

코드 호스팅 플랫폼([GitHub](./github)부터)도 폴링 어댑터를 통해 지원됩니다 — 에이전트가 알림을 모니터링하고 이슈 및 pull request의 @mention에 응답합니다.

## 작동 방식

`qwen channel start`를 실행하면 Qwen Code가:

1. `settings.json`에서 채널 구성을 읽습니다
2. [Agent Client Protocol (ACP)](../../../developers/architecture.md)을 사용하여 단일 에이전트 프로세스를 생성합니다
3. 각 메시징 플랫폼에 연결하고 메시지 수신을 시작합니다
4. 수신 메시지를 에이전트로 라우팅하고 응답을 올바른 채팅으로 전송합니다

모든 채널이 사용자별 격리 세션을 가진 하나의 에이전트 프로세스를 공유합니다. 각 채널은 자체 작업 디렉토리, 모델 및 지시를 가질 수 있습니다.

## 빠른 시작

1. 메시징 플랫폼에서 봇을 설정하세요(채널별 가이드 참조: [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk), [WeCom](./wecom), [Feishu](./feishu), [GitHub](./github))
2. `~/.qwen/settings.json`에 채널 구성을 추가하세요
3. `qwen channel start`를 실행하여 모든 채널을 시작하거나 `qwen channel start <name>`으로 단일 채널을 시작하세요

내장되지 않은 플랫폼을 연결하고 싶으신가요? [Plugins](./plugins)를 참조하여 사용자 정의 어댑터를 확장으로 추가하는 방법을 확인하세요.

## 구성

채널은 `settings.json`의 `channels` 키 아래에 구성됩니다. 각 채널은 이름과 옵션 세트를 가집니다:

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "token": "$MY_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["123456789"],
      "sessionScope": "user",
      "cwd": "/path/to/working/directory",
      "instructions": "Optional system instructions for the agent.",
      "groupPolicy": "disabled",
      "dmPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### 옵션

| 옵션                   | 필수                  | 설명                                                                                                                                                            |
| ---------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | 예                    | 채널 유형: `telegram`, `weixin`, `qq`, `dingtalk`, `wecom`, `feishu`, `github` 또는 확장의 사용자 정의 유형([Plugins](./plugins) 참조)                           |
| `token`                | Telegram              | 봇 토큰. 환경 변수에서 읽기 위해 `$ENV_VAR` 구문을 지원합니다. WeChat, DingTalk, WeCom 또는 Feishu에는 필요하지 않음                                            |
| `clientId`             | DingTalk, Feishu      | DingTalk AppKey 또는 Feishu App ID. `$ENV_VAR` 구문 지원                                                                                                        |
| `clientSecret`         | DingTalk, Feishu      | DingTalk AppSecret 또는 Feishu App Secret. `$ENV_VAR` 구문 지원                                                                                                 |
| `botId`                | WeCom                 | WeCom 지능형 로봇 Bot ID. `$ENV_VAR` 구문 지원. [WeCom](./wecom) 참조                                                                                            |
| `secret`               | WeCom                 | WeCom 지능형 로봇 Secret. `$ENV_VAR` 구문 지원. [WeCom](./wecom) 참조                                                                                            |
| `model`                | 아니오                | 이 채널에 사용할 모델(예: `qwen3.5-plus`). 기본 모델을 재정의합니다. 이미지 입력을 지원하는 멀티모달 모델에 유용                                                 |
| `senderPolicy`         | 아니오                | 봇과 대화할 수 있는 사용자: `allowlist`(기본값), `open` 또는 `pairing`                                                                                           |
| `allowedUsers`         | 아니오                | 봇을 사용할 수 있는 사용자 ID 목록(`allowlist` 및 `pairing` 정책에서 사용)                                                                                       |
| `sessionScope`         | 아니오                | 세션 범위 방식: `user`(기본값), `chat_thread` 또는 `single`. 레거시 `thread`는 이미 구성된 경우 호환되지만 새 Web Shell 구성에서는 제공되지 않음                   |
| `cwd`                  | 아니오                | 에이전트의 작업 디렉토리. 기본값은 현재 디렉토리                                                                                                                 |
| `approvalMode`         | 아니오                | 채널 세션의 도구 승인 모드. 무인 웹훅 작업은 `yolo`가 필요합니다. 설정은 채널의 모든 세션에 적용됩니다                                                            |
| `instructions`         | 아니오                | 각 세션의 첫 번째 메시지에 앞에 추가되는 사용자 정의 지시                                                                                                         |
| `webhooks`             | 아니오                | 데몬 관리 채널의 웹훅 소스 및 전달 대상. [웹훅 트리거 작업](#webhook-triggered-tasks) 참조                                                                       |
| `groupPolicy`          | 아니오                | 그룹 채팅 접근: `disabled`(기본값), `allowlist`, `pairing` 또는 `open`. [Group Chats](#group-chats) 참조                                                         |
| `dmPolicy`             | 아니오                | 비공개/DM 접근: `open`(기본값) 또는 `disabled`(모든 DM을 조용히 삭제). 그룹 전용 봇에 유용                                                                       |
| `groupHistoryLimit`    | 아니오                | 옵트인 그룹 기록 백필. `0` 또는 생략하면 비활성화. 양수는 다음 봇 mention/응답까지 승인된 발신자 또는 승인된 페어링 그룹의 멤버로부터 해당 수의 mention되지 않은 그룹 메시지를 저장합니다. |
| `groups`               | 아니오                | 그룹별 설정. 키는 그룹 채팅 ID 또는 기본값의 `"*"`. [Group Chats](#group-chats) 참조                                                                              |
| `dispatchMode`         | 아니오                | 봇이 바쁠 때 메시지를 보내면 어떻게 되는가: `steer`(기본값), `collect` 또는 `followup`. [Dispatch Modes](#dispatch-modes) 참조                                     |
| `blockStreaming`       | 아니오                | 프로그레시브 응답 전달: `on` 또는 `off`(기본값). [Block Streaming](#block-streaming) 참조                                                                          |
| `blockStreamingChunk`  | 아니오                | 청크 크기 경계: `{ "minChars": 400, "maxChars": 1000 }`. [Block Streaming](#block-streaming) 참조                                                                  |
| `blockStreamingCoalesce` | 아니오              | 유휴 플러시: `{ "idleMs": 1500 }`. [Block Streaming](#block-streaming) 참조                                                                                        |

### 발신자 정책

봇과 상호작용할 수 있는 사용자를 제어합니다:

- **`allowlist`**(기본값) — `allowedUsers`에 나열된 사용자만 메시지를 보낼 수 있습니다. 다른 사용자는 조용히 무시됩니다.
- **`pairing`** — 알 수 없는 발신자가 페어링 코드를 받습니다. 봇 운영자가 CLI를 통해 승인하며 영구 허용 목록에 추가됩니다. `allowedUsers`의 사용자는 페어링을 완전히 건너뜁니다. 아래 [DM Pairing](#dm-pairing)을 참조하세요.
- **`open`** — 누구나 메시지를 보낼 수 있습니다. 주의해서 사용하세요.

### 세션 범위

대화 세션이 관리되는 방식을 제어합니다:

- **`user`**(기본값) — 사용자당 하나의 세션. 같은 사용자의 모든 메시지가 대화를 공유합니다.
- **`chat_thread`** — 채널 + chatId + threadId당 하나의 세션. 스레드가 있는 그룹 채팅에 유용합니다.
- **`single`** — 모든 사용자를 위한 하나의 공유 세션. 모두가 같은 대화를 공유합니다.

### 채널 메모리

채널 메모리는 하나의 채팅이나 스레드에 대한 영구 컨텍스트를 저장합니다. 항목은 안정적 ID를 가지므로 목록 응답은 결정적 후속 작업에 사용될 수 있습니다.

- `记住：默认使用 staging 环境`은 결정적 형태이며 현재 채팅이나 스레드에 정확히 하나의 스칼라 항목을 저장합니다.
- 한 요청에서 여러 별도 사실을 저장하려면 분류기를 통해 라우팅되는 자연어 구를 사용하세요. 예: `请记住这三条约定：使用 staging；发布前测试；优先中文回复`는 독립적으로 관리할 수 있는 항목을 생성합니다. 정확한 중복 사실은 건너뛰어지고 다른 항목을 생성하지 않고 보고됩니다. 자격 증명 유사 텍스트가 포함된 요청은 거부됩니다. 비밀을 제거하고 민감하지 않은 사실을 별도로 저장하세요.
- `查看记忆`은 항목과 그 안정적 ID를 나열합니다. `查看第 2 页记忆`로 이후 페이지를 보고, `查看记忆 <id>`로 하나의 항목을 보거나, `只看中文偏好` 같은 자연 필터링 요청으로 일치하는 항목을 나열하세요.
- `查看刚才那条记忆`, `把关于 staging 的记忆改成默认使用 production`, `忘掉刚才那条`는 자연 참조가 정확히 하나의 항목으로 해석될 때 작동합니다. 자연 업데이트 및 제거는 먼저 제안된 변경을 표시합니다. `确认更新记忆` 또는 `confirm memory update`로 업데이트를 확인하거나, `确认删除记忆` 또는 `confirm memory removal`으로 60초 내에 제거를 확인하세요. 정확-ID 업데이트 및 제거는 여전히 즉시이며 확인이 필요하지 않습니다.
- `清空记忆`는 전체 삭제 확인 흐름을 시작하고 `确认清空记忆`가 완료합니다.

자연 검사, 업데이트 또는 제거 요청이 여러 항목과 일치하면 봇은 후보 ID와 메모리를 변경하지 않고 미리보기를 반환합니다. 모호한 결과에 대한 보류 중인 선택은 없습니다: `忘掉 m-a31f0d82c7e4`처럼 하나의 정확한 ID로 요청을 재시도하세요. 정확-ID 작업이 여전히 결정적 빠른 경로입니다. 일치가 없는 자연 요청은 일치하는 항목이 없다고 보고합니다.

보류 중인 업데이트, 제거 및 삭제 확인은 이를 생성한 발신자와 채팅 또는 스레드에만 적용됩니다. 더 새로운 삭제, 자연 업데이트 또는 자연 제거 제안이 해당 발신자 및 대상에 대한 이전 보류 중인 것을 대체합니다. 보류 중인 확인은 채널 프로세스가 재시작되면 삭제됩니다.

레거시 슬래시 별칭 `/remember-channel`, `/channel-memory` 및 `/forget-channel`은 제거되었습니다. 더 이상 채널 메모리 명령어가 아닙니다.

채널 메모리는 채널 접근 게이트를 따릅니다. `senderPolicy`, `dmPolicy`, `groupPolicy`, 그룹 설정, 페어링 및 mention 요구 사항에 의해 수락된 모든 메시지는 해당 채팅이나 스레드의 메모리를 읽기, 쓰기, 업데이트 또는 정리할 수 있습니다. 같은 그룹의 수락된 멤버는 해당 그룹의 대상 저장소를 공유합니다. 그룹 메모리가 신뢰된 발신자로 제한되어야 할 때 `allowlist` 또는 `pairing` 정책을 사용하세요.

기존 레거시 `CHANNEL.md` 메모리는 첫 변경 시 구조화된 `CHANNEL.json` 저장소로 자동 마이그레이션됩니다. 구조화된 메모리는 독립 실행형 채널 및 데몬 관리 채널 재시작을 통해 지속되며, `/clear` 후를 포함하여 새 대상 범위 세션이 시작될 때 주입됩니다.

초기 주입 후 각 수락된 메시지는 해당 메시지에 대해 최대 3개의 관련 항목을 리콜합니다. 이것은 모든 저장된 항목을 모든 턴에 추가하지 않고도 장기 실행 세션 동안 지속적 사실을 사용 가능하게 유지합니다. 리콜은 현재 메시지를 기반으로 하며 저장된 메모리를 수정하지 않습니다.

메모리는 여전히 현재 채팅이나 스레드에 키잉됩니다. `sessionScope: single` 세션에서는 주입되거나 리콜되지 않습니다. 해당 세션은 하나의 대상에 범위가 지정되지 않고 전체 채널에 공유되기 때문입니다.

채널 메모리는 일반 대화에서 자동으로 사실을 학습하거나 모호한 자연 참조에 대한 확인으로 `第一个`를 수락하지 않습니다. 자연 참조가 모호할 때 명확한 remember 요청과 정확한 항목 ID를 사용하세요.

### 토큰 보안

봇 토큰을 `settings.json`에 직접 저장하면 안 됩니다. 대신 환경 변수 참조를 사용하세요:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

실제 토큰은 셸 환경이나 채널 실행 전에 로드되는 `.env` 파일에 설정하세요.

## DM 페어링

`senderPolicy`가 `"pairing"`으로 설정되면 알 수 없는 발신자가 승인 흐름을 거칩니다:

1. 알 수 없는 사용자가 봇에게 메시지를 보냅니다
2. 봇이 8자리 페어링 코드(예: `VEQDDWXJ`)로 답장합니다
3. 사용자가 코드을 봇 운영자인 당신에게 공유합니다
4. CLI를 통해 승인합니다:

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

승인되면 사용자의 ID가 채널의 워크스페이스 범위 허용 목록(`~/.qwen/channels/<workspace-scope>/<name>-allowlist.json`)에 저장되며 이후 모든 메시지가 정상적으로 통과합니다. 페어링 상태는 워크스페이스별로 범위가 지정되므로 같은 채널 이름을 사용하는 두 워크스페이스는 별도의 승인을 유지합니다.

### 페어링 CLI 명령어

```bash
# 보류 중인 페어링 요청 나열
qwen channel pairing list my-channel

# 코드로 요청 승인
qwen channel pairing approve my-channel <CODE>
```

채널의 워크스페이스 디렉토리에서 실행하거나 `--cwd <dir>`를 전달하세요 — 페어링 상태는 워크스페이스별로 저장됩니다.

### 페어링 규칙

- 코드는 8자리, 대문자, 모호하지 않은 알파벳(`0`/`O`/`1`/`I` 없음)
- 코드는 1시간 후 만료
- 채널당 동시에 최대 3개의 보류 중인 요청과 발신자당 최대 1개의 보류 중인 요청 — 추가 요청은 하나가 만료되거나 승인될 때까지 거부됨
- `settings.json`의 `allowedUsers`에 나열된 사용자는 사용자 페어링을 건너뜁니다. `groupPolicy: "pairing"`에서는 그룹 자체가 여전히 승인되어야 합니다
- 승인된 사용자는 워크스페이스별로 `~/.qwen/channels/<workspace-scope>/<name>-allowlist.json`에 저장 — 이 파일을 민감한 것으로 취급

## 그룹 채팅

기본적으로 봇은 직접 메시지에서만 작동합니다. 그룹 채팅 지원을 활성화하려면 `groupPolicy`를 `"allowlist"`, `"pairing"` 또는 `"open"`으로 설정하세요.

### 그룹 정책

봇이 그룹 채팅에 참여하는지 여부를 제어합니다:

- **`disabled`**(기본값) — 봇이 모든 그룹 메시지를 무시합니다. 가장 안전한 옵션.
- **`allowlist`** — 봇이 `groups`에 채팅 ID로 명시적으로 나열된 그룹에서만 응답합니다. `"*"` 키는 기본 설정을 제공하지만 와일드카드 허용으로는 작동**하지 않습니다**.
- **`pairing`** — 알 수 없는 그룹의 의도적인 mention이나 답장은 해당 그룹에 대한 하나의 페어링 요청을 생성합니다. 승인되면 모든 멤버가 해당 그룹에서 봇을 사용할 수 있으며, `senderPolicy`는 직접 메시지를 계속 제어합니다.
- **`open`** — 봇이 추가된 모든 그룹에서 응답합니다. 주의해서 사용하세요.

사용자 페어링에 사용된 것과 동일한 CLI 명령어로 그룹을 승인합니다. 보류 중인 요청은 그룹과 이를 시작한 멤버를 식별합니다:

```bash
qwen channel pairing approve my-channel <CODE>
```

그룹 승인은 채널의 워크스페이스 범위에서 그룹의 채팅 ID로 저장됩니다. GitHub 및 GitLab에서 채팅 ID는 저장소/프로젝트 경로이므로, 이름 변경이나 이전은 저장된 승인을 분리합니다 — 이름 변경 후 그룹을 다시 승인하세요. 같은 경로에서 새로 생성된 저장소나 프로젝트는 오래된 승인을 상속합니다 — 이름 변경, 이전 또는 삭제 후 그룹 승인을 취소하세요.
mention되지 않은 메시지는 그룹이 `requireMention`을 `false`로 설정한 경우에도 그룹 페어링 요청을 생성하지 않습니다. 승인 후 구성된 mention 정책이 정상적으로 적용됩니다.

그룹 페어링 요청은 DM 페어링 요청과 동일한 보류 큐를 공유합니다: 채널은 최대 3개의 보류 요청을 보유하며, 발신자는 사용자 및 그룹 요청을 통틀어 최대 하나의 보류 요청을 가집니다([페어링 규칙](#페어링-규칙) 참조).

### Mention 게이팅

그룹에서 봇은 기본적으로 `@mention` 또는 메시지 중 하나에 대한 답장을 필요로 합니다. 이것은 봇이 그룹 채팅의 모든 메시지에 응답하는 것을 방지합니다.

`groups` 설정으로 그룹별 구성:

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — 모든 그룹의 기본 설정. 구성 기본값만 설정하며 허용 목록 항목이 아닙니다.
- **그룹 채팅 ID** — 특정 그룹의 설정을 재정의합니다. `"*"` 기본값을 재정의합니다.
- **`requireMention`**(기본값: `true`) — `true`이면 봇이 @mention하거나 메시지 중 하나에 답장한 메시지에만 응답합니다. `false`이면 봇이 모든 메시지에 응답합니다(전용 작업 그룹에 유용).

### 그룹 기록 백필

기본적으로 Qwen은 mention되지 않은 그룹 메시지를 무시하고 세션 턴으로 저장하지 않습니다. 다음 `@mention`에 최근 그룹 컨텍스트를 포함시키려면 `groupHistoryLimit`을 양수로 설정하세요.

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "groupPolicy": "open",
      "groupHistoryLimit": 50,
      "groups": {
        "*": { "requireMention": true },
        "sensitive-group-id": {
          "requireMention": true,
          "groupHistoryLimit": 0
        }
      }
    }
  }
}
```

- 생략 또는 `0`은 백필을 비활성화합니다.
- 그룹 수준 `groupHistoryLimit`이 채널 수준 값을 재정의합니다.
- 승인된 발신자 또는 승인된 페어링 그룹의 멤버의 메시지만 저장됩니다.
- `groupPolicy` 또는 그룹 허용 목록에 의해 거부된 메시지는 저장되지 않습니다.
- 보류 중인 그룹 기록은 로컬 JSONL로 `~/.qwen/channels/<channel-name>-group-history.jsonl` 또는 `$QWEN_HOME/channels/<channel-name>-group-history.jsonl` 아래에 저장됩니다.
- 캐시된 메시지는 다음 실제 트리거에서 신뢰할 수 없는 컨텍스트로 주입되며 독립 세션 턴으로 작성되지 않습니다.

### 그룹 메시지 평가 방식

```
1. groupPolicy — 이 그룹이 비활성화, 나열, 페어링 또는 개방인가? (아니요 → 무시/페어링 흐름)
2. dmPolicy — 이 DM이 허용되는가?                      (disabled → 무시)
3. requireMention — 봇이 mention/답장 받았는가?       (아니요 → 무시)
4. senderPolicy — 이 발신자가 승인되었는가?             (페어링된 그룹에서는 건너뜀; 아니면 → 사용자 페어링 흐름)
5. 세션으로 라우팅
```

### 그룹용 Telegram 설정

1. 그룹에 봇 추가
2. BotFather에서 **프라이버시 모드 비활성화**(`/mybots` → Bot Settings → Group Privacy → Turn Off) — 그렇지 않으면 봇이 비명령 메시지를 볼 수 없음
3. 프라이버시 모드 변경 후 그룹에서 봇을 **제거하고 다시 추가**(Telegram이 이 설정을 캐시함)

### 그룹 채팅 ID 찾기

`groups` 허용 목록에 사용할 그룹의 채팅 ID를 찾으려면:

1. 봇이 실행 중이면 중지
2. 그룹에서 봇을 mention하는 메시지 전송
3. Telegram Bot API를 사용하여 대기 중인 업데이트를 확인:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

응답에서 `message.chat.id`를 찾으세요 — 그룹 ID는 음수입니다(예: `-5170296765`).

## 미디어 지원

채널은 텍스트뿐만 아니라 이미지와 파일을 에이전트에게 전송하는 것을 지원합니다.

### 이미지

봇에게 사진을 보내면 에이전트가 볼 수 있습니다 — 스크린샷, 오류 메시지 또는 다이어그램을 공유하는 데 유용합니다. 이미지가 비전 입력으로 모델에 직접 전송됩니다.

이미지 지원을 사용하려면 채널에 멀티모달 모델을 구성하세요:

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "model": "qwen3.5-plus",
      ...
    }
  }
}
```

### 파일

문서(PDF, 코드 파일, 텍스트 파일 등)를 봇에게 보내세요. 파일이 다운로드되어 임시 디렉토리에 저장되며 에이전트에게 파일 경로가 알려져서 파일 읽기 도구를 사용하여 내용을 읽을 수 있습니다.

파일은 모든 모델에서 작동합니다 — 멀티모달 지원이 필요하지 않습니다.

### 플랫폼 차이

| 기능   | Telegram                                   | WeChat                         | DingTalk                                    | Feishu                                                   |
| ------ | ------------------------------------------ | ------------------------------ | ------------------------------------------- | -------------------------------------------------------- |
| 이미지 | Bot API를 통한 직접 다운로드                | AES 복호화와 CDN 다운로드      | downloadCode API(2단계)                     | Open API 리소스 엔드포인트(인증된 GET, 50MB 제한)         |
| 파일   | Bot API를 통한 직접 다운로드(20MB 제한)     | AES 복호화와 CDN 다운로드      | downloadCode API(2단계)                     | Open API 리소스 엔드포인트(50MB 제한)                     |
| 캡션   | 사진/파일 캡션이 메시지 텍스트로 포함       | 해당 없음                      | 리치 텍스트: 한 메시지에 텍스트 + 이미지 혼합 | 리치 텍스트(`post`): 텍스트 추출; 임베드된 이미지 무시    |

> QQ Bot은 수신 미디어를 처리하지 않습니다 — 이미지 및 스티커 메시지는 무시되므로 위의 미디어 처리 행이 없습니다.
>
> WeCom은 텍스트, 이미지, 텍스트 + 이미지 혼합, 파일, 비디오 및 음성 메시지(받아쓰기)를 수락합니다. 이미지는 첨부 파일로 에이전트에 전달되며 파일과 비디오는 임시 로컬 경로로 다운로드됩니다. 자세한 내용은 [WeCom](./wecom#images-and-files)을 참조하세요.

## 디스패치 모드

봇이 이전 메시지를 아직 처리 중인 동안 새 메시지를 보낼 때 발생하는 일을 제어합니다.

- **`steer`**(기본값) — 봇이 현재 요청을 취소하고 새 메시지에서 작업을 시작합니다. 팔로우업이 보통 봇을 수정하거나 방향을 전환하고 싶다는 의미이므로 일반 채팅에 가장 적합합니다.
- **`collect`** — 새 메시지가 버퍼링됩니다. 현재 요청이 완료되면 모든 버퍼된 메시지가 단일 팔로우업 프롬프트로 결합됩니다. 생각을 큐에 넣고 싶은 비동기 워크플로우에 적합합니다.
- **`followup`** — 각 메시지가 큐에 넣고 순서대로 자체 별도의 턴으로 처리됩니다. 각 메시지가 독립적인 배치 워크플로우에 유용합니다.

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "dispatchMode": "steer",
      ...
    }
  }
}
```

그룹별 디스패치 모드를 설정하여 채널 기본값을 재정의할 수도 있습니다:

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## 블록 스트리밍

기본적으로 에이전트는 잠시 작업한 후 하나의 큰 응답을 보냅니다. 블록 스트리밍이 활성화되면 응답이 에이전트가 아직 작업 중인 동안 여러 개의 짧은 메시지로 도착합니다 — ChatGPT나 Claude가 프로그레시브 출력을 표시하는 방식과 유사합니다.

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "blockStreaming": "on",
      "blockStreamingChunk": { "minChars": 400, "maxChars": 1000 },
      "blockStreamingCoalesce": { "idleMs": 1500 },
      ...
    }
  }
}
```

### 작동 방식

- 에이전트의 응답이 단락 경계에서 블록으로 분할되어 별도 메시지로 전송됩니다
- `minChars`(기본값 400) — 작은 메시지를 스팸하는 것을 방지하기 위해 최소 이 길이가 될 때까지 블록을 보내지 않음
- `maxChars`(기본값 1000) — 자연스러운 중단 없이 블록이 이만큼 길어지면 어쨌든 전송
- `idleMs`(기본값 1500) — 에이전트가 일시 중지하면(예: 도구 실행) 지금까지 버퍼된 내용을 전송
- 에이전트가 완료되면 남은 텍스트가 즉시 전송됨

`blockStreaming`만 필요합니다. 청크 및 병합 설정은 선택적이며 합리적인 기본값이 있습니다.

## 예약된 채널 루프

채널에는 나중에 실행되어야 하고 결과를 같은 채팅으로 푸시해야 하는 프롬프트를 위한 영구 스케줄러가 있습니다. 에이전트에게 자연스럽게 요청할 수 있습니다. 예: `Every 15 minutes, check the deployment and report any change`. 또는 로컬 명령어를 직접 사용하세요:

```text
/loop add "*/15 * * * *" check the deployment and report any change
/loop list
/loop inspect <id>
/loop cancel <id>
```

에이전트가 이러한 작업을 관리할 때 `channel_loop_create`, `channel_loop_list` 및 `channel_loop_cancel` 도구를 사용합니다. 스케줄은 머신의 로컬 시간으로 표준 5-필드 cron 표현식을 사용합니다. 작업은 무인으로 실행되며 최종 응답이 자동으로 이를 생성한 채팅으로 전달됩니다.

채널 루프는 [Run Prompts on a Schedule](../scheduled-tasks)에 설명된 세션 범위 작업과 다릅니다:

- `$QWEN_HOME/channels/` 아래에 저장됩니다 — 독립 실행형 채널은 `cron.json`을 직접 사용하고, 데몬 관리 채널은 `daemon/` 아래 워크스페이스별 파일을 사용합니다. 둘 다 채널 재시작에서 생존합니다.
- 현재 채널 채팅이나 스레드에 범위가 지정됩니다. 각 대상은 최대 10개의 활성화된 루프를 가질 수 있으며 각 프롬프트는 4,000자로 제한됩니다.
- 능동 전달을 지원하는 어댑터와 대상이 필요합니다. Telegram, DingTalk, Feishu 및 WeCom이 옵트인이며 플랫폼별 대상 제한이 적용됩니다.
- `sessionScope: "single"`에서는 사용할 수 없습니다. 해당 범위가 하나의 채팅 대상에 연결되지 않기 때문입니다.
- 저장된 루프는 실행 시 대상이 더 이상 승인되지 않으면 비활성화됩니다.

## 백그라운드 에이전트 결과

에이전트가 백그라운드 서브에이전트나 포크에 작업을 위임하면 완료 결과가 세션을 소유한 채널 채팅으로 전달됩니다. 전달은 원래 턴이 종료된 후에 발생할 수 있으므로 백그라운드 작업이 활성 상태인 동안 채널 서비스 또는 데몬을 계속 실행하세요.

## 슬래시 명령어

채널은 슬래시 명령어를 지원합니다. 이것들은 로컬에서 처리됩니다(에이전트 라운드트립 없음):

- `/help` — 사용 가능한 명령어 나열
- `/clear` — 세션을 지우고 새로 시작(별칭: `/reset`, `/new`)
- `/status` — 세션 정보 및 접근 정책 표시
- `/loop add "<cron>" <prompt>` — 영구 예약 채널 루프 생성
- `/loop list` — 현재 채팅의 루프 나열
- `/loop inspect <id>` — 루프 상태 및 실행 세부 정보 표시
- `/loop cancel <id>` — 루프 비활성화

다른 모든 슬래시 명령어(예: `/compress`, `/summary`)는 에이전트로 전달됩니다.

이 명령어는 모든 채널 유형(Telegram, WeChat, QQ, DingTalk, WeCom, Feishu, GitHub)에서 작동합니다. 단, 루프 생성은 현재 어댑터 및 대상의 능동 전달 지원도 필요합니다.

## 실행

```bash
# 구성된 모든 채널 시작(공유 에이전트 프로세스)
qwen channel start

# 단일 채널 시작
qwen channel start my-channel

# 서비스가 실행 중인지 확인
qwen channel status

# 실행 중인 서비스 중지
qwen channel stop
```

봇은 포그라운드에서 실행됩니다. `Ctrl+C`를 누르거나 다른 터미널에서 `qwen channel stop`을 사용하세요.

### 실험적 데몬 관리 모드

`qwen serve` 아래에서 구성된 채널을 실행할 수도 있습니다:

```bash
# 데몬 수명 아래에서 하나의 채널 시작
qwen serve --channel my-channel

# 구성된 모든 채널 시작
qwen serve --channel all

# 또는 나중에 토큰 보호 데몬에서 채널 활성화
QWEN_SERVER_TOKEN=secret qwen serve
qwen channel set my-channel --token secret

# 데몬 관리 선택을 쿼리하거나 중지
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token ...
```

이 모드는 `qwen serve`가 소유하는 워크스페이스 그룹 채널 워커 프로세스를 시작합니다. 워커는 SDK를 통해 데몬에 다시 연결하고 동일한 채널 어댑터를 사용합니다. 워커는 데몬 프로세스와 분리되어 있으므로 채널 어댑터 충돌이 데몬을 충돌시키지 않습니다. `--channel` 없이 시작된 데몬은 첫 `qwen channel set`까지 채널 어댑터를 로드하거나 채널 서비스 PID 리스를 예약하지 않습니다.

`qwen serve --channel`은 `qwen channel start`와 동일한 서비스가 아닙니다. 독립 실행형 `qwen channel start`는 여전히 ACP 지원 채널 서비스를 사용하며 다른 `cwd` 값을 가진 채널 구성을 실행할 수 있습니다. 데몬 관리 채널은 선택된 모든 채널의 `cwd`가 데몬에 의해 등록된 워크스페이스로 해석되어야 합니다. 멀티 워크스페이스 모드에서 선택 교체는 정렬된 채널 목록이 변경되지 않은 워크스페이스의 워커를 유지합니다. `all`은 여전히 기본 워크스페이스 전용입니다.

`--daemon-url` 없이 `qwen channel status` 및 `qwen channel stop`은 독립 실행형 pidfile 동작을 유지합니다. `--daemon-url` 변형은 데몬 관리자를 쿼리하거나 중지합니다. 런타임 선택은 설정에 기록되지 않으며 데몬 재시작에서 생존하지 않습니다. 준비된 워커가 예기치 않게 종료되면 데몬은 계속 실행되고 `/daemon/status`에서 채널 워커 경고를 보고합니다.

## 웹훅 트리거 작업

데몬 관리 채널은 인증된 웹훅 이벤트도 수락할 수 있습니다. Qwen은 이벤트를 컨텍스트로 받아 중요한 것을 요약하고 결정하며 최종 응답을 구성된 채팅 대상으로 전달합니다. 이것은 원시 알림 릴레이가 아닙니다.
웹훅 작업은 대화형 승인 없이 실행되므로 `approvalMode: "yolo"`가 필요합니다. 이 설정은 웹훅 턴뿐만 아니라 전체 채널에 적용되므로 전용 웹훅 채널을 사용하거나 해당 채널의 일반 채팅 발신자를 엄격히 제한하세요.

채널 구성 예시:

```json
{
  "channels": {
    "dingtalk-main": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "cwd": "/repo",
      "senderPolicy": "allowlist",
      "allowedUsers": ["12345"],
      "approvalMode": "yolo",
      "sessionScope": "user",
      "webhooks": {
        "sources": {
          "github-ci": {
            "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
            "targets": {
              "operator": {
                "chatId": "DINGTALK_USER_ID",
                "senderId": "webhook:github-ci",
                "isGroup": false
              },
              "team": {
                "chatId": "OPEN_CONVERSATION_ID",
                "senderId": "webhook:github-ci",
                "isGroup": true
              }
            }
          }
        }
      }
    }
  }
}
```

DingTalk의 경우 모든 대상에 `isGroup`을 명시적으로 설정하세요. 직접 메시지 대상은 DingTalk 사용자 ID를 `chatId`로 사용하고 `isGroup: false`를 사용합니다. 그룹 대상은 그룹 `openConversationId`를 `chatId`로 사용하고 `isGroup: true`를 사용합니다. 다른 어댑터는 자체 능동 대상 형태가 필요할 수 있습니다.

데몬 관리 DingTalk, Feishu, Telegram 및 WeCom 채널은 승인된 인바운드 메시지에서 연락처를 동적으로 관찰합니다. 기본 7일 신선도 창 내에서 기본 워크스페이스에서 관찰된 연락처를 나열하세요:

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/workspace/channel/observed-contacts
```

`GET /workspaces/:workspace/channel/observed-contacts`를 사용하여 다른 등록된 신뢰 워크스페이스를 선택하세요. `?freshWithinSeconds=N`을 추가하여 1초에서 365일 사이의 창을 선택하세요. 데몬은 `workspace_channel_observed_contacts` 기능으로 이 API를 광고합니다.

응답은 완전한 플랫폼 ID와 레이블을 반환합니다. 그룹 레이블은 가능한 경우 수락된 인바운드 메시지에 이미 있는 이름을 사용합니다. DingTalk은 `conversationTitle`을 제공하고 Telegram은 `chat.title`을 제공합니다. Feishu와 WeCom 그룹 레이블은 현재 완전한 ID로 폴백합니다. 플랫폼 디렉토리 또는 그룹 세부 API는 쿼리되지 않습니다. 토픽 레이블도 완전한 ID로 폴백합니다. 각 `lastObservedAt`은 밀리초 정밀도의 표준 ISO 8601 UTC 타임스탬프입니다. 클라이언트는 사용자의 로컬 시간대로 변환하여 표시할 수 있습니다. 최상위 `users`는 직접 메시지에서 관찰된 사용자를 포함합니다. `groups`는 관찰된 그룹 대화를 포함하고, `groups[].users`는 각 그룹에서 관찰된 사용자를 포함하며, `groups[].topics[].users`는 Feishu 또는 Telegram 토픽에서 관찰된 사용자를 포함합니다:

```json
{
  "users": [
    {
      "channelName": "feishu-main",
      "label": "Example User",
      "id": "ou_complete_user_id",
      "lastObservedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "groups": [
    {
      "channelName": "feishu-main",
      "label": "oc_complete_chat_id",
      "id": "oc_complete_chat_id",
      "lastObservedAt": "2026-07-17T08:05:00.000Z",
      "users": [
        {
          "label": "Example User",
          "id": "ou_complete_user_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z"
        }
      ],
      "topics": []
    }
  ]
}
```

이러한 중첩 사용자는 관찰된 참여자이며 권위 있는 그룹 멤버십이 아닙니다. 직접/그룹, mention, 발신자 및 페어링 게이트를 통과한 메시지만 기록됩니다. 반복 관찰은 레이블과 타임스탬프를 갱신합니다. 수동 관찰은 관계가 오래되기 전까지 이탈이나 삭제를 감지할 수 없습니다. 메시지 내용은 절대 저장되지 않습니다. 경계된 레지스트리는 `$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json` 아래에 있으며 워크스페이스 체크아웃 외부에 있고 워크스페이스별로 분할됩니다. 500-관찰 제한은 해당 워크스페이스의 모든 채널과 대화에 공유되며 365일보다 오래된 관찰은 다음 수락된 쓰기에서 제거됩니다. 레지스트리가 잘못되었거나 지원되지 않는 버전을 사용하면 해당 파일을 삭제하여 초기화하세요. 수락된 트래픽이 다시 생성합니다. 웹훅 구성 및 전달은 변경되지 않습니다.

채널 워커가 활성화된 상태로 `qwen serve`를 시작하세요:

```bash
QWEN_SERVER_TOKEN="$QWEN_SERVER_TOKEN" qwen serve --require-auth --channel dingtalk-main
```

요청 예시:

```bash
curl -X POST "http://127.0.0.1:4170/channels/dingtalk-main/webhooks/github-ci" \
  -H "x-qwen-webhook-secret: $QWEN_CHANNEL_GITHUB_CI_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "push",
    "targetRef": "operator",
    "title": "CI pipeline finished",
    "payload": {
      "targetRef": "refs/heads/main",
      "repository": "qwen-code",
      "status": "success"
    }
  }'
```

웹훅 경로는 `qwen serve`가 베어러 인증과 함께 실행 중일 때도 웹훅 비밀 헤더로 인증합니다. 데몬 베어러 토큰을 웹훅 제공자와 공유하지 마세요. 웹훅 구성 및 `secretEnv` 값은 데몬이 시작될 때 로드됩니다. 웹훅 소스를 변경하거나 비밀을 회전한 후 `qwen serve`를 재시작하세요. `202 {"accepted": true}` 응답은 채널 워커가 작업의 소유권을 수락했음을 의미하며 최종 응답이 이미 채팅에 전달되었음을 의미하지 않습니다. 전달 실패를 문제 해결할 때 데몬 및 채널 워커 로그와 `/daemon/status`를 확인하세요.

### 멀티 채널 모드

이름 없이 `qwen channel start`를 실행하면 `settings.json`에 정의된 모든 채널이 단일 에이전트 프로세스를 공유하며 함께 시작됩니다. 각 채널은 자체 세션을 유지합니다 — Telegram 사용자와 WeChat 사용자는 동일한 에이전트를 공유하더라도 별도의 대화를 가집니다.

각 채널은 구성에서 자체 `cwd`를 사용하므로 다른 채널이 동시에 다른 프로젝트에서 작업할 수 있습니다.

### 서비스 관리

채널 서비스는 PID 파일(`~/.qwen/channels/service.pid`)을 사용하여 실행 중인 인스턴스를 추적합니다:

- **중복 방지**: 서비스가 이미 실행 중인 동안 `qwen channel start`를 실행하면 두 번째 인스턴스를 시작하는 대신 오류를 표시
- **`qwen channel stop`**: 다른 터미널에서 실행 중인 서비스를 정상적으로 중지
- **`qwen channel status`**: 서비스가 실행 중인지, 가동 시간 및 채널별 세션 수를 표시

### 충돌 복구

에이전트 프로세스가 예기치 않게 충돌하면 채널 서비스가 자동으로 재시작하고 모든 활성 세션을 복원하려고 시도합니다. 사용자는 처음부터 다시 시작하지 않고 대화를 계속할 수 있습니다.

- 세션은 서비스가 실행되는 동안 `~/.qwen/channels/sessions.json`에 저장됨
- 충돌 시: 에이전트가 3초 내에 재시작하고 저장된 세션을 다시 로드
- 3회 연속 충돌 후 서비스가 오류와 함께 종료
- 정상 종료(Ctrl+C 또는 `qwen channel stop`) 시: 세션 데이터가 정리됨 — 다음 시작은 항상 새로움

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
      "privatePolicy": "open",
      "sessionScope": "thread",
      "cwd": "/path/to/your/project",
      "instructions": "你是一个通过 QQ Bot 对话的 AI 助手。回复控制在 2000 字符以内。",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

> `sessionScope`의 기본값은 `"thread"`입니다. `groupPolicy: "disabled"`와 함께 사용하면 DM 전용 설정이며, `"thread"`와 `"user"` 모두 각 다이렉트 메시지에 자체 컨텍스트를 부여합니다. 여기서는 아래 [세션 격리](#session-isolation) 섹션과의 일관성을 위해 `"thread"`를 보여주며, 기존 채널의 scope를 변경하기 전에 해당 섹션의 업그레이드 노트를 읽으세요.

### QQ 전용 옵션

| 옵션        | 기본값  | 설명                                                                                        |
| ----------- | ------- | ------------------------------------------------------------------------------------------- |
| `appID`     | —       | 개발자 포털의 QQ Bot AppID. 생략하면 QR 코드 로그인이 사용됩니다.                            |
| `appSecret` | —       | QQ Bot AppSecret. `$ENV_VAR` 구문을 지원합니다. 생략하면 QR 코드 로그인이 사용됩니다.        |
| `sandbox`   | `false` | QQ 샌드박스 API 환경(`sandbox.api.sgroup.qq.com`)을 사용하려면 `true`로 설정하세요.          |
| `moderationTools` | `false` | QQ 그룹 관리 도구를 에이전트에게 노출합니다 — [그룹 관리 도구](#group-management-tools)를 참조하세요. 기본적으로 꺼져 있으며, 옵트인하려면 `true`로 설정하세요. |
| `moderationRecallWindowMs` | `-1` | 채널이 멤버 대상 삭제가 해결할 수 있는 수신 메시지를 보관하는 시간(밀리초). `-1`은 시간 제한 없음: 항목은 채팅당 상한이 있으며, 채널이 256개 이상의 채팅을 추적하면 가장 최근에 활동한 채팅의 전체 링이 축출될 수 있습니다. `0`은 멤버 대상 삭제를 완전히 비활성화합니다 — 세션에서 메시지 ID에 접근할 수 없으므로 운영자가 명시적으로 제공하거나 채널 로그에서 읽은 `message_id`만 전달할 수 있습니다. `N > 0`은 항목을 N밀리초 동안 보관합니다. 정수가 아니거나 `-1` 미만인 값은 경고하고 `-1`로 폴백합니다. |
| `groupAllPolicy` | 설정 안 함 | 일반(비-@) 그룹 메시지를 수신합니다: `"log"`는 관찰만, `"keyword"` 또는 `"all"`은 턴을 시작하게 합니다(`groups: {"*": {"requireMention": false}}`와 함께). 설정하지 않으면 게이트웨이는 @멘션과 다이렉트 메시지만 전달합니다. [그룹 채팅](#group-chats)을 참조하세요. |
| `purgeLegacySessions` | `false` | 레거시 단일-scope 및 user-scope 세션 라우트를 삭제합니다 — 아래를 참조하세요. |
| `forwardBotMessages` | `false` | 다른 봇이 작성한 메시지를 삭제하는 대신 `[bot]` 발신자 접두사와 함께 전달합니다 — [그룹 채팅](#group-chats)을 참조하세요. |

모든 표준 채널 옵션([채널 개요](./overview#options) 참조)도 지원됩니다:
`privatePolicy`, `allowedUsers`, `sessionScope`, `cwd`, `instructions`, `groupPolicy`, `groups`, `dispatchMode`.

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

1. 채널 구성에서 `groupPolicy`를 `"allowlist"`, `"pairing"` 또는 `"open"`으로 설정하세요
2. QQ Bot Open Platform 대시보드에서 그룹 관리자가 봇을 초대하여 QQ 그룹에 추가하세요
3. 그룹 멤버는 봇에게 **@멘션**해야 응답이 트리거됩니다
4. `groupPolicy: "pairing"`을 사용하는 경우, 응답이 시작되기 전에 그룹의 페어링 요청을 한 번 승인하세요. 그룹이 승인되면 기본적으로 **해당 그룹의 모든 멤버**가 봇을 사용할 수 있습니다(그룹의 `senders: "allowlist"`와 `allowedUsers`로 제한 가능). `privatePolicy`와 최상위 `allowedUsers`는 승인된 그룹의 멤버를 제한하지 않습니다.

QQ Bot API V2는 봇을 @멘션한 그룹 메시지만 전달합니다 — 봇은 모든 그룹 메시지를 볼 수 없습니다. 기본적으로 `requireMention`은 `true`이며 QQ에서는 그대로 두는 것이 좋습니다.

다른 봇이 작성한 메시지는 기본적으로 삭제됩니다. 대신 전달하려면 `forwardBotMessages: true`로 설정하세요: 이러한 메시지는 발신자 줄에 `[bot]` 접두사와 함께 모델에게 전달되며, 모델이 회신할지 판단합니다. 봇 간 대화는 결함이 아닌 기능이며, 스위치가 그 전체 경계입니다 — QQ는 사용자가 작성한 메시지에 대해서만 메시지 이벤트를 전달합니다(봇 자신의 전송은 이벤트가 아닌 전송 API의 응답으로 돌아옴). 따라서 활성화된 경로는 다른 봇의 메시지만 전달할 수 있습니다. 활성화된 경로에는 의도적으로 자동 속도 상한이 없습니다. 그룹의 인간 멤버와 모델의 자체 침묵 규칙(`<noreply>`)이 가드 역할을 하므로, 활성화는 명시적인 운영자 트레이드오프입니다.

### 예약된 루프 및 능동적 전달

루프, webhook 작업, 백그라운드 또는 이름 지정된 작업 결과는 생성한 채팅으로 **능동 메시지**로 전달됩니다 — QQ는 이를 응답 앵커 없이 게시하므로 최근 수신 메시지에 의존하지 않습니다. 그룹에서는 이러한 전달마다 그룹의 플랫폼 능동 메시지 할당을 소비합니다.

그룹 관리자가 능동 메시지를 비활성화한 경우, 이러한 전달은 앵커링된 수동 응답으로 자동 폴백하는 대신 실패합니다: 루프 및 webhook 대상 검사는 에이전트 턴 전에 실행을 거부하고, 백그라운드 및 이름 지정된 작업 결과는 전달 시 `ACTIVE_MSG_DISABLED`로 거부되며, 루프 스케줄러는 연속 실패를 추적하고 5회 후 루프를 자동 비활성화합니다. 능동적 전달은 채팅 타입이 이미 학습된 경우도 필요합니다: 봇이 메시지를 받은 적 없는 그룹의 루프 또는 webhook 대상은 전송 대신 거부됩니다.

### 세션 격리

QQ 채널은 기본적으로 `sessionScope: "thread"`를 사용합니다: 같은 그룹의 멤버는 `<channel>:<group_openid>`로 키링된 단일 대화 컨텍스트를 공유하며, 다른 그룹은 서로 격리됩니다. 각 다이렉트 메시지는 `<channel>:<user_openid>`로 키링된 자체 컨텍스트를 가집니다.

그룹 스레드 세션은 **공유 세션**입니다: 그룹의 모든 멤버가 같은 대화 기록을 읽고 계속합니다. 해당 세션에서 작동하는 명령어(`/clear`, `/cancel`, `/who`, `/status`, `/loop`, `/btw`), 권한 응답(`/approve`, `/approve-always`, `/deny`), 그리고 진행 중인 턴 조종(멤버의 일반 메시지는 실행 중인 턴을 조종하는 대신 뒤에 대기함)은 채널의 `operators`에 나열된 멤버로 제한됩니다. `allowedUsers`와 `senderPolicy`는 이를 부여하지 **않습니다**. `operators`는 기본적으로 설정되지 않으므로, 기본적으로 공유 그룹 세션은 해당 명령어를 실행할 수 있는 멤버가 **없으며**, 그룹에서 발생한 권한 요청에 응답할 수 있는 사람이 없습니다. 그룹 세션을 조종할 수 있어야 하는 멤버의 QQ ID로 `operators`를 설정하세요. 그룹 메시지의 경우 게이트는 해당 멤버의 `member_openid`를 비교합니다 — 위의 그룹 범위 `allowedUsers`와 같은 ID 공간이며, 다이렉트 메시지 `user_openid`가 아닙니다. `user_openid`로 채워진 목록은 아무도 매칭하지 않으며, 목록이 비어있지 않기 때문에 시작 경고는 조용히 유지되므로 위의 모든 명령어가 단순히 거부됩니다. `single` 또는 `chat_thread` 범위 채널도 동일한 영향을 받습니다. 해당 범위도 다이렉트 메시지 세션을 공유하기 때문입니다. `!` 호스트 쉘 접두사는 모든 QQ 그룹 채팅에서 범위와 관계없이 비활성화됩니다. 다이렉트 메시지에서는 같은 범위 규칙이 결정합니다 — `!`는 세션을 한 명의 발신자에게 비공개로 유지하는 범위(`"thread"` 또는 `"user"`)에서만 실행되며, `"single"` 또는 `"chat_thread"`에서는 DM도 거부되고 모든 그룹 메시지도 거부됩니다. 그룹 멤버가 기록을 공유하거나 서로의 턴을 제어하지 않아야 하는 경우, `sessionScope: "user"`로 설정하거나(각 멤버가 비공개 세션을 가짐 — 기존 채널을 전환하기 전에 아래 업그레이드 노트를 참조), 그룹 범위의 `senders` / `allowedUsers` 제어로 봇과 대화할 수 있는 사람을 제한하세요 — 예를 들어 `groups: {"*": {"senders": "allowlist", "allowedUsers": ["<member_openid>"]}}`. 최상위 `senderPolicy`, `allowedUsers`, `privatePolicy`는 다이렉트 메시지만 관리하며, 승인된 그룹의 멤버를 제한하지 않습니다.

전체 메시지 모드에서는 이 기본값이 이미 원하는 것입니다 — `groupAllPolicy: "all"`에서 `"thread"`를 유지하면 그룹 내 공유 컨텍스트와 그룹 간 격리가 제공됩니다. 대신 `sessionScope: "user"`로 설정하면 전체 메시지 트래픽이 발신자별로 분할되며(모든 멤버별 별도 세션), 이는 그룹 전체 메시지 시나리오에 적합하지 않습니다.

다른 공유 scope는 동등하지 않습니다. `sessionScope: "chat_thread"`는 그룹 메시지를 `"thread"`와 정확히 동일하게 라우팅하지만(QQ는 스레드 ID를 제공하지 않으므로 둘 다 `<channel>:<chatId>`로 키링), **모든** 채팅에 대해 공유로 처리됩니다: 각 다이렉트 메시지가 `operators` 게이트의 영향을 받는 공유 세션이 되므로 DM의 `/clear`는 거부되고 DM에서 발생한 도구 호출에 응답할 사람이 없습니다. `sessionScope: "single"`도 다이렉트 메시지를 공유하며, additionally **모든** 그룹과 다이렉트 메시지를 하나의 컨텍스트 `<channel>:__single__`로 키링하므로 그룹 A의 기록이 그룹 B 및 DM 기록으로 응답됩니다 — 이 섹션에서 다루는 크로스 그룹 누출입니다. 채널은 `groupAllPolicy`가 `"keyword"` 또는 `"all"`이고 scope가 `"thread"`가 아닌 경우 시작 시 경고합니다. `multiSession`이 활성화되면 scope가 `"user"`로 고정되므로, 해당 경고는 두 설정이 상호 배타적임을 이름 짓고 운영자에게 `groupAllPolicy`를 변경하거나 `multiSession`을 끄라고 말합니다. `"thread"`를 조언하는 대신입니다.

**이전 QQ 채널에서 업그레이드.** 기본 scope가 `"user"`에서 `"thread"`로 변경되었습니다. (`groupAllPolicy: "keyword"` 또는 `"all"`로 구성된 채널은 이전에 `"single"`로 강제되었습니다 — 하나의 글로벌 세션. `sessionScope`를 고정하지 않은 채널은 이제 `multiSession`이 켜져 있지 않은 한 `"thread"`로 해결되며, `multiSession`이 켜져 있으면 `"user"`로 해결됩니다 — 발신자별 세션은 `multiSession`이 지원하는 유일한 형태이므로 플러그인 기본값보다 우선합니다. `multiSession`이 없는 채널의 경우 유효한 변경은 해당 글로벌 세션에서 그룹별 세션으로의 변경입니다. `sessionScope`를 명시적으로 고정한 채널은 더 이상 재정의되지 않으므로 명시적 `"user"`가 이제 적용되어 그룹 전체 메시지 트래픽을 발신자별로 분할합니다 — 수동으로 `"thread"`로 변경하세요.) 레거시 세션 라우트는 자동으로 삭제되지 않습니다: `purgeLegacySessions`이 꺼져 있는 동안, 각 시작은 정리가 다루는 라우트를 계산합니다 — 단일-scope 시대의 `<channel>:__single__` 키와 이 채널의 레거시 user-scope `<channel>:<senderId>:<chatId>` 키 — 그리고 해당 데몬 측 세션과 함께 그대로 둡니다. `chat_thread` 시대의 `<channel>:<chatId>:<threadId>` 라우트는 다루지 않습니다: 계산되거나 정리되지 않습니다. 다루는 라우트를 제거하려면 채널에서 `purgeLegacySessions`을 `true`로 설정하세요. 활성화되면 해당 라우트가 모두 해제되고 데몬 측 세션이 삭제되므로 이전 대화 매핑이 존재하지 않게 됩니다. 정리는 옵션이 켜져 있는 동안 각 시작 시 실행됩니다. 구조 사본이 디스크에 도달하지 않는 한 아무것도 삭제되지 않습니다: 첫 번째 삭제 직전에 채널은 운명적인 라우트를 채널 상태 디렉토리의 `<channel>-sessions-purged.json`에 추가합니다(예: `~/.qwen/channels/my-qq-sessions-purged.json`; 채널 이름의 `A-Za-z0-9_-` 외부 문자는 `_`가 됨). 해당 쓰기가 실패하면 아무것도 삭제하지 않고 라우트를 그대로 둡니다. 파일은 실제로 삭제가 발생할 때만 작성됩니다 — 모든 것을 그대로 두는 시작에서는 절대 작성되지 않습니다. 이는 각 `purgedAt` 타임스탬프, `sessionScope`, `routes`를 가진 정리 레코드의 JSON 목록입니다. 각 라우트는 `kind`, `key`, `sessionId`, `target`을 가지며 — 라우터의 지속된 세션 상태가 여전히 기록하고 있는 경우 — `cwd`, `turns`, `startedAt`, `isolation`, `workspaceCwd`를 가집니다. 레코드는 덮어쓰기 대신 추가되므로 이전 정리의 레코드가 나중 정리의 레코드에서도 생존합니다(가장 오래된 레코드는 목록이 20개를 초과하면 삭제됨). 읽을 수 없거나 정리 레코드 목록을 보유하지 않는 파일은 로그에 보고되고 형제 `<path>.corrupt-<timestamp>` 파일로 이름이 변경됩니다. 손상된 사본은 수동 복구를 위해 보관되고 새 레코드는 절대 손실되지 않습니다. 이는 라우팅 메타데이터일 뿐이며 대화 내용은 아니므로 무엇이 삭제되었는지 보여주며 매핑을 수동으로 다시 생성할 수 있습니다: `cwd`를 포함하고 `isolation`이 없는 레코드의 라우트는 복원 시 동일한 워크스페이스로 해결됩니다. 레코드에 `isolation: "worktree"`도 있는 경우, `cwd`는 (보통 이미 제거된) 세션별 worktree이므로 레코드의 `workspaceCwd`를 기준으로 복원하고 `isolation`을 유지하여 라우터가 관리되는 로드 경로를 통해 재연결합니다. 라우트의 저장된 상태에 `cwd`가 없는 경우(항목이 없거나 필드 이전인 경우), 레코드는 추측하는 대신 `cwd`를 생략하므로 해당 라우트를 수동으로 복원하려면 채널의 워크스페이스 경로도 필요합니다. 정리 후 `sessionScope: "user"`를 설정한다고 해서 이전 대화가 자동으로 돌아오지는 않습니다 — 해당 라우트는 이미 사라졌으며 자동으로 복원되지 않습니다.

그룹 정책 및 멘션 게이팅에 대한 자세한 내용은 [그룹 채팅](./overview#group-chats)을 참조하세요.

## 그룹 관리 도구

`moderationTools: true`로 설정하면, 채널은 QQ 그룹 관리 API를 **해당 채널의 세션에서 클라이언트 MCP 도구**로 에이전트에게 노출합니다. 도구는 **기본적으로 꺼져 있습니다**: 파괴적이며 봇의 자체 토큰으로 실행되므로, 기존 배포는 운영자가 채널별로 옵트인할 때까지 꺼져 있습니다. 활성화되면 에이전트가 답변하면서 직접 호출합니다 — 입력할 슬래시 명령어나 운영자 확인 단계가 없습니다. 플랫폼의 자체 규칙이 유일한 제한이며, 아래 멤버 대상 삭제 규칙이 추가됩니다: `member_openid` 삭제는 해당 턴의 발신자가 해당 멤버인 경우에만, 또는 턴에 멤버 발신자가 없는 경우(예: 운영자가 시작한 턴)에만 허용됩니다.

| 도구 | QQ 엔드포인트 | 요구 사항 |
| --- | --- | --- |
| `qq_recall_message` | `DELETE /v2/groups/{id}/messages/{msg_id}` | 그룹 채팅만, 모든 호출은 대상(`member_openid` 또는 `message_id`)을 지정해야 합니다. 다른 멤버의 메시지를 삭제하려면 봇이 그룹 관리자여야 합니다. 봇의 자체 메시지는 삭제할 수 없습니다. |
| `qq_get_group_info` | `GET /v2/groups/{id}/info` | 예약됨 — 봇 앱에 대한 초대 전용(그렇지 않으면 `11253`) |
| `qq_get_bot_state` | `GET /v2/groups/{id}/bot_state` | 예약됨 — 봇 앱에 대한 초대 전용 |
| `qq_list_join_requests` | `GET /v2/groups/{id}/join_request_list` | 봇이 그룹 관리자 |
| `qq_review_join_request` | `POST .../approval_join_request/{member_openid}` | 봇이 그룹 관리자 |
| `qq_get_mute_status` / `qq_set_mute` | `GET`/`POST /v2/groups/{id}/restrict_chat_setting` | 봇이 그룹 관리자; 호출당 최대 30일, 20명 뮤트 |
| `qq_list_join_approval_strategies` | `GET /v2/groups/join_approval_strategy` | 봇 수준, 그룹별 아님 |
| `qq_create_join_approval_strategy` | `POST /v2/groups/join_approval_strategy` | `group_openids` / `group_ids` 중 하나; 봇당 최대 20개 전략 |
| `qq_update_join_approval_strategy` | `PATCH .../join_approval_strategy/{id}` | 그룹 ID는 전략이 생성된 형식을 사용해야 함 |
| `qq_delete_join_approval_strategy` | `DELETE .../join_approval_strategy/{id}` | — |
| `qq_execute_join_approval_strategy` | `POST .../join_approval_strategy/{id}/execute` | 전체 스캔 실행; 비동기, 약 10분 |
| `qq_set_join_approval_whitelist` | `POST .../join_approval_strategy/{id}/whitelist_users` | 호출당 최대 10,000개 번호, 전략당 100,000개 |
| `qq_list_group_members` | `GET /v2/groups/{id}/members` | 예약됨 — 플랫폼에서 초대 전용, 페이지당 최대 30명 |
| `qq_get_group_member` | `GET /v2/groups/{id}/members/{member_openid}` | 예약됨 — 초대 전용 |
| `qq_kick_member` | `POST /v2/groups/{id}/batch_remove_members` | 예약됨 — 초대 전용, 최대 20명, 선택적 블랙리스트 |
| `qq_list_member_blacklist` / `qq_update_member_blacklist` | `GET`/`POST /v2/groups/{id}/member_blacklist` | 예약됨 — 초대 전용; 그룹에 여전히 있는 멤버는 블랙리스트에 추가할 수 없음 |

"예약됨" 도구는 연결되고 호출 가능하지만, QQ 오픈 플랫폼은 현재 봇 앱이 허용 목록에 있지 않으면 `11253`을 응답하므로, 에이전트는 성공을 가정하는 대신 플랫폼의 거부를 보고합니다. 모든 도구는 플랫폼의 오류 코드와 그 의미를 보고하므로, ��이전트는 "봇이 그룹 관리자가 아님"과 "메시지를 더 이상 삭제할 수 없음"과 "이 앱은 이 엔드포인트를 호출할 수 없음"을 구별할 수 있습니다.

그룹 작업이 멤버의 메시지에 이름으로 도달하려면, 채널은 채팅별 마지막 수신 메시지를 기억합니다. `moderationRecallWindowMs`는 항목이 보관되는 시간을 제한하며, 기본값은 `-1`(시간 제한 없음)이므로, 항목은 채팅당 상한 또는 256-채팅 스위프가 축출할 때까지 해결 가능한 상태로 유지됩니다. 재시작은 메모리를 완전히 삭제하며, 새 메시지가 도착할 때까지 멤버별로 삭제할 수 있는 것이 없습니다. 또한 게이트웨이가 실제로 전달한 메시지만 보관합니다: `groupAllPolicy`가 설정되지 않으면 봇은 @멘션(및 다이렉트 메시지)만 받으므로, 멤버 대상 삭제는 `groupAllPolicy`가 `"keyword"`, `"all"`, 또는 `"log"`일 때만 일반 멤버의 **비-@** 메시지에 도달할 수 있습니다. 게이트웨이가 전달하는 @멘션은 어느 쪽이든 추적됩니다. 모델은 `allowMention`이 활성화된 경우에만(기본값) 전체 `member_openid`로 멤버를 지정할 수 있습니다: `allowMention: false`면 트랜스크립트가 잘린 발신자 이름을 가지므로 명시적 `message_id`만 작동합니다. `member_openid` 삭제는 해당 턴의 발신자에 대해서만, 또는 멤버 발신자가 없는 턴에서(예: 운영자가 시작한 턴) 허용되므로, 한 멤버가 봇의 관리자 토큰을 통해 다른 멤버의 메시지를 검열할 수 없습니다. 모든 호출은 대상을 지정해야 합니다: `member_openid`는 해당 멤버의 가장 최근 추적된 메시지를 삭제하고, `message_id`는 명시적 ID를 삭제합니다. 암시적 대상은 없으며, 도구는 봇의 자체 메시지를 절대 삭제하지 않습니다 — 따라서 플랫폼이 이것만 삭제하는 다이렉트 채팅은 지원되지 않습니다. 성공적인 삭제는 파괴한 메시지 ID를 보고하고 해당 ID를 채팅별 링에서 삭제하므로, 두 번째 멤버 대상 삭제는 파괴된 것을 재시도하는 대신 이전 메시지에 도달합니다. 실패한 삭제는 항목을 유지하므로 같은 대상을 재시도할 수 있습니다.

각 채널 인스턴스는 자체 도구를 소유합니다: 하나의 브리지가 여러 채널을 제공할 수 있으며, 도구는 등록한 채널의 세션에만 제공되므로, 하나의 프로세스에 있는 두 QQ 채널은 서로의 채팅이나 자격 증명에 절대 작동하지 않습니다.

## Markdown 지원

QQ Bot 채널은 Markdown 포맷(`msg_type=2`)을 지원합니다. 에이전트의 Markdown 응답이 그대로 전송되며, QQ는 이를 풍부한 포맷(굵게, 기울임꼴, 코드 블록, 링크, 목록)으로 렌더링합니다.

QQ 서버가 어떤 이유로든 Markdown 메시지를 거부하면, 채널이 자동으로 일반 텍스트로 재시도합니다 — 봇의 Markdown 기능이 서버 측에서 제한되어 있어도 메시지가 항상 전달됩니다.

이는 모든 Markdown을 제거하는 WeChat 채널과 반대입니다. QQ 채널에서는 에이전트가 전체 Markdown을 자유롭게 사용할 수 있습니다.

## 이미지, 비디오 및 파일

사용자는 봇에게 이미지, 비디오, 파일 및 음성 메시지를 전송할 수 있습니다. 이미지는 비전 입력으로 에이전트에게 전달되므로 에이전트가 실제 이미지를 볼 수 있습니다 — 스크린샷, 오류 메시지, 다이어그램 모두 작동합니다 — 그리고 동일한 파일이 이미지를 처리할 수 없는 모델을 위해 임시 로컬 경로에도 저장됩니다. 비디오, 파일 또는 음성 메시지는 임시 로컬 경로에 저장되고 해당 경로가 에이전트에게 전달됩니다.

미디어 메시지에 텍스트는 필요하지 않습니다 — 이미지 전용, 비디오 전용, 파일 전용 또는 음성 전용 메시지도 턴을 시작하며, 채널은 플레이스홀더로 `(image)`, `(video)`, `(file)` 또는 `(voice)`를 사용합니다. 메시지에 텍스트도 포함된 경우 해당 텍스트가 캡션으로 유지됩니다.

파일은 플랫폼이 `content_type: file`로 전달하는 모든 것입니다 — Word 문서, PDF, 스프레드시트, 아카이브, 소스 파일. QQ는 파일에 대해 MIME 타입을 보고하지 않으므로, 채널은 발신자의 확장자를 유지하고(문자와 숫자로 제한, 없으면 `.bin`으로 폴백) 시스템 임시 디렉토리의 `channel-files/<uuid>/` 아래에 바이트를 저장합니다. 에이전트의 읽기 도구는 해당 확장자를 사용하여 문서를 여는 방법을 결정합니다.

음성 메시지는 `content_type: voice`로 도착합니다. 원본 SILK URL과 함께 QQ는 `voice_wav_url`을 제공합니다 — 이미 WAV로 변환된 동일한 오디오입니다 — 채널은 이를 우선시합니다. 플랫폼이 이를 보내지 않으면 채널이 원본 URL로 폴백합니다. 바이트는 `channel-files/<uuid>/` 아래에 `qq_voice.wav`로 저장되거나, 원본 SILK URL이 사용된 경우 `qq_voice.silk`로 저장되며, 해당 경로가 에이전트에게 전달됩니다. 플랫폼의 ASR 텍스트는 사용되지 않으며, 에이전트는 저장된 오디오 파일에서 작업합니다.

- 이미지는 최대 8 MB, 비디오, 파일 및 음성 메시지는 최대 20 MB로 제한되며, 메시지당 최대 5개의 첨부 파일까지 처리됩니다. 이보다 큰 것은 건너뛰어 채널의 stderr에 기록됩니다.
- 다운로드된 파일은 삭제되지 않습니다. 시스템 임시 디렉토리에 남아 있으며, 시스템이 자체 일정에 따라 정리합니다.

이미지 입력에는 이미지를 허용하는 모델이 필요합니다. 모델이 멀티모달이지만 이름으로 인식되지 않는 경우 해당 기능을 선언하세요. 이 필드는 해당 모델을 제공하는 제공자 엔트리에 있어야 합니다. 최상위 `model.generationConfig` 값은 제공자 기반 모델에 대해 무시되기 때문입니다:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "your-model-id",
        "baseUrl": "https://example.invalid/v1",
        "generationConfig": {
          "modalities": { "image": true }
        }
      }
    ]
  }
}
```

텍스트 전용 모델의 경우 에이전트는 이미지 대신 "지원되지 않는 이미지" 메모와 저장된 경로를 받습니다.

QQ로 이미지, 비디오, 파일 또는 음성 메시지를 다시 전송하는 것은 지원되지 않습니다.

## 토큰 관리

액세스 토큰은 약 2시간 후에 만료됩니다. 채널은 TTL의 80%(보통 ~1.6시간)에서 자동으로 갱신합니다. 갱신에 실패하면 60초 후에 재시도합니다.

토큰 갱신은 WebSocket 재연결 시에도 계속됩니다 — AppID와 AppSecret이 유효한 한, 채널이 만료된 토큰 때문에 오프라인 상태가 되는 일은 없습니다.

## 연결 복원력

- **자동 재연결:** WebSocket 연결이 끊어지면, 지수 백오프로 재시도합니다(최대 20회, 재시도 간격 최대 30초)
- **세션 복원:** WebSocket이 잠시 끊어지면, QQ의 `RESUME` opcode를 사용하여 진행 중 메시지를 잃지 않고 세션을 복원합니다
- **서버 간 컨텍스트 연속성:** 채팅 세션과 라우팅 상태가 디스크에 저장됩니다. 데몬이 재시작되면 대화가 중단된 지점에서 계속됩니다
- **하트비트 모니터링:** HEARTBEAT_ACK 타임아웃이 감지되면 좀비 연결을 방지하기 위해 재연결을 강제합니다
- **메시지 중복 제거:** 재연결 후 재생된 메시지가 감지되어 건너뜁니다

## 팁

- **Markdown 자유롭게 사용** — WeChat과 달리, QQ는 Markdown을 네이티브로 렌더링합니다. 굵게, 코드 블록, 목록, 링크가 모두 작동합니다.
- **응답을 2000자 이하로 유지** — 더 긴 응답은 자동으로 청크로 분할됩니다. 지시에 길이 힌트를 추가하면 에이전트가 간결하게 유지하는 데 도움이 됩니다.
- **테스트에 샌드박스 사용** — 개발 중에 샌드박스 API를 사용하려면 `"sandbox": true`로 설정하세요. 프로덕션 메시지에는 영향이 없습니다.
- **액세스 제한** — 고정된 QQ 사용자 집합에 대해 `privatePolicy: "allowlist"`를 사용하거나, CLI에서 새 사용자를 승인하려면 `"pairing"`을 사용하세요. 자세한 내용은 [DM 페어링](./overview#dm-pairing)을 참조하세요.

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
- `privatePolicy: "allowlist"`를 사용하는 경우, QQ 사용자 ID가 `allowedUsers`에 있는지 확인하세요
- 첫 시작 시 터미널에 QR 코드가 표시됩니다 — QQ 앱으로 스캔하세요

### 봇이 그룹에서 응답하지 않음

- `groupPolicy`가 `"allowlist"`, `"pairing"` 또는 `"open"`으로 설정되어 있는지 확인하세요 (기본값은 `"disabled"`)
- `"pairing"`을 사용하는 경우, 그룹의 페어링 요청이 승인되었는지 확인하세요
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

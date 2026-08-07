---
title: GitHub
---

# GitHub

이 가이드는 GitHub 알림을 모니터링하고 mention, 리뷰 요청, 할당 및 팔로우 스레드 활동에 응답하는 Qwen Code 채널을 설정하는 방법을 다룹니다.

## 사전 요구 사항

- 알림을 읽고 댓글을 게시하는 데 필요한 권한으로 인증된 GitHub 계정
- 로컬 `gh` 인증을 사용할 때 Qwen Code를 실행하는 호스트에 설치된 [GitHub CLI](https://cli.github.com/)

인증된 계정이 채널도 작동해야 하는 경우 전용 봇 계정을 사용하세요. GitHub는 계정 자체 활동에 대한 사용 가능한 알림을 생성하지 않으며, 어댑터는 응답 루프를 방지하기 위해 자체 댓글을 무시합니다.

## 인증

Qwen Code 호스트에서 GitHub CLI 로그인을 재사용하려면 `gh`를 인증하고 채널 구성에서 `useLocalGh: true`를 명시적으로 설정하세요:

```bash
gh auth login
```

로컬 `gh` 인증은 계정 전체이며 해당 GitHub 계정에서 볼 수 있는 모든 저장소의 알림을 노출할 수 있습니다. 워크스페이스 운영자가 해당 계정을 사용하도록 신뢰되는 경우에만 활성화하세요. 그렇지 않으면 전용 PAT를 구성하세요.

GitHub Enterprise Server의 경우 `baseUrl`에서 사용하는 동일한 호스트를 인증하세요:

```bash
gh auth login --hostname github.example.com
```

대신 클래식 개인 접근 토큰(PAT)을 구성할 수도 있습니다. 명시적 `token`은 로컬 `gh` 인증을 재정의합니다. PAT에 다음 스코프가 필요합니다:

- **notifications** — 알림 스레드 읽기
- **public_repo**(또는 비공개 저장소의 경우 **repo**) — 댓글 게시

## 구성

채널을 `~/.qwen/settings.json`에 추가하세요:

```json
{
  "channels": {
    "my-github": {
      "type": "github",
      "useLocalGh": true,
      "pollInterval": 60000,
      "reasonFilter": ["mention", "review_requested", "assign"],
      "senderPolicy": "allowlist",
      "allowedUsers": ["operator-github-username"],
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "blockStreaming": "off",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

로컬 `gh` 인증을 PAT로 재정의하려면 채널에 `"token": "$GITHUB_TOKEN"`을 추가하고 Qwen Code를 시작하기 전에 환경 변수를 설정하세요:

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

인증된 계정은 자체 채널을 트리거할 수 없습니다. 해당 계정이 채널을 작동해야 하는 경우 별도의 봇 계정을 인증하고 `allowedUsers`에 운영자 계정만 넣으세요. 시작 시 인증된 계정만 포함된 허용 목록은 거부되며 다른 운영자와 함께 나타날 때 경고합니다.

### GitHub Enterprise

GitHub Enterprise Server의 경우 `baseUrl`을 설정하세요:

```json
{
  "baseUrl": "https://github.example.com/api/v3"
}
```

로컬 `gh` 인증은 HTTPS `baseUrl`이 필요하므로 데몬 호스트 자격 증명이 평문 HTTP로 전송되지 않습니다.

## 구성 옵션

| 옵션                    | 기본값                   | 설명                                                                                          |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `token`                 | 설정 안 됨               | `notifications` 스코프의 선택적 클래식 PAT. 로컬 `gh` 인증을 재정의                            |
| `useLocalGh`            | `false`                  | 데몬 호스트의 계정 전체 GitHub CLI 인증을 명시적으로 재사용                                    |
| `pollInterval`          | `60000`                  | 폴 간격(ms)                                                                                    |
| `baseUrl`               | `https://api.github.com` | API 기본 URL(GHE용)                                                                           |
| `groupPolicy`           | `"disabled"`             | 알림이 흐르려면 `"open"`이어야 함                                                             |
| `senderPolicy`          | `"allowlist"`            | 봇을 트리거할 수 있는 사용자                                                                 |
| `groups.*.requireMention` | `true`                 | 일반 댓글에 @mention 필요. 직접 알림 이유는 계속 실행                                         |
| `blockStreaming`        | `"off"`                  | 항상 `"off"`로 강제. 중간 모델 청크가 별도 댓글로 게시되지 않음. `"on"`은 지원되지 않음       |
| `reasonFilter`          | 설정 안 됨               | 처리할 GitHub 알림 이유의 선택적 허용 목록                                                    |

`reasonFilter`를 사용하여 `ci_activity`나 `state_change` 같은 시끄러운 알림 클래스를 제거하세요. `groups.*.requireMention`을 대체하기 위해 `reasonFilter: ["mention"]`을 사용하지 마세요. GitHub의 `mention` 이유는 스레드 수준에서 고정되어 있으므로 실제 새 @mention이 나중에 `comment`, `subscribed`, `author` 또는 다른 이유로 도착할 수 있으며 건너뛰어집니다.

유효한 `reasonFilter` 값은 `mention`, `review_requested`, `assign`, `author`, `comment`, `ci_activity`, `manual`, `state_change`, `subscribed`, `team_mention`, `security_alert`, `approval_requested`, `invitation`, `member_feature_requested`, `security_advisory_credit`입니다.

필터링된 알림은 폴 창에서 모든 수락된 작업이 완료된 후에만 읽음으로 표시されます. 나중에 필터를 제거해도 채널이 이미 건너뛴 알림이 다시 재생되지 않습니다.

## ⚠️ 보안

**공개 저장소**에서 `senderPolicy: "open"`을 설정하면 지원되는 알림 이유를 트리거하는 **모든 GitHub 사용자**가 `cwd`에서 에이전트를 구동하는 프롬프트를 제출할 수 있습니다. 여기에는 코드 읽기, 토큰 소비, 댓글 게시 및(권한 정책의 적용을 받으며) 도구 실행이 포함됩니다.

공개 저장소에서는 항상 명시적 `allowedUsers`가 있는 `senderPolicy: "allowlist"`를 사용하세요.

허용 목록 및 페어링 항목은 변경 불가능한 계정 ID가 아닌 **사용자 이름**을 따릅니다. 허용 목록에 있는 사용자가 GitHub 계정 이름을 변경하면 오래된 항목을 제거하세요. GitHub는 이전 사용자 이름을 누구나 사용할 수 있도록 해제하며 새 소유자가 허용 목록/페어링 권한을 상속합니다.

## Mention 감지

어댑터는 대소문자 구분 없는 정규식으로 댓글 텍스트와 첫 연락 이슈 또는 PR 본문에서 `@bot-username`을 스캔하여 mention을 감지합니다. `reason: "mention"` 값만 신뢰하지 않는데, 이것이 스레드 수준에서 고정되어 있기 때문입니다. 다른 이유는 리뷰, 분류, 팔로우 스레드 또는 폴백 프롬프트를 선택합니다.

## 작동 방식

어댑터는 GitHub의 Notifications API를 웨이크업 시그널로 사용합니다:

1. 읽지 않은 스레드에 대해 `GET /notifications`를 **폴링**
2. 커서 기반 시간 창 내에서 `listComments`를 통해 댓글을 **열거**
3. 디스패치 전에 소스 인벨롭프와 중복 제거 키를 포함하여 수락된 작업을 **저장**
4. 알림 이유별로 **디스패치**: 엄격한 mention 매칭, pull request 리뷰, 이슈 분류, 팔로우 스레드 댓글 집계 또는 댓글별 폴백
5. 수락된 작업이 완료된 후에만 **폴 창을 커밋**: 알림을 읽음으로 표시하고 커서를 진행
6. **첫 연락 폴백**: 댓글이 디스패치되지 않았을 때 브랜드 새로운 읽지 않은 이슈/PR 본문을 처리할 수 있습니다. mention 알림은 여전히 실제 본문 mention이 필요합니다

댓글 창은 `(previousCursor, currentMaxUpdatedAt]`입니다. 수락된, 실행 중 및 실패한 작업은 비공개 파일 권한으로 `~/.qwen/channels/<workspace-scope>/` 아래에 저장됩니다. 재시작 시 채널은 GitHub를 다시 폴링하기 전에 해당 작업을 복구합니다. 실패한 작업은 최대 3회 시도된 후 종료 상태가 됩니다. 취소된 작업은 종료 상태이며 재실행되지 않습니다. 최종 응답이 이미 게시, 억제 또는 확정적 무쓰기 재시용으로 큐잉된 작업은 재실행되지 않습니다.

알림 커서는 복구 가능한 작업이 남아 있거나 인바운드 작업 상태를 읽거나 쓸 수 없는 동안 진행되지 않습니다. 이것은 충돌 또는 에이전트 실패가 수락된 댓글을 잃는 것을 방지하고 알림 피드에서 두 번째 디스패치를 방지하는 데 필요한 중복 제거 키를 보존합니다.

댓글이 아닌 활동(푸시, 레이블 변경)은 알림의 `updated_at`을 갱신하지만 창에서 새 댓글을 0개 생성하므로, 다시 가져온 스레드는 에이전트를 트리거하지 않고 건너뛰어집니다.

## 응답 피드백

수락된 이슈 또는 pull-request 댓글에 대해 채널은 에이전트가 작업하는 동안 GitHub의 `👀` 리액션을 추가한 다음 실행이 완료, 실패 또는 취소되면 제거합니다. 두 작업 모두 최선을 다합니다: 리액션 API 또는 권한 실패는 기록되며 최종 응답을 방지하지 않습니다.

### 최종만 출력

GitHub 채널은 항상 최종만 전달을 강제합니다. 어댑터는 `blockStreaming`을 `"off"`로 설정하므로 중간 모델 청크가 별도 댓글로 게시되지 않으며 `blockStreaming: "on"`은 지원되지 않습니다.

```json
{
  "blockStreaming": "off"
}
```

GitHub가 속도 제한 응답 같은 확정적 무쓰기 전달 실패를 반환하면 채널은 최종 응답을
`~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-pending-deliveries.json`에
비공개 파일 권한으로 저장하고 다음 채널 시작 시 재시도합니다. 해당 인바운드 작업은
해당 전달이 성공하거나 확정적 종료 실패에 도달할 때까지 `reply_pending` 상태로 유지됩니다.
모호한 전달 실패는 GitHub가 댓글을 생성했을 수 있으므로 자동으로 재시도되지 않습니다.

## 알려진 제한

- **첫 시작 시 기존 읽지 않은 알림을 건너뜁니다.** 커서는 첫 시작 시 "지금"으로 초기화됩니다. 봇 시작 전에 생성된 알림은 스레드가 이후 새 활동을 받지 않는 한 처리되지 않습니다.
- 사용자가 봇의 폴 사이클 전에 github.com에서 알림을 읽음으로 표시하면 봇이 처리하지 않습니다.
- 봇은 현재 폴링 창 이전의 댓글을 읽지 않습니다. `author` 및 `comment` 알림은 해당 창에서 최대 20개의 댓글을 집계할 수 있습니다.
- 인라인 PR 리뷰 댓글과 리뷰 요약 본문은 열거되지 않습니다. 이슈/PR 댓글만 처리됩니다.
- 선택된 자격 증명은 Notifications API를 지원해야 합니다. 세분화된 PAT는 지원하지 않습니다. 로컬 `gh` 인증 또는 `notifications` 스코프의 클래식 PAT를 사용하세요.

## 채널 시작

```bash
qwen channel start my-github
```

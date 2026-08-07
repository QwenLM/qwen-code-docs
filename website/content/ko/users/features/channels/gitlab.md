---
title: GitLab
---

# GitLab

이 가이드는 GitLab todo를 모니터링하고 이슈 및 merge request의 mention에 응답하는 Qwen Code 채널을 설정하는 방법을 다룹니다.

## 사전 요구 사항

- GitLab 계정(또는 전용 봇 계정)
- `read_api` 및 `api` 스코프가 있는 GitLab 개인 접근 토큰

## 토큰 생성

1. **Preferences → Access Tokens**으로 이동
2. 다음 스코프로 토큰을 생성:
   - **read_api** — todo 및 프로젝트 데이터 읽기
   - **api** — 이슈/MR에 노트(댓글) 게시
3. 토큰을 환경 변수로 안전하게 저장

## 구성

채널을 `~/.qwen/settings.json`에 추가하세요:

```json
{
  "channels": {
    "my-gitlab": {
      "type": "gitlab",
      "token": "$GITLAB_TOKEN",
      "pollInterval": 60000,
      "senderPolicy": "open",
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "action_prompt_template": {
        "mentioned": "Project: %project% | URL: %project_url% | Author: %author% | Type: %target_type% | IID: %iid% | Title: %title% | Description: %description% | TodoID: %todo_id%"
      }
    }
  }
}
```

토큰을 환경 변수로 설정하세요:

```bash
export GITLAB_TOKEN="glpat-your_token_here"
```

### 셀프 호스팅 GitLab

셀프 호스팅 인스턴스의 경우 `baseUrl`을 설정하세요:

```json
{
  "baseUrl": "https://gitlab.example.com"
}
```

## 구성 옵션

| 옵션                   | 기본값                    | 설명                                                |
| ---------------------- | ------------------------- | --------------------------------------------------- |
| `token`                | (필수)                    | `read_api` + `api` 스코프의 PAT                    |
| `pollInterval`         | `60000`                   | 폴 간격(ms)                                         |
| `baseUrl`              | `https://gitlab.com`      | GitLab 인스턴스 URL                                 |
| `action_prompt_template` | (처리에 필수)            | GitLab 작업 이름을 메타데이터 템플릿에 매핑          |
| `groupPolicy`          | `"disabled"`              | `"open"` 또는 프로젝트가 나열된 `"allowlist"`여야 함 |
| `senderPolicy`         | `"allowlist"`             | 봇을 트리거할 수 있는 사용자                        |

## action_prompt_template

이 필드는 어떤 todo 작업이 처리되고 메타데이터가 어떻게 렌더링되는지를 제어합니다. 구성된 템플릿이 있는 작업만 디스패치되며, 나머지는 건너뛰어지고 완료로 표시されます.

```json
{
  "action_prompt_template": {
    "mentioned": "Project: %project% | Author: %author% | Title: %title%"
  }
}
```

`directly_addressed` 작업(`@bot`으로 시작하는 댓글)은 명시적으로 구성되지 않은 경우 자동으로 `mentioned` 템플릿으로 폴백합니다.

### 사용 가능한 작업 키

| 키                  | 트리거                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| `mentioned`         | 누군가 댓글이나 설명에서 봇을 @mention(시작 부분이 아님)                   |
| `directly_addressed` | 댓글이 **`@bot`으로 시작**(`mentioned` 템플릿으로 폴백)                    |
| `assigned`          | 누군가 봇을 이슈/MR에 할당                                                 |
| `review_requested`  | 누군가 봇을 MR의 리뷰어로 요청                                             |
| `approval_required` | MR에 봇의 승인이 필요(승인 규칙)                                           |
| `marked`            | 누군가 봇의 댓글/이슈/MR을 표시(별)                                        |
| `build_failed`      | 봇의 브랜치/MR에서 CI/CD 파이프라인이 실패                                 |
| `unmergeable`       | 봇이 관련된 MR이 병합 불가 상태(충돌)                                      |
| `merge_train_removed` | MR이 merge train에서 제거됨                                              |

`action_prompt_template`에 있는 키만 처리됩니다. 구성되지 않은 작업은 조용히 건너뛰어지고 완료로 표시됩니다.

### 템플릿 변수

| 변수          | 값                               |
| ------------- | -------------------------------- |
| `%project%`   | 프로젝트 경로(예: `owner/repo`)  |
| `%project_url%` | 전체 프로젝트 URL              |
| `%author%`    | Todo 작성자 사용자 이름          |
| `%target_type%` | `Issue` 또는 `MergeRequest`    |
| `%iid%`       | 이슈/MR 내부 ID                  |
| `%title%`     | 이슈/MR 제목                     |
| `%description%` | 이슈/MR 설명 본문              |
| `%todo_id%`   | GitLab todo ID                   |
| `%%`          | 리터럴 `%`(이스케이프)           |

알 수 없는 변수는 출력에서 그대로 유지됩니다.

### 프롬프트 조립

템플릿은 `envelope.metadata`(구조화된 컨텍스트)로 렌더링됩니다. 트리거 텍스트(`todo.body` 또는 설명)는 `envelope.text`(기본 프롬프트)로 들어갑니다. 기본 클래스가 에이전트에 전송되는 최종 프롬프트를 조립합니다:

```
[alice] please fix this bug

Project: owner/repo | URL: https://gitlab.com/owner/repo | Author: alice | Type: Issue | IID: 42 | Title: Test Issue | Description: ... | TodoID: 100
```

- 1번째 줄: `[sender]` 접두사 + `envelope.text`(`@bot` 제거됨)
- 3번째 줄: `envelope.metadata`(렌더링된 템플릿, 삭제됨)

`%body%` 변수가 **필요하지 않습니다** — 댓글/설명 텍스트가 항상 기본 프롬프트 내용이며, 템플릿은 그 아래에 보조 컨텍스트를 제공합니다.

## ⚠️ 보안

**공개 프로젝트**에서 `senderPolicy: "open"`을 설정하면 봇을 @mention하는 **모든 GitLab 사용자**가 `cwd`에서 에이전트를 구동하는 프롬프트를 제출할 수 있습니다.

공개 프로젝트에서는 항상 명시적 `allowedUsers`가 있는 `senderPolicy: "allowlist"`를 사용하세요.

## Mention 감지

어댑터는 항상 디스패치된 인벨롭프에서 `isMentioned = true`를 설정합니다. GitLab이 이미 todo를 생성할 때 mention을 결정했기 때문입니다. `action_prompt_template` 구성이 실제 이벤트 필터입니다 — 구성된 템플릿이 있는 작업만 처리됩니다. `@bot` mention은 `stripBotMention`을 통해 디스패치 전에 메시지 텍스트에서 제거됩니다.

### ⚠️ groupPolicy는 "open" 또는 "allowlist"여야 합니다

`groupPolicy`는 todo가 처리되려면 `"open"` 또는 프로젝트가 명시적으로 나열된 `"allowlist"`로 설정되어야 합니다. 기본값 `"disabled"`는 모든 mention을 삭제합니다: todo는 완료로 표시되고 커서가 진행되지만 디스패치는 발생하지 않습니다. 거부가 로그에 기록되지만(`preflight rejected reason=group_disabled`) todo는 여전히 소비됩니다. 봇이 mention에 응답하지 않으면 `groupPolicy`가 `"disabled"`가 아닌지 확인하세요.

## 작동 방식

어댑터는 GitLab의 Todos API를 메시지 소스로 사용합니다:

1. 새 todo에 대해 `GET /todos?state=pending`을 **폴링**
2. **첫 폴 드레인**: 커서가 아직 초기화되지 않았으면(`initialized: false`) 모든 대기 중인 todo가 디스패치 없이 완료로 표시되고 커서가 최대 todo ID로 진행됩니다. 이것은 첫 시작 시 백로그 홍수를 방지합니다.
3. **오래된 todo 정리**: `id <= cursor`인 todo는 완료로 표시(최선 노력)되어 매 폴에서 다시 가져와지는 것을 방지
4. `id > cursor` 및 구성된 `action_prompt_template`로 **필터**
5. `target_url` 앵커를 통해 mention 유형 **감지**:
   - `#note_123` 존재 → 댓글 mention → 텍스트는 `todo.body`(댓글)
   - 앵커 없음 → 설명 mention → 텍스트는 이슈/MR 설명
6. `handleInbound`를 통해 인벨롭프 **디스패치**(`groupPolicy: "open"` 또는 프로젝트가 나열된 `"allowlist"` 필요)
7. 커서 **진행** 및 todo **완료 표시**(최선 노력)

커서(`lastProcessedId`)는 디스패치 성공 또는 실패와 관계없이 진행됩니다. 실패한 디스패치는 이슈/MR에 ⚠️ 오류 댓글을 게시하며 재시도되지 않습니다. 사용자가 봇을 다시 mention하여 새 todo를 트리거할 수 있습니다.

## 응답 피드백

수락된 댓글 mention(`#note_` 앵커가 있는 노트)에 대해 채널은 에이전트가 작업하는 동안 노트에 👀 award emoji를 추가한 다음 실행이 완료, 실패 또는 취소되면 제거합니다. 두 작업 모두 최선을 다합니다: award emoji API 또는 권한 실패는 기록되며 최종 응답을 방지하지 않습니다.

설명 mention(`#note_` 앵커 없음)은 반응할 특정 노트가 없으므로 award emoji를 받지 않습니다.

## 알려진 제한

- **첫 시작 시 기존 대기 중인 todo를 건너뜁니다.** 커서는 `{ lastProcessedId: 0, initialized: false }`로 첫 시작 시 초기화됩니다. 첫 폴 사이클에서 모든 기존 대기 중인 todo가 디스패치 없이 완료로 표시됩니다(`initialized` 플래그가 이 일회성 드레인을 게이트). 백로그 홍수를 방지합니다.
- 봇은 이전 대화 기록을 읽지 않습니다 — 트리거된 내용만 처리됩니다.
- **기밀(내부) 노트:** 누군가 기밀 노트에서 봇을 @mention하면 todo body에 해당 내부 텍스트가 포함되고 에이전트가 처리합니다. 봇의 응답은 항상 **공개** 노트로 게시되어 내부 토론이 노출될 수 있습니다. GitLab의 todo API는 노트 공개 여부를 노출하지 않으므로 어댑터가 이를 필터링할 수 없습니다. 기밀 노트에서 봇을 @mention하지 마세요.
- `read_api` + `api` PAT 스코프가 필요합니다. 그룹 수준 또는 프로젝트 수준 토큰도 이 스코프가 있으면 작동합니다.
- Epic, Design 및 Alert용 todo는 건너뛰어집니다(이슈와 MR만 처리됨).

## 채널 시작

```bash
qwen channel start my-gitlab
```

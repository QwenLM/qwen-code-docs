
# DingTalk Workspace (DWS)

DWS 채널은 DingTalk Workspace CLI에서 이미 인증된 계정을 사용합니다. 직접 및 그룹 메시지를 수신하고, DingTalk 문서 언급 알림 카드를 인식하며, 에이전트의 응답을 원본 메시지 또는 문서 댓글에 게시합니다.

이는 [DingTalk bot 채널](./dingtalk)과는 별개입니다. 전용 애플리케이션 봇에는 `type: "dingtalk"`을 계속 사용하고, Qwen Code가 기존 DWS 로그인을 통해 작동해야 하는 경우 `type: "dws"`를 사용하세요.

## 사전 요구 사항

Qwen Code를 실행하는 호스트에 DWS CLI 1.0.57 이상을 설치하고, 해당 프로세스의 `PATH`에서 `dws`가 해석되는지 확인하세요:

```bash
dws version --format json
```

동일한 호스트에서 인증하세요:

```bash
dws auth login
dws profile list --format json
dws auth status --format json
```

헤드리스 서버에서는 `dws auth login --device`를 사용하세요. 채널은 시작 시 정확히 하나의 기존 프로필을 고정합니다. `profile`을 정확한 프로필 이름 또는 corpId로 설정하거나, 생략하면 `isCurrent`로 표시된 항목이 고정됩니다. 채널은 모든 DWS 로그인을 동일하게 취급하며 `user_id` 메타데이터에 의존하지 않습니다.

## 구성

`~/.qwen/settings.json`에 채널을 추가하세요:

```json
{
  "channels": {
    "dws-work": {
      "type": "dws",
      "profile": "profile-name-or-corp-id",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "watchTodos": true,
      "groups": {
        "*": { "requireMention": true }
      },
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project"
    }
  }
}
```

YOLO 승인 모드는 대화형 확인 없이 도구 호출을 실행해야 하는 답변 봇에 사용할 수 있습니다:

```json
{
  "channels": {
    "dws-answers": {
      "type": "dws",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "approvalMode": "yolo",
      "cwd": "/path/to/answer-bot"
    }
  }
}
```

YOLO 모드는 모든 도구 호출을 자동 승인합니다. 신뢰할 수 있는 봇 계정과 워크스페이스에만 사용하세요.

`senderPolicy`와 `groupPolicy`는 새로 관리되는 DWS 채널에서 기본값이 `pairing`입니다. 채널이 반환한 코드로 사용자 또는 그룹을 승인하세요:

```bash
qwen channel pairing approve dws-work CODE
```

`senderPolicy`는 직접 메시지 발신자, 문서 알림 작성자, 네이티브 todo 생성자, `open` 또는 `allowlist` 그룹의 발신자를 제어합니다. `groupPolicy`는 그룹 대화를 제어합니다. 승인된 pairing 그룹은 공유 채널 동작을 따르며 해당 멤버를 인증합니다. open과 allowlist 그룹은 `senderPolicy`도 통과해야 합니다.

`groups`는 언급 동작을 제어합니다. 구체적인 그룹 ID는 `"*"`를 재정의합니다. `requireMention: true`이면 @ 메시지만 채널을 깨웁니다. `requireMention: false`이면 일반 메시지도 그룹 및 발신자 정책을 통과한 후 수신됩니다.

그룹 언급은 실시간 개인 이벤트 스트림을 우선 사용합니다. 채널은 또한 5초마다 최근 `@` 메시지 기록을 확인하므로, DingTalk가 개인 이벤트 스트림에서 제외하는 경우에도 외부 그룹의 언급이 복구됩니다. 메시지는 두 경로 모두에서 대화 및 메시지 ID로 중복 제거됩니다.

메시지가 다른 DingTalk 메시지를 인용하는 경우, 인용된 텍스트는 실시간 및 기록 폴백 경로 모두에서 에이전트에 대한 답장 컨텍스트로 포함됩니다.

## 문서 언급

문서 또는 지식 기반 관찰 목록은 없습니다. 문서 작업을 시작하려면:

1. 인증된 계정을 @언급하는 DingTalk 문서 댓글을 추가합니다.
2. 해당 계정으로 DingTalk 알림을 보내는 옵션을 활성화합니다.
3. DWS가 계정의 직접 메시지 기록을 통해 알림 카드를 전달합니다.

채널은 해당 알림에서 문서 ID, 댓글 키 및 요청을 추출합니다. 참조된 문서를 읽어서 컨텍스트로 사용하고, 작업이 실행되는 동안 DingTalk의 `暗中观察` 눈 리액션을 추가하고, 원본 문서 댓글에 답글을 답니다. 실시간 DWS 이벤트 스트림은 카드가 포함된 경우 사용되며, 5초 증분 기록 확인은 현재 이벤트 스트림에서 누락된 카드를 커버합니다.

알림을 생성하지 않는 댓글은 의도적으로 무시됩니다. 동일한 문서 댓글에 대한 중복 알림 메시지는 한 번만 실행됩니다. 문서 작업은 `senderPolicy`를 따르며 `approvalMode` `default`, `plan` 또는 `yolo`를 지원합니다. 생략되면 `default`가 사용됩니다.

## 네이티브 Todo 변경

`watchTodos: true`를 설정하면 선택된 DWS 프로필의 보류 중인 네이티브 todo 중 계정이 실행자인 것을 폴링합니다. 이 옵션은 기본적으로 `false`이므로 DWS 채널을 추가해도 기존 todo가 암묵적으로 실행되지 않습니다.

첫 번째 성공적인 스캔은 기준선을 설정하며 과거 todo를 처리하지 않습니다. 이후 스캔은 todo가 새로 할당되거나, 다시 열리거나, 제목, 우선순위, 마감일, 할당자 등 실행 가능한 필드가 변경될 때 작업을 실행합니다. 최종 응답은 원본 todo에 댓글로 추가됩니다. 댓글 전용 메타데이터와 수정 타임스탬프는 변경 감지에서 제외되므로 채널 자체의 응답이 루프를 트리거하지 않습니다. 완료 또는 제거는 보류 집합에서 todo를 삭제하며, 다시 열면 새 트리거가 생성됩니다.

네이티브 todo는 todo 생성자 ID를 기준으로 `senderPolicy`를 따릅니다. `pairing`에서 채널은 pairing 코드 댓글을 하나 추가하고 todo를 보류 상태로 유지합니다. 생성자가 로컬에서 승인되면 이후 폴링에서 변경되지 않은 todo를 처리할 수 있습니다. 폴링은 30초마다 실행되며 고정된 프로필의 현재 조직으로 범위가 제한됩니다.

## 시작 및 확인

채널을 직접 실행하세요:

```bash
qwen channel start dws-work
```

또는 데몬이 관리하게 하세요:

```bash
qwen serve --workspace /path/to/your/project --channel dws-work
```

두 방법을 동시에 실행하지 마세요. 채널 서비스 리스를 공유하기 때문입니다.

로컬 확인을 위해 다른 계정에서 직접 메시지를 보내고, 필요하면 pairing을 승인한 후, 작업이 실행되는 동안 eyes 리액션이 나타나는지 확인하세요. 그런 다음 @언급 알림이 활성화된 문서 댓글을 추가하세요. 채널은 알림 메시지에 리액션하고, 문서를 읽은 후 원본 문서 댓글에 최종 응답을 게시해야 합니다. 알림이 비활성화된 댓글은 작업을 생성하지 않아야 합니다.

채널은 DWS가 인증된 계정으로 식별하는 발신 ID의 이벤트를 무시하여, 메시지 텍스트에서 ID를 추론하지 않고도 답글 및 pairing 루프를 방지합니다. IM 소스를 시작하려면 고유한 자기 식별 정보가 필요합니다. 인증된 계정이 openDingTalkId를 노출하지 않고 동일한 프로필의 이전 세션이 하나도 기록하지 않은 경우, 채널은 연결을 거부합니다. 일시적으로 ID를 잃는 재연결의 경우, 이전에 기록된 자기 발신 ID에 대한 필터링을 유지합니다.

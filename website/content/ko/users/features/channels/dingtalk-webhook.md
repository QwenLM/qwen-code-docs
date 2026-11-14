# DingTalk Webhook 전송

DingTalk 커스텀 로봇을 사용하여 그룹에 알림과 작업 결과를 게시합니다.
이 전송 모드는 애플리케이션 봇, 장시간 연결, 공개 콜백 서버 또는 대화 ID를 필요로 하지 않습니다. 에이전트와의 대화에는 [DingTalk 애플리케이션 봇](./dingtalk)을 대신 사용하십시오.

## 로봇 생성

1. 대상 DingTalk 그룹에 커스텀 로봇을 추가합니다.
2. webhook URL을 복사합니다. URL은 다음으로 시작합니다:
   `https://oapi.dingtalk.com/robot/send?access_token=...`.
3. 로봇의 보안 설정을 구성합니다. 서명 활성화 시 서명 시크릿도 복사합니다. 키워드 및 IP 제한은 모든 메시지에 계속 적용됩니다.

webhook URL에는 자격 증명이 포함되어 있습니다. 예약 작업의 프롬프트나 전송 대상이 아닌 시크릿 또는 환경 참조로 저장하십시오.

## Channel 구성

워크스페이스의 Channel 설정에 이름이 지정된 인스턴스를 추가합니다:

```json
{
  "channels": {
    "team-notices": {
      "type": "dingtalk-webhook",
      "webhookUrl": "$DINGTALK_WEBHOOK_URL",
      "signingSecret": "$DINGTALK_WEBHOOK_SECRET"
    }
  }
}
```

Qwen Code를 시작하는 데 사용되는 환경에서 참조된 변수를 설정합니다. 로봇이 서명을 필요로 하지 않을 때 `signingSecret`을 생략합니다. 이 시크릿은 커스텀 로봇의 서명 시크릿이며, 애플리케이션의 Client Secret이 아닙니다.

해당 워크스페이스에서 데몬을 실행합니다:

```bash
qwen serve --channel team-notices
```

하나의 이름이 지정된 인스턴스는 하나의 구성된 그룹을 나타냅니다. 다른 그룹에 대한 추가 인스턴스를 생성합니다. 인스턴스의 URL을 업데이트하면 이를 참조하는 향후 전송의 대상이 변경됩니다.

## Web Shell 사용

Channels에서 DingTalk와 webhook 전송 방식을 선택합니다. webhook URL과 선택적 서명 시크릿을 저장한 다음 Channel을 시작합니다. 수신, 페어링 및 에이전트 세션 설정은 이 방식에 적용되지 않습니다.

ready/connected 상태는 로컬 전송 리소스가 준비되었음을 의미하며, 원격 자격 증명을 검증하지는 않습니다.

예약 작업에서 영구 작업을 선택하고 이 Channel을 전송 대상으로 선택합니다. Web Shell은 구성된 대상을 자동으로 채웁니다. 관찰된 연락처나 수동 사용자/채팅 ID가 필요하지 않습니다. 기존 실행별 전송 제한이 계속 적용됩니다.

동일한 제어는 `WebShellWithProviders`에서 사용하는 공유 Web Shell에서도 사용할 수 있습니다. 호스트가 Channels 및 예약 작업을 활성화하고 일반 데몬 워크스페이스를 제공할 때 사용됩니다.

## 명시적 API 전송

Notify 및 명시적 프롬프트/예약 전송은 기존 Channel 대상 형식을 사용합니다. 이 어댑터는 `chat/default`를 유일한 논리적 대상으로 정의합니다:

```json
{
  "text": "The daily report is ready.",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "team-notices",
      "type": "chat",
      "id": "default"
    }
  }
}
```

이것은 워크스페이스 Notify 요청 본문입니다. `default`는 어댑터 소유의 별칭이며, DingTalk 대화 ID가 아닙니다. 다른 ID 및 사용자 대상은 거부됩니다. 어댑터는 임의의 요청된 대상을 절대 무시하지 않습니다. webhook URL과 서명 시크릿은 Channel 구성에 유지됩니다.

## 전송 동작

- 메시지를 Markdown으로 전송하며, 첫 줄에서 파생된 짧은 제목을 포함합니다.
  일반 텍스트도 허용됩니다. 어댑터는 테이블 구문을 포함한 제공된 Markdown을 보존하며, 렌더링은 DingTalk 클라이언트에서 처리합니다.
- 메시지를 수신하거나, 인바운드 webhook 작업을 실행하거나, Channel 루프를 활성화하지 않습니다.
- HTTP 상태와 DingTalk의 비즈니스 응답을 모두 확인합니다. 거부된 서명, 자격 증명, 보안 규칙 및 속도 제한은 정리된 오류와 함께 실패로 처리됩니다.
- 자동으로 재시도하지 않습니다. 타임아웃으로 인해 원격 수락 여부를 알 수 없게 될 수 있습니다.
- `NO_PROXY` 우회를 포함한 워크스페이스 프록시 구성을 사용합니다.
- Channel이 중지될 때 전송 중인 메시지를 취소합니다. 리로드 시 업데이트된 저장된 구성을 사용합니다.
- 잘린 결과를 표시하는 공유 전송 크기 보호를 유지합니다.
  첫 번째 릴리스는 해당 결과를 하나의 메시지로 전송하고 DingTalk가 과도한 크기의 콘텐츠를 거부하도록 합니다. 거부는 전송 실패로 보고됩니다. 어댑터는 단축된 사본을 전송하거나, 메시지를 분할하거나, 재시도하지 않습니다. DingTalk의 정확한 Markdown 크기 제한과 단위가 확인되지 않았으므로, 공유 크기 검사를 통과한다고 해서 전송이 보장되지는 않습니다. 예약 보고는 간결하게 유지하십시오.
- 예약 전송은 기존 최선 노력 성공적 최종 결과 동작을 유지합니다. 이로 인해 실패/취소 알림, 내구성 있는 재시도 큐, 첨부 파일 또는 일반 webhook 페이로드 계약이 도입되지 않습니다.

플랫폼 요구 사항에 대해서는 DingTalk의 [sending API](https://open.dingtalk.com/document/orgapp/custom-robots-send-group-messages),
[message types](https://open.dingtalk.com/document/orgapp/custom-bot-send-message-type),
[security settings](https://open.dingtalk.com/document/orgapp/customize-robot-security-settings)를 참조하십시오.
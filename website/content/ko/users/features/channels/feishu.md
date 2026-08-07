---
title: Feishu
---

# Feishu(비서우) / Lark

이 가이드는 Feishu(飞书) / Lark에 Qwen Code 채널을 설정하는 방법을 다룹니다.

## 사전 요구 사항

- Feishu 조직 계정
- App ID와 App Secret이 있는 Feishu 애플리케이션(아래 참조)

## 애플리케이션 생성

1. [Feishu Open Platform](https://open.feishu.cn)으로 이동
2. 새 애플리케이션을 생성(또는 기존 것 사용)

![](https://gw.alicdn.com/imgextra/i4/O1CN01ORb10i1JM0MQfhnsV_!!6000000001013-2-tps-2219-931.png)

3. 애플리케이션 아래에서 **Bot** 기능을 활성화(기능 추가 → 로봇)

![](https://gw.alicdn.com/imgextra/i4/O1CN01bClpxu1FZxyH4kNjJ_!!6000000000502-2-tps-2219-931.png)

4. **이벤트 구독**(이벤트 및 콜백)에서 **긴 연결**(긴 연결을 사용하여 이벤트 수신)을 선택

![](https://gw.alicdn.com/imgextra/i1/O1CN01uIwzbl1ph8Kwq7hTI_!!6000000005391-2-tps-2219-1166.png)

5. `im.message.receive_v1` 이벤트(메시지 수신)를 추가

![](https://gw.alicdn.com/imgextra/i2/O1CN01n7sZmV28s6WX0aDhw_!!6000000007987-2-tps-2219-1090.png)

6. 애플리케이션 자격 증명 페이지에서 **App ID**(Client ID)와 **App Secret**(Client Secret)을 기록

![](https://gw.alicdn.com/imgextra/i2/O1CN01ag1yBh1DxfEUb4xmE_!!6000000000283-2-tps-2219-1166.png)

### 필수 권한

**권한 및 범위**(권한 관리)에서 다음 권한을 활성화하세요:

- `im:message` — 메시지 읽기 및 전송
- `im:message:send_as_bot` — 봇으로 메시지 전송
- `im:resource` — 메시지 리소스(이미지, 파일) 접근

데몬에서 발견된 연락처에 ID 대신 사용자 및 그룹 이름을 표시하려면
다음 권한을 선택적으로 활성화하세요:

- `contact:user.basic_profile:readonly` — 사용자 표시 이름 읽기
- `im:chat:readonly` — 그룹 이름 읽기

이 선택적 권한이 없어도 메시지는 정상 작동하며 발견된 연락처는
Feishu 사용자 및 채팅 ID를 레이블로 유지합니다.

### 애플리케이션 게시

권한 및 이벤트를 구성한 후 버전을 생성하고 게시하세요. 애플리케이션이 게시되고 승인될 때까지 봇이 작동하지 않습니다.

![](https://gw.alicdn.com/imgextra/i1/O1CN01GbNRcj1lVuACnkV6M_!!6000000004825-2-tps-2219-1090.png)

## 구성

채널을 `~/.qwen/settings.json`에 추가하세요:

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "clientId": "<your-app-id>",
      "clientSecret": "<your-app-secret>",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "collapsible": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### 구성 옵션

| 옵션                 | 설명                                                        |
| -------------------- | ----------------------------------------------------------- |
| `clientId`           | Feishu App ID                                               |
| `clientSecret`       | Feishu App Secret                                           |
| `collapsible`        | 긴 응답을 확장 가능한 섹션으로 접기(기본값: `false`)         |
| `collapsibleThreshold` | 접기 문자 임계값(기본값: `500`)                             |
| `webhookPort`        | 설정되면 WebSocket 대신 HTTP 웹훅 모드 사용                  |
| `verificationToken`  | 웹훅 모드의 확인 토큰                                       |
| `encryptKey`         | 웹훅 모드의 암호화 키                                       |

## 실행

```bash
# Feishu 채널만 시작
qwen channel start my-feishu

# 또는 구성된 모든 채널을 함께 시작
qwen channel start
```

Feishu를 열고 봇에게 메시지를 보내세요. 스트리밍 인터랙티브 카드와 응답을 볼 수 있어야 합니다.

## 연결 모드

### WebSocket(기본값)

WebSocket 모드는 아웃바운드 긴 연결을 사용하므로 공개 URL이나 서버가 필요하지 않습니다. 대부분의 배포에 권장되는 모드입니다.

### 웹훅

웹훅 모드가 필요한 경우(예: 공유 애플리케이션의 경우) 구성에서 `webhookPort`를 설정하세요:

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "webhookPort": 9321,
      "verificationToken": "<from-feishu-console>",
      "encryptKey": "<from-feishu-console>"
    }
  }
}
```

그런 다음 Feishu Open Platform에서 요청 URL을 `http://<your-server>:9321`로 설정하세요.

## 그룹 채팅

Feishu 봇은 DM과 그룹 대화 모두에서 작동합니다. 그룹 지원을 활성화하려면:

1. 채널 구성에서 `groupPolicy`를 `"allowlist"`, `"pairing"` 또는 `"open"`으로 설정
2. Feishu 그룹에 봇 추가
3. 그룹에서 봇을 @mention하여 응답 트리거
4. `groupPolicy: "pairing"`을 사용하는 경우, 응답이 시작되기 전에 그룹의 페어링 요청을 한 번 승인하세요

기본적으로 봇은 그룹 채팅에서 @mention을 필요로 합니다(`requireMention: true`). 특정 그룹에 대해 `"requireMention": false`로 설정하면 모든 메시지에 응답합니다.

## 기능

### 인터랙티브 카드 스트리밍

응답은 실시간 스트리밍 업데이트가 있는 Feishu 인터랙티브 카드로 렌더링됩니다. 응답이 생성되는 동안 카드에 "생성 중" 표시기가 표시되며, 생성을 취소하는 **중지** 버튼이 있습니다.

### 인용/답글 컨텍스트

메시지에 답글(인용)하면 인용된 내용이 자동으로 에이전트의 컨텍스트로 포함됩니다. 이것은 다음에 작동합니다:

- 텍스트 및 리치 텍스트 메시지
- 인터랙티브 카드(봇의 이전 응답)

### 이미지 및 파일

봇에게 사진과 문서를 보낼 수 있습니다:

- **이미지:** 멀티모달 비전 기능으로 분석
- **파일:** 다운로드되어 로컬에 저장되며 에이전트가 읽을 수 있음

### 동시 메시지

여러 사용자가 동일한 그룹 채팅에서 동시에 메시지를 보낼 수 있습니다. 각 메시지는 독립적인 카드와 응답을 받으며 서로 간섭하지 않습니다.

## DingTalk과의 주요 차이점

- **응답 형식:** 테이블을 포함한 네이티브 markdown 렌더링이 있는 Feishu 인터랙티브 카드(v2 스키마) 사용
- **스트리밍:** 카드 내용이 제한된 PATCH 요청(1.5초 간격)으로 제자리에서 업데이트됨
- **연결:** `@larksuiteoapi/node-sdk`를 통한 WebSocket — 동일한 아웃바운드 전용 모델, 공개 URL 불필요
- **작업 표시기:** 처리 중 "OnIt" 이모지 리액션이 추가됨
- **인용 컨텍스트:** 텍스트 메시지와 인터랙티브 카드 인용을 모두 지원

## 문제 해결

### 봇이 연결되지 않음

- App ID와 App Secret이 올바른지 확인
- 이벤트 구독에서 **긴 연결**이 선택되어 있는지 확인
- `im.message.receive_v1` 이벤트가 구독되어 있는지 확인
- 터미널 출력에서 연결 오류 확인

### 봇이 그룹에서 응답하지 않음

- `groupPolicy`가 `"allowlist"`, `"pairing"` 또는 `"open"`으로 설정되어 있는지 확인(기본값은 `"disabled"`)
- `"pairing"`을 사용하는 경우, 그룹의 페어링 요청이 승인되었는지 확인
- 그룹 메시지에서 봇을 @mention하고 있는지 확인
- 봇이 그룹에 추가되어 있는지 확인

### 카드가 "생성 중" 상태에 머무름

- 일반적으로 응답이 완료되었지만 최종 카드 업데이트가 실패했음을 의미
- API 오류에 대한 터미널 로그를 확인(속도 제한, 카드 크기 제한)
- 테이블이 많은 매우 긴 응답은 Feishu의 카드 요소 제한에 도달할 수 있음

### 인용에 카드 내용이 포함되지 않음

- 봇은 `card_msg_content_type=user_card_content` API 파라미터를 통해 카드 내용을 읽습니다
- 봇에 메시지 읽기를 위한 `im:message` 권한이 있는지 확인

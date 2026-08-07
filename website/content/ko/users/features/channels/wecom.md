# WeCom (Enterprise WeChat)

이 가이드에서는 WeCom 지능형 로봇(企业微信智能机器人)과 함께 Qwen Code를 설정하는 방법을 다룹니다.

## 사전 준비 사항

- WeCom 조직 계정
- API 모드로 생성된 WeCom 지능형 로봇
- 로봇의 Bot ID 및 Secret

## 로봇 생성하기

1. WeCom 관리 콘솔을 열고 지능형 로봇을 생성하세요.

![](https://gw.alicdn.com/imgextra/i2/O1CN017w1jWj1TTvNBcfya8_!!6000000002384-2-tps-2212-887.png)

2. API 모드를 선택하세요.

![](https://gw.alicdn.com/imgextra/i3/O1CN01buuik0207paQUuLQW_!!6000000006803-1-tps-1276-720.gif)

3. Bot ID와 Secret을 복사하세요.
4. 로봇을 사용 가능한 직접 채팅이나 그룹에 추가하세요.

지능형 로봇은 Qwen Code에서 WeCom으로의 WebSocket 연결을 사용합니다. 공개 콜백 URL, Token, EncodingAESKey, Corp ID 또는 Agent ID가 필요하지 않습니다.

## 구성

`~/.qwen/settings.json`에 채널을 추가하세요:

```json
{
  "channels": {
    "my-wecom": {
      "type": "wecom",
      "botId": "$WECOM_BOT_ID",
      "secret": "$WECOM_SECRET",
      "senderPolicy": "allowlist",
      "allowedUsers": ["zhangsan"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via WeCom.",
      "groupPolicy": "open"
    }
  }
}
```

자격 증명을 환경 변수로 설정하세요:

```bash
export WECOM_BOT_ID=<your-bot-id>
export WECOM_SECRET=<your-secret>
```

또는 `settings.json`의 `env` 섹션에 정의하세요:

```json
{
  "env": {
    "WECOM_BOT_ID": "your-bot-id",
    "WECOM_SECRET": "your-secret"
  }
}
```

## 실행

```bash
qwen channel start my-wecom
```

WeCom을 열고 지능형 로봇에게 메시지를 보내세요.

## 액세스 제어

`senderPolicy`는 다른 IM 채널과 동일한 방식으로 작동합니다:

- `allowlist`: `allowedUsers`에 있는 사용자만 봇을 사용할 수 있습니다. 기업 환경에서 권장되는 기본값입니다.
- `pairing`: 봇을 사용하기 전에 사용자가 페어링해야 합니다.
- `open`: 로봇에게 메시지를 보낼 수 있는 모든 사람이 사용할 수 있습니다.

그룹의 경우 `groupPolicy`를 `"allowlist"` 또는 `"open"`으로 설정하세요. WeCom은 지능형 로봇을 멘션한 그룹 메시지만 전달하므로, 전달된 모든 그룹 콜백은 멘션된 것으로 처리됩니다. `requireMention` 설정은 멘션되지 않은 그룹 메시지에 대한 응답을 활성화할 수 없습니다. 해당 메시지가 봇에게 전달되지 않기 때문입니다.

### 그룹 멘션 호환성

이전 Qwen Code 버전은 WeCom이 그룹 콜백을 전달한 후에도 범용 `requireMention` 게이트를 적용했습니다. 콜백에 별도의 멘션 메타데이터가 포함되지 않으므로, `requireMention: true`(기본값 포함)는 전달된 모든 그룹 메시지를 거부하여 그룹 채팅이 작동하지 않는 것처럼 보일 수 있었습니다.

Qwen Code는 이제 WeCom의 멘션 범위 전달에 의존하며 두 번째 멘션 판단을 적용하지 않습니다. `requireMention: true` 또는 `requireMention: false`를 포함하는 기존 WeCom 구성은 유효하게 유지되며 구성 오류를 발생시키지 않습니다. 두 값 모두 WeCom에 대해 동일한 동작을 가지므로 필드를 제거할 수 있습니다. 같은 그룹 항목의 다른 설정(예: `dispatchMode`)은 계속 적용됩니다. `groupHistoryLimit`은 계속 허용되지만 멘션되지 않은 그룹 메시지가 전달되지 않으므로 새 WeCom 기록을 수집할 수 없습니다.

## 이미지 및 파일

사용자는 텍스트, 음성 메시지(텍스트 변환 포함), 이미지, 텍스트와 이미지 혼합, 파일 및 비디오를 보낼 수 있습니다. 이미지는 이미지 첨부파일로 에이전트에게 전달됩니다. 파일과 비디오는 임시 로컬 경로에 다운로드되어 에이전트가 파일 도구로 읽을 수 있습니다.

어시스턴트 응답은 WeCom Markdown으로 전송됩니다. 에이전트가 생성한 로컬 이미지를 보내려면 코드 블록 외부에 마커 하나를 포함하세요:

```text
[IMAGE: /absolute/path/to/image.png]
```

보안을 위해 로컬 이미지 경로는 시스템 임시 디렉토리 아래의 채널 파일 디렉토리 내부에 있어야 합니다(예: Linux의 `/tmp/channel-files/...`). 모델이 생성한 파일 경로가 임의의 작업 공간 파일을 업로드할 수 있으므로 범용 파일, 비디오 및 음성 업로드 마커는 무시됩니다.

## 문제 해결

### 봇이 연결되지 않음

- Bot ID와 Secret을 확인하세요.
- 로봇이 API 모드로 생성되었는지 확인하세요.
- `qwen channel start`를 실행하는 셸에서 환경 변수를 사용할 수 있는지 확인하세요.

### 봇이 그룹에서 응답하지 않음

- `groupPolicy`를 확인하세요.
- 그룹에서 봇을 멘션하세요.
- 로봇이 그룹에 추가되었는지 확인하세요.

### 자체 구축 애플리케이션 자격 증명이 작동하지 않음

이 채널은 WeCom 지능형 로봇용입니다. Corp ID, Agent ID, Token 및 EncodingAESKey와 같은 자체 구축 애플리케이션 콜백 자격 증명은 이 채널에서 사용되지 않습니다.

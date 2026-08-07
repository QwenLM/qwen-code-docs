# WeChat (Weixin)

이 가이드에서는 공식 iLink Bot API를 통해 WeChat에서 Qwen Code 채널을 설정하는 방법을 다룹니다.

## 사전 준비 사항

- QR 코드를 스캔할 수 있는 WeChat 계정 (모바일 앱)
- iLink Bot 플랫폼(WeChat의 공식 봇 API)에 대한 액세스

## 설정

### 1. QR 코드로 로그인

WeChat은 정적 봇 토큰 대신 QR 코드 인증을 사용합니다. 로그인 명령을 실행하세요:

```bash
qwen channel configure-weixin
```

QR 코드 URL이 표시됩니다. WeChat 모바일 앱으로 스캔하여 인증하세요. 자격 증명은 `~/.qwen/channels/weixin/account.json`에 저장됩니다.

### 2. 채널 구성

`~/.qwen/settings.json`에 채널을 추가하세요:

```json
{
  "channels": {
    "my-weixin": {
      "type": "weixin",
      "senderPolicy": "pairing",
      "allowedUsers": [],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "model": "qwen3.5-plus",
      "instructions": "You are a concise coding assistant responding via WeChat. Keep responses under 500 characters. Use plain text only."
    }
  }
}
```

참고: WeChat 채널은 `token` 필드를 사용하지 않습니다 — 자격 증명은 QR 로그인 단계에서 가져옵니다.

### 3. 채널 시작

```bash
# WeChat 채널만 시작
qwen channel start my-weixin

# 또는 모든 구성된 채널을 함께 시작
qwen channel start
```

WeChat을 열고 봇에게 메시지를 보내세요. 에이전트가 처리하는 동안 타이핑 표시기("...")가 표시되고 응답이 뒤따릅니다.

## 이미지 및 파일

텍스트뿐만 아니라 사진과 문서를 봇에게 보낼 수 있습니다.

**사진:** 이미지(스크린샷, 사진 등)를 보내면 에이전트가 비전 기능을 사용하여 분석합니다. 멀티모달 모델이 필요합니다 — 채널 구성에 `"model": "qwen3.5-plus"`(또는 다른 비전 지원 모델)를 추가하세요. 이미지가 다운로드되고 처리되는 동안 타이핑 표시기가 표시됩니다.

**파일:** PDF, 코드 파일 또는 어떤 문서든 보낼 수 있습니다. 봇이 WeChat의 CDN에서 다운로드하고 복호화하여 로컬에 저장하면 에이전트가 파일 도구로 읽습니다. 모든 모델에서 작동합니다.

## 구성 옵션

WeChat 채널은 모든 표준 채널 옵션([채널 개요](./overview#options) 참조)을 지원하며 추가 옵션은 다음과 같습니다:

| 옵션      | 설명                                                                             |
| --------- | -------------------------------------------------------------------------------- |
| `baseUrl` | iLink Bot API 기본 URL을 재정의합니다 (기본값: `https://ilinkai.weixin.qq.com`)  |

## Telegram과의 주요 차이점

- **인증:** 정적 봇 토큰 대신 QR 코드 로그인. 세션이 만료될 수 있습니다 — 이런 경우 채널이 일시 중지되고 메시지가 기록됩니다.
- **포맷:** WeChat은 일반 텍스트만 지원합니다. 에이전트 응답의 Markdown은 자동으로 제거됩니다.
- **타이핑 표시기:** "Working..." 텍스트 메시지 대신 WeChat의 네이티브 "..." 타이핑 표시기가 사용됩니다.
- **그룹:** WeChat iLink Bot은 DM 전용입니다 — 그룹 채팅은 지원되지 않습니다.
- **미디어 암호화:** 이미지와 파일은 WeChat의 CDN에서 AES-128-ECB로 암호화됩니다. 채널이 투명하게 복호화를 처리합니다.

## 팁

- **일반 텍스트 지시 사용** — WeChat은 모든 Markdown을 제거하므로, "Use plain text only"와 같은 지시를 추가하여 에이전트가 지저분하게 보이는 포맷된 응답을 생성하지 않도록 하세요.
- **응답을 짧게 유지** — WeChat 메시지 버블은 간결한 텍스트에 가장 잘 작동합니다. 지시에 문자 수 제한을 추가하면 도움이 됩니다(예: "Keep responses under 500 characters").
- **세션 만료** — 로그에 "Session expired (errcode -14)"가 표시되면 WeChat 로그인이 만료된 것입니다. 채널을 중지하고 `qwen channel configure-weixin`을 다시 실행하여 다시 로그인하세요.
- **액세스 제한** — 봇과 대화할 수 있는 사람을 제어하려면 `senderPolicy: "pairing"` 또는 `"allowlist"`를 사용하세요. 자세한 내용은 [DM 페어링](./overview#dm-pairing)을 참조하세요.

## 문제 해결

### "WeChat account not configured"

먼저 `qwen channel configure-weixin`을 실행하여 QR 코드로 로그인하세요.

### "Session expired (errcode -14)"

WeChat 로그인 세션이 만료되었습니다. 채널을 중지하고 `qwen channel configure-weixin`을 다시 실행하세요.

### 봇이 응답하지 않음

- 터미널 출력에서 오류를 확인하세요
- 채널이 실행 중인지 확인하세요 (`qwen channel start my-weixin`)
- `senderPolicy: "allowlist"`를 사용하는 경우, WeChat 사용자 ID가 `allowedUsers`에 있는지 확인하세요

### 이미지가 작동하지 않음

- 채널 구성에 비전을 지원하는 `model`이 있는지 확인하세요 (예: `qwen3.5-plus`)
- 터미널에서 CDN 다운로드 오류를 확인하세요 — 네트워크 문제일 수 있습니다

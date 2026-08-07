# Telegram

이 가이드에서는 Telegram에서 Qwen Code 채널을 설정하는 방법을 다룹니다.

## 사전 준비 사항

- Telegram 계정
- Telegram 봇 토큰 (아래 참조)

## 봇 생성하기

1. Telegram을 열고 [@BotFather](https://t.me/BotFather)를 검색하세요
2. `/newbot`을 보내고 프롬프트에 따라 이름과 사용자명을 선택하세요
3. BotFather가 봇 토큰을 제공합니다 — 안전하게 보관하세요

## 사용자 ID 찾기

`senderPolicy: "allowlist"` 또는 `"pairing"`을 사용하려면 Telegram 사용자 ID(숫자 ID, 사용자명이 아님)가 필요합니다.

가장 쉬운 방법:

1. Telegram에서 [@userinfobot](https://t.me/userinfobot)을 검색하세요
2. 아무 메시지나 보내면 — 사용자 ID를 회신합니다

## 구성

`~/.qwen/settings.json`에 채널을 추가하세요:

```json
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["YOUR_USER_ID"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via Telegram. Keep responses short.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

봇 토큰을 환경 변수로 설정하세요:

```bash
export TELEGRAM_BOT_TOKEN=<your-token-from-botfather>
```

또는 실행 전에 source되는 `.env` 파일에 추가하세요.

## 실행

```bash
# Telegram 채널만 시작
qwen channel start my-telegram

# 또는 모든 구성된 채널을 함께 시작
qwen channel start
```

그런 다음 Telegram에서 봇을 열고 메시지를 보내세요. "Working..."이 즉시 표시되고 에이전트의 응답이 뒤따릅니다.

## 그룹 채팅

Telegram 그룹에서 봇을 사용하려면:

1. 채널 구성에서 `groupPolicy`를 `"allowlist"`, `"pairing"` 또는 `"open"`으로 설정하세요
2. BotFather에서 **privacy mode를 비활성화**하세요: `/mybots` → 봇 선택 → Bot Settings → Group Privacy → Turn Off
3. 봇을 그룹에 추가하세요. 이미 그룹에 있었다면 **제거했다가 다시 추가**하세요 (Telegram은 봇이 참여할 때의 privacy 설정을 캐시합니다)
4. `groupPolicy: "allowlist"`를 사용하는 경우, 그룹의 chat ID를 구성의 `groups`에 추가하세요
5. `groupPolicy: "pairing"`을 사용하는 경우, 응답이 시작되기 전에 그룹의 페어링 요청을 한 번 승인하세요. 그룹이 승인되면 **해당 그룹의 모든 멤버**가 봇을 사용할 수 있습니다. `senderPolicy`와 `allowedUsers`는 승인된 그룹의 멤버를 제한하지 않습니다.

기본적으로 봇은 그룹에서 응답하기 위해 @멘션이나 답장을 요구합니다. 특정 그룹에 대해 `"requireMention": false`를 설정하면 모든 메시지에 응답합니다(전용 작업 그룹에 유용). 자세한 내용은 [그룹 채팅](./overview#group-chats)을 참조하세요.

## 이미지 및 파일

텍스트뿐만 아니라 사진과 문서를 봇에게 보낼 수 있습니다.

**사진:** 사진을 보내면 에이전트가 비전 기능을 사용하여 분석합니다. 멀티모달 모델이 필요합니다 — 채널 구성에 `"model": "qwen3.5-plus"`(또는 다른 비전 지원 모델)를 추가하세요. 사진 캡션이 메시지 텍스트로 전달됩니다.

**문서:** PDF, 코드 파일 또는 어떤 문서든 보낼 수 있습니다. 봇이 다운로드하여 로컬에 저장하므로 에이전트가 파일 도구로 읽을 수 있습니다. 모든 모델에서 작동합니다. Telegram의 파일 크기 제한은 20MB입니다.

## 팁

- **간결한 지시 사용** — Telegram은 4096자 메시지 제한이 있습니다. "keep responses short"와 같은 지시를 추가하면 에이전트가 범위 내에 머무는 데 도움이 됩니다.
- **`sessionScope: "user"` 사용** — 각 사용자에게 고유한 대화를 제공합니다. 새로 시작하려면 `/clear`를 사용하세요.
- **액세스 제한** — 고정된 사용자 집합에 대해 `senderPolicy: "allowlist"`를 사용하거나, 새 사용자가 CLI에서 승인하는 코드로 액세스를 요청하려면 `"pairing"`을 사용하세요. 자세한 내용은 [DM 페어링](./overview#dm-pairing)을 참조하세요.

## 메시지 포맷

에이전트의 Markdown 응답은 자동으로 Telegram 호환 HTML로 변환됩니다. 코드 블록, 굵게, 기울임꼴, 링크, 목록이 모두 지원됩니다.

## 문제 해결

### 봇이 응답하지 않음

- 봇 토큰이 올바르고 환경 변수가 설정되어 있는지 확인하세요
- `senderPolicy: "allowlist"`를 사용하는 경우 사용자 ID가 `allowedUsers`에 있는지, 또는 `"pairing"`을 사용하는 경우 승인을 받았는지 확인하세요
- 터미널 출력에서 오류를 확인하세요

### 봇이 그룹에서 응답하지 않음

- `groupPolicy`가 `"allowlist"`, `"pairing"` 또는 `"open"`으로 설정되어 있는지 확인하세요 (기본값은 `"disabled"`)
- `"allowlist"`를 사용하는 경우, 그룹의 chat ID가 `groups` 구성에 있는지 확인하세요
- `"pairing"`을 사용하는 경우, 그룹의 페어링 요청이 승인되었는지 확인하세요
- BotFather에서 **Group Privacy가 꺼져 있는지** 확인하세요 — 그렇지 않으면 봇이 그룹에서 명령어가 아닌 메시지를 볼 수 없습니다
- 봇을 그룹에 추가한 후 privacy mode를 변경했다면, 그룹에서 봇을 **제거했다가 다시 추가**하세요
- 기본적으로 봇은 @멘션이나 답장을 요구합니다. `@yourbotname hello`을 보내서 테스트하세요

### "Sorry, something went wrong processing your message"

일반적으로 에이전트가 오류를 만났음을 의미합니다. 터미널 출력에서 세부 정보를 확인하세요.

### 봇이 응답하는 데 시간이 오래 걸림

에이전트가 여러 도구 호출(파일 읽기, 검색 등)을 실행 중일 수 있습니다. "Working..." 표시기는 에이전트가 처리 중일 때 표시됩니다. 복잡한 작업은 1분 이상 걸릴 수 있습니다.

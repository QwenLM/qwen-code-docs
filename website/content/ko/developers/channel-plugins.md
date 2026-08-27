# 채널 플러그인 개발자 가이드

채널 플러그인은 Qwen Code를 메시징 플랫폼에 연결합니다. [extension](../users/extension/introduction)으로 패키징되어 시작 시 로드됩니다. 설치 및 구성에 대한 사용자 대상 문서는 [Plugins](../users/features/channels/plugins)를 참조하세요.

## 전체 구조

플러그인은 플랫폼 어댑터 레이어에 위치합니다. 플랫폼별 문제(연결, 메시지 수신, 응답 전송)를 처리합니다. `ChannelBase`는 나머지 모든 것(접근 제어, 세션 라우팅, 프롬프트 큐잉, 슬래시 명령어, 크래시 복구)을 처리합니다.

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → ChannelAgentBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

`ChannelAgentBridge`는 어댑터 대상 브리지 계약입니다. 현재 독립 실행 `qwen channel start` 경로는 `AcpBridge`를 제공하지만, 플러그인 코드는 생성자 매개변수를 `ChannelAgentBridge`로 타입 지정하여 동일한 어댑터가 나중에 다른 브리지 구현 뒤에서 실행될 수 있도록 해야 합니다.

기존 TypeScript 플러그인을 위한 마이그레이션 노트: 어댑터 생성자 또는 팩토리에서 `bridge`를 `AcpBridge`로 명시적 타입 지정했다면, 해당 타입 표기를 `ChannelAgentBridge`로 변경하고 해당 계약이 노출하는 메서드만 계속 사용하세요. JavaScript 플러그인은 런타임에 영향을 받지 않으며, 독립 실행 `qwen channel start`는 여전히 현재 `AcpBridge` 구현을 전달합니다.

## 런타임 모드

동일한 플러그인 어댑터가 두 채널 런타임 중 하나에서 호스팅될 수 있습니다:

- `qwen channel start [name]`는 독립 실행 ACP 지원 서비스입니다. 여전히 `AcpBridge`를 사용하며 데몬 외부에서 채널을 실행하기 위한 안정적 명령으로 남아 있습니다.
- `qwen serve --channel <name>` 및 반복 가능한 `--channel` 플래그는 실험적 데몬 관리 채널 워커를 시작합니다. 이름 지정된 채널은 소유 워크스페이스별로 그룹화되며, 소유 런타임당 하나의 워커가 있습니다. `--channel all`은 의도적으로 기본 워크스페이스의 구성된 채널만 시작합니다. 워커는 `qwen serve`가 소유하며, SDK를 통해 해당 데몬에 연결하고, `DaemonChannelBridge`를 기반으로 하는 `ChannelAgentBridge` 파사드를 어댑터에 전달합니다.

데몬 관리 채널은 데몬의 수명주기와 상태 보고를 상속합니다. 어댑터 또는 플랫폼 SDK 장애가 데몬을 크래시시키지 않도록 의도적으로 프로세스 외부로 실행됩니다. 모든 이름 지정된 채널은 정확히 하나의 등록된 신뢰된 워크스페이스로 해석되어야 하며, 해당 워커는 해당 런타임의 표준 cwd와 환경 오버레이를 수신합니다. cwd가 없는 사용자/시스템 채널은 여러 워크스페이스가 등록된 경우 모호하며, 워크스페이스 로컬 설정 파일의 채널은 기본적으로 해당 워크스페이스에 속합니다. `--channel all`은 기본 전용으로 유지되며 이름 지정된 선택과 결합할 수 없습니다.

## 플러그인 객체

Extension 진입점은 `ChannelPlugin`에 conforming하는 `plugin`을 내보냅니다:

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // 고유 ID, settings.json "type" 필드에서 사용
  displayName: 'My Platform', // CLI 출력에 표시
  requiredConfigFields: ['apiKey'], // 시작 시 검증 (표준 ChannelConfig 외)
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## 채널 어댑터

`ChannelBase`를 확장하고 세 가지 메서드를 구현합니다:

```typescript
import { ChannelBase } from '@qwen-code/channel-base';
import type {
  ChannelBaseOptions,
  ChannelAgentBridge,
  ChannelConfig,
  Envelope,
  SessionTarget,
} from '@qwen-code/channel-base';

export class MyChannel extends ChannelBase {
  constructor(
    name: string,
    config: ChannelConfig,
    bridge: ChannelAgentBridge,
    options?: ChannelBaseOptions,
  ) {
    super(name, config, bridge, options);
  }

  async connect(): Promise<void> {
    // 플랫폼에 연결하고, 메시지 핸들러를 등록합니다
    // 메시지가 도착하면:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // 안정적이고 고유한 플랫폼 사용자 ID
      senderName: '...', // 표시 이름
      chatId: '...', // 채팅/대화 ID (DM과 그룹 구분)
      text: '...', // 메시지 텍스트 (@멘션 제거)
      isGroup: false, // 정확해야 함 — GroupGate에서 사용
      isMentioned: false, // 정확해야 함 — GroupGate에서 사용
      isReplyToBot: false, // 정확해야 함 — GroupGate에서 사용
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // 마크다운을 플랫폼 형식으로 포맷하고, 필요시 청크로 분할하고, 전달합니다
  }

  disconnect(): void {
    // 연결을 정리합니다
  }
}
```

대부분의 어댑터는 `options`를 변경 없이 전달해야 합니다. 어댑터가 자체 `SessionRouter`를 생성하고 해당 라우터를 `super()`에 전달하는 경우, `ChannelBaseOptions`에서 `registerBridgeEvents: true`를 설정하여 `ChannelBase`가 `toolCall` 및 `sessionDied` 이벤트를 직접 수신할 수 있도록 합니다. 채널 게이트웨이에서 제공하는 라우터의 경우 설정하지 않은 채로 두세요.

어댑터가 셸 명령 동작을 노출하는 경우, 활성화하기 전에 `bridge.shellCommand`가 존재하는지 확인하세요. 데몬 관리 워커는 데몬이 `session_shell_command` 기능을 광고하지 않는 한 해당 선택적 메서드를 생략합니다.

## Envelope

플랫폼 데이터에서 구성하는 정규화된 메시지 객체입니다. 부울 플래그는 게이트 로직을 구동하므로 정확해야 합니다.

| 필드             | 타입         | 필수 | 참고                                                                                   |
| ---------------- | ------------ | ---- | -------------------------------------------------------------------------------------- |
| `channelName`    | string       | 예   | `this.name` 사용                                                                       |
| `senderId`       | string       | 예   | 메시지 간에 안정적이어야 함 (세션 라우팅 + 접근 제어에 사용)                           |
| `senderName`     | string       | 예   | 표시 이름                                                                              |
| `chatId`         | string       | 예   | DM과 그룹을 반드시 구분해야 함                                                         |
| `chatName`       | string       | 아니오 | 플랫폼에서 제공되는 그룹/대화 이름                                                   |
| `text`           | string       | 예   | 봇 @멘션 제거                                                                         |
| `threadId`       | string       | 아니오 | `sessionScope: "thread"`용                                                           |
| `messageId`      | string       | 아니오 | 플랫폼 메시지 ID — 응답 상관관계에 유용                                             |
| `isGroup`        | boolean      | 예   | GroupGate가 이에 의존                                                                  |
| `isMentioned`    | boolean      | 예   | GroupGate가 이에 의존                                                                  |
| `isReplyToBot`   | boolean      | 예   | GroupGate가 이에 의존                                                                  |
| `referencedText` | string       | 아니오 | 인용된 메시지 — 컨텍스트로 앞에 추가됨                                               |
| `imageBase64`    | string       | 아니오 | Base64 인코딩 이미지 (레거시 — `attachments` 선호)                                   |
| `imageMimeType`  | string       | 아니오 | 예: `image/jpeg` (레거시 — `attachments` 선호)                                       |
| `attachments`    | Attachment[] | 아니오 | 구조화된 미디어 첨부 (아래 참조)                                                     |

### 첨부 파일

이미지, 파일, 오디오, 비디오에는 `attachments` 배열을 사용하세요. `handleInbound()`가 자동으로 해결합니다: base64 `data`가 있는 이미지는 모델에 비전 입력으로 전송되고, `filePath`가 있는 파일은 해당 경로가 프롬프트에 추가되어 에이전트가 읽을 수 있습니다.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64 인코딩 데이터 (이미지, 작은 파일)
  filePath?: string; // 로컬 파일의 절대 경로 (큰 파일은 디스크에 저장)
  mimeType: string; // 예: 'application/pdf', 'image/jpeg'
  fileName?: string; // 플랫폼의 원본 파일 이름
}
```

예시 — 어댑터에서 파일 업로드 처리:

```typescript
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const buf = await downloadFromPlatform(fileId);
const dir = join(tmpdir(), 'channel-files');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const filePath = join(dir, fileName);
writeFileSync(filePath, buf);

envelope.attachments = [
  {
    type: 'file',
    filePath,
    mimeType: 'application/pdf',
    fileName,
  },
];
```

레거시 `imageBase64`/`imageMimeType` 필드는 하위 호환성을 위해 계속 작동하지만, 새 코드에서는 `attachments`를 선호합니다.

## Extension 매니페스트

`qwen-extension.json`은 채널 타입을 선언합니다. 키는 플러그인 객체의 `channelType`과 일치해야 합니다:

```json
{
  "name": "my-channel-extension",
  "version": "1.0.0",
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  }
}
```

## 선택적 확장 지점

**커스텀 슬래시 명령어** — 생성자에 등록합니다:

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // 처리됨, 에이전트에 전달하지 않음
});
```

**작업 표시기** — `onPromptStart()`와 `onPromptEnd()`를 오버라이드하여 플랫폼별 입력 표시기를 표시합니다. 이 hook은 프롬프트가 실제로 처리를 시작할 때만 실행됩니다 — 버퍼링된 메시지(수집 모드) 또는 게이트/차단된 메시지에는 실행되지 않습니다:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // 플랫폼 API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**도구 호출 hook** — `onToolCall()`을 오버라이드하여 에이전트 활동(예: "셸 명령 실행 중...")을 표시합니다.

**스트리밍 hook** — 청크별 점진적 표시를 위해 `onResponseChunk(chatId, chunk, sessionId)`를 오버라이드합니다(예: 메시지 제자리 편집). 최종 전달을 커스터마이즈하려면 `onResponseComplete(chatId, fullText, sessionId)`를 오버라이드합니다.

**블록 스트리밍** — 채널 구성에서 `blockStreaming: "on"`을 설정합니다. 기본 클래스가 응답을 단락 경계에서 여러 메시지로 자동 분할합니다. 플러그인 코드가 필요 없습니다 — `onResponseChunk`와 함께 작동합니다.

**능동적 전달** — 어댑터가 활성 수신 요청 없이 전송할 수 있는 경우 `supportsProactiveSend()`를 오버라이드하여 `true`를 반환합니다. `ChannelBase`는 지속 채널 루프, 웹훅 작업, 백그라운드 에이전트 결과, 데몬 전달에 이 기능을 사용합니다. 기본 대상 정책은 스레드 대상을 거부합니다. 플랫폼이 안전하게 전달할 수 있는 대상 형태에 대해서만 보호된 대상 확인을 오버라이드하세요:

```typescript
override supportsProactiveSend(): boolean {
  return true;
}

protected override supportsProactiveTarget(target: SessionTarget): boolean {
  return target.threadId === undefined;
}

protected override async pushProactive(
  target: SessionTarget,
  text: string,
): Promise<void> {
  await this.platformClient.send(target.chatId, text);
}
```

일반 데몬 전달이 다른 대상 형태를 허용하는 경우 `supportsProactiveDeliveryTarget()`을 사용하고, 웹훅 전달이 루프 및 백그라운드 결과와 다른 경우 `supportsProactiveWebhookTarget()`을 사용하세요. 지원되지 않는 대상은 다른 대화로 폴백하는 대신 거부된 채로 두세요.

**미디어** — `envelope.attachments`에 이미지/파일을 채우세요. 위의 [첨부 파일](#attachments)을 참조하세요.

## 레퍼런스 구현

- **플러그인 예시** (`packages/channels/plugin-example/`) — 최소 WebSocket 기반 어댑터, 좋은 시작점
- **Telegram** (`packages/channels/telegram/`) — 완전한 기능: 이미지, 파일, 포맷팅, 입력 표시기
- **DingTalk** (`packages/channels/dingtalk/`) — 리치 텍스트 처리를 지원하는 스트림 기반

# Web Shell 데몬 어댑터

## 목표

웹 채팅 및 웹 터미널 클라이언트는 데몬 HTTP/SSE API를 통해 `qwen serve`를 사용하고 클라이언트 측에서 트랜스크립트를 렌더링해야 합니다. 네이티브 로컬 TUI, 채널, IDE 통합은 당분간 기존 기본 경로를 유지합니다.

## 공유 UI 계약

TypeScript SDK 데몬 UI 내보내기를 공통 경계로 사용합니다.

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from ' @qwen-code/sdk/daemon';
```

구성은 다음과 같습니다.

- `DaemonClient`는 데몬 HTTP 라우트를 처리합니다.
- `DaemonSessionClient`는 세션 생성/연결 및 SSE 리플레이를 관리합니다.
- `normalizeDaemonEvent()`는 데몬 와이어 이벤트를 UI 이벤트로 변환합니다.
- `createDaemonTranscriptStore()`는 UI 이벤트를 트랜스크립트 블록으로 축소합니다.

React 클라이언트는 Web Shell에서 내보낸 바인딩을 사용할 수 있습니다.

```tsx
import {
  DaemonSessionProvider,
  useActions,
  useConnection,
  usePendingPermissions,
  useTranscriptBlocks,
} from ' @qwen-code/web-shell/daemon-react-sdk';
```

최소 React 형태:

```tsx
function App() {
  return (
    <DaemonSessionProvider baseUrl="http://127.0.0.1:4170">
      <Transcript />
      <PromptBox />
    </DaemonSessionProvider>
  );
}

function Transcript() {
  const blocks = useTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

프로바이더는 데몬 세션을 생성하거나 연결하고, SSE를 구독하고, 마지막 이벤트 id를 `DaemonSessionClient`에 유지하며, 기본적으로 스트림을 다시 연결합니다. 호출자는 테스트나 사용자 정의 연결 관리를 위해 `autoReconnect={false}`로 이를 비활성화할 수 있습니다.

## 브라우저 배포 형태

### 동일 출처 로컬 POC

데몬이 제공하는 페이지는 페이지와 API가 동일한 출처를 공유하므로 데몬을 직접 호출할 수 있습니다. 이것은 로컬 웹 채팅 및 웹 터미널 검증을 위한 선호되는 초기 POC 형태입니다.

### 원격 웹 채팅 / 웹 터미널

프로덕션 원격 웹 앱은 일반적으로 BFF(backend-for-frontend)와 통신해야 합니다. BFF는 데몬 URL, 토큰, 워크스페이스 라우팅, 세션 메타데이터를 관리하고 브라우저에 안전한 앱 이벤트를 브라우저로 전달합니다. 이렇게 하면 베어러 토큰이 브라우저 저장소에 노출되지 않으며, 배포에서 사용자가 접근할 수 있는 데몬/워크스페이스를 결정할 수 있습니다.

### 로컬 브라우저와 로컬 데몬

별도 로컬 개발 서버는 `qwen serve`와 크로스 출처 관계이므로 데몬 라우트를 동일 출처로 프록시하거나 데몬이 제공해야 합니다. 데몬은 임의의 브라우저 `Origin` 요청을 의도적으로 거부합니다.

## 렌더링 책임

공유 트랜스크립트 모델은 시각적이 아닌 의미론적입니다. UI 클라이언트가 렌더링 방식을 결정합니다.

- 사용자 및 어시스턴트 메시지 블록
- 접힌 생각 블록
- 도구 상태 카드
- 셸 출력 블록
- 권한 요청 컨트롤
- 상태/오류/디버그 블록

웹 터미널은 브라우저 네이티브 의미론적 렌더러입니다. 고정폭 레이아웃, 스크롤백, 프롬프트 입력, 단축키, 스트리밍 블록으로 터미널 같은 느낌과 동작을 제공해야 하지만, 원시 PTY 프록시가 아니며 서버 측 Ink 렌더링이 필요하지 않습니다.

## 병합 안전성

- 네이티브 `qwen` TUI는 직접 방식이며 변경되지 않습니다.
- `--acp`, 채널, IDE 경로는 기본적으로 변경되지 않습니다.
- SDK UI 코어는 추가적입니다.
- Web Shell React 바인딩은 선택 사항이며 이를 가져오는 클라이언트에서만 실행됩니다.
- 제거된 데몬 TUI 스파이크 코드는 제품 마이그레이션으로 간주해서는 안 됩니다.

## 후속 작업

- 데몬이 제공하는 Web Shell과 임베딩 IDE 호스트 동작을 일치시킵니다.
- 트랜스크립트 블록 위에 일급 채팅 및 터미널 렌더러를 계속 구축합니다.
- 기존 데몬 이벤트가 안정적인 브라우저 UI 동작에 너무 저수준인 경우에만 더 풍부한 타입 이벤트를 추가합니다.
- SDK 외 소비자가 UI 코어를 독립 의존성으로 필요로 하는 경우 전용 ` @qwen-code/daemon-ui-core` 패키지를 고려합니다.
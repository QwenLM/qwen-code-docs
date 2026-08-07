# WebShell 사이드바 — 커스터마이징 가이드

`WebShellSidebar`는 web-shell `App` 컴포넌트 내부에 렌더링되는 세션 목록 및 네비게이션 패널입니다. 이 문서는 각 시각적 영역을 현재 커스터마이징 기능에 매핑하고 외부 주입 포인트가 없는 영역을 식별합니다.

## 사이드바 활성화

사이드바는 **기본적으로 비활성화**되어 있습니다. `sidebar` prop을 전달하여 활성화합니다:

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // 간단한 활성화
  // 또는 세분화된 옵션 사용:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## 레이아웃 개요

```
┌─────────────────────────────────────┐
│ ① 브랜딩 (topRow)                   │  ✅ 커스터마이징 가능
├─────────────────────────────────────┤
│ ② 기본 네비게이션                    │  ✅ 커스터마이징 가능
│    [＋ New task]  [🧩 Plugins]      │
│    [📅 Scheduled] [🎯 Goals]        │
│    [custom render...]               │
├─────────────────────────────────────┤
│ ③ 프로젝트 헤더                     │  ✅ 표시/숨김
│    📁 Projects ▼ [🔍] [＋]          │
│    Session list entries...          │
│    📦 Archived sessions             │
├─────────────────────────────────────┤
│ ④ 푸터 액션 바                     │  ✅ 커스터마이징 가능
│    [⚙ Settings] v0.19 [☀] [▦] [◧] │
├─────────────────────────────────────┤
│ ⑤ 리사이즈 핸들                     │  ❌ 커스터마이징 불가
└─────────────────────────────────────┘
```

## 커스터마이징 가능한 영역

### ① 브랜딩 — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // 전체 브랜딩 행을 교체
  hideWhenCompact?: boolean; // 사이드바가 접혔을 때 숨김 (기본값: true)
}
```

| 값                               | 효과                                              |
| -------------------------------- | ------------------------------------------------- |
| `undefined` (기본값)             | Qwen 로고 + "Qwen Code" 텍스트                    |
| `false`                          | 브랜딩 행 전체 숨김                               |
| `{ render: () => <MyHeader /> }` | 커스텀 콘텐츠로 전체 교체                         |
| `{ hideWhenCompact: false }`     | 접힌 아이콘 레일 모드에서도 브랜딩 표시 유지       |

```tsx
sidebar={{
  branding: {
    render: () => (
      <div style={{ display: 'flex', gap: 8 }}>
        <img src="/my-logo.svg" alt="" width={24} />
        <span>My App</span>
      </div>
    ),
  },
}}
```

### ② 기본 네비게이션 — `primaryNav`

```ts
type WebShellSidebarPrimaryNavItem =
  | 'newTask' // ✏️ New Task 버튼
  | 'plugins' // 🧩 Plugins 버튼
  | 'scheduledTasks' // 📅 Scheduled Tasks 버튼
  | 'goals'; // 🎯 Goals 버튼

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // 표시할 내장 버튼 (기본값: 모두)
  render?: () => ReactNode; // 내장 버튼 뒤에 추가할 커스텀 콘텐츠
}
```

기본 네비게이션 영역에는 `items`로 제어되는 내장 버튼이 포함됩니다:

- `items`를 지정하지 않으면 모든 버튼이 표시됩니다
- `items`를 지정하면 나열된 버튼만 표시됩니다
- `render()`를 통해 내장 버튼 뒤에 커스텀 콘텐츠를 추가할 수 있습니다

| 값                                         | 효과                                   |
| ------------------------------------------ | -------------------------------------- |
| `undefined` (기본값)                       | 모든 내장 버튼 표시                     |
| `{ items: ['plugins'] }`                   | Plugins 버튼만 표시                     |
| `{ items: ['plugins', 'scheduledTasks'] }` | Plugins + Scheduled Tasks 표시          |
| `{ items: [], render: () => ... }`         | 모든 내장 버튼 숨김, 커스텀 콘텐츠만 표시 |

```tsx
sidebar={{
  primaryNav: {
    items: ['plugins', 'scheduledTasks'],  // newTask와 goals 숨김
    render: () => (
      <button onClick={() => console.log('custom action')}>
        🔗 Data Sync
      </button>
    ),
  },
}}
```

### ④ 푸터 — `footer`

```ts
type WebShellSidebarFooterItem =
  | 'settings' // ⚙ 설정 패널
  | 'version' // 버전 라벨 (예: "v0.19.10")
  | 'theme' // ☀/🌙 라이트/다크 토글
  | 'sessionsOverview' // ▦ 세션 개요 패널 (큰 화면만)
  | 'splitView' // ◧ 분할 보기 (큰 화면만)
  | 'daemonStatus' // 📊 데몬 상태 패널
  | 'collapse'; // ◁/▷ 접기/펼치기 토글

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // 표시할 내장 항목 (기본값: 모두)
  render?: () => ReactNode; // 내장 항목 앞에 왼쪽에 렌더링할 커스텀 콘텐츠
}
```

| 값                                           | 효과                  |
| ---------------------------------------------- | ----------------------- |
| `undefined` (기본값)                          | 모든 항목 표시          |
| `false`                                        | 푸터 전체 숨김          |
| `{ items: ['settings', 'theme', 'collapse'] }` | 나열된 항목만 표시      |

푸터는 좁은 너비에 자동으로 적응합니다: 특정 임계값 이하에서는 라벨이 숨겨지고 버전이 제거됩니다.

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // 최소화된 푸터
}}
```

`render()`를 통한 커스텀 콘텐츠는 푸터의 왼쪽, 내장 항목 앞에 나타납니다:

```tsx
sidebar={{
  footer: {
    items: ['collapse'],
    render: () => (
      <button onClick={() => openHelpCenter()}>
        ❓ Help
      </button>
    ),
  },
}}
```

**참고:** `'scheduledTasks'`와 `'goals'`는 기본 네비게이션 영역(②)으로 이동되었으며 기본적으로 표시됩니다. `footer.items`가 아닌 `primaryNav.items`로 제어됩니다.

### 기타 최상위 옵션

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // 사이드바 표시/숨김 (기본값: 전달 시 true)
  defaultCollapsed?: boolean; // 초기 접힌 상태 (localStorage에 저장)
  showCompactToggle?: boolean; // 채팅 영역에 접기 버튼 표시 (기본값: true)
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // "Projects" 헤더 행 숨김 (기본값: false = 표시)
  sessionActions?: WebShellSidebarSessionActionsOptions;
  footer?: false | WebShellSidebarFooterOptions;
}
```

### ③ 프로젝트 헤더 — `hideProjectHeader`

"Projects" 헤더 행(접기 토글, 검색 아이콘, 워크스페이스 추가 버튼이 있는 행)의 표시 여부를 제어합니다. 기본값은 `false`(표시)입니다.

```tsx
sidebar={{
  hideProjectHeader: true,  // "项目 ▼ [🔍] [＋]" 행 숨김
}}
```

숨겨져도 세션 목록 항목과 아카이브된 세션은 계속 표시됩니다 — 액션 버튼과 세션 검색 바가 있는 헤더 행만 제거됩니다.

### 세션 행 액션 — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 Details (드롭다운 하위 메뉴)
  | 'rename' // ✏️ Rename (드롭다운 메뉴)
  | 'group' // 📁 Group/폴더로 이동 (드롭다운 메뉴)
  | 'export' // 📤 채팅 내보내기 (드롭다운 메뉴)
  | 'delete' // 🗑 세션 삭제 (드롭다운 메뉴)
  | 'pin' // 📌 Pin/Unpin (인라인 버튼)
  | 'archive'; // 📦 Archive (인라인 버튼)

/** 작동하는 인라인(호버 버튼) 핸들러가 있는 서브셋. */
type WebShellSidebarSessionInlineActionItem =
  | 'pin'
  | 'archive'
  | 'rename'
  | 'export'
  | 'delete';

interface WebShellSidebarSessionActionsOptions {
  items?: readonly WebShellSidebarSessionActionItem[]; // 표시할 액션 (기본값: 모두)
  inlineItems?: readonly WebShellSidebarSessionInlineActionItem[]; // 인라인 버튼으로 표시할 항목 (기본값: ['pin', 'archive'])
}
```

세션 행에 표시되는 액션 버튼을 제어합니다:

- **`items`**: 모든 액션(인라인 및 드롭다운 모두)에 대한 마스터 제어. 항목이 `items`에 없으면 모든 곳에서 숨겨집니다.
- **`inlineItems`**: 어떤 항목이 **인라인 버튼**(호버 시)으로 나타나는지 제어합니다. 기본값은 `['pin', 'archive']`입니다. 작동하는 인라인 핸들러가 있는 항목만 사용 가능합니다: `'pin'`, `'archive'`, `'rename'`, `'export'`, `'delete'`. `'details'`와 `'group'`은 드롭다운 전용입니다.

**표시 우선순위**: 인라인 버튼이 표시되려면 `items` AND 항목의 내장 조건 AND `inlineItems`가 모두 통과해야 합니다. 예를 들어, `delete`를 인라인으로 표시하려면 `items`에 `'delete'`가 포함되고 AND `inlineItems`에 `'delete'`가 포함되어야 합니다.

| 값                                     | 효과                                     |
| ---------------------------------------- | ------------------------------------------ |
| `undefined` (기본값)                    | 모든 액션 표시, pin + archive는 인라인     |
| `{ inlineItems: ['pin', 'delete'] }`     | Pin + delete를 인라인 버튼으로             |
| `{ inlineItems: [] }`                    | 인라인 버튼 없음                           |
| `{ inlineItems: ['archive', 'export'] }` | Archive + export를 인라인 버튼으로         |

드롭다운 트리거(⋮)는 활성화된 드롭다운 항목이 없으면 자동으로 숨겨집니다. 인라인 버튼(`pin`, `archive`)은 기능 조건과 `items`가 모두 포함할 때만 표시됩니다.

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // 표시할 액션 (마스터 제어)
    inlineItems: ['pin', 'delete'],  // pin + delete를 인라인 버튼으로
  },
}}
```

## 커스터마이징 불가능한 영역

### 프로젝트 / 워크스페이스 (세션 목록 내부)

세션 목록이 표시될 때, 다음 하위 영역은 렌더링되지만 **개별적으로 커스터마이징할 수 없습니다**:

| 측면                | 세부 사항                                                       |
| --------------------- | ----------------------------------------------------------------- |
| 데이터 소스           | `useSessions()` hook → 데몬 API (`/sessions` 엔드포인트)          |
| 세션 목록 정렬        | 생성 시간 기준, 내림차순                                          |
| 세션 행 렌더링        | 내부 `renderSessionRow` `useCallback` — 주입 불가                 |
| 검색 / 필터           | 클라이언트 측 텍스트 매칭이 있는 내장 검색 바                     |
| 세션 그룹             | 6개 프리셋 색상 + 커스텀 hex가 있는 `SessionGroupSection` 컴포넌트  |
| 워크스페이스 섹션     | 데몬 워크스페이스별 `WorkspaceSection`, 교체 불가                 |
| 워크스페이스 추가 대화 상자 | 내장 `AddWorkspaceDialog`                                     |

### ⑤ 리사이즈 핸들

- 오른쪽 가장자리의 드래그 핸들로 사이드바 너비 조정
- 너비는 localStorage에 저장됨
- 설정 불가

## 런타임 동작 prop

다음 `WebShellProps`는 사이드바 동작에 간접적으로 영향을 줍니다:

| Prop                            | 효과                                 |
| ------------------------------- | -------------------------------------- |
| `onNewSession`                  | 새 세션 핸들러 오버라이드              |
| `onLoadSession`                 | 세션 로딩 로직 오버라이드              |
| `onSessionIdChange`             | 세션 전환에 반응                       |
| `splitSessionIds`               | 분할 보기 세션을 외부에서 제어         |
| `theme` / `onThemeChange`       | 테마 제어 / 관찰                       |
| `language` / `onLanguageChange` | UI 언어 제어 / 관찰                    |

## 접힌 상태 및 모바일 상태

| 상태      | 동작                                               |
| --------- | -------------------------------------------------- |
| 확장됨    | 텍스트 라벨이 있는 전체 사이드바                    |
| 접힘      | 아이콘 레일 모드(로고, 펜 아이콘, 액션 아이콘만)     |
| 모바일    | 배경 오버레이와 함께 왼쪽에서 슬라이드되는 서랍      |

접힌 상태는 `qwen-code-web-shell-sidebar-collapsed` 키로 `localStorage`에 저장됩니다.

## 소스 위치

| 컴포넌트          | 파일                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| WebShellSidebar     | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`        |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`    |
| WorkspaceSection    | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`       |
| Sidebar 스타일      | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css` |
| App 통합            | `packages/web-shell/client/App.tsx` (`WebShellSidebar` 검색)              |
| 엔트리 포인트 (개발) | `packages/web-shell/client/main.tsx` (`sidebar: true`)                    |

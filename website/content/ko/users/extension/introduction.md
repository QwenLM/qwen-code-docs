---
title: Qwen Code Extensions
---

# Qwen Code 확장

Qwen Code 확장은 프롬프트, MCP 서버, 서브에이전트, skill 및 사용자 정의 명령어를 친숙하고 사용자 친화적인 형식으로 패키징합니다. 확장을 통해 Qwen Code의 기능을 확장하고 그 기능을 다른 사람과 공유할 수 있습니다. 쉽게 설치하고 공유할 수 있도록 설계되었습니다.

[Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) 및 [Claude Code Marketplace](https://claudemarketplaces.com/)의 확장 및 플러그인, Qoder, 그리고 휴대 가능한 [Agent Plugins v1](./agent-plugins.md) 형식을 Qwen Code에 직접 설치할 수 있습니다. 이 크로스 플랫폼 호환성은 확장 작성자가 별도의 버전을 유지 관리할 필요 없이 Qwen Code의 기능을 크게 확장하는 풍부한 확장 및 플러그인 생태계에 대한 접근을 제공합니다.

## 확장 관리

`qwen extensions` CLI 명령어와 인터랙티브 CLI 내의 `/extensions` 슬래시 명령어를 모두 사용하여 확장 관리 도구 세트를 제공합니다.

### 런타임 확장 관리(슬래시 명령어)

인터랙티브 CLI 내에서 `/extensions` 슬래시 명령어를 사용하여 런타임에 확장을 관리할 수 있습니다. 이 명령어는 핫 리로딩을 지원하여 애플리케이션을 재시작하지 않고도 변경 사항이 즉시 적용됩니다.

| 명령어                               | 설명                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `/extensions` 또는 `/extensions manage` | 설치된 모든 확장 관리                                                                            |
| `/extensions install <source>`       | git URL, 로컬 경로 또는 아카이브, 아카이브 URL, npm 패키지 또는 마켓플레이스에서 확장 설치         |
| `/extensions explore [source]`       | 브라우저에서 확장 소스 페이지(Gemini 또는 ClaudeCode) 열기                                       |

#### 인터랙티브 확장 관리자

`/extensions`(또는 `/extensions manage`)를 실행하면 세 개의 탭이 있는 인터랙티브 관리자가 열립니다. `Tab` 또는 `←`/`→` 화살표로 전환합니다.

- **Discover** — 구성된 마켓플레이스 소스에서 플러그인을 탐색합니다. 타이핑하여 검색하고 `Enter`로 플러그인의 세부 정보를 보고 설치합니다(설치 범위를 선택하라는 요청이 표시됩니다). `Ctrl+R`로 목록을 다시 가져오고 `Esc`로 돌아갑니다.
- **Installed** — 설치된 확장, 범위별(**User level**, **Project level** 및 즐겨찾기)로 그룹화. `↑`/`↓`로 탐색하고 `Space`로 확장을 활성화/비활성화하며 `f`로 즐겨찾기에 추가하고 `Enter`로 세부 정보를 엽니다. 확장에 번들된 MCP 서버는 라이브 연결 상태와 함께 부모 확장 아래에 중첩되어 표시됩니다. 각 서버를 개별적으로 활성화 또는 비활성화할 수 있습니다.
- **Sources** — Discover 탭에 데이터를 제공하는 마켓플레이스 소스를 관리합니다. `↑`/`↓`로 탐색하고 `Enter`로 소스를 선택하며 `d`로 제거합니다. 아래에 설명된 `qwen extensions sources` CLI 명령어로 관리되는 소스와 동일합니다.

여기서 수행한 변경 사항은 Qwen Code를 재시작하지 않고도 즉시 핫 리로드됩니다.

### CLI 확장 관리

`qwen extensions` CLI 명령어를 사용하여 확장을 관리할 수도 있습니다. CLI 명령어를 통한 변경 사항은 재시작 시 활성 CLI 세션에 반영됩니다.

### 확장 설치

여러 소스에서 `qwen extensions install`을 사용하여 확장을 설치할 수 있습니다:

#### Claude Code Marketplace에서

Qwen Code는 [Claude Code Marketplace](https://claudemarketplaces.com/)의 플러그인도 지원합니다. 마켓플레이스에서 설치하고 플러그인을 선택하세요:

```bash
qwen extensions install <marketplace-name>
# 또는
qwen extensions install <marketplace-github-url>
```

특정 플러그인을 설치하려면 플러그인 이름과 함께 형식을 사용할 수 있습니다:

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# 또는
qwen extensions install <marketplace-github-url>:<plugin-name>
```

예를 들어 [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) 마켓플레이스에서 `prompts.chat` 플러그인을 설치하려면:

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# 또는
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude 플러그인은 설치 시 자동으로 Qwen Code 형식으로 변환됩니다:

- `claude-plugin.json`이 `qwen-extension.json`으로 변환됩니다
- 에이전트 구성이 Qwen 서브에이전트 형식으로 변환됩니다
- Skill 구성이 Qwen skill 형식으로 변환됩니다
- 도구 매핑이 자동으로 처리됩니다

`/extensions explore` 명령어를 사용하여 다양한 마켓플레이스의 확장을 빠르게 탐색할 수 있습니다:

```bash
# Gemini CLI Extensions 마켓플레이스 열기
/extensions explore Gemini

# Claude Code 마켓플레이스 열기
/extensions explore ClaudeCode
```

이 명령어는 기본 브라우저에서 각 마켓플레이스를 열어 Qwen Code 경험을 향상시킬 새 확장을 발견할 수 있습니다.

> **크로스 플랫폼 호환성**: Gemini CLI와 Claude Code의 풍부한 확장 생태계를 활용하여 Qwen Code 사용자에게 사용 가능한 기능을 크게 확장할 수 있습니다.

#### Gemini CLI 확장에서

Qwen Code는 [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/)의 확장을 완전히 지원합니다. git URL을 사용하여 설치하세요:

```bash
qwen extensions install <gemini-cli-extension-github-url>
# 또는
qwen extensions install <owner>/<repo>
```

Gemini 확장은 설치 시 자동으로 Qwen Code 형식으로 변환됩니다:

- `gemini-extension.json`이 `qwen-extension.json`으로 변환됩니다
- TOML 명령어 파일이 자동으로 Markdown 형식으로 마이그레이션됩니다
- MCP 서버, 컨텍스트 파일 및 설정이 보존됩니다

#### Qoder 플러그인에서

Qwen Code는 `.qoder-plugin/plugin.json` 매니페스트를 포함하는 [Qoder 플러그인](https://docs.qoder.com/en/cli/sdk/plugins)을 지원합니다. 로컬 디렉토리, 아카이브, Git 저장소, 아카이브 URL 또는 스코프된 npm 패키지를 기존 `qwen extensions install` 명령어로 설치하세요:

```bash
qwen extensions install ./sample-qoder-plugin
qwen extensions install ./sample-qoder-plugin.zip
qwen extensions install owner/sample-qoder-plugin
```

설치 프로그램은 Qoder 매니페스트를 `qwen-extension.json`으로 변환하고 표준 `commands/`, `agents/`, `skills/` 디렉토리를 보존합니다. 루트 `.mcp.json` 파일에 선언된 MCP 서버는 확장 MCP 서버로 포함됩니다.

Qoder 플러그인에 루트의 `system-prompt.md`가 있으면 Qwen Code가 확장 컨텍스트로 로드합니다. 플러그인에 `QWEN.md`가 있거나 다른 컨텍스트 파일이 선언되어 있으면 모든 컨텍스트 파일이 유지되고 중복이 제거됩니다.

#### Agent Plugins v1에서

Qwen Code는 휴대 가능한 Agent Plugins v1 패키지를 `plugin.json`, `mcp.json`, `SKILL.md` 파일을 변환하거나 다시 작성하지 않고도 네이티브로 로드합니다:

```bash
qwen extensions install ./my-agent-plugin
qwen extensions link ./my-agent-plugin
qwen extensions install owner/my-agent-plugin
```

휴대 가능한 런타임은 Agent Skills와 stdio 및 Streamable HTTP MCP 서버를 지원합니다. Commands, agents, hooks, 클라이언트 네임스페이스 및 레거시 SSE MCP는 활성화되지 않습니다. 전체 지원 매트릭스는 [Agent Plugins v1](./agent-plugins.md)을 참조하세요.

#### npm 레지스트리에서

Qwen Code는 스코프된 패키지 이름을 사용하여 npm 레지스트리에서 확장을 설치하는 것을 지원합니다. 인증, 버전 관리 및 게시 인프라가 이미 갖춰진 프라이빗 레지스트리를 사용하는 팀에 이상적입니다.

```bash
# 최신 버전 설치
qwen extensions install @scope/my-extension

# 특정 버전 설치
qwen extensions install @scope/my-extension@1.2.0

# 사용자 정의 레지스트리에서 설치
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

`owner/repo` GitHub 단축 형식과의 모호성을 피하기 위해 스코프된 패키지(`@scope/package-name`)만 지원됩니다.

**레지스트리 확인**은 다음 우선순위를 따릅니다:

1. `--registry` CLI 플래그(명시적 재정의)
2. `.npmrc`의 스코프된 레지스트리(예: `@scope:registry=https://...`)
3. `.npmrc`의 기본 레지스트리
4. 폴백: `https://registry.npmjs.org/`

**인증**은 `NPM_TOKEN` 환경 변수 또는 `.npmrc` 파일의 레지스트리별 `_authToken` 항목을 통해 자동으로 처리됩니다.

> **참고:** npm 확장은 패키지 루트에 네이티브 `qwen-extension.json` 또는 Agent Plugins v1 `plugin.json`을 포함해야 합니다. 패키징 세부 정보는 [Extension Releasing](./extension-releasing.md#releasing-through-npm-registry)을 참조하세요.

#### Git 저장소에서

공개 Git 저장소 설치 및 업데이트 확인에는 Git 2.37 이상이 필요합니다. Qwen Code는 Git 2.37에서 도입된 `http.curloptResolve` 설정을 사용하여 공개 네트워크 연결을 검증된 DNS 결과에 고정합니다. 사용 중인 배포판에서 이전 버전의 Git을 제공하면 Git을 업그레이드하거나 로컬/아카이브 릴리스를 대신 설치하세요.

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

이렇게 하면 github mcp server 확장이 설치됩니다.

#### 로컬 경로에서

```bash
qwen extensions install /path/to/your/extension
```

로컬 `.zip` 및 `.tar.gz` 아카이브도 지원됩니다:

```bash
qwen extensions install /path/to/your/extension.zip
qwen extensions install /path/to/your/extension.tar.gz
```

아카이브는 루트에 완전한 확장을 포함하거나 확장을 포함하는 단일 최상위 디렉토리를 가져야 합니다.

설치된 확장의 복사본을 생성하므로 로컬에서 정의된 확장과 GitHub의 확장 모두에서 변경 사항을 가져오려면 `qwen extensions update`를 실행해야 합니다.

#### 아카이브 URL에서

```bash
qwen extensions install https://example.com/your/extension.zip
qwen extensions install https://example.com/your/extension.tar.gz
```

아카이브 URL은 URL이 동일한 확장의 더 새 아카이브를 계속 가리키는 한 나중에 업데이트할 수 있습니다.

#### 설치 범위 선택

기본적으로 설치된 확장은 전역(사용자 범위)에서 활성화됩니다. 현재 워크스페이스에서만 활성화하려면 `--scope project`를 전달하세요:

```bash
qwen extensions install <source> --scope project
```

`--scope workspace`는 `--scope project`의 별칭으로 허용됩니다. 이는 `/extensions manage` Discover 탭에서 설치할 때 제공되는 범위 선택과 일치합니다.

### 마켓플레이스 소스 관리

마켓플레이스 소스(Claude 플러그인 마켓플레이스)는 `/extensions manage`의 Discover 탭을 구동합니다. CLI에서도 관리할 수 있습니다:

```bash
# 마켓플레이스 추가(owner/repo, git URL, marketplace.json의 https URL 또는 로컬 경로)
qwen extensions sources add <source>

# 구성된 마켓플레이스 나열
qwen extensions sources list

# 마켓플레이스의 플러그인 목록을 다시 가져오기
qwen extensions sources update <name>

# 마켓플레이스 제거
qwen extensions sources remove <name>
```

### 확장 제거

제거하려면 `qwen extensions uninstall extension-name`을 실행하세요. 설치 예시의 경우:

```
qwen extensions uninstall qwen-cli-security
```

### 확장 비활성화

확장은 기본적으로 모든 워크스페이스에서 활성화됩니다. 확장을 완전히 또는 특정 워크스페이스에 대해 비활성화할 수 있습니다.

예를 들어 `qwen extensions disable extension-name`은 사용자 수준에서 확장을 비활성화하므로 모든 곳에서 비활성화됩니다. `qwen extensions disable extension-name --scope=workspace`는 현재 워크스페이스에서만 확장을 비활성화합니다.

### 확장 활성화

`qwen extensions enable extension-name`을 사용하여 확장을 활성화할 수 있습니다. 해당 워크스페이스 내에서 `qwen extensions enable extension-name --scope=workspace`를 사용하여 특정 워크스페이스에 대해 확장을 활성화할 수도 있습니다.

이는 최상위 수준에서 확장을 비활성화하고 특정 장소에서만 활성화하려는 경우 유용합니다.

### 확장 업데이트

로컬 경로 또는 아카이브, 아카이브 URL, git 저장소 또는 npm 레지스트리에서 설치된 확장의 경우 `qwen extensions update extension-name`으로 명시적으로 최신 버전으로 업데이트할 수 있습니다. 버전 핀 없이 설치된 npm 확장(예: `@scope/pkg`)의 경우 업데이트는 `latest` dist-tag를 확인합니다. 특정 dist-tag(예: `@scope/pkg@beta`)로 설치된 경우 업데이트는 해당 태그를 추적합니다. 정확한 버전으로 고정된 확장(예: `@scope/pkg@1.2.0`)은 항상 최신으로 간주됩니다.

다음으로 모든 확장을 업데이트할 수 있습니다:

```
qwen extensions update --all
```

## 작동 방식

시작 시 Qwen Code는 `<home>/.qwen/extensions`에서 확장을 찾습니다.

네이티브 Qwen 확장은 `qwen-extension.json` 파일을 포함하는 디렉토리로 존재합니다. Agent Plugins v1 패키지는 대신 루트 `plugin.json`을 유지합니다. [Agent Plugins v1](./agent-plugins.md)을 참조하세요.

예를 들어 네이티브 Qwen 확장은 다음 경로에 저장됩니다:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` 파일은 확장에 대한 구성을 포함합니다. 파일은 다음 구조를 가집니다:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  },
  "contextFileName": "QWEN.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: 확장의 이름. 확장을 고유하게 식별하고 확장 명령어가 사용자 또는 프로젝트 명령어와 같은 이름을 가질 때 충돌 해결에 사용됩니다. 이름은 소문자 또는 숫자여야 하며 밑줄이나 공백 대신 대시를 사용해야 합니다. 사용자가 CLI에서 확장을 참조하는 방식입니다. 이 이름이 확장 디렉토리 이름과 일치해야 합니다.
- `version`: 확장의 버전.
- `mcpServers`: 구성할 MCP 서버의 맵. 키는 서버의 이름이고 값은 서버 구성입니다. 이 서버는 [`settings.json` 파일](../configuration/settings.md)에서 구성된 MCP 서버와 마찬가지로 시작 시 로드됩니다. 확장과 `settings.json` 파일이 동일한 이름의 MCP 서버를 구성하면 `settings.json` 파일에 정의된 서버가 우선합니다.
  - `trust`를 제외한 모든 MCP 서버 구성 옵션이 지원됩니다.
- `channels`: 사용자 정의 채널 어댑터의 맵. 키는 채널 유형 이름이고 값은 `entry`(컴파일된 JS 진입점 경로)와 선택적 `displayName`을 가집니다. 진입점은 `ChannelPlugin` 인터페이스를 따르는 `plugin` 객체를 내보내야 합니다. 전체 가이드는 [Channel Plugins](../features/channels/plugins)를 참조하세요.
- `contextFileName`: 확장에 대한 컨텍스트를 포함하는 파일의 이름. 확장 디렉토리에서 컨텍스트를 로드하는 데 사용됩니다. 이 속성이 사용되지 않지만 `QWEN.md` 파일이 확장 디렉토리에 있으면 해당 파일이 로드됩니다.
- `commands`: 사용자 정의 명령어를 포함하는 디렉토리(기본값: `commands`). 명령어는 프롬프트를 정의하는 `.md` 파일입니다.
- `skills`: 사용자 정의 skill을 포함하는 디렉토리(기본값: `skills`). Skill은 자동으로 발견되어 `/skills` 명령어를 통해 사용 가능해집니다.
- `agents`: 사용자 정의 서브에이전트를 포함하는 디렉토리(기본값: `agents`). 서브에이전트는 특수화된 AI 어시스턴트를 정의하는 `.yaml` 또는 `.md` 파일입니다.
- `settings`: 확장에 필요한 설정 배열. 설치 시 사용자는 이러한 설정에 대한 값을 제공하라는 프롬프트를 받습니다. 값은 안전하게 저장되고 환경 변수로 MCP 서버에 전달됩니다.
  - 각 설정에는 다음 속성이 있습니다:
    - `name`: 설정의 표시 이름
    - `description`: 이 설정의 용도에 대한 설명
    - `envVar`: 설정될 환경 변수 이름
    - `sensitive`: 값을 숨겨야 하는지 나타내는 불리언(예: API 키, 비밀번호)

### 확장 설정 관리

확장은 설정(예: API 키 또는 자격 증명)을 통해 구성을 요구할 수 있습니다. 이러한 설정은 `qwen extensions settings` CLI 명령어로 관리할 수 있습니다:

**설정 값 설정:**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**확장의 모든 설정과 현재 값 나열:**

```bash
qwen extensions settings list <extension-name>
```

설정은 두 수준에서 구성할 수 있습니다:

- **사용자 수준**(기본값): 설정은 모든 프로젝트에 적용됩니다(`~/.qwen/.env`)
- **워크스페이스 수준**: 설정은 현재 프로젝트에만 적용됩니다(`.qwen/.env`)

워크스페이스 설정이 사용자 설정보다 우선합니다. 민감한 설정은 안전하게 저장되며 절대 일반 텍스트로 표시되지 않습니다.

Qwen Code가 시작되면 모든 확장을 로드하고 구성을 병합합니다. 충돌이 있으면 워크스페이스 구성이 우선합니다.

### 사용자 정의 명령어

확장은 확장 디렉토리 내의 `commands/` 하위 디렉토리에 Markdown 파일을 배치하여 [사용자 정의 명령어](../features/commands.md#4-custom-commands)를 제공할 수 있습니다. 이 명령어는 사용자 및 프로젝트 사용자 정의 명령어와 동일한 형식을 따르며 표준 명명 규칙을 사용합니다.

> **참고:** 명령어 형식이 TOML에서 Markdown으로 업데이트되었습니다. TOML 파일은 지원 중단되었지만 여전히 지원됩니다. TOML 파일이 감지될 때 나타나는 자동 마이그레이션 프롬프트를 사용하여 기존 TOML 명령어를 마이그레이션할 수 있습니다.

**예시**

`gcp`라는 확장이 다음 구조를 가집니다:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

다음 명령어를 제공합니다:

- `/deploy` - 도움말에 `[gcp] Custom command from deploy.md`로 표시
- `/gcs:sync` - 도움말에 `[gcp] Custom command from sync.md`로 표시

### 사용자 정의 Skill

확장은 확장 디렉토리 내의 `skills/` 하위 디렉토리에 skill 파일을 배치하여 사용자 정의 skill을 제공할 수 있습니다. 각 skill은 skill의 이름과 설명을 정의하는 YAML 프론트매터가 있는 `SKILL.md` 파일을 가져야 합니다.

**예시**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

확장이 활성일 때 `/skills` 명령어를 통해 skill을 사용할 수 있습니다.

### 사용자 정의 서브에이전트

확장은 확장 디렉토리 내의 `agents/` 하위 디렉토리에 에이전트 구성 파일을 배치하여 사용자 정의 서브에이전트를 제공할 수 있습니다. 에이전트는 YAML 또는 Markdown 파일로 정의됩니다.

**예시**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

확장 서브에이전트는 서브에이전트 관리자 대화상자의 "Extension Agents" 섹션에 나타납니다.

### 충돌 해결

확장 명령어는 가장 낮은 우선순위를 가집니다. 사용자 또는 프로젝트 명령어와 충돌이 발생하면:

1. **충돌 없음**: 확장 명령어는 자연스러운 이름을 사용합니다(예: `/deploy`)
2. **충돌 있음**: 확장 명령어는 확장 접두사와 함께 이름이 변경됩니다(예: `/gcp.deploy`)

예를 들어 사용자와 `gcp` 확장이 모두 `deploy` 명령어를 정의하면:

- `/deploy` - 사용자의 deploy 명령어 실행
- `/gcp.deploy` - 확장의 deploy 명령어 실행(`[gcp]` 태그로 표시)

## 변수

Qwen Code 확장은 `qwen-extension.json`에서 변수 치환을 허용합니다. 예를 들어 MCP 서버를 실행하기 위해 현재 디렉토리가 필요한 경우 `"cwd": "${extensionPath}${/}run.ts"`에 유용할 수 있습니다.

**지원되는 변수:**

| 변수                     | 설명                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`       | 사용자 파일 시스템에서 확장의 전체 경로. 예: '/Users/username/.qwen/extensions/example-extension'. 심볼릭 링크를 풀지 않습니다.                              |
| `${workspacePath}`       | 현재 워크스페이스의 전체 경로.                                                                                                                              |
| `${/} 또는 ${pathSeparator}` | 경로 구분자(OS마다 다름).                                                                                                                                  |

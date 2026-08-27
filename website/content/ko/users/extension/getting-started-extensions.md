---
title: Getting Started with Extensions
---

# Qwen Code 확장 시작하기

이 가이드는 첫 Qwen Code 확장을 만드는 과정을 안내합니다. 새 확장 설정, MCP 서버를 통한 사용자 정의 도구 추가, 사용자 정의 명령어 생성, `QWEN.md` 파일로 모델에 컨텍스트 제공하는 방법을 배웁니다.

## 사전 요구 사항

시작하기 전에 Qwen Code가 설치되어 있고 Node.js와 TypeScript에 대한 기본 이해가 있는지 확인하세요.

## 1단계: 새 확장 생성

가장 쉬운 방법은 내장 템플릿 중 하나를 사용하는 것입니다. `mcp-server` 예시를 기반으로 시작합니다.

다음 명령어를 실행하여 템플릿 파일이 포함된 `my-first-extension`이라는 새 디렉토리를 생성하세요:

```bash
qwen extensions new my-first-extension mcp-server
```

다음 구조의 새 디렉토리가 생성됩니다:

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## 2단계: 확장 파일 이해

새 확장의 주요 파일을 살펴보겠습니다.

### `qwen-extension.json`

확장의 매니페스트 파일입니다. Qwen Code에 확장을 로드하고 사용하는 방법을 알려줍니다.

```json
{
  "name": "my-first-extension",
  "version": "1.0.0",
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["${extensionPath}${/}dist${/}example.js"],
      "cwd": "${extensionPath}"
    }
  }
}
```

- `name`: 확장의 고유 이름.
- `version`: 확장의 버전.
- `mcpServers`: 하나 이상의 모델 컨텍스트 프로토콜(MCP) 서버를 정의합니다. MCP 서버는 모델이 사용할 새 도구를 추가하는 방법입니다.
  - `command`, `args`, `cwd`: 서버를 시작하는 방법을 지정합니다. `${extensionPath}` 변수가 사용되는데, Qwen Code는 이를 확장의 설치 디렉토리에 대한 절대 경로로 대체합니다. 이렇게 하면 어디에 설치되더라도 확장이 작동합니다.

### `example.ts`

MCP 서버의 소스 코드가 포함된 파일입니다. `@modelcontextprotocol/sdk`를 사용하는 간단한 Node.js 서버입니다.

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

// Registers a new tool named 'fetch_posts'
server.registerTool(
  'fetch_posts',
  {
    description: 'Fetches a list of posts from a public API.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const apiResponse = await fetch(
      'https://jsonplaceholder.typicode.com/posts',
    );
    const posts = await apiResponse.json();
    const response = { posts: posts.slice(0, 5) };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  },
);

// ... (prompt registration omitted for brevity)

const transport = new StdioServerTransport();
await server.connect(transport);
```

이 서버는 공개 API에서 데이터를 가져오는 `fetch_posts`라는 단일 도구를 정의합니다.

### `package.json` 및 `tsconfig.json`

TypeScript 프로젝트의 표준 구성 파일입니다. `package.json` 파일은 종속성과 `build` 스크립트를 정의하며, `tsconfig.json`은 TypeScript 컴파일러를 구성합니다.

## 3단계: 확장 빌드 및 링크

확장을 사용하기 전에 TypeScript 코드를 컴파일하고 로컬 개발을 위해 확장을 Qwen Code 설치에 링크해야 합니다.

1.  **종속성 설치:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **서버 빌드:**

    ```bash
    npm run build
    ```

    이렇게 하면 `example.ts`가 `dist/example.js`로 컴파일되며, 이 파일이 `qwen-extension.json`에서 참조됩니다.

3.  **확장 링크:**

    `link` 명령어는 Qwen Code 확장 디렉토리에서 개발 디렉토리로 심볼릭 링크를 생성합니다. 즉, 변경 사항이 즉시 반영되어 다시 설치할 필요가 없습니다.

    ```bash
    qwen extensions link .
    ```

이제 Qwen Code 세션을 재시작하세요. 새 `fetch_posts` 도구를 사용할 수 있습니다. "fetch posts"라고 요청하여 테스트할 수 있습니다.

## 4단계: 사용자 정의 명령어 추가

사용자 정의 명령어는 복잡한 프롬프트에 대한 단축키를 만드는 방법을 제공합니다. 코드에서 패턴을 검색하는 명령어를 추가해 봅시다.

1.  `commands` 디렉토리와 명령어 그룹의 하위 디렉토리를 생성하세요:

    ```bash
    mkdir -p commands/fs
    ```

2.  `commands/fs/grep-code.md` 파일을 생성하세요:

    ```markdown
    ---
    description: Search for a pattern in code and summarize findings
    ---

    Please summarize the findings for the pattern `{{args}}`.

    Search Results:
    !{grep -r {{args}} .}
    ```

    이 명령어 `/fs:grep-code`는 인자를 받아 `grep` 셸 명령어를 실행하고 결과를 요약 프롬프트에 전달합니다.

> **참고:** 명령어는 선택적 YAML 프론트매터와 함께 Markdown 형식을 사용합니다. TOML 형식은 지원 중단되었지만 여전히 하위 호환성을 위해 지원됩니다.

파일을 저장한 후 Qwen Code를 재시작하세요. 이제 `/fs:grep-code "some pattern"`을 실행하여 새 명령어를 사용할 수 있습니다.

## 5단계: 사용자 정의 Skill 및 서브에이전트 추가(선택 사항)

확장은 Qwen Code의 기능을 확장하기 위해 사용자 정의 skill과 서브에이전트를 제공할 수도 있습니다.

### 사용자 정의 Skill 추가

Skill은 AI가 관련 있을 때 자동으로 사용할 수 있는 모델 호출 기능입니다.

1.  `skills` 디렉토리와 skill 하위 디렉토리를 생성하세요:

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  `skills/code-analyzer/SKILL.md` 파일을 생성하세요:

    ```markdown
    ---
    name: code-analyzer
    description: Analyzes code structure and provides insights about complexity, dependencies, and potential improvements
    ---

    # Code Analyzer

    ## Instructions

    When analyzing code, focus on:

    - Code complexity and maintainability
    - Dependencies and coupling
    - Potential performance issues
    - Suggestions for improvements

    ## Examples

    - "Analyze the complexity of this function"
    - "What are the dependencies of this module?"
    ```

### 사용자 정의 서브에이전트 추가

서브에이전트는 특정 작업을 위한 특수화된 AI 어시스턴트입니다.

1.  `agents` 디렉토리를 생성하세요:

    ```bash
    mkdir -p agents
    ```

2.  `agents/refactoring-expert.md` 파일을 생성하세요:

    ```markdown
    ---
    name: refactoring-expert
    description: Specialized in code refactoring, improving code structure and maintainability
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    You are a refactoring specialist focused on improving code quality.

    Your expertise includes:

    - Identifying code smells and anti-patterns
    - Applying SOLID principles
    - Improving code readability and maintainability
    - Safe refactoring with minimal risk

    For each refactoring task:

    1. Analyze the current code structure
    2. Identify areas for improvement
    3. Propose refactoring steps
    4. Implement changes incrementally
    5. Verify functionality is preserved
    ```

Qwen Code를 재시작한 후 사용자 정의 skill은 `/skills`를 통해, 서브에이전트는 `/agents manage`를 통해 사용할 수 있습니다.

## 6단계: 사용자 정의 `QWEN.md` 추가

확장에 `QWEN.md` 파일을 추가하여 모델에 영구 컨텍스트를 제공할 수 있습니다. 이는 모델에게 행동 방식에 대한 지시나 확장의 도구에 대한 정보를 제공하는 데 유용합니다. 명령어와 프롬프트를 노출하도록 빌드된 확장에서는 이것이 항상 필요하지 않을 수 있습니다.

1.  확장 디렉토리의 루트에 `QWEN.md`라는 파일을 생성하세요:

    ```markdown
    # My First Extension Instructions

    You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
    ```

2.  `qwen-extension.json`을 업데이트하여 CLI가 이 파일을 로드하도록 지시하세요:

    ```json
    {
      "name": "my-first-extension",
      "version": "1.0.0",
      "contextFileName": "QWEN.md",
      "mcpServers": {
        "nodeServer": {
          "command": "node",
          "args": ["${extensionPath}${/}dist${/}example.js"],
          "cwd": "${extensionPath}"
        }
      }
    }
    ```

CLI를 다시 재시작하세요. 이제 모델은 확장이 활성인 모든 세션에서 `QWEN.md` 파일의 컨텍스트를 갖게 됩니다.

## 7단계: 확장 릴리스

확장에 만족하면 다른 사람과 공유할 수 있습니다. 확장을 릴리스하는 두 가지 주요 방법은 Git 저장소 또는 GitHub Releases를 통하는 것입니다. 공개 Git 저장소를 사용하는 것이 가장 간단한 방법입니다.

두 방법 모두에 대한 자세한 지침은 [Extension Releasing Guide](./extension-releasing.md)를 참조하세요.

## 결론

Qwen Code 확장을 성공적으로 생성했습니다! 다음 방법을 배웠습니다:

- 템플릿에서 새 확장 부트스트랩.
- MCP 서버로 사용자 정의 도구 추가.
- 편리한 사용자 정의 명령어 생성.
- 사용자 정의 skill 및 서브에이전트 추가.
- 모델에 영구 컨텍스트 제공.
- 로컬 개발을 위한 확장 링크.

여기서 더 고급 기능을 탐색하고 Qwen Code에 강력한 새 기능을 구축할 수 있습니다.

# 计算机使用内置实现计划

> **给代理工作者的说明：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 使 `open-computer-use` 成为 qwen-code 中零配置的内置能力。9 个计算机使用工具出现在延迟工具列表中，名称分别为 `computer_use__click`、`computer_use__type_text` 等。首次调用时自动安装上游 npm 二进制文件，必要时引导用户完成 macOS 辅助功能/屏幕录制权限设置，并将调用转发给上游 MCP 服务器。

**架构：** 在上游 `npx -y open-computer-use mcp` 之上的薄封装。我们不捆绑二进制文件；上游的 `npx` 缓存 + `.app` 包负责分发和 macOS TCC。9 个工具注册为参数化的 `ComputerUseTool` 实例（每个工具名称一个），由持有长时间运行 MCP stdio 子进程的单例 `ComputerUseClient` 支持。启动状态机构建在现有 qwen-code 工具权限（已有）→ 首次安装确认 → 可选的 macOS 权限引导之上。

**技术栈：** TypeScript, vitest, `@modelcontextprotocol/sdk`（已是 qwen-code 依赖项）, `node:child_process`, `node:fs/promises`。

---

## 文件结构

**新文件：**

```
packages/core/src/tools/computer-use/
  index.ts                          # registerComputerUseTools(registry, config); 桶导出
  schemas.ts                        # 硬编码的 9 个 schemas + 描述（与上游同步）
  tool.ts                           # ComputerUseTool — 参数化的 BaseDeclarativeTool
  client.ts                         # ComputerUseClient — 单例 MCP stdio 进程管理器
  bootstrap.ts                      # 状态机：探测 → 安装确认 → 安装 → 权限引导
  install-state.ts                  # ~/.qwen/computer-use/installed.json 读写
  permission-detector.ts            # 解析上游错误字符串以检测缺失权限
  schemas.test.ts                   # 所有 9 个 schemas 解析通过，名称符合约定
  tool.test.ts                      # 参数化工具连线
  client.test.ts                    # 客户端生命周期（模拟 spawn）
  bootstrap.test.ts                 # 状态机转换
  install-state.test.ts             # 状态文件往返测试
  permission-detector.test.ts       # 错误模式匹配
scripts/
  sync-computer-use-schemas.ts      # 发布时脚本：转储上游 tools/list → schemas.ts
```

**修改的文件：**

```
packages/core/src/tools/tool-names.ts                  # 添加 9 个 COMPUTER_USE_* 常量
packages/core/src/config/config.ts                     # 添加 computerUseEnabled 字段 + isComputerUseEnabled() + 在 createToolRegistry() 中注册调用
packages/cli/src/config/config.ts                      # 映射 settings.tools.computerUse.enabled → ConfigParameters.computerUseEnabled
packages/cli/src/config/settingsSchema.ts              # 添加 tools.computerUse.enabled 布尔值（默认 true）
```

**分解理由：** 每个文件职责单一。`client.ts` 了解 MCP 协议但不了解 UX；`bootstrap.ts` 了解 UX 但不涉及 MCP 细节；`tool.ts` 是纯粹的管道，通过 `execute()` 将它们连接起来。测试文件紧邻代码。Schemas 独立存放，以便同步脚本可以重写文件而无需搅动逻辑。

---

## 阶段 1 — 基础（工具表面可见，不可执行）

### 任务 1：为 9 个计算机使用工具添加 ToolNames + ToolDisplayNames 条目

**文件：**

- 修改：`packages/core/src/tools/tool-names.ts`

- [ ] **步骤 1：添加 9 个名称常量**

编辑 `packages/core/src/tools/tool-names.ts` — 在 `ToolNames` 对象内，`EXIT_WORKTREE: 'exit_worktree',` 之后添加：

```typescript
  // Computer Use 工具 —— 内置但由上游 MCP 服务器支持。
  // 全部延迟；仅当用户发起的请求触发计算机使用操作时才展示。
  // 参见 packages/core/src/tools/computer-use/。
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

在 `ToolDisplayNames` 中镜像添加：

```typescript
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

（displayName 与 name 故意相同；我们不希望在权限对话框中看到像 `Click` 这样的大写显示名称，因为工具名称是 `computer_use__click`。）

- [ ] **步骤 2：验证现有的 tool-names 测试仍然通过**

运行：`npm test -- packages/core/src/tools/tool-names`
预期：通过（如果没有测试文件，运行 `npm run build -- --filter @qwen-code/qwen-code-core` 进行类型检查）

- [ ] **步骤 3：提交**

```bash
git add packages/core/src/tools/tool-names.ts
git commit -m "feat(computer-use): add tool name constants"
```

---

### 任务 2：硬编码 schemas 模块

**文件：**

- 创建：`packages/core/src/tools/computer-use/schemas.ts`
- 创建：`packages/core/src/tools/computer-use/schemas.test.ts`

9 个 schemas 镜像上游 `open-computer-use mcp` 的 `tools/list` 输出。它们固定到上游版本 `^0.x.y`（TODO：在实现时在 `schemas.ts` 顶部填入实际的固定版本——运行 `npx -y open-computer-use@latest --version` 获取当前的 latest 版本）。

- [ ] **步骤 1：编写会失败的测试**

创建 `packages/core/src/tools/computer-use/schemas.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { COMPUTER_USE_SCHEMAS, COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('computer-use schemas', () => {
  it('exports exactly 9 schemas', () => {
    expect(Object.keys(COMPUTER_USE_SCHEMAS)).toHaveLength(9);
  });

  it('each tool name matches the upstream convention (no computer_use__ prefix)', () => {
    // schemas.ts 使用上游名称原样（"click", "type_text"）。
    // computer_use__ 前缀位于面向 qwen-code 的包装层上。
    for (const name of COMPUTER_USE_TOOL_NAMES) {
      expect(name).not.toContain('computer_use__');
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });

  it('every schema has the standard object structure', () => {
    for (const [name, schema] of Object.entries(COMPUTER_USE_SCHEMAS)) {
      expect(schema.description, `${name} missing description`).toBeTruthy();
      expect(
        schema.parameterSchema,
        `${name} missing parameterSchema`,
      ).toBeTruthy();
      expect((schema.parameterSchema as { type: string }).type).toBe('object');
    }
  });

  it('list_apps takes no parameters', () => {
    expect(COMPUTER_USE_SCHEMAS.list_apps.parameterSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('click requires app and either element_index or x/y', () => {
    const schema = COMPUTER_USE_SCHEMAS.click.parameterSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties).toHaveProperty('app');
    expect(schema.properties).toHaveProperty('element_index');
    expect(schema.properties).toHaveProperty('x');
    expect(schema.properties).toHaveProperty('y');
    expect(schema.required).toContain('app');
  });
});
```

- [ ] **步骤 2：运行测试以验证其失败**

运行：`npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
预期：失败，提示 "Cannot find module './schemas.js'"

- [ ] **步骤 3：编写 schemas 模块**

创建 `packages/core/src/tools/computer-use/schemas.ts`。以下 schemas 是 MVP——它们反映了上游的工具表面和参数命名。`sync-computer-use-schemas.ts` 脚本（任务 13）将在每个 qwen-code 发布前的 CI 中根据实时上游快照重新生成此文件。

```typescript
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 9 个上游 open-computer-use 工具的硬编码 schemas。
 *
 * 固定到上游版本：<PIN_VERSION_DURING_IMPL>
 *
 * 由 `scripts/sync-computer-use-schemas.ts` 重新生成 —— 不要手动编辑。
 * 上游工具名称（"click", "type_text"）在此处原样出现；
 * `computer_use__` 前缀由 `tool.ts` 中的面向 qwen-code 的包装层添加，
 * 以便模型看到 `computer_use__click`，而无需任何 MCP 概念暴露出来。
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = [
  'list_apps',
  'get_app_state',
  'click',
  'perform_secondary_action',
  'scroll',
  'drag',
  'type_text',
  'press_key',
  'set_value',
] as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<
  ComputerUseToolName,
  ComputerUseToolSchema
> = {
  list_apps: {
    description:
      '列出当前机器上正在运行和最近使用的桌面应用程序。返回每个应用的 bundle 标识符和显示名称。在调用 get_app_state 之前使用此工具，以发现哪些应用可供交互。',
    parameterSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  get_app_state: {
    description:
      '捕获给定应用程序的当前辅助功能树和屏幕截图。返回后续动作（click、set_value 等）可以定位的 element_index 值。在任何针对元素的操作之前始终调用此工具；element_index 值仅在当前快照内有效。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description:
            '应用程序 bundle 标识符或显示名称（例如 "TextEdit", "com.apple.Safari"）。',
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  click: {
    description:
      '左键单击目标。优先使用来自最近 get_app_state 结果的 element_index。仅当没有与目标匹配的 AX 元素时，才回退到屏幕截图像素坐标 x/y。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: '目标应用程序。' },
        element_index: {
          type: 'integer',
          description: '最近 get_app_state 元素列表中的索引。',
        },
        x: {
          type: 'integer',
          description: '屏幕截图像素中的 X 坐标。',
        },
        y: {
          type: 'integer',
          description: '屏幕截图像素中的 Y 坐标。',
        },
        click_count: {
          type: 'integer',
          description: '单击次数（1 = 单击，2 = 双击）。',
          default: 1,
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  perform_secondary_action: {
    description:
      '对目标 AX 元素执行非单击语义操作（例如 "Raise", "ShowMenu"）。如果该操作对元素无效，则返回错误。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        action: {
          type: 'string',
          description: '要执行的 AX 操作名称。',
        },
      },
      required: ['app', 'element_index', 'action'],
      additionalProperties: false,
    },
  },
  scroll: {
    description:
      '在目标元素内或给定坐标处滚动。`pages` 是小数页数（正数 = 向下，负数 = 向上）。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        x: { type: 'integer' },
        y: { type: 'integer' },
        pages: {
          type: 'number',
          description: '要滚动的页数（负数 = 向上）。',
        },
      },
      required: ['app', 'pages'],
      additionalProperties: false,
    },
  },
  drag: {
    description:
      '在目标应用程序窗口内从一个坐标对拖拽到另一个坐标对。坐标采用屏幕截图像素。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        from_x: { type: 'integer' },
        from_y: { type: 'integer' },
        to_x: { type: 'integer' },
        to_y: { type: 'integer' },
      },
      required: ['app', 'from_x', 'from_y', 'to_x', 'to_y'],
      additionalProperties: false,
    },
  },
  type_text: {
    description:
      '将文本输入到目标应用程序当前聚焦的文本输入框中。如果输入框未聚焦，请先单击输入区域。对于未聚焦的文本字段，优先使用 set_value。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        text: {
          type: 'string',
          description: '要输入的文本。支持 Unicode。',
        },
      },
      required: ['app', 'text'],
      additionalProperties: false,
    },
  },
  press_key: {
    description:
      '针对目标应用程序按下键盘按键或组合键。键名遵循 xdotool 约定（例如 "Return", "BackSpace", "cmd+c", "Page_Up"）。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        key: { type: 'string' },
      },
      required: ['app', 'key'],
      additionalProperties: false,
    },
  },
  set_value: {
    description:
      '直接设置可设置的 AX 元素（文本字段、滑块等）的值。如果目标不可设置，则返回错误。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        value: { type: 'string' },
      },
      required: ['app', 'element_index', 'value'],
      additionalProperties: false,
    },
  },
};
```

- [ ] **步骤 4：运行测试以验证其通过**

运行：`npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
预期：通过，5 个测试

- [ ] **步骤 5：提交**

```bash
git add packages/core/src/tools/computer-use/schemas.ts packages/core/src/tools/computer-use/schemas.test.ts
git commit -m "feat(computer-use): hardcode upstream tool schemas"
```

---

### 任务 3：为 enableComputerUse 添加设置 schema + Config 连线

**文件：**

- 修改：`packages/cli/src/config/settingsSchema.ts`
- 修改：`packages/cli/src/config/config.ts`
- 修改：`packages/core/src/config/config.ts`

- [ ] **步骤 1：添加设置条目**

编辑 `packages/cli/src/config/settingsSchema.ts`。现有 schema 按类别对内容进行分组。Computer Use 是一种工具能力，而非实验性功能——如果 `tools` 子组不存在则添加，否则添加到现有组中。使用 grep：

```bash
grep -n "tools:" packages/cli/src/config/settingsSchema.ts | head -5
```

如果存在 `tools:` 键，则在其下添加新属性。如果不存在，则添加一个顶层组。模式（在 `experimental.cron` 条目附近，约第 2298 行处添加）：

```typescript
  tools: {
    type: 'object',
    label: '工具',
    category: 'Tools',
    requiresRestart: true,
    default: {},
    description: '工具能力开关。',
    showInDialog: false,
    properties: {
      computerUse: {
        type: 'object',
        label: '计算机使用',
        category: 'Tools',
        requiresRestart: true,
        default: {},
        description: '跨平台桌面自动化，通过上游 open-computer-use MCP 服务器实现。工具：list_apps, get_app_state, click, type_text, scroll, drag, press_key, perform_secondary_action, set_value。首次调用时，通过 npx 获取上游二进制文件，并根据需要引导用户完成 macOS 辅助功能/屏幕录制权限设置。',
        showInDialog: false,
        properties: {
          enabled: {
            type: 'boolean',
            label: '启用计算机使用',
            category: 'Tools',
            requiresRestart: true,
            default: true,
            description: '启用时（默认），9 个 computer_use__* 工具注册为延迟内置工具。',
            showInDialog: true,
          },
        },
      },
    },
  },
```

如果 `tools:` 组已存在，则只需在其 `properties` 下添加 `computerUse:` 属性。

- [ ] **步骤 2：连线 settings → ConfigParameters**

编辑 `packages/cli/src/config/config.ts`。找到现有行 `cronEnabled: settings.experimental?.cron ?? false,`（约第 1833 行）。在其正下方添加：

```typescript
    computerUseEnabled: settings.tools?.computerUse?.enabled ?? true,
```

- [ ] **步骤 3：添加 Config 字段 + getter**

编辑 `packages/core/src/config/config.ts`：

(a) 在 `ConfigParameters` 接口中（搜索 `cronEnabled?: boolean;`），在其正下方添加：

```typescript
  computerUseEnabled?: boolean;
```

(b) 在 `Config` 类字段中（搜索 `private readonly cronEnabled: boolean = false;`），在其正下方添加：

```typescript
  private readonly computerUseEnabled: boolean = true;
```

(c) 在 `Config` 构造函数中（搜索 `this.cronEnabled = params.cronEnabled ?? false;`），在其正下方添加：

```typescript
this.computerUseEnabled = params.computerUseEnabled ?? true;
```

(d) 在 `isCronEnabled()` 附近（搜索 `isCronEnabled(): boolean {`），添加一个兄弟 getter：

```typescript
  isComputerUseEnabled(): boolean {
    return this.computerUseEnabled;
  }
```

- [ ] **步骤 4：类型检查**

运行：`npm run build -- --filter @qwen-code/qwen-code-core --filter @qwen-code/qwen-code`
预期：通过

- [ ] **步骤 5：提交**

```bash
git add packages/cli/src/config/settingsSchema.ts packages/cli/src/config/config.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): add enableComputerUse setting (default true)"
```

---

## 阶段 2 — 传输（基于 npx stdio 的 MCP 客户端）

### 任务 4：ComputerUseClient — 单例 MCP stdio 进程管理器

**文件：**

- 创建：`packages/core/src/tools/computer-use/client.ts`
- 创建：`packages/core/src/tools/computer-use/client.test.ts`

注意：客户端使用 `@modelcontextprotocol/sdk`（已是依赖项，参见 `packages/core/src/tools/mcp-client.ts`）。我们使用 `StdioClientTransport` 来 spawn `npx -y open-computer-use mcp`。

- [ ] **步骤 1：编写会失败的测试**

创建 `packages/core/src/tools/computer-use/client.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputerUseClient } from './client.js';

describe('ComputerUseClient', () => {
  let client: ComputerUseClient;

  beforeEach(() => {
    client = new ComputerUseClient({
      packageSpec: 'open-computer-use@latest',
      onProgress: vi.fn(),
    });
  });

  it('is constructible', () => {
    expect(client).toBeDefined();
  });

  it('reports not-started before start() is called', () => {
    expect(client.isStarted()).toBe(false);
  });

  it('returns the same instance for repeated callers via singleton', () => {
    const a = ComputerUseClient.shared();
    const b = ComputerUseClient.shared();
    expect(a).toBe(b);
  });
});
```

- [ ] **步骤 2：运行测试以验证其失败**

运行：`npm test -- packages/core/src/tools/computer-use/client.test.ts`
预期：失败 — 找不到模块
- [ ] **步骤 3：实现客户端**

创建 `packages/core/src/tools/computer-use/client.ts`：

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  CallToolResult,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * 上游 open-computer-use 二进制文件的单例 stdio MCP 客户端。
 *
 * 通过 `npx -y <packageSpec> mcp` 启动。首次启动会支付 npx 下载成本
 * （对于新缓存，最多约 60 秒）；后续启动会复用 npx 缓存，耗时不到一秒。
 *
 * 生命周期：第一次 `callTool` 调用时延迟启动。该进程会保持活动状态，
 * 直到调用 `stop()` 或 qwen-code 退出。状态（每个应用的 element_index 映射）
 * 保存在进程内——如果进程重启，模型必须在任何针对元素的操作之前再次调用 `get_app_state`。
 */
export interface ComputerUseClientOptions {
  /** 传递给 npx 的 npm 包 spec。例如："open-computer-use@^0.3.0"。 */
  packageSpec: string;
  /** 慢速操作期间用于进度消息的流式钩子。 */
  onProgress?: (message: string) => void;
}

export class ComputerUseClient {
  private static singleton: ComputerUseClient | undefined;

  private readonly packageSpec: string;
  private readonly onProgress: (message: string) => void;
  private client: Client | undefined;
  private transport: StdioClientTransport | undefined;
  private startPromise: Promise<void> | undefined;

  constructor(options: ComputerUseClientOptions) {
    this.packageSpec = options.packageSpec;
    this.onProgress = options.onProgress ?? (() => {});
  }

  /**
   * 共享的单例实例，首次访问时使用默认选项创建。
   * 测试可以通过 `setSharedForTest()` 替换它。
   */
  static shared(): ComputerUseClient {
    if (!ComputerUseClient.singleton) {
      ComputerUseClient.singleton = new ComputerUseClient({
        packageSpec:
          process.env['QWEN_COMPUTER_USE_PACKAGE'] ??
          'open-computer-use@latest',
      });
    }
    return ComputerUseClient.singleton;
  }

  /** 仅测试用：替换单例。 */
  static setSharedForTest(replacement: ComputerUseClient | undefined): void {
    ComputerUseClient.singleton = replacement;
  }

  isStarted(): boolean {
    return this.client !== undefined;
  }

  /**
   * 启动上游 MCP 服务器。幂等操作：并发调用者共享相同的进行中启动 promise。
   *
   * 启动失败时抛出异常（网络断开、npx 缺失等）。调用者（引导状态机）
   * 负责将抛出异常映射为用户可见的 UX。
   */
  async start(): Promise<void> {
    if (this.client) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.doStart().finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    this.onProgress('正在启动 Computer Use...');

    // 大约 3 秒后，提示慢路径是下载。
    const downloadHintTimer = setTimeout(() => {
      this.onProgress(
        '正在下载 Computer Use 二进制文件（首次使用可能需要约 60 秒）...',
      );
    }, 3000);

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', this.packageSpec, 'mcp'],
        // 继承环境变量，使 HTTPS_PROXY 等可以流向 npx
        env: { ...process.env } as Record<string, string>,
      });
      const client = new Client(
        { name: 'qwen-code-computer-use', version: '1.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);
      this.transport = transport;
      this.client = client;
    } finally {
      clearTimeout(downloadHintTimer);
    }
  }

  /**
   * 列出上游服务器暴露的工具。用于 schema 同步脚本和引导诊断。
   */
  async listTools(): Promise<ListToolsResult> {
    if (!this.client) throw new Error('ComputerUseClient 未启动');
    return this.client.listTools();
  }

  /**
   * 按上游名称调用工具（不是 qwen-code 面向的 `computer_use__` 前缀名称）。
   * 返回原始的 MCP 结果，以便调用者检查 `isError` 并解析文本内容。
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    if (!this.client) throw new Error('ComputerUseClient 未启动');
    return this.client.callTool({
      name,
      arguments: args,
    }) as Promise<CallToolResult>;
  }

  /** 拆除子进程。可以安全地多次调用。 */
  async stop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;
    if (client) {
      try {
        await client.close();
      } catch {
        // 尽最大努力清理
      }
    }
  }
}
```

- [ ] **步骤 4：运行测试以验证通过**

运行：`npm test -- packages/core/src/tools/computer-use/client.test.ts`
预期结果：通过，3 个测试

- [ ] **步骤 5：提交**

```bash
git add packages/core/src/tools/computer-use/client.ts packages/core/src/tools/computer-use/client.test.ts
git commit -m "feat(computer-use): MCP stdio client for upstream binary"
```

---

### 任务 5：ComputerUseTool —— 参数化的 BaseDeclarativeTool 包装器

**文件：**

- 创建：`packages/core/src/tools/computer-use/tool.ts`
- 创建：`packages/core/src/tools/computer-use/tool.test.ts`

对于此任务，该工具仅转发到 ComputerUseClient，假设它已经启动。引导状态机在第 3 阶段包装此逻辑。

- [ ] **步骤 1：编写失败的测试**

创建 `packages/core/src/tools/computer-use/tool.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComputerUseTool } from './tool.js';
import { ComputerUseClient } from './client.js';
import { COMPUTER_USE_SCHEMAS } from './schemas.js';

function makeFakeClient(
  callToolImpl: (name: string, args: unknown) => Promise<unknown>,
) {
  const fake = {
    isStarted: () => true,
    start: vi.fn(async () => {}),
    callTool: vi.fn(callToolImpl),
    stop: vi.fn(async () => {}),
  };
  return fake as unknown as ComputerUseClient;
}

describe('ComputerUseTool', () => {
  beforeEach(() => {
    ComputerUseClient.setSharedForTest(undefined);
  });

  it('暴露 qwen 面对的名称，带有 computer_use__ 前缀', () => {
    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    expect(tool.name).toBe('computer_use__click');
    expect(tool.displayName).toBe('computer_use__click');
  });

  it('标记自身为延迟加载', () => {
    const tool = new ComputerUseTool(
      'list_apps',
      COMPUTER_USE_SCHEMAS.list_apps,
    );
    expect(tool.shouldDefer).toBe(true);
    expect(tool.alwaysLoad).toBe(false);
  });

  it('将 execute() 转发到共享客户端，使用上游名称', async () => {
    const fake = makeFakeClient(async () => ({
      content: [{ type: 'text', text: '[]' }],
      isError: false,
    }));
    ComputerUseClient.setSharedForTest(fake);

    const tool = new ComputerUseTool(
      'list_apps',
      COMPUTER_USE_SCHEMAS.list_apps,
    );
    const invocation = tool.build({});
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(fake.callTool).toHaveBeenCalledWith('list_apps', {});
  });

  it('当客户端返回 isError=true 时返回错误结果', async () => {
    const fake = makeFakeClient(async () => ({
      content: [{ type: 'text', text: 'something went wrong' }],
      isError: true,
    }));
    ComputerUseClient.setSharedForTest(fake);

    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    const invocation = tool.build({ app: 'TextEdit' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(String(result.llmContent)).toContain('something went wrong');
  });
});
```

- [ ] **步骤 2：运行测试以验证失败**

运行：`npm test -- packages/core/src/tools/computer-use/tool.test.ts`
预期结果：失败 —— 找不到模块

- [ ] **步骤 3：实现工具**

创建 `packages/core/src/tools/computer-use/tool.ts`：

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from '../tools.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ComputerUseClient } from './client.js';
import type { ComputerUseToolName, ComputerUseToolSchema } from './schemas.js';
import { safeJsonStringify } from '../../utils/safeJsonStringify.js';
import { runBootstrap } from './bootstrap.js';

type ComputerUseParams = Record<string, unknown>;

class ComputerUseInvocation extends BaseToolInvocation<
  ComputerUseParams,
  ToolResult
> {
  constructor(
    private readonly upstreamName: ComputerUseToolName,
    params: ComputerUseParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return safeJsonStringify(this.params);
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const client = ComputerUseClient.shared();

    // 第 3 阶段在这里连接引导状态机。在此之前，此方法直接执行，
    // 如果二进制文件已经安装且权限已授予，则没问题。
    await runBootstrap(client, { signal, updateOutput });

    let mcpResult: CallToolResult;
    try {
      mcpResult = await client.callTool(this.upstreamName, this.params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Computer Use 工具 '${this.upstreamName}' 失败: ${message}`,
        returnDisplay: `错误: ${message}`,
        error: { message },
      };
    }

    const text = mcpResult.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n');

    if (mcpResult.isError) {
      return {
        llmContent: text || `工具 '${this.upstreamName}' 返回 isError=true`,
        returnDisplay: text || '错误',
        error: { message: text || '工具返回错误' },
      };
    }

    return {
      llmContent: text,
      returnDisplay: text,
    };
  }
}

export class ComputerUseTool extends BaseDeclarativeTool<
  ComputerUseParams,
  ToolResult
> {
  constructor(
    private readonly upstreamName: ComputerUseToolName,
    schema: ComputerUseToolSchema,
  ) {
    const qwenName = `computer_use__${upstreamName}`;
    super(
      qwenName,
      qwenName, // displayName == name；UI 中不显示 MCP 品牌
      schema.description,
      Kind.Other,
      schema.parameterSchema,
      true, // isOutputMarkdown —— 许多结果是类 JSON 文本或截图
      true, // canUpdateOutput —— 引导流式输出进度
      true, // shouldDefer —— 仅通过 ToolSearch 展示
      false, // alwaysLoad
      `computer use desktop click type screenshot mouse keyboard scroll drag automation gui app native`,
    );
  }

  protected createInvocation(
    params: ComputerUseParams,
  ): ToolInvocation<ComputerUseParams, ToolResult> {
    return new ComputerUseInvocation(this.upstreamName, params);
  }
}
```

注意：测试引用了 `runBootstrap`，它将在第 3 阶段实现。目前，创建一个存根 `bootstrap.ts` 以使测试通过：

创建 `packages/core/src/tools/computer-use/bootstrap.ts`：

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComputerUseClient } from './client.js';

export interface BootstrapContext {
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

/**
 * 存根：第 3 阶段将其替换为完整的状态机
 * （安装确认 → 安装 → 权限探测 → 引导 → 轮询）。
 * 目前：假设二进制文件已安装且权限已授予；
 * 仅在需要时启动客户端。
 */
export async function runBootstrap(
  client: ComputerUseClient,
  _ctx: BootstrapContext,
): Promise<void> {
  if (!client.isStarted()) {
    await client.start();
  }
}
```

- [ ] **步骤 4：运行测试以验证通过**

运行：`npm test -- packages/core/src/tools/computer-use/tool.test.ts`
预期结果：通过，4 个测试

- [ ] **步骤 5：提交**

```bash
git add packages/core/src/tools/computer-use/tool.ts packages/core/src/tools/computer-use/tool.test.ts packages/core/src/tools/computer-use/bootstrap.ts
git commit -m "feat(computer-use): ComputerUseTool wrapper + bootstrap stub"
```

---

### 任务 6：在 ToolRegistry 中注册工具

**文件：**

- 创建：`packages/core/src/tools/computer-use/index.ts`
- 修改：`packages/core/src/config/config.ts`

- [ ] **步骤 1：创建注册辅助函数**

创建 `packages/core/src/tools/computer-use/index.ts`：

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

export { ComputerUseTool } from './tool.js';
export { ComputerUseClient } from './client.js';
export type { ComputerUseToolName, ComputerUseToolSchema } from './schemas.js';
export { COMPUTER_USE_TOOL_NAMES, COMPUTER_USE_SCHEMAS } from './schemas.js';

import { ComputerUseTool } from './tool.js';
import { COMPUTER_USE_SCHEMAS, COMPUTER_USE_TOOL_NAMES } from './schemas.js';
import type { ToolRegistry } from '../tool-registry.js';

/**
 * 将所有 9 个 computer-use 工具作为惰性工厂注册到注册表中。
 * 每个工具都是延迟加载的（`shouldDefer=true`），因此它们仅通过
 * ToolSearch 关键字匹配展示。首次调用会触发引导状态机
 * （安装确认 → 安装 → 权限流程），然后转发到上游 MCP 服务器。
 *
 * 仅应在 `Config.isComputerUseEnabled()` 为 true 时调用。
 */
export function registerComputerUseTools(registry: ToolRegistry): void {
  for (const upstreamName of COMPUTER_USE_TOOL_NAMES) {
    const schema = COMPUTER_USE_SCHEMAS[upstreamName];
    const qwenName = `computer_use__${upstreamName}`;
    registry.registerFactory(
      qwenName,
      async () => new ComputerUseTool(upstreamName, schema),
    );
  }
}
```

- [ ] **步骤 2：在 Config.createToolRegistry 中集成**

编辑 `packages/core/src/config/config.ts`。找到有条件下注册 cron 工具的现有代码块（大约在第 3952 行）：

```ts
    if (this.isCronEnabled()) {
      await registerLazy(ToolNames.CRON_CREATE, async () => { ... });
      ...
    }
```

在 cron 代码块下面（在 monitor 代码块之前），添加：

```ts
// 除非禁用，否则注册 computer-use 工具。
// 所有 9 个都是延迟加载的 —— 它们仅通过 ToolSearch 关键字匹配
// 展示（参见 packages/core/src/tools/computer-use/）。
if (this.isComputerUseEnabled()) {
  const { registerComputerUseTools } = await import(
    '../tools/computer-use/index.js'
  );
  registerComputerUseTools(registry);
}
```

- [ ] **步骤 3：添加注册测试**

附加到现有的 tool-registry 测试中，或者创建 `packages/core/src/tools/computer-use/registration.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { registerComputerUseTools } from './index.js';
import { COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('registerComputerUseTools', () => {
  it('为 9 个上游工具中的每一个注册工厂，并添加 computer_use__ 前缀', () => {
    const registered = new Set<string>();
    const fakeRegistry = {
      registerFactory: vi.fn((name: string) => {
        registered.add(name);
      }),
    } as never;

    registerComputerUseTools(fakeRegistry);

    expect(registered.size).toBe(9);
    for (const name of COMPUTER_USE_TOOL_NAMES) {
      expect(registered.has(`computer_use__${name}`)).toBe(true);
    }
  });
});
```

- [ ] **步骤 4：运行测试 + 类型检查**

运行：

```bash
npm test -- packages/core/src/tools/computer-use/
npm run build -- --filter @qwen-code/qwen-code-core
```

预期结果：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/core/src/tools/computer-use/index.ts packages/core/src/tools/computer-use/registration.test.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): register 9 deferred tools when enabled"
```

---

### 任务 7：手动冒烟测试 —— 工具出现且正常路径调用有效

这是一个非编码关口。在构建引导 UX 之前验证基础是否正常工作。

- [ ] **步骤 1：预安装上游二进制文件（一次性，手动）**

在终端中运行：

```bash
npx -y open-computer-use@latest --version
```

在 macOS 上：还需运行 `npx -y open-computer-use@latest doctor` 并授予任何提示的权限。这样绕过我们的引导过程，以便我们可以独立验证传输层。

- [ ] **步骤 2：构建 qwen-code**

运行：`npm run build`
预期结果：通过。

- [ ] **步骤 3：启动 qwen-code 并测试发现**

启动 qwen-code，然后询问模型：“使用 ToolSearch 工具，查询 'click computer use'，查找任何可用的桌面自动化工具。”

预期结果：ToolSearch 返回 9 个 `computer_use__*` schema。

- [ ] **步骤 4：测试无权限工具**

询问：“使用 computer_use__list_apps 工具列出当前正在运行的桌面应用。”

预期结果：首次调用有几秒钟的“正在启动 Computer Use...”（如果 npx 缓存未预热则可能更长），然后返回正在运行的应用列表。同一会话中的后续调用会很快。

- [ ] **步骤 5：无需提交；这是一个冒烟测试关口**

如果此处有任何失败，请停止并在进入第 3 阶段之前进行调试。

---

## 第 3 阶段 —— 引导 UX（安装确认 + 权限指南）

此阶段将任务 5 中的 `runBootstrap` 存根替换为完整的状态机。

### 任务 8：安装状态持久化

**文件：**

- 创建：`packages/core/src/tools/computer-use/install-state.ts`
- 创建：`packages/core/src/tools/computer-use/install-state.test.ts`

持久化到 `~/.qwen/computer-use/installed.json`：

```json
{
  "approvedPackageSpec": "open-computer-use@^0.3.0",
  "approvedAtIso": "2026-05-28T10:00:00Z"
}
```

- [ ] **步骤 1：编写失败的测试**

创建 `packages/core/src/tools/computer-use/install-state.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadInstallState,
  saveInstallState,
  isPackageSpecApproved,
  installStatePathFor,
} from './install-state.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('install-state', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-test-'));
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('当状态文件不存在时返回 undefined', async () => {
    expect(await loadInstallState(tmpHome)).toBeUndefined();
  });

  it('状态可以往返读写', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    const loaded = await loadInstallState(tmpHome);
    expect(loaded).toEqual({
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
  });

  it('没有状态时 isPackageSpecApproved 返回 false', async () => {
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(false);
  });

  it('完全匹配时 isPackageSpecApproved 返回 true', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(true);
  });

  it('版本不同时 isPackageSpecApproved 返回 false', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.4.0'),
    ).toBe(false);
  });
});
```
- [ ] **步骤 2：运行测试以验证失败**

运行：`npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
预期：FAIL — 找不到模块

- [ ] **步骤 3：实现模块**

创建 `packages/core/src/tools/computer-use/install-state.ts`：

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export interface InstallState {
  /** 用户批准的包标识（例如 "open-computer-use@^0.3.0"）。 */
  approvedPackageSpec: string;
  /** ISO 8601 UTC 格式的批准时间戳。 */
  approvedAtIso: string;
}

/**
 * 安装状态文件的路径。导出以供测试，以便它们可以指向临时目录。
 */
export function installStatePathFor(home: string = homedir()): string {
  return join(home, '.qwen', 'computer-use', 'installed.json');
}

export async function loadInstallState(
  home: string = homedir(),
): Promise<InstallState | undefined> {
  try {
    const text = await readFile(installStatePathFor(home), 'utf8');
    const parsed = JSON.parse(text) as InstallState;
    // 最小化形状检查 — 旧版本或格式错误的文件视为"未批准"。
    if (typeof parsed?.approvedPackageSpec !== 'string') return undefined;
    if (typeof parsed?.approvedAtIso !== 'string') return undefined;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
    // 将不可读/格式错误的状态视为"未批准" — 重新提示是安全的；
    // 将损坏的文件视为已批准会静默安装。
    return undefined;
  }
}

export async function saveInstallState(
  home: string = homedir(),
  state: InstallState,
): Promise<void> {
  const path = installStatePathFor(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * 当且仅当持久化状态中的包标识与我们将要安装的包标识完全匹配时返回 true。
 * 不同的标识（版本号变更）需要重新批准，因为用户可能批准了较旧/较小/不同许可的版本。
 */
export async function isPackageSpecApproved(
  home: string = homedir(),
  packageSpec: string,
): Promise<boolean> {
  const state = await loadInstallState(home);
  return state?.approvedPackageSpec === packageSpec;
}
```

- [ ] **步骤 4：运行测试以验证通过**

运行：`npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
预期：PASS，5 个测试

- [ ] **步骤 5：提交**

```bash
git add packages/core/src/tools/computer-use/install-state.ts packages/core/src/tools/computer-use/install-state.test.ts
git commit -m "feat(computer-use): persist install approval state under ~/.qwen"
```

---

### 任务 9：权限错误检测器

**文件：**

- 创建：`packages/core/src/tools/computer-use/permission-detector.ts`
- 创建：`packages/core/src/tools/computer-use/permission-detector.test.ts`

- [ ] **步骤 1：编写失败测试**

创建 `packages/core/src/tools/computer-use/permission-detector.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { detectPermissionError } from './permission-detector.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

function textErrorResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

describe('detectPermissionError', () => {
  it('当 isError 为 false 时返回 "none"', () => {
    expect(
      detectPermissionError({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      }),
    ).toBe('none');
  });

  it('检测辅助功能权限缺失（上游表述）', () => {
    // 来自 AccessibilitySnapshot.swift:104
    const result = textErrorResult(
      'Accessibility permission is required. Run `open-computer-use doctor` and grant access to Open Computer Use.',
    );
    expect(detectPermissionError(result)).toBe('accessibility');
  });

  it('检测屏幕录制权限缺失', () => {
    const result = textErrorResult(
      'Screen Recording permission is required to capture this window.',
    );
    expect(detectPermissionError(result)).toBe('screenRecording');
  });

  it('通过通用 doctor 标记作为后备检测', () => {
    const result = textErrorResult(
      'Some unfamiliar error. Run `open-computer-use doctor` for help.',
    );
    expect(detectPermissionError(result)).toBe('unknown_permission');
  });

  it('对无关错误返回 "other"', () => {
    expect(
      detectPermissionError(textErrorResult('appNotFound("ImaginaryApp")')),
    ).toBe('other');
  });
});
```

- [ ] **步骤 2：运行测试以验证失败**

运行：`npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
预期：FAIL — 找不到模块

- [ ] **步骤 3：实现检测器**

创建 `packages/core/src/tools/computer-use/permission-detector.ts`：

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * 上游 MCP 结果指示的权限问题类型（如果有）。
 * 我们基于消息字符串进行分类，因为上游未通过 MCP 暴露类型化的错误码
 * （请参阅 open-codex-computer-use 仓库中的
 * `packages/OpenComputerUseKit/Sources/OpenComputerUseKit/Errors.swift`）。
 *
 * 长期解决方案是向上游 PR 添加类型化的 errorKind；目前此字符串检测是约定。
 */
export type PermissionErrorKind =
  | 'none' // 成功或非错误结果
  | 'other' // 错误，但不是权限问题
  | 'accessibility' // AX 缺失
  | 'screenRecording' // 屏幕录制缺失
  | 'unknown_permission'; // 匹配 doctor 标记但未明确具体权限

/**
 * 上游已知的错误模式。顺序很重要 — 更具体的模式优先。
 */
const PATTERNS: Array<{ kind: PermissionErrorKind; regex: RegExp }> = [
  { kind: 'accessibility', regex: /accessibility permission is required/i },
  { kind: 'screenRecording', regex: /screen recording permission/i },
  // 后备方案：任何提到 doctor 命令的错误都很可能是权限相关的。
  // 放在最后，以免抢占特定模式。
  { kind: 'unknown_permission', regex: /open-computer-use\s+doctor/i },
];

export function detectPermissionError(
  result: CallToolResult,
): PermissionErrorKind {
  if (!result.isError) return 'none';
  const text = result.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
  for (const { kind, regex } of PATTERNS) {
    if (regex.test(text)) return kind;
  }
  return 'other';
}
```

- [ ] **步骤 4：运行测试以验证通过**

运行：`npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
预期：PASS，5 个测试

- [ ] **步骤 5：提交**

```bash
git add packages/core/src/tools/computer-use/permission-detector.ts packages/core/src/tools/computer-use/permission-detector.test.ts
git commit -m "feat(computer-use): detect upstream permission errors"
```

---

### 任务 10：引导状态机 — 完整用户流程

**文件：**

- 修改：`packages/core/src/tools/computer-use/bootstrap.ts`（替换任务 5 中的存根）
- 创建：`packages/core/src/tools/computer-use/bootstrap.test.ts`

状态机包含三个子流程：

1. **首次安装**：如果 `isPackageSpecApproved` 为 false，则提示用户，安装，持久化批准。
2. **启动**：确保客户端已启动。
3. **权限探测 + 引导**（仅 macOS）：如果出现权限错误，启动 `open-computer-use doctor`，轮询权限授予最长 10 分钟，然后重试。

注意：在 qwen-code 中，实际"在执行业务过程中向用户提问"的机制使用现有的工具确认框架。**实施者**：在编写此任务的实现之前，请运行 `grep -rn "shouldConfirmExecute"` 在 `packages/core/src/tools/` 中，查看 `shell.ts` 等是如何进行确认的。此任务假设该机制可用；如果不可用，则使用 `process.stderr.write` + 从 `process.stdin` 读取来替代安装确认（可接受的 v0 UX）。

- [ ] **步骤 1：调查确认模式**

运行：

```bash
grep -rn "shouldConfirmExecute\|ToolConfirmation" packages/core/src/tools --include="*.ts" | grep -v ".test." | head -20
```

阅读至少一个使用确认模式的工具（很可能是 `shell.ts`）。决定：`ToolInvocation` 是否有 `shouldConfirmExecute()` 方法或类似方法？

如果是：用于安装确认。
如果否：使用 v0 后备方案（stderr + `ask_user_question` 工具（如果支持），否则抛出一个特定的错误代码，让模型在用户授权后重新发出）。

在 `bootstrap.ts` 顶部的代码注释中记录您的选择。

- [ ] **步骤 2：编写失败测试**

创建 `packages/core/src/tools/computer-use/bootstrap.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootstrap, type BootstrapDeps } from './bootstrap.js';

function makeFakeClient(opts: { startThrows?: Error } = {}) {
  const start = vi.fn(async () => {
    if (opts.startThrows) throw opts.startThrows;
  });
  return {
    isStarted: vi.fn(() => start.mock.calls.length > 0),
    start,
    callTool: vi.fn(),
    stop: vi.fn(),
  };
}

describe('runBootstrap', () => {
  let tmpHome: string;
  let deps: BootstrapDeps;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-bs-'));
    deps = {
      homeDir: tmpHome,
      packageSpec: 'open-computer-use@^0.3.0',
      platform: 'darwin',
      promptInstallApproval: vi.fn(async () => true),
      spawnDoctor: vi.fn(),
      probePermissions: vi.fn(async () => 'ok' as const),
    };
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('当二进制文件已批准且权限正常时启动客户端', async () => {
    // 预先注入安装状态以跳过提示
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(client.start).toHaveBeenCalledOnce();
    expect(deps.promptInstallApproval).not.toHaveBeenCalled();
  });

  it('首次调用时提示安装批准', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.promptInstallApproval).toHaveBeenCalledOnce();
    expect(client.start).toHaveBeenCalledOnce();
  });

  it('当用户拒绝安装时抛出', async () => {
    deps.promptInstallApproval = vi.fn(async () => false);
    const client = makeFakeClient();

    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/declined/i);
    expect(client.start).not.toHaveBeenCalled();
  });

  it('成功时持久化批准', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    const { loadInstallState } = await import('./install-state.js');
    const state = await loadInstallState(tmpHome);
    expect(state?.approvedPackageSpec).toBe('open-computer-use@^0.3.0');
  });

  it('当权限缺失时启动 doctor 并轮询', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    let probeCount = 0;
    deps.probePermissions = vi.fn(async () => {
      probeCount++;
      return probeCount < 3 ? 'accessibility' : 'ok';
    });
    deps.pollIntervalMs = 1; // 加速测试
    deps.pollTimeoutMs = 1000;

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).toHaveBeenCalledOnce();
    expect(probeCount).toBeGreaterThanOrEqual(3);
  });

  it('在 pollTimeoutMs 后权限仍未授予时抛出', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    deps.probePermissions = vi.fn(async () => 'accessibility' as const);
    deps.pollIntervalMs = 1;
    deps.pollTimeoutMs = 50;

    const client = makeFakeClient();
    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/timed out/i);
  });

  it('在非 darwin 平台跳过权限流程', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    deps.platform = 'linux';

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).not.toHaveBeenCalled();
  });
});
```

- [ ] **步骤 3：运行测试以验证失败**

运行：`npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
预期：FAIL — 许多错误

- [ ] **步骤 4：实现状态机**

将 `packages/core/src/tools/computer-use/bootstrap.ts` 替换为：

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Computer Use 引导状态机。
 *
 * 在任何 computer_use__* 工具的首次调用时：
 *   1. 如果尚未批准：提示用户安装（一次性）。
 *   2. 启动客户端（惰性 npx 启动，首次可能需要约 60 秒）。
 *   3. 仅在 macOS 上：通过调用 Finder 上的 get_app_state 探测权限。
 *      如果出现权限错误，则启动上游的 doctor（该操作会打开系统设置 + 入门窗口），
 *      然后轮询直到权限授权或 10 分钟超时。
 *
 * 实施者：任务 10 步骤 1 的预备步骤 — 验证 qwen-code 的 BaseDeclarativeTool
 * 是否在 `execute()` 内部暴露了 `shouldConfirmExecute()` 路径。如果没有，
 * `promptInstallApproval` 默认使用 `process.stderr.write` + readline 后备方案。
 * 这里的依赖注入设计使得无需修改状态机逻辑即可切换该决策。
 */

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import type { ComputerUseClient } from './client.js';
import { isPackageSpecApproved, saveInstallState } from './install-state.js';
import {
  detectPermissionError,
  type PermissionErrorKind,
} from './permission-detector.js';

export interface BootstrapContext {
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

/** 权限探测的结果。 */
export type PermissionProbeResult = 'ok' | PermissionErrorKind;

export interface BootstrapDeps {
  homeDir: string;
  packageSpec: string;
  platform: NodeJS.Platform;
  /**
   * 提示用户批准安装上游二进制文件。如果批准则返回 true。
   * 实现可以使用 qwen-code 确认工具路径或 stdin 后备方案。
   */
  promptInstallApproval: (packageSpec: string) => Promise<boolean>;
  /**
   * 启动 `open-computer-use doctor`（分离模式）。二进制文件会自行处理打开系统设置窗口。
   */
  spawnDoctor: () => void;
  /**
   * 通过发起轻量级工具调用来探测上游 MCP 服务器的权限状态。
   * 成功返回 'ok'，失败则返回权限错误类型。
   */
  probePermissions: (
    client: ComputerUseClient,
  ) => Promise<PermissionProbeResult>;
  /** 权限监视器的轮询间隔。默认 2000 毫秒。 */
  pollIntervalMs?: number;
  /** 总轮询超时时间。默认 10 分钟。 */
  pollTimeoutMs?: number;
}

/** 生产环境默认值 — 惰性实例化，以便测试可以在每次调用时覆盖。 */
function defaultDeps(): BootstrapDeps {
  return {
    homeDir: homedir(),
    packageSpec:
      process.env['QWEN_COMPUTER_USE_PACKAGE'] ?? 'open-computer-use@latest',
    platform: process.platform,
    promptInstallApproval: async (spec) => {
      // v0 后备方案：stderr 提示 + stdin 读取。当集成到 qwen-code 的标准确认路径后替换之。
      process.stderr.write(
        `\n[Computer Use] 首次安装\n` +
          `  包：${spec}\n` +
          `  这将首次从 npm 注册表获取约 50MB 数据。\n` +
          `  Computer Use 可以点击、键入和读取您的桌面应用。\n` +
          `  在 macOS 上，接下来将引导您完成辅助功能和屏幕录制权限。\n` +
          `是否继续？[y/N] `,
      );
      // 实施者：在真实交互会话中，替换为 qwen-code 确认系统。
      // 对于无头 / SDK 上下文，默认拒绝 — 需要用户明确选择加入。
      return process.env['QWEN_COMPUTER_USE_AUTO_APPROVE'] === '1';
    },
    spawnDoctor: () => {
      const child = spawn('npx', ['-y', defaultDeps().packageSpec, 'doctor'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    },
    probePermissions: async (client) => {
      // 使用 Finder 作为已知正在运行、始终安装的 macOS 应用。
      // get_app_state 会触及 AccessibilitySnapshot，这是第一个抛出 permissionDenied 的路径。
      const result = await client.callTool('get_app_state', { app: 'Finder' });
      return detectPermissionError(result) === 'none'
        ? 'ok'
        : detectPermissionError(result);
    },
  };
}

export async function runBootstrap(
  client: ComputerUseClient,
  ctx: BootstrapContext,
  depsOverride?: Partial<BootstrapDeps>,
): Promise<void> {
  const deps: BootstrapDeps = { ...defaultDeps(), ...depsOverride };
  const pollIntervalMs = deps.pollIntervalMs ?? 2000;
  const pollTimeoutMs = deps.pollTimeoutMs ?? 10 * 60_000;

  // 步骤 1：安装批准关卡。
  const approved = await isPackageSpecApproved(deps.homeDir, deps.packageSpec);
  if (!approved) {
    ctx.updateOutput?.('Computer Use 需要安装（首次使用）。');
    const ok = await deps.promptInstallApproval(deps.packageSpec);
    if (!ok) {
      throw new Error(
        `Computer Use 安装被用户拒绝。重新调用该工具以再次收到提示。`,
      );
    }
    await saveInstallState(deps.homeDir, {
      approvedPackageSpec: deps.packageSpec,
      approvedAtIso: new Date().toISOString(),
    });
  }

  // 步骤 2：启动（幂等）。
  if (!client.isStarted()) {
    ctx.updateOutput?.('正在启动 Computer Use...');
    await client.start();
  }

  // 步骤 3：macOS 权限探测 + 引导。
  if (deps.platform !== 'darwin') return;

  const probe = await deps.probePermissions(client);
  if (probe === 'ok' || probe === 'other') {
    // 'other' 表示发生了与权限无关的错误。
    // 我们不因此阻止引导 — 让实际的工具调用发现它。
    return;
  }

  ctx.updateOutput?.(
    `Computer Use 需要 macOS 权限（${probe}）。` +
      `将打开一个入门窗口 — 请授予辅助功能和屏幕录制权限，然后此过程将自动继续。`,
  );
  deps.spawnDoctor();

  const startedAt = Date.now();
  for (;;) {
    if (ctx.signal.aborted) {
      throw new Error('Computer Use 引导被中止。');
    }
    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new Error(
        `Computer Use 权限授权超时（${Math.round(pollTimeoutMs / 1000)} 秒）。重新调用工具以重试。`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const next = await deps.probePermissions(client);
    if (next === 'ok' || next === 'other') return;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    ctx.updateOutput?.(`正在等待权限...（${elapsedSec} 秒）`);
  }
}
```
- [ ] **步骤 5：运行测试以验证通过**

运行：`npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
预期结果：通过，7 个测试

- [ ] **步骤 6：提交**

```bash
git add packages/core/src/tools/computer-use/bootstrap.ts packages/core/src/tools/computer-use/bootstrap.test.ts
git commit -m "feat(computer-use): bootstrap state machine (install + permissions)"
```

---

### 任务 11：将真实的 `promptInstallApproval` 接入 qwen-code 的确认系统

**文件：**

- 修改：`packages/core/src/tools/computer-use/bootstrap.ts`
- 可能：`packages/core/src/tools/computer-use/tool.ts`

这是范围最不固定的任务。**实现者**：阅读任务 10 步骤 1 的调查结果，并据此接入。两种场景：

**场景 A** — `BaseToolInvocation` 支持 `shouldConfirmExecute()`：

- 在 `ComputerUseInvocation` 中重写 `shouldConfirmExecute()`，使其在包尚未被批准时返回安装确认 payload。
- 框架将显示确认 UI；批准后，`execute()` 继续执行。
- `bootstrap.ts` 此后只处理确认后的路径（写入状态、启动、权限探测）。

**场景 B** — 没有执行中的确认通路：

- 保留任务 10 中的 v0 stderr+stdin 实现。在 README 和 SKILL.md 中明确记录。
- 提交一个后续任务，以添加适当的确认通路（单独 PR）。

- [ ] **步骤 1：实现所选场景**

（具体代码取决于调查结果；细节由实现者决定。）

- [ ] **步骤 2：手动冒烟测试**

清除安装状态：

```bash
rm -rf ~/.qwen/computer-use
```

启动 qwen-code 并提出一个 computer-use 问题。确认安装提示出现在所选 UX（确认对话框或 stderr）中，并且批准后能正确持久化状态。

- [ ] **步骤 3：提交**

```bash
git add -A
git commit -m "feat(computer-use): wire install approval to qwen-code confirm UX"
```

---

### 任务 12：手动冒烟测试——端到端首次使用流程

此任务为无编码的门禁检查。

- [ ] **步骤 1：清除缓存**

```bash
rm -rf ~/.qwen/computer-use
rm -rf ~/.npm/_npx
# macOS：撤销权限
# 系统设置 → 隐私与安全性 → 辅助功能/屏幕录制
# 移除 "Open Computer Use.app"
```

- [ ] **步骤 2：构建 + 运行**

```bash
npm run build
# 启动 qwen-code，提出一个 computer-use 问题
```

- [ ] **步骤 3：验证完整流程**

预期顺序：

1. 安装提示出现。
2. 批准后，通过 `updateOutput` 流式输出下载进度。
3. 权限警告出现，医生窗口打开。
4. 在系统设置中授予权限后，工具调用自动恢复。
5. 返回结果。

如果任何步骤失败，记录错误并停止。迭代修复。

- [ ] **步骤 4：无需提交；此为门禁检查**

---

## 阶段 4——工具/维护

### 任务 13：Schema 同步脚本

**文件：**

- 创建：`scripts/sync-computer-use-schemas.ts`

作为 qwen-code 发布准备的一部分运行。执行 `npx -y open-computer-use@<pin> mcp`，发送 `tools/list`，重新生成 `schemas.ts`。

- [ ] **步骤 1：创建脚本**

创建 `scripts/sync-computer-use-schemas.ts`：

```ts
#!/usr/bin/env tsx
/**
 * 从线上 open-computer-use MCP 服务器重新生成
 * packages/core/src/tools/computer-use/schemas.ts。
 *
 * 用法：
 *   npx tsx scripts/sync-computer-use-schemas.ts [packageSpec]
 *
 * packageSpec 默认为 `open-computer-use@latest`。生成文件中写入的
 * pin 版本即为所使用的 spec——对于发布构建，请传入显式的 pin
 * （例如 `open-computer-use@0.3.5`）。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const packageSpec = process.argv[2] ?? 'open-computer-use@latest';

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', packageSpec, 'mcp'],
  });
  const client = new Client(
    { name: 'qwen-code-schema-sync', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);

  const result = await client.listTools();
  await client.close();

  if (result.tools.length !== 9) {
    process.stderr.write(
      `警告：上游返回了 ${result.tools.length} 个工具，预期 9 个。继续执行。\n`,
    );
  }

  const schemas: Record<
    string,
    { description: string; parameterSchema: unknown }
  > = {};
  for (const tool of result.tools) {
    schemas[tool.name] = {
      description: tool.description ?? '',
      parameterSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    };
  }

  const out = `/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 上游 open-computer-use 工具的硬编码 schema。
 *
 * 固定上游版本：${packageSpec}
 * 由 scripts/sync-computer-use-schemas.ts 重新生成——请勿手动编辑。
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = ${JSON.stringify(
    result.tools.map((t) => t.name),
    null,
    2,
  )} as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<ComputerUseToolName, ComputerUseToolSchema> = ${JSON.stringify(
    schemas,
    null,
    2,
  )};
`;

  const target = resolve('packages/core/src/tools/computer-use/schemas.ts');
  await writeFile(target, out, 'utf8');
  process.stdout.write(`已将 ${result.tools.length} 个 schema 写入 ${target}\n`);
}

main().catch((err) => {
  process.stderr.write(`Schema 同步失败：${err}\n`);
  process.exit(1);
});
```

- [ ] **步骤 2：手动运行一次以验证**

```bash
npx tsx scripts/sync-computer-use-schemas.ts open-computer-use@latest
```

预期结果：`schemas.ts` 被重写；`npm test -- packages/core/src/tools/computer-use/schemas.test.ts` 仍然通过（或仅在断定了特定手写内容的测试上失败——如果上游描述发生了变化，请调整这些测试）。

- [ ] **步骤 3：提交**

```bash
git add scripts/sync-computer-use-schemas.ts packages/core/src/tools/computer-use/schemas.ts
git commit -m "chore(computer-use): script to sync schemas from upstream"
```

---

## 自审清单（撰写所有任务后）

- [ ] 每个步骤都包含：一个代码块、一条精确命令，或一条带有明确可委派的 IMPLEMENTER 注释及理由。
- [ ] 所有 9 个工具名称在 schema、工具包装器和注册中一致使用 `computer_use__` 前缀。
- [ ] 用户可见字符串中没有泄漏 MCP / mcp__ / DiscoveredMCPTool 的引用。
- [ ] 引导状态机具有明确的超时（无无限轮询）。
- [ ] `enableComputerUse` 默认根据用户决定为 `true`。
- [ ] 测试覆盖：Schema 完整性、名称前缀、委派、客户端生命周期、安装状态持久化、权限检测、所有引导状态转换。
- [ ] 手动冒烟门禁检查（任务 7、任务 12）是显式的——没有隐含的“它工作正常”声明。

---

## 范围外（推迟到后续 PR）

- MCP 服务器进程的空闲超时（资源节省；v0 保持其存活直到 qwen-code 退出）。
- 引导失败的遥测（网络失败 vs Gatekeeper vs 权限超时分析）。
- 离线安装路径 / 缓存 tarball 支持。
- 在展示前进行能力探测（目前失败会在首次调用时暴露）。
- 为 permissionDenied 添加上游 PR 以支持类型化 errorKind（用户推迟）。
- 授予权限后重启 MCP 服务器（用户希望通过实际测试来决定是否需要）。
- 每个工具的细粒度权限门禁（例如，允许只读的 `list_apps` / `get_app_state`，无需确认每次调用）。

---

## 执行交接

计划已保存至 `docs/superpowers/plans/2026-05-28-computer-use-built-in.md`。

两种执行选项：

1. **子代理驱动（推荐）**——为每个任务分派新的子代理，任务间进行两阶段审查，快速迭代。
2. **内联执行**——在本次会话中执行任务，设置检查点以供审查。

采用哪种方式？
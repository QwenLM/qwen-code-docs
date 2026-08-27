# 工作区文件系统边界

## 概述

守护进程绝不允许 HTTP 路由或 ACP 侧的 Agent 调用直接触及宿主机文件系统。每次读取、写入、列出、glob 和 stat 操作都通过 `WorkspaceFileSystem` 边界（`packages/cli/src/serve/fs/`）进行，该边界提供以下能力：

- **路径解析** — 规范化路径，拒绝任何逃逸出绑定工作区的路径（包括通过符号链接逃逸）。
- **信任门控** — 当工作区不被信任时拒绝写入（`untrusted_workspace`）。
- **大小与内容策略** — 完整快照/输出上限（`MAX_READ_BYTES = 256 KiB`），大文本窗口在输出和扫描成本上均有限制（`MAX_TEXT_SCAN_BYTES = 8 MiB`），写入上限（`MAX_WRITE_BYTES = 5 MiB`），二进制文件检测。
- **原子性** — 先写入再重命名，保留目标文件权限模式；新文件默认权限为 `0o600`，或在工厂的 `system` 新文件权限模式策略（`QWEN_SERVE_NEW_FILE_MODE`）下跟随进程 umask。
- **审计** — 每次访问/拒绝都会发出结构化事件，供 `PermissionAuditRing` / 监控使用。
- **类型化错误** — 封闭的 `FsErrorKind` 联合类型，映射到 HTTP 状态码。

HTTP 文件路由（`GET /file`、`GET /file/bytes`、`POST /file/write`、`POST /file/edit`、`GET /list`、`GET /glob`、`GET /stat`）使用此边界，且不会接收同主机例外。在生产环境的 daemon 中，仍被委托的 ACP 调用通过注入的 bridge 适配器到达 WFS；通用的 bridge 调用者仅在注入此类适配器时才使用 WFS。生产环境的同主机 `qwen serve` runtime 会广播 `readTextFile: false`，因此所有子进程的 `FileSystemService.readTextFile` 消费者使用常规 CLI 文件系统服务。最终的 ACP `writeTextFile` 内容写入仍被委托：workspace 目标使用 WFS，而严格的内置工具标记可能仅在守护进程创建的同主机适配器上为外部路径选择等效的宿主写入器。参见[外部写入设计](../../design/daemon-external-tool-text-writes.md)。

该文本读取能力切片覆盖了直接的 `read_file` 以及 write、edit、notebook、sed 和 artifact 操作使用的共享预读取：

- 它有意接受常规 CLI 读取行为而非 WFS 读取侧的保证。[设计文档](../../design/daemon-local-text-reads.md)记录了放弃的具体内容。
- 同一文档记录了保留的适配器读取路径"fail closed"的有界含义；独立的外部写入设计记录了已批准的最终写入失败是如何 fail closed 的。
- 直接的外部 `read_file` 保留正常的 CLI 权限规则和核心文件操作遥测。
- HTTP 文件系统路由仍为 workspace 作用域，agent 发现工具的行为不受此能力影响。
- 父目录创建和任意 shell 命令等辅助操作是独立的现有路径，不在此边界覆盖范围内。
- `qwen serve` 假设同机器、同 UID 的安全主体，不是操作系统沙箱。

## 职责

- 将用户提供的路径解析为具有品牌标记的 `ResolvedPath` 值，边界内的其余部分可以安全地使用这些值。
- 拒绝超出绑定工作区的路径（`path_outside_workspace`），以及目标为符号链接的路径（`symlink_escape`）。
- 拒绝超过 `MAX_READ_BYTES` 的完整快照读取，同时允许显式窗口（输出上限为 `MAX_READ_BYTES`，扫描成本上限为 `MAX_TEXT_SCAN_BYTES`）；拒绝超过 `MAX_WRITE_BYTES` 的写入以及二进制文件（`binary_file`）。
- 当工作区不被信任时，拒绝写入/编辑（`untrusted_workspace`）— 通过 `assertTrustedForIntent(trusted, intent)` 门控。
- 通过 `shouldIgnore` 遵循 `.gitignore` / `.qwenignore` 模式。
- 执行原子性的写入-重命名操作，并保留目标文件权限模式；新文件默认权限为 `0o600`（在 `system` 新文件权限模式策略下为 umask 推导的 `0o666 & ~umask`）。
- 每次操作均发出 `fs.access` / `fs.denied` 审计事件。
- 将每次失败映射为带有 kind 和 HTTP 状态码的 `FsError`；路由处理器统一序列化它们。

## 架构

### 模块布局

| 文件                       | 用途                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paths.ts`               | `canonicalizeWorkspace`、`resolveWithinWorkspace`、`hasSuspiciousPathPattern`、品牌标记 `ResolvedPath`、`Intent` 联合类型（`read \| write \| list \| stat \| glob`）。                                                                 |
| `policy.ts`              | `MAX_READ_BYTES`、`MAX_TEXT_SCAN_BYTES`、`MAX_WRITE_BYTES`、`MAX_UPLOAD_BYTES`、`BINARY_PROBE_BYTES`、`assertTrustedForIntent`、`detectBinary`、`enforceReadBytesSize`、`enforceReadSize`、`enforceWriteSize`、`shouldIgnore`。                          |
| `audit.ts`               | `FS_ACCESS_EVENT_TYPE`、`FS_DENIED_EVENT_TYPE`、`createAuditPublisher`、审计载荷类型。                                                                                                                                         |
| `errors.ts`              | `FsError` 类、`isFsError`、`FsErrorKind` 联合类型（14 种）、`FsErrorStatus` 联合类型（`400 / 403 / 404 / 409 / 413 / 422 / 500 / 503`）。                                                                                          |
| `workspace-file-system.ts` | `createWorkspaceFileSystemFactory`、`WorkspaceFileSystem`（编排器，执行读/写/列出操作）、`WriteMode`、`ContentHash`、`FsEntry`、`FsStat`、`ListOptions`、`GlobOptions`、`ReadTextOptions`、`ReadBytesOptions`、`WriteTextAtomicOptions`。 |

### `FsErrorKind` 分类

| Kind                     | 默认 HTTP | 含义                                                                                                                                                                                       |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `path_outside_workspace` | 400       | 解析后的路径位于绑定工作区之外。                                                                                                                                                           |
| `symlink_escape`         | 400       | 目标是符号链接（根据保守的 PR 18 + PR 20 的立场拒绝）。                                                                                                                                 |
| `path_not_found`         | 404       | `ENOENT`。                                                                                                                                                                                |
| `binary_file`            | 422       | 在文本路径上内容被嗅探为二进制，或文本路径无法解码的编码中的大文本。                                                                                                                               |
| `file_too_large`         | 413       | 超过 `MAX_READ_BYTES` 的无窗口/完整快照文本，超过 `MAX_TEXT_SCAN_BYTES` 的行偏移，或超过 `MAX_WRITE_BYTES` 的写入。                                                                                  |
| `hash_mismatch`          | 409       | 乐观并发检查 `expectedSha256` 失败，或文件在稳定读取期间发生了变化。                                                                                                                            |
| `file_already_exists`    | 409       | `mode: 'create'` 但文件已存在。                                                                                                                                                          |
| `text_not_found`         | 422       | `POST /file/edit` 的搜索字符串未在文件中找到。                                                                                                                                               |
| `ambiguous_text_match`   | 422       | 需要恰好一个匹配时找到了多个匹配。                                                                                                                                                         |
| `untrusted_workspace`    | 403       | 在不被信任的工作区中尝试写入。                                                                                                                                                           |
| `permission_denied`      | 403       | 操作系统级别的 `EACCES` / `EPERM`。                                                                                                                                                        |
| `io_error`               | 503       | `ENOSPC` / `EIO` / `EBUSY` / `ETXTBSY` / `ENAMETOOLONG` / `EMFILE` / `ENFILE`。**与 `permission_denied` 区分开**，这样监控流水线不会因为“磁盘已满”而去通知安全响应人员。                          |
| `internal_error`         | 500       | 到达边界的非 errno 错误（`TypeError`、编程错误）。                                                                                                                                          |
| `parse_error`            | 400 / 422 | 请求体解析错误（400）或服务级不变量违反（422）。                                                                                                                                           |

### `BridgeFileSystem`（ACP 侧适配器）

`packages/acp-bridge/src/bridgeFileSystem.ts` 定义了：

```ts
interface BridgeFileSystem {
  readText(params: ReadTextFileRequest): Promise<ReadTextFileResponse>;
  writeText(params: WriteTextFileRequest): Promise<WriteTextFileResponse>;
}
```

这是 ACP `readTextFile` / `writeTextFile` 的注入点。Bridge 测试和 Mode A 嵌入式调用者可以在 `BridgeOptions` 上省略它；`BridgeClient` 会回退到其内联的 `fs.readFile` / `fs.writeFile` 代理（保留 F1 之前的行为）。生产环境的 `qwen serve` 通过 `createBridgeFileSystemAdapter(fsFactory)`（`packages/cli/src/serve/bridge-file-system-adapter.ts`）连接 `BridgeFileSystem`，并设置 `delegateReadTextFileToClient: false`。符合能力声明的子进程因此在本地读取文本并委托最终的 ACP 文本写入。适配器保留了其读取实现，因此意外的或违反能力声明的委托读取仍会遇到 WFS 的 workspace 边界。其外部宿主写入器路径默认禁用，仅在守护进程拥有的同主机适配器上通过精确的版本化来源进行选择；注入的 bridge、workspace 注册表和工厂、通用 ACP 以及 HTTP 保留普通边界。

适配器必须保留以下两个防御属性（因为当适配器被注入时，内联代理会完全绕过）：

1. **拒绝非普通文件** — 套接字/管道/字符设备/procfs/sysfs 条目尽管 `stats.size === 0` 也能流式传输无界数据。内联路径会抛出异常，消息中包含 `describeStatKind(stats)`。
2. **避免无界的全文件缓冲。** 内联回退将缓冲读取上限设为 `READ_FILE_SIZE_CAP = 100 MiB`。注入的适配器则应用更严格的 WorkspaceFileSystem 契约：完整快照在 256 KiB 处停止，而较大的 UTF-8 文件需要有限的 `limit`，并从 inode 绑定的句柄流式传输，最多返回 256 KiB。它不能为了返回 `{ line: 1, limit: 10 }` 而读取整个 500 MB 的日志。

适配器更进一步：它对 workspace 写入使用 `WorkspaceFileSystem.writeTextOverwrite`（PR 18 原语），对严格标记的外部内置工具写入使用工厂拥有的等效实现。两者都使用原子性的临时文件与重命名写入，保留权限模式，默认 `0o600`，并在共享的规范路径锁内拒绝符号链接。这与 **F1 之前的内联代理有所不同**，后者会解析符号链接并写入其目标——依赖通过符号链接点文件写入的 Agent 现在必须直接处理已解析的路径。

### 通过 ACP 线缆保留 `FsError`

当 `BridgeFileSystem` 适配器抛出 `FsError`（`kind: 'untrusted_workspace'` / `'symlink_escape'` / `'file_too_large'` 等）时，ACP SDK 的默认 RPC 错误路径仅将 `error.message` 序列化为通用的 `-32603 "Internal error"` — `kind` / `status` / `hint` 被剥离。下游 Agent RPC 客户端因此不得不通过正则匹配人类可读的消息来分派类型化 UI（鉴权重试 vs 文件选择器 vs 代理提示）。

`BridgeClient.writeTextFile` 和 `BridgeClient.readTextFile` 安装了一个薄防护层（`packages/acp-bridge/src/bridgeClient.ts`），捕获具有 FsError 形状的抛出并将其重新抛出为 ACP `RequestError`：

```ts
function isFsErrorShape(err: unknown): err is FsErrorShape {
  return (
    err instanceof Error &&
    err.name === 'FsError' &&
    typeof (err as { kind?: unknown }).kind === 'string'
  );
}

function preserveFsErrorOverAcp(err: unknown): never {
  if (isFsErrorShape(err)) {
    throw new RequestError(-32603, err.message, {
      errorKind: err.kind,
      ...(err.hint !== undefined ? { hint: err.hint } : {}),
      ...(err.status !== undefined ? { status: err.status } : {}),
    });
  }
  throw err;
}
```

Agent 的 RPC 客户端现在会收到 `data.errorKind`（封闭的 `FsErrorKind` 值）以及可选的 `data.hint` 和 `data.status`，因此 SDK 使用者可以基于类型化的枚举进行分支，而不是通过正则匹配消息。

两个设计要点：

- **鸭子类型而非导入** — `FsError` 位于 `packages/cli/src/serve/fs/errors.ts`，而 `BridgeClient` 位于 `packages/acp-bridge`。直接 `import { FsError }` 会反转依赖关系。鸭子检查（`name === 'FsError'` + `kind: string`）与 `mapDomainErrorToErrorKind`（`status.ts`）对 `TrustGateError` / `SkillError` 的处理方式相同，出于同样的跨包打包原因。
- **JSON-RPC 代码保持为 -32603** — Bridge 无法可靠地将 `FsError.kind` 映射为 JSON-RPC 错误代码形状，因此结构化的 `data` 字段携带语义信息供 SDK 使用者使用。线缆上的状态码（`-32603` "internal error"）不变；客户端根据 `data.errorKind` 进行路由。

### 信任门控

`assertTrustedForIntent(trusted, intent)` 消费由调用者注入的信任布尔值；策略层不直接读取 `Config.isTrustedFolder()`。读取/列出/stat/glob 始终被允许（信任仅针对写入）。在不被信任的工作区中进行写入意图会抛出 `FsError('untrusted_workspace', ..., status: 403)`。信任信号通过 `WorkspaceFileSystemFactoryDeps.trusted: boolean` 传入 — `runQwenServe` 传递 `true` 因为操作者启动守护进程时针对的工作区是隐式信任的；`createServeApp`（直接嵌入而不使用 `runQwenServe`）默认值为 `false` 并且每个进程警告一次（参见 [`02-serve-runtime.md`](./02-serve-runtime.md)）。

## 工作流

### 读取

```mermaid
sequenceDiagram
    autonumber
    participant R as HTTP 路由 或 BridgeFileSystem.readText
    participant FS as WorkspaceFileSystem
    participant POL as policy.ts
    participant FSP as node:fs

    R->>FS: readText(ctx, path, opts)
    FS->>FS: resolveWithinWorkspace(path) → ResolvedPath 或抛出异常
    FS->>FSP: stat(path)
    FSP-->>FS: stats
    FS->>FS: 如果不是普通文件则拒绝 (describeStatKind)
    alt 提供了 cursor
        FS->>FSP: 打开稳定的 FileHandle
        FS->>FS: 验证 cursor {dev,ino,size}；寻址到字节偏移
        FS->>FS: 返回完整行；发出下一个 cursor
    else 文件 <= 256 KiB
        FS->>FSP: 打开 + 读取稳定的完整快照
        FSP-->>FS: buffer
        FS->>FS: 对完整快照计算哈希；应用行/输出限制
    else 文件 > 256 KiB 且有显式窗口参数
        FS->>FSP: 打开稳定的 FileHandle
        FS->>FS: 从同一 inode 流式传输请求的行
        FS->>FS: 输出上限 256 KiB，扫描上限 8 MiB；省略全文件哈希
    else 无窗口的大文件读取
        FS-->>R: file_too_large
    end
    FS->>POL: detectBinary(sample)
    POL-->>FS: isBinary?
    FS->>FS: 如果是二进制则拒绝
    FS->>FS: shouldIgnore? → 注释 meta.matchedIgnore
    FS->>FS: 审计 fs.access
    FS-->>R: { content, 可选 sha256, truncated?, meta }
```

`readText` 不会因为忽略规则而跳过或拒绝读取。它会正常读取文件，并在 `meta.matchedIgnore` 中记录匹配的忽略分类。`list` 和 `glob` 只有在未启用 `includeIgnored` 时才会过滤被忽略的结果。

### 写入

```mermaid
sequenceDiagram
    autonumber
    participant R as POST /file/write 或 ACP writeText
    participant FS as WorkspaceFileSystem
    participant POL as policy.ts
    participant FSP as node:fs

    R->>FS: writeTextAtomic(ctx, path, content, opts)
    FS->>FS: assertTrustedForIntent(trusted, 'write') → 抛出 untrusted_workspace 或 ok
    FS->>FS: resolveWithinWorkspace(path)
    FS->>POL: enforceWriteSize(content) → 抛出 file_too_large 或 ok
    FS->>FSP: lstat(path) → 拒绝符号链接
    FS->>FS: 获取每个路径的锁
    FS->>FSP: stat(existing?) → 捕获目标权限模式 (默认 0o600)
    FS->>FSP: writeFile(tmpPath, content, {mode})
    FS->>FSP: rename(tmpPath, path) (原子操作)
    FS->>FS: 审计 fs.access (write)
    FS-->>R: { sha256, mode, bytesWritten }
```

先写入再重命名的原子操作保证了中途发生 SIGKILL / OOM 时**不会**导致目标文件被截断。`mode: 'create'` 在 lstat 时如果文件已存在则中止并抛出 `file_already_exists`；`mode: 'overwrite'` 继续执行；`expectedSha256` 启用了乐观并发检查（不匹配则抛出 `hash_mismatch`）。

### `POST /file/edit`（单一文本替换）

在写入的基础上增加了两个失败模式：

- `text_not_found` (422) — 搜索字符串不在文件中。
- `ambiguous_text_match` (422) — 需要恰好一个匹配时找到了多个匹配（路由的约定）。

### 审计扇出

```mermaid
flowchart LR
    A["WorkspaceFileSystem 操作成功 或 失败"] --> P["createAuditPublisher → 发出 FS_ACCESS_EVENT_TYPE / FS_DENIED_EVENT_TYPE"]
    P --> AR["PermissionAuditRing (512 条目, FIFO)"]
    P --> MON["未来: 外部监控接收端"]
```

`FS_ACCESS_EVENT_TYPE` / `FS_DENIED_EVENT_TYPE` 携带上下文（`ctx`）、路径、意图、结果、errorKind?、读取/写入的字节数、sha256?。

## 状态与生命周期

- 工厂在守护进程启动时构建一次（`runQwenServe` → `resolveBridgeFsFactory` → 适配器）。
- 每个请求构造一个 `RequestContext` 并仅为该次调用调用工厂的编排器 — 没有长期存在的每个文件状态。
- 每个路径的锁仅持续写入操作期间（没有跨调用的锁定；对同一路径的并发写入会在锁上竞争并顺序执行）。
- 审计环由 `runQwenServe` 拥有，并与权限审计发布者共享。

## 依赖项

- `@qwen-code/qwen-code-core` — `Ignore`、`isBinaryFile`、`Config.isTrustedFolder()`。
- `node:fs`、`node:path`、`node:crypto`。
- `@qwen-code/acp-bridge` — ACP 侧的 `BridgeFileSystem` 合同。
- HTTP 路由：`packages/cli/src/serve/routes/workspace-file-read.ts`、`workspace-file-write.ts`。

## 配置

| 来源                                              | 旋钮                                                                  | 效果                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `WorkspaceFileSystemFactoryDeps.trusted: boolean` | 构造函数输入                                                          | 是否允许写入；`runQwenServe` 下默认为 `true`，`createServeApp` 下默认为 `false`（带警告）。                     |
| 常量                                              | `MAX_READ_BYTES = 256 KiB`                                            | 完整快照和返回文本的上限；更大的文本需要显式窗口参数。                                                             |
| 常量                                              | `MAX_TEXT_SCAN_BYTES = 8 MiB`                                         | 大文本读取为定位行偏移可扫描的字节数；超过则返回 `file_too_large`。                                                |
| 常量                                              | `MAX_WRITE_BYTES = 5 MiB`                                             | 写入上限；大小低于 `express.json({ limit: '10mb' })`。                                                           |
| 常量                                              | `MAX_UPLOAD_BYTES = 50 MiB`                                           | `POST /file/upload` 的二进制上传上限；上传不会覆盖，自动为已占用的名称编号。                                        |
| 常量                                              | `BINARY_PROBE_BYTES = 4096`                                           | 基于内容的二进制检测采样大小。                                                                                 |
| 能力标签                                          | `workspace_file_read`、`workspace_file_bytes`、`workspace_file_write`、`workspace_file_upload` | 参见 [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)。                                       |
| 工作区文件                                        | `.gitignore`、`.qwenignore`                                           | 被忽略的路径从 `shouldIgnore` 中返回 `ignored: true`。                                                          |

## 注意事项与已知限制

- **符号链接被拒绝，而非跟随。** 这与 F1 之前的内联 `BridgeClient.writeTextFile` 代理有所不同，后者会解析符号链接。通过符号链接点文件写入的 Agent 需要直接处理已解析的路径。
- **`io_error` 与 `permission_denied` 是分开的。** 不要混为一谈。监控流水线依靠 `errorKind` 进行告警 — 将 ENOSPC 归入 permission_denied 会因 `df -h` 问题而通知安全响应人员。
- **新文件权限默认为 `0o600`，而非 umask 默认值。** 写入系统调用的 `mode` 参数会绕过 umask。Agent 无法传递每次写入的权限覆盖。希望 Agent 创建的文件跟随守护进程 umask 的操作者可以通过 `QWEN_SERVE_NEW_FILE_MODE=system` 按守护进程启用（现有文件仍保留其权限模式）；参见 [`17-configuration.md`](./17-configuration.md)。
- **`createServeApp` 默认 `trusted: false`** 对于没有注入自定义 `fsFactory` 或 `bridge` 的嵌入器，会静默拒绝 ACP 写入并返回 `untrusted_workspace`。第一次使用时会在 stderr 发出一次性警告；后续调用者看不到提醒。参见 [`02-serve-runtime.md`](./02-serve-runtime.md)。
- **大文本需要显式窗口参数**，可以是 `line` / `limit` / `maxBytes` 中的任意一个。如果都不提供，读取将返回 `file_too_large`，因为认为自身持有整个文件的调用方可能会将其截断后写回。窗口从 inode 绑定的句柄流式传输，且永远不会返回超过 `MAX_READ_BYTES` 的内容。
- **`MAX_READ_BYTES` 限制读取返回的内容；`MAX_TEXT_SCAN_BYTES` 限制读取的成本。** 行偏移通过从字节 0 扫描来解析，因此 `{ line: 900_000_000, limit: 20 }` 几乎不返回内容但仍需遍历整个文件。扫描超过 8 MiB 后，读取将以 `file_too_large` 被拒绝，指向 `readBytes`，它可以以 O(1) 复杂度到达任何偏移量。
- **流式窗口容忍追加，不容忍截断。** 完整快照路径可以要求字节级的稳定性，因为它返回整个文件；前缀窗口则不能，否则每次读取活跃日志都会失败。流式路径断言 inode 身份加上"未缩小"，因此追加通过而截断/替换仍被拒绝。`sizeBytes` 报告 `open` 时的大小，描述窗口所截取快照的状态。
- **大型部分读取省略全文件哈希。** 当流式传输在 EOF 之前停止时，`originalLineCount` 会被省略。
- **分页基于字节 cursor，而非行。** 留下内容的读取会返回 `hasMore`，以及在可以推导字节偏移时返回不透明的 `nextCursor`。从 cursor 恢复是 O(1)；按 `line` 恢复会从字节 0 重新扫描，并在超过 `MAX_TEXT_SCAN_BYTES` 时被拒绝。cursor 携带 `{dev, ino, size}`，因此被替换或截断的文件会产生 `hash_mismatch` 而不是来自错误位置的字节，而追加则使其保持有效。非 UTF-8 快照读取会报告 `hasMore` 但不返回 cursor — 其解码文本是 UTF-8 重新编码，其长度无法映射回文件偏移量。
- **`BridgeFileSystem` 适配器必须同时复制两个内联代理门控**（拒绝非普通文件 + 有界缓冲/流式传输）。当适配器被注入时，内联路径会被完全绕过。

## 参考

- `packages/cli/src/serve/fs/index.ts` (桶文件)
- `packages/cli/src/serve/fs/paths.ts`
- `packages/cli/src/serve/fs/policy.ts`
- `packages/cli/src/serve/fs/errors.ts`
- `packages/cli/src/serve/fs/audit.ts`
- `packages/cli/src/serve/fs/workspace-file-system.ts`
- `packages/cli/src/serve/bridge-file-system-adapter.ts`
- `packages/acp-bridge/src/bridgeFileSystem.ts`
- HTTP 路由参考: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
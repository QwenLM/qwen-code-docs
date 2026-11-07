# FileChanged hook


使用 `FileChanged` 观察 Qwen Code、shell 命令、编辑器或其他进程修改的文件。它在本地非托管会话中运行。有关 hook 配置、执行器和信任规则，请参阅 [Hooks 指南](./hooks.md)。

## 事件输入

输入包含 [通用 hook 字段](./hooks.md#hook-input-structure) 以及：

```json
{
  "file_path": "/home/me/work/demo/.envrc",
  "event": "change"
}
```

`file_path` 是绝对路径。`event` 为 `add`、`change` 或 `unlink`，分别表示被观察文件的添加、修改或删除。通用的 `session_id` 和 `cwd` 属于监听会话；它们不标识写入者。多个会话观察同一共享目录时，各自都能收到其变更通知。文件内容不包含在内。

仅传递文件事件。目录自身的 `addDir` 和 `unlinkDir` 事件不会被传递。需要跟踪被观察根目录自身生命周期的集成必须自行检查文件系统状态（例如使用 `stat`）并独立进行调和；子项的 `unlink` 并不能证明根目录已被移除。

## 在工作目录中观察文件名

添加一个 `FileChanged` hook，使用字面量文件名并以 `|` 分隔：

```json
{
  "hooks": {
    "FileChanged": [
      {
        "matcher": ".envrc|.env",
        "hooks": [
          {
            "type": "command",
            "name": "configuration-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

这会在会话的 cwd 中注册 `.envrc` 和 `.env`。静态注册不会展开通配符或递归扫描目录。省略或空的 matcher、`*` 和 `.*` 不注册任何静态路径；这些 hook 从会话的观察路径（包括动态路径）接收事件。事件根据文件的基本名称使用 [现有 matcher 规则](./hooks.md#matcher-patterns) 进行过滤。

正则表达式模式过滤已观察的路径；通过 `watchPaths` 显式注册其文件或目录。

静态根仅接受纯字面量文件名，包括 dotfile。正则表达式/通配符元字符和路径分隔符不会创建静态根。已存在的目录和无法检查的路径会被排除；缺失的文件可能会被观察以等待其创建。静态文件发现会观察其父目录，同时在遍历前排除不相关的条目。对于递归目录，请使用显式的 `watchPaths`。更改会话工作目录会在重定位完成前重新定位静态根；显式的绝对动态根保持不变。

## 观察 cwd 外的目录和路径

成功的同步 `SessionStart` hook 可以通过 `hookSpecificOutput.watchPaths` 注册绝对路径的文件或目录。目录会被递归观察，包括之后创建的子项。递归发现会跳过 `.git` 和 `node_modules` 子树。要观察其中的路径，请显式注册该文件或目录。特殊文件类型会被忽略，普通目录没有深度限制。初始注册会在 `SessionStart` 返回之前等待 watcher 就绪。

递归发现会忽略名为 `<target>.<12 lowercase hex characters>.tmp` 的原子写入临时文件，包括延迟重命名和孤立文件。显式注册此类文件仍会观察它。具有此后缀的目录仍可遍历，其他 `.tmp` 文件会被正常观察。

例如，注册内存文件夹：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "watch-memory-folders",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/watch-memory.mjs\""
          }
        ]
      }
    ],
    "FileChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "memory-file-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

让 `watch-memory.mjs` 将此 JSON 打印到 stdout。将示例路径替换为 `/memory` 显示的实际绝对文件夹：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "watchPaths": [
      "/home/me/.qwen/projects/demo/memory",
      "/home/me/.qwen/memories"
    ]
  }
}
```

`FileChanged` hook 没有 matcher，因此它会接收这些已注册目录中的所有变更。其处理程序从 stdin 读取事件 JSON。选择观察路径之外的日志或同步目标，以避免其自身的写入触发处理程序。

## 更新动态路径

对于同一文件系统中的多个工作区，将其所有实际内存目录注册到一个列表中。使用 `file_path` 和你自己的目录到工作区映射来路由通知，而不是使用监听会话的 `cwd`。独立会话可以观察同一共享根，因此在业务处理程序中去重工作。另一个容器或远程实例中的根需要该文件系统所有者中的 watcher；在主机上注册其路径不会观察它们。

成功的同步 `SessionStart` 和 `FileChanged` 输出可以设置 `watchPaths`。在 `hookSpecificOutput` 中包含匹配的 `hookEventName`。

| 输出 | 对动态路径的影响 |
| --------------------------------------- | ---------------------------------- |
| 绝对文件或目录列表 | 替换之前的动态列表 |
| `[]` | 清除动态列表 |
| 省略或无效的 `watchPaths` | 保留之前的动态列表 |
| 来自异步 hook 的输出 | 不注册或更改路径 |

当多个 hook 返回列表时，按 hook 执行顺序，最后一个有效的、显式提供的列表生效。所有条目必须是绝对路径；一个无效条目会使整个列表无效。静态文件名注册在动态替换或清除后仍然有效。

要从 `FileChanged` 处理程序清除动态路径，返回：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "FileChanged",
    "watchPaths": []
  }
}
```

## 观察限制

初始目录扫描不会被重放。来自最近写入的原生文件系统事件可能在注册之后到达。显式注册的符号链接文件和目录根会观察其目标，包括祖先路径中的链接。通知使用配置的别名；向一个目标注册多个别名会为每个别名生成一个通知。重新定向链接后刷新注册。在递归根内发现的符号链接不会被遍历。事件在写入稳定后报告。观察是尽力而为的：文件系统合并、不可访问的路径、进程停机时间和路径重新配置可能会留下间隙。需要完整同步副本的集成必须处理初始扫描、调和和重试。watcher 或 hook 失败会被记录，且不影响原始文件操作。

`FileChanged` 不能否决或撤销写入，也不能添加模型上下文。仅观察显式注册的路径：内存文件夹不会自动注册，也没有专门的自动内存启用/禁用事件。写入被观察文件的 hook 可能会触发自身；避免这些写入或在业务中去重。

SSH 执行环境、shell 沙箱 worker 和托管调度器不会启动本地文件系统 watcher。正常的 hook 启用和信任规则仍然适用。观察在其所属会话关闭时停止。
# 扩展管理 V2

## 状态

本设计在附加的 `extension_management_v2` capability 之下扩展 daemon 协
议 `v1`。已发布的 `workspace_extensions` capability 和
`/workspace/extensions/*` 路由继续作为主工作空间兼容适配器可用。

## 资源模型

一个已安装的扩展是 `QWEN_HOME/extensions` 中的一个用户级 artifact。激活
是策略，不是该 artifact 的第二份拷贝：

1. 精确的工作空间覆盖（`enabled` 或 `disabled`）。
2. 迁移旧版路径规则期间创建的内部精确 `inherit` 掩码。
3. 有序的 V1 路径规则。
4. 全局默认。

工作空间身份使用 daemon 的规范工作空间路径。工作空间路由先按工作空间
id、再按规范 cwd 选择既有运行时。对不可信运行时允许读取；激活变更、刷
新和工作空间作用域的安装要求 trusted 目标。全局变更使用普通的 daemon 变
更认证和安装同意，而不是发起请求的那个工作空间的信任状态。

## 存储与事务边界

`ExtensionStore` 是最终扩展目录和 V2 激活状态的唯一写入者。
`ExtensionManager` 仍是面向工作空间的门面，但 CLI、TUI、自动更新、
daemon 和 SDK 支撑的操作都把变更委托给 store。

布局为：

```text
~/.qwen/
├── extensions/
└── extension-store/
    ├── lock
    ├── state.json
    ├── state.previous.json
    ├── staging/
    ├── rollback/
    └── transactions/
```

store 和 artifact 共享同一个文件系统，因此 artifact 切换就是目录重命
名。一个进程内互斥锁和一个 `proper-lockfile` 锁在所有 V2 感知的进程之
间串行化提交。每次变更都在持锁时重新读取状态并递增单调 generation，防
止丢失更新。

安装/更新的准备发生在最终 artifact 目录之外。提交写入一个 `prepared`
日志，把旧 artifact 移到 rollback，把 staging 移入位置，并原子地写入
`state.json`。那次 state 重命名就是提交点。在它之前，恢复会回滚；在它
之后，恢复只完成投影和清理。已提交的策略绝不因某次运行时刷新失败而回
滚。如果一个提交前操作及其回滚都失败，调用方收到两个错误，日志保留以供
fail-closed 恢复；store 不会在一个模糊的 artifact 状态上继续写入。

Store 文件使用仅所有者权限和原子的 no-follow 写入。扩展 id、直接子级
artifact 路径、事务路径和名称都会被校验。失败报告使用去凭据的来源。

## V1 迁移与降级投影

第一个 V2 感知的进程从 `extension-enablement.json` 导入有序规则，而不
把当前已注册工作空间集合实体化为精确覆盖。V2 在每次状态提交后写入一个
兼容投影，并把其哈希存储在 `state.json` 中。

如果哈希不同，修改顺序决定恢复方向：较旧的投影从权威的 V2 状态修复；
在 V2 状态之后被修改的投影被视为降级二进制的顺序写入，并以新的
generation 重新导入。共享同一个 `QWEN_HOME` 的并发 V1 和 V2 写入者有意
不受支持。

清除公开的工作空间覆盖通常会删除精确记录。如果某个较旧的路径规则会因此
改变生效值，store 会写入一个内部 `inherit` 掩码，使 DELETE 仍表示“继
承全局默认”。

## Daemon API

全局表面为：

```text
GET    /extensions
POST   /extensions/install
POST   /extensions/check-updates
POST   /extensions/:extensionId/update
DELETE /extensions/:extensionId
PUT    /extensions/:extensionId/activation
GET    /extensions/operations/:operationId
```

安装要求显式同意和初始激活：

```ts
type InitialActivation =
  | { scope: 'user' }
  | { scope: 'workspace'; workspaceId: string };
```

Daemon 安装端点在公开网络策略下接受 HTTPS Git、GitHub Release 和 npm
来源。SSH 和 local/link 来源仍是本地 CLI 功能。更新保留扩展 id、
manifest 名称、设置和激活策略。“已是最新”是一个成功的 `updated:
false` 结果。卸载是幂等的，同时移除 artifact 和策略。

工作空间投影为：

```text
GET    /workspaces/:workspace/extensions
PUT    /workspaces/:workspace/extensions/:extensionId/activation
DELETE /workspaces/:workspace/extensions/:extensionId/activation
POST   /workspaces/:workspace/extensions/refresh
```

它有意没有工作空间 artifact 变更路由。投影条目包含默认值、精确工作空间
值、生效值和来源。期望 generation 和本地已应用 generation 是顶层响应字
段。

可能较慢的变更返回 `202`、`Location` 和 `Retry-After`。操作记录是
daemon 本地内存，最多保留 100 条终态记录，重启时可能消失。Catalog/store
恢复是权威的。SDK 轮询超时只停止轮询；它绝不取消已接受的工作。

Daemon 最多接纳 10 个未完成的扩展操作。一个 daemon 范围的 FIFO 准备队
列一次最多运行两个下载、解压、转换或单扩展更新检查。安装和更新使用显式
的 `prepare -> commit/dispose` 生命周期：准备拥有 staging 文件和带版本
的凭据快照，但不改变 store、缓存、运行时，或已安装 artifact 选择的凭
据。准备好的变更按准备完成的顺序进入一个单独的、单并发的 FIFO 提交队
列。激活和卸载只进入提交队列；check-updates 只进入准备队列。手动刷新
通过提交队列串行化。其 HTTP 超时会释放那条 lane，因此停滞的运行时刷新
不会永久阻塞后续的扩展变更；已开始的刷新之后仍可能落定。敏感设置在一个
逐 prepare 版本下作为一个原子的 secret bundle 暂存。一个非 secret 的
选择器在暂存 artifact 内记录该版本和 secure-storage 后端，因此只有获
胜的 artifact 提交才激活一个完整的 bundle。store 提交因此是持久化点，
并立即释放提交 lane。扩展重载、旧版逐键设置同步、管理器运行时刷新、准
备文件清理和 daemon 运行时调和都在其外运行。这些提交后步骤不占用任一槽
位，因此较早 generation 正在被应用或清理时，后续提交仍可进行。

处置一个已准备的变更会移除其未选择的凭据快照，一次成功的提交会尽力移除
先前选择的快照。处置之前的硬性进程崩溃可能在 secure 后端留下一个不可达
的条目；没有 artifact 选择器引用它，因此它不会变为激活，也不会被误认
为已提交的凭据。

准备截止时间从操作第一次获得准备槽位时开始，而不是等待期间。中止会传播
到网络操作以及活跃的归档扫描和解压流。一个已开始的任务即使忽略中止，也
会继续占用其槽位，直到底层 promise 落定。提交不可取消。已准备的更新携
带目标 artifact generation：无关的扩展或激活变更可以安全 rebase，而同
一 artifact 的过期更新会以 `extension_conflict` 失败。

远程 npm 元数据以 10 MiB 响应上限流式传输。npm 和 GitHub 归档各有单
独的 100 MiB 下载上限、请求截止时间、重定向限制，以及解压前的归档条
目校验。

## 运行时调和

一次成功的提交使本地状态失效并刷新受影响的运行时。全局 artifact/默认变
更调和本 daemon 中的所有运行时；精确工作空间覆盖只调与其目标。运行时
调和刷新扩展和 skill 缓存、扩展工具、分层内存、活跃聊天系统指令和可用
命令。某个组件失败不会跳过其余刷新组件；会话 RPC 在所有组件都尝试过后
报告合并的失败。运行时 generation 调和使用一个由变更和 generation 轮
询器共享的 daemon 范围 FIFO。变更在持久提交回调处预定其位置，因此即使
较早的提交后工作较晚完成，较新的 generation 也不能先刷新某个运行时。
ACP 桥接把每次会话刷新限制在 30 秒。如果聚合刷新仍超过路由截止时间，
控制器释放提交 lane 而不取消底层 RPC。应用 generation N 也会满足较旧
generation 的等待者，因此迟到的较低 generation 刷新不会把已应用的
generation 向后移动。部分刷新失败或提交后重载/清理失败会产生
`succeeded_with_warnings`，附带工作空间特定或提交诊断，不回滚
artifact。

旧版工作空间迁移只有在已提交的 artifact 无法重新加载时才把它视为失败。
设置兼容同步、清理或运行时刷新警告不会触发对已持久安装的 artifact 的重
试。更新调用方收到警告详情；兼容和清理警告使用一个不同的 `updated with
warnings` 状态，而重载或运行时刷新失败仍是 `updated, needs restart`。

扩展文件 watcher 只为策略 generation 观察 `extension-store/state.json`，
并继续观察已安装/链接扩展内容的命令、skill、agent、hook 和 MCP 变更。
一个 30 秒的 generation 轮询修复错过的文件系统事件，并为共享该 store
的其他 daemon 的收敛设限。

## 兼容性

`workspace_extensions` 仍是既有单数表面的 capability。其处理器调用相
同的 manager/coordinator 并调整响应：项目激活变为主工作空间覆盖；用户
激活保留旧版的规则清除行为；全局变更调与每个本地运行时。旧版操作端点把
V2 的警告完成映射回已发布的旧版刷新错误状态。

客户端必须检查 `extension_management_v2`；daemon 模式或其他工作空间
capability 都不暗示此 API。已废弃的 `workspace_qualified_extensions`
提案不属于协议。

## 非目标

- 逐工作空间的 artifact 拷贝。
- Daemon 注册表或远程确认协议。
- 用户对已接受操作的取消。
- 旧二进制与 V2 感知进程对同一个 `QWEN_HOME` 的并发写入。
- 在未来的 protocol-v2 迁移之前移除 V1 适配器。

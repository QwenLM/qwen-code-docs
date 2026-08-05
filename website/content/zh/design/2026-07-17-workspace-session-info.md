# 工作空间 `session-info` 聚合端点

## 问题

`GET /workspace/:id/sessions` 使用游标分页，且不返回总数。`GET /daemon/status` 只暴露实时的内存中 `sessionCount`。拥有大量持久化会话（例如来自定时任务）的工作空间无法在不翻页遍历每个会话的情况下得知本地存储的规模。

## 方案

新增：

```http
GET /workspace/:id/session-info
GET /workspaces/:workspace/session-info
```

响应（示意）：

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

对于不受信任的次级工作空间，`live` 会被省略，因为这些目录读取不得查询活跃 bridge。如果扫描达到其安全上限，或无法对某个候选 JSONL 文件进行分类，响应会包含 `"truncated": true`；此时持久化计数是下界。

## 成本模型

持久化计数复用会话标题搜索（`SessionService.findSessionsByTitle` / `findSessionTitlesByPrefix`）已经在使用的现有全目录扫描模式：

1. 对项目会话目录（及其归档孪生目录）执行 `readdir`
2. 过滤出 UUID 命名的 `*.jsonl`
3. 施加相同的文件处理安全上限
4. 只读取第一条 JSONL 记录以判断 project-hash 归属

不做标题/提示词的水合。这在磁盘上是 O(n) 的，**绝不能被轮询**。响应始终设置 `expensive: true` 和 `cost: "disk_scan"`，以便客户端在热路径上 fail closed（失败即拒绝）。文档会明确指出这一点。

默认的列表分页保持不变，也不计算总数。不要复用 organized-view 的 `listAllPersistedSummaries` 来做计数——该路径会为最多 5 万个会话水合完整的列表元数据。

## Capability

在 `/capabilities` 上的 `session_list` 旁边提供始终启用的 `session_info`。

## 非目标

- 缓存计数器 / mutation-hook 记账（如果调用点需要更低延迟，可作为后续工作）
- 把 `total` 塞进每一个列表页
- v1 中的 organized-group 或按父会话过滤的总数

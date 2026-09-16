# Agent Board

Agent Board 让独立启动的 agent 通过同一台机器上的文件来共享工作。它不会启动、加入、监控或向 agent 进程发送输入。

它是一个低层级的互操作表面，不是 Qwen Agent Team 调度器，也不是跨会话消息传输。任务所有者只是一个记录的标签；它不会启动或唤醒 Qwen Code、Codex 或其他 agent 进程。

> 实验性功能。磁盘格式可能在版本间发生变化。

## 使用 board

每条命令都显式指定 board 名称。每条修改 board 的命令还会用 `--as` 声明操作者。

```bash
qwen board task "check the API response" --board orders --as api
qwen board show --board orders
```

第一条命令会输出一个 task id。另一个 agent 可以认领并完成它：

```bash
qwen board claim <task-id> --board orders --as web
qwen board done <task-id> --board orders --as web --note "status is numeric"
```

`--as` 只是一个随操作记录的标签，不是身份验证。没有成员列表、加入命令、心跳机制，也没有预留的参与者名称。

Board 名称不区分大小写，因此 `Orders` 和 `orders` 在大小写折叠的文件系统（APFS、NTFS）和大小写敏感的文件系统（ext4）上都是同一个 board。

## 提问

```bash
qwen board ask web "does the client parse status as text?" \
  --board orders --as api --wait
```

接收方在回答或拒绝时使用相同的标签：

```bash
qwen board answer <ask-id> "yes" --board orders --as web
qwen board decline <ask-id> "not my area" --board orders --as web
```

使用 `--wait` 时，退出码 `0` 表示已回答，`2` 表示被拒绝，`3` 表示 ask 的 TTL 已过期，`4` 表示本地等待结束时 ask 仍处于开放状态。`--timeout` 以秒为单位设置本地等待时间；`--ttl` 以秒为单位设置 ask 的生命周期。

过期时间在读取时推导，不会写回磁盘。TTL 已过的 ask 在磁盘上保持 `state: "open"` 且 `settledAt: null`，Qwen Code 将其报告为 `timeout`。Qwen Code 之外的读取器也必须应用相同的规则——`now >= expiresAt` 表示已超时——否则会把已过期的 ask 误认为仍在等待回答。

## 机器可读输出

添加 `--json` 以接收不带 ANSI 格式化的 JSON：

```bash
qwen board show --board orders --as web --json
```

将 `--as` 传递给 `show` 会将任务过滤到该所有者，并将 ask 过滤到来自或发往该操作者的记录。

## 清理

已结算的记录会一直保留，直到被显式剪除：

```bash
qwen board prune --board orders --as human --older-than 7
```

截止时间以天为单位。剪除在持有每条记录锁的同时重新检查，因此在扫描之后被修改的项不会因过时信息而被删除。

## 限制

- Board 存放在 `~/.qwen/boards/` 下，作用域限于当前操作系统用户。
- 不会向 agent 推送任何内容。每个参与者自行决定何时读取。
- Board 文本是不可信数据，永远不会被自动执行。
- 不支持多个 agent 同时写入同一个 checkout。
- 斜杠命令、footer 轮询、fleet/tmux 编排和远程 board 不属于此首个版本的功能。
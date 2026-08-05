# 句柄绑定的文本范围读取

## 背景

PR #7947 让 Serve 工作空间文件系统能够从超过 `MAX_READ_BYTES`（256 KiB）的
文本文件返回有界的行窗口。为了让这些读取在校验、二进制探测和流式处理期间
固定到同一个 inode，它把一个调用方拥有的 `FileHandle` 作为可选字段下传到
`readTextRange`，并添加了第二个可选字段 `forceStreaming` 来抑制缓冲快路径——
否则它会破坏内存上限。

一个入口点上的两个可选字段产生了四种组合，其中一种有意义，一种不可达，一
种不安全：

| `fileHandle` | `forceStreaming` | 结果                                                                   |
| ------------ | ---------------- | ---------------------------------------------------------------------- |
| 未设置       | 未设置           | 普通路径读取                                                           |
| 未设置       | 设置             | 对小文件做流式——被一个测试使用                                        |
| 设置         | 设置             | Serve 边界的读取                                                       |
| 设置         | 未设置           | 通过句柄缓冲整个文件——**没有任何调用方能到达**                        |

不可达的组合带有一个专门的辅助函数 `readFileHandleBuffer`，且没有测试覆盖。
另外，`readFileWithLineAndLimit` 接受相同的 `fileHandle`，但只能在其范围分支
上兑现它：无界读取会落入按路径的 `readFileWithEncodingInfo`，悄悄返回该路径
在那一刻解析到的内容的字节，而不是固定 inode 的字节。PR #7947 的后续 commit
用运行时 `RangeError` 守卫了这一点，它记录了这个陷阱但没有消除它。

编码检测因同样的原因分叉了。`detectFileEncoding` 接受路径并打开自己的描述符，
因此句柄路径不能使用它；私有的 `detectFileHandleEncoding` 被加在旁边，从
`decodeBufferWithEncodingInfoAsync(...).encoding` 而不是直接从 chardet 派生编码
名。当 chardet 给出一个 `iconv-lite` 无法加载的编码名时两者会不一致：路径版本
返回那个名字，句柄版本返回 `'utf-8'` 并交给流式解码器的 `fatal: true` 失败。
两者都拒绝该文件，只是消息不同。

## 目标

- 一个编码检测器，可从路径或借用的描述符使用。
- 范围读取器上没有模式标志；让不可达的组合无法表示，而不仅仅是未被使用。
- 让按路径的落入在结构上不可能，而不是靠守卫。
- Serve 边界或 `read_file` 工具没有可观察的变化。

## 非目标

- 不把 `decodeBufferWithEncodingInfo`（同步）合并进它的异步孪生体。同步版本
  是刻意的公开 API 兼容垫片
  （[`lazy-first-use-dependencies.md`](./lazy-first-use-dependencies.md)），由
  对等测试固定。
- 不改变 Serve 边界返回的内容。这是字节游标分页的准备工作，不是那个功能
  本身。

## 设计

### 一个检测器

`detectFileEncoding(source: string | FileHandle)`。提供的句柄是_借用的_：读取
使用显式位置，因此调用方的文件位置不受影响，且 `finally` 块只关闭这个函数
自己打开的描述符。`detectFileHandleEncoding` 被删除，手写展开的 BOM 到名称的
switch 被现有的 `bomEncodingToName` 替换。

这让句柄路径稍微严格了一些，这是预期的方向：`iconv-lite` 无法加载的编码现在
会抛出指名该编码的 `LargeNonUtf8TextError(detected)`，而不是到达解码器后抛出
通用的 `'invalid-utf8'` 变体。拒绝行为不变；消息变好了。Serve 边界把两者都
映射为 `binary_file`，因此下游没有变化。

第二个更小的差异随合并而来：`detectFileEncoding` 捕获所有错误并回退到
`'utf-8'`，而 `detectFileHandleEncoding` 没有处理器，让 I/O 失败传播。该失败
不会丢失——坏到让 8 KiB 探测失败的句柄会紧接着让流式读取失败，而并非真正
UTF-8 的文件仍会被 `fatal: true` 解码器拒绝——所以错误从另一个调用浮现而不是
消失。为了单一回退策略而接受；注明是因为它确实改变了哪个调用报告问题。

### 两个入口点

```ts
readTextRange(request: ReadTextRangeRequest)                    // path
readTextRangeFromHandle(fh, request: ReadTextRangeFromHandleRequest)
```

句柄版本总是流式——没有标志，因为调用方恰恰在需要读取有界时才使用句柄，而
缓冲快路径会读取整个文件。其请求类型没有 `path`（没有可供消歧的东西），保留
从打开时 `fstat` 捕获的数值 `fileSize`，并把两个字节边界从可选改为必填。
`maxOutputBytes` 限制读取返回多少，`maxScanBytes` 限制其成本，`fileSize` 防止
在读取进行中追加操作扩大描述符快照。句柄绑定读取的存在是因为安全边界需要全部
三个限制。

`maxScanBytes` 在路径版本上保持可选，默认为 `Infinity`，因此 `read_file` 工具
不变。

两者都委托给同一个流式实现，它现在接受 `source: string | FileHandle` 并相应
选择 `createReadStream` 或 `chunksFromHandle`。`readFileHandleBuffer` 和调用它
的分支被删除。

### 落入消失

`readFileWithLineAndLimit` 失去 `fileHandle`、`forceStreaming` 和
`maxScanBytes`——它唯一的生产调用方一个都不传。
`StandardFileSystemService.readTextFileFromHandle` 现在直接调用
`readTextRangeFromHandle`，两条读取路径共享一个 `toReadTextFileResponse` 辅助
函数，使它们的元数据整形不会漂移。没有剩下的 `fileHandle` 参数可以忽略，
`RangeError` 守卫被移除：它描述的陷阱不再能被表达。

`readTextFileFromHandle` 留在 `FileSystemService` 接口之外，因此
`AcpFileSystemService` 和 `filesystem.test.ts` 中带类型的回退 mock 不受影响。

## 影响范围

- `readTextRange` 没有从 `packages/core/src/index.ts` 导出；三个面向边界的
  错误类有导出。重塑后的读取器表面是 core 内部的。
- `readTextRange` 和 `readFileWithLineAndLimit` 各只有一个生产调用方
  （`fileUtils.ts`、`fileSystemService.ts`）。
- `detectFileEncoding` 通过 `export * from './utils/fileUtils.js'` 公开。放宽
  参数类型是源码兼容的。
- 触碰模块的唯一跨包导入方是
  `packages/cli/src/serve/fs/workspace-file-system.ts`。它唯一的变化是去掉句柄
  路径不再接受的两个参数——见下文；它还携带的
  `decodeBufferWithEncodingInfoAsync` 导入不受影响。

### `CoreReadTextFileHandleRequest` 变为独立类型

它原本是 `Omit<CoreReadTextFileRequest, 'limit' | 'stats' | 'maxOutputBytes'> &
{...}`，留下了两个句柄路径从不读取的字段：

- **`stats`** 被记录为必填——"必须传递从那个句柄捕获的 Stats"——而下游什么也
  不读这个对象。最终 API 只保留其数值 `fileSize`：句柄路径不需要元数据来选择
  策略，但它需要打开时的大小，以便在文件被并发追加时保持读取有界。
- **`path`** 在 `readTextRangeFromHandle` 替换路径加句柄的调用后变成死字段：
  读取绑定到描述符，错误由拥有它的 Serve 边界用路径标注。

两者都没有被编译器捕获。这个类型派生自的 ACP `ReadTextFileRequest` 允许额外
属性，因此传递一个类型已移除的字段什么也不会报。这正是把类型声明为独立而不
是派生的论据：`Omit` 链剥掉了六个继承字段中的四个，并悄悄重新放行了其余的。

在重构 commit 处，`packages/core` 中变更了 282 行生产逻辑代码；后续的游标
跟进在该基线之上添加行为和测试。

## 测试

在重构 commit 处，现有套件就是规格：全部要点是 Serve 边界无法察觉。后续的
游标跟进添加边界行为和自己的测试。

`read-text-range.test.ts` 中的三个测试移到 `readTextRangeFromHandle`。两个直接
使用了 `fileHandle`。第三个使用带 `forceStreaming: true` 的_路径_来强制对一个
太小而不离开快路径的文件做流式，以便测试 EOF 处的预算边界；标志消失后，句柄
版本是唯一总是流式的东西。

移动后的一个测试含义变了。它原先为一个文件传句柄、为另一个文件传路径，断言
句柄获胜——这是对旧签名所允许的混淆的测试。句柄版本没有 `path`，因此那种
混淆现在无法表示，该测试什么也断言不了。它被重写以覆盖真正驱动该 API 的
属性：打开一个句柄，用另一个文件重命名覆盖该路径，确认读取仍跟随该 inode。

`fileSystemService.test.ts` 的两个测试被删除而不是修复。它们 mock 了
`readFileWithLineAndLimit` 并断言它收到的参数对象；由于
`readTextFileFromHandle` 不再调用它，它们只能通过指向新 mock 来保留，而那又
只是断言一个函数把参数传给另一个函数。它们名义上覆盖的行为在
`read-text-range.test.ts` 中针对真实文件、在 `workspace-file-system.test.ts` 中
针对真实边界进行测试。它们旁边的参数校验测试被保留——它们不需要 mock。

## 后续工作

`chunksFromHandle` 获得了一个 `from` 参数，作为字节游标文本分页所需的唯一
接缝。后续跟进现在用它从非零字节偏移恢复。

# MCP 模型负载过滤

## 目标

防止 `packages/cua-driver` 和 `packages/mobile-mcp` 在文本类 MCP 负载中
返回已知的厂商词汇，同时保留操作应用、窗口、设备和软件包所需的真实本地
值。

过滤是可选启用的，默认禁用。为会拒绝这些词汇的 API 路由在 MCP 服务器
环境中设置 `MCP_MODEL_PAYLOAD_FILTER=1`。使用其他路由的用户保留原始负载。

初始的不区分大小写 ASCII 词汇为 `qwen`、`dashscope`、`alibaba`、
`aliyun`、`aliyuncs`、`alicloud`、`tongyi`、`qianwen`、`antgroup`、
`bailian`、`modelscope`、`damo`、`lingma`、`wanx`、`alipay`、`antfin`、
`yuque`、`dingtalk`、`taobao`、`tmall`、`qoder` 和 `maxcompute`。中文词汇
按精确匹配：`通义`、`千问`、`阿里`、`百炼`、`魔搭`、`达摩`、`灵码`、
`万相`、`支付宝`、`蚂蚁`、`语雀`、`钉钉`、`淘宝` 和 `天猫`。
多段名称还会匹配分隔符变体，例如 `q-wen`、`dash_scope`、`ali cloud`、
`qian-wen` 和 `ant_group`。

## 编码

每个匹配的子串都会被替换为一个包含其 UTF-8 十六进制字节的无状态 token。
例如，过滤后的应用名在 token 周围仍然可读，将该值返回给同一个 MCP 服务器
会在工具校验和执行之前还原出确切的原始子串。这避免了会话映射，并使
应用/软件包/路径的往返在进程重启后仍然可用。

JSON-RPC id 和 method 绝不变换。result、error 和 notification 负载内的
对象键和文本值会被递归变换。图像和音频 `data` 字段逐字节保留。

## 组件边界

在 cua-driver 中，`Response::ok` 和 `Response::error` 是直接 stdio、HTTP
和 daemon-proxy MCP 响应的共享面向模型边界。工具调用名称和参数在分发前
于 `Request::tool_call` 中解码。两个方向都只在
`MCP_MODEL_PAYLOAD_FILTER=1` 时应用该变换。

在 mobile-mcp 中，传输包装器在 SDK 执行 schema 校验之前对出站 JSON-RPC
负载编码、对入站负载解码。一个小的 `McpServer` 子类在
`MCP_MODEL_PAYLOAD_FILTER=1` 时将该包装器应用到 stdio、SSE、内存测试和
未来的传输；否则原样连接原始传输。

## 非目标

这不重命名已安装的应用、进程、bundle、npm 包、签名身份、仓库或分发 URL。
它不变换 stderr、遥测或构建日志。图像字节被保留，因此基于 OCR 的过滤不在
本文本负载保证范围内。

别名只有在返回给同一个 MCP 组件时才被解码。将别名传给 shell 或其他服务器
不会还原本地值。

## 验证

- 单元测试每个词汇、混合大小写、中文文本、嵌套对象和键、无效 token、精确
  往返以及二进制内容保留。
- 验证面向模型的边界默认不变，且仅在存在 `MCP_MODEL_PAYLOAD_FILTER=1`
  时才过滤。
- 对两个组件演练真实的 MCP initialize、tools/list、成功、结构化成功和
  错误响应。
- 重新运行观察到的 cua 权限、健康、应用和窗口负载，以及确定性的 mobile
  错误回显。

# Electron 到 Tauri 的桌面更新桥接

## 背景

最后一个已发布的桌面版本 `desktop-v0.0.5` 是一个名为 `Qwen Code Desktop`
的 Electron 应用，bundle identifier 为 `com.alibaba.qwen-code`。其 macOS
更新器从固定的 `desktop-latest` release 读取 `latest-mac.yml` 并安装一个
ZIP 归档。

新的桌面外壳是一个 Tauri 应用。它目前使用不同的产品名和 bundle
identifier，并发布 `desktop-latest.json`，因此现有的 Electron 应用无法发现
或替换它。

## 目标

- 让已签名的 macOS Electron `0.0.5` 安装直接更新到第一个稳定的 Tauri
  版本。
- 保留现有的 macOS 应用身份，使更新器替换已安装的应用 bundle。
- 在迁移之后的所有版本中保留 Tauri 的签名 updater feed。
- 让桥接是 opt-in 且一次性的；后续版本不得需要 Electron 构建工具。

## 非目标

- 迁移 Electron 的设置、会话或工作空间状态。Tauri 应用可能在首次启动时
  询问工作空间。
- 桥接 Windows 或 Linux 的 Electron 安装。
- 生成 Electron 差分 blockmap。Electron updater 会回退到经校验和验证的
  完整 ZIP。

## 兼容性契约

Tauri bundle 使用旧版 macOS 身份：

- 产品名：`Qwen Code Desktop`
- bundle identifier：`com.alibaba.qwen-code`
- artifact 前缀：`Qwen-Code-Desktop`
- 签名身份：现有的 Developer ID Application 证书

桥接版本必须比 `0.0.5` 新。它在同一组已签名的应用 bundle 之上发布两个
updater 视图：

1. `latest-mac.yml` 把旧版 Electron 客户端指向
   `Qwen-Code-Desktop-arm64.zip` 或 `Qwen-Code-Desktop-x64.zip`。
2. `desktop-latest.json` 把 Tauri 客户端指向已签名的 Tauri updater 归档。

ZIP 由已签名并公证过的 `.app` 创建；不由 Electron 工具重新构建。

## 发布流程

`Desktop Release` 新增一个 `electron_bridge` 输入，默认禁用。

- 所有 macOS 构建继续产出 Tauri 应用、DMG、updater 归档和 updater 签名。
- 当启用 `electron_bridge` 时，每个 macOS 构建还会创建一个旧版兼容的
  ZIP。
- publish job 从两个 ZIP 和两个 DMG 生成 `latest-mac.yml`。
- 一个稳定的桥接版本把旧版元数据和载荷连同 `desktop-latest.json` 一起
  上传到 `desktop-latest`。
- 后续稳定版本保持 `electron_bridge` 禁用。更新 `desktop-latest.json` 不
  会移除桥接文件，因此之后才回来的 Electron 安装仍然可以切换到 Tauri。

Draft 和 prerelease 运行可以构建并发布桥接 artifact 以供检查，但它们绝不
更新稳定 feed。

## 签名凭据

仓库已经在 `MAC_CSC_*` 和 `APPLE_NOTARY_*` secret 名称下存储了 Electron
时代的 Apple 证书和 App Store Connect API key。工作流接受这些名称作为较
新 Tauri 名称的回退，因此 Developer ID 身份保持不变。

Tauri updater artifact 还额外需要 `TAURI_SIGNING_PRIVATE_KEY`；
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 只在私钥加密时需要。在第一个已发布
的 Tauri 版本之前，私钥必须与 Tauri 配置中的公钥匹配。

## 验证

自动化的 release-helper 测试验证：

- 旧版应用身份，
- 精确的桥接 artifact 选择，
- `latest-mac.yml` 中的 SHA-512 和 size 值，
- 缺少必需桥接 artifact 时的失败，
- 既有的 Tauri updater manifest 和版本同步行为。

在稳定版本发布之前，安装已签名的 `desktop-v0.0.5` arm64 和 x64 构建，把
它们指向一个隔离的桥接 feed，并验证 `0.0.5 -> Tauri bridge` 和
`Tauri bridge -> newer Tauri` 两种更新。

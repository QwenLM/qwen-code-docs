# 独立剪贴板原生插件

## 问题

CLI 打包产物将 `@teddyzhu/clipboard` 保持为 external，以便 npm 安装可以在运行时加载平台特定的原生包。独立归档（standalone archive）也将该 import 保持为 external，但目前只把音频捕获的原生插件复制到 `lib/node_modules` 中。因此在每个独立归档中，剪贴板图片粘贴都会静默失败。

## 约束

- 每个归档必须包含 `@teddyzhu/clipboard` JavaScript 包，以及与该归档目标匹配的恰好一个原生包。
- release 作业在一台 Ubuntu runner 上创建所有受支持的目标。普通的 `npm ci` 只会安装 runner 自身的可选原生包，因此打包不能依赖仓库的 `node_modules` 来获取跨目标产物。
- 剪贴板包的版本必须来自 lockfile，并与 CLI 的可选依赖保持一致。
- 当非宿主的剪贴板产物不可用时，本地打包应继续工作；而 release 打包必须失败，而不是发布一个部分可用的归档。

## 设计

在构建 release 归档之前，将锁定的剪贴板元包和每个受支持的目标包安装到一个临时的暂存目录中。将该目录显式传递给每个目标的打包命令。

独立打包器将每个目标映射到其原生剪贴板包，并只将元包加该目标包复制到 `lib/node_modules/@teddyzhu`。当未提供显式的暂存目录时，打包器使用仓库的 `node_modules`；缺少宿主产物时，本地构建会发出警告。显式暂存目录中缺少产物则是致命的。

如果运行时模块仍无法加载，输入提示会在首次尝试粘贴剪贴板图片时报告一个用户可见的错误。现有的 Linux `wl-paste` 和 `xclip` 路径保持不变。

## 验证

- 打包测试覆盖目标选择、排除其他原生目标，以及对不完整的显式暂存目录报错。
- 剪贴板和输入提示测试覆盖模块不可用的回调和一次性的 UI 错误。
- 一个真实的 macOS arm64 归档在仓库之外解包，用其捆绑的 Node.js 运行时加载，并对系统剪贴板中一个真实的 PNG 进行实际验证。

![Standalone clipboard paste before and after](./standalone-clipboard-native-addon/assets/before-after.png)

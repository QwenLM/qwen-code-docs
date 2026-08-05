# 可覆盖的默认禁用 skill

## 问题

`skills.disabled` 是跨设置作用域的大小写不敏感并集。这使它成为一个硬拒绝列表：项目无法启用一个被用户或系统设置禁用的 skill。这对策略来说是正确的，但它无法表示一个应当默认关闭、同时保留供项目选择性启用的 skill。

## 设置

新增两个大小写不敏感的并集列表，同时保持 `skills.disabled` 不变：

| 设置                     | 含义                                                    |
| ------------------------ | ------------------------------------------------------- |
| `skills.disabled`        | 硬禁用。始终获胜并保留现有的锁定。                       |
| `skills.defaultDisabled` | 默认禁用，除非显式启用。                                 |
| `skills.enabled`         | 显式选择性启用；不能覆盖 `skills.disabled`。             |

生效的禁用集合是 `disabled + (defaultDisabled - enabled)`。使用显式的 `enabled` 列表而非替换语义，这样启用一个继承的默认值不会替换掉无关的默认值。

## 运行时与持久化

一个 CLI 本地的解析器计算生效的禁用名称，以及每个被禁用的 skill 是 `hard` 还是 `default`。现有的运行时消费方继续通过 `Config.getDisabledSkillNames()` 读取生效集合；核心 skill 发现与执行 API 不变。

`/skills` 选择器和 daemon 开关应用相同的规则：

- 启用会移除工作空间的硬禁用，并仅在需要时把规范名称加入工作空间的 `skills.enabled`；
- 禁用会移除工作空间的选择性启用，并把规范名称加入工作空间的 `skills.disabled`；
- 更高作用域的 `skills.disabled` 条目保持锁定；
- 无关的和不可用的 skill 条目被保留。

工作空间 skill 状态新增禁用原因和可选的锁定作用域，以便客户端区分硬锁定和可覆盖的默认值。daemon 本地和 ACP 状态路径都读取同一个 CLI 本地解析器。

## 范围

- 本变更不向 `defaultDisabled` 添加任何 skill。
- `disable-model-invocation` 和托管 skill 的 ACP 操作保持不变。
- 现有的 `skills.disabled` 配置保持兼容。
- 变更仅限于设置、两个现有的开关界面、工作空间 skill 状态、它们的线上类型、文档和专门的测试。

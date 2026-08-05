# 子代理模型 grade 选择

## 目标

让模型在启动常规子代理时选择一个用户定义的模型 grade，同时不在 Agent 工具
schema 中暴露提供商特定的模型 ID。

```json
{
  "agents": {
    "modelGrades": {
      "small": "fast",
      "high": "qwen-max"
    },
    "allowedGrades": ["small", "high"]
  }
}
```

Agent 工具宣告 `model: "small" | "high"`，并在加载子代理配置之后立即解析
所选的 grade。

## 解析

生效的模型选择器使用以下优先级：

1. 非内置代理的显式非 `inherit` 模型
2. 由 `agents.modelGrades` 映射的允许 grade
3. 内置的 Explore 模型设置
4. 继承的父模型

未知或不允许的 grade 会被拒绝。fork 拒绝该参数，因为它们必须继承父的模型
和 prompt 缓存。命名的团队 teammate 也拒绝它，因为其后端模型覆盖接受的
是具体模型 ID，而不是 grade 选择器。

只有已配置且被允许的 grade 名称才会包含在动态工具 schema 中。具体的模型
选择器在用户设置中保持私有。

## 验证

- 设置 schema 和 CLI 到 core 的配置转发
- grade 解析、允许列表过滤，以及自定义代理的优先级
- 不含具体模型 ID 的动态 Agent 工具 schema
- 使用解析出的模型进行常规前台和后台分发
- fork 校验

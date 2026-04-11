# 退出计划模式工具 (`exit_plan_mode`)

本文档介绍了 Qwen Code 的 `exit_plan_mode` 工具。

## 描述

当处于计划模式且已完成实现方案的展示时，请使用 `exit_plan_mode`。该工具会提示用户批准或拒绝方案，并从计划模式切换到实现模式。

该工具专为需要在编写代码前规划实现步骤的任务而设计。不应将其用于研究或信息收集任务。

### 参数

`exit_plan_mode` 接受一个参数：

- `plan`（字符串，必填）：你希望提交给用户审批的实现方案。这应是一份简洁的、采用 Markdown 格式的方案，用于描述具体的实现步骤。

## 如何在 Qwen Code 中使用 `exit_plan_mode`

退出计划模式工具是 Qwen Code 规划工作流的一部分。当你处于计划模式时（通常在探索代码库并设计实现方案之后），你可以使用此工具来：

1. 向用户展示你的实现方案
2. 请求批准以继续实现
3. 根据用户的响应，从计划模式切换到实现模式

该工具会向用户展示你的方案，并提供以下选项：

- **Proceed Once**：仅批准当前会话的方案
- **Proceed Always**：批准方案并为后续的编辑操作启用自动批准
- **Cancel**：拒绝方案并保持在计划模式

用法：

```
exit_plan_mode(plan="Your detailed implementation plan here...")
```

## 何时使用此工具

在以下情况下使用 `exit_plan_mode`：

1. **实现任务**：你正在为编码任务规划实现步骤
2. **方案完成**：你已完成探索并设计好实现方案
3. **需要用户批准**：在进行代码更改前需要用户确认
4. **代码编写任务**：任务涉及编写、修改或重构代码

### 适用场景示例：

- “帮我实现用户认证” → 在规划完认证系统实现后使用
- “为用户管理添加新的 API 端点” → 在设计完端点结构后使用
- “将数据库层重构为使用 TypeORM” → 在规划完重构方案后使用

## 何时不应使用此工具

请勿在以下情况下使用 `exit_plan_mode`：

1. **研究任务**：专注于理解或探索现有代码的任务
2. **信息收集**：当你进行搜索、阅读或分析，且不涉及实现时
3. **文档任务**：在不更改代码的情况下创建文档时
4. **分析任务**：在不涉及实现的情况下提供解释或审查时

### 不适用场景示例：

- “搜索并理解代码库中 vim 模式的实现” → 请勿使用（研究任务）
- “解释认证系统的工作原理” → 请勿使用（分析任务）
- “查找项目中所有的 TODO 注释” → 请勿使用（信息收集）

## `exit_plan_mode` 示例

### 实现规划示例

```
exit_plan_mode(plan="## Implementation Plan for User Dashboard

### 1. Create Dashboard Components
- Create `UserDashboard.tsx` with main dashboard layout
- Add `DashboardStats.tsx` for displaying user statistics
- Implement `ActivityFeed.tsx` for recent user activities

### 2. Add API Integration
- Create `dashboardApi.ts` for dashboard data fetching
- Add endpoints for user stats and activity data
- Implement error handling and loading states

### 3. Update Routing
- Add dashboard route in `App.tsx`
- Update navigation component with dashboard link
- Add route protection for authenticated users

### 4. Testing and Documentation
- Write unit tests for dashboard components
- Add integration tests for API calls
- Update user documentation with dashboard features

This implementation will take approximately 4-6 hours and requires changes to 8-10 files.")
```

### 重构方案示例

```
exit_plan_mode(plan="## Database Layer Refactoring Plan

### Phase 1: Setup and Configuration
- Install and configure TypeORM dependencies
- Create database connection configuration
- Set up entity definitions for existing models

### Phase 2: Migration
- Create migration scripts for existing data
- Implement new repository pattern using TypeORM
- Replace raw SQL queries with TypeORM query builder

### Phase 3: Testing and Validation
- Update all database tests to use TypeORM
- Validate data integrity after migration
- Performance testing to ensure no regressions

This refactoring will modernize our database layer while maintaining backward compatibility.")
```

## 用户响应处理

调用 `exit_plan_mode` 后，用户可以通过以下几种方式响应：

- **Proceed Once**：方案获得批准，将使用默认确认设置立即开始实现
- **Proceed Always**：方案获得批准，并为后续的编辑操作启用自动批准
- **Cancel**：方案被拒绝，系统将保持在计划模式以进行进一步规划

该工具会根据用户的选择自动调整批准模式，从而根据用户偏好简化实现流程。

## 重要注意事项

- **仅限计划模式**：仅当你当前处于计划模式时才应使用此工具
- **聚焦实现**：仅用于涉及编写或修改代码的任务
- **方案简洁**：保持方案聚焦且简洁——追求清晰明了，而非事无巨细
- **支持 Markdown**：方案支持 Markdown 格式，以提升可读性
- **单次使用**：在准备继续时，每个规划会话中应仅使用一次该工具
- **用户控制**：是否继续的最终决定权始终在用户手中

## 与规划工作流的集成

退出计划模式工具是更大规模规划工作流的一部分：

1. **进入计划模式**：用户请求或系统判定需要进行规划
2. **探索阶段**：分析代码库、理解需求、探索可行方案
3. **方案设计**：基于探索结果制定实现策略
4. **方案展示**：使用 `exit_plan_mode` 向用户展示方案
5. **实现阶段**：获得批准后，按计划进行实现

该工作流确保了深思熟虑的实现方案，并让用户对重大代码更改拥有控制权。
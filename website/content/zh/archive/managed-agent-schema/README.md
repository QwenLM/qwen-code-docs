# 已归档的 Managed Agent 数据库迁移


这些文件描述了在源提交 `18f80f56666a347a2b67b2ef98099cc58356b253` 处已退役的 63 表数据库。它们仅作为历史参考，不在运行时和测试类路径中。已归档的 Java 迁移和升级凭证不会由新环境执行。

唯一的活跃基线是 [`V1__managed_schema.sql`](../../../packages/managed-agent-server/src/main/resources/db/managed-schema/V1__managed_schema.sql)。Managed Server 和 Runtime Broker 消费同一个版本化资源，并要求数据库为空或具备经过结构验证的完整 32 表基线。旧版、不完整、外部或仅含历史的目录会在初始化写入之前被拒绝。重新初始化会验证目录；它不会回填或修复目录。

不存在旧数据迁移或就地升级。保留旧环境和数据库用于历史读取，在切换前停止其新的准入并结算进行中的工作，仅在新环境中创建新的 Session。在新数据存在之后进行回滚时，必须保留这些记录并从新数据库中提供服务。

已归档的测试保留了已退役迁移算法的凭证。活跃的替代测试验证全新初始化、不可变的现有行、类型化变体列、Hook 唯一性与索引化准入，以及对旧目录的拒绝。重复的 Broker `schema.sql` 已被移除，而非作为另一个 schema 权威保留。

PR #13642 的 retention V69 SQL 和 `RuntimeBrokerRetentionLegacyUpgradeTest.java` 保留了来自头部 `db4c37064b9f34d2aa879b23b0e894fbed0281e1` 的旧版 retention 索引/回执升级凭证。它们仅作为归档：活跃的 32 表 V1 基线已提供 retention 索引，其替代测试验证全新目录对等性和重复初始化时不可变的回执。V69 不是活跃的迁移，也不是版本保留。
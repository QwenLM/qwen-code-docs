# Migrações do banco de dados de Managed Agent arquivadas


Estes arquivos descrevem o banco de dados aposentado de 63 tabelas no commit `18f80f56666a347a2b67b2ef98099cc58356b253` de origem. Eles são referências históricas e estão fora dos classpaths de runtime e de teste. As migrações Java arquivadas e as witnesses de upgrade não são executadas pelo novo ambiente.

O único baseline ativo é [`V1__managed_schema.sql`](../../../packages/managed-agent-server/src/main/resources/db/managed-schema/V1__managed_schema.sql). O Managed Server e o Runtime Broker consomem esse mesmo recurso versionado e exigem um banco de dados vazio ou um baseline completo de 32 tabelas estruturalmente verificado. Um catálogo legado, parcial, estrangeiro ou apenas de histórico é rejeitado antes que as escritas de inicialização ocorram. A reinicialização valida o catálogo; ela não faz backfill nem reparo.

Não há migração de dados antigos nem upgrade in-place. Mantenha o ambiente e o banco de dados antigos para leituras históricas, interrompa novas admissões nele e liquide o trabalho em andamento antes do cutover, e crie novas Sessions apenas no novo ambiente. Um rollback após a existência de dados novos deve preservar e servir esses registros a partir do novo banco de dados.

Os testes arquivados preservam as evidências do algoritmo de migração aposentado. Substituições ativas verificam inicialização fresca, imutabilidade de linhas existentes, colunas variantes tipadas, unicidade de Hook e admissão indexada, e rejeição de catálogos antigos. O `schema.sql` duplicado do Broker foi removido em vez de mantido como outra autoridade de schema.

O SQL V69 de retenção do PR #13642 e o `RuntimeBrokerRetentionLegacyUpgradeTest.java` preservam as evidências antigas de upgrade de índice/recibo de retenção a partir do head `db4c37064b9f34d2aa879b23b0e894fbed0281e1`. Eles são apenas arquivados: o baseline V1 ativo de 32 tabelas fornece os índices de retenção, e seu teste substituto verifica a paridade fresca do catálogo e a imutabilidade de recibos em inicializações repetidas. O V69 não é uma migração ativa nem uma reserva de versão.
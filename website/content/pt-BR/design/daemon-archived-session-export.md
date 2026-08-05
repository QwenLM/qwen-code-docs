# Exportação de Sessões Arquivadas Qualificadas por Workspace

## Resumo

O daemon consegue exportar sessões persistidas ativas de um workspace registrado
selecionado, mas as transcrições arquivadas permanecem inacessíveis até serem
movidas de volta para o armazenamento ativo. Esta alteração adiciona uma
exportação de arquivadas somente leitura sem alterar o comportamento da
exportação ativa nem a máquina de estados do arquivamento.

O protocolo adiciona
`GET /workspaces/:workspace/session/:id/archive/export?format=html|md|json|jsonl`,
a capability incondicional `workspace_archived_session_export` e
`WorkspaceDaemonClient.exportArchivedSession`. A rota e a capability são
distintas da exportação ativa para que um daemon mais antigo não possa ignorar
a intenção de arquivamento e retornar uma transcrição ativa com o mesmo id.

## Contrato

O seletor resolve primeiro como um id exato de workspace registrado e depois
como um cwd absoluto canônico codificado para URL. O runtime selecionado deve
ser confiável; as verificações de seletor e de confiança precedem a validação
de sessão e de formato.

Apenas `chats/archive/<id>.jsonl` do workspace selecionado é elegível. A rota
não varre o armazenamento ativo nem outro workspace, não faz fallback para o
primário, não resolve um proprietário ao vivo, não chama uma ponte, não inicia
o ACP, não anexa um cliente nem carrega configurações. Sessões somente ativas
retornam `409 session_not_archived`, sessões ausentes retornam
`404 session_not_found`, arquivos ativos e arquivados simultâneos retornam
`409 session_conflict` e transições retornam `409 session_archiving`.

## Reutilização e Concorrência

`SessionService.loadArchivedSession` é a única nova superfície consumidora do
núcleo. Ela delega para a mesma lógica privada de reconstrução de
`loadSession`, porém lendo o caminho arquivado; chamadores existentes de
load/resume permanecem somente ativos. O daemon reutiliza os coletores de
exportação, formatadores, cabeçalhos de resposta e o parser de anexos do SDK
existentes, então exportações de arquivadas e ativas têm comportamento de
formato idêntico. Antes da reconstrução, o carregador somente de arquivadas
aplica o limite existente de 256 MiB para indexação de transcrição e retorna
`413 transcript_too_large` acima dele. A exportação ativa mantém seu contrato
sem limite já entregue.

A exportação retém o lease compartilhado existente do
`SessionArchiveCoordinator` durante toda a verificação de localização,
reconstrução da transcrição e operação de formatação. Arquivar, desarquivar e
excluir retêm leases exclusivos, então uma transição ou começa antes da
exportação e a rejeita, ou começa depois que o lease compartilhado é liberado.
O coordenador permanece conservadoramente indexado por id de sessão entre
workspaces.

## Compatibilidade e Verificação

A rota de exportação do workspace ativo, a capability
`workspace_session_export`, a exportação primária legada, as mutações de
arquivamento e o layout de persistência permanecem inalterados. Chamadores
diretos do SDK recebem o erro HTTP normal quando o novo método tem como alvo um
daemon mais antigo.

Os testes cobrem anúncio de capability, seletores por id e cwd, todos os
formatos, metadados de anexos, estados ativo/ausente/conflito/transição,
precedência de confiança, isolamento de workspace com mesmo id, ausência de
atividade de ponte, ambas as direções de travamento, reconstrução de
arquivadas no núcleo, atribuição de telemetria e transporte REST nativo do
SDK. Os testes de tamanho aceitam o limite exato de arquivadas e rejeitam um
arquivo esparso um byte acima dele antes da materialização da transcrição.

# Lease de Gravador de Manutenção de Sessão do Daemon

## Problema

O daemon pode excluir, arquivar ou desarquivar uma transcrição persistida após o
seu proprietário ACP no processo ter fechado. Um processo de daemon diferente ainda
pode ser proprietário da mesma transcrição, então apenas o coordenador de
arquivamento no processo não impede que o daemon entre em corrida com um gravador
externo.

O caminho da transcrição e o caminho do lock de gravador também devem ser
resolvidos a partir do mesmo runtime do workspace. Fazer fallback para o runtime
primário do daemon pode modificar um workspace enquanto verifica um lock em outro.

## Escopo

Esta alteração cobre a manutenção de propriedade do daemon:

- Requisições REST e ACP de exclusão, arquivamento e desarquivamento
- limpeza de desconexão e de órfãos
- rollback de tarefa agendada e limpeza de keepalive
- desligamento do daemon enquanto a manutenção já está em execução

Ela não adiciona expiração de lease, heartbeat, recuperação baseada em hostname,
roubo automático, desbloqueio forçado ou migração de esquema de lock. Gravadores
que não participam do protocolo de lease ainda exigem cercamento de gravador único
no nível da plataforma.

## Vinculação de armazenamento do runtime

Cada `WorkspaceRuntime` resolve um diretório base absoluto de runtime de sessão na
criação. A resolução mantém a prioridade existente:

1. `QWEN_RUNTIME_DIR`
2. `advanced.runtimeOutputDir`, resolvido em relação ao workspace
3. o diretório de runtime normal do Qwen

O diretório resolvido é armazenado no runtime e injetado como `QWEN_RUNTIME_DIR`
em cada child ACP gerenciado. O recarregamento de ambiente pode atualizar outros
valores, mas preserva este valor fixado porque alterar `runtimeOutputDir` exige
uma reinicialização do runtime.

As operações pai do daemon que listam, leem, exportam, organizam ou mantêm sessões
são executadas dentro do contexto de armazenamento do runtime selecionado. Falhas
de resolução do runtime não fazem fallback para o runtime primário.

## API de lease

`SessionService.acquireSessionWriterLease()` deriva tanto a raiz do lock de
gravador quanto o caminho da transcrição ativa da instância fixa de `Storage` do
serviço. Os chamadores fornecem apenas o ID da sessão, o tipo de processo, a
versão e a política de reclaim. IDs de sessão inválidos são rejeitados antes que o
diretório de lock seja tocado.

A manutenção do daemon sempre usa `processKind: 'daemon'` e
`reclaimPolicy: 'never'`. O esquema de lock existente, a chave, o registro de
proprietário e o protocolo de aquisição/liberação permanecem inalterados.

## Protocolo de manutenção

Cada sessão é processada independentemente:

1. Entra no coordenador de arquivamento exclusivo por sessão do daemon.
2. Fecha o proprietário local. O arquivamento exige o fechamento do agente; a
   exclusão usa o fechamento rápido normal. Um proprietário local ausente é
   permitido.
3. Classifica o estado persistido e preserva os resultados existentes de não
   encontrado e idempotentes sem criar um lock.
4. Adquire o lease de gravador do daemon.
5. Reclassifica enquanto mantém o lease.
6. Verifica a propriedade e o fingerprint da transcrição, então executa uma
   mutação.
7. Libera o lease com verificação do token de proprietário.

Requisições em lote podem processar sessões independentes concorrentemente, mas um
worker mantém no máximo um lease entre processos e nunca espera enquanto mantém
múltiplos leases.

Uma mutação com falha permanece como o erro reportado quando a liberação tem
sucesso. Uma falha de liberação ou de propriedade é o erro externamente seguro
mesmo que a mutação também tenha falhado. Os logs registram o workspace, a sessão,
a ação, o tipo de erro e se a mutação da transcrição chegou ao disco; eles nunca
incluem tokens de proprietário ou caminhos de lock. A reconciliação de tarefa
agendada segue a mutação real da transcrição, não se a liberação do lease
subsequentemente teve sucesso.

A limpeza de órfãos primeiro fecha o proprietário local e respeita
`requireZeroAttaches`. Um proprietário recém-anexado, portanto, impede a exclusão.
A limpeza de late-spawn aguarda o fechamento antes de adquirir o lease e excluir a
transcrição.

## Desligamento

`SessionArchiveCoordinator.sealMaintenanceAndWait()` rejeita sincronicamente novas
manutenções exclusivas e aguarda as operações exclusivas já admitidas. Leituras
compartilhadas da transcrição não são incluídas, então uma exportação longa não
consome o orçamento de término. REST retorna `503 daemon_draining`; ACP retorna um
erro de servidor JSON-RPC com `data.errorKind = daemon_draining`.

O desligamento do daemon sela a manutenção antes do desmonte de child/processo e
conclui somente após os leases de manutenção admitidos terem sido liberados.

## Compatibilidade e lançamento

Os formatos de resposta em lote e a idempotência existente de
arquivar/excluir/desarquivar permanecem inalterados. Conflitos locais de
`session_archiving` de pré-verificação (levantados por `assertNotTransitioning`
antes da admissão) ainda surgem como um `409` no nível da requisição. Conflitos
levantados dentro do gate de admissão são reportados por sessão no corpo da
resposta `200` (`errors[]`) igualmente para arquivar, desarquivar e excluir.
Gravadores de versão mista não são seguros, então a implantação e o rollback devem
drenar o daemon antigo e os processos ACP gerenciados antes de iniciar a nova
versão.

## Verificação

Os testes usam raízes de runtime temporárias reais para contenção de gravador e
isolamento de raiz, cobrem mudanças de estado entre as classificações inicial e
bloqueada e verificam fechamento, mutação, liberação, reconciliação de tarefa
agendada e ordem de desligamento. Testes unitários também cobrem IDs inválidos,
IDs duplicados, conflitos ativo/arquivado, falhas de liberação de lease,
reanexação de órfão e ocultação de dados sensíveis no log. Testes de pacote
relevantes, build e typecheck são necessários antes do merge.

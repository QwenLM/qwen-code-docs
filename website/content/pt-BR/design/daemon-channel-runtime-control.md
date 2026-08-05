# Controle de Runtime de Canais do Daemon

## Resumo

Adiciona controle de estado desejado em runtime para workers de canal
gerenciados pelo daemon. Um daemon pode iniciar sem `--channel` e depois
habilitar, substituir, inspecionar, recarregar e parar sua seleção de canais
sem reiniciar o daemon. Alterações em runtime não são persistidas; a próxima
inicialização do daemon ainda segue `--channel`.

A camada de controle fica acima da implementação de workers agrupados por
workspace. Ela é dona da seleção confirmada, serializa mutações de ciclo de
vida, preserva o lease do serviço de canal pertencente ao serve e reconcilia
apenas grupos de workspace cuja seleção ordenada mudou.

## Contrato público

`GET /workspace/channel` retorna a seleção confirmada, uma seleção pendente
opcional, a transição atual e snapshots dos workers anotados com o workspace.

`PUT /workspace/channel` aceita:

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

ou `{ "selection": { "mode": "all" } }`. Seleções nomeadas são aparadas e
desduplicadas sem ordenação. Uma seleção vazia é inválida. `all` permanece
restrito ao workspace primário no modo multi-workspace.

`DELETE /workspace/channel` desabilita idempotentemente a seleção em runtime.
`POST /workspace/channel/reload` permanece disponível e relê as configurações
para a seleção confirmada. Mutações usam o gate estrito de token bearer.

A capability `channel_control` anuncia o recurso. `channel_reload` continua a
ser anunciada apenas enquanto o gerenciador tiver uma seleção confirmada e
recarregável.

## Ciclo de vida

O gerenciador expõe snapshots imutáveis e envia todas as mutações por uma
única fila FIFO. Uma atualização de seleção verifica previamente a propriedade
e a confiança do workspace antes de parar workers. Entradas de workspace
inalteradas são retidas. Entradas alteradas e removidas param antes que as
substitutas iniciem, enquanto o daemon mantém o lease global do serviço de
canal.

Se uma substituição falhar, o gerenciador tenta parar as entradas recém
iniciadas e reiniciar as entradas anteriores. Os clientes inspecionam
`rolledBack`, `rollbackError` e `state`, pois a limpeza ou a restauração
também podem falhar. Uma falha em observar a saída do filho após SIGKILL é uma
falha de parada definitiva: o supervisor retém a referência do filho, o
gerenciador retém o lease do serviço e nenhum substituto é gerado.

Callbacks de workers carregam uma geração. Callbacks de entradas substituídas
podem registrar log, mas não podem atualizar o pidfile atual nem o estado de
roteamento. Uma confirmação bem-sucedida troca a seleção, a configuração de
webhook e o mapa de workers juntos, e então reescreve o snapshot completo do
pidfile.

A conexão parcial de adaptador preserva o comportamento existente: um worker
está pronto quando pelo menos um canal solicitado conecta. Resultados de
controle reportam `partial`, e o status do daemon continua a emitir
`channel_worker_partial_connect`.

## Compatibilidade

O `--channel` da inicialização usa o mesmo gerenciador, mantendo a reserva de
lease antes do listen e o comportamento de pronto antes do sucesso. Sem
`--channel`, o daemon não reserva o serviço de canal nem carrega o runtime
pesado de canais até a primeira mutação em runtime.

O `runtime.channelWorker` legado, o agrupado `runtime.channelWorkers`, os
campos do pidfile, o `qwen channel start` standalone e o
`qwen channel reload` permanecem compatíveis. O novo controle via CLI é
exposto através de `qwen channel set`, mais variantes remotas de parada e
status de canal.

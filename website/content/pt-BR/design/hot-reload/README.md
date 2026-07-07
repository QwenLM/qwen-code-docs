# Plano Geral de Hot Reload

Este diretório rastreia o trabalho de design para a issue
[#3696](https://github.com/QwenLM/qwen-code/issues/3696): um sistema abrangente
de hot reload para skills, extensões, servidores MCP, servidores LSP e configuração
de runtime.

## Objetivo

Os usuários devem ser capazes de atualizar skills, estado de extensões, configuração
de MCP/LSP e configurações suportadas sem reiniciar a sessão atual do Qwen Code. O
sistema deve preservar o contexto da conversa, tornando as alterações de estado em
runtime previsíveis e visíveis.

## Divisão das Sub-tarefas

O plano de hot reload possui **6 sub-tarefas de nível superior**. A issue de
rastreamento atual divide a sub-tarefa 3 em **3a** e **3b** para maior clareza na
implementação, portanto, a checklist de execução contém **7 itens**.

| Tarefa | Escopo                                    | Status                   | Documento de design                                                      |
| ---- | ---------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| 1    | Detecção de alteração em arquivo de configurações           | Concluída em #4933            | [settings-change-detection.md](./settings-change-detection.md)       |
| 2    | Melhorias no hot reload de skills            | Concluída via #2415 e #3923 | Não está neste diretório                                                |
| 3a   | Reinicialização em runtime de servidores MCP     | Em andamento via #5561    | [mcp-runtime-reinitialization.md](./mcp-runtime-reinitialization.md) |
| 3b   | Reinicialização em runtime de servidores LSP     | Em andamento              | [lsp-runtime-reinitialization.md](./lsp-runtime-reinitialization.md) |
| 4    | Orquestração unificada de refresh/cache      | Não iniciada              | Pendente                                                              |
| 5    | Comando slash `/reload` para o usuário      | Não iniciado              | Pendente                                                              |
| 6    | Notificação de estado do app/UI `needsRefresh` | Não iniciada              | Pendente                                                              |

## Mapeamento de Documentos

- `settings-change-detection.md` corresponde à **sub-tarefa 1: Detecção de alteração
  em arquivo de configurações**. Ele fornece a infraestrutura de watcher: detecta
  alterações suportadas em `settings.json`, recarrega as configurações do disco e
  notifica os listeners. Intencionalmente, não envia valores atualizados para os
  snapshots de `Config` nem reinicia subsistemas de runtime.
- `mcp-runtime-reinitialization.md` corresponde à **sub-tarefa 3a: Reinicialização em
  runtime de servidores MCP**. Ele consome eventos de alteração de configurações,
  atualiza a configuração de MCP em runtime e reconcilia incrementalmente as conexões
  MCP ativas. A issue original agrupou MCP e LSP na sub-tarefa de nível superior 3;
  este documento cobre apenas a parte do MCP.
- `lsp-runtime-reinitialization.md` corresponde à **sub-tarefa 3b: Reinicialização em
  runtime de servidores LSP**. Ele monitora alterações no `.lsp.json` do workspace,
  reutiliza o cliente LSP nativo existente e reconcilia incrementalmente os servidores
  LSP ativos.

## Ordem de Implementação

1. Mantenha a sub-tarefa 1 como base: as alterações de configurações são detectadas e
   despachadas, mas os consumidores decidem o que atualizar.
2. Conclua a sub-tarefa 3a para que adições, remoções e edições de configuração de
   servidores MCP possam ter efeito em runtime.
3. Adicione a sub-tarefa 3b para a reinicialização em runtime de LSP usando o mesmo
   princípio: atualizar a configuração em runtime, parar os servidores afetados e
   reiniciar apenas o que foi alterado.
4. Introduza a sub-tarefa 4 como a camada de orquestração compartilhada para
   refreshes de cache e runtime em skills, comandos, prompts, extensões, MCP e LSP.
5. Adicione a sub-tarefa 5 como o ponto de entrada manual do usuário: `/reload` deve
   chamar o caminho de orquestração unificado e relatar o que foi alterado.
6. Adicione a sub-tarefa 6 para a UX de alterações em background: defina
   `needsRefresh` quando uma alteração detectada não puder ou não deva ser aplicada
   totalmente de forma automática, e então solicite ao usuário que execute `/reload`.

## Princípio de Design

Mantenha cada camada com escopo restrito:

- o file watching detecta e reporta alterações de configurações;
- a reinicialização de subsistemas atualiza apenas o estado de runtime afetado;
- a orquestração unificada sequencia as operações de refresh existentes;
- os comandos e notificações da UI expõem o comportamento sem duplicar a lógica de
  reload.
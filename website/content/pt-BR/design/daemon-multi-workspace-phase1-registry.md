# Registro da Fase 1 de Multi-Workspace do Daemon

## Resumo

A Fase 1 introduz o registro interno de runtime único para `qwen serve`, além das duas salvaguardas agora destacadas na issue #6378: identidade com escopo do daemon e tratamento de entrada repetível para `--workspace`. O daemon ainda atende exatamente a um workspace primário. O comportamento de rotas/APIs permanece inalterado, exceto pelo fato de que múltiplos valores explícitos de `--workspace` agora geram um erro claro em vez de seguir o antigo caminho de workspace único. O nome do arquivo de log do daemon e o ID da instância do serviço de telemetria também mudam intencionalmente de uma identidade com escopo de workspace para uma com escopo de daemon; as notas de lançamento do PR devem destacar essa migração.

O registro é o futuro limite interno para o rollout de multi-workspace da issue #6378, mas esta etapa evita intencionalmente a expansão de protocolo/esquema e não habilita o comportamento de CLI para multi-workspace.

## Design

- `WorkspaceRuntime` encapsula os objetos atuais de serve de workspace único: `workspaceCwd`, `AcpSessionBridge`, `DaemonWorkspaceService`, a factory de sistema de arquivos de rotas REST e o registro atual de remetentes client-MCP.
- `WorkspaceRegistry` expõe apenas `primary`, `list()` e a busca exata `getByWorkspaceCwd()`.
- `createServeApp` constrói a stack existente de bridge/service/fsFactory primeiro e depois a encapsula como o runtime primário.
- Os `app.locals.fsFactory` e `app.locals.boundWorkspace` existentes permanecem no lugar para as rotas de arquivo atuais. `app.locals.workspaceRegistry` é aditivo.
- Os módulos de rota mantêm suas assinaturas atuais. A camada de montagem do servidor agora passa os valores de `workspaceRegistry.primary`.
- Os nomes dos arquivos de log do daemon e os IDs de instância do serviço de telemetria têm escopo de daemon (`serve-<pid>.log`, `daemon:<pid>`). O hash do workspace permanece como um atributo nos registros de log/telemetria, em vez de fazer parte da identidade do daemon.
- `runQwenServe` aceita o possível formato de runtime do yargs onde `workspace` é um array. Um valor único ainda se comporta como o workspace único existente; múltiplos valores geram um erro na inicialização até que o suporte a multi-workspace seja habilitado.

## Limites

- Ainda não há suporte para `--workspace` repetível; valores repetidos são rejeitados.
- Nenhum `workspaces[]` em `/capabilities` ou no status do daemon.
- Nenhuma alteração nos tipos do SDK.
- Nenhuma rota no plural `/workspaces/:workspace/...`.
- Nenhum índice de propriedade de sessão, env overlay, `maxTotalSessions` ou comportamento de worker ACP/voice/channel qualificado por workspace.

## Notas de Auditoria

A factory de sistema de arquivos de rota é nomeada `routeFileSystemFactory` porque a produção atualmente distingue o acesso a arquivos da bridge do acesso a arquivos de rotas REST. O registro não deve colapsar esses limites.

`ClientMcpSenderRegistry` permanece como o mapa atual de daemon único com escopo de processo nesta fase. O runtime armazena apenas a instância existente; o isolamento client-MCP com escopo de workspace é uma preocupação posterior de multi-workspace.

`SessionArchiveCoordinator` e `WorkspaceRememberTaskLane` permanecem como colaboradores atuais da montagem do servidor. Eles não são responsabilidades principais do registro na Fase 1.

O middleware de telemetria do daemon agora resolve o cwd do workspace no momento da requisição, mesmo que a Fase 1 ainda sempre resolva para o primário. Isso preserva o comportamento atual, evitando um closure de hash do workspace primário que estaria incorreto assim que as rotas qualificadas por workspace forem implementadas.

## Verificação

Testes direcionados cobrem a busca exata no registro, exposição de locals do `createServeApp`, preservação da factory de sistema de arquivos de rota injetada, comportamento de locals de rotas de arquivo existentes, identidade de log/telemetria com escopo de daemon, hash de workspace no momento da requisição, formatos de `--workspace` único/repetido do yargs, o caminho de array de workspace único e a proteção de inicialização para `--workspace` repetido. A verificação final deve executar os testes focados de serve, além do build e typecheck do repositório.
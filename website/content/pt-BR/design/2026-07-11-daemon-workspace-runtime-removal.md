# Remoção de Runtime de Workspace do Daemon

## Contexto

O registro de workspaces em runtime e o registro persistente já estão disponíveis, mas esquecer um registro persistente não descarrega a bridge ativa, a montagem ACP, o estado de admissão de sessão ou a memory lane. Este design adiciona remoção a quente síncrona para runtimes secundários, preservando a API existente de esquecimento de registro.

## Escopo e invariantes

- Apenas runtimes secundários registrados dinamicamente e restaurados da persistência são removíveis. O primário e todos os runtimes de `--workspace` são estáticos.
- `DELETE /workspaces/:workspace` remove o runtime e todos os aliases persistentes conhecidos. Ele nunca remove arquivos de workspace, configurações, transcripts, arquivos ou outros dados de projeto.
- A remoção sem force é observacional: se o runtime congelado tiver atividade, todos os gates são revertidos e a requisição retorna `409 workspace_busy`. A remoção com force encerra essa atividade.
- A persistência é confirmada antes da limpeza destrutiva. Uma falha do armazenamento restaura o runtime ativo. Falhas de limpeza após o commit do armazenamento não conseguem reverter a operação e usam encerramento síncrono da bridge como fallback.
- Um cwd removido permanece reservado até que a limpeza seja concluída, e então pode ser registrado novamente com uma nova bridge, dispatcher ACP, registro de conexões e memory lane.

## Protocolo

Daemons de produção anunciam `workspace_runtime_removal` quando o controlador de remoção está instalado. As linhas de workspace de capability adicionam `removable` opcional; clientes e daemons antigos permanecem compatíveis.

`DELETE /workspaces/:workspace` usa o seletor existente de workspace-id-ou-cwd-canônico e aceita um corpo JSON opcional contendo um booleano `force`. O sucesso retorna a identidade removida, se force foi solicitado, se algum alias persistente foi removido e o snapshot final de atividade após o drenamento. Uma requisição sem force que já está observavelmente ocupada pode retornar um snapshot anterior ao drenamento sem gatear brevemente o runtime. O `DELETE /workspace-registrations/:id` existente permanece apenas como esquecimento.

## Ciclo de vida

O registry rastreia runtimes ativos, drenando e removidos. A resolução pública vê apenas runtimes ativos; a resolução de gerenciamento retém runtimes drenando para relato de conflitos e reserva de cwd.

A remoção primeiro obtém um snapshot rápido de atividade. Em seguida, marca sincronicamente o registry como drenando, fecha a admissão de sessões por workspace e drena a montagem ACP e a memory lane. O snapshot final lê as reservas de sessão pendentes antes das contagens de bridge ao vivo, de modo que uma transição de reserva para sessão não possa aparecer como ociosa. Uma requisição ocupada sem force reverte os gates. Caso contrário, todos os IDs de registro conhecidos são excluídos atomicamente, o trabalho de memória enfileirado é falhado, o iniciador de sub-sessão e a bridge são parados, a montagem ACP é descartada, os índices de propriedade são limpos e a entrada do registry é concluída.

A limpeza de runtime é memoizada por identidade de runtime, não por cwd, para que um runtime posterior registrado no mesmo caminho não possa reutilizar uma promessa de limpeza antiga. O encerramento do daemon sela as operações de gerenciamento, espera que elas convirjam, para os iniciadores e então usa o mesmo caminho de desmonte de bridge para os runtimes gerenciados restantes.

## Identidade de persistência

A restauração registra o ID de cada caminho armazenado bruto antes da canonização. Múltiplos aliases brutos que resolvem para um único runtime são retidos como um conjunto de IDs único, incluindo aliases sombreados por um workspace explícito de inicialização. A remoção exclui esse conjunto mais o ID de registro canônico sob um único lock de armazenamento, sem alterar o schema.

## UI

O Web Shell expõe a remoção apenas quando tanto a feature tag quanto `removable: true` estão presentes. A ação permanece disponível para workspaces não confiáveis. A primeira confirmação realiza uma requisição sem force; `workspace_busy` renderiza as contagens de atividade e oferece remoção com force. O force é desabilitado quando a sessão atual pertence ao workspace alvo. O sucesso reconcilia capabilities e listas de sessões e faz fallback para o workspace primário quando necessário.

## Análise de falhas e compatibilidade

Desconexões de cliente e timeouts do SDK não cancelam a limpeza do lado do servidor. Operações concorrentes de adição, promoção de persistência e remoção são serializadas por cwd canônico. O encerramento rejeita novas operações de gerenciamento com `daemon_shutting_down` e espera o trabalho já iniciado. Clientes antigos ignoram o campo opcional de capability e a feature; daemons antigos continuam a produzir um `DaemonHttpError` normal para a rota ausente.

O grupo de workers de canal com escopo de workspace fornece atividade e desmonte através de um adapter fino. O drenamento bloqueia recarga e roteamento de webhook para o workspace alvo; a remoção confirmada para e desregistra apenas esse worker, para que o status do daemon e o metadata do pidfile convirjam sem afetar outros workspaces.

## Verificação

A cobertura de testes unitários tem como alvo as transições de estado do registry e limpeza de owner, rollback de drenamento de admissão, exclusão em lote de aliases, comportamento das rotas busy/force/falha de armazenamento, idempotência do reason de encerramento da bridge, cancelamento de memory lane, codificação de requisição do SDK e guards de feature e force do Web Shell. O plano E2E está em `.qwen/e2e-tests/workspace-runtime-removal.md`.

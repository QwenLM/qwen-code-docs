# Status e detalhes do agente em segundo plano

## Problema

Uma chamada de ferramenta do Agent retorna assim que um agente em segundo
plano é lançado. Seu bloco de transcrição, portanto, tem um evento de
ferramenta terminal cujo payload diz `status: background`. O Web Shell
mapeia intencionalmente esse resultado de lançamento de volta para um cartão
de ferramenta pendente, mas nada depois reconcilia o cartão com o registro de
tarefas em segundo plano ao vivo. A lista de tarefas do rodapé atinge um
estado terminal enquanto o cartão original do Agent permanece em execução.

Agentes em primeiro plano já abrem no painel de detalhes de subagente
compartilhado. Agentes em segundo plano têm o mesmo `toolUseId`, entrada de
registro de tarefa, transcrição JSONL e resolvedor de sessão virtual, mas este
caminho não tem cobertura explícita.

## Design

Manter a projeção de lançamento inalterada: um resultado de lançamento com
`status: background` permanece pendente até que o estado autoritativo da
tarefa chegue. O daemon já emite notificações terminais de agente em segundo
plano pelo fluxo SSE da sessão com o `status` da tarefa e o `toolUseId`. O
Web Shell consome esses metadados de notificação ocultos e os reconcilia de
volta no cartão de ferramenta Agent projetado.

- `completed` e `cancelled` concluem o cartão.
- `failed` falha o cartão.
- O timestamp da notificação se torna o horário de término do cartão.
- Notificações sem `toolUseId`, notificações que não são de agente e chamadas
  de ferramenta não relacionadas não mudam diretamente as mensagens.

O provedor de detalhes de subagente existente permanece o único caminho de UI.
Cartões de Agent em segundo plano continuam clicáveis enquanto pendentes e
após a reconciliação terminal. O resolvedor de sessão virtual continua a fazer
streaming do JSONL da tarefa e obter o status ao vivo do registro de tarefas
sem filtrar por modo primeiro plano/segundo plano. Para tarefas legadas sem
`toolUseId`, ele corresponde o registro de lançamento ao sidecar persistido e
mantém um status terminal do sidecar quando o resultado de lançamento em
segundo plano original ainda diz `running`.

Enquanto o trabalho desacoplado está ativo, seu cartão na lista principal usa
um rótulo estático dedicado `background task` em vez do rótulo `running` de
primeiro plano. O cartão não usa o shimmer de execução nem um cronômetro de
tempo decorrido em andamento. Notificações terminais substituem esse rótulo
pela apresentação normal de concluído, falho ou cancelado.

Agentes em segundo plano são omitidos da barra de status inferior porque seu
progresso está disponível no cartão clicável e no painel de detalhes. Eles
permanecem no painel de Tarefas completo. Outros tipos de tarefa em segundo
plano, incluindo comandos de shell, permanecem na barra de status inferior e
mantêm seu polling existente. Um Agent em segundo plano sozinho não ativa o
polling de tarefas da barra inferior.

Registros de notificação persistidos nem sempre retêm um `toolUseId`. Quando
uma transcrição carregada contém um cartão de Agent em segundo plano ativo, o
Web Shell, portanto, resolve cada cartão pendente através do endpoint de
subagente existente após o catch-up da transcrição. Ele repete essa
verificação única após uma reconexão e quando qualquer notificação terminal de
Agent chega, mesmo se essa notificação não consegue identificar o cartão
diretamente. Ele nunca inicia um intervalo. Foco de entrada e streaming normal
não mudam os IDs de chamada de Agent pendentes nem a chave de notificação
terminal e, portanto, não disparam outra requisição.

O painel de detalhes acoplado expande a partir da borda direita para que o
chat seja empurrado para a esquerda continuamente em vez de ser redimensionado
antes de um movimento de painel separado. Preferências de movimento reduzido
desabilitam a animação acoplada. As abas do painel mantêm uma largura fixa,
truncam títulos longos e rolam horizontalmente quando a lista de abas excede o
espaço disponível.

## Escopo

Esta mudança atualiza a projeção do Web Shell e o resolvedor de status de
subagente virtual do daemon. Ela não reescreve transcrições de pai
persistidas, não altera o ciclo de vida da tarefa, não adiciona polling de
tarefas para agentes em segundo plano, não remove agentes do painel de Tarefas
completo nem adiciona um segundo visualizador de subagente.

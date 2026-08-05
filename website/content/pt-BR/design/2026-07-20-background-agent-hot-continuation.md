# Continuação a Quente de Agentes em Background

## Contexto

Um subagente em background concluído atualmente perde seu runtime em processo.
Um `send_message` posterior reconstrói um novo `AgentHeadless` a partir da
transcrição JSONL. Isso preserva a maior parte do histórico de conversa
visível, mas recria o chat, a superfície de ferramentas, os registries por
agente e o estado de cache do lado do provider.

O caminho de lançamento também constrói agentes comuns em background duas
vezes: uma vez com o emitter do pai e novamente com o emitter dedicado de
background. A primeira instância nunca é executada nem descartada.

Este design trata do ciclo de vida dentro da sessão. A descoberta lógica e a
continuação após a restauração da sessão pai são tratadas separadamente pelo
design de restauração de roster de agentes em background.

A distinção é comportamental, não apenas um detalhe de implementação. Dentro de
uma sessão, a revivificação por transcrição já preserva a conversa visível ao
modelo, então a continuação a quente evita principalmente a reconstrução do
runtime e preserva o estado do provider/ferramentas. Através de uma
restauração da sessão pai, o runtime original em memória não pode sobreviver ao
encerramento do processo. A continuidade lógica, portanto, vem da restauração
da identidade da tarefa e da transcrição na nova sessão, seguida de uma
reconstrução fria.

## Objetivos

- Criar um único runtime para um novo agente comum em background.
- Manter esse runtime residente após um turno bem-sucedido.
- Continuar uma tarefa concluída no mesmo chat e na mesma superfície de
  ferramentas preparada.
- Preservar a linha de tarefa atual, o ID da tarefa, os eventos de
  início/conclusão por turno e as notificações terminais.
- Manter a revivificação por transcrição como fallback quando não existir um
  runtime residente compatível.
- Liberar recursos residentes em falha, cancelamento, shutdown/reset de sessão,
  expulsão de entrada terminal, mudança de diretório de trabalho, troca de
  branch e fechamento/dispose de sessão ACP.
- Reivindicar atomicamente a entrada enfileirada na janela de finalização antes
  de publicar uma conclusão bem-sucedida.

## Não objetivos

- Persistir um runtime ao vivo entre processos ou restauração da sessão pai.
- Adicionar um valor `idle` à união compartilhada de status de tarefa.
- Mudar como mensagens enviadas a um agente ativamente em execução são injetadas
  entre rodadas de ferramentas.
- Tornar agentes fork persistentes.
- Estender o tempo de vida de worktrees temporários através de turnos
  concluídos.
- Tornar hooks de frontmatter registrados globalmente seguros para permanecer
  instalados enquanto um agente está ocioso.

## Design

### Runtime headless reutilizável

`AgentHeadless` mantém seu `GeminiChat` e as declarações de ferramentas
preparadas como estado da instância. Seu `execute()` público permanece uma
operação por turno:

- apenas uma chamada pode rodar por vez;
- o texto final e o modo de terminação são reiniciados no início; as
  estatísticas são reiniciadas para uma nova instrução do pai, mas permanecem
  cumulativas entre retries internos de stop-hook dessa instrução;
- a primeira chamada cria o chat e prepara as ferramentas;
- chamadas posteriores anexam um novo turno de usuário ao mesmo chat e emitem
  um evento de mensagem externa para que a transcrição JSONL permaneça
  completa.

Isso mantém os hooks existentes do `AgentHeadless`, telemetria, drenagem de
mensagem externa e contrato de resultado terminal. `AgentInteractive` não é
usado porque sua API de fila não fornece o resultado de conclusão por turno e a
semântica de notificação exigidos por tarefas em background.

### Controlador residente

`BackgroundTaskRegistry` possui uma tabela de controladores em memória chaveada
por ID de tarefa. O controlador é intencionalmente separado do `AgentTask`, que
permanece um registro serializável de UI/status.

Um controlador pode:

- iniciar uma continuação a partir de uma linha concluída;
- abortar e descartar seu runtime.

Em um `send_message` com tarefa concluída, a ferramenta primeiro pergunta ao
registry por uma continuação residente. Um acerto muda sincronamente a linha
existente de volta para `running`, reivindica um slot normal de execução em
background e agenda o novo turno depois que o turno anterior se liquidar
completamente. Um erro de acerto usa o serviço existente de revivificação por
transcrição.

`completed` continua significando "o último turno foi concluído". A residência
do runtime é um fato interno de implementação, então o status compartilhado de
tarefa e a UI não ganham um novo estado idle.

### Recursos por turno e residentes

Cada continuação recebe um novo abort controller, par de hooks
SubagentStart/Stop, span de trace, evento de início de tarefa, notificação de
conclusão e transição de status do sidecar. Um runtime que precisaria de um
lease de permissão AUTO apenas para filhos não é retido porque esses leases não
têm contagem de referência entre subagentes concorrentes.

O chat, as ferramentas preparadas, o escritor JSONL, os listeners de eventos, o
registry de ferramentas com escopo de agente e os recursos MCP por agente
permanecem vivos enquanto o controlador está residente. O dispose é idempotente.

O limite existente de retenção de entradas terminais também limita os
controladores residentes. Podar uma linha descartar seu controlador. Reset e
shutdown do registry descartam todos os controladores, incluindo os já
concluídos.

### Exclusões de compatibilidade

A primeira versão retém apenas agentes comuns nomeados em background que:

- foram concluídos normalmente;
- não usam `isolation: "worktree"`;
- não declaram hooks de frontmatter;
- não requerem um lease de permissão AUTO apenas para filhos.

Worktrees temporários são atualmente finalizados após cada turno, então reter
um runtime deixaria seu Config apontando para um diretório removido. Hooks de
frontmatter são atualmente registrados globalmente por seu tempo de vida, então
retê-los enquanto ociosos poderia afetar trabalho não relacionado. Leases AUTO
apenas para filhos mutam o gerenciador de permissões do pai e não têm contagem
de referência entre subagentes concorrentes, então readquiri-los a cada turno
quente seria inseguro. Agentes com hooks, isolados por worktree e AUTO apenas
para filhos continuam pelo fluxo existente de revivificação JSONL. O agente de
worktree reconstruído roda a partir do diretório de trabalho atual do pai
porque seu worktree temporário de lançamento já foi finalizado.

## Corridas e tratamento de falhas

- Imediatamente antes de um runtime compatível publicar a conclusão
  bem-sucedida, o turno ativo drena a fila do registry sem ceder. Se ele
  reivindicar entrada, o mesmo runtime headless executa essa entrada e a tarefa
  permanece em execução. Se a fila estiver vazia, a persistência da transcrição
  e a transição de running para completed acontecem sincronicamente, então um
  `send_message` posterior observa a linha concluída e usa o caminho de
  continuação residente em vez de receber um reconhecimento de enfileiramento
  enganoso. Turnos isolados por worktree realizam sua drenagem final antes do
  teardown porque seu runtime é intencionalmente não continuável depois.
- O registry realiza a transição de completed para running sincronamente antes
  que a promise de continuação seja agendada. Um segundo `send_message`
  concorrente, portanto, observa `running` e usa a fila de mensagens
  dentro-da-rodada existente.
- O próximo turno é encadeado após a promise do turno anterior, cobrindo a
  janela na qual a notificação de conclusão é emitida antes que o bloco
  `finally` anterior tenha terminado.
- Turnos com falha e cancelados removem e descartam o controlador residente.
- Se a reivindicação de um slot de background falhar, a linha permanece
  concluída e o chamador pode usar o caminho de erro existente de revivificação
  fria.
- Dispose durante um turno ativo aborta seu controlador e adia a limpeza
  destrutiva de recursos para o finalizador do turno.

## Validação

Testes unitários devem provar:

- um novo lançamento em background cria exatamente um `AgentHeadless`;
- dois turnos sequenciais usam um `GeminiChat` e uma lista de ferramentas
  preparada;
- `send_message` com tarefa concluída prefere o controlador residente;
- a ausência de um controlador residente ainda invoca a revivificação por
  transcrição;
- a segunda instrução do usuário está presente no JSONL;
- reset, shutdown/cancelamento e poda terminal descartam exatamente uma vez.
- `/branch` recusa trabalho em background em execução e descarta residentes
  terminais apenas depois que o branch foi inicializado com sucesso;
- mudanças de diretório de trabalho e dispose de sessão ACP liberam runtimes
  residentes.

O cenário E2E usa um ID de tarefa para duas fases concluídas e verifica que a
segunda fase lembra de um nonce da primeira. A identidade física do runtime é
verificada por testes unitários porque o stream JSON não expõe contagens de
construtor.

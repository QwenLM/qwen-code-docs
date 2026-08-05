# Recuperação de falha de sessão e design do serviço unificado de recuperação

## 1. Objetivos de design

O Serviço de Recuperação é a camada de decisão unificada para recuperação de
sessão. Ele lê o histórico de sessão recuperado, classifica o estado atual de
recuperação, constrói os reparos de protocolo e payloads de continuação
necessários para prosseguir, e expõe o mesmo resultado para a TUI, daemon, SDK
e entrypoints headless.

As capacidades existentes incluem:

- Armazenamento de sessão JSONL apenas de acréscimo.
- Carregamento de sessão e reconstrução de histórico de API.
- Reparo de `tool_use` / `tool_result` órfãos.
- Detecção de interrupção em três estados.
- Entrypoints de continuação para headless, controle nonInteractive e ACP.

O principal problema hoje não é que a capacidade de recuperação está
inteiramente ausente. O problema é que:

- Decisões de recuperação estão espalhadas por múltiplos entrypoints.
- TUI / daemon / SDK não veem o mesmo estado de recuperação.
- O reparo acontece implicitamente em um nível baixo e não é visível para
  usuários ou clientes.
- Qualquer estado futuro de recuperação precisaria ser conectado repetidamente
  a múltiplos entrypoints.

Os objetivos de um Serviço de Recuperação unificado são:

- Classificação unificada: todo entrypoint usa o mesmo plano de recuperação.
- Reparo unificado: todo entrypoint reutiliza o mesmo reparo de par de
  ferramentas e classificação de interrupção.
- Visibilidade unificada: TUI / daemon / SDK podem todos dizer se uma
  retomada é limpa, interrompida ou degradada.
- Dados de depuração unificados: reparos, resultados sintetizados e descartes
  são expostos como saída estruturada para exibição e logs.
- Testes unificados: os mesmos fixtures de falha podem cobrir o plano central
  e cada adaptador de entrypoint.

## 2. Design central: Serviço de Recuperação

Adicionar um serviço central:

```text
packages/core/src/core/session-recovery.ts
```

Ele não renderiza UI e não executa ferramentas. Sua única responsabilidade é
produzir um `SessionRecoveryPlan` determinístico a partir da transcrição da
sessão e do histórico de chat atual.

Tipos sugeridos:

```ts
export type SessionRecoveryKind =
  | 'clean'
  | 'interrupted_prompt'
  | 'interrupted_turn'
  | 'degraded_history';

export type RecoveryRepair =
  | { type: 'synthesized_tool_result'; callId: string; name: string }
  | { type: 'dropped_duplicate_tool_result'; callId: string; name: string }
  | { type: 'history_gap'; childUuid: string; missingParentUuid: string };

export interface SessionRecoveryPlan {
  planId: string;
  sessionId: string;
  kind: SessionRecoveryKind;
  originalApiHistory: Content[];
  apiHistory: Content[];
  repairs: RecoveryRepair[];
  canContinue: boolean;
  canAutoContinue: boolean;
  requiresUserConfirmation: boolean;
  visibleNotice?: string;
  continuation?: {
    mode: 'retry_user_parts' | 'tool_result_parts';
    parts: Part[];
    displayText: string;
  };
}
```

Entrypoint sugerido:

```ts
export function buildSessionRecoveryPlan(input: {
  sessionId: string;
  conversation: ConversationRecord;
  historyGaps?: HistoryGap[];
  options?: {
    allowAutoContinue?: boolean;
  };
}): SessionRecoveryPlan;
```

Fluxo central:

1. Construir `originalApiHistory` a partir de `ConversationRecord`.
2. Se existem `historyGaps` não ignoráveis, classificar a sessão como
   `degraded_history`.
3. Executar `detectTurnInterruption` sobre `originalApiHistory`. Isso deve
   acontecer antes do reparo. Caso contrário, um `model[functionCall]` pendente
   seria primeiro fechado por um `functionResponse` sintético, tornando
   impossível classificar o estado como `interrupted_turn`.
4. Clonar `originalApiHistory` para um histórico seguro para provider,
   executar o `repairOrphanedToolUseTurns` existente sobre o clone e armazenar
   o resultado em `plan.apiHistory`.
5. Construir o payload de continuação a partir da classificação:
   - `interrupted_prompt`: reproduzir as partes de usuário finais com
     semântica de Retry.
   - `interrupted_turn`: fechar chamadas de ferramenta pendentes com partes
     `functionResponse` de erro sintéticas.
6. Produzir `visibleNotice` e `repairs` para exibição e depuração de UI /
   daemon / SDK.

Compatibilidade de nomenclatura:

- Continuar usando a string pública de protocolo existente
  `interrupted_turn`; não adicionar `interrupted_tool_turn`. O controle
  nonInteractive, o ACP e os testes existentes já dependem de
  `interrupted_turn`, e o Serviço de Recuperação não deve adicionar custo de
  migração.

## 3. Papel e valor do Serviço de Recuperação

### 3.1 Robustez

Um serviço unificado transforma o comportamento atual de recuperação implícito
e disperso em uma máquina de estados explícita.

Estado atual:

- A inicialização de retomada repara entradas `tool_use` órfãs, mas os
  entrypoints nem sempre sabem que o reparo aconteceu.
- Headless / ACP podem continuar, mas a TUI não sabe o que dizer ao usuário.
- Lacunas de cadeia de pai já têm tratamento visível parcial:
  `SessionService.loadSession` retorna `historyGaps`, e TUI / ACP podem exibir
  avisos de lacuna. No entanto, ainda não há metadados de recuperação
  unificados ou política consistente de modo seguro.

Depois de introduzir o Serviço de Recuperação:

- Toda retomada primeiro produz um estado explícito: `clean`,
  `interrupted_prompt`, `interrupted_turn` ou `degraded_history`.
- Qualquer entrypoint pode decidir se continua, notifica ou degrada com base
  no mesmo plano.
- Lacunas de histórico não são silenciosamente tratadas como histórico limpo.
- Se novos estados de recuperação forem adicionados depois, apenas a construção
  do plano precisa ser estendida; nenhum entrypoint precisa reimplementar a
  lógica.

O ganho de robustez é que a recuperação passa de "cada lugar repara um pouco
conforme necessário" para "cada recuperação tem um resultado de classificação
unificado".

### 3.2 Segurança

O maior risco de segurança na recuperação é repetir automaticamente ações com
efeitos colaterais, como comandos de shell, escritas de arquivo ou chamadas de
API externas.

Princípios de segurança do Serviço de Recuperação:

- Não reproduzir automaticamente ferramentas desconhecidas por padrão.
- Converter chamadas de ferramenta pendentes em partes `functionResponse` de
  falha por padrão, e deixar o modelo decidir se retenta.
- `interrupted_turn` usa por padrão `requiresUserConfirmation = true` a menos
  que o chamador opte explicitamente.
- `degraded_history` nunca é continuado automaticamente.
- Todos os reparos sintéticos são incluídos em `repairs` para logs e
  depuração.

Isso prioriza:

- Providers não recebem histórico inválido.
- Usuários não repetem ações perigosas por causa da lógica de recuperação.
- TUI / SDK podem mostrar claramente quais resultados de ferramenta foram
  sintetizados como falhas de recuperação.

O valor de segurança é que a recuperação não retoma a execução cegamente. Ela
primeiro repara a forma do protocolo, então continua com política
conservadora.

### 3.3 Completude

Este design não resolve imediatamente todo cenário de falha. Ele foca nos
estados que as capacidades atuais podem classificar de forma confiável.

Cobertos imediatamente:

- Retomada limpa.
- Prompt de usuário final: `interrupted_prompt`.
- Submissão de resultado de ferramenta final: também classificado como
  `interrupted_prompt` e reproduzido com Retry.
- Chamada de ferramenta pendente: `interrupted_turn`, com resultados de
  ferramenta de erro sintéticos.
- Resultado de ferramenta não adjacente: o reparo existente o eleva para uma
  posição legal. A primeira versão deste plano não registra detalhes de
  elevação separadamente a menos que a API de reparo seja depois estendida
  para retorná-los.
- Resultado de ferramenta duplicado: descartar o duplicado.
- Lacuna de cadeia de pai: `degraded_history`.

Ainda não cobertos:

- Um stream de texto de modelo que desconecta no meio, mas deixa uma cauda que
  parece texto comum de modelo.
- Distinção refinada entre abort gracioso e falha desconhecida.

A completude aqui não vem de adicionar uma grande quantidade de código de uma
vez. Ela vem de consolidar as capacidades atuais em um plano unificado para que
os estados que podem ser classificados hoje sejam tratados de forma
consistente.

### 3.4 Arquitetura de engenharia

O Serviço de Recuperação deve viver no core, e não na CLI, TUI, daemon ou
qualquer entrypoint único.

Motivos:

- `SessionService`, `buildApiHistoryFromConversation`, reparo de `GeminiChat`
  e `detectTurnInterruption` estão todos no core ou camadas adjacentes ao
  core.
- TUI / headless / ACP / daemon / SDK são adaptadores.
- Classificação de recuperação é lógica de domínio, não lógica de renderização
  de UI.

Camadas sugeridas:

```text
SessionService
  Read JSONL, rebuild ConversationRecord, return historyGaps

SessionRecoveryService
  Build RecoveryPlan from ConversationRecord + historyGaps

GeminiClient / GeminiChat
  Consume plan.apiHistory to initialize chat
  Execute plan.continuation when needed

TUI / headless / ACP / daemon / SDK
  Display plan.visibleNotice
  Trigger continuation from user or API requests
```

Benefícios desta divisão em camadas:

- O core é dono dos fatos e decisões.
- A UI é dona da exibição.
- O daemon / SDK são donos da saída de protocolo.
- Testes podem exercitar o plano central diretamente sem inicializar uma TUI
  completa.

### 3.5 Visibilidade e depurabilidade

O plano produzido pelo Serviço de Recuperação deve ser conversível em dois
tipos de saída:

1. Aviso visível ao usuário:

```text
The previous session stopped after tool execution. Marked 2 unfinished tool
calls as failed so the history can be sent safely. You can continue the task;
the model will decide whether to retry based on the failure results.
```

2. Log de depuração ou registro de sistema opcional:

```ts
type RecoveryDebugPayload = {
  planId: string;
  kind: SessionRecoveryKind;
  repairs: RecoveryRepair[];
  timestamp: string;
};
```

Essa informação não entra no histórico de API. É apenas para diagnóstico,
exportação e depuração. Persisti-la como um registro de sistema pode ser
adiado e não é um requisito rígido deste design.

Valor:

- Usuários sabem o que aconteceu durante a recuperação.
- Clientes SDK podem mostrar o estado exato.
- Relatórios de bug podem incluir `planId` e `repairs`.
- É menos provável que a mesma cauda interrompida seja continuada
  automaticamente múltiplas vezes.

## 4. Integração de entrypoint

### 4.1 TUI

Após `/resume` ou inicialização com `--resume`:

1. `SessionService.loadSession(sessionId)`.
2. `buildSessionRecoveryPlan(...)`.
3. `config.startNewSession(sessionId, sessionData, recoveryPlan)`, ou um
   mecanismo equivalente para reter o plano.
4. Carregar o histórico da UI.
5. Se `plan.kind !== 'clean'`, inserir um item INFO.
6. Fornecer `/continue` ou uma ação "Continuar turno interrompido".

A TUI não continua automaticamente `interrupted_turn` / `degraded_history`
por padrão.

### 4.2 Controle headless / nonInteractive

`continueInterrupted` ou `continue_last_turn` não chamam mais detectores
dispersos diretamente. Em vez disso:

1. Construir um plano a partir do histórico de chat atual ou da conversa
   retomada.
2. Se `plan.canContinue = false`, retornar no-op.
3. Se a continuação é permitida, executar `plan.continuation`.

### 4.3 ACP / daemon

Adicionar metadados de recuperação à resposta de `loadSession` /
`resumeSession`:

```ts
{
  recovered: boolean;
  recoveryKind: SessionRecoveryKind;
  canContinue: boolean;
  requiresUserConfirmation: boolean;
  repairs: {
    type: string;
    count: number;
  }
  [];
}
```

`continueLastTurn` deve também aceitar / rejeitar com base no plano, então
revalidar imediatamente antes da execução.

### 4.4 SDK

A integração de SDK precisa distinguir duas categorias:

- SDK apoiado em daemon: consome metadados de recuperação das respostas de
  daemon `loadSession` / `resumeSession`, mostra um banner de recuperação e
  permite que o usuário ou a aplicação host dispare a continuação.
- SDK apoiado em processo: inicia a CLI por meio de `ProcessTransport` e usa
  os flags `--resume` / `--continue`. Ele precisa de metadados de recuperação
  equivalentes expostos por meio de uma mensagem de sistema stream-json ou um
  campo de protocolo de SDK.

Nenhuma categoria de SDK deve entender diretamente o JSONL de nível baixo ou o
reparo de par de ferramentas. Elas devem apenas consumir o resultado de
recuperação estruturado exposto pela camada de entrypoint, e devem bloquear a
continuação automática em estados degradados.

## 5. Design de testes unitários

O Serviço de Recuperação deve ter testes unitários independentes que não
dependem da TUI ou de um provider real.

Fixtures centrais:

1. Histórico limpo:
   - Cauda de texto de modelo.
   - Chamada de ferramenta completa + resultado de ferramenta + modelo final.

2. `interrupted_prompt`:
   - A última entrada é texto de usuário.
   - A última entrada é um grupo de partes functionResponse de usuário.
   - Múltiplas entradas de usuário finais.

3. `interrupted_turn`:
   - functionCall de modelo sem functionResponse.
   - Múltiplos functionCalls com apenas alguns completados.
   - functionCall sem id é pulado.

4. Reparo:
   - functionResponse não adjacente é elevado e o histórico seguro para
     provider é legal.
   - functionResponse duplicado é descartado.
   - A forma do resultado de ferramenta sintético permanece consistente com o
     reparo existente.

5. `degraded_history`:
   - `historyGaps` não é vazio.
   - Confirmar `canAutoContinue = false`.
   - Confirmar que `visibleNotice` inclui informação de lacuna.

6. Checkpoint de compactação:
   - A cauda após a compactação mais recente é detectada corretamente.
   - Registros de sistema não entram no histórico de API.

Testes de adaptador de entrypoint:

- A TUI insere um item INFO após receber um plano não limpo via `/resume`.
- O headless `continueInterrupted` usa a continuação do plano e não duplica a
  mensagem de usuário.
- O ACP `continueLastTurn` retorna o mesmo tipo de recuperação para o mesmo
  fixture.
- A resposta de `loadSession` do daemon inclui metadados de recuperação.

O objetivo central de teste é: o mesmo fixture de histórico deve produzir o
mesmo tipo de recuperação no core / TUI / ACP / daemon.

## 6. Conclusão

Um Serviço de Recuperação unificado é a mudança de maior valor nesta fase
porque ele sobretudo consolida capacidades existentes em vez de introduzir
muitos mecanismos novos imediatamente.

Seu valor direto:

- Torna o estado de recuperação consistente através de TUI / daemon / SDK /
  headless.
- Transforma o reparo existente de `tool_use` órfão de uma etapa implícita de
  prevenção de 400 em um plano de recuperação explícito.
- Transforma a continuação de turno interrompido de uma capacidade local de
  headless / ACP em uma capacidade central reutilizável.
- Fornece um ponto de extensão estável para estados futuros de recuperação.

Ele não resolve todo problema de falha sozinho, especialmente falhas no meio
do stream de texto. Este documento intencionalmente mantém essas extensões fora
de escopo desta rodada para evitar over-design. O objetivo atual é unificar as
capacidades de recuperação que já existem e podem ser classificadas de forma
confiável.

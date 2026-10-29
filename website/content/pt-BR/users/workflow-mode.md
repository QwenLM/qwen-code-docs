# Modo Workflow de sessão


O modo Workflow salva uma preferência para considerar a ferramenta Workflow para novas submissões comuns na sessão atual. O padrão é desativado. O modelo ainda decide se um workflow é útil, e todas as restrições de permissão, confiança, orçamento e ferramenta continuam a se aplicar. Ativar o modo não inicia uma execução, não altera o esforço de raciocínio e não altera suas configurações padrão.

As ferramentas de Workflow são opt-in. Ative `tools.workflowsEnabled` nas configurações ou defina `QWEN_CODE_ENABLE_WORKFLOWS=1` antes de ativar o modo:

```sh
QWEN_CODE_ENABLE_WORKFLOWS=1 qwen --workflow-mode on
qwen --resume <session-id> --workflow-mode off
```

Iniciar com `--workflow-mode on` enquanto as ferramentas estão indisponíveis falha a inicialização. `QWEN_CODE_DISABLE_WORKFLOWS=1` tem precedência sobre ativá-las.

Em qualquer renderizador de terminal, use `/workflows mode` ou
`/workflows mode status` para ler o estado, e `/workflows mode on` ou
`/workflows mode off` para alterá-lo. Esses controles de modo podem ser executados enquanto uma resposta
está em streaming; eles afetam as submissões elegíveis subsequentes. O rodapé mostra
`Workflow mode: on` ou `Workflow mode: on (unavailable)` se a preferência salva
não puder ser aplicada no momento. A lista de execuções `/workflows` e os controles de pausa
existentes mantêm seu comportamento original.

O estado separa `requested` (a preferência salva), `available` (as
ferramentas necessárias estão atualmente utilizáveis) e `effective` (ambos são verdadeiros).
Ativar requer que as ferramentas de Workflow estejam disponíveis. Desativar permanece
possível quando elas estão indisponíveis. Perder uma ferramenta não apaga uma preferência salva
de ativo; restaurar a ferramenta torna essa preferência efetiva novamente.

O modo é suportado por sessões locais comuns e sessões daemon normais,
incluindo proprietários secundários de workspace. Sessões gerenciadas, SSH, derivadas/subagente e
session-agent, e sessões com gravação de chat desativada, não
suportam alterações de modo. Sessões com protocolo não suportado não anunciam a
capability ou opção. Uma escrita com falha deixa o modo publicado inalterado.

## Comportamento de lembrete e entrada

A primeira submissão elegível recebe um lembrete apenas para o modelo. Sem outras
alterações, lembretes esparsos seguem nas submissões 11 e 21, depois a cada dez
submissões elegíveis. Desativar ou perder a capability envia um aviso de saída
na próxima submissão elegível. Apenas um dispatch real do modelo consome um
lembrete ou avança a contagem; cancelamento ou rejeição antes do dispatch
não. Tentativas de retry e fallback compartilham o mesmo token de entrega. Se
o cancelamento remover um lembrete de modo dispatchado do histórico do modelo, a próxima
submissão elegível anuncia o estado atual novamente.

Submissões CLI, SDK e ACP comuns podem usar este modo explícito sem uma
declaração de origem humana. Continuações de ferramenta, retries, hooks, prompts gerados por comando slash,
modo shell, consultas laterais, turnos automáticos de Goal/Cron/notificação/canal
e subagentes não adicionam um novo lembrete de modo nem avançam sua contagem.
A especulação de prompt é pausada enquanto o modo ou uma transição não entregue
precisar de contexto.

A [dica de palavra-chave de um turno](./workflow-intent.md) permanece separada. Seu requisito de
proveniência humana e configuração de opt-out permanecem inalterados. Uma palavra-chave válida
um lembrete de modo compartilham um envelope; desativar o modo persistente não
desativa uma palavra-chave válida de um turno. Um lembrete apenas de modo não ativa o
indicador transitório de palavra-chave nem a telemetria de palavra-chave.

## Ciclo de vida da sessão

O resume restaura o último registro booleano válido no ramo de transcrição
selecionado e anuncia um estado salvo de ativo ou desativado uma vez. Um valor inicial explícito de CLI ou SDK
sobrescreve esse valor restaurado uma vez, após a sessão estar pronta.
Valores iniciais conflitantes ou um valor inicial ativo enquanto as ferramentas de Workflow estão
indisponíveis falham a inicialização. Uma sessão nova ou limpa começa desativada. Um fork
herda seu checkpoint selecionado independentemente; o rewind preserva
a preferência atual e a ancora no ramo restaurado. Uma compactação
bem-sucedida reanuncia o estado na próxima submissão nova elegível.
Após um resume com falha ou uma troca de ramo reconstruir o histórico da sessão anterior,
a próxima submissão elegível reanuncia seu estado salvo. Uma sessão sem
preferência salva permanece silenciosa.

## TypeScript SDK e ACP

```ts
const session = query({
  prompt: messages(),
  options: { workflowMode: true },
});
const state = await session.getWorkflowMode();
await session.setWorkflowMode(false);
```

`workflowMode` é opcional: a omissão preserva um valor restaurado, enquanto `false`
salva explicitamente como desativado. A inicialização negocia e prepara o valor inicial;
`Query.initialized` é o handshake de controle. Operações get/set aguardam a
prontidão da sessão. Solicitações repetidas de inicialização são rejeitadas enquanto a
inicialização da sessão está em andamento. Uma CLI mais antiga rejeita uma solicitação explícita de modo
antes do primeiro prompt em vez de ignorá-la silenciosamente. Transportes personalizados usam o mesmo
protocolo de controle.

O ACP anuncia uma opção de configuração padrão `workflow_mode` com valores `on` e
`off`. Seu `currentValue` reflete o estado solicitado, enquanto
`_meta['qwen.workflowMode']` contém `available`, `effective` e um `reason` opcional.
Alterações confirmadas e atualizações de capability publicam as opções completas
via `config_option_update`.

Clientes daemon usam o endpoint de opção de configuração de sessão existente ou
`setSessionConfigOption(sessionId, 'workflow_mode', 'on', clientId)`. A opção
não aceita uma sobrescrita `persist`: ela é sempre persistente na sessão. A leitura
e as atualizações de contexto pertencem ao proprietário ativo daquela sessão, incluindo suas
verificações de lease e geração. Controles específicos de Web/IDE não estão incluídos
nesta implementação.
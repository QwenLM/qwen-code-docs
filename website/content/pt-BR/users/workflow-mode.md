# Modo Workflow de sessão


O modo Workflow salva uma preferência para considerar a ferramenta Workflow para
novas submissões ordinárias na sessão atual. O padrão é desativado. O modelo ainda
decide se um workflow é útil, e todas as restrições de permissão, confiança, orçamento e
ferramentas continuam a se aplicar. Ativar o modo não inicia uma execução, não altera o
esforço de raciocínio, nem altera suas configurações padrão.

As ferramentas Workflow são opt-in. Ative `tools.workflowsEnabled` nas configurações ou
defina `QWEN_CODE_ENABLE_WORKFLOWS=1` antes de ativar o modo:

```sh
QWEN_CODE_ENABLE_WORKFLOWS=1 qwen --workflow-mode on
qwen --resume <session-id> --workflow-mode off
```

Iniciar com `--workflow-mode on` enquanto as ferramentas não estão disponíveis falha na
inicialização. `QWEN_CODE_DISABLE_WORKFLOWS=1` tem precedência sobre ativá-las.

Em qualquer renderizador de terminal, use `/workflows mode` ou
`/workflows mode status` para ler o estado, e `/workflows mode on` ou
`/workflows mode off` para alterá-lo. Esses controles de modo podem ser executados
enquanto uma resposta está em streaming; eles afetam as submissões elegíveis
subsequentes. O rodapé mostra `Workflow mode: on`, ou `Workflow mode: on (unavailable)`
se a preferência salva não puder ser aplicada no momento. A lista de execuções
`/workflows` e os controles de pausa existentes mantêm seu comportamento original.

O estado separa `requested` (a preferência salva), `available` (as ferramentas
necessárias estão atualmente utilizáveis) e `effective` (ambos são verdadeiros).
Ativar requer que as ferramentas Workflow estejam disponíveis. Desativar permanece
possível quando elas não estão disponíveis. Perder uma ferramenta não apaga uma
preferência de ativação salva; restaurar a ferramenta torna essa preferência efetiva
novamente.

O modo é suportado por sessões locais ordinárias e sessões daemon normais,
incluindo proprietários secundários de workspace. Sessões gerenciadas, SSH,
derivadas/subagente e sessões de agente de sessão, e sessões com gravação de chat
desativada, não suportam alterações de modo. Sessões com protocolo não suportado não
anunciam a capability ou opção. Uma escrita com falha deixa o modo publicado
inalterado.

## Web Shell e VS Code

O compositor no Web Shell, painéis divididos e o chat moderno do VS Code lista
**Workflow** em seu menu **+** para sessões suportadas. A marca de seleção mostra a
preferência salva, não se o modo pode entrar em vigor no momento; em telas maiores,
uma segunda linha resume o que o modo faz ou seu estado atual. Enquanto a preferência
estiver ativada, a barra de ferramentas mostra um chip **Workflow**; seu tooltip
carrega os detalhes de status, e clicar nele desativa o modo. Se a preferência estiver
ativada mas as ferramentas não estiverem disponíveis, a entrada permanece marcada, o
chip é exibido na cor de aviso, e ambos ainda podem desativar o modo.

Antes de uma sessão ser criada ou restaurada, o controle mostra um placeholder de
disponibilidade. Ele não cria uma sessão nem salva uma preferência futura. Hosts que
não anunciam suporte, incluindo servidores mais antigos, ocultam a entrada. Hosts que
ocultam o menu **+** não mostram nem a entrada nem o chip.

Alterações de outro cliente atualizam o controle da mesma sessão automaticamente.
Durante uma escrita ou reconexão, o último valor confirmado permanece visível e a
entrada e o chip ficam desativados até que o estado seja confirmado. Um timeout é um
resultado não confirmado, não uma alteração bem-sucedida; o cliente lê o estado atual
em vez de repetir automaticamente a escrita. Uma resposta ativa não desativa a entrada
ou o chip: a alteração se aplica ao próximo turno novo e deixa o esforço inalterado.

## Comportamento de lembrete e entrada

A primeira submissão elegível recebe um lembrete apenas para o modelo. Sem outras
alterações, lembretes esparsos seguem nas submissões 11 e 21, depois a cada dez
submissões elegíveis. Desativar ou perder a capability envia um aviso de saída na
próxima submissão elegível. Apenas um dispatch real do modelo consome um lembrete ou
avança a contagem; cancelamento ou rejeição antes do dispatch não. Retentativas e
tentativas de fallback compartilham o mesmo token de entrega. Se o cancelamento
remover um lembrete de modo dispatchado do histórico do modelo, a próxima submissão
elegível anuncia o estado atual novamente.

Submissões CLI, SDK e ACP ordinárias podem usar este modo explícito sem uma declaração
de origem humana. Continuações de ferramenta, retentativas, hooks, prompts gerados por
slash, modo shell, consultas laterais, turnos automáticos de Goal/Cron/notificação/canal
e subagentes não adicionam um novo lembrete de modo nem avançam sua contagem. A
especulação de prompt é pausada enquanto o modo ou uma transição não entregue precisa
de contexto.

A [dica de palavra-chave de um turno](./workflow-intent.md) permanece separada. Seu
requisito de proveniência humana e configuração de opt-out não são alterados. Uma
palavra-chave válida e um lembrete de modo compartilham um envelope; desativar o modo
persistente não desativa uma palavra-chave válida de um turno. Um lembrete apenas de
modo não ativa o indicador transitório de palavra-chave nem a telemetria de
palavra-chave.

## Ciclo de vida da sessão

O resume restaura o último registro Booleano válido no branch de transcrição
selecionado e anuncia um estado salvo de ativado ou desativado uma vez. Um valor
inicial explícito de CLI ou SDK sobrescreve esse valor restaurado uma vez, após a
sessão estar pronta. Valores iniciais conflitantes ou um valor inicial de ativado
enquanto as ferramentas Workflow não estão disponíveis falham na inicialização. Uma
sessão nova ou limpa começa desativada. Um fork herda seu checkpoint selecionado
independentemente; o rewind preserva a preferência atual e a ancora no branch
restaurado. Uma compactação bem-sucedida reanuncia o estado na próxima submissão nova
elegível. Após um resume com falha ou troca de branch que reconstrói o histórico da
sessão anterior, a próxima submissão elegível reanuncia seu estado salvo. Uma sessão
sem preferência salva permanece silenciosa.

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
salva explicitamente como desativado. A inicialização negocia e prepara o valor
inicial; `Query.initialized` é o handshake de controle. Operações get/set aguardam a
prontidão da sessão. Solicitações de inicialização repetidas são rejeitadas enquanto a
inicialização da sessão está em andamento. Um CLI mais antigo rejeita uma solicitação
de modo explícita antes do primeiro prompt em vez de ignorá-la silenciosamente.
Transportes personalizados usam o mesmo protocolo de controle.

O ACP anuncia uma opção de configuração padrão `workflow_mode` com valores `on` e
`off`. Seu `currentValue` reflete o estado solicitado, enquanto
`_meta['qwen.workflowMode']` contém `available`, `effective` e um `reason` opcional.
Alterações confirmadas e atualizações de capability publicam as opções completas
através de `config_option_update`.

Clientes daemon usam o endpoint de opção de configuração de sessão existente ou
`setSessionConfigOption(sessionId, 'workflow_mode', 'on', clientId)`. A opção não
aceita uma sobrescrita `persist`: ela é sempre persistente na sessão. A leitura e
atualização de contexto pertencem ao proprietário ativo daquela sessão, incluindo
suas verificações de lease e geração. O Web Shell e o host moderno do VS Code consomem
esses mesmos controles e atualizações de sessão.
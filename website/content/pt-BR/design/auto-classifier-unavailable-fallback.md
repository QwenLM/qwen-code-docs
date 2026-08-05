# Fallback de classificador automático indisponível

## Problema

O Auto Mode atualmente converte toda falha de infraestrutura do classificador
em uma negação de execução. Um erro de rede, timeout, resposta estruturada
inválida, modelo rápido indisponível ou estouro de contexto, portanto, falha a
chamada de ferramenta pendente antes que o fluxo de confirmação padrão possa
perguntar ao usuário o que fazer.

Esse comportamento confunde dois resultados diferentes:

- Um bloqueio por política do classificador é um veredito de segurança e deve
  continuar negando a ação.
- Um resultado de classificador indisponível significa que nenhum veredito foi
  produzido e deve deixar o usuário tomar a decisão manualmente.

O fallback existente de indisponibilidade consecutiva só abre uma confirmação
após duas chamadas de classificador falhas. As primeiras falhas ainda
encerram suas chamadas de ferramenta, e o prompt não explica o problema de
infraestrutura nem oferece um caminho direto de recuperação.

## Objetivos

- Direcionar o primeiro resultado de classificador indisponível para o fluxo
  padrão de confirmação manual.
- Explicar na confirmação que o Auto Mode não conseguiu classificar a ação.
- Oferecer uma opção explícita que aprova a ação atual uma vez e muda a sessão
  para o Default Mode.
- Manter o comportamento de permissão do CLI e do ACP alinhado.
- Preservar bloqueios por política, regras de negação explícita, guards
  determinísticos de comando destrutivo e comportamento de cancelamento do
  usuário.

## Não objetivos

- Persistir o Default Mode em configurações de usuário ou de workspace.
- Mudar de modo automaticamente sem uma seleção do usuário.
- Mudar as regras de permissão/bloqueio do classificador de política.
- Tornar chamadas não interativas ou sessões em segundo plano capazes de
  apresentar um prompt quando não têm superfície de aprovação.

## Comportamento proposto

Quando o classificador retornar `unavailable: true`, a camada de permissão
ainda registrará o evento de indisponibilidade, mas retornará um resultado de
fallback manual em vez de um resultado bloqueado. A chamada pendente
continuará pelos caminhos existentes de PermissionRequest e confirmação.

A confirmação gerada carregará metadados de fallback do Auto Mode e suprimirá
escolhas persistentes de "sempre permitir". A confirmação mostrará que o
classificador está indisponível e recomendará o Default Mode se as falhas
continuarem. Suas escolhas incluirão:

- Permitir uma vez.
- Mudar para o Default Mode e permitir uma vez.
- Rejeitar.

A escolha de mudança é intencionalmente combinada com uma aprovação explícita
única. Um rótulo apenas de modo deixaria ambígua a disposição da ação já
pendente.

| Resultado do classificador | Comportamento atual        | Novo comportamento            |
| ----------------- | ----------------------- | ----------------------- |
| Permissão             | Executa automaticamente   | Sem alteração               |
| Bloqueio por política      | Nega com razão de política | Sem alteração               |
| Indisponível       | Nega a chamada de ferramenta      | Pergunta por aprovação manual |

## Fluxo de permissão do Core

`applyAutoModeDecision` registrará contadores de indisponibilidade e retornará
uma razão de fallback dedicada à indisponibilidade do classificador. Como o
resultado não é mais bloqueado, hooks PermissionDenied não dispararão para
falhas de infraestrutura; em vez disso, o hook PermissionRequest normal será
executado antes do prompt.

Os contadores de indisponibilidade permanecem úteis. Aprovar um fallback
redefine os contadores consecutivos, enquanto rejeitá-lo os preserva. Se
falhas repetidas atingirem o limite existente, chamadas posteriores elegíveis
para o classificador podem contornar o classificador sabidamente quebrado e ir
diretamente para a confirmação manual.

Os detalhes de confirmação ganharão metadados opcionais de fallback do Auto
Mode compartilhados entre as formas de confirmação edit, execute, info, MCP e
outras. Um novo resultado de aprovação representará "prosseguir uma vez e
mudar para Default". O agendador do CLI mudará o modo da sessão de runtime e
normalizará esse resultado para o `ProceedOnce` ordinário antes de invocar
callbacks de confirmação específicos da ferramenta ou registrar a decisão de
ferramenta.

`Config.setApprovalMode` já fornece a transição de sessão necessária: ele
restaura regras temporariamente removidas na entrada do Auto Mode, redefine os
contadores de negação e incrementa a revisão do modo de aprovação. Nenhum
arquivo de configurações é mudado.

## Apresentação no CLI

O componente de confirmação da TUI renderizará o aviso de fallback antes dos
detalhes da ação e adicionará a opção de mudança antes de Rejeitar. Os layouts
de confirmação completo e compacto ambos exporão a opção. A contagem de altura
deve reservar espaço para o aviso e a opção adicionados, para que terminais
pequenos continuem mostrando escolhas acionáveis.

## Apresentação no ACP

As requisições de permissão do ACP incluirão o aviso de fallback como conteúdo
de texto e exporão a mesma opção de mudar-e-permitir-uma-vez. Quando
selecionada, a sessão normalizará a aprovação da ferramenta para
`ProceedOnce`, mudará o modo de runtime para Default e publicará a
notificação de atualização de modo atual existente.

Clientes ACP que escolhem apenas Permitir ou Rejeitar continuam usando o
comportamento existente do protocolo.

## Fronteiras de falha

- O cancelamento pelo usuário da requisição do classificador permanece uma
  interrupção e não se torna um prompt de aprovação.
- Negações de permissão explícitas e bloqueios determinísticos de comando
  destrutivo permanecem erros.
- Chamadas não interativas sem um transporte de permissão e agentes em segundo
  plano que não podem emitir prompt ainda negam através do seu tratamento
  existente de fallback de confirmação manual.
- Uma revisão de política falha no Stage 2 do classificador é considerada
  indisponível e, portanto, pergunta ao usuário; um bloqueio de política do
  Stage 2 concluído permanece negado.

## Arquivos afetados

- `packages/core/src/permissions/autoMode.ts` e testes: mapeamento de
  indisponibilidade para fallback, metadados e gating de hook.
- `packages/core/src/tools/tools.ts`: metadados de confirmação de fallback e
  resultado de aprovação de mudança.
- `packages/core/src/core/coreToolScheduler.ts` e testes: decorar confirmações,
  rastrear resolução de fallback, mudar modos e normalizar a aprovação.
- `packages/core/src/telemetry/tool-call-decision.ts` e testes: classificar o
  novo resultado em forma de aprovação.
- `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` e
  testes: renderização do aviso e da opção.
- `packages/cli/src/acp-integration/session/permissionUtils.ts` e testes:
  conteúdo ACP e mapeamento de opção.
- `packages/cli/src/acp-integration/session/Session.ts` e testes: fallback ACP,
  transição de modo e notificação.
- `docs/users/features/auto-mode.md`: documentar o fallback manual imediato e a
  opção de recuperação do Default Mode.

## Questões em aberto

Nenhuma. A mudança é apenas da sessão e aprova explicitamente a ação pendente
uma vez.

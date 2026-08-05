# Subagentes fork com herança de contexto em headless

## Problema

Uma requisição explícita de `subagent_type: "fork"` é atualmente respeitada
apenas quando `Config.isInteractive()` é verdadeiro. Chamadores headless como
`qwen --prompt`, o SDK TypeScript e runners de CI executam silenciosamente um
novo subagente `general-purpose` em vez disso. Os modos de contexto solicitado
e efetivo, portanto, diferem, e o filho não recebe a conversa do pai.

## Design

A disponibilidade de fork é independente da superfície de apresentação. Uma
requisição de fork de nível superior sempre usa o caminho existente de
construção de fork, que copia o histórico do pai e a configuração de geração
segura para cache.

Forks headless passam pelo registry existente de agentes em background mesmo
quando `run_in_background` é omitido ou falso. Forks são destacados por
definição, e o registry fornece a chamadores não interativos o ciclo de vida de
que precisam:

- execução headless única espera o fork terminar;
- consumidores de stream recebem `task_started` e notificações terminais de
  tarefa;
- o `subagent_type: "fork"` efetivo é registrado em eventos, metadados e
  telemetria de subagente;
- requisições de permissão que não podem ser exibidas em uma sessão não
  interativa são negadas pela política existente de agentes em background em
  vez de ficarem penduradas.

O comportamento de fork interativo permanece inalterado.

Uma requisição de fork de um subagente aninhado ainda não é suportada, mas
agora falha com um erro explícito de ferramenta em vez de executar
silenciosamente um novo subagente `general-purpose`.

## Escopo

Esta mudança reutiliza o comportamento atual de fork com histórico completo.
Ela não adiciona seleção de histórico parcial como `fork_turns`; isso pode ser
introduzido separadamente sem bloquear a herança correta em headless.

## Verificação

- Testes de despacho do core cobrem forks interativos, forks headless, ciclo de
  vida forçado em background, construção de histórico herdado, comportamento de
  permissão e rejeição explícita de fork aninhado.
- O teste de CLI não interativo cobre o evento `task_started` voltado ao SDK e
  verifica que ele expõe `subagent_type: "fork"`.
- O teste do adaptador de SDK desktop verifica que o resultado de background do
  runtime tem precedência sobre um `run_in_background: false` fornecido pelo
  chamador.
- Uma verificação ponta a ponta
  `qwen --prompt --output-format stream-json` usa um marcador de pai ausente da
  diretiva de fork e verifica que o filho ainda consegue recuperá-lo do
  histórico herdado.

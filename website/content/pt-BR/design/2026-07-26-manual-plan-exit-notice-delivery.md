# Entrega de Aviso de Saída Manual do Plan

## Problema

O modo Plan é reforçado por um lembrete recorrente em turnos de usuário
destinados ao modelo. Quando o modo de aprovação muda fora do fluxo aprovado
de `exit_plan_mode`, meramente parar esse lembrete não é um sinal confiável de
que o modo Plan terminou.

O aviso único (one-shot) existente é montado em `GeminiClient` para turnos
UserQuery e Cron. Esse limite perde requisições de modelo enviadas por outros
caminhos, incluindo continuações de resultado de ferramenta, steering, hooks,
envios diretos de ACP/daemon e agentes interativos. Um único booleano pendente
em `Config` também permite que uma conversa consuma um aviso destinado a toda
conversa ao vivo que compartilha o modo.

## Escopo

A garantia se aplica a conversas ao vivo no processo atual. Ela não persiste
avisos entre reinícios de processo e não muda verificações de aprovação,
aprovação de plano ou execução de ferramentas.

Os avisos são habilitados para:

- o chat principal criado por `GeminiClient.startChat`, incluindo TUI,
  não interativo, ACP, daemon/Web UI e chats substitutos após compressão;
- chats criados por `AgentCore.createChat` com `interactive: true`.

Eles permanecem desabilitados para fork/especulação, agentes headless,
workflows, consultas laterais de memória e compactação, e todo outro
`GeminiChat` a menos que explicitamente habilitado.

## Estado e posse

`Config` mantém duas partes independentes de estado em memória:

- um evento de modo `{ version, kind }`, onde `kind` é `clear` ou
  `manual-exit`;
- um cursor de conversa `{ seenVersion }`.

O evento tem posse junto com o modo de aprovação. Um `Config` criado com
`Object.create(parent)` herda tanto o modo de aprovação do pai quanto o evento
atual. Na primeira escrita que cria um modo de aprovação próprio, ele copia o
evento atual e então se torna isolado de eventos posteriores do pai.

O cursor é sempre de posse lazy do `Config` receptor. A conversa principal e
cada agente interativo podem, portanto, reivindicar independentemente o mesmo
evento herdado. Recriar um chat com o mesmo `Config` retém seu cursor e não
entrega o evento novamente.

Transições de modo atualizam o evento da seguinte forma:

- de não Plan para Plan incrementa a versão e escreve `clear`;
- de Plan para não Plan incrementa a versão e escreve `manual-exit`, exceto um
  `exit_plan_mode` aprovado que escreve `clear`;
- de não Plan para não Plan não cria um evento.

Entrar no Plan limpa uma saída mais antiga não entregue. Uma entrega lê o modo
de aprovação mais recente, então uma troca posterior de não Plan para não Plan
muda o modo nomeado no aviso pendente sem criar outro aviso.

## Semântica de entrega e falha

`GeminiChat` expõe um opt-in idempotente. Em cada envio ele termina a
compressão assíncrona e as verificações de resgate forçado (hard-rescue), e
então reivindica sincronamente um evento pendente imediatamente antes de
commitar o conteúdo do usuário no histórico. O aviso é adicionado como a parte
de texto final, preservando quaisquer partes de resposta de função antes dele.

O ponto de linearização é o commit bem-sucedido no histórico contendo o aviso.
Retries e fallbacks do provider reutilizam essa requisição commitada e não
anexam um segundo aviso ao histórico. Se a configuração síncrona do envio
lançar exceção e reverter o push no histórico, a reivindicação é restaurada
apenas quando o mesmo evento de manual-exit ainda é o atual, o modo ainda é
não Plan e o cursor ainda aponta para aquela versão. Um evento de modo
posterior torna uma restauração antiga obsoleta e inofensiva.

A implementação não pode determinar se um provider recebeu uma requisição de
transporte falha. Um retry de transporte pode enviar a mesma requisição mais
de uma vez, mas o histórico do chat ao vivo contém o aviso no máximo uma vez.

A recuperação de estouro de contexto é a exceção à reutilização da requisição
original: a compressão reativa substitui o histórico ao vivo antes de
reconstruir o payload de retry. Se seu histórico comprimido não contém mais o
aviso commitado, o chat re-anexa aquele texto exato antes de tentar
novamente. Quando a compressão já termina em um turno de usuário, o aviso é
adicionado como sua última parte em vez de criar turnos de usuário adjacentes.

## Aviso

```text
<system-reminder>
The approval mode changed outside the approved exit_plan_mode flow.
The current approval mode is: ${currentMode}.
Plan mode is no longer active. This notice supersedes any earlier reminder that Plan mode is active. Do not call exit_plan_mode; no plan approval is pending. Continue under the current mode's permissions and confirmation requirements.
</system-reminder>
```

## Verificação

Testes unitários cobrem semântica de transição, posse de evento herdado,
cursores de conversa independentes, comportamento de restauração obsoleta,
entrega por opt-in, ordenação de partes, rollback de configuração, retries,
recriação de chat e posse de chat. O plano de E2E cobre PTY, ACP, agentes
interativos e saídas de plano aprovadas.

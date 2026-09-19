# Goals

Um Goal mantém o Qwen Code trabalhando entre turnos até que uma condição declarada seja atendida. Defina um com `/goal <objetivo>`, e a sessão continua por conta própria. Cada turno é registrado como evidência; quando o modelo propõe que o objetivo está completo ou bloqueado, um verificador independente julga essa proposta apenas com base na evidência. A sessão para quando o verificador aceita, ou quando o Goal é pausado, limpo ou interrompido por um limite.

## Comandos

| Comando                  | Comportamento                                                 |
| ------------------------ | ------------------------------------------------------------- |
| `/goal`                  | Mostrar o Goal atual e seu status.                            |
| `/goal <objetivo>`       | Criar um Goal ou substituir o ativo.                          |
| `/goal set <objetivo>`   | Mesmo que o acima, forma explícita.                           |
| `/goal edit <objetivo>`  | Revisar a redação do Goal ativo sem recomeçar.                |
| `/goal pause` / `resume` | Parar ou continuar o loop sem perder o Goal.                  |
| `/goal clear`            | Remover o Goal.                                               |
| `/goal-draft <intent>`   | Fazer o objetivo ser escrito para você antes de defini-lo (abaixo). |

Criar, editar ou retomar um Goal requer um workspace confiável (`/trust`). O uso headless é coberto no [Modo Headless](./headless.md#run-a-persistent-goal).

Assim que um Goal fatura um turno, a pill do rodapé e cada cartão de status mostram o que ele gastou em relação à janela permitida, como `1.2k/30.0m`. O número conta as chamadas de modelo que o Goal faz em seus próprios turnos; subagentes e as próprias verificações do verificador não estão incluídos. A janela é definida por [`model.goalTokenBudget`](../configuration/settings.md); retomar um Goal que gastou sua janela concede outra por cima do que já foi gasto, então o número lê `30.0m/60.0m` em vez de recomeçar. Um Goal sem orçamento mostra apenas o que gastou. Um Goal que ainda não faturou um turno não mostra números.

Cada turno que a sessão executa por conta própria reporta o que o Goal gastou até agora, quantos turnos estão atrás dele e — a menos que o Goal execute sem limites — a janela que lhe é permitida. Cada turno desse, exceto a passagem final de encerramento, também carrega instruções permanentes para re-verificar o workspace em vez de confiar nos relatórios de turnos anteriores, para trabalhar em direção ao estado final que o objetivo pede, para fazer algo diferente quando o turno anterior não mudou nada (a partir do segundo turno, uma vez que haja um turno anterior para julgar), e para verificar cada requisito contra evidência citável antes de propor que o Goal está concluído.

Um Goal longo comprime periodicamente a evidência que registrou em afirmações de checkpoint com uma chamada de modelo lateral, para que turnos posteriores e o verificador ainda possam citá-la. Essa chamada é limitada por [`model.goalCheckpointTimeoutSeconds`](../configuration/settings.md), 180 segundos por padrão. Se suas afirmações excederem o orçamento agregado de bytes ou incluírem uma afirmação acima do limite de caracteres por afirmação, ela faz uma chamada de modelo corretiva e ambas compartilham esse teto. Uma verificação que não termina a tempo é abandonada como inconclusiva; ela conta para o limite de estagnação de checkpoint apenas quando a janela de evidência transbordou, enquanto uma verificação sem transbordamento preserva a sequência e tenta novamente em um turno posterior. A chamada é feita em streaming, então o timeout de transporte por requisição limita apenas a conexão e a primeira resposta, e o próprio teto para no limite de vida de 15 minutos dos guardas de streaming, porque além disso é o guarda, não a configuração, que encerra a chamada. Esse limite de 15 minutos na configuração é fixo, e aumentar o próprio teto do guarda de streaming não o eleva.

Um checkpoint com falha aparece antes de interromper o Goal. Enquanto a sequência de estagnação de um Goal ativo está em andamento, a pill do rodapé muda sozinha para `checkpoint N/3 stalled`; quando o Goal pausa ou para, a pill mostra esse status. A faixa de status do Goal no Web Shell mostra a contagem independentemente do status. Sempre que um cartão de status terminal do Goal é renderizado, por exemplo por `/goal` ou por um cartão de pausa, retomada ou verificador, ele mostra quantas verificações consecutivas estagnaram das três que o Goal permite, junto com a última falha enquanto houver uma registrada; o diálogo de Goals do Web Shell e a saída de texto do `/goal` headless mostram a mesma linha, enquanto os cartões de transcrição do Web Shell para eventos de Goal mostram apenas o motivo da interrupção, e o modelo vê ambos os campos ao ler o Goal. Uma verificação que falha enquanto a janela ainda tem espaço também é exibida, sem gastar uma estagnação, mas apenas enquanto o Goal está ativo, ou quando essa falha é o que interrompeu o Goal, como com uma requisição de checkpoint grande demais para ser enviada. Uma interrupção de checkpoint por qualquer outro motivo limpa a falha e mantém a sequência, e um Goal concluído não mostra linha de checkpoint. A falha é mantida como uma única linha com caracteres de controle removidos. Um Goal interrompido por três checkpoints estagnados nomeia o que o último encontrou. Uma verificação que não coube na janela dentro dos limites de afirmações de checkpoint, seja uma lista completa de afirmações que ainda deixou evidência para trás ou afirmações acima do orçamento de contagem ou tamanho de afirmações, significa que o objetivo produz mais evidência do que uma janela comporta, então delimite-o. Uma resposta que não pôde ser convertida em afirmações significa que o modelo de checkpoint não está retornando a saída estruturada solicitada, e delimitar o objetivo não corrige isso. Uma verificação que nunca respondeu pode indicar um provedor inacessível ou com limite de taxa, uma verificação que não terminou dentro de `model.goalCheckpointTimeoutSeconds`, ou um erro na própria verificação; a falha registrada diz qual. Retomar após qualquer uma das três inicia uma janela de evidência fresca.

## Interrompendo um Goal

Cancelar um turno do Goal pausa o Goal. Pressione Esc enquanto o modelo está respondendo ou enquanto suas ferramentas ainda estão executando, e o turno para, o Goal vai para `paused`, e o cartão e `/goal` dizem por que parou. Nada continua até que você execute `/goal resume`.

Digitar uma mensagem enquanto um Goal está ativo não o pausa. Sua mensagem executa como o próximo turno do Goal, então use-a para direcionar o trabalho; use `/goal pause` ou `/goal clear` para pará-lo.

Cada pausa declara seu motivo: que você o interrompeu, que você executou `/goal pause`, que o limite de tokens da sessão bloqueou a próxima requisição ao modelo, que o turno falhou, ou que três turnos consecutivos não registraram nada que o verificador pudesse julgar e nenhuma proposta — leituras de contabilidade do Goal (`get_goal`, `update_goal`) não contam como progresso. Um Goal parado por um limite mantém o motivo desse limite.

## Como um Goal é julgado

O verificador nunca executa comandos nem lê arquivos por conta própria. Ele só vê o que já está na transcrição:

- Saídas visíveis do assistente e resultados de ferramentas contam como evidência. O texto do objetivo, seus prompts e o raciocínio oculto do modelo não contam.
- Texto impresso prova apenas que texto foi impresso. Uma afirmação de que testes passaram, que um arquivo foi alterado ou que um remote foi atualizado precisa do resultado de ferramenta correspondente na transcrição.
- Uma afirmação de que você confirmou, escolheu ou aprovou algo precisa de uma mensagem real sua; o verificador rejeita propostas que assumem isso.
- Quando a evidência está faltando, o veredito é "ainda não", não "concluído". Uma condição que ninguém pode evidenciar mantém o loop em execução até que um limite o pare.

Portanto, o objetivo tem que fazer o agente produzir evidência: executar a verificação nomeada e mostrar a saída decisiva.

## Escrevendo um bom objetivo

Inclua estes itens no objetivo, nesta ordem:

| Parte        | O que escrever                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Outcome:`   | Uma frase: o que é verdadeiro quando isso estiver concluído.                                                                            |
| `Done when:` | Verificações binárias numeradas. Pelo menos uma nomeia um comando e seu código de saída ou linha de saída esperada, e pede que essa linha seja colada. |
| `Must not:`  | Arquivos a não tocar, testes ou limites a não enfraquecer, ações irreversíveis (push, delete, publish) a não realizar.                  |
| `Budget:`    | Instrução orientativa ao modelo para quando desistir, como "parar como bloqueado após 20 turnos". Para impor um limite, defina `model.goalMaxTurns` ou `model.goalMaxActiveMinutes` nas configurações, não aqui. |
| `On block:`  | O que reportar quando travado e qual decisão um humano deve tomar.                                                                      |
| `Context:`   | Apenas fatos que o agente não pode encontrar no workspace: branch, ambiente, decisões anteriores.                                       |

Mantenha apenas um objetivo. `/goal set` e `/goal edit` aceitam qualquer tamanho, mas fique aproximadamente abaixo de 1.200 caracteres: o objetivo é reenviado a cada turno do Goal. Um objetivo que o modelo propõe via `propose_goal` tem limite de 1.500 caracteres. Ambos os comandos colapsam quebras de linha em espaços, então numere os itens em vez de depender de quebras de linha.

`Budget` é uma instrução ao modelo sobre quando parar e reportar um bloqueador; o modelo pode ou não honrá-la. Para fazer o próprio runtime parar em uma contagem de turnos ou duração, defina [`model.goalMaxTurns`](../configuration/settings.md) ou [`model.goalMaxActiveMinutes`](../configuration/settings.md). Escrever qualquer um deles no objetivo não os configura e não altera o orçamento de tokens do Goal.

| Fraco                      | Por que falha                                               | Mais forte                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tornar o checkout mais rápido | Sem limite, sem verificação.                              | `Outcome: checkout p95 is below 250 ms. Done when: 1) npm run bench:checkout exits 0 and prints p95 < 250 (paste the line); 2) npm test exits 0. Must not: change the benchmark or skip tests. Budget: stop as blocked after 20 turns.` |
| limpar o módulo de auth    | "Limpar" não tem evidência.                                 | Pergunte o que seria observável: zero avisos de lint em `src/auth`, um limite de cobertura, uma contagem de arquivos.                                                                                                                   |
| publicar o release         | Irreversível e precisa de uma decisão humana.               | Restrinja a um estado pré-release verificável (tag existe, `npm run release:dry-run` sai com 0) e coloque "não publicar" em `Must not`.                                                                                                  |
| depois que eu confirmar o design | O verificador não pode ver uma confirmação que nunca aconteceu. | Mova para `On block:` como a decisão que um humano deve tomar.                                                                                                                                                                          |

## Deixe o `/goal-draft` escrevê-lo

`/goal-draft <o que você quer feito>` é uma skill integrada que faz o acima para você. Ela lê apenas o suficiente do workspace para estabelecer o escopo e os comandos reais de verificação, sem executar testes, compilar, instalar dependências ou iniciar serviços. Faz no máximo uma rodada de perguntas quando escolhas essenciais não estão claras, então escreve um objetivo compacto, geralmente com 3–5 verificações de conclusão (menos quando suficiente). Requisitos explícitos são preservados; não adiciona verificações apenas para atingir uma contagem.

Para uma auditoria, conclusão significa cobrir os cenários acordados e reportar evidências, incluindo passos de reprodução para defeitos confirmados. Não encontrar defeitos é um resultado válido. O rascunho não deve inventar um número mínimo de cenários, arquivos de evidência, rodadas de exploração ou defeitos.

Se um critério de sucesso, comando, caminho de entrada ou decisão essencial não puder ser estabelecido, a skill retorna um rascunho marcado como "Needs clarification" com itens `<TODO: …>`. Ela não oferece esse rascunho para aprovação nem imprime um comando executável `/goal set` ou `/goal edit`. Padrões não essenciais são marcados com `[ASSUMPTION]`; eles não substituem critérios de sucesso ausentes.

Assim que o objetivo estiver pronto, uma sessão de terminal interativa ou Web Shell pode mostrar o diálogo de aprovação `propose_goal` descrito abaixo. Clientes sem suporte para proposta de Goal, execuções headless, sessões com a ferramenta desativada e sessões com um Goal ativo recebem um comando para executar manualmente. A passagem diz que o rascunho não foi aplicado. A skill nunca inicia o trabalho em si, e nada é definido sem a sua aprovação.

Passe um objetivo existente para refiná-lo: `/goal-draft all tests pass and the lint is clean`. Para um Goal ativo, uma solicitação explícita para refiná-lo produz `/goal edit`; uma substituição usa `/goal set`. Se a operação pretendida não estiver clara, a skill inclui essa escolha em sua única rodada de perguntas.

### Aprovar um Goal proposto pelo modelo

Em uma sessão de terminal interativa, o modelo tem a ferramenta `propose_goal`. Quando o `/goal-draft` termina, ou quando você solicita um resultado que abrange vários turnos, ele pode propor o objetivo em vez de imprimir uma linha `/goal set …` para você copiar. A proposta aparece como um diálogo de aprovação mostrando o objetivo completo. Aprová-la define o Goal exatamente como o `/goal set` faria, no momento em que o turno atual termina (o modelo reconhece e para; o primeiro turno do Goal então começa por conta própria), e recusá-la não define nada — o modelo vê apenas que a chamada de ferramenta não foi permitida, e suas instruções dizem para não perguntar o porquê e não propor o mesmo objetivo novamente. A aprovação está vinculada ao turno que a solicitou: se esse turno for cancelado ou de alguma forma não chegar ao seu fim, a aprovação é descartada em vez de aplicada sob uma mensagem posterior ou um turno automatizado. Nenhuma regra de permissão ou modo de aprovação (incluindo YOLO) pula este diálogo, e a ferramenta recusa enquanto outro Goal estiver ativo, em modo de plano e em pastas não confiáveis; subagentes nunca a recebem. O Web Shell usa seu painel de permissão Allow/Reject existente. Um Goal interrompido só pode ser substituído se ainda corresponder à versão exibida para aprovação; alterá-lo invalida a proposta. Execuções headless, entregas de canal do Web Shell e turnos automáticos, e clientes ACP sem o suporte necessário de aprovação e ciclo de vida de turno mantêm a passagem impressa do `/goal set`.

Desative com `goals.modelProposed: "disabled"` nas suas configurações de usuário. Como a configuração decide se o modelo pode pedir para iniciar um loop autônomo, ela é respeitada apenas nos escopos de usuário e sistema; um valor em `.qwen/settings.json` do workspace é ignorado com um aviso.

A skill é instruída a ser somente leitura, e apenas suas ferramentas não mutáveis são aprovadas automaticamente (`get_goal`, `read_file`, `glob`, `grep_search`). `ask_user_question` deliberadamente não é aprovado automaticamente, então seu diálogo de pergunta é exibido antes que a skill redija a partir das suas respostas. Como outras skills integradas, uma skill de projeto ou pessoal chamada `goal-draft` a sobrescreve, e `skills.disabled` pode desativá-la. Consulte [Skills](./skills.md) para saber como as skills integradas são descobertas.

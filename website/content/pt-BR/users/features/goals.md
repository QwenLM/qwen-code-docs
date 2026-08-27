# Goals

Um Goal mantém o Qwen Code trabalhando entre turnos até que uma condição declarada seja atendida. Defina um com `/goal <objetivo>`; após cada turno, um verificador independente checa a transcrição, e a sessão continua até que o objetivo seja verificado como completo, verificado como bloqueado, pausado ou limpo.

## Comandos

| Comando                  | Comportamento                                                 |
| ------------------------ | ------------------------------------------------------------- |
| `/goal`                  | Mostrar o Goal atual e seu status.                            |
| `/goal <objetivo>`       | Criar um Goal ou substituir o ativo.                          |
| `/goal set <objetivo>`   | Mesmo que o acima, forma explícita.                           |
| `/goal edit <objetivo>`  | Revisar a redação do Goal ativo sem recomeçar.                |
| `/goal pause` / `resume` | Parar ou continuar o loop sem perder o Goal.                  |
| `/goal clear`            | Remover o Goal.                                               |
| `/goal-draft <intencao>` | Fazer o objetivo ser escrito para você antes de defini-lo (abaixo). |

Criar, editar ou retomar um Goal requer um workspace confiável (`/trust`). O uso headless é coberto no [Modo Headless](./headless.md#run-a-persistent-goal).

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
| `Budget:`    | Quando desistir: "parar como bloqueado após 20 turnos" ou um limite de tempo.                                                           |
| `On block:`  | O que reportar quando travado e qual decisão um humano deve tomar.                                                                      |
| `Context:`   | Apenas fatos que o agente não pode encontrar no workspace: branch, ambiente, decisões anteriores.                                       |

Mantenha apenas um objetivo e aproximadamente abaixo de 1.200 caracteres. `/goal set` e `/goal edit` colapsam quebras de linha em espaços, então numere os itens em vez de depender de quebras de linha.

| Fraco                      | Por que falha                                               | Mais forte                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tornar o checkout mais rápido | Sem limite, sem verificação.                              | `Outcome: checkout p95 is below 250 ms. Done when: 1) npm run bench:checkout exits 0 and prints p95 < 250 (paste the line); 2) npm test exits 0. Must not: change the benchmark or skip tests. Budget: stop as blocked after 20 turns.` |
| limpar o módulo de auth    | "Limpar" não tem evidência.                                 | Pergunte o que seria observável: zero avisos de lint em `src/auth`, um limite de cobertura, uma contagem de arquivos.                                                                                                                   |
| publicar o release         | Irreversível e precisa de uma decisão humana.               | Restrinja a um estado pré-release verificável (tag existe, `npm run release:dry-run` sai com 0) e coloque "não publicar" em `Must not`.                                                                                                  |
| depois que eu confirmar o design | O verificador não pode ver uma confirmação que nunca aconteceu. | Mova para `On block:` como a decisão que um humano deve tomar.                                                                                                                                                                          |

## Deixe o `/goal-draft` escrevê-lo

`/goal-draft <o que você quer feito>` é uma skill integrada que faz o acima para você. Ela verifica se a requisição é um Goal de fato, lê o workspace para encontrar os comandos reais de teste e lint em vez de adivinhar, faz no máximo uma rodada de perguntas de múltipla escolha quando a resposta muda a verificação ou o escopo, redige o objetivo no formato acima, executa a autoverificação e imprime uma linha `/goal set …` que você pode executar como está. Ela nunca inicia o trabalho em si e nunca define o Goal em seu nome.

Passe um objetivo existente para refiná-lo: `/goal-draft all tests pass and the lint is clean`.

A skill é instruída a ser somente leitura, e apenas suas ferramentas não mutáveis são aprovadas automaticamente (`get_goal`, `read_file`, `glob`, `grep_search`). `ask_user_question` deliberadamente não é aprovado automaticamente, então seu diálogo de pergunta é exibido antes que a skill redige a partir das suas respostas. Como outras skills integradas, uma skill de projeto ou pessoal chamada `goal-draft` a sobrescreve, e `skills.disabled` pode desativá-la. Consulte [Skills](./skills.md) para saber como as skills integradas são descobertas.

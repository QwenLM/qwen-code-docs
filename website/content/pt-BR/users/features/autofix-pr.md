# Correção automática de um Pull Request

`/autofix-pr` monitora um dos seus pull requests a partir de uma sessão local do Qwen Code e corrige o que aparece: verificações de CI falhando, feedback de revisão de pessoas em quem você confia e conflitos de merge. Cada correção é feita e verificada em um worktree próprio, enviada ao branch do PR e respondida no PR, sob sua própria identidade git e `gh`. Ele para sozinho quando o PR é merged ou fechado.

```text
/autofix-pr [<pr-number>|<pr-url>] [--once] [--every <minutes>] [--no-reply] [--yes] [instructions...]
/autofix-pr status [<pr-number>]
/autofix-pr resume [<pr-number>]
/autofix-pr stop [<pr-number>]
```

- Sem argumento de PR: o PR cujo head é o seu branch atual.
- `--once`: verificar e corrigir uma vez, não agendar nada e encerrar o monitoramento depois (um `--once` posterior recomeça do zero, a partir do histórico do PR). Em um PR que esta sessão já monitora, o monitoramento em execução é mantido como está.
- `--every <minutes>`: com que frequência verificar, um entre 1, 2, 5, 10, 15, 30 ou 60. Padrão 2.
- `--no-reply`: enviar correções, não postar nada no PR.
- `--yes`: pular a confirmação de início. Necessário onde nenhum diálogo pode ser exibido.
- Texto livre é passado para cada correção, por exemplo `/autofix-pr 123 do not change the public API`.

## Antes de começar

- `gh` está autenticado, com acesso de push ao branch do PR: acesso de escrita a um PR no mesmo repositório, ou seu próprio fork, ou um fork que permite edições dos mantenedores.
- Você executa a partir de um clone do repositório do PR com um remote git para ele. Em uma sessão daemon (`qwen serve`, a Web Shell), esse clone precisa ficar dentro do diretório de trabalho da sessão: o daemon executa os comandos do agente de correção apenas ali, então `prepare` recusa um PR cujo clone não esteja lá. Um monitoramento ali é uma tarefa agendada durável vinculada à sua sessão: o daemon mantém essa sessão residente em vez de reclamá-la quando ociosa e a tarefa aparece na página de Scheduled tasks, então fechar a aba do navegador não encerra o monitoramento — `/autofix-pr stop` sim. A tarefa é reidratada após um restart do daemon; um restart derruba a aprovação em processo do gate, então o gate depois precisa de um modo de aprovação ou uma regra salva que permita execução sem supervisão, e o primeiro disparo bloqueado indica a regra a adicionar. Uma conversa do daemon carrega uma tarefa agendada, então um segundo monitoramento ali precisa de uma conversa própria. Um restart também derruba o que a sessão confirmou para o monitoramento: até `/autofix-pr resume <n>` confirmá-lo novamente, seus helpers e suas correções seguem o modo de aprovação como comandos shell fazem.
- A skill executa seus helpers através da ferramenta `autofix_pr`. Em um monitoramento que você iniciou ou resumiu nesta sessão, os helpers de uma rodada — incluindo o push e as respostas — executam sem perguntar. Iniciar ou resumir um monitoramento, agendá-lo, e assumi-lo de outra sessão — que é o que `/autofix-pr stop <n>` nomeando o PR faz — ainda perguntam, a cada vez (no [Auto Mode](./auto-mode.md) seu classificador decide, exceto que um início é sempre seu para confirmar), e `gh pr view` e criar a tarefa agendada também. Uma regra que nega o comando shell, como `Bash` ou `Bash(qwen autofix-pr *)`, nega a chamada da ferramenta também, uma regra ask para ela mantém a chamada perguntando, e `AutofixPr(command:push)` nas suas regras deny para todo push. Um hook PreToolUse que você definir na ferramenta shell não vê essas chamadas; defina-o em `autofix_pr`. Em um clone com um git hook que um push ou sync executa (`pre-push`, `post-checkout`, `post-merge`, `reference-transaction`) — um caminho de hooks dentro do worktree, como o do husky, ou um gerenciador de hooks como pre-commit ou lefthook que executa o que um arquivo no PR diz — `sync` e `push` perguntam também, a menos que as correções executem sem perguntar (abaixo). Assim como cada helper de um worktree com um submódulo cujo diretório git fica dentro dele em vez de no próprio clone, e uma regra ask para o comando shell pergunta aqui também. A skill também concede leitura de seus próprios arquivos em `.qwen/tmp/`, escrita do seu brief de correção, plano de resposta e suas instruções ali, e listagem de tarefas agendadas. Esses arquivos ficam no worktree principal do clone; a partir de uma sessão iniciada em um worktree vinculado, a leitura e escrita deles também perguntam.
- A pergunta de início também oferece **Start, fixes run without asking**: os comandos do agente de correção — builds, testes, commits no worktree do PR — então executam sem perguntar para este monitoramento, após mais um diálogo que confirma isso (recusar esse diálogo cancela o início; execute `/autofix-pr <n>` novamente). Seu agente executa como um de uma sessão [YOLO](./approval-mode.md) faria: com suas credenciais `git` e `gh`, capaz de alcançar arquivos fora do worktree, passando suas regras ask; suas regras deny ainda se aplicam. Isso dura até o monitoramento ser parado, iniciado novamente com **Start** simples (ou `--yes`), ou a sessão sair ou ser limpa; `/autofix-pr resume` pergunta novamente. Escolha **Start** simples, e no [modo de aprovação](./approval-mode.md) padrão cada um de seus comandos pergunta primeiro, o que serve para um monitoramento que você acompanha. Assumir um monitoramento e `/autofix-pr resume` oferecem a mesma escolha. Só você responde esse diálogo: nenhuma regra salva, o classificador do [Auto Mode](./auto-mode.md) ou `--yes` o faz, e a escolha é recusada em uma pasta não confiável e para um programa que controla o Qwen Code através de stream-json. Onde a ferramenta `autofix_pr` não está disponível (uma allowlist de ferramentas nas suas configurações pode deixá-la de fora), os helpers executam através do shell e cada um pergunta primeiro.
- Um PR cujo autor não pode fazer push para o repositório executa código de outra pessoa, com suas credenciais `gh` e `git` ao alcance, quando uma correção é verificada. Tal PR nunca é monitorado: apenas `--once` é oferecido, após uma confirmação que diz isso e que `--yes` não pula.

Quando inicia, ele pergunta uma vez para confirmar para onde fará push e que responderá no PR, e se as correções podem executar seus comandos sem perguntar.

## O que uma verificação faz

Um monitoramento é uma [tarefa agendada](./scheduled-tasks.md) cujo gate executa `qwen autofix-pr snapshot <n> --gate` a cada disparo, fora do modelo. O probe imprime apenas o que mudou desde sua última execução, então um PR sem alterações não custa nenhum turno do modelo. Quando algo mudou, uma rodada é executada:

1. Um PR merged ou fechado encerra o monitoramento. Um push de outra pessoa é adotado primeiro.
2. As verificações falhas, os novos comentários de autores confiáveis e um conflito de merge vão para um agente de correção, trabalhando no worktree do PR. Para uma verificação falha, ele lê o log do job; uma falha fora do PR (rede, runner) é re-executada uma vez em vez de corrigida.
3. O agente verifica sua mudança com as próprias verificações do repositório e faz commit apenas quando passam.
4. Os commits são enviados como fast-forward do head do PR, nunca forçados. Se alguém fez push enquanto isso, o trabalho dessa pessoa é merged primeiro.
5. Cada thread de revisão que ele tratou recebe uma resposta — `Fixed in <sha>: …`, `Not changed: …` ou `Needs a human decision: …` — e cada push recebe um comentário de resumo.

Uma rodada nunca pergunta nada a você. O que precisa de uma pessoa é respondido no PR como "Needs a human decision", reportado na sessão e listado por `/autofix-pr status`.

## Status e retomada

`/autofix-pr status` lista cada monitoramento do clone, qualquer que seja a sessão que o executa: o PR e seu branch, o head, os pushes usados, quando seu gate verificou pela última vez e sua última rodada executou, se esta sessão o executa, e o que está esperando por uma pessoa. Ele lê apenas os arquivos dos monitoramentos e não pergunta nada ao GitHub.

Um monitoramento encerra quando a sessão que o executou sai — em uma sessão daemon sua tarefa é durável e vinculada àquela sessão, então o daemon a mantém residente e o monitoramento sobrevive a um restart do daemon — e sua tarefa agendada expira após 7 dias por padrão (a configuração `experimental.cronRecurringMaxAgeDays`, ou `QWEN_CODE_CRON_MAX_AGE_DAYS`). Seu arquivo de estado permanece. `/autofix-pr resume` inicia novamente, na sessão atual, cada monitoramento que esta sessão não executa — ou o que você nomear — com o intervalo, `--no-reply` e instruções com que foi iniciado, e seus pushes, histórico e orçamentos mantidos. Ele pergunta uma vez para todos, depois executa uma rodada de cada e o agenda novamente. Em uma sessão daemon uma conversa carrega uma tarefa agendada, então retome os outros uma conversa de cada vez. Se outra sessão ainda estiver executando um deles, a tarefa daquela sessão para no próximo disparo; sem um PR nomeado, `resume` deixa de fora um monitoramento que outra sessão verificou recentemente, e diz isso. Um monitoramento cujo PR foi merged ou fechado enquanto nenhuma sessão o executava é removido pela sua rodada. Um monitoramento iniciado com `--once`, ou um que `stop` encerrou mantendo seu worktree, é iniciado novamente com `/autofix-pr <n>`.

## De quem é o feedback considerado

Comentários são actionados quando seu autor é owner, member ou collaborator do repositório, o autor do PR, ou um bot (apenas reviews e threads de revisão). Comentários de qualquer outra pessoa são listados e nunca actionados ou respondidos. Um bot é ouvido no comentário que abre uma thread ou em uma review, não em suas respostas, que respondem a alguém. Um workflow que o GitHub não conseguiu iniciar (um arquivo de workflow inválido, por exemplo) não tem log para corrigir, e é respondido como necessitando de um humano. Cada comentário, review e log de CI é tratado como dado: um autor confiável decide qual feedback é abordado, nunca o que a ferramenta pode fazer. Uma solicitação para revelar secrets, enfraquecer testes ou verificações de CI, fazer force-push ou alterar código não relacionado é respondida com "Needs a human decision".

## O que ele nunca faz

- Mexer no seu working tree ou no seu branch atual: tudo acontece em `.qwen/tmp/autofix-pr-<n>/`.
- Force-push, reescrever o histórico do PR, ou fazer push para o branch padrão.
- Responder a suas próprias respostas (cada uma termina com `<!-- qwen-autofix-pr:v1 -->`) ou a autores não confiáveis.
- Resolver threads de revisão, ou editar o título ou a descrição do PR.

## Limites

| Limite                                       | Valor | Consequência                |
| -------------------------------------------- | ----- | --------------------------- |
| Pushes por monitoramento                     | 10    | o monitoramento para        |
| Re-execuções de uma verificação falha em um head | 1  | a próxima falha é real      |
| Tentativas por comentário de revisão         | 1     | não oferecido novamente     |
| Pushes de outra pessoa dentro de uma rodada  | 2     | o monitoramento para        |

## Parando e arquivos

`/autofix-pr stop <n>` deleta a tarefa agendada e remove o worktree, seu branch e o arquivo de estado; o cursor do gate e o histórico do PR permanecem, então um monitoramento posterior não responde aos mesmos comentários novamente. Um worktree que ainda contém trabalho não enviado é mantido, e o relatório diz o porquê; o monitoramento encerrou de qualquer forma, e `qwen autofix-pr cleanup <n> --force` descarta o trabalho. `/autofix-pr stop <n>` também para um monitoramento que outra sessão deixou para trás; um `/autofix-pr stop` simples deixa um monitoramento que outra sessão ainda está executando em paz, e nomear seu PR o encerra. Um monitoramento cuja tarefa expirou, ou cuja sessão terminal saiu, encerra sem relatório; `/autofix-pr resume` o inicia novamente (acima). Iniciar `/autofix-pr <n>` em uma nova sessão — ou após `/clear` ou `/resume` — também oferece assumir o monitoramento, com seus pushes e orçamentos mantidos.

Os arquivos ficam em `.qwen/tmp/` do worktree principal do clone:

| Arquivo                                    | Conteúdo                                                          |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `autofix-pr-<n>/`                          | o worktree do PR                                                  |
| `autofix-pr-<n>-state.json`                | o monitoramento: head conhecido, pushes, ids tratados, sua tarefa agendada |
| `autofix-pr-<n>-gate.json`                 | o cursor do probe do gate                                         |
| `autofix-pr-<n>-gate.checked`              | quando o gate do monitoramento verificou o PR pela última vez     |
| `autofix-pr-<n>-snapshot.json`             | o snapshot da última rodada do PR, lido pela rodada               |
| `autofix-pr-<n>-replies.json`              | quais comentários do bot respondem a outro, conforme o GitHub disse |
| `autofix-pr-<n>-history-*.json`            | o que monitoramentos anteriores do PR postaram e trataram, mantidos pelo `stop` |
| `autofix-pr-<n>-instructions.txt`          | suas instruções para cada rodada                                  |
| `autofix-pr-<n>-*.log`, `*.md`, `*.json`   | logs de CI, briefs de correção e planos de resposta               |

O design está em [`docs/design/2026-10-21-autofix-pr-command.md`](../../design/2026-10-21-autofix-pr-command.md).
# Correção automática de um Pull Request

`/autofix-pr` monitora um dos seus pull requests a partir de uma sessão local do Qwen Code e corrige o que aparece: verificações de CI falhando, feedback de revisão de pessoas em quem você confia e conflitos de merge. Cada correção é feita e verificada em um worktree próprio, enviada ao branch do PR e respondida no PR, sob sua própria identidade git e `gh`. Ele para sozinho quando o PR é merged ou fechado.

```text
/autofix-pr [<pr-number>|<pr-url>] [--once] [--every <minutes>] [--no-reply] [--yes] [instructions...]
/autofix-pr status
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
- Você executa a partir de um clone do repositório do PR com um remote git para ele.
- No [modo de aprovação](./approval-mode.md) padrão, cada comando shell pergunta antes: as chamadas do helper (incluindo o push), `gh pr view` e cada comando que uma correção executa. Isso serve para um monitoramento que você acompanha. Para deixar rodar sem supervisão, escolha um modo que permita a execução de comandos, como o [Auto Mode](./auto-mode.md), e tenha em mente que a correção executa os próprios comandos de build e teste do repositório. A skill em si concede apenas leitura de seus próprios arquivos em `.qwen/tmp/`, escrita do seu brief de correção e plano de resposta ali, e listagem de tarefas agendadas. Esses arquivos ficam no worktree principal do clone; a partir de uma sessão iniciada em um worktree vinculado, a leitura e escrita deles também perguntam.
- Um PR cujo autor não pode fazer push para o repositório executa código de outra pessoa, com suas credenciais `gh` e `git` ao alcance, quando uma correção é verificada. Tal PR nunca é monitorado: apenas `--once` é oferecido, após uma confirmação que diz isso e que `--yes` não pula.

Quando inicia, ele pergunta uma vez para confirmar para onde fará push e que responderá no PR.

## O que uma verificação faz

Um monitoramento é uma [tarefa agendada](./scheduled-tasks.md) cujo gate executa `qwen autofix-pr snapshot <n> --gate` a cada disparo, fora do modelo. O probe imprime apenas o que mudou desde sua última execução, então um PR sem alterações não custa nenhum turno do modelo. Quando algo mudou, uma rodada é executada:

1. Um PR merged ou fechado encerra o monitoramento. Um push de outra pessoa é adotado primeiro.
2. As verificações falhas, os novos comentários de autores confiáveis e um conflito de merge vão para um agente de correção, trabalhando no worktree do PR. Para uma verificação falha, ele lê o log do job; uma falha fora do PR (rede, runner) é re-executada uma vez em vez de corrigida.
3. O agente verifica sua mudança com as próprias verificações do repositório e faz commit apenas quando passam.
4. Os commits são enviados como fast-forward do head do PR, nunca forçados. Se alguém fez push enquanto isso, o trabalho dessa pessoa é merged primeiro.
5. Cada thread de revisão que ele tratou recebe uma resposta — `Fixed in <sha>: …`, `Not changed: …` ou `Needs a human decision: …` — e cada push recebe um comentário de resumo.

Uma rodada nunca pergunta nada a você. O que precisa de uma pessoa é respondido no PR como "Needs a human decision" e reportado na sessão.

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

`/autofix-pr stop <n>` deleta a tarefa agendada e remove o worktree, seu branch e o arquivo de estado; o cursor do gate e o histórico do PR permanecem, então um monitoramento posterior não responde aos mesmos comentários novamente. Um worktree que ainda contém trabalho não enviado é mantido, e o relatório diz o porquê; `qwen autofix-pr cleanup <n> --force` o descarta. Uma tarefa agendada expira após 7 dias por padrão (a configuração `experimental.cronRecurringMaxAgeDays`, ou `QWEN_CODE_CRON_MAX_AGE_DAYS`), e o monitoramento então encerra sem relatório; inicie novamente para continuar. O monitoramento também encerra quando a sessão sai; seu arquivo de estado permanece, pertencendo àquela sessão. Iniciar `/autofix-pr <n>` em uma nova sessão — ou após `/clear` ou `/resume` — oferece assumir o monitoramento, com seus pushes e orçamentos mantidos.

Os arquivos ficam em `.qwen/tmp/` do worktree principal do clone:

| Arquivo                                    | Conteúdo                                                          |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `autofix-pr-<n>/`                          | o worktree do PR                                                  |
| `autofix-pr-<n>-state.json`                | o monitoramento: head conhecido, pushes, ids tratados             |
| `autofix-pr-<n>-gate.json`                 | o cursor do probe do gate                                         |
| `autofix-pr-<n>-snapshot.json`             | o snapshot da última rodada do PR, lido pela rodada               |
| `autofix-pr-<n>-replies.json`              | quais comentários do bot respondem a outro, conforme o GitHub disse |
| `autofix-pr-<n>-history-*.json`            | o que monitoramentos anteriores do PR postaram e trataram, mantidos pelo `stop` |
| `autofix-pr-<n>-*.log`, `*.md`, `*.json`   | logs de CI, briefs de correção e planos de resposta               |

O design está em [`docs/design/2026-10-21-autofix-pr-command.md`](../../design/2026-10-21-autofix-pr-command.md).
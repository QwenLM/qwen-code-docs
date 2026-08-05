# Endurecimento da resolução de threads de review do Autofix

## Problema

O Qwen Autofix já permite que o agente de atendimento de review identifique
comentários inline de review que estão resolvidos no código. O fluxo de
trabalho do host credenciado mapeia esses IDs de comentários REST para threads
de review do GitHub e chama `resolveReviewThread` após fazer o push da
correção.

O ordenamento atual é geralmente seguro, mas não prova que a head do PR ao
vivo sendo resolvida é o commit exato coberto pela verificação determinística:

- Um push rejeitado pode ser recuperado mesclando a head remota recém-movida.
  O commit mesclado recebe o push mesmo que a verificação seja anterior à
  mesclagem.
- O autor do PR pode fazer outro push depois que o Autofix faz o push e antes
  da mutação de resolução.
- Um reparo na mesma execução pode herdar `resolved-comments.txt` ou
  `comment-replies.json` da primeira tentativa rejeitada.

Essas lacunas podem marcar uma conversa como resolvida sem evidência de que a
head atual do PR ainda contém a correção verificada.

## Estado atual

As responsabilidades já estão separadas corretamente:

- `.qwen/skills/autofix/SKILL.md` diz ao agente como classificar descobertas e
  escrever `resolved-comments.txt` ou `comment-replies.json`.
- `.github/scripts/run-autofix-review-verification.sh` executa
  independentemente build, typecheck, lint e testes de pacotes afetados,
  determinísticos.
- `.github/workflows/qwen-autofix.yml` possui o PAT do GitHub, faz o push do
  branch, busca threads de review e executa mutações.
- `scripts/tests/qwen-autofix-workflow.test.js` extrai e executa blocos shell
  do workflow com respostas do GitHub em stub.

A mutação do GitHub deve permanecer no workflow confiável. O agente não deve
receber credenciais do GitHub.

## Mudanças propostas

### Gate de verificação

Exigir um worktree rastreado e um índice limpos antes das verificações
determinísticas, capturar o SHA do commit e exigir que tanto o SHA quanto o
estado rastreado permaneçam inalterados após as verificações estruturais e
novamente após build, typecheck, lint e testes. Então gravar esse SHA
capturado como um output de passo chamado `verified_head`. Não emiti-lo para
resultados no-op ou falhos. Isso rejeita mudanças rastreadas persistentes ou
commits criados por verificações controladas pelo branch; não alega um sistema
de arquivos imutável nem detecta um script que muda temporariamente o estado e
o restaura dentro de um comando, o que permanece parte do modelo de confiança
existente do CI.

### Seleção da verificação final

Propagar o SHA de verificação selecionado através do passo de verificação
final:

- usar o primeiro SHA de verificação quando nenhum reparo foi executado;
- usar apenas o SHA de verificação do reparo quando o reparo foi executado;
- nunca fazer fallback para o primeiro SHA em um resultado reparado
  bem-sucedido.

### Isolamento do reparo

Antes de invocar o agente de reparo, remover `resolved-comments.txt` e
`comment-replies.json` junto com os outros artefatos da tentativa anterior. A
tentativa de reparo deve regenerar explicitamente suas disposições finais.
Arquivos ausentes, portanto, falham fail closed: nenhum thread é resolvido ou
respondido.

### Prova de resolução pós-push

Antes de resolver qualquer thread selecionado, exigir todos os seguintes:

1. `verified_head` não está vazio.
2. A recuperação de corrida de push não criou um commit de mesclagem não
   verificado.
3. O `HEAD` local após o push bem-sucedido é igual a `verified_head`.
4. Uma consulta ao vivo de `gh pr view` tem sucesso.
5. O `headRefOid` ao vivo do PR é igual a `verified_head` antes de cada
   mutação.
6. O `headRefOid` ao vivo do PR ainda é igual a `verified_head` imediatamente
   após cada mutação.

Antes de cada mutação, um único guard GraphQL lê tanto o `headRefOid` ao vivo
quanto o estado `isResolved` ao vivo do thread alvo. Um thread já resolvido
por outro ator é pulado. Após a mutação, o mesmo guard verifica ambos os
valores novamente. Essa verificação pós também executa quando o comando de
mutação retorna um erro, porque uma resposta perdida não prova que o GitHub
não aplicou a mutação.

Se uma condição pré-mutação for desconhecida ou falsa, ou uma condição
pós-mutação for ambígua, parar de resolver conversas adicionais. Uma mutação
falha cujo guard pós prova que a head verificada está inalterada e o thread
permanece aberto é segura para emitir aviso e continuar. O workflow não chama
`unresolveReviewThread`: o GitHub não expõe uma pré-condição compare-and-swap
nem atribuição de mutação, então nem mesmo uma resposta bem-sucedida de
`resolveReviewThread` pode provar que outro ator não resolveu o thread entre o
pré-guard e a mutação. Reabri-lo automaticamente poderia, portanto, desfazer a
ação de outro revisor. Um comando de mutação mal-sucedido seguido de um guard
pós que confirma a head verificada e o estado resolvido é contado como um
estado resolvido observado, sem atribuí-lo ao Autofix; qualquer resultado
ambíguo interrompe as mutações restantes.

O push de código verificado e o relatório de rodada normal ainda têm sucesso.
Respostas para descobertas deixadas abertas deliberadamente podem continuar
após um push bem-sucedido porque não alegam que um thread foi corrigido.

## Decisões de design

- **Fail closed para resolução:** um thread não resolvido é recuperável; um
  thread resolvido incorretamente pode esconder um defeito real.
- **Pular resolução após mesclagem de corrida:** reexecutar o gate
  determinístico completo dentro do passo de publicação que carrega o PAT
  duplicaria lógica cara e executaria scripts controlados pelo branch com
  credenciais no escopo. Uma rodada de review posterior pode resolver o thread
  com segurança.
- **Consultar o estado ao vivo do PR imediatamente antes da mutação:** a
  concorrência de workflow não pode impedir pushes diretos de contribuidores.
- **Manter o contrato de disposição do modelo existente:** o julgamento
  semântico permanece com o agente, enquanto a identidade exata do commit é
  aplicada deterministicamente pelo host.
- **Não adicionar código geral de CLI/core:** isso é orquestração de workflow
  do Autofix, não uma funcionalidade reutilizável de runtime do Qwen Code.

## Arquivos afetados

- `.github/scripts/run-autofix-review-verification.sh`
- `.github/workflows/qwen-autofix.yml`
- `scripts/tests/qwen-autofix-workflow.test.js`
- `.qwen/skills/autofix/SKILL.md` para esclarecimento do contrato

## Limites de escopo

Incluído:

- igualdade exata entre head verificada/ao vivo;
- comportamento fail closed de corrida de push;
- isolamento de disposição de tentativa de reparo;
- contrato de workflow focado e testes comportamentais.

Excluído:

- paginação GraphQL além dos primeiros 100 threads existentes;
- resolver conversas arbitrárias de PRs fora do Autofix;
- dispensar reviews `CHANGES_REQUESTED`;
- dar ao modelo credenciais diretas do GitHub;
- mudar comportamento genérico de `/review` ou do CLI.

## Questões em aberto

Nenhuma. O comportamento conservador é determinístico antes da mutação:
incerteza impede que threads adicionais sejam resolvidos. Após uma mutação, o
workflow observa e reporta o estado, mas nunca o des-resolve automaticamente
sem evidência de posse atômica.

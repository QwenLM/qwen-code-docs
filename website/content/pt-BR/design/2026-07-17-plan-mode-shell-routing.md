---
title: 'Plan Mode Shell Routing and Exact One-Off Approval'
date: '2026-07-17'
status: 'implemented'
---

# Roteamento de Shell do Modo Plan e Aprovação Exata Única

## Problema

O modo Plan historicamente tratava o formato da confirmação como um proxy para
se uma ferramenta era somente leitura. Isso é insuficiente para
`run_shell_command` e `monitor`: ambas as ferramentas podem representar
programas shell somente leitura, que modificam estado ou desconhecidos do
parser, enquanto regras de permissão, hooks, hosts ACP, stream-json, TUI, e
bridges de teammate e de background podem todas resolver a mesma aprovação por
caminhos diferentes.

O limite de segurança deve distinguir uma escrita conhecida de um comando
desconhecido sem transformar `unknown` em uma maneira de burlar o modo Plan.
Uma aprovação também deve permanecer vinculada à requisição exata do modelo que
produziu o prompt; uma mudança de modo posterior, mudança de política de
permissão, reescrita do host, modificação no editor ou resposta concorrente não
deve reutilizá-la.

Este design depende do classificador de shell tri-estado mesclado no #7053.

## Objetivos

- Aplicar uma única política de roteamento a chamadas Shell e Monitor iniciadas
  pelo modelo no Core e no ACP.
- Executar apenas comandos classificados como `read-only` sem um novo prompt
  específico do Plan.
- Bloquear comandos classificados como `write` antes que hooks de confirmação
  ou hosts possam aprová-los.
- Permitir `unknown` apenas por meio de uma confirmação exata e única, mantendo
  o modo Plan ativo.
- Preservar um deny explícito do PermissionManager sobre toda rota específica
  do Plan.
- Carregar avisos e as escolhas efetivamente permitidas pelas bridges TUI, ACP,
  stream-json, dual-output, teammate, subagente e background.
- Manter inalterados o comportamento do Plan para não Shell e a semântica
  explícita de saída do plan.

## Não objetivos

- Alterar o ciclo de vida do gate do Plan ou injetar um novo lembrete durante um
  turno ACP já em execução.
- Governar entrada shell `!command` digitada pelo usuário.
- Adicionar um tipo de confirmação, configuração, cache, feature flag ou
  capacidade persistente única.
- Alterar ferramentas de consulta específicas do DataWorks.
- Fazer a especulação (speculation) fornecer uma superfície interativa de
  aprovação.

## Modelo de ameaça

O ativo protegido é o sistema de arquivos do usuário, processos, estado visível
na rede, estado do repositório e o limite do modo de aprovação enquanto o modo
Plan está ativo. Entradas não confiáveis incluem argumentos de ferramenta do
modelo, sintaxe shell que o parser não pode provar ser segura, `updatedInput`
retornado por hook, IDs de opção do ACP, reescritas de host stream-json,
callbacks de edição da IDE, respostas de teammate/background e respostas
duplicadas de hosts anexados concorrentemente.

Os ataques relevantes são:

- usar uma regra allow ou uma bridge tipo YOLO para burlar o modo Plan;
- disfarçar uma escrita conhecida com um wrapper para que ela alcance um caminho
  mais fraco;
- aprovar um comando e executar uma requisição modificada ou uma invocação
  validada;
- sair do modo Plan e reentrar nele enquanto um prompt antigo permanece
  visível;
- adicionar uma regra deny após a exibição do prompt, mas antes do consumo da
  aprovação;
- forjar uma opção persistente ou de modificação não oferecida;
- aprovar duas vezes pelas bridges TUI, entrada remota, IDE ou background;
- usar uma aprovação persistente de uma chamada irmã para autoaprovar a chamada
  Shell do Plan.

## Política de roteamento

A avaliação L3/L4 do PermissionManager permanece autoritativa para deny rígido.
Após essa decisão e o gate de teammate exigido pelo plan, o roteamento de Shell
do Plan classifica o comando validado.

| Classificação | PM deny | PM allow             | PM ask/default        | Sem host de aprovação                                  |
| ------------- | ------- | -------------------- | --------------------- | ------------------------------------------------------ |
| `read-only`   | negar   | executar             | prompt exato único    | negar quando o prompt comum do PM não puder ser mostrado |
| `write`       | negar   | bloqueio do Plan     | bloqueio do Plan      | bloqueio do Plan                                       |
| `unknown`     | negar   | prompt exato único   | prompt exato único    | recusa segura para o Plan                              |

A classificação do Monitor usa `normalizeMonitorCommand(command).safetyCommand`;
a classificação do Shell usa a string de comando original da invocação
validada. A especulação executa apenas quando o resultado tri-estado é
exatamente `read-only`; `write`, `unknown`, falha do parser e entrada vazia
param no limite da especulação.

## Capacidade de invocação exata

A classificação cria um snapshot imutável contendo:

- os argumentos originais da requisição de ferramenta;
- os parâmetros da invocação validada;
- a revisão atual do modo de aprovação;
- o contexto de verificação do PermissionManager, incluindo o diretório de
  trabalho efetivo do Shell/Monitor;
- o comando Shell ou Monitor bruto usado para exibição.

Core e ACP clonam a invocação Shell/Monitor do Plan antes da classificação para
que a entrada bruta visível ao host não possa reter um alias para os
parâmetros executáveis. Quando o modelo omite `directory`, esse clone também é
vinculado ao diretório de trabalho atual da sessão. A requisição original
permanece inalterada, enquanto a execução não segue mais uma relocação de
diretório posterior do daemon/ACP ou mutação do objeto de requisição depois que
a aprovação foi consumida.

O scheduler valida esse snapshot após a classificação, antes de exibir a
confirmação e antes de consumir uma confirmação. A validação requer:

- uma requisição ativa e não abortada;
- modo Plan com a mesma revisão, de modo que Plan → outro modo → Plan invalida
  o prompt;
- igualdade profunda dos argumentos da requisição e dos parâmetros da invocação
  validada;
- o mesmo diretório de trabalho efetivo quando a invocação depende do diretório
  ambiente da sessão;
- uma avaliação atual bem-sucedida do PermissionManager que não retorne `deny`.

Mudanças posteriores para `allow`, `ask` ou `default` não re-roteiam um prompt
que já foi selecionado. Uma exceção do PermissionManager falha de forma fechada
(fail closed). Quando a validação final tem sucesso, a capacidade é consumida;
uma mudança de modo ou regra posterior não revoga a invocação já consumida.

Apenas `ProceedOnce` e `Cancel` são aceitos. `updatedInput` é aceito apenas
quando profundamente igual à requisição do snapshot. `newContent` nunca é
aceito. Uma aprovação bem-sucedida passa um payload vazio para a ferramenta,
então respostas, regras de permissão ou metadados exclusivos do host não podem
se tornar uma concessão persistente. Resultados inválidos viram `Cancel` com a
mensagem de aprovação obsoleta.

O closure de confirmação do Core reivindica a resposta sincronicamente antes do
seu primeiro `await`. Respostas concorrentes de TUI, entrada remota, teammate,
IDE ou background, portanto, não podem consumir a capacidade duas vezes.
Confirmações de edição de Shell do Plan nunca entram no caminho de auto-diff da
IDE, e aprovações persistentes de irmãs pulam confirmações marcadas com
`hideAlwaysAllow`.

## Apresentação da confirmação

Todo prompt de Shell do Plan oculta a aprovação persistente. Confirmações de
desconhecido adicionam:

> O modo Plan não conseguiu determinar se este comando shell é somente leitura.
> A aprovação se aplica apenas a esta invocação exata, uma única vez; ela pode
> modificar o estado do sistema e o modo Plan permanecerá ativo.

Confirmações de edição de desconhecido também ocultam ações de modificação e
adicionam o comando bruto como um segundo aviso, mantendo o diff. A TUI renderiza
avisos de edição acima do diff e reserva sua altura com quebra de linha para que
as opções permaneçam visíveis em terminais pequenos. O ACP envia avisos antes do
diff ou do conteúdo do plan. Stream-json e dual-output incluem avisos em seu
campo `permission_suggestions` existente.

As bridges ACP e de subagente aninhado validam o ID de opção retornado contra as
opções exatas enviadas ao host. A saída do plan mantém suas quatro escolhas
especiais existentes porque essas escolhas foram realmente enviadas. Opções
ausentes, forjadas, ocultas ou malformadas falham de forma fechada (fail
closed).

Eventos de teammate carregam detalhes opcionais de confirmação sem callback. O
stream-json os usa para avisos enquanto o scheduler Core do teammate permanece
como o validador final da invocação exata. YOLO headless cancela uma confirmação
não plan marcada com `hideAlwaysAllow` porque não existe superfície de aviso
interativa. A aprovação de background nunca converte um resultado persistente
não oferecido em `ProceedOnce`; resultados persistentes não plan cancelam,
enquanto a confirmação do plan retém apenas sua escolha `ProceedAlways` real.

## Mensagens de falha

Escritas conhecidas, superfícies indisponíveis de aprovação de desconhecido e
aprovações obsoletas usam as mensagens fixas do plano de implementação. Essas
mensagens declaram deliberadamente que o modo Plan permanece ativo e proíbem
retentar escritas conhecidas por meio de wrappers ou ofuscação.

## Alternativas rejeitadas

- **Tratar unknown como write.** Mais simples, mas bloqueia investigação
  necessária quando o parser não consegue modelar um comando que, de outra
  forma, seria legítimo.
- **Tratar unknown como read-only após PM allow.** Uma regra allow não é prova
  de comportamento somente leitura e apagaria o limite do Plan.
- **Persistir uma regra allow após aprovação de desconhecido.** O resultado do
  classificador e a requisição exata são transitórios; a persistência
  autorizaria um comando futuro mais amplo.
- **Reutilizar a aceitação de diff da IDE.** Callbacks da IDE podem mudar o
  conteúdo e correr contra a superfície de aviso, então não podem consumir com
  segurança uma capacidade exata de shell.
- **Validar apenas os argumentos brutos da requisição.** Construtores de
  ferramenta normalizam e validam a entrada; tanto a forma bruta quanto a
  executável devem permanecer vinculadas.
- **Validar apenas quando o prompt é criado.** Modo e estado de permissão podem
  mudar enquanto um prompt está visível.
- **Adicionar um tipo de confirmação ou feature flag dedicada.** Os formatos de
  confirmação e campos de aviso existentes são suficientes e mantêm a mudança
  menor.

## Verificação

A cobertura unitária exercita classificação de política, snapshots, abort,
mudanças de revisão e de argumentos, deny/erro do PermissionManager, decoração
de avisos, sanitização de payload, roteamento do Core, posse de respostas
duplicadas, autoaprovação de irmã, comportamento de edição sed com quebra de
linha, paridade do Monitor, especulação, opções e avisos do ACP,
SubagentTracker, stream-json de teammate, normalização de background,
dual-output, layout da TUI e redação do prompt.

A validação manual usa um workspace Git descartável contendo um arquivo de
exemplo e cobre estes casos:

1. No modo Plan, verificar que `git status` é executado, `touch changed.txt` é
   bloqueado e um comando desconhecido como `python -c 'print(1)'` oferece
   apenas aprovação única e cancelar antes de perguntar novamente na sua próxima
   invocação.
2. Executar uma edição com wrapper em uma confirmação compacta estreita e
   verificar que o comando bruto, aviso, contexto do diff, pergunta e escolhas
   disponíveis permanecem visíveis enquanto modificação e aprovação persistente
   ficam indisponíveis.
3. Mudar a revisão do modo Plan ou o diretório de trabalho enquanto uma
   aprovação está pendente, retornar payloads de aprovação alterados ou não
   oferecidos e enviar respostas duplicadas ou tardias; verificar que cada
   caminho cancela sem execução.
4. Repetir os casos read-only, write e unknown por meio de Monitor, ACP,
   stream-json, teammates aninhados e execução em background; verificar que
   toda superfície usa a mesma classificação e comportamento fail closed.

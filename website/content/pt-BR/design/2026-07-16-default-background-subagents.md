# Subagentes em Segundo Plano por Padrão

## Resumo

Subagentes one-shot de nível superior devem ser executados em segundo plano por padrão. Chamadores
que precisam de um resultado inline podem optar por não usar com `run_in_background: false`.
Lançamentos de subagentes aninhados e lançamentos fixados em um `working_dir` de propriedade do
chamador permanecem operações em primeiro plano porque o ciclo de vida atual em segundo plano não
consegue retornar resultados com segurança para esses chamadores. Forks e colegas nomeados do Agent
Teams mantêm seu comportamento existente.

## Motivação

A ferramenta Agent já suporta execução em segundo plano em consumidores interativos,
headless e SDK, mas os chamadores atualmente precisam solicitá-la com
`run_in_background: true` ou selecionar um agente declarado com `background: true`.
Isso faz a delegação comum bloquear o pai por padrão, mesmo quando o pai
poderia continuar com trabalho independente. Tornar a execução em segundo plano o padrão
de nível superior corresponde melhor à orientação de delegação paralela da ferramenta, mantendo
uma saída explícita para primeiro plano para trabalho dependente de resultado.

## Objetivos

- Executar subagentes one-shot de nível superior em segundo plano quando
  `run_in_background` é omitido.
- Preservar `run_in_background: false` como um opt-out explícito para primeiro plano.
- Preservar os caminhos existentes de notificação de conclusão, cancelamento, concorrência,
  permissão, transcript e espera headless.
- Manter formatos de lançamento inseguros ou não suportados em seu caminho de primeiro plano existente.
- Documentar o impacto de compatibilidade para skills e chamadores que precisam de um
  resultado inline.

## Não objetivos

- Execução em segundo plano para lançamentos de subagentes aninhados.
- Execução em segundo plano em um `working_dir` de propriedade do chamador.
- Mudanças na herança de contexto de fork ou no ciclo de vida de fork.
- Mudanças no comportamento de colegas nomeados do Agent Teams.
- Uma nova configuração global para o padrão.
- Redesenhar o roteamento de notificação em segundo plano ou a propriedade de tarefa.

## Comportamento

O runtime resolve a execução de subagentes one-shot nesta ordem:

1. Um colega nomeado do Agent Teams usa o caminho de colega existente.
2. Um fork válido de nível superior usa o caminho de fork desacoplado existente.
3. Um subagente comum aninhado é executado em primeiro plano, mesmo quando segundo plano foi
   solicitado, para que seu resultado retorne ao chamador aninhado.
4. Um subagente comum com `working_dir` e sem padrão de segundo plano configurado é executado em
   primeiro plano porque o chamador é dono do ciclo de vida daquele worktree. Uma solicitação de
   segundo plano explícita ou configurada permanece inválida.
5. Para qualquer outro subagente comum de nível superior:
   - `run_in_background: false` executa em primeiro plano.
   - `run_in_background: true` executa em segundo plano.
   - um `run_in_background` omitido executa em segundo plano.

O frontmatter `background: true` existente no nível do agente permanece aceito por
compatibilidade. Ele não é mais necessário para obter o novo padrão de nível superior.
Um valor explícito de chamada de ferramenta de `run_in_background: false` tem precedência e
seleciona o caminho de primeiro plano.

## Implementação

A decisão de despacho permanece na ferramenta Agent, para que todo consumidor receba o
mesmo comportamento. A decisão de segundo plano deve distinguir três conceitos:

- se o chamador optou explicitamente por não usar;
- se o lançamento é de nível superior;
- se o formato de lançamento pode ser desacoplado com segurança.

A implementação deve reutilizar o ramo existente de segundo plano em vez de adicionar
um segundo caminho de lançamento. O texto do schema da ferramenta e a orientação de uso voltada ao modelo
devem descrever o segundo plano como padrão e dizer aos chamadores para passar
`run_in_background: false` quando precisarem do resultado inline.

A exceção de `working_dir` deve ser resolvida antes do guard de incompatibilidade
existente. Um parâmetro de segundo plano omitido não deve transformar lançamentos de revisão
fixados anteriormente válidos em erros. Um `run_in_background: true` explícito ou um agente
configurado com `background: true` permanece incompatível com `working_dir`,
preservando a verificação de segurança existente.

## Fluxo de Resultado

Um lançamento com segundo plano padrão retorna a resposta existente de lançamento em segundo plano
para o pai imediatamente. A tarefa desacoplada permanece registrada no registry existente de
tarefas em segundo plano. Quando ela termina, o registry emite a notificação existente de
conclusão, falha ou cancelamento e o pai processa o
resultado em um turno posterior. Nenhum novo formato de mensagem ou evento de SDK é introduzido.

Opt-outs para primeiro plano continuam pelo ramo síncrono existente e retornam
o resultado sanitizado do subagente inline.

## Documentação

O guia do usuário de subagentes deve declarar que subagentes one-shot nomeados são executados em
segundo plano por padrão no nível superior e explicar
`run_in_background: false`. A comparação com fork deve focar na
herança de contexto e na semântica de resultado, em vez de afirmar que todos os subagentes nomeados
bloqueiam o pai.

## Testes

A cobertura unitária deve verificar:

- um subagente comum de nível superior com a flag omitida é lançado em
  segundo plano;
- `run_in_background: false` retorna o resultado inline;
- `run_in_background: true` retém o comportamento existente de segundo plano;
- um lançamento aninhado com a flag omitida ou true permanece em primeiro plano;
- um lançamento com `working_dir` com a flag omitida permanece em primeiro plano;
- uma solicitação explícita de segundo plano com `working_dir` permanece rejeitada;
- o comportamento de fork e de colega nomeado permanece inalterado;
- o schema da ferramenta e a orientação de uso anunciam o novo padrão e o opt-out.

Testes existentes que exercitam intencionalmente o ramo de primeiro plano devem passar
`run_in_background: false` para que sua expectativa seja explícita. O arquivo de teste focado da ferramenta
Agent, o build e o typecheck são obrigatórios antes da submissão. Uma verificação E2E
interativa manual deve confirmar que uma delegação normal retorna o controle
imediatamente e depois entrega uma notificação de conclusão, enquanto uma delegação explícita
em primeiro plano bloqueia e retorna seu resultado inline.

## Riscos e Compatibilidade

A mudança quebra comportamentalmente prompts, skills e chamadores
programáticos que omitem a flag e assumem que a resposta da ferramenta Agent contém o
resultado do subagente. Esses chamadores devem passar `run_in_background: false`.

A execução em segundo plano padrão também pode aumentar o trabalho concorrente. Os limites globais
existentes de concorrência e o enfileiramento permanecem as salvaguardas de controle. O tratamento de
permissões, o encerramento e a espera headless já usam o ciclo de vida estabelecido de tarefas em
segundo plano e não são alterados por este design.

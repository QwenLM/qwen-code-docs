# Classificação de segurança de shell

## Contexto e escopo

A issue [#6949](https://github.com/QwenLM/qwen-code/issues/6949) requer que o
modo Plan distingua comandos comprovadamente somente leitura de comandos cujo
comportamento não pode ser estabelecido estaticamente. Um booleano não
consegue manter essa distinção, então esta alteração introduz uma camada de
fatos de três estados em `shellAstParser.ts` sem alterar o roteamento de
permissões.

Esta alteração não modifica o roteamento nem a lógica dos pontos de chamada
em Shell, Monitor, PermissionManager, especulação, agentes com escopo de
memória, ACP, prompts do modo Plan ou comportamento de saída do Plan.
Consumidores booleanos existentes podem se tornar mais conservadores onde o
classificador é endurecido. Uma alteração futura pode rotear comandos
`unknown` para aprovação pontual usando o novo fato sem alterar este
classificador.

## Contrato

`classifyShellCommandSafety(command)` é uma API interna do módulo com estes
resultados:

| Resultado   | Significado                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `read-only` | Todo caminho executável é comprovado pelas regras atuais como não modificando estado persistente ou externo.                                  |
| `write`     | A sintaxe contém evidência positiva de mutação de estado de arquivo, Git, processo ou outro. Não é necessário que o comando tenha sucesso no final. |
| `unknown`   | O comando não pode ser provado como seguro ou mutante pelas regras estáticas suportadas.                                                      |

Para uma AST válida, os resultados se combinam na ordem
`write > unknown > read-only`. Uma árvore contendo `ERROR` é classificada
como `unknown` antes de avaliar a sintaxe parcial. Substituições de comando e
de processo impõem um piso `unknown` enquanto seus conteúdos executáveis são
varridos, de modo que um gravador conhecido aninhado promove o resultado para
`write`. A análise de redirecionamentos é dona das substituições dentro de
nós de redirecionamento, enquanto os avaliadores de comando e de instrução
excluem esses nós de suas varreduras de substituição, evitando travessia
repetida de substituições aninhadas. O fluxo de controle usa o mesmo piso
unknown e varre os ramos possíveis. Uma definição de função não é uma
execução e portanto permanece `unknown` sem classificar seu corpo como uma
escrita executada.

Uma atribuição pura isolada e `cd` preservam o comportamento de
compatibilidade existente. Uma atribuição que prefixa um comando ou
compartilha uma sequência composta com outra instrução impõe um piso
`unknown`, porque variáveis como `LD_PRELOAD`, `PATH`, `PAGER` ou
configuração específica de ferramenta podem mudar o comportamento; evidência
explícita de escrita ainda vence. Subshells e grupos de comandos agregam seus
conteúdos executados. A API analisa apenas a string de origem fornecida; ela
não desembrulha `sudo` ou interpretadores, não resolve PATH ou aliases, nem
carrega configuração de shell.

## Falha do parser e API de compatibilidade

O classificador privado pode lançar exceção ao carregar ou executar o
tree-sitter. A API pública de três estados mapeia essas falhas para `unknown`
e nunca substitui por certeza via regex. Um parser que lança exceção durante
o parse é descartado e reconstruído a partir da linguagem Bash já carregada,
porque a instância com falha pode permanecer envenenada; isso não recarrega o
runtime nem a linguagem. A API de compatibilidade `isShellCommandReadOnlyAST()`
existente retorna `true` apenas para `read-only`, mas mantém o fallback de
regex existente quando o tree-sitter não pode ser carregado ou lança exceção
em runtime. Uma árvore sintaticamente inválida é um resultado `unknown`
normal, não uma falha do parser, então ela nunca entra nesse fallback. Toda
árvore retornada com sucesso é liberada uma única vez em um bloco `finally`.

Essa assimetria é intencional: novos consumidores precisam de um fato honesto
de incerteza, enquanto consumidores booleanos existentes mantêm seu
comportamento de disponibilidade do parser até migrarem explicitamente.

## Evidências suportadas

O classificador reconhece um conjunto limitado e sensível a maiúsculas de
gravadores diretos de sistema de arquivos, comandos de sinalização de
processo, redirecionamentos de saída, famílias de mutação Git e modos
explícitos de escrita em `find`, `sed`, `awk`, `sort`, `tree`, `uniq`, `tee`
e `dd`. Sed e AWK usam varredores lineares compartilhados que distinguem
programas inline de valores de opção e argumentos de arquivo, de modo que
entrada escapada, malformada ou altamente repetitiva não pode disparar
backtracking de regex nem fabricar evidência de escrita a partir de um nome
de arquivo. Arquivos de saída do Git para `diff`, `log` e `show` são
escritas. Formas de `printf -v` com estado são unknown. Helpers Git
explícitos e verificação de assinatura, incluindo opções de ambiente de
pager/config, helpers de diff/conversão de texto, pager externo do grep e
placeholders de assinatura, são unknown; opções globais Git não suportadas e
caminhos de ajuda de subcomando também falham com fail closed, porque a ajuda
pode iniciar um visualizador externo. Execução dinâmica, scripts externos,
alvos de saída ambíguos, interpretadores e wrappers,
`sort --compress-program`, pré-processadores do ripgrep, helpers de hostname
e busca em arquivos compactados (`--pre`, `--hostname-bin`, `--search-zip` e
`-z`), e comandos comuns de pager permanecem `unknown`. Terminadores de opção
e a aridade de valor das opções suportadas são interpretados, de modo que um
nome de arquivo ou mensagem literalmente chamado `--help` não seja confundido
com uma invocação de ajuda. Nomes de comando com maiúsculas/minúsculas
diferentes, gerenciadores de pacotes fora da lista, serviços e executáveis
personalizados também permanecem `unknown`; o classificador não é um sandbox.

O verificador síncrono depreciado espelha todo padrão recém-rejeitado
necessário pelo agendamento síncrono. Ele preserva expansões de parâmetro com
sentinelas em vez de permitir que `shell-quote` as apague, rejeita pipelines
finais malformados e compostos com atribuição, e avalia wrappers a partir do
comando original. Ele permanece intencionalmente booleano e é mais
conservador que o classificador de AST: comandos `printf`, `sort` com muitas
opções, `tree`, `uniq`, `rg` e `ripgrep`, e formas de branch do Git além dos
modos de listagem mais simples, executam sequencialmente.

## Consumidores e fronteira de migração

Os consumidores booleanos atuais são Shell, Monitor, PermissionManager, o
gate de especulação e a configuração de agentes com escopo de memória; seus
pontos de chamada não mudam neste refactor. O verificador síncrono também é
usado pelo agendador de ferramentas do core e pelo utilitário legado de
permissão de shell. O agendador agora passa o comando original ao
verificador, de modo que wrappers permaneçam unknown em vez de serem
desembrulhados em um comando aparentemente somente leitura.
`extractCommandRules()` permanece independente da classificação de segurança.

O follow-up `fix(core): Route unknown Plan shell commands to one-off approval`
deve consumir `classifyShellCommandSafety()` apenas na fronteira de permissão
do Plan. Ele deve definir separadamente a proveniência da aprovação, tempo de
vida, comportamento ACP e a interação com a saída do Plan; essas políticas
não pertencem à camada de fatos.

## Referência do Claude Code

A análise de Bash do Claude Code é útil como evidência para dois princípios
de design: a incerteza do parse deve ser representada explicitamente, e as
decisões de permissão devem falhar com fail closed quando o parse não está
disponível ou é complexo demais. Seu parser Bash maior e motor de políticas
não são copiados, porque o Qwen Code precisa apenas de um classificador
pequeno na fronteira atual.

## Verificação

A cobertura unitária usa matrizes orientadas a tabela para todos os três
estados, precedência de compostos, substituições, erros de sintaxe,
inicialização do parser e falhas em runtime, comportamento limitado para
entrada aninhada e escapada adversária, e monotonicidade de compatibilidade.
Os testes do verificador síncrono e do agendador impedem que comandos
recentemente conhecidos como inseguros participem de lotes concorrentes de
Shell.

# Editor leve de configurações JSONC

## Contexto

O runtime ACP importa estaticamente os gravadores de configurações e de pastas
confiáveis. Ambos os gravadores atualmente dependem de `comment-json`, cujo
cluster de parser contribui com 304.770 bytes para a closure de inicialização
do ACP. Esses módulos sofrem parse e são avaliados antes que o filho ACP possa
responder a `initialize`, mesmo que a maioria das inicializações não escreva
nenhum dos dois arquivos.

O candidato 6 da issue #7264 propõe carregar esse parser de forma lazy ou
substituí-lo por um parser mais leve. As APIs de escrita e seus chamadores são
síncronos, e distribuições autônomas não fornecem dependências JavaScript
arbitrárias fora do bundle, então um `require()` em runtime ou import dinâmico
ampliaria a API ou quebraria o primeiro uso. `jsonc-parser` já está presente
no grafo de dependências de desenvolvimento, tem uma pegada pequena no bundle
e oferece APIs síncronas de parse e edição por caminho.

## Objetivos

- Remover `comment-json` e `esprima` da closure estática de inicialização do
  ACP.
- Preservar as APIs síncronas de escrita de configurações e de pastas
  confiáveis.
- Preservar comentários e indentação, finais de linha, newline final e BOM
  UTF-8 do arquivo existente durante atualizações comuns.
- Preservar o comportamento de mesclagem, sincronização e substituição de
  subárvore exata.
- Manter inalterados o lock de pastas confiáveis, releitura de disco,
  validação, permissão, escrita atômica, notificação e liberação de lock.
- Rejeitar JSONC malformado ou não objeto sem sobrescrevê-lo.

## Não objetivos

- Alterar migrações de configurações ou semântica de pastas confiáveis.
- Tornar as escritas de configuração assíncronas.
- Reformatar todos os arquivos de configuração.
- Substituir o caminho separado e estrito de carregamento de pastas
  confiáveis.
- Adicionar uma abstração JSONC de propósito geral para outros pacotes.

## Design

Renomear o utilitário legado em camel-case para um módulo de editor JSONC em
kebab-case. O módulo mantém a API existente de atualização no nível de arquivo
e o helper `applyUpdates`, e adiciona duas operações síncronas em memória:

1. Interpretar o JSONC como um objeto de nível superior enquanto coleta e
   rejeita todos os erros de parser. Um BOM UTF-8 inicial é temporariamente
   removido antes do parse.
2. Aplicar atualizações de mesclagem, sincronização ou subárvore exata ao
   valor interpretado, calcular os caminhos de objeto alterados e aplicar
   esses caminhos ao texto original com `jsonc-parser.modify()`.

Objetos são comparados recursivamente para que comentários e layout
inalterados permaneçam intactos. Arrays e valores escalares são substituídos
atomicamente. Antes de excluir uma propriedade, um comentário inline na mesma
linha é removido junto com ela; caso contrário, `jsonc-parser` pode anexar o
comentário à propriedade anterior. A saída completa é interpretada novamente e
comparada com o valor pretendido antes que qualquer chamador a escreva.

Chaves de objeto duplicadas precisam de tratamento explícito porque
`jsonc-parser` avalia o último valor enquanto `modify()` mira a primeira
propriedade correspondente. Antes de aplicar atualizações por caminho de
objeto, propriedades duplicadas anteriores ao longo desses caminhos são
removidas para que a última propriedade efetiva permaneça. Comentários
pertencentes a ocorrências duplicadas removidas são removidos com elas. Isso
evita retornar sucesso enquanto deixa o valor efetivo inalterado.

Arquivos novos continuam usando JSON com dois espaços. Arquivos existentes
mantêm tabs ou espaços detectados, LF ou CRLF, estado de newline final e um
BOM inicial.

`trustedFolders` reutiliza o parser e o editor em memória depois de obter seu
lock existente e reler o arquivo. Ele ainda valida o estado do disco e o
estado proposto, escreve por meio de `atomicWriteFileSync()` com modo `0o600`,
`forceMode: true` e `noFollow: true`, atualiza a memória apenas depois que a
escrita tem sucesso e libera o lock em `finally`.

`jsonc-parser` torna-se uma dependência de produção direta da CLI e
`comment-json` é removido. Imports no código-fonte usam a entrada pública do
pacote para que a saída compilada não empacotada permaneça diretamente
executável pelo Node. A configuração do esbuild faz alias dessa entrada para o
build ESM do pacote porque o bundle voltado para Node, caso contrário,
seleciona sua entrada UMD, cujos requires CommonJS relativos não sobrevivem ao
bundle ESM dividido. O guarda de bundle de fast path proíbe `comment-json`,
`esprima` e o build UMD de `jsonc-parser` na closure estática do ACP.

## Tratamento de falha

- Erros de parser ou uma raiz não objeto abortam antes da escrita.
- Valores que não podem ser representados como JSON abortam antes da escrita.
- Uma incompatibilidade entre o documento editado e o valor pretendido aborta
  antes da escrita.
- Escritas de configurações preservam o retorno `false` existente e
  diagnósticos em stderr em falha de parse ou validação.
- Escritas de pastas confiáveis preservam seu comportamento de lançar erro
  para que chamadores nunca atualizem o estado em memória após uma escrita
  autoritativa com falha.
- Falhas de sistema de arquivos, lock, permissão e escrita atômica mantêm seu
  comportamento existente.

## Alternativas consideradas

### `import('comment-json')` dinâmico

Rejeitado porque o caminho público de escrita é síncrono e tem chamadores
síncronos de migração, UI, ACP e daemon. Converter o grafo de chamadas para
assíncrono é mais amplo do que esta otimização.

### `createRequire()` lazy

Rejeitado porque o esbuild deixaria a dependência fora do bundle enquanto
arquivos autônomos não incluem pacotes JavaScript arbitrários em
`lib/node_modules`. Uma primeira escrita empacotada poderia falhar em runtime.

### Sempre reescrever com `JSON.stringify()`

Rejeitado porque descartaria comentários e formatação do usuário durante
atualizações normais de configurações.

### Tokenizador próprio

Rejeitado porque `jsonc-parser` já fornece a árvore de parse e primitivas de
edição necessárias com uma implementação substancialmente menor e mantida.

## Validação

- Testes unitários focados cobrem o comportamento existente mais entrada
  malformada, raízes não objeto, vírgulas finais, comentários aninhados e
  inline, comentários de propriedade excluída, semântica de
  mesclagem/sincronização/substituição, chaves de poluição de protótipo,
  chaves duplicadas, CRLF, tabs, newline final, BOM, escritas no-op e
  validação de saída.
- Testes de pastas confiáveis cobrem mesclagem de disco com lock, entrada e
  saída inválidas, preservação de comentários, sincronização exata, escritas
  atômicas com preservação de permissão, escritas com falha e liberação de
  lock.
- Os testes de guarda de bundle e um metafile gerado do esbuild provam que nem
  `comment-json` nem `esprima` estão na closure estática do ACP.
- Build, typecheck, lint e testes focados da CLI devem passar.
- Os bundles de release de controle e candidato rodaram no host estabelecido
  de 2 vCPUs com um warmup descartado, 30 cold starts pareados alternados e
  30 inicializações pré-aquecidas pareadas alternadas. O candidato reduziu o
  P50 de `channel.initialize` frio em 35,39 ms, o P50 de
  processo→primeira sessão em 38,00 ms e o P50 de
  processo→primeira sessão completa em 48,51 ms. Ele venceu 28 de 30 pares
  frios para cada métrica principal, com intervalos bootstrap pareados de 95%
  inteiramente abaixo de zero.
- O caminho já pré-aquecido de processo→sessão completa foi estatisticamente
  neutro. Primeiras sessões concorrentes, modo legado de sessão única,
  telemetria habilitada e telemetria desativada todas completaram com sucesso,
  produziram a telemetria esperada e não deixaram processo residual.
- O pico de RSS da árvore de processos do candidato foi cerca de 10,8 MiB mais
  alto durante a inicialização, mas um acompanhamento separado de 10 pares
  amostrou os mesmos processos após um período ocioso de 10 segundos. A
  diferença mediana pareada em regime estável foi 0,55 MiB com intervalo
  bootstrap cruzando zero, mostrando que a diferença de pico era timing de
  inicialização transitória e coleta de lixo, e não um aumento persistente de
  pegada.
- A closure estática exata do ACP diminuiu de 12.449.869 para 12.145.099
  bytes, uma redução de 304.770 bytes (2,45%), sem nenhuma entrada de
  `comment-json`, `esprima` ou UMD de `jsonc-parser`.

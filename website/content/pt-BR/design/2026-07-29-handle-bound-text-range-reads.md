# Leituras de Intervalo de Texto Vinculadas a Handle

## Contexto

O PR #7947 permitiu que o filesystem do workspace do Serve retornasse janelas
de linhas limitadas de arquivos de texto acima de `MAX_READ_BYTES` (256 KiB).
Para manter essas leituras fixadas em um único inode ao longo de validação,
sondagem binária e streaming, ele repassou um `FileHandle` de posse do
chamador para dentro de `readTextRange` como um campo opcional, e adicionou um
segundo campo opcional, `forceStreaming`, para suprimir o fast path de
buffering que de outra forma derrotaria o limite de memória.

Dois campos opcionais em um ponto de entrada produziram quatro combinações,
das quais uma é significativa, uma é inalcançável e uma é insegura:

| `fileHandle` | `forceStreaming` | Resultado                                                              |
| ------------ | ---------------- | ---------------------------------------------------------------------- |
| ausente      | ausente          | leitura de caminho comum                                                |
| ausente      | presente         | streaming de um arquivo pequeno — usado por um teste                    |
| presente     | presente         | a leitura do limite do Serve                                            |
| presente     | ausente          | buffering do arquivo inteiro pelo handle — **nenhum chamador alcança**  |

A combinação inalcançável carregava um helper dedicado,
`readFileHandleBuffer`, sem cobertura de teste. Separadamente,
`readFileWithLineAndLimit` aceitava o mesmo `fileHandle` mas só podia honrá-lo
no seu ramo de intervalo: uma leitura ilimitada caía para
`readFileWithEncodingInfo` por caminho, retornando silenciosamente bytes do
que quer que o caminho resolvesse naquele momento em vez do inode fixado. O
commit de acompanhamento do PR #7947 protegeu isso com um `RangeError` em
runtime, que documentou a armadilha sem removê-la.

A detecção de encoding havia se bifurcado pela mesma razão.
`detectFileEncoding` recebe um caminho e abre seu próprio descritor, então o
caminho por handle não podia usá-lo; um `detectFileHandleEncoding` privado foi
adicionado ao lado, derivando o nome do encoding de
`decodeBufferWithEncodingInfoAsync(...).encoding` em vez de diretamente do
chardet. Os dois divergem quando o chardet nomeia um encoding que o
`iconv-lite` não consegue carregar: a variante por caminho retorna esse nome,
a variante por handle retorna `'utf-8'` e delega à falha `fatal: true` do
decodificador de streaming. Ambos recusam o arquivo, com mensagens diferentes.

## Objetivos

- Um único detector de encoding, utilizável a partir de um caminho ou de um
  descritor emprestado.
- Nenhum flag de modo no leitor de intervalo; tornar a combinação
  inalcançável irrepresentável em vez de meramente não usada.
- Tornar o fallthrough por caminho estruturalmente impossível em vez de
  guardado.
- Nenhuma mudança observável no limite do Serve ou na ferramenta `read_file`.

## Não objetivos

- Fundir `decodeBufferWithEncodingInfo` (síncrono) no seu gêmeo assíncrono. A
  variante síncrona é um shim deliberado de compatibilidade de API pública
  ([`lazy-first-use-dependencies.md`](./lazy-first-use-dependencies.md))
  fixado por um teste de paridade.
- Qualquer mudança no que o limite do Serve retorna. Isto é preparação para
  paginação por cursor de bytes, não essa funcionalidade.

## Design

### Um detector

`detectFileEncoding(source: string | FileHandle)`. Um handle fornecido é
_emprestado_: leituras usam posições explícitas para que a posição de arquivo
do chamador fique intocada, e o bloco `finally` fecha apenas um descritor que
esta função mesma abriu. `detectFileHandleEncoding` é removido, e o switch
BOM-para-nome escrito à mão é substituído pelo `bomEncodingToName` existente.

Isso torna o caminho por handle levemente mais estrito, que é a direção
pretendida: um encoding que o `iconv-lite` não consegue carregar agora levanta
`LargeNonUtf8TextError(detected)` nomeando esse encoding, em vez de chegar ao
decodificador e levantar a variante genérica `'invalid-utf8'`. A recusa é
inalterada; a mensagem melhora. O limite do Serve mapeia ambos para
`binary_file`, então nada downstream se move.

Um segundo delta menor vem com a fusão: `detectFileEncoding` captura todos os
erros e faz fallback para `'utf-8'`, enquanto `detectFileHandleEncoding` não
tinha handler e deixava uma falha de I/O propagar. A falha não é perdida — um
handle ruim o suficiente para falhar na sondagem de 8 KiB falha na leitura em
streaming imediatamente depois, e um arquivo que não é realmente UTF-8 ainda
é recusado pelo decodificador `fatal: true` — então o erro emerge de uma
chamada diferente em vez de desaparecer. Aceito pela política única de
fallback; anotado porque é uma mudança real em qual chamada reporta o
problema.

### Dois pontos de entrada

```ts
readTextRange(request: ReadTextRangeRequest)                    // caminho
readTextRangeFromHandle(fh, request: ReadTextRangeFromHandleRequest)
```

A variante por handle sempre faz streaming — não há flag, porque um chamador
recorre a um handle precisamente quando precisa que a leitura seja limitada, e
o fast path de buffering leria o arquivo inteiro. Seu tipo de requisição não
tem `path` (nada para alguém desambiguar), retém o `fileSize` numérico
capturado do `fstat` de abertura e torna ambos os limites de bytes
obrigatórios em vez de opcionais. `maxOutputBytes` limita o que a leitura
retorna, `maxScanBytes` limita o que ela custa, e `fileSize` impede que um
append alargue o snapshot do descritor enquanto a leitura está em andamento.
Uma leitura vinculada a handle existe porque um limite de segurança precisa
de todos os três limites.

`maxScanBytes` permanece opcional na variante por caminho, onde o padrão é
`Infinity` para que a ferramenta `read_file` fique inalterada.

Ambas delegam para a mesma implementação de streaming, que agora recebe
`source: string | FileHandle` e seleciona `createReadStream` ou
`chunksFromHandle` conforme o caso. `readFileHandleBuffer` e o ramo que o
chamava são removidos.

### O fallthrough desaparece

`readFileWithLineAndLimit` perde `fileHandle`, `forceStreaming` e
`maxScanBytes` — seu único chamador de produção não passa nenhum deles.
`StandardFileSystemService.readTextFileFromHandle` agora chama
`readTextRangeFromHandle` diretamente, e os dois caminhos de leitura
compartilham um helper `toReadTextFileResponse` para que sua modelagem de
metadata não possa divergir. Sem nenhum parâmetro `fileHandle` restante para
ignorar, o guard `RangeError` é removido: a armadilha que ele descrevia não
pode mais ser expressa.

`readTextFileFromHandle` permanece fora da interface `FileSystemService`,
então `AcpFileSystemService` e o mock de fallback tipado em
`filesystem.test.ts` ficam intocados.

## Raio de impacto

- `readTextRange` não é exportado de `packages/core/src/index.ts`; as três
  classes de erro voltadas ao limite são. A superfície remodelada do leitor é
  interna ao core.
- `readTextRange` e `readFileWithLineAndLimit` têm exatamente um chamador de
  produção cada (`fileUtils.ts`, `fileSystemService.ts`).
- `detectFileEncoding` é público via `export * from './utils/fileUtils.js'`.
  Alargar um parâmetro é compatível em nível de código-fonte.
- O único importador entre pacotes dos módulos tocados é
  `packages/cli/src/serve/fs/workspace-file-system.ts`. Sua única mudança é
  descartar dois argumentos que o caminho por handle não aceita mais — ver
  abaixo; o import de `decodeBufferWithEncodingInfoAsync` que ele também
  carrega fica intocado.

### `CoreReadTextFileHandleRequest` se torna independente

Era `Omit<CoreReadTextFileRequest, 'limit' | 'stats' | 'maxOutputBytes'> &
{...}`, o que deixava dois campos que o caminho por handle nunca lê:

- **`stats`** era documentado como obrigatório — "deve passar o Stats
  capturado daquele handle" — e nada downstream lia o objeto. A API final
  retém apenas seu `fileSize` numérico: o caminho por handle não precisa de
  metadata para escolher uma estratégia, mas precisa do tamanho de abertura
  para manter leituras limitadas quando o arquivo recebe appends
  concorrentemente.
- **`path`** tornou-se morto quando `readTextRangeFromHandle` substituiu a
  chamada com caminho mais handle: a leitura é vinculada ao descritor, e os
  erros são rotulados com o caminho pelo limite do Serve que é dono dele.

Nenhum dos dois foi capturado pelo compilador. O `ReadTextFileRequest` do ACP
do qual este tipo derivava permite propriedades extras, então passar um campo
que o tipo havia removido não levantava nada. Esse é o argumento para
declarar o tipo de forma independente em vez de derivá-lo: a cadeia de `Omit`
estava removendo quatro de seis campos herdados e readmitindo silenciosamente
o resto.

No commit do refactor, 282 linhas de lógica de produção mudaram em
`packages/core`; o acompanhamento posterior de cursor adiciona comportamento
e testes sobre essa base.

## Testes

No commit do refactor, as suítes existentes eram a especificação: o objetivo
inteiro era que o limite do Serve não pudesse perceber. O acompanhamento
posterior de cursor adiciona comportamento de limite e seus próprios testes.

Três testes em `read-text-range.test.ts` migraram para
`readTextRangeFromHandle`. Dois usavam `fileHandle` diretamente. O terceiro
usava um _caminho_ com `forceStreaming: true` para forçar streaming em um
arquivo pequeno demais para sair do fast path, de modo a exercitar o limite
de orçamento no EOF; sem o flag, a variante por handle é a única coisa que
sempre faz streaming.

Um dos testes migrados mudou de significado. Ele anteriormente passava um
handle para um arquivo e um caminho nomeando um arquivo diferente, assertindo
que o handle vencia — um teste para a confusão que a assinatura antiga
permitia. A variante por handle não tem `path`, então essa confusão agora é
irrepresentável e o teste não assertiria nada. Ele foi reescrito para cobrir
a propriedade que realmente motivou a API: abrir um handle, renomear outro
arquivo sobre o caminho e confirmar que a leitura continua seguindo o inode.

Dois testes em `fileSystemService.test.ts` foram removidos em vez de
reparados. Eles faziam mock de `readFileWithLineAndLimit` e assertiam o
objeto de argumento que ele recebia; como `readTextFileFromHandle` não o chama
mais, eles só poderiam ser mantidos reapontando-os para um novo mock, o que
novamente assertiria apenas que uma função passa argumentos para outra. O
comportamento que eles nominalmente cobriam é testado contra arquivos reais
em `read-text-range.test.ts` e no limite real em
`workspace-file-system.test.ts`. Os testes de validação de argumento ao lado
deles são mantidos — eles não precisam de mock.

## Acompanhamento

`chunksFromHandle` ganhou um parâmetro `from` como a única costura que a
paginação de texto por cursor de bytes precisava. O acompanhamento agora o usa
para retomar de um deslocamento de bytes diferente de zero.

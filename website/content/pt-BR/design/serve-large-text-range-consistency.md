# Consistência de intervalo de texto grande no Serve

## Contexto

O Serve agora transmite em stream janelas de texto com limite finito a partir
de arquivos maiores que `MAX_READ_BYTES`. Uma requisição apenas de linhas ou
apenas de maxBytes não destrava este caminho. A fronteira de workspace abre o
arquivo uma vez, lê por meio desse handle e retorna metadados parciais sem um
hash de arquivo completo.

Um descritor de arquivo aberto fixa o inode, mas não congela os bytes do
inode. O Node também não sincroniza operações de sistema de arquivos que
modificam o mesmo arquivo concorrentemente. Um leitor pode, portanto, observar
bytes escritos após o `open`, incluindo uma reescrita no lugar com o mesmo
inode e tamanho.

A issue #7946 requer que arquivos alterados ou substituídos durante uma
leitura permaneçam rejeitados. Leituras tolerantes a append não fazem parte
desse contrato.

## Decisão

Janelas grandes em stream usam o stat do arquivo no momento da abertura como
seu baseline de snapshot:

1. O `lstat` inicial e o `fstat` no momento da abertura devem identificar o
   mesmo arquivo regular com o mesmo dispositivo, inode, tamanho, tempo de
   modificação e tempo de alteração.
2. Após o stream, tanto o `fstat` quanto o `lstat` do caminho devem manter
   essa identidade e versão, e o caminho não deve ser um symlink.
3. O chamador fecha o handle em `finally`, depois de todas as verificações de
   leitura e estabilidade.
4. Uma incompatibilidade detectada por essas verificações de estabilidade
   retorna `hash_mismatch`.

Erros de validação de conteúdo são capturados até que as verificações
pós-leitura terminem, então uma mutação concorrente que também faz a
decodificação falhar ainda retorna `hash_mismatch`. Sem uma mutação, conteúdo
binário permanece `binary_file` e texto grande não UTF-8 permanece
`file_too_large` com uma dica de conversão.

Isso corresponde à política existente de estabilidade de snapshot completo.
Ela rejeita intencionalmente appends concorrentes: o crescimento de tamanho
prova que o snapshot no momento da abertura não era estável, enquanto a
identidade de inode sozinha não pode provar que o prefixo original permaneceu
inalterado.

Tolerância confiável a append exigiria um mecanismo de snapshot separado ou
uma segunda leitura limitada que verifica cada byte usado para localizar e
produzir a janela de linhas solicitada. Esse I/O adicional e política de
protocolo estão fora desta correção de bug.

## Limpeza do leitor de intervalo

Um handle de arquivo pertencente ao chamador sempre seleciona o caminho de
stream. O interruptor separado `forceStreaming` e o fast path de buffer de
handle são, portanto, removidos. O leitor de chunks por handle limita
leituras posicionais ao tamanho de arquivo capturado pelo chamador, então uma
leitura não pode cruzar o EOF no momento da abertura, e reutiliza um único
buffer de 512 KiB porque cada chunk é decodificado sincronamente antes que o
gerador avance.

Não há orçamento fixo de bytes de varredura: offsets de linha exigem varrer do
byte zero, então janelas profundas permanecem O(tamanho do arquivo). O limite
finito de linhas e o teto de `MAX_READ_BYTES` limitam o conteúdo retornado e a
memória, enquanto o cancelamento é verificado entre leituras. Uma futura
política de custo de varredura precisa de um cursor ou contrato de continuação
equivalente em vez de tornar silenciosamente offsets profundos válidos
inalcançáveis.

Leituras de snapshot completo do Serve derivam `lineEnding` do arquivo
decodificado inteiro. Os caminhos de janela de arquivo grande ainda o derivam
da janela retornada, exceto que uma página de cursor de bytes também conta um
terminador fora da sua fatia retornada — aquele após o qual ela retoma e,
quando sua primeira linha é cortada pelo orçamento de bytes, aquele que o
re-snap percorre — então uma página de cauda sem terminador concorda com a
página anterior, e uma página truncada por bytes concorda com a página
posterior, em um arquivo com finais de linha uniformes (arquivos com finais
mistos ainda podem alternar entre páginas, e uma janela de linha de arquivo
grande de um arquivo uniforme pode discordar de uma página de cursor de bytes
dos mesmos bytes; unificar os caminhos é um acompanhamento candidato — nenhuma
issue de rastreio existe ainda). O core pode continuar reportando metadados no
nível de arquivo para seus outros consumidores.

Toda janela de arquivo grande mantém `truncated: true`, mesmo quando a
varredura por acaso alcança o EOF. Esta fronteira usa o flag para distinguir
uma janela sem um hash de arquivo completo de um snapshot completo que é
seguro tratar como conteúdo de arquivo inteiro; não significa apenas que
caracteres decodificados foram omitidos.

## Consumidores

Todos os chamadores do Serve resolvem pelo runtime de workspace selecionado
antes de alcançar esta fronteira:

- `GET /file`
- `_qwen/file/read` do HTTP ACP
- o adaptador `readTextFile` do ACP injetado

Leituras sem janela usadas pela configuração de workspace mantêm a recusa
existente de snapshot completo de 256 KiB.

## Verificação

- A janela de linha de um arquivo grande com EOL misto reporta o estilo de
  final de linha presente na fatia retornada; uma página de cursor de bytes
  também pode reportar um terminador fora da sua fatia retornada (veja
  Decisão).
- Append concorrente, truncamento, substituição de caminho e substituição de
  symlink são rejeitados. Uma reescrita no lugar com o mesmo tamanho é
  rejeitada sempre que a alteração cai em um quantum de timestamp posterior:
  as verificações comparam o tempo de modificação e o tempo de alteração,
  então uma reescrita que também restaura o tempo de modificação é capturada
  apenas pelo avanço do tempo de alteração, o que é melhor esforço na
  resolução de relógio grosseiro do kernel em vez de uma garantia absoluta,
  embora ainda estritamente mais forte que a comparação anterior de snapshot
  completo por tamanho + tempo de modificação.
- Leituras de intervalo por handle nunca usam o fast path de buffer completo e
  reutilizam seu buffer de stream.
- Um offset profundo além de 10 MiB tem sucesso com um limite finito de
  linhas.
- Requisições sem limite, apenas de linha e apenas de maxBytes permanecem
  atrás do gate de snapshot completo de 256 KiB.
- Limites existentes de saída, codificação, binário, hash e contagem de linhas
  permanecem inalterados.

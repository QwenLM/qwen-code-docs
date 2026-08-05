# Orçamento Final de Resposta de Ferramenta

## Problema

A saída de ferramenta é atualmente encurtada em várias camadas independentes. A
saída de Shell é encurtada perto de 30K caracteres e marcada como truncada, a
saída de ferramenta genérica é encurtada perto de 2K caracteres, e um lote do
agendador do Core pode descarregar a saída quando o agregado excede o orçamento de
lote configurado. Essas camadas não compartilham estado estruturado.

O agendador trata um marcador de truncamento existente como prova de que nenhum
trabalho adicional é necessário. Consequentemente, vários resultados de Shell
encurtados individualmente ainda podem exceder o orçamento agregado. O modo
headless torna a lacuna maior porque cria um agendador por chamada de ferramenta e
concatena suas respostas fora desses agendadores. O modo interativo similarmente
anexa respostas duplicadas e sintéticas após a finalização do agendador. ACP,
agente e execução especulativa têm suas próprias fronteiras de agregação.

A requisição do modelo, a transcrição retomável e o registro de resultado de
ferramenta devem conter a mesma resposta limitada. Exibição rica de ferramenta
voltada ao usuário está intencionalmente fora de escopo e pode continuar a usar a
exibição de resultado existente.

## Invariantes

1. Todo lote de resposta de ferramenta é finalizado na última fronteira de
   agregação antes de ser enviado ao modelo.
2. O texto serializado de saída de ferramenta naquele lote não excede o orçamento
   agregado de caracteres configurado quando o orçamento é finito e positivo. O
   lembrete de ciclo de vida de `enter_plan_mode` é entrada de política, não saída
   de ferramenta, e permanece inline fora deste orçamento.
3. Se um produtor já persistiu artefatos de saída, camadas posteriores reutilizam
   esses caminhos em vez de escrever a mesma saída do produtor novamente.
4. A finalização agregada usa metadados internos estruturados para decidir se
   artefatos persistidos podem ser reutilizados; ela nunca infere essa decisão a
   partir de texto legível por humanos. O tratamento de sentinela local do produtor
   permanece um detalhe de compatibilidade dos truncadores existentes.
5. A finalização preserva a ordem de resposta e partes não textuais. Ela pode
   encurtar apenas `functionResponse.response.output`,
   `functionResponse.response.error` e partes de texto de nível superior que
   pertencem ao lote de resposta de ferramenta.
6. As partes finalizadas são também as partes gravadas para replay e retomada.
7. A exibição de ferramenta permanece independente da resposta do modelo.

## Design

### Metadados de persistência

`ToolResult` e `ToolCallResponseInfo` carregam um campo interno opcional
`persistedOutputFiles`.

- `undefined`: nenhuma decisão de persistência foi tomada pelo produtor.
- `[]`: uma decisão foi tomada e não há arquivo reutilizável.
- um array não vazio: artefatos de saída persistidos pelo produtor estão
  disponíveis naqueles caminhos.

O campo não é incluído em serialização de hook, payloads ACP, saída JSON,
atributos de telemetria ou metadados de UI persistidos. Uma resposta reconstruída
por um hook não herda metadados a menos que seja explicitamente copiada pelo
runtime.

### Prévia no nível do produtor

O truncamento do produtor controla a prévia normal do modelo e persiste a saída
completa uma vez.

- Shell mantém o gatilho atual de 30K mas retorna uma prévia de início e fim de
  aproximadamente 4K para que informações de saída permaneçam visíveis.
- MCP mantém seu gatilho atual de saída grande, retém o resultado transformado
  completo para exibição voltada ao usuário e usa uma prévia de modelo de
  aproximadamente 2K.
- Persistência genérica retorna o caminho realmente escrito tanto para o gravador
  primário quanto para o de fallback.

Essas prévias não são aplicação agregada. Uma resposta já encurtada pode ser
encurtada novamente pela finalização.

### Finalizador compartilhado

Um finalizador compartilhado aceita respostas na ordem original mais o orçamento
agregado configurado. Ele mede todos os campos de texto limitados, então reduz o
texto até que o agregado caiba. Caminhos persistidos existentes são reutilizados.
Uma resposta sem um caminho reutilizável é persistida no máximo uma vez antes que
uma referência de caminho substitua ou acompanhe sua prévia encurtada.

A redução é determinística. Uma alocação water-fill max-min compartilha o
orçamento entre campos de texto voltados ao modelo enquanto permite que campos
pequenos mantenham seu conteúdo completo. Campos reduzidos retêm uma pequena
prévia de início e fim e listam os caminhos de artefatos persistidos disponíveis
quando a alocação permite. Pares surrogate Unicode nunca são divididos. A passada
final de limite rígido encurta texto sem E/S para que falha de persistência não
possa violar a invariante de tamanho de requisição.

O finalizador recalcula `contentLength` a partir das partes retornadas. Orçamentos
infinitos ou desabilitados são um no-op.

`enter_plan_mode` é a única exceção semântica. Sua saída bem-sucedida de
função-resposta instala a política de planejamento ativa, então truncá-la mudaria
regras de execução em vez de encurtar saída de diagnóstico. O finalizador e o
guard de envio de última chance identificam aquela saída por nome de ferramenta e
a excluem da alocação; texto de falha e toda saída comum no mesmo lote permanecem
limitados.

### Fronteiras de runtime

- O agendador do Core finaliza antes dos hooks `PostToolBatch` para limitar a
  entrada de hook e novamente após o hook para limitar a saída de hook.
- O modo interativo mescla respostas executáveis, duplicadas e sintéticas na ordem
  ordinal original, então realiza a finalização externa antes de gravar e
  submeter.
- O modo headless coleta todo o turno, incluindo chamadas duplicadas, puladas,
  canceladas e executadas, então finaliza uma vez antes de gravar e submeter.
- O ACP coleta o turno completo de chamada de ferramenta, finaliza antes da
  gravação da transcrição e retorna as mesmas partes para a próxima mensagem.
  Eventos de exibição imediata do ACP permanecem inalterados.
- O runtime do agente e o acompanhamento especulativo finalizam seu agregado antes
  de emitir resultados voltados ao modelo ou anexar histórico.
- A fronteira de envio de chat aplica um limite de segurança sem E/S apenas aos
  campos de resposta de ferramenta. Ele deve normalmente ser um no-op e protege
  futuros chamadores que perdem uma fronteira de agregação externa.

## Tratamento de falha

Falha de persistência é reportada pelo log existente e nunca impede o truncamento
final. A resposta do modelo retornada ainda cabe no orçamento, mas pode omitir uma
referência de arquivo se nenhuma saída completa foi persistida com sucesso. Partes
de mídia permanecem intactas e não são contadas neste orçamento de caracteres.

Respostas de cancelamento e parada de hook são finalizadas exatamente como
respostas de ferramenta bem-sucedidas e com falha. Saída vazia e campos de erro
permanecem válidos. Uma única resposta maior que o orçamento de todo o lote é
reduzida por conta própria; múltiplas respostas grandes compartilham a capacidade
de prévia restante deterministicamente.

## Compatibilidade e não objetivos

O esquema público de resposta de função voltado ao modelo não muda. Texto de
truncamento existente permanece legível, mas a finalização agregada não depende
mais dele. Sessões existentes ainda podem ser reproduzidas em replay; apenas
resultados de ferramenta recém-gravados ganham a invariante mais estrita.

Esta alteração não adiciona hashes de bytes de wire, contabilização exata de
tokens, orçamento de mídia, alterações de ciclo de vida de armazenamento,
migração de transcrição ou um novo layout de arquivo temporário. Esses são
acompanhamentos independentes.

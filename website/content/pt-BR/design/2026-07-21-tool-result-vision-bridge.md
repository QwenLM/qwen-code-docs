# Vision bridge para resultados de ferramenta

## Contexto

O Vision Bridge existente converte imagens resolvidas a partir da entrada do
usuário, enquanto o `read_file` mantém imagens comuns fora de resultados de
ferramenta somente texto. Outras ferramentas podem retornar imagens como
`inlineData`; `convertToFunctionResponse` armazena essas imagens em
`functionResponse.parts`, e o emagrecedor de requisições depois as substitui
por placeholders MIME para um modelo somente texto. Como resultado, imagens
descobertas pelo modelo ou retornadas por ferramentas embutidas, MCP e de
extensão não são compreendidas por um modelo primário somente texto, mesmo
quando um modelo de visão está configurado.

## Design

O `read_file` preserva uma imagem comum apenas quando o modelo alvo ativo é
somente texto e um modelo de Vision Bridge está disponível. Ele próprio não
chama o modelo de visão; a transcrição específica de PDF permanece inalterada.

Um helper compartilhado do core processa partes normalizadas de resposta de
ferramenta imediatamente antes que elas se tornem entrada do modelo. Quando o
modelo alvo ativo aceita imagens, ou nenhum Vision Bridge está disponível, o
helper retorna a resposta inalterada. Se o modelo de visão configurado tem
capacidade de agente e o chamador pode alternar o restante do turno, o helper
limita o tamanho das imagens inline, preserva as imagens da ferramenta e
seleciona esse modelo por meio do override de turno completo existente. Caso
contrário, para cada `functionResponse` contendo imagens inline, ele chama o
Vision Bridge existente com as imagens e uma dica de foco limitada contendo o
nome da ferramenta, os rótulos das imagens e a saída textual existente.

O helper anexa a transcrição de máquina não confiável ao `response.output` ou
`response.error` existente, preserva o nome da função, o ID da chamada, outros
campos da resposta e mídia que não seja imagem, e remove toda imagem inline
original de `functionResponse.parts`. Falhas e cancelamento do bridge
substituem as imagens por uma nota explícita de indisponibilidade em vez de
permitir que dados brutos de imagem cheguem ao provider somente texto. Imagens
acima do limite de contagem ou bytes do bridge também são removidas e
reportadas pelo bloco de transcrição.

O helper compartilhado é usado pelo scheduler de ferramentas do core e pelo
executor direto de ferramentas do ACP. O scheduler interativo, o executor não
interativo e o prompt ACP ativo podem aceitar um override de turno completo
disparado por ferramenta, então a próxima requisição do modelo e as
continuações de ferramentas posteriores permanecem no modelo de visão com
capacidade de agente. Em superfícies que suportam seleção inline de modelo, a
seleção explícita mantém a prioridade. Consumidores sem um canal de override em
nível de turno mantêm o fallback de transcrição em vez de expor imagens brutas
a um modelo somente texto. A execução de acompanhamento especulativa é a
exceção: como sua saída pode ser descartada e é usada apenas para preparar um
cache, ela remove imagens de resultado de ferramenta com uma nota explícita de
indisponibilidade e nunca as envia a um modelo de visão. Ferramentas embutidas,
ferramentas MCP e ferramentas de extensão todas entram por um desses caminhos.

Toda tentativa real de bridge de resultado de ferramenta é divulgada na
superfície ativa. A transcrição reporta o modelo de visão e o endpoint
selecionados usando o formatador existente do Vision Bridge, enquanto a tomada
de turno completo reporta o modelo que será dono do restante do turno. TUI e a
saída JSON mantêm a exibição original da ferramenta ao lado do aviso, e o ACP
emite o mesmo aviso como uma mensagem de agente.

Apenas bytes de imagem inline são convertidos. `fileData` de imagem, URLs,
texto com apenas caminho, áudio e vídeo permanecem fora desta mudança porque
resolvê-los introduziria políticas separadas de sistema de arquivos, rede,
autenticação e modalidade.

## Compatibilidade e comportamento em falhas

Os schemas públicos de ferramenta não mudam. O comportamento existente do
Vision Bridge para entrada do usuário e PDF permanece intacto. Configurações
sem modelo de visão mantêm seu comportamento atual de imagem não suportada ou
placeholder MIME. Uma chamada de ferramenta bem-sucedida não é convertida em um
erro de ferramenta apenas porque o bridge falhou; o modelo recebe o texto
original mais uma nota sanitizada de imagem indisponível. Detalhes de erro do
provider são registrados em log, mas nunca inseridos na resposta da função. O
orçamento de imagens por turno é compartilhado entre todos os caminhos de
bridge em um turno: a contagem corrente é chaveada no sinal de abort do turno,
então bridges de entrada do usuário, PDF e resultado de ferramenta descontam
do mesmo teto em vez de cada um receber um novo. Com um modelo de visão
configurado mas sem capacidade de agente, um turno que esgota o teto cedo deixa
imagens de ferramentas posteriores transcritas como orçamento esgotado; a
tomada por modelo com capacidade de agente não é afetada porque preserva as
imagens brutas em vez de transcrevê-las.

## Verificação

Testes focados cobrem leituras de imagem comum, imagens aninhadas de
ferramenta, resultados mistos de texto e imagem, múltiplas respostas de função,
falha e cancelamento do bridge, pass-through para alvo multimodal, aceitação e
rejeição da tomada de turno completo, divulgação visível ao usuário, remoção de
imagens na especulação e preservação da identidade da função e de campos que
não sejam imagem. Verificações de integração exercitam o scheduler do core, o
encanamento de override interativo e não interativo, o executor do ACP e os
pontos de chamada do executor especulativo. Build, typecheck, bundle e
verificação local do CLI completam a mudança.

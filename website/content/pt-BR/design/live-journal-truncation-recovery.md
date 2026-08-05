# Recuperação de truncamento do journal ao vivo

## Contexto

O daemon mantém um journal ao vivo limitado em memória para um turno
inacabado. Quando o journal excede 10.000 eventos ou 8 MiB, ele descarta os
eventos de replay mais antigos e acrescenta um marcador `history_truncated` no
início. A transcrição persistida e a compactação em fronteira de turno
permanecem autoritativas, então o turno completo torna-se disponível novamente
após um evento terminal formal.

O marcador anteriormente não tinha posse de prompt, o SDK renderizava uma
mensagem genérica e a WebUI ou ocultava o marcador atrás da paginação de
histórico ou deixava a cauda retida permanentemente visível. Este design
mantém os limites de recurso e a política de evicção existentes enquanto torna
a perda precisa e repara a cauda visível sem outra requisição de modelo.

## Protocolo e SDK

Para um marcador de journal ao vivo retornado por `session/load`, a ponte copia
o `activePromptId` autoritativo da sessão para o envelope do marcador como
`promptId` opcional. O evento persistido e a versão de schema de evento não
mudam. Um daemon mais antigo sem este campo é reparável apenas quando os
eventos ao vivo retidos têm exatamente um ID de prompt.

`DaemonHistoryTruncatedData` expõe os campos opcionais existentes `scope` e
`maxEvents`. A validação rejeita valores opcionais malformados. Os dados de
status normalizados mantêm o payload completo do daemon. O texto distingue
truncamento de histórico de replay de truncamento de turno ao vivo, afirma que
os eventos mais novos foram retidos e eventos de replay mais antigos foram
descartados, e promete recuperação pós-terminal apenas quando
`fullTranscriptAvailable` é verdadeiro.

## Episódio de recuperação da WebUI

Durante o replay de snapshot, um marcador ao vivo reparável cria um checkpoint
de episódio imediatamente antes do marcador. O checkpoint reutiliza blocos
imutáveis de transcrição e mantém o ID de sessão, ID de prompt alvo, marca
d'água de evento de snapshot, ID de bloco do marcador e uma assinatura de
episódio determinística. Páginas de histórico mais antigas e blocos de status
locais de provider são espelhados no checkpoint enquanto o marcador está
ativo.

Apenas um `turn_complete` ou `turn_error` correspondente arma a recuperação.
O cancelamento é representado por um evento terminal formal com motivo de
parada cancelado e segue o mesmo caminho. Eventos de transcrição em buffer são
descarregados e o estado do prompt é estabelecido antes que a recuperação seja
tentada. Um carregamento de sessão em andamento, requisição de página de
histórico, navegação ou prompt local adia a tentativa até o próximo ponto de
ociosidade.

A recuperação executa um único `session/load` na mesma sessão com replay em
memória e nenhum tamanho configurado de página de histórico. A transcrição
atual permanece anexada e visível até que a validação tenha sucesso. O novo
snapshot não deve estar degradado e deve conter tanto a entrada do usuário do
prompt alvo quanto um terminal formal correspondente. Uma falha de validação
ou de transporte retentável rejeita a substituição, retoma o handle de sessão
anterior do seu cursor SSE, preserva a transcrição e emite um único aviso
recuperável `daemon.live_journal_repair.failed`. Falhas de autenticação e uma
sessão ausente também preservam a transcrição e emitem o aviso, mas mantêm o
estado existente de desconectado ou reautenticação do provider porque esse
stream SSE não pode ser retomado com segurança.

Em caso de sucesso, a WebUI reconstrói o sufixo alvo a partir da primeira
entrada de usuário correspondente até a cauda do novo snapshot. Ela parte do
checkpoint quando o bloco do marcador ainda está retido; caso contrário,
reconstrói um snapshot completo limitado. Eventos reproduzidos reconstroem o
estado da transcrição, incluindo `assistant.done`, mas eventos no nível ou
abaixo da marca d'água do episódio não repetem avisos, sinais de workspace,
publicações de prompt pendente, publicações de acompanhamento ou outros
efeitos colaterais. IDs de evento mais novos mantêm seus efeitos normais.

O estado resultante é consolidado com um único reset de store. Quando o sufixo
completo cabe no `maxBlocks` do checkpoint, IDs de blocos de histórico
retidos, cursor de paginação, profundidade carregada e estado de capacidade
permanecem estáveis. Se ele cruzar esse limite, a política existente do store
pode aparar os blocos carregados mais antigos em vez de criar uma exceção de
reparação ilimitada. Um novo sufixo que termina com outro marcador ao vivo
recuperável cria um episódio separado para aquele prompt.

## Concorrência e ciclo de vida

Um episódio é tentado automaticamente no máximo uma vez. Um reload
configurado, troca de sessão, desmonte de página ou limpeza explícita de
sessão o aborta e remove. Um reload de reparo o preserva até sucesso ou falha.
O reload pausa a assinatura SSE antiga sem desanexar seu registro de sessão.
Um candidato rejeitado é desanexado e o handle anterior retoma do seu cursor
existente; um candidato validado torna-se o novo dono da assinatura.

O checkpoint herda o `maxBlocks` efetivo do store de transcrição atual,
enquanto o fallback com marcador aparado usa o `maxBlocks` configurado. Isso
preserva o comportamento existente de replay inicial excessivo sem criar uma
nova exceção para reparo. Blocos são compartilhados em vez de copiar payloads
de texto, e nenhum journal ilimitado ou segunda cache de transcrição é
introduzido.

## Compatibilidade

- Os campos `promptId`, `scope` e `maxEvents` do marcador são opcionais.
- Clientes antigos ignoram a extensão de envelope do marcador.
- Clientes novos aceitam payloads antigos e declinam com segurança de reparo
  automático ambíguo.
- O comportamento padrão de `reloadSession` permanece replay configurado;
  apenas o caminho interno de reparo solicita replay de memória.
- Persistência do daemon, APIs de transcrição, limites de journal e evicção do
  mais antigo permanecem inalterados.

## Verificação

A cobertura unitária exercita posse de marcador, compactação pós-terminal,
validação de payload, texto de status preciso, correspondência de prompt,
validação de replay, substituição atômica de sufixo, supressão de efeitos
colaterais duplicados, preservação de histórico, fallback de falha e
propagação de origem de reload. Testes de integração do daemon usam um agente
ACP mock determinístico e um journal de três eventos para observar o marcador
ao vivo a partir de um segundo cliente, verificar o turno completo compactado
após o terminal e montar o provider real da WebUI para provar que a
recuperação adiciona um carregamento e nenhuma requisição de modelo.

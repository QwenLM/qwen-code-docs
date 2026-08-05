# SSE de geração sem estado do daemon

## Objetivo

Adicionar `POST /session/:id/generate`, um endpoint SSE com escopo de
requisição para geração curta e sem estado de texto. O chamador fornece um
`prompt` em texto simples. O filho ACP primeiro resolve o modelo rápido
configurado e faz fallback para o modelo principal da sessão quando o modelo
rápido está ausente ou não pode ser resolvido.

## Contrato

O corpo da requisição é `{ "prompt": string }`. Prompts devem ser não vazios e
não maiores que 32 KiB em UTF-8. O endpoint emite eventos SSE `started`,
`thinking` opcional, `delta`, `done` e `error`. Ele é consumido com `fetch`,
porque o `EventSource` nativo não pode enviar um corpo de POST.

A geração é isolada da conversa principal: ela não lê nem altera o histórico
de chat, não usa o prompt de sistema nem a memória principais e sempre envia
`tools: []`. Os clientes não podem selecionar um modelo nem configurações de
geração. O contrato é agnóstico de tarefa: tradução é o primeiro consumidor do
Web Shell, não parte do esquema do endpoint.

## Arquitetura

A rota pede ao `AcpSessionBridge` um stream de geração. A ponte cria um ID de
requisição e registra uma fila limitada com escopo de requisição antes de
despachar `qwen/control/session/generation/start` para o filho ACP. O filho
tenta `config.getFastModel()` primeiro, faz fallback para `config.getModel()`
durante a resolução, cria o gerador de conteúdo correspondente através de
`BaseLlmClient.resolveForModel` e consome `generateContentStream`. Os chunks
retornam através de `qwen/notify/session/generation/event` e são roteados
apenas para a fila de requisição registrada. Eles não são publicados no
EventBus da sessão nem no ring de replay.

A desconexão do cliente envia `qwen/control/session/generation/cancel`; o
filho aborta o controlador correspondente. Uma fila limitada da ponte protege
o daemon de um leitor HTTP lento. O escritor HTTP respeita o backpressure de
`res.write()`.

## Fallback de modelo

O fallback ocorre apenas no momento da seleção. Um modelo rápido ausente ou
inválido seleciona o modelo principal. Uma vez que a geração inicia, falhas do
provider encerram o stream; trocar de modelo depois que deltas foram emitidos
duplicaria ou misturaria a saída.

## Tradução de thinking do Web Shell

Blocos de thinking concluídos expõem uma ação de tradução ao passar o mouse. A
ação permanece visível enquanto o bloco de thinking está expandido. O Web Shell
envia um prompt de tradução através deste endpoint e renderiza deltas em um
popover. As contagens finais de tokens de entrada e saída aparecem abaixo da
tradução. O popover pode cancelar uma requisição em andamento ou descartar o
resultado em cache e traduzir novamente. Um evento `thinking` sem conteúdo
reporta progresso sem expor o raciocínio. Blocos de thinking ativos nunca
expõem a ação. Traduções concluídas são armazenadas em cache na memória da
página por idioma, mensagem e conteúdo, então reabrir o popover não faz outra
requisição ao modelo; uma atualização da página limpa o cache.

## Não objetivos

- Contexto ou histórico de conversa
- Chamadas de ferramenta
- Overrides arbitrários de modelo ou de amostragem
- Replay de SSE ou retomada de reconexão
- Um registro de tarefas ou esquemas específicos de tarefa
- Alterações em `packages/core`

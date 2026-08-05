# Status de Runtime de Sessão do Daemon

## Problema

Clientes do daemon podem fazer polling de uma sessão ativa por meio de
`GET /session/:id/status` e listar sessões por meio de
`GET /workspace/:id/sessions`, mas o único sinal de atividade do runtime hoje é
`hasActivePrompt`. Os clientes não conseguem distinguir um turno aguardando uma
permissão comum, uma resposta de `ask_user_question` ou um turno com falha cujo
erro deve permanecer visível até que o trabalho seja retomado.

## Design

A bridge ACP possui uma pequena extensão de status em memória em cada
`SessionEntry` ativo:

- `hasTurnError` e `turnError` armazenam o erro terminal do turno com falha mais
  recente.
- `pendingInteractions` mapeia ids de requisição de permissão pendentes para ações
  de permissão ou perguntas de usuário normalizadas e prontas para renderização.

O ciclo de vida do prompt existente permanece como a fonte para `hasActivePrompt`.
Um turno com falha registra sua `message` sanitizada, `code` opcional e
`errorKind` opcional quando emite o evento SSE `turn_error` existente. O erro
permanece visível até que o próximo prompt enfileirado alcance o dispatch e
realmente inicie; um prompt aceito mas enfileirado não o limpa.

O child ACP marca explicitamente as requisições de permissão `ask_user_question`
nos metadados da chamada de ferramenta. A bridge lê apenas esse marcador estável,
em vez de inferir a categoria a partir do texto da UI ou do nome de uma
ferramenta.

## API

O resumo ativo existente ganha campos aditivos opcionais:

- `isWaitingForPermission`
- `isWaitingForUserQuestion`
- `pendingInteractionCount`
- `hasTurnError`
- `turnError` (`message`, `code` opcional, `errorKind` opcional)
- `pendingInteractions`: título/conteúdo/entrada da ação e opções selecionáveis
  para permissões; perguntas e opções selecionáveis para `ask_user_question`. Cada
  pergunta carrega uma `answerKey` para o payload de voto de permissão
  `answers: Record<string, string>`.

`GET /session/:id/status` retorna todos os campos para uma sessão ativa. A lista
de sessões do workspace carrega os mesmos campos de runtime, incluindo `turnError`
e `pendingInteractions`, para entradas ativas, de modo que os chamadores possam
renderizar e aprovar interações diretamente durante o polling em lote. Sessões
persistidas que não estão ativas omitem os novos campos para que os chamadores não
confundam um estado de runtime indisponível com um estado ocioso conhecido.

## Escopo

Isso não persiste o estado do runtime entre reinicializações do daemon, não
adiciona um novo endpoint nem substitui o SSE para consumo detalhado de eventos. A
rota de voto existente `POST /session/:id/permission/:requestId` resolve um item
pendente; as respostas de perguntas usam sua extensão `answers` existente.

# Telemetria de Workspace de Sessões Legadas

## Contexto

O middleware de telemetria do daemon classifica requisições HTTP antes que os
handlers de rota do Express sejam executados. Rotas legadas singulares de
sessão podem resolver para qualquer workspace registrado, mas o middleware não
consegue saber o runtime selecionado apenas pela URL. Resolver o proprietário
ao vivo tanto no middleware quanto no handler duplica trabalho e pode divergir
se o registro mudar entre as duas consultas.

Este design dá a cada rota legada explícita `/session`, `/sessions` e
`/permission` um span de requisição estável, atribuindo as rotas dinâmicas ao
runtime selecionado pelo handler.

## Inventário de rotas

O catálogo de rotas contém todas as 48 rotas legadas explícitas. Cada entrada
declara seu método HTTP, template de caminho Express, rótulo canônico da rota
e um de dois modos de atribuição:

- `handler_resolved` (41 rotas): `POST /session`, load/resume, a rota legada
  de transcrição e toda rota singular de sessão que resolve um proprietário ao
  vivo. O handler publica o workspace do runtime selecionado para a telemetria.
- `pre_resolved` (7 rotas): exportação legada, ação A2UI, organização legada,
  as três mutações globais em lote e o voto de permissão global. Essas rotas
  permanecem vinculadas ao workspace primário.

O correspondente do catálogo segue os padrões relevantes do Express 5:
segmentos estáticos não diferenciam maiúsculas/minúsculas, uma barra final é
aceita e segmentos de parâmetro são decodificados apenas depois que seu limite
de caminho bruto foi capturado. Um id de sessão malformado é retido como seu
valor bruto. Ids de requisição de permissão são decodificados antes da sua
validação existente de comprimento e conjunto de caracteres. O `http.route`
emitido sempre usa o template canônico do catálogo.

## Atribuição adiada

Requisições resolvidas pelo handler iniciam sem `qwen-code.workspace.hash`. O
middleware armazena um contexto privado na resposta Express. O código da rota
chama `setDaemonTelemetryWorkspace(res, runtime.workspaceCwd)` depois que um
runtime único foi selecionado. O setter é de melhor esforço e a primeira
seleção vence: um valor idêntico repetido é idempotente e um valor diferente
posterior é ignorado.

As quatro costuras de publicação são:

1. `requireSessionRuntime`, compartilhado pelas rotas de proprietário ao vivo.
2. Criação de sessão após seleção de workspace.
3. Load/resume de sessão após seleção do runtime alvo.
4. Resolução de transcrição legada após um proprietário único ao vivo ou
   persistido ser encontrado.

A publicação precede verificações posteriores de confiança, secundário não
suportado, conflito e validação de requisição. Consequentemente, essas falhas
retêm o runtime selecionado de forma única. Requisições que falham antes da
seleção única, incluindo casos não encontrado, ambíguo e incompatibilidade de
workspace, omitem o hash do workspace. A atribuição usa
`runtime.workspaceCwd`, não o cwd solicitado ou temporário de uma sessão.

No `finish` ou `close` da resposta, o middleware faz o hash do workspace
publicado, define o atributo do span, registra a resposta e encerra o span.
Resolução, hash e atualizações de span são de melhor esforço e não podem
afetar o tratamento da requisição nem a liquidação de métricas. O contexto é
limpo após uma liquidação.

Requisições pré-resolvidas continuam a fazer o hash do workspace selecionado
pelo middleware quando o span inicia. Remover o callback de proprietário ao
vivo do middleware garante que um proprietário ao vivo seja resolvido no
máximo uma vez por requisição.

## Streaming e métricas

Todas as 48 rotas do catálogo criam spans de requisição. Uma resposta
`GET /session/:id/events` bem-sucedida encerra seu span quando a conexão SSE
fecha, mas é excluída da contagem/duração ordinária de requisições HTTP e do
ring de métricas de status do Web Shell, porque sua duração é o tempo de vida
da conexão. Falhas de handshake SSE são registradas como requisições HTTP
curtas ordinárias.

`POST /session/:id/generate` é uma operação SSE limitada com escopo de
requisição. Sua conexão termina quando a geração completa, então sua duração
permanece uma latência de requisição significativa e continua a entrar nas
métricas HTTP ordinárias.

Requisições de heartbeat permanecem nas métricas HTTP do OpenTelemetry, mas
continuam excluídas do ring de métricas de status. `GET /daemon/status` também
permanece excluído apenas desse ring. Uma guarda de liquidação compartilhada
previne registro duplicado quando tanto `finish` quanto `close` disparam.

As métricas HTTP e o ring de métricas do Web Shell permanecem globais do
daemon. Adicionar uma dimensão de workspace às métricas exige uma revisão
separada de cardinalidade e compatibilidade de dashboards.

## Compatibilidade e limites

Esta alteração não muda rotas, esquemas de requisição ou resposta, SDKs,
capabilities, persistência, autenticação, ordenamento de confiança, leases de
arquivamento, mapeamento de erros da ponte nem execução de sessão. Ela não
adiciona atributos públicos de telemetria.

O middleware de telemetria é instalado após autenticação bearer, rate limiting
e parsing de JSON, então requisições rejeitadas por esses gates anteriores
permanecem fora desta cobertura de spans de requisição. HEAD/OPTIONS
implícitos, comportamento de log de acesso, normalização de caminho de
rate-limit, rotas de grupo de sessões de workspace, organização qualificada
por workspace, telemetria de ACP/WebSocket e habilitar execução de
branch/fork/cd secundários estão fora do escopo.

## Verificação

- Uma guarda de deriva compara as rotas legadas explícitas registradas no
  Express com o catálogo e afirma o inventário 48/41/7.
- Testes do correspondente cobrem maiúsculas/minúsculas, barra final, barra
  codificada, Unicode, codificação malformada, validação de id de permissão,
  incompatibilidade de método/caminho e rótulos canônicos.
- Testes do middleware cobrem atribuição adiada, primeira-seleção-vence, cache
  de hash, falhas de telemetria, liquidação única, métricas SSE, heartbeat e
  exclusões de status.
- Testes de rota cobrem proprietário ao vivo, criação, restauração e
  publicação de transcrição para casos primário, secundário, não confiável,
  ausente, ambíguo e conflito.
- Um teste de outfile com dois workspaces verifica hashes secundário,
  vinculado ao primário e omitido sem expor caminhos brutos de workspace.

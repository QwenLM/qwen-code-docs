# Divisão final do serve server.ts

## Objetivo

Continue a divisão em etapas de `packages/cli/src/serve/server.ts` sem alterar o comportamento do daemon. Esta passagem move os handlers REST inline restantes, pequenos helpers de middleware, construção de capacidades, configuração do registro de device-flow e configuração do rate-limiter para módulos internos focados. `createServeApp()` permanece como o ponto de composição para o estado do daemon, ordem dos middlewares, registro de rotas, montagem do transporte ACP, fallback do Web Shell e tratamento final de erros.

## Ordem de Middleware e Rotas

A ordem de montagem faz parte do contrato do daemon e deve permanecer visualmente auditável em `createServeApp()`:

1. remoção de `Origin` same-origin
2. CORS e allowlist de hosts
3. `/health` e `/demo` pré-autenticação em setups de loopback permitidos
4. log de acesso
5. assets estáticos do Web Shell
6. bearer auth
7. rate limit
8. parser de body JSON e mapeador de erros do parser JSON
9. `/health` e `/demo` pós-autenticação quando necessário
10. telemetria do daemon
11. grupos de rotas REST
12. rotas HTTP e WebSocket do ACP
13. fallback do Web Shell
14. handler de erro final

## Limites Extraídos

`server/self-origin.ts`, `server/access-log.ts`, `server/rate-limiter-setup.ts` e `server/error-handlers.ts` possuem pequenos blocos de middleware/configuração que antes ficavam inline em `createServeApp()`. Eles são intencionalmente simples e mantêm a mesma ordem de registro em `server.ts`.

`server/serve-features.ts` possui a lista de códigos de idioma, o cache de capacidades de transcrição de voz e a construção da entrada do envelope de recursos anunciados. Sua função de invalidação de cache ainda é chamada pelos caminhos de recarga/alteração das configurações do workspace.

`server/device-flow-registry.ts` possui o registro do provedor OAuth padrão do Qwen, a conexão do event sink, os breadcrumbs de auditoria no stderr e a instalação do registro `app.locals`.

`routes/capabilities.ts` possui o `GET /capabilities`.

`routes/workspace-mcp-control.ts` possui as mutações de restart, gerenciamento, adição e remoção de runtime do MCP.

`routes/workspace-lifecycle.ts` possui `/workspace/init` e `/workspace/reload`.

`routes/workspace-tools.ts` possui `/workspace/tools/:name/enable`.

Cada módulo de rota recebe apenas as dependências de que precisa. Nenhum dos novos módulos importa `server.ts`, o que mantém a direção da dependência unidirecional e evita ciclos.

## Restante em `server.ts`

`server.ts` ainda possui a criação do app, canonicalização de bound-workspace, construção de bridge/filesystem/workspace, criação de mutation gate, ordenação de rotas, montagem de HTTP/WebSocket do ACP, posicionamento de estáticos/fallback do Web Shell e as exportações de compatibilidade consumidas pelos chamadores existentes.

Não é exigido que o arquivo caia para menos de 200 linhas neste PR. O critério de aceitação é que ele não tenha handlers de endpoint REST inline e seja lido como um arquivo de montagem cuja ordem comportamental pode ser revisada em um só lugar.

## Não objetivos

Esta passagem não altera response bodies, status codes, headers, frames SSE, comportamento do ACP, auth gates, tiers de rate-limit, semântica de device-flow ou taxonomia de erros. Não remove os shims de compatibilidade de `status.ts`, `event-bus.ts` ou `in-memory-channel.ts`. Não renomeia documentos históricos nem introduz um framework de Router ou um único god context para as rotas.

## Notas de Auditoria

A rodada 1 verificou os limites da arquitetura e manteve o padrão existente `registerXRoutes(app, deps)` em vez de adicionar uma abstração de Router.

A rodada 2 verificou a direção das dependências e moveu a configuração de device-flow/runtime para trás de helpers, sem permitir que nenhum módulo de rota importasse `server.ts`.

A rodada 3 verificou os caminhos de falha e manteve o mapeamento de erros da bridge, erros do parser de body JSON, mutation gates estritos e os call sites de validação de client-id com preservação de comportamento.

A rodada 4 verificou a compatibilidade e reteve as exportações públicas de `server.ts` para `run-qwen-serve.ts`, chamadores HTTP do ACP e testes.

A rodada 5 verificou a estratégia de testes e utiliza `server.test.ts` focado, testes de rotas, testes HTTP do ACP, typecheck, build, lint, grep de endpoints inline e `git diff --check`.
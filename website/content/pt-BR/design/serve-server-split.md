# Divisão em etapas de serve server.ts

## Objetivo

Dividir `packages/cli/src/serve/server.ts` em etapas sem alterar o comportamento do daemon. A primeira etapa extrai helpers compartilhados e grupos de rotas cujos limites já estão claros, mantendo `createServeApp()` responsável por conectar middlewares, dependências com estado, montagens de transporte e o tratamento final de erros.

## Ordem de Middlewares e Rotas

A ordem de montagem do app faz parte do comportamento público e deve permanecer estável:

1. Remoção de `Origin` same-origin
2. CORS e allowlist de hosts
3. `/health` e `/demo` pré-autenticação em setups de loopback permitidos
4. Log de acesso
5. Assets estáticos do Web Shell
6. Autenticação bearer
7. Rate limit
8. Parser de body JSON e mapeador de erros do parser JSON
9. `/health` e `/demo` pós-autenticação quando necessário
10. Telemetria do daemon
11. Grupos de rotas REST
12. Rotas HTTP e WebSocket do ACP
13. Fallback do Web Shell
14. Handler final de erros

## Limites Extraídos

`server/request-helpers.ts` é responsável pela sanitização do body da requisição, parsing de client-id, detecção de loopback, validadores de path/query e parsing do body de vote de permissão. Os módulos de rota dependem deste arquivo em vez de importar de `server.ts`.

`server/error-response.ts` é responsável pela taxonomia de erros da bridge e mapeamento de respostas HTTP. Os wrappers exportados aceitam um logger de daemon opcional para que os módulos de rota possam manter o comportamento existente de stderr e daemon-log.

`server/session-list.ts` é responsável pela mesclagem da lista de sessões persistidas e em tempo real usada tanto por chamadores REST quanto por chamadores HTTP do ACP.

`server/fs-factory.ts` é responsável pela construção da factory de sistema de arquivos do workspace padrão e emissão de avisos de auditoria de fs.

`server/telemetry.ts` é responsável pela classificação de rotas e middleware de telemetria HTTP do daemon.

`server/prompt-deadline.ts` é responsável pela resolução do deadline do prompt e sua classe sentinela de abort.

Os módulos de rota seguem o estilo existente `registerXRoutes(app, deps)`. Eles recebem apenas as dependências de que precisam, não um único "god context".

## Não objetivos

Esta etapa não altera bodies de resposta, status codes, headers, formato de frames SSE, ordem de autenticação ou taxonomia de erros. Não exclui shims de re-exportação de compatibilidade como `status.ts`, `event-bus.ts` ou `in-memory-channel.ts`. Não renomeia documentos históricos nem limpa paths camelCase não relacionados.

`server.ts` pode continuar com mais de 200 linhas após esta etapa. O critério de aceitação são limites estáveis que tornam a extração posterior de sessões e SSE mecânica.

## Notas de Auditoria

A rodada 1 verificou os limites da arquitetura e rejeitou uma nova abstração de Router porque os módulos de rota existentes já usam funções diretas `registerXRoutes(app, deps)`.

A rodada 2 verificou os caminhos de falha e manteve a taxonomia de erros em um único helper para que a extração de rotas não possa alterar silenciosamente os códigos de status HTTP.

A rodada 3 verificou a compatibilidade e mantém as exportações públicas consumidas por `run-qwen-serve.ts`, dispatch HTTP do ACP e testes.

A rodada 4 verificou a estratégia de testes e depende de `server.test.ts` focado, testes de HTTP do ACP e de rotas, pois trata-se de uma refatoração estrutural sem alteração de comportamento visível pelo usuário.
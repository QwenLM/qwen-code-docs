# Referência da API REST do daemon

Esta é a interface pública REST/SSE para integrações que executam
`qwen serve --no-web` e fornecem sua própria UI. Comece pelo
[guia de integração](./rest-api-integration.md), depois use esta página para
descoberta de endpoints e a [referência do protocolo HTTP](./qwen-serve-protocol.md)
para a semântica detalhada do ciclo de vida.

## OpenAPI

O contrato curado de 25 operações está disponível como
[OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json).
Importe essa URL em um renderizador compatível com OpenAPI, gerador de clientes ou
ferramenta de validação. O JSON versionado é o contrato de interface portável para as
operações indexadas abaixo e é validado em relação ao guia, aos cabeçalhos do protocolo
e às rotas registradas no CI.

Este índice cobre um subconjunto central curado da superfície REST do daemon, não
toda ela.
Fora dele estão as rotas de primeira parte do Web Shell, superfícies internas
condicionais e outras rotas públicas porém não centrais: mutação de arquivos, registro
de workspace, organização e geração de sessão, e MCP, skills e providers de workspace,
entre outros. Essas superfícies são anunciadas por suas próprias capability tags; a
[referência do protocolo HTTP](./qwen-serve-protocol.md) documenta as superfícies de
sessão, status de workspace e arquivos, e o gerenciamento de servidores MCP, auth
providers e sign-in por device-flow são cobertos pelas
[notas de auth e segurança do daemon](./daemon/12-auth-security.md). Eles estão fora
deste contrato, não descontinuados.

## Lendo o índice

- **Capability** é a tag de funcionalidade a ser verificada em `GET /capabilities`.
  Um travessão significa que a operação não tem uma tag de funcionalidade dedicada;
  clientes que precisam suportar builds mais antigos do daemon devem tratar `404`.
- **Scope** indica qual runtime possui a operação. `process-global` lê estado de todo
  o daemon, `selected-runtime` usa a seleção de workspace da requisição,
  `persisted-workspace` resolve armazenamento de sessão persistido, `live-session-owner`
  roteia pela sessão ao vivo, e `legacy-primary` sempre visa o workspace primário do
  daemon. `GET /session/:id/export` é fixado no primário: resolve apenas runtimes
  internos gerenciados antes de fazer fallback para o workspace primário.
- Todas as operações neste índice são **stable** no contrato REST v1. O nome de
  capability descontinuado `unstable_session_resume` é apenas um alias; use
  `session_resume` para a rota de resume estável.

## Descoberta

| Operation                                                        | Capability     | Scope            | TypeScript SDK              |
| ---------------------------------------------------------------- | -------------- | ---------------- | --------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | `health`       | `process-global` | `DaemonClient.health`       |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | `capabilities` | `process-global` | `DaemonClient.capabilities` |

## Ciclo de vida da sessão

| Operation                                                                         | Capability          | Scope                | TypeScript SDK                       |
| --------------------------------------------------------------------------------- | ------------------- | -------------------- | ------------------------------------ |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                          | `session_create`    | `selected-runtime`   | `DaemonClient.createOrAttachSession` |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload)           | `session_load`      | `selected-runtime`   | `DaemonClient.loadSession`           |
| [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume)       | `session_resume`    | `selected-runtime`   | `DaemonClient.resumeSession`         |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat) | `client_heartbeat`  | `live-session-owner` | `DaemonClient.heartbeat`             |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata) | `session_metadata`  | `live-session-owner` | `DaemonClient.updateSessionMetadata` |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)         | `session_set_model` | `live-session-owner` | `DaemonClient.setSessionModel`       |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                | `session_close`     | `live-session-owner` | `DaemonClient.closeSession`          |

## Prompts e eventos

| Operation                                                                                   | Capability           | Scope                 | TypeScript SDK                          |
| ------------------------------------------------------------------------------------------- | -------------------- | --------------------- | --------------------------------------- |
| [`GET /session/:id/status`](./qwen-serve-protocol.md#get-sessionidstatus)                   | `session_status`     | `live-session-owner`  | `DaemonClient.sessionStatus`            |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)                 | `session_prompt`     | `live-session-owner`  | `DaemonClient.promptNonBlocking`        |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)                 | `session_cancel`     | `live-session-owner`  | `DaemonClient.cancel`                   |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)               | `session_events`     | `live-session-owner`  | `DaemonClient.subscribeEvents`          |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript)           | `session_transcript` | `persisted-workspace` | `DaemonClient.getSessionTranscriptPage` |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)                 | `session_context`    | `live-session-owner`  | `DaemonClient.sessionContext`           |
| [`GET /session/:id/export`](./qwen-serve-protocol.md#get-sessionidexport)                   | `session_export`     | `legacy-primary`      | `DaemonClient.exportSession`            |
| [`GET /session/:id/pending-prompts`](./qwen-serve-protocol.md#get-sessionidpending-prompts) | —                    | `live-session-owner`  | `DaemonClient.getPendingPrompts`        |

`POST /session/:id/prompt` retorna `202` quando o prompt entra na fila, não
quando o Agent termina. Inscreva-se primeiro, depois correlacione `turn_complete` ou
`turn_error` por `promptId`.

## Permissões

| Operation                                                                                               | Capability                | Scope                | TypeScript SDK                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- | ----------------------------------------- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | `session_permission_vote` | `live-session-owner` | `DaemonClient.respondToSessionPermission` |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid)                      | `permission_vote`         | `legacy-primary`     | `DaemonClient.respondToPermission`        |

Integrações multi-workspace novas devem sempre usar a rota com escopo de sessão.
A rota legada pode retornar o mesmo `404` para uma requisição pertencente a outro
runtime assim como para um voto já resolvido.

## Contexto read-only do workspace

| Operation                                                             | Capability             | Scope            | TypeScript SDK                        |
| --------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------- |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools) | —                      | `legacy-primary` | `DaemonClient.workspaceTools`         |
| [`GET /file`](./qwen-serve-protocol.md#get-file)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.readWorkspaceFile`      |
| [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes)           | `workspace_file_bytes` | `legacy-primary` | `DaemonClient.readWorkspaceFileBytes` |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.fileStat`               |
| [`GET /list`](./qwen-serve-protocol.md#get-list)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.dirList`                |
| [`GET /glob`](./qwen-serve-protocol.md#get-glob)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.glob`                   |

Essas rotas singulares visam o workspace primário. Integrações que expõem
múltiplos workspaces registrados devem usar as contrapartes qualificadas por workspace
documentadas no protocolo completo e no preflight `workspace_qualified_rest_core`.

## Regras comuns do protocolo

- Autentique rotas normais com `Authorization: Bearer <token>`. Uma sondagem
  `/health` de loopback padrão pode ser isenta; binds não-loopback não são.
- Envie `X-Qwen-Client-Id` quando uma resposta de create/load forneceu um. É um
  identificador de anexo e atribuição, não um principal de segurança de usuário final.
- Trate corpos de erro como aditivos. Faça branch principalmente pelo status HTTP e
  pelo `code` ou `errorKind` estável quando presente.
- Preserve headers de resposta SSE e desabilite o buffer do proxy. Retome com
  `Last-Event-ID` e `X-Qwen-Event-Epoch` quando o daemon forneceu um epoch.
- Uma fronteira de confiança de workspace não é isolamento de tenant. Execute daemons
  separados quando principals de segurança ou fronteiras de falha em nível de processo
  devem ser independentes.
# Capacidades e Versionamento de Protocolo

## Visão Geral

`GET /capabilities` é o endpoint de pré-verificação do daemon. Todo cliente SDK deve lê-lo antes de chamar qualquer outra rota, para saber qual versão de protocolo o daemon utiliza, quais tags de funcionalidade estão ativadas e a qual workspace o daemon está vinculado. O contrato:

- **Existe uma versão de protocolo: `v1`.** `SERVE_PROTOCOL_VERSION = 'v1'` e `SUPPORTED_SERVE_PROTOCOL_VERSIONS = ['v1']`. v1 é aditivo internamente; mudanças estruturais nos quadros são reservadas para v2.
- **Cada tag possui uma versão `since`.** Futuros daemons em v2 podem anunciar tags tanto de v1 quanto de v2.
- **Algumas tags são condicionais.** Dez tags (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) são anunciadas apenas quando o toggle de implantação correspondente está ativado. A presença da tag significa que o comportamento existe.
- **Tag de capacidade = contrato de comportamento.** Adicionar um novo comportamento sob uma tag existente pode quebrar silenciosamente clientes que pré-verificaram a tag antiga. Um novo comportamento requer uma nova tag.

O registro completo está em `packages/cli/src/serve/capabilities.ts`.

## Responsabilidades

- Declarar todas as funcionalidades que o daemon pode anunciar.
- Filtrar funcionalidades anunciadas por versão de protocolo e toggles de implantação.
- Expor `getRegisteredServeFeatures()` (todas as chaves, sem filtro), `getAdvertisedServeFeatures(version, toggles)` (filtrado) e `getServeProtocolVersions()` (envelope `{ current, supported }`).
- Manter o invariante "tag presente significa comportamento presente". `server.test.ts` inclui um teste que verifica se toda tag condicional é anunciada quando seu toggle está ativo; adicionar uma tag condicional sem predicado faz esse teste falhar.

## Arquitetura

### Envelope de capacidades

`/capabilities` retorna:

```ts
{
  v: 1,                    // CAPABILITIES_SCHEMA_VERSION
  mode: 'http-bridge',
  features: ServeFeature[],
  workspaceCwd: string,
  protocol?: { current: 'v1', supported: ['v1'] },
  policy?: { permission: PermissionPolicy },
}
```

`workspaceCwd` é o workspace canônico vinculado na inicialização do daemon (veja [`02-serve-runtime.md`](./02-serve-runtime.md)). `policy.permission` é a política do mediador ativa.

### `ServeCapabilityDescriptor`

```ts
interface ServeCapabilityDescriptor {
  since: ServeProtocolVersion; // current = 'v1'
  modes?: readonly string[]; // lista os modos de operação quando uma funcionalidade tem modos
}
```

Duas tags v1 usam `modes`:

- `mcp_guardrails: { since: 'v1', modes: ['warn', 'enforce'] }` - clientes devem pré-verificar `'enforce'` antes de depender do comportamento de recusa.
- `permission_mediation: { since: 'v1', modes: ['first-responder', 'designated', 'consensus', 'local-only'] }` - este é o conjunto suportado em tempo de construção; a política ativa está em `policy.permission`.

### Tags condicionais

```ts
export const CONDITIONAL_SERVE_FEATURES: ReadonlyMap<
  ServeFeature,
  (toggles: AdvertiseFeatureToggles) => boolean
> = new Map([
  ['require_auth', (t) => t.requireAuth === true],
  ['mcp_workspace_pool', (t) => t.mcpPoolActive === true],
  ['mcp_pool_restart', (t) => t.mcpPoolActive === true],
  ['allow_origin', (t) => t.allowOriginActive === true],
  [
    'prompt_absolute_deadline',
    (t) => typeof t.promptDeadlineMs === 'number' && t.promptDeadlineMs > 0,
  ],
  [
    'writer_idle_timeout',
    (t) =>
      typeof t.writerIdleTimeoutMs === 'number' && t.writerIdleTimeoutMs > 0,
  ],
  ['workspace_settings', (t) => t.persistSettingAvailable === true],
  ['session_shell_command', (t) => t.sessionShellCommandEnabled === true],
  ['rate_limit', (t) => t.rateLimit === true],
  ['workspace_reload', (t) => t.reloadAvailable === true],
]);
```

O `Map` armazena a pertinência e o predicado juntos. Adicionar uma nova tag condicional requer duas alterações coordenadas:

1. Registrar a tag e sua versão `since` em `SERVE_CAPABILITY_REGISTRY`.
2. Adicionar seu predicado a `CONDITIONAL_SERVE_FEATURES`.

As tags de base não estão presentes no `Map` e são anunciadas incondicionalmente. Isso é intencionalmente representado pela ausência, em vez de um `Set` separado.

### 67 tags (v1, agrupadas por domínio)

Fundação: `health`, `capabilities`.

Sessões: `session_create`, `session_scope_override`, `session_load`, `session_resume`, `unstable_session_resume`, `session_list`, `session_prompt`, `session_cancel`, `session_events`, `session_set_model`, `session_close`, `session_metadata`, `session_context`, `session_context_usage`, `session_supported_commands`, `session_tasks`, `session_stats`, `session_lsp`, `session_status`, `session_approval_mode_control`, `session_recap`, `session_btw`, **`session_shell_command`** (condicional), `session_language`, `session_rewind`, `session_hooks`, `session_branch`.

Streaming: `slow_client_warning`, `typed_event_schema`.

Identidade e heartbeat: `client_identity`, `client_heartbeat`.

Permissões: `session_permission_vote`, `permission_vote`, **`permission_mediation`** (`modes: ['first-responder', 'designated', 'consensus', 'local-only']`).

Snapshots somente leitura do workspace: `workspace_mcp`, `workspace_skills`, `workspace_providers`, `workspace_env`, `workspace_preflight`, `workspace_hooks`, `workspace_extensions`.

Mutação do workspace (Wave 4+): `workspace_memory`, `workspace_agents`, `workspace_agent_generate`, `workspace_tool_toggle`, **`workspace_settings`** (condicional), `workspace_init`, `workspace_mcp_restart`, `workspace_mcp_manage`, `workspace_file_read`, `workspace_file_bytes`, `workspace_file_write`, **`workspace_reload`** (condicional).

Guardrails MCP: **`mcp_guardrails`** (`modes: ['warn', 'enforce']`), `mcp_guardrail_events`, `mcp_server_runtime_mutation`, **`mcp_workspace_pool`** (condicional), **`mcp_pool_restart`** (condicional).

Controle de prompt: **`prompt_absolute_deadline`** (condicional), **`writer_idle_timeout`** (condicional), `non_blocking_prompt`.

Autenticação: `auth_provider_install`, `auth_device_flow`, **`require_auth`** (condicional), **`allow_origin`** (condicional).

Limitação de taxa: **`rate_limit`** (condicional).

Tags em negrito possuem `modes` ou são condicionais.

## Fluxo

### Lado do daemon: montar envelope

```mermaid
flowchart LR
    A["GET /capabilities"] --> B["getAdvertisedServeFeatures(version, toggles)"]
    B --> C["filter by isFeatureAvailableInProtocol"]
    C --> D["for each feature, check CONDITIONAL_SERVE_FEATURES"]
    D --> E["yes: predicate(toggles) ? include : drop"]
    D --> F["no: include unconditionally"]
    E --> G["return ServeFeature[]"]
    F --> G
    G --> H["wrap in envelope:<br/>{ v: 1, mode, features, workspaceCwd, protocol, policy }"]
```

### Lado do cliente: pré-verificação de funcionalidade

```mermaid
sequenceDiagram
    autonumber
    participant C as Cliente
    participant D as GET /capabilities
    participant R as Rota

    C->>D: GET /capabilities
    D-->>C: { v, mode, features, workspaceCwd, protocol, policy }
    C->>C: features.includes('mcp_workspace_pool')?
    alt sim
        C->>R: depende de formas de resposta cientes do pool<br/>(ex: entries[] de /workspace/mcp/:server/restart)
    else não
        C->>R: forma de resposta legada de entrada única
    end
```

## Estado e ciclo de vida

- `CAPABILITIES_SCHEMA_VERSION` é a versão da forma do envelope na rede, atualmente `1`. Incremente apenas para uma quebra de envelope.
- `SERVE_PROTOCOL_VERSION = 'v1'` é a versão do protocolo de funcionalidades. Adicionar funcionalidades dentro de v1 é aditivo; clientes antigos não veem novos comportamentos a menos que pré-verifiquem a nova tag. Remover uma funcionalidade é uma quebra de v2.
- `EVENT_SCHEMA_VERSION = 1` é o campo `v` do quadro SSE (veja [`09-event-schema.md`](./09-event-schema.md)). É um eixo de versão independente; incrementar o schema de eventos não implica incrementar a versão do protocolo, e vice-versa.
- `session_resume` é a capacidade estável do daemon para `POST /session/:id/resume`. `unstable_session_resume` permanece anunciada como um alias obsoleto porque o método ACP subjacente ainda se chama `connection.unstable_resumeSession`; novos clientes devem fazer detecção de funcionalidade para `session_resume`.

## Dependências

- Lido por `packages/cli/src/serve/server.ts` ao construir respostas de `/capabilities`.
- A entrada de toggles vem de `runQwenServe` / `createServeApp`: `{ requireAuth, mcpPoolActive, allowOriginActive, promptDeadlineMs, writerIdleTimeoutMs, persistSettingAvailable, sessionShellCommandEnabled, rateLimit, reloadAvailable }`.
- A política `permission` ativa no envelope vem de `BridgeOptions.permissionPolicy`, que por sua vez lê `settings.json` `policy.permissionStrategy`.

## Configuração

| Fonte                       | Parâmetro                                                       | Efeito nas capacidades                                                                                                        |
| --------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Flag de CLI                 | `--require-auth`                                                | Anuncia `require_auth`.                                                                                                       |
| Env                         | `QWEN_SERVE_NO_MCP_POOL=1`                                      | Para de anunciar `mcp_workspace_pool` e `mcp_pool_restart`; eventos MCP não incluem mais `scope: 'workspace'`.                |
| Flag de CLI                 | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}` | Não altera o conjunto de tags (`mcp_guardrails` é sempre anunciada), mas muda o comportamento de reserva e recusa por servidor. |
| Flag de CLI / env           | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1`                      | Anuncia `rate_limit`.                                                                                                         |
| Opção embutida              | `persistSettingAvailable`                                       | Anuncia `workspace_settings`.                                                                                                 |
| Flag de CLI / opção embutida| `--enable-session-shell` / `sessionShellCommandEnabled`         | Anuncia `session_shell_command`.                                                                                              |
| Opção embutida              | `reloadAvailable`                                               | Anuncia `workspace_reload`.                                                                                                   |
| `settings.json`             | `policy.permissionStrategy`                                     | Define o envelope `policy.permission`.                                                                                        |

## Advertências e limitações conhecidas

- **`--require-auth` oculta a pré-verificação.** Com `--require-auth`, todas as rotas, incluindo `/capabilities`, exigem autenticação Bearer. Um cliente não autenticado não pode pré-verificar `caps.features.require_auth`; o corpo da resposta 401 é a superfície de descoberta. A tag `require_auth` é uma confirmação autenticada para interfaces de auditoria de implantações reforçadas.
- **Tag presente significa comportamento presente.** Se um contribuidor futuro adicionar comportamento sob uma tag existente sem incrementar `since`, clientes que pré-verificaram a tag antiga podem receber silenciosamente novos comportamentos. A convenção é: novo comportamento, nova tag.
- **Tags `unstable_*` podem mudar de forma entre versões** sem um bump de protocolo. Fixe uma versão do SDK ao depender delas.
- O catálogo de rotas está em [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md); esta página intencionalmente não o duplica.

## Referências

- `packages/cli/src/serve/capabilities.ts`
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/server.ts` (montagem do envelope)
- `packages/acp-bridge/src/eventBus.ts` (`EVENT_SCHEMA_VERSION`)
- Referência de rede: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
- Guardrails de autenticação e implantação: [`12-auth-security.md`](./12-auth-security.md)
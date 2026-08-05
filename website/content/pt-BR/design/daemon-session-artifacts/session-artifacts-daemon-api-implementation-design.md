# Design Implementável da API de Session Artifacts do Daemon do Qwen Code

> Materiais de entrada: rascunho inicial da API de session artifacts do daemon e rascunho do artifact design v1.
>
> Linha de base do código-fonte: código atual do qwen-code.  
> Objetivo: Com base nas capacidades existentes de Daemon / ACP / SSE / SDK / hooks / extension, projetar uma API de session artifacts implementável, verificável e com limites bem definidos.

## 1. Conclusões do Design

Sugere-se definir artifact como:

> **Referências de artefatos estruturados explicitamente registrados em uma Session, que os usuários podem reutilizar, clicar, visualizar, baixar ou compartilhar. Alterações comuns de código-fonte não são artifacts; alterações de código-fonte pertencem ao histórico de file change / diff / patch.**

Esta definição cobre arquivos e também URLs não relacionadas a arquivos. O ponto chave não é se é um arquivo físico, mas se foi explicitamente declarado pelo sistema como um "artefato". O painel de Artifacts deve exibir os outputs da session, e não tudo o que o agent manipulou.

Os recursos completos da V1 devem incluir:

- capability: `session_artifacts`
- API de snapshot de artifact: `GET /session/:id/artifacts`
- evento de artifact alterado: `artifact_changed`
- metadados de resultado da ferramenta: `ToolResult.artifacts?: ToolArtifact[]`
- metadados estruturados de artifact do `ArtifactTool`
- índice de memória do bridge: `SessionArtifactStore`
- métodos do SDK: `DaemonClient.listSessionArtifacts()`, `DaemonSessionClient.artifacts()`
- ferramenta leve chamável por modelo/skill/agent: `record_artifact`
- saída de artifacts do hook: `hookSpecificOutput.artifacts`
- API de injeção manual do client: `POST /session/:id/artifacts`
- API de remoção explícita do client: `DELETE /session/:id/artifacts/:artifactId`
- método do SDK: `DaemonSessionClient.addArtifact()`
- método do SDK: `DaemonSessionClient.removeArtifact()`
- modelo de referência de armazenamento managed / published

Para manter a V1 controlável, não é recomendado que a V1 faça:

- varredura de workspace
- entrada automática de `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` comuns nos artifacts
- extração automática de URLs de texto comuns
- extração automática de caminhos/URLs do stdout do shell
- retorno de conteúdo de artifact
- histórico de versões de artifact
- restauração persistente de artifact
- banco de dados/OSS/sandbox de iframe dinâmico

## 2. Links contam como Artifacts?

### 2.1 Conclusão

**Sim, mas devem ser "link artifacts declarativos".**

Por exemplo, estes devem contar como artifact:

- URLs de detalhes de tabelas da plataforma de dados interna montadas pelo skill com base no ID do recurso.
- Páginas de detalhes de tarefas, monitoramento, trace e lineage montadas pelo agent com base no ID do recurso.
- URLs de dashboard / notebook / report retornadas por ferramentas MCP.
- URLs HTML publicadas pelo ArtifactTool.
- URLs adicionadas explicitamente pelo usuário ou client à área de artefatos da session.

Estes não devem contar como artifact por padrão:

- Qualquer link markdown em respostas comuns do assistant.
- URLs de páginas web lidas pelo web_fetch.
- URLs que aparecem acidentalmente na saída do grep/shell.
- Links de material de referência, documentação e referências.

Critérios principais:

| Tipo | Entra em artifacts | Motivo |
| ------------------------------- | -----------------: | ---------------------------------------- |
| Edição comum de código-fonte | Não | Pertence a file change / diff, não é um artefato reutilizável |
| Arquivo de workspace gerado explicitamente registrado | Sim | Outputs reutilizáveis como report / HTML / PDF / image |
| URL HTML publicada pelo ArtifactTool | Sim | Publicada explicitamente pela ferramenta |
| URL de detalhes de negócios montada pelo skill conforme regras | Sim, mas deve ser registrada explicitamente | O usuário precisa que seja clicável a longo prazo no painel lateral |
| Links de referência comuns em respostas do assistant | Não | Muito ruído, propenso a falsos positivos |
| URLs que aparecem no stdout do shell | Não | Semântica não confiável |
| URLs solicitadas pelo web_fetch | Não | Esta é a entrada/origem, não o artefato |

### 2.2 Semântica de Produto do Link Artifact

O link artifact não é "conteúdo de página web", mas sim uma "porta de entrada de recurso". Ele deve aparecer como um item clicável na área de artefatos à direita:

- Título: `Detalhes do recurso de perfil de usuário`
- Subtítulo: `internal data platform / prod`
- Tipo: `link`
- Host da URL: `platform.example.com`
- Origem: `ToolResult.artifacts` / `ArtifactTool` / `record_artifact` / hook / client

O Client abre a URL ao clicar; o Daemon não lê, não valida e não pré-renderiza a URL.

## 3. Linha de Base Atual do Código

### 3.1 Daemon REST e capability

Código-fonte relacionado:

- `packages/cli/src/serve/server.ts`
- `packages/cli/src/serve/capabilities.ts`
- `docs/developers/qwen-serve-protocol.md`

Estado atual:

- `/capabilities` retorna `features`, o Client deve basear a UI no feature gate.
- Interfaces de estado somente leitura no nível da session usam estilo REST:
  - `GET /session/:id/status`
  - `GET /session/:id/context`
  - `GET /session/:id/tasks`
  - `GET /session/:id/events`
- capability é registrada em `SERVE_CAPABILITY_REGISTRY`.

Design:

- Nova feature: `session_artifacts`
- Nova route: `GET /session/:id/artifacts`
- Nova route de mutation de injeção manual: `POST /session/:id/artifacts`

### 3.2 Session EventBus

Código-fonte relacionado:

- `packages/acp-bridge/src/eventBus.ts`
- `packages/acp-bridge/src/bridge.ts`
- `packages/acp-bridge/src/bridgeClient.ts`
- `packages/sdk-typescript/src/daemon/events.ts`

Estado atual:

- Cada live session tem um `EventBus` independente.
- O EventBus suporta id, bounded replay ring, `Last-Event-ID` e backpressure.
- O SDK mantém a known event list.

Design:

- Atualizações em tempo real de artifact reutilizam o `/session/:id/events` existente.
- Novo event type: `artifact_changed`
- O Client usa um snapshot na primeira entrada e, em seguida, usa o incremento de eventos; após uma desconexão, busca o snapshot novamente.

### 3.3 Tool Result e ArtifactTool

Código-fonte relacionado:

- `packages/core/src/tools/tools.ts`
- `packages/core/src/tools/tool-names.ts`
- `packages/core/src/tools/artifact/artifact-tool.ts`
- `packages/cli/src/acp-integration/session/Session.ts`
- `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`

Estado atual:

- `ToolResult` atualmente contém `llmContent`, `returnDisplay`, `resultFilePaths?` e `error?`.
- O `ArtifactTool` já pode publicar HTML e retornar URLs, mas não possui metadados estruturados de artifact.
- O `_meta` de `ToolCallEmitter.emitResult()` já possui um slot de extensão.

Design:

- Adicionar `ToolResult.artifacts?: ToolArtifact[]`.
- Preencher `artifacts` quando o `ArtifactTool` for bem-sucedido.
- Colocar artifacts em `_meta.artifacts` no `ToolCallEmitter.emitResult()`.
- O BridgeClient consome `_meta.artifacts` e grava no session artifact store.

### 3.4 Estado Atual de Hooks / Extensions / Plugins

Código-fonte relacionado:

- `packages/core/src/hooks/types.ts`
- `packages/core/src/core/toolHookTriggers.ts`
- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/sessionHooksManager.ts`
- `packages/core/src/hooks/registerSkillHooks.ts`
- `packages/core/src/extension/extensionManager.ts`
- `docs/developers/channel-plugins.md`

Capacidades atuais:

- Os eventos de hook incluem `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SessionStart`, `Stop`, `SubagentStart`, `SubagentStop`, etc.
- Os tipos de hook incluem command, HTTP, function e prompt.
- O stdout do command hook suporta `HookOutput` em formato JSON.
- A response do HTTP hook suporta `HookOutput` em formato JSON.
- Session hooks podem ser registrados em tempo de execução via `SessionHooksManager`.
- O frontmatter do skill pode registrar command/HTTP hooks no escopo da session.
- A extension pode fornecer commands, skills, hooks, MCP servers e channels.
- O channel plugin é principalmente uma adaptação para plataformas de mensagens, podendo observar tool call / response chunk, mas não é um canal de injeção de artifact do daemon.

Lacunas atuais:

- A hook output possui apenas campos genéricos como `additionalContext`, decision e stopReason.
- Atualmente, não há um `hookSpecificOutput.artifacts` padrão.
- Atualmente, o daemon possui apenas as interfaces de estado `GET /workspace/hooks` e `GET /session/:id/hooks`, não havendo uma route para "injeção proativa de artifact pelo hook".

Conclusão:

- hooks/extensions são excelentes pontos de entrada para artifacts personalizados, mas o schema da hook output precisa ser estendido.
- Não é recomendado usar o channel plugin como canal principal de injeção de artifact; ele é adequado para exibição em plataformas de chat externas, mas não para manter o índice de artifacts da session do daemon.

## 4. Design da API

### 4.1 Capability

Adicionado:

```json
"session_artifacts"
```

O Client só exibirá o painel de artifacts e chamará as APIs relacionadas se visualizar essa feature.

### 4.2 List Artifacts

```http
GET /session/:id/artifacts
```

Resposta:

```json
{
  "v": 1,
  "sessionId": "session-123",
  "artifacts": [
    {
      "id": "a1b2c3d4e5f6",
      "kind": "link",
      "storage": "external_url",
      "title": "Detalhes do recurso de perfil de usuário",
      "description": "Página de detalhes de recursos da plataforma de dados interna",
      "url": "https://platform.example.com/resources/user-profile",
      "mimeType": "text/html",
      "status": "available",
      "source": "tool",
      "toolCallId": "call_abc",
      "toolName": "artifact",
      "createdAt": "2026-06-26T10:00:00.000Z",
      "updatedAt": "2026-06-26T10:00:00.000Z",
      "metadata": {
        "resourceType": "data_platform_resource",
        "env": "prod"
      }
    }
  ]
}
```

### 4.3 Evento Artifact Changed

Através do existente:

```http
GET /session/:id/events
```

Novo event:

```json
{
  "v": 1,
  "type": "artifact_changed",
  "data": {
    "sessionId": "session-123",
    "change": {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "Detalhes do recurso de perfil de usuário",
        "description": "Página de detalhes de recursos da plataforma de dados interna",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "status": "available",
        "source": "tool",
        "toolCallId": "call_abc",
        "toolName": "artifact",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "data_platform_resource",
          "env": "prod"
        }
      }
    }
  }
}
```

`change.action`:

- `created`
- `updated`
- `removed`

A V1 gera principalmente `created` / `updated`; cenários de eviction ou exclusão explícita geram `removed`.

`artifact_changed.data.change.artifact` carrega o `DaemonSessionArtifact` completo em `created` / `updated` / `removed`, com o mesmo shape de um único item em `GET /session/:id/artifacts`; o evento `removed` carrega o último artifact completo antes da exclusão. `removed` deve carregar `reason`, e na V1 os valores são `eviction` ou `explicit`. Dessa forma, a UI em tempo real pode aplicar o evento diretamente, sem precisar fazer GET após cada evento. Quando o Client desconectar, perder eventos ou receber um event type desconhecido, usará `GET /session/:id/artifacts` para fazer o snapshot sync.

### 4.4 Inserção Manual do Client

Como ponto de entrada de registro explícito do client na V1:

```http
POST /session/:id/artifacts
```

Usos:

- WebUI/IDE/client externo adiciona manualmente link artifacts personalizados.
- Camadas de extensão ou integração inserem recursos no painel de artefatos à direita sem passar por chamadas de ferramentas de modelo.

Requisição:

```json
{
  "kind": "link",
  "storage": "external_url",
  "title": "Detalhes da tarefa",
  "description": "Página de detalhes da tarefa agendada task_123",
  "url": "https://ops.example.com/tasks/task_123",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "scheduler_task"
  }
}
```

Resposta:

```json
{
  "v": 1,
  "sessionId": "session-123",
  "changes": [
    {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "Detalhes da tarefa",
        "description": "Página de detalhes da tarefa agendada task_123",
        "url": "https://ops.example.com/tasks/task_123",
        "mimeType": "text/html",
        "status": "available",
        "source": "client",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    }
  ]
}
```

Cada item em `changes` deve ser publicado sincronizadamente como um evento SSE `artifact_changed`. Dessa forma, mesmo que um único POST acione upsert e eviction, o client receberá o incremento completo de created/updated e removed. Se múltiplas entradas forem normalizadas para a mesma identity dentro da mesma mutation, apenas uma change final poderá ser produzida em `changes`. A ordem de publicação dos eventos é uma restrição do protocolo: primeiro publique `created` / `updated` na ordem de `changes[]`, e depois publique `removed`, para evitar que o espelho local do client entre brevemente em um estado que nunca existiu no servidor.

Resposta de erro:

```json
{
  "v": 1,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "url must use http or https",
    "field": "url"
  }
}
```

Códigos de status:

- `400 VALIDATION_FAILED`: falha na validação de campos, como múltiplos primary locators, URL scheme não suportado ou metadata excedendo o limite.
- `401 UNAUTHORIZED` / `403 FORBIDDEN`: falha na validação do mutation gate ou bearer token.
- `404 SESSION_NOT_FOUND`: a session não existe.

### 4.5 Exclusão do Client

Como ponto de entrada de remoção explícita na V1:

```http
DELETE /session/:id/artifacts/:artifactId
```

Semântica:

- Remove o artifact apenas do live session artifact store atual.
- Não exclui arquivos de workspace, arquivos managed ou URLs remotas.
- Em caso de sucesso, retorna `DaemonSessionArtifactMutationResult`, contendo uma change com `action: 'removed'` e `reason: 'explicit'`.
- Se o artifact já não existir, o DELETE ainda será tratado como um sucesso idempotente, retornando `200` e `changes: []` vazio, sem publicar evento SSE.
- Publica sincronizadamente o evento SSE `artifact_changed` correspondente.

As respostas de erro reutilizam o envelope da Seção 4.4; se a session não existir, ainda retornará `404 SESSION_NOT_FOUND`.

Segurança:

- Esta é uma mutation route e deve usar o mutation gate existente.
- A chamada por clients remotos só é permitida se o daemon tiver um bearer token.
- Não lê a URL.
- Não abre a URL automaticamente.

### 4.6 Escopo de Lançamento e Compatibilidade da V1

Após a consolidação, a V1 deve ser lançada para testes como um recurso completo de gerenciamento de artifacts de session, e não apenas como uma interface inacabada. O ciclo mínimo do recurso completo é:

- O Client detecta o recurso através da capability `session_artifacts`.
- O Daemon fornece o snapshot `GET /session/:id/artifacts`.
- O Daemon publica incrementos de `artifact_changed` através do events stream existente.
- As quatro categorias de entrada `ArtifactTool` / `ToolResult.artifacts`, `record_artifact`, hook artifacts e client POST entram no mesmo store.
- O client DELETE pode remover explicitamente artifacts registrados incorretamente do live store.
- O store executa uniformemente validation, normalization, deduplicação de identity e soft reservation eviction.
- O SDK pode fazer list/add/remove e reconhecer o evento `artifact_changed`.

Recomenda-se lançar para testes inicialmente na forma de experimental/capability-gated. O termo experimental aqui indica que a implementação e a UI podem continuar a ser refinadas, não que o protocolo possa ser quebrado arbitrariamente: os campos e a semântica de eventos já expostos ao client devem evoluir de acordo com as seguintes regras de compatibilidade.

Extensões futuras não breaking:

- Adicionar optional field no artifact de resposta.
- Adicionar novos literais para `kind` / `status` / `source` / `storage`, mas o SDK tipado deve declarar esses campos como open union, e o client deve tolerar valores desconhecidos: `kind` desconhecido é tratado como `other`, `status` desconhecido é exibido como unknown sem bloquear a exibição da lista, `source` desconhecido é tratado como origem não agrupada, e `storage` desconhecido é exibido de forma conservadora usando apenas `url` / `workspacePath` disponíveis.
- Adicionar novas routes, como `GET /session/:id/artifacts/:artifactId`, preview route e pin route.
- Adicionar novos event types, mas a semântica atual de `artifact_changed` permanece inalterada.
- Adicionar novas capabilities, como `session_artifacts_preview` e `session_artifacts_persistence`.
- Ajustar os valores padrão internos de soft reservation, desde que o limite total e a semântica do evento de eviction não quebrem os clients existentes.

Mudanças breaking que exigem nova capability ou nova versão:

- Modificar as regras de identity resultando na alteração do artifact id para a mesma URL/path.
- Alterar optional fields existentes para required fields.
- Excluir ou renomear campos existentes.
- Alterar a semântica de `created` / `updated` / `removed` em `artifact_changed.data.change.action`.
- Alterar o envelope shape de `GET /session/:id/artifacts`.
- Fazer com que links de texto comuns do assistant ou edições de arquivos comuns entrem na artifact list por padrão.

## 5. Modelo de Dados

### 5.1 Tipos do Public SDK

```ts
type OpenStringUnion<T extends string> = T | (string & {});

export type DaemonSessionArtifactKind = OpenStringUnion<
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other'
>;

export type DaemonSessionArtifactStatus = OpenStringUnion<
  'available' | 'missing'
>;

export type DaemonSessionArtifactSource = OpenStringUnion<
  'tool' | 'hook' | 'client'
>;

export type DaemonSessionArtifactStorage = OpenStringUnion<
  'workspace' | 'managed' | 'external_url' | 'published'
>;

export interface DaemonSessionArtifact {
  id: string;
  kind: DaemonSessionArtifactKind;
  storage: DaemonSessionArtifactStorage;
  title: string;
  description?: string;
  status: DaemonSessionArtifactStatus;
  source: DaemonSessionArtifactSource;
  createdAt: string;
  updatedAt: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DaemonSessionArtifactsEnvelope {
  v: 1;
  sessionId: string;
  artifacts: DaemonSessionArtifact[];
}

export interface DaemonArtifactChangedData {
  sessionId: string;
  change: DaemonSessionArtifactChange;
}

export interface DaemonSessionArtifactChange {
  action: 'created' | 'updated' | 'removed';
  artifactId: string;
  artifact?: DaemonSessionArtifact;
  reason?: 'eviction' | 'explicit';
}

export interface DaemonSessionArtifactMutationResult {
  v: 1;
  sessionId: string;
  changes: DaemonSessionArtifactChange[];
}
```

### 5.2 Tipos do Core ToolArtifact

```ts
export type ToolArtifactKind =
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other';

export type ToolArtifactStorage =
  | 'workspace'
  | 'managed'
  | 'external_url'
  | 'published';

export interface ToolArtifact {
  kind?: ToolArtifactKind;
  storage?: ToolArtifactStorage;
  title: string;
  description?: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

O conjunto de literais conhecidos para `ToolArtifactKind` / `ToolArtifactStorage` deve ter apenas uma única fonte de implementação, evitando derivação manual em três pontos: core, acp-bridge e SDK. Prática recomendada:

- No core, defina as const tuples `TOOL_ARTIFACT_KINDS` / `TOOL_ARTIFACT_STORAGES` e exporte `ToolArtifactKind` / `ToolArtifactStorage`.
- O acp-bridge reutiliza os tipos do core como o conjunto conhecido para validação de entrada e declara os tipos públicos do daemon como uma projeção de protocolo dos mesmos valores.
- O SDK não deve escrever uma segunda união conhecida manualmente; em vez disso, reexporte os literais conhecidos através dos tipos de protocolo exportados pelo acp-bridge ou de `.d.ts` gerados em tempo de build, e envolva-os em uma união aberta (open union) nos tipos voltados para a resposta, para tolerar novos valores retornados pelo daemon no futuro.
- Adicione um teste de round-trip de kind/storage para garantir que os literais conhecidos façam o ciclo completo de forma consistente na entrada do core, no store da bridge e na saída do SDK; adicione também um teste de fallback para valores desconhecidos no SDK para garantir a tolerância a falhas em runtime da união aberta.

E estenda:

```ts
export interface ToolResult {
  llmContent: unknown;
  returnDisplay: unknown;
  resultFilePaths?: string[];
  artifacts?: ToolArtifact[];
  error?: unknown;
}
```

### 5.3 Regras de preenchimento de Input para Public Artifact

`ToolArtifact` é a forma de entrada retornada pela ferramenta, `SessionArtifactInput` é a forma de entrada interna unificada antes de todas as entradas entrarem no store, e `DaemonSessionArtifact` é a forma retornada externamente. Todas as entradas devem primeiro ser convertidas para `SessionArtifactInput` e, em seguida, ter seus campos públicos preenchidos pelo `SessionArtifactStore`.

```ts
export interface SessionArtifactInput extends ToolArtifact {
  source: 'tool' | 'hook' | 'client';
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  trustedPublisher?: true;
  receivedSeq?: number;
}
```

`trustedPublisher` é um flag de entrada interno da bridge/store, não um campo do schema público ou configurável por client/hook. Nas implantações daemon/ACP da V1, o subprocesso `qwen --acp` é iniciado pelo daemon e executado com o mesmo usuário; portanto, a implementação atual trata o session update `ArtifactTool` concluído (`tool_call_update`, `status: 'completed'`, `_meta.toolName: 'artifact'`) como o único sinal de trusted publisher. Este sinal não é lido do próprio payload do artifact, nem é exposto para POSTs de client, notificações de hook, `record_artifact` ou outros resultados de ferramentas.

Se no futuro houver suporte para sandboxes remotos, participantes ACP múltiplos ou agentes fora do domínio de confiança, deve-se adicionar uma identidade de publisher de transporte / in-process não falsificável e substituir esse sinal de confiança da V1; até lá, não trate `trustedPublisher` / `source` / `storage` dentro do payload como base para autorização.

Regras de conversão de origem:

- `ArtifactTool` / daemon publisher: O BridgeClient apenas preenche `source: 'tool'`, `toolCallId`, `toolName` no session update `ArtifactTool` concluído e define `trustedPublisher: true` via opção interna.
- Outros `ToolResult.artifacts`: Copia os campos de `ToolArtifact`, preenche `source: 'tool'`, `toolCallId`, `toolName`, mas não define `trustedPublisher`.
- `record_artifact`: Entra como fonte tool, preenchendo igualmente `source: 'tool'`, `toolCallId`, `toolName: 'record_artifact'`, mas não permite `storage: 'published'` nem pode definir `trustedPublisher`.
- hook: Copia os artifacts de saída do hook, preenche `source: 'hook'`, `hookName`, `extensionId`; se o hook puder acessar o contexto da ferramenta de gatilho, também pode preencher `toolCallId` / `toolName`. A Bridge deve derivar `source: 'hook'` do contexto de transporte, não podendo confiar no campo `source` do payload.
- client POST: Copia o body, preenche `source: 'client'`, `clientId`, não permite `storage: 'published'` e não pode definir `trustedPublisher`.
- `receivedSeq`: Atribuído pela bridge/store ao receber a entrada como um valor incremental monotônico, usado para ordenação determinística dentro do mesmo lote; entradas externas não podem especificar este campo.
- O BridgeClient não deve inferir `trustedPublisher` com base em `source`, `storage`, `managedId`, `url`, `trustedPublisher` ou outros campos `_meta.artifacts[*]` dentro do payload do artifact. A única exceção na V1 é o sinal de session update `ArtifactTool` concluído mencionado acima.

Regras de preenchimento:

- `id`: Gerado pelo hash de identidade da Seção 7.
- `source`: Determinado pelo contexto da entrada; `tool` para tool result / ArtifactTool, `hook` para hook, `client` para client POST.
- `toolCallId` / `toolName`: Preenchidos pelo contexto da tool call; não preenchidos se a entrada for de hook/client e não tiver contexto.
- `hookName` / `extensionId` / `clientId`: Preenchidos quando houver contexto, usados para auditoria e agrupamento na UI.
- `createdAt`: Gravado no primeiro upsert.
- `updatedAt`: Atualizado em cada upsert.
- `status`: Ao fazer upsert de workspace artifact, faz um stat best-effort; se existir e passar na verificação de contenção, é `available`; se não existir ou houver escape de symlink, é `missing`; managed / URL artifact não faz stat na máquina local na V1, sendo sempre `available`.
- Valores padrão de `storage`:
  - `workspace` quando há `workspacePath`.
  - Deve vir de `trustedPublisher` quando há `storage: 'published'`, caso contrário, a validação falha.
  - `managed` quando há `managedId` e não há `url`.
  - `external_url` quando há `url`.
  - Os resultados publicados pelo `ArtifactTool` usam explicitamente `published`.
- Valores padrão de `kind`:
  - `html` quando `storage: 'published'` e não há `kind` explícito.
  - `link` quando há `url` e não há `workspacePath`.
  - Quando há `workspacePath`, infere pela extensão: `.html` -> `html`, extensões de imagem -> `image`, extensões de vídeo -> `video`, extensões de áudio -> `audio`, `.pdf` -> `pdf`, `.ipynb` -> `notebook`, caso contrário `file`.
  - `other` quando não for possível inferir.

### 5.4 Restrições de Campos

- `workspacePath` é exibido externamente apenas para arquivos dentro do workspace e deve ser um caminho relativo ao workspace.
- `managedId` é uma referência a artefatos gerenciados pelo daemon/qwen-home e não pode ser um caminho absoluto local.
- `url` aceita apenas URLs explicitamente registradas ou URLs publicadas pelo ArtifactTool.
- `workspacePath`, `managedId`, `url` devem ter e ter apenas um localizador primário; a V1 rejeita entradas comuns que carreguem múltiplos localizadores primários simultaneamente, evitando a geração de múltiplas identidades para o mesmo recurso lógico com base em campos diferentes.
- A única exceção é o `storage: 'published'` confiável: `url` é o localizador primário, `managedId` pode ser retornado junto como uma referência gerenciada opcional para download/visualização futura; neste caso, a identidade é calculada apenas com base na `url`, e `managedId` não participa da identidade. Esta exceção aceita apenas entradas internas com `trustedPublisher: true`.
- Ferramentas comuns não devem retornar `~/.qwen`, `/tmp` ou outros caminhos absolutos locais como `workspacePath`.
- `title` é obrigatório, comprimento de 1 a 200 caracteres após trim, não permite caracteres de controle ASCII; é texto simples (plain text), não carrega semântica HTML ou markdown.
- `description` é texto simples auxiliar para a UI, não entra no contexto do modelo.
- `description` tem no máximo 1000 caracteres após trim, não permite caracteres de controle ASCII, não carrega semântica HTML ou markdown.
- `metadata` deve ser um objeto pequeno, permitindo apenas valores primitivos.
- `metadata` não deve conter secrets, tokens, cookies ou chaves privadas de assinatura.
- `sizeBytes` é best-effort.
- `DaemonSessionArtifactsEnvelope` não retorna o `workspaceCwd` absoluto da máquina host; o client depende apenas de caminhos relativos como `workspacePath` e do campo `storage` para exibição.

## 6. Fontes de Coleta de Artifacts

### 6.1 Entrada de Saída de Arquivos

A V1 não deriva artifacts automaticamente de ferramentas comuns de edição de arquivos.

Não derivado automaticamente:

- `ToolNames.WRITE_FILE`
- `ToolNames.EDIT`
- `ToolNames.NOTEBOOK_EDIT`
- `read_file`
- `grep_search`
- `glob`
- `list_directory`
- `web_fetch`
- `run_shell_command`

Motivos:

- Edição comum de código-fonte, modificações de configuração e correções de testes pertencem ao histórico de file change / diff / patch.
- Colocar automaticamente cada source edit no painel de artifacts geraria muito ruído.
- A área de produtos à direita deve ser reservada para outputs de sessão reutilizáveis, visualizáveis, baixáveis ou compartilháveis.

Condições para um arquivo entrar no artifact store:

- O resultado da ferramenta retorna explicitamente `ToolResult.artifacts`.
- Saída publicada pelo `ArtifactTool`.
- Registro explícito via `record_artifact` / hook / client POST na V1.
- Se no futuro for necessária uma derivação por conveniência, apenas arquivos de saída geracional serão permitidos, e o resultado da ferramenta ou metadados estruturados devem ser marcados como artifact; não inferir por padrão de `WRITE_FILE` / `EDIT` comuns.

Exemplos de saída geracional:

- report: `.html`, `.pdf`, `.md`
- media: `.png`, `.jpg`, `.mp4`, `.mp3`
- office/data: `.xlsx`, `.docx`, `.pptx`, `.csv`
- notebook: `.ipynb` gerado como deliverable

Mesmo para notebooks, é preciso distinguir entre "editar um arquivo fonte de notebook existente" e "gerar um artifact de notebook para o usuário visualizar/baixar".

### 6.2 ArtifactTool

Retornado após publicação bem-sucedida do `ArtifactTool`:

```ts
artifacts: [
  {
    kind: 'html',
    storage: 'published',
    title,
    url,
    managedId,
    mimeType: 'text/html',
  },
];
```

Mantém o `llmContent`, `returnDisplay` e `resultFilePaths` existentes para garantir compatibilidade.

O publisher local atual do `ArtifactTool` pode gravar conteúdo no diretório gerenciado sob o qwen home e retornar uma URL `file://` ou remota. A API de artifacts do Daemon não deve expor o caminho absoluto local do qwen home como `workspacePath`; deve usar:

- `storage: 'published'`
- `url`: URL acessível publicada, que também é o localizador primário do artifact published
- `managedId`: Referência gerenciada interna opcional, não participa da identidade
- O BridgeClient define `trustedPublisher: true` via opção interna no session update `ArtifactTool` concluído. A Bridge não deve inferir este flag a partir de parâmetros do modelo, payload de hook, body de POST do client ou campos comuns `_meta.artifacts[*]`.

Se no futuro o client do daemon precisar baixar ou visualizar conteúdo gerenciado, deve-se adicionar uma rota de managed artifact dedicada, em vez de colocar caminhos absolutos locais no artifact público.

### 6.3 Ferramenta record_artifact

Como entrada de registro explícito para modelo/skill na V1, uma nova ferramenta built-in leve é adicionada:

```ts
ToolNames.RECORD_ARTIFACT = 'record_artifact';
```

Uso:

- O modelo registra explicitamente artefatos não relacionados a arquivos.
- skill / agent.md pode exigir que o modelo chame esta ferramenta após montar a URL de negócio.
- Cada chamada registra apenas um artifact; o registro em lote é feito pelo modelo chamando a ferramenta várias vezes, evitando ambiguidade de feedback de sucesso/falha parcial em uma única tool call.
- Não faz requisições de rede.
- Não escreve arquivos no workspace.
- Escreve apenas no índice de artifacts da sessão.

Parâmetros:

```ts
interface RecordArtifactParams {
  title: string;
  description?: string;
  kind?: ToolArtifactKind;
  storage?: Exclude<ToolArtifactStorage, 'published'>;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

Exemplo:

```json
{
  "title": "Detalhes do recurso de perfil de usuário",
  "description": "Página de detalhes do recurso do ambiente de produção da plataforma de dados interna",
  "kind": "link",
  "storage": "external_url",
  "url": "https://platform.example.com/resources/user-profile?env=prod",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "data_platform_resource",
    "env": "prod"
  }
}
```

Retorno:

```ts
return {
  llmContent: {
    recorded: true,
    title: params.title,
    location: params.workspacePath ?? params.managedId ?? params.url,
    note: 'The daemon will expose the assigned artifact id through artifact_changed and list APIs.',
  },
  returnDisplay: 'Recorded artifact: Detalhes do recurso de perfil de usuário',
  artifacts: [params],
};
```

O `record_artifact` faz validação em nível de parâmetro antes de retornar; em caso de falha, retorna um erro de ferramenta e não produz `ToolResult.artifacts`. Como uma única chamada tem apenas um artifact, a V1 não precisa definir sucesso parcial em lote. O `id` atribuído pelo servidor é gerado pelo daemon store e exposto ao client através de `artifact_changed` / `GET /session/:id/artifacts`.

O `record_artifact` não aceita `storage: 'published'`, nem a exceção published de `url + managedId`. O modelo/skill só pode registrar artifacts de workspace, managed ou external URL; artifacts de tipo published devem vir do ArtifactTool / daemon publisher.

Recomendações de permissão:

- Não é recomendado registrar por padrão em todas as sessões; deve ser feature-gated ou habilitado explicitamente por skill/extension.
- Se habilitado, pode ser `allow` por padrão, pois modifica apenas metadados da UI da sessão.
- URLs não são abertas automaticamente.
- O client exibe o host, permitindo que o usuário identifique o destino antes de clicar.
- Se no futuro `file://` for permitido, deve permitir apenas arquivos dentro do workspace; a V1 não recomenda que o `record_artifact` aceite URLs `file://`.
- Assim como hook/client POST, deve passar pela validação unificada de artifacts.

### 6.4 Artifacts de saída de Hook

Como extensão da entrada de registro explícito para hook/extension na V1. Os hooks atuais já suportam command/HTTP/function/prompt, e hooks command/HTTP podem retornar JSON `HookOutput`. Recomenda-se estender `hookSpecificOutput`:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "Detalhes da tarefa de agendamento",
        "url": "https://ops.example.com/task/task_123",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    ]
  }
}
```

Cenários adequados:

- O hook PostToolUse observa a saída de algum MCP/ferramenta e monta a URL de negócio de acordo com as regras da organização.
- extensions fornecem hooks para injetar URLs de recursos internos da empresa na área de produtos à direita.
- O frontmatter da skill registra um hook PostToolUse para registrar artifacts automaticamente enquanto a skill estiver ativa.
- Após a falha da ferramenta, o hook PostToolUse registra error trace, dashboard de execução com falha ou links de troubleshooting.
- Os artifacts PostToolBatch só são conectados se houver um ponto de chamada PostToolBatch real em runtime e os resultados puderem ser enviados para a daemon bridge; a sessão principal do daemon ACP na V1 não assume a existência deste canal.

Alterações de código necessárias:

- `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`.
- `mergeWithOrLogic()` em `packages/core/src/hooks/hookAggregator.ts` deve adicionar lógica de concat para `artifacts`, não usando a lógica last-writer-wins atual de `hookSpecificOutput`.
- `PostToolUseHookResult` / `PostToolBatchHookResult` em `packages/core/src/core/toolHookTriggers.ts` devem adicionar `artifacts?: ToolArtifact[]`.
- `firePostToolUseHook()` retorna `artifacts?: ToolArtifact[]`.
- `firePostToolBatchHook()` retorna `artifacts?: ToolArtifact[]`.
- `packages/core/src/core/coreToolScheduler.ts` deve ser incluído no plano de implementação, pois é o ponto de chamada de `firePostToolBatchHook()` e também possui um caminho independente para `firePostToolUseHook()`.
- Extrair um helper compartilhado `collectHookArtifacts()` ou equivalente, para que `coreToolScheduler.ts` e a sessão ACP `Session.ts` reutilizem a mesma lógica de pré-extração / validação, evitando derivação de comportamento entre os dois.
- `Session.runTool()` coleta artifacts de tool result e artifacts de hook, mas usam transportes diferentes: artifacts de tool result vêm apenas do tool result retornado com sucesso; artifacts de hook não dependem do sucesso da ferramenta, podendo entrar no store mesmo em caminhos de falha.
- No `Session.runTool()` do ACP, os artifacts carregados em resultados de ferramentas bem-sucedidas continuam anexados a `tool_call_update._meta.artifacts`; os artifacts retornados pelos hooks PostToolUse / PostToolUseFailure são enviados separadamente via `client.extNotification('qwen/notify/session/artifact-event', payload)`. Esta notificação deve ser aguardada de forma síncrona (await) após a coleta dos artifacts do hook; falhas no envio apenas registram um warning, não alterando o resultado de falha/sucesso da ferramenta original; estes artifacts de hook não entram no daemon store, a V1 não faz retry persistente.
- Os artifacts de hook passam pela mesma validação que `record_artifact` / client POST: URL scheme, contenção de workspace path, tamanho/tipo de metadata.
- Quando não há uma única tool call para artifacts em nível de batch, `qwen/notify/session/artifact-event` só pode ser usado se já for possível enviar uma ACP `extNotification` para a bridge naquele runtime.
`qwen/notify/session/artifact-event` payload:

```json
{
  "artifacts": [
    {
      "kind": "link",
      "storage": "external_url",
      "title": "批处理任务详情",
      "url": "https://ops.example.com/task/batch_123",
      "mimeType": "text/html"
    }
  ],
  "source": "hook",
  "hookEventName": "PostToolBatch",
  "hookName": "task-artifacts",
  "extensionId": "example-extension"
}
```

Convenções de transporte:

- `qwen/notify/session/artifact-event` é um `extNotification` do ACP, não é um evento SSE, nem uma rota HTTP voltada para o cliente.
- O wire format reutiliza as convenções de notificação existentes de `qwen/notify/session/*`; por exemplo, o padrão de demux de notificação de sessão já existente na bridge.
- O remetente só pode ser um runtime ou uma extension bridge que já esteja no canal da sessão ACP e tenha capacidade de enviar `extNotification`. O `Session.ts` do ACP pode enviar essa notificação; o `coreToolScheduler.ts` em si não pode enviar essa notificação diretamente para a sessão principal do daemon.
- O `BridgeClient` faz o demux por nome de notificação no branch de processamento existente de `extNotification`: ao atingir `qwen/notify/session/artifact-event`, lê o payload, converte para `SessionArtifactInput[]` e então entra no pipeline de ingest unificado.
- A bridge deve derivar `source: 'hook'` a partir do contexto de transporte da notificação; o `source` no payload serve apenas como uma dica de compatibilidade. Se o source do payload for inconsistente com o contexto de transporte, a bridge sobrescreve para `hook` e registra um debug/warning. O payload da notificação não pode definir `trustedPublisher`; se contiver `storage: 'published'`, será tratado como falha de validação de input não confiável comum.

Observação: `qwen/notify/session/artifact-event` é apenas o envelope de transporte para explicit artifacts e não deve formar um segundo pipeline de store/validation/dedupe. O BridgeClient deve converter `_meta.artifacts`, hook artifacts e `artifact-event.artifacts` para o mesmo `SessionArtifactInput[]`, chamando o mesmo `ingestArtifacts()` / `SessionArtifactStore.upsertMany()`, reutilizando a mesma lógica de validação, normalização, enriquecimento, eviction e publicação de `artifact_changed`. A sessão principal do ACP atualmente não tem um callsite de PostToolBatch; o batch hook do `coreToolScheduler.ts` não pode ser tratado como a fonte padrão para o painel de artifacts do daemon. Se o suporte a batch artifacts da sessão principal do daemon for necessário no futuro, callsites reais e testes devem ser adicionados primeiro. Runtimes não-ACP sem um sink de notificação de artifact não podem declarar suporte a daemon hook artifacts.

### 6.5 Inserção direta por Client / Extension

Para cenários em que não se deseja que o modelo chame ferramentas, fornece:

```http
POST /session/:id/artifacts
```

Adequado para:

- Plugins de IDE adicionando a URL de visualização atualmente aberta à área de artefatos.
- Usuários de WebUI adicionando manualmente um link de recurso.
- Plugins de canal ou integrações externas registrando recursos da plataforma durante a tarefa.

Diferenças em relação à saída de hook:

- A saída de hook é adequada para o fluxo interno de execução do agent.
- A rota POST é adequada para daemon client / UI / integrações externas.
- O body da POST deve passar pela validação unificada de artifacts; caminhos absolutos locais arbitrários ou URL schemes não suportados não são permitidos.

## 7. Store e Deduplicação

Identidade do artifact:

- Arquivo de workspace: `sessionId + ':workspace:' + normalizedWorkspacePath`
- Arquivo gerenciado: `sessionId + ':managed:' + normalizedManagedId`
- URL externa / publicada: `sessionId + ':url:' + identityUrl`

A identidade descreve apenas a localização do recurso, não incluindo `source`. Registros de tool, hook e client para a mesma URL ou caminho são mesclados em um único artifact, evitando a exibição duplicada do mesmo recurso no painel direito. A V1 não mantém `provenance[]`, nível de confiança ou classe de retenção; o primeiro registro bem-sucedido possui os campos de exibição e auditoria de origem desse artifact, e registros subsequentes com a mesma identidade apenas expressam que "o mesmo recurso foi observado novamente".

A entrada deve e pode conter apenas um campo de localização:

- `workspacePath`
- `managedId`
- `url`

Se a entrada contiver múltiplos primary locators simultaneamente, a V1 rejeita diretamente, em vez de tentar adivinhar a identidade por prioridade. Isso evita que um artifact seja deduplicado primeiro por `workspacePath` e depois por `url`, gerando duplicatas.

`storage: 'published'` é a única exceção: deve conter `url` como primary locator e pode conter adicionalmente `managedId` como managed reference. A identidade publicada ainda é calculada por `url`; `managedId` é usado apenas para download/visualização futura e não participa da deduplicação. Esta exceção aceita apenas entradas com `trustedPublisher: true` interno; hook, client POST, `record_artifact` ou ferramentas comuns retornando `storage: 'published'` são tratados como falha de validação.

ID externo:

- Usa os primeiros 12 caracteres do sha256 da identidade.

### 7.1 Normalização

`normalizedWorkspacePath`:

- A entrada deve ser um workspace-relative path; se a entrada for um caminho absoluto, tente primeiro converter para um workspace-relative path; se falhar, rejeite.
- Use `path.resolve(workspaceCwd, input)` para obter o caminho absoluto.
- Valide se o resolved path deve estar dentro do workspace: `path.relative(workspaceCwd, resolved)` não pode começar com `..` e não pode ser um caminho absoluto.
- Se o destino já existir, use `fs.realpath` para verificar se o destino final do symlink ainda está dentro do workspace; rejeite se o symlink apontar para fora do workspace.
- Se o destino não existir, o registro pode reter o artifact, mas o `status` inicial deve ser `missing`; não pule a verificação de contenção do symlink apenas porque o `realpath` falhou. Em atualizações de TTL de GET subsequentes, a mesma verificação de contenção + realpath deve ser reexecutada.
- Se durante a atualização for descoberto que o caminho se tornou um symlink apontando para fora do workspace, o artifact é retido, mas o `status` muda para `missing`, e o `sizeBytes` best-effort é limpo; a V1 nunca reporta esse caminho como `available`.
- A saída usa uniformemente slash POSIX, removendo o `./` inicial.
- Não faz colapso de maiúsculas/minúsculas; mesmo que o sistema de arquivos padrão do macOS não diferencie maiúsculas de minúsculas, a identidade ainda é distinguida como string, evitando comportamentos inconsistentes entre plataformas.

`normalizedManagedId`:

- A entrada primeiro sofre trim de ASCII whitespace.
- Após o trim, não pode estar vazio e o comprimento não pode exceder 200 caracteres.
- Rejeita caracteres de controle ASCII.
- Rejeita `/`, `\`, `..`; não é permitido expressar hierarquia de caminhos ou semântica de caminho absoluto local.
- Não faz colapso de maiúsculas/minúsculas, a identidade é distinguida como string.
- O `managedId` público retorna o valor normalizado.

`identityUrl` e `url`:

- Usa o WHATWG `new URL(input)` para análise, proibindo verificações flexíveis como string `startsWith('http')`.
- Exceto para URLs publicadas confiáveis do `ArtifactTool`, artifacts de link comuns permitem apenas `http:` / `https:`.
- O campo `url` armazena a URL clicável limpa para o cliente abrir; não reescreva a identidade como uma URL clicável.
- A identidade é calculada separadamente usando o `identityUrl` interno e não é retornada como um campo público.
- Scheme e host em minúsculas.
- Normalização de porta padrão: `https:443` / `http:80` não são retidos.
- Mantém o fragment; em SPAs com roteamento por hash, o fragment pode ser parte da identidade do recurso.
- Mantém a ordem original dos parâmetros de query; algumas plataformas são sensíveis à ordem da query, a V1 não faz ordenação de query.
- Rejeita ou limpa `username` / `password`, não armazenando userinfo da URL no artifact store.

Comportamento de deduplicação:

- Primeiro registro: `created`
- Registro com a mesma identidade: `updated`
- `createdAt` permanece inalterado.
- `updatedAt` é atualizado, mas não participa da ordenação de eviction.
- Dentro do mesmo `upsertMany()`, as entradas são primeiro mescladas por identidade; o proprietário da mesma identidade é determinado pela entrada com o menor `receivedSeq`; se não houver `receivedSeq`, a ordem do array de entrada é usada. O BridgeClient não deve mesclar artifacts de diferentes eventos de transporte sem ordem; se a mesclagem for necessária, o `receivedSeq` deve ser atribuído primeiro e depois ordenado. Cada identidade final gera apenas uma change em `changes[]`. Se a identidade não existia antes deste lote, será `created`, caso contrário, será `updated`.
- Os campos de exibição `title`, `description`, `source`, `toolCallId`, `toolName`, `hookName`, `extensionId`, `clientId` adotam first-writer-wins e não são sobrescritos por entradas subsequentes da mesma identidade.
- Os campos do corpo do recurso permitem atualizações seguras: ao atualizar a identidade da mesma URL de `external_url` para `published`, é possível atualizar `storage`, adicionar `managedId`, atualizar `kind` / `mimeType` / `sizeBytes` e permitir que o publisher sobrescreva `title` / `description`, evitando que títulos de link de espaço reservado obscureçam permanentemente a publicação real. Esta atualização aceita apenas entradas `storage: 'published'` com `trustedPublisher: true` interno.
- É permitido preencher `managedId` de vazio para uma managed reference publicada; um `managedId` existente não é sobrescrito por entradas comuns subsequentes.
- `status` e `sizeBytes` são campos derivados best-effort do daemon e podem ser atualizados com o stat do workspace ou enriquecimento de artifact publicado.
- `metadata` armazena pequenos objetos que passaram na validação no primeiro registro; para a mesma identidade subsequentemente, apenas entradas com `source: 'tool'` ou `source: 'client'` podem fazer enriquecimento controlado: adicionam apenas chaves inexistentes, não sobrescrevem chaves existentes, e após a mesclagem, revalidam apenas primitivos e o tamanho total de 4KB. O enriquecimento de metadata de hooks para artifacts existentes é ignorado por padrão. Se o limite for excedido após a mesclagem, apenas o enriquecimento de metadata atual é descartado e um warning é registrado; outras atualizações seguras do artifact podem continuar.
- O client POST da mesma identidade não sobrescreve campos de exibição nem altera `retentionSource`; ele apenas define o `clientRetained` interno como `true`, para expressar a intenção de retenção manual do usuário.
- A implementação deve processar de forma síncrona dentro de um único `SessionArtifactStore.upsertMany()`, evitando condições de corrida de leitura-escrita assíncrona.

Campos internos do store:

- `retentionSource`: O `source` do primeiro registro bem-sucedido, atribuído na criação e não alterado posteriormente por client POST ou upserts repetidos.
- `clientRetained`: Booleano, inicialmente `source === 'client'`; definido como `true` quando qualquer client POST que passe pelo mutation gate atinge a mesma identidade. `clientRetained` não altera campos de exibição nem migra o bucket de `retentionSource`.
- `insertSeq`: Número de sequência monotonicamente crescente dentro do store, atribuído uma vez na criação do artifact e nunca atualizado.
- `receivedSeq`: Ordem de recebimento da entrada, usada apenas para deterministic coalescing no mesmo lote, não retornada como campo público.

Cotas e políticas de retenção:

- Máximo de 200 artifacts por sessão.
- A V1 usa soft source reservation, a reservation é atribuída de acordo com o `retentionSource` interno:
  - `tool`: 100
  - `client`: 50
  - `hook`: 50
- A reservation é uma cota mínima de retenção, não um limite rígido; cotas não utilizadas podem ser emprestadas por outras fontes, até o limite global de 200.
- Quando a criação de novos artifacts faz o total exceder 200, os candidatos a eviction são selecionados na seguinte ordem. Os artifacts recém-criados no lote `upsertMany()` não entram no pool de candidatos por padrão; a eviction seleciona candidatos apenas entre os artifacts que já existiam antes deste lote. Assim, um artifact missing recém-registrado neste lote pode expulsar um artifact antigo ainda live em um store cheio; esta é a escolha da V1 para garantir a visibilidade dos artefatos explícitos atuais.
  1. Prioriza a remoção de artifacts com `status: 'missing'` e `clientRetained === false`.
  2. Em seguida, remove artifacts com `clientRetained === false` de fontes onde a quantidade de `retentionSource` excede a reservation.
  3. Depois, remove o artifact mais antigo com `clientRetained === false`.
  4. Se todos os artifacts tiverem `clientRetained === true`, remove o artifact client-retained mais antigo.
- Antes de usar a prioridade de `missing` em cache para eviction, deve-se fazer uma atualização de status / verificação de contenção best-effort para os artifacts de workspace que serão candidatos; se após a atualização for `available`, não pode continuar a ser removido prioritariamente como missing. Em caso de falha na atualização, mantém o estado original em cache.
- `clientRetained` é a última preferência de remoção, não um pin infinito, e não ultrapassa o limite global de 200 ou a soft reservation. Quando todos os artifacts são client-retained, ainda assim o artifact client-retained mais antigo é removido.
- Se, após remover artifacts antigos, os próprios artifacts recém-criados neste lote ainda excederem a capacidade restante, o store deve reter as primeiras N novas identidades por `receivedSeq` / ordem de entrada antes de gerar `changes[]`, descartar as entradas excedentes deste lote e registrar warning/diagnostics. As novas entradas descartadas não entram no store, não geram change `created` ou `removed`, portanto, dentro da mesma mutation, a mesma identidade não terá `created` seguido de `removed`.
- A ordenação "mais antigo" usa `(createdAt, insertSeq)`, onde `insertSeq` é o número de sequência monotonicamente crescente interno do store, usado para estabilizar o tiebreaker de entradas no mesmo milissegundo ou no mesmo lote.
- O registro repetido da mesma identidade atualiza `updatedAt`, mas a eviction não observa `updatedAt`; portanto, outras fontes não podem fixar um artifact antigo no conjunto de retenção através de registros repetidos de alta frequência.
- Retorna em ordem crescente de `createdAt`.
- A remoção deve enviar `artifact_changed` / `removed` para cada artifact removido. A V1 não fornece outros eventos de remoção.
- Os valores de reservation, `retentionSource`, `clientRetained` e `insertSeq` são detalhes de implementação da V1, não campos do wire protocol; posteriormente, os valores padrão podem ser ajustados sem alterar o formato da API, ou cotas por produtor mais granulares podem ser adicionadas.

### 7.2 Limites do ciclo de vida da V1

O store da V1 é um índice de memória de sessão de bridge ativa:

- Os artifacts não são restaurados após a reinicialização da bridge/sessão.
- Após a reconexão por queda de SSE do cliente, deve-se fazer um `GET /session/:id/artifacts` novamente para snapshot sync.
- A V1 não requer um evento `artifacts_reset` adicional; se no futuro houver suporte para modos de execução onde a sessão continua existindo, mas o artifact store é esvaziado, adicione `artifacts_reset` ou um evento equivalente de snapshot-invalidated.
- Restauração de histórico, persistência entre processos e replay de carregamento de sessão pertencem a fases subsequentes.

## 8. Cadeia de implementação interna

As Fases a seguir são a ordem de implementação de engenharia para a mesma capacidade completa da V1, não representando uma divisão em múltiplas versões para o público. Os PRs de implementação podem ser divididos por Fase, mas a base de design após a mesclagem é uma capacidade completa de artifacts de sessão.

### 8.1 Fase A: core types e ArtifactTool

Alterações:

- `packages/core/src/tools/tools.ts`
  - Adiciona `ToolArtifactKind`, `ToolArtifactStorage`, `ToolArtifact`.
  - Estende `ToolResult.artifacts?`.
- `packages/core/src/tools/artifact/artifact-tool.ts`
  - Preenche `artifacts` após publish bem-sucedido.
  - Usa `storage: 'published'`, não expõe o caminho local do qwen home como `workspacePath`.

A Fase A integra primeiro `ToolResult.artifacts` e `ArtifactTool`; `record_artifact` é integrado na Fase D, mas ainda pertence à mesma capacidade completa da V1.

### 8.2 Fase B: cli ACP session metadata

Alterações:

- `packages/cli/src/acp-integration/session/types.ts`
  - `ToolCallResultParams.artifacts?`
- `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`
  - `_meta.artifacts = params.artifacts`
- `packages/cli/src/acp-integration/session/Session.ts`
  - Coleta `toolResult.artifacts` após o sucesso da ferramenta.
  - O artifact do hook PostToolUse é coletado independentemente do sucesso/falha da ferramenta, usado para artefatos de diagnóstico de falha como error trace / dashboard.
  - Os artifacts do hook no caminho de falha não podem depender de metadados de resultado de sucesso; se necessário, chame diretamente o bridge artifact ingest.
  - Não deriva artifacts automaticamente de `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` comuns.
  - Passa para `emitResult()`.

### 8.3 Fase C-1: acp-bridge store e eventos

Adições:

- `packages/acp-bridge/src/sessionArtifacts.ts`
  - Tipos
  - normalize
  - validation
  - id/hash
  - `SessionArtifactStore`

Entrada da Bridge session adiciona:

```ts
artifacts: SessionArtifactStore;
```

Interface da Bridge adiciona:

```ts
getSessionArtifacts(sessionId: string): SessionArtifactsEnvelope;
addSessionArtifacts(
  sessionId: string,
  artifacts: SessionArtifactInput[],
): DaemonSessionArtifactMutationResult;
removeSessionArtifact(
  sessionId: string,
  artifactId: string,
): DaemonSessionArtifactMutationResult;
```

BridgeClient:

- Extrai artifacts de `session_update/tool_call_update._meta.artifacts`.
- Extrai explicit notification artifacts de `qwen/notify/session/artifact-event`.
- Todas as entradas são convertidas para o mesmo `SessionArtifactInput[]`.
- Atribui `source` e `receivedSeq` com base no contexto de transporte. `trustedPublisher` é atribuído apenas pela opção de ingest no lado da bridge de uma session update de `ArtifactTool` concluída; o BridgeClient não deve inferir com base em campos de payload de artifact ou conteúdo comum de `_meta.artifacts`.
- Chama unificadamente `ingestArtifacts()` / `SessionArtifactStore.upsertMany()`, não crie um segundo conjunto de validation ou dedupe para notification artifacts.
- `upsertMany()` retorna `DaemonSessionArtifactMutationResult`, contendo changes created/updated e removed geradas pela eviction.
- Publica `artifact_changed` para cada change, publicando created/updated primeiro, depois removed.
- `removeSessionArtifact()` remove o artifact do store, retorna a change removed com `reason: 'explicit'` e publica `artifact_changed`.

### 8.4 Fase C-2: serve snapshot API

Alterações:

- `packages/cli/src/serve/capabilities.ts`
  - Adiciona `session_artifacts`.
- `packages/cli/src/serve/server.ts`
  - Adiciona `GET /session/:id/artifacts`.
  - Adiciona `DELETE /session/:id/artifacts/:artifactId`.

Comportamento do GET:

- Sessão não existe: 404 existente.
- Sem artifacts: retorna array vazio.
- O artifact de workspace mantém um cache de status interno, como `lastStatAt`, `lastKnownSizeBytes`, `lastKnownStatus`.
- Faz um stat best-effort durante o upsert.
- O GET usa o cache por padrão; atualiza por TTL apenas quando `lastStatAt` expira, por exemplo, 5-30 segundos, e limita a quantidade de stats simultâneos. Ao atualizar, deve reexecutar a contenção de workspace e verificação de symlink realpath da Seção 7.1.
- Falha no stat: o GET retorna `status: 'missing'`, não remove o artifact.
- Stat bem-sucedido e verificação de contenção / realpath ainda passa: se o cache anterior era `missing`, o GET retorna `status: 'available'`.
- Se a atualização descobrir escape de symlink ou falha na contenção de workspace, o GET retorna `status: 'missing'`, não retorna um novo `sizeBytes`.
- O GET pode atualizar silenciosamente o cache de status, mas não deve publicar `artifact_changed` devido a solicitações de leitura; o status da V1 é eventualmente consistente para clientes SSE.
- Se eventos de status em tempo real forem necessários no futuro, devem ser publicados por uma atualização em segundo plano ou mutation de atualização explícita `artifact_changed` / `updated`, não coloque no caminho de leitura quente do GET.
- Artifacts managed / URL não sondam caminhos locais, sempre retornam `status: 'available'`.

### 8.5 Fase C-3: SDK list/event support
Alterações:

- `packages/sdk-typescript/src/daemon/types.ts`
  - Adicionado tipo `artifact`.
- `packages/sdk-typescript/src/daemon/events.ts`
  - Adicionado `artifact_changed` aos known events.
- `packages/sdk-typescript/src/daemon/DaemonClient.ts`
  - `listSessionArtifacts(sessionId, opts?, clientId?)`
  - `addSessionArtifact(sessionId, artifact, clientId?)`
  - `removeSessionArtifact(sessionId, artifactId, clientId?)`
- `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`
  - `artifacts(opts?)`
  - `addArtifact(artifact)`
  - `removeArtifact(artifactId)`
- `packages/sdk-typescript/src/index.ts`
  - Tipos exportados.

O add singular do SDK é mapeado para a mutation plural da bridge: `addSessionArtifact(a)` é encapsulado como `addSessionArtifacts(sessionId, [a])`, retornando o `DaemonSessionArtifactMutationResult` completo, sem descartar as removed changes geradas pela eviction.

### 8.6 Fase D: registro explícito de record_artifact

Alterações:

- `packages/core/src/tools/tool-names.ts`
  - Adicionado `RECORD_ARTIFACT: 'record_artifact'`.
- Novo `packages/core/src/tools/record-artifact.ts`
  - Implementa `RecordArtifactTool`.
  - Os parâmetros usam `workspacePath` / `managedId` / `url`, não aceitando caminhos absolutos locais arbitrários.
  - Não aceita `storage: 'published'` ou exceções de `url + managedId` published.
  - Saída `ToolResult.artifacts`, reutilizando o pipeline V1 store/event/list.
- `Config.createToolRegistry`
  - Registro com feature-gated ou opt-in de skill/extension, evitando adicionar ferramentas visíveis ao modelo para todas as sessions.

### 8.7 Fase E: registro explícito de hook artifacts

Alterações:

- `packages/core/src/hooks/types.ts`
  - `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`.
- `packages/core/src/hooks/hookAggregator.ts`
  - `mergeWithOrLogic()` concatena `artifacts` de múltiplos hooks, não utilizando last-writer-wins.
- `packages/core/src/core/toolHookTriggers.ts`
  - Adicionado `artifacts?: ToolArtifact[]` ao `PostToolUseHookResult` / `PostToolBatchHookResult`.
- `packages/core/src/core/coreToolScheduler.ts`
  - Substitui o caminho de propagação de artifacts PostToolUse / PostToolBatch do core scheduler.
- `packages/cli/src/acp-integration/session/Session.ts`
  - Substitui o caminho de propagação de artifacts PostToolUse da ACP session.
- Os dois caminhos PostToolUse reutilizam o mesmo helper de coleção de hook artifacts.
- A ACP session V1 não declara suporte a PostToolBatch artifacts; se o produto exigir batch artifacts para a sessão principal do daemon, um callsite PostToolBatch real deve ser adicionado na ACP Session, em vez de depender do caminho de sessão principal não daemon do `coreToolScheduler.ts`.
- Outros runtimes que já possuam notificação de artifacts em nível de batch podem enviá-los para a bridge via `qwen/notify/session/artifact-event`.
- O BridgeClient extrai batch-level artifacts de `qwen/notify/session/artifact-event`, utilizando o mesmo conjunto de validation e upsert.

### 8.8 Fase F: registro explícito de client POST / SDK add

Alterações:

- `packages/cli/src/serve/server.ts`
  - Adicionado `POST /session/:id/artifacts`, utilizando `mutate({ strict: true })`.
  - Adicionado `DELETE /session/:id/artifacts/:artifactId`, utilizando `mutate({ strict: true })`.
  - Valida o body.
  - source definido como `client`.
  - Converte para um `SessionArtifactInput[]` de elemento único, chamando `addSessionArtifacts()` da bridge.
  - POST não aceita `storage: 'published'` ou `trustedPublisher`.
  - DELETE chama `removeSessionArtifact()` da bridge; retorna `changes[]` vazio se o artifact já não existir, sem publicar SSE.
  - Publica `artifact_changed`, primeiro created/updated, depois removed.
- O add de artifact não cria uma nova mutation singular na bridge; todas as novas entradas utilizam `addSessionArtifacts()` / `upsertMany()`, evitando a deriva de comportamentos de validation, coalescing e eviction. O remove de artifact utiliza um `removeSessionArtifact()` separado, pois é deletado pelo artifact id atribuído pelo servidor, não participando de input validation / identity coalescing.

- Adicionado ao SDK:
  - `DaemonClient.addSessionArtifact(sessionId, artifact, clientId?)`
  - `DaemonSessionClient.addArtifact(artifact)`
  - `DaemonClient.removeSessionArtifact(sessionId, artifactId, clientId?)`
  - `DaemonSessionClient.removeArtifact(artifactId)`

## 9. Limites de Segurança

### 9.1 URL

- Artifacts de link comuns permitem apenas `http:` / `https:`.
- Deve ser usado o parser WHATWG `new URL(input)` e verificado `parsed.protocol`, sendo proibida a verificação baseada em prefixo de string.
- Rejeitar ou limpar `parsed.username` / `parsed.password` antes do armazenamento, evitando vazamento de credenciais de URL.
- `record_artifact` / hook / client POST não permitem `file://`.
- A URL published `file://` retornada por `ArtifactTool` mantém a exceção, pois vem de um publish autorizado; em cenários de remote daemon, a URL `https:` do publisher remoto deve ser priorizada.
- O Daemon não faz fetch de URLs.
- O Client exibe o host.
- URLs não são abertas automaticamente.
- O Client não deve preencher automaticamente URLs externas em `<img>`, `<video>`, `<audio>`, `iframe` ou elementos de visualização semelhantes que façam requisições de rede, apenas porque o `kind` é `'image' | 'video' | 'audio' | 'html'`. A V1 exibe apenas ícone, título, host e ponto de clique para URLs externas; a visualização remota deve aguardar o clique explícito do usuário ou ser habilitada posteriormente por meio de uma preview capability separada e estratégia de sandbox.
- O Client deve alertar ou bloquear endereços de rede privada como loopback, RFC 1918, link-local, metadata service, etc.; o Daemon V1 não resolve DNS e não assume o julgamento final da proteção contra SSRF.

### 9.2 Path

- Retorna apenas `workspacePath` externamente, que deve ser um workspace-relative path.
- Paths fora do workspace não são expostos como file artifacts.
- Se `record_artifact` / hook / client POST passarem `workspacePath`, deve estar dentro do workspace.
- O algoritmo de validação está na Seção 7.1: `path.resolve` + `path.relative` containment check, e se o destino existir, fazer `fs.realpath` symlink escape check; se o destino não existir, o artifact pode entrar no store, mas deve ser marcado como `missing`, e o GET/status refresh subsequente continuará executando a mesma validação.
- Rejeita escape de `..`, escape de caminho absoluto, symlinks apontando para fora do workspace, `~/.qwen`, `/tmp` e outros paths externos locais.
- `managedId` só pode referenciar daemon-managed storage; não pode estar vazio após trim, rejeitando separadores de path, `..`, caracteres de controle e semântica de caminho absoluto local.

### 9.3 Metadata

- Limita o tamanho, por exemplo, não excedendo 4KB após JSON stringify.
- Permite apenas primitive values.
- Não permite nested objects/arrays, evitando complexidade na UI e persistência.
- Não armazena secrets, tokens, cookies, signed URLs, chaves privadas ou credenciais de acesso.
- Se o string value do metadata for exibido na UI, deve ser renderizado ou escapado como untrusted plain text; o metadata não é um ponto de extensão HTML/markdown.
- A V1 não fornece campos sem consumidores como `visibility`, `sensitivity`, `expiresAt`, `sourceId`, etc.; a visibility do artifact é fixada na semântica session-local atual.
- As dimensões de auditoria são carregadas pelo `source` / `toolCallId` / `toolName` / `hookName` / `extensionId` / `clientId`, `createdAt`, `updatedAt` do primeiro registrador.
- Registros subsequentes para a mesma identity não sobrescrevem os campos de exibição do primeiro registrador por padrão; a única exceção é o upgrade trusted `external_url -> published` definido na Seção 7, onde o publisher pode sobrescrever `title` / `description`. O metadata permite apenas o enriquecimento controlado definido na Seção 7, evitando injeção de metadata entre fontes.

### 9.4 Campos de Texto

- `title` / `description` são plain text, não HTML, nem markdown.
- A validação do Daemon deve fazer verificação de comprimento, trim e rejeição de caracteres de controle ASCII; não use listas negras de substrings como limite de segurança XSS.
- Todos os campos de texto que podem entrar na UI, incluindo `title`, `description`, string value do `metadata`, `toolName`, `hookName`, `extensionId`, `clientId`, devem ser renderizados como untrusted text ou sofrer HTML escape pelo client, sendo proibida a inserção direta via `innerHTML`.

### 9.5 Anti-spam

- Máximo de 200 artifacts por session.
- A soft reservation é padrão `tool: 100`, `client: 50`, `hook: 50`, e a cota não utilizada pode ser emprestada por outras fontes.
- `record_artifact` registra apenas 1 artifact por tool call.
- `POST /session/:id/artifacts` utiliza o rate limit / mutation gate existente.
- A eviction deve enviar eventos `artifact_changed` / `removed` um por um.
- O Client pode agrupar ou recolher por source/toolName.

### 9.6 Diagnósticos de Validação

- Retorna erro de ferramenta quando a validação de parâmetros do `record_artifact` falha, não gerando artifact.
- Retorna 400 quando a validação do body do `POST /session/:id/artifacts` falha.
- Um único artifact malformado em `_meta.artifacts`, hook artifacts ou `artifact-event` não deve quebrar o tool/session event original; a bridge deve pular esse artifact e registrar um log de nível warning.
- O log de warning deve conter pelo menos sessionId, source, toolName / hookName / extensionId / clientId, campo com falha e motivo; não registre metadata values semelhantes a secrets.
- O log de debug pode registrar o payload do artifact rejeitado após ofuscação e truncamento de comprimento.
- Se a infraestrutura de telemetry/metrics existente estiver disponível, adicione um contador de rejeição de validação, rotulado por source e reason; se não houver metrics por enquanto, o log é o requisito mínimo da V1.

## 10. Limites com "Links Comuns"

O painel de artifacts à direita exibe apenas artifacts declarativos; o corpo do chat ainda pode exibir links comuns.

Motivos para não fazer extração automática:

- Links de documentação, links de referência e links de depuração em respostas comuns entrariam em massa incorretamente na área de artifacts.
- URLs podem ser exemplos, modelos, trabalhos em andamento ou saídas de erro.
- A extração automática impediria o modelo de controlar "quais links valem a pena para uso posterior pelo usuário".
- Em termos de segurança, o registro explícito facilita a marcação de origem e alertas na UI.

Se o negócio exigir fortemente a extração de URLs do texto, deve ser uma UX opcional do Client:

- Exibir apenas nas proximidades do corpo do chat.
- Não entra no daemon artifact store.
- Não aciona `artifact_changed`.

## 11. Uso por Skill / Agent

Após a V1 fornecer `record_artifact`, a skill ou agent.md pode escrever:

```md
Quando você construir uma URL de recurso de negócio para visualização pelo usuário com base nos resultados da ferramenta, chame a ferramenta record_artifact para registrá-la.

Regras de registro:

- title usa o nome legível por humanos do recurso.
- kind usa link.
- storage usa external_url.
- url usa a URL clicável final.
- metadata.resourceType preenche o tipo de recurso, por exemplo, data_platform_resource, scheduler_task.
- Não registre links de documentos de referência comuns como artifacts.
```

Após a execução do modelo:

1. Chame a ferramenta de negócio para obter o ID do recurso, ID da tarefa, ID do nó.
2. Monte a URL de acordo com as regras da skill.
3. Chame `record_artifact`.
4. O link aparece na área de artifacts à direita do Daemon.

Esta abordagem não exige que a skill escreva hooks, nem requer código de extension/plugin, sendo mais adequada para a maioria das regras de negócio.

## 12. Uso por Hook / Extension

Após a V1 fornecer hook artifacts, a extension pode fornecer um hook PostToolUse em `qwen-extension.json` ou `hooks/hooks.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__data_platform__get_resource",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/table-artifact.js"
          }
        ]
      }
    ]
  }
}
```

A substituição de variáveis da extension/hook do qwen-code atual ainda suporta `${CLAUDE_PLUGIN_ROOT}`; se uma nova variável root específica do qwen for introduzida posteriormente, o exemplo pode migrar junto com a implementação.

stdout do script:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "Detalhes do recurso de perfil do usuário",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "data_platform_resource"
        }
      }
    ]
  }
}
```

Isso é adequado para plugins corporativos: consolida a lógica de "como montar a URL de negócio a partir dos resultados da ferramenta" na extension, em vez de escrevê-la em cada prompt.

## 13. Plano de Testes

### 13.1 Fase A core

Cobre:

- Compilação do tipo `ToolResult.artifacts`.
- `ArtifactTool` retornando com sucesso um html artifact com `storage: 'published'`.
- `ArtifactTool` não expõe o caminho absoluto local do qwen home como `workspacePath`.
- Regras de inferência padrão de `ToolArtifact.kind` / `storage` cobertas por testes unitários.

Comandos:

```bash
cd packages/core && npx vitest run src/tools/artifact/artifact-tool.test.ts
```

### 13.2 Fase B cli session

Cobre:

- `ToolCallEmitter.emitResult()` gerando `_meta.artifacts`.
- `toolResult.artifacts` sendo passado para `emitResult()`.
- A atualização de session do `ArtifactTool` concluído definirá o `trustedPublisher: true` interno por meio da opção de ingestão do lado da bridge; `record_artifact`, outros tool results, hook payloads, client POST não definirão isso, e o BridgeClient também não pode inferir através dos campos do payload do artifact.
- Modificações de código-fonte comuns do `write_file/edit/notebook_edit` não derivam artifacts automaticamente.
- `read_file/grep/glob/shell` não derivam artifacts.
- Não coleta artifacts de tool results com falha quando a ferramenta falha; artifacts de diagnóstico retornados explicitamente pelo hook PostToolUse ainda podem entrar no store.
- Hook artifacts no caminho de falha não dependem do `_meta.artifacts` do result de sucesso.

Comandos:

```bash
cd packages/cli && npx vitest run src/acp-integration/session/emitters/ToolCallEmitter.test.ts
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

### 13.3 Fase C-1 acp-bridge

Cobre:

- `SessionArtifactStore` created/updated/removed.
- Enriquecimento de `ToolArtifact` para `DaemonSessionArtifact`.
- `SessionArtifactInput` é o tipo de entrada interna unificado para todas as entradas.
- Inferência padrão de `kind` / `storage`, cobrindo published->html, html/image/video/audio/pdf/notebook/file.
- Deduplicação de identidade workspacePath / managedId / URL, e a identidade não contém source; o registro do mesmo recurso entre diferentes sources será mesclado em um único artifact.
- Artifacts comuns que carregam múltiplos primary locators simultaneamente são rejeitados; apenas `trustedPublisher: true` e `storage: 'published'` permitem `url + managedId`, e a identidade é baseada apenas na `url`.
- hook, client POST, `record_artifact` ou tool results comuns que falsificam `storage: 'published'` serão rejeitados ou ignorados e registrarão um warning.
- Normalização de managedId: trim, rejeição de valores vazios, rejeição de separadores de path, rejeição de `..`, rejeição de caracteres de controle, sem colapso de maiúsculas/minúsculas.
- Validação de URL: scheme/host em minúsculas, normalização de porta padrão, retenção de fragment, retenção de ordem de query, rejeição/remoção de userinfo.
- `url` salva a URL clicável limpa, a identidade usa o `identityUrl` interno, os dois não são misturados.
- Validação de Path: `../../etc/passwd`, caminhos absolutos fora do workspace, escape de symlink são todos rejeitados; paths inexistentes que entram no store são marcados como `missing`, e o GET TTL refresh refaz a verificação de containment / realpath.
- Validação de Title/description: limite de comprimento, trim, rejeição de caracteres de controle, plain text, rejeição de payloads HTML/script óbvios.
- Validação de Metadata: limite de tamanho, apenas primitive, rejeição de nested objects/arrays.
- O upsert da mesma identidade adota first-writer-wins para campos de exibição e campos de origem.
- A mesma identidade de URL suporta o upgrade do corpo do recurso trusted `external_url -> published`, preenchendo `managedId` / `kind` / `mimeType`, e permite que o publisher sobrescreva `title` / `description` placeholders.
- Metadados subsequentes de tool/client só podem adicionar chaves ausentes, não podem sobrescrever chaves existentes, e após a mesclagem devem satisfazer novamente as restrições de 4KB e apenas primitive.
- O enriquecimento de metadata subsequente do hook é ignorado por padrão.
- Identidades duplicadas no mesmo lote determinam o owner pela ordem de `receivedSeq` / array de entrada, e geram apenas uma change final em `changes[]`.
- `retentionSource` é atribuído na criação e não é atualizado; `clientRetained` é separado de `retentionSource`; `insertSeq` é atribuído na criação e não é atualizado.
- soft reservation eviction: cotas não utilizadas podem ser emprestadas, missing é podado primeiro, client-retained é podado por último, ordenação estável por `createdAt + insertSeq`, e envia eventos removed com `reason: 'eviction'` um por um.
- Antes de usar a prioridade missing na eviction, o estado do artifact de workspace candidato é atualizado, evitando que o cache missing obsoleto priorize a poda de arquivos já recuperados.
- A eviction não prioriza a poda de artifacts missing recém-criados neste lote; se o próprio lote exceder a capacidade restante, as novas entradas deste lote em excesso são descartadas antes de gerar changes e registram diagnostics, não gerando `created` + `removed` para a mesma identidade.
- `clientRetained` não ultrapassa o limite global de 200; quando totalmente client-retained, ainda poda os itens mais antigos.
- Artifacts malformados gerarão warning log / diagnostics, sem afetar o event original.
- `_meta.artifacts` é gravado no store.
- `artifact_changed` é publicado.
- `upsertMany()` / `addSessionArtifacts()` retorna o `DaemonSessionArtifactMutationResult` contendo eviction changes.
- `removeSessionArtifact()` retorna a removed change com `reason: 'explicit'`.

Comandos:

```bash
cd packages/acp-bridge && npx vitest run src/sessionArtifacts.test.ts
cd packages/acp-bridge && npx vitest run src/bridgeClient.test.ts
```
### 13.4 Phase C-2 serve

Cobertura:

- `/capabilities` inclui `session_artifacts`.
- `GET /session/:id/artifacts` retorna uma lista vazia.
- Retorna envelope quando há artifacts.
- O envelope não retorna o `workspaceCwd` absoluto da máquina host.
- Sessão desconhecida retorna o erro existente.
- No refresh do TTL do GET de workspace artifact, executa stat best-effort; arquivos ausentes retornam `status: 'missing'`, e arquivos restaurados retornam `status: 'available'`.
- O refresh do TTL do GET refaz a verificação de contenção do workspace / realpath do symlink; escape de symlink retorna `missing`.
- O refresh de status do GET não publica `artifact_changed`; artifacts gerenciados / URL não fazem stat local.
- O GET usa cache de status / TTL para evitar fazer stat síncrono de todos os artifacts em cada hot read.

Comandos:

```bash
cd packages/cli && npx vitest run src/serve/server.test.ts
```

### 13.5 Phase C-3 SDK

Cobertura:

- A rota `listSessionArtifacts()` está correta.
- Narrowing do evento conhecido `artifact_changed`; o artifact do evento é um `DaemonSessionArtifact` completo.
- Novos tipos exportados no index público.
- O tipo de enum de resposta pública é uma open union; o client tem fallback para kind/status/source/storage desconhecidos.
- O add singular do SDK empacota o add plural da bridge e retorna o resultado completo da mutação; o remove do SDK chama a rota DELETE.

Comandos:

```bash
cd packages/sdk-typescript && npx vitest run src/daemon/DaemonClient.test.ts
cd packages/sdk-typescript && npx vitest run src/daemon/events.test.ts
```

### 13.6 Phase D/E/F explicit registration tests

`record_artifact`:

- Valida title / workspacePath / managedId / url.
- Não permite `workspacePath + managedId + url` vazios, nem permite que entradas comuns passem múltiplos primary locators simultaneamente.
- Não permite `storage: 'published'`.
- Não permite URL schemes não suportados.
- Userinfo da URL é rejeitado ou limpo.
- Retorna `ToolResult.artifacts`.
- `llmContent` retorna um resultado de registro estruturado; cada tool call registra apenas um artifact.

hook artifacts:

- `HookOutput.hookSpecificOutput.artifacts` entra em `PostToolUseHookResult` / `PostToolBatchHookResult` via `createHookOutput()`, `toolHookTriggers.ts`.
- `mergeWithOrLogic()` em `hookAggregator.ts` faz concat de múltiplos hook artifacts.
- Tanto `coreToolScheduler.ts` quanto o `Session.ts` do ACP podem propagar PostToolUse artifacts.
- Os dois caminhos de PostToolUse reutilizam o helper compartilhado de coleção de hook artifacts.
- A main session do ACP não declara PostToolBatch artifacts; se um callsite real for adicionado posteriormente, precisará de cobertura de teste unitário.
- Hook artifacts de PostToolUse / PostToolUseFailure entram na bridge separadamente via extNotification `qwen/notify/session/artifact-event`, sem depender do `_meta.artifacts` de tool result de sucesso.
- Runtimes com batch notification existente podem ser escritos no store via `qwen/notify/session/artifact-event`.
- Hook artifacts passam pela mesma validação que as outras entradas.
- O `source` do payload do hook é derivado pela bridge pelo contexto de transporte, não podendo falsificar tool source ou trusted publisher.
- Quando a ferramenta falha, os error/dashboard artifacts retornados pelo hook ainda podem entrar no store.

client POST / SDK add:

- `POST /session/:id/artifacts` faz upsert com sucesso.
- `POST` retorna `DaemonSessionArtifactMutationResult`, contendo mudanças de created/updated e eviction removed.
- Quando `POST` dispara upsert + eviction, valida que cada item de `changes[]` é publicado sincronizadamente como um SSE event `artifact_changed`, e created/updated vêm antes de removed.
- `POST` é rejeitado quando não autorizado / sem mutation token.
- `POST` retorna 400 para paths fora do workspace, path traversal, symlink escape.
- `POST` retorna envelope de erro estruturado para `storage: 'published'`, múltiplos primary locators, metadata excedendo o limite.
- `POST` escreve através de um único caminho na bridge `addSessionArtifacts()`.
- O body de `DaemonClient.addSessionArtifact()` está correto.
- `DELETE /session/:id/artifacts/:artifactId` retorna uma mudança removed com `reason: 'explicit'` quando atingido, e publica o SSE event correspondente, sem deletar o arquivo ou URL subjacente.
- `DELETE /session/:id/artifacts/:artifactId` retorna idempotentemente um `changes[]` vazio quando não atingido, sem publicar SSE event.

### 13.7 Testes de integração entre pacotes

Cobre o fluxo completo:

1. A tool retorna `ToolResult.artifacts`.
2. `ToolCallEmitter` escreve em `_meta.artifacts`.
3. `BridgeClient` extrai os artifacts do evento.
4. `SessionArtifactStore` valida / normaliza / faz upsert.
5. SSE envia `artifact_changed`.
6. `GET /session/:id/artifacts` retorna o mesmo artifact.
7. Após reconexão do client, puxar o snapshot novamente consegue recuperar o estado atual em memória.
8. Preenche os artifacts até perto do limite e adiciona um novo artifact; asserção de que o SSE contém simultaneamente o evento created e o evento removed com `reason: 'eviction'`, e em seguida o GET retorna apenas o estado aparado.

### 13.8 Aceitação manual

Cenário A: Artefatos de arquivo

1. ArtifactTool publica `lineage.html`.
2. `GET /session/:id/artifacts` retorna o artifact html com `storage: 'published'`.
3. SSE recebe `artifact_changed`.

Cenário B: Edição de código-fonte comum não entra na área de artefatos

1. O agent modifica arquivos de código-fonte.
2. file change / diff aparecem normalmente.
3. A lista de artifacts não muda.

Cenário C: Artefatos de link de negócio explícito

1. A skill pede ao modelo para montar a URL de detalhes de recurso interno.
2. O modelo chama `record_artifact`.
3. Um link artifact aparece na área de artefatos à direita.

Cenário D: Artefatos de hook

1. A extension registra um PostToolUse hook.
2. O hook retorna artifacts com base no output da tool.
3. Um hook source artifact aparece na área de artefatos à direita.

Cenário E: Links comuns não entram na área de artefatos

1. O assistente responde com um markdown link.
2. A lista de artifacts não muda.

## 14. Critérios de aceitação

Após a implementação completa dos recursos da V1, deve satisfazer pelo menos:

- O feature `session_artifacts` existe.
- `GET /session/:id/artifacts` está disponível.
- O evento `artifact_changed` está disponível.
- `ArtifactTool` gera artifact html published.
- `ToolResult.artifacts` consegue entrar no daemon artifact store.
- `record_artifact` consegue registrar link / workspace artifact, e é feature-gated ou registrado como opt-in.
- O hook consegue injetar artifact via `hookSpecificOutput.artifacts`, com múltiplos hook artifacts concatenados.
- O client consegue injetar artifact via `POST /session/:id/artifacts`.
- O client consegue remover explicitamente artifacts registrados incorretamente via `DELETE /session/:id/artifacts/:artifactId`.
- `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` comuns não entram automaticamente na lista de artifacts.
- URLs de texto comuns do assistente não entram na lista de artifacts.
- O SDK consegue listar/adicionar/remover artifacts e consegue reconhecer `artifact_changed`.
- O mapeamento de resultado vazio idempotente do SDK remove para artifacts já inexistentes está correto.
- Há testes unitários para os limites de segurança de workspacePath / URL / metadata.
- Há testes unitários para normalização de managedId.
- Há testes unitários para first-writer-wins de mesma identidade, published upgrade, metadata controlled enrichment, soft reservation eviction.
- A eviction notifica o client para remover item por item.
- Falhas de validação geram warning log / diagnostics.
- As três entradas hook/client/record_artifact passam pela mesma validação.
- `npm run build && npm run typecheck` passa.

## 15. Ordem de implementação recomendada

Para a V1, a implementação interna é sugerida na seguinte ordem; este é um cronograma de engenharia, não uma divisão de recursos:

1. `ToolArtifact` + `ToolResult.artifacts?`
2. `ArtifactTool` structured artifacts
3. `ToolCallEmitter._meta.artifacts`
4. `Session.runTool()` coleta apenas `toolResult.artifacts`
5. `SessionArtifactStore` validation / normalize / enrichment / upsert
6. BridgeClient consome `_meta.artifacts`
7. `GET /session/:id/artifacts`
8. SDK list/event types
9. `RecordArtifactTool`
10. hook output artifacts
11. `qwen/notify/session/artifact-event`
12. `POST /session/:id/artifacts`
13. SDK addArtifact
14. Complementação de referências de managed / published storage
15. Documentação do protocolo e testes

## 16. Roadmap futuro

Phase 2: Recuperação de histórico

- Artifacts são escritos nos metadata de chat recording.
- HistoryReplayer faz replay dos artifacts.
- A lista de artifacts pode ser recuperada após `session/load`.

Phase 3: Detalhes e pré-visualização

- `GET /session/:id/artifacts/:artifactId`
- preview metadata.
- Estratégias de preview para imagem/PDF/HTML.

Phase 4: Preview dinâmico e seguro

- Origin de sandbox independente.
- iframe sandbox.
- HTML/React artifact shim.

Phase 5: Armazenamento de longo prazo

- OSS/MinIO.
- retention policy.
- pin/delete/version history.

## 17. Resumo

Links podem ser artifacts, mas devem ser registrados explicitamente. A área de artefatos à direita não deve coletar automaticamente todos os links de texto.

A V1 é um recurso completo externamente, composto internamente por um store unificado e quatro tipos de entradas:

1. **Entrada de ferramenta**: `ToolResult.artifacts` / `ArtifactTool` geram artifact metadata estruturado.
2. **Entrada de modelo/skill**: ferramenta `record_artifact`.
3. **Entrada de hook/extension**: `hookSpecificOutput.artifacts`.
4. **Entrada de client**: `POST /session/:id/artifacts`.

Todas essas entradas vão para o mesmo `SessionArtifactStore`, são consultadas através do mesmo `GET /session/:id/artifacts` e atualizam a UI através do mesmo evento SSE `artifact_changed`. Isso cobre negócios com links, arquivos, HTML, imagens, vídeos e outros artefatos, mantendo ao mesmo tempo o protocolo simples, a origem clara e os limites controláveis. O limite mais importante é: Artifacts são session outputs declarados, não um conjunto de todas as edições de arquivos comuns ou links comuns.
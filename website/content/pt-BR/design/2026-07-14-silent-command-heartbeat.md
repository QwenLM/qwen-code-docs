# Heartbeat de Comando Silencioso

Data: 2026-07-14
Status: implementado

## Problema

Um comando de shell em primeiro plano que não produz saída não emite nenhum evento entre o spawn e a estabilização. No uso interativo da TUI isso não é problema — o spinner continua girando — mas para consumidores headless (gateways ACP como o DataAgent, pipelines `--output-format stream-json`) a sessão fica completamente silenciosa durante toda a duração do comando. Um gateway observando o fluxo de eventos não consegue distinguir "uma sonda SQL de 165 segundos ainda está em execução" de "a cadeia de execução morreu", então comandos silenciosos de longa duração são reportados por usuários como o agente travado.

O diagnóstico de produção de tal sessão (sessão DataAgent `77255d98`, tarefa de 41 minutos, ~32 minutos gastos dentro de esperas de ferramenta) identificou o sinal de atividade ausente como uma das três correções de confiabilidade P0, junto com a semântica de timeout de shell (PR 1, mudança separada) e um stop-guard de todo (PR 3).

Implementação de referência: o Claude Code faz polling do arquivo de saída a cada segundo e invoca seu callback de progresso mesmo quando o conteúdo está vazio, e então expõe eventos `tool_progress` com throttling e payload mínimo para consumidores do SDK. O progresso nunca entra no contexto do modelo.

## Objetivos

- Enquanto um comando de shell em primeiro plano está silencioso, emitir periodicamente um sinal de atividade estruturado para consumidores que precisam dele (clientes ACP, stream-json).
- Carregar apenas estatísticas — tempo decorrido, idade da última saída, contagens de linha/byte, timeout efetivo. Nunca a saída do comando.
- Nunca entrar no contexto do modelo; nunca perturbar a exibição de saída ao vivo de consumidores interativos.

## Não objetivos

- Backgrounding automático por timeout (rastreado separadamente como um item P1).
- Streaming da saída ao vivo do comando para clientes ACP (frames `content`).
- Encaminhamento de `mcp_tool_progress` do MCP via ACP, propagação de heartbeats de subagente para `AgentResultDisplay` ou melhorias de exibição na TUI — todos acompanhamentos futuros.

## Design

### Formato do evento

`ShellProgressData` junta-se à união `ToolResultDisplay` em `packages/core/src/tools/tools.ts`, espelhando o precedente existente de `McpToolProgressData`, com um guard compartilhado exportado `isShellProgressData`:

```ts
interface ShellProgressData {
  type: 'shell_progress';
  elapsedMs: number; // monotônico, desde o spawn pós-inicialização do PTY
  lastOutputAgeMs?: number; // idade monotônica da última saída; ausente = nenhuma ainda
  totalLines?: number; // apenas caminho PTY/AnsiOutput
  totalBytes?: number; // apenas caminho PTY/AnsiOutput
  timeoutMs?: number; // timeout efetivo incluindo o padrão de 120s; ausente quando desabilitado
}
```

Durações são monotônicas (deltas de `performance.now()`) para que correções de NTP não possam distorcê-las; `lastOutputAgeMs` é uma idade em vez de um timestamp de época pelo mesmo motivo.

### Produtor

`ShellToolInvocation.execute()` inicia um `setInterval` depois que o handle de execução é obtido (para que o tempo de dynamic-import do PTY não possa produzir um heartbeat para um processo que não existe) e apenas quando um callback `updateOutput` está presente. Cada tick emite um heartbeat se e somente se nenhuma atualização de exibição disparou durante um intervalo completo — a verificação reutiliza o estado de throttle existente de `lastUpdateTime`, então comandos com saída fluindo nunca fazem heartbeat. O timer é limpo nos mesmos três lugares dos timers existentes de trailing-flush/aviso de timeout: o catch de lançamento do serviço, o `finally` do resultado e `onAbort` (após o abort, um sinal de "ainda em execução" durante a janela de kill-para-estabilização seria uma mentira).

O intervalo vem de `tools.shell.heartbeatIntervalMs` (settings → configuração da CLI → `ConfigParameters` do core → `getShellHeartbeatIntervalMs()`, a mesma cadeia que `defaultTimeoutMs`), com padrão de 10 000 ms; `0` desabilita.

### Consumidores

| Consumidor                             | Comportamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| liveOutputCallback do `CoreToolScheduler` | Encaminha heartbeats para `outputUpdateHandler`, mas pula a substituição do liveOutput e a notificação de atualização — um objeto de estatísticas não deve apagar a visão ao vivo acumulada.                                                                                                                                                                                                                                                                                                                                             |
| `useReactToolScheduler` (TUI)          | Ignora heartbeats; a TUI já mostra um spinner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `agent-core` (runtime de subagente)    | Ignora heartbeats; transmitir um sobrescreveria os `liveOutputs` da visão do subagente.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ACP `Session.runTool`                  | Passa um callback de atualização para `invocation.execute()`. Heartbeats tornam-se frames fire-and-forget, apenas-meta `tool_call_update { status: 'in_progress', _meta: { toolName, shellProgress } }`. Um gate `toolSettled` definido no momento em que `execute()` retorna (incluindo lançamento) descarta um tick que dispute com o caminho de estabilização, para que o cliente nunca possa observar `in_progress` depois de `completed`. A contagem de heartbeats e a idade da última saída são registradas como atributos de span `shell.heartbeat_count` / `shell.last_output_age_ms` no span existente de execução de ferramenta. |
| stream-json                            | `createToolProgressHandler` encaminha heartbeats através do pipeline existente `emitToolProgress` (eventos de stream `tool_progress`, com gate por `--include-partial-messages`). `ToolProgressStreamEvent.content` é ampliado para `McpToolProgressData \| ShellProgressData`.                                                                                                                                                                                                                                                             |
| `QwenAgent` do desktop                 | Pula updates de `status: in_progress` em `handleToolCallUpdate` — ele anteriormente convertia todo `tool_call_update` em um `tool_result` terminal, o que teria concluído prematuramente o comando com um resultado vazio no primeiro heartbeat.                                                                                                                                                                                                                                                                                          |
| `DaemonChannelBridge` de canais        | Descarta frames `in_progress` sem kind em vez de sinalizá-los como malformados (`tool_call_update` ali exige `kind`, que heartbeats apenas-meta não carregam).                                                                                                                                                                                                                                                                                                                                                                             |
| normalizer de UI do daemon do web-shell | Descarta frames de heartbeat — normalizar um sobrescreveria o título legível do bloco de ferramenta com o nome puro da ferramenta derivado de `_meta.toolName`.                                                                                                                                                                                                                                                                                                                                                                          |

O `ToolCallUpdate` do ACP define todos os campos, exceto o id, como opcionais e `_meta` como o ponto de extensibilidade, então clientes conformes ao protocolo ignoram os novos frames. Esse contrato não é autoaplicável, no entanto: uma varredura completa dos consumidores de `tool_call_update` no repositório encontrou três que tratavam mal os frames (agente desktop, bridge de canal do daemon, normalizer do web-shell — corrigidos acima, cada um com um teste de regressão), enquanto o restante (VS Code companion, compactação do acp-bridge, exportação de sessão, adapter de TUI do daemon) mescla condicionalmente e já é seguro para heartbeats. No caminho de requisição de permissão (que hoje não emite notificação de início), um heartbeat pode ser o primeiro update que um cliente vê para uma chamada de ferramenta — o mesmo contrato de sequenciamento dos updates existentes apenas-completed.

### Por que não ShellExecutionService

O serviço forneceria um `lastOutputAt` marginalmente mais preciso, mas a camada de ferramenta já observa todo evento de saída, e colocar o timer ali teria significado gerenciá-lo através dos ciclos de vida PTY/child_process/promote enquanto o PR 1 concorrentemente retrabalha a semântica pré-abort do mesmo arquivo. O shell `!` voltado ao usuário não precisa de heartbeats, então nada é perdido.

## Verificação

- Unitários: cadência/formato/limpeza do produtor (fake timers incluindo `performance`), encaminhamento do scheduler sem substituição de liveOutput, retenção do hook da TUI, frames apenas-meta do ACP + gate de heartbeat tardio, formato de evento do stream-json e gate de partial-messages.
- E2E stream-json: `sleep 15` produziu `tool_progress` com `{type:'shell_progress', elapsedMs:10001, timeoutMs:30000}` e nenhum campo de estatística de saída.
- E2E ACP (stdio JSON-RPC): `tool_call` → heartbeat `tool_call_update` (apenas-meta, 10 s) → `completed`, sem `in_progress` no final.
- TUI (tmux): comando silencioso mostra a linha normal de spinner/decorrido; sem vazamento de JSON durante a execução ou no transcript final.

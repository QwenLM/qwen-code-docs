# Rascunho do Adaptador TUI Daemon

> **Descontinuado**: este documento descreve o protótipo inicial do `DaemonTuiAdapter`. O adaptador legado ainda existe em `packages/cli/src/ui/daemon/`, mas a direção reutilizável agora é a camada de transcrição de UI compartilhada do SDK. Para a arquitetura atual, veja [`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md).

---

## Objetivo (histórico)

Adicionar um transporte TUI controlado por flag que se comunica com `qwen serve` através do `DaemonSessionClient` em vez de criar um `Config` + runtime de agente em processo.

Este é um caminho de validação interna para a migração do cliente Modo B. Ele não deve substituir o caminho TUI padrão até que sinks de saída, eventos tipados do daemon, permissões com escopo de sessão e diagnósticos de ciclo de vida estejam estáveis.

## Ponto de Entrada Proposto

```bash
QWEN_DAEMON_URL=http://127.0.0.1:4170 qwen --experimental-daemon-tui
```

Opcional:

```bash
QWEN_DAEMON_TOKEN=... QWEN_DAEMON_WORKSPACE=/repo qwen --experimental-daemon-tui
```

A CLI deve recusar este modo a menos que ambas as condições sejam verdadeiras:

- `QWEN_DAEMON_URL` ou `--daemon-url` esteja definido.
- `GET /capabilities` anuncie `session_create`, `session_prompt` e `session_events`.

## Fluxo Mínimo

1. Criar `DaemonClient` com URL e token do daemon.
2. Buscar `/capabilities`.
3. Criar ou anexar com `DaemonSessionClient.createOrAttach()`.
4. Assinar `session.events()`.
5. Enviar prompts do usuário através de `session.prompt()`.
6. Roteamento de cancelamento via `session.cancel()`.
7. Roteamento de troca de modelo via `session.setModel()`.
8. Roteamento de votos de permissão via `session.respondToPermission()`.

## Contrato de Renderização

A primeira implementação adiciona `DaemonTuiAdapter`, um reducer localmente verificável e protótipo de transporte. Ele mapeia apenas estes eventos do daemon:

| Evento do daemon                         | Tratamento na TUI                             |
| ---------------------------------------- | --------------------------------------------- |
| `session_update` / `agent_message_chunk` | Adicionar texto do assistente                 |
| `session_update` / `agent_thought_chunk` | Adicionar texto de pensamento                 |
| `session_update` / `tool_call`           | Mostrar ciclo de vida da chamada de ferramenta|
| `permission_request`                     | Mostrar UI de confirmação existente quando possível |
| `permission_resolved`                    | Fechar ou atualizar UI de confirmação         |
| `model_switched`                         | Atualizar exibição de rodapé/modelo           |
| `session_died`                           | Mostrar estado desconectado e parar streaming |

Eventos desconhecidos devem ser ignorados, não fatais. Reducers de eventos tipados chegarão em um PR de protocolo posterior.

O adaptador ainda não está conectado ao aplicativo Ink padrão. O comportamento existente da TUI interativa, JSONL, stream-json e saída dupla permanece inalterado.

## Não Objetivos Explícitos

- Não remover o runtime TUI atual em processo.
- Não alterar o comportamento JSONL, stream-json ou saída dupla neste PR.
- Não expor CRUD de arquivos, gerenciamento MCP, CRUD de memória ou mutação de provedor/auth através da TUI ainda.
- Não fazer suposições de navegador/web direto ao daemon; isso é apenas terminal.

## Segurança de Merge

- Desligado por padrão.
- Caminho de código aditivo.
- Nenhuma flag CLI existente altera o comportamento.
- Se o daemon estiver indisponível, o caminho experimental falha antes de iniciar a TUI e informa ao usuário para executar `qwen serve`.

## Plano de Validação

- Testar unitariamente o mapeamento de evento-para-estado-TUI com eventos sintéticos do daemon.
- Testar unitariamente o encaminhamento de prompt, cancelamento, troca de modelo e voto de permissão.
- Testar unitariamente a análise de flag/env quando a flag de funcionalidade estiver conectada.
- Teste de fumaça contra um `qwen serve` local:
  - o texto do prompt flui para a TUI
  - cancelar resolve o prompt ativo
  - a solicitação de permissão pode ser aceita ou rejeitada
  - reconectar envia o `Last-Event-ID` rastreado

## Bloqueadores Antes da Migração Padrão

- Esquema de eventos tipados do daemon.
- Rota de permissão com escopo de sessão.
- Refatoração de sink de saída para paridade JSONL / stream-json / saída dupla.
- Semântica de fechamento/exclusão de ciclo de vida da sessão.
- Diagnósticos de runtime para MCP, skills, provedores e ambiente de workspace.

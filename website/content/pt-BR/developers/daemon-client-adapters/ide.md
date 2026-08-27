# Rascunho do Adaptador do Daemon da IDE

## Objetivo

Permitir que a extensão complementar do VS Code teste internamente o Modo B conectando-se do host da extensão ao `qwen serve` através do `DaemonSessionClient`.

A webview não deve chamar o daemon diretamente. O host da extensão possui a URL do daemon, token, ID da sessão e estado de replay SSE, e então encaminha eventos de aplicativo sanitizados para a webview.

## Ponto de Entrada Proposto

Configurações do VS Code:

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

Fallback de ambiente para teste interno local:

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## Fluxo Mínimo

1. O host da extensão cria um `DaemonClient`.
2. Busca `/capabilities` e verifica a compatibilidade do workspace.
3. Cria ou anexa com `DaemonSessionClient.createOrAttach()`.
4. Assina `session.events()` no host da extensão.
5. Traduz eventos do daemon em mensagens existentes da webview.
6. Envia prompts do usuário através de `session.prompt()`.
7. Roteia cancelamento/troca de modelo através de `session.cancel()` e `session.setModel()`.
8. Roteia decisões de permissão através de `session.respondToPermission()`.

## Relação com a Conexão ACP Existente

A primeira implementação introduz um caminho de conexão irmão, não substitui `AcpConnection`:

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

Ambos os caminhos devem alimentar os mesmos callbacks de webview de alto nível sempre que possível. Se um evento ainda não puder ser mapeado fielmente, o caminho do daemon deve exibir um aviso claro de estado não suportado, em vez de fingir paridade silenciosamente.

Este PR adiciona `DaemonIdeConnection` como um spike de adaptador de host de extensão verificável localmente. Ele ainda não está conectado ao caminho padrão `QwenAgentManager`, então o comportamento existente do VS Code permanece baseado em subprocesso ACP.

## Contrato de Mapeamento de Eventos

| Evento do daemon                          | Tratamento na IDE                              |
| ----------------------------------------- | ---------------------------------------------- |
| `session_update` / `agent_message_chunk`  | Callback existente de stream do assistente     |
| `session_update` / `agent_thought_chunk`  | Callback existente de stream de pensamento     |
| `session_update` / `tool_call`            | Callback existente de atualização de tool call |
| `permission_request`                      | Callback existente de UI de aprovação          |
| `permission_resolved`                     | Fechar/atualizar UI de aprovação               |
| `model_switched`                          | Callback existente de estado do modelo, quando possível |
| `session_died`                            | UI de desconexão + mecanismo de reconexão      |

Eventos desconhecidos devem ser ignorados ou registrados como metadados de depuração.

## UX de Localidade em Tempo de Execução

A extensão deve tornar a localidade do daemon visível:

- workspace/arquivos são caminhos do host do daemon
- Servidores MCP são executados no host do daemon
- Skills são carregadas do sistema de arquivos do daemon
- Credenciais do provedor são resolvidas no ambiente do processo do daemon

Não implique que extensões locais do VS Code, perfil local do navegador, serviços locais de localhost ou credenciais SSH/kube locais estão automaticamente disponíveis para o daemon.

## Não Objetivos Explícitos

- Nenhuma migração padrão para longe do `AcpConnection`.
- Nenhum transporte direto webview-para-daemon.
- Nenhum CRUD de arquivos no lado do daemon através da IDE até que os limites do serviço de arquivos sejam definidos.
- Nenhum RPC reverso para editor/navegador/área de transferência ainda.
- Nenhuma integração completa de controle remoto.

## Segurança de Merge

- Desativado por padrão, atrás de configuração/env.
- Caminho de conexão irmão aditivo.
- Caminho de subprocesso ACP existente do VS Code inalterado.
- Token do daemon nunca cruza para o JavaScript da webview.

## Plano de Validação

- Testes unitários da fábrica de conexão de sessão do daemon e consumo de eventos SSE.
- Testes unitários do mapeamento de eventos do daemon para callbacks existentes do host da extensão.
- Testes unitários do encaminhamento de prompt, cancelamento, troca de modelo e resposta de permissão.
- Testes unitários da resolução de configurações/env quando a flag de funcionalidade estiver conectada.
- Teste de fumaça do host da extensão local contra `qwen serve`:
  - prompt flui para o chat
  - cancelamento funciona
  - UI de permissão pode resolver uma solicitação
  - Reconexão SSE usa `Last-Event-ID` rastreado

## Impedimentos Antes da Migração Padrão

- Esquema de eventos do daemon tipado.
- Identidade do cliente carimbada pelo daemon.
- Rota de permissão com escopo de sessão.
- Diagnósticos de tempo de execução somente leitura.
- Limite do FileSystemService e rotas seguras de leitura de arquivos.
- Refatoração do sink de saída para paridade CLI/TUI.
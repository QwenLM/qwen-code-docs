# Rascunho do Adaptador do Daemon IDE

## Objetivo

Permitir que a extensão companheira do VS Code teste Mode B conectando-se do host da extensão ao `qwen serve` através de `DaemonSessionClient`.

A webview não deve chamar o daemon diretamente. O host da extensão possui a URL do daemon, token, id de sessão e estado de replay SSE, e então encaminha eventos de aplicação sanitizados para a webview.

## Ponto de Entrada Proposto

Configurações do VS Code:

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

Fallback de ambiente para dogfood local:

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## Fluxo Mínimo

1. O host da extensão cria `DaemonClient`.
2. Buscar `/capabilities` e verificar compatibilidade do workspace.
3. Criar ou anexar com `DaemonSessionClient.createOrAttach()`.
4. Inscrever-se em `session.events()` no host da extensão.
5. Traduzir eventos do daemon em mensagens existentes da webview.
6. Enviar prompts de usuário através de `session.prompt()`.
7. Roteamento de cancelamento/alteração de modelo através de `session.cancel()` e `session.setModel()`.
8. Roteamento de decisões de permissão através de `session.respondToPermission()`.

## Relação com a Conexão ACP Existente

A primeira implementação introduz um caminho de conexão irmão, não substitui `AcpConnection`:

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

Ambos os caminhos devem alimentar os mesmos callbacks de alto nível da webview quando praticável. Se um evento ainda não puder ser mapeado fielmente, o caminho do daemon deve exibir um aviso claro de estado não suportado em vez de fingir paridade silenciosamente.

Este PR adiciona `DaemonIdeConnection` como um spike de adaptador do host da extensão verificável localmente. Ele ainda não está conectado ao caminho padrão do `QwenAgentManager`, então o comportamento existente do VS Code permanece baseado em subprocesso ACP.

## Contrato de Mapeamento de Eventos

| Evento do Daemon                             | Manipulação na IDE                                 |
| ---------------------------------------- | -------------------------------------------- |
| `session_update` / `agent_message_chunk` | Callback de stream de assistente existente           |
| `session_update` / `agent_thought_chunk` | Callback de stream de pensamento existente            |
| `session_update` / `tool_call`           | Callback de atualização de chamada de ferramenta existente           |
| `permission_request`                     | Callback de UI de aprovação existente                |
| `permission_resolved`                    | Fechar/atualizar UI de aprovação                     |
| `model_switched`                         | Callback de estado do modelo existente onde possível |
| `session_died`                           | UI de desconexão + affordance de reconexão         |

Eventos desconhecidos devem ser ignorados ou registrados como metadados de depuração.

## UX de Localidade em Tempo de Execução

A extensão deve tornar visível a localidade do daemon:

- workspace/arquivos são caminhos do host do daemon
- servidores MCP executam no host do daemon
- skills carregam do sistema de arquivos do daemon
- credenciais do provedor são resolvidas no ambiente do processo do daemon

Não implique que extensões locais do VS Code, perfil local do navegador, serviços locais do localhost ou credenciais SSH/kube locais estão automaticamente disponíveis para o daemon.

## Não-Objetivos Explícitos

- Nenhuma migração padrão para longe de `AcpConnection`.
- Nenhum transporte direto webview-para-daemon.
- Nenhum CRUD de arquivo pelo lado do daemon através da IDE até que os limites do serviço de arquivo estejam definidos.
- Nenhum RPC reverso para editor/navegador/área de transferência ainda.
- Nenhuma integração completa de controle remoto.

## Segurança de Merge

- Desligado por padrão atrás de configuração/env.
- Caminho de conexão irmão aditivo.
- Caminho existente de subprocesso ACP do VS Code inalterado.
- Token do daemon nunca cruza para o JavaScript da webview.

## Plano de Validação

- Teste unitário da conexão da fábrica de sessão do daemon e consumo de eventos SSE.
- Teste unitário do mapeamento de eventos do daemon para callbacks existentes do host da extensão.
- Teste unitário do encaminhamento de prompt, cancelamento, troca de modelo e resposta de permissão.
- Teste unitário da resolução de configurações/env quando a flag de recurso está conectada.
- Teste smoke do host da extensão local contra `qwen serve`:
  - prompt flui para o chat
  - cancelamento funciona
  - UI de permissão pode resolver uma solicitação
  - reconexão SSE usa `Last-Event-ID` rastreado

## Bloqueadores Antes da Migração Padrão

- Esquema de eventos tipado do daemon.
- Identidade do cliente carimbada pelo daemon.
- Rota de permissão com escopo de sessão.
- Diagnósticos de runtime somente leitura.
- Limite do FileSystemService e rotas seguras de leitura de arquivos.
- Refatoração do sink de saída para paridade CLI/TUI.

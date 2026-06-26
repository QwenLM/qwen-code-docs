# Rascunho do Adaptador do Daemon para Backend de Canal e Web

## Objetivo

Permitir que adaptadores de canal e backends de chat web consumam `qwen serve` por meio
do `DaemonSessionClient`, mantendo o comportamento existente do subprocesso ACP de canal como
padrão.

Este rascunho abrange apenas clientes do lado do servidor:

- Backend de bot de canal -> `qwen serve`
- Navegador web -> backend web / BFF -> `qwen serve`

Ele explicitamente não permite que JavaScript do navegador chame o daemon diretamente.
O daemon atualmente rejeita requisições de `Origin` do navegador por design.

## Pontos de Entrada Propostos

Backend de canal:

```bash
QWEN_CHANNEL_DAEMON_URL=http://127.0.0.1:4170 qwen channel start telegram
```

Backend web:

```bash
QWEN_WEB_DAEMON_URL=http://127.0.0.1:4170 qwen web-chat-backend
```

Variáveis opcionais compartilhadas:

```bash
QWEN_DAEMON_TOKEN=...
QWEN_DAEMON_WORKSPACE=/repo
```

## Fluxo Mínimo de Canal

Este PR adiciona `DaemonChannelBridge`, uma ponte do lado do servidor verificável localmente para
adaptadores de canal e backend web. Ela mantém a ponte ACP existente como padrão e gerencia o estado da sessão do daemon dentro do processo do backend.

1. Resolver remetente/thread do canal para uma chave de sessão do canal.
2. Usar `DaemonClient` + `DaemonSessionClient.createOrAttach()`.
3. Enviar texto do usuário com `session.prompt()`.
4. Assinar `session.events()` e coletar partes de texto do assistente.
5. Enviar o texto final de volta através do adaptador da plataforma.
6. Lançar votos de permissão através de `session.respondToPermission()`.
7. Cancelar trabalho ativo através de `session.cancel()`.

## Fluxo Mínimo de Backend Web

1. Navegador abre um websocket ou stream HTTP para o backend web.
2. O backend possui `DaemonSessionClient`.
3. O backend traduz mensagens do navegador para prompts do daemon.
4. O backend traduz eventos SSE do daemon para eventos seguros para o navegador.
5. O backend armazena o `sessionId` do daemon e o último id de evento visto no lado do servidor.

Clientes do navegador não devem receber tokens de portador do daemon.

## Restrição de Isolamento de Sessão

O comportamento atual do Estágio 1 do daemon é efetivamente `sessionScope: single` no nível de
configuração do daemon. Até que `sessionScope` por requisição chegue, implantações de canal
multiusuário ou web devem escolher uma destas formas seguras:

- um daemon por thread de canal / sala web
- um daemon por workspace de usuário
- apenas demonstração para um único usuário

Não multiplexar silenciosamente threads de canal não relacionadas em uma única sessão do daemon.

## Contrato de Mapeamento de Eventos

| Evento do daemon                        | Tratamento no backend de canal/web      |
| --------------------------------------- | --------------------------------------- |
| `session_update` / `agent_message_chunk` | Adicionar texto do assistente           |
| `session_update` / `agent_thought_chunk` | Stream opcional oculta/de depuração     |
| `session_update` / `tool_call`           | Emitir cartão/mensagem de status da ferramenta |
| `permission_request`                     | Interação de aprovação específica da plataforma |
| `permission_resolved`                    | Fechar/atualizar interação de aprovação  |
| `model_switched`                         | Atualizar metadados da sessão no backend |
| `session_died`                           | Notificar usuário e parar stream        |

Eventos desconhecidos do daemon devem ser ignorados ou encaminhados como metadados de depuração, não fatais.

A ponte não está integrada ao `qwen channel start` ainda. O comportamento existente dos canais
Telegram, Weixin, Dingtalk, plugin e navegador permanece inalterado.

## Não-Objetivos Explícitos

- Sem fetch ou EventSource direto do navegador para o daemon.
- Sem relaxamento de CORS neste PR do adaptador.
- Sem migração padrão dos canais Telegram, Weixin, Dingtalk ou plugin.
- Sem CRUD de arquivos, CRUD de memória, reinicialização de MCP ou mutação de provedor.
- Sem emulação de sessionScope no cliente quando o suporte do lado do daemon estiver ausente.

## Segurança de Merge

- Desligado por padrão.
- Ponte ACP de canal existente continua sendo o padrão.
- Backend web é uma camada BFF explícita, não uma mudança de segurança do daemon.
- Nenhum adaptador de canal deve importar tokens do daemon para o código do frontend/navegador.

## Plano de Validação

- Teste unitário do vínculo entre chave de sessão de canal e sessão do daemon.
- Teste unitário do mapeamento de eventos do daemon para mensagens de canal/web.
- Teste unitário do encaminhamento de prompt, cancelamento, troca de modelo e resposta de permissão.
- Teste funcional de um backend de canal para um único usuário contra `qwen serve` local.
- Teste funcional de navegador -> BFF -> daemon sem expor o token do daemon.

## Bloqueios Antes da Migração Padrão

- `sessionScope` por requisição.
- Metadados da sessão + ciclo de vida de fechamento/exclusão.
- Identidade do cliente carimbada pelo daemon.
- Rota de permissão com escopo de sessão.
- Diagnósticos somente leitura para MCP, skills, provedores e ambiente.

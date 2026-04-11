# Design de Channels

> Integrações de mensagens externas para o Qwen Code — interaja com um agente pelo Telegram, WeChat e outros.
>
> Documentação do usuário: [Visão geral dos Channels](../../users/features/channels/overview.md).

## Visão Geral

Um **channel** conecta uma plataforma de mensagens externa a um agente do Qwen Code. Configurado no `settings.json`, gerenciado por meio de subcomandos `qwen channel` e com suporte a múltiplos usuários (cada usuário recebe uma sessão ACP isolada).

## Arquitetura

```
┌──────────┐                        ┌─────────────────────────────────────┐
│ Telegram │    Platform API        │        Channel Service              │
│ User A   │◄──────────────────────►│                                     │
├──────────┤  (WebSocket/polling)   │  ┌───────────┐    ┌──────────────┐  │
│ WeChat   │◄──────────────────────►│  │ Platform   │    │  ACP Bridge  │  │
│ User B   │                        │  │ Adapter    │    │  (shared)    │  │
└──────────┘                        │  │            │    │              │  │
                                    │  │ - connect  │    │  - spawns    │  │
                                    │  │ - receive  │    │    qwen-code │  │
                                    │  │ - send     │    │  - manages   │  │
                                    │  │            │    │    sessions  │  │
                                    │  └─────┬──────┘    └──────┬───────┘  │
                                    │        │                  │          │
                                    │        ▼                  ▼          │
                                    │  ┌─────────────────────────────────┐ │
                                    │  │  SenderGate · GroupGate         │ │
                                    │  │  SessionRouter · ChannelBase    │ │
                                    │  └─────────────────────────────────┘ │
                                    └─────────────────────────────────────┘
                                                     │
                                                     │ stdio (ACP ndjson)
                                                     ▼
                                    ┌─────────────────────────────────────┐
                                    │        qwen-code --acp              │
                                    │   Session A (user alice, id: "abc") │
                                    │   Session B (user bob,   id: "def") │
                                    └─────────────────────────────────────┘
```

**Platform Adapter** — conecta-se à API externa e traduz mensagens de/para Envelopes. **ACP Bridge** — inicia o `qwen-code --acp`, gerencia sessões e emite os eventos `textChunk`/`toolCall`/`disconnected`. **Session Router** — mapeia remetentes para sessões ACP por meio de chaves com namespace (`<channel>:<sender>`). **Sender Gate** / **Group Gate** — controle de acesso (allowlist / pairing / open) e filtragem de menções. **Channel Base** — classe base abstrata com o padrão Template Method: os plugins sobrescrevem `connect`, `sendMessage` e `disconnect`. **Channel Registry** — `Map<string, ChannelPlugin>` com detecção de colisões.

### Envelope

Formato de mensagem normalizado para o qual todas as plataformas convertem:

- **Identidade**: `senderId`, `senderName`, `chatId`, `channelName`
- **Conteúdo**: `text`, `imageBase64`/`imageMimeType` (opcional), `referencedText` (opcional)
- **Contexto**: `isGroup`, `isMentioned`, `isReplyToBot`, `threadId` (opcional)

Responsabilidades do plugin: `senderId` deve ser estável/único; `chatId` deve diferenciar DMs de grupos; os flags booleanos devem ser precisos para a lógica de gate; @menções devem ser removidas do `text`.

### Fluxo de Mensagens

```
Inbound:  User message → Adapter → GroupGate → SenderGate → Slash commands → SessionRouter → AcpBridge → Agent
Outbound: Agent response → AcpBridge → SessionRouter → Adapter → User
```

Os slash commands (`/clear`, `/help`, `/status`) são processados no ChannelBase antes de chegar ao agente.

### Sessões

Um único processo `qwen-code --acp` com múltiplas sessões ACP. Escopo por channel: **`user`** (padrão), **`thread`** ou **`single`**. Chaves de roteamento com namespace no formato `<channelName>:<key>`.

### Tratamento de Erros

- **Falhas de conexão** — registradas em log; o serviço continua se pelo menos um channel conectar
- **Falhas no Bridge** — backoff exponencial (máx. 3 tentativas), `setBridge()` em todos os channels, restauração de sessão
- **Serialização de sessão** — cadeias de promises por sessão evitam colisões concorrentes de prompts

## Sistema de Plugins

A arquitetura é extensível — novos adaptadores (incluindo de terceiros) podem ser adicionados sem modificar o core. Os channels nativos usam a mesma interface de plugin (dogfooding).

### Contrato do Plugin

Um `ChannelPlugin` declara `channelType`, `displayName`, `requiredConfigFields` e uma factory `createChannel()`. Os plugins implementam três métodos:

| Método                      | Responsabilidade                                  |
| --------------------------- | ------------------------------------------------- |
| `connect()`                 | Conectar à plataforma e registrar handlers de mensagem |
| `sendMessage(chatId, text)` | Formatar e entregar a resposta do agente          |
| `disconnect()`              | Realizar limpeza no shutdown                      |

Em mensagens de entrada, os plugins constroem um `Envelope` e chamam `this.handleInbound(envelope)` — a classe base cuida do restante: controle de acesso, filtragem de grupos, pairing, roteamento de sessão, serialização de prompt, slash commands, injeção de instruções, contexto de resposta e recuperação de falhas.

### Pontos de Extensão

- Slash commands personalizados via `registerCommand()`
- Indicadores de atividade envolvendo `handleInbound()` com exibição de digitação/reação
- Hooks de tool call via `onToolCall()`
- Tratamento de mídia anexando ao Envelope antes de `handleInbound()`

### Descoberta e Carregamento

Plugins externos são **extensões** gerenciadas pelo `ExtensionManager`, declaradas no `qwen-extension.json`:

```json
{
  "name": "my-channel-extension",
  "version": "1.0.0",
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  }
}
```

Sequência de carregamento em `qwen channel start`: carregar configurações → registrar nativos → escanear extensões → importação dinâmica + validação → registrar (rejeitar colisões) → validar config → `createChannel()` → `connect()`.

Os plugins são executados in-process (sem sandbox), com o mesmo modelo de confiança das dependências npm.

## Configuração

```jsonc
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN", // referência a variável de ambiente
      "senderPolicy": "allowlist", // allowlist | pairing | open
      "allowedUsers": ["123456"],
      "sessionScope": "user", // user | thread | single
      "cwd": "/path/to/project",
      "model": "qwen3.5-plus",
      "instructions": "Keep responses short.",
      "groupPolicy": "disabled", // disabled | allowlist | open
      "groups": { "*": { "requireMention": true } },
    },
  },
}
```

A autenticação é específica do plugin: token estático (Telegram), credenciais de app (DingTalk), login por QR code (WeChat), token de proxy (TMCP).

## Comandos da CLI

```bash
# Channels
qwen channel start [name]                     # inicia todos ou um channel
qwen channel stop                             # para o serviço em execução
qwen channel status                           # exibe channels, sessões e tempo de atividade
qwen channel pairing list <ch>                # solicitações de pairing pendentes
qwen channel pairing approve <ch> <code>      # aprova uma solicitação

# Extensions
qwen extensions install <path-or-package>     # instala
qwen extensions link <local-path>             # symlink para desenvolvimento
qwen extensions list                          # exibe as instaladas
qwen extensions remove <name>                 # desinstala
```

## Estrutura do Pacote

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ACP process lifecycle, session management
│       ├── SessionRouter.ts # sender ↔ session mapping, persistence
│       ├── SenderGate.ts    # allowlist / pairing / open
│       ├── GroupGate.ts     # group chat policy + mention gating
│       ├── PairingStore.ts  # pairing code generation + approval
│       ├── ChannelBase.ts   # abstract base: routing, slash commands
│       └── types.ts         # Envelope, ChannelConfig, etc.
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## Trabalho Futuro

### Segurança e Chat em Grupo

- **Restrições de ferramentas por grupo** — listas de deny/allow `tools`/`toolsBySender` por grupo
- **Histórico de contexto do grupo** — ring buffer de mensagens recentes ignoradas, anexado no @mention
- **Padrões de menção via Regex** — fallback `mentionPatterns` para metadados de @mention não confiáveis
- **Instruções por grupo** — campo `instructions` no `GroupConfig` para personas por grupo
- **Comando `/activation`** — toggle em runtime para `requireMention`, persistido em disco

### Ferramentas Operacionais

- **`qwen channel doctor`** — validação de config, env vars, tokens de bot, verificações de rede
- **`qwen channel status --probe`** — verificações reais de conectividade por channel

### Expansão de Plataformas

- **Discord** — Bot API + Gateway, servidores/channels/DMs/threads
- **Slack** — Bolt SDK, Socket Mode, workspaces/channels/DMs/threads

### Multi-Agent

- **Roteamento multi-agent** — múltiplos agentes com bindings por channel/grupo/usuário
- **Grupos de broadcast** — múltiplos agentes respondem à mesma mensagem

### Ecossistema de Plugins

- **Template de plugin da comunidade** — ferramenta de scaffolding `create-qwen-channel`
- **Registro/descoberta de plugins** — `qwen extensions search`, compatibilidade de versões
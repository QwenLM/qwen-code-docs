# Design de Canais

> Integrações de mensageria externa para o Qwen Code — interaja com um agente a partir do Telegram, WeChat e outros.
>
> Documentação do usuário: [Visão Geral dos Canais](../../users/features/channels/overview.md).

## Visão Geral

Um **canal** conecta uma plataforma de mensagens externa a um agente do Qwen Code. Configurado em `settings.json`, gerenciado via subcomandos `qwen channel`, multi-usuário (cada usuário recebe uma sessão ACP isolada).

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

**Platform Adapter** — conecta-se à API externa, traduz mensagens para/desde Envelopes. **ACP Bridge** — inicia `qwen-code --acp`, gerencia sessões, emite eventos `textChunk`/`toolCall`/`disconnected`. **Session Router** — mapeia remetentes para sessões ACP via chaves com namespace (`<channel>:<sender>`). **Sender Gate** / **Group Gate** — controle de acesso (allowlist / pairing / open) e mention gating. **Channel Base** — base abstrata com padrão Template Method: plugins sobrescrevem `connect`, `sendMessage`, `disconnect`. **Channel Registry** — `Map<string, ChannelPlugin>` com detecção de colisões.

### Envelope

Formato de mensagem normalizada para o qual todas as plataformas convertem:

- **Identity**: `senderId`, `senderName`, `chatId`, `channelName`
- **Content**: `text`, opcional `imageBase64`/`imageMimeType`, opcional `referencedText`
- **Context**: `isGroup`, `isMentioned`, `isReplyToBot`, opcional `threadId`

Responsabilidades do plugin: `senderId` deve ser estável/único; `chatId` deve distinguir DMs de grupos; flags booleanas devem ser precisas para a lógica de gate; @menções removidas de `text`.

### Fluxo de Mensagens

```
Inbound:  User message → Adapter → GroupGate → SenderGate → Slash commands → SessionRouter → AcpBridge → Agent
Outbound: Agent response → AcpBridge → SessionRouter → Adapter → User
```

Comandos slash (`/clear`, `/help`, `/status`) são tratados no ChannelBase antes de chegar ao agente.

### Sessões

Um processo `qwen-code --acp` com múltiplas sessões ACP. Escopo por canal: **`user`** (padrão), **`thread`** ou **`single`**. Chaves de roteamento com namespace `<channelName>:<key>`.

### Tratamento de Erros

- **Falhas de conexão** — registradas; o serviço continua se pelo menos um canal conectar
- **Crashes da Bridge** — backoff exponencial (máx. 3 tentativas), `setBridge()` em todos os canais, restauração de sessão
- **Serialização de sessão** — cadeias de promessas por sessão evitam colisões concorrentes de prompt

## Sistema de Plugins

A arquitetura é extensível — novos adaptadores (incluindo de terceiros) podem ser adicionados sem modificar o core. Canais embutidos usam a mesma interface de plugin (dogfooding).

### Contrato do Plugin

Um `ChannelPlugin` declara `channelType`, `displayName`, `requiredConfigFields` e uma fábrica `createChannel()`. Plugins implementam três métodos:

| Método                      | Responsabilidade                                    |
| --------------------------- | --------------------------------------------------- |
| `connect()`                 | Conectar-se à plataforma e registrar handlers de mensagem |
| `sendMessage(chatId, text)` | Formatar e entregar a resposta do agente            |
| `disconnect()`              | Limpar recursos ao desligar                         |

Em mensagens recebidas, os plugins constroem um `Envelope` e chamam `this.handleInbound(envelope)` — a classe base cuida do resto: controle de acesso, group gating, pareamento, roteamento de sessão, serialização de prompt, comandos slash, injeção de instruções, contexto de resposta e recuperação de falhas.

### Pontos de Extensão

- Comandos slash personalizados via `registerCommand()`
- Indicadores de digitação encapsulando `handleInbound()` com exibição de typing/reaction
- Hooks de tool call via `onToolCall()`
- Manipulação de mídia anexando ao Envelope antes de `handleInbound()`

### Descoberta e Carregamento

Plugins externos são **extensões** gerenciadas pelo `ExtensionManager`, declaradas em `qwen-extension.json`:

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

Sequência de carregamento ao `qwen channel start`: carregar configurações → registrar embutidos → escanear extensões → import dinâmico + validar → registrar (rejeitar colisões) → validar config → `createChannel()` → `connect()`.

Plugins executam in-process (sem sandbox), mesmo modelo de confiança que dependências npm.

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
      "instructions": "Mantenha as respostas curtas.",
      "groupPolicy": "disabled", // disabled | allowlist | open
      "groups": { "*": { "requireMention": true } },
    },
  },
}
```

Autenticação é específica do plugin: token estático (Telegram), credenciais de app (DingTalk), login via QR code (WeChat), token proxy (TMCP).

## Comandos CLI

```bash
# Canais
qwen channel start [name]                     # inicia todos ou um canal específico
qwen channel stop                             # para o serviço em execução
qwen channel status                           # exibe canais, sessões, tempo de atividade
qwen channel pairing list <ch>                # solicitações de pareamento pendentes
qwen channel pairing approve <ch> <code>      # aprova uma solicitação

# Extensões
qwen extensions install <path-or-package>     # instala
qwen extensions link <local-path>             # link simbólico para desenvolvimento
qwen extensions list                          # exibe instaladas
qwen extensions remove <name>                 # desinstala
```

## Estrutura do Pacote

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ciclo de vida do processo ACP, gerenciamento de sessões
│       ├── SessionRouter.ts # mapeamento remetente ↔ sessão, persistência
│       ├── SenderGate.ts    # allowlist / pairing / open
│       ├── GroupGate.ts     # política de grupo + mention gating
│       ├── PairingStore.ts  # geração e aprovação de códigos de pareamento
│       ├── ChannelBase.ts   # base abstrata: roteamento, comandos slash
│       └── types.ts         # Envelope, ChannelConfig, etc.
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## Trabalhos Futuros

### Segurança e Grupos

- **Restrições de ferramentas por grupo** — listas de negação/permissão `tools`/`toolsBySender` por grupo
- **Histórico de contexto do grupo** — buffer circular de mensagens ignoradas recentes, prepended ao @mention
- **Padrões de menção via regex** — `mentionPatterns` de fallback para metadados de @mention não confiáveis
- **Instruções por grupo** — campo `instructions` no `GroupConfig` para personas por grupo
- **Comando `/activation`** — alternância em tempo de execução para `requireMention`, persistido em disco

### Ferramentas Operacionais

- **`qwen channel doctor`** — validação de configuração, variáveis de ambiente, tokens de bot, verificações de rede
- **`qwen channel status --probe`** — verificações reais de conectividade por canal

### Expansão de Plataformas

- **Discord** — Bot API + Gateway, servidores/canais/DMs/threads
- **Slack** — Bolt SDK, Socket Mode, workspaces/canais/DMs/threads

### Multi-Agente

- **Roteamento multi-agente** — múltiplos agentes com bindings por canal/grupo/usuário
- **Grupos de broadcast** — múltiplos agentes respondem à mesma mensagem

### Ecossistema de Plugins

- **Modelo de plugin comunitário** — ferramenta de scaffolding `create-qwen-channel`
- **Registro/descoberta de plugins** — `qwen extensions search`, compatibilidade de versões
# Guia do Desenvolvedor de Plugins de Canal

Um plugin de canal conecta o Qwen Code a uma plataforma de mensagens. Ele é empacotado como uma [extensão](../users/extension/introduction) e carregado na inicialização. Para a documentação voltada ao usuário sobre como instalar e configurar plugins, consulte [Plugins](../users/features/channels/plugins).

## Como Tudo se Encaixa

Seu plugin fica na camada do Adaptador de Plataforma. Você lida com questões específicas da plataforma (conexão, recebimento de mensagens, envio de respostas). O `ChannelBase` cuida de todo o resto (controle de acesso, roteamento de sessões, fila de prompts, comandos slash, recuperação de falhas).

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → ChannelAgentBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

`ChannelAgentBridge` é o contrato de bridge voltado para o adaptador. O caminho standalone atual do `qwen channel start` fornece um `AcpBridge`, mas o código do plugin deve tipar os parâmetros do construtor como `ChannelAgentBridge` para que o mesmo adaptador possa ser executado por trás de outras implementações de bridge no futuro.

Nota de migração para plugins TypeScript existentes: se o construtor ou a factory do seu adaptador tipa explicitamente `bridge` como `AcpBridge`, altere essa anotação para `ChannelAgentBridge` e continue usando apenas os métodos expostos por esse contrato. Plugins JavaScript não são afetados em tempo de execução, e o `qwen channel start` standalone ainda passa a implementação atual do `AcpBridge`.

## Modos de Runtime

O mesmo adaptador de plugin pode ser hospedado por qualquer um dos runtimes de canal:

- `qwen channel start [name]` é o serviço standalone com suporte a ACP. Ele ainda usa `AcpBridge` e continua sendo o comando estável para executar canais fora de um daemon.
- `qwen serve --channel <name>` e as flags `--channel` repetíveis iniciam um worker de canal experimental gerenciado por daemon. `--channel all` inicia todos os canais configurados. O worker é gerenciado pelo `qwen serve`, conecta-se a esse daemon através do SDK e passa aos adaptadores uma facade `ChannelAgentBridge` com suporte do `DaemonChannelBridge`.

Canais gerenciados por daemon herdam o ciclo de vida e o relatório de status do daemon. Eles são intencionalmente out-of-process para que falhas no adaptador ou no SDK da plataforma não derrubem o daemon. O daemon ainda está vinculado a um workspace, portanto, toda configuração de canal selecionada deve usar um `cwd` que resolva para o workspace do daemon.

## O Objeto Plugin

O ponto de entrada da sua extensão exporta um `plugin` em conformidade com `ChannelPlugin`:

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // Unique ID, used in settings.json "type" field
  displayName: 'My Platform', // Shown in CLI output
  requiredConfigFields: ['apiKey'], // Validated at startup (beyond standard ChannelConfig)
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## O Adaptador de Canal

Estenda `ChannelBase` e implemente três métodos:

```typescript
import { ChannelBase } from '@qwen-code/channel-base';
import type {
  ChannelBaseOptions,
  ChannelAgentBridge,
  ChannelConfig,
  Envelope,
} from '@qwen-code/channel-base';

export class MyChannel extends ChannelBase {
  constructor(
    name: string,
    config: ChannelConfig,
    bridge: ChannelAgentBridge,
    options?: ChannelBaseOptions,
  ) {
    super(name, config, bridge, options);
  }

  async connect(): Promise<void> {
    // Connect to your platform, register message handlers
    // When a message arrives:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // Stable, unique platform user ID
      senderName: '...', // Display name
      chatId: '...', // Chat/conversation ID (distinct for DMs vs groups)
      text: '...', // Message text (strip @mentions)
      isGroup: false, // Accurate — used by GroupGate
      isMentioned: false, // Accurate — used by GroupGate
      isReplyToBot: false, // Accurate — used by GroupGate
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Format markdown → platform format, chunk if needed, deliver
  }

  disconnect(): void {
    // Clean up connections
  }
}
```

A maioria dos adaptadores deve passar `options` sem alterações. Se um adaptador criar seu próprio `SessionRouter` e passar esse roteador para `super()`, defina `registerBridgeEvents: true` em `ChannelBaseOptions` para que o `ChannelBase` ainda receba os eventos `toolCall` e `sessionDied` diretamente. Deixe-o não definido para roteadores fornecidos pelo gateway de canal.

Se o seu adaptador expõe comportamento de comando shell, verifique se `bridge.shellCommand` existe antes de habilitá-lo. Workers gerenciados por daemon omitem esse método opcional, a menos que o daemon anuncie o capability `session_shell_command`.

## O Envelope

O objeto de mensagem normalizado que você constrói a partir dos dados da plataforma. As flags booleanas acionam a lógica de gate, portanto, devem ser precisas.

| Field            | Type         | Required | Notes                                                                      |
| ---------------- | ------------ | -------- | -------------------------------------------------------------------------- |
| `channelName`    | string       | Yes      | Use `this.name`                                                            |
| `senderId`       | string       | Yes      | Deve ser estável entre mensagens (usado para roteamento de sessão + controle de acesso) |
| `senderName`     | string       | Yes      | Nome de exibição                                                               |
| `chatId`         | string       | Yes      | Deve distinguir DMs de grupos                                           |
| `text`           | string       | Yes      | Remover @menções do bot                                                        |
| `threadId`       | string       | No       | Para `sessionScope: "thread"`                                               |
| `messageId`      | string       | No       | ID da mensagem da plataforma — útil para correlação de respostas                      |
| `isGroup`        | boolean      | Yes      | O GroupGate depende disso                                                   |
| `isMentioned`    | boolean      | Yes      | O GroupGate depende disso                                                   |
| `isReplyToBot`   | boolean      | Yes      | O GroupGate depende disso                                                   |
| `referencedText` | string       | No       | Mensagem citada — adicionada como contexto                                      |
| `imageBase64`    | string       | No       | Imagem codificada em Base64 (legado — prefira `attachments`)                       |
| `imageMimeType`  | string       | No       | ex.: `image/jpeg` (legado — prefira `attachments`)                         |
| `attachments`    | Attachment[] | No       | Anexos de mídia estruturados (veja abaixo)                                   |

### Anexos

Use o array `attachments` para imagens, arquivos, áudio e vídeo. O `handleInbound()` os resolve automaticamente: imagens com `data` em base64 são enviadas ao modelo como entrada de visão, arquivos com um `filePath` têm seu caminho anexado ao prompt para que o agente possa lê-los.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64-encoded data (images, small files)
  filePath?: string; // absolute path to local file (large files saved to disk)
  mimeType: string; // e.g. 'application/pdf', 'image/jpeg'
  fileName?: string; // original file name from the platform
}
```

Exemplo — manipulando o upload de um arquivo no seu adaptador:

```typescript
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const buf = await downloadFromPlatform(fileId);
const dir = join(tmpdir(), 'channel-files');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const filePath = join(dir, fileName);
writeFileSync(filePath, buf);

envelope.attachments = [
  {
    type: 'file',
    filePath,
    mimeType: 'application/pdf',
    fileName,
  },
];
```

Os campos legados `imageBase64`/`imageMimeType` ainda funcionam para compatibilidade com versões anteriores, mas `attachments` é o preferido para novos códigos.

## Manifesto da Extensão

Seu `qwen-extension.json` declara o tipo de canal. A chave deve corresponder ao `channelType` no seu objeto plugin:

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

## Pontos de Extensão Opcionais

**Comandos slash personalizados** — registre no seu construtor:

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // handled, don't forward to agent
});
```

**Indicadores de processamento** — sobrescreva `onPromptStart()` e `onPromptEnd()` para mostrar indicadores de digitação específicos da plataforma. Esses hooks são disparados apenas quando um prompt realmente começa a ser processado — não para mensagens em buffer (modo de coleta) ou mensagens bloqueadas/barradas:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Hooks de chamada de ferramenta** — sobrescreva `onToolCall()` para exibir a atividade do agente (ex.: "Executando comando shell...").

**Hooks de streaming** — sobrescreva `onResponseChunk(chatId, chunk, sessionId)` para exibição progressiva por chunk (ex.: editar uma mensagem no local). Sobrescreva `onResponseComplete(chatId, fullText, sessionId)` para personalizar a entrega final.

**Streaming em blocos** — defina `blockStreaming: "on"` na configuração do canal. A classe base divide automaticamente as respostas em várias mensagens nos limites dos parágrafos. Nenhum código de plugin é necessário — funciona junto com `onResponseChunk`.

**Mídia** — popule `envelope.attachments` com imagens/arquivos. Consulte [Anexos](#attachments) acima.

## Implementações de Referência

- **Exemplo de plugin** (`packages/channels/plugin-example/`) — adaptador mínimo baseado em WebSocket, bom ponto de partida
- **Telegram** (`packages/channels/telegram/`) — completo: imagens, arquivos, formatação, indicadores de digitação
- **DingTalk** (`packages/channels/dingtalk/`) — baseado em stream com tratamento de rich text
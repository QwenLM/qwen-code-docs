# Guia do Desenvolvedor de Plugin de Canal

Um plugin de canal conecta o Qwen Code a uma plataforma de mensagens. Ele é empacotado como uma [extensão](../users/extension/introduction) e carregado na inicialização. Para a documentação voltada ao usuário sobre instalação e configuração de plugins, consulte [Plugins](../users/features/channels/plugins).

## Como Tudo se Conecta

Seu plugin fica na camada de Adaptador de Plataforma. Você lida com questões específicas da plataforma (conexão, recebimento de mensagens, envio de respostas). O `ChannelBase` cuida de todo o resto (controle de acesso, roteamento de sessão, enfileiramento de prompts, comandos de barra e recuperação de falhas).

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → AcpBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

## O Objeto Plugin

O ponto de entrada da sua extensão exporta um `plugin` que segue a interface `ChannelPlugin`:

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
import type { Envelope } from '@qwen-code/channel-base';

export class MyChannel extends ChannelBase {
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

## O Envelope

O objeto de mensagem normalizado que você cria a partir dos dados da plataforma. Os flags booleanos controlam a lógica de gate, portanto, devem estar precisos.

| Campo            | Tipo         | Obrigatório | Observações                                                                      |
| ---------------- | ------------ | ----------- | -------------------------------------------------------------------------------- |
| `channelName`    | string       | Sim         | Use `this.name`                                                                  |
| `senderId`       | string       | Sim         | Deve ser estável entre mensagens (usado para roteamento de sessão + controle de acesso) |
| `senderName`     | string       | Sim         | Nome de exibição                                                                 |
| `chatId`         | string       | Sim         | Deve distinguir DMs de grupos                                                    |
| `text`           | string       | Sim         | Remova @menções ao bot                                                           |
| `threadId`       | string       | Não         | Para `sessionScope: "thread"`                                                    |
| `messageId`      | string       | Não         | ID da mensagem na plataforma — útil para correlação de respostas                 |
| `isGroup`        | boolean      | Sim         | O GroupGate depende deste campo                                                  |
| `isMentioned`    | boolean      | Sim         | O GroupGate depende deste campo                                                  |
| `isReplyToBot`   | boolean      | Sim         | O GroupGate depende deste campo                                                  |
| `referencedText` | string       | Não         | Mensagem citada — adicionada como contexto                                       |
| `imageBase64`    | string       | Não         | Imagem codificada em base64 (legado — prefira `attachments`)                     |
| `imageMimeType`  | string       | Não         | Ex.: `image/jpeg` (legado — prefira `attachments`)                               |
| `attachments`    | Attachment[] | Não         | Anexos de mídia estruturados (veja abaixo)                                       |

### Attachments

Use o array `attachments` para imagens, arquivos, áudio e vídeo. O `handleInbound()` os resolve automaticamente: imagens com `data` em base64 são enviadas ao modelo como entrada de visão; arquivos com `filePath` têm seu caminho anexado ao prompt para que o agente possa lê-los.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64-encoded data (images, small files)
  filePath?: string; // absolute path to local file (large files saved to disk)
  mimeType: string; // e.g. 'application/pdf', 'image/jpeg'
  fileName?: string; // original file name from the platform
}
```

Exemplo — processando o upload de um arquivo no seu adaptador:

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

Os campos legados `imageBase64`/`imageMimeType` ainda funcionam para compatibilidade com versões anteriores, mas `attachments` é o recomendado para novos códigos.

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

**Comandos de barra personalizados** — registre no seu construtor:

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // handled, don't forward to agent
});
```

**Indicadores de processamento** — sobrescreva `onPromptStart()` e `onPromptEnd()` para exibir indicadores de digitação específicos da plataforma. Esses hooks são acionados apenas quando um prompt realmente começa a ser processado — não para mensagens em buffer (modo collect) ou mensagens filtradas/bloqueadas:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Hooks de chamada de ferramenta** — sobrescreva `onToolCall()` para exibir a atividade do agente (ex.: "Executando comando shell...").

**Hooks de streaming** — sobrescreva `onResponseChunk(chatId, chunk, sessionId)` para exibição progressiva por chunk (ex.: editando uma mensagem no local). Sobrescreva `onResponseComplete(chatId, fullText, sessionId)` para personalizar a entrega final.

**Block streaming** — defina `blockStreaming: "on"` na configuração do canal. A classe base divide automaticamente as respostas em várias mensagens nos limites de parágrafo. Não é necessário código no plugin — funciona em conjunto com `onResponseChunk`.

**Mídia** — preencha `envelope.attachments` com imagens/arquivos. Consulte [Attachments](#attachments) acima.

## Implementações de Referência

- **Exemplo de plugin** (`packages/channels/plugin-example/`) — adaptador mínimo baseado em WebSocket, bom ponto de partida
- **Telegram** (`packages/channels/telegram/`) — completo: imagens, arquivos, formatação, indicadores de digitação
- **DingTalk** (`packages/channels/dingtalk/`) — baseado em stream com suporte a rich text
# Guia de Desenvolvimento de Plugins de Canal

Um plugin de canal conecta o Qwen Code a uma plataforma de mensagens. Ele é empacotado como uma [extensão](../users/extension/introduction) e carregado na inicialização. Para documentação voltada ao usuário sobre instalação e configuração de plugins, consulte [Plugins](../users/features/channels/plugins).

## Como Tudo se Conecta

Seu plugin fica na camada de Adaptador de Plataforma. Você lida com questões específicas da plataforma (conectar, receber mensagens, enviar respostas). O `ChannelBase` cuida de todo o resto (controle de acesso, roteamento de sessão, fila de prompts, comandos de barra, recuperação de falhas).

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → AcpBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

## O Objeto Plugin

O ponto de entrada da sua extensão exporta um `plugin` que segue `ChannelPlugin`:

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // ID único, usado no campo "type" do settings.json
  displayName: 'My Platform', // Exibido na saída do CLI
  requiredConfigFields: ['apiKey'], // Validado na inicialização (além do ChannelConfig padrão)
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
    // Conecte-se à sua plataforma, registre manipuladores de mensagens
    // Quando uma mensagem chegar:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // ID de usuário da plataforma, estável e único
      senderName: '...', // Nome de exibição
      chatId: '...', // ID do chat/conversa (distinto para DMs e grupos)
      text: '...', // Texto da mensagem (remova @menções ao bot)
      isGroup: false, // Preciso — usado pelo GroupGate
      isMentioned: false, // Preciso — usado pelo GroupGate
      isReplyToBot: false, // Preciso — usado pelo GroupGate
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Converta markdown → formato da plataforma, divida em partes se necessário, entregue
  }

  disconnect(): void {
    // Limpe as conexões
  }
}
```

## O Envelope

O objeto de mensagem normalizado que você constrói a partir dos dados da plataforma. Os campos booleanos orientam a lógica dos gates, portanto devem ser precisos.

| Campo            | Tipo         | Obrigatório | Notas                                                                    |
| ---------------- | ------------ | ----------- | ------------------------------------------------------------------------ |
| `channelName`    | string       | Yes         | Use `this.name`                                                          |
| `senderId`       | string       | Yes         | Deve ser estável entre mensagens (usado para roteamento de sessão + controle de acesso) |
| `senderName`     | string       | Yes         | Nome de exibição                                                         |
| `chatId`         | string       | Yes         | Deve distinguir DMs de grupos                                            |
| `text`           | string       | Yes         | Remova @menções ao bot                                                   |
| `threadId`       | string       | No          | Para `sessionScope: "thread"`                                            |
| `messageId`      | string       | No          | ID da mensagem na plataforma — útil para correlação de respostas         |
| `isGroup`        | boolean      | Yes         | GroupGate depende disso                                                   |
| `isMentioned`    | boolean      | Yes         | GroupGate depende disso                                                   |
| `isReplyToBot`   | boolean      | Yes         | GroupGate depende disso                                                   |
| `referencedText` | string       | No          | Mensagem citada — anexada como contexto                                  |
| `imageBase64`    | string       | No          | Imagem codificada em base64 (legado — prefira `attachments`)             |
| `imageMimeType`  | string       | No          | Ex.: `image/jpeg` (legado — prefira `attachments`)                       |
| `attachments`    | Attachment[] | No          | Anexos de mídia estruturados (veja abaixo)                               |

### Anexos

Use o array `attachments` para imagens, arquivos, áudio e vídeo. `handleInbound()` resolve‑os automaticamente: imagens com `data` em base64 são enviadas ao modelo como entrada visual, arquivos com `filePath` têm seu caminho anexado ao prompt para que o agente possa lê‑los.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // dados codificados em base64 (imagens, arquivos pequenos)
  filePath?: string; // caminho absoluto para o arquivo local (arquivos grandes salvos em disco)
  mimeType: string; // ex.: 'application/pdf', 'image/jpeg'
  fileName?: string; // nome original do arquivo vindo da plataforma
}
```

Exemplo — lidando com upload de arquivo no seu adaptador:

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

Os campos legados `imageBase64`/`imageMimeType` ainda funcionam para compatibilidade reversa, mas `attachments` é preferido para código novo.

## Manifesto da Extensão

Seu `qwen-extension.json` declara o tipo de canal. A chave deve coincidir com `channelType` no seu objeto plugin:

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
  return true; // tratado, não encaminhar ao agente
});
```

**Indicadores de digitação** — sobrescreva `onPromptStart()` e `onPromptEnd()` para exibir indicadores de digitação específicos da plataforma. Esses hooks são acionados apenas quando um prompt realmente começa a ser processado — não para mensagens em buffer (modo collect) ou mensagens bloqueadas/gateadas:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // sua API da plataforma
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Hooks de chamada de ferramenta** — sobrescreva `onToolCall()` para exibir atividade do agente (ex.: "Executando comando shell…").

**Hooks de streaming** — sobrescreva `onResponseChunk(chatId, chunk, sessionId)` para exibição progressiva por bloco (ex.: editando uma mensagem in‑place). Sobrescreva `onResponseComplete(chatId, fullText, sessionId)` para personalizar a entrega final.

**Bloquear streaming** — defina `blockStreaming: "on"` na configuração do canal. A classe base divide automaticamente as respostas em múltiplas mensagens nos limites de parágrafos. Nenhum código no plugin é necessário — funciona junto com `onResponseChunk`.

**Mídia** — preencha `envelope.attachments` com imagens/arquivos. Veja [Anexos](#anexos) acima.

## Implementações de Referência

- **Exemplo de plugin** (`packages/channels/plugin-example/`) — adaptador mínimo baseado em WebSocket, bom ponto de partida
- **Telegram** (`packages/channels/telegram/`) — completo: imagens, arquivos, formatação, indicadores de digitação
- **DingTalk** (`packages/channels/dingtalk/`) — baseado em streaming com manipulação de rich text
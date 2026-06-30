# Guia do Desenvolvedor de Plugins de Canal

Um plugin de canal conecta o Qwen Code a uma plataforma de mensagens. Ele é empacotado como uma [extensão](../users/extension/introduction) e carregado na inicialização. Para a documentação voltada ao usuário sobre como instalar e configurar plugins, consulte [Plugins](../users/features/channels/plugins).

## Como Tudo se Encaixa

Seu plugin fica na camada do Adaptador de Plataforma. Você lida com questões específicas da plataforma (conexão, recebimento de mensagens, envio de respostas). O `ChannelBase` cuida de todo o resto (controle de acesso, roteamento de sessões, fila de prompts, comandos de barra, recuperação de falhas).

```
Seu Plugin   →  constrói Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → ChannelAgentBridge.prompt()
ChannelBase  →  chama seu sendMessage() com a resposta do agente
```

`ChannelAgentBridge` é o contrato de bridge voltado para o adaptador. O caminho standalone atual do `qwen channel start` fornece um `AcpBridge`, mas o código do plugin deve tipar os parâmetros do construtor como `ChannelAgentBridge` para que o mesmo adaptador possa ser executado por trás de outras implementações de bridge no futuro.

Nota de migração para plugins TypeScript existentes: se o construtor ou factory do seu adaptador tipar explicitamente `bridge` como `AcpBridge`, altere essa anotação para `ChannelAgentBridge` e continue usando apenas os métodos expostos por esse contrato. Plugins JavaScript não são afetados em tempo de execução, e o `qwen channel start` standalone ainda passa a implementação atual do `AcpBridge`.

## O Objeto Plugin

O ponto de entrada da sua extensão exporta um `plugin` em conformidade com `ChannelPlugin`:

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // ID único, usado no campo "type" do settings.json
  displayName: 'My Platform', // Exibido na saída da CLI
  requiredConfigFields: ['apiKey'], // Validado na inicialização (além do ChannelConfig padrão)
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
    // Conecte-se à sua plataforma, registre manipuladores de mensagens
    // Quando uma mensagem chegar:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // ID de usuário da plataforma estável e único
      senderName: '...', // Nome de exibição
      chatId: '...', // ID do chat/conversa (distinto para DMs vs grupos)
      text: '...', // Texto da mensagem (remova @menções)
      isGroup: false, // Preciso — usado pelo GroupGate
      isMentioned: false, // Preciso — usado pelo GroupGate
      isReplyToBot: false, // Preciso — usado pelo GroupGate
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Formate markdown → formato da plataforma, divida em partes se necessário, entregue
  }

  disconnect(): void {
    // Limpe as conexões
  }
}
```

A maioria dos adaptadores deve passar `options` sem alterações. Se um adaptador criar seu próprio `SessionRouter` e passar esse roteador para `super()`, defina `registerBridgeEvents: true` em `ChannelBaseOptions` para que o `ChannelBase` ainda receba os eventos `toolCall` e `sessionDied` diretamente. Deixe-o não definido para roteadores fornecidos pelo gateway de canal.

## O Envelope

O objeto de mensagem normalizada que você constrói a partir dos dados da plataforma. Os sinalizadores booleanos orientam a lógica do gate, portanto, devem ser precisos.

| Campo            | Tipo         | Obrigatório | Observações                                                                      |
| ---------------- | ------------ | ----------- | -------------------------------------------------------------------------------- |
| `channelName`    | string       | Sim         | Use `this.name`                                                                  |
| `senderId`       | string       | Sim         | Deve ser estável entre mensagens (usado para roteamento de sessões + controle de acesso) |
| `senderName`     | string       | Sim         | Nome de exibição                                                                 |
| `chatId`         | string       | Sim         | Deve distinguir DMs de grupos                                                    |
| `text`           | string       | Sim         | Remova @menções do bot                                                           |
| `threadId`       | string       | Não         | Para `sessionScope: "thread"`                                                    |
| `messageId`      | string       | Não         | ID da mensagem da plataforma — útil para correlação de respostas                 |
| `isGroup`        | boolean      | Sim         | GroupGate depende disso                                                          |
| `isMentioned`    | boolean      | Sim         | GroupGate depende disso                                                          |
| `isReplyToBot`   | boolean      | Sim         | GroupGate depende disso                                                          |
| `referencedText` | string       | Não         | Mensagem citada — prefixada como contexto                                        |
| `imageBase64`    | string       | Não         | Imagem codificada em Base64 (legado — prefira `attachments`)                     |
| `imageMimeType`  | string       | Não         | ex.: `image/jpeg` (legado — prefira `attachments`)                               |
| `attachments`    | Attachment[] | Não         | Anexos de mídia estruturados (veja abaixo)                                       |

### Anexos

Use o array `attachments` para imagens, arquivos, áudio e vídeo. O `handleInbound()` os resolve automaticamente: imagens com `data` em base64 são enviadas ao modelo como entrada de visão, arquivos com um `filePath` têm seu caminho anexado ao prompt para que o agente possa lê-los.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // dados codificados em base64 (imagens, arquivos pequenos)
  filePath?: string; // caminho absoluto para arquivo local (arquivos grandes salvos em disco)
  mimeType: string; // ex.: 'application/pdf', 'image/jpeg'
  fileName?: string; // nome original do arquivo da plataforma
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

Os campos legados `imageBase64`/`imageMimeType` ainda funcionam para compatibilidade com versões anteriores, mas `attachments` é preferível para código novo.

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
  return true; // tratado, não encaminhe para o agente
});
```

**Indicadores de trabalho** — sobrescreva `onPromptStart()` e `onPromptEnd()` para mostrar indicadores de digitação específicos da plataforma. Esses hooks são disparados apenas quando um prompt realmente começa a ser processado — não para mensagens em buffer (modo de coleta) ou mensagens bloqueadas/barradas:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // sua API da plataforma
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Hooks de chamada de ferramenta** — sobrescreva `onToolCall()` para exibir a atividade do agente (ex.: "Executando comando shell...").

**Hooks de streaming** — sobrescreva `onResponseChunk(chatId, chunk, sessionId)` para exibição progressiva por chunk (ex.: editar uma mensagem no lugar). Sobrescreva `onResponseComplete(chatId, fullText, sessionId)` para personalizar a entrega final.

**Streaming em blocos** — defina `blockStreaming: "on"` na configuração do canal. A classe base divide automaticamente as respostas em várias mensagens nos limites dos parágrafos. Não é necessário código de plugin — funciona junto com `onResponseChunk`.

**Mídia** — preencha `envelope.attachments` com imagens/arquivos. Consulte [Anexos](#attachments) acima.

## Implementações de Referência

- **Exemplo de plugin** (`packages/channels/plugin-example/`) — adaptador mínimo baseado em WebSocket, bom ponto de partida
- **Telegram** (`packages/channels/telegram/`) — completo: imagens, arquivos, formatação, indicadores de digitação
- **DingTalk** (`packages/channels/dingtalk/`) — baseado em stream com tratamento de rich text
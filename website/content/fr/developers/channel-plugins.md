# Guide du développeur de plugins de canal

Un plugin de canal connecte Qwen Code à une plateforme de messagerie. Il est empaqueté sous forme d'[extension](../users/extension/introduction) et chargé au démarrage. Pour la documentation destinée aux utilisateurs sur l'installation et la configuration des plugins, consultez [Plugins](../users/features/channels/plugins).

## Comment cela s'articule

Votre plugin se situe dans la couche Platform Adapter. Vous gérez les aspects spécifiques à la plateforme (connexion, réception des messages, envoi des réponses). `ChannelBase` gère tout le reste (contrôle d'accès, routage des sessions, mise en file d'attente des prompts, commandes slash, récupération après crash).

```
Votre Plugin  →  construit Envelope  →  handleInbound()
ChannelBase   →  gates → commandes → routage → AcpBridge.prompt()
ChannelBase   →  appelle votre sendMessage() avec la réponse de l'agent
```

## L'objet Plugin

Le point d'entrée de votre extension exporte un `plugin` conforme à `ChannelPlugin` :

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

## L'adaptateur de canal

Étendez `ChannelBase` et implémentez trois méthodes :

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

## L'objet Envelope

L'objet message normalisé que vous construisez à partir des données de la plateforme. Les indicateurs booléens pilotent la logique des gates, ils doivent donc être exacts.

| Champ            | Type         | Requis | Notes                                                                      |
| ---------------- | ------------ | ------ | -------------------------------------------------------------------------- |
| `channelName`    | string       | Oui    | Utilisez `this.name`                                                       |
| `senderId`       | string       | Oui    | Doit rester stable entre les messages (utilisé pour le routage des sessions + le contrôle d'accès) |
| `senderName`     | string       | Oui    | Nom d'affichage                                                            |
| `chatId`         | string       | Oui    | Doit distinguer les messages privés des groupes                            |
| `text`           | string       | Oui    | Supprimez les @mentions du bot                                             |
| `threadId`       | string       | Non    | Pour `sessionScope: "thread"`                                              |
| `messageId`      | string       | Non    | ID du message sur la plateforme — utile pour la corrélation des réponses   |
| `isGroup`        | boolean      | Oui    | GroupGate s'appuie sur cette valeur                                        |
| `isMentioned`    | boolean      | Oui    | GroupGate s'appuie sur cette valeur                                        |
| `isReplyToBot`   | boolean      | Oui    | GroupGate s'appuie sur cette valeur                                        |
| `referencedText` | string       | Non    | Message cité — ajouté en préfixe comme contexte                            |
| `imageBase64`    | string       | Non    | Image encodée en Base64 (hérité — préférez `attachments`)                  |
| `imageMimeType`  | string       | Non    | ex. `image/jpeg` (hérité — préférez `attachments`)                         |
| `attachments`    | Attachment[] | Non    | Pièces jointes multimédias structurées (voir ci-dessous)                   |

### Attachments

Utilisez le tableau `attachments` pour les images, fichiers, audio et vidéo. `handleInbound()` les résout automatiquement : les images avec des `data` en base64 sont envoyées au modèle en tant qu'entrée visuelle, et les fichiers avec un `filePath` voient leur chemin ajouté au prompt pour que l'agent puisse les lire.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64-encoded data (images, small files)
  filePath?: string; // absolute path to local file (large files saved to disk)
  mimeType: string; // e.g. 'application/pdf', 'image/jpeg'
  fileName?: string; // original file name from the platform
}
```

Exemple — gestion d'un téléchargement de fichier dans votre adaptateur :

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

Les champs hérités `imageBase64`/`imageMimeType` fonctionnent toujours pour la rétrocompatibilité, mais `attachments` est recommandé pour le nouveau code.

## Manifeste de l'extension

Votre fichier `qwen-extension.json` déclare le type de canal. La clé doit correspondre à `channelType` dans votre objet plugin :

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

## Points d'extension optionnels

**Commandes slash personnalisées** — enregistrez-les dans votre constructeur :

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // handled, don't forward to agent
});
```

**Indicateurs d'activité** — redéfinissez `onPromptStart()` et `onPromptEnd()` pour afficher les indicateurs de frappe spécifiques à la plateforme. Ces hooks ne se déclenchent que lorsqu'un prompt commence réellement à être traité — pas pour les messages mis en mémoire tampon (mode collect) ou les messages filtrés/bloqués :

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Hooks d'appel d'outils** — redéfinissez `onToolCall()` pour afficher l'activité de l'agent (ex. « Exécution de la commande shell... »).

**Hooks de streaming** — redéfinissez `onResponseChunk(chatId, chunk, sessionId)` pour un affichage progressif par chunk (ex. modification d'un message sur place). Redéfinissez `onResponseComplete(chatId, fullText, sessionId)` pour personnaliser la livraison finale.

**Streaming par blocs** — définissez `blockStreaming: "on"` dans la configuration du canal. La classe de base divise automatiquement les réponses en plusieurs messages aux limites des paragraphes. Aucun code plugin n'est nécessaire — cela fonctionne conjointement avec `onResponseChunk`.

**Médias** — renseignez `envelope.attachments` avec des images/fichiers. Voir [Attachments](#attachments) ci-dessus.

## Implémentations de référence

- **Exemple de plugin** (`packages/channels/plugin-example/`) — adaptateur minimal basé sur WebSocket, bon point de départ
- **Telegram** (`packages/channels/telegram/`) — complet : images, fichiers, formatage, indicateurs de frappe
- **DingTalk** (`packages/channels/dingtalk/`) — basé sur le streaming avec gestion du texte enrichi
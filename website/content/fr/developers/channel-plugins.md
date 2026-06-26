# Guide du développeur de plugin de canal

Un plugin de canal connecte Qwen Code à une plateforme de messagerie. Il est empaqueté en tant qu'[extension](../users/extension/introduction) et chargé au démarrage. Pour la documentation destinée aux utilisateurs sur l'installation et la configuration des plugins, consultez [Plugins](../users/features/channels/plugins).

## Comment tout s'articule

Votre plugin se situe dans la couche d'adaptateur de plateforme. Vous gérez les aspects spécifiques à la plateforme (connexion, réception de messages, envoi de réponses). `ChannelBase` gère tout le reste (contrôle d'accès, routage des sessions, file d'attente des prompts, commandes slash, reprise après incident).

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
  channelType: 'my-platform', // Identifiant unique, utilisé dans le champ "type" de settings.json
  displayName: 'My Platform', // Affiché dans la sortie CLI
  requiredConfigFields: ['apiKey'], // Validé au démarrage (au-delà de ChannelConfig standard)
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
    // Connectez-vous à votre plateforme, enregistrez les gestionnaires de messages
    // Quand un message arrive :
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // Identifiant de l'utilisateur stable et unique sur la plateforme
      senderName: '...', // Nom d'affichage
      chatId: '...', // Identifiant du chat/de la conversation (distinct pour les DM vs les groupes)
      text: '...', // Texte du message (supprimez les @mentions)
      isGroup: false, // Précis — utilisé par GroupGate
      isMentioned: false, // Précis — utilisé par GroupGate
      isReplyToBot: false, // Précis — utilisé par GroupGate
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Formatez le markdown → format de la plateforme, découpez si nécessaire, livrez
  }

  disconnect(): void {
    // Nettoyez les connexions
  }
}
```

## L'Envelope

L'objet message normalisé que vous construisez à partir des données de la plateforme. Les indicateurs booléens pilotent la logique des gates, ils doivent donc être précis.

| Champ            | Type         | Requis | Notes                                                                      |
| ---------------- | ------------ | ------ | -------------------------------------------------------------------------- |
| `channelName`    | string       | Oui    | Utilisez `this.name`                                                       |
| `senderId`       | string       | Oui    | Doit être stable d'un message à l'autre (utilisé pour le routage de session + contrôle d'accès) |
| `senderName`     | string       | Oui    | Nom d'affichage                                                            |
| `chatId`         | string       | Oui    | Doit distinguer les DM des groupes                                         |
| `text`           | string       | Oui    | Supprimez les @mentions du bot                                             |
| `threadId`       | string       | Non    | Pour `sessionScope: "thread"`                                              |
| `messageId`      | string       | Non    | Identifiant du message sur la plateforme — utile pour la corrélation des réponses |
| `isGroup`        | boolean      | Oui    | GroupGate repose sur ce champ                                              |
| `isMentioned`    | boolean      | Oui    | GroupGate repose sur ce champ                                              |
| `isReplyToBot`   | boolean      | Oui    | GroupGate repose sur ce champ                                              |
| `referencedText` | string       | Non    | Message cité — ajouté en guise de contexte                                 |
| `imageBase64`    | string       | Non    | Image encodée en base64 (héritage — préférez `attachments`)                |
| `imageMimeType`  | string       | Non    | p. ex. `image/jpeg` (héritage — préférez `attachments`)                    |
| `attachments`    | Attachment[] | Non    | Fichiers joints structurés (voir ci-dessous)                               |

### Pièces jointes

Utilisez le tableau `attachments` pour les images, fichiers, audio et vidéo. `handleInbound()` les résout automatiquement : les images avec `data` en base64 sont envoyées au modèle en entrée visuelle, les fichiers avec un `filePath` voient leur chemin ajouté au prompt pour que l'agent puisse les lire.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // Données encodées en base64 (images, petits fichiers)
  filePath?: string; // Chemin absolu vers un fichier local (fichiers volumineux sauvegardés sur disque)
  mimeType: string; // p. ex. 'application/pdf', 'image/jpeg'
  fileName?: string; // Nom de fichier d'origine depuis la plateforme
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

Les champs hérités `imageBase64`/`imageMimeType` fonctionnent toujours pour la rétrocompatibilité, mais `attachments` est préféré pour le nouveau code.

## Manifeste de l'extension

Votre `qwen-extension.json` déclare le type de canal. La clé doit correspondre à `channelType` dans votre objet plugin :

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
  await this.sendMessage(envelope.chatId, 'Réponse');
  return true; // traitée, ne pas transmettre à l'agent
});
```

**Indicateurs de frappe** — remplacez `onPromptStart()` et `onPromptEnd()` pour afficher des indicateurs de frappe spécifiques à la plateforme. Ces hooks ne se déclenchent que lorsqu'un prompt commence effectivement à être traité — pas pour les messages mis en mémoire tampon (mode collecte) ni pour les messages bloqués par les gates :

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // votre API plateforme
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Hooks d'appels d'outils** — remplacez `onToolCall()` pour afficher l'activité de l'agent (p. ex. « Exécution de la commande shell... »).

**Hooks de streaming** — remplacez `onResponseChunk(chatId, chunk, sessionId)` pour l'affichage progressif par morceau (p. ex. modification d'un message en place). Remplacez `onResponseComplete(chatId, fullText, sessionId)` pour personnaliser la livraison finale.

**Bloc du streaming** — définissez `blockStreaming: "on"` dans la configuration du canal. La classe de base divise automatiquement les réponses en plusieurs messages aux limites des paragraphes. Aucun code de plugin nécessaire — cela fonctionne en parallèle de `onResponseChunk`.

**Médias** — remplissez `envelope.attachments` avec des images/fichiers. Voir [Pièces jointes](#pièces-jointes) ci-dessus.

## Implémentations de référence

- **Exemple de plugin** (`packages/channels/plugin-example/`) — adaptateur WebSocket minimal, bon point de départ
- **Telegram** (`packages/channels/telegram/`) — complet : images, fichiers, formatage, indicateurs de frappe
- **DingTalk** (`packages/channels/dingtalk/`) — basé sur le streaming avec gestion du texte enrichi
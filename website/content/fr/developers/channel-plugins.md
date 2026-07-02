# Guide de développement des plugins de canal

Un plugin de canal connecte Qwen Code à une plateforme de messagerie. Il est empaqueté sous forme d'[extension](../users/extension/introduction) et chargé au démarrage. Pour la documentation utilisateur sur l'installation et la configuration des plugins, consultez [Plugins](../users/features/channels/plugins).

## Fonctionnement d'ensemble

Votre plugin se situe dans la couche Platform Adapter. Vous gérez les spécificités de la plateforme (connexion, réception des messages, envoi des réponses). `ChannelBase` s'occupe de tout le reste (contrôle d'accès, routage des sessions, mise en file d'attente des prompts, commandes slash, récupération après crash).

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → ChannelAgentBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

`ChannelAgentBridge` est le contrat de bridge destiné à l'adaptateur. Le chemin autonome actuel `qwen channel start` fournit un `AcpBridge`, mais le code du plugin doit typer les paramètres du constructeur en tant que `ChannelAgentBridge` afin que le même adaptateur puisse s'exécuter derrière d'autres implémentations de bridge à l'avenir.

Note de migration pour les plugins TypeScript existants : si le constructeur ou la fabrique de votre adaptateur type explicitement `bridge` en tant que `AcpBridge`, modifiez cette annotation en `ChannelAgentBridge` et continuez à utiliser uniquement les méthodes exposées par ce contrat. Les plugins JavaScript ne sont pas affectés à l'exécution, et la commande autonome `qwen channel start` transmet toujours l'implémentation actuelle de `AcpBridge`.

## Modes d'exécution

Le même adaptateur de plugin peut être hébergé par l'un ou l'autre des runtimes de canal :

- `qwen channel start [name]` est le service autonome basé sur ACP. Il utilise toujours `AcpBridge` et reste la commande stable pour exécuter des canaux en dehors d'un daemon.
- Les drapeaux `qwen serve --channel <name>` et `--channel` répétables démarrent un worker de canal expérimental géré par un daemon. `--channel all` démarre tous les canaux configurés. Le worker est possédé par `qwen serve`, se connecte à ce daemon via le SDK, et transmet aux adaptateurs une façade `ChannelAgentBridge` supportée par `DaemonChannelBridge`.

Les canaux gérés par un daemon héritent du cycle de vie et du rapport de statut du daemon. Ils sont intentionnellement exécutés dans un processus séparé (out-of-process) afin que les défaillances de l'adaptateur ou du SDK de la plateforme ne fassent pas planter le daemon. Le daemon reste lié à un seul workspace, donc chaque configuration de canal sélectionnée doit utiliser un `cwd` qui résout vers le workspace du daemon.

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
    // Connectez-vous à votre plateforme, enregistrez les gestionnaires de messages
    // Lorsqu'un message arrive :
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // ID utilisateur de plateforme stable et unique
      senderName: '...', // Nom d'affichage
      chatId: '...', // ID de chat/conversation (distinct pour les MP vs les groupes)
      text: '...', // Texte du message (supprimer les @mentions)
      isGroup: false, // Précis — utilisé par GroupGate
      isMentioned: false, // Précis — utilisé par GroupGate
      isReplyToBot: false, // Précis — utilisé par GroupGate
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Formatez le markdown → format de la plateforme, découpez si nécessaire, délivrez
  }

  disconnect(): void {
    // Nettoyez les connexions
  }
}
```

La plupart des adaptateurs doivent transmettre les `options` sans les modifier. Si un adaptateur crée son propre `SessionRouter` et passe ce routeur à `super()`, définissez `registerBridgeEvents: true` dans `ChannelBaseOptions` afin que `ChannelBase` reçoive toujours directement les événements `toolCall` et `sessionDied`. Laissez cette option non définie pour les routeurs fournis par la passerelle de canal.

Si votre adaptateur expose un comportement de commande shell, vérifiez que `bridge.shellCommand` existe avant de l'activer. Les workers gérés par un daemon omettent cette méthode optionnelle sauf si le daemon annonce la capacité `session_shell_command`.

## L'Envelope

L'objet de message normalisé que vous construisez à partir des données de la plateforme. Les drapeaux booléens pilotent la logique de gate, ils doivent donc être précis.

| Field            | Type         | Required | Notes                                                                      |
| ---------------- | ------------ | -------- | -------------------------------------------------------------------------- |
| `channelName`    | string       | Yes      | Utilisez `this.name`                                                       |
| `senderId`       | string       | Yes      | Doit être stable d'un message à l'autre (utilisé pour le routage des sessions + le contrôle d'accès) |
| `senderName`     | string       | Yes      | Nom d'affichage                                                            |
| `chatId`         | string       | Yes      | Doit distinguer les MP des groupes                                         |
| `text`           | string       | Yes      | Supprimer les @mentions du bot                                             |
| `threadId`       | string       | No       | Pour `sessionScope: "thread"`                                              |
| `messageId`      | string       | No       | ID de message de la plateforme — utile pour la corrélation des réponses    |
| `isGroup`        | boolean      | Yes      | GroupGate s'appuie dessus                                                  |
| `isMentioned`    | boolean      | Yes      | GroupGate s'appuie dessus                                                  |
| `isReplyToBot`   | boolean      | Yes      | GroupGate s'appuie dessus                                                  |
| `referencedText` | string       | No       | Message cité — ajouté en préfixe comme contexte                            |
| `imageBase64`    | string       | No       | Image encodée en base64 (obsolète — préférez `attachments`)                |
| `imageMimeType`  | string       | No       | par ex., `image/jpeg` (obsolète — préférez `attachments`)                  |
| `attachments`    | Attachment[] | No       | Pièces jointes média structurées (voir ci-dessous)                         |

### Pièces jointes

Utilisez le tableau `attachments` pour les images, les fichiers, l'audio et la vidéo. `handleInbound()` les résout automatiquement : les images avec des `data` en base64 sont envoyées au modèle en tant qu'entrée visuelle, les fichiers avec un `filePath` voient leur chemin ajouté au prompt afin que l'agent puisse les lire.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // données encodées en base64 (images, petits fichiers)
  filePath?: string; // chemin absolu vers le fichier local (gros fichiers enregistrés sur le disque)
  mimeType: string; // par ex. 'application/pdf', 'image/jpeg'
  fileName?: string; // nom de fichier original de la plateforme
}
```

Exemple — gestion du téléchargement d'un fichier dans votre adaptateur :

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

Les champs obsolètes `imageBase64`/`imageMimeType` fonctionnent toujours pour la rétrocompatibilité, mais `attachments` est préféré pour le nouveau code.

## Manifeste de l'extension

Votre `qwen-extension.json` déclare le type de canal. La clé doit correspondre au `channelType` dans votre objet plugin :

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

**Indicateurs de traitement** — surchargez `onPromptStart()` et `onPromptEnd()` pour afficher des indicateurs de frappe spécifiques à la plateforme. Ces hooks ne se déclenchent que lorsqu'un prompt commence réellement à être traité — pas pour les messages en mémoire tampon (mode collect) ou les messages filtrés/bloqués :

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Hooks d'appel d'outil** — surchargez `onToolCall()` pour afficher l'activité de l'agent (par ex., "Exécution de la commande shell...").

**Hooks de streaming** — surchargez `onResponseChunk(chatId, chunk, sessionId)` pour un affichage progressif par chunk (par ex., modification d'un message sur place). Surchargez `onResponseComplete(chatId, fullText, sessionId)` pour personnaliser la livraison finale.

**Streaming par blocs** — définissez `blockStreaming: "on"` dans la configuration du canal. La classe de base divise automatiquement les réponses en plusieurs messages aux limites des paragraphes. Aucun code de plugin n'est nécessaire — cela fonctionne en parallèle de `onResponseChunk`.

**Médias** — remplissez `envelope.attachments` avec des images/fichiers. Voir [Pièces jointes](#attachments) ci-dessus.

## Implémentations de référence

- **Exemple de plugin** (`packages/channels/plugin-example/`) — adaptateur minimal basé sur WebSocket, bon point de départ
- **Telegram** (`packages/channels/telegram/`) — complet : images, fichiers, formatage, indicateurs de frappe
- **DingTalk** (`packages/channels/dingtalk/`) — basé sur le streaming avec gestion du texte enrichi
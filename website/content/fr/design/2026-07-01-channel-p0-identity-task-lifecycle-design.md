# Conception de l'identité P0 des canaux et du cycle de vie des tâches

## Objectif

Implémenter les premières fondations P0 pour les agents multijoueurs résidents dans les canaux : une identité limitée au canal et des métadonnées de limite de mémoire, ainsi qu'un hook de cycle de vie de tâche partagé dans `@qwen-code/channel-base`.

Cela n'ajoute intentionnellement pas d'adaptateur Slack, de flux d'événements du daemon, de modifications de l'UI de l'adaptateur, de planification proactive, de contexte inter-canaux, ni d'isolation réelle des chemins de la mémoire centrale.

## Contexte

`qwen channel` prend déjà en charge les adaptateurs de messagerie, les sessions partagées, l'attribution de l'expéditeur, les modes de distribution, les chunks de streaming, les callbacks d'appels d'outils, l'annulation, et les surfaces de progression spécifiques à la plateforme telles que les cartes Feishu. La couche produit P0 manquante est un moyen stable de dire "ce canal a sa propre identité d'agent résident" et "ce tour de prompt a un cycle de vie que les adaptateurs peuvent observer".

L'issue #6103 suit cette tranche ciblée. Elle s'appuie sur la feuille de route plus large des tags qwen dans #5887, mais garde cette PR suffisamment petite pour être revue et déployée indépendamment.

## Périmètre

Dans le périmètre :

- Ajouter des métadonnées d'identité de canal optionnelles à `ChannelConfig`.
- Ajouter des métadonnées de portée de mémoire optionnelles à `ChannelConfig`.
- Déduire des valeurs par défaut sûres lorsque la nouvelle configuration est omise.
- Injecter une note concise de limite de canal dans le premier prompt de chaque session d'agent, conjointement avec les instructions de canal existantes.
- Ajouter un hook protégé `onTaskLifecycle(event)` sur `ChannelBase`.
- Émettre des événements de cycle de vie depuis le flux de canal partagé pour le début du prompt, les chunks de texte, les appels d'outils, l'annulation, la complétion et les erreurs.
- Ajouter des tests ciblés au niveau du package dans `packages/channels/base`.

Hors périmètre :

- Modifications du stockage de la mémoire centrale ou isolation de l'espace de noms des chemins de fichiers.
- Publication d'événements Daemon/SSE.
- Modifications de l'UI pour Feishu, DingTalk, Telegram, WeChat ou QQ.
- Nouveaux adaptateurs de plateforme.
- Budgets de tokens, ACLs d'outils ou partage de contexte inter-canaux.

## Conception

### Identité du canal

Ajouter un petit objet de configuration optionnel :

```ts
export interface ChannelIdentityConfig {
  id?: string;
  displayName?: string;
  description?: string;
}
```

`ChannelConfig` gagne `identity?: ChannelIdentityConfig`.

À l'exécution, `ChannelBase` déduit :

- `id` : `config.identity.id` ou `channel:<name>`
- `displayName` : `config.identity.displayName` ou `<name>`
- `description` : `config.identity.description`, si présent

L'identité à l'exécution n'est que des métadonnées. Elle ne modifie pas le routage des sessions, le contrôle d'accès ni le comportement de l'adaptateur de plateforme.

### Métadonnées de portée de mémoire

Ajouter :

```ts
export type ChannelMemoryScopeMode = 'metadata-only';

export interface ChannelMemoryScopeConfig {
  namespace?: string;
  mode?: ChannelMemoryScopeMode;
}
```

`ChannelConfig` gagne `memoryScope?: ChannelMemoryScopeConfig`.

À l'exécution, `ChannelBase` déduit :

- `namespace` : `config.memoryScope.namespace` ou `channel:<name>`
- `mode` : toujours `'metadata-only'` pour cette PR

Il ne s'agit délibérément pas d'un véritable espace de noms de mémoire centrale. C'est un marqueur de limite explicite et inspectable, ainsi qu'une instruction de prompt, afin que les travaux ultérieurs puissent connecter ce même espace de noms aux chemins de la mémoire centrale sans modifier la forme de la configuration du canal.

### Injection de limite de prompt

`ChannelBase` préfixe déjà `config.instructions` une fois par session ; ce comportement reste inchangé. La note de limite générée ci-dessous est ajoutée à la même injection de premier message uniquement lorsqu'un canal configure `identity` ou `memoryScope` (les canaux avec uniquement des instructions conservent la forme de prompt existante). Elle est ajoutée après les instructions personnalisées afin que la limite ait la priorité de récence :

```text
Identité du canal :
- id : channel:ops
- display name : Ops Bot
- description : Aide le groupe ops à coordonner la maintenance du dépôt.

Portée de la mémoire :
- namespace : qwen-tag:ops
- mode : metadata-only
- les données des autres canaux ne doivent pas être partagées.
```

Le libellé exact doit être concis et suffisamment stable pour les tests, mais éviter de promettre une isolation excessive. Si aucune description n'existe, omettez cette ligne.

Cette note est injectée une fois par session d'agent, comme les instructions existantes (une erreur de lecture transitoire de la mémoire du canal relance tout le bloc de contexte au tour suivant, de sorte que les tours consécutifs peuvent la répéter). Lorsque le bridge signale la mort d'une session, le nettoyage existant de `instructedSessions` continue de permettre la réinjection pour la session suivante.

Pour des raisons de compatibilité, les canaux sans configuration `instructions`, `identity` ou `memoryScope` conservent la forme de prompt brute existante. L'identité à l'exécution et les métadonnées de mémoire sont toujours déduites pour les événements de cycle de vie et les commandes de statut.

### Visibilité du statut

Étendre `/who` et `/status` avec les métadonnées d'identité et de mémoire :

- `/who` doit inclure le nom d'affichage de l'identité et l'espace de noms de la mémoire.
- `/status` doit inclure l'id de l'identité et le mode de la mémoire.

Gardez la sortie courte. N'exposez pas les chemins absolus ni la configuration cachée.

### Hook de cycle de vie des tâches

Ajouter une union discriminée :

```ts
export type ChannelTaskLifecycleEvent =
  | {
      type: 'started';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'text_chunk';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      chunk: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'tool_call';
      channelName: string;
      chatId: string;
      sessionId: string;
      toolCall: ToolCallEvent;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'cancelled';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      reason: 'cancel_command' | 'clear' | 'steer' | 'timeout';
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'completed';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'failed';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      error: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    };
```

`ChannelBase` ajoute :

```ts
protected onTaskLifecycle(_event: ChannelTaskLifecycleEvent): void {}
```

Le comportement par défaut est no-op. Les adaptateurs peuvent s'inscrire ultérieurement sans modifier le chemin d'exécution du prompt.

### Points d'émission du cycle de vie

Émettre depuis le flux partagé de `ChannelBase` :

- `started` : immédiatement après `activePrompts.set()` et avant `onPromptStart()`.
- `text_chunk` : lorsque l'écouteur `textChunk` du prompt accepte un chunk non annulé.
- `tool_call` : dans l'écouteur d'appel d'outil du bridge existant après avoir résolu la cible de la session.
- `cancelled` : lorsque `/cancel` réussit, lorsque `/clear` annule ou évince un prompt actif, et lorsque `steer` marque le tour actif comme annulé.
- `completed` : après que `bridge.prompt()` soit résolu et avant ou après `onResponseComplete()`, tant que le tour n'a pas été annulé.
- `failed` : lorsque `bridge.prompt()` ou la livraison de la réponse lève une erreur.

Les échecs du hook de cycle de vie doivent être interceptés et journalisés dans stderr. L'UI de cycle de vie d'un adaptateur de plateforme ne doit pas interrompre l'exécution ou le nettoyage du prompt.

## Gestion des erreurs

- Les champs d'identité ou de mémoire invalides ne sont pas fatals dans cette PR ; l'analyse de la configuration doit conserver la forme permissive existante et n'accepter les champs de type string que là où une analyse explicite existe déjà.
- Les exceptions du hook de cycle de vie sont ignorées après un diagnostic dans stderr.
- Le mode de portée de la mémoire est contraint à `'metadata-only'` ; une configuration omise ou inconnue doit être résolue à `'metadata-only'` plutôt que d'activer un comportement qui n'existe pas.

## Tests

Des tests ciblés dans `packages/channels/base/src/ChannelBase.test.ts` doivent couvrir :

- Les métadonnées d'identité et de mémoire par défaut sont déduites du nom du canal.
- L'identité personnalisée et l'espace de noms de la mémoire sont inclus dans le premier prompt.
- Les métadonnées de limite sont injectées une fois par session et réinjectées après `sessionDied`.
- `/who` et `/status` incluent les nouvelles métadonnées sans divulguer le cwd.
- `onTaskLifecycle` voit `started`, `text_chunk`, `tool_call`, `completed`.
- `onTaskLifecycle` voit `cancelled` pour `/cancel`, `/clear` et `steer`.
- `onTaskLifecycle` voit `failed` lorsque `bridge.prompt()` rejette.
- Un hook de cycle de vie qui lève une erreur ne rejette pas `handleInbound()`.

Utilisez les commandes locales au package :

```bash
cd packages/channels/base
npx vitest run src/ChannelBase.test.ts
```

Vérification finale avant la PR :

```bash
npm run build
npm run typecheck
```

## Décisions en suspens

Aucune pour cette PR. L'application réelle de l'espace de noms de la mémoire centrale, la publication du daemon, l'UI de l'adaptateur, les ACLs d'outils/données, les budgets et le suivi proactif sont explicitement des travaux futurs.
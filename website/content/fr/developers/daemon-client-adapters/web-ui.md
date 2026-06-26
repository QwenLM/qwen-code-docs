# Adaptateur d'interface Web pour le Daemon

## Objectif

Les clients de chat Web et de terminal Web doivent consommer `qwen serve` via les API HTTP/SSE du démon et afficher une transcription côté client. Les intégrations natives locales TUI, de canal et IDE conservent leurs chemins par défaut actuels pour l'instant.

## Contrat d'interface partagé

Utilisez les exportations UI du démon du SDK TypeScript comme frontière commune :

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

La répartition est :

- `DaemonClient` gère les routes HTTP du démon.
- `DaemonSessionClient` gère la création/attachement de session et la relecture SSE.
- `normalizeDaemonEvent()` convertit les événements filaires du démon en événements UI.
- `createDaemonTranscriptStore()` réduit les événements UI en blocs de transcription.

Les clients React peuvent utiliser la liaison optionnelle `@qwen-code/webui` :

```tsx
import {
  DaemonSessionProvider,
  useDaemonActions,
  useDaemonConnection,
  useDaemonPendingPermissions,
  useDaemonTranscriptBlocks,
} from '@qwen-code/webui';
```

Forme React minimale :

```tsx
function App() {
  return (
    <DaemonSessionProvider baseUrl="http://127.0.0.1:4170">
      <Transcript />
      <PromptBox />
    </DaemonSessionProvider>
  );
}

function Transcript() {
  const blocks = useDaemonTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

Le fournisseur crée ou attache une session démon, s'abonne aux SSE, conserve le dernier identifiant d'événement sur `DaemonSessionClient`, et reconnecte le flux par défaut. Les appelants peuvent désactiver cela avec `autoReconnect={false}` pour les tests ou une gestion de connexion personnalisée.

## Formes de déploiement navigateur

### POC local de même origine

Une page servie par le démon peut appeler le démon directement car la page et l'API partagent une seule origine. C'est la forme POC précoce privilégiée pour la validation locale du chat Web et du terminal Web.

### Chat Web / Terminal Web distant

Une application Web distante en production devrait normalement communiquer avec un backend-pour-frontend. Le BFF possède l'URL du démon, le jeton, le routage de l'espace de travail et les métadonnées de session, puis transmet les événements d'application sécurisés pour le navigateur au navigateur. Cela évite de stocker les jetons bearer dans le navigateur et permet au déploiement de décider à quel démon/espace de travail un utilisateur est autorisé à accéder.

### Navigateur local contre démon local

Un serveur de développement local séparé est cross-origin par rapport à `qwen serve` ; il doit soit proxy les routes du démon via la même origine, soit être servi par le démon. Le démon rejette intentionnellement les requêtes arbitraires d'`Origin` de navigateur.

## Responsabilités de rendu

Le modèle de transcription partagé est sémantique, pas visuel. Les clients UI décident comment afficher :

- les blocs de messages utilisateur et assistant
- les blocs de pensée repliés
- les cartes de statut d'outil
- les blocs de sortie shell
- les contrôles de demande d'autorisation
- les blocs de statut/erreur/débogage

Le terminal Web est un rendu sémantique natif du navigateur. Il doit ressembler et donner l'impression d'un terminal avec une disposition monospace, le défilement arrière, la saisie d'invite, les raccourcis et les blocs de streaming, mais ce n'est pas un proxy PTY brut et il ne nécessite pas de rendu Ink côté serveur.

## Sécurité de fusion

- La TUI native `qwen` reste directe et inchangée.
- Les chemins `--acp`, de canal et IDE restent inchangés par défaut.
- Le noyau UI du SDK est additif.
- La liaison React WebUI est optionnelle et ne s'exécute que dans les clients qui l'importent.
- Le code spike TUI du démon supprimé ne doit pas être traité comme une migration de produit.

## Suites

- Ajouter un POC local `/web` servi par le démon ou une application Web de même origine équivalente.
- Construire des rendus de chat et de terminal de première classe au-dessus des blocs de transcription.
- Ajouter des événements typés plus riches uniquement là où les événements existants du démon sont trop bas niveau pour un comportement stable de l'interface navigateur.
- Envisager un paquet dédié `@qwen-code/daemon-ui-core` si des consommateurs non-SDK ont besoin du noyau UI comme dépendance indépendante.

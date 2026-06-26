# Adaptateur Web UI du Daemon

## Objectif

Les clients de chat Web et de terminal Web doivent consommer `qwen serve` via les API HTTP/SSE du daemon et afficher une transcription côté client. Les intégrations natives locales TUI, canal et IDE conservent leurs chemins par défaut actuels pour le moment.

## Contrat UI partagé

Utilisez les exports UI du daemon du SDK TypeScript comme frontière commune :

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

La répartition est :

- `DaemonClient` gère les routes HTTP du daemon.
- `DaemonSessionClient` possède la création/attachement de session et la relecture SSE.
- `normalizeDaemonEvent()` convertit les événements filaires du daemon en événements UI.
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

Le fournisseur crée ou attache une session daemon, s'abonne au SSE, conserve le dernier identifiant d'événement sur `DaemonSessionClient` et reconnecte le flux par défaut. Les appelants peuvent désactiver cela avec `autoReconnect={false}` pour les tests ou la gestion personnalisée des connexions.

## Formes de déploiement navigateur

### POC local de même origine

Une page servie par le daemon peut appeler le daemon directement car la page et l'API partagent une même origine. C'est la forme POC précoce préférée pour la validation du chat Web local et du terminal Web.

### Chat Web / Terminal Web distant

Une application Web distante de production devrait normalement communiquer avec un backend pour le frontend (BFF). Le BFF gère l'URL du daemon, le jeton, le routage de l'espace de travail et les métadonnées de session, puis transmet les événements d'application sécurisés pour le navigateur au navigateur. Cela empêche les jetons d'accès de se trouver dans le stockage du navigateur et permet au déploiement de décider à quel daemon/espace de travail un utilisateur est autorisé à accéder.

### Navigateur local contre daemon local

Un serveur de développement local séparé a une origine différente de `qwen serve` ; il doit soit proxyer les routes du daemon via la même origine, soit être servi par le daemon. Le daemon rejette intentionnellement les requêtes arbitraires d'`Origin` du navigateur.

## Responsabilités de rendu

Le modèle de transcription partagé est sémantique, pas visuel. Les clients UI décident comment afficher :

- blocs de messages utilisateur et assistant
- blocs de pensée réduits
- cartes d'état des outils
- blocs de sortie shell
- contrôles de demande d'autorisation
- blocs de statut/erreur/débogage

Le terminal Web est un rendu sémantique natif du navigateur. Il doit ressembler et se comporter comme un terminal avec une disposition monospace, un défilement arrière, une entrée d'invite, des raccourcis et des blocs de streaming, mais ce n'est pas un proxy PTY brut et il ne nécessite pas de rendu Ink côté serveur.

## Sécurité des fusions

- Le TUI natif `qwen` reste direct et inchangé.
- Les chemins `--acp`, canal et IDE restent inchangés par défaut.
- Le noyau UI du SDK est additif.
- La liaison React WebUI est facultative et s'exécute uniquement dans les clients qui l'importent.
- Le code de prototype TUI du daemon supprimé ne doit pas être traité comme une migration de produit.

## Suivis

- Ajouter un POC local `/web` servi par le daemon ou une application Web de même origine équivalente.
- Construire des rendus de chat et de terminal de première classe sur la base des blocs de transcription.
- Ajouter des événements typés plus riches uniquement là où les événements existants du daemon sont de trop bas niveau pour un comportement UI stable du navigateur.
- Envisager un paquet dédié `@qwen-code/daemon-ui-core` si des consommateurs non-SDK ont besoin du noyau UI comme dépendance indépendante.
# Adaptateur de démon Web Shell

## Objectif

Les clients web chat et web terminal doivent consommer `qwen serve` via les
APIs HTTP/SSE du démon et afficher une transcription côté client. Le TUI local
natif, les intégrations de canaux et les intégrations IDE conservent leurs
chemins par défaut existants pour le moment.

## Contrat d'interface utilisateur partagé

Utilisez les exports UI du SDK TypeScript daemon comme frontière commune :

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from ' @qwen-code/sdk/daemon';
```

La répartition est la suivante :

- `DaemonClient` gère les routes HTTP du démon.
- `DaemonSessionClient` possède la création/l'attachement de session et la relecture SSE.
- `normalizeDaemonEvent()` convertit les événements wire du démon en événements UI.
- `createDaemonTranscriptStore()` réduit les événements UI en blocs de transcription.

Les clients React peuvent utiliser le binding exporté par Web Shell :

```tsx
import {
  DaemonSessionProvider,
  useActions,
  useConnection,
  usePendingPermissions,
  useTranscriptBlocks,
} from ' @qwen-code/web-shell/daemon-react-sdk';
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
  const blocks = useTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

Le provider crée ou attache une session daemon, s'abonne au SSE, conserve le
dernier event id sur `DaemonSessionClient`, et reconnecte le flux par défaut.
Les appelants peuvent désactiver cela avec `autoReconnect={false}` pour les tests
ou une gestion personnalisée de la connexion.

## Formes de déploiement navigateur

### POC local même origine

Une page servie par le démon peut appeler le démon directement car la page et
l'API partagent la même origine. C'est la forme de POC préférée pour la
validation locale du web chat et du web terminal.

### Web chat / Web terminal distant

Une application web distante en production doit normalement communiquer avec un
backend-for-frontend. Le BFF possède l'URL du démon, le token, le routage du
workspace et les métadonnées de session, puis transmet au navigateur les
événements d'application sûrs pour le navigateur. Cela évite de stocker les
tokens bearer dans le navigateur et permet au déploiement de décider à quel
démon/workspace un utilisateur est autorisé à accéder.

### Navigateur local contre démon local

Un serveur de développement local distinct est en cross-origin par rapport à
`qwen serve` ; il doit soit proxyer les routes du démon via la même origine,
soit être servi par le démon. Le démon rejette intentionnellement les requêtes
de navigateur avec une `Origin` arbitraire.

## Responsabilités de rendu

Le modèle de transcription partagé est sémantique, pas visuel. Les clients UI
décident comment effectuer le rendu :

- blocs de messages utilisateur et assistant
- blocs de pensée repliés
- cartes de statut des outils
- blocs de sortie shell
- contrôles de demande de permission
- blocs de statut/erreur/debug

Le web terminal est un renderer sémantique natif navigateur. Il doit avoir
l'apparence et le comportement d'un terminal avec une mise en page monospace,
un historique de défilement, une saisie de prompt, des raccourcis et des blocs
en streaming, mais ce n'est pas un proxy PTY brut et ne nécessite pas de rendu
Ink côté serveur.

## Sécurité de merge

- Le TUI natif `qwen` reste direct et inchangé.
- Les chemins `--acp`, de canal et IDE restent inchangés par défaut.
- Le cœur UI du SDK est additif.
- Le binding React Web Shell est optionnel et ne s'exécute que dans les clients
  qui l'importent.
- Le code de spike TUI daemon supprimé ne doit pas être traité comme une
  migration produit.

## Suivi

- Maintenir le Web Shell servi par le démon et le comportement de l'hôte IDE
  embarqué alignés.
- Continuer à construire des renderers chat et terminal de première classe sur
  les blocs de transcription.
- Ajouter des événements typés plus riches uniquement là où les événements
  daemon existants sont trop bas niveau pour un comportement UI navigateur
  stable.
- Envisager un package dédié ` @qwen-code/daemon-ui-core` si des consommateurs
  non-SDK ont besoin du cœur UI comme dépendance indépendante.

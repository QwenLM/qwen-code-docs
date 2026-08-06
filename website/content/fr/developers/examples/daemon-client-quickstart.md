# Prise en main rapide de DaemonClient (TypeScript)

Un exemple minimal de bout en bout : démarrez un démon `qwen serve` dans un autre terminal, puis pilotez-le depuis un script Node avec le `DaemonClient` du SDK. Voir aussi : [Guide utilisateur du mode démon](../../users/qwen-serve.md) et [Référence du protocole HTTP](../qwen-serve-protocol.md).

## Configuration

Dans un terminal :

```bash
qwen serve --port 4170 \
  --workspace /path/to/project-a \
  --workspace /path/to/project-b
# → qwen serve écoute sur http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/project-a)
```

Chaque valeur `--workspace` doit être un répertoire absolu. Le workspace de démarrage est le primaire et reste la valeur par défaut de compatibilité pour les requêtes qui omettent `cwd` ; `/capabilities.workspaces[]` est le catalogue que les clients doivent utiliser pour sélectionner explicitement un runtime.

Dans un autre terminal :

```bash
npm install @qwen-code/sdk
```

## Bonjour le démon

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): when `token` is omitted, DaemonClient falls
  // back to `process.env.QWEN_SERVER_TOKEN` automatically — same env
  // var the daemon's `--token` CLI flag falls back to. So either:
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # one-shot
  //   export QWEN_SERVER_TOKEN="$(cat ./my-token-file)"    # user-managed file
  //   const client = new DaemonClient({ baseUrl: '...' });
  // OR pass it explicitly when you have a different env-var name:
  //   token: process.env.MY_TOKEN,
});

// 1. Confirm we can reach the daemon, gate UI on its features, and
//    select a trusted workspace from the advertised catalog.
const caps = await client.capabilities();
console.log('Daemon features:', caps.features);
const selectedWorkspace =
  caps.workspaces?.find(
    (workspace) => workspace.trusted && !workspace.primary,
  ) ?? caps.workspaces?.find((workspace) => workspace.trusted);
if (!selectedWorkspace) throw new Error('No trusted workspace is available');
console.log('Selected workspace:', selectedWorkspace.id, selectedWorkspace.cwd);

// 2. Spawn-or-attach inside that runtime. The SDK maps `workspaceCwd`
//    to the wire-level POST /session `cwd` field. Omitting it is allowed
//    only when the caller intentionally wants the legacy primary default.
const session = await client.createOrAttachSession({
  workspaceCwd: selectedWorkspace.cwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. Subscribe to the event stream. Pass `lastEventId: 0` so the daemon
//    replays everything from the session's start — without it, there's
//    a TOCTOU window between `subscribeEvents()` returning the iterator
//    and the underlying SSE connection actually opening (one fetch
//    round-trip), during which a fast-starting agent can emit events
//    that go into the per-session ring but won't be streamed to a fresh
//    no-cursor subscriber. `lastEventId: 0` makes the replay buffer
//    cover that gap (and any reconnect later — see below).
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. Send a prompt and wait for it to settle. (Order-of-operations
//    note: even if `prompt()` fires before the SSE handshake
//    completes, step 3's `lastEventId: 0` guarantees every event
//    lands in the iterator.)
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Summarize src/main.ts in one sentence.' }],
});
console.log('stop reason:', result.stopReason);

// 5. Tear down the subscription so the script can exit.
abort.abort();
await subscription;

function handleEvent(event: DaemonEvent): void {
  switch (event.type) {
    case 'session_update': {
      const data = event.data as {
        sessionUpdate: string;
        content?: { text?: string };
      };
      if (data.sessionUpdate === 'agent_message_chunk' && data.content?.text) {
        process.stdout.write(data.content.text);
      }
      break;
    }
    case 'permission_request':
      // See "Voting on permissions" below for first-responder semantics.
      console.log('\n[needs permission]', event.data);
      break;
    case 'permission_resolved':
      console.log('\n[permission resolved]', event.data);
      break;
    case 'session_died':
      console.error('\n[agent crashed]', event.data);
      break;
    default:
      console.log(`\n[${event.type}]`, event.data);
  }
}
```

## Aides pour les fichiers de l'espace de travail

Les routes de fichiers sont limitées à l'espace de travail, pas à la session. Liez un assistant qualifié à l'id du workspace sélectionné afin que chaque requête reste dans ce runtime :

```ts
const selected = client.workspaceById(selectedWorkspace.id);
const file = await selected.readWorkspaceFile('src/main.ts');

const updated = await selected.editWorkspaceFile({
  path: 'src/main.ts',
  oldText: 'timeout: 30000',
  newText: 'timeout: 60000',
  expectedHash: file.hash!,
});

console.log(updated.hash);
```

`expectedHash` est un SHA-256 des octets bruts sur le disque. `mode: "replace"` et `editWorkspaceFile()` l'exigent afin que les clients obsolètes n'écrasent pas un fichier qu'ils n'ont pas lu juste avant. Les opérations d'écriture/édition nécessitent une configuration avec jeton porteur même en boucle locale ; démarrez le démon avec `--token` ou `QWEN_SERVER_TOKEN` avant de les utiliser.

## Reconnexion avec `Last-Event-ID`

Si votre processus client redémarre au milieu d'une session, rejouez les événements que vous avez manqués :

```ts
let cursor: number | undefined;

for await (const event of client.subscribeEvents(session.sessionId, {
  signal: abort.signal,
  lastEventId: cursor, // resume from after this id; undefined = live only
})) {
  if (typeof event.id === 'number') cursor = event.id;
  handleEvent(event);
}
```

Le démon conserve les 8000 derniers événements par session dans un tampon circulaire ; les écarts au-delà de cette fenêtre ne pourront pas être redistribués.

## Vote sur les permissions

Lorsque l'agent demande la permission d'exécuter un outil, chaque client connecté voit l'événement `permission_request`. **Le premier répondant gagne** — dès qu'un client vote, les autres obtiennent une `404` s'ils tentent de voter sur le même `requestId`.

```ts
case 'permission_request': {
  const req = event.data as {
    requestId: string;
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
  // Pick whichever option you want — `proceed_once`, `allow`, etc.
  const choice = req.options.find((o) => o.kind === 'allow_once') ?? req.options[0];
  const accepted = await client.respondToPermission(req.requestId, {
    outcome: { outcome: 'selected', optionId: choice.optionId },
  });
  if (!accepted) {
    console.log('Another client voted first; nothing to do.');
  }
  break;
}
```

## Collaboration en session partagée

Deux clients pointant vers le **même workspace du démon** se retrouvent sur la même session lorsqu'ils utilisent le `sessionScope: 'single'` par défaut. Pour un démon mono-workspace lancé avec `qwen serve --workspace /work/repo` (ou `cd /work/repo && qwen serve`), les deux clients se connectent à ce workspace primaire :

```ts
// Daemon was launched as `qwen serve --workspace /work/repo` so
// `caps.workspaceCwd === '/work/repo'` for both clients.

// Client A (e.g. an IDE plugin)
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false — A spawned the agent

// Client B (e.g. a web UI on the same machine)
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true — B joined A's session
console.log(a.sessionId === b.sessionId); // true
```

Les deux clients voient le même flux `session_update` / `permission_request`. Chacun peut envoyer une requête ; ils sont mis en file d'attente FIFO selon la garantie de l'agent « une invite active par session ».

## Incompatibilité d'espace de travail

Si `workspaceCwd` ne correspond à aucun workspace enregistré annoncé, `createOrAttachSession` est rejetée avec `DaemonHttpError` portant le statut `400` et un corps structuré. Un workspace enregistré mais non fiable retourne plutôt `403 untrusted_workspace` et ne doit pas être retenté contre le primaire :

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.createOrAttachSession({ workspaceCwd: '/some/other/project' });
} catch (err) {
  if (err instanceof DaemonHttpError && err.status === 400) {
    const body = err.body as {
      code?: string;
      boundWorkspace?: string;
      requestedWorkspace?: string;
    };
    if (body.code === 'workspace_mismatch') {
      console.error(
        `Workspace ${body.requestedWorkspace} is not registered. ` +
          `Refresh capabilities and select an advertised workspace, ` +
          `or register it before retrying.`,
      );
    }
  }
}
```

Ne réessayez pas contre le workspace primaire après une incompatibilité. Rafraîchissez `/capabilities`, sélectionnez l'entrée prévue dans `workspaces[]`, ou enregistrez un workspace dynamique éligible via `POST /workspaces`. N'utilisez des démons séparés que lorsque l'authentification, la limite de débit ou les limites de fault de processus doivent aussi être indépendantes.

## Authentification

Lorsque le démon a été démarré avec un jeton (toute liaison non en boucle locale en nécessite un) :

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**Repli sur la variable d'environnement du SDK (PR 27, v0.16-alpha)** — `DaemonClient` lit `QWEN_SERVER_TOKEN` depuis l'environnement automatiquement lorsque `token` est omis, reflétant le repli de la CLI `--token` du démon. Donc si votre shell a `export QWEN_SERVER_TOKEN=...`, cela équivaut à ce qui précède :

```ts
// Same effect as token: process.env.QWEN_SERVER_TOKEN, but without the boilerplate.
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

Le repli supprime les espaces en début et fin de chaîne (pratique pour `export QWEN_SERVER_TOKEN="$(cat token.txt)"` où `cat` ajoute un saut de ligne) et traite les valeurs vides/uniquement espacées comme non définies (un `export QWEN_SERVER_TOKEN=""` périmé n'enverra pas accidentellement `Authorization: Bearer ` sans jeton). Le repli s'exécute une fois à la construction ; les mutations ultérieures de `process.env` n'affectent pas les clients déjà construits. Les bundles navigateurs (par exemple via `@qwen-code/webui`) obtiennent proprement `undefined` car `globalThis.process` n'existe pas là-bas.

Les jetons erronés/manquants renvoient une `401` avec un corps uniforme — le SDK lance `DaemonHttpError` pour tout 4xx/5xx provenant d'un gestionnaire de route.

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.health();
} catch (err) {
  if (err instanceof DaemonHttpError) {
    console.error(`Daemon error ${err.status}:`, err.body);
  } else {
    throw err;
  }
}
```

## Annuler une invite en cours

Si votre utilisateur appuie sur Échap :

```ts
await client.cancel(session.sessionId);
// In the event stream you'll see the prompt resolve with stopReason: "cancelled"
```

L'annulation n'arrête que l'invite **active** — tout ce que vous avez déjà envoyé en POST et qui est encore en file d'attente derrière continuera à s'exécuter. (Voir la référence du protocole pour la justification.)

## Prochaines étapes

- [Référence du protocole HTTP](../qwen-serve-protocol.md) — spécification complète des routes avec codes d'état
- [Guide utilisateur du mode démon](../../users/qwen-serve.md) — documentation côté opérateur
- Source : `packages/sdk-typescript/src/daemon/`
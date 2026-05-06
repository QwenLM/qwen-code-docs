# Dual Output

Dual Output est un mode sidecar pour le TUI interactif : pendant que Qwen Code continue de s'afficher normalement sur `stdout`, il émet simultanément un flux d'événements JSON structuré vers un canal séparé, permettant à un programme externe — une extension IDE, un frontend web, un pipeline CI, un script d'automatisation — d'observer et de piloter la session.

Il fournit également un canal inverse : un programme externe peut écrire des commandes JSONL dans un fichier surveillé par le TUI, ce qui lui permet de soumettre des prompts et de répondre aux demandes d'autorisation d'outils comme si un humain était au clavier.

Dual Output est entièrement optionnel. En l'absence des flags ci-dessous, le TUI se comporte exactement comme avant, sans I/O supplémentaire ni changement de comportement.

## Cas d'utilisation

Dual Output est une primitive de bas niveau. Voici les intégrations concrètes qu'il permet de débloquer :

### Synchronisation temps réel double mode Terminal + Chat

Le cas d'utilisation principal. Une ChatUI web ou desktop héberge le TUI dans un PTY et affiche une vue conversationnelle parallèle pilotée par le flux d'événements structuré :

- L'utilisateur peut taper sur l'une ou l'autre des surfaces — le TUI (pour les utilisateurs avancés natifs du terminal) ou l'interface web (pour une UX plus riche, des liens partageables, le mobile). Les deux vues restent synchronisées car chaque message transite par les mêmes événements JSON.
- Les invites d'approbation d'outils apparaissent aux deux endroits ; la première approbation l'emporte.
- L'historique de session est capturé mot pour mot depuis `--json-file`, ce qui donne au serveur une transcription canonique lisible par machine sans avoir à parser l'ANSI.

### Extensions IDE (VS Code / JetBrains / Cursor / Neovim)

Intégrez Qwen Code dans l'IDE. Le TUI s'exécute dans le panneau terminal intégré de l'éditeur pour les utilisateurs qui le souhaitent, tandis que l'extension consomme les événements `--json-fd` / `--json-file` pour piloter :

- Des overlays de diff inline lorsque l'agent modifie des fichiers.
- Un panneau latéral webview avec du markdown formaté, des appels d'outils avec coloration syntaxique et des citations cliquables.
- Des indicateurs dans la barre de statut (en réflexion / en réponse / en attente d'approbation).
- Des écritures programmatiques de `confirmation_response` lorsque l'utilisateur clique sur un bouton d'approbation natif de l'IDE.

### Frontends Chat basés sur un navigateur

Un serveur Node/Bun lance le TUI dans un PTY pour ses sémantiques de rendu, mais expose un canal WebSocket vers le navigateur. Les événements sur `--json-file` sont transférés au client ; les messages utilisateur tapés dans le navigateur sont injectés via `--input-file`. Aucun parsing ANSI n'est nécessaire de part et d'autre.

### Observateurs CI / automatisation

Un job CI exécute Qwen Code avec un prompt de tâche. L'humain voit le TUI dans le log du job ; le système CI suit `--json-file` pour :

- Échouer le job si un événement `result` signale une erreur.
- Pousser les compteurs `token usage` / `duration_ms` / `tool_use` vers les métriques.
- Archiver la transcription complète en tant qu'artefact de build.

### Orchestration multi-agent

Un agent superviseur lance plusieurs workers TUI, chacun avec son propre couple de fichiers d'événements/d'entrée. Il surveille la progression, injecte des prompts de suivi et applique les politiques globales de budget / de sécurité en approuvant ou en refusant les appels d'outils sur tous les workers.

### Enregistrement, audit et replay de session

Redirigez (`tee`) chaque session TUI vers un fichier standard avec `--json-file`. Plus tard :

- Les audits de conformité peuvent reconstruire exactement ce qui a été exécuté.
- Les tests de régression automatisés peuvent comparer les exécutions entre différentes versions de modèles.
- Un outil de replay peut réémettre les événements via le même protocole pour alimenter des dashboards de visualisation.

### Dashboards d'observabilité

Streamer `--json-file` vers Loki / OTEL / tout pipeline acceptant du JSONL. Extrayez `usage.input_tokens`, `tool_use.name`, `result.duration_api_ms` comme métriques de première classe dans Grafana. Plus besoin de regex pour parser les logs.

### Tests et QA

Les tests d'intégration lancent Qwen Code en mode headless, le pilotent avec des scripts `--input-file` et effectuent des assertions sur les événements `--json-file`. Contrairement au parsing de l'ANSI sur stdout, les assertions restent stables lors des refactors de l'UI.

## Flags

| Flag                  | Type             | Objectif                                                                                                                                    |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-fd <n>`       | number, `n >= 3` | Écrit les événements JSON structurés vers le descripteur de fichier `n`. L'appelant doit fournir ce fd via la configuration `stdio` du spawn ou une redirection shell. |
| `--json-file <path>`  | path             | Écrit les événements JSON structurés vers un fichier. Le chemin peut être un fichier standard, un FIFO (tube nommé) ou `/dev/fd/N`.                               |
| `--input-file <path>` | path             | Surveille ce fichier pour détecter les commandes JSONL écrites par un programme externe.                                                                         |

`--json-fd` et `--json-file` sont mutuellement exclusifs. Les fds 0, 1 et 2 sont rejetés pour éviter de corrompre la sortie propre du TUI.

## Pourquoi deux flags de sortie ? (`--json-fd` vs `--json-file`)

À première vue, `--json-fd` semble suffisant — l'appelant lance Qwen Code avec un descripteur de fichier supplémentaire, le TUI y écrit les événements, c'est tout. En pratique, le passage de fd échoue dans le scénario d'intégration le plus important : exécuter le TUI à l'intérieur d'un pseudo-terminal (PTY). C'est pourquoi cette fonctionnalité expose également une alternative basée sur un chemin.

### Quand `--json-fd` fonctionne

`child_process.spawn` pur avec un tableau `stdio` :

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Le spawn de Node prend en charge des entrées `stdio` arbitraires ; le fd 3 est hérité par le processus enfant, qui peut y écrire directement. Zero-copy, zero-buffer, zero filesystem — le chemin le plus rapide.

### Pourquoi `--json-fd` ne fonctionne **pas** sous PTY

Les wrappers PTY comme [`node-pty`](https://github.com/microsoft/node-pty) et [`bun-pty`](https://github.com/oven-sh/bun) sont la méthode utilisée par tout intégrateur sérieux (extensions IDE, terminaux web, multiplexeurs de type tmux) pour héberger un TUI interactif. Ils ne peuvent pas transférer de fds supplémentaires à l'enfant, pour trois raisons qui se renforcent mutuellement :

1. **Surface de l'API.** `node-pty.spawn(file, args, options)` accepte `cwd`, `env`, `cols`, `rows`, `encoding`, etc. — mais **aucun tableau `stdio`**. Il n'y a tout simplement pas de place dans l'API pour dire "attache aussi ce fd en tant que fd 3 dans l'enfant". `bun-pty` expose la même structure.
2. **Sémantique de `forkpty(3)`.** Sous le capot, les wrappers PTY appellent `forkpty(3)` (ou l'équivalent `posix_openpt` + `login_tty`). Ce syscall alloue une paire de pseudo-terminaux maître/esclave et redirige les fds 0/1/2 de l'enfant vers le côté esclave pour que l'enfant croie être attaché à un vrai terminal. Tous les fds supérieurs à 2 dans le parent sont fermés par `login_tty`, qui appelle `close(fd)` pour `fd >= 3` avant `exec`. Les fds supplémentaires sont activement supprimés, et non hérités.
3. **Effet de bord du terminal de contrôle.** Même si vous parveniez à faire passer un fd supplémentaire par un hack, ce ne serait pas un terminal, donc le moteur de rendu TUI de l'enfant (qui écrit des séquences d'échappement en supposant un TTY sur le fd 1) aurait toujours besoin de l'esclave pour sa sortie. Vous vous retrouveriez quand même avec deux transports indépendants.

En bref : dès qu'un intégrateur a besoin d'un vrai TTY pour le rendu du TUI — ce qui est le cas de chaque extension IDE, chaque terminal web, chaque application de chat desktop — l'héritage de fd n'est plus envisageable.

### `--json-file` comble le vide

Un chemin de fichier est passé comme un argument CLI ordinaire, il survit donc à tous les modèles de spawn :

```ts
import { spawn } from 'node-pty';

const pty = spawn(
  'qwen',
  [
    '--json-file',
    '/tmp/qwen-events.jsonl',
    '--input-file',
    '/tmp/qwen-input.jsonl',
  ],
  { cols: 120, rows: 40 },
);
```

L'enfant ouvre lui-même le fichier et y écrit les événements ; l'intégrateur suit le même chemin avec `fs.watch` + des lectures incrémentales. Trois points à noter :

- **Fichier standard**, FIFO (tube nommé) ou `/dev/fd/N` fonctionnent tous. Le FIFO est l'option à la latence la plus faible lorsque les deux parties sont sur le même hôte.
- Le bridge ouvre les FIFOs avec `O_NONBLOCK` et bascule en mode bloquant sur `ENXIO` (aucun lecteur pour le moment), ainsi le démarrage du PTY n'est jamais bloqué en attendant un consommateur.
- Pour l'isolation multi-session, utilisez des chemins par session sous `$XDG_RUNTIME_DIR` ou un répertoire créé via `mkdtemp` avec le mode `0700`.

### Quel flag utiliser ?

| Style d'intégration                                   | Utiliser                  |
| ------------------------------------------------- | -------------------- |
| `child_process.spawn` avec stdio standard            | `--json-fd`          |
| `node-pty` / `bun-pty` / tout hôte PTY             | `--json-file`        |
| Redirection shell / test de pipeline manuel       | l'un ou l'autre               |
| Collecte de logs CI (fichier standard, lecture après sortie) | `--json-file`        |
| Latence la plus faible possible sur le même hôte              | `--json-file` + FIFO |

La règle générale : **si vous avez besoin que le TUI s'affiche correctement, vous avez besoin d'un PTY, ce qui signifie que vous avez besoin de `--json-file`.** `--json-fd` est destiné aux intégrateurs plus simples qui se soucient peu de la fidélité du TUI — typiquement des wrappers programmatiques qui jettent stdout de toute façon.

## Démarrage rapide

Exécutez Qwen Code avec les trois canaux activés :

```bash
mkfifo /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

Dans un second terminal, suivez le flux d'événements :

```bash
cat /tmp/qwen-events.jsonl
```

Dans un troisième terminal, injectez un prompt dans le TUI en cours d'exécution :

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

Le prompt apparaît dans le TUI exactement comme si l'utilisateur l'avait tapé, et la réponse en streaming est répliquée sur `/tmp/qwen-events.jsonl`.

## Schéma des événements de sortie

Les événements sont émis au format JSON Lines (un objet par ligne). Le schéma est identique à celui utilisé par le mode non interactif `--output-format=stream-json`, avec `includePartialMessages` toujours activé.

Le premier événement sur le canal est toujours `system` / `session_start`, émis lors de la construction du bridge. Utilisez-le pour corréler le canal avec un session id avant l'arrivée de tout autre événement.

```jsonc
// Session lifecycle
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// Streaming events for an in-progress assistant turn
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// Completed messages
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// Permission control plane (only when a tool needs approval)
{
  "type": "control_request",
  "request_id": "...",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "run_shell_command",
    "tool_use_id": "...",
    "input": { "command": "rm -rf /tmp/x" },
    "permission_suggestions": null,
    "blocked_path": null
  }
}
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "...",
    "response": { "allowed": true }
  }
}
```

`control_response` est émis que la décision ait été prise dans le TUI (interface d'approbation native) ou par un `confirmation_response` externe (voir ci-dessous). Dans les deux cas, tous les observateurs voient le résultat final.

## Schéma des commandes d'entrée

Deux formats de commande sont acceptés sur `--input-file` :

```jsonc
// Submit a user message into the prompt queue
{ "type": "submit", "text": "What does this function do?" }

// Reply to a pending control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

Comportement :

- Les commandes `submit` sont mises en file d'attente. Si le TUI est occupé à répondre, elles sont automatiquement réessayées la prochaine fois que le TUI revient à l'état inactif.
- Les commandes `confirmation_response` sont dispatchées immédiatement et ne sont jamais mises en file d'attente, car un appel d'outil est bloquant et la réponse doit atteindre le handler `onConfirm` sous-jacent sans attendre un éventuel `submit` antérieur.
- Le premier côté qui approuve un outil l'emporte ; la réponse tardive de l'autre côté est ignorée sans conséquence.
- Les lignes qui ne peuvent pas être parsées en JSON sont loggées et ignorées — elles n'arrêtent pas le watcher.

## Notes sur la latence

Le fichier d'entrée est surveillé avec `fs.watchFile` à un intervalle de polling de 500 ms, donc la latence aller-retour pire cas pour un `submit` distant est d'environ une demi-seconde. C'est intentionnel : le polling est portable entre les plateformes et les systèmes de fichiers (y compris macOS / montages réseau), et correspond au rythme typique avec un humain dans la boucle visé par cette fonctionnalité. Le canal de sortie n'a pas de polling — les événements sont écrits de manière synchrone au fur et à mesure que le TUI les émet.

## Modes de défaillance

- **Fd invalide.** Si le fd passé à `--json-fd` n'est pas ouvert ou correspond à 0/1/2, le TUI affiche un avertissement sur `stderr` et continue sans activer la sortie double.
- **Chemin invalide.** Si le fichier passé à `--json-file` ne peut pas être ouvert, le TUI affiche un avertissement et continue sans la sortie double.
- **Déconnexion du consommateur.** Si le lecteur de l'autre côté du canal disparaît (`EPIPE`), le bridge se désactive silencieusement et le TUI continue de fonctionner. Aucune tentative de reconnexion.
- **Exception de l'adaptateur.** Toute exception levée lors de l'émission d'un événement est interceptée, loggée et désactive le bridge. Le TUI ne plante jamais à cause d'une défaillance de la sortie double.

## Exemple de spawn

Un processus parent d'intégration typique lance Qwen Code avec les deux canaux :

```ts
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const eventsFd = openSync('/tmp/qwen-events.jsonl', 'w');
const child = spawn(
  'qwen',
  ['--json-fd', '3', '--input-file', '/tmp/qwen-input.jsonl'],
  { stdio: ['inherit', 'inherit', 'inherit', eventsFd] },
);
```

Le TUI conserve toujours le contrôle du terminal de l'utilisateur sur stdio 0/1/2, tandis que l'intégrateur lit les événements structurés sur le fichier associé au fd 3 et pousse des commandes en ajoutant des lignes JSONL à `/tmp/qwen-input.jsonl`.

## Configuration basée sur les paramètres

Pour les intégrateurs de longue durée, il est souvent peu pratique de faire passer les flags CLI à chaque lancement. Les mêmes canaux peuvent être configurés dans `settings.json` sous la clé de premier niveau `dualOutput` :

```jsonc
// ~/.qwen/settings.json  (user-level)
// or <workspace>/.qwen/settings.json  (workspace-level)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

Règles de priorité :

- Le flag CLI **l'emporte** sur les paramètres. Passer `--json-file /foo` en ligne de commande écrase `dualOutput.jsonFile` dans les paramètres.
- `--json-fd` n'a pas d'équivalent dans les paramètres — le passage de fd est une préoccupation au moment du spawn qui ne peut pas être déclarée statiquement.
- Si ni le flag ni le paramètre n'est présent, la sortie double reste désactivée (identique au comportement par défaut actuel).

Le flag `requiresRestart: true` signifie que les modifications ne prennent effet qu'au prochain lancement de Qwen Code, car le bridge est construit une seule fois au démarrage.

## Démos exécutables

Chaque script ci-dessous est prêt à être copié-collé. Commencez par POC&nbsp;1 pour vérifier que le build dispose de la sortie double ; POC&nbsp;4 est l'analogue le plus proche d'une véritable intégration d'extension IDE.

### POC 1 — observer le flux d'événements

Surveillez chaque événement structuré émis par le TUI pendant qu'un humain l'utilise normalement :

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...then chat normally; terminal A shows session_start,
# user/assistant/result/control_request lifecycle in real time.
```

Première ligne attendue dans le terminal A :

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — injecter des prompts depuis l'extérieur

Pilotez le TUI depuis un second terminal sans toucher au clavier du premier :

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — the TUI responds as if you typed it
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — bridge distant d'autorisation d'outils

Approuvez ou refusez des appels d'outils depuis un processus séparé :

```bash
# Terminal A — observe control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Ask Qwen to do something that needs approval, e.g.
# "run `ls -la /tmp`". A control_request will appear in terminal A.
# Copy the request_id, then in a third terminal:
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# The TUI confirmation prompt dismisses and the tool executes.
```

Si vous répondez avec un `request_id` inconnu, le bridge émet un `control_response` avec `subtype: "error"` sur le canal de sortie afin que votre consommateur puisse le logger ou réessayer :

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "unknown request_id (already resolved, cancelled, or never issued)"
  }
}
```

### POC 4 — Intégrateur Node (style IDE)

Le format le plus réaliste : un processus parent lance Qwen Code, suit les événements et injecte des prompts selon son propre planning.

```ts
// demo-embedder.ts
import { spawn } from 'node:child_process';
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const events = join(tmpdir(), `qwen-events-${process.pid}.jsonl`);
const input = join(tmpdir(), `qwen-input-${process.pid}.jsonl`);
writeFileSync(events, '');
writeFileSync(input, '');

const child = spawn('qwen', ['--json-file', events, '--input-file', input], {
  stdio: 'inherit',
});

// Tail the output channel. In production you'd use a proper
// byte-offset tail; this one re-streams from 0 for brevity.
const rl = createInterface({
  input: createReadStream(events, { encoding: 'utf8' }),
});
rl.on('line', (line) => {
  if (!line.trim()) return;
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    console.log('[embedder] handshake:', {
      protocol_version: ev.data.protocol_version,
      version: ev.data.version,
      supported_events: ev.data.supported_events,
    });
    // Feature-detect before using a capability
    if (ev.data.supported_events.includes('control_request')) {
      console.log('[embedder] permission control-plane available');
    }
  }
  if (ev.type === 'assistant') {
    console.log(
      '[embedder] assistant turn ended, tokens =',
      ev.message.usage?.output_tokens,
    );
  }
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] session ended cleanly');
  }
});

// After 2s, inject a prompt as if the user typed it
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'hello from embedder' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```

Exécutez avec :

```bash
npx tsx demo-embedder.ts
# Qwen Code TUI opens in the current terminal; the embedder logs
# handshake + turn-end + session_end events to the parent's stdout.
```

### POC 5 — détection de fonctionnalités via le handshake de capacités

Les anciennes versions de Qwen Code n'émettront pas `protocol_version`. Traitez le champ comme optionnel et effectuez une détection de fonctionnalités :

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'qwen-code dual output is present but protocol < 1; ' +
          'falling back to best-effort behavior',
      );
    } else {
      console.log('qwen-code dual output protocol v' + v);
    }
  }
});
```

### POC 6 — `session_end` comme signal de terminaison propre

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // Flush metrics, close WebSockets, etc.
  }
});
```

Si le TUI plante avant `session_end`, le flux de sortie se ferme (`EPIPE` à la prochaine écriture) ; les intégrateurs doivent gérer les deux chemins.

### POC 7 — tests de défaillance (prouver que les flags ne cassent jamais le TUI)

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI still launches normally.

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI still launches normally.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs rejects: "--json-fd and --json-file are mutually exclusive."
# Process exits before TUI starts.

qwen --json-file /nonexistent/dir/x.jsonl
# stderr warning; TUI still launches.
```

## Relation avec Claude Code

Claude Code expose un format d'événements stream-json similaire sous `--print --output-format stream-json`, mais uniquement en mode non interactif — il n'a pas d'équivalent pour exécuter le TUI et un canal sidecar structuré en même temps. Dual Output comble ce manque.
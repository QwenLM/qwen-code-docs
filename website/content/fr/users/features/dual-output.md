# Dual Output

Dual Output est un mode sidecar pour le TUI interactif : pendant que Qwen Code continue de s'afficher normalement sur `stdout`, il émet simultanément un flux structuré d'événements JSON vers un canal séparé afin qu'un programme externe — une extension IDE, une interface web, un pipeline CI, un script d'automatisation — puisse observer et piloter la session.

Il fournit également un canal inverse : un programme externe peut écrire des commandes JSONL dans un fichier que le TUI surveille, lui permettant de soumettre des invites et de répondre aux demandes d'autorisation d'outils comme si un humain était au clavier.

Dual Output est entièrement optionnel. Lorsque les indicateurs ci-dessous sont absents, le TUI se comporte exactement comme avant, sans E/S supplémentaires ni changements de comportement.

## Cas d'utilisation

Dual Output est un mécanisme de plomberie de bas niveau. Voici les intégrations concrètes qu'il permet :

### Synchronisation en temps réel en mode double Terminal + Chat

Le cas d'utilisation phare. Une interface de chat web ou de bureau héberge le TUI dans un PTY et affiche une vue parallèle de la conversation pilotée par le flux d'événements structuré :

- L'utilisateur peut taper sur l'une ou l'autre surface — le TUI (pour les utilisateurs avancés natifs du terminal) ou l'interface web (pour une UX plus riche, des liens partageables, mobile). Les deux vues restent synchronisées car chaque message circule à travers les mêmes événements JSON.
- Les invites d'approbation d'outils apparaissent aux deux endroits ; celui qui approuve en premier gagne.
- L'historique de la session est capturé textuellement depuis `--json-file`, donc le serveur dispose d'une transcription canonique lisible par machine sans avoir à parser l'ANSI.

### Extensions IDE (VS Code / JetBrains / Cursor / Neovim)

Intégrer Qwen Code dans l'IDE. Le TUI s'exécute dans le terminal intégré de l'éditeur pour les utilisateurs qui le souhaitent, tandis que l'extension consomme les événements `--json-fd` / `--json-file` pour piloter :

- Superpositions de diff en ligne lorsque l'agent modifie des fichiers.
- Un panneau latéral webview avec du markdown formaté, des appels d'outils avec coloration syntaxique et des citations cliquables.
- Indicateurs de barre d'état (réflexion / réponse / en attente d'approbation).
- Écritures programmatiques de `confirmation_response` lorsque l'utilisateur clique sur un bouton d'approbation natif de l'IDE.

### Frontends de chat basés sur navigateur

Un serveur Node/Bun lance le TUI dans un PTY pour ses sémantiques de rendu mais expose un canal WebSocket au navigateur. Les événements sur `--json-file` sont transférés au client ; les messages de l'utilisateur tapés dans le navigateur sont injectés via `--input-file`. Aucun parsing ANSI d'aucun côté.

### Observateurs CI / automatisation

Un job CI exécute Qwen Code avec une invite de tâche. L'humain voit le TUI dans le journal du job ; le système CI suit `--json-file` pour :

- Échouer le job si un événement `result` signale une erreur.
- Pousser les compteurs `token usage` / `duration_ms` / `tool_use` vers les métriques.
- Archiver la transcription complète comme artefact de build.

### Orchestration multi-agents

Un agent superviseur lance plusieurs workers TUI, chacun avec sa propre paire de fichiers événements/entrée. Il surveille la progression, injecte des invites de suivi et applique des politiques globales de budget/sécurité en approuvant ou refusant les appels d'outils sur tous les workers.

### Enregistrement, audit et rejeu de session

Tee chaque session TUI vers un fichier régulier avec `--json-file`. Plus tard :

- Les audits de conformité peuvent reconstruire exactement ce qui a été exécuté.
- Les tests de régression automatisés peuvent comparer les exécutions entre différentes versions de modèle.
- Un outil de rejeu peut réémettre des événements via le même protocole pour alimenter des tableaux de bord de visualisation.

### Tableaux de bord d'observabilité

Diffuser `--json-file` dans Loki / OTEL / n'importe quel pipeline qui accepte JSONL. Extraire `usage.input_tokens`, `tool_use.name`, `result.duration_api_ms` comme métriques de première classe dans Grafana. Pas besoin de regex de parsing de logs.

### Tests et QA

Les tests d'intégration lancent Qwen Code sans tête, le pilotent avec des scripts `--input-file` et vérifient les événements `--json-file`. Contrairement au parsing ANSI de stdout, les assertions sont stables lors des refontes de l'interface.

## Flags

| Option                  | Type             | Objectif                                                                                                                                    |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-fd <n>`         | number, `n >= 3` | Écrire des événements JSON structurés sur le descripteur de fichier `n`. L'appelant doit fournir ce fd via la configuration `stdio` du spawn ou une redirection shell. |
| `--json-file <path>`    | path             | Écrire des événements JSON structurés dans un fichier. Le chemin peut être un fichier régulier, un FIFO (tube nommé) ou `/dev/fd/N`.                               |
| `--input-file <path>`   | path             | Surveiller ce fichier pour les commandes JSONL écrites par un programme externe.                                                                         |

`--json-fd` et `--json-file` sont mutuellement exclusifs. Les fd 0, 1 et 2 sont rejetés pour éviter de corrompre la sortie du TUI lui-même.

## Pourquoi deux options de sortie ? (`--json-fd` vs `--json-file`)

À première vue, `--json-fd` semble suffisant — l'appelant lance Qwen Code avec un descripteur de fichier supplémentaire, le TUI y écrit les événements, terminé. En pratique, le passage de fd échoue dans le scénario d'intégration le plus important : l'exécution du TUI à l'intérieur d'un pseudo-terminal (PTY). C'est pourquoi cette fonctionnalité expose également une alternative basée sur un chemin.
### Quand `--json-fd` fonctionne

`child_process.spawn` pur avec un tableau `stdio` :

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Le spawn de Node prend en charge des entrées `stdio` arbitraires ; le fd 3 est hérité par l'enfant, qui peut y écrire directement. Zero-copy, zero-buffer, zero filesystem — le chemin le plus rapide.

### Pourquoi `--json-fd` ne fonctionne **pas** sous PTY

Les wrappers PTY comme [`node-pty`](https://github.com/microsoft/node-pty) et
[`bun-pty`](https://github.com/oven-sh/bun) sont la façon dont tout embedder sérieux
(extensions IDE, terminaux web, multiplexeurs de type tmux) héberge une TUI interactive.
Ils ne peuvent pas transmettre de fd supplémentaires à l'enfant, pour trois raisons qui se
renforcent mutuellement :

1. **Surface API.** `node-pty.spawn(file, args, options)` accepte `cwd`,
   `env`, `cols`, `rows`, `encoding`, etc. — mais **pas de tableau `stdio`**. Il n'y a
   tout simplement aucun endroit dans l'API pour dire « attache aussi ce fd comme fd 3
   dans l'enfant ». `bun-pty` expose la même structure.
2. **Sémantique de `forkpty(3)`.** Sous le capot, les wrappers PTY appellent
   `forkpty(3)` (ou l'équivalent `posix_openpt` + `login_tty`). Cet appel système alloue
   une paire de pseudo-terminal maître/esclave et redirige les fd 0/1/2 de l'enfant vers
   le côté esclave, de sorte que l'enfant pense être connecté à un vrai terminal. Tous les
   fd supérieurs à 2 dans le parent sont fermés par `login_tty`, qui appelle `close(fd)`
   pour `fd >= 3` avant `exec`. Les fd supplémentaires sont activement effacés, pas hérités.
3. **Effet secondaire du terminal de contrôle.** Même si vous parveniez à faire passer
   un fd supplémentaire, il ne s'agirait pas d'un terminal, donc le rendu TUI de l'enfant
   (qui écrit des séquences d'échappement en supposant un TTY sur fd 1) aurait toujours
   besoin de l'esclave pour sa sortie. Vous vous retrouveriez de toute façon avec deux
   transports indépendants.

En résumé : dès qu'un embedder a besoin d'un vrai TTY pour le rendu TUI —
ce qui est le cas de chaque extension IDE, chaque terminal web, chaque application de
chat de bureau — l'héritage de fd est exclu.

### `--json-file` comble le fossé

Un chemin de fichier est passé comme un argument CLI ordinaire, donc il survit à tous
les modèles de spawn :

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

L'enfant ouvre le fichier lui-même et y écrit les événements ; l'embedder suit le même
chemin avec `fs.watch` + des lectures incrémentielles. Trois points à noter :

- **Fichier régulier**, FIFO (pipe nommé) ou `/dev/fd/N` fonctionnent tous. FIFO est
  l'option avec la latence la plus faible lorsque les deux côtés sont sur le même hôte.
- Le pont ouvre les FIFO avec `O_NONBLOCK` et revient en mode bloquant sur `ENXIO`
  (pas encore de lecteur), donc le démarrage du PTY n'est jamais bloqué en attendant
  un consommateur.
- Pour l'isolation multi-session, utilisez des chemins par session sous
  `$XDG_RUNTIME_DIR` ou un répertoire créé par `mkdtemp` avec le mode `0700`.

### Quelle option utiliser ?

| Style d'embedding                                   | Utiliser                  |
| ------------------------------------------------- | -------------------- |
| `child_process.spawn` avec stdio simple            | `--json-fd`          |
| `node-pty` / `bun-pty` / tout hôte PTY             | `--json-file`        |
| Redirection shell / test manuel de pipeline       | les deux               |
| Collecte de logs CI (fichier régulier, lecture après sortie) | `--json-file`        |
| Latence la plus faible possible sur le même hôte              | `--json-file` + FIFO |

La règle générale : **si vous avez besoin que la TUI s'affiche correctement, vous avez besoin d'un PTY, ce qui signifie que vous avez besoin de `--json-file`.** `--json-fd` est destiné aux embedders plus simples qui ne se soucient pas de la fidélité de la TUI — généralement des wrappers programmatiques qui jettent stdout de toute façon.

## Démarrage rapide

Exécutez Qwen Code avec les deux canaux activés en utilisant des fichiers réguliers :

```bash
touch /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

Dans un second terminal, suivez le flux d'événements :

```bash
tail -f /tmp/qwen-events.jsonl
```

Dans un troisième terminal, envoyez une invite dans la TUI en cours d'exécution :

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

L'invite apparaît dans la TUI exactement comme si l'utilisateur l'avait tapée, et la réponse en streaming est reflétée dans `/tmp/qwen-events.jsonl`.

### Utiliser des FIFO (pipes nommés) pour la sortie d'événements

Les FIFO offrent une latence plus faible que les fichiers réguliers (pas d'E/S disque) et fonctionnent bien lorsque les deux côtés sont sur le même hôte. Le pont ouvre les FIFO avec `O_RDWR | O_NONBLOCK`, donc il **ne bloque pas** même si aucun lecteur n'est encore connecté — les événements sont mis en tampon dans le tampon du pipe du noyau jusqu'à ce qu'un lecteur s'attache.

> **Remarque :** `--input-file` nécessite un fichier régulier (pas un FIFO) car le watcher se base sur `stat.size` pour détecter de nouvelles données, qui est toujours 0 pour les FIFO.

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# TUI starts immediately — no need to start a reader first.

# In a second terminal, connect whenever ready:
cat /tmp/qwen-events.jsonl
```
Si aucun lecteur ne se connecte jamais, le pont se désactive automatiquement dès que le tampon interne dépasse 1 Mo. Le TUI continue de fonctionner normalement.

## Schéma des événements de sortie

Les événements sont émis au format JSON Lines (un objet par ligne). Le schéma est le même que celui utilisé par le mode non interactif `--output-format=stream-json`, avec `includePartialMessages` toujours activé.

Le premier événement sur le canal est toujours `system` / `session_start`, émis lors de la construction du pont. Utilisez-le pour associer le canal à un identifiant de session avant l'arrivée de tout autre événement.

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

Deux formes de commande sont acceptées sur `--input-file` :

```jsonc
// Submit a user message into the prompt queue
{ "type": "submit", "text": "What does this function do?" }

// Reply to a pending control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

Comportement :

- Les commandes `submit` sont mises en file d'attente. Si le TUI est occupé à répondre, elles sont réessayées automatiquement la prochaine fois que le TUI revient à l'état inactif.
- Les commandes `confirmation_response` sont dispatchées immédiatement et jamais mises en file d'attente, car un appel d'outil bloque et la réponse doit atteindre le gestionnaire `onConfirm` sous-jacent sans attendre un `submit` antérieur.
- Celui qui approuve un outil en premier gagne ; la réponse tardive de l'autre côté est ignorée sans dommage.
- Les lignes qui ne peuvent pas être analysées comme du JSON sont enregistrées et ignorées — elles n'arrêtent pas le watcher.

## Remarques sur la latence

Le fichier d'entrée est observé avec `fs.watchFile` à un intervalle de scrutation de 500 ms, donc la latence aller-retour maximale pour un `submit` distant est d'environ une demi-seconde. Ceci est intentionnel : la scrutation est portable sur toutes les plateformes et systèmes de fichiers (y compris macOS / montages réseau), et correspond au rythme typique d'intervention humaine que cette fonctionnalité cible. Le canal de sortie n'a pas de scrutation — les événements sont écrits de manière synchrone au fur et à mesure que le TUI les émet.

## Modes de défaillance

- **Mauvais descripteur de fichier.** Si le fd passé à `--json-fd` n'est pas ouvert ou est l'un des 0/1/2, le TUI imprime un avertissement sur `stderr` et continue sans activer la sortie double.
- **Mauvais chemin.** Si le fichier passé à `--json-file` ne peut pas être ouvert, le TUI imprime un avertissement et continue sans sortie double.
- **Déconnexion du consommateur.** Si le lecteur de l'autre côté du canal disparaît (`EPIPE`), le pont se désactive silencieusement et le TUI continue de fonctionner. Pas de nouvelle tentative.
- **Débordement du tampon FIFO.** Lors de l'écriture dans un FIFO sans lecteur attaché, les événements sont mis en mémoire tampon dans le tube du noyau (~64 Ko sur Linux) et le WriteStream Node.js. Une fois le tube plein ou le tampon interne dépassant 1 Mo, le pont se désactive et ferme le fd. Aucun `session_end` n'est émis dans ce cas — les consommateurs doivent traiter un flux fermé sans `session_end` comme une terminaison anormale. Le TUI continue de fonctionner normalement.
- **Exception de l'adaptateur.** Toute exception levée lors de l'émission d'un événement est interceptée, enregistrée et désactive le pont. Le TUI n'est jamais planté à cause d'une défaillance de la sortie double.

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
La TUI conserve le contrôle du terminal de l'utilisateur sur stdio 0/1/2, tandis que l'embedder lit les événements structurés sur le fichier associé au fd 3 et envoie des commandes en ajoutant des lignes JSONL dans `/tmp/qwen-input.jsonl`.

## Configuration basée sur les paramètres

Pour les embedders de longue durée, il est souvent fastidieux de faire passer les flags CLI à chaque lancement. Les mêmes canaux peuvent être configurés dans `settings.json` sous la clé de premier niveau `dualOutput` :

```jsonc
// ~/.qwen/settings.json  (niveau utilisateur)
// ou <workspace>/.qwen/settings.json  (niveau espace de travail)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

Règles de précédence :

- Le flag CLI **l'emporte** sur les paramètres. Passer `--json-file /foo` en ligne de commande écrase `dualOutput.jsonFile` dans les paramètres.
- `--json-fd` n'a pas d'équivalent dans les paramètres — le passage de fd est une préoccupation au moment du spawn qui ne peut pas être déclarée de manière statique.
- Si ni flag ni paramètre n'est présent, la double sortie reste désactivée (identique au comportement par défaut actuel).

Le flag `requiresRestart: true` signifie que les modifications ne prennent effet qu'au prochain lancement de Qwen Code, car le pont est construit une fois au démarrage.

## Démonstrations exécutables

Chaque script ci-dessous est prêt à être copié-collé. Commencez par POC&nbsp;1 pour vérifier que la build a la double sortie ; POC&nbsp;4 est l'analogue le plus proche d'une intégration réelle avec une extension IDE.

### POC 1 — observer le flux d'événements

Observez chaque événement structuré que la TUI émet lorsqu'un humain l'utilise normalement :

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...puis discutez normalement ; le terminal A affiche session_start,
# le cycle de vie user/assistant/result/control_request en temps réel.
```

Première ligne attendue dans le terminal A :

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — injecter des invites depuis l'extérieur

Pilotez la TUI depuis un second terminal sans toucher au clavier du premier :

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — la TUI répond comme si vous aviez tapé
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — pont d'autorisation d'outils à distance

Approuvez ou refusez les appels d'outils depuis un processus séparé :

```bash
# Terminal A — observer les control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Demandez à Qwen de faire quelque chose qui nécessite une approbation, par ex.
# "run `ls -la /tmp`". Un control_request apparaîtra dans le terminal A.
# Copiez le request_id, puis dans un troisième terminal :
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# La fenêtre de confirmation de la TUI disparaît et l'outil s'exécute.
```

Si vous répondez avec un `request_id` inconnu, le pont émet un `control_response` avec `subtype: "error"` sur le canal de sortie afin que votre consommateur puisse le journaliser ou réessayer :

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

### POC 4 — embedder Node (type IDE)

La forme la plus réaliste : un processus parent lance Qwen Code, suit les événements et injecte des invites selon son propre calendrier.

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

// Suivre le canal de sortie. En production, utilisez une queue
// basée sur un décalage d'octets ; celle-ci re-émet depuis 0 pour plus de simplicité.
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
    // Détection de fonctionnalité avant d'utiliser une capacité
    if (ev.data.supported_events.includes('control_request')) {
      console.log('[embedder] plan de contrôle des permissions disponible');
    }
  }
  if (ev.type === 'assistant') {
    console.log(
      '[embedder] tour de l\'assistant terminé, tokens =',
      ev.message.usage?.output_tokens,
    );
  }
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] session terminée proprement');
  }
});

// Après 2s, injecter une invite comme si l'utilisateur l'avait tapée
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
# La TUI de Qwen Code s'ouvre dans le terminal courant ; l'embedder enregistre
# les événements handshake + turn-end + session_end sur la sortie standard du parent.
```

### POC 5 — détection de fonctionnalité par handshake de capacité

Les anciennes versions de Qwen Code n'émettront pas `protocol_version`. Traitez ce champ
comme optionnel et détectez la fonctionnalité :

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'qwen-code dual output est présent mais protocole < 1 ; ' +
          'repli sur un comportement au mieux',
      );
    } else {
      console.log('qwen-code dual output protocole v' + v);
    }
  }
});
```

### POC 6 — session_end comme signal d'arrêt propre

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] arrêt propre, session', ev.data.session_id);
    // Vider les métriques, fermer les WebSockets, etc.
  }
});
```

Si la TUI plante avant `session_end`, le flux de sortie se ferme
(`EPIPE` à la prochaine écriture) ; les embedders doivent gérer les deux chemins.

### POC 7 — tests de défaillance (prouver que les flags ne cassent jamais la TUI)

```bash
qwen --json-fd 1
# stderr : "Warning: dual output disabled — ..."
# La TUI se lance normalement.

qwen --json-fd 9999
# stderr : "Warning: dual output disabled — fd 9999 not open"
# La TUI se lance normalement.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs rejette : "--json-fd and --json-file are mutually exclusive."
# Le processus se termine avant le démarrage de la TUI.

qwen --json-file /nonexistent/dir/x.jsonl
# avertissement sur stderr ; la TUI se lance quand même.
```

## Relation avec Claude Code

Claude Code expose un format d'événements JSON streamé similaire via
`--print --output-format stream-json`, mais uniquement en mode non interactif
— il n'a pas d'équivalent pour exécuter la TUI et un canal sidecar structuré
en même temps. Dual Output comble cette lacune.

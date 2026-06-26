# Sortie Duplex (Dual Output)

La sortie duplex est un mode sidecar pour le TUI interactif : pendant que Qwen Code continue de s'afficher normalement sur `stdout`, il émet simultanément un flux structuré d'événements JSON vers un canal séparé, permettant à un programme externe — une extension IDE, une interface web, un pipeline CI, un script d'automatisation — d'observer et de piloter la session.

Elle fournit également un canal inverse : un programme externe peut écrire des commandes JSONL dans un fichier que le TUI surveille, ce qui lui permet de soumettre des prompts et de répondre aux demandes d'autorisation d'outils comme si un humain était au clavier.

La sortie duplex est entièrement optionnelle. Lorsque les drapeaux ci-dessous sont absents, le TUI se comporte exactement comme avant, sans E/S supplémentaires ni changements de comportement.

## Cas d'utilisation

La sortie duplex est un mécanisme de bas niveau. Voici les intégrations concrètes qu'elle permet :

### Synchronisation en temps réel en mode double Terminal + ChatUI

Le cas d'utilisation phare. Une ChatUI web ou de bureau héberge le TUI dans un PTY et affiche une vue de conversation parallèle pilotée par le flux d'événements structuré :

- L'utilisateur peut saisir du texte dans l'une ou l'autre surface — le TUI (pour les utilisateurs avancés en terminal) ou l'interface web (pour une UX plus riche, des liens partageables, le mobile). Les deux vues restent synchronisées car chaque message transite par les mêmes événements JSON.
- Les demandes d'approbation d'outils apparaissent dans les deux endroits ; le premier qui approuve gagne.
- L'historique de la session est capturé textuellement depuis `--json-file`, de sorte que le côté serveur dispose d'une transcription canonique lisible par machine sans avoir à analyser l'ANSI.

### Extensions IDE (VS Code / JetBrains / Cursor / Neovim)

Intégration de Qwen Code dans l'IDE. Le TUI s'exécute dans le panneau de terminal intégré de l'éditeur pour les utilisateurs qui le souhaitent, tandis que l'extension consomme les événements `--json-fd` / `--json-file` pour piloter :

- Des superpositions de diff en ligne lorsque l'agent modifie des fichiers.
- Un panneau latéral webview avec du Markdown formaté, des appels d'outils avec coloration syntaxique et des citations cliquables.
- Des indicateurs dans la barre d'état (en train de réfléchir / en train de répondre / en attente d'approbation).
- Des écritures programmatiques de `confirmation_response` lorsque l'utilisateur clique sur un bouton d'approbation natif de l'IDE.

### Frontaux de chat basés sur le navigateur

Un serveur Node/Bun lance le TUI dans un PTY pour sa sémantique de rendu, mais expose un canal WebSocket au navigateur. Les événements de `--json-file` sont transmis au client ; les messages utilisateur saisis dans le navigateur sont injectés via `--input-file`. Pas d'analyse ANSI d'aucun côté.

### Observateurs CI / automation

Un job CI exécute Qwen Code avec un prompt de tâche. L'humain voit le TUI dans le journal du job ; le système CI suit `--json-file` pour :

- Échouer le job si un événement `result` signale une erreur.
- Pousser les compteurs `token usage` / `duration_ms` / `tool_use` vers les métriques.
- Archiver la transcription complète comme artefact de build.

### Orchestration multi-agents

Un agent superviseur lance plusieurs workers TUI, chacun avec sa propre paire de fichiers événements/entrée. Il surveille la progression, injecte des prompts de suivi et applique un budget global et des politiques de sécurité en approuvant ou refusant les appels d'outils sur tous les workers.

### Enregistrement de session, audit et rejeu

Dévier chaque session TUI vers un fichier régulier avec `--json-file`. Plus tard :

- Les audits de conformité peuvent reconstruire exactement ce qui a été exécuté.
- Les tests de régression automatisés peuvent comparer les exécutions entre différentes versions de modèle.
- Un outil de rejeu peut réémettre les événements via le même protocole pour alimenter des tableaux de bord de visualisation.

### Tableaux de bord d'observabilité

Diffuser `--json-file` vers Loki / OTEL / n'importe quel pipeline acceptant JSONL. Extraire `usage.input_tokens`, `tool_use.name`, `result.duration_api_ms` comme métriques de premier ordre dans Grafana. Pas besoin d'expressions régulières pour analyser les logs.

### Tests et QA

Les tests d'intégration lancent Qwen Code sans tête, le pilotent avec des scripts `--input-file` et vérifient les événements `--json-file`. Contrairement à l'analyse de la sortie ANSI, les assertions sont stables malgré les refontes de l'interface utilisateur.

## Drapeaux

| Drapeau                | Type             | Objectif                                                                                                                                                                     |
| ---------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-fd <n>`        | nombre, `n >= 3` | Écrire des événements JSON structurés vers le descripteur de fichier `n`. L'appelant doit fournir ce fd via la configuration `stdio` de spawn ou une redirection shell.         |
| `--json-file <chemin>` | chemin           | Écrire des événements JSON structurés dans un fichier. Le chemin peut être un fichier régulier, un FIFO (tube nommé) ou `/dev/fd/N`.                                          |
| `--input-file <chemin>`| chemin           | Surveiller ce fichier pour des commandes JSONL écrites par un programme externe.                                                                                             |

`--json-fd` et `--json-file` s'excluent mutuellement. Les fds 0, 1 et 2 sont rejetés pour éviter de corrompre la sortie propre du TUI.

## Pourquoi deux drapeaux de sortie ? (`--json-fd` vs `--json-file`)

À première vue, `--json-fd` semble suffisant — l'appelant lance Qwen Code avec un descripteur de fichier supplémentaire, le TUI écrit les événements dessus, terminé. En pratique, le passage de fd échoue dans le scénario d'intégration le plus important : l'exécution du TUI dans un pseudo-terminal (PTY). C'est pourquoi cette fonctionnalité expose également une alternative basée sur le chemin d'accès.

### Quand `--json-fd` fonctionne

Un simple `child_process.spawn` avec un tableau `stdio` :

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Le spawn de Node prend en charge des entrées `stdio` arbitraires ; fd 3 est hérité par l'enfant, qui peut écrire directement dessus. Zéro copie, zéro tampon, zéro système de fichiers — le chemin le plus rapide.

### Pourquoi `--json-fd` ne fonctionne **pas** avec un PTY

Les wrappers PTY comme [`node-pty`](https://github.com/microsoft/node-pty) et [`bun-pty`](https://github.com/oven-sh/bun) sont la façon dont tout intégrateur sérieux (extensions IDE, terminaux web, multiplexeurs de type tmux) héberge un TUI interactif. Ils ne peuvent pas transmettre de fds supplémentaires à l'enfant, pour trois raisons qui se renforcent mutuellement :

1. **Surface d'API.** `node-pty.spawn(fichier, args, options)` accepte `cwd`, `env`, `cols`, `rows`, `encoding`, etc. — mais **pas de tableau `stdio`**. Il n'y a tout simplement aucun endroit dans l'API pour dire "attachez aussi ce fd en tant que fd 3 dans l'enfant". `bun-pty` expose la même forme.
2. **Sémantique de `forkpty(3)`.** Sous le capot, les wrappers PTY appellent `forkpty(3)` (ou l'équivalent `posix_openpt` + `login_tty`). Cet appel système alloue une paire maître/esclave de pseudo-terminal et redirige les fds 0/1/2 de l'enfant vers le côté esclave afin que l'enfant pense être attaché à un vrai terminal. Tous les fds supérieurs à 2 dans le parent sont fermés par `login_tty`, qui appelle `close(fd)` pour `fd >= 3` avant `exec`. Les fds supplémentaires sont activement supprimés, pas hérités.
3. **Effet secondaire du terminal de contrôle.** Même si vous passiez un fd supplémentaire en force, ce ne serait pas un terminal, donc le moteur de rendu TUI de l'enfant (qui écrit des séquences d'échappement en supposant un TTY sur fd 1) aurait toujours besoin de l'esclave pour sa sortie. Vous vous retrouveriez de toute façon avec deux transports indépendants.

En bref : dès qu'un intégrateur a besoin d'un vrai TTY pour le rendu TUI — ce qui est le cas de chaque extension IDE, chaque terminal web, chaque application de chat de bureau — l'héritage de fd est hors de question.

### `--json-file` comble le fossé

Un chemin de fichier est passé comme argument CLI ordinaire, donc il survit à tous les modèles de spawn :

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

L'enfant ouvre le fichier lui-même et y écrit les événements ; l'intégrateur suit le même chemin avec `fs.watch` + lectures incrémentales. Trois choses à noter :

- **Fichier régulier**, FIFO (tube nommé) ou `/dev/fd/N` fonctionnent tous. FIFO est l'option à la latence la plus faible lorsque les deux côtés sont sur le même hôte.
- Le pont ouvre les FIFOs avec `O_NONBLOCK` et revient en mode bloquant sur `ENXIO` (pas encore de lecteur), donc le démarrage du PTY n'est jamais bloqué en attendant un consommateur.
- Pour l'isolation multi-session, utilisez des chemins par session sous `$XDG_RUNTIME_DIR` ou un répertoire `mkdtemp` avec le mode `0700`.

### Quel drapeau dois-je utiliser ?

| Style d'intégration                               | Utiliser            |
| ------------------------------------------------- | ------------------- |
| `child_process.spawn` avec stdio simple           | `--json-fd`         |
| `node-pty` / `bun-pty` / tout hôte PTY            | `--json-file`       |
| Redirection shell / test de pipeline manuel       | les deux            |
| Collecte de logs CI (fichier régulier, lecture après sortie) | `--json-file` |
| Latence la plus faible possible sur le même hôte  | `--json-file` + FIFO |

La règle générale : **si vous avez besoin que le TUI s'affiche correctement, vous avez besoin d'un PTY, ce qui signifie que vous avez besoin de `--json-file`.** `--json-fd` est destiné aux intégrateurs plus simples qui ne se soucient pas de la fidélité du TUI — généralement des wrappers programmatiques qui jettent de toute façon la sortie standard.

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

Dans un troisième terminal, poussez un prompt dans le TUI en cours d'exécution :

```bash
echo '{"type":"submit","text":"Expliquez ce dépôt"}' >> /tmp/qwen-input.jsonl
```

Le prompt apparaît dans le TUI exactement comme si l'utilisateur l'avait tapé, et la réponse en streaming est reflétée dans `/tmp/qwen-events.jsonl`.

### Utilisation de FIFOs (tubes nommés) pour la sortie des événements

Les FIFOs offrent une latence plus faible que les fichiers réguliers (pas d'E/S disque) et fonctionnent bien lorsque les deux côtés sont sur le même hôte. Le pont ouvre les FIFOs avec `O_RDWR | O_NONBLOCK`, donc il **ne bloque pas** même si aucun lecteur n'est encore connecté — les événements sont mis en tampon dans le tampon du tube du noyau jusqu'à ce qu'un lecteur se connecte.

> [!note]
> `--input-file` nécessite un fichier régulier (pas un FIFO) car le watcher se fie à `stat.size` pour détecter de nouvelles données, qui est toujours 0 pour les FIFOs.

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# Le TUI démarre immédiatement — pas besoin de démarrer un lecteur d'abord.

# Dans un second terminal, connectez-vous quand vous êtes prêt :
cat /tmp/qwen-events.jsonl
```

Si aucun lecteur ne se connecte jamais, le pont se désactive automatiquement une fois que le tampon interne dépasse 1 Mo. Le TUI continue de fonctionner normalement.

## Schéma des événements de sortie

Les événements sont émis sous forme de JSON Lines (un objet par ligne). Le schéma est le même que celui utilisé par le mode non interactif `--output-format=stream-json`, avec `includePartialMessages` toujours activé.

Le premier événement sur le canal est toujours `system` / `session_start`, émis lors de la construction du pont. Utilisez-le pour corréler le canal avec un identifiant de session avant l'arrivée de tout autre événement.

```jsonc
// Cycle de vie de la session
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/chemin/vers/cwd" }
}

// Événements de streaming pour un tour d'assistant en cours
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Bonjour" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// Messages terminés
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// Plan de contrôle des permissions (uniquement lorsqu'un outil nécessite une approbation)
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

Deux formes de commandes sont acceptées sur `--input-file` :

```jsonc
// Soumettre un message utilisateur dans la file d'attente de prompts
{ "type": "submit", "text": "Que fait cette fonction ?" }

// Répondre à un control_request en attente
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

Comportement :

- Les commandes `submit` sont mises en file d'attente. Si le TUI est occupé à répondre, elles sont réessayées automatiquement la prochaine fois que le TUI revient à l'état inactif.
- Les commandes `confirmation_response` sont dispatchées immédiatement et jamais mises en file d'attente, car un appel d'outil bloque et la réponse doit atteindre le gestionnaire `onConfirm` sous-jacent sans attendre un éventuel `submit` antérieur.
- Le premier côté qui approuve un outil gagne ; la réponse tardive de l'autre côté est ignorée sans conséquence.
- Les lignes qui ne peuvent pas être analysées comme du JSON sont journalisées et ignorées — elles n'arrêtent pas le watcher.

## Remarques sur la latence

Le fichier d'entrée est observé avec `fs.watchFile` à un intervalle de 500 ms, donc la latence aller-retour maximale pour un `submit` distant est d'environ une demi-seconde. C'est intentionnel : le sondage est portable entre les plateformes et les systèmes de fichiers (y compris macOS / les montages réseau) et correspond au rythme typique d'intervention humaine que la fonctionnalité vise. Le canal de sortie n'a pas de sondage — les événements sont écrits de manière synchrone au fur et à mesure que le TUI les émet.

## Modes de défaillance

- **Mauvais fd.** Si le fd passé à `--json-fd` n'est pas ouvert ou est l'un des 0/1/2, le TUI affiche un avertissement sur `stderr` et continue sans sortie duplex activée.
- **Mauvais chemin.** Si le fichier passé à `--json-file` ne peut pas être ouvert, le TUI affiche un avertissement et continue sans sortie duplex.
- **Déconnexion du consommateur.** Si le lecteur de l'autre côté du canal disparaît (`EPIPE`), le pont se désactive silencieusement et le TUI continue de s'exécuter. Pas de nouvelle tentative.
- **Débordement du tampon FIFO.** Lors de l'écriture dans un FIFO sans lecteur attaché, les événements sont mis en tampon dans le tube du noyau (~64 Ko sur Linux) et le WriteStream de Node.js. Une fois le tube plein ou le tampon interne dépassant 1 Mo, le pont se désactive et ferme le fd. Aucun `session_end` n'est émis dans ce cas — les consommateurs doivent traiter un flux fermé sans `session_end` comme une terminaison anormale. Le TUI continue de fonctionner normalement.
- **Exception de l'adaptateur.** Toute exception levée lors de l'émission d'un événement est interceptée, journalisée et désactive le pont. Le TUI n'est jamais planté par une défaillance de la sortie duplex.

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

Le TUI possède toujours le terminal de l'utilisateur sur stdio 0/1/2, tandis que l'intégrateur lit les événements structurés sur le fichier soutenant fd 3 et pousse les commandes en ajoutant des lignes JSONL à `/tmp/qwen-input.jsonl`.

## Configuration basée sur les paramètres

Pour les intégrateurs de longue durée, il est souvent peu pratique de faire passer les drapeaux CLI à chaque lancement. Les mêmes canaux peuvent être configurés dans `settings.json` sous la clé de niveau supérieur `dualOutput` :

```jsonc
// ~/.qwen/settings.json  (niveau utilisateur)
// ou <espace de travail>/.qwen/settings.json  (niveau espace de travail)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

Règles de précédence :

- Le drapeau CLI **l'emporte** sur les paramètres. Passer `--json-file /foo` en ligne de commande remplace `dualOutput.jsonFile` dans les paramètres.
- `--json-fd` n'a pas d'équivalent dans les paramètres — le passage de fd est une préoccupation au moment du spawn qui ne peut pas être déclarée statiquement.
- Si ni le drapeau ni le paramètre n'est présent, la sortie duplex reste désactivée (identique à la valeur par défaut actuelle).

Le drapeau `requiresRestart: true` signifie que les modifications ne prennent effet qu'au prochain lancement de Qwen Code, car le pont est construit une fois au démarrage.

## Démonstrations exécutables

Chaque script ci-dessous est prêt à être copié-collé. Commencez par POC&nbsp;1 pour vérifier que la build a la sortie duplex ; POC&nbsp;4 est l'analogue le plus proche d'une véritable intégration d'extension IDE.

### POC 1 — observer le flux d'événements

Regardez chaque événement structuré que le TUI émet pendant qu'un humain l'utilise normalement :

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...ensuite discuter normalement ; le terminal A montre session_start,
# le cycle de vie user/assistant/result/control_request en temps réel.
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

# Terminal B — le TUI répond comme si vous l'aviez tapé
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — pont de permissions d'outil à distance

Approuvez ou refusez les appels d'outils depuis un processus séparé :

```bash
# Terminal A — observer les control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Demandez à Qwen de faire quelque chose qui nécessite une approbation, par exemple
# "run `ls -la /tmp`". Un control_request apparaîtra dans le terminal A.
# Copiez le request_id, puis dans un troisième terminal :
echo '{"type":"confirmation_response","request_id":"<collez-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# Le prompt de confirmation du TUI disparaît et l'outil s'exécute.
```

Si vous répondez avec un `request_id` inconnu, le pont émet un `control_response` avec `subtype: "error"` sur le canal de sortie afin que votre consommateur puisse le journaliser ou réessayer :

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "request_id inconnu (déjà résolu, annulé ou jamais émis)"
  }
}
```

### POC 4 — Intégrateur Node (comme un IDE)

La forme la plus réaliste : un processus parent lance Qwen Code, suit les événements et injecte des prompts à son propre rythme.

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

// Suivre le canal de sortie. En production, vous utiliseriez un suivi
// approprié par décalage d'octets ; celui-ci re-stream depuis 0 par souci de concision.
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

// Après 2s, injecter un prompt comme si l'utilisateur l'avait tapé
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'bonjour de l\'intégrateur' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```
Exécutez avec :

```bash
npx tsx demo-embedder.ts
# La TUI Qwen Code s'ouvre dans le terminal courant ; l'embedder journalise
# les événements handshake + turn-end + session_end sur la sortie standard du parent.
```

### POC 5 — détection de fonctionnalité par handshake de capacités

Les anciennes versions de Qwen Code n'émettent pas `protocol_version`.
Traitez ce champ comme optionnel et détectez la fonctionnalité :

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'La sortie duale de qwen-code est présente mais le protocole < 1 ; ' +
          'retour au comportement au mieux',
      );
    } else {
      console.log('Protocole de sortie duale qwen-code v' + v);
    }
  }
});
```

### POC 6 — session_end comme signal de terminaison propre

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
(`EPIPE` à la prochaine écriture) ; les embedders doivent gérer les deux cas.

### POC 7 — tests de défaillance (prouver que les flags ne cassent jamais la TUI)

```bash
qwen --json-fd 1
# stderr : "Warning: dual output disabled — ..."
# La TUI se lance normalement.

qwen --json-fd 9999
# stderr : "Warning: dual output disabled — fd 9999 not open"
# La TUI se lance normalement.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs rejette : "--json-fd et --json-file sont mutuellement exclusifs."
# Le processus se termine avant le démarrage de la TUI.

qwen --json-file /nonexistent/dir/x.jsonl
# avertissement stderr ; la TUI se lance normalement.
```

## Relation avec Claude Code

Claude Code expose un format d'événements JSON-stream similaire avec
`--print --output-format stream-json`, mais uniquement en mode non interactif
— il n'a pas d'équivalent pour exécuter la TUI et un canal structuré
parallèle en même temps. Dual Output comble cette lacune.
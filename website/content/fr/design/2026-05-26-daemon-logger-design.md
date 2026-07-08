# `qwen serve` Logger de fichiers du démon — Conception

- **Issue** : [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **Branche** : `feat/support_daemon_logger`
- **Statut** : conception approuvée, en attente du plan d'implémentation
- **Date** : 2026-05-26

## 1. Problème

`qwen serve` émet des diagnostics au niveau du démon (cycle de vie, erreurs de route, stderr des enfants ACP) vers `process.stderr`. Cela fonctionne sous systemd/Docker, mais c'est fragile pour une utilisation SDK / Desktop / démon local : lorsqu'un client voit `POST /session/:id/prompt` renvoyer un HTTP 500, le contexte de la route + session + pile d'exécution est perdu, à moins que l'opérateur n'ait redirigé manuellement stderr.

`createDebugLogger` (dans `packages/core/src/utils/debugLogger.ts`) est limité à la portée de la session : il nécessite une `DebugLogSession` active et écrit dans `${runtimeBaseDir}/debug/<sessionId>.txt`. Le démon serve démarre **avant** qu'une session n'existe, de sorte que les appels au niveau du démon seraient silencieusement ignorés (no-op). Il ne peut pas non plus être réutilisé sans modifier la sémantique `debug/latest` par session.

Cette conception ajoute un sink de fichier spécifique au démon, en complément du comportement stderr existant, afin que les diagnostics du démon survivent sans redirection du shell.

## 2. Périmètre

### Dans le périmètre

- Un nouveau logger initialisé une seule fois par processus `runQwenServe`.
- Fichier situé dans `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`, en mode ajout (append).
- Tee de :
  - Messages de cycle de vie / arrêt / signal de `runQwenServe.ts`
  - Erreurs de route de `sendBridgeError` (`server.ts`)
  - `writeServeDebugLine` de `bridge.ts` (lorsque `QWEN_SERVE_DEBUG` est défini)
  - Transmission du stderr des enfants ACP de `spawnChannel.ts`
- Désactivation (opt-out) via `QWEN_DAEMON_LOG_FILE=0|false|off|no`.
- Lien symbolique `latest` dans le répertoire du démon pour `tail -f`.
- Documentation dans les docs CLI de serve.

### Hors périmètre (non-objectifs de l'issue)

- Remplacer OpenTelemetry ou ajouter du traçage pour le démon.
- Export structuré des logs d'erreurs pour l'entreprise (issue #2014).
- Rotation ou suppression des logs de debug de session existants.
- Rotation des logs / limite de taille pour le log du démon lui-même (reporté à une PR ultérieure). Un avertissement stderr est émis au démarrage si le fichier existant est anormalement volumineux ; aucune action automatique.

## 3. Architecture

### 3.1 Limites des modules

| Couche | Nouveau / Modifié | Responsabilité |
| --- | --- | --- |
| `packages/cli/src/serve/daemonLogger.ts` | **nouveau** | Sink : init, format, ajout au fichier, tee vers stderr, flush, lien symbolique latest |
| `packages/cli/src/serve/runQwenServe.ts` | modifié | Initialise le logger au démarrage ; remplace les `writeStderrLine` du cycle de vie par `daemonLog.*` ; `await flush()` à l'arrêt ; passe `onDiagnosticLine` au bridge |
| `packages/cli/src/serve/server.ts` | modifié | `sendBridgeError(...)` passe par `daemonLog.error(...)` |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`) | modifié | Ajoute l'optionnel `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void` |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine` | modifié | Si `onDiagnosticLine` est injecté, duplique (tee) la même ligne |
| `packages/acp-bridge/src/spawnChannel.ts` | modifié | Le forwarder de stderr des enfants duplique (tee) chaque ligne préfixée vers `onDiagnosticLine` |

**Intention de conception** : `daemonLogger.ts` est un fichier unique, local au cli, sans singleton global. `acp-bridge` reste ignorant du cli — il ne voit qu'un callback. Le graphe de dépendances reste inchangé.

### 3.2 Pas de singleton global

Le logger est créé dans `runQwenServe`, passé par fermeture (closure) aux modules internes de serve qui en ont besoin (ou par callback à `acp-bridge`). Justification :

- Reflète la façon dont `BridgeOptions` injecte déjà les dépendances.
- Évite les fuites d'état entre les tests que `debugLogger` a rencontrées par le passé (`resetDebugLoggingState()` existe pour cette raison).

## 4. ID du démon et chemin du fichier

- Chemin : `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - Résolu en `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`.
  - Réutilise `Storage.getGlobalDebugDir()` afin que l'override du répertoire d'exécution (variable d'env, contextuel) s'applique automatiquement.
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` permet de distinguer plusieurs démons sur le même workspace.
  - `workspaceHash` est de longueur fixe, sûr pour les noms de fichiers, et stable pour le même chemin de workspace.
- Lien symbolique `latest` : `~/.qwen/debug/daemon/latest` → fichier de log du processus actuel. Mis à jour à l'init à l'aide du helper `updateSymlink` existant (`packages/core/src/utils/symlink.ts`). L'échec du lien symbolique est loggué et ignoré — ne dégrade pas les écritures principales. Distinct de `${runtimeBaseDir}/debug/latest` (limité à la session) conformément au non-objectif.
- Mode de fichier : `'a'` (ajout sur `O_APPEND | O_CREAT`). Les fichiers existants survivent aux redémarrages à des fins d'analyse post-mortem.

## 5. API publique

```ts
// packages/cli/src/serve/daemonLogger.ts

export interface DaemonLogContext {
  route?: string;
  sessionId?: string;
  clientId?: string;
  childPid?: number;
  channelId?: string;
  [key: string]: unknown;
}

export interface DaemonLogger {
  info(message: string, ctx?: DaemonLogContext): void;
  warn(message: string, ctx?: DaemonLogContext): void;
  /**
   * `err.stack` est ajouté sous forme de lignes de suite indentées après le message.
   * `err` et `ctx` sont tous deux optionnels et indépendants.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * Tee (fichier uniquement) pour les lignes dont l'appelant écrit déjà sur stderr
   * (forwarder de stderr des enfants ACP, `writeServeDebugLine`). La ligne est
   * ajoutée au log du démon sous le préfixe standard `<timestamp> [<LEVEL>] [DAEMON] `
   * ; elle n'est PAS renvoyée sur stderr (ce qui doublerait la sortie de l'opérateur).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Chemin absolu vers le fichier de log du démon. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Vide les ajouts en attente. Appelé depuis le handler d'arrêt de runQwenServe. */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // default process.pid
  now?: () => Date; // default () => new Date()
  stderr?: (line: string) => void; // default writeStderrLine
  baseDir?: string; // default Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` de manière synchrone :

1. Calcule `daemonId` + le chemin du log.
2. `mkdirSync(parentDir, { recursive: true })` — échec → retourne un logger no-op, écrit un avertissement sur stderr. Le démarrage continue.
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — écrit `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>` de manière synchrone. Cela sert également de sonde d'accessibilité en écriture ; en cas de EACCES/ENOSPC, mode d'échec = logger no-op + un avertissement sur stderr.
4. Met à jour le lien symbolique `latest` (au mieux, erreurs ignorées).
5. Retourne le logger ; les appels suivants à `info/warn/error/raw` mettent en file d'attente des `fs.promises.appendFile` asynchrones.

Si `process.env['QWEN_DAEMON_LOG_FILE']` vaut `0|false|off|no`, `initDaemonLogger` court-circuite vers un logger no-op avant tout appel au système de fichiers.

## 6. Format des lignes de log

Reflète `debugLogger.buildLogLine` pour une parité visuelle :

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- Timestamp : ISO 8601, UTC.
- Niveau : `INFO` | `WARN` | `ERROR`. (Pas de DEBUG initialement — `QWEN_SERVE_DEBUG` entre en tant que `INFO` via `raw()`.)
- Tag : littéral `DAEMON`.
- Contexte de trace : `trace.getActiveSpan()` lorsque disponible ; même logique que `debugLogger.getActiveSpanTraceContext`. Helper extrait dans un module partagé (`packages/core/src/utils/traceContext.ts` ?) ou dupliqué localement — à voir lors de la planification.
- Champs de contexte : rendus sous la forme `key=value`, ordre fixe (`route`, `sessionId`, `clientId`, `childPid`, `channelId`), puis toutes les clés supplémentaires triées lexicographiquement. Les valeurs contenant des espaces ou `=` sont entourées de guillemets via `JSON.stringify`.
- Pile d'erreurs : ajoutée sous forme de lignes de suite indentées après le message.
- `raw(line, level)` écrit la ligne telle quelle après le préfixe standard `<timestamp> [<LEVEL>] [DAEMON] `, sans traitement supplémentaire.

**Sémantique du tee (important) :**

- `info` / `warn` / `error` écrivent à la **fois** dans le fichier de log du démon **et** sur stderr (via le writer `stderr` injecté). Les appelants remplaçant un précédent `writeStderrLine(...)` les utilisent directement ; aucun appel stderr séparé n'est nécessaire.
- `raw` écrit **uniquement dans le fichier**. Utilisé par le forwarder de stderr des enfants ACP et `writeServeDebugLine`, où l'appelant écrit déjà sur stderr via son chemin existant. Une duplication inonderait la sortie de l'opérateur.

## 7. Flux de démarrage / arrêt

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // boot banner is stderr-only to avoid the line referencing itself

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // injected for sendBridgeError

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- La bannière de démarrage est uniquement sur stderr (la ligne de chemin à son propre sujet serait circulaire si elle était logguée).
- `initDaemonLogger` est synchrone afin que tout échec soit visible immédiatement au démarrage, et non enfoui après la première erreur.
- Le `flush()` d'arrêt est la dernière étape attendue avant `process.exit`. SIGKILL est impossible à flusher par définition — nous l'acceptons.

## 8. Tableau de couverture

| Source | Aujourd'hui | Après |
| --- | --- | --- |
| Cycle de vie / signaux / avertissements de config de `runQwenServe.ts` | `writeStderrLine(...)` | `daemonLog.info \| warn(...)` (stderr se produit toujours — `daemonLog` fait un tee) |
| `runQwenServe.ts` "listening on URL" (stdout) | `writeStdoutLine(...)` | inchangé — les scripts de l'opérateur parsent stdout |
| `server.ts:sendBridgeError` | `writeStderrLine(...)` avec route/sessionId | `daemonLog.error(msg, err, { route, sessionId, ... })` (stderr toujours émis par le tee de daemonLog) |
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`) | `writeStderrLine('qwen serve debug: ...')` | tee vers `onDiagnosticLine(line, 'info')` |
| stderr des enfants de `spawnChannel.ts` | `process.stderr.write(prefix + line + '\n')` | ainsi que `onDiagnosticLine(prefix + line, 'warn')` |
| Appelants de `writeStdoutLine` | inchangé | inchangé |
| Erreurs d'utilisation CLI / argparse (validation précoce de `runQwenServe`) | `writeStderrLine(...)` | inchangé (le logger n'existe peut-être pas encore) |
Chaque écriture `stderr` existante est préservée. Le log du daemon est **additif**, jamais substitutif.

## 9. Chemin d'écriture et flush

- File d'attente interne : une seule chaîne `Promise<void>` (`this.pending = this.pending.then(() => fs.promises.appendFile(...))`).
- Chaque appel à `info/warn/error/raw` met en file d'attente un ajout (fichier) et, pour `info/warn/error`, appelle également de manière synchrone le writer `stderr` injecté.
- L'ordre d'écriture sur `stderr` est préservé (synchrone, avant la mise en file d'attente de l'ajout). Les ajouts au fichier sont à cohérence à terme selon l'ordre de mise en file d'attente.
- Les échecs d'écriture activent un flag interne `degraded` et émettent un avertissement `stderr` unique. Les appels suivants tentent toujours l'écriture, mais le compteur n'est pas maintenu.
- `flush()` renvoie la promesse en fin de chaîne.
- Pas de couche de buffer : chaque appel = un `appendFile`. Le volume est faible (erreurs de route + cycle de vie) ; le micro-batching est une optimisation prématurée.

## 10. Configuration

| Env var                                         | Behavior                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`        | `initDaemonLogger` renvoie un no-op ; le tee est un no-op ; `stderr` reste inchangé |
| `QWEN_DAEMON_LOG_FILE=<anything else>` or unset | Activé (par défaut)                                                          |
| `QWEN_RUNTIME_DIR=<path>`                       | Déplace la racine `~/.qwen`, le log du daemon suit le mouvement (sémantique existante) |
| `QWEN_SERVE_DEBUG=1`                            | Existant — `writeServeDebugLine` s'active ; les lignes sont maintenant aussi copiées (tee) vers le log du daemon |

`QWEN_DAEMON_LOG_FILE` est intentionnellement séparé de `QWEN_DEBUG_LOG_FILE` afin que la désactivation des logs de debug par session ne désactive pas le log du daemon de l'opérateur (et vice versa).

## 11. Gestion des erreurs

- Échec de `mkdir`/`open` dans `initDaemonLogger` → logger no-op + un avertissement `stderr`. Le démarrage du daemon se poursuit. L'opérateur ne voit rien dans le fichier mais reçoit toujours les messages sur `stderr`.
- Échecs par ajout (`append`) → activation du flag `degraded`, émission d'un avertissement `stderr` unique, poursuite des tentatives. L'issue ne mentionne aucun signal UI pour le mode dégradé, aucune surface publique n'est donc nécessaire.
- Rejet de `flush()` → intercepté dans le handler de shutdown, loggé via `writeStderrLine`. Ne bloque pas la sortie.
- Échec du symlink `latest` → ignoré ; les écritures principales ne sont pas affectées.

## 12. Tests

### `daemonLogger.test.ts` (nouveau)

- `baseDir` isolé (sandboxed), `now`, `pid`, `stderr` mockés.
- Dérivation du chemin et de l'ID du daemon, incluant le `workspaceHash` de 8 caractères pour une entrée connue.
- Le symlink `latest` est créé et mis à jour lors des invocations suivantes de `initDaemonLogger` dans le même répertoire.
- Formatage des niveaux (INFO/WARN/ERROR), ordre des champs de contexte, suite de la stack d'erreur.
- Injection du contexte de trace lorsqu'un span actif existe.
- `raw(line, level)` écrit la ligne préfixée verbatim.
- `flush()` ne se résout qu'après que toutes les écritures en file d'attente ont atteint le fichier.
- `QWEN_DAEMON_LOG_FILE=0` → aucun fichier créé.
- Échec de `mkdir` → logger no-op, un avertissement `stderr`, les appels suivants ne lèvent pas d'exception.
- Échec de `appendFile` → flag `degraded` activé, un avertissement `stderr`.

### `runQwenServe.test.ts` (étendre)

- Le démarrage écrit la ligne `daemon started ...` dans le log.
- Le handler de shutdown attend `daemonLog.flush()` avant de quitter.
- La bannière de démarrage sur `stderr` contient le chemin du log du daemon.

### `server.test.ts` (étendre)

- Une route qui lève une exception transmet l'erreur via `daemonLog.error(...)` avec la bonne `route` et le bon `sessionId`.

### Tests acp-bridge (étendre)

- Le callback `onDiagnosticLine` est invoqué depuis `writeServeDebugLine` lorsque `QWEN_SERVE_DEBUG=1` et depuis le forwarder `stderr` du child de `spawnChannel`. Les tests injectent un faux capturant (fake) ; pas de système de fichiers.

## 13. Documentation

- `docs/cli/serve.md` (ou là où `serve` est documenté) gagne une section "Daemon log file" couvrant : le chemin, le format de l'ID du daemon, le symlink `latest`, l'opt-out via `QWEN_DAEMON_LOG_FILE`, et la distinction avec le `debug/<sessionId>.txt` par session.
- README sous `packages/cli/src/serve/` s'il en existe un.
- Pas de fichier de type CHANGELOG dans ce repo ; les notes de version sont gérées séparément.

## 14. Rollback

- Modification purement additive. Rollback = revert le commit :
  - Supprimer `daemonLogger.ts` + son test.
  - Revert les changements de cycle de vie / `sendBridgeError` / bridge / `spawnChannel` dans `runQwenServe.ts`.
  - Retirer `onDiagnosticLine` de `BridgeOptions`.
- Aucun état sur le disque à nettoyer ; les fichiers de log du daemon existants deviennent orphelins mais inoffensifs.

## 15. Critères d'acceptation (de l'issue)

| Criterion                                                           | How met                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `qwen serve` crée / ajoute au log du daemon sans redirection shell  | `initDaemonLogger` ouvre le fichier au démarrage                                                  |
| HTTP 500 de `POST /session/:id/prompt` corrélable dans le log du daemon | `sendBridgeError` écrit `route=` + `sessionId=`                                                   |
| Les lignes `stderr` du child ACP sont aussi dans le log du daemon   | `spawnChannel` fait un tee via `onDiagnosticLine`                                                 |
| Le logging fonctionne avant la première session et après la fermeture de toutes les sessions | Non limité à une session ; vit pendant toute la durée de vie du daemon                            |
| Le comportement `stderr` existant est intact                        | Toutes les écritures sont additives ; aucun appel à `writeStderrLine` n'est supprimé sans qu'un équivalent ne soit laissé en place |
| Chemin du log + opt-out documentés                                  | Section docs dans §13                                                                             |

## 16. Questions en suspens

Aucune bloquante. Suivis possibles :

- Le symlink `latest` doit-il aller dans `~/.qwen/debug/daemon/latest` ou `~/.qwen/debug/daemon-latest` ? La spec choisit le premier pour la propreté du répertoire.
- Devrions-nous proposer une sortie JSON-line comme flag futur (par ex. `QWEN_DAEMON_LOG_FORMAT=json`) ? Hors scope pour cette PR ; l'export structuré est ce que gère la #2014.
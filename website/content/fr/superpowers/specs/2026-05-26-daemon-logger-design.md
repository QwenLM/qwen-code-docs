# `qwen serve` Enregistreur de fichiers du démon — Conception

- **Problème** : [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **Branche** : `feat/support_daemon_logger`
- **Statut** : conception approuvée, plan d'implémentation en attente
- **Date** : 2026-05-26

## 1. Problème

`qwen serve` émet les diagnostics au niveau du démon (cycle de vie, erreurs de routes, stderr des enfants ACP) vers `process.stderr`. Cela fonctionne sous systemd/Docker, mais est fragile pour une utilisation SDK / Bureau / démon local : lorsqu'un client voit `POST /session/:id/prompt` retourner HTTP 500, le contexte de la route + session + stack est perdu à moins que l'opérateur n'ait redirigé manuellement stderr.

`createDebugLogger` (dans `packages/core/src/utils/debugLogger.ts`) est limité à une session : il nécessite une `DebugLogSession` active et écrit dans `${runtimeBaseDir}/debug/<sessionId>.txt`. Le démon du serveur démarre **avant** qu'une session n'existe, donc les appels au niveau du démon seraient silencieusement ignorés. Il ne peut pas non plus être réutilisé sans changer la sémantique `debug/latest` propre à chaque session.

Cette conception ajoute un récepteur de fichier spécifique au démon, en complément du comportement existant sur stderr, afin que les diagnostics du démon survivent sans redirection shell.

## 2. Périmètre

### Dans le périmètre

- Un nouvel enregistreur initialisé une fois par processus `runQwenServe`.
- Fichier à `${QWEN_RUNTIME_DIR ou ~/.qwen}/debug/daemon/<daemon-id>.log`, mode append.
- Té de :
  - Messages du cycle de vie / arrêt / signal de `runQwenServe.ts`
  - `sendBridgeError` (`server.ts`) erreurs de routes
  - `bridge.ts` `writeServeDebugLine` (quand `QWEN_SERVE_DEBUG` est défini)
  - `spawnChannel.ts` redirection stderr des enfants ACP
- Désactivation via `QWEN_DAEMON_LOG_FILE=0|false|off|no`.
- Lien symbolique `latest` dans le répertoire du démon pour `tail -f`.
- Documentation dans la documentation CLI de serve.

### Hors périmètre (non-objectifs du problème)

- Remplacer OpenTelemetry ou ajouter du tracing du démon.
- Export structuré des logs d'erreur d'entreprise (problème #2014).
- Rotation ou suppression des logs de session existants.
- Rotation / limite de taille pour le log du démon lui-même (reporté à une PR suivante). Un avertissement sur stderr au démarrage est émis si le fichier existant est anormalement volumineux ; aucune action automatique.

## 3. Architecture

### 3.1 Limites des modules

| Couche                                                   | Nouveau / Changé | Responsabilité                                                                                                                                        |
| -------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                 | **nouveau**      | Récepteur : init, formatage, append dans fichier, té vers stderr, flush, lien symbolique latest                                                        |
| `packages/cli/src/serve/runQwenServe.ts`                 | changé           | Initialiser l'enregistreur au démarrage ; remplacer `writeStderrLine` du cycle de vie par `daemonLog.*` ; `await flush()` à l'arrêt ; passer `onDiagnosticLine` au bridge |
| `packages/cli/src/serve/server.ts`                       | changé           | `sendBridgeError(...)` passe par `daemonLog.error(...)`                                                                                               |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)     | changé           | Ajouter `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void` en option                                                    |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine`  | changé           | Si `onDiagnosticLine` est injecté, té de la même ligne                                                                                                |
| `packages/acp-bridge/src/spawnChannel.ts`                | changé           | Le redirecteur stderr des enfants tée chaque ligne préfixée dans `onDiagnosticLine`                                                                   |

**Intention de conception** : `daemonLogger.ts` est un fichier unique, local au CLI, sans singleton global. `acp-bridge` reste ignorant du CLI — il ne voit qu'un callback. Le graphe de dépendances est inchangé.

### 3.2 Pas de singleton global

L'enregistreur est créé dans `runQwenServe`, passé par closure aux modules serve internes qui en ont besoin (ou par callback à `acp-bridge`). Raisonnement :

- Miroir de la façon dont `BridgeOptions` injecte déjà les dépendances.
- Évite les fuites d'état entre tests que `debugLogger` a historiquement rencontrées (`resetDebugLoggingState()` existe pour cette raison).

## 4. ID du démon et chemin du fichier

- Chemin : `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - Résout en `${QWEN_RUNTIME_DIR ou ~/.qwen}/debug/daemon/<daemon-id>.log`.
  - Réutilise `Storage.getGlobalDebugDir()` afin que la redirection du répertoire d'exécution (variable d'env, contextuelle) s'applique automatiquement.
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` désambiguïse plusieurs démons sur le même workspace.
  - `workspaceHash` est de longueur fixe, compatible avec les noms de fichier, et stable pour le même chemin de workspace.
- Lien symbolique `latest` : `~/.qwen/debug/daemon/latest` → fichier de log du processus courant. Mis à jour lors de l'init en utilisant le helper `updateSymlink` existant (`packages/core/src/utils/symlink.ts`). L'échec du lien symbolique est loggé et ignoré — ne dégrade pas les écritures principales. Distinct de `${runtimeBaseDir}/debug/latest` (propre à la session) selon les non-objectifs.
- Mode fichier : `'a'` (append avec `O_APPEND | O_CREAT`). Les fichiers existants survivent aux redémarrages pour analyse forensique.

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
   * `err.stack` est ajouté sous forme de lignes de continuation indentées après le message.
   * `err` et `ctx` sont tous deux optionnels et indépendants.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * Té fichier uniquement pour les lignes dont l'appelant écrit déjà sur stderr
   * (redirecteur stderr des enfants ACP, `writeServeDebugLine`). La ligne est
   * ajoutée au log du démon sous le préfixe standard `<timestamp> [<LEVEL>] [DAEMON] ` ;
   * elle n'est PAS renvoyée à stderr (ce qui doublerait la sortie de l'opérateur).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Chemin absolu vers le fichier de log du démon. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Vide les ajouts en attente. Appelé depuis le gestionnaire d'arrêt de runQwenServe. */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // par défaut process.pid
  now?: () => Date; // par défaut () => new Date()
  stderr?: (line: string) => void; // par défaut writeStderrLine
  baseDir?: string; // par défaut Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` de manière synchrone :

1. Calcule `daemonId` + chemin du log.
2. `mkdirSync(parentDir, { recursive: true })` — échec → retourne un enregistreur no-op, écrit un avertissement sur stderr. Le démarrage continue.
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — écrit `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>` de manière synchrone. Cela sert également de sonde d'écriture ; sur EACCES/ENOSPC, le mode échec = enregistreur no-op + un avertissement sur stderr.
4. Met à jour le lien symbolique `latest` (au mieux, les erreurs sont ignorées).
5. Retourne l'enregistreur ; les appels suivants à `info/warn/error/raw` mettent en file d'attente des appels asynchrones `fs.promises.appendFile`.

Si `process.env['QWEN_DAEMON_LOG_FILE']` est l'une des valeurs `0|false|off|no`, `initDaemonLogger` court-circuite vers un enregistreur no-op avant tout appel au système de fichiers.

## 6. Format des lignes de log

Miroir de `debugLogger.buildLogLine` pour la parité visuelle :

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- Horodatage : ISO 8601, UTC.
- Niveau : `INFO` | `WARN` | `ERROR`. (Pas de DEBUG initialement — `QWEN_SERVE_DEBUG` arrive en `INFO` via `raw()`.)
- Tag : littéral `DAEMON`.
- Contexte de trace : `trace.getActiveSpan()` quand disponible ; même logique que `debugLogger.getActiveSpanTraceContext`. Helper extrait dans un module partagé (`packages/core/src/utils/traceContext.ts`?) ou dupliqué localement — à décider dans le plan.
- Champs de contexte : rendus sous forme `key=value`, ordre fixe (`route`, `sessionId`, `clientId`, `childPid`, `channelId`), puis les clés supplémentaires triées par ordre lexicographique. Les valeurs contenant des espaces ou `=` sont mises entre guillemets `JSON.stringify`.
- Stack d'erreur : ajouté sous forme de lignes de continuation indentées après le message.
- `raw(line, level)` écrit la ligne telle quelle après le préfixe standard `<timestamp> [<LEVEL>] [DAEMON] `, sans traitement supplémentaire.

**Sémantique du té (important) :**

- `info` / `warn` / `error` écrivent **à la fois** dans le fichier de log du démon **et** sur stderr (via le writer `stderr` injecté). Les appelants remplaçant un précédent `writeStderrLine(...)` utilisent ces méthodes directement ; aucun appel stderr séparé nécessaire.
- `raw` écrit **fichier uniquement**. Utilisé par le redirecteur stderr des enfants ACP et `writeServeDebugLine`, où l'appelant écrit déjà sur stderr via son chemin existant. Le doubler inonderait la sortie de l'opérateur.

## 7. Flux de démarrage / arrêt

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // la bannière de démarrage est uniquement sur stderr pour éviter que la ligne ne se référence elle-même

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // injecté pour sendBridgeError

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- La bannière de démarrage est uniquement sur stderr (la ligne contenant le chemin serait circulaire si loggée).
- `initDaemonLogger` est synchrone afin que tout échec soit visible immédiatement au démarrage, pas enterré après la première erreur.
- `flush()` à l'arrêt est la dernière étape attendue avant `process.exit`. SIGKILL est par définition impossible à vider — nous l'acceptons.

## 8. Tableau de couverture

| Source                                                        | Aujourd'hui                                  | Après                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `runQwenServe.ts` cycle de vie / signaux / avertissements config | `writeStderrLine(...)`                       | `daemonLog.info \| warn(...)` (stderr a toujours lieu — `daemonLog` tée)                          |
| `runQwenServe.ts` "listening on URL" (stdout)                 | `writeStdoutLine(...)`                       | inchangé — les scripts opérateurs analysent stdout                                               |
| `server.ts:sendBridgeError`                                   | `writeStderrLine(...)` avec route/sessionId  | `daemonLog.error(msg, err, { route, sessionId, ... })` (stderr toujours émis par le té de daemonLog) |
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`)          | `writeStderrLine('qwen serve debug: ...')`   | té vers `onDiagnosticLine(line, 'info')`                                                          |
| `spawnChannel.ts` stderr enfant                                | `process.stderr.write(prefix + line + '\n')` | aussi `onDiagnosticLine(prefix + line, 'warn')`                                                   |
| `writeStdoutLine` appelants                                    | inchangé                                    | inchangé                                                                                        |
| Usage CLI / erreurs argparse (validation précoce runQwenServe) | `writeStderrLine(...)`                       | inchangé (l'enregistreur peut ne pas exister encore)                                             |

Chaque écriture stderr existante est préservée. Le log du démon est **additif**, jamais substitutif.

## 9. Chemin d'écriture et flush

- File interne : une chaîne unique `Promise<void>` (`this.pending = this.pending.then(() => fs.promises.appendFile(...))`).
- Chaque appel à `info/warn/error/raw` met en file un append (fichier) et, pour `info/warn/error`, appelle également de manière synchrone le writer `stderr` injecté.
- L'ordre d'écriture sur stderr est préservé (synchrone, avant la mise en file de l'append). Les appends sur fichier sont cohérents dans l'ordre de la file d'attente.
- Les échecs d'écriture activent un drapeau interne `degraded` et émettent un avertissement unique sur stderr. Les appels suivants tentent toujours l'écriture mais le compteur n'est pas conservé.
- `flush()` retourne la promesse courante de fin de file.
- Pas de couche de buffer : chaque appel = un `appendFile`. Le volume est faible (erreurs de routes + cycle de vie) ; le micro-batch serait une optimisation prématurée.

## 10. Configuration

| Variable d'env                                 | Comportement                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`        | `initDaemonLogger` retourne un no-op ; le té est sans effet ; stderr inchangé    |
| `QWEN_DAEMON_LOG_FILE=<autre valeur>` ou non défini | Activé (par défaut)                                                              |
| `QWEN_RUNTIME_DIR=<chemin>`                     | Déplace la racine `~/.qwen`, le log du démon suit (sémantique existante)         |
| `QWEN_SERVE_DEBUG=1`                            | Existant — `writeServeDebugLine` s'active ; les lignes sont maintenant aussi tées vers le log du démon |

`QWEN_DAEMON_LOG_FILE` est intentionnellement distinct de `QWEN_DEBUG_LOG_FILE` afin que la désactivation des logs de débogage par session n'emporte pas le log du démon de l'opérateur (et vice versa).

## 11. Gestion des erreurs

- Échec mkdir/ouverture de `initDaemonLogger` → enregistreur no-op + un avertissement sur stderr. Le démarrage du démon continue. L'opérateur ne voit rien dans le fichier mais reçoit toujours stderr.
- Échecs par append → bascule le drapeau degraded, émet un avertissement unique sur stderr, continue d'essayer. Le problème ne mentionne pas de signal UI en mode dégradé, donc aucune surface publique nécessaire.
- Rejet de `flush()` → attrapé dans le gestionnaire d'arrêt, loggé via `writeStderrLine`. Ne bloque pas la sortie.
- Échec du lien symbolique `latest` → ignoré ; les écritures principales ne sont pas affectées.

## 12. Tests

### `daemonLogger.test.ts` (nouveau)

- `baseDir` isolé, `now`, `pid`, `stderr` simulés.
- Dérivation du chemin et de l'ID du démon incluant le `workspaceHash` de 8 caractères pour une entrée connue.
- Lien symbolique `latest` créé et mis à jour lors des invocations successives de `initDaemonLogger` dans le même répertoire.
- Formatage des niveaux (INFO/WARN/ERROR), ordre des champs de contexte, continuation de la stack d'erreur.
- Injection du contexte de trace lorsqu'une span active existe.
- `raw(line, level)` écrit la ligne préfixée textuellement.
- `flush()` se résout seulement après que toutes les écritures en file aient atteint le fichier.
- `QWEN_DAEMON_LOG_FILE=0` → aucun fichier créé.
- Échec de `mkdir` → enregistreur no-op, un avertissement sur stderr, les appels suivants ne lèvent pas.
- Échec de `appendFile` → drapeau degraded activé, un avertissement sur stderr.

### `runQwenServe.test.ts` (extension)

- Le démarrage écrit la ligne `daemon started ...` dans le log.
- Le gestionnaire d'arrêt attend `daemonLog.flush()` avant la sortie.
- La bannière stderr de démarrage contient le chemin du log du démon.

### `server.test.ts` (extension)

- Une route qui lève une erreur la redirige via `daemonLog.error(...)` avec les bons `route` et `sessionId`.

### Tests acp-bridge (extension)

- Le callback `onDiagnosticLine` invoqué depuis `writeServeDebugLine` quand `QWEN_SERVE_DEBUG=1` et depuis le redirecteur stderr enfant de `spawnChannel`. Les tests injectent un faux capturant ; pas de système de fichiers.

## 13. Documentation

- `docs/cli/serve.md` (ou là où serve est documenté) gagne une section « Fichier de log du démon » couvrant : chemin, format du daemon-id, lien symbolique `latest`, désactivation `QWEN_DAEMON_LOG_FILE`, distinction avec `debug/<sessionId>.txt` par session.
- README sous `packages/cli/src/serve/` s'il existe.
- Pas de fichier de style CHANGELOG dans ce dépôt ; les notes de version sont traitées séparément.

## 14. Retour arrière

- Changement purement additif. Retour arrière = revert du commit :
  - Supprimer `daemonLogger.ts` + son test.
  - Revenir sur les modifications de `runQwenServe.ts` (cycle de vie / sendBridgeError / bridge / spawnChannel).
  - Supprimer `onDiagnosticLine` de `BridgeOptions`.
- Aucun état sur disque à nettoyer ; les fichiers de log du démon existants deviennent orphelins mais inoffensifs.

## 15. Critères d'acceptation (du problème)

| Critère                                                           | Comment satisfait                                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `qwen serve` crée / ajoute un log de démon sans redirection shell | `initDaemonLogger` ouvre le fichier au démarrage                                                   |
| HTTP 500 de `POST /session/:id/prompt` corrélable dans le log du démon | `sendBridgeError` écrit `route=` + `sessionId=`                                                   |
| Les lignes stderr des enfants ACP également dans le log du démon  | `spawnChannel` tée via `onDiagnosticLine`                                                          |
| Le logging fonctionne avant la première session et après toutes les sessions fermées | Non limité à la session ; vit pour la durée de vie du démon                                       |
| Comportement stderr existant intact                               | Toutes les écritures sont additives ; aucun appel `writeStderrLine` n'est supprimé sans équivalent laissé en place |
| Chemin du log + documentation de désactivation                    | Section de documentation au §13                                                                     |

## 16. Questions ouvertes

Aucune bloquante. Suites possibles :

- Le lien symbolique `latest` doit-il aller dans `~/.qwen/debug/daemon/latest` ou `~/.qwen/debug/daemon-latest` ? La spécification choisit la première option pour la propreté du répertoire.
- Devrions-nous proposer une sortie en lignes JSON comme future option (par exemple `QWEN_DAEMON_LOG_FORMAT=json`) ? Hors périmètre de cette PR ; l'export structuré relève du #2014.
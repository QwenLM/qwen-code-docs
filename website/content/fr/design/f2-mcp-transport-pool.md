# F2 : Pool de transports MCP partagé — Conception v2.2

> Cible `daemon_mode_b_main` (selon la stratégie de branchement #4175). Remplace la PR 23 de la vague 5 de #4175.
> **Livraison mono-PR** conformément aux consignes de lotissement par cohérence fonctionnelle du mainteneur (2026-05-19).
> Auteur : doudouOUC. Date : 2026-05-20. Révisé : 2026-05-20 (v2.2 — intégration des retours de revue).

---

## 0. Journal des modifications

### v2.2 (2026-05-20) — Implémentation de la PR #4336 + 32 intégrations de retours de revue

La PR #4336 a livré F2 en 6 commits atomiques + 6 commits de correction sur environ 4 heures. Wenshao a effectué une revue cumulative en 3 lots ; chaque lot a produit des corrections en ligne et critiques qui ont été intégrées. Le tableau ci-dessous récapitule les changements par rapport à v2.1, organisés par lot de revue.

#### v2.1 → premier lot de revue (commits 1-4, wenshao C1-C7 + S1-S4)

| #   | Site                                                       | Problème                                                                                                                                                  | Commit d’intégration |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| C1  | `acpAgent.ts:269` — fermeture initiée par IDE              | La vidange du pool ne se produisait que dans le gestionnaire SIGTERM ; une fermeture normale initiée par l’IDE laissait des entrées fuiter jusqu’à ce que l’OS les nettoie. Miroir de la vidange du pool de SIGTERM sur `await connection.closed` | `ae0b296c4`          |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                       | `cancelDrainTimer` réinitialisait `maxIdleTimer` à chaque battement, annulant la limite stricte de la §6.3. Désormais ne nettoie que `drainTimer` ; max-idle survit à toute la durée de vie de l’entrée | `ae0b296c4`          |
| C3  | `mcp-pool-entry.ts:doRestart`                              | Un échec de reconnexion laissait l’entrée dans un état zombie (`localStatus=CONNECTED`, `state='active'`, snapshot obsolète). Try/catch + transition vers `'failed'` en cas d’échec | `ae0b296c4`          |
| C4  | `mcp-pool-entry.ts:forceShutdown`                          | `state='closed'` défini APRÈS les await, donc un `acquire` concurrent pouvait observer `'active'` et fournir une connexion obsolète. Défini de manière synchrone en début de méthode | `ae0b296c4`          |
| C5  | `mcp-transport-pool.ts:drainAll`                           | Un `acquire` concurrent pouvait créer une nouvelle entrée en pleine vidange. Ajout d’un drapeau de mutex `draining` + `await Promise.allSettled(spawnInFlight)` avant le nettoyage | `ae0b296c4`          |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                   | L’écouteur n’était pas filtré par `serverName` ; chaque entrée recevait les notifications de statut de tous les serveurs + l’écho de son propre `markActive`. Correction avec filtrage | `ae0b296c4`          |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`     | Le verrouillage du mode pool a été ajouté à `discoverAllMcpTools` mais oublié sur `Incremental` — `/mcp refresh` contournait le pool, créait un client par session | `ae0b296c4`          |
| S1  | `session-mcp-view.ts:passesSessionFilter`                  | La documentation ne précisait pas que `excludeTools` utilise une égalité directe (pas de support des parenthèses) ; divergence par rapport à `mcp-client.ts:isEnabled` | `ae0b296c4`          |
| S2  | Docstring de `pid-descendants.ts`                          | Prétendait une branche `taskkill /F` spécifique à Windows qui n’existait pas — Node polyfille `process.kill('SIGTERM')` en `TerminateProcess` | `ae0b296c4`          |
| S3  | Log de débogage `applyTools` dans `session-mcp-view.ts`    | La chaîne contenait le littéral `"N"` au lieu d’une interpolation — les opérateurs voyaient `applied 12 tools (filtered to N registered)` | `ae0b296c4`          |
| S4  | Callback de statut `createUnpooledConnection` dans `mcp-transport-pool.ts` | Codé en dur sur `() => CONNECTED` donc `aggregateStatusByName` mentait après une déconnexion. Remplacé par `() => client.getStatus()` | `ae0b296c4`          |

#### Lot d’auto-revue du commit 5 (R1-R3, petits)

| #   | Site                                         | Problème                                                                                                                                           | Commit d’intégration |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| R1  | Enveloppe `/capabilities` dans `server.test.ts:918` | Le test affirmait `getAdvertisedServeFeatures()` (sans bascules) mais `server.ts` passe `mcpPoolActive: opts.mcpPoolActive !== false` (activé par défaut). Ancrage de la bascule | `3e68c00bc`          |
| R2  | Couverture du défaut activé des capacités dans `server.test.ts` | Aucun test démarré avec les options par défaut pour vérifier la publication des étiquettes de pool. Ajout d’un test explicite `mcpPoolActive: false` | `3e68c00bc`          |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData` | La documentation disait que les SDK pré-PR « verraient la nouvelle valeur comme inconnue et la remonteraient génériquement » — en réalité `MCP_RESTART_REFUSED_REASONS.has(...)` rejette → abandon silencieux | `3e68c00bc`          |

#### Deuxième lot de revue (commits 1-5, wenshao R1-R10)

| #   | Site                                                | Problème                                                                                                                                                                          | Commit d’intégration |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                    | La correction C2 préservait correctement `maxIdleTimer` entre les battements, mais l’action de déclenchement fermait de force indépendamment de `refs.size`. Une session active avec rattachement dans la grâce perdait ses outils après 5 min | `72399f109`          |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`  | `releaseAllPooledConnections` + ré-acquisition de TOUT à chaque passage laissait une brève fenêtre sans aucun outil MCP enregistré ET réinitialisait tous les temporisateurs de vidange. Différence par rapport au souhaité `(name, fingerprint)` | `72399f109`          |
| WR3 | Distribution du snapshot `doRestart` dans `mcp-pool-entry.ts` | Le redémarrage mettait à jour `toolsSnapshot`/`promptsSnapshot` et émettait des événements typés — mais aucune instance `SessionMcpView` n’était abonnée à ce flux. Itération directe des `subscribers` après le snapshot | `72399f109`          |
| WR4 | `subprocessCount` dans `mcp-transport-pool.ts:getSnapshot` | Comptait le websocket dans `subprocessCount` — le websocket se connecte à distance, pas d’enfant local. Restreint à `'stdio'` uniquement | `72399f109`          |
| WR5 | Filtre PowerShell `-Filter` dans `pid-descendants.ts` | Interpolation de `${pid}` directement dans la chaîne `-Filter`. La garde `Number.isInteger` du point d’entrée empêche l’injection aujourd’hui ; liaison à `$p` pour une défense en profondeur contre de futures relaxations de la garde | `72399f109`          |
| WR6 | Champ `cfg` du constructeur de `mcp-pool-entry.ts`     | `readonly cfg: MCPServerConfig` était implicitement public, exposant les clés API env / auth d’en-tête / champs OAuth. Rendu `private` ; nouveau getter `transportKind` pour le seul lecteur externe | `72399f109`          |
| WR7 | Exportations prématurées dans `mcp-pool-events.ts`   | 5 gardes de type PoolEvent + ré-export `Prompt` + `PoolEntryConnectionStatus` n’avaient aucun appelant. Supprimés ; conservé `MCPCallInterruptedError` (exigence de conception §13.4) | `72399f109`          |
| WR8 | Duplication de vidange du pool dans `acpAgent.ts:269,300` | SIGTERM + fermeture IDE avaient des blocs `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }` identiques. Extraction d’un helper `drainPoolBeforeExit(label)` | `72399f109`          |

#### Lot d’auto-revue du commit 6 (R1-R3, course critique)

| #   | Site                                    | Problème                                                                                                                                                               | Commit d’intégration |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`        | Course de libération d’emplacement : A termine spawn, B (empreinte différente, même nom) démarre spawn, A vide. Le callback de fermeture vérifiait seulement `entries` (B pas encore enregistré) → libération prématurée | `0e58a098f`          |
| 6R2 | JSDoc de `events.ts:mcpBudgetWarningCount` | Les événements au niveau de l’espace de travail sont diffusés vers N sessions → N incréments du réducteur ; les consommateurs agrégeant entre sessions comptent double. Mise à jour de la docstring pour signaler le multiplicateur | `0e58a098f`          |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`      | Itérait `this.sessions.keys()` directement pendant la diffusion asynchrone ; un `killSession` concurrent pouvait corrompre l’itérateur. Snapshot via `Array.from(...)` | `0e58a098f`          |

#### Troisième lot de revue (commits 1-6, wenshao W1-W15)

| #   | Site                                                           | Problème                                                                                                                                                                                | Commit d’intégration |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| W1  | Capture `spawnEntry` dans `mcp-transport-pool.ts`              | L’échec de spawn laissait `statusChangeListener` définitivement — seul `forceShutdown` le supprime. Ajout de `entry.forceShutdown('manual')` dans le catch | `4a3c5cd90`          |
| W2  | Vérification croisée `statusChangeListener` dans `mcp-pool-entry.ts` | La carte `serverStatuses` au niveau du module était partagée entre entrées multi-empreintes. L’erreur de transport de A écrivait DISCONNECTED, l’écouteur de B corrompait le `localStatus` de B. Ajout d’une vérification `client.getStatus()` | `4a3c5cd90`          |
| W3  | Balayage des PID dans `mcp-pool-entry.ts:doRestart`            | Le redémarrage sautait `listDescendantPids` + `sigtermPids` — chaque redémarrage de `npx`/`uvx` encapsulé en stdio orphelinait le véritable petit-enfant MCP. Ajout du balayage avant la déconnexion | `4a3c5cd90`          |
| W4  | Course du timer de vidange dans `mcp-pool-entry.ts:doRestart`  | Le timer de vidange pouvait se déclencher pendant l’attente du redémarrage → `forceShutdown` supprime l’entrée → `client.connect` crée un orphelin. Ajout de `cancelDrainTimer` + `state→active` en haut de `doRestart` | `4a3c5cd90`          |
| W5  | Handles morts `pooledConnections` dans `mcp-client-manager.ts` | Lorsque l’entrée passait à `'failed'`, le gestionnaire conservait le `PooledConnection` mort pour toujours. Abonnement aux événements de l’entrée ; éviction sur `'failed'` (idempotent via la garde `get(name) === conn`) | `4a3c5cd90`          |
| W6  | Réentrance de `discoverAllMcpToolsViaPool` dans `mcp-client-manager.ts` | Deux passages entrelacés pouvaient tous deux `set(name, conn)` → première connexion fuite. Ajout d’un mutex `discoveryInFlight` ; le deuxième appelant attend la même promesse. Nouveau test de régression | `4a3c5cd90`          |
| W9  | Strictesse de `acpAgent.ts:parsePoolDrainMs`                   | `Number.parseInt` acceptait `'30000ms'` / `'30000abc'`. Regex stricte `^\d+$` ; rejeter avec avertissement stderr + valeur par défaut | `4a3c5cd90`          |
| W10 | Ordre de `indexAttach` dans `mcp-transport-pool.ts:acquire`    | `indexAttach` modifiait `sessionToEntries` AVANT `entry.attach()`. Si `attach` levait une exception, mappage inverse obsolète. Déplacement de `indexAttach` après la réussite de `attach` (chemins rapide et en vol) | `4a3c5cd90`          |
| W13 | JSDoc de `mcp-transport-pool.ts:subprocessCount`               | La doc mentionnait encore `stdio + websocket` après que WR4 l’a restreint à stdio. Mise à jour | `4a3c5cd90`          |
| W14 | Capture de `createUnpooledConnection` dans `mcp-transport-pool.ts` | Même fuite de `statusChangeListener` que W1 dans le chemin non poolé. Même miroir : `forceShutdown` avant déconnexion | `4a3c5cd90`          |
| W15 | Réponse de `bridge.ts:restartMcpServer`                        | Le cast `as PoolEntries` n’était pas fiable — JSON non typé provenant de l’enfant ACP. Vérification `Array.isArray` + garde de forme par entrée ; entrées malformées ignorées avec un signet stderr | `4a3c5cd90`          |

#### Refusé avec réponse (déposé comme suivis F2)

| #   | Site                                                | Raison du refus                                                                                                                                                             |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W7  | Lacunes de couverture de test (4 chemins critiques non testés) | 1/4 ajouté (test de régression W6) ; le reste reporté à une PR dédiée à la couverture de test après la fusion de la série F2 |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` inutilisés | Marqueurs de compatibilité future pour la reconnexion pilotée par moniteur de santé reportée (conception §6.6) ; supprimer + rajouter fera du churn sur le type public |
| W11 | Blocs d’attachement dupliqués chemin rapide/en vol   | ✅ Fait dans PR A : `attachPooledSession` + `rollbackReservationOnSpawnFailure` helpers privés (commit `2d546efca`) |
| W12 | `passesSessionFilter` O(M×N) par `applyTools`       | ✅ Fait dans PR A : `applyTools` / `applyPrompts` précalculent des ensembles de filtre `Set`s une fois par passage ; le prédicat devient O(1) par outil (commit `a4a855ab3`) |
| R9  | Constructeur de `McpClientManager` avec 7 sentinelles positionnelles | ✅ Fait dans PR A : constructeur avec objet d’options + fabrique de test `mkManager` (commit `0cb1eaa27`) |
| R10 | Coût `pgrep -P <pid>` par PID par niveau             | ✅ Fait dans PR A : snapshot unique `ps -A -o pid=,ppid=` + parcours BFS en mémoire ; pgrep BFS conservé comme fallback pour BusyBox <v1.28 / distroless (commit atterrissant comme dernière pièce de PR A) |

#### Nombre de bugs

- **3 lots × 27 corrections critiques / importantes** + 5 plis de doc / suggestion = **32 intégrations de retours de revue** au total
- **2 courses critiques attrapées seulement au deuxième regard** (course 6R1 de libération d’emplacement pendant le spawn ; réentrance de découverte W6)
- **0 échecs silencieux livrés** — chaque correction porte un signet en ligne `// F2 (#4175 commit X review fix — wenshao YN):` pointant vers la revue originale

### v2.1 (2026-05-20) — stratégie mono-PR + 12 intégrations de retours de revue

| #      | Quoi                                                                                                          | Pourquoi                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| V21-1  | Passage d’un plan de 6 sous-PR à **une seule PR cohérente fonctionnellement** avec 6 commits atomiques        | Conformément aux consignes du mainteneur (stratégie de branchement #4175) ; le relecteur peut lire commit par commit via `git log -p` |
| V21-2  | Ajout de l’index inverse `sessionToEntries: Map<sid, Set<ConnectionId>>` dans le pool (§6)                   | `releaseSession` passe de O(N entrées) à O(références de session) ; nécessaire pour une échelle de 1000 sessions |
| V21-3  | Paramètre de requête `?fingerprint=` sur la route de redémarrage (§13.1)                                      | L’opérateur peut vouloir redémarrer une seule entrée lorsque le même nom a plusieurs empreintes ; coût quasi nul à ajouter maintenant |
| V21-4  | Le chemin d’échec de spawn libère explicitement l’emplacement réservé (§6.1, §6.5)                            | Sinon fuite d’emplacement jusqu’au prochain passage du moniteur de santé ; vrai bug subtil |
| V21-5  | Nouvelle §13.4 : sémantique d’appel d’outil en vol pendant la reconnexion                                      | `MCPCallInterruptedError` ; le pool NE rejoue PAS automatiquement (écritures non sûres) |
| V21-6  | Nouvelle §10.4 : `/mcp disable X` déclenche la réapplication de `SessionMcpView`                               | Sinon la désactivation en milieu de session ne supprime pas les outils déjà enregistrés |
| V21-7  | La route de statut expose `entryIndex` et non l’empreinte brute (§8.3)                                          | Évite l’exposition par canal auxiliaire de la rotation des jetons OAuth via le changement d’empreinte |
| V21-8  | Backoff de reconnexion spécifié : stdio fixe 5s × 3, HTTP/SSE exponentiel 1/2/4/8/16s × 5 (§6.6)               | v2 ne le précisait pas ; HTTP a besoin d’un budget de relance plus long pour les fluctuations réseau |
| V21-9  | `canonicalOAuth(o)` normalise `{enabled: false}` ≡ `undefined` ≡ `null` (§5.1)                                | Sinon des configurations fonctionnellement équivalentes produisent des entrées distinctes |
| V21-10 | Renommage du helper de repli du pool de « acquisition légacy in-process » en `createUnpooledConnection` (§5.3, §6.1) | Le contournement MCP du SDK est permanent, pas legacy |
| V21-11 | `drainAll(opts?)` retourne `Promise<void>` avec un budget horloge mural `timeoutMs` (§17)                      | L’appelant a besoin de savoir quand la vidange se termine pour l’ordonnancement de l’arrêt |
| V21-12 | Noms de champs du réducteur SDK verrouillés (Q1 résolu) : garder `mcpBudgetWarningCount` etc. avec sémantique de portée dans JSDoc | Pas de renommage d’API publique en milieu de PR |
| V21-13 | Verrouillage de Q3 (pool activé par défaut, commutateur d’arrêt `--no-mcp-pool`), Q4 (HTTP/SSE opt-in), Q6 (construction eager) | Livraison mono-PR ; pas besoin de gating par drapeau |
| V21-14 | Ajout des risques R9/R10/R11 liés à la mono-PR (§23)                                                          | Fatigue de revue, conflit de fusion daemon_mode_b_main, temps CI |
| V21-15 | Report du traitement des entrées orphelines de désinstallation d’extension au nettoyage naturel par `MAX_IDLE_MS` (§16.3) | Pas de `invalidateByExtension` explicite ; maintient le modèle uniforme |

### v2 (2026-05-20) — intégrations de retours de revue initiaux à partir de l’ébauche v1

| #   | Quoi                                                                                                  | Pourquoi                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| C1  | Le pool diffuse **Outils + Prompts** (était : outils uniquement)                                       | Le constructeur de `McpClient` prend les deux registres ; les prompts seraient sinon perdus silencieusement en mode pool |
| C2  | Nouvelle section sur la **coexistence d’état global** (`serverStatuses` / `mcpServerRequiresOAuth` cartes modulaires) | Le partage entre sessions existe déjà aujourd’hui ; le pool hérite + formalise |
| C3  | Chemin d’usine `connectToMcpServer` **unifié** avec la classe `McpClient` dans F2-1                  | v1 ne refactorisait que la classe ; laisserait un chemin non poolé parallèle |
| C4  | Rejeu de snapshot sur attachement (style earlyEvents) ajouté à `PoolEntry.attach()`                   | Nouvelle course : session-B s’attache → serveur émet `tools/list_changed` avant que l’abonnement soit câblé |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` pour la déduplication d’acquisition concurrente | v1 mentionné dans la matrice de test mais oublié dans le contrat d’implémentation |
| C6  | Balayage des PID descendants multiplateforme (Linux/macOS pgrep, Windows wmic/PowerShell)             | v1 disait « copier le `pgrep -P` d’opencode » — c’est Unix seulement |
| C7  | Champ `trust` par session **copie** de l’objet outil                                                   | trust vit sur `DiscoveredMCPTool` ; une instance partagée mélangerait le trust par session |
| C8  | Transports HTTP/SSE **opt-in** pour le pooling (par défaut : stdio + websocket uniquement)           | Certains serveurs MCP HTTP maintiennent un état de session par transport ; le partage risque une fuite d’état |
| C9  | Contournement explicite du serveur MCP SDK (`isSdkMcpServerConfig`)                                    | `sendSdkMcpMessage` est par session par conception |
| C10 | Chemin OAuth explicitement **reporté à F3**                                                             | Le flux OAuth a besoin d’un routage de type PermissionMediator ; pas dans le périmètre F2 |
| C11 | Sémantique de la route de redémarrage spécifiée (nom → toutes les entrées correspondantes)              | La PR 17 `POST /workspace/mcp/:server/restart` était auparavant non ambiguë (1 entrée) ; maintenant 1..N |
| C12 | Section de refactorisation de la route de statut (nouveau chemin : `QwenAgent.getMcpPoolAccounting()`)  | `httpAcpBridge.ts:733-770` lit actuellement le gestionnaire de la session d’amorçage — doit changer |
| C13 | Compteur de génération sur `PoolEntry` pour la garde du gestionnaire `tools/list_changed` obsolète     | Modèle Opencode : `if (s.clients[name] !== client) return` |
| C14 | Décomposition des sous-PR de 4 → **6**                                                                 | v1 sous-estimait ; A2/B1/B3/C6 ajoutent chacun du vrai travail |
| C15 | Construction paresseuse du pool (uniquement quand N≥2 sessions vues) — optionnel                       | `qwen serve --foreground` session unique ne bénéficierait pas ; économise le coût d’initialisation |
---
## 1. Objectifs / Non-objectifs

**Objectifs**

- N sessions dans 1 espace de travail partageant 1 processus par configuration serveur unique — indexé par empreinte
- Vues `ToolRegistry` / `PromptRegistry` par session préservées (filtrage, confiance)
- Cycle de vie basé sur compteur de références + vidange gracieuse, résilient au rattachement
- Nettoyage des PID descendants multi-plateforme
- Barrières de budget passant de par-session à par-espace de travail (promis par PR 14)
- Rétrocompatibilité avec Qwen autonome non-démon (pool non construit)

**Non-objectifs (périmètre F2)**

- Pool inter-espaces de travail (1 démon = 1 espace de travail, invariant de PR #4113 maintenu)
- Pool inter-démons (hors périmètre — territoire d'orchestrateur multi-processus)
- Révision du routage OAuth (F3 avec `PermissionMediator`)
- Persistance du pool au redémarrage du démon (mémoire uniquement)
- Détection automatique des serveurs HTTP « compatibles pool » (indicateur opt-in uniquement)
- Diff `MCPServerConfig` en direct pour modifier des entrées sur place (changement de config → nouvelle entrée, ancienne vidange)

---

## 2. État actuel (cible de remplacement)

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**Tableau de couplage (ce qui doit être cassé ou passé en paramètre) :**

| Couplage                                                                         | Emplacement                                      | Action dans F2                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Le constructeur de `McpClient` lie 1 ToolRegistry + 1 PromptRegistry             | mcp-client.ts:106-119                            | Le pool possède le transport ; `SessionMcpView` (par session) possède les registres par session |
| `McpClient.discover()` appelle `toolRegistry.registerTool()` en ligne             | mcp-client.ts:178-198                            | Scission : `discoverAndReturn()` retourne un instantané ; la vue enregistre         |
| Le gestionnaire `ListRootsRequestSchema` ferme sur `workspaceContext.getDirectories()` | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | Contexte du pool lié à un seul espace de travail                                       |
| Écouteur `workspaceContext.onDirectoriesChanged` enregistré par connexion         | mcp-client.ts:907                                | Le pool enregistre une fois par entrée                                                  |
| `McpClientManager` instancié à l'intérieur de `ToolRegistry`                      | tool-registry.ts:199                             | Ajouter un paramètre optionnel `pool?` au constructeur ; injection depuis Config        |
| Application du budget par session                                                | mcp-client-manager.ts:91-95 comment              | Déplacer la machine d'état dans le pool                                                 |
| `serverDiscoveryPromises` dédoublonne les vols en cours par serveur               | mcp-client-manager.ts:350                        | Le pool possède `spawnInFlight : Map<ConnectionId, Promise<PoolEntry>>`               |
| `setMcpBudgetEventCallback` enregistrement par session                            | acpAgent.ts:1851-1899                            | Le pool émet → `QwenAgent` diffuse à toutes les sessions                               |

**État déjà partagé (le pool hérite, n'introduit pas) :**

| État                                          | Emplacement                        | Note                                                         |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `serverStatuses : Map<string, MCPServerStatus>` | mcp-client.ts:292 (niveau module)  | Aujourd'hui à l'échelle du processus ; la clé du pool reste par nom → « any-CONNECTED-gagne » |
| `mcpServerRequiresOAuth : Map<string, boolean>` | mcp-client.ts:302 (niveau module)  | Idem                                                         |
| Jetons sur disque de `MCPOAuthTokenStorage`    | `~/.qwen/mcp-oauth/<name>.json`    | Partagés par le démon ; le pool les exploite plus efficacement |

---

## 3. Résultats de référence

| Projet           | Pool ?             | Clé                                             | Cycle de vie                                                                                      | Patterns à reprendre                                                                                                             |
| ---------------- | ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **claude-code**  | Non, par processus | `name + JSON.stringify(cfg)` (lodash.memoize)   | `clearServerCache` + backoff distant×5 ; crash stdio → `failed`                                  | SHA-256 `hashMcpConfig` avec clé triée pour invalidation/indexation                                                              |
| **opencode**     | Oui, par espace de travail | **nom du serveur uniquement** (pas de hachage de config) | Pas de compteur de références / pas d'éviction / pas de redémarrage ; finalisateur Effect + `pgrep -P` récursif SIGTERM | Balayage des PID descendants, garde de gestionnaire obsolète (`if (s.clients[name] !== client) return`), fan-out `tools/list_changed` via bus d'événements |

**Ce que F2 hérite de chacun :** le hachage de config de claude-code (gère les divergences d'environnement/auth par session qu'opencode ne gère pas), le balayage des PID descendants d'opencode (les wrappers npx/uvx fuient). Ce que nous ajoutons : compteur de références + vidange (démon multi-client), redémarrage automatique (démon longue durée), fan-out des prompts, garde de génération.

---

## 4. Architecture

### 4.1 Disposition des processus

```
Démon HTTP (packages/cli/src/serve, qwen serve)
  │ engendre
  ▼
Processus ACP (qwen --acp, un seul processus par espace de travail)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── nouveau, limité à l'espace de travail, 1 instance
  │     ├── entrées : Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight : Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (lié à l'espace de travail du démon)
  │     └── barrières de budget (machine d'état PR 14, promue à l'espace de travail)
  │
  └── sessions : Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ pool injecté    │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   legacy in-process
                                  → SessionMcpView            (Qwen autonome)
                                    .applyTools/Prompts
                                    (filtre + enregistre dans
                                     les registres de la session)
```

**Le pool vit dans le processus ACP**, pas dans le démon HTTP. Le démon HTTP interroge l'état du pool via la surface existante `bridge.client` extMethod (`getMcpPoolAccounting`, `restartMcpServer`). Le code F2 réside dans **`packages/core/src/tools/`** (au même niveau que `mcp-client-manager.ts`), pas dans `packages/acp-bridge/`.

### 4.2 Diagramme de classes

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (libération en bloc pour la destruction d'une session)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (périmètre espace de travail)
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   (arrêt)
  └─ onBudgetEvent : (event) => void   (défini par QwenAgent)

PoolEntry (interne)
  ├─ refs : Set<sessionId>
  ├─ client : McpClient
  ├─ toolsSnapshot : DiscoveredMCPTool[]
  ├─ promptsSnapshot : Prompt[]
  ├─ generation : number   (++ à la reconnexion ; garde d'événement obsolète)
  ├─ state : 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer? : NodeJS.Timeout
  ├─ healthMonitor : { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers : Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection (handle retourné à l'appelant)
  ├─ id : ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView (par session, par serveur)
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (filtre par include/exclude, décore la confiance)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (supprime ses enregistrements)
```

---

## 5. Clé de pool (empreinte)

### 5.1 Champs canoniques hachés

```ts
type PoolKey = string; // sha256 hex, 16 premiers caractères suffisent (sans collision pour N réaliste)
type ConnectionId = `${serverName}::${PoolKey}`;

function fingerprint(cfg: MCPServerConfig): PoolKey {
  const canonical = {
    transport: mcpTransportOf(cfg),
    command: cfg.command ?? null,
    args: cfg.args ?? [],
    cwd: cfg.cwd ?? null,
    env: sortedEntries(cfg.env ?? {}), // [[k,v],...] triés par k
    url: cfg.url ?? null,
    httpUrl: cfg.httpUrl ?? null,
    headers: sortedEntries(cfg.headers ?? {}),
    timeout: cfg.timeout ?? null,
    oauth: canonicalOAuth(cfg.oauth),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}

/**
 * V21-9 : normalise les configurations OAuth fonctionnellement équivalentes pour qu'elles
 * aboutissent à la même empreinte. `{enabled: false}`, `undefined`,
 * `null` et `{}` signifient tous « pas d'OAuth » → retournent `null`.
 */
function canonicalOAuth(o?: OAuthConfig | null): OAuthConfig | null {
  if (!o || !o.enabled) return null;
  return {
    enabled: true,
    clientId: o.clientId ?? null,
    scopes: o.scopes ? [...o.scopes].sort() : null,
    authorizationUrl: o.authorizationUrl ?? null,
    tokenUrl: o.tokenUrl ?? null,
  };
}

// Champs exclus (filtres par session, PAS au niveau du transport) :
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 Filtrage par classe de transport

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**`pooledTransports = {stdio, websocket}` par défaut**. Les opérateurs activent HTTP/SSE via :

- CLI : `--mcp-pool-transports=stdio,websocket,http,sse`
- Env : `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**Pourquoi exclure HTTP/SSE par défaut :** certaines implémentations de serveur MCP HTTP lient l'état (contexte d'authentification, mémoire de conversation) au flux TCP/SSE ; plusieurs sessions ACP partageant ce flux entraîneraient des fuites d'état. stdio et websocket sont de véritables processus OS dont l'état est observable et isolable.

### 5.3 Contournement pour SDK MCP

`isSdkMcpServerConfig(cfg)` vrai → le pool retourne un wrapper `PooledConnection` léger via `createUnpooledConnection(name, cfg, sid)` qui construit immédiatement un `McpClient`, sans partage, sans entrée stockée dans le pool. Raison : `sendSdkMcpMessage` est par conception par session (il transite par le plan de contrôle ACP jusqu'à la session d'origine). Même chemin utilisé pour HTTP/SSE lorsque le transport n'est pas dans `pooledTransports` (§10.3).

V21-10 : le nom est `createUnpooledConnection`, pas `legacyInProcessAcquire` — SDK MCP et HTTP en opt-out sont des choix de conception permanents, pas du code legacy.

---

## 6. Cycle de vie

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2 : index inverse, O(réfs) releaseSession au lieu de O(entrées). */
  private sessionToEntries = new Map<string, Set<ConnectionId>>();

  async acquire(
    name: string,
    cfg: MCPServerConfig,
    sid: string,
  ): Promise<PooledConnection> {
    if (!isPoolable(cfg, this.opts)) {
      return this.createUnpooledConnection(name, cfg, sid);
    }
    const id: ConnectionId = `${name}::${fingerprint(cfg)}`;

    if (this.entries.has(id)) {
      this.indexAttach(sid, id);
      return this.entries.get(id)!.attach(sid);
    }
    let inFlight = this.spawnInFlight.get(id);
    if (!inFlight) {
      const slot = this.tryReserveSlot(name);
      if (slot === 'refused') {
        throw new BudgetExhaustedError(
          name,
          this.clientBudget!,
          this.reservedSlots.size,
        );
      }
      inFlight = this.spawnEntry(name, cfg, id)
        .catch((err) => {
          // V21-4 : libère l'emplacement réservé en cas d'échec du spawn. Sans cela,
          // l'emplacement fuit jusqu'à ce que le chemin de libération du moniteur de santé
          // s'exécute (ce qui n'arrive pas puisqu'il n'y a pas d'entrée à surveiller).
          if (slot === 'reserved') this.releaseSlotName(name);
          throw err;
        })
        .finally(() => this.spawnInFlight.delete(id));
      this.spawnInFlight.set(id, inFlight);
    }
    const entry = await inFlight;
    this.indexAttach(sid, id);
    return entry.attach(sid);
  }

  release(id: ConnectionId, sid: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.detach(sid);
    this.indexDetach(sid, id);
    if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
  }

  /** V21-2 : O(réfs de cette session), pas O(toutes les entrées). */
  releaseSession(sid: string): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.detach(sid);
      if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
    }
    this.sessionToEntries.delete(sid);
  }

  private indexAttach(sid: string, id: ConnectionId): void {
    let ids = this.sessionToEntries.get(sid);
    if (!ids) {
      ids = new Set();
      this.sessionToEntries.set(sid, ids);
    }
    ids.add(id);
  }

  private indexDetach(sid: string, id: ConnectionId): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    ids.delete(id);
    if (ids.size === 0) this.sessionToEntries.delete(sid);
  }
}
```

### 6.2 Dédoublonnage d'acquisitions concurrentes (`spawnInFlight`)

Miroir de `McpClientManager.serverDiscoveryPromises` (mcp-client-manager.ts:350). Sans cela, 5 sessions se lançant au démarrage voient toutes `entries.has(id) === false` et se précipitent pour lancer 5 processus enfants.

### 6.3 Grâce de vidange + limite inactivité

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // grâce après la dernière libération
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // limite dure (défense contre la boucle d'annulation de vidange)
```

Machine d'état dans `PoolEntry` :

```
spawning ──spawn ok──► active ──dernier detach──► draining ──timeout──► closed
   │                     │                       │
   │                     │                       └──attach──► active (annule la minuterie)
   spawn fail───────────►failed
                          │
                          └──redémarrage manuel──► spawning
```

Limite d'inactivité dure : la minuterie de vidange peut être annulée et redémarrée indéfiniment (oscillation acquire/release). `MAX_IDLE_MS` est une minuterie distincte démarrée **au premier inactif** et jamais réinitialisée ; lorsqu'elle se déclenche, force la fermeture même si la vidange est en cours de grâce active. Empêche les entrées de pool zombies provenant de clients bogués qui font des acquire/release en rafale.

### 6.4 Balayage multi-plateforme des PID descendants

**R10 / R23 T7 / PR A mise à jour (2026-05-22) :** passage d'un BFS par PID (un sous-processus `pgrep -P <pid>` / `Get-CimInstance -Filter` par nœud) à un instantané unique de la table des processus suivi d'un parcours d'arbre en mémoire. Deux motivations : (1) un fork au lieu de B^D forks sur le chemin critique d'arrêt du pool ; (2) cohérence de l'instantané — le BFS d'avant pouvait manquer des descendants forkés entre des niveaux BFS adjacents. Le chemin par PID est conservé comme solution de repli pour BusyBox `ps` < v1.28 (pas de support `-o`) et les conteneurs distroless sans `ps`.

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // Le système d'exploitation récupère les orphelins ; l'arrêt du pool se poursuit.
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* échec → repli */
  }
  if (tree) return walkDescendants(tree, root); // O(descendants), 1 fork
  return await listDescendantPidsUnixPgrepFallback(root); // BFS legacy
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A : tous les processus (POSIX, équivalent à -e mais sans ambiguïté sur BSD).
  // -o pid=,ppid= : colonnes pid + ppid, le `=` final supprime les en-têtes.
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // couvre les hôtes pathologiques à >250k processus
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* analyse, ajoute dans childrenByPpid */
  }
  return childrenByPpid;
}

// Windows : un seul instantané Get-CimInstance Win32_Process | ConvertTo-Csv
// de toutes les lignes (ProcessId, ParentProcessId) + parcours en mémoire ;
// `Get-CimInstance -Filter "ParentProcessId=$p"` par PID conservé comme solution de repli.
```

Appelé depuis `PoolEntry.shutdown()` avant `client.disconnect()`. Gère les fuites des wrappers `npx @modelcontextprotocol/server-X`, `uvx ...`, `pnpm dlx ...`. Les limites MAX_DESCENDANTS=256 / MAX_DEPTH=8 sont conservées.

### 6.5 Gestion des échecs de spawn

Si `spawnEntry` rejette après que plusieurs abonnés se sont attachés (via `spawnInFlight`) :

- Tous ceux qui attendent reçoivent le rejet
- L'emplacement `tryReserveSlot` est libéré **via une clause `.catch` explicite dans `acquire`** (V21-4) ; sans cette correction, l'emplacement fuyait jusqu'au prochain passage du moniteur de santé, qui ne s'exécutait jamais car aucune entrée n'existait à surveiller.
- L'entrée ayant échoué n'est PAS stockée dans `entries`
- Les chemins de code des abonnés gèrent le cas comme si `acquire` avait échoué initialement (la logique catch existante de `discoverMcpToolsForServer` par session reste valide)

### 6.6 Backoff de reconnexion (V21-8)

Lorsqu'une `PoolEntry` entre en reconnexion après une chute de transport :

| Famille de transport | Stratégie                                     | Limite                                                            |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| stdio                | Fixe 5s × 3 tentatives                        | Selon `DEFAULT_HEALTH_CONFIG.reconnectDelayMs` existant            |
| websocket            | Fixe 5s × 3 tentatives                        | Idem stdio                                                        |
| http (opt-in)        | Exponentiel 1s, 2s, 4s, 8s, 16s × 5 tentatives | Les points de terminaison distants claquent sur des problèmes réseau transitoires ; budget plus long |
| sse (opt-in)         | Exponentiel 1s, 2s, 4s, 8s, 16s × 5 tentatives | Idem http                                                         |

Après épuisement de la limite : l'entrée passe à l'état `failed` ; les abonnés reçoivent l'événement `failed` ; un nouvel `acquire` pour le même `ConnectionId` retente un spawn une fois, puis lève une exception. Le redémarrage par l'opérateur (§13) réinitialise l'état.
---

## 7. Découverte / SessionMcpView

### 7.1 Double fan-out Tools + Prompts

```ts
// packages/core/src/tools/mcp-client.ts — split discover into pure
async discoverAndReturn(cliConfig: Config): Promise<{
  tools: DiscoveredMCPTool[];
  prompts: Prompt[];
}> {
  if (this.status !== MCPServerStatus.CONNECTED) throw new Error('Client is not connected.');
  try {
    const [prompts, tools] = await Promise.all([
      discoverPrompts(this.serverName, this.client, /* no registry */),
      discoverTools(this.client, this.serverConfig, this.serverName, this.debugMode, this.workspaceContext),
    ]);
    if (prompts.length === 0 && tools.length === 0) {
      throw new Error('No prompts or tools found on the server.');
    }
    return { tools, prompts };
  } catch (e) {
    this.updateStatus(MCPServerStatus.DISCONNECTED);
    throw e;
  }
}

// Legacy discover() retained, delegates to discoverAndReturn + registers (for standalone qwen)
async discover(cliConfig: Config): Promise<void> {
  const { tools, prompts } = await this.discoverAndReturn(cliConfig);
  for (const t of tools) this.toolRegistry.registerTool(t);
  for (const p of prompts) this.promptRegistry.registerPrompt(p);
}
```

```ts
class SessionMcpView {
  applyTools(snapshot: DiscoveredMCPTool[]) {
    this.sessionToolRegistry.removeToolsByServer(this.serverName);
    for (const tool of snapshot) {
      if (!this.passesFilter(tool)) continue;
      // C7: per-session copy of trust (don't mutate shared snapshot)
      const localTool = tool.withTrust(this.cfg.trust);
      this.sessionToolRegistry.registerTool(localTool);
    }
  }
  applyPrompts(snapshot: Prompt[]) {
    this.sessionPromptRegistry.removePromptsByServer(this.serverName);
    for (const p of snapshot) this.sessionPromptRegistry.registerPrompt(p);
  }
}
```

### 7.2 Rejeu du snapshot à l’attache (style earlyEvents)

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // Immediately replay current snapshot so subscriber doesn't miss
    // updates that landed between in-flight discover completion and
    // attach.
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

Reflète le pattern `BridgeClient.earlyEvents` du correctif PR 14b #1 — résout une race condition analogue pour l’attachement au pool.

### 7.3 Garde des handlers obsolètes (compteur de génération)

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // superseded by another reconnect
    const snap = await this.client.discoverAndReturn(this.cfg);
    if (myGen !== this.generation) return;
    this.toolsSnapshot = snap.tools;
    this.promptsSnapshot = snap.prompts;
    this.fanOut('toolsChanged');
    this.fanOut('promptsChanged');
  }

  private onServerToolsListChanged = () => {
    const myGen = this.generation;
    this.client
      .discoverAndReturn(this.cfg)
      .then((snap) => {
        if (myGen !== this.generation) return;
        this.toolsSnapshot = snap.tools;
        this.fanOut('toolsChanged');
      })
      .catch(/* swallow + log */);
  };
}
```

Sans cela, un handler obsolète provenant d’une instance Client antérieure à la reconnexion pourrait écraser le snapshot post-reconnexion avec des données périmées.

**Invariant de monotonie** (clarification V21) : `generation` ne fait qu’augmenter, jamais de réinitialisation. Toute opération en vol capture `myGen` à l’entrée, puis après `await` vérifie `myGen === this.generation`. Équivalent à « aucun événement supplanteur ne s’est produit depuis mon démarrage ». Borné par `Number.MAX_SAFE_INTEGER` (~285 000 ans à 1 Hz de reconnexion), aucun risque de débordement.

### 7.4 Unification des chemins (extension du périmètre F2-1)

`packages/core/src/tools/mcp-client.ts` a DEUX chemins de connexion au serveur :

1. Classe `McpClient` (mcp-client.ts:100) — utilisée par `McpClientManager`
2. Fonction factory `connectToMcpServer` (mcp-client.ts:875) — utilisée par `discoverMcpTools` (ligne 560) et `connectAndDiscover` (ligne 607)

F2-1 doit faire converger les deux derrière `McpClient.discoverAndReturn` (`connectToMcpServer` devenant un helper privé de `McpClient` ou les deux appelant une primitive commune `establishConnection()`). Sinon, le pool ne couvre que le chemin classe ; le chemin factory reste par session et mine tout l’effort.

---

## 8. Cohabitation avec l’état global

### 8.1 `serverStatuses` (mcp-client.ts:292) — écriture tolérante aux collisions

`Map<serverName, MCPServerStatus>` au niveau du module. Le `ConnectionId` du pool est `name::hash`, mais `updateMCPServerStatus(name, status)` écrit par nom. **Plusieurs entrées du pool pour le même nom (empreintes différentes, ex. divergence de jeton) s’écraseraient mutuellement.**

**Résolution** : le pool intercepte les écritures de statut :

```ts
class PoolEntry {
  updateStatus(s: MCPServerStatus) {
    this.localStatus = s;
    const aggregated = this.pool.aggregateStatusByName(this.serverName);
    updateMCPServerStatus(this.serverName, aggregated);
  }
}

class McpTransportPool {
  aggregateStatusByName(name: string): MCPServerStatus {
    // Any CONNECTED ⇒ CONNECTED
    // Else any CONNECTING ⇒ CONNECTING
    // Else DISCONNECTED
    const entries = [...this.entries.values()].filter(
      (e) => e.serverName === name,
    );
    if (entries.some((e) => e.localStatus === CONNECTED)) return CONNECTED;
    if (entries.some((e) => e.localStatus === CONNECTING)) return CONNECTING;
    return DISCONNECTED;
  }
}
```

La route de statut expose `entryCount: number` pour que les opérateurs voient quand un nom correspond à plusieurs entrées.

### 8.2 Stockage des jetons OAuth

`MCPOAuthTokenStorage` écrit dans `~/.qwen/mcp-oauth/<serverName>.json` — déjà partagé entre daemon et hôte. Le pool en bénéficie accessoirement (l’OAuth de la première session s’achève → jeton sur disque → la reconnexion de l’entrée du pool récupère le jeton → toutes les autres sessions en profitent).

**Mise en garde — cas multi‑empreintes** : 2 entrées pour le même nom (en‑têtes/env différents) mais même fournisseur OAuth → toutes deux lisent le même fichier de jeton. Si les jetons sont limités au serveur (cas typique OAuth), cela fonctionne. Si les jetons sont limités à l’environnement (rare), une extension explicite de la clé de stockage est nécessaire. **Reporté à F3** avec une limitation documentée.

### 8.3 `entryCount` dans le snapshot

`GET /workspace/mcp` par cellule de serveur ajoute :

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // NEW — N pool entries for this name
  entrySummary?: [                        // NEW — opaque per-entry breakdown
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7** : `entrySummary[].entryIndex` est un **entier opaque stable** attribué à la création de l’entrée (ordre d’insertion au sein du groupe de noms), PAS l’empreinte brute. Raison : l’empreinte change quand les jetons OAuth ou les variables d’environnement tournent, ce qui fuirait ces informations via les diffs de snapshot (l’opérateur pourrait déduire « jeton tourné à T+5min » de la transition `'a3b1' → 'f972'`). `entryIndex` est monotone dans le groupe de noms mais reste stable lors des rotations car l’ancienne entrée se draine et la nouvelle reçoit l’index suivant.

Les anciens clients SDK ignorent les champs inconnus (contrat PR 14) ; les nouveaux clients utilisent `entryCount` pour les badges. Le chemin de redémarrage interne par empreinte utilise un jeton opaque retourné uniquement via une extMethod privilégiée, non exposé dans le snapshot HTTP.

---

## 9. WorkspaceContext / ListRoots

### 9.1 Enregistrement unique

Les instances `McpClient` du pool partagent **un** `WorkspaceContext` — le contexte d’espace de travail lié au daemon (invariant PR #4113). Le handler `ListRootsRequestSchema` de `connectToMcpServer` capture ce contexte unique.

L’écouteur `onDirectoriesChanged` est enregistré **une fois par entrée**, pas une fois par `acquire`. Détaché à l’arrêt de l’entrée.

### 9.2 Remontée `roots/list_changed`

Le serveur notifie le client de nouveaux roots → le pool remonte :

- Le pool re-découvre (le serveur peut signaler un ensemble d’outils différent avec les nouveaux roots) → événement `toolsChanged` → toutes les vues des abonnés ré-appliquent

### 9.3 `updateWorkspaceDirectories` par session

**Contrat** : en Mode B, les ajouts de répertoire par session sont une indication légère, non autoritaire. Le `WorkspaceContext` du pool est au niveau du daemon.

Deux choix d’implémentation :

- **v1 simple** : ignorer les ajouts par session, journaliser un avertissement quand détecté
- **v2 union** : le pool maintient `extraRoots: Map<sessionId, Set<dir>>`, le handler ListRoots retourne l’union du workspace lié + tous les extras. La suppression par session déclenche `roots/list_changed`. Ajoute 50-80 LOC de complexité.

**Choisir v1 simple pour F2** ; v2 union en suivi si des problèmes utilisateurs se matérialisent.

---

## 10. Injection par session

### 10.1 `mcpServers` depuis `newSession({mcpServers})`

`newSessionConfig(cwd, mcpServers, ...)` fusionne la liste injectée avec `settings.merged.mcpServers` (acpAgent.ts:1778-1831). Le pool consomme la **vue fusionnée par session** :

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...existing setMcpBudgetEventCallback REMOVED — pool handles broadcast directly
}
```

Quand deux sessions injectent un serveur de même nom avec des env/en‑têtes différents → empreintes différentes → deux entrées du pool. Le partage par le pool n’a lieu que lorsque les sessions sont exactement d’accord.

### 10.2 Divergence d’authentification

Les mcpServers statiques de `~/.qwen/settings.json` sont identiques entre sessions → tous partagent → 80% des cas. Les mcpServers injectés par session avec jetons par utilisateur → empreintes uniques → pas de partage. Les deux cas sont sûrs.

### 10.3 Transport HTTP opt-in (rappel §5.2)

Par défaut `pooledTransports = {stdio, websocket}`. Les serveurs HTTP/SSE passent par le chemin `createUnpooledConnection` (un McpClient par session) sauf si l’opérateur opte pour le pool.

### 10.4 `/mcp disable X` en cours de session (V21-6)

Quand l’opérateur exécute `/mcp disable github` sur une session active :

1. `Config.disableMcpServer('github')` ajoute à l’ensemble `disabledMcpServers` par Config
2. **Crochet F2** : `Config.onDisabledMcpServersChanged` se déclenche ; `SessionMcpView` pour ce nom appelle `teardown()` (supprime ses enregistrements d’outils/prompts des registres de session)
3. L’entrée du pool **peut rester active** si d’autres sessions y font encore référence (refcount > 0) — seule la vue de la session de désactivation se détache
4. Si toutes les sessions désactivent → refcount → 0 → le timer de drainage démarre

Sans l’étape 2, une désactivation en cours de session laisserait les outils déjà enregistrés dans le `ToolRegistry` de la session jusqu’au prochain redémarrage de session. Le test 21.4 couvre ce cas.

`/mcp enable github` est l’inverse : déclenche un nouveau `pool.acquire` pour la session, attache une nouvelle vue, ré-applique le snapshot.

---

## 11. Passage des garde-fous budgétaires

### 11.1 Machine d’état déplacée dans le pool

`tryReserveSlot` / `releaseSlotName` / hystérésis 75% / coalescence `refused_batch` / `bulkPassDepth` / `pendingRefusalNames` — tout migre de `McpClientManager` vers `McpTransportPool`. `McpClientManager` conserve l’état uniquement en mode autonome (pas de pool injecté).

### 11.2 Portée de la cellule snapshot

```ts
{
  kind: 'mcp_budget',
  scope: 'workspace',          // NEW value (PR 14 v1 returned 'session')
  liveCount: 5,
  clientBudget: 10,
  budgetMode: 'enforce',
  status: 'ok',
}
```

Selon le contrat PR 14 : « Les consommateurs DOIVENT tolérer des entrées supplémentaires avec des valeurs de scope non reconnues (ignorer, ne pas échouer). » Les anciens clients SDK voient `scope: 'workspace'`, affichent comme inconnu (ou retombent sur les nombres de premier niveau). Les nouveaux SDK ajoutent un helper `isWorkspaceScopedBudget(cell)`.

### 11.3 Remontée d’événements

```ts
class QwenAgent {
  constructor() {
    this.mcpPool = new McpTransportPool({
      onBudgetEvent: (event) => this.broadcastBudgetEvent(event),
    });
  }

  private broadcastBudgetEvent(event: McpBudgetEvent) {
    for (const [sid, session] of this.sessions) {
      const enriched = {
        ...event,
        scope: 'workspace' as const,
        sessionId: sid,
      };
      session.connection
        .extNotification('qwen/notify/session/mcp-budget-event', enriched)
        .catch((err) =>
          debugLogger.debug('budget event delivery failed', { sid, err }),
        );
    }
  }
}
```

### 11.4 Changements de contrat des types SDK

PR 14b exportait ceci (doivent être étendus de manière additive) :

- `DaemonMcpBudgetWarningData` — ajouter `scope?: 'workspace' | 'session'` (optionnel pour rétrocompatibilité ; absent = 'session')
- `DaemonMcpChildRefusedBatchData` — même extension `scope?`
- `DaemonMcpGuardrailEvent` — discriminateur inchangé

Nouveaux helpers SDK :

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

État du réducteur sur `DaemonSessionViewState` :

- **Aucun nouveau champ** — `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` s’incrémentent indépendamment de la portée (la portée est une propriété de chaque événement, pas un flux séparé)
- Documenter que sous F2 ces compteurs reflètent des événements au niveau workspace remontés à chaque session — ils s’incrémenteront **simultanément dans toutes les sessions attachées** en cas de pression budgétaire

**V21-12 (Q1 résolu, verrouillé dans v2.1)** : conserver les noms de champs existants (`mcpBudgetWarningCount`, `mcpChildRefusedBatchCount`, `lastMcpBudgetWarning`, `lastMcpChildRefusedBatch`) avec la sémantique étendue de portée documentée en JSDoc :

```ts
/**
 * Count of `mcp_budget_warning` events the session has observed.
 * Under F2 (`scope: 'workspace'`), this increments simultaneously
 * across all attached sessions because budget events fan out at
 * workspace level. Use `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)`
 * to inspect scope of the most recent event.
 */
mcpBudgetWarningCount: number;
```

Justification : PR 14b a déjà livré ces noms comme surface publique du SDK ; les renommer serait une rupture plus grave que la sémantique légèrement imprécise.

---

## 12. OAuth — Report explicite à F3

Le repli 401 OAuth dans `connectToMcpServer` (mcp-client.ts:950-1010) nécessite une résolution interactive (ouverture de navigateur ou device-flow). Le daemon Mode B **ne doit pas ouvrir de navigateur** (selon la conception PR 21 — un test grep statique échoue sur `open`/`xdg-open`/`shell.openExternal`).

**Comportement F2 pour un serveur nécessitant OAuth** :

1. Premier `acquire` déclenche `connectToMcpServer` → 401 détecté
2. Le pool attrape l’exception OAuth-required, marque l’entrée comme `failed_auth_required`
3. La route de statut expose `errorKind: 'auth_env_error'` (errorKind existant PR 13)
4. Le pool **ne réessaie pas automatiquement**
5. L’opérateur exécute `/mcp auth <name>` (CLI existant) OU utilise la route device-flow de PR 21 pour obtenir un jeton sur disque → la prochaine acquisition de session réessaie et réussit

**F3 remplacera les étapes 4-5** par un `PermissionMediator` qui route la demande de complétion OAuth vers les sessions attachées pour premier répondant.

Cela évite que F2 se mêle du travail de machine d’état d’authentification.

---

## 13. Sémantique de la route de redémarrage

### 13.1 `POST /workspace/mcp/:server/restart` sous pool

Aujourd’hui (PR 17) : redémarrer dans le manager de la session bootstrap = redémarrer l’entrée unique pour ce nom.

Sous pool : nom → éventuellement plusieurs entrées (empreintes différentes pour un même nom = sessions différentes avec des configurations différentes).

**Comportement spécifié** :

| Requête                                             | Comportement                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /workspace/mcp/:server/restart`               | Redémarrer **toutes** les entrées correspondant à `serverName` (parallèle via `Promise.allSettled`) |
| `POST /workspace/mcp/:server/restart?entryIndex=0`  | V21-3 : redémarrer seulement l’entrée #0 (l’index opaque du snapshot §8.3) ; 404 si non trouvée |
| `POST /workspace/mcp/:server/restart?entryIndex=*`  | « Toutes » explicite (identique à aucun paramètre)                                        |

Forme de la réponse :

```ts
type RestartResult = {
  entryIndex: number;        // V21-7: opaque index, not raw fingerprint
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

L’ancienne forme `{restarted: true, durationMs}` est conservée quand `entries.length === 1` ET aucun paramètre `entryIndex` pour la rétrocompatibilité ; les clients peuvent détecter la nouvelle forme en vérifiant `'entries' in response`.

### 13.2 Déduplication de redémarrage en vol

```ts
class PoolEntry {
  private restartInFlight?: Promise<void>;
  async restart(): Promise<void> {
    if (this.restartInFlight) return this.restartInFlight;
    this.restartInFlight = this.doRestart().finally(() => {
      this.restartInFlight = undefined;
    });
    return this.restartInFlight;
  }
}
```

### 13.3 Vérification de budget (préserve le comportement PR 17)

Avant le redémarrage, le pool vérifie le budget : si déconnexion+reconnexion tient toujours dans le budget, OK. La sémantique PR 17 actuelle `{restarted:false, skipped:true, reason:'budget_would_exceed'}` est préservée (maintenant appliquée par entrée).

### 13.4 Appel d’outil en vol pendant la reconnexion (V21-5, nouveau)

La session A invoque `pool.callTool('git.commit', args)` → la requête atteint stdin du processus enfant sous‑jacent → le processus enfant plante en milieu d’écriture → l’entrée passe en reconnexion :

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // pre-reconnect generation
  readonly args: unknown;              // original args, for caller to retry if safe
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**Spécification** :

- La promesse de l’appel en vol rejette avec `MCPCallInterruptedError` dès que la perte de transport est détectée (ne pas attendre la reconnexion)
- Le pool **ne réessaie PAS** l’appel automatiquement ; la sémantique est dangereuse pour les écritures (commit, édition de fichier, etc.) et le pool ne peut pas distinguer lecture et écriture
- L’appelant (généralement la couche d’exécution des outils dans la boucle d’agent) attrape cette erreur et décide : réessayer / remonter à l’utilisateur / abandonner
- Après reconnexion : la session A peut rappeler (même `PooledConnection.callTool`) ; le pool route vers la nouvelle instance de transport de manière transparente
- `MCPCallInterruptedError.clientGeneration` permet à l’appelant de corréler avec un éventuel événement `reconnected` ultérieur

Le test 21.6 doit couvrir : lancer un MCP stdio longue durée, envoyer un appel d’outil, tuer l’enfant en plein appel, vérifier le rejet `MCPCallInterruptedError` avec `clientGeneration` non nul.

---

## 14. Refonte de la route de statut

### 14.1 Nouveau chemin de requête

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — replace data source
let accounting: McpClientAccounting | undefined;
try {
  // NEW: query pool directly via bridge extMethod, not bootstrap session
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // Fallback to legacy bootstrap session path for non-pool daemon
  const manager = config.getToolRegistry()?.getMcpClientManager();
  if (manager) accounting = manager.getMcpClientAccounting();
}
```

`QwenAgent` expose `getMcpPoolAccounting()` :

```ts
class QwenAgent {
  getMcpPoolAccounting(): McpClientAccounting | undefined {
    return this.mcpPool?.getAccounting();
  }
}
```

Les enfants ACP pontent via `extMethod` pour que le daemon puisse appeler.

### 14.2 entryCount + entrySummary

Cf. §8.3.

### 14.3 Cas sans session bootstrap

Aujourd’hui (PR 12), quand le daemon est inactif (pas encore de sessions), `GET /workspace/mcp` retourne `initialized: false` car il n’y a pas de session bootstrap à interroger.

Sous pool : le pool existe dès le constructeur de `QwenAgent` → la route de statut peut retourner des données de comptabilité vivantes **même avec zéro session**. La cellule `initialized: true` même avant la première session. **Changement de comportement documenté** dans la description de la PR ; ce n’est pas une régression.

---

## 15. Interaction loadSession / resume (PR 6 #4222)

### 15.1 Annulation du drainage lors de la reprise

```
session-A active, holds entry-X ref
session-A disconnect (no explicit close) → eventually killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → drain timer starts (30s)
session-A resume within 30s → new newSessionConfig → pool.acquire returns entry-X → attach cancels drain
session-A resume after 30s → entry-X already closed → pool spawns new entry (cold start)
```
### 15.2 Fenêtre de cache `restoreState` (5 min, depuis la PR 6)

`acpAgent.restoreState` est conservé 5 min après la déconnexion. Le drain du pool (30s par défaut) < fenêtre de restauration (5 min) → une reprise entre 30s et 5 min paie un démarrage à froid MCP. Compromis acceptable (la reprise elle-même est un chemin rare).

Alternative : le pool lit la config de la fenêtre de restauration du démon et étend le drain pour correspondre. Ajoute du couplage entre le pool et la machine d'état de la session ; **reporté à un suivi sauf si l'utilisateur signale des douleurs de démarrage à froid**.

### 15.3 Interaction `pendingRestoreIds`

`acpAgent.killSession()` doit appeler `pool.releaseSession(sid)` APRÈS avoir nettoyé `pendingRestoreIds`. Ordre :

1. Session marquée comme restaurable (`pendingRestoreIds.add(sid)`)
2. Session.close() — mais la référence du pool est toujours conservée
3. Après expiration de `RESTORE_WINDOW_MS` sans reprise : `killSession` nettoie définitivement → `pool.releaseSession(sid)` déclenche le drain

Évite que le drain se déclenche pendant une fenêtre de restauration.

---

## 16. Rechargement à chaud de la configuration

### 16.1 Rechargement implicite via changement d'empreinte

L'utilisateur édite `~/.qwen/settings.json` en cours de vol, change l'environnement d'un serveur :

1. Les anciennes sessions conservent l'instantané `Config`/`McpServers` → continuent d'acquérir l'ancienne empreinte → la référence entry-OLD persiste
2. La nouvelle session lit les nouveaux paramètres → nouvelle empreinte → entry-NEW créée → coexiste avec entry-OLD
3. Les anciennes sessions se ferment naturellement → entry-OLD se draine → finalement fermée
4. État stable : seule entry-NEW reste

**Pas de mutation à chaud des connexions en cours** — séparation nette entre les sessions sur différentes versions de configuration.

### 16.2 Route de rechargement forcé (optionnel)

```
POST /workspace/mcp/reload-all
  → pour chaque session : recharger les paramètres, échanger Config.mcpServers
  → pour chaque entrée qui n'est plus référencée : planifier l'éviction
```

Utile pour « J'ai changé des variables d'environnement et je veux un effet immédiat sur toutes les sessions. » Reporté au suivi F2 (non bloquant).

### 16.3 Entrées orphelines lors de la désinstallation d'extension (V21-15)

Scénario : l'extension `foo-ext` enregistre le serveur MCP `foo-server`. L'opérateur exécute `/extension uninstall foo-ext`. Le cycle de vie de l'extension retire `foo-server` de `extensionMcpServers` donc les futurs appels `loadCliConfig` ne l'incluent pas. Mais :

- Les sessions en cours conservent des instantanés `Config` qui incluent toujours `foo-server` → ces sessions continuent d'utiliser l'entrée
- Les nouvelles sessions après désinstallation n'acquièrent pas (le serveur n'est plus dans leur mcpServers fusionné) → pas d'augmentation du refcount

**Résolution** : se fier au drain naturel. À mesure que les anciennes sessions se ferment, le refcount diminue ; éventuellement l'entrée atteint `MAX_IDLE_MS = 5min` et est fermée de force. **Pas d'API explicite `pool.invalidateByExtension(name)`** — maintient le modèle uniforme avec le rechargement à chaud de la config (§16.1).

Compromis : le serveur de l'extension peut fonctionner jusqu'à 5 min après la désinstallation si une session longue le maintient actif. Acceptable ; les opérateurs peuvent `/mcp restart foo-server` puis tuer la session si l'urgence le nécessite.

---

## 17. Ordre d'arrêt

Séquence `QwenAgent.close()` (doit être respectée) :

```
1. Définir acceptingNewSessions = false ; rejeter les nouvelles POST /session
2. Pour chaque invite en cours : signaler l'annulation, attendre la fin (cycle de vie existant PR 11)
3. Pour chaque session : déclencher close → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← contourne le délai de grâce de 30s
   ├── Pour chaque entrée : annuler les timers de drain + santé, marquer en drain
   ├── Pour chaque entrée en parallèle : listDescendantPids → SIGTERM aux enfants
   ├── Pour chaque entrée en parallèle : client.disconnect()
   └── Promise.race contre timeoutMs ; les entrées abandonnées reçoivent SIGKILL
5. Fermeture du canal Bridge
6. Sortie du processus
```

**V21-11** : signature `drainAll` :

```ts
async drainAll(opts?: {
  force?: boolean;       // false par défaut ; true contourne le délai de grâce de 30s
  timeoutMs?: number;    // 10_000 par défaut ; budget horloge ; SIGKILL après pour les retardataires
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // entrées déconnectées proprement
  forced: number;        // entrées SIGKILLées après timeout
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

L'appelant utilise `DrainResult` pour la journalisation de l'arrêt ; si `forced > 0`, journaliser un avertissement pour que l'opérateur sache qu'un serveur ne s'est pas arrêté proprement.

---

## 18. Structure des fichiers

**Nouveaux fichiers :**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool principal (~700 LOC)
  mcp-pool-key.ts              # fingerprint + helpers canonicalize (~150 LOC)
  mcp-pool-entry.ts            # PoolEntry : refcount + drain + health + generation (~500 LOC)
  session-mcp-view.ts          # SessionMcpView : filtre + enregistre les outils/codes (~200 LOC)
  mcp-pool-events.ts           # Union discriminée PoolEvent (~80 LOC)
  pid-descendants.ts           # listDescendantPids multiplateforme (~150 LOC, tests inclus)

packages/core/src/tools/
  mcp-transport-pool.test.ts   # ~900 LOC
  mcp-pool-entry.test.ts       # ~400 LOC
  session-mcp-view.test.ts     # ~250 LOC
  mcp-pool-key.test.ts         # ~150 LOC
  pid-descendants.test.ts      # ~200 LOC (Unix + Windows avec skip-gated)
```

**Fichiers modifiés :**

```
packages/core/src/tools/mcp-client.ts            # split discoverAndReturn() ; connectToMcpServer unifié
packages/core/src/tools/mcp-client-manager.ts    # paramètre pool optionnel ; état budget conditionnel
packages/core/src/tools/tool-registry.ts         # thread du pool depuis la config dans McpClientManager
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # construction QwenAgent.mcpPool ; broadcastBudgetEvent ;
                                                 # newSessionConfig connecte le pool dans Config ;
                                                 # killSession appelle pool.releaseSession
packages/cli/src/serve/run-qwen-serve.ts           # passe --mcp-pool-transports + budget env à l'enfant ACP
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus lit le pool ;
                                                 # restartMcpServer extMethod retourne RestartResult[]
packages/cli/src/serve/capabilities.ts           # annonce mcp_workspace_pool
packages/sdk/src/daemon/mcpEvents.ts             # scope? champ optionnel ; helper isWorkspaceScopedBudgetEvent
```

---

## 19. Livraison en un seul PR — Décomposition des commits (V21-1)

Conformément aux consignes du mainteneur pour un lot cohérent de fonctionnalités (#4175 stratégie de branchement 2026-05-19), F2 est livré en **un seul PR avec 6 commits atomiques**. Le relecteur peut parcourir avec `git log -p HEAD~6..HEAD` et examiner commit par commit.

| Commit # | Titre                                                                                                           | Portée                                                                                                                                                                                                                                                                                                                                                                                                              | Touche                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1        | `refactor(core): split McpClient.discover into pure tool/prompt list and unify connect paths`                   | Ajout de `discoverAndReturn()` ; extraction de `establishConnection()` partagée utilisée par `McpClient.connect()` et la factory `connectToMcpServer()` ; l'ancien `discover()` devient une mince surcouche qui enregistre (préserve le comportement autonome de qwen). Aucun changement de comportement observable.                                                                                                | `mcp-client.ts`, `mcp-client.test.ts`                                                                                     |
| 2        | `feat(core): McpTransportPool + SessionMcpView`                                                                 | Cœur du pool : `fingerprint`, refcount, dédoublonnage `spawnInFlight`, index inverse `sessionToEntries`, machine à états drain, rejeu d'instantané à l'attache, garde de génération, double fan-out outils+codes, copie de confiance par session. Mock McpClient pour tests unitaires. Aucun câblage de production.                                                                                                  | Nouveaux `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + tests |
| 3        | `feat(core): cross-platform descendant pid sweep + pool health monitor`                                         | `listDescendantPids` (Unix `pgrep -P` récursif, Windows PowerShell CIM) ; moniteur de santé unifié dans `PoolEntry` (vérification périodique + compteur d'échecs + backoff de reconnexion selon §6.6) ; tests d'intégration avec sous-processus conditionnés par `QWEN_INTEGRATION === '1'`.                                                                                                                         | Nouveau `pid-descendants.ts` + tests ; `mcp-pool-entry.ts`                                                                 |
| 4        | `feat(serve): wire McpTransportPool into QwenAgent daemon mode`                                                 | `Config.setMcpTransportPool` + `getMcpTransportPool` ; `ToolRegistry` thread le pool dans `McpClientManager` ; paramètre constructeur optionnel `pool?` dans `McpClientManager` ; `acpAgent.QwenAgent` construit le pool à l'init ; injection `newSessionConfig` ; `killSession` appelle `pool.releaseSession` ; contournement SDK MCP + HTTP/SSE via `createUnpooledConnection` ; flags CLI `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`. | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                                |
| 5        | `feat(serve): pool-aware status + restart routes`                                                               | `QwenAgent.getMcpPoolAccounting` extMethod ; `httpAcpBridge.buildWorkspaceMcpStatus` pool-first + fallback session d'amorçage ; `restartMcpServer` accepte `?entryIndex=` et retourne `RestartResult[]` ; `entryCount` + `entrySummary[].entryIndex` sur la cellule ; tags de capacité `mcp_workspace_pool` + `mcp_pool_restart`.                                                                                   | `httpAcpBridge.ts`, `capabilities.ts`, types SDK                                                                           |
| 6        | `feat(serve): graduate MCP budget guardrails to workspace scope`                                                | Déplacement de `tryReserveSlot`/`releaseSlotName`/machine à états hystérésis de `McpClientManager` vers le pool ; suppression du câblage `setMcpBudgetEventCallback` par session dans `acpAgent.newSessionConfig` ; fan-out `QwenAgent.broadcastBudgetEvent` ; champ `scope: 'workspace'` sur la cellule instantané ; champ additif `scope?` dans le SDK ; helper `isWorkspaceScopedBudgetEvent` ; mises à jour de doc inline.                                                          | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                  |

**Estimation totale LOC** : ~4100 production + ~1900 tests = ~6000 LOC (estimation v2 ~3850 ; la croissance absorbe les corrections V21).

**Cible de fusion** : un seul PR dans `daemon_mode_b_main`. Fusion par lot périodique vers `main` selon la stratégie #4175.

**Processus d'auto-relecture avant ouverture du PR** :

1. Après chaque commit, exécuter l'agent `code-reviewer` sur le diff du commit ; intégrer les constatations adoptées dans le même commit
2. Pour les commits 2/4/6 (plus grand risque de conception), exécuter en plus `silent-failure-hunter` + `type-design-analyzer`
3. Après que les 6 commits atterrissent : 3 passages de relecture complets par différentes combinaisons d'agents sur le diff complet du PR
4. Exécuter la suite de tests complète + typecheck + lint sur tous les packages concernés

Miroir du schéma de pré-relecture spécialisé du PR 21.

---

## 20. Tags de capacité + modifications du contrat SDK

### 20.1 Nouveaux tags de capacité (annoncés atomiquement dans v0.16, V21-1)

Comme F2 est livré en un seul PR, les trois tags sont annoncés ensemble. Les consommateurs du pool peuvent supposer que **`mcp_workspace_pool` annoncé ⇒ les champs `entryCount`/`entrySummary`/`scope?` sont tous présents** ; pas de vérification de capacité par champ nécessaire.

| Tag                        | Quand annoncé                                                                                              | Signification                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `mcp_workspace_pool`       | Quand `QwenAgent.mcpPool !== undefined` (toujours vrai en mode démon sauf si `--no-mcp-pool` interrupteur) | `GET /workspace/mcp` reflète l'état au niveau du pool ; champs `entryCount` + `entrySummary` présents                              |
| `mcp_pool_restart`         | Toujours quand `mcp_workspace_pool` est activé                                                             | `POST /workspace/mcp/:server/restart` accepte `?entryIndex=` et peut retourner `entries: RestartResult[]`                         |
| (étend `mcp_guardrails`)   | inchangé                                                                                                   | Même tag, charge utile étendue avec `scope` (`'workspace'` sous F2)                                                               |

### 20.2 Surface additive du SDK

```ts
// @qwen-code/sdk — additif seulement
export interface DaemonMcpBudgetWarningData {
  // champs existants...
  scope?: 'workspace' | 'session'; // NOUVEAU — absent sur les anciens démons (signifie 'session')
}

export interface DaemonMcpChildRefusedBatchData {
  // champs existants...
  scope?: 'workspace' | 'session';
}

export interface ServeWorkspaceMcpServerStatus {
  // champs existants...
  entryCount?: number;
  entrySummary?: Array<{
    fingerprint: string;
    refs: number;
    status: MCPServerStatus;
  }>;
}

export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`EVENT_SCHEMA_VERSION` reste à `1` (additif).

---

## 21. Matrice de test

### 21.1 Clé du pool (F2-2)

- Même cfg → même clé (permutation env-key stable, permutation header-key stable)
- Valeur env diffère d'1 octet → clé différente
- Valeur `Authorization` du header diffère → clé différente
- `includeTools`/`excludeTools`/`trust` muté → MÊME clé (filtre par session)
- Deux `new MCPServerConfig(...)` avec contenu identique → même clé (hash canonique, pas identité)

### 21.2 Cycle de vie (F2-2)

- 3 sessions acquièrent la même clé → 1 spawn (vérifier via spy sur `client.connect`)
- Séquence de libération n,n-1,...,1 → le timer de drain démarre seulement lors du passage 1→0
- Drain de 30s : acquérir à 25s annule le timer ; acquérir à 35s crée une nouvelle entrée
- `MAX_IDLE_MS` (5min) fermeture dure même si le drain batte
- Le spawn échoue pendant in-flight : tous les awaiters reçoivent une erreur ; le slot est libéré ; aucune entrée stockée

### 21.3 Acquérir concurrent (F2-2)

- 5 `acquire(sameKey)` simultanés alors qu'aucune entrée n'existe → exactement 1 appel `spawnEntry`, les 5 obtiennent la même entrée
- Spawn rejeté → les 5 awaiters rejettent avec la même erreur ; une acquisition ultérieure respawne

### 21.4 Isolation par session (F2-2)

- Session A `excludeTools: ['foo']`, Session B sans exclusion → ToolRegistry de A omet foo, B l'a ; tous deux provenant du même `toolsSnapshot`
- Session A `trust: true`, Session B `trust: false` → `DiscoveredMCPTool.trust === true` pour A, `false` pour B ; vérifier qu'il ne s'agit PAS d'une référence partagée (la mutation d'un n'affecte pas l'autre)
- Session A acquiert un serveur de type prompt uniquement → le PromptRegistry de A est peuplé, le ToolRegistry vide pour ce serveur

### 21.5 Changement de liste d'outils/codes (F2-2)

- Le serveur émet `notifications/tools/list_changed` → `applyTools` de tous les abonnés est appelé avec le nouvel instantané
- Un handler obsolète d'une génération pré-reconnexion n'écrase PAS l'instantané
- Analogue pour `notifications/prompts/list_changed`

### 21.6 Crash + reconnexion (F2-2)

- Tuer le sous-processus via `process.kill` → les abonnés reçoivent l'événement `disconnected`
- 3 tentatives de reconnexion (utilisant `MCPHealthMonitorConfig` existant) → succès → `reconnected` + nouvel instantané
- Tentatives épuisées → tous les abonnés reçoivent `failed` ; l'entrée passe à l'état `failed` ; les nouvelles acquisitions réessayent une fois puis lancent une erreur

### 21.7 Nettoyage des descendants (F2-2b)

- Linux/macOS : lancer `bash -c "sleep 60 & sleep 60"` en tant que commande stdio → tuer le processus racine → vérifier que les deux descendants sont récupérés (poll `/proc/<pid>/status`, ou `kill(0, pid) === false`)
- Windows : lancer `cmd /c "ping -t localhost"` wrapper → tuer → vérifier que le sous-processus ping a disparu
- `pgrep` indisponible (PATH manquant) → dégradation douce : journaliser un avertissement, envoyer SIGTERM à la racine uniquement, ne pas crasher

### 21.8 Budget au niveau espace de travail (F2-4)

- 4 sessions × `--mcp-client-budget=2` avec 3 serveurs MCP statiques → total espace de travail = 3 (pas 12) ; cellule instantané `scope: 'workspace'`, `liveCount: 3`
- L'avertissement de budget se déclenche une fois par franchissement 75% à la hausse dans tout l'espace de travail ; diffusé aux 4 sessions simultanément
- Réarmement d'hystérésis : chute à 37,5% → le prochain franchissement se déclenche à nouveau

### 21.9 Rétrocompatibilité (F2-3)

- `qwen` autonome (pas de démon) → `mcpPool === undefined` → tous les tests existants de `mcp-client-manager.test.ts` passent inchangés
- Flag démon `--no-mcp-pool` → repli sur session, tous les tests e2e existants du démon passent

### 21.10 Isolation des identifiants (F2-3)

- Session A injecte `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`, Session B `tokenB` → 2 processus distincts ; vérifier par instantané `entryCount: 2` ; vérifier que les appels d'outils de A passent par le transport de A (par inspection du header dans stdin/log)

### 21.11 LoadSession / resume (F2-3)

- Fermeture de session → drain démarre → reprise dans les 30s → entrée du pool réutilisée (pas de démarrage à froid, vérifié par compteur spy `client.connect`)
- Reprise après 30s mais avant expiration de la fenêtre de restauration → démarrage à froid du pool ; le contenu de restoreState est toujours préservé

### 21.12 Route de redémarrage (F2-3b)

- 1 entrée pour le nom → `POST /workspace/mcp/foo/restart` retourne la forme legacy `{restarted: true, durationMs}`
- 2 entrées pour le nom (empreintes différentes) → retourne `{entries: [{fingerprint, restarted, ...}, ...]}`
- Redémarrage alors qu'un autre redémarrage est en cours → le deuxième appel retourne la même promesse (dédoublonné)
- Redémarrage quand le budget serait dépassé → `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` par entrée

### 21.13 Route de statut (F2-3b)

- Démon inactif (pas de sessions) mais le pool contient des entrées en cache d'une session précédente → `GET /workspace/mcp` retourne `initialized: true` avec une comptabilité vivante
- Session d'amorçage inexistante → fallback vers le chemin direct du pool ; pas d'erreur
- La requête au pool échoue → fallback vers le chemin de session d'amorçage ; ne crash jamais l'instantané

### 21.14 Réducteur SDK (F2-4)

- `mcpBudgetWarningCount` s'incrémente simultanément sur toutes les sessions abonnées quand l'événement d'espace de travail est diffusé
- `isWorkspaceScopedBudgetEvent(e)` identifie correctement la portée depuis la charge utile
- Ancien démon (pas de champ `scope`) → interprété par défaut comme 'session'

### 21.15 Rechargement à chaud de la configuration (F2-3)

- Changement de settings.json en cours de vol → l'ancienne session garde l'ancienne entrée, la nouvelle session crée une nouvelle entrée, les deux coexistent ; l'ancienne se draine naturellement quand la dernière ancienne session se ferme
- 0 sessions après la fermeture de l'ancienne session → le timer de drain se déclenche → l'ancienne entrée est récupérée → seule la nouvelle entrée reste

### 21.16 Ordre d'arrêt (F2-3)

- `QwenAgent.close()` se déclenche dans l'ordre : arrêter d'accepter → drainer les invites → fermer les sessions → `pool.drainAll` → aucun pid zombie dans `pgrep -P <acpChildPid>` après la sortie
---

## 22. Questions ouvertes

V21 a verrouillé Q1/Q3/Q4/Q6 dans les valeurs par défaut de conception (livraison en PR unique). Q2/Q5/Q7/Q8/Q9 restent en suspens.

| #     | Question                                                                                                          | Valeur par défaut de la conception F2                                                      | Décision requise avant |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------- |
| Q1 ✅ | Noms des champs du reducer SDK — renommer ou conserver ?                                                          | **VERROUILLÉ v2.1** : conserver `mcpBudgetWarningCount` etc. avec sémantique de périmètre étendue dans JSDoc | résolu                |
| Q2    | Capacité `mcp_workspace_pool` — faire évoluer `protocolVersions` ('v1' → 'v1.1'), ou rester additif dans 'v1' ?  | **Rester additif dans 'v1'** (cohérent avec le précédent de la PR 14b)                     | commit 5               |
| Q3 ✅ | Drapeau `--no-mcp-pool` — activé par défaut ou optionnel ?                                                        | **VERROUILLÉ v2.1** : activé par défaut ; `--no-mcp-pool` est un coupe-circuit             | résolu                 |
| Q4 ✅ | HTTP/SSE par défaut — pool désactivé ou activé ?                                                                  | **VERROUILLÉ v2.1** : pool désactivé ; activation via `--mcp-pool-transports`               | résolu                 |
| Q5    | `POST /workspace/mcp/reload-all` — inclure dans F2 ou dans un suivi ?                                             | **Suivi**                                                                                  | n/a (reporté)          |
| Q6 ✅ | Construction paresseuse du pool — vaut-elle la peine d'être conditionnelle ?                                      | **VERROUILLÉ v2.1** : eager (toujours construire dans le constructeur `QwenAgent`)         | résolu                 |
| Q7    | Fenêtre `restoreState` vs vidange du pool — conserver séparé, aligner, ou lire depuis les paramètres ?            | **Conserver le défaut 30s séparé** + bouton de configuration `--mcp-pool-drain-ms`         | commit 4               |
| Q8    | Gestion OAuth — confirmer le report en F3, documenter la solution de contournement ?                             | **Reporté en F3**, documenter la solution de contournement `/mcp auth <name>`               | commit 4               |
| Q9    | Exposition `entrySummary` — toujours inclure, ou derrière un drapeau verbose ?                                    | **Toujours inclure** (petite charge utile, utile pour les opérations)                      | commit 5               |
| Q10   | Mettre à jour `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` décision #3 — coordonner avec @wenshao ? | La description de la PR F2 lie la PR codeagents ; les deux PRs sont examinées indépendamment | PR ouverte             |

---

## 23. Risques

### Élevé

- **R1 (État global A2)** : collision `serverStatuses` sur plusieurs entrées de même nom. Atténué par la fonction de statut agrégé ; le risque restant est que les consommateurs SDK lisent la Map globale brute (peu probable — uniquement utilisée via l'accesseur `getMCPServerStatus(name)`).
- **R2 (Symétrie PromptRegistry)** : oublier le fan-out des prompts dans un chemin de code quelconque supprime silencieusement les prompts. Atténué par le troisième point du test F2-2 21.4 + test d'intégration vérifiant la parité des prompts par rapport à pré-F2.
- **R3 (Fuite d'état du transport HTTP)** : activer le pool HTTP pour un serveur qui maintient un état par transport corrompt les contextes de session. Atténué par désactivation par défaut + documentation ; ne peut pas être détecté automatiquement.

### Moyen

- **R4 (Unification des chemins F2-1)** : la fabrique `connectToMcpServer` et la classe `McpClient` présentent des différences comportementales subtiles (par exemple, capacités annoncées au moment de la construction vs au moment de la connexion). Atténué par F2-1 étant une PR de refactoring pur avec une couverture de régression complète avant le début du travail sur le pool.
- **R5 (PID descendant Windows)** : `Get-CimInstance` PowerShell peut être lent (coût de lancement) ou bloqué par AppLocker. Atténué par un délai d'attente de 2s + dégradation gracieuse.
- **R6 (Amplification des événements de diffusion du pool)** : un avertissement de budget diffusé à 100 sessions provoque 100 appels `extNotification` dans une boucle serrée. Atténué par la parallélisation `Promise.all` + bloc catch par session (motif existant PR 14b).

### Faible

- **R7 (Stabilité de l'empreinte entre les versions de MCPServerConfig)** : de futurs champs ajoutés à `MCPServerConfig` non inclus dans l'empreinte permettraient silencieusement un partage incorrect. Atténué par une fonction de canonisation explicite + test qui énumère tous les champs de `MCPServerConfig` et vérifie la couverture.
- **R8 (Courses du compteur de génération)** : des cycles de redémarrage rapides pourraient épuiser la précision des nombres JavaScript (≈ 2^53 = ~285k années à 1/s). Pas une préoccupation pratique.

### Spécifiques à la PR unique (V21-14)

- **R9 (Fatigue de relecture sur une PR unique d'environ 6000 LOC)** : la bande passante du relecteur devient le chemin critique. F3 bloqué par la fusion de F2 → bloque les autres contributeurs. Atténuation : (a) pré-relecture avec 3 agents spécialisés et intégration des P0/P1 avant l'ouverture, en miroir du motif de la PR 21 ; (b) structuration en 6 commits atomiques pour que le relecteur puisse progresser ; (c) coordonner la fenêtre de relecture avec @wenshao à l'avance via le commentaire #4175.
- **R10 (Accumulation de conflits de fusion `daemon_mode_b_main`)** : F2 touche `acpAgent.ts`, `httpAcpBridge.ts`, `capabilities.ts`, `mcp-client*.ts` — tous des chemins chauds. Les contributeurs F3/F4 qui atterrissent simultanément risquent des conflits pendant la fenêtre de relecture de F2 (1 à 2 semaines). Atténuation : `git rebase origin/daemon_mode_b_main` quotidien ; coordination via la mise à jour #4175 indiquant que F2 est en cours + demande à F3/F4 de reporter les modifications de fichiers chauds jusqu'à la fusion de F2.
- **R11 (Temps d'exécution CI)** : environ 1900 LOC de nouveaux tests incluant le lancement de sous-processus + le sweep de pid multiplateforme pourrait faire passer le temps CI de 30 min à 50 min. Atténuation : (a) soumettre les tests de sous-processus à `process.env.QWEN_INTEGRATION === '1'`, exécuter un sous-ensemble dans la CI PR + l'ensemble complet dans les tests nocturnes ; (b) parallélisme Vitest ≥ 4 ; (c) les tests de sweep pid Windows sont soumis à un saut conditionnel uniquement sur le runner Windows GHA.

---

## 24. Mises à jour de la documentation

| Doc                                                                            | Mise à jour                                                                                                                                                  | Quand                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`             | Décision #3 « Durée de vie du serveur MCP » : actuellement « par session » ; mettre à jour en « mis en pool par espace de travail avec clé de hachage de configuration en mode démon ; autonome par session » | Fusion F2-3 (coordination avec @wenshao PR codeagents) |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                             | Vague 5 PR 23 → marquer comme série F2 ; lier aux PRs                                                                                                        | Fusion F2-3                                          |
| `packages/cli/src/serve/README.md` (si existe) ou nouveau `docs/serve/mcp-pool.md` | Nouvelle section : sémantique du pool, clé d'empreinte, activation du transport, sémantique de redémarrage, interprétation de l'instantané de statut          | F2-3b                                                |
| `packages/sdk/README.md`                                                       | Champ `scope?` sur les événements de garde-fou, `entryCount` sur le statut du serveur, helper `isWorkspaceScopedBudgetEvent`                                   | F2-4                                                 |
| Corps de l'issue #4175                                                         | Mettre à jour l'entrée F2 avec le tableau des sous-PR, lier à la conception v2 (ce document)                                                                  | Avant l'ouverture de F2-1                            |
| Corps de l'issue #3803                                                         | Ligne Décision #3 : mettre à jour « Actuellement par session » → « Mis en pool par espace de travail sous démon (F2) »                                          | Après la fusion de F2-3                              |
| Commentaire en ligne `acpAgent.ts:869-936`                                     | Supprimer la référence prospective « Vague 5 PR 23 » ; mettre à jour en « diplômé par F2 vers `scope: 'workspace'` »                                             | PR F2-4                                              |
| CHANGELOG / notes de version (Vague 6 / F5)                                    | Titre « Les processus MCP sont désormais partagés entre les sessions dans un espace de travail »                                                              | Version F5                                           |

---

## 25. Modèle de description de PR (livraison en PR unique)

```markdown
## feat(serve): pool de transport MCP partagé (périmètre espace de travail) [F2]

PR unique et cohérente en fonctionnalité selon la stratégie de branchement #4175 (2026-05-19).
Remplace ce qui était initialement prévu comme Vague 5 PR 23 + sous-PRs F2-1..F2-4.

### Périmètre

~4100 LOC de production + ~1900 LOC de tests répartis sur 6 commits atomiques.
Parcourez avec `git log -p HEAD~6..HEAD` pour une analyse commit par commit.

### Document de conception

Voir `docs/design/f2-mcp-transport-pool.md` (v2.1).

### Agents de pré-relecture spécialisés (selon le motif de la PR 21)

Intégrés dans le premier commit avant l'ouverture :

- code-reviewer : N résultats, tous adoptés
- silent-failure-hunter : N résultats, tous adoptés
- type-design-analyzer : N résultats, tous adoptés

### Clôture

(aucune — l'entrée F2 dans #4175 reste ouverte jusqu'à ce que la PR soit fusionnée dans le lot principal)

### Lié

- #3803 mise à jour de la décision #3 (PR codeagents <lien>)
- PR 14b (#4271 fusionnée) — base du garde-fou budgétaire ; F2 diplôme le périmètre vers espace de travail
- F1 (#4319 fusionnée) — package acp-bridge ; F2 dépend des coutures d'injection

### Rétrocompatibilité

- `qwen` autonome (non-démon) : pool non construit ; comportement existant préservé
- Démon `qwen serve --no-mcp-pool` : coupe-circuit revient au mode par session
- SDK : tous les nouveaux champs sont additifs (`entryCount`, `scope?`) ; EVENT_SCHEMA_VERSION reste à 1
- Anciens clients SDK : `scope: 'workspace'` inconnu ignoré selon le contrat de la PR 14
- Anciens démons : les consommateurs SDK peuvent détecter l'absence de la capacité `mcp_workspace_pool` et revenir en arrière

### Plan de test

- [ ] Clé du pool : stabilité de la permutation d'env, divergence d'en-tête, exclusion du filtre par session
- [ ] Cycle de vie : partage 3 sessions, grâce de vidange, déduplication d'acquisition concurrente, libération d'emplacement après échec de lancement
- [ ] Double fan-out Outils + Prompts, copie de confiance par session, rejeu d'instantané lors de l'attachement
- [ ] Garde de génération : le gestionnaire de pré-reconnexion n'écrase pas l'instantané de post-reconnexion
- [ ] Crash + reconnexion avec backoff stdio (5s × 3) et backoff HTTP (1/2/4/8/16s × 5)
- [ ] Sweep de pid descendant : récursion pgrep Linux/macOS, PowerShell CIM Windows
- [ ] Budget au niveau de l'espace de travail : 4 sessions × budget=2 → 3 max (pas 12) ; fan-out vers tous les attachés
- [ ] Reprise de LoadSession dans la fenêtre de vidange : entrée de pool réutilisée, pas de démarrage à froid
- [ ] Rechargement à chaud de la configuration : les entrées anciennes/nouvelles coexistent ; les anciennes se vident naturellement
- [ ] Route de redémarrage : sélectivité `?entryIndex=` ; forme de réponse héritée pour entrée unique préservée
- [ ] Appel d'outil en vol pendant la reconnexion : rejet `MCPCallInterruptedError`
- [ ] qwen autonome : tous les tests existants de mcp-client-manager réussissent inchangés
```

## Résumé

F2 v2.1 = PR unique avec 6 commits atomiques (~6000 LOC), ciblant `daemon_mode_b_main`. Piliers clés de la conception :

1. **`McpTransportPool`** dans `packages/core` (côté enfant ACP), périmètre espace de travail, refcount + vidange 30s
2. **Clé d'empreinte** SHA-256 sur la configuration canonique incluant env/en-têtes (motif claude-code), excluant les filtres par session (includeTools/trust)
3. **`SessionMcpView`** projection du registre d'outils+prompts par session avec copie de confiance
4. **Rejeu d'instantané + garde de génération** pour les courses d'attachement et les notifications obsolètes
5. **Sweep de pid descendant multiplateforme** (motif opencode + port Windows)
6. **HTTP/SSE optionnel**, contournement MCP SDK, OAuth reporté en F3
7. **Machine d'état budgétaire** diplômée vers le périmètre espace de travail ; cellule d'instantané + événements push s'étendent additivement (`scope?`)
8. **Routes de statut et de redémarrage** refactorisées : pool d'abord avec repli sur session d'amorçage ; `entryCount` + `RestartResult[]`

**Questions ouvertes Q1–Q10** au §22 nécessitent des décisions des mainteneurs avant l'ouverture des sous-PRs respectives. Recommandation : résoudre Q1–Q4 avant le début de F2-3 (elles conditionnent la direction générale) ; Q5–Q10 peuvent être résolues de manière incrémentale.
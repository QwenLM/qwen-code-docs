# F2: Shared MCP Transport Pool — Design v2.2

> Cible `daemon_mode_b_main` (selon la stratégie de branchement #4175). Remplace la PR 23 de la vague 5 de #4175.
> **Livraison en une seule PR** conformément aux directives de regroupement cohérent des fonctionnalités du mainteneur (2026-05-19).
> Auteur : doudouOUC. Date : 2026-05-20. Révisé : 2026-05-20 (v2.2 — intégration des retours de revue).

---

## 0. Changelog

### v2.2 (2026-05-20) — Implémentation de la PR #4336 + 32 intégrations de retours

La PR #4336 a livré F2 en 6 commits atomiques + 6 commits de correctifs sur environ 4 heures. Wenshao a effectué une revue cumulative en 3 lots ; chaque lot a produit des correctifs en ligne + critiques qui ont été réintégrés. Le tableau ci-dessous récapitule les changements par rapport à v2.1, organisés par lot de revue.

#### v2.1 → premier lot de revue (commits 1-4, wenshao C1-C7 + S1-S4)

| #   | Site                                                       | Ce qui n'allait pas                                                                                                                                                                                                                     | Commit de réintégration |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| C1  | `acpAgent.ts:269` — chemin de fermeture IDE                | Le vidage du pool s'exécutait uniquement dans le gestionnaire SIGTERM ; une fermeture normale initiée par l'IDE laissait des entrées jusqu'à ce que l'OS les récupère. Miroir du vidage du pool de SIGTERM sur `await connection.closed` | `ae0b296c4`             |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                       | `cancelDrainTimer` réinitialisait `maxIdleTimer` à chaque changement d'état, annulant ainsi la limite stricte du §6.3. Efface désormais uniquement `drainTimer` ; max-idle survit pendant toute la durée de vie de l'entrée             | `ae0b296c4`             |
| C3  | `mcp-pool-entry.ts:doRestart`                              | Un échec de reconnexion laissait l'entrée dans un état zombie (`localStatus=CONNECTED`, `state='active'`, snapshot obsolète). Try/catch + transition vers `'failed'` en cas d'échec                                                    | `ae0b296c4`             |
| C4  | `mcp-pool-entry.ts:forceShutdown`                          | `state='closed'` défini APRÈS les `await`, donc un `acquire` concurrent pouvait observer `'active'` et fournir une connexion obsolète. Défini de manière synchrone en début de méthode                                                  | `ae0b296c4`             |
| C5  | `mcp-transport-pool.ts:drainAll`                           | Un `acquire` concurrent pouvait créer une nouvelle entrée en plein vidage. Ajout d'un drapeau de mutex `draining` + `await Promise.allSettled(spawnInFlight)` avant de vider                                                             | `ae0b296c4`             |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                   | L'écouteur n'était pas filtré par `serverName` ; chaque entrée recevait les notifications de statut de tous les serveurs + l'écriture de `markActive` de sa propre entrée se répercutait en écho                                       | `ae0b296c4`             |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`     | La barrière du mode pool a été ajoutée à `discoverAllMcpTools` mais manquait dans `Incremental` — `/mcp refresh` contournait le pool, créant un client par session                                                                      | `ae0b296c4`             |
| S1  | `session-mcp-view.ts:passesSessionFilter`                  | La documentation ne précisait pas que `excludeTools` utilise l'égalité directe (pas de support des parenthèses) ; divergence par rapport à `mcp-client.ts:isEnabled`                                                                    | `ae0b296c4`             |
| S2  | Docstring de `pid-descendants.ts`                          | Prétendait l'existence d'une branche Windows spécifique `taskkill /F` qui n'existait pas — Node polyfill `process.kill('SIGTERM')` vers `TerminateProcess`                                                                                | `ae0b296c4`             |
| S3  | Log de débogage de `session-mcp-view.ts:applyTools`        | La chaîne contenait le littéral `"N"` au lieu d'une interpolation — les opérateurs voyaient `applied 12 tools (filtered to N registered)`                                                                                               | `ae0b296c4`             |
| S4  | Callback de statut de `mcp-transport-pool.ts:createUnpooledConnection` | Codé en dur à `() => CONNECTED`, donc `aggregateStatusByName` mentait après une déconnexion. Maintenant `() => client.getStatus()`                                                                                           | `ae0b296c4`             |

#### Lot d'auto-revue du commit 5 (R1-R3 petits)

| #   | Site                                            | Ce qui n'allait pas                                                                                                                                                                                                        | Commit de réintégration |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| R1  | `server.test.ts:918` enveloppe `/capabilities`   | Le test assertait `getAdvertisedServeFeatures()` (pas de bascules) mais `server.ts` passe `mcpPoolActive: opts.mcpPoolActive !== false` (activé par défaut). Ancrage de la bascule                                          | `3e68c00bc`             |
| R2  | Couverture du statut par défaut de `server.test.ts` | Aucun test ne démarrait avec les options par défaut pour vérifier que les balises de pool sont annoncées. Ajout d'un test explicite avec `mcpPoolActive: false`                                                                     | `3e68c00bc`             |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`   | La documentation indiquait que les SDK pré-PR « verraient la nouvelle valeur comme inconnue et l'afficheraient génériquement » — en réalité `MCP_RESTART_REFUSED_REASONS.has(...)` rejette → abandon silencieux               | `3e68c00bc`             |
#### Lot de révision secondaire (commits 1-5, wenshao R1-R10)

| #   | Site                                                | Problème                                                                                                                                                                          | Commit d'intégration |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                    | Le correctif C2 a bien préservé `maxIdleTimer` lors d'un flap, mais la force-fermeture de l'action d'incendie ignorait `refs.size`. Une session active avec ré-attachement dans la période de grâce perdait ses outils après 5 min   | `72399f109`    |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`  | `releaseAllPooledConnections` + ré-acquisition de TOUTES à chaque passage laissait une brève fenêtre sans outils MCP enregistrés ET relançait chaque drain timer. Différence par rapport au `(name, fingerprint)` désiré | `72399f109`    |
| WR3 | `mcp-pool-entry.ts:doRestart` snapshot fan-out      | Le redémarrage mettait à jour `toolsSnapshot`/`promptsSnapshot` et émettait des événements typés — mais aucune instance `SessionMcpView` n'était abonnée à ce flux. Itérer directement les `subscribers` après la snapshot   | `72399f109`    |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount` | Comptait le websocket dans `subprocessCount` — le websocket diale à distance, pas de processus enfant local. Restreint à `'stdio'` uniquement                                                                       | `72399f109`    |
| WR5 | `pid-descendants.ts` PowerShell `-Filter`           | `${pid}` interpolé directement dans la chaîne `-Filter`. La garde `Number.isInteger` du point d'entrée empêche l'injection aujourd'hui ; lier à `$p` pour une défense en profondeur contre de futures relaxations de garde | `72399f109`    |
| WR6 | `mcp-pool-entry.ts` ctor `cfg` field                | `readonly cfg: MCPServerConfig` était implicitement public, exposant les clés API de l'environnement / auth header / champs OAuth. Rendu `private` ; nouveau getter `transportKind` pour le seul lecteur externe      | `72399f109`    |
| WR7 | `mcp-pool-events.ts` exports prématurés              | 5 gardes de type PoolEvent + ré-export `Prompt` + `PoolEntryConnectionStatus` n'avaient aucun appelant. Supprimés ; conservé `MCPCallInterruptedError` (exigence de conception §13.4)                             | `72399f109`    |
| WR8 | `acpAgent.ts:269,300` duplication vidage du pool        | SIGTERM + fermeture IDE avaient des blocs `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }` identiques. Extracteur helper `drainPoolBeforeExit(label)`                          | `72399f109`    |

#### Lot d'auto-révision du commit 6 (R1-R3 course critique)

| #   | Site                                    | Problème                                                                                                                                                               | Commit d'intégration |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`        | Course de libération de slot : A termine le spawn, B (empreinte différente, même nom) démarre le spawn, A se vide. Le callback Close ne vérifiait que `entries` (B pas encore enregistré) → libération prématurée | `0e58a098f`    |
| 6R2 | `events.ts:mcpBudgetWarningCount` JSDoc | Les événements au niveau de l'espace de travail sont diffusés vers N sessions → N incréments du reducer ; les consommateurs qui agrègent entre sessions doublent le comptage. La docstring mise à jour pour mentionner le multiplicateur           | `0e58a098f`    |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`      | Itérait directement `this.sessions.keys()` pendant le fan-out asynchrone ; `killSession` concurrent pouvait corrompre l'itérateur. Snapshot via `Array.from(...)`                               | `0e58a098f`    |

#### Lot de révision tertiaire (commits 1-6, wenshao W1-W15)

| #   | Site                                                           | Problème                                                                                                                                                                                | Commit d'intégration |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` catch                       | Une panne de spawn fuyait `statusChangeListener` de manière permanente — seul `forceShutdown` le supprime. Ajout de `entry.forceShutdown('manual')` dans le catch                                                     | `4a3c5cd90`    |
| W2  | `mcp-pool-entry.ts:statusChangeListener` cross-check           | La map `serverStatuses` au niveau module partagée entre entrées de différentes empreintes. L'erreur de transport de A écrivait DISCONNECTED, le listener de B corrompait `localStatus` de B. Ajout du check `client.getStatus()` | `4a3c5cd90`    |
| W3  | `mcp-pool-entry.ts:doRestart` pid sweep                        | Le redémarrage sautait `listDescendantPids` + `sigtermPids` — chaque redémarrage d'un stdio encapsulé dans `npx`/`uvx` orphelinait le véritable petit-fils MCP. Ajout du sweep avant déconnexion                           | `4a3c5cd90`    |
| W4  | `mcp-pool-entry.ts:doRestart` course du drain timer                 | Le drain timer pouvait se déclencher en plein milieu d'un yield de redémarrage → `forceShutdown` supprime l'entrée → `client.connect` crée un orphelin. Ajout de `cancelDrainTimer` + `state→active` en haut de `doRestart`                    | `4a3c5cd90`    |
| W5  | `mcp-client-manager.ts:pooledConnections` handles morts         | Quand l'entrée passait à `'failed'`, le manager conservait pour toujours un `PooledConnection` mort. S'abonner aux événements d'entrée ; évincer sur `'failed'` (idempotent via la garde `get(name) === conn`)               | `4a3c5cd90`    |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` réentrance | Deux passages entrelacés pouvaient tous deux faire `set(name, conn)` → première connexion fuyait. Ajout d'un mutex `discoveryInFlight` ; le second appelant attend la même promesse. Nouveau test de régression                             | `4a3c5cd90`    |
| W9  | `acpAgent.ts:parsePoolDrainMs` sévérité                      | `Number.parseInt` acceptait `'30000ms'` / `'30000abc'`. Regex stricte `^\d+$` ; rejeter avec avertissement stderr + fallback par défaut                                                                    | `4a3c5cd90`    |
| W10 | `mcp-transport-pool.ts:acquire` ordre indexAttach              | `indexAttach` modifiait `sessionToEntries` AVANT `entry.attach()`. Si `attach` levait une exception, mapping d'index inversé obsolète. Déplacé `indexAttach` après la réussite de `attach` (chemins rapide et en vol)   | `4a3c5cd90`    |
| W13 | `mcp-transport-pool.ts:subprocessCount` JSDoc                  | La documentation indiquait encore `stdio + websocket` après que WR4 l'ait restreint à stdio. Mise à jour                                                                                                                  | `4a3c5cd90`    |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` catch         | Même fuite de `statusChangeListener` que W1 dans le chemin non poolé. Même miroir : `forceShutdown` avant déconnexion                                                                                   | `4a3c5cd90`    |
| W15 | `bridge.ts:restartMcpServer` réponse                          | Le cast `as PoolEntries` n'était pas fiable — JSON non typé depuis l'enfant ACP. Vérification `Array.isArray` + garde de forme par entrée ; entrées malformées ignorées avec breadcrumb stderr                              | `4a3c5cd90`    |
#### Refusé avec réponse (classé comme suivis F2)

| #   | Site                                                | Raison du refus                                                                                                                                                             |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W7  | Lacunes de couverture de test (4 chemins critiques non testés)      | 1/4 ajouté (test de régression W6) ; le reste reporté à une PR ciblée sur la couverture de test après la fusion de la série F2                                                                                 |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` inutilisés | Placeholders de compatibilité prospective pour la reconnexion différée pilotée par le moniteur de santé (conception §6.6) ; suppression + réajout chamboule le type public                                          |
| W11 | Blocs d'attache double chemin rapide / chemin en vol  | ✅ Fait dans PR A : helpers privés `attachPooledSession` + `rollbackReservationOnSpawnFailure` (commit `2d546efca`)                                                                |
| W12 | `passesSessionFilter` O(M×N) par `applyTools`       | ✅ Fait dans PR A : `applyTools` / `applyPrompts` précalcule des `Set`s de filtre une fois par passage ; le prédicat devient O(1) par outil (commit `a4a855ab3`)                                      |
| R9  | `McpClientManager` ctor 7 sentinelles positionnelles      | ✅ Fait dans PR A : constructeur par objet d'options + fabrique de test `mkManager` (commit `0cb1eaa27`)                                                                                             |
| R10 | Coût `pgrep -P <pid>` par PID par niveau             | ✅ Fait dans PR A : snapshot unique `ps -A -o pid=,ppid=` + parcours BFS en mémoire ; la BFS `pgrep` conservée comme fallback pour BusyBox <v1.28 / distroless (commit atterrissant comme dernière pièce de PR A) |

#### Nombre de bugs

- **3 lots × 27 corrections critiques / importantes** + 5 plis de doc / suggestion = **32 plis de revue** au total
- **2 courses critiques détectées seulement au second regard** (course 6R1 de libération de slot pendant le spawn ; réentrance W6 de la découverte)
- **0 échecs silencieux livrés** — chaque correction porte une miette de pain en ligne `// F2 (#4175 commit X review fix — wenshao YN):` pointant vers la revue originale

### v2.1 (2026-05-20) — stratégie PR unique + 12 plis de revue

| #      | Quoi                                                                                                          | Pourquoi                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| V21-1  | Passé du plan de 6 sous-PR à **une seule PR cohérente sur la fonctionnalité** avec 6 commits atomiques                           | Selon les conseils du mainteneur (stratégie de branchement #4175) ; le relecteur peut lire commit par commit via `git log -p`         |
| V21-2  | Ajout de l'index inversé `sessionToEntries: Map<sid, Set<ConnectionId>>` dans le pool (§6)                              | `releaseSession` O(N entrées) → O(références de session) ; nécessaire pour l'échelle de 1000 sessions                               |
| V21-3  | Paramètre de requête `?fingerprint=` sur la route de redémarrage (§13.1)                                                          | L'opérateur peut vouloir redémarrer une seule entrée quand le même nom a plusieurs empreintes ; coût quasi nul à ajouter maintenant |
| V21-4  | Le chemin d'échec de spawn libère explicitement le slot réservé (§6.1, §6.5)                                             | Sinon fuite de slot jusqu'au prochain passage du moniteur de santé ; vrai bug subtil                                            |
| V21-5  | Nouveau §13.4 : sémantique d'appel d'outil en vol pendant la reconnexion                                                     | `MCPCallInterruptedError` ; le pool ne rejoue PAS automatiquement (écritures non sûres)                                            |
| V21-6  | Nouveau §10.4 : `/mcp disable X` déclenche une réapplication de `SessionMcpView`                                                | Sinon la désactivation en cours de session ne supprime pas les outils déjà enregistrés                                             |
| V21-7  | La route de statut expose `entryIndex` et non l'empreinte brute (§8.3)                                                  | Évite l'exposition par canal auxiliaire de la rotation du jeton OAuth via le changement d'empreinte                                     |
| V21-8  | Backoff de reconnexion spécifié : stdio fixe 5s × 3, HTTP/SSE exponentiel 1/2/4/8/16s × 5 (§6.6)                     | v2 ne disait pas ; HTTP nécessite un budget de réessai plus long pour les fluctuations réseau                                                  |
| V21-9  | `canonicalOAuth(o)` normalise `{enabled: false}` ≡ `undefined` ≡ `null` (§5.1)                               | Sinon des configurations fonctionnellement équivalentes produisent des entrées distinctes                                              |
| V21-10 | Renommage de l'aide de repli du pool de « legacy in-process acquire » en `createUnpooledConnection` (§5.3, §6.1)      | Le contournement SDK MCP est permanent, pas legacy                                                                         |
| V21-11 | `drainAll(opts?)` retourne `Promise<void>` avec un budget `timeoutMs` sur le temps réel (§17)                            | L'appelant a besoin de savoir quand le drain se termine pour l'ordre d'arrêt                                                  |
| V21-12 | Noms de champs du réducteur SDK verrouillés (Q1 résolu) : conserver `mcpBudgetWarningCount` etc. avec sémantique de portée dans JSDoc | Pas de renommage d'API publique en cours de PR                                                                                     |
| V21-13 | Verrouillé Q3 (pool activé par défaut, interrupteur `--no-mcp-pool`), Q4 (HTTP/SSE opt-in), Q6 (construction anticipée)       | Livraison en PR unique ; pas de gating par flag nécessaire                                                                       |
| V21-14 | Ajout des risques PR unique R9/R10/R11 (§23)                                                                        | Fatigue de revue, conflit de fusion daemon_mode_b_main, temps CI                                                      |
| V21-15 | Traitement des entrées orphelines de désinstallation d'extension reporté au reap naturel `MAX_IDLE_MS` (§16.3)                      | Pas de `invalidateByExtension` explicite ; maintient le modèle uniforme                                                        |
### v2 (2026-05-20) — intégration des révisions initiales de l'esquisse v1

| #   | Quoi                                                                                                | Pourquoi                                                                                   |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| C1  | Le Pool distribue **Tools + Prompts** (auparavant : outils uniquement)                              | Le constructeur de `McpClient` prend les deux registres ; les prompts seraient autrement silencieusement perdus en mode pool |
| C2  | Nouvelle section sur **la coexistence d'état global** (Maps de module `serverStatuses` / `mcpServerRequiresOAuth`) | Le partage inter-session existe déjà aujourd'hui ; le pool hérite et formalise             |
| C3  | Le chemin de fabrique `connectToMcpServer` **unifié** avec la classe `McpClient` dans F2-1          | v1 ne refactorisait que la classe ; cela laissait un chemin parallèle non mutualisé        |
| C4  | Relecture d'instantané à l'attache (style earlyEvents) ajoutée à `PoolEntry.attach()`               | Nouvelle situation de concurrence : la session-B s'attache → le serveur émet `tools/list_changed` avant que l'abonnement soit câblé |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` pour déduplication des acquisitions concurrentes | v1 mentionné dans la matrice de tests mais omis dans le contrat d'implémentation           |
| C6  | Balayage des PID descendants multiplateforme (pgrep Linux/macOS, wmic/PowerShell Windows)            | v1 disait « copier le `pgrep -P` d'opencode » — c'est Unix uniquement                      |
| C7  | Champ `trust` par session **copie** de l'objet outil                                                 | `trust` vit sur `DiscoveredMCPTool` ; une instance partagée mélangerait la confiance par session |
| C8  | Transports HTTP/SSE **opt-in** pour le pooling (par défaut : stdio + websocket uniquement)           | Certains serveurs MCP HTTP maintiennent un état de session par transport ; le partage risque une fuite d'état |
| C9  | Contournement explicite du serveur MCP SDK (`isSdkMcpServerConfig`)                                 | `sendSdkMcpMessage` est par conception par session                                         |
| C10 | Chemin OAuth explicitement **reporté à F3**                                                          | Le flux OAuth nécessite un routage de type PermissionMediator ; pas dans le périmètre de F2 |
| C11 | Sémantique de la route de redémarrage spécifiée (nom → toutes les entrées correspondantes)           | La route `POST /workspace/mcp/:server/restart` de PR 17 était auparavant sans ambiguïté (1 entrée) ; maintenant 1..N |
| C12 | Section de refactorisation de la route de statut (nouveau chemin : `QwenAgent.getMcpPoolAccounting()`) | `httpAcpBridge.ts:733-770` lit actuellement le gestionnaire de la session d'amorçage — doit changer |
| C13 | Compteur de génération sur `PoolEntry` pour la protection contre les gestionnaires obsolètes de `tools/list_changed` | Motif Opencode : `if (s.clients[name] !== client) return`                                 |
| C14 | Décomposition des sous-PR 4 → **6**                                                                  | v1 sous-estimé ; A2/B1/B3/C6 ajoutent chacun un travail réel                              |
| C15 | Construction paresseuse du pool (uniquement lorsqu'au moins 2 sessions sont vues) — optionnel        | `qwen serve --foreground` session unique n'en bénéficierait pas ; économise le coût d'initialisation |

---

## 1. Objectifs / Non-objectifs

**Objectifs**

- N sessions dans 1 espace de travail partageant 1 processus par configuration serveur unique — indexé par empreinte
- Vues `ToolRegistry` / `PromptRegistry` par session préservées (filtrage, confiance)
- Cycle de vie avec compteur de références + drain progressif résilient aux rattachements
- Nettoyage multiplateforme des PID descendants
- Les garde-fous de budget passent de par session à par espace de travail (promis dans PR 14)
- Compatibilité ascendante avec qwen autonome non démon (pool non construit là)

**Non-objectifs (périmètre F2)**

- Mutualisation inter-espace de travail (1 démon = 1 invariant d'espace de travail de PR #4113 reste)
- Mutualisation inter-démon (hors périmètre — territoire d'orchestrateur multi-processus)
- Refonte du routage OAuth (F3 avec `PermissionMediator`)
- Persistance du pool lors du redémarrage du démon (en mémoire uniquement)
- Détection automatique des serveurs HTTP « compatibles pool » (drapeau opt-in uniquement)
- Diff `MCPServerConfig` en direct pour modifier les entrées sur place (changement de config → nouvelle entrée, ancienne se vide)

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

**Carte de couplage (ce qui doit être cassé ou transmis) :**
| Coupling                                                                         | Localisation                                        | Action dans F2                                                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Le constructeur de `McpClient` lie 1 ToolRegistry + 1 PromptRegistry             | mcp-client.ts:106-119                               | Le pool possède le transport ; `SessionMcpView` (par session) possède les registres par session |
| `McpClient.discover()` appelle `toolRegistry.registerTool()` en ligne             | mcp-client.ts:178-198                               | Split : `discoverAndReturn()` renvoie un instantané ; la vue enregistre          |
| Le gestionnaire `ListRootsRequestSchema` capture `workspaceContext.getDirectories()` | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | Contexte unique lié au workspace du pool                                         |
| `workspaceContext.onDirectoriesChanged` écouteur enregistré par connexion         | mcp-client.ts:907                                   | Le pool enregistre une fois par entrée                                           |
| `McpClientManager` instancié à l'intérieur de `ToolRegistry`                      | tool-registry.ts:199                                | Ajout d'un paramètre optionnel `pool?` au constructeur ; injection depuis `Config` |
| Application du budget par session                                                 | mcp-client-manager.ts:91-95 commentaire              | Déplacer la machine d'état dans le pool                                          |
| `serverDiscoveryPromises` déduplication en vol par serveur                        | mcp-client-manager.ts:350                           | Le pool a `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                 |
| `setMcpBudgetEventCallback` enregistrement par session                            | acpAgent.ts:1851-1899                               | Le pool émet → `QwenAgent` diffuse à toutes les sessions                        |

**État déjà partagé (le pool hérite, n'introduit pas) :**

| État                                         | Localisation                          | Remarque                                                          |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>` | mcp-client.ts:292 (niveau module)   | Global au processus aujourd'hui ; clé du pool toujours par nom → « tout-CONNECTED-gagne » |
| `mcpServerRequiresOAuth: Map<string, boolean>` | mcp-client.ts:302 (niveau module)   | Idem                                                              |
| Tokens disque `MCPOAuthTokenStorage`          | `~/.qwen/mcp-oauth/<name>.json`     | Partagé par le démon ; le pool exploite juste plus efficacement   |

---

## 3. Références trouvées

| Projet          | Pool ?              | Clé                                                | Cycle de vie                                                                 | Modèles à emprunter                                                                                                                  |
| --------------- | ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **claude-code** | Non, par processus  | `name + JSON.stringify(cfg)` (lodash.memoize)      | `clearServerCache` + backoff distant ×5 ; crash stdio → `failed`             | SHA-256 `hashMcpConfig` avec clé triée pour invalidation / clé       |
| **opencode**    | Oui, par workspace  | **nom de serveur seulement** (pas de hachage config) | Pas de refcount / pas d'éviction / pas de redémarrage ; finaliseur Effect + `pgrep -P` SIGTERM récursif | Balayage des pid descendants, gardien de stale (`if (s.clients[name] !== client) return`), diffusion `tools/list_changed` via bus d'événements |

**Ce que F2 hérite de chacun :** le hachage de config de claude-code (gère la divergence env/auth par session qu'opencode ne gère pas), le balayage des pid descendants d'opencode (les wrappers npx/uvx fuient). Ce que nous ajoutons : refcount + drain (démon multi-client), redémarrage automatique (démon longue durée), diffusion des prompts, gardien de génération.

---

## 4. Architecture

### 4.1 Disposition des processus

```
Démon HTTP (packages/cli/src/serve, qwen serve)
  │ lance
  ▼
Process enfant ACP (qwen --acp, un seul processus par workspace)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── nouveau, scope workspace, 1 instance
  │     ├── entrées : Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight : Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (lié au workspace du démon)
  │     └── garde-fous de budget (machine d'état PR 14, promue au workspace)
  │
  └── sessions : Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ pool injecté    │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   héritage en processus
                                  → SessionMcpView            (qwen autonome)
                                    .applyTools/Prompts
                                    (filtre + enregistre dans
                                     les registres propres
                                     à la session)
```
**Le pool vit dans l'enfant ACP**, pas dans le démon HTTP. Le démon HTTP interroge l'état du pool via la surface extMethod `bridge.client` existante (`getMcpPoolAccounting`, `restartMcpServer`). Le code F2 se trouve dans **`packages/core/src/tools/`** (au même niveau que `mcp-client-manager.ts`), pas dans `packages/acp-bridge/`.

### 4.2 Diagramme de classes

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (libération groupée pour la destruction de session)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (périmètre workspace)
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   (arrêt)
  └─ onBudgetEvent: (event) => void   (défini par QwenAgent)

PoolEntry (interne)
  ├─ refs: Set<sessionId>
  ├─ client: McpClient
  ├─ toolsSnapshot: DiscoveredMCPTool[]
  ├─ promptsSnapshot: Prompt[]
  ├─ generation: number   (++ à la reconnexion ; protection contre les événements obsolètes)
  ├─ state: 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer?: NodeJS.Timeout
  ├─ healthMonitor: { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers: Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection (handle renvoyé à l'appelant)
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView (par session, par serveur)
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (filtre par inclusion/exclusion, décore la confiance)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (supprime ses enregistrements)
```

---

## 5. Clé du pool (empreinte)

### 5.1 Champs canoniques hachés

```ts
type PoolKey = string; // sha256 hex, premiers 16 caractères suffisants (sans collision pour N réaliste)
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
 * V21-9 : normaliser les configurations OAuth fonctionnellement équivalentes pour qu'elles
 * aboutissent à la même empreinte. `{enabled: false}`, `undefined`,
 * `null` et `{}` signifient tous « pas d'OAuth » → retournent tous `null`.
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

// Champs exclus (filtres par session, PAS au niveau transport) :
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

**`pooledTransports` par défaut = {stdio, websocket}**. Les opérateurs activent HTTP/SSE via :

- CLI : `--mcp-pool-transports=stdio,websocket,http,sse`
- Env : `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**Pourquoi exclure HTTP/SSE par défaut** : certaines implémentations de serveur MCP HTTP lient l'état (contexte d'auth, mémoire de conversation) au flux TCP/SSE ; plusieurs sessions ACP le partageant ferait fuiter l'état. stdio + websocket sont de véritables processus OS dont l'état est observable et isolable.

### 5.3 Contournement SDK MCP

`isSdkMcpServerConfig(cfg)` true → le pool renvoie un wrapper `PooledConnection` léger via `createUnpooledConnection(name, cfg, sid)` qui construit immédiatement un `McpClient`, sans partage, sans entrée stockée dans le pool. Raison : `sendSdkMcpMessage` est conçu par session (route via le plan de contrôle ACP vers la session d'origine). Même chemin utilisé pour HTTP/SSE lorsque le transport n'est pas dans `pooledTransports` (§10.3).

V21-10 : le nom est `createUnpooledConnection`, pas `legacyInProcessAcquire` — SDK MCP et opt-out HTTP sont des choix de conception permanents, pas du code legacy.

---

## 6. Cycle de vie

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2 : index inversé, releaseSession en O(refs) au lieu de O(entries). */
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
          // V21-4 : libérer le slot réservé en cas d'échec de création. Sans cela,
          // le slot fuit jusqu'à ce que le chemin de libération du moniteur de santé
          // s'exécute (ce qui n'arrive pas, car il n'y a pas d'entrée à surveiller).
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

  /** V21-2 : O(refs de cette session), pas O(toutes les entrées). */
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
### 6.2 Déduplication des acquisitions concurrentes (`spawnInFlight`)

Miroir de `McpClientManager.serverDiscoveryPromises` (mcp-client-manager.ts:350). Sans cela, 5 sessions lancées au démarrage voient toutes `entries.has(id) === false` et se précipitent pour lancer 5 processus enfants.

### 6.3 Grâce de drain + plafond d'inactivité

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // grace after last release
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // hard cap (defense against drain cancellation loop)
```

Machine d'état dans `PoolEntry` :

```
création ──création ok──► actif ──dernier détachement──► vidange ──délai expiré──► fermé
   │                     │                       │
   │                     │                       └──attachement──► actif (annuler la minuterie)
   échec création───────► échoué
                          │
                          └──redémarrage manuel──► création
```

Plafond d'inactivité dur : la minuterie de vidange peut être annulée et redémarrée indéfiniment (battement acquisition/libération). `MAX_IDLE_MS` est une minuterie distincte démarrée **à la première inactivité** et jamais réinitialisée ; lorsqu'elle se déclenche, force la fermeture même si la vidange est actuellement en période de grâce active. Empêche les entrées de pool zombies provenant de clients bogués qui alternent acquisition/libération.

### 6.4 Balayage multi-plateforme des PID descendants

**Mise à jour R10 / R23 T7 / PR A (2026-05-22)** : passage d’un BFS par PID (un sous-processus `pgrep -P <pid>` / `Get-CimInstance -Filter` par nœud) à un instantané unique de la table des processus suivi d’un parcours d’arbre en mémoire. Deux motivations : (1) un fork au lieu de B^D forks sur le chemin chaud de l’arrêt du pool ; (2) cohérence de l’instantané — le BFS précédent pouvait manquer des descendants forkés entre deux niveaux BFS adjacents. Le chemin par PID est conservé comme solution de repli pour BusyBox `ps` <v1.28 (pas de support `-o`) et les conteneurs distroless sans `ps`.

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // OS reaps orphans; pool shutdown still proceeds.
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* fall through to fallback */
  }
  if (tree) return walkDescendants(tree, root); // O(descendants), 1 fork
  return await listDescendantPidsUnixPgrepFallback(root); // legacy BFS
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: all processes (POSIX, equivalent to -e but unambiguous on BSD).
  // -o pid=,ppid=: pid + ppid columns, trailing `=` suppresses headers.
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // covers >250k-process pathological hosts
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* parse, push into childrenByPpid */
  }
  return childrenByPpid;
}

// Windows: single Get-CimInstance Win32_Process | ConvertTo-Csv snapshot
// of all (ProcessId, ParentProcessId) rows + in-memory walk; per-pid
// `Get-CimInstance -Filter "ParentProcessId=$p"` retained as fallback.
```

Appelé depuis `PoolEntry.shutdown()` avant `client.disconnect()`. Gère les fuites de wrappers `npx @modelcontextprotocol/server-X`, `uvx ...`, `pnpm dlx ...`. Les limites MAX_DESCENDANTS=256 / MAX_DEPTH=8 sont conservées.

### 6.5 Gestion des échecs de lancement

Si `spawnEntry` rejette après que plusieurs abonnés se soient attachés (via `spawnInFlight`) :

- Tous les attenteurs reçoivent le rejet
- `tryReserveSlot` est libéré **via une branche `.catch` explicite dans `acquire`** (V21-4) ; sans ce correctif, le créneau fuyait jusqu’au prochain passage du moniteur de santé, qui ne se déclenchait jamais car aucune entrée n’existait à surveiller.
- L’entrée échouée n’est PAS stockée dans `entries`
- Les chemins de code des abonnés agissent comme si `acquire` avait échoué initialement (la logique catch existante de `discoverMcpToolsForServer` par session reste valide)

### 6.6 Backoff de reconnexion (V21-8)

Lorsqu’une `PoolEntry` entre en reconnexion après une coupure de transport :

| Famille de transport | Stratégie                                     | Plafond                                                              |
| -------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| stdio                | Fixe 5s × 3 tentatives                        | Selon `DEFAULT_HEALTH_CONFIG.reconnectDelayMs` existant              |
| websocket            | Fixe 5s × 3 tentatives                        | Idem stdio                                                           |
| http (optionnel)     | Exponentielle 1s, 2s, 4s, 8s, 16s × 5 tentatives | Les points d'accès distants fluctuent lors de problèmes réseau transitoires ; budget plus long |
| sse (optionnel)      | Exponentielle 1s, 2s, 4s, 8s, 16s × 5 tentatives | Idem http                                                            |
Après épuisement du plafond : l'entrée passe à l'état `failed` ; les abonnés reçoivent l'événement `failed` ; une nouvelle `acquire` pour le même `ConnectionId` relance le spawn une fois, puis lève une exception. Le redémarrage de l'opérateur (§13) réinitialise l'état.

---

## 7. Discovery / SessionMcpView

### 7.1 Double diffusion des outils et des prompts

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

### 7.2 Rejeu de l'instantané lors de l'attachement (style earlyEvents)

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

Reprend le modèle `BridgeClient.earlyEvents` du correctif n°1 de la PR 14b — résout une condition de course analogue pour l'attachement au pool.

### 7.3 Protection contre les gestionnaires obsolètes (compteur de génération)

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

Sans cela, un gestionnaire obsolète provenant d'une instance Client antérieure à la reconnexion pourrait écraser l'instantané post-reconnexion avec des données périmées.

**Invariant de monotonie** (clarification V21) : `generation` ne fait qu'augmenter, jamais réinitialiser. Toute opération en cours capture `myGen` à l'entrée, puis après `await` vérifie `myGen === this.generation`. Équivalent à « aucun événement de remplacement n'a eu lieu depuis que j'ai commencé ». Borné par `Number.MAX_SAFE_INTEGER` (~285 000 ans à 1 reconnexion par seconde), aucun risque de dépassement.

### 7.4 Unification des chemins (extension du périmètre F2-1)

`packages/core/src/tools/mcp-client.ts` comporte DEUX chemins de connexion au serveur :

1. La classe `McpClient` (mcp-client.ts:100) — utilisée par `McpClientManager`
2. La fonction d'usine `connectToMcpServer` (mcp-client.ts:875) — utilisée par `discoverMcpTools` (ligne 560) et `connectAndDiscover` (ligne 607)

F2-1 doit faire converger les deux derrière `McpClient.discoverAndReturn` (avec `connectToMcpServer` devenant une méthode privée de `McpClient` ou les deux appelant une primitive `establishConnection()` partagée). Sinon, le pool ne couvre que le chemin de la classe ; le chemin de l'usine reste par session et compromet tout l'effort.

---

## 8. Global State Coexistence

### 8.1 `serverStatuses` (mcp-client.ts:292) — écriture tolérante aux collisions

`Map<serverName, MCPServerStatus>` au niveau du module. Le `ConnectionId` du pool est `name::hash`, mais `updateMCPServerStatus(name, status)` écrit par nom. **Plusieurs entrées du pool pour le même nom (empreintes différentes, par exemple divergence de token) écraseraient mutuellement leurs statuts.**
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

La route de statut expose `entryCount: number` afin que les opérateurs voient quand un nom correspond à plusieurs entrées.

### 8.2 Stockage des jetons OAuth

`MCPOAuthTokenStorage` écrit dans `~/.qwen/mcp-oauth/<serverName>.json` — déjà partagé au niveau du démon hôte. Le pool en bénéficie incidemment (la première session termine OAuth → jeton sur disque → la reconnexion de l’entrée du pool récupère le jeton → toutes les autres sessions en profitent).

**Mise en garde — cas multi-empreintes** : 2 entrées pour le même nom (en‑têtes/env différents) mais même fournisseur OAuth → les deux lisent le même fichier de jeton. Si les jetons sont liés au serveur (cas typique OAuth), cela fonctionne. Si les jetons sont liés à l’environnement (rare), une extension explicite de la clé de stockage est nécessaire. **Reporté à F3** avec une limitation connue documentée.

### 8.3 `entryCount` dans l’instantané

`GET /workspace/mcp` par serveur ajoute :

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // NOUVEAU — N entrées du pool pour ce nom
  entrySummary?: [                        // NOUVEAU — détail opaque par entrée
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7** : `entrySummary[].entryIndex` est un **entier opaque stable** attribué à la création de l’entrée (ordre d’insertion au sein du groupe de nom), PAS l’empreinte brute. Raisonnement : l’empreinte change quand les jetons OAuth ou les variables d’environnement tournent, ce qui divulguerait cette information via les différences d’instantané (l’opérateur pourrait déduire « jeton tourné à T+5min » de la transition `'a3b1' → 'f972'`). `entryIndex` est monotone au sein du groupe de nom mais reste stable lors des rotations car l’ancienne entrée se vide et la nouvelle reçoit l’index suivant.

Les anciens clients SDK ignorent les champs inconnus selon le contrat PR 14 ; les nouveaux clients utilisent `entryCount` pour les badges. Le chemin de redémarrage interne par empreinte utilise un jeton opaque retourné uniquement via un `extMethod` privilégié, pas exposé dans l’instantané HTTP.

---

## 9. WorkspaceContext / ListRoots

### 9.1 Enregistrement unique

Les instances `McpClient` du pool partagent **un** `WorkspaceContext` — le contexte d’espace de travail lié du démon (invariant PR #4113). Le gestionnaire `ListRootsRequestSchema` de `connectToMcpServer` ferme sur ce contexte unique.

L’écouteur `onDirectoriesChanged` est enregistré **une fois par entrée**, pas une fois par `acquire`. Détaché lors de l’arrêt de l’entrée.

### 9.2 Fan‑up de `roots/list_changed`

Le serveur notifie le client de nouvelles racines → le pool fait du fan‑out :

- Le pool redécouvre (le serveur peut rapporter un ensemble d’outils différent sous les nouvelles racines) → évènement `toolsChanged` → toutes les vues abonnées se ré‑appliquent

### 9.3 `updateWorkspaceDirectories` par session

**Contrat** : en Mode B, les ajouts de répertoires par session sont une indication légère, pas une source faisant autorité. Le `WorkspaceContext` du pool est au niveau du démon.

Deux choix d’implémentation :

- **v1 simple** : ignorer les ajouts par session, journaliser un avertissement quand détecté
- **v2 union** : le pool maintient `extraRoots: Map<sessionId, Set<dir>>`, le gestionnaire ListRoots retourne l’union du contexte lié et de tous les extras. La suppression par session déclenche `roots/list_changed`. Ajoute 50‑80 LOC de complexité.

**Choisir v1 simple pour F2** ; v2 union comme suivi si la douleur utilisateur se concrétise.

---

## 10. Injection par session

### 10.1 `mcpServers` depuis `newSession({mcpServers})`

`newSessionConfig(cwd, mcpServers, ...)` fusionne la liste injectée avec `settings.merged.mcpServers` (acpAgent.ts:1778-1831). Le pool consomme la **vue fusionnée par session** :

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...existing setMcpBudgetEventCallback SUPPRIMÉ — le pool gère la diffusion directement
}
```

Quand deux sessions injectent un serveur de même nom avec des env/en‑têtes différents → empreintes différentes → deux entrées dans le pool. Le partage dans le pool a lieu seulement quand les sessions concordent exactement.

### 10.2 Divergence d’authentification

Les `mcpServers` statiques de `~/.qwen/settings.json` sont identiques entre sessions → toutes partagent → cas à 80 %. Les `mcpServers` injectés par session avec des jetons par utilisateur → empreintes uniques → pas de partage. Les deux cas sont sûrs.

### 10.3 Option pour le transport HTTP (rappel de §5.2)

Par défaut `pooledTransports = {stdio, websocket}`. Les serveurs HTTP/SSE passent par le chemin `createUnpooledConnection` (un McpClient par session) sauf si l’opérateur opte pour le mode groupé.

### 10.4 `/mcp disable X` en cours de session (V21-6)

Quand l’opérateur exécute `/mcp disable github` contre une session active :
1. `Config.disableMcpServer('github')` ajoute à l'ensemble `disabledMcpServers` par Config
2. **Hook F2** : `Config.onDisabledMcpServersChanged` se déclenche ; `SessionMcpView` pour ce nom appelle `teardown()` (supprime ses enregistrements d'outils/propositions des registres de session)
3. L'entrée du pool **peut rester active** si d'autres sessions la référencent encore (refcount > 0) — seule la vue de la session désactivante se détache
4. Si toutes les sessions désactivent → refcount → 0 → le minuteur de vidage démarre

Sans l'étape 2, une désactivation en cours de session laisserait les outils déjà enregistrés dans le `ToolRegistry` de la session jusqu'au prochain redémarrage de session. Le test 21.4 couvre cela.

`/mcp enable github` est l'inverse : déclenche un nouveau `pool.acquire` pour la session, attache une nouvelle vue, ré-applique l'instantané.

---

## 11. Passage des garde-fous budgétaires

### 11.1 La machine d'état migre vers le pool

`tryReserveSlot` / `releaseSlotName` / hystérésis à 75 % / coalescence de refused_batch / `bulkPassDepth` / `pendingRefusalNames` — tout migre de `McpClientManager` vers `McpTransportPool`. `McpClientManager` ne conserve l'état que lorsqu'il est exécuté en mode autonome (sans pool injecté).

### 11.2 Portée de la cellule d'instantané

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

Selon le contrat PR 14 : « Les consommateurs DOIVENT tolérer les entrées supplémentaires avec des valeurs de portée non reconnues (ignorer, ne pas échouer). » Les anciens clients SDK voient `scope: 'workspace'`, le rendent comme inconnu (ou replient sur les nombres de niveau supérieur). Le nouveau SDK ajoute l'assistant `isWorkspaceScopedBudget(cell)`.

### 11.3 Diffusion d'événements

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

### 11.4 Modifications du contrat de type SDK

PR 14b a exporté ces éléments (doivent être étendus de manière additive) :

- `DaemonMcpBudgetWarningData` — ajouter `scope?: 'workspace' | 'session'` (optionnel pour la rétrocompatibilité ; absent = 'session')
- `DaemonMcpChildRefusedBatchData` — même extension `scope?`
- `DaemonMcpGuardrailEvent` — discriminateur inchangé

Nouveaux assistants SDK :

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

État du réducteur sur `DaemonSessionViewState` :

- **Aucun nouveau champ** — `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` s'incrémentent quelle que soit la portée (la portée est une propriété de chaque événement, pas un flux séparé)
- Documenter que sous F2, ces compteurs reflètent les événements au niveau de l'espace de travail diffusés à chaque session — ils s'incrémenteront **simultanément sur toutes les sessions attachées** lorsqu'une pression budgétaire se produit

**V21-12 (Q1 résolu, verrouillé dans v2.1)** : conserver les noms de champs existants (`mcpBudgetWarningCount`, `mcpChildRefusedBatchCount`, `lastMcpBudgetWarning`, `lastMcpChildRefusedBatch`) avec une sémantique de portée étendue documentée dans JSDoc :

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

Justification : PR 14b a déjà livré ces noms comme surface publique du SDK ; les renommer serait un changement cassant pire que la sémantique légèrement imprécise.

---

## 12. OAuth — Report explicite à F3

Le repli OAuth 401 dans `connectToMcpServer` (mcp-client.ts:950-1010) nécessite une résolution interactive (ouverture de navigateur ou flux d'appareil). Le démon en mode B **ne doit pas ouvrir de navigateur** (selon la conception PR 21 — le test grep de source statique échoue à la construction sur `open`/`xdg-open`/`shell.openExternal`).

**Comportement F2 sur un serveur nécessitant OAuth** :

1. La première acquisition déclenche `connectToMcpServer` → 401 détecté
2. Le pool attrape l'exception OAuth requise, marque l'entrée comme `failed_auth_required`
3. La route de statut remonte `errorKind: 'auth_env_error'` (`errorKind` existant de PR 13)
4. Le pool **ne réessaie pas automatiquement**
5. L'opérateur exécute `/mcp auth <name>` (CLI existante) OU utilise la route de flux d'appareil de PR 21 pour obtenir un jeton sur disque → la prochaine acquisition de session réessaie et réussit

**F3 remplacera les étapes 4-5** avec `PermissionMediator` routant la demande de complétion OAuth vers les sessions attachées pour premier répondant.

Cela évite que F2 se mêle au travail de la machine d'état d'authentification.

---

## 13. Sémantique des routes de redémarrage

### 13.1 `POST /workspace/mcp/:server/restart` sous le pool

Actuellement (PR 17) : redémarrage dans le gestionnaire de la session bootstrap = redémarre l'entrée unique pour ce nom.

Sous le pool : nom → éventuellement plusieurs entrées (empreintes différentes pour le même nom = sessions différentes avec des configurations différentes).
**Comportement spécifié** :

| Requête                                            | Comportement                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /workspace/mcp/:server/restart`              | Redémarrer **toutes** les entrées correspondant à `serverName` (en parallèle via `Promise.allSettled`) |
| `POST /workspace/mcp/:server/restart?entryIndex=0` | V21-3 : redémarrer uniquement l'entrée #0 (l'index opaque de l'instantané §8.3) ; 404 si introuvable  |
| `POST /workspace/mcp/:server/restart?entryIndex=*` | Explicite « all » (identique à l'absence de paramètre)                                                |

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

L'ancienne forme `{restarted: true, durationMs}` est conservée lorsque `entries.length === 1` ET qu'il n'y a pas de paramètre de requête `entryIndex` pour la rétrocompatibilité ; les clients peuvent détecter la nouvelle forme en vérifiant `'entries' in response`.

### 13.2 Déduplication des redémarrages en cours

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

### 13.3 Vérification du budget (conserve le comportement du PR 17)

Avant le redémarrage, le pool vérifie le budget : si la déconnexion+reconnexion reste dans les limites, c'est OK. La sémantique actuelle du PR 17 `{restarted:false, skipped:true, reason:'budget_would_exceed'}` est conservée (mais maintenant appliquée par entrée).

### 13.4 Appel d'outil en cours pendant la reconnexion (V21-5, nouveau)

La session A invoque `pool.callTool('git.commit', args)` → la requête atteint stdin du processus enfant → le processus enfant plante en cours d'écriture → l'entrée passe en mode reconnexion :

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

- La promesse de l'appel en cours est rejetée avec `MCPCallInterruptedError` dès que la perte de transport est détectée (ne pas attendre la reconnexion)
- Le pool **ne réessaie PAS** automatiquement l'appel ; la sémantique est dangereuse pour les écritures (commit, modification de fichier, etc.) et le pool ne peut pas distinguer la lecture de l'écriture
- L'appelant (généralement la couche d'exécution d'outils dans la boucle de l'agent) attrape cette erreur et décide : réessayer / afficher à l'utilisateur / abandonner
- Après reconnexion : la session A peut rappeler (même `PooledConnection.callTool`) ; le pool route vers la nouvelle instance de transport de manière transparente
- `MCPCallInterruptedError.clientGeneration` permet à l'appelant de corréler avec l'événement `reconnected` ultérieur si nécessaire

Le test 21.6 doit couvrir : générer un MCP stdio de longue durée, envoyer un appel d'outil, tuer le processus enfant en cours d'appel, vérifier que la promesse est rejetée avec `MCPCallInterruptedError` et un `clientGeneration` non nul.

---

## 14. Refonte de la Route de Statut

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

Le processus enfant ACP fait le pont via `extMethod` pour que le démon puisse appeler.

### 14.2 entryCount + entrySummary

Selon §8.3.

### 14.3 Cas sans session d'amorçage

Actuellement (PR 12), lorsque le démon est inactif (pas encore de sessions), `GET /workspace/mcp` retourne `initialized: false` car il n'y a pas de session d'amorçage à interroger.

Avec le pool : le pool existe dès le constructeur de `QwenAgent` → la route de statut peut retourner les comptabilisations en direct **même avec zéro session**. La cellule `initialized: true` même avant la première session. **Changement de comportement documenté** dans la description du PR ; ce n'est pas une régression.

---

## 15. Interaction loadSession / resume (PR 6 #4222)

### 15.1 Annulation du drain lors de la reprise

```
session-A active, détient la référence entry-X
déconnexion de session-A (pas de fermeture explicite) → finalement killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → le minuteur de drain démarre (30s)
reprise de session-A dans les 30s → nouveau newSessionConfig → pool.acquire retourne entry-X → attach annule le drain
reprise de session-A après 30s → entry-X déjà fermée → le pool crée une nouvelle entrée (démarrage à froid)
```

### 15.2 Fenêtre de cache de `restoreState` (5min, depuis PR 6)
`acpAgent.restoreState` est conservé 5 min après la déconnexion. Vidange du pool (30 s par défaut) < fenêtre de restauration (5 min) → la reprise entre 30 s et 5 min subit le démarrage à froid du MCP. Compromis acceptable (la reprise est elle-même un cas rare).

Alternative : le pool lit la configuration de la fenêtre de restauration du démon et étend la vidange pour correspondre. Cela ajoute un couplage entre le pool et la machine d'état de session ; **reporté à un suivi sauf si l'utilisateur signale un problème de démarrage à froid**.

### 15.3 Interaction de `pendingRestoreIds`

`acpAgent.killSession()` doit appeler `pool.releaseSession(sid)` APRÈS avoir nettoyé `pendingRestoreIds`. Ordre :

1. La session est marquée comme restaurable (`pendingRestoreIds.add(sid)`)
2. Session.close() — mais la référence au pool est toujours maintenue
3. Après que `RESTORE_WINDOW_MS` se soit écoulé sans reprise : `killSession` nettoie définitivement → `pool.releaseSession(sid)` déclenche la vidange

Évite que la vidange se déclenche pendant une fenêtre de restauration.

---

## 16. Rechargement à chaud de la configuration

### 16.1 Rechargement implicite via changement d'empreinte

L'utilisateur modifie `~/.qwen/settings.json` en cours de route, change l'environnement d'un serveur :

1. Les anciennes sessions conservent l'instantané `Config`/`McpServers` → continuent d'acquérir l'ancienne empreinte → la référence d'entrée-OLD persiste
2. La nouvelle session lit les nouveaux paramètres → nouvelle empreinte → entrée-NEW créée → coexiste avec entrée-OLD
3. Les anciennes sessions se ferment naturellement → entrée-OLD se vide → finalement fermée
4. État stable : seule entrée-NEW reste

**Pas de mutation en direct des connexions actives** — séparation nette entre les sessions avec différentes versions de configuration.

### 16.2 Route de rechargement forcé (optionnelle)

```
POST /workspace/mcp/reload-all
  → pour chaque session : recharger les paramètres, échanger Config.mcpServers
  → pour chaque entrée qui n'est plus référencée : planifier l'éviction
```

Utile pour « J'ai changé les variables d'environnement et je veux un effet immédiat sur toutes les sessions. » Reporté à un suivi F2 (non bloquant).

### 16.3 Désinstallation d'extension et entrées orphelines (V21-15)

Scénario : l'extension `foo-ext` enregistre le serveur MCP `foo-server`. L'opérateur lance `/extension uninstall foo-ext`. Le cycle de vie de l'extension supprime `foo-server` de `extensionMcpServers` afin que les appels `loadCliConfig` ultérieurs ne l'incluent pas. Mais :

- Les sessions actives contiennent des instantanés `Config` qui incluent encore `foo-server` → ces sessions continuent d'utiliser l'entrée
- Les nouvelles sessions après désinstallation n'acquièrent pas (le serveur n'est plus dans leur mcpServers fusionné) → le compteur de références n'augmente pas

**Résolution** : se fier à la vidange naturelle. Au fur et à mesure que les anciennes sessions se ferment, le compteur de références diminue ; finalement l'entrée atteint `MAX_IDLE_MS = 5 min` et est fermée de force. **Pas d'API explicite `pool.invalidateByExtension(name)`** — garde le modèle uniforme avec le rechargement à chaud de la configuration (§16.1).

Compromis : le serveur de l'extension peut fonctionner jusqu'à 5 min après la désinstallation si une session longue le maintient en vie. Acceptable ; les opérateurs peuvent lancer `/mcp restart foo-server` puis tuer la session si l'urgence l'exige.

---

## 17. Ordre d'arrêt

Séquence de `QwenAgent.close()` (doit être appliquée) :

```
1. Définir acceptingNewSessions = false ; rejeter les nouvelles POST /session
2. Pour chaque requête en vol : signaler l'annulation, attendre la fin (cycle de vie du PR 11 existant)
3. Pour chaque session : déclencher close → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← contourne le délai de grâce de 30 s
   ├── Pour chaque entrée : annuler les temporisateurs de vidange et de santé, marquer en vidange
   ├── Pour chaque entrée en parallèle : listDescendantPids → SIGTERM aux enfants
   ├── Pour chaque entrée en parallèle : client.disconnect()
   └── Promise.race contre timeoutMs ; les entrées abandonnées reçoivent SIGKILL
5. Fermeture du canal pont
6. Sortie du processus
```

**V21-11** : signature de `drainAll` :

```ts
async drainAll(opts?: {
  force?: boolean;       // false par défaut ; true contourne le temporisateur de grâce de 30 s
  timeoutMs?: number;    // 10000 par défaut ; budget temps réel ; SIGKILL aux retardataires après
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // entrées déconnectées proprement
  forced: number;        // entrées ayant reçu SIGKILL après expiration du délai
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
  mcp-pool-key.ts              # empreinte + helpers de canonicalisation (~150 LOC)
  mcp-pool-entry.ts            # PoolEntry : compteur de références + vidange + santé + génération (~500 LOC)
  session-mcp-view.ts          # SessionMcpView : filtrage + enregistrement outils/instructions (~200 LOC)
  mcp-pool-events.ts           # Union discriminée PoolEvent (~80 LOC)
  pid-descendants.ts           # listDescendantPids multi-plateforme (~150 LOC, tests inclus)

packages/core/src/tools/
  mcp-transport-pool.test.ts   # ~900 LOC
  mcp-pool-entry.test.ts       # ~400 LOC
  session-mcp-view.test.ts     # ~250 LOC
  mcp-pool-key.test.ts         # ~150 LOC
  pid-descendants.test.ts      # ~200 LOC (Unix + Windows avec saut conditionnel)
```

**Fichiers modifiés :**

```
packages/core/src/tools/mcp-client.ts            # discoverAndReturn() scindée ; connectToMcpServer unifié
packages/core/src/tools/mcp-client-manager.ts    # paramètre pool optionnel ; état budget conditionnel
packages/core/src/tools/tool-registry.ts         # transmet pool de la config à McpClientManager
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # construction QwenAgent.mcpPool ; diffusion de budgetEvent ;
                                                 # newSessionConfig connecte pool au Config ;
                                                 # killSession appelle pool.releaseSession
packages/cli/src/serve/run-qwen-serve.ts           # passe --mcp-pool-transports + budget env au processus ACP enfant
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus lit le pool ;
                                                 # restartMcpServer extMethod renvoie RestartResult[]
packages/cli/src/serve/capabilities.ts           # annonce mcp_workspace_pool
packages/sdk/src/daemon/mcpEvents.ts             # scope ? : champ optionnel ; helper isWorkspaceScopedBudgetEvent
```
---

## 19. Livraison en un seul PR — Décomposition des commits (V21-1)

Conformément aux directives de regroupement cohérent de fonctionnalités du mainteneur (#4175 stratégie de branche 2026-05-19), F2 est livré sous la forme **d'un seul PR avec 6 commits atomiques**. Le relecteur peut parcourir les commits avec `git log -p HEAD~6..HEAD` et les examiner un par un.

| Commit n° | Titre                                                                                          | Portée                                                                                                                                                                                                                                                                                                                                                                                                                      | Fichiers                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1         | `refactor(core): split McpClient.discover into pure tool/prompt list and unify connect paths` | Ajoute `discoverAndReturn()` ; extrait le `establishConnection()` partagé utilisé à la fois par la fabrique `McpClient.connect()` et `connectToMcpServer()` ; l'ancienne méthode `discover()` devient un wrapper léger qui enregistre (préserve le comportement autonome de Qwen). Aucun changement de comportement observable.                                                                                             | `mcp-client.ts`, `mcp-client.test.ts`                                                                                     |
| 2         | `feat(core): McpTransportPool + SessionMcpView`                                                | Cœur du pool : `fingerprint`, compteur de références, déduplication de `spawnInFlight`, index inversé `sessionToEntries`, machine d'état de vidage, relecture d'instantané lors de l'attachement, garde de génération, double diffusion d'outils et de prompts, copie de confiance par session. Mock McpClient pour les tests unitaires. Aucun câblage en production.                                                      | nouveaux `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + tests |
| 3         | `feat(core): cross-platform descendant pid sweep + pool health monitor`                       | `listDescendantPids` (Unix `pgrep -P` récursif, Windows PowerShell CIM) ; moniteur de santé unifié dans `PoolEntry` (vérification par intervalle + compteur d'échecs + backoff de reconnexion selon §6.6) ; tests d'intégration de sous-processus conditionnés par `QWEN_INTEGRATION === '1'`.                                                                                                                              | nouveau `pid-descendants.ts` + tests ; `mcp-pool-entry.ts`                                                                |
| 4         | `feat(serve): wire McpTransportPool into QwenAgent daemon mode`                               | `Config.setMcpTransportPool` + `getMcpTransportPool` ; `ToolRegistry` injecte le pool dans `McpClientManager` ; paramètre constructeur optionnel `pool?` de `McpClientManager` ; `acpAgent.QwenAgent` construit le pool à l'initialisation ; injection de `newSessionConfig` ; `killSession` appelle `pool.releaseSession` ; contournement SDK MCP + HTTP/SSE via `createUnpooledConnection` ; drapeaux CLI `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`. | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                               |
| 5         | `feat(serve): pool-aware status + restart routes`                                             | Méthode externe `QwenAgent.getMcpPoolAccounting` ; `httpAcpBridge.buildWorkspaceMcpStatus` priorité au pool + repli de session d'amorçage ; `restartMcpServer` accepte `?entryIndex=` et renvoie `RestartResult[]` ; `entryCount` + `entrySummary[].entryIndex` sur la cellule ; tags de capacité `mcp_workspace_pool` + `mcp_pool_restart`.                                                                                | `httpAcpBridge.ts`, `capabilities.ts`, types SDK                                                                          |
| 6         | `feat(serve): graduate MCP budget guardrails to workspace scope`                              | Déplace la machine d'état `tryReserveSlot`/`releaseSlotName`/hystérésis de `McpClientManager` vers le pool ; supprime le câblage `setMcpBudgetEventCallback` par session dans `acpAgent.newSessionConfig` ; diffusion de `QwenAgent.broadcastBudgetEvent` ; cellule d'instantané `scope: 'workspace'` ; champ additif SDK `scope?` ; helper `isWorkspaceScopedBudgetEvent` ; mises à jour de la documentation en ligne.      | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                 |
**Estimation LOC totale** : ~4100 lignes de production + ~1900 tests = ~6000 LOC (estimation v2 ~3850 ; la croissance absorbe les corrections V21).

**Cible de fusion** : une seule PR dans `daemon_mode_b_main`. Fusion périodique par lots dans `main` selon la stratégie #4175.

**Processus d'auto-relecture avant d'ouvrir la PR** :

1. Après chaque commit, exécuter l'agent `code-reviewer` sur le diff du commit ; intégrer les constats adoptés dans le même commit.
2. Pour les commits 2/4/6 (risque de conception le plus élevé), exécuter en plus `silent-failure-hunter` + `type-design-analyzer`.
3. Après que les 6 commits atterrissent : 3 passes de relecture complètes par différentes combinaisons d'agents sur le diff complet de la PR.
4. Exécuter la suite de tests complète + vérification de types + linting sur tous les packages concernés.

Reproduire le modèle de pré-relecture spécialisé de la PR 21.

---

## 20. Balises de capacité + Changements de contrat SDK

### 20.1 Nouvelles balises de capacité (annoncées atomiquement dans v0.16, V21-1)

Comme F2 est livré en une seule PR, les trois balises sont annoncées ensemble. Les consommateurs du pool peuvent supposer **`mcp_workspace_pool` annonce ⇒ champs `entryCount`/`entrySummary`/`scope?` tous présents** ; aucune vérification de capacité par champ nécessaire.

| Balise                    | Quand est-elle annoncée                                                                                | Signification                                                                                           |
| --------------------------| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `mcp_workspace_pool`      | Quand `QwenAgent.mcpPool !== undefined` (toujours vrai en mode démon sauf si commutateur `--no-mcp-pool`) | `GET /workspace/mcp` reflète l'état du pool ; champs `entryCount` + `entrySummary` présents             |
| `mcp_pool_restart`        | Toujours quand `mcp_workspace_pool` est actif                                                          | `POST /workspace/mcp/:server/restart` accepte `?entryIndex=` et peut retourner `entries: RestartResult[]` |
| (prolonge `mcp_guardrails`) | inchangé                                                                                               | Même balise, payload étendu avec `scope` (`'workspace'` sous F2)                                       |

### 20.2 Surface additive SDK

```ts
// @qwen-code/sdk — additive uniquement
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

## 21. Matrice de tests

### 21.1 Clé du pool (F2-2)

- Même cfg → même clé (permutation env-key stable, permutation header-key stable)
- Valeur de variable d'environnement différente d'1 octet → clé différente
- Valeur d'en-tête `Authorization` différente → clé différente
- `includeTools`/`excludeTools`/`trust` modifiés → MÊME clé (filtre par session)
- Deux `new MCPServerConfig(...)` avec contenu identique → même clé (hachage canonique, pas identité)

### 21.2 Cycle de vie (F2-2)

- 3 sessions acquièrent la même clé → 1 lancement (vérifier via espion sur `client.connect`)
- Séquence de libération n,n-1,...,1 → minuteur de vidange démarre seulement à 1→0
- 30s de vidange : acquisition à 25s annule le minuteur ; acquisition à 35s crée une nouvelle entrée
- `MAX_IDLE_MS` (5 min) fermeture brutale même si vidange instable
- Échec de lancement pendant vol : tous les attenteurs reçoivent l'erreur ; emplacement libéré ; aucune entrée stockée

### 21.3 Acquisition concurrente (F2-2)

- 5 `acquire(mêmeClé)` simultanés alors qu'aucune entrée n'existe → exactement 1 appel de `spawnEntry`, les 5 reçoivent la même entrée
- Lancement rejeté → les 5 attenteurs rejettent avec la même erreur ; une acquisition ultérieure relance

### 21.4 Isolation par session (F2-2)

- Session A `excludeTools: ['foo']`, Session B sans exclusion → le ToolRegistry de A omet foo, celui de B l'a ; tous deux à partir du même `toolsSnapshot`
- Session A `trust: true`, Session B `trust: false` → `DiscoveredMCPTool.trust === true` pour A, `false` pour B ; vérifier que la référence n'est PAS partagée (muter une n'affecte pas l'autre)
- Session A acquiert un serveur seulement prompt → le PromptRegistry de A est peuplé, le ToolRegistry vide pour ce serveur

### 21.5 Changement de liste d'outils/prompts (F2-2)

- Le serveur émet `notifications/tools/list_changed` → tous les abonnés voient `applyTools` appelé avec la nouvelle capture instantanée
- Un gestionnaire obsolète d'une génération précédant la reconnexion NE remplace PAS la capture instantanée
- Analogie pour `notifications/prompts/list_changed`

### 21.6 Plantage + reconnexion (F2-2)

- Tuer le sous-processus via `process.kill` → les abonnés reçoivent l'événement `disconnected`
- 3 tentatives de reconnexion (utilisant `MCPHealthMonitorConfig` existant) → succès → `reconnected` + nouvelle capture instantanée
- Tentatives épuisées → tous les abonnés reçoivent `failed` ; l'entrée passe à l'état `failed` ; les nouvelles acquisitions réessaient une fois puis lèvent une erreur
### 21.7 Nettoyage des pids descendants (F2-2b)

- Linux/macOS : lancer `bash -c "sleep 60 & sleep 60"` en tant que commande stdio → tuer la racine → vérifier que tous les descendants sont récupérés (poll `/proc/<pid>/status`, ou `kill(0, pid) === false`)
- Windows : lancer un wrapper `cmd /c "ping -t localhost"` → tuer → vérifier que le sous-processus ping a disparu
- `pgrep` indisponible (PATH manquant) → dégradation progressive : enregistrer un avertissement, envoyer simplement SIGTERM à la racine, ne pas planter

### 21.8 Budget au niveau de l'espace de travail (F2-4)

- 4 sessions × `--mcp-client-budget=2` avec 3 serveurs MCP statiques → total espace de travail = 3 (pas 12) ; cellule d'instantané `scope: 'workspace'`, `liveCount: 3`
- L'avertissement de budget se déclenche une fois par franchissement de 75% à la hausse sur tout l'espace de travail ; diffusé aux 4 sessions simultanément
- Réarmement d'hystérésis : chute à 37,5% → le prochain franchissement se déclenche à nouveau

### 21.9 Rétrocompatibilité (F2-3)

- `qwen` autonome (pas de démon) → `mcpPool === undefined` → tous les tests existants de `mcp-client-manager.test.ts` passent sans modification
- Drapeau démon `--no-mcp-pool` → repli sur une session par session, tous les tests e2e existants du démon passent

### 21.10 Isolation des identifiants (F2-3)

- Session A injecte `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`, Session B `tokenB` → 2 processus séparés ; vérifier par instantané `entryCount: 2` ; vérifier que les appels d'outils de A passent par le transport de A (par inspection d'en-tête dans stdin/log)

### 21.11 LoadSession / reprise (F2-3)

- Fermeture de session → vidage commence → reprise dans les 30s → l'entrée du pool est réutilisée (pas de démarrage à froid, vérifié via le compteur de surveillance `client.connect`)
- Reprise après 30s mais avant l'expiration de la fenêtre de restauration → démarrage à froid du pool ; le contenu de restoreState est toujours conservé

### 21.12 Route de redémarrage (F2-3b)

- 1 entrée pour un nom → `POST /workspace/mcp/foo/restart` renvoie la forme héritée `{restarted: true, durationMs}`
- 2 entrées pour le même nom (empreintes différentes) → renvoie `{entries: [{fingerprint, restarted, ...}, ...]}`
- Redémarrage pendant qu'un autre redémarrage est en cours → le second appel renvoie la même promesse (dédupliquée)
- Redémarrage lorsque le budget serait dépassé → `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` par entrée

### 21.13 Route d'état (F2-3b)

- Démon inactif (aucune session) mais le pool contient des entrées en cache d'une session précédente → `GET /workspace/mcp` renvoie `initialized: true` avec la comptabilité en direct
- Session d'amorçage inexistante → repli sur le chemin direct du pool ; pas d'erreur
- Une requête au pool lève une exception → repli sur le chemin de la session d'amorçage ; ne plante jamais l'instantané

### 21.14 Réducteur SDK (F2-4)

- `mcpBudgetWarningCount` s'incrémente simultanément sur toutes les sessions abonnées lorsque l'événement d'espace de travail est diffusé
- `isWorkspaceScopedBudgetEvent(e)` identifie correctement la portée à partir de la charge utile
- Ancien démon (pas de champ `scope`) → par défaut interprété comme 'session'

### 21.15 Rechargement à chaud de la configuration (F2-3)

- Changement de `settings.json` en vol → l'ancienne session conserve l'ancienne entrée, la nouvelle session crée une nouvelle entrée, les deux coexistent ; l'ancienne se vide naturellement lorsque la dernière ancienne session se ferme
- 0 sessions après la fermeture de l'ancienne session → le minuteur de vidage se déclenche → l'ancienne entrée est récupérée → seule la nouvelle entrée reste

### 21.16 Ordre d'arrêt (F2-3)

- `QwenAgent.close()` déclenche dans l'ordre : arrêter l'acceptation → vider les invites → fermer les sessions → `pool.drainAll` → aucun pid zombie dans `pgrep -P <acpChildPid>` après la sortie

---

## 22. Questions ouvertes

V21 a verrouillé Q1/Q3/Q4/Q6 dans les valeurs par défaut de conception (livraison en PR unique). Q2/Q5/Q7/Q8/Q9 restent.

| #     | Question                                                                                                          | Valeur par défaut de la phase 2 (F2)                                                        | Décision nécessaire avant |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------- |
| Q1 ✅ | Noms des champs du réducteur SDK — renommer ou conserver ?                                                        | **LOCKED v2.1** : conserver `mcpBudgetWarningCount` etc. avec une sémantique de portée étendue dans JSDoc | résolu               |
| Q2    | Capacité `mcp_workspace_pool` — augmenter `protocolVersions` ('v1' → 'v1.1'), ou rester additif en 'v1' ?         | **Rester additif en 'v1'** (conforme au précédent PR 14b)                                 | commit 5               |
| Q3 ✅ | Drapeau `--no-mcp-pool` — activé par défaut ou optionnel ?                                                         | **LOCKED v2.1** : activé par défaut ; `--no-mcp-pool` est l'interrupteur d'arrêt          | résolu               |
| Q4 ✅ | Valeur par défaut HTTP/SSE — pool désactivé ou activé ?                                                            | **LOCKED v2.1** : pool désactivé ; activation via `--mcp-pool-transports`                 | résolu               |
| Q5    | `POST /workspace/mcp/reload-all` — inclure dans F2 ou plus tard ?                                                 | **Plus tard**                                                                             | n/a (reporté)         |
| Q6 ✅ | Construction paresseuse du pool — vaut-elle la conditionnelle ?                                                   | **LOCKED v2.1** : eager (toujours construite dans le constructeur de `QwenAgent`)         | résolu               |
| Q7    | Fenêtre `restoreState` vs vidage du pool — garder séparé, aligner, ou lire depuis les paramètres ?                | **Garder le défaut de 30s séparé** + un bouton de configuration `--mcp-pool-drain-ms`     | commit 4               |
| Q8    | Gestion OAuth — confirmer le report en F3, documenter la solution de contournement ?                              | **Reporté en F3**, documenter la solution de contournement `/mcp auth <name>`             | commit 4               |
| Q9    | Exposition de `entrySummary` — toujours inclure, ou derrière un drapeau verbose ?                                 | **Toujours inclure** (petite charge utile, utile pour les opérations)                     | commit 5               |
| Q10   | Mettre à jour la décision n°3 dans `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` — coordonner avec @wenshao ? | La description de la PR F2 lie la PR codeagents ; les deux PR sont revues indépendamment  | PR ouverte             |
---

## 23. Risques

### Élevé

- **R1 (État global A2)**: Collision `serverStatuses` sur plusieurs entrées de même nom. Atténué par la fonction d'agrégation des statuts ; le risque restant est que les consommateurs du SDK lisent la Map globale brute (peu probable — utilisée uniquement via l'accesseur `getMCPServerStatus(name)`).
- **R2 (Symétrie de PromptRegistry)**: Oublier l'envoi (fan-out) des prompts dans un chemin de code supprime silencieusement des prompts. Atténué par le test F2-2 21.4 troisième point + test d'intégration vérifiant la parité des prompts par rapport à avant F2.
- **R3 (Fuite d'état du transport HTTP)**: Activer le pool HTTP pour un serveur qui maintient un état par transport corrompt les contextes de session. Atténué par désactivation par défaut + documentation ; ne peut pas être détecté automatiquement.

### Moyen

- **R4 (Unification de chemin F2-1)**: La fabrique `connectToMcpServer` et la classe `McpClient` présentent des différences comportementales subtiles (par ex., capacités annoncées à la construction vs. à la connexion). Atténué par le fait que F2-1 est une PR de refactorisation pure avec une couverture de régression complète avant le début du travail sur le pool.
- **R5 (PID descendant Windows)**: PowerShell `Get-CimInstance` peut être lent (coût de démarrage) ou bloqué par AppLocker. Atténué par un délai d'attente de 2s + dégradation gracieuse.
- **R6 (Amplification de la diffusion d'événements du pool)**: L'avertissement de budget se propageant à 100 sessions provoque 100 appels `extNotification` en boucle serrée. Atténué par parallélisation `Promise.all` + capture par session (modèle PR 14b existant).

### Faible

- **R7 (Stabilité de l'empreinte entre les versions de MCPServerConfig)**: Des champs futurs ajoutés à `MCPServerConfig` non inclus dans l'empreinte permettraient silencieusement un partage incorrect. Atténué par une fonction de canonicalisation explicite + un test qui énumère tous les champs de `MCPServerConfig` et vérifie la couverture.
- **R8 (Courses de compteurs de génération)**: Des cycles de redémarrage rapides pourraient épuiser la précision numérique JS (≈ 2^53 = ~285k ans à 1/s). Pas une préoccupation pratique.

### Spécifique à une PR unique (V21-14)

- **R9 (Fatigue de relecture sur une PR unique de ~6000 LOC)**: La bande passante du relecteur devient un chemin critique. F3 bloqué par la fusion de F2 → bloque les autres contributeurs. Atténuation : (a) pré-relecture avec 3 agents spécialisés et repli des P0/P1 avant ouverture, en suivant le modèle de la PR 21 ; (b) structurer en 6 commits atomiques pour que le relecteur puisse avancer pas à pas ; (c) coordonner la fenêtre de relecture avec @wenshao à l'avance via le commentaire #4175.
- **R10 (Accumulation de conflits de fusion `daemon_mode_b_main`)**: F2 touche `acpAgent.ts`, `httpAcpBridge.ts`, `capabilities.ts`, `mcp-client*.ts` — tous des chemins chauds. Les contributeurs de F3 / F4 qui fusionnent simultanément risquent des conflits pendant la fenêtre de relecture de F2 (1 à 2 semaines). Atténuation : `git rebase origin/daemon_mode_b_main` quotidien ; coordination via la mise à jour #4175 indiquant que F2 est en cours + demander à F3/F4 de différer les modifications de fichiers chauds jusqu'à la fusion de F2.
- **R11 (Temps d'exécution CI)**: ~1900 LOC de nouveaux tests incluant le démarrage de sous-processus + la recherche de PID multiplateforme pourrait faire passer le CI de 30 min à 50 min. Atténuation : (a) conditionner les tests de sous-processus derrière `process.env.QWEN_INTEGRATION === '1'`, exécuter un sous-ensemble dans le CI de la PR + l'ensemble complet la nuit ; (b) parallélisme Vitest ≥ 4 ; (c) les tests de recherche de PID Windows sont conditionnés uniquement sur le runner Windows GHA.

---

## 24. Mises à jour de la documentation

| Doc                                                                                                                          | Mise à jour                                                                                                                                                                          | Quand                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`                                                           | Décision #3 "Durée de vie du serveur MCP" : actuellement "par session" ; mettre à jour vers "groupé par espace de travail avec clé de hachage de configuration en mode démon ; autonome par session" | Fusion de F2-3 (coordonner avec @wenshao PR codeagents)   |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                                                                           | Vague 5 PR 23 → marquer comme série F2 ; lier aux PRs                                                                                                                               | Fusion de F2-3                                          |
| `packages/cli/src/serve/README.md` (si existe) ou nouveau `docs/serve/mcp-pool.md`                                           | Nouvelle section : sémantique du pool, clé d'empreinte, option de transport, sémantique de redémarrage, interprétation de l'instantané de statut                                      | F2-3b                                                   |
| `packages/sdk/README.md`                                                                                                     | Champ `scope?` sur les événements de garde-fou, `entryCount` sur le statut du serveur, helper `isWorkspaceScopedBudgetEvent`                                                         | F2-4                                                    |
| Corps de l'issue #4175                                                                                                       | Mettre à jour l'entrée F2 avec le tableau des sous-PR, lien vers la conception v2 (ce document)                                                                                     | Avant l'ouverture de F2-1                               |
| Corps de l'issue #3803                                                                                                       | Ligne de la décision #3 : mettre à jour "Actuellement par session" → "Groupé par espace de travail en mode démon (F2)"                                                                 | Après la fusion de F2-3                                  |
| Commentaire en ligne `acpAgent.ts:869-936`                                                                                   | Supprimer la référence prospective "Vague 5 PR 23" ; mettre à jour vers "diplômé par F2 en `scope: 'workspace'`"                                                                      | PR F2-4                                                 |
| CHANGELOG / notes de version (Vague 6 / F5)                                                                                  | Titre "Les processus MCP sont désormais partagés entre les sessions d'un espace de travail"                                                                                           | Version F5                                              |
---

## 25. Modèle de description de PR (livraison en un seul PR)

```markdown
## feat(serve): shared MCP transport pool (workspace-scoped) [F2]

Single feature-cohesive PR per #4175 branching strategy (2026-05-19).
Replaces what was originally planned as Wave 5 PR 23 + sub-PRs F2-1..F2-4.

### Scope

~4100 LOC production + ~1900 LOC tests across 6 atomic commits.
Step through with `git log -p HEAD~6..HEAD` for commit-by-commit review.

### Design doc

See `docs/design/f2-mcp-transport-pool.md` (v2.1).

### Pre-review specialist agents (per PR 21 pattern)

Folded into first commit before opening:

- code-reviewer: N findings, all adopted
- silent-failure-hunter: N findings, all adopted
- type-design-analyzer: N findings, all adopted

### Closes

(none — F2 entry in #4175 stays open until PR merges into main batch)

### Related

- #3803 decision #3 update (codeagents PR <link>)
- PR 14b (#4271 merged) — budget guardrail base; F2 graduates scope to workspace
- F1 (#4319 merged) — acp-bridge package; F2 depends on injection seams

### Backward compatibility

- Standalone `qwen` (non-daemon): pool not constructed; existing behavior preserved
- Daemon `qwen serve --no-mcp-pool`: kill switch falls back to per-session
- SDK: all new fields additive (`entryCount`, `scope?`); EVENT_SCHEMA_VERSION stays at 1
- Old SDK clients: unknown `scope: 'workspace'` ignored per PR 14 contract
- Old daemons: SDK consumers can detect absence of `mcp_workspace_pool` capability and fall back

### Test plan

- [ ] Pool key: env permutation stability, header divergence, per-session filter exclusion
- [ ] Lifecycle: 3-session sharing, drain grace, concurrent acquire dedupe, spawn failure slot release
- [ ] Tools + Prompts dual fan-out, per-session trust copy, snapshot replay on attach
- [ ] Generation guard: pre-reconnect handler doesn't overwrite post-reconnect snapshot
- [ ] Crash + reconnect with stdio backoff (5s × 3) and HTTP backoff (1/2/4/8/16s × 5)
- [ ] Descendant pid sweep: Linux/macOS pgrep recursion, Windows PowerShell CIM
- [ ] Budget at workspace scope: 4 sessions × budget=2 → 3 max (not 12); fan-out to all attached
- [ ] LoadSession resume within drain window: pool entry reused, no cold start
- [ ] Hot config reload: old/new entries coexist; old drains naturally
- [ ] Restart route: `?entryIndex=` selectivity; legacy single-entry response shape preserved
- [ ] In-flight tool call during reconnect: `MCPCallInterruptedError` rejection
- [ ] Standalone qwen: all existing mcp-client-manager tests pass unchanged
```

## Résumé

F2 v2.1 = un seul PR avec 6 commits atomiques (~6000 LOC), ciblant `daemon_mode_b_main`. Piliers de conception clés :

1. **`McpTransportPool`** dans `packages/core` (côté enfant ACP), limité à l'espace de travail, avec compteur de références + vidange de 30 s
2. **Clé d'empreinte** SHA-256 sur la configuration canonique incluant les variables d'environnement/en-têtes (modèle claude-code), excluant les filtres par session (includeTools/trust)
3. **`SessionMcpView`** projection du registre d'outils et de prompts par session avec copie de confiance
4. **Rejeu d'instantané + garde de génération** pour la course d'attachement et les notifications obsolètes
5. **Balayage des PID descendants multiplateforme** (modèle opencode + portage Windows)
6. **Option HTTP/SSE**, contournement SDK MCP, OAuth reporté à F3
7. **Machine à états du budget** passe à la portée de l'espace de travail ; cellule d'instantané + événements push s'ajoutent de manière additive (`scope?`)
8. **Refonte des routes d'état et de redémarrage** : pool d'abord avec repli sur session d'amorçage ; `entryCount` + `RestartResult[]`

**Questions ouvertes Q1–Q10** au §22 nécessitent les décisions des mainteneurs avant l'ouverture des sous-PR respectifs. Recommandation de résoudre Q1–Q4 avant le début de F2-3 (ceux-ci conditionnent la direction générale) ; Q5–Q10 peuvent être résolus de manière incrémentale.

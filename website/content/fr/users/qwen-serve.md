# Mode démon (`qwen serve`)

Exécutez Qwen Code en tant que démon HTTP local afin que plusieurs clients (plugins IDE, interfaces web, scripts CI, CLIs personnalisés) partagent une seule session d'agent via HTTP + Server-Sent Events, au lieu que chacun ne génère son propre sous-processus.

> **🚧 v0.16-alpha** : `qwen serve` est publié pour la première fois sur npm dans la v0.16-alpha en tant que **chat / coding textuel** avec **déploiement local uniquement**. Les pièces jointes image/fichier sur le chemin du prompt, le déploiement conteneurisé (Docker / k8s / nginx reverse-proxy) et la sécurisation distante / multi-démon arriveront dans un patch de suivi lorsqu'un pilote entreprise sera confirmé. Consultez [v0.16-alpha known limits](#v016-alpha-known-limits) pour la liste complète des fonctionnalités reportées.

> **Statut :** Étape 1 (expérimental). La surface du protocole est verrouillée selon le tableau des routes §04 de l'issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803). L'étape 1.5 (flag `qwen --serve` — le TUI héberge le même serveur HTTP) et l'étape 2 (refactorisation in-process + polish `mDNS`/OpenAPI/WebSocket/Prometheus) sont immédiatement prévues.
>
> **Transparence sur le périmètre :** L'étape 1 est dimensionnée pour les **développeurs qui prototypent des clients contre la surface du protocole** et pour la **collaboration locale mono-utilisateur / petite équipe**. Les workloads de production multi-clients / longue durée / réseau instable (compagnons mobiles, bots IM atteignant 1000+ chats) nécessitent les garanties de l'étape 1.5+ qui ne figurent pas dans cette version. Consultez [Stage 1.5+ runtime guarantees](#stage-15-runtime-guarantees) pour la liste complète des écarts et #3803 pour la feuille de route de convergence.

## Ce que cela vous apporte

- **Interface Web Shell intégrée** — `qwen serve` sert le Web Shell basé sur le navigateur à sa racine (`http://127.0.0.1:4170/`) dès le départ ; exécutez `qwen serve --open` pour le lancer automatiquement dans votre navigateur. Il est servi sur la même origine que l'API, donc aucun second port ou reverse proxy n'est nécessaire. Passez `--no-web` pour un démon API uniquement.
- **Jusqu'à un enfant ACP primaire plus un enfant à la demande par secondaire de confiance, plusieurs clients** — la production tente de préchauffer le bridge primaire et réessaie à la première utilisation après échec ; les runtimes secondaires de confiance démarrent leur propre enfant à la demande, tandis que les secondaires non fiables n'en démarrent jamais un. Avec le `sessionScope: 'single'` par défaut, les clients ciblant le même workspace partagent une session ACP et collaborent sur la même conversation, les mêmes diffs de fichiers et les mêmes invites de permission.
- **Streaming sécurisé à la reconnexion** — SSE avec reconnexion `Last-Event-ID` permet à un client de se déconnecter et de reprendre exactement là où il s'était arrêté (dans la fenêtre de relecture de l'anneau).
- **Transcripts persistés paginés** — `GET /session/:id/transcript` renvoie le transcript persisté actif complet sous forme de pages de relecture sans attacher de client ni modifier la fenêtre de relecture SSE live.
- **Permissions au premier répondant** — lorsque l'agent demande la permission d'exécuter un outil, chaque client connecté voit la demande ; le premier client à répondre gagne.
- **Un démon, un ou plusieurs workspaces** — répétez `--workspace` pour enregistrer des runtimes de workspace isolés sous un seul écouteur. Le premier workspace est primaire et reste la valeur par défaut pour les requêtes qui omettent `cwd`.
- **Canaux expérimentaux gérés par le démon** — démarrez avec `qwen serve --channel <name>`, ou démarrez sans canal et sélectionnez-en un plus tard avec `qwen channel set`. Les workers sont des processus séparés appartenant au cycle de vie du démon. Leur sélection peut être requise, remplacée, rechargée et arrêtée sans redémarrer le démon.
- **Contrôle d'exécution distant** — changez le mode d'approbation d'une session (`POST /session/:id/approval-mode`), activez/désactivez un outil (`POST /workspace/tools/:name/enable`) ou un skill chargé (`POST /workspace/skills/:name/enable`) par workspace, échafaudez un `QWEN.md` vide (`POST /workspace/init`, mécanique uniquement — n'appelle PAS le modèle ; pour un remplissage par IA, enchaînez avec `POST /session/:id/prompt`), redémarrez un seul serveur MCP avec une pré-vérification de budget (`POST /workspace/mcp/:server/restart`), ou ajoutez/supprimez des serveurs MCP à l'exécution sans redémarrer le démon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Tout est strictement contrôlé — configurez `--token` d'abord.
- **Récapitulatif de session** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) suivi) — récupérez un résumé en une phrase "où en étais-je" d'une session active (`POST /session/:id/recap`). Encapsule le `generateSessionRecap` du core comme une requête latérale contre le modèle rapide ; ne pollue ni l'historique de chat principal ni le flux SSE. Porte non stricte (même posture que `/prompt`) ; helper SDK `client.recapSession(sessionId)`.
  - **Limite connue — amplification du coût en tokens :** la route est un endpoint à coût pur (chaque appel est une requête latérale LLM, sans bénéfice d'état) et le démon n'a pas de rate limit par route en v1. Sur un loopback sans token par défaut, un client local bogué ou malveillant peut le spammer pour brûler des tokens. Configurez `--token` (et optionnellement `--require-auth`) sur les hôtes de dev partagés avant d'exposer le démon.
  - **Sécurité des récapitulatifs simultanés :** deux appels `/recap` simultanés sur la même session exécutent deux requêtes latérales indépendantes. `generateSessionRecap` lit un instantané de l'historique de chat via `GeminiClient.getChat().getHistory()` et le transmet à un appel `BaseLlmClient.generateText` séparé (via `runSideQuery`) ; il n'ajoute jamais et ne mute jamais le `GeminiChat` de la session. Sûr à appeler depuis plusieurs clients sans coordination.

## Limites connues de la v0.16-alpha

La première release npm de `qwen serve` (v0.16-alpha) est volontairement restreinte — chat / coding textuel pour les développeurs exécutant le démon sur leur propre machine. La liste ci-dessous rend la surface reportée explicite afin que les adoptants puissent planifier en conséquence ; tout ce qui se trouve ici est sur la feuille de route des patches v0.16.x ou une release de suivi à court terme.

**Surface produit — textuel uniquement :**

- ✅ Prompts textuels et réponses textuelles (chat, coding, appels d'outils, intégration MCP)
- ❌ **Pièces jointes image / fichier sur le chemin du prompt** — `MessageEmitter` ne rend actuellement que du texte ; l'écho multimodal arrivera lorsqu'une cible alpha avec des besoins en images sera confirmée (#4175 chiga0 #27 P0 item)
- ❌ **Uploads en streaming** — même condition que le multimodal

**Surface de déploiement — local uniquement :**

- ✅ Loopback (`127.0.0.1`, par défaut) — aucune auth requise, adapté aux postes de dev
- ✅ Lancement local via `systemd` / `launchd` / `nohup &` / `tmux` — voir [Local launch templates](./qwen-serve-deploy-local.md)
- ✅ Apportez votre propre bearer token via la variable d'env `QWEN_SERVER_TOKEN` ([Authentication](#authentication) pour la configuration)
- ❌ **Déploiement conteneurisé** — Docker / Compose / Kubernetes / nginx reverse-proxy avec terminaison TLS NON inclus dans la v0.16-alpha. Reporté à la v0.16.x une fois qu'un pilote entreprise sera confirmé (sinon cela pourrirait faute de validation).
- ❌ **Coordination multi-démon sur un même hôte** — un démon peut héberger plusieurs workspaces explicitement enregistrés, mais les démons ne se coordonnent pas entre eux. La fédération cross-host, le keying de token par chemin d'instance et le nettoyage des tokens obsolètes sont reportés à la v0.16.x.
- ✅ **Jetons Local Control frais** — `--local-control` génère un jeton pour ce processus. Le stockage général des jetons du démon reste BYO-token.

**Sécurisation — minimum viable pour le local mono-utilisateur :**

- ✅ Gate de sécurité au démarrage (refuse la liaison non-loopback sans token, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Gate d'auth pour les routes de mutation, routage des permissions par session (Wave 4 PRs)
- ✅ Garde-fous MCP + coordination des permissions multi-clients (F2 / F3)
- ✅ **Deadline absolue du prompt + timeout d'inactivité du writer SSE** — opt-in via `--prompt-deadline-ms` et `--writer-idle-timeout-ms` ; annoncé via `prompt_absolute_deadline` et `writer_idle_timeout` lorsque activé.
- ✅ **Rate limiting HTTP** — opt-in via `--rate-limit` et seuils par tier ; annoncé via `rate_limit` lorsque activé.
- ⏸️ **Métriques Prometheus + harness de load test** — reporté à la v0.17 F4 Phase-1 scale instrumentation lorsque 30-50 sessions actives deviendra un objectif réel.
- ⏸️ **Flag CLI `--max-body-size`** — le démon applique `express.json({ limit: '10mb' })` par défaut, ce qui couvre confortablement les prompts textuels (les fenêtres de contexte du modèle sont bien en dessous de 10 MiB de caractères). Ajustable via flag en v0.16.x.

Pour l'énumération plus approfondie de "ce que nous ne corrigerons pas à l'étape 1" (modèle de mutation d'état de session single-host + N sessions parallèles partageant un enfant ACP dans chaque runtime de workspace), voir [Stage 1 scope boundaries](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) ci-dessous.

## Démarrage rapide

### 1. Démarrez le démon (loopback, sans auth)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

La liaison par défaut est `127.0.0.1:4170`. L'auth Bearer est **désactivée** sur le loopback pour que le développement local "fonctionne directement". Le démon enregistre le répertoire de travail courant comme workspace primaire ; utilisez un `--workspace /path/to/dir` absolu pour le remplacer, et répétez le flag pour enregistrer des runtimes isolés supplémentaires.

**Ouvrez l'interface Web Shell.** Naviguez vers `http://127.0.0.1:4170/` (ou démarrez le démon avec `qwen serve --open` pour le lancer automatiquement) pour le terminal complet dans le navigateur — chat, diffs, historique de commits, appels d'outils et invites de permission. L'UI est servie à la racine du démon sur la même origine que l'API. Le reste de ce guide utilise du HTTP brut afin que vous puissiez scripter directement contre l'API.

### 2. Vérifiez son bon fonctionnement

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

Le champ `workspaceCwd` expose le workspace de compatibilité primaire afin que les clients puissent omettre intentionnellement `cwd` sur `POST /session`. Les clients actuels doivent sélectionner une entrée de confiance dans `workspaces[]` et envoyer le `cwd` de cette entrée lorsqu'ils ciblent explicitement un runtime.
Le champ `limits.maxPendingPromptsPerSession` annonce le plafond d'admission de prompts par session actif ; `null` signifie que le plafond est désactivé. `limits.maxTotalSessions` annonce le plafond optionnel de sessions fraîches à l'échelle du démon ; `null` signifie illimité.

### Exécuter des canaux depuis le démon

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under daemon-owned workspace workers
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all

# Or start a token-protected daemon with no channel worker
QWEN_SERVER_TOKEN=secret qwen serve

# Enable or replace its runtime selection later
qwen channel set telegram --token secret
qwen channel set telegram feishu --token secret
qwen channel set all --token secret

# Inspect or stop daemon-managed channels
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

Ce mode est expérimental et géré par le démon. Il ne remplace pas la commande standalone `qwen channel start` : sans `--daemon-url`, les comportements existants de `qwen channel start`, `stop` et `status` restent standalone. Avec `qwen serve --channel`, le démon réserve le bail de service de canal avant l'écoute et échoue le démarrage si le worker initial ne peut pas devenir prêt. Sans `--channel`, il ne charge aucun runtime de canal et ne réserve aucun bail de service de canal jusqu'au premier PUT runtime. Si un worker prêt crashe plus tard, le démon continue de s'exécuter, le relance selon une politique de redémarrage bornée, et signale son état (y compris les warnings `channel_worker_exited`) dans `GET /daemon/status`.

Le contrôle d'exécution est exposé via `GET`, `PUT` et `DELETE /workspace/channel` ; les helpers SDK sont `getChannelWorkerControl()`, `setChannelWorkerSelection()` et `stopChannelWorker()`. PUT/DELETE/reload utilisent la gate de mutation stricte, donc le démon doit avoir un bearer token configuré. Les sélections runtime sont délibérément éphémères : PUT ne modifie pas les paramètres ni les options de démarrage, et un redémarrage revient à la sélection `qwen serve --channel` (ou désactivé lorsque ce flag est omis). Les sélections nommées sont nettoyées et dédupliquées dans l'ordre de première occurrence ; l'ordre est préservé car le premier canal peut affecter la sélection de modèle partagé.

Le démon lit les paramètres de chaque canal (tokens, `proxy`, `model` par canal) au démarrage de son worker. Pour relire les paramètres sans modifier la sélection committée, appelez `POST /workspace/channel/reload` (SDK `client.reloadChannelWorker()`, ou `qwen channel reload`). Reload résout à nouveau la propriété du workspace et redémarre les workers sélectionnés via le même chemin de réconciliation rollback-safe. La capacité `channel_control` est présente chaque fois que le contrôle runtime est câblé ; `channel_reload` n'est présente que lorsque le manager est activé. Les threads persistés sont restaurés depuis le disque.

Le `cwd` de chaque canal sélectionné doit résoudre vers un workspace enregistré, et les canaux sont regroupés par workspace propriétaire : un démon mono-workspace exécute un worker (inchangé par rapport à avant) ; un démon multi-workspace (`--workspace` répété) exécute un worker par workspace qui possède un canal sélectionné, chacun lié au cwd, `QWEN_DAEMON_WORKSPACE` et à l'overlay env de ce workspace. Pour héberger un canal dans un workspace non primaire, définissez-le dans le `.qwen/settings.json` propre à ce workspace (pas de `cwd` nécessaire) ou définissez un `cwd` explicite égal au chemin du workspace ; un canal défini uniquement dans la portée utilisateur/système sans `cwd` est ambigu entre les workspaces et provoque une erreur de démarrage. `--channel all` reste primaire uniquement (il héberge les canaux du workspace primaire) et ne peut pas être combiné avec des canaux nommés.

Remplacer une sélection pré-vérifie la configuration, la propriété et la confiance avant d'arrêter quoi que ce soit. Cela conserve les workers de workspace dont la sélection ordonnée est inchangée. Si un worker modifié ne peut pas démarrer, le démon arrête les nouveaux workers et restaure l'ancienne sélection. Si le démon ne peut pas confirmer qu'un ancien enfant s'est terminé même après SIGKILL, il conserve le bail PID et refuse de créer un worker dupliqué. Un worker est toujours considéré prêt lorsqu'au moins un adaptateur demandé se connecte ; PUT renvoie alors `partial: true`, et `/daemon/status` signale `channel_worker_partial_connect` pour les adaptateurs manquants.

Lorsqu'un adaptateur rejette `connect()`, les instantanés de worker actuels peuvent inclure des entrées `startupFailures` avec le canal, `phase: "connect"`, un code d'adaptateur optionnel, et un message avec identifiants expurgés. `qwen channel set`, `qwen channel reload` et `qwen channel status --daemon-url …` distants affichent ces raisons. Si chaque adaptateur échoue lors d'un set ou reload dynamique, la commande reçoit `502 channel_worker_start_failed` ; les raisons de la réponse décrivent cette tentative et son `state` décrit le résultat après rollback. La tentative échouée n'est pas conservée par les requêtes de statut ultérieures. Au maximum 64 raisons sont conservées par démarrage de worker, et les codes d'adaptateur doivent être traités comme diagnostiques plutôt que comme catégories stables. Le démarrage initial `qwen serve --channel …` quitte toujours lorsqu'aucun adaptateur ne se connecte.

Le démon expose également des instantanés d'exécution en lecture seule pour les UIs client et les opérateurs : `GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /workspace/:id/session-info`,
`GET /session/:id/status`, `GET /session/:id/context`,
`GET /session/:id/supported-commands`, et
`GET /session/:id/tasks`, `GET /session/:id/lsp`, et
`GET /session/:id/transcript`.

`GET /workspace/:id/session-info` (et le jumeau au pluriel
`GET /workspaces/:workspace/session-info`) renvoie les comptes de sessions
agrégés pour un workspace : `active` / `archived` / `total` persistés, plus le
compte `live` en mémoire actuel lorsque l'état live est disponible. Les
workspaces secondaires non fiables enregistrés omettent `live` car leurs
lectures de catalogue n'interrogent pas le bridge live. La liste paginée
`GET /workspace/:id/sessions` n'inclut pas de total, donc c'est la surface
dédiée pour « combien de sessions existent ? » — utile lorsque des tâches
planifiées ou récurrentes laissent un grand store local.

> ⚠️ **Scan disque — ne pas poller.** Cet endpoint parcourt les fichiers JSONL
> de sessions locales sous le répertoire de chats du workspace. Les réponses
> incluent toujours `expensive: true` et `cost: "disk_scan"`. Appelez-le
> rarement (rafraîchissement manuel, outillage d'opérateur, chargement
> occasionnel d'UI) — jamais sur un timer serré ou à chaque rendu de
> barre latérale. Préférez `GET /workspace/:id/sessions` pour parcourir les
> pages et `GET /daemon/status` pour les comptes de sessions live en mémoire.
> Une réponse avec `truncated: true` signifie que le scan a atteint sa limite
> de sécurité ou n'a pas pu classifier chaque fichier candidat, donc les
> comptes persistés sont des bornes inférieures.

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status` renvoie le résumé live du bridge pour une seule session :
`sessionId`, `workspaceCwd`, `createdAt`, `displayName` optionnel, `clientCount`,
et `hasActivePrompt`. Il répond `200` avec le résumé lorsque le démon détient une
session live avec cet id, et `404` (corps `{ "error": …, "sessionId": … }`)
sinon. Utilisez-le pour poller si une session connue est toujours en cours d'exécution
(`hasActivePrompt`) ou combien de clients sont attachés (`clientCount`) sans
récupérer et scanner toute la liste de sessions paginée :

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

C'est la vue brute de la session live, donc `clientCount` et `hasActivePrompt` correspondent
à l'entrée correspondante dans `GET /workspace/:id/sessions` — mais les deux routes
ne sont pas identiques au byte près. L'endpoint de liste enrichit chaque élément avec des données
persistées du store de sessions : son `createdAt` est l'heure du premier prompt persisté, et il
ajoute `updatedAt` ainsi qu'un `displayName` dérivé du titre stocké ou du premier
prompt. `/status` rapporte à la place le `createdAt` propre à la session live, omet
`updatedAt` et renvoie `displayName` uniquement s'il est défini sur la session live.

`GET /session/:id/lsp` renvoie le statut LSP structuré par session. Démarrez le
démon avec `--experimental-lsp` pour activer LSP dans les sessions d'agent spawnées ;
sinon la route renvoie `enabled: false` sans serveurs.

`GET /daemon/status` est l'instantané consolidé de dépannage. Le `detail=summary` par défaut
ne lit que l'état du démon en mémoire (sessions, permissions,
compteurs de transport SSE/ACP, rejets de rate limit, mémoire du processus, limites résolues)
et ne démarre pas l'enfant ACP. Utilisez `GET /daemon/status?detail=full` pour
les diagnostics par session, les détails de connexion ACP, les compteurs de flux de périphériques d'auth et
les sections de statut du workspace lorsque vous investigatez activement un problème.

`GET /workspace/mcp`, `GET /workspace/skills` et `GET /workspace/providers`
rapportent le runtime ACP live et ne démarrent pas l'enfant ACP lorsqu'il est inactif ; un
démon inactif renvoie `initialized: false` avec un instantané vide. Une fois qu'une
session est active, ils passent à `initialized: true` et exposent l'état réel.

Pour refléter le panneau CLI `/skills` à distance, appelez `POST /workspace/skills/:name/enable` avec `{ "enabled": true | false }` après avoir vérifié la capacité `workspace_skill_toggle`. Pour modifier plusieurs Skills, vérifiez `workspace_skill_batch_toggle` et appelez `POST /workspace/skills/enable` avec `{ "skillNames": ["review", "deploy"], "enabled": false }` ; sa réponse sépare les `results` réussis des `errors` par cible, persiste les cibles valides ensemble, et rafraîchit les sessions ACP actives en une fois. La route met à jour `skills.disabled` et `skills.enabled` du workspace selon les besoins, rejette les cibles inconnues, cachées, d'extension inactive, verrouillées par une portée supérieure et non fiables. Activer un skill `skills.defaultDisabled` écrit un opt-in canonique dans `skills.enabled` ; une entrée `skills.disabled` dure héritée d'une portée supérieure ne peut toujours pas être écrasée. Les cellules de statut de skill exposent `disabledReason` (`hard`, `default` ou `inactive_extension`) et un `lockedScope` optionnel. Une réponse `deferred` signifie que le paramètre a été sauvegardé alors qu'aucun enfant ACP n'était en cours d'exécution ; il s'appliquera au démarrage de l'enfant. `skills.disabled` désactive à la fois l'utilisation manuelle et par le modèle, contrairement à `disable-model-invocation: true` qui laisse l'invocation directe via `/skill-name` disponible.

`GET /workspace/env` et `GET /workspace/preflight` répondent toujours avec
`initialized: true` quel que soit l'état de l'ACP. `env` ne consulte jamais l'ACP
(infos du processus démon uniquement) ; `preflight` répond avec les cellules de niveau démon depuis
`process.*` et émet des placeholders `status: 'not_started'` pour les cellules de niveau ACP
lorsque l'enfant est inactif.

`GET /workspace/env` rapporte le runtime, la plateforme, le sandbox,
le proxy du processus démon et la **présence** (jamais la valeur) des variables d'env secrètes sur liste blanche
telles que `OPENAI_API_KEY`. Les URLs de proxy sont dépouillées de leurs identifiants et réduites
à `host:port` avant d'être envoyées sur le réseau. La route répond toujours depuis le
processus démon directement et ne spawn jamais d'enfant ACP.

`GET /workspace/preflight` renvoie une liste de checks de readiness. **Les cellules de niveau démon**
(version Node, entrée CLI, répertoire de workspace, ripgrep, git, npm)
sont toujours rendues. **Les cellules de niveau ACP** (auth, découverte MCP, skills, providers,
registre d'outils, egress) nécessitent un enfant ACP live — lorsque le démon est inactif
elles émettent des placeholders `status: 'not_started'` plutôt que de spawner l'ACP juste
pour les remplir. Les échecs correspondent à une enum `errorKind` fermée (`missing_binary`,
`auth_env_error`, `init_timeout`, `restore_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`) afin que les UIs client puissent rendre une remédiation structurée.

Le démon expose également des helpers de fichiers de workspace :

- `GET /file` lit les fichiers texte. Les réponses full-snapshot renvoient un hash raw-byte `sha256:<hex>` ; les fenêtres de lignes finies des fichiers au-dessus de 256 KiB l'omettent.
- `GET /file/bytes` lit des fenêtres raw byte bornées et renvoie du contenu base64.
- `POST /file/write` crée ou remplace des fichiers texte.
- `POST /file/edit` applique exactement un remplacement de texte.

Write/edit sont des **routes de mutation strictes** : même sur le loopback elles nécessitent un
bearer token configuré, sinon elles renvoient `token_required`. Les remplacements
et éditions nécessitent le dernier `expectedHash` d'un full-snapshot `GET /file`
(ou d'une fenêtre complète `GET /file/bytes`). Une fenêtre partielle de gros fichier ne peut pas
être utilisée comme token de concurrence optimiste. `create` n'écrase jamais. Les écritures explicites vers des chemins ignorés
sont autorisées mais auditées. Les écritures binaires, delete/move/mkdir et la création récursive de parents
ne font pas partie de cette surface.

### 3. Ouvrez une session

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` peut être omis — la route retombe sur le workspace primaire du démon. Poster un `cwd` qui ne se canonicalise pas vers un workspace enregistré renvoie `400 workspace_mismatch`.

Un second client postant sur `/session` pour le même runtime de workspace résolu obtient `"attached": true` avec le `sessionScope: 'single'` par défaut — il partage maintenant la session d'agent de ce runtime. Omettre `cwd` résout vers le primaire ; sélectionner un autre workspace enregistré crée ou rattache à la session par défaut séparée de ce runtime.

### 4. Abonnez-vous au flux d'événements (dans un autre terminal d'abord)

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

La ligne `data:` est **l'enveloppe d'événement complète** — `{id?, v, type, data, originatorClientId?}` — JSON-stringifiée sur une seule ligne. La payload ACP (le bloc `sessionUpdate` dans cet exemple) se trouve sous `data` à l'intérieur de cette enveloppe. Les lignes SSE `id:` / `event:` sont une commodité pour les clients EventSource ; les mêmes valeurs apparaissent à l'intérieur de l'enveloppe JSON afin que les consommateurs raw-`fetch` les obtiennent aussi.

Ouvrez ceci **avant** d'envoyer le prompt — le buffer de relecture SSE contient les
8000 derniers événements afin qu'un abonné tardif puisse rattraper son retard via `Last-Event-ID`,
mais pour le cas simple "observer un seul prompt", il est plus facile de s'abonner
d'abord et de le laisser streamer en live.

Le flux émet `session_update` (chunks LLM, appels d'outils, usage),
`permission_request` (l'outil a besoin d'approbation), `permission_resolved`
(quelqu'un a voté), `model_switched`, `model_switch_failed` et les frames terminales
`session_died` (l'enfant agent a crashé — SSE se ferme alors) et
`client_evicted` (votre file a débordé — SSE se ferme alors).

### 5. Envoyez un prompt (retour dans le terminal d'origine)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

Le `curl -N` de l'étape 4 affichera les frames au fur et à mesure de leur arrivée.

### Garde d'arrêt Todo optionnel

Les clients démon de longue durée peuvent opter pour une continuation bornée lorsque la
chaîne de travail en cours écrit avec succès une liste Todo de niveau supérieur puis s'arrête
avec des éléments encore en attente ou en cours. Ajoutez ceci à `settings.json` et
redémarrez le démon :

```json
{
  "experimental": {
    "todoStopGuard": true
  }
}
```

Le garde ajoute au maximum deux appels consécutifs au modèle primaire sans nouvelle entrée
utilisateur. Un message utilisateur en cours de tour s'exécute en premier et démarre une
nouvelle étape de deux tentatives ; les résultats arrière-plan de retry/continue et connexes
conservent le budget de l'étape en cours.
Chaque appel et l'état d'épuisement final apparaissent sous forme d'événements `session_update`
rejouables avec `_meta.source: "todo_stop_guard"` ; les métadonnées incluent la tentative
et le compte d'inachevés mais jamais le texte Todo. Un prompt complet en file s'exécute
également en premier, et les règles existantes de permission/annulation restent inchangées.

Pendant qu'une chaîne armée attend des travaux arrière-plan connexes, les déclenchements
cron/loop non connexes et les notifications de tâches anciennes sont différés. Le travail
récurrent est borné et coalescé par tâche jusqu'à ce que la chaîne cède.

L'option est par défaut à `false`, nécessite un redémarrage, et est forcée à off en mode
safe, en mode bare, et en mode Approval `plan`. Elle est en mémoire uniquement : charger
l'état Todo depuis le disque ou redémarrer le démon ne l'arme pas. Un nouveau prompt
ordinaire doit exécuter avec succès son propre `todo_write` de niveau supérieur ;
retry/continue et rattachement de client live conservent la chaîne de travail en mémoire
actuelle. Changer avec succès le répertoire de travail de la session l'efface afin qu'un
ancien Todo ne puisse pas reprendre dans un nouveau workspace.

## Authentification

Pour tout ce qui dépasse le loopback, vous **devez** passer un bearer token :

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

Les clients envoient ensuite `Authorization: Bearer $QWEN_SERVER_TOKEN` sur chaque requête. `/health` est exempté **uniquement sur les liaisons loopback** afin que les sondes de liveness k8s/Compose à l'intérieur du pod (où le démon écoute sur `127.0.0.1`) n'aient pas besoin d'identifiants. Sur les liaisons non-loopback (`--hostname 0.0.0.0` etc.) `/health` nécessite le token comme n'importe quelle autre route — sinon un attaquant peut sonder des adresses arbitraires pour confirmer l'existence du démon. Utilisez `/capabilities` pour vérifier que votre token est correct de bout en bout (il nécessite toujours l'auth) :

> **Loopback durci (`--require-auth`).** Le comportement par défaut sans token sur le loopback est adapté pour un laptop mono-utilisateur mais non sécurisé sur les hôtes de dev partagés, les runners CI ou les workstations multi-tenants où n'importe quel utilisateur local peut faire `curl 127.0.0.1:4170`. Passez `--require-auth` pour rendre le bearer token obligatoire sur chaque route — y compris `/health` et `/capabilities` — même lorsqu'il est lié à `127.0.0.1`. Le démarrage échoue sans token. Avec le flag activé, un client **non authentifié** ne peut pas lire `/capabilities` pour découvrir que l'auth est requise ; la surface de découverte est le corps de la réponse 401 lui-même. Une fois authentifié, le tag `caps.features.require_auth` est une confirmation post-auth que le déploiement est durci (utile pour les UIs d'audit / conformité) :
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (or whatever index — non-null after authenticating means the tag is present)
> ```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

La comparaison de token est en temps constant (SHA-256 + `crypto.timingSafeEqual`) ; les réponses 401 sont uniformes entre "header manquant", "schéma incorrect" et "token incorrect" afin qu'un side-channel ne puisse pas faire la distinction.

## HTTPS / TLS (pour l'accès mobile / cross-device)

Par défaut, le démon sert du HTTP en clair. C'est très bien sur `localhost`, mais un téléphone ou une tablette atteignant une IP LAN (`https://192.168.x.x:4170`) n'est **pas** un [contexte sécurisé](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) sur `http://` — les navigateurs bloquent donc `getUserMedia` (entrée vocale), WebRTC et les autres API réservées aux contextes sécurisés. Passez `--tls-cert` + `--tls-key` pour servir le Web Shell en HTTPS et les débloquer :
```bash
# 1. Installez une CA locale et faites-lui confiance (une seule fois). L'appareil mobile doit
#    également faire confiance à cette CA — mkcert indique où se trouve le certificat racine.
mkcert -install

# 2. Générez un certificat pour l'IP LAN de votre machine. Ajoutez également localhost / 127.0.0.1
#    aux SAN : avec `--open`, le démon réécrit l'URL du navigateur vers
#    127.0.0.1, donc un certificat limité uniquement à l'IP LAN serait rejeté avec
#    ERR_CERT_COMMON_NAME_INVALID. (mkcert nomme la sortie d'après tous les hôtes.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. Démarrez le démon en HTTPS. Les liaisons non-loopback nécessitent toujours un token,
#    et l'Origin du navigateur doit être autorisée via CORS.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve écoute sur https://0.0.0.0:4170
```

Remarques :

- **Les deux flags ou aucun** — le démarrage échoue si un seul est fourni (un certificat sans clé ne peut pas démarrer un écouteur HTTPS).
- **TLS est orthogonal à l'authentification** — HTTPS chiffre le transport ; le bearer token contrôle toujours l'accès à chaque route de l'API. Les liaisons non-loopback nécessitent un token, avec ou sans TLS.
- **La portée se limite à la terminaison TLS** — pas de génération automatique, pas d'ACME / Let's Encrypt. C'est une commodité pour les réseaux LAN / de développement ; pour les déploiements exposés sur Internet, terminez le TLS au niveau d'un reverse proxy (voir le modèle de menace ci-dessous).

## Flags CLI

| Flag                                    | Par défaut      | Objectif                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`          | Port TCP. `0` = port éphémère attribué par l'OS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--hostname <addr>`                     | `127.0.0.1`     | Interface de liaison. Toute liaison au-delà du loopback nécessite un token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--local-control`                       | `false`         | Partage le Web Shell sur une interface IPv4 privée sélectionnée avec un jeton d'appairage révocable appartenant au démon, un QR code de terminal, une origin de navigateur exacte et une inhibition de veille au meilleur effort. Se compose avec `--token`, `--allow-origin` et `--port 0` ; entre en conflit avec `--no-web` et `--hostname` non par défaut. Utilisez `--local-control-address` lorsque plusieurs candidats LAN sont disponibles, et ajoutez `--tls-cert` + `--tls-key` pour les API de navigateur en contexte sécurisé telles que la saisie vocale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--local-control-address <ip>`          | —               | Adresse IPv4 LAN à partager lorsque l'hôte possède plusieurs candidats. Nécessaire uniquement si `--local-control` signale un choix ambigu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--token <str>`                         | —               | Bearer token. Se rabat sur la variable d'environnement `QWEN_SERVER_TOKEN` (avec les espaces de début et de fin supprimés — pratique pour `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                        | `false`         | Refuse de démarrer sans bearer token, même sur le loopback. Renforce le comportement par défaut du développeur sur `127.0.0.1` pour les hôtes de développement partagés / les runners CI / les stations de travail multi-locataires où n'importe quel utilisateur local peut atteindre l'écouteur. Ne démarre qu'avec `--token` ou `QWEN_SERVER_TOKEN` défini ; place également `/health` derrière le bearer token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--tls-cert <path>`                     | —               | Chemin vers un fichier de certificat PEM. Sert le trafic via **HTTPS** au lieu de HTTP. Doit être associé à `--tls-key` (le démarrage échoue si un seul est fourni). Débloque les API de navigateur en contexte sécurisé — saisie vocale (`getUserMedia`), WebRTC — sur une IP LAN, que les navigateurs bloquent autrement en `http://` simple. Terminaison TLS uniquement ; pas de génération automatique / ACME. Voir [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) ci-dessous.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--tls-key <path>`                      | —               | Chemin vers un fichier de clé privée PEM. Doit être associé à `--tls-cert`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-sessions <n>`                    | `32`            | Limite de sessions actives simultanées. Les nouvelles requêtes `POST /session` qui généreraient un nouveau processus enfant retournent `503` (avec `Retry-After: 5`) lorsque la limite est atteinte ; les rattachements aux sessions existantes ne sont PAS comptabilisés. Définir à `0` pour désactiver. Dimensionné pour une utilisation mono-utilisateur / petite équipe ; augmentez-la si votre déploiement dispose de la marge de RAM/FD nécessaire (~30-50 Mo par session).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-total-sessions <n>`              | dérivé          | Entier positif optionnel, plafond à l'échelle du démon pour la création de nouvelles sessions dans tous les runtimes de workspace enregistrés. Il s'applique aux nouvelles sessions enfants, à la restauration de sessions et aux sessions créées par branch/fork ; le rattachement à une session live existante ne consomme pas de slot. Définir à `0` pour illimité. Lorsque omis avec plusieurs workspaces de démarrage/restaurés, le démon déduit un plafond fixe à partir de la limite par workspace et du nombre de workspaces de démarrage ; un enregistrement dynamique ultérieur ne le recalcule pas.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--max-pending-prompts-per-session <n>` | `5`             | Limite par session pour les prompts acceptés par `POST /session/:id/prompt` mais pas encore traités, y compris les prompts en file d'attente et le prompt actif. Le bridge rejette le dépassement de manière synchrone avec `503`, `Retry-After: 5`, et `code: "prompt_queue_full"` avant de retourner un `promptId`. Définir à `0` pour désactiver. `branchSession` se sérialise sur la même FIFO mais n'est pas comptabilisé dans cette limite de prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()` | Répertoire absolu de workspace enregistré par ce démon. Répétez le flag pour héberger plusieurs workspaces dans un seul processus ; le premier est primaire et reste la valeur par défaut lorsqu'une requête omet `cwd`. Les valeurs relatives sont rejetées. Les requêtes de session dont le `cwd` canonique n'est pas enregistré renvoient `400 workspace_mismatch`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--memory-project-scope <mode>`         | `workspace`        | Mode de partitionnement de la mémoire projet. `workspace` (par défaut) clé la mémoire par le répertoire exact de workspace enregistré afin que chaque workspace du démon obtienne sa propre mémoire isolée ; `git-root` est le mode de compatibilité hérité partagé par les workspaces résolus vers la même racine Git. Remplace `QWEN_CODE_MEMORY_PROJECT_SCOPE` lorsqu'il est fourni ; une valeur env vide est traitée comme non définie, tandis qu'une valeur non vide non reconnue est ignorée avec un avertissement unique et conserve le comportement hérité `git-root`. La nouvelle valeur par défaut ne migre pas la mémoire projet git-root existante — utilisez une portée `git-root` explicite pour lire ces entrées pendant la migration. |
| `--memory-budget-mb <n>`                | 50% du cgroup/hôte | Budget mémoire total en Mo pour tout l'arbre de processus du démon. Lorsque non défini, dérivé à 50% de la limite du cgroup ou de la mémoire de l'hôte ; dans les deux cas, la valeur effective est plafonnée à la mémoire disponible résolue, et les chiffres configurés et effectifs sont rapportés. Cela ne change pas la façon dont un enfant `qwen --acp` est dimensionné ; l'unique consommateur aujourd'hui est la croissance adaptative du live-journal : un pool de croissance à l'échelle du démon dérivé à 5% du budget effectif (plafonné à `1024` Mo ; sur les hôtes signalant `insufficientMemory` le pool est à 0 et la croissance adaptative est désactivée) est partagé par chaque bridge de workspace — voir `--max-journal-bytes`. Les chiffres résolus apparaissent sous `limits.memory` dans `GET /daemon/status`, aux côtés des compteurs d'enfants enregistrés et actifs et des parts par enfant advisées sous `runtime.memory`. Un hôte trop petit pour le minimum signale `insufficientMemory` plutôt que d'être forcé vers le haut ; comme la fraction dérivée est de 50%, tout hôte sous ~2 Go déclenche ceci. Passez un `--memory-budget-mb 1024` explicite sur un tel hôte pour remplacer la valeur dérivée (le flag nécessite toujours au moins 1024 Mo de mémoire disponible pour passer l'avertissement). Doit être un entier dans `[1024, 1048576]`. |
| `--channel <name\|all>`                 | —               | Worker de canal géré par le démon (expérimental). Répétez le flag pour sélectionner plusieurs canaux configurés, ou passez `all` pour démarrer tous les canaux configurés. `all` ne peut pas être combiné avec des canaux nommés. Les valeurs `cwd` des canaux sélectionnés doivent résoudre vers un workspace enregistré ; un démon multi-workspace exécute un worker par workspace propriétaire. Le worker appartient à `qwen serve` ; arrêtez le démon pour arrêter les canaux gérés par serve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--memory-pressure-mode <mode>`         | `observe`       | Indique si le démon transforme sa propre lecture mémoire en verdict. `observe` (par défaut) rapporte le niveau de pression sous `runtime.memory.pressure` dans `GET /daemon/status` et lève une issue `daemon_memory_pressure` — un `warning`, donc le `status` global laisse `ok` — chaque fois que le niveau quitte `normal`. `off` rapporte toujours toutes les valeurs, y compris le niveau, mais ne lève aucune issue, donc le `status` global est inchangé ; utilisez-le lors du calibrage, ou si vous alertez sur le statut de niveau supérieur. Le niveau est le pire de deux ratios : RSS contre mémoire disponible (ce que le cgroup OOM killer surveille) et heap V8 utilisée contre le plafond de heap de ce processus. Il couvre uniquement le processus racine du démon ; comparez-le avec `runtime.memory.children.rssBytes` pour les enfants. Rien ne remédie dans les deux modes. Parmi `off`, `observe`. |
| `--child-heap-mode <mode>`              | `observe`       | Indique si le démon modélise une partition de heap par enfant de `--memory-budget-mb`. `observe` (par défaut) rapporte ce qu'il appliquerait — `limits.memory.childHeap.perChildCeilingMb` et `maxConcurrentChildren` — et compte les spawns qui auraient dépassé la limite. **Rien n'est appliqué** : aucun enfant n'est dimensionné à partir du budget et aucun spawn n'est refusé. `off` ne modélise rien, et le dit sur le réseau : `maxConcurrentChildren` et `perChildCeilingMb` sont tous deux `null` plutôt que de porter une partition que vous avez désactivée. Un compteur de refus de 0 ne signifie **pas** que la partition serait sûre à appliquer : les enfants fonctionnent toujours sur le plafond dérivé de l'hôte beaucoup plus grand, donc une charge de travail nécessitant plus d'old space que le plafond modélisé semble parfaitement saine ici. L'application de la partition arrive avec la mesure qui peut répondre à cela. |
| `--max-connections <n>`                 | `256`           | Limite de connexions TCP au niveau de l'écouteur (`server.maxConnections`). Limite le nombre de sockets bruts indépendamment du nombre de sessions — les clients SSE lents / fantômes sont rejetés au moment de l'acceptation une fois la limite atteinte. Augmentez cette valeur en même temps que `--max-sessions` si votre déploiement prévoit de nombreux abonnés SSE par session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--event-ring-size <n>`                 | `8000`          | Profondeur de l'anneau de relecture SSE par session (cible #3803 §02). Définit l'arriéré disponible pour `GET /session/:id/events` avec `Last-Event-ID: N`. Plus grand = plus de marge pour la reconnexion au prix de quelques centaines de Ko de RAM supplémentaire par session. Les clients SDK peuvent également demander une limite d'arriéré par abonné plus grande sur un abonnement spécifique via `?maxQueued=N` (plage `[16, 2048]`, par défaut 256). Les démons émettent également une trame SSE non terminale `slow_client_warning` à 75 % de remplissage de la file d'attente afin que les clients puissent se vider / se reconnecter avant d'être évincés. Pre-flight `caps.features.slow_client_warning`.                                                                                                                                                                                                                                                                                                                                                        |
| `--compacted-replay-max-bytes <n>`      | `4194304`          | Limite d'octets par session live pour les événements de relecture retenus dans le snapshot borné renvoyé par `POST /session/:id/load`. La limite s'applique à `compactedReplay` ; le `liveJournal` en cours est séparément limité par `--max-journal-events` et `--max-journal-bytes` (plafonds de base que la croissance adaptative peut augmenter — voir `--max-journal-bytes`). Les valeurs doivent être des entiers safe positifs ; les valeurs invalides échouent au démarrage, et le plafond dur est 256 MiB. Lorsque de la relecture ancienne retenue est supprimée, le snapshot commence par `history_truncated`. Cela ne limite pas le transcript sur disque.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--max-journal-events <n>`              | `10000`            | Plafond de base par session pour les entrées de relecture retenues dans le `liveJournal` en cours pour le tour non terminé actuel. Les chunks consécutifs compatibles de texte ou de pensée partagent une entrée, avec au maximum 256 événements source par entrée ; les autres limites d'événements sont préservées. Lorsque la limite est dépassée, le démon tente d'abord la croissance adaptative (voir `--max-journal-bytes`) ; si aucune marge n'est accordée ou si l'accord ne couvre pas le dépassement, les entrées les plus anciennes sont supprimées et un marqueur `history_truncated` est ajouté en préfixe. Les compteurs `truncatedEvents` et `retainedEvents` du marqueur décrivent les événements source. Doit être un entier safe positif. Épingler ce flag (ou `--max-journal-bytes`) désactive la croissance adaptative.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--max-journal-bytes <n>`               | `8388608`          | Plafond de base d'octets par session pour le `liveJournal` en cours, compté à partir des événements source sérialisés même lorsque des chunks compatibles partagent une entrée de relecture. Lorsqu'un tour dépasse le plafond, la croissance adaptative augmente les plafonds de la session vers le double (jusqu'à un plafond dur par session de 256 MiB, limité par la marge restante du pool) tandis que la croissance accordée à travers toutes les sessions live du démon tient dans un pool de croissance partagé dimensionné à 5% du budget mémoire effectif du démon — la valeur de `--memory-budget-mb` lorsqu'elle est passée, plafonnée à la mémoire disponible résolue, sinon 50% de la mémoire auto-détectée (voir `--memory-budget-mb`) — plafonné à `1024` Mo ; sur les hôtes signalant `insufficientMemory` le pool est à 0 et la croissance adaptative est désactivée. La croissance se produit à la demande, et seulement aussi loin que le pool le permet ; lorsqu'elle est refusée, que le pool est épuisé, ou qu'un accord ne couvre pas le dépassement, les entrées les plus anciennes sont supprimées entières (au moins une entrée est toujours conservée), donc la queue retenue peut être bien plus petite que le plafond. Épingler ce flag (ou `--max-journal-events`) désactive la croissance adaptative. Doit être un entier safe positif. Par défaut 8 MiB.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--mcp-client-budget <n>`               | —               | Limite (entier positif) de clients MCP actifs. Lorsque `mcp_workspace_pool` est annoncé, la limite et les transports sont partagés par runtime de workspace ; lorsque le tag est absent, le manager par session hérité l'applique. À combiner avec `--mcp-budget-mode`. Lorsque non défini, aucune application basée sur la comptabilisation (mais `GET /workspace/mcp` rapporte toujours `clientCount`). Distinct du `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code qui limite la concurrence au démarrage, et non le nombre total de clients. Pre-flight `caps.features.mcp_guardrails` et `caps.features.mcp_workspace_pool`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | Comment `--mcp-client-budget` est appliqué. `warn` (par défaut lorsque le budget est défini) : aucun refus, le `budgets[0].status` du snapshot passe à `warning` à ≥75 % du budget. `enforce` : les connexions au-delà de la limite sont refusées, la cellule par serveur affiche `disabledReason: 'budget'`, déterministe selon l'ordre de déclaration de `mcpServers`. `off` (par défaut lorsque le budget n'est pas défini) : observabilité pure. Le démarrage rejette `enforce` sans budget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--external-tool-guard-mode <m>`        | `off`             | Politique de pré-exécution externe ACP géré. `off` n'appelle aucun provider et n'annonce aucune capacité. `required` échoue le démarrage sauf si un provider compatible termine le handshake v1, puis échoue chaque invocation d'outil de haut niveau prise en charge fermement sauf si sa requête prepare unique est autorisée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--external-tool-guard-endpoint <url>`  | —                 | URL HTTP(S) loopback origin-only utilisée en mode `required` pour le provider, par exemple `http://127.0.0.1:8787`. Les chemins, identifiants URL, redirections, hôtes non-loopback et le routage proxy ne sont pas acceptés.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--external-tool-guard-timeout-ms <n>`  | `3000`            | Entier `100..30000` ; s'applique indépendamment au handshake de démarrage et à chaque requête prepare.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--http-bridge`                         | `true`            | Mode Stage 1 : la production tente de préchauffer un enfant `qwen --acp` primaire pour la compatibilité et réessaie à la première utilisation après échec, tandis que chaque secondaire de confiance peut démarrer un enfant à la demande. Les sessions ciblant un runtime sont multiplexées sur son enfant via ACP `newSession()` ; les secondaires non fiables ne peuvent pas démarrer ACP. Le mode natif in-process de Stage 2 sera disponible ultérieurement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--initialize-timeout-ms <n>`           | `10000`            | Délai de requête enfant ACP, incluant le handshake `initialize` (ms). Doit être un entier positif jusqu'à `2147483647`. Les valeurs supérieures au plafond de timer JS (`2^31-1`) sont rejetées au démarrage car Node les compresse silencieusement à 1 ms. Les déploiements en conteneur froid nécessitant une marge supplémentaire pour le démarrage enfant peuvent augmenter cette valeur ; la même valeur régit `newSession`, les polls de statut de workspace et d'autres deadlines de méthodes ext ACP.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--session-restore-timeout-ms <n>`      | `60000`            | Deadline de chargement/reprise de session ACP en millisecondes. Doit être un entier positif jusqu'à `2147483647` ; `0` est invalide. Si omis, la valeur par défaut est de 60 secondes, relevée à un `--initialize-timeout-ms` explicitement fourni lorsque cette valeur est plus grande ; un timeout d'initialisation plus court n'abaisse jamais le budget de restauration. Le SDK et le WebUI ajoutent 10 et 15 secondes de marge client. Un timeout retourne un `504 session_restore_timeout` retryable ; cela n'implique pas que le démon lui-même a quitté.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Liste blanche cross-origin pour les clients webui du navigateur. Répétable. Chaque valeur est `*` (n'importe quelle origin — le démarrage refuse si aucun bearer token n'est configuré ; `--require-auth` sur le loopback est recommandé pour que `/health` soit également protégé par le bearer, car il est pré-auth sur le loopback par défaut ; les ressources statiques du Web Shell restent pré-auth dans tous les modes, donc passez `--no-web` pour les supprimer) ou une origin URL canonique (`<scheme>://<host>[:<port>]`, sans slash de fin / chemin / userinfo / requête). **Les wildcards de sous-domaine (`https://*.example.com`) ne sont intentionnellement pas prises en charge** — listez explicitement chaque sous-domaine, ou utilisez `*` avec un token configuré (et `--require-auth` pour un durcissement complet). Les origins correspondantes reçoivent les en-têtes de réponse CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, méthodes, en-têtes, max-age, et `Retry-After` exposé) ; les origins non correspondantes obtiennent toujours un 403 avec la même enveloppe qu'aujourd'hui. `Origin: null` (iframes sandboxées, documents file://) est toujours rejeté, même sous `*`. Pre-flight via `caps.features.allow_origin`. Les hits sur l'origin du loopback lui-même ne sont pas affectés. |
| `--web` / `--no-web`                    | `true`          | Sert le SPA Web Shell construit à la racine du démon (`GET /`, `/assets/*`, et navigations de documents `GET /session/<id>`). Ces points d'entrée sont enregistrés **avant** la porte d'auth par bearer token — un navigateur ne peut pas attacher de token à une sous-ressource `<script>` ou à une navigation dans la barre d'adresse, et le shell ne contient aucun secret. Chaque route de l'API reste protégée par token quoi qu'il arrive, et le fallback de lien profond du SPA pour tous les autres chemins se trouve également derrière la porte bearer. Sur les liaisons non-loopback, un avertissement d'une ligne sur stderr indique que l'UI est accessible sans authentification. Utilisez `--no-web` pour un démon API uniquement. Aucun effet lorsque la build omet les ressources du Web Shell (le démon enregistre un breadcrumb et s'exécute en API uniquement).                                                                                                                                                                                                                                                                                         |
| `--open`                                | `false`         | Une fois l'écouteur en ligne, ouvre le Web Shell dans votre navigateur par défaut à l'URL du démon (avec `#token=` ajouté en tant que fragment d'URL lorsqu'un token est configuré — un fragment n'est jamais envoyé au serveur, ce qui garde le token hors des journaux d'accès et des en-têtes Referer). Aucune opération avec `--no-web`, ou dans les environnements headless / CI / SSH où aucun navigateur n'est disponible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

> **Mises en garde sur la portée mémoire projet.**
>
> - **Démon vs CLI standalone.** Le flag ou l'environnement de lancement du démon
>   définit une portée figée pour chaque runtime possédé par ce démon. Un `.env` de workspace ou
>   `settings.env` ne peut pas la remplacer pour un seul workspace enregistré. Un TUI `qwen`
>   standalone utilise toujours la portée git-root par défaut ; pour maintenir les deux points
>   d'entrée cohérents, exportez `QWEN_CODE_MEMORY_PROJECT_SCOPE` dans le shell ou
>   l'environnement de service qui les lance.
> - **Collisions de noms de répertoires.** La clé de stockage est dérivée par
>   `sanitizeCwd`, qui remplace chaque caractère non alphanumérique par
>   `-`. Des répertoires frères qui ne diffèrent que par la ponctuation (par ex.
>   `feature_1` et `feature-1`) correspondent au même répertoire mémoire même
>   sous la portée `workspace`. Évitez une telle nomenclature lorsque vous vous fiez à l'isolation
>   de workspace.
> - **La normalisation diffère entre le flag et la variable d'env.** La variable d'environnement
>   est rognée et mise en minuscules (`"  Workspace  "` fonctionne) ; le flag CLI est
>   sensible à la casse par les `choices` yargs (`--memory-project-scope
Workspace` est rejeté). Utilisez des valeurs en minuscules lors de la copie entre les deux.

### Garde de relocation Git intégrée au démon

Chaque session ACP gérée par le démon applique une garde de pré-exécution intégrée pour
les commandes shell du modèle, indépendante de `--external-tool-guard-mode` et sans
aucune annonce de capacité. Le démon possède le workspace lié et le répertoire de travail
effectif actuel de la session ; les deux sont fournis depuis l'état de session de confiance
et ne sont jamais acceptés depuis l'enfant ACP.

La garde inspecte les outils qui exécutent une ligne de commande shell — `run_shell_command`
et `monitor` — et refuse une commande Git
mutante avant l'exécution lorsque son emplacement de dépôt résout en dehors du répertoire
de travail effectif de la session. La relocation est reconnue pour les formes littérales
de `git -C <path>`, `git --git-dir[=]<path>`,
`git --work-tree[=]<path>`, les assignations
`GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE` en tête de commande (également
lorsqu'elles sont faites via `export`/`declare`/`readonly`, qui les conservent dans
l'environnement de chaque commande ultérieure dans la chaîne),
les flags de wrapper changeant de répertoire (`env -C`, `sudo -D`), et les builtins `cd`,
`pushd` ou `popd` plus tôt dans la même chaîne de commande. Les préfixes de wrapper
courants (`sh -c`, `bash -c`, `eval`, `sudo`, `nohup`, `timeout`, `exec`, `command`,
`builtin`,
`env`, les binaires `git` qualifiés par un chemin, et la syntaxe shell `{ …; }` / `! …`)
sont déballés pour que la même politique s'applique à l'invocation Git interne, et les
corps de substitution `$(…)` ou backticks sont analysés comme des commandes à part entière.

Un sous-agent épinglé à son propre worktree est contenu dans ce worktree plutôt que
dans le répertoire de la session ; un appel shell dont le démon ne peut pas placer le
répertoire d'exécution est refusé.

Les cibles relatives résolvent depuis le répertoire de départ effectif de la commande
(`arguments.directory` lorsqu'il est présent, sinon le répertoire de travail effectif
actuel de la session) après la résolution canonique du chemin, y compris les redirections
gitfile `.git`, les liens symboliques et les répertoires administratifs par worktree. Une
cible relocalisée qui ne peut pas être entièrement résolue avant l'exécution — une cible
dynamique (`$VAR`, backticks, `~`, globs), un chemin qui n'existe pas encore, ou une
indirection illisible — est refusée pour les sous-commandes mutantes ou non classifiables.
Une cible relocalisée qui ne peut pas être résolue est refusée quel que soit le
sous-commande — y compris les commandes en lecture seule. Les commandes relocalisées
dont le sous-commande fait partie d'un petit ensemble vérifié en lecture seule
(`rev-parse`, `cat-file`) restent autorisées une fois la cible résolue, sauf si la
commande porte une config `-c` exécutant des commandes, ou
si elle porte un flag `--output`, `--textconv` ou `--filters` : ceux-ci écrivent un
fichier ou exécutent les pilotes configurés du dépôt cible. Les commandes sans relocation
reconnue conservent leur comportement existant.
Les refus sont définitifs et sont signalés au modèle comme
`Daemon shell guard denied a mutating Git command…` pour un emplacement de dépôt résolu,
dynamique ou non résolvable, et comme
`Daemon shell guard denied a shell command…` lorsque la commande n'a pas pu être
analysée, que son payload n'a pas pu être résolu, ou qu'un programme non reconnu pourrait
exécuter une commande Git relocalisée.

La garde est fiable contre la relocation Git écrite dans les formes littérales
ci-dessus — la commande mal ciblée pour laquelle ce contrôle existe — et est
**best-effort, pas une frontière**, contre le texte shell écrit pour la déjouer :
les constructions qui cachent la relocation à un lecteur statique peuvent passer, et de
nouvelles continueront à être trouvées. N'accordez pas à un démon une confiance plus large
sur la base de celle-ci. Elle n'interprète pas les fichiers de script,
ne suit pas les valeurs de variables d'environnement entre les commandes, et n'analyse pas
les corps heredoc (le texte en forme de Git dans un heredoc peut être refusé même si le
shell ne l'exécute jamais). `/fork` et les contrôles remember/dream de mémoire de
workspace adossés à un agent restent disponibles sous la garde intégrée ; ils ne sont
restreints que lorsque le mode de fournisseur externe ci-dessous est actif. Une garde
d'outil externe optionnelle reste une politique supplémentaire et reçoit la même requête
uniquement après que la politique intégrée l'autorise.

### Tool Guard externe requis

Cet opt-in est destiné aux déploiements ACP gérés qui nécessitent une décision externe
autoriser/refuser à la frontière finale d'exécution d'outil. Il est complètement inactif
sauf si `--external-tool-guard-mode=required` est présent :

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

Le provider doit exposer `POST /v1/handshake` et `POST /v1/prepare`, exiger
`Authorization: Bearer <token>`, renvoyer du JSON, renvoyer le nonce fourni ou
l'ID de requête, et utiliser la version de protocole `1`. Le token doit être non vide, au maximum
8192 unités de code UTF-16, et ne contenir aucun caractère de contrôle. Les requêtes sont limitées
à 1 MiB, les réponses à 64 KiB, et les raisons de refus optionnelles à 500 unités de code UTF-16
sans caractères de contrôle. Une réponse prepare réussie est :

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

Un refus utilise `allowed:false` et peut ajouter une courte `reason`. Pour chaque invocation
d'outil de haut niveau prise en charge qui passe les gates existantes de permission et `PreToolUse`
et atteint la frontière d'exécution finale, Qwen Code envoie une requête prepare et ne la
rejoue jamais. Un refus antérieur de permission/hook n'envoie aucune requête prepare.
Le timeout, l'annulation, l'échec de transport, les réponses malformées ou non correspondantes,
et le refus explicite empêchent l'exécuteur de s'exécuter. Chaque canal ACP spawné doit
également accuser réception de l'installation du callback requis ; une accusation manquante ou
incompatible rejette le canal avant la création de session.
La requête du provider porte `sessionId`, `promptId`, `toolCallId`, le `toolName`
canonique et les `arguments` finaux ; `toolCallId` est un label de corrélation, pas une
identité d'authentification ni une clé d'idempotence autonome.

Les arguments finaux peuvent contenir des données applicatives sensibles. Traitez-les comme tels
dans les logs du provider et le stockage d'audit.

Les hooks `PreToolUse` s'exécutent avant cette décision finale d'exécuteur. Le mode Required
Guard n'autorise ni ne sandbox le comportement des hooks ; les déploiements qui ont besoin d'une
frontière autour de chaque effet secondaire possible doivent désactiver les hooks ou gouverner leurs
implémentations séparément.

Les actions de slash command s'exécutent également avant la planification modèle/outil et ne sont
pas des invocations Guard. Certains built-ins peuvent directement modifier des fichiers ou des
paramètres. Un déploiement géré qui a besoin d'une frontière tous-effets doit rejeter l'entrée
slash command ou désactiver chaque commande non approuvée via `slashCommands.disabled` ou
`--disabled-slash-commands`.

La portée gérée v1 concerne les outils de haut niveau invoqués par un prompt géré actif au
premier plan. Les `agent`, `workflow`, `create_sub_session`, `send_message`, les `/fork`
directs et les contrôles remember/dream de mémoire de workspace adossés à un agent sont rejetés
lorsque le mode required est actif. Un shell d'arrière-plan de haut niveau ou un démarrage de
monitor reste une invocation gardée et ses arguments finaux atteignent le provider, mais cette
fonctionnalité n'autorise pas continuellement le processus ni n'ajoute un protocole d'audit de
fin de processus ; une politique qui nécessite la fin au premier plan doit refuser ces formes.
Les appels MCP gardés désactivent également la reconnexion/relecture automatique après une erreur
de transport. Après un handshake de démarrage réussi, `/capabilities` annonce
`external_tool_guard` ; son absence signifie que les clients ne doivent pas supposer
l'application.

Cette fonctionnalité n'autorise pas les appels explicites de gestion REST/ACP du démon ;
ceux-ci continuent d'utiliser l'authentification existante du démon et les contrats de route.
Elle ne rend pas non plus un outil ou une commande shell autorisé déterministe ni ne sandbox
ses internes ; les déploiements gérés doivent combiner la décision du provider avec leur
politique d'outil normale et leur frontière d'isolation.

> **Dimensionnement des paramètres de charge.** `--max-sessions` est le plafond de sessions fraîches par workspace. `--max-total-sessions`, lorsqu'il est défini, est le plafond de sessions fraîches à l'échelle du démon.
> Trois autres couches limitent également la charge — lors du dimensionnement pour un déploiement
> à haute concurrence, ajustez-les ensemble :
>
> - **au niveau du listener** : `--max-connections` / `server.maxConnections=256`
>   limite les connexions TCP brutes (back-pressure pour les clients lents).
> - **abonnés par session** : l'EventBus limite par défaut les abonnés SSE à
>   64 par session ; le 65e client reçoit un `stream_error` terminal
>   et est déconnecté.
> - **admissions de prompts par session** :
>   `--max-pending-prompts-per-session=5` limite les prompts en file d'attente + actifs
>   acceptés pour une session. Le dépassement renvoie un `503` avec `Retry-After: 5`.
> - **sessions fraîches à l'échelle du démon** : `--max-total-sessions=N` limite la création
>   de nouvelles sessions à travers le démon. Le dépassement obtient la même
>   forme `session_limit_exceeded` avec `scope: "total"`.
> - **backlog par abonné** : une file de 256 frames par client SSE ; un
>   client en surcapacité reçoit une frame terminale `client_evicted` et est
>   déconnecté (un consommateur lent ne peut pas bloquer le daemon).
>
> Ces limites interagissent : chaque runtime est limité par `--max-sessions`, tandis que
> `--max-total-sessions` limite leur agrégat. Le plafond effectif de sessions est le plus bas
> de tout plafond fini à l'échelle du démon et le plafond agrégé par runtime (considérez
> cet agrégat comme illimité si le plafond par workspace est illimité). Si aucun n'est fini,
> il n'y a pas de plafond fini de sessions. Un plafond fini × 64 abonnés × 256 frames
> représente la mémoire en vol dans le pire des cas au niveau de l'EventBus ; le multiplier par
> `--max-pending-prompts-per-session` limite le travail de prompt accepté au niveau de la couche
> d'admission. Le dimensionnement par défaut suppose une charge mono-utilisateur / petite équipe ;
> augmentez progressivement (et surveillez la RSS) pour les déploiements plus importants.

> **Garde-fous du client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Un workspace déclarant 30 serveurs MCP dans `mcpServers` démarrera 30 clients sans limite amont sauf si vous en définissez une. `--mcp-client-budget=N` limite le nombre de clients MCP actifs ; `--mcp-budget-mode={enforce,warn,off}` choisit le comportement. La valeur par défaut est `warn` lorsqu'un budget est défini (le snapshot affiche l'avertissement mais aucun client n'est refusé — utile pour mesurer le fanout en conditions réelles avant d'activer le mode enforce). Les serveurs refusés en mode `enforce` reçoivent `disabledReason: 'budget'` sur leur cellule par serveur, et la cellule `budgets[0]` affiche `status: 'error'` + `errorKind: 'budget_exhausted'`. La réservation de slot se fait par nom de serveur et survit aux reconnexions / délais d'expiration de découverte — un serveur refusé ne peut pas prendre le slot d'un serveur sain.
>
> **La portée actuelle est pilotée par les capacités.** Lorsque `mcp_workspace_pool` est présent, toutes les sessions d'un runtime de workspace partagent son pool de transports MCP et son contrôleur de budget ; `GET /workspace/mcp` émet `scope: 'workspace'`. Un deuxième workspace a un pool et un budget indépendants. Lorsque le tag est absent (y compris `QWEN_SERVE_NO_MCP_POOL=1`), le démon utilise le `McpClientManager` par session hérité et émet `scope: 'session'` ; dans ce fallback, N sessions peuvent chacune consommer le plafond configuré.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # plus tard, après que la télémétrie a montré votre distribution en conditions réelles :
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Cela **n'est pas** équivalent au paramètre `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code (qui contrôle la concurrence au démarrage) ; ils sont orthogonaux. Les clients doivent se brancher sur `mcp_workspace_pool`, ne pas supposer une portée à partir de la version du protocole seule.
>
> **Événements Push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Les clients SDK abonnés à `GET /session/:id/events` reçoivent des frames typées lorsque les seuils de budget sont franchis — `mcp_budget_warning` (synthétique, se déclenche une fois par franchissement ascendant de 75 % avec réarmement par hystérésis à 37,5 %, annoncé via `mcp_guardrail_events`) et `mcp_child_refused_batch` (coalescé une fois par passe de découverte en mode `enforce` ; longueur 1 pour le refus de spawn paresseux de `readResource`). Le snapshot sur `GET /workspace/mcp` reste la source de vérité pour l'état après reconnexion ; les événements sont des changements de bord. Utile pour le dashboarding en temps réel sans polling.

## Modèle de menace de déploiement par défaut

- **127.0.0.1 uniquement** — liaison loopback, aucune authentification requise.
- **`--hostname 0.0.0.0` requiert un token** — le démarrage est refusé sans token.
- **`LOOPBACK_BINDS` inclut l'IPv6** — `::1` et `[::1]` comptent comme loopback pour la règle sans token.
- **Liste d'autorisation de l'en-tête Host** — sur les liaisons **loopback**, le daemon vérifie que `Host:` correspond à `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` (insensible à la casse selon la RFC 7230 §5.4) pour se défendre contre le DNS rebinding. **Les liaisons non-loopback (`--hostname 0.0.0.0`) contournent intentionnellement la liste d'autorisation Host** — l'opérateur a choisi la surface d'exposition, la barrière du bearer-token est donc la seule couche d'authentification ; les reverse proxies / SNI / le pinning de certificats client relèvent de la responsabilité de l'opérateur, et non du daemon. Si vous avez besoin d'une isolation basée sur Host pour une liaison non-loopback, terminez le TLS + vérifiez Host au niveau d'un proxy frontal.
- **CORS refuse toute origine de navigateur par défaut** — renvoie un JSON `403`. Passez **`--allow-origin <pattern>`** (répétable, T2.4 #4514) pour autoriser des origines de navigateur spécifiques. Chaque valeur est soit le littéral `*` (toute origine — le démarrage est refusé si aucun bearer token n'est configuré ; `--require-auth` sur loopback est recommandé pour un durcissement complet puisque `/health` reste pré-auth sur loopback par défaut — notez que les ressources statiques du Web Shell (`/`, `/assets/*`, navigations de documents `/session/:id`) sont montées avant le bearer dans tous les modes et restent pré-auth même sous `--require-auth`, donc utilisez `--no-web` lorsque la surface navigateur résiduelle compte) soit une origine URL canonique (`<scheme>://<host>[:<port>]`, sans slash de fin / chemin / userinfo). Les origines correspondantes reçoivent des en-têtes de réponse CORS appropriés (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, ainsi que les méthodes / en-têtes / max-age standards et `Retry-After` exposé) ; les origines non correspondantes reçoivent toujours un 403 avec la même enveloppe que le mur par défaut. `caps.features.allow_origin` est annoncé conditionnellement afin que les clients SDK / webui puissent vérifier en amont (pre-flight) si le daemon honore les requêtes cross-origin avant de les émettre. Exemple : `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Les requêtes vers l'auto-origin loopback (par ex. l'UI Web Shell) ne sont pas affectées — un shim de suppression d'Origin distinct les gère indépendamment de `--allow-origin`. **Les webuis de navigateur sans `--allow-origin` configuré** reviennent aux mêmes options de Stage 1 qu'auparavant : empaquetez-les en shell natif (Electron/Tauri) pour qu'aucun en-tête `Origin` ne soit envoyé, ou placez un reverse proxy de même origine devant le daemon.
- **L'automatisation de navigateur par extension Chrome est séparée du cadrage.** `qwen serve --allow-origin chrome-extension://<id>` permet à l'extension de cadrer le Web Shell et de se connecter au démon. Les outils console/network/screenshot/click nécessitent une commande adaptateur CDP MCP externe : `QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`. Le paquet CLI principal ne bundle pas d'adaptateur d'automatisation de navigateur ; les clients peuvent vérifier `caps.features.includes('browser_automation_mcp')` avant de présenter ces outils comme disponibles.
- **Un enfant `qwen --acp` spawné reçoit l'environnement effectif de son runtime propriétaire.** Le démon gèle une base process-env, applique l'overlay settings/fichier env de ce workspace à un snapshot local au runtime, et ne réécrit jamais l'overlay dans `process.env` ; des clés de même nom dans un autre runtime ne se croisent pas. `QWEN_SERVER_TOKEN` est supprimé avant le spawn car l'agent n'a pas besoin du bearer du démon. Les variables affectant le chargeur (`NODE_OPTIONS`, `npm_config_node_options` et les redirections de fichiers de config npm, `NODE_PATH`, `OPENSSL_CONF`, `NODE_REPL_EXTERNAL_MODULE`, `npm_config_node_gyp`, `npm_config_init_module`, `LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `ZDOTDIR`, les définitions de fonctions bash exportées `BASH_FUNC_*`) ne sont jamais non plus transmises aux sous-processus de session — le démon les supprime de son propre `process.env` et de l'environnement de base gelé avec lequel les enfants hébergeant des sessions spawnent (l'environnement de base les conserve uniquement sous le harness `DEV=true`, dont les entrées `.ts` ont encore besoin du chargeur tsx), et les sources `.env` / `settings.json` `env` les rejettent (voir [settings](./configuration/settings.md)) ; cela s'applique à chaque session hébergée par le démon. Les identifiants de base tels que `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QWEN_*` et `DASHSCOPE_API_KEY` sont sinon transmis sauf si l'overlay du runtime les modifie. **Ceci est intentionnel, ce n'est pas un sandbox.** L'agent s'exécute avec le même UID et a accès aux outils shell, donc tout ce qui se trouve dans `~/.bashrc`, `~/.aws/credentials` ou `~/.npmrc` est accessible par injection de prompt de toute façon. L'isolation d'environnement entre runtimes n'est pas une frontière de sécurité au niveau du système d'exploitation ; n'exécutez pas `qwen serve` sous une identité possédant des identifiants que vous ne confieriez pas à l'agent.
- **Les lectures de texte de l'agent sont locales à l'enfant et suivent les règles de permission CLI normales, pas la limite du système de fichiers du workspace.** `read_file` direct peut atteindre des chemins texte de l'hôte en dehors de chaque workspace enregistré : les chemins externes sont par défaut en confirmation, et les règles d'autorisation ou les modes d'approbation peuvent les approuver automatiquement. Les lectures approuvées utilisent les limites de sortie CLI configurables plutôt que les limites de sortie renvoyée, de snapshot complet et de scan de texte volumineux du système de fichiers du workspace. Cela s'applique à chaque consommateur partagé de lecture de texte, donc les pré-lectures effectuées par les opérations d'écriture, d'édition, de notebook, de sed et d'artifact perdent ces limites ainsi que l'audit de lecture du système de fichiers du workspace, le rejet de liens symboliques et les protections TOCTOU côté lecture — voir [le document de conception](../design/daemon-local-text-reads.md) pour la liste exacte. Comme un payload de confirmation est construit en lisant le fichier, un diff hors-workspace est diffusé à **chaque** abonné SSE attaché avant que quiconque ne l'approuve — dans le CLI interactif, ce contenu n'est vu que par la personne au terminal. Traitez les clients démon authentifiés comme le même principal de sécurité. Les routes de système de fichiers HTTP restent limitées au workspace et le comportement des outils de découverte de l'agent est inchangé.
- **Les écritures finales approuvées des outils texte intégrés ont une route same-host étroite.** `write_file`, `edit`, `notebook_edit` et l'éditeur sed simulé de l'outil shell attachent la provenance interne uniquement après que la politique de permission existante autorise l'exécution. Leur écriture texte ACP finale peut donc cibler un chemin absolu en dehors du workspace propriétaire sans seconde confirmation ; les règles d'autorisation, AUTO/AUTO_EDIT et YOLO se comportent comme la CLI, tandis que le rejet, Plan, le refus Hook/Guard et l'annulation pré-exécution n'envoient pas l'écriture finale. L'annulation après qu'un outil est déjà entré dans une opération filesystem non annulable conserve le comportement existant de cet outil. Les cibles workspace utilisent toujours WFS. Les cibles externes utilisent un writer hôte démon avec le même snapshot de confiance, une limite encodée de 5 MiB, le rejet de liens symboliques feuilles, le verrouillage de chemin canonique, le rename atomique, la préservation de mode, le mode `0600` pour les nouveaux fichiers, la garde de génération et l'audit filesystem. Les écritures HTTP, les écritures ACP génériques ou non marquées, les intégrations injectées de bridge/workspace-registry/factory et les redirections shell arbitraires ne bénéficient pas de cette exception. Voir [la conception des écritures externes](../design/daemon-external-tool-text-writes.md).
- **Files SSE bornées par abonné** — un client lent qui dépasse sa file reçoit une frame terminale `client_evicted` et est déconnecté ; un consommateur bloqué ne peut pas immobiliser le daemon.
- **Limite d'admission des prompts par session** — par défaut à 5 prompts acceptés mais non résolus par session. Un client bogué ne peut pas mettre en file d'attente des promesses de prompt ou des attentes SSE temporaires illimitées pour une session.
- **Arrêt gracieux** — SIGINT/SIGTERM draine les processus enfants de l'agent avant de fermer l'écouteur (délai de 10s par enfant).

> ⚠️ **Lacune connue de la Stage 1 — les permissions sont globales au daemon, et non par session (BUy4H).** `pendingPermissions` vit au niveau du daemon ; tout client détenant le bearer token peut voter sur n'importe quel `requestId` pour n'importe quelle session qu'il peut voir (et les événements SSE `permission_request` portent le requestId dans leur payload). Ceci est acceptable dans le modèle de confiance mono-utilisateur / petite équipe où chaque client authentifié est le même humain ou des collaborateurs de confiance. La Stage 1.5 passera à `POST /session/:id/permission/:requestId` + map pending par session + identité par client (incontournable #3 de la revue en aval) ; d'ici là, n'exécutez pas `qwen serve` derrière un bearer partagé avec des parties non fiables.
>
> ⚠️ **Lacune connue de la Stage 1 — le corps de POST /session/:id/prompt est limité à 10 Mo (BUy4L).** Les prompts multimodaux contenant des images / PDFs / audio qui dépassent 10 Mo échoueront au moment de l'analyse du corps avant que la logique de route ne s'exécute (pas de streaming, pas d'annulation en cours de téléchargement). Solution de contournement : réduisez le contenu côté client, ou passez une référence de chemin et laissez l'agent lire le fichier via `readTextFile`. La Stage 1.5 acceptera `multipart/form-data` ou l'encodage chunked sur `/prompt` afin que les prompts volumineux ne se heurtent pas à une limite brutale.
>
> ⚠️ **Lacune connue de la Stage 1 — connexions SSE fantômes derrière un NAT.** Le
> daemon détecte les clients morts via le back-pressure TCP sur les heartbeats
> (intervalle de 15s). Un client qui disparaît SANS un TCP RST (par ex. une
> boîte NAT qui supprime silencieusement les flux inactifs) maintient le socket
> au niveau du noyau "actif" jusqu'à ce que les sondes keepalive de Node expirent — généralement ~2 heures
> sur les défauts Linux. Sur les déploiements `--hostname 0.0.0.0` derrière de tels
> NAT, les connexions SSE fantômes peuvent s'accumuler et finir par atteindre le
> plafond de 256 `server.maxConnections`.
>
> Définissez [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)
> (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9)
> pour combler cette lacune avec une limite d'inactivité explicite au niveau applicatif :
> lorsqu'aucune écriture n'a été flushée avec succès pendant `n` ms, le daemon émet
> une frame terminale `client_evicted` avec
> `reason: 'writer_idle_timeout'` et ferme le flux. Le flag est
> désactivé par défaut pour préserver le contrat hérité — les opérateurs sur
> des réseaux qui absorbent les RST doivent choisir une valeur bien supérieure à l'intervalle de heartbeat de 15s
> (par ex. `60000`–`300000`) afin que les connexions inactives légitimes ne soient pas expulsées
> tandis que les writers véritablement bloqués sont nettoyés rapidement. Vérifiez en amont (pre-flight) `caps.features.includes('writer_idle_timeout')`
> depuis votre SDK pour confirmer que le daemon le supporte.

### Deadlines et délai d'inactivité du writer

L'issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 introduit deux flags opt-in qui comblent les lacunes des déploiements longue durée / distants que le heartbeat de 15s + AbortSignal ne couvrent pas. Les deux sont désactivés par défaut — les workflows loopback mono-utilisateur restent strictement identiques bit pour bit.

| Flag                           | Variable d'env                        | Défaut | Ce que cela fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | non défini   | Limite temporelle côté serveur pour un seul `POST /session/:id/prompt`. À l'expiration, le daemon annule l'AbortController du prompt et renvoie un HTTP `504` avec `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`. Un champ de corps de requête par prompt `deadlineMs` peut RACCOURCIR le délai effectif en dessous du flag mais ne peut jamais l'étendre. Tag de capacité (conditionnel) : `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | non défini   | Délai d'inactivité par connexion SSE. Lorsqu'aucune écriture n'a été flushée avec SUCCÈS pendant `n` ms — ni un événement réel ni le heartbeat de 15s — le daemon émet une frame terminale `client_evicted` avec `data.reason = 'writer_idle_timeout'` (miroir sur `data.errorKind`) et ferme le flux. **Choisissez une valeur confortablement supérieure au heartbeat de 15s** (par ex. `30000`–`300000`) afin que les flux inactifs légitimes ne soient pas expulsés ; les valeurs `< 15000` EXPULSERONT des connexions inactives par ailleurs saines avant que le premier heartbeat ne se déclenche (intentionnel uniquement pour les tests / sessions de dev courte durée). Tag de capacité (conditionnel) : `writer_idle_timeout`. |

Les deux flags acceptent un entier positif en millisecondes ; les valeurs `0`, `NaN`, non entières ou négatives sont rejetées au démarrage avec un message d'erreur clair. Le flag CLI l'emporte sur la variable d'env ; le champ explicite `ServeOptions` (appelants intégrés) l'emporte sur l'env. Les consommateurs SDK doivent vérifier en amont (pre-flight) le tag de capacité correspondant avant de s'appuyer sur l'un ou l'autre comportement — les daemons antérieurs à cette PR omettent les deux tags et le champ de requête `deadlineMs` est ignoré silencieusement.

### Mode de fichier pour les écritures texte de l'agent

Les écritures texte de l'agent (`write_file`, `edit`, `notebook_edit`, les écritures texte HTTP et le writer hôte same-host) créent les nouveaux fichiers en mode `0600` par défaut, indépendamment de l'umask du processus démon. Cela garantit la confidentialité des secrets créés par l'agent même sur les hôtes partagés.

Les opérateurs dont la convention de déploiement est pilotée par l'umask (par ex. une unité systemd avec `UMask=0002`, des dépôts en groupe partagé) peuvent opter pour le traitement POSIX standard des nouveaux fichiers avec :

| Variable d'env               | Valeurs             | Défaut  | Ce que cela fait                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_NEW_FILE_MODE`   | `owner` \| `system` | `owner` | `system` crée les NOUVEAUX fichiers en `0o666 & ~umask`, afin que les fichiers créés par l'agent suivent l'umask du processus démon comme tout autre processus sur la machine. `owner` conserve le défaut `0600` indépendant de l'umask. Les valeurs sont insensibles à la casse ; le littéral `0600` est accepté comme alias de `owner` (aucun autre mode octal n'est pris en charge), et toute autre valeur est rejetée avec un avertissement stderr et le défaut `0600` est conservé. |

Portée et limites :

- S'applique aux NOUVEAUX fichiers créés par les routes d'écriture texte (cibles workspace, le writer hôte externe same-host et les écritures texte HTTP). Les fichiers existants conservent toujours leur mode sur disque — éditer un secret `0600` le garde en `0600`, un exécutable garde `+x`.
- Les uploads binaires (`POST /file/upload`) créent toujours en `0600` quel que soit ce paramètre.
- Le démon lit la variable lors de la construction du système de fichiers du workspace ; redémarrez le démon après l'avoir modifiée.

## Déploiement multi-session et multi-workspace

Passez `--workspace` plus d'une fois pour enregistrer plusieurs workspaces non chevauchants dans un seul processus `qwen serve`. Le premier chemin est primaire. Chaque workspace enregistré possède une frontière d'exécution isolée, tandis que l'écouteur à l'échelle du démon, la politique d'authentification et la limite de sessions totales sont partagées. La production tente de préchauffer l'enfant ACP primaire pour la compatibilité et réessaie à la première utilisation après échec ; les secondaires de confiance démarrent leur propre enfant à la demande, et les secondaires non fiables ne démarrent pas ACP. Les requêtes peuvent sélectionner un workspace enregistré par `cwd` canonique ; les requêtes qui omettent `cwd` utilisent le workspace primaire. Utilisez un démon par utilisateur ou principal de sécurité ; la confiance du workspace est une gate d'exécution, pas une ACL.

Un workspace secondaire non fiable est visible dans le Web Shell comme `untrusted` et `read-only`. Il peut être développé pour inspecter le catalogue de sessions persistées, mais ne peut pas encore être sélectionné ou ouvert dans le Web Shell, repris, utilisé pour créer des sessions, ou entièrement exporté. L'API REST suit la politique de lecture de système de fichiers bornée existante et expose également son catalogue de groupes de sessions persistées et, lorsque `workspace_persisted_transcript` est annoncé, son transcript persisté actif via le pager borné qualifié par workspace. Ces lectures n'incluent pas l'état d'exécution live ni ne démarrent un enfant ACP. L'export qualifié par workspace complet nécessite un workspace de confiance et la capacité séparée `workspace_session_export`. Faites confiance au workspace et redémarrez le démon avant d'utiliser les fonctionnalités d'exécution, de mutation ou d'export. Un primaire non fiable reste désactivé dans le Web Shell.

Utilisez des processus démon séparés lorsque vous avez besoin d'une frontière de panne ou de sécurité plus petite, de bearer tokens indépendants, de quotas, de frontières d'audit, d'isolation au niveau du système d'exploitation ou de supervision de ressources indépendante. Le mode multi-workspace est destiné à un opérateur hébergeant plusieurs repos ; ce n'est pas une frontière d'isolation multi-locataire. Un token de démon unique autorise chaque route que le démon expose, y compris le catalogue en lecture seule autorisé pour tous les workspaces enregistrés.

> **Abonnez-vous AVANT de poster `modelServiceId` lors de l'attachement.** Lorsqu'un client fait un `POST /session` avec un `modelServiceId` et que le workspace a déjà une session exécutant un modèle différent, le daemon émet un appel interne `setSessionModel` — les échecs ne sont PAS propagés comme une erreur HTTP (la session reste opérationnelle sur son modèle actuel). Le signal d'échec visible est un événement `model_switch_failed` sur le flux SSE de la session. Si vous appelez `POST /session` et ouvrez `GET /session/:id/events` ENSUITE seulement, vous manquerez l'événement d'échec et continuerez silencieusement à parler au mauvais modèle. Ouvrez d'abord le flux SSE, ou passez `Last-Event-ID: 0` à l'abonnement pour rejouer l'événement le plus ancien disponible dans l'anneau.

Pour gérer plusieurs **utilisateurs ou principaux de sécurité** (chacun avec un token indépendant, un quota, un journal d'audit, un sandbox ou une frontière de panne de processus) ou pour passer à l'échelle au-delà de la portée d'un seul processus (budget de cold-start, nombre de FD, RSS), lancez un démon par principal derrière un orchestrateur externe. Chaque démon peut toujours héberger plusieurs workspaces pour ce principal. L'orchestrateur (multi-locataire / OIDC / Quota / Audit / k8s) est **hors du périmètre** du projet qwen-code — consultez l'issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" pour les pointers de conception.

## Chargement et reprise d'une session persistée

Le daemon expose le flux `session/load` et resume d'ACP via HTTP, plus un pager de transcript en lecture seule séparé :

| Route                                                   | À utiliser quand                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`                                | Le client n'a **aucun** historique local utile rendu (reconnexion à froid, sélection puis ouverture). Pour une session live, le démon renvoie et injecte la fenêtre courante d'instantané de relecture bornée ; si de la relecture plus ancienne a été supprimée, l'instantané commence par `history_truncated`. Tag de capacité : `session_load`. |
| `POST /session/:id/resume`                              | Le client a déjà les tours à l'écran et a seulement besoin de récupérer le handle côté daemon. Le contexte du modèle est restauré côté agent sans relecture de l'UI — le flux SSE reste propre. Tag de capacité : `session_resume` (`unstable_session_resume` reste un alias déprécié pour les anciens clients).     |
| `GET /session/:id/transcript`                           | Le client a besoin du transcript persisté actif complet. Il renvoie des frames de relecture sans id dans des pages par curseur et n'appelle pas `/load`, n'attache pas de client, n'initialise pas l'EventBus live, ne crée pas de session live et ne modifie pas la fenêtre de relecture live. Tag de capacité : `session_transcript`.                    |
| `GET /workspaces/:workspace/session/:id/transcript`     | Le client a besoin d'un transcript persisté actif d'un workspace sélectionné sans démarrer ACP ni charger les paramètres du workspace. Les workspaces secondaires non fiables enregistrés peuvent utiliser ce chemin en lecture seule. Tag de capacité : `workspace_persisted_transcript`.                                            |
| `GET /workspaces/:workspace/session/:id/export`         | Le client a besoin d'une pièce jointe complète `html`, `md`, `json` ou `jsonl` d'un workspace de confiance sélectionné. Il lit le stockage persisté actif sans démarrer ACP ni retomber sur le primaire. Tag de capacité : `workspace_session_export`.                                                         |
| `GET /workspaces/:workspace/session/:id/archive/export` | Le client a besoin des mêmes formats de pièce jointe depuis le stockage persisté archivé dans un workspace de confiance sélectionné. Il ne désarchive pas, ne démarre pas ACP et ne retombe pas sur une session active ou primaire. Tag de capacité : `workspace_archived_session_export`.                                                |

Le SDK TypeScript expose les deux sous forme de fabriques statiques sur `DaemonSessionClient` :

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Reconnexion à froid — le daemon va rejouer l'historique via SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Ou, si votre UI a déjà l'historique, ignorez la relecture :
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // D'abord les frames `session_update` rejouées (load uniquement),
  // puis les événements en direct.
}
```

Vérifiez en amont (pre-flight) `caps.features.session_load`, `caps.features.session_resume` ou `caps.features.session_transcript` avant d'appeler la route correspondante — les anciens daemons renvoient `404`. `unstable_session_resume` est toujours annoncé comme un alias de compatibilité déprécié. Les requêtes simultanées de même action pour le même id sont coalescées ; les courses d'actions croisées (un `load` en concurrence avec un `resume`) et les spawns à id fourni par l'appelant en concurrence avec une restauration renvoient `409 restore_in_progress` avec `Retry-After: 5`. Une restauration qui dépasse `limits.sessionRestoreTimeoutMs` renvoie un `504 session_restore_timeout` retryable avec un `Retry-After` dérivé du budget (borné à 5-120s) ; la requête enfant toujours en cours reste clôturée jusqu'à ce que le nettoyage se règle, et les retries au même id pendant cette fenêtre obtiennent `409 restore_in_progress` avec `reason: awaiting_abandoned_cleanup` et un `Retry-After` dérivé du budget borné à 5-120 secondes au lieu d'un délai fixe de 5 secondes. Si le nettoyage est incertain, ou si la restauration abandonnée n'a toujours pas réglé un budget de restauration complet après son délai, le travail de session fraîche obtient temporairement un `503 acp_channel_unavailable` avec `reason: restore_cleanup_failed` ou `restore_settlement_overdue`, tandis que les sessions déjà actives restent utilisables. Consultez la [référence du protocole](../developers/qwen-serve-protocol.md) pour l'enveloppe d'erreur complète.

Pour un replay persisté complet, pagez avec `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` ou la route REST brute :

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

Pour un workspace enregistré, utilisez `client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` ou `/workspaces/:workspace/session/:id/transcript`. La méthode qualifiée par workspace utilise toujours REST natif même lorsque le client SDK a un transport ACP remplaçable. Ses curseurs sont limités à la durée de vie du démon et doivent être redémarrés à la page un après un redémarrage du démon.

Pour une pièce jointe complète d'un workspace enregistré de confiance, vérifiez en amont `workspace_session_export` et appelez `client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` ou la route brute `/workspaces/:workspace/session/:id/export`. Ne déduisez pas la prise en charge de `session_export` ou `workspace_qualified_rest_core` : les anciens daemons peuvent annoncer les deux tout en conservant l'export primaire uniquement. L'action d'export Web Shell actuelle reste primaire uniquement ; utilisez le SDK ou la route REST pour un autre workspace.

Pour une pièce jointe archivée, vérifiez en amont `workspace_archived_session_export` et appelez `client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` ou `/workspaces/:workspace/session/:id/archive/export`. Ce chemin lit le stockage archivé en place et renvoie `409 session_not_archived` pour un id actif uniquement ; il ne désarchive pas la session. Le Web Shell expose le même export pour les lignes archivées dans les workspaces primaires et secondaires de confiance lorsque la capacité est présente.

`limit` compte les enregistrements de chat actifs, pas les frames de relecture émises ; un enregistrement peut produire plusieurs événements `session_update`. La première réponse gèle la taille de l'instantané JSONL et renvoie `nextCursor` tant que `hasMore` est vrai. Les pages ultérieures ignorent les ajouts après la page 1, mais renvoient `409` si le fichier est supprimé, tronqué, remplacé, archivé ou autrement en conflit avec le curseur gelé. Les instantanés très volumineux renvoient `413 transcript_too_large` avant l'indexation afin que le démon ne scanne pas des fichiers transcript illimités sur le chemin de la requête.

Pour le paging répété via la route singulière héritée, définissez `--channel-idle-timeout-ms` à une valeur positive. Avec la valeur par défaut `0`, l'enfant ACP d'un workspace inactif — et le cache d'index de transcript in-process qu'il détient — est récupéré après chaque page, donc chaque page re-spaune l'enfant et reconstruit l'index en re-scanant le préfixe gelé entier (`O(snapshotSize)` par page). Un timeout positif maintient l'enfant en vie pendant la parcours du curseur afin qu'il réutilise son index de transcript en cache et sa configuration de relecture. La route persistée qualifiée par workspace ne démarre jamais d'enfant ACP et n'est pas affectée par ce timeout.

Remarque : la relecture de l'historique de session live est limitée deux fois : par l'anneau SSE pour les reconnexions `Last-Event-ID` et par `--compacted-replay-max-bytes` pour l'instantané renvoyé par `POST /session/:id/load`. Les longs historiques avec des tours verbeux peuvent dépasser l'une ou l'autre borne. Le démon signale la troncature de l'instantané avec `history_truncated` ; utilisez `/transcript` lorsque vous avez besoin de l'historique persisté actif complet.

## Modèle de durabilité

**Les sessions restent éphémères en Stage 1 lors des redémarrages du daemon**, mais les sessions persistées sur disque peuvent être rechargées :

- Le crash d'un processus enfant publie `session_died` et supprime la session active des maps du daemon. La session persistée sur disque **peut** être rechargée via `POST /session/:id/load` si un nouvel enfant agent peut être lancé.
- Un redémarrage du daemon perd toutes les sessions actives en cours. Les sessions persistées restent sur disque et peuvent être chargées sur un nouveau processus daemon, sous réserve des mêmes règles de liaison de workspace.
- Les déconnexions client prolongées (>5 min sur un tour verbeux) peuvent dépasser l'anneau de relecture SSE (par défaut 8000 frames) — la reconnexion `Last-Event-ID` déclenche `state_resync_required`. Pour les clients mobiles / réseaux instables, prévoyez de rouvrir SSE lors de longues coupures ou d'appeler `POST /session/:id/load` pour récupérer l'instantané de relecture bornée actuel ; ne supposez pas que cette route renvoie le transcript complet.
- Les opérations sur les fichiers (`writeTextFile`) sont atomiques en cas de crash (write-then-rename) ; elles ne sont pas atomiques au sens de la relecture lors des redémarrages du daemon — l'écriture du fichier a abouti ou non.

Si votre intégration nécessite une durabilité côté serveur entre les redémarrages au-delà de ce que `session/load` couvre (par ex. des files de retry gérées par le serveur), vous avez toujours besoin d'une récupération d'état au niveau applicatif. Ne conservez pas d'état longue durée, sensible aux redémarrages, à l'intérieur de la session du daemon.

## Garanties d'exécution Stage 1.5+

Le contrat de la Stage 1 est dimensionné pour le prototypage. Conformément à la [revue downstream-consumer chiga0 #3889](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644), les éléments suivants **ne font pas** partie de la Stage 1 — les intégrations de niveau production ont besoin de la Stage 1.5+ avant de s'appuyer dessus :
**Points bloquants pour une utilisation sérieuse en aval :**

1. **`loadSession` / `unstable_resumeSession` sur HTTP** — sans cela, aucune intégration ne peut survivre à un crash d'un processus enfant ou à un redémarrage du démon, et aucun orchestrateur coordonnant le démon ne peut non plus récupérer l'état.
2. **Identité client persistante (jetons d'appairage + révocation par client)** — La phase 1 utilise un bearer partagé ; un jeton divulgué révoque tout le monde, et `originatorClientId` est auto-déclaré par le client plutôt qu'injecté par le démon à partir de l'identité authentifiée.

**Niveau de fiabilité de base :**

3. ~~**Chemin de heartbeat initié par le client**~~ — livré via la PR 9 de [#4175](https://github.com/QwenLM/qwen-code/issues/4175). `POST /session/:id/heartbeat` enregistre les timestamps de dernière vue sur le démon (tag de capacité `client_heartbeat`) ; les helpers du SDK sont `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **Événement `permission_already_resolved`** lorsqu'un vote perd la course du premier répondant — actuellement, les UIs doivent déduire l'état à partir d'un `404`.
5. ~~**Replay ring plus grand**~~ — augmenté à 8000. **Ring configurable par session** toujours ouvert — les workloads mobiles / à tours de parole fréquents peuvent nécessiter des overrides par session.
6. **Événement `slow_client_warning` avant `client_evicted`** — backpressure léger pour que les clients lents et bien comportés puissent s'auto-ralentir (réduire la profondeur de rendu, lâcher des chunks) avant d'être terminés.

**Ergonomie d'intégration :**

7. **`POST /session/:id/_meta` pour le contexte de type messagerie instantanée** — des paires clé-valeur par session attachées aux prompts suivants (chat id, sender, thread id) remplacent l'improvisation par canal.
8. **Négociation de fonctionnalités réelle via `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` afin que les clients puissent détecter les dérives au lieu de tomber sur "unknown frame, ignore".
9. **Documentation de premier ordre sur la durabilité** (cette section) — déjà livrée ci-dessus.

La feuille de route complète de convergence est suivie sur [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

## Limites du périmètre de la phase 1 — ce que nous ne corrigerons pas dans la phase 1.5

Deux choix structurels sont des non-objectifs explicites pour la feuille de route principale des phases 1 / 1.5 / 2. Si votre cas d'usage dépend de l'un ou l'autre, prévoyez des contournements plutôt que de nous attendre.

### L'état de session est en mutation locale uniquement (selon la [revue LaZzyMan #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

Le plan de la phase 1.5 décrit la TUI comme un abonné in-process à l'EventBus. En pratique, **l'UI de la TUI est strictement plus large que le protocole wire** :

- **UI locale uniquement** — les ~15 composants de dialogue Ink (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) et les commandes slash `local-jsx` (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) rendent du JSX Ink spécifique au terminal. Les clients distants sur HTTP/SSE ne peuvent pas rendre Ink de manière équivalente, et ces flux n'émettent aucun événement wire.
- **Mutations de l'état de session sans événements wire** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (écriture de `CLAUDE.md`) modifient tous le comportement de l'agent, mais seul `/model` publie actuellement un événement (`model_switched`).

**Choix de la phase 1 — option (A) de la revue** : ne pas promouvoir ces mutations en événements wire. Les deux modes de déploiement ont des conséquences différentes.

#### Mode 1 — `qwen serve` headless (cette PR)

Aucun shell TUI ne s'exécute à l'intérieur du démon. Les commandes slash listées ci-dessus **n'existent pas** dans ce mode — il n'y a pas d'UI terminal pour les exécuter. L'état de session est donc :

- **Figer au démarrage** pour `approval-mode` / `memory` / `agents` / `tools` allowlist / `auth` — tous chargés depuis les paramètres + le disque lorsque l'enfant `qwen --acp` du démon démarre ; immuables pour la durée de vie de la session. Les serveurs MCP définis dans les paramètres sont également figés au démarrage, mais les **serveurs ajoutés au runtime** (via `POST /workspace/mcp/servers`) peuvent être ajoutés ou supprimés sans redémarrage.
- **Modifiable via HTTP** via `POST /session/:id/model` (publie `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (publie `mcp_server_added` / `mcp_server_removed`), et les votes de permission (`POST /permission/:requestId`).

**Conséquence :** les clients distants en mode headless voient **l'état complet de la session**. Aucune TUI ne cache d'état supplémentaire ; aucune dérive n'est possible. Si vous souhaitez modifier `approval-mode`, redémarrez le démon avec les nouveaux paramètres. Les serveurs MCP peuvent désormais être ajoutés/supprimés au runtime via les routes de mutation (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — voir [Gestion des serveurs MCP au runtime](#runtime-mcp-server-management-issue-4514).

#### Mode 2 — TUI co-hébergée `qwen --serve` de la phase 1.5 (pas dans cette PR)

Lorsque la phase 1.5 livrera `qwen --serve` (le processus TUI co-héberge le même serveur HTTP), la TUI **existera bien** aux côtés des clients distants. Un opérateur local tapant `/approval-mode yolo` ou `/mcp add-server` mute l'état de la session, et les clients distants sur HTTP n'ont aucun événement pour observer le changement.

Dans ce mode, la TUI est un **"super-client"** — elle observe la même conversation d'agent que les clients distants, ET peut muter l'état de session ce que les clients distants ne peuvent pas faire. L'asymétrie est la suivante :

- ✅ La TUI et les clients distants voient les mêmes messages d'agent, appels d'outils, diffs de fichiers et invites de permission.
- ❌ Seule la TUI voit / mute l'approval-mode / la mémoire / la liste des serveurs MCP / les agents / l'allowlist des outils / l'état d'authentification.

**Conséquence dans le Mode 2 :** si une UI de client distant tente de refléter les paramètres de session, elle peut dériver après n'importe quelle commande slash de la TUI. Les clients distants doivent **recharger l'état lors de l'attachement / reconnexion** (utilisez `Last-Event-ID: 0` pour rejouer l'événement le plus ancien du ring pour des choses comme `model_switched`) ; ils ne doivent PAS s'appuyer sur des événements incrémentaux pour les mutations côté TUI.

#### Pourquoi (A) et pas (B) (promouvoir les mutations vers la famille d'événements `session_state_changed`)

(B) est la réponse la plus ambitieuse, mais elle enferme la phase 1.5 dans une surface wire substantiellement plus large qui doit également passer proprement à travers la refactorisation in-process prévue. Nous préférons avancer honnêtement avec un périmètre plus restreint. Le travail de taxonomie des événements d'état de session — énumérer quels flux TUI sont locaux par conception contre ceux qui pourraient plausible passer au wire via une future extension optionnelle de type (B) — est déplacé vers [#3803](https://github.com/QwenLM/qwen-code/issues/3803), et non dans le code de la phase 1.5.

### N sessions parallèles partagent un seul enfant `qwen --acp` par runtime de workspace

Plusieurs sessions sur le même workspace de confiance **partagent le processus enfant `qwen --acp` de ce runtime** via le support multi-session natif de l'agent (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). Le bridge appelle `connection.newSession({cwd, mcpServers})` pour chaque session — l'agent les stocke dans sa map de sessions et démultiplexe le sessionId par appel. La production peut posséder jusqu'à un enfant primaire (préchauffage tenté par défaut) plus un enfant à la demande par secondaire de confiance ; les secondaires non fiables n'en possèdent aucun.

Coût concret pour N=5 sessions sur le même workspace :

| Ressource                             | Par session                                           | Pour N=5                                                           |
| ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Processus Node du démon                  | un                                                   | **30–50 Mo** (un démon)                                        |
| Enfant `qwen --acp`                   | partagé                                                | **60–100 Mo** (un enfant)                                        |
| Enfants serveurs MCP                  | pool workspace lorsque annoncé ; sinon par session | partagés par entrées de pool correspondantes, ou jusqu'à 3×N en fallback hérité |
| `FileReadCache` (heap de l'enfant)      | partagé                                                | parsé une fois                                                      |
| Parse de `CLAUDE.md` / mémoire hiérarchique | partagé                                                | parsé une fois                                                      |
| État du refresh-token OAuth            | partagé                                                | **un seul chemin de refresh**                                             |
| Faits appris par l'auto-mémoire            | partagé                                                | une base de connaissances par enfant                                     |
| Démarrage à froid                           | le premier uniquement                                           | <200 ms après la première session                                      |

Chaque runtime de workspace actif maintient **une frontière de bridge**. La production tente de préchauffer le canal primaire et réessaie à la première utilisation après échec ; un secondaire de confiance ouvre son canal et son enfant à la demande, tandis qu'un secondaire non fiable ne le fait jamais. Un canal reste actif tant qu'au moins une session est en vie. Après le dernier `killSession`, le runtime tue son enfant immédiatement par défaut ou après le délai d'inactivité de canal configuré ; un crash au niveau du canal le démantèle également sans sélectionner un autre runtime.

Les **enfants serveurs MCP** utilisent le pool de transports à l'échelle du workspace lorsque `mcp_workspace_pool` est annoncé : les entrées correspondantes `(runtime de workspace, nom de serveur, empreinte de config)` sont comptées par référence entre les sessions. Si la capacité est absente, le manager par session hérité les spaune indépendamment.

**Les agents pairs (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) font tous du multi-session en processus unique.** qwen-code les égale au niveau de la couche agent ; le bridge de la phase 1 dans cette PR rend la même architecture visible sur HTTP.

## Se connecter à un démon distant (issue #4175 PR 21)

Lorsque le démon s'exécute sur un pod distant (sans écran partagé avec vous), un client peut déclencher un flux OAuth device sur HTTP. Le démon interroge lui-même l'IdP ; votre seul travail est d'ouvrir une URL sur n'importe quel appareil disposant d'un navigateur.

> [!note]
>
> Le niveau gratuit de Qwen OAuth a été interrompu le 15/04/2026. Les exemples `qwen-oauth`
> ci-dessous documentent la forme du protocole de flux device et l'identifiant de fournisseur
> hérité ; les nouvelles configurations doivent utiliser un fournisseur d'authentification actuellement pris en charge.

```bash
# 1. Start a flow. The daemon contacts the IdP, returns a code + URL.
curl -X POST http://127.0.0.1:4170/workspace/auth/device-flow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"qwen-oauth"}'
# → 201 {
#     "deviceFlowId": "fa07c61b-…",
#     "userCode": "USER-1",
#     "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
#     "verificationUriComplete": "https://chat.qwen.ai/...?user_code=USER-1",
#     "expiresAt": 1700000600000,
#     "intervalMs": 5000,
#     "attached": false
#   }

# 2. Visit the URL on your phone / laptop, enter the user code.
# 3. Poll for completion (or subscribe to SSE for the auth_device_flow_authorized event):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → status transitions: pending → authorized
```

Le SDK TypeScript encapsule les deux étapes dans un seul helper :

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**Le démon n'ouvre jamais de navigateur pour vous.** Même en s'exécutant localement, le démon reste passif — il retourne l'URL et laisse le SDK / l'utilisateur choisir où l'ouvrir. C'est intentionnel : un démon sur un pod headless qui appellerait `xdg-open` échouerait silencieusement, masquant la surface d'authentification réelle. Reproduisez l'UX "Press Enter to open browser" de `gh auth login` dans votre client.

**`--require-auth` et commodité de développement.** Les routes du flux device utilisent la gate de mutation stricte (PR 15), ce qui signifie qu'un loopback par défaut sans token retourne `401 token_required`. Localement, le moyen le plus simple de contourner cela pendant le développement est `qwen serve --token=dev-token` ; vous n'avez pas besoin de `--require-auth` sauf si vous durcissez le loopback par défaut.

**Limitation inter-démons.** `oauth_creds.json` est partagé entre les démons (`~/.qwen/oauth_creds.json`), donc une connexion réussie dans le démon A est automatiquement récupérée par le prochain refresh de token du démon B — mais les clients SDK du démon B ne recevront pas l'événement `auth_device_flow_authorized` (les événements sont par démon).

**Prise de contrôle inter-clients.** Deux clients SDK sur le même démon qui font tous les deux un `POST /workspace/auth/device-flow` pour le même fournisseur obtiennent le singleton par fournisseur : le premier appel démarre une nouvelle requête IdP et retourne `attached: false` ; le second appel retourne l'entrée EXISTANTE en cours avec `attached: true`. La prise de contrôle est enregistrée dans la piste d'audit (sous le `X-Qwen-Client-Id` du second client) mais n'émet PAS d'événement séparé — les deux clients observent finalement le MÊME `auth_device_flow_authorized` une fois que l'utilisateur a terminé la page IdP. Si votre UI distingue "J'ai démarré ceci" de "J'ai rejoint le flux de quelqu'un d'autre", branchez-vous sur le champ `attached` retourné par `start()`.

## Fichier de log du démon

`qwen serve` ajoute des enregistrements de diagnostic à travers les redémarrages normaux au chemin
stable actif :

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

Chaque enregistrement de fichier inclut un `runId` aléatoire par démarrage et le PID du démon. Un
propriétaire stable réussi met également à jour `debug/daemon/latest` vers `daemon.log` sur
les plateformes qui supportent les liens symboliques. Sur macOS/Linux, suivez la rotation avec :

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

Sur les autres plateformes, configurez le visualiseur pour rouvrir le chemin après son
remplacement. Un visualiseur qui ne conserve que l'ancien descripteur de fichier restera sur
l'archive après la rotation.

Le log capture les messages de cycle de vie, les erreurs de route (avec le contexte `route=` et `sessionId=`), le stderr de l'enfant ACP, et — lorsque `QWEN_SERVE_DEBUG=1` est défini — des breadcrumbs supplémentaires du bridge. Les lignes qui vont au stderr aujourd'hui vont toujours au stderr ; le log fichier est **additif**, pas un remplacement.

Le fichier actif tourne avant de dépasser 10 MiB. Chaque famille conserve
quatre archives sous `archive/`, et chaque enregistrement de fichier est limité à 256 KiB. La
file en mémoire accepte au maximum 4 MiB de payload fichier non traitée. La pression de la file,
les échecs de rotation ou les échecs de système de fichiers peuvent donc perdre des copies de fichiers ;
`GET /daemon/status?detail=full` expose la santé du logger, les problèmes et les compteurs
d'enregistrements/octets perdus.

Un seul démon peut posséder la famille stable dans un namespace de log. Un démon
concurrent écrit dans `debug/daemon/runs/run-<runId>/daemon.log` ; la bannière de démarrage
et le statut complet contiennent le chemin faisant autorité. `runs/recent-fallback` est un
localisateur best-effort pour une famille fallback récente et peut pointer vers une famille
encore active. Un namespace sain converge vers environ 100 MiB : environ 50 MiB pour la famille
stable plus une famille fallback inactive. Les familles actives ou fallback pas encore obsolètes
sont conservées, donc les démons concurrents ou les tempêtes de crash/redémarrage peuvent
temporairement utiliser plus.

Un répertoire runtime est un namespace de propriété et de rétention. Utilisez des valeurs
`QWEN_RUNTIME_DIR` distinctes lorsque les démons ont besoin d'un historique indépendant. Les nouveaux
répertoires de log de démon sont privés pour l'utilisateur (`0700`) et les nouveaux fichiers utilisent `0600` sur POSIX.
Il n'y a pas d'expiration par âge.

### Désactivation

Définissez `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) pour ignorer complètement la journalisation dans un fichier. La sortie stderr n'est pas affectée.

### Relation avec les logs de debug de session

Les logs de debug par session (`~/.qwen/debug/<sessionId>.txt` et le lien symbolique `~/.qwen/debug/latest`) sont indépendants. Le log du démon se trouve dans un sous-répertoire frère `daemon/` ; la sémantique de debug par session n'est pas modifiée par cette fonctionnalité.

### Rotation externe

Ne pointez pas une règle logrotate externe vers le `daemon.log` actif. Le démon
est le seul writer et rotateur supporté ; un renommage, une suppression ou une troncature
externe invalide son modèle de taille. Copier ou expédier des enregistrements sans
muter la famille est sans danger. Les anciens fichiers `serve-<pid>.log` et
`serve-<pid>-<workspaceHash>.log` sont laissés intacts et ne sont pas comptés
par la nouvelle politique de rétention.

## Gestion des serveurs MCP au runtime (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

Ajoutez ou supprimez des serveurs MCP au runtime sans redémarrer le démon. Les entrées runtime vivent dans un overlay éphémère qui **masque** les serveurs définis dans les paramètres portant le même nom ; la configuration sous-jacente `settings.json` / `mcpServers` n'est jamais modifiée.

**Pré-vol :** vérifiez `caps.features` pour `mcp_server_runtime_mutation` avant d'appeler l'une ou l'autre route. Les démons plus anciens sans ce tag retournent `404`.

### `POST /workspace/mcp/servers` — ajouter un serveur MCP au runtime

Soumis à une gate stricte (bearer token requis). Connecte le serveur immédiatement via le `McpClientManager` actif et découvre ses outils.

Requête :

```json
{
  "name": "my-server",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name` doit être alphanumérique plus `_` et `-` (max 256 caractères). `config` est le même objet de configuration de serveur MCP utilisé dans les entrées `mcpServers` de `settings.json` (champs dépendants du transport : `command`/`args` pour stdio, `url` pour SSE/HTTP). Les champs sensibles pour la sécurité (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) sont retirés par le démon et ignorés.

Réponse (200) — succès :

```json
{
  "name": "my-server",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` — une entrée runtime avec le même nom existait déjà et l'empreinte de la config diffère ; l'ancienne connexion est démantelée, la nouvelle est établie. Lorsque l'empreinte correspond (ré-ajout idempotent), `replaced` est `false`.
- `shadowedSettings: true` — un serveur défini dans les paramètres avec le même nom existe ; l'entrée runtime le masque désormais. L'entrée des paramètres est intacte et réapparaît si l'entrée runtime est supprimée plus tard.
- `toolCount` — nombre d'outils découverts sur le serveur nouvellement connecté.

Réponse (200) — refus doux (mode d'avertissement de budget) :

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Retourné lorsque `--mcp-budget-mode=warn` et que l'ajout du serveur dépasserait le `--mcp-client-budget` configuré. Le serveur n'est PAS connecté. Les appelants doivent remonter la pression sur le budget à l'utilisateur.

Erreurs :

| Statut | Code                      | Quand                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Nom vide, dépasse 256 caractères, ou contient des caractères en dehors de `[A-Za-z0-9_-]`                      |
| `400`  | `missing_required_field`  | `config` manquant ou n'étant pas un objet non nul                                                          |
| `400`  | `invalid_client_id`       | En-tête `X-Qwen-Client-Id` présent mais non enregistré pour ce workspace                            |
| `400`  | `invalid_config`          | Forme de la config rejetée par le validateur de transport MCP                                               |
| `401`  | `token_required`          | Aucun bearer token configuré (gate stricte)                                                           |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` et le budget est plein                                                     |
| `502`  | `mcp_server_spawn_failed` | Le processus serveur s'est terminé ou a expiré pendant la connexion ; le corps contient `serverName`, `exitCode`, `stderr` |
| `503`  | `acp_channel_unavailable` | Aucun enfant ACP actif (aucune session n'a encore été créée)                                                |

### `DELETE /workspace/mcp/servers/:name` — supprimer un serveur MCP au runtime

Soumis à une gate stricte. Déconnecte le serveur et le retire de l'overlay runtime. Idempotent — supprimer un nom qui n'a jamais été ajouté retourne une réponse de saut (pas une erreur).

Le paramètre de chemin `:name` est le nom du serveur encodé pour URL.

Réponse (200) — succès :

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — l'entrée runtime supprimée masquait un serveur défini dans les paramètres portant le même nom. Cette entrée des paramètres est maintenant démasquée et sera utilisée lors de la prochaine découverte/redémarrage.

Réponse (200) — saut idempotent :

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

Retourné lorsque le nom n'était pas dans l'overlay runtime (il peut encore exister dans les paramètres — les entrées des paramètres ne peuvent pas être supprimées via cette route).

Erreurs :

| Statut | Code                      | Quand                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Nom vide, dépasse 256 caractères, ou contient des caractères en dehors de `[A-Za-z0-9_-]` |
| `400`  | `invalid_client_id`       | En-tête `X-Qwen-Client-Id` présent mais non enregistré pour ce workspace       |
| `401`  | `token_required`          | Aucun bearer token configuré (gate stricte)                                      |
| `503`  | `acp_channel_unavailable` | Aucun enfant ACP actif                                                             |

### Sémantique de masquage (shadow)

Les entrées runtime forment un overlay éphémère au-dessus des serveurs MCP définis dans les paramètres :

- **Ajouter** un serveur runtime avec le même nom qu'une entrée des paramètres le **masque** — la config runtime prend le dessus. L'entrée originale des paramètres n'est pas modifiée.
- **Supprimer** un serveur runtime qui masquait une entrée des paramètres le **démasque** — la config définie dans les paramètres redevient active lors de la prochaine connexion.
- **Le redémarrage du démon** perd toutes les entrées runtime. Seuls les serveurs définis dans les paramètres survivent aux redémarrages. Les serveurs runtime sont limités à la durée de vie de la session.
- **`GET /workspace/mcp`** rapporte la vue fusionnée — les serveurs définis dans les paramètres et les serveurs runtime apparaissent tous deux dans le tableau `servers[]`. Il n'y a aujourd'hui aucune distinction au niveau du wire entre les deux origines dans le snapshot.

### Événements

Les deux routes émettent des événements SSE **à l'échelle du workspace** (tous les bus de session actifs les reçoivent) :

| Événement                | Émis quand                    | Champs du payload                                                                         |
| -------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` réussit (non sauté)   | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | `DELETE` réussit (non sauté) | `name`, `wasShadowingSettings`, `originatorClientId`                                   |

Les réponses ignorées (`budget_warning_only`, `not_present`) n'émettent PAS d'événements.

Les événements liés au budget de la surface `mcp_guardrail_events` existante (`mcp_budget_warning`, `mcp_child_refused_batch`) se déclenchent également lorsque les ajouts à l'exécution franchissent le seuil de budget.

## Prochaines étapes

- **Vous mettez en place un daemon à exécution longue ?** [Modèles de lancement locaux (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) pour la v0.16-alpha (local uniquement).
- **Vous développez un client ?** Consultez le [guide de démarrage rapide DaemonClient TypeScript](../developers/examples/daemon-client-quickstart.md) et la [référence du protocole HTTP](../developers/qwen-serve-protocol.md).
- **Vous explorez le code source ?** Le code du bridge se trouve dans `packages/cli/src/serve/` ; le client SDK dans `packages/sdk-typescript/src/daemon/`.
- **Vous suivez la roadmap ?** L'avancement des étapes 1.5 et 2 est suivi dans l'issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

# Mode démon (`qwen serve`)

Exécutez Qwen Code en tant que démon HTTP local afin que plusieurs clients (plugins IDE, interfaces web, scripts CI, CLIs personnalisés) partagent une seule session d'agent via HTTP + Server-Sent Events, au lieu que chacun ne génère son propre sous-processus.

> **🚧 v0.16-alpha** : `qwen serve` est publié pour la première fois sur npm dans la v0.16-alpha en tant que **chat / coding textuel** avec **déploiement local uniquement**. Les pièces jointes image/fichier sur le chemin du prompt, le déploiement conteneurisé (Docker / k8s / nginx reverse-proxy) et la sécurisation distante / multi-démon arriveront dans un patch de suivi lorsqu'un pilote entreprise sera confirmé. Consultez [v0.16-alpha known limits](#v016-alpha-known-limits) pour la liste complète des fonctionnalités reportées.

> **Statut :** Étape 1 (expérimental). La surface du protocole est verrouillée selon le tableau des routes §04 de l'issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803). L'étape 1.5 (flag `qwen --serve` — le TUI héberge le même serveur HTTP) et l'étape 2 (refactorisation in-process + polish `mDNS`/OpenAPI/WebSocket/Prometheus) sont immédiatement prévues.
>
> **Transparence sur le périmètre :** L'étape 1 est dimensionnée pour les **développeurs qui prototypent des clients contre la surface du protocole** et pour la **collaboration locale mono-utilisateur / petite équipe**. Les workloads de production multi-clients / longue durée / réseau instable (compagnons mobiles, bots IM atteignant 1000+ chats) nécessitent les garanties de l'étape 1.5+ qui ne figurent pas dans cette version. Consultez [Stage 1.5+ runtime guarantees](#stage-15-runtime-guarantees) pour la liste complète des écarts et #3803 pour la feuille de route de convergence.

## Ce que cela vous apporte

- **Interface Web Shell intégrée** — `qwen serve` sert le Web Shell basé sur le navigateur à sa racine (`http://127.0.0.1:4170/`) dès le départ ; exécutez `qwen serve --open` pour le lancer automatiquement dans votre navigateur. Il est servi sur la même origine que l'API, donc aucun second port ou reverse proxy n'est nécessaire. Passez `--no-web` pour un démon API uniquement.
- **Un processus d'agent, plusieurs clients** — avec le `sessionScope: 'single'` par défaut, chaque client se connectant au démon partage une session ACP. Collaboration en direct inter-clients sur la même conversation, les mêmes diffs de fichiers, les mêmes invites de permission.
- **Streaming sécurisé à la reconnexion** — SSE avec reconnexion `Last-Event-ID` permet à un client de se déconnecter et de reprendre exactement là où il s'était arrêté (dans la fenêtre de relecture de l'anneau).
- **Permissions au premier répondant** — lorsque l'agent demande la permission d'exécuter un outil, chaque client connecté voit la demande ; le premier client à répondre gagne.
- **Un démon, un workspace** — chaque processus `qwen serve` se lie à exactement un workspace au démarrage (selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02). Les déploiements multi-workspaces exécutent un démon par workspace sur des ports séparés (ou derrière un orchestrateur).
- **Canaux expérimentaux gérés par le démon** — `qwen serve --channel <name>` démarre un worker de canal appartenant au cycle de vie du démon. Le worker est un processus séparé, se reconnecte au démon via le SDK et rapporte son état dans `GET /daemon/status`.
- **Contrôle d'exécution distant** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) — changez le mode d'approbation d'une session (`POST /session/:id/approval-mode`), activez/désactivez un outil par workspace (`POST /workspace/tools/:name/enable`), échafaudez un `QWEN.md` vide (`POST /workspace/init`, mécanique uniquement — n'appelle PAS le modèle ; pour un remplissage par IA, enchaînez avec `POST /session/:id/prompt`), redémarrez un seul serveur MCP avec une pré-vérification de budget (`POST /workspace/mcp/:server/restart`), ou ajoutez/supprimez des serveurs MCP à l'exécution sans redémarrer le démon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Tout est strictement contrôlé — configurez `--token` d'abord.
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
- ❌ **Coordination multi-démon sur un même hôte** — `1 démon = 1 workspace × N sessions` est appliqué. La fédération cross-host, le keying de token par chemin d'instance et le nettoyage des tokens obsolètes sont reportés à la v0.16.x.
- ❌ **Tokens de démon auto-générés** — l'alpha est en BYO-token (à un `openssl rand -hex 32` près). L'infra d'auto-génération + de stockage de tokens est reportée à la v0.16.x.

**Sécurisation — minimum viable pour le local mono-utilisateur :**

- ✅ Gate de sécurité au démarrage (refuse la liaison non-loopback sans token, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Gate d'auth pour les routes de mutation, routage des permissions par session (Wave 4 PRs)
- ✅ Garde-fous MCP + coordination des permissions multi-clients (F2 / F3)
- ✅ **Deadline absolue du prompt + timeout d'inactivité du writer SSE** — opt-in via `--prompt-deadline-ms` et `--writer-idle-timeout-ms` ; annoncé via `prompt_absolute_deadline` et `writer_idle_timeout` lorsque activé.
- ✅ **Rate limiting HTTP** — opt-in via `--rate-limit` et seuils par tier ; annoncé via `rate_limit` lorsque activé.
- ⏸️ **Métriques Prometheus + harness de load test** — reporté à la v0.17 F4 Phase-1 scale instrumentation lorsque 30-50 sessions actives deviendra un objectif réel.
- ⏸️ **Flag CLI `--max-body-size`** — le démon applique `express.json({ limit: '10mb' })` par défaut, ce qui couvre confortablement les prompts textuels (les fenêtres de contexte du modèle sont bien en dessous de 10 MiB de caractères). Ajustable via flag en v0.16.x.

Pour l'énumération plus approfondie de "ce que nous ne corrigerons pas à l'étape 1" (modèle de mutation d'état de session single-host + N sessions parallèles partageant un enfant ACP), voir [Stage 1 scope boundaries](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) ci-dessous.

## Démarrage rapide

### 1. Démarrez le démon (loopback, sans auth)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

La liaison par défaut est `127.0.0.1:4170`. L'auth Bearer est **désactivée** sur le loopback pour que le développement local "fonctionne directement". Le démon se lie au répertoire de travail courant ; utilisez `--workspace /path/to/dir` pour remplacer.

**Ouvrez l'interface Web Shell.** Naviguez vers `http://127.0.0.1:4170/` (ou démarrez le démon avec `qwen serve --open` pour le lancer automatiquement) pour le terminal complet dans le navigateur — chat, diffs, appels d'outils et invites de permission. L'UI est servie à la racine du démon sur la même origine que l'API. Le reste de ce guide utilise du HTTP brut afin que vous puissiez scripter directement contre l'API.

### 2. Vérifiez son bon fonctionnement

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

Le champ `workspaceCwd` expose le workspace lié afin que les clients puissent effectuer une vérification préalable + omettre `cwd` sur `POST /session`.
Le champ `limits.maxPendingPromptsPerSession` annonce le plafond d'admission de prompts par session actif ; `null` signifie que le plafond est désactivé.

### Exécuter des canaux depuis le démon

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under one daemon-owned worker
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all
```

Ce mode est expérimental et géré par le démon. Il ne remplace pas la commande standalone `qwen channel start` : les canaux standalone utilisent toujours le service `AcpBridge` supporté par ACP. Avec `qwen serve --channel`, le démon lance un processus worker de canal après que le runtime HTTP est prêt. Si le worker se termine après le démarrage, le démon continue de s'exécuter et `GET /daemon/status` signale un warning `channel_worker_exited`. Le redémarrage automatique du worker est reporté.

Le démon est lié à un workspace, donc le `cwd` de chaque canal sélectionné doit résoudre vers le workspace du démon. `--channel all` ne peut pas être combiné avec des canaux nommés.

Le démon expose également des instantanés d'exécution en lecture seule pour les UIs client et les opérateurs : `GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /session/:id/status`, `GET /session/:id/context`,
`GET /session/:id/supported-commands`, et
`GET /session/:id/tasks`, et `GET /session/:id/lsp`.

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
`auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`) afin que les UIs client puissent rendre une remédiation structurée.

Le démon expose également des helpers de fichiers de workspace :

- `GET /file` lit les fichiers texte et renvoie un hash raw-byte `sha256:<hex>`.
- `GET /file/bytes` lit des fenêtres raw byte bornées et renvoie du contenu base64.
- `POST /file/write` crée ou remplace des fichiers texte.
- `POST /file/edit` applique exactement un remplacement de texte.

Write/edit sont des **routes de mutation strictes** : même sur le loopback elles nécessitent un
bearer token configuré, sinon elles renvoient `token_required`. Les remplacements
et éditions nécessitent le dernier `expectedHash` de `GET /file` (ou une fenêtre complète
`GET /file/bytes`). `create` n'écrase jamais. Les écritures explicites vers des chemins ignorés
sont autorisées mais auditées. Les écritures binaires, delete/move/mkdir et la création récursive de parents
ne font pas partie de cette surface.

### 3. Ouvrez une session

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` peut être omis — la route retombe sur le workspace lié du démon. Poster un `cwd` qui ne correspond pas au workspace lié renvoie `400 workspace_mismatch` (le démon est lié à exactement un workspace ; démarrez un démon séparé pour un autre).

Un second client postant sur `/session` (avec un `cwd` correspondant ou aucun) obtient `"attached": true` — il partage maintenant l'agent.

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
| `--token <str>`                         | —               | Bearer token. Se rabat sur la variable d'environnement `QWEN_SERVER_TOKEN` (avec les espaces de début et de fin supprimés — pratique pour `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                        | `false`         | Refuse de démarrer sans bearer token, même sur le loopback. Renforce le comportement par défaut du développeur sur `127.0.0.1` pour les hôtes de développement partagés / les runners CI / les stations de travail multi-locataires où n'importe quel utilisateur local peut atteindre l'écouteur. Ne démarre qu'avec `--token` ou `QWEN_SERVER_TOKEN` défini ; place également `/health` derrière le bearer token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--tls-cert <path>`                     | —               | Chemin vers un fichier de certificat PEM. Sert le trafic via **HTTPS** au lieu de HTTP. Doit être associé à `--tls-key` (le démarrage échoue si un seul est fourni). Débloque les API de navigateur en contexte sécurisé — saisie vocale (`getUserMedia`), WebRTC — sur une IP LAN, que les navigateurs bloquent autrement en `http://` simple. Terminaison TLS uniquement ; pas de génération automatique / ACME. Voir [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) ci-dessous.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--tls-key <path>`                      | —               | Chemin vers un fichier de clé privée PEM. Doit être associé à `--tls-cert`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-sessions <n>`                    | `20`            | Limite de sessions actives simultanées. Les nouvelles requêtes `POST /session` qui généreraient un nouveau processus enfant retournent `503` (avec `Retry-After: 5`) lorsque la limite est atteinte ; les rattachements aux sessions existantes ne sont PAS comptabilisés. Définir à `0` pour désactiver. Dimensionné pour une utilisation mono-utilisateur / petite équipe ; augmentez-la si votre déploiement dispose de la marge de RAM/FD nécessaire (~30-50 Mo par session).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-pending-prompts-per-session <n>` | `5`             | Limite par session pour les prompts acceptés par `POST /session/:id/prompt` mais pas encore traités, y compris les prompts en file d'attente et le prompt actif. Le bridge rejette le dépassement de manière synchrone avec `503`, `Retry-After: 5`, et `code: "prompt_queue_full"` avant de retourner un `promptId`. Définir à `0` pour désactiver. `branchSession` se sérialise sur la même FIFO mais n'est pas comptabilisé dans cette limite de prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()` | Chemin absolu de l'espace de travail auquel ce démon se lie (selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 — 1 démon = 1 espace de travail). Les requêtes `POST /session` avec un `cwd` non correspondant retournent `400 workspace_mismatch`. Pour les déploiements multi-espaces de travail, exécutez un `qwen serve` par espace de travail sur des ports distincts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--channel <name\|all>`                 | —               | Worker de canal géré par le démon (expérimental). Répétez le flag pour sélectionner plusieurs canaux configurés, ou passez `all` pour démarrer tous les canaux configurés. `all` ne peut pas être combiné avec des canaux nommés. Les valeurs `cwd` des canaux sélectionnés doivent correspondre à l'espace de travail du démon. Le worker appartient à `qwen serve` ; arrêtez le démon pour arrêter les canaux gérés par serve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--max-connections <n>`                 | `256`           | Limite de connexions TCP au niveau de l'écouteur (`server.maxConnections`). Limite le nombre de sockets bruts indépendamment du nombre de sessions — les clients SSE lents / fantômes sont rejetés au moment de l'acceptation une fois la limite atteinte. Augmentez cette valeur en même temps que `--max-sessions` si votre déploiement prévoit de nombreux abonnés SSE par session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--event-ring-size <n>`                 | `8000`          | Profondeur de l'anneau de relecture SSE par session (cible #3803 §02). Définit l'arriéré disponible pour `GET /session/:id/events` avec `Last-Event-ID: N`. Plus grand = plus de marge pour la reconnexion au prix de quelques centaines de Ko de RAM supplémentaire par session. Les clients SDK peuvent également demander une limite d'arriéré par abonné plus grande sur un abonnement spécifique via `?maxQueued=N` (plage `[16, 2048]`, par défaut 256). Les démons émettent également une trame SSE non terminale `slow_client_warning` à 75 % de remplissage de la file d'attente afin que les clients puissent se vider / se reconnecter avant d'être évincés. Pre-flight `caps.features.slow_client_warning`.                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-client-budget <n>`               | —               | Limite (entier positif) de clients MCP actifs **par session ACP** (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1 ; la PR 23 généralise cela par espace de travail via le pool MCP partagé). À combiner avec `--mcp-budget-mode`. Lorsque non défini, aucune application basée sur la comptabilisation (mais `GET /workspace/mcp` rapporte toujours `clientCount`). Distinct du `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code qui limite la concurrence au démarrage, et non le nombre total de clients. Pre-flight `caps.features.mcp_guardrails`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | Comment `--mcp-client-budget` est appliqué. `warn` (par défaut lorsque le budget est défini) : aucun refus, le `budgets[0].status` du snapshot passe à `warning` à ≥75 % du budget. `enforce` : les connexions au-delà de la limite sont refusées, la cellule par serveur affiche `disabledReason: 'budget'`, déterministe selon l'ordre de déclaration de `mcpServers`. `off` (par défaut lorsque le budget n'est pas défini) : observabilité pure. Le démarrage rejette `enforce` sans budget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--http-bridge`                         | `true`          | Mode Stage 1 : un processus enfant `qwen --acp` par démon (lié à un espace de travail au démarrage, selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02) ; N sessions sont multiplexées sur cet enfant via ACP `newSession()`. Le mode natif in-process de Stage 2 sera disponible ultérieurement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Liste blanche cross-origin pour les clients webui du navigateur. Répétable. Chaque valeur est `*` (n'importe quelle origin — le démarrage refuse si aucun bearer token n'est configuré ; `--require-auth` sur le loopback est recommandé pour que `/health` et `/demo` soient également protégés par le bearer token, car les deux sont pré-authentifiés sur le loopback par défaut) ou une origin URL canonique (`<scheme>://<host>[:<port>]`, sans slash de fin / chemin / userinfo / requête). **Les wildcards de sous-domaine (`https://*.example.com`) ne sont intentionnellement pas prises en charge** — listez explicitement chaque sous-domaine, ou utilisez `*` avec un token configuré (et `--require-auth` pour un durcissement complet). Les origins correspondantes reçoivent les en-têtes de réponse CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, méthodes, en-têtes, max-age, et `Retry-After` exposé) ; les origins non correspondantes obtiennent toujours un 403 avec la même enveloppe qu'aujourd'hui. `Origin: null` (iframes sandboxées, documents file://) est toujours rejeté, même sous `*`. Pre-flight via `caps.features.allow_origin`. Les hits sur l'origin du loopback lui-même ne sont pas affectés. |
| `--web` / `--no-web`                    | `true`          | Sert le SPA Web Shell construit à la racine du démon (`GET /`, `/assets/*`, et fallback de lien profond du SPA). Le shell statique est enregistré **avant** la porte d'authentification par bearer token — un navigateur ne peut pas attacher de token à une sous-ressource `<script>` ou à une navigation dans la barre d'adresse, le shell ne contient aucun secret, et chaque route de l'API reste protégée par token quoi qu'il arrive. Sur les liaisons non-loopback, un avertissement d'une ligne sur stderr indique que l'UI est accessible sans authentification. Utilisez `--no-web` pour un démon API uniquement. Aucun effet lorsque la build omet les ressources du Web Shell (le démon enregistre un breadcrumb et s'exécute en API uniquement).                                                                                                                                                                                                                                                                                         |
| `--open`                                | `false`         | Une fois l'écouteur en ligne, ouvre le Web Shell dans votre navigateur par défaut à l'URL du démon (avec `#token=` ajouté en tant que fragment d'URL lorsqu'un token est configuré — un fragment n'est jamais envoyé au serveur, ce qui garde le token hors des journaux d'accès et des en-têtes Referer). Aucune opération avec `--no-web`, ou dans les environnements headless / CI / SSH où aucun navigateur n'est disponible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
> **Dimensionnement des paramètres de charge.** `--max-sessions` est la limite **new-child**.
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
> - **backlog par abonné** : une file de 256 frames par client SSE ; un
>   client en surcapacité reçoit une frame terminale `client_evicted` et est
>   déconnecté (un consommateur lent ne peut pas bloquer le daemon).
>
> Ces limites interagissent : `--max-sessions × 64 abonnés × 256 frames`
> représente la mémoire en vol dans le pire des cas au niveau de l'EventBus, tandis que
> `--max-sessions × --max-pending-prompts-per-session` limite le travail de prompt accepté
> au niveau de la couche d'admission. Le dimensionnement par défaut suppose une charge mono-utilisateur /
> petite équipe ; augmentez progressivement (et surveillez la RSS) pour les déploiements
> multi-locataires.

> **Garde-fous du client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Un workspace déclarant 30 serveurs MCP dans `mcpServers` démarrera 30 clients sans limite amont sauf si vous en définissez une. `--mcp-client-budget=N` limite le nombre de clients MCP actifs ; `--mcp-budget-mode={enforce,warn,off}` choisit le comportement. La valeur par défaut est `warn` lorsqu'un budget est défini (le snapshot affiche l'avertissement mais aucun client n'est refusé — utile pour mesurer le fanout en conditions réelles avant d'activer le mode enforce). Les serveurs refusés en mode `enforce` reçoivent `disabledReason: 'budget'` sur leur cellule par serveur, et la cellule `budgets[0]` affiche `status: 'error'` + `errorKind: 'budget_exhausted'`. La réservation de slot se fait par nom de serveur et survit aux reconnexions / délais d'expiration de découverte — un serveur refusé ne peut pas prendre le slot d'un serveur sain.
>
> ⚠️ **Portée v1 : par session, et non par workspace.** Chaque session ACP à l'intérieur du daemon possède sa propre instance de `Config`/`McpClientManager` (créée via `newSessionConfig` par session). Le budget limite les clients MCP actifs **par session**, et non de manière agrégée sur toutes les sessions du workspace. Le snapshot sur `GET /workspace/mcp` reflète la vue de la session de bootstrap (la cellule porte `scope: 'session'` par souci d'honnêteté). Si vous exécutez 5 sessions ACP simultanées avec `--mcp-client-budget=10`, vous pouvez avoir jusqu'à 50 clients MCP actifs à travers le daemon — la limite s'applique par session. **Wave 5 PR 23 (pool MCP partagé)** introduit un manager à l'échelle du workspace et fait évoluer cela vers une véritable application par workspace.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # plus tard, après que la télémétrie a montré votre distribution en conditions réelles :
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Cela **n'est pas** équivalent au paramètre `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code (qui contrôle la concurrence au démarrage) ; ils sont orthogonaux. PR 23 ajoutera un véritable pool MCP partagé (une cellule `scope: 'workspace'` dans `budgets[]` aux côtés de la cellule par session) ; PR 14 v1 est le compteur in-process + l'application souple sur le manager par session existant.
>
> **Événements Push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Les clients SDK abonnés à `GET /session/:id/events` reçoivent des frames typées lorsque les seuils de budget sont franchis — `mcp_budget_warning` (synthétique, se déclenche une fois par franchissement ascendant de 75 % avec réarmement par hystérésis à 37,5 %, annoncé via `mcp_guardrail_events`) et `mcp_child_refused_batch` (coalescé une fois par passe de découverte en mode `enforce` ; longueur 1 pour le refus de spawn paresseux de `readResource`). Le snapshot sur `GET /workspace/mcp` reste la source de vérité pour l'état après reconnexion ; les événements sont des changements de bord. Utile pour le dashboarding en temps réel sans polling.

## Modèle de menace de déploiement par défaut

- **127.0.0.1 uniquement** — liaison loopback, aucune authentification requise.
- **`--hostname 0.0.0.0` requiert un token** — le démarrage est refusé sans token.
- **`LOOPBACK_BINDS` inclut l'IPv6** — `::1` et `[::1]` comptent comme loopback pour la règle sans token.
- **Liste d'autorisation de l'en-tête Host** — sur les liaisons **loopback**, le daemon vérifie que `Host:` correspond à `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` (insensible à la casse selon la RFC 7230 §5.4) pour se défendre contre le DNS rebinding. **Les liaisons non-loopback (`--hostname 0.0.0.0`) contournent intentionnellement la liste d'autorisation Host** — l'opérateur a choisi la surface d'exposition, la barrière du bearer-token est donc la seule couche d'authentification ; les reverse proxies / SNI / le pinning de certificats client relèvent de la responsabilité de l'opérateur, et non du daemon. Si vous avez besoin d'une isolation basée sur Host pour une liaison non-loopback, terminez le TLS + vérifiez Host au niveau d'un proxy frontal.
- **CORS refuse toute origine de navigateur par défaut** — renvoie un JSON `403`. Passez **`--allow-origin <pattern>`** (répétable, T2.4 #4514) pour autoriser des origines de navigateur spécifiques. Chaque valeur est soit le littéral `*` (toute origine — le démarrage est refusé si aucun bearer token n'est configuré ; `--require-auth` sur loopback est recommandé pour un durcissement complet puisque `/health` et `/demo` restent pré-authentifiés sur loopback par défaut) soit une origine URL canonique (`<scheme>://<host>[:<port>]`, sans slash de fin / chemin / userinfo). Les origines correspondantes reçoivent des en-têtes de réponse CORS appropriés (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, ainsi que les méthodes / en-têtes / max-age standards et `Retry-After` exposé) ; les origines non correspondantes reçoivent toujours un 403 avec la même enveloppe que le mur par défaut. `caps.features.allow_origin` est annoncé conditionnellement afin que les clients SDK / webui puissent vérifier en amont (pre-flight) si le daemon honore les requêtes cross-origin avant de les émettre. Exemple : `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Les requêtes vers l'auto-origin loopback (par ex. la page `/demo`) ne sont pas affectées — un shim de suppression d'Origin distinct les gère indépendamment de `--allow-origin`. **Les webuis de navigateur sans `--allow-origin` configuré** reviennent aux mêmes options de Stage 1 qu'auparavant : empaquetez-les en shell natif (Electron/Tauri) pour qu'aucun en-tête `Origin` ne soit envoyé, ou placez un reverse proxy de même origine devant le daemon.
- **Le processus enfant `qwen --acp` lancé hérite de l'environnement du daemon** avec un nettoyage explicite : `QWEN_SERVER_TOKEN` est supprimé avant le démarrage de l'enfant (le bearer du daemon ; l'agent n'en a pas besoin). Tout le reste — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / vos `modelProviders[].envKey` personnalisés / etc. — est transmis, car l'agent en a légitimement besoin pour s'authentifier auprès du LLM. **Ceci est intentionnel, ce n'est pas un sandbox.** L'agent s'exécute avec le même UID et a accès aux outils shell, donc tout ce qui se trouve dans `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` est accessible par injection de prompt de toute façon. La transmission de l'environnement n'est pas la limite de sécurité ; l'utilisateur en tant que racine de confiance l'est. N'exécutez pas `qwen serve` sous une identité possédant des identifiants résidant dans l'environnement que vous ne confieriez pas à l'agent.
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

## Déploiement multi-session et multi-workspace

Conformément à [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02, chaque processus `qwen serve` se lie à **un seul workspace** au démarrage. Dans ce workspace, il multiplexe N sessions sur un seul enfant `qwen --acp` via la map de sessions native de l'agent — les sessions partagent le processus de l'enfant / l'état OAuth / le cache de lecture de fichiers / l'analyse de mémoire hiérarchique.

Pour héberger **plusieurs workspaces** (un utilisateur, plusieurs repos ; ou plusieurs utilisateurs sur le même hôte), exécutez **plusieurs processus daemon** — un par workspace, chacun sur son propre port, supervisé par systemd / docker-compose / k8s / un orchestrateur de référence `qwen-coordinator`. Le compromis est intentionnel : un workspace par enfant signifie que `loadSettings(cwd)` / OAuth / la portée du serveur MCP restent alignés avec le répertoire lié et ne dérivent pas entre les requêtes.

> **Abonnez-vous AVANT de poster `modelServiceId` lors de l'attachement.** Lorsqu'un client fait un `POST /session` avec un `modelServiceId` et que le workspace a déjà une session exécutant un modèle différent, le daemon émet un appel interne `setSessionModel` — les échecs ne sont PAS propagés comme une erreur HTTP (la session reste opérationnelle sur son modèle actuel). Le signal d'échec visible est un événement `model_switch_failed` sur le flux SSE de la session. Si vous appelez `POST /session` et ouvrez `GET /session/:id/events` ENSUITE seulement, vous manquerez l'événement d'échec et continuerez silencieusement à parler au mauvais modèle. Ouvrez d'abord le flux SSE, ou passez `Last-Event-ID: 0` à l'abonnement pour rejouer l'événement le plus ancien disponible dans l'anneau.

Pour gérer plusieurs **utilisateurs** (chacun avec son propre quota, journal d'audit, sandbox) ou pour passer à l'échelle au-delà de la portée d'un seul processus (budget de cold-start, nombre de FD, RSS), lancez un daemon par workspace et par utilisateur derrière un orchestrateur externe. Cet orchestrateur (multi-locataire / OIDC / Quota / Audit / k8s) est **hors du périmètre** du projet qwen-code — consultez l'issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" pour les pointers de conception.

## Chargement et reprise d'une session persistée

Le daemon expose le flux `session/load` et resume d'ACP via HTTP au moyen de deux routes :

| Route                      | À utiliser quand                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | Le client n'a **aucun** historique rendu (reconnexion à froid, sélection puis ouverture). Le daemon rejoue chaque tour persisté via SSE afin que les abonnés voient la transcription complète. Tag de capacité : `session_load`.                                                                                        |
| `POST /session/:id/resume` | Le client a déjà les tours à l'écran et a seulement besoin de récupérer le handle côté daemon. Le contexte du modèle est restauré côté agent sans relecture de l'UI — le flux SSE reste propre. Tag de capacité : `session_resume` (`unstable_session_resume` reste un alias déprécié pour les anciens clients). |

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

Vérifiez en amont (pre-flight) `caps.features.session_load` / `caps.features.session_resume` avant d'appeler — les anciens daemons renvoient `404`. `unstable_session_resume` est toujours annoncé comme un alias de compatibilité déprécié. Les requêtes simultanées de même action pour le même id sont coalescées ; les courses d'actions croisées (un `load` en concurrence avec un `resume`) renvoient `409 restore_in_progress` avec `Retry-After: 5`. Consultez la [référence du protocole](../developers/qwen-serve-protocol.md) pour l'enveloppe d'erreur complète.

Remarque : la relecture de l'historique est limitée par l'anneau SSE (par défaut 8000 frames). Les longs historiques avec des tours verbeux peuvent dépasser cela — les premières frames sont supprimées silencieusement. Pour les sessions très longues, préférez `resume` et appuyez-vous sur l'UI persistée localement par le client.

## Modèle de durabilité

**Les sessions restent éphémères en Stage 1 lors des redémarrages du daemon**, mais les sessions persistées sur disque peuvent être rechargées :

- Le crash d'un processus enfant publie `session_died` et supprime la session active des maps du daemon. La session persistée sur disque **peut** être rechargée via `POST /session/:id/load` si un nouvel enfant agent peut être lancé.
- Un redémarrage du daemon perd toutes les sessions actives en cours. Les sessions persistées restent sur disque et peuvent être chargées sur un nouveau processus daemon, sous réserve des mêmes règles de liaison de workspace.
- Les déconnexions client prolongées (>5 min sur un tour verbeux) peuvent dépasser l'anneau de relecture SSE (par défaut 8000 frames) — la reconnexion `Last-Event-ID` réussit mais l'état peut être incohérent. Pour les clients mobiles / réseaux instables, prévoyez de rouvrir SSE lors de longues coupures ou d'appeler `POST /session/:id/load` pour rejouer depuis le disque.
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

### N sessions parallèles partagent un seul enfant `qwen --acp`

Plusieurs sessions sur le même workspace **partagent un seul processus enfant `qwen --acp`** via le support multi-session natif de l'agent (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). Le bridge appelle `connection.newSession({cwd, mcpServers})` pour chaque session — l'agent les stocke dans sa map de sessions et démultiplexe le sessionId par appel.

Coût concret pour N=5 sessions sur le même workspace :

| Ressource                             | Par session | Pour N=5                       |
| ------------------------------------ | ----------- | ---------------------------- |
| Processus Node du démon                  | un         | **30–50 Mo** (un démon)    |
| Enfant `qwen --acp`                   | partagé      | **60–100 Mo** (un enfant)    |
| Enfants serveurs MCP                  | par session | 3×N si les configs diffèrent        |
| `FileReadCache` (heap de l'enfant)      | partagé      | parsé une fois                  |
| Parse de `CLAUDE.md` / mémoire hiérarchique | partagé      | parsé une fois                  |
| État du refresh-token OAuth            | partagé      | **un seul chemin de refresh**         |
| Faits appris par l'auto-mémoire            | partagé      | une base de connaissances par enfant |
| Démarrage à froid                           | le premier uniquement  | <200 ms après la première session  |

Le bridge maintient **un canal par démon** (un démon par workspace, selon §02). Le canal reste actif tant qu'au moins une session est en vie ; le dernier `killSession` (ou un crash au niveau du canal) tue l'enfant.

Les **enfants serveurs MCP** sont encore par session aujourd'hui — la config de chaque session peut spécifier des serveurs différents, ils sont donc spawnés indépendamment. Suivi de la phase 1.5 : refcount les enfants serveurs MCP par `(workspace, config-hash)` afin que les configs identiques partagent. Hors périmètre pour cette PR.

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

`qwen serve` écrit un log de diagnostic par processus dans :

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

Un lien symbolique `latest` dans le même répertoire pointe toujours vers le log du processus actuel, donc `tail -f ~/.qwen/debug/daemon/latest` suivra n'importe quel démon en cours d'exécution.

Le log capture les messages de cycle de vie, les erreurs de route (avec le contexte `route=` et `sessionId=`), le stderr de l'enfant ACP, et — lorsque `QWEN_SERVE_DEBUG=1` est défini — des breadcrumbs supplémentaires du bridge. Les lignes qui vont au stderr aujourd'hui vont toujours au stderr ; le log fichier est **additif**, pas un remplacement.

### Désactivation

Définissez `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) pour ignorer complètement la journalisation dans un fichier. La sortie stderr n'est pas affectée.

### Relation avec les logs de debug de session

Les logs de debug par session (`~/.qwen/debug/<sessionId>.txt` et le lien symbolique `~/.qwen/debug/latest`) sont indépendants. Le log du démon se trouve dans un sous-répertoire frère `daemon/` ; la sémantique de debug par session n'est pas modifiée par cette fonctionnalité.

### Pas de rotation

Le log du démon s'agrège indéfiniment. Effectuez une rotation manuelle s'il devient trop volumineux. Une amélioration future pourrait ajouter une rotation automatique ; suivez les suivis de [#4548](https://github.com/QwenLM/qwen-code/issues/4548).

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
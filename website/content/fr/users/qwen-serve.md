# Mode démon (`qwen serve`)

Exécutez Qwen Code en tant que démon HTTP local afin que plusieurs clients (plugins IDE, interfaces web, scripts CI, CLI personnalisées) partagent une même session d'agent via HTTP + Événements envoyés par le serveur, au lieu de chacun lancer leur propre sous-processus.

> **🚧 v0.16-alpha** : `qwen serve` fait ses débuts sur npm en v0.16-alpha en tant que **chat / codage textuel uniquement** avec un **déploiement local uniquement**. Les pièces jointes (images/fichiers) sur le chemin de la requête, le déploiement conteneurisé (Docker / k8s / proxy inverse nginx) et le renforcement pour le multi-démon distant arrivent dans un correctif ultérieur lorsqu'un pilote d'entreprise sera engagé. Voir [Limites connues de la v0.16-alpha](#limites-connues-de-la-v016-alpha) pour la liste complète des fonctionnalités reportées.

> **Statut :** Stade 1 (expérimental). La surface du protocole est figée dans le tableau des routes §04 du ticket [#3803](https://github.com/QwenLM/qwen-code/issues/3803). Le stade 1.5 (option `qwen --serve` — le TUI co-héberge le même serveur HTTP) et le stade 2 (refonte en cours de processus + polish `mDNS`/OpenAPI/WebSocket/Prometheus) sont directement en aval.
>
> **Honnêteté sur le périmètre :** Le stade 1 est dimensionné pour **les développeurs qui prototypent des clients face à la surface du protocole** et pour **la collaboration locale mono-utilisateur / petite équipe**. Les charges de travail multi-client / longue durée / réseau instable de qualité production (compagnons mobiles, robots de messagerie instantanée atteignant 1000+ discussions) nécessitent les garanties du stade 1.5+ qui ne sont pas dans cette version. Voir [Garanties d'exécution du stade 1.5+](#garanties-dexécution-du-stade-15) pour la liste complète des écarts et #3803 pour la feuille de route de convergence.

## Ce qu'il vous apporte

- **Interface Web Shell intégrée** — `qwen serve` sert l'interface Web Shell basée sur le navigateur à sa racine (`http://127.0.0.1:4170/`) dès l'installation ; lancez `qwen serve --open` pour l'ouvrir automatiquement dans votre navigateur. Elle est servie sur la même origine que l'API, donc pas besoin d'un second port ou d'un proxy inverse. Passez `--no-web` pour un démon uniquement API.
- **Un processus d'agent, plusieurs clients** — sous le `sessionScope: 'single'` par défaut, chaque client se connectant au démon partage une session ACP. Collaboration inter-clients en temps réel sur la même conversation, les mêmes diffs de fichiers, les mêmes demandes d'autorisation.
- **Streaming robuste à la reconnexion** — SSE avec reconnexion `Last-Event-ID` permet à un client de se déconnecter et de reprendre exactement là où il s'était arrêté (dans la fenêtre de rejeu du tampon circulaire).
- **Autorisations du premier répondant** — lorsque l'agent demande la permission d'exécuter un outil, chaque client connecté voit la requête ; le client qui répond en premier gagne.
- **Un démon, un espace de travail** — chaque processus `qwen serve` est lié à exactement un espace de travail au démarrage (selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02). Les déploiements multi-espaces de travail exécutent un démon par espace de travail sur des ports séparés (ou derrière un orchestrateur).
- **Contrôle d'exécution à distance** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) — modifier le mode d'approbation d'une session (`POST /session/:id/approval-mode`), activer/désactiver un outil par espace de travail (`POST /workspace/tools/:name/enable`), créer un `QWEN.md` vide (`POST /workspace/init`, mécanique uniquement — n'appelle PAS le modèle ; pour un remplissage par IA, suivez avec `POST /session/:id/prompt`), redémarrer un serveur MCP spécifique avec une vérification préalable de budget (`POST /workspace/mcp/:server/restart`), ou ajouter/supprimer des serveurs MCP à l'exécution sans redémarrer le démon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Toutes ces opérations sont strictement verrouillées — configurez d'abord `--token`.
- **Récapitulatif de session** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) suivi) — récupérer un résumé en une phrase de l'état d'une session active (« où en étais-je ? ») (`POST /session/:id/recap`). Enveloppe `generateSessionRecap` du cœur comme une requête secondaire vers le modèle rapide ; ne pollue ni l'historique de chat principal ni le flux SSE. Sans verrouillage strict (même posture que `/prompt`) ; assistant SDK `client.recapSession(sessionId)`.
  - **Limite connue — amplification du coût en jetons :** la route est un point de terminaison de pur coût (chaque appel est une requête secondaire LLM, sans bénéfice d'état) et le démon n'a pas de limite de taux par route dans la v1. Sur une boucle locale sans jeton par défaut, un client local buggé ou malveillant peut l'utiliser en boucle pour brûler des jetons. Configurez `--token` (et éventuellement `--require-auth`) sur les hôtes de développement partagés avant d'exposer le démon.
  - **Sécurité des récapitulatifs simultanés :** deux appels `/recap` simultanés sur la même session exécutent deux requêtes secondaires indépendantes. `generateSessionRecap` lit un instantané de l'historique du chat via `GeminiClient.getChat().getHistory()` et le passe à un appel `BaseLlmClient.generateText` séparé (via `runSideQuery`) ; il n'ajoute ni ne modifie jamais le `GeminiChat` de la session. Sans danger pour être appelé depuis plusieurs clients sans coordination.

## Limites connues de la v0.16-alpha

La première version npm de `qwen serve` (v0.16-alpha) est volontairement restreinte — chat / codage textuel uniquement pour les développeurs exécutant le démon sur leur propre machine. La liste ci-dessous explicite la surface reportée afin que les adoptants puissent planifier en conséquence ; tout ce qui est listé est sur la feuille de route des correctifs v0.16.x ou d'une version ultérieure à court terme.

**Surface produit — textuel uniquement :**

- ✅ Requêtes et réponses textuelles (chat, codage, appels d'outils, intégration MCP)
- ❌ **Pièces jointes (images/fichiers) sur le chemin de la requête** — `MessageEmitter` ne rend actuellement que le texte ; l'écho multimodal arrive lorsqu'une cible alpha avec des besoins d'image sera engagée (#4175 chiga0 #27 élément P0)
- ❌ **Téléchargements en streaming** — même condition que pour le multimodal
**Surface de déploiement — local uniquement :**

- ✅ Loopback (`127.0.0.1`, par défaut) — aucune authentification requise, adapté aux postes de développement
- ✅ Lancement local via `systemd` / `launchd` / `nohup &` / `tmux` — voir [Modèles de lancement local](./qwen-serve-deploy-local.md)
- ✅ Apportez votre propre jeton Bearer via la variable d'environnement `QWEN_SERVER_TOKEN` ([Authentification](#authentication) pour la configuration)
- ❌ **Déploiement conteneurisé** — Docker / Compose / Kubernetes / nginx reverse-proxy avec terminaison TLS PAS dans v0.16-alpha. Reporté à v0.16.x une fois qu'un pilote entreprise est engagé (sinon dépérirait faute de validation).
- ❌ **Coordination multi-démon sur un même hôte** — `1 démon = 1 espace de travail × N sessions` est appliqué. La fédération multi-hôte, le keying de jeton par chemin d'instance et le nettoyage des jetons obsolètes sont reportés à v0.16.x.
- ❌ **Jetons de démon auto-générés** — l'alpha est BYO-token (à un `openssl rand -hex 32` près). L'infrastructure d'auto-génération + stockage de jetons est reportée à v0.16.x.

**Durcissement — minimum viable pour un utilisateur local unique :**

- ✅ Porte de sécurité au démarrage (refuse la liaison non-loopback sans jeton, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Porte d'authentification sur les routes de mutation, routage des permissions par session (PRs Wave 4)
- ✅ Garde-fous MCP + coordination des permissions multi-client (F2 / F3)
- ✅ **Délai absolu de prompt + délai d'inactivité de l'écrivain SSE** — activable via `--prompt-deadline-ms` et `--writer-idle-timeout-ms` ; annoncé via `prompt_absolute_deadline` et `writer_idle_timeout` lorsqu'activé.
- ✅ **Limitation de débit HTTP** — activable via `--rate-limit` et seuils par niveau ; annoncé via `rate_limit` lorsqu'activé.
- ⏸️ **Métriques Prometheus + harnais de test de charge** — reporté à l'instrumentation d'échelle v0.17 F4 Phase-1 lorsque 30-50 sessions actives deviennent une cible réelle.
- ⏸️ **Option CLI `--max-body-size`** — le démon applique par défaut `express.json({ limit: '10mb' })` qui couvre confortablement les prompts textuels (les fenêtres de contexte des modèles sont bien en dessous de 10 Mio de caractères). Ajustable via option dans v0.16.x.

Pour l'énumération plus détaillée de « ce que nous ne corrigerons pas dans l'étape 1 » (modèle de mutation d'état de session sur un seul hôte + N sessions parallèles partageant un enfant ACP), voir [Limites du périmètre de l'étape 1](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) ci-dessous.

## Démarrage rapide

### 1. Démarrer le démon (loopback, sans authentification)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

La liaison par défaut est `127.0.0.1:4170`. L'authentification Bearer est **désactivée** sur loopback pour que le développement local « fonctionne simplement ». Le démon se lie au répertoire de travail actuel ; utilisez `--workspace /path/to/dir` pour le remplacer.

**Ouvrir l'interface utilisateur Web Shell.** Accédez à `http://127.0.0.1:4170/` (ou démarrez le démon avec `qwen serve --open` pour le lancer automatiquement) pour le terminal navigateur complet — chat, diffs, appels d'outils et invites de permission. L'interface est servie à la racine du démon sur la même origine que l'API. Le reste de ce guide utilise du HTTP brut afin que vous puissiez scripter directement contre l'API.

### 2. Vérification de base

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

Le champ `workspaceCwd` expose l'espace de travail lié afin que les clients puissent effectuer une vérification préalable et omettre `cwd` sur `POST /session`.

Le champ `limits.maxPendingPromptsPerSession` annonce le plafond actif d'admission de prompts par session ; `null` signifie que le plafond est désactivé.

Le démon expose également des instantanés d'exécution en lecture seule pour les interfaces clients et les opérateurs : `GET /daemon/status`, `GET /workspace/mcp`, `GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`, `GET /workspace/preflight`, `GET /session/:id/context`, `GET /session/:id/supported-commands`, et `GET /session/:id/tasks`, et `GET /session/:id/lsp`.

`GET /session/:id/lsp` retourne un état LSP structuré par session. Démarrez le démon avec `--experimental-lsp` pour activer LSP dans les sessions d'agent générées ; sinon la route retourne `enabled: false` sans serveurs.

`GET /daemon/status` est l'instantané de dépannage consolidé. Le `detail=summary` par défaut lit uniquement l'état du démon en mémoire (sessions, permissions, compteurs de transport SSE/ACP, rejets de limitation de débit, mémoire du processus, limites résolues) et ne démarre pas l'enfant ACP. Utilisez `GET /daemon/status?detail=full` pour les diagnostics par session, les détails de connexion ACP, les compteurs de flux d'appareils d'authentification et les sections d'état de l'espace de travail lorsque vous investiguez activement un problème.

`GET /workspace/mcp`, `GET /workspace/skills` et `GET /workspace/providers` rapportent l'exécution ACP en direct et ne démarrent pas l'enfant ACP lorsqu'il est inactif ; un démon inactif retourne `initialized: false` avec un instantané vide. Une fois qu'une session est active, ils passent à `initialized: true` et exposent l'état réel.
`GET /workspace/env` et `GET /workspace/preflight` répondent toujours avec `initialized: true` quel que soit l'état de l'ACP. `env` ne consulte jamais l'ACP (informations du processus démon uniquement) ; `preflight` répond avec les cellules de niveau démon de `process.*` et émet des placeholders `status: 'not_started'` pour les cellules de niveau ACP lorsque l'enfant est inactif.

`GET /workspace/env` rapporte le runtime, la plateforme, le sandbox, le proxy du processus démon, ainsi que la **présence** (jamais la valeur) des variables d'environnement secrètes autorisées comme `OPENAI_API_KEY`. Les URL de proxy sont dépourvues d'identifiants et réduites à `host:port` avant d'être envoyées sur le fil. Cette route répond toujours directement depuis le processus démon et ne lance jamais d'enfant ACP.

`GET /workspace/preflight` renvoie une liste de vérifications de disponibilité. Les **cellules de niveau démon** (version de Node, point d'entrée CLI, répertoire de travail, ripgrep, git, npm) s'affichent toujours. Les **cellules de niveau ACP** (authentification, découverte MCP, compétences, fournisseurs, registre d'outils, sortie) nécessitent un enfant ACP actif — lorsque le démon est inactif, elles émettent des placeholders `status: 'not_started'` plutôt que de lancer ACP uniquement pour les remplir. Les échecs correspondent à une énumération fermée `errorKind` (`missing_binary`, `auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`, `parse_error`, `blocked_egress`) afin que les interfaces client puissent afficher une résolution structurée.

Le démon expose également des aides de fichiers d'espace de travail :

- `GET /file` lit les fichiers texte et renvoie un hachage `sha256:<hex>` en octets bruts.
- `GET /file/bytes` lit des fenêtres d'octets bruts bornées et renvoie du contenu encodé en base64.
- `POST /file/write` crée ou remplace des fichiers texte.
- `POST /file/edit` applique un remplacement textuel exact.

Les opérations d'écriture/édition sont des **routes de mutation strictes** : même en boucle locale, elles nécessitent un jeton d'accès configuré, sinon elles renvoient `token_required`. Les remplacements et les éditions nécessitent le dernier `expectedHash` de `GET /file` (ou une fenêtre complète `GET /file/bytes`). `create` n'écrase jamais. Les écritures explicites vers des chemins ignorés sont autorisées mais auditées. Les écritures binaires, la suppression/le déplacement/la création de répertoire et la création récursive de parents ne font pas partie de cette surface.

### 3. Ouvrir une session

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` peut être omis — la route utilise par défaut l'espace de travail lié au démon. Envoyer un `cwd` qui ne correspond pas à l'espace de travail lié renvoie `400 workspace_mismatch` (le démon est lié à exactement un espace de travail ; démarrez un démon séparé pour un autre espace de travail).

Un second client envoyant une demande à `/session` (avec n'importe quel `cwd` correspondant ou sans) obtient `"attached": true` — ils partagent désormais l'agent.

### 4. S'abonner au flux d'événements (dans un autre terminal d'abord)

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

La ligne `data:` est l'**enveloppe complète de l'événement** — `{id?, v, type, data, originatorClientId?}` — sérialisée en JSON sur une seule ligne. La charge utile ACP (le bloc `sessionUpdate` dans cet exemple) se trouve sous `data` à l'intérieur de cette enveloppe. Les lignes `id:` / `event:` au niveau SSE sont une commodité pour les clients EventSource ; les mêmes valeurs apparaissent à l'intérieur de l'enveloppe JSON afin que les consommateurs utilisant `fetch` brut les reçoivent également.

Ouvrez ceci **avant** d'envoyer l'invite — le tampon de rejeu SSE contient les 8000 derniers événements, donc un abonné tardif peut rattraper son retard via `Last-Event-ID`, mais pour le cas simple "surveiller une seule invite", il est plus facile de s'abonner d'abord et de laisser le flux en direct.

Le flux émet `session_update` (morceaux LLM, appels d'outils, utilisation), `permission_request` (l'outil nécessite une approbation), `permission_resolved` (quelqu'un a voté), `model_switched`, `model_switch_failed`, et les trames terminales `session_died` (l'enfant agent a planté — SSE se ferme alors) et `client_evicted` (votre file d'attente a débordé — SSE se ferme alors).

### 5. Envoyer une invite (de retour dans le terminal d'origine)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

La commande `curl -N` de l'étape 4 affichera les trames au fur et à mesure de leur arrivée.

## Authentification

Pour tout ce qui dépasse la boucle locale, vous **devez** passer un jeton d'accès :

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

Les clients envoient ensuite `Authorization: Bearer $QWEN_SERVER_TOKEN` sur chaque requête. `/health` est exempté **uniquement sur les liaisons en boucle locale** afin que les sondes de vivacité k8s/Compose à l'intérieur du pod (où le démon écoute sur `127.0.0.1`) n'aient pas besoin d'identifiants. Sur les liaisons non locales (`--hostname 0.0.0.0` etc.), `/health` nécessite le jeton comme toute autre route — sinon un attaquant pourrait sonder des adresses arbitraires pour confirmer l'existence du démon. Utilisez `/capabilities` pour vérifier que votre jeton est correct de bout en bout (il nécessite toujours une authentification) :
> **Boucle de retour renforcée (`--require-auth`).** Le comportement par défaut sans jeton sur la boucle de retour est acceptable pour un poste de travail mono-utilisateur, mais dangereux sur des serveurs de développement partagés, des exécuteurs CI ou des postes de travail multi-locataires où tout utilisateur local peut exécuter `curl 127.0.0.1:4170`. Utilisez `--require-auth` pour rendre le jeton d'authentification obligatoire sur chaque route — y compris `/health` et `/capabilities` — même lorsque lié à `127.0.0.1`. Le démarrage échoue sans jeton. Avec ce drapeau, un client **non authentifié** ne peut pas lire `/capabilities` pour découvrir que l'authentification est requise ; la surface de découverte est le corps de réponse 401 lui-même. Une fois authentifié, la balise `caps.features.require_auth` est une confirmation post-authentification indiquant que le déploiement est renforcé (utile pour les interfaces d'audit / conformité) :

```bash
qwen serve --require-auth --token "$(openssl rand -hex 32)"
# → /health, /capabilities, /session, … tous nécessitent Authorization: Bearer …
curl http://127.0.0.1:4170/health
# → 401
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
# → 13   (ou tout autre index — non nul après authentification signifie que la balise est présente)
```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Mauvais jeton → 401
```

La comparaison des jetons est en temps constant (SHA-256 + `crypto.timingSafeEqual`) ; les réponses 401 sont uniformes pour « en‑tête manquant », « schéma incorrect » et « mauvais jeton » afin qu'un canal auxiliaire ne puisse pas faire la distinction.

## Drapeaux de ligne de commande (CLI)

| Drapeau                               | Défaut          | Objectif                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                          | `4170`          | Port TCP. `0` = port éphémère attribué par le système d'exploitation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--hostname <addr>`                   | `127.0.0.1`     | Interface de liaison. Tout ce qui dépasse la boucle de retour nécessite un jeton.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--token <str>`                       | —               | Jeton d'authentification (bearer). Utilise la variable d'environnement `QWEN_SERVER_TOKEN` comme solution de repli (avec suppression des espaces en tête et en queue — pratique pour `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--require-auth`                      | `false`         | Refuse de démarrer sans jeton d'authentification, même sur la boucle de retour. Renforce la valeur par défaut `127.0.0.1` pour les développeurs sur des serveurs de développement partagés / exécuteurs CI / postes de travail multi-locataires où tout utilisateur local peut atteindre l'écouteur. Démarre uniquement avec `--token` ou `QWEN_SERVER_TOKEN` défini ; verrouille également `/health` derrière le jeton.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--max-sessions <n>`                  | `20`            | Plafond de sessions simultanées actives. Les nouvelles requêtes `POST /session` qui créeraient un nouveau processus enfant renvoient `503` (avec `Retry-After: 5`) lorsque le plafond est atteint ; l'attachement à des sessions existantes n'est PAS compté. Mettez à `0` pour désactiver. Dimensionné pour un usage mono-utilisateur ou petite équipe ; augmentez si votre déploiement dispose de suffisamment de mémoire et de descripteurs de fichiers (~30–50 Mo par session).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-pending-prompts-per-session <n>` | `5`             | Plafond par session pour les invites acceptées par `POST /session/:id/prompt` mais pas encore traitées, y compris les invites en file d'attente et l'invite active. Le pont rejette le débordement de manière synchrone avec `503`, `Retry-After: 5`, et `code: "prompt_queue_full"` avant de renvoyer un `promptId`. Mettez à `0` pour désactiver. `branchSession` se sérialise sur la même file FIFO mais n'est pas compté dans ce plafond d'invites.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--workspace <path>`                  | `process.cwd()` | Chemin absolu de l'espace de travail auquel ce démon se lie (selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 — 1 démon = 1 espace de travail). Les requêtes `POST /session` avec un `cwd` non correspondant renvoient `400 workspace_mismatch`. Pour les déploiements multi-espaces de travail, exécutez un `qwen serve` par espace de travail sur des ports distincts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--max-connections <n>`               | `256`           | Plafond de connexions TCP au niveau de l'écouteur (`server.maxConnections`). Limite le nombre brut de sockets indépendamment du nombre de sessions — les clients SSE lents / fantômes sont rejetés à l'acceptation une fois le plafond atteint. Augmentez en même temps que `--max-sessions` si votre déploiement prévoit de nombreux abonnés SSE par session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--event-ring-size <n>`               | `8000`          | Profondeur de l'anneau de rejeu SSE par session (#3803 §02 cible). Définit le tampon disponible pour `GET /session/:id/events` avec `Last-Event-ID: N`. Plus la valeur est grande, plus la marge de reconnexion est importante, au prix de quelques centaines de Ko supplémentaires par session. Les clients SDK peuvent également demander une capacité de tampon par abonné plus grande sur un abonnement spécifique via `?maxQueued=N` (intervalle `[16, 2048]`, défaut 256). Les démons émettent également une trame SSE non terminale `slow_client_warning` lorsque la file d'attente est remplie à 75 %, afin que les clients puissent vider / se reconnecter avant d'être expulsés. Pré-vol : `caps.features.slow_client_warning`.                                                                                                                                                                                                                                                                                                                                         |
| `--mcp-client-budget <n>`             | —               | Plafond entier positif du nombre de clients MCP actifs **par session ACP** (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1 ; PR 23 élève ce plafond au niveau de l'espace de travail via le pool MCP partagé). Combinez avec `--mcp-budget-mode`. Lorsqu'il n'est pas défini, aucune application basée sur le comptage (mais `GET /workspace/mcp` rapporte toujours `clientCount`). Distinct de `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code qui limite la concurrence au démarrage, et non le nombre total de clients. Pré-vol : `caps.features.mcp_guardrails`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--mcp-budget-mode <m>`               | `warn` / `off`  | Comment `--mcp-client-budget` est appliqué. `warn` (défaut lorsque le budget est défini) : pas de refus, le `budgets[0].status` de l'instantané passe à `warning` à ≥75 % du budget. `enforce` : les connexions au-delà du plafond sont refusées, chaque cellule de serveur affiche `disabledReason: 'budget'`, déterministe selon l'ordre de déclaration de `mcpServers`. `off` (défaut lorsque le budget n'est pas défini) : pure observabilité. Le démarrage rejette `enforce` sans budget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--http-bridge`                        | `true`          | Mode phase 1 : un processus enfant `qwen --acp` par démon (lié à un espace de travail au démarrage, selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02) ; N sessions multiplexées sur cet enfant via ACP `newSession()`. La phase 2 native en processus sera disponible ultérieurement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--allow-origin <motif>`              | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Liste blanche d'origines autorisées pour les clients navigateur webui. Répétable. Chaque valeur est soit `*` (toute origine — le démarrage refuse si aucun jeton d'authentification n'est configuré ; il est recommandé d'utiliser `--require-auth` sur la boucle de retour pour que `/health` et `/demo` soient également protégés par le jeton, car ces deux routes sont pré-authentifiées sur la boucle de retour par défaut), soit une origine URL canonique (`<scheme>://<host>[:<port>]`, sans barre oblique finale / chemin / userinfo / requête). **Les jokers de sous-domaine (`https://*.example.com`) ne sont intentionnellement pas pris en charge** — listez chaque sous-domaine explicitement, ou utilisez `*` avec un jeton configuré (et `--require-auth` pour un renforcement complet). Les origines correspondantes reçoivent les en-têtes de réponse CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, méthodes, en-têtes, max-age, et `Retry-After` exposé) ; les origines non correspondantes reçoivent toujours un 403 avec la même enveloppe que le blocage actuel. `Origin: null` (iframes sandboxés, documents file://) est toujours rejeté, même sous `*`. Pré-vol via `caps.features.allow_origin`. Les accès auto-origine sur la boucle de retour ne sont pas affectés. |
| `--web` / `--no-web`                    | `true`          | Servir le SPA Web Shell intégré à la racine du démon (`GET /`, `/assets/*`, et fallback pour les liens profonds du SPA). Le shell statique est enregistré **avant** la porte d'authentification — un navigateur ne peut pas attacher un jeton à une sous-ressource `<script>` ou à une navigation dans la barre d'adresse, le shell ne contient aucun secret, et chaque route API reste protégée par le jeton indépendamment. Sur les liaisons non-boucle de retour, un avertissement d'une ligne sur stderr note que l'interface est accessible sans authentification. Utilisez `--no-web` pour un démon uniquement API. Sans effet lorsque la build omet les ressources Web Shell (le démon enregistre une miette de pain et fonctionne en mode API uniquement).                                                                                                                                                                                                                                                                                                         |
| `--open`                               | `false`         | Une fois l'écouteur actif, ouvrir le Web Shell dans votre navigateur par défaut à l'URL du démon (avec `#token=` ajouté comme fragment d'URL lorsqu'un jeton est configuré — un fragment n'est jamais envoyé au serveur, ce qui évite que le jeton apparaisse dans les journaux d'accès ou les en-têtes Referer). Sans effet avec `--no-web`, ou dans les environnements sans tête / CI / SSH où aucun navigateur n'est disponible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
> **Réglage des boutons de charge.** `--max-sessions` est la limite **des nouveaux enfants**.
> Trois autres couches limitent également la charge – lorsque vous dimensionnez pour un déploiement à forte concurrence,
> ajustez-les ensemble :
>
> - **Niveau écouteur** : `--max-connections` / `server.maxConnections=256`
>   borne les connexions TCP brutes (back-pressure des clients lents).
> - **Abonnés par session** : l'EventBus limite par défaut les abonnés SSE à
>   64 par session ; le 65ème client reçoit une `stream_error` terminale
>   et est fermé.
> - **Admissions de prompts par session** :
>   `--max-pending-prompts-per-session=5` borne les prompts en file d'attente + actifs
>   acceptés pour une session. Le dépassement renvoie un `503` avec `Retry-After: 5`.
> - **File d'attente par abonné** : une file de 256 frames par client SSE ; un
>   client en dépassement reçoit une frame `client_evicted` terminale et est
>   fermé (un consommateur lent ne peut pas bloquer le démon).
>
> Ces limites interagissent : `--max-sessions × 64 abonnés × 256 frames`
> correspond au pire cas de mémoire en vol au niveau de l'EventBus, tandis que
> `--max-sessions × --max-pending-prompts-per-session` borne le travail de prompt
> accepté au niveau de l'admission. Le dimensionnement par défaut suppose une charge
> mono-utilisateur / petite équipe ; augmentez progressivement (et surveillez la RSS) pour les déploiements
> multi-locataires.

> **Garde-fous du client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Un espace de travail déclarant 30 serveurs MCP dans `mcpServers` démarrera 30 clients sans limite amont à moins d'en définir une. `--mcp-client-budget=N` plafonne le nombre de clients MCP actifs ; `--mcp-budget-mode={enforce,warn,off}` choisit le comportement. La valeur par défaut est `warn` lorsqu'un budget est défini (l'instantané affiche l'avertissement mais aucun client n'est refusé – utile pour mesurer le fanout réel avant d'activer le contrôle). Les serveurs refusés en mode `enforce` reçoivent `disabledReason: 'budget'` sur leur cellule par serveur, et la cellule `budgets[0]` affiche `status: 'error'` + `errorKind: 'budget_exhausted'`. La réservation de slot se fait par nom de serveur et survit aux reconnexions / timeouts de découverte – un serveur refusé ne peut pas prendre le slot d'un serveur sain.
>
> ⚠️ **Périmètre v1 : par session, pas par espace de travail.** Chaque session ACP au sein du démon possède son propre `Config`/`McpClientManager` (créé via `newSessionConfig` par session). Le budget plafonne les clients MCP actifs **par session**, pas agrégés sur toutes les sessions de l'espace de travail. L'instantané à `GET /workspace/mcp` reflète la vue de la session d'amorçage (la cellule porte `scope: 'session'` pour l'honnêteté). Si vous exécutez 5 sessions ACP simultanées avec `--mcp-client-budget=10`, vous pouvez avoir jusqu'à 50 clients MCP actifs dans le démon – la limite tient par session. **La Vague 5 PR 23 (pool MCP partagé)** introduit un gestionnaire à portée d'espace de travail et fait passer cela à une véritable application par espace de travail.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # plus tard, après que la télémétrie montre votre distribution réelle :
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Ceci n'est **pas** la même chose que `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code (qui contrôle la concurrence au démarrage) ; ils sont orthogonaux. La PR 23 ajoutera un véritable pool MCP partagé (une cellule `scope: 'workspace'` dans `budgets[]` à côté de la cellule par session) ; la PR 14 v1 est le compteur en processus + l'application souple sur le gestionnaire par session existant.
>
> **Événements push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Les clients SDK abonnés à `GET /session/:id/events` reçoivent des frames typées lorsque les seuils de budget sont franchis – `mcp_budget_warning` (synthétique, se déclenche une fois par franchissement ascendant de 75% avec réarmement d'hystérésis à 37,5%, annoncé via `mcp_guardrail_events`) et `mcp_child_refused_batch` (regroupé une fois par passe de découverte en mode `enforce` ; longueur 1 pour le refus de lancement paresseux de `readResource`). L'instantané à `GET /workspace/mcp` reste la source de vérité pour l'état après reconnexion ; les événements sont des bords de changement. Utile pour le tableau de bord en temps réel sans scrutation.

## Modèle de menace de déploiement par défaut

- **127.0.0.1 uniquement** — liaison loopback, aucune authentification nécessaire.
- **`--hostname 0.0.0.0` nécessite un jeton** — le démarrage refuse sans cela.
- **`LOOPBACK_BINDS` inclut IPv6** — `::1` et `[::1]` sont considérés comme loopback pour la règle sans jeton.
- **Liste blanche d'en-tête Host** — sur les liaisons **loopback**, le démon vérifie que `Host:` correspond à `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` (insensible à la casse selon RFC 7230 §5.4) pour se défendre contre le détournement DNS. **Les liaisons non-loopback (`--hostname 0.0.0.0`) contournent intentionnellement la liste blanche Host** — l'opérateur a choisi la surface d'attaque, donc la barrière du jeton porteur est la seule couche d'authentification ; les proxys inverses / SNI / l'épinglage de certificat client relèvent de la responsabilité de l'opérateur, pas du démon. Si vous avez besoin d'isolation basée sur l'hôte sur une liaison non-loopback, terminez TLS + vérifiez l'hôte au niveau d'un proxy frontal.
- **CORS refuse toute origine de navigateur par défaut** — retourne un JSON `403`. Utilisez **`--allow-origin <motif>`** (répétable, T2.4 #4514) pour autoriser des origines de navigateur spécifiques. Chaque valeur est soit le littéral `*` (toute origine — le démarrage refuse si aucun jeton porteur n'est configuré ; `--require-auth` sur loopback est recommandé pour un durcissement complet puisque `/health` et `/demo` restent pré-authentifiés sur loopback par défaut) soit une origine d'URL canonique (`<scheme>://<host>[:<port>]`, sans barre oblique finale / chemin / userinfo). Les origines correspondantes reçoivent les en-têtes de réponse CORS appropriés (`Access-Control-Allow-Origin: <écho>`, `Vary: Origin`, plus les méthodes / en-têtes / max-age standards et l'exposé `Retry-After`) ; les origines non correspondantes reçoivent toujours un 403 avec la même enveloppe que le mur par défaut. `caps.features.allow_origin` est annoncée conditionnellement pour permettre aux clients SDK / webui de vérifier au préalable si le démon honore les requêtes cross-origin avant de les émettre. Exemple : `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Les requêtes d'origine loopback (par exemple la page `/demo`) ne sont pas affectées — un shim séparé de suppression d'origine les gère indépendamment de `--allow-origin`. **Les webui de navigateur sans `--allow-origin` configuré** retombent toujours sur les mêmes options de Stade 1 qu'avant : empaqueter dans un shell natif (Electron/Tauri) pour qu'aucun en-tête `Origin` ne soit envoyé, ou placer un proxy inverse de même origine devant le démon.
- **Le processus enfant `qwen --acp` démarré hérite de l'environnement du démon** avec un nettoyage explicite : `QWEN_SERVER_TOKEN` est supprimé avant le démarrage de l'enfant (le propre jeton porteur du démon ; l'agent n'en a pas besoin). Tout le reste — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / votre `modelProviders[].envKey` personnalisé / etc. — est transmis, car l'agent en a légitimement besoin pour s'authentifier auprès du LLM. **C'est intentionnel, pas un bac à sable.** L'agent s'exécute avec le même UID et un accès aux outils shell, donc tout ce qui se trouve dans `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` est accessible par injection de prompt, indépendamment. La transmission d'env n'est pas la frontière de sécurité ; c'est l'utilisateur comme racine de confiance. N'exécutez pas `qwen serve` sous une identité qui possède des identifiants résidant dans l'environnement que vous ne confieriez pas à l'agent.
- **Files d'attente SSE bornées par abonné** — un client lent qui dépasse sa file reçoit une frame terminale `client_evicted` et est fermé ; un consommateur bloqué ne peut pas bloquer le démon.
- **Limite d'admission de prompts par session** — par défaut, 5 prompts acceptés mais non résolus par session. Un client défectueux ne peut pas mettre en file d'attente des promesses de prompts illimitées ni d'attentes SSE temporaires pour une session.
- **Arrêt gracieux** — SIGINT/SIGTERM vide les processus enfants agents avant de fermer l'écouteur (délai de 10s par enfant).
> ⚠️ **Lacune connue du stage 1 — les permissions sont globales au démon, pas par session (BUy4H).** `pendingPermissions` vit à la portée du démon ; tout client possédant le jeton d’authentification peut voter sur n’importe quel `requestId` pour n’importe quelle session qu’il peut voir (et les événements SSE `permission_request` transportent le `requestId` dans leur payload). Cela est acceptable dans le modèle de confiance mono-utilisateur / petite équipe où chaque client authentifié est le même humain ou des collaborateurs de confiance. Le stage 1.5 migrera vers `POST /session/:id/permission/:requestId` + une map pending limitée à la session + une identité par client (indispensable n°3 de la revue avale) ; en attendant, n’exécutez pas `qwen serve` derrière un bearer partagé avec des parties non fiables.

> ⚠️ **Lacune connue du stage 1 — le corps de `POST /session/:id/prompt` est limité à 10 Mo (BUy4L).** Les prompts multimodaux contenant des images / PDF / audio qui dépassent 10 Mo échoueront au moment de l’analyse du corps avant que la logique de la route ne s’exécute (pas de streaming, pas d’interruption en cours d’upload). Solution de contournement : réduire la taille du contenu côté client, ou passer une référence de chemin et laisser l’agent lire le fichier via `readTextFile`. Le stage 1.5 acceptera `multipart/form-data` ou le codage par morceaux sur `/prompt` afin que les gros prompts ne tombent pas sur un mur.

> ⚠️ **Lacune connue du stage 1 — connexions SSE fantômes derrière un NAT.** Le démon détecte les clients morts via la contre-pression TCP sur les heartbeats (intervalle de 15 s). Un client qui disparaît SANS un RST TCP (par exemple, un boîtier NAT qui abandonne silencieusement les flux inactifs) maintient la socket au niveau du noyau « vivante » jusqu’à ce que les sondes keepalive de Node expirent – typiquement ~2 heures sur les valeurs par défaut de Linux. Sur les déploiements avec `--hostname 0.0.0.0` derrière de tels NATs, des connexions SSE fantômes peuvent s’accumuler et finir par atteindre le plafond de 256 `server.maxConnections`.
>
> Définissez [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout) (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9) pour combler cette lacune avec un délai d’inactivité explicite au niveau applicatif : lorsqu’aucune écriture n’a été flushée avec succès pendant `n` ms, le démon émet une trame terminale `client_evicted` avec `reason: 'writer_idle_timeout'` et ferme le flux. Le flag est désactivé par défaut pour préserver le contrat hérité – les opérateurs sur des réseaux qui avalent les RST devraient choisir une valeur bien supérieure à l’intervalle de heartbeat de 15 s (p. ex. `60000`–`300000`) afin que les connexions inactives légitimes ne soient pas expulsées alors que les écrivains vraiment bloqués sont nettoyés rapidement. Vérifiez `caps.features.includes('writer_idle_timeout')` depuis votre SDK pour confirmer que le démon le supporte.

### Délais d’expiration et délai d’inactivité de l’écrivain

L’issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 introduit deux flags optionnels qui comblent les lacunes des sessions longues / déploiements distants que le heartbeat de 15 s + AbortSignal ne couvrent pas. Les deux sont désactivés par défaut — les workflows mono-utilisateur en boucle locale restent inchangés bit pour bit.

| Flag                           | Variable d’env                    | Défaut | Effet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`   | non défini | Délai absolu côté serveur pour un seul `POST /session/:id/prompt`. À l’expiration, le démon annule l’AbortController du prompt et renvoie un HTTP `504` avec `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`. Un champ `deadlineMs` dans le corps de la requête peut RACCOURCIR le délai effectif en dessous du flag, mais jamais l’étendre. Tag de capacité (conditionnel) : `prompt_absolute_deadline`.                                                                                                                                                                                 |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | non défini | Délai d’inactivité par connexion SSE. Lorsqu’aucune écriture n’a été flushée avec succès pendant `n` ms — ni un événement réel, ni le heartbeat de 15 s — le démon émet une trame terminale `client_evicted` avec `data.reason = 'writer_idle_timeout'` (reflété dans `data.errorKind`) et ferme le flux. **Choisissez une valeur confortablement au-dessus du heartbeat de 15 s** (p. ex. `30000`–`300000`) pour que les flux inactifs légitimes ne soient pas expulsés ; des valeurs `< 15000` expulseront des connexions inactives par ailleurs saines avant que le premier heartbeat ne se déclenche (intentionnel uniquement pour les tests / sessions de développement de courte durée). Tag de capacité (conditionnel) : `writer_idle_timeout`. |
Les deux flags acceptent un entier positif en millisecondes ; `0`, `NaN`, les valeurs non entières ou négatives sont rejetées au démarrage avec un message d'erreur clair. Le flag CLI l'emporte sur la variable d'environnement ; le champ explicite `ServeOptions` (pour les appelants intégrés) l'emporte sur l'environnement. Les consommateurs du SDK devraient vérifier au préalable la balise de capacité correspondante avant de se fier à l'un ou l'autre comportement — les daemons antérieurs à cette PR omettent les deux balises et le champ `deadlineMs` de la requête est ignoré silencieusement.

## Déploiement multi-session et multi-workspace

Conformément à [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02, chaque processus `qwen serve` se lie à **un workspace** au démarrage. Au sein de ce workspace, il multiplexe N sessions sur un seul enfant `qwen --acp` via la carte de sessions native de l'agent — les sessions partagent le processus enfant, l'état OAuth, le cache de lecture de fichiers et l'analyse de la mémoire hiérarchique.

Pour héberger **plusieurs workspaces** (un utilisateur, plusieurs dépôts ; ou plusieurs utilisateurs sur le même hôte), exécutez **plusieurs processus daemon** — un par workspace, chacun sur son propre port, supervisé par systemd / docker-compose / k8s / un orchestrateur de référence `qwen-coordinator`. Ce compromis est intentionnel : un workspace par enfant signifie que `loadSettings(cwd)` / OAuth / la portée du serveur MCP restent alignés sur le répertoire lié et ne dérivent pas entre les requêtes.

> **Abonnez-vous AVANT d'envoyer `modelServiceId` lors de l'attachement.** Lorsqu'un client envoie `POST /session` avec un `modelServiceId` et que le workspace a déjà une session exécutant un modèle différent, le daemon émet un appel interne `setSessionModel` — les échecs NE sont PAS propagés comme une erreur HTTP (la session reste opérationnelle sur son modèle actuel). Le signal d'échec visible est un événement `model_switch_failed` sur le flux SSE de la session. Si vous appelez `POST /session` et ensuite seulement ouvrez `GET /session/:id/events`, vous manquerez l'événement d'échec et continuerez silencieusement à parler au mauvais modèle. Ouvrez d'abord le flux SSE, ou passez `Last-Event-ID: 0` lors de l'abonnement pour rejouer le plus ancien événement disponible de l'anneau.

Pour gérer plusieurs **utilisateurs** (chacun avec son propre quota, journal d'audit, sandbox) ou pour passer à l'échelle au-delà des limites d'un seul processus (budget de démarrage à froid, nombre de descripteurs de fichiers, RSS), créez un daemon par workspace par utilisateur derrière un orchestrateur externe. Cet orchestrateur (multi-location / OIDC / Quota / Audit / k8s) est **hors de portée** du projet qwen-code — voir l'issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" pour les indications de conception.

## Chargement et reprise d'une session persistée

Le daemon expose le flux `session/load` et de reprise d'ACP via HTTP sur deux routes :

| Route                      | Utilisation                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /session/:id/load`   | Le client n'a **aucun** historique affiché (reconnexion à froid, sélecteur puis ouverture). Le daemon rejoue chaque tour persisté via SSE afin que les abonnés voient la transcription complète. Balise de capacité : `session_load`.                                                                                        |
| `POST /session/:id/resume` | Le client a déjà les tours à l'écran et a seulement besoin de retrouver le handle côté daemon. Le contexte du modèle est restauré côté agent sans rejouer l'interface — le flux SSE reste propre. Balise de capacité : `session_resume` (`unstable_session_resume` reste un alias déprécié pour les anciens clients). |

Le SDK TypeScript expose les deux sous forme de fabriques statiques sur `DaemonSessionClient` :

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay history through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

Vérifiez au préalable `caps.features.session_load` / `caps.features.session_resume` avant d'appeler — les daemons plus anciens retournent `404`. `unstable_session_resume` reste annoncé comme un alias de compatibilité déprécié. Les requêtes simultanées de même action pour le même identifiant sont coalescées ; les courses entre actions différentes (un `load` en concurrence avec un `resume`) reçoivent un `409 restore_in_progress` avec `Retry-After: 5`. Voir la [référence du protocole](../developers/qwen-serve-protocol.md) pour l'enveloppe d'erreur complète.

Remarque : la relecture de l'historique est limitée par l'anneau SSE (8000 trames par défaut). Les longues histoires avec des tours bavards peuvent dépasser cette limite — les trames les plus anciennes sont supprimées silencieusement. Pour les sessions très longues, préférez `resume` et fiez-vous à l'interface persistée locale du client.
## Modèle de durabilité

**Les sessions restent éphémères lors du Stage 1 après redémarrage du démon**, mais les sessions persistées sur le disque peuvent être rechargées :

- Un plantage du processus enfant publie un événement `session_died` et supprime la session active des tables du démon. La session persistée sur le disque **peut** être rechargée via `POST /session/:id/load` si un nouveau processus enfant agent peut être créé.
- Un redémarrage du démon perd toutes les sessions actives en cours. Les sessions persistées restent sur le disque et peuvent être chargées contre un nouveau processus démon, sous réserve des mêmes règles de liaison d'espace de travail.
- Les longues déconnexions des clients (>5 minutes sur un échange bavard) peuvent dépasser la zone tampon SSE (par défaut 8000 frames) — la reconnexion `Last-Event-ID` réussit mais l'état peut être incohérent. Pour les clients mobiles/réseau instables, envisagez de rouvrir SSE lors de longues coupures ou d'appeler `POST /session/:id/load` pour rejouer depuis le disque.
- Les opérations sur fichiers (`writeTextFile`) sont atomiques en cas de plantage (écriture puis renommage) ; elles ne sont pas atomiques en cas de redémarrage du démon au sens de rejeu — l'écriture du fichier a eu lieu ou non.

Si votre intégration nécessite une durabilité côté serveur au-delà des redémarrages, que `session/load` ne couvre pas (ex. files d'attente de retry gérées par le serveur), vous avez toujours besoin d'une récupération d'état au niveau application. Ne conservez pas d'état sensible aux redémarrages de longue durée à l'intérieur de la session du démon.

## Garanties d'exécution du Stage 1.5+

Le contrat du Stage 1 est dimensionné pour le prototypage. Selon [#3889 chiga0 downstream-consumer review](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644), les éléments suivants **ne sont pas** dans le Stage 1 — les intégrations de niveau production ont besoin du Stage 1.5+ avant de s'y fier :

**Blocages pour une utilisation sérieuse en aval :**

1. **`loadSession` / `unstable_resumeSession` via HTTP** — sans cela, aucune intégration ne peut survivre à un plantage d'enfant ou à un redémarrage du démon, et tout orchestrateur coordonnant le démon ne peut pas non plus récupérer l'état.
2. **Identité client persistante (jetons de paire + révocation par client)** — le Stage 1 utilise un porteur partagé ; un jeton divulgué révoque tout le monde, et `originatorClientId` est auto-déclaré par le client plutôt qu'estampillé par le démon à partir d'une identité authentifiée.

**Base de fiabilité :**

3. ~~**Chemin de battement de cœur initié par le client**~~ — livré via [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9. `POST /session/:id/heartbeat` enregistre les horodatages de dernière vue sur le démon (tag de capacité `client_heartbeat`) ; les assistants SDK sont `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **Événement `permission_already_resolved`** lorsqu'un vote perd la course du premier répondant — actuellement les interfaces utilisateur doivent déduire l'état à partir d'une `404`.
5. ~~**Zone tampon de rejeu plus grande**~~ — passée à 8000. **Zone tampon configurable par session** toujours ouverte — les workloads mobiles/échanges bavards peuvent nécessiter des surcharges par session.
6. **Événement `slow_client_warning` avant `client_evicted`** — contre-pression douce pour que les clients lents bien élevés puissent s'auto-réguler (réduire la profondeur de rendu, supprimer des morceaux) avant d'être terminés.

**Ergonomie d'intégration :**

7. **`POST /session/:id/_meta` pour contexte de type messagerie instantanée** — paires clé-valeur par session attachées aux invites suivantes (id de discussion, expéditeur, id de fil) remplace l'improvisation par canal.
8. **Négociation réelle des fonctionnalités via `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` pour que les clients puissent détecter les divergences au lieu de tomber sur "frame inconnue, ignorer".
9. **Documentation de durabilité de première classe** (cette section) — déjà livrée ci-dessus.

La feuille de route complète de convergence est suivie sur [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

## Périmètre du Stage 1 — ce que nous ne corrigerons pas dans le Stage 1.5

Deux choix structurels sont explicitement hors objectifs pour la feuille de route principale des Stages 1 / 1.5 / 2. Si votre cas d'usage dépend de l'un d'eux, prévoyez une solution plutôt que d'attendre notre intervention.

### L'état de session est uniquement en mutation locale (selon [LaZzyMan review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

Le plan du Stage 1.5 décrit l'interface utilisateur comme un abonné EventBus intra-processus. En pratique, **l'interface utilisateur est strictement plus grande que le protocole filaire** :

- **Interface utilisateur locale uniquement** — les ~15 composants Ink de dialogue (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) et les commandes slash `local-jsx` (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) rendent du JSX Ink spécifique au terminal. Les clients distants sur HTTP/SSE ne peuvent pas rendre équivalemment Ink, et ces flux n'émettent aucun événement filaire.
- **Mutations de l'état de session sans événements filaires** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (écriture de `CLAUDE.md`) modifient tous le comportement de l'agent, mais seul `/model` publie actuellement un événement (`model_switched`).

**Choix du Stage 1 — option (A) de la revue** : ne pas promouvoir ces mutations en événements filaires. Les deux modes de déploiement ont des conséquences différentes.

#### Mode 1 — `qwen serve` sans tête (cette PR)

Aucun shell d'interface utilisateur ne s'exécute à l'intérieur du démon. Les commandes slash listées ci-dessus **n'existent pas** dans ce mode — il n'y a pas d'interface utilisateur terminal pour les émettre. L'état de session est donc :
- **Gelé au démarrage** pour `approval-mode` / `memory` / `agents` / `tools` allowlist / `auth` — tout est chargé depuis les paramètres et le disque quand le processus enfant `qwen --acp` du démon démarre ; immuable pour la durée de la session. Les serveurs MCP définis dans les paramètres sont également gelés au démarrage, mais les **serveurs ajoutés à l'exécution** (via `POST /workspace/mcp/servers`) peuvent être ajoutés ou supprimés sans redémarrage.
- **Mutable via HTTP** via `POST /session/:id/model` (publie `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (publie `mcp_server_added` / `mcp_server_removed`), et les votes de permission (`POST /permission/:requestId`).

**Conséquence :** les clients distants en mode non-interactif voient **l'état complet de la session**. Aucune IHM ne cache d'état supplémentaire ; aucune dérive n'est possible. Si vous voulez changer `approval-mode`, redémarrez le démon avec de nouveaux paramètres. Les serveurs MCP peuvent désormais être ajoutés/supprimés à l'exécution via les routes de mutation (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — voir [Gestion des serveurs MCP à l'exécution](#runtime-mcp-server-management-issue-4514).

#### Mode 2 — Stade 1.5 `qwen --serve` IHM co-hébergée (pas dans cette PR)

Quand le stade 1.5 livrera `qwen --serve` (le processus IHM co-héberge le même serveur HTTP), l'IHM **existe** aux côtés des clients distants. Un opérateur local tapant `/approval-mode yolo` ou `/mcp add-server` modifie l'état de la session, et les clients distants sur HTTP n'ont aucun événement pour observer le changement.

Dans ce mode, l'IHM est un **"super-client"** — elle observe la même conversation d'agent que les clients distants, ET peut modifier l'état de la session que les clients distants ne peuvent pas modifier. L'asymétrie est :

- ✅ L'IHM et les clients distants voient les mêmes messages d'agent, appels d'outils, différences de fichiers, demandes de permission.
- ❌ Seule l'IHM voit / modifie approval-mode / memory / la liste des serveurs MCP / agents / tools allowlist / auth.

**Conséquence en Mode 2 :** si une IHM cliente distante tente de refléter les paramètres de session, elle peut dériver après toute commande de l'IHM avec une barre oblique. Les clients distants doivent **recharger l'état lors de la connection / reconnexion** (utilisez `Last-Event-ID: 0` pour rejouer le plus ancien événement de l'anneau pour des choses comme `model_switched`) ; ils ne doivent PAS compter sur des événements incrémentaux pour les mutations côté IHM.

#### Pourquoi (A) et non (B) (promouvoir les mutations en famille d'événements `session_state_changed`)

(B) est la réponse plus ambitieuse mais verrouille le stade 1.5 dans une surface filaire considérablement plus grande qui doit également passer proprement à travers la refonte prévue en cours de processus. Nous préférons avancer avec un périmètre plus restreint et honnête. Le travail de taxonomie des événements d'état de session — énumérer quels flux IHM sont conçus comme locaux uniquement vs. pourraient évoluer vers le filaire sous une future extension optionnelle de type (B) — est déplacé vers [#3803](https://github.com/QwenLM/qwen-code/issues/3803), pas dans le code du stade 1.5.

### N sessions parallèles partagent un même enfant `qwen --acp`

Plusieurs sessions sur le même espace de travail **partagent un même processus enfant `qwen --acp`** via le support multi-session natif de l'agent (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). Le pont appelle `connection.newSession({cwd, mcpServers})` pour chaque session — l'agent les stocke dans sa map de sessions et démultiplexe le sessionId par appel.

Coût concret pour N=5 sessions sur le même espace de travail :

| Ressource                           | Par session | À N=5                         |
| ----------------------------------- | ----------- | ----------------------------- |
| Processus Node du démon             | un          | **30–50 Mo** (un démon)       |
| Enfant `qwen --acp`                 | partagé     | **60–100 Mo** (un enfant)     |
| Enfants du serveur MCP              | par session | 3×N si les configurations diffèrent |
| `FileReadCache` (dans le tas enfant)| partagé     | analysé une fois              |
| Analyse de `CLAUDE.md` / mémoire hiérarchique | partagé | analysé une fois              |
| État du jeton d'actualisation OAuth | partagé     | **un seul chemin d'actualisation** |
| Faits appris par la mémoire automatique | partagé | une base de connaissances par enfant |
| Démarrage à froid                   | premier seulement | <200 ms après la première session |

Le pont garde **un canal par démon** (un démon par espace de travail, selon §02). Le canal reste actif tant qu'au moins une session est active ; le dernier `killSession` (ou un plantage au niveau du canal) tue l'enfant.

**Les enfants du serveur MCP** sont encore par session aujourd'hui — la configuration de chaque session peut spécifier des serveurs différents, donc ils sont lancés indépendamment. Suivi du stade 1.5 : compter les références des enfants du serveur MCP par `(workspace, config-hash)` afin que les configurations identiques soient partagées. Pas dans le périmètre de cette PR.

**Les agents pairs (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) font tous du multi-session en processus unique.** qwen-code les rejoint au niveau de l'agent ; le pont du stade 1 dans cette PR rend la même architecture visible via HTTP.

## Connexion à un démon distant (issue #4175 PR 21)

Quand le démon s'exécute sur un pod distant (pas d'affichage partagé avec vous), un client peut
déclencher un flux de périphérique OAuth via HTTP. Le démon interroge le fournisseur d'identité lui-même ; votre seule tâche
est d'ouvrir une URL sur l'appareil qui dispose d'un navigateur.
> [!note]
>
> Le niveau gratuit OAuth de Qwen a été abandonné le 15/04/2026. Les exemples
> `qwen-oauth` ci-dessous documentent le protocole de flux d’appareil et
> l’identifiant de fournisseur hérité ; les nouvelles configurations doivent
> utiliser un fournisseur d’authentification actuellement pris en charge.

```bash
# 1. Démarrer un flux. Le daemon contacte le fournisseur d’identité, renvoie un code + une URL.
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

# 2. Visitez l’URL sur votre téléphone / ordinateur portable, saisissez le code utilisateur.
# 3. Interrogez la terminaison (ou abonnez-vous aux SSE pour l’événement auth_device_flow_authorized) :
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → transitions de statut : pending → authorized
```

Le SDK TypeScript encapsule les deux étapes dans un seul assistant :

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Ouvrir ${flow.verificationUri}\nCode : ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**Le daemon n’ouvre jamais de navigateur à votre place.** Même en local, le daemon reste passif : il renvoie l’URL et laisse le SDK / l’utilisateur choisir où l’ouvrir. C’est intentionnel : un daemon sur un pod sans tête qui appellerait `xdg-open` échouerait silencieusement, masquant la véritable surface d’authentification. Reproduisez l’UX de `gh auth login` « Appuyez sur Entrée pour ouvrir le navigateur » dans votre client.

**`--require-auth` et commodité de développement.** Les routes du flux d’appareil utilisent la porte de mutation stricte (PR 15), ce qui signifie qu’une boucle de retour sans jeton renvoie par défaut `401 token_required`. En local, le moyen le plus simple de contourner cela pendant le développement est `qwen serve --token=dev-token` ; vous n’avez pas besoin de `--require-auth` sauf si vous durcissez la boucle de retour par défaut.

**Limitation entre démons.** `oauth_creds.json` est partagé entre démons (`~/.qwen/oauth_creds.json`), donc une connexion réussie dans le démon A est automatiquement récupérée lors du prochain renouvellement de jeton du démon B — mais les clients SDK du démon B ne recevront pas l’événement `auth_device_flow_authorized` (les événements sont propres à chaque démon).

**Prise en charge entre clients.** Deux clients SDK sur le même démon qui font tous deux `POST /workspace/auth/device-flow` pour le même fournisseur obtiennent le singleton par fournisseur : le premier appel démarre une nouvelle requête auprès du fournisseur d’identité et renvoie `attached: false` ; le deuxième appel renvoie l’entrée EXISTANTE en cours avec `attached: true`. La prise en charge est enregistrée dans la piste d’audit (sous le second `X-Qwen-Client-Id`) mais n’émet PAS d’événement séparé — les deux clients observent éventuellement le MÊME `auth_device_flow_authorized` une fois que l’utilisateur termine la page du fournisseur d’identité. Si votre interface distingue « J’ai lancé ceci » de « Le flux de quelqu’un d’autre auquel j’ai adhéré », basez-vous sur le champ `attached` renvoyé par `start()`.

## Fichier journal du démon

`qwen serve` écrit un journal de diagnostic par processus dans :

```
${QWEN_RUNTIME_DIR ou ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

Un lien symbolique `latest` dans le même répertoire pointe toujours vers le journal du processus en cours, donc `tail -f ~/.qwen/debug/daemon/latest` suivra le démon qui tourne.

Le journal capture les messages de cycle de vie, les erreurs de route (avec contexte `route=` et `sessionId=`), la sortie stderr des enfants ACP, et — quand `QWEN_SERVE_DEBUG=1` est défini — des miettes de pont supplémentaires. Les lignes qui vont aujourd’hui vers stderr continuent d’y aller ; le fichier journal est **additif**, pas un remplacement.

### Désactivation

Définissez `QWEN_DAEMON_LOG_FILE=0` (ou `false` / `off` / `no`) pour ignorer complètement la journalisation dans un fichier. La sortie stderr n’est pas affectée.

### Relation avec les journaux de débogage de session

Les journaux de débogage par session (`~/.qwen/debug/<sessionId>.txt` et le lien symbolique `~/.qwen/debug/latest`) sont indépendants. Le journal du démon se trouve dans un sous‑répertoire `daemon/` frère ; la sémantique de débogage par session est inchangée par cette fonctionnalité.

### Pas de rotation

Le journal du démon s’ajoute indéfiniment. Faites une rotation manuelle s’il devient volumineux. Une future amélioration pourrait ajouter une rotation automatique ; suivez les suites de [#4548](https://github.com/QwenLM/qwen-code/issues/4548).

## Gestion des serveurs MCP au runtime (problème [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

Ajoutez ou retirez des serveurs MCP au runtime sans redémarrer le démon. Les entrées runtime vivent dans une surcouche éphémère qui **masque** les serveurs définis par les paramètres du même nom ; le fichier `settings.json` / la configuration `mcpServers` sous-jacent n’est jamais écrit.

**Pré‑vérification :** vérifiez que `caps.features` contient `mcp_server_runtime_mutation` avant d’appeler l’une ou l’autre route. Les anciens démons sans cette balise renvoient `404`.

### `POST /workspace/mcp/servers` — ajouter un serveur MCP runtime
Accès strict (jeton porteur requis). Connecte immédiatement le serveur via le `McpClientManager` actif et découvre ses outils.

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

`name` doit être alphanumérique plus `_` et `-` (256 caractères max). `config` est le même objet de configuration du serveur MCP que celui utilisé dans les entrées `mcpServers` de `settings.json` (champs dépendants du transport : `command`/`args` pour stdio, `url` pour SSE/HTTP). Les champs sensibles pour la sécurité (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) sont supprimés par le démon et ignorés.

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

- `replaced: true` — une entrée runtime avec le même nom existait déjà et l'empreinte de configuration diffère ; l'ancienne connexion est déchirée, une nouvelle est établie. Lorsque l'empreinte correspond (ré-ajout idempotent), `replaced` est `false`.
- `shadowedSettings: true` — un serveur défini dans les paramètres avec le même nom existe ; l'entrée runtime le masque maintenant. L'entrée des paramètres reste intacte et réapparaît si l'entrée runtime est supprimée ultérieurement.
- `toolCount` — nombre d'outils découverts sur le serveur nouvellement connecté.

Réponse (200) — refus soft (mode d'avertissement budgétaire) :

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Retourné lorsque `--mcp-budget-mode=warn` et que l'ajout du serveur dépasserait le `--mcp-client-budget` configuré. Le serveur n'est PAS connecté. Les appelants doivent signaler la pression budgétaire à l'utilisateur.

Erreurs :

| Statut | Code                          | Quand                                                                                                                                 |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`         | Nom vide, dépasse 256 caractères, ou contient des caractères hors `[A-Za-z0-9_-]`                                                      |
| `400`  | `missing_required_field`      | `config` manquant ou pas un objet non nul                                                                                             |
| `400`  | `invalid_client_id`           | En-tête `X-Qwen-Client-Id` présent mais pas enregistré pour cet espace de travail                                                     |
| `400`  | `invalid_config`              | Forme de la config rejetée par le validateur de transport MCP                                                                         |
| `401`  | `token_required`              | Aucun jeton porteur configuré (accès strict)                                                                                          |
| `409`  | `mcp_budget_would_exceed`     | `--mcp-budget-mode=enforce` et le budget est plein                                                                                    |
| `502`  | `mcp_server_spawn_failed`     | Le processus serveur s'est arrêté ou a expiré pendant la connexion ; le corps contient `serverName`, `exitCode`, `stderr`             |
| `503`  | `acp_channel_unavailable`     | Aucun enfant ACP actif (aucune session n'a encore été créée)                                                                          |

### `DELETE /workspace/mcp/servers/:name` — supprimer un serveur MCP runtime

Accès strict. Déconnecte le serveur et le retire de la superposition runtime. Idempotent — le retrait d'un nom qui n'a jamais été ajouté renvoie une réponse de saut (pas une erreur).

Le paramètre de chemin `:name` est le nom du serveur encodé dans l'URL.

Réponse (200) — succès :

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowedSettings: true` — l'entrée runtime supprimée masquait un serveur défini dans les paramètres du même nom. Cette entrée de paramètres est maintenant démasquée et sera utilisée lors de la prochaine découverte/redémarrage.

Réponse (200) — saut idempotent :

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

Retourné lorsque le nom n'était pas dans la superposition runtime (il peut encore exister dans les paramètres — les entrées des paramètres ne peuvent pas être supprimées via cette route).

Erreurs :

| Statut | Code                      | Quand                                                                          |
| ------ | ------------------------- | ------------------------------------------------------------------------------ |
| `400`  | `invalid_server_name`     | Nom vide, dépasse 256 caractères, ou contient des caractères hors `[A-Za-z0-9_-]` |
| `400`  | `invalid_client_id`       | En-tête `X-Qwen-Client-Id` présent mais pas enregistré pour cet espace de travail |
| `401`  | `token_required`          | Aucun jeton porteur configuré (accès strict)                                   |
| `503`  | `acp_channel_unavailable` | Aucun enfant ACP actif                                                          |

### Sémantique de masquage

Les entrées runtime forment une superposition éphémère au-dessus des serveurs MCP définis dans les paramètres :

- **L'ajout** d'un serveur runtime avec le même nom qu'une entrée des paramètres le **masque** — la configuration runtime a priorité. L'entrée d'origine des paramètres n'est pas modifiée.
- **Le retrait** d'un serveur runtime qui masquait une entrée des paramètres le **démasque** — la configuration définie dans les paramètres redevient active à la prochaine connexion.
- **Le redémarrage du démon** perd toutes les entrées runtime. Seuls les serveurs définis dans les paramètres survivent aux redémarrages. Les serveurs runtime ont une portée limitée à la durée de la session.
- **`GET /workspace/mcp`** signale la vue fusionnée — les serveurs définis dans les paramètres et les serveurs runtime apparaissent tous dans le tableau `servers[]`. Il n'y a actuellement pas de distinction de niveau filaire entre les deux origines dans l'instantané.
### Événements

Les deux routes émettent des événements SSE **à portée de l'espace de travail** (tous les bus de session actifs les reçoivent) :

| Événement              | Déclenché lorsque                     | Champs de la charge utile                                                                         |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `mcp_server_added`   | `POST` réussit (pas ignoré)           | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | `DELETE` réussit (pas ignoré)         | `name`, `wasShadowingSettings`, `originatorClientId`                                   |

Les réponses ignorées (`budget_warning_only`, `not_present`) ne déclenchent PAS d'événements.

Les événements liés au budget provenant de la surface `mcp_guardrail_events` existante (`mcp_budget_warning`, `mcp_child_refused_batch`) se déclenchent également lorsque les ajouts au moment de l'exécution dépassent le seuil budgétaire.

## Prochaines étapes

- **Mise en place d'un démon longue durée ?** [Modèles de lancement local (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) pour v0.16-alpha (local uniquement).
- **Construire un client ?** Voir le [guide de démarrage rapide TypeScript DaemonClient](../developers/examples/daemon-client-quickstart.md) et la [référence du protocole HTTP](../developers/qwen-serve-protocol.md).
- **Lire le code source ?** Le code du pont se trouve dans `packages/cli/src/serve/` ; le client SDK dans `packages/sdk-typescript/src/daemon/`.
- **Suivre la feuille de route ?** L'avancement des étapes 1.5 / 2 est suivi dans le ticket [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

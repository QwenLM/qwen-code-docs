# Mode daemon (`qwen serve`)

Exécutez Qwen Code en tant que daemon HTTP local afin que plusieurs clients (plugins IDE, interfaces web, scripts CI, CLI personnalisées) partagent une session d'agent via HTTP + Server-Sent Events au lieu de chacun lancer leur propre sous-processus.

> **🚧 v0.16-alpha** : `qwen serve` est livré pour la première fois sur npm dans v0.16-alpha en tant que **chat/codage textuel uniquement** avec un **déploiement local uniquement**. Les pièces jointes (images/fichiers) sur le chemin de prompt, le déploiement conteneurisé (Docker / k8s / nginx reverse-proxy), et le durcissement multi-daemon distant arrivent dans un correctif ultérieur lorsqu'un pilote d'entreprise est engagé. Voir [Limites connues de la v0.16-alpha](#v016-alpha-known-limits) pour la liste complète des éléments reportés.

> **Statut :** Étape 1 (expérimentale). La surface du protocole est figée dans la table des routes §04 du ticket [#3803](https://github.com/QwenLM/qwen-code/issues/3803). L'étape 1.5 (drapeau `qwen --serve` — le TUI coexiste avec le même serveur HTTP) et l'étape 2 (refonte en process + polissage `mDNS`/OpenAPI/WebSocket/Prometheus) sont immédiatement en aval.
>
> **Honnêteté sur le périmètre :** L'étape 1 est dimensionnée pour les **développeurs qui prototypent des clients contre la surface du protocole** et pour la **collaboration locale mono-utilisateur / petite équipe**. Les charges de travail de niveau production multi-client / longue durée / réseau instable (compagnons mobiles, bots IM atteignant 1000+ conversations) nécessitent des garanties de l'étape 1.5+ qui ne sont pas dans cette version. Voir [Garanties d'exécution de l'étape 1.5+](#stage-15-runtime-guarantees) pour la liste complète des écarts et #3803 pour la feuille de route de convergence.

## Ce qu'il vous apporte

- **Interface Web Shell intégrée** — `qwen serve` sert le Web Shell basé sur le navigateur à sa racine (`http://127.0.0.1:4170/`) directement ; exécutez `qwen serve --open` pour le lancer automatiquement dans votre navigateur. Il est servi sur la même origine que l'API, donc pas besoin d'un second port ou d'un proxy inverse. Passez `--no-web` pour un daemon uniquement API.
- **Un processus d'agent, plusieurs clients** — sous le paramètre par défaut `sessionScope: 'single'`, chaque client se connectant au daemon partage une session ACP. Collaboration inter-client en direct sur la même conversation, les mêmes diffs de fichiers, les mêmes demandes d'autorisation.
- **Streaming robuste aux reconnexions** — SSE avec reconnexion `Last-Event-ID` permet à un client de se déconnecter et de reprendre exactement là où il s'était arrêté (dans la fenêtre de rejeu du ring).
- **Autorisations au premier répondant** — lorsque l'agent demande la permission d'exécuter un outil, chaque client connecté voit la demande ; le premier client qui répond gagne.
- **Un daemon, un espace de travail** — chaque processus `qwen serve` se lie à exactement un espace de travail au démarrage (selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02). Les déploiements multi-espaces de travail exécutent un daemon par espace de travail sur des ports séparés (ou derrière un orchestrateur).
- **Contrôle d'exécution à distance** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) — modifier le mode d'approbation d'une session (`POST /session/:id/approval-mode`), activer/désactiver un outil par espace de travail (`POST /workspace/tools/:name/enable`), créer un `QWEN.md` vide (`POST /workspace/init`, mécanique uniquement — n'appelle PAS le modèle ; pour le remplissage par IA, suivez avec `POST /session/:id/prompt`), redémarrer un seul serveur MCP avec une vérification budgétaire préalable (`POST /workspace/mcp/:server/restart`), ou ajouter/supprimer des serveurs MCP à l'exécution sans redémarrer le daemon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Tous strictement contrôlés — configurez `--token` d'abord.
- **Récapitulatif de session** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) suivi) — récupérez un résumé en une phrase « où en étais-je ? » d'une session active (`POST /session/:id/recap`). Enveloppe le `generateSessionRecap` du cœur comme une requête secondaire contre le modèle rapide ; ne pollue ni l'historique de chat principal ni le flux SSE. Porte non-stricte (même posture que `/prompt`) ; helper SDK `client.recapSession(sessionId)`.
  - **Limite connue — amplification du coût en tokens :** la route est un endpoint à coût pur (chaque appel est une requête secondaire LLM, sans bénéfice d'état) et le daemon n'a pas de limite de débit par route dans v1. Sur une boucle locale sans token, un client local bugué ou malveillant peut le spammer pour brûler des tokens. Configurez `--token` (et éventuellement `--require-auth`) sur les machines de développement partagées avant d'exposer le daemon.
  - **Sécurité des récapitulatifs simultanés :** deux appels `/recap` simultanés sur la même session exécutent deux requêtes secondaires indépendantes. `generateSessionRecap` lit un instantané de l'historique du chat via `GeminiClient.getChat().getHistory()` et le passe à un appel `BaseLlmClient.generateText` séparé (via `runSideQuery`) ; il ne s'ajoute jamais à la `GeminiChat` de la session et ne la mute jamais. Peut être appelé par plusieurs clients sans coordination.

## Limites connues de la v0.16-alpha

La première version npm de `qwen serve` (v0.16-alpha) est intentionnellement étroite — chat/codage textuel uniquement pour les développeurs exécutant le daemon sur leur propre machine. La liste ci-dessous rend explicite la surface reportée afin que les adoptants puissent planifier autour ; tout ce qui est ici figure sur la feuille de route des correctifs v0.16.x ou dans une version de suivi à court terme.

**Surface produit — textuel uniquement :**

- ✅ Prompts textuels et réponses textuelles (chat, codage, appels d'outils, intégration MCP)
- ❌ **Pièces jointes (images/fichiers) sur le chemin de prompt** — `MessageEmitter` ne rend actuellement que le texte ; l'écho multimodal arrivera lorsqu'une cible alpha ayant besoin d'images sera engagée (#4175 chiga0 #27 P0 item)
- ❌ **Téléchargements en streaming** — même condition que le multimodal

**Surface de déploiement — local uniquement :**

- ✅ Boucle locale (`127.0.0.1`, par défaut) — aucune authentification requise, adapté aux postes de développement
- ✅ Lancement local via `systemd` / `launchd` / `nohup &` / `tmux` — voir [Modèles de lancement local](./qwen-serve-deploy-local.md)
- ✅ Apportez votre propre jeton Bearer via la variable d'environnement `QWEN_SERVER_TOKEN` ([Authentification](#authentication) pour la configuration)
- ❌ **Déploiement conteneurisé** — Docker / Compose / Kubernetes / nginx reverse-proxy avec terminaison TLS PAS dans v0.16-alpha. Reporté à v0.16.x une fois qu'un pilote d'entreprise est engagé (pourrirait sinon faute de validation).
- ❌ **Coordination multi-daemon sur un seul hôte** — `1 daemon = 1 espace de travail × N sessions` est appliqué. La fédération inter-hôtes, le keying de token par chemin d'instance, et le nettoyage des tokens obsolètes sont reportés à v0.16.x.
- ❌ **Tokens de daemon générés automatiquement** — l'alpha est BYO-token (à un `openssl rand -hex 32` près). L'infrastructure d'auto-génération + stockage de tokens est reportée à v0.16.x.

**Durcissement — minimum viable pour un utilisateur local unique :**

- ✅ Barrière de sécurité au démarrage (refuse la liaison non-boucle locale sans token, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Porte d'authentification pour les routes de mutation, routage des autorisations par session (PR Vague 4)
- ✅ Garde-fous MCP + coordination des permissions multi-client (F2 / F3)
- ✅ **Échéance absolue du prompt + timeout d'inactivité du writer SSE** — optionnel via `--prompt-deadline-ms` et `--writer-idle-timeout-ms` ; annoncé via `prompt_absolute_deadline` et `writer_idle_timeout` lorsqu'ils sont activés.
- ✅ **Limitation de débit HTTP** — optionnel via `--rate-limit` et seuils par palier ; annoncé via `rate_limit` lorsqu'il est activé.
- ⏸️ **Métriques Prometheus + banc d'essai de charge** — reporté à l'instrumentation à l'échelle v0.17 F4 Phase-1 lorsque 30-50 sessions actives deviennent une cible réelle.
- ⏸️ **Drapeau CLI `--max-body-size`** — le daemon applique `express.json({ limit: '10mb' })` par défaut, ce qui couvre confortablement les prompts textuels (les fenêtres de contexte des modèles sont bien en dessous de 10 Mo de caractères). Ajustable via un drapeau dans v0.16.x.

Pour l'énumération plus approfondie de « ce que nous ne corrigerons pas à l'étape 1 » (modèle de mutation de l'état de session mono-hôte + N sessions parallèles partageant un seul enfant ACP), voir [Limites du périmètre de l'étape 1](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) ci-dessous.

## Démarrage rapide

### 1. Démarrer le daemon (boucle locale, sans authentification)

```bash
cd votre-projet/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/chemin/vers/votre-projet)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

La liaison par défaut est `127.0.0.1:4170`. L'authentification Bearer est **désactivée** sur la boucle locale pour que le développement local « fonctionne simplement ». Le daemon se lie au répertoire de travail actuel ; utilisez `--workspace /chemin/vers/dossier` pour le remplacer.

**Ouvrez l'interface Web Shell.** Rendez-vous sur `http://127.0.0.1:4170/` (ou démarrez le daemon avec `qwen serve --open` pour le lancer automatiquement) pour le terminal navigateur complet — chat, diffs, appels d'outils et demandes d'autorisation. L'interface est servie à la racine du daemon sur la même origine que l'API. Le reste de ce guide utilise du HTTP brut afin que vous puissiez scripter directement contre l'API.

### 2. Vérification de bon fonctionnement

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/chemin/vers/votre-projet"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

Le champ `workspaceCwd` expose l'espace de travail lié afin que les clients puissent faire une vérification préalable et omettre `cwd` sur `POST /session`.
Le champ `limits.maxPendingPromptsPerSession` annonce le plafond actif d'admission de prompts par session ; `null` signifie que le plafond est désactivé.

Le daemon expose également des instantanés d'exécution en lecture seule pour les interfaces client et les opérateurs : `GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /session/:id/status`, `GET /session/:id/context`,
`GET /session/:id/supported-commands`,
`GET /session/:id/tasks` et `GET /session/:id/lsp`.

`GET /session/:id/status` renvoie le résumé du pont en direct pour une seule session :
`sessionId`, `workspaceCwd`, `createdAt`, `displayName` optionnel, `clientCount`
et `hasActivePrompt`. Il répond `200` avec le résumé lorsque le daemon contient une session active avec cet identifiant, et `404` (corps `{ "error": …, "sessionId": … }`)
sinon. Utilisez-le pour interroger si une session connue est toujours en cours d'exécution
(`hasActivePrompt`) ou combien de clients y sont attachés (`clientCount`) sans
récupérer et analyser toute la liste paginée des sessions :

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

Il s'agit de la vue brute de session en direct, donc `clientCount` et `hasActivePrompt` correspondent
à l'entrée correspondante dans `GET /workspace/:id/sessions` — mais les deux routes
ne sont pas identiques octet par octet. L'endpoint de liste enrichit chaque élément avec les données
persistées du magasin de sessions : son `createdAt` est l'horodatage persistant du premier prompt, et il
ajoute `updatedAt` plus un `displayName` dérivé du titre stocké ou du premier
prompt. `/status` rapporte plutôt le propre `createdAt` de la session en direct, omet
`updatedAt` et renvoie `displayName` uniquement lorsqu'il est défini sur la session en direct.

`GET /session/:id/lsp` renvoie un état LSP structuré par session. Démarrez le
daemon avec `--experimental-lsp` pour activer LSP dans les sessions d'agent créées ;
sinon, la route renvoie `enabled: false` sans serveurs.

`GET /daemon/status` est l'instantané consolidé de dépannage. Le paramètre par défaut
`detail=summary` ne lit que l'état du daemon en mémoire (sessions, permissions,
compteurs SSE/ACP, rejets de limite de débit, mémoire du processus, limites résolues)
et ne démarre pas l'enfant ACP. Utilisez `GET /daemon/status?detail=full` pour
les diagnostics par session, les détails de connexion ACP, les compteurs de flux d'appareils d'authentification et les sections d'état de l'espace de travail lorsque vous enquêtez activement sur un problème.

`GET /workspace/mcp`, `GET /workspace/skills` et `GET /workspace/providers`
rapportent l'exécution ACP en direct et ne démarrent pas l'enfant ACP lorsqu'il est inactif ;
un daemon inactif renvoie `initialized: false` avec un instantané vide. Une fois qu'une
session est active, ils passent à `initialized: true` et remontent l'état
réel.

`GET /workspace/env` et `GET /workspace/preflight` répondent toujours avec
`initialized: true` quel que soit l'état ACP. `env` ne consulte jamais ACP
(informations du processus daemon uniquement) ; `preflight` répond aux cellules du niveau daemon
à partir de `process.*` et émet des espaces réservés `status: 'not_started'` pour les cellules
du niveau ACP lorsque l'enfant est inactif.

`GET /workspace/env` rapporte l'environnement d'exécution, la plateforme, le bac à sable, le proxy
et la **présence** (jamais la valeur) des variables d'environnement secrètes autorisées
telles que `OPENAI_API_KEY`. Les URL de proxy sont dépouillées des informations d'identification et réduites
à `host:port` avant d'arriver sur le fil. La route répond toujours directement depuis le processus
daemon et ne crée jamais d'enfant ACP.

`GET /workspace/preflight` renvoie une liste de vérifications de préparation. **Les cellules du niveau daemon**
(version de Node, point d'entrée CLI, répertoire de l'espace de travail, ripgrep, git, npm)
s'affichent toujours. **Les cellules du niveau ACP** (authentification, découverte MCP, compétences, fournisseurs,
registre d'outils, trafic sortant) nécessitent un enfant ACP actif — lorsque le daemon est inactif,
elles émettent des espaces réservés `status: 'not_started'` plutôt que de créer ACP juste pour
les remplir. Les échecs correspondent à une énumération `errorKind` fermée (`missing_binary`,
`auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`) afin que les interfaces client puissent afficher une
correction structurée.

Le daemon expose également des helpers de fichiers de l'espace de travail :

- `GET /file` lit les fichiers texte et renvoie un hachage `sha256:<hex>` en octets bruts.
- `GET /file/bytes` lit des fenêtres d'octets bruts limitées et renvoie le contenu en base64.
- `POST /file/write` crée ou remplace des fichiers texte.
- `POST /file/edit` applique un remplacement de texte exact.

Write/edit sont des **routes de mutation strictes** : même sur la boucle locale, elles nécessitent un
jeton Bearer configuré, sinon elles renvoient `token_required`. Les remplacements
et les éditions nécessitent le `expectedHash` le plus récent de `GET /file` (ou d'une fenêtre complète
`GET /file/bytes`). `create` n'écrase jamais. Les écritures explicites vers des chemins ignorés
sont autorisées mais auditées. Les écritures binaires, delete/move/mkdir et la création
récursive de parents ne font pas partie de cette surface.

### 3. Ouvrir une session

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` peut être omis — la route utilise par défaut l'espace de travail lié du daemon. Envoyer un `cwd` qui ne correspond pas à l'espace de travail lié renvoie `400 workspace_mismatch` (le daemon est lié à exactement un espace de travail ; démarrez un daemon séparé pour un autre).

Un second client qui envoie une requête à `/session` (avec un `cwd` correspondant ou aucun) obtient `"attached": true` — ils partagent désormais l'agent.

### 4. S'abonner au flux d'événements (dans un autre terminal d'abord)

```bash
SESSION_ID="<depuis l'étape 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

La ligne `data:` est **l'enveloppe complète de l'événement** — `{id?, v, type, data, originatorClientId?}` — sérialisée en JSON sur une seule ligne. La charge utile ACP (le bloc `sessionUpdate` dans cet exemple) se trouve sous `data` dans cette enveloppe. Les lignes `id:` / `event:` du niveau SSE sont des commodités pour les clients EventSource ; les mêmes valeurs apparaissent dans l'enveloppe JSON afin que les consommateurs utilisant `fetch` brut les aient également.

Ouvrez ce flux **avant** d'envoyer le prompt — le tampon de rejeu SSE conserve les
8000 derniers événements, donc un abonné tardif peut rattraper son retard via `Last-Event-ID`,
mais pour le cas simple « observer un seul prompt », le plus simple est de s'abonner
d'abord et de laisser le flux en direct.

Le flux émet `session_update` (morceaux LLM, appels d'outils, usage),
`permission_request` (l'outil a besoin d'approbation), `permission_resolved`
(quelqu'un a voté), `model_switched`, `model_switch_failed`, et les trames
terminales `session_died` (l'enfant agent a planté — SSE se ferme ensuite) et
`client_evicted` (votre file d'attente a débordé — SSE se ferme ensuite).

### 5. Envoyer un prompt (retour dans le terminal d'origine)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"Que fait src/main.ts ?"}]}'
# → {"stopReason":"end_turn"}
```

Le `curl -N` de l'étape 4 affichera les trames au fur et à mesure qu'elles arrivent.

## Authentification

Pour tout ce qui dépasse la boucle locale, vous **devez** passer un jeton Bearer :

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → le démarrage refuse sans QWEN_SERVER_TOKEN
```

Les clients envoient alors `Authorization: Bearer $QWEN_SERVER_TOKEN` sur chaque requête. `/health` est exempté **uniquement sur les liaisons en boucle locale** afin que les sondes de vivacité k8s/Compose à l'intérieur du pod (où le daemon écoute sur `127.0.0.1`) n'aient pas besoin d'informations d'identification. Sur les liaisons non-boucle locale (`--hostname 0.0.0.0` etc.), `/health` nécessite le token comme toutes les autres routes — sinon un attaquant peut sonder des adresses arbitraires pour confirmer l'existence du daemon. Utilisez `/capabilities` pour vérifier que votre token est correct de bout en bout (il nécessite toujours l'authentification) :

> **Boucle locale durcie (`--require-auth`).** Le comportement par défaut sans token sur boucle locale est acceptable pour un ordinateur portable mono-utilisateur mais dangereux sur des machines de développement partagées, des runners CI ou des postes de travail multi-locataires où n'importe quel utilisateur local peut faire un `curl 127.0.0.1:4170`. Passez `--require-auth` pour rendre le jeton Bearer obligatoire sur toutes les routes — y compris `/health` et `/capabilities` — même lorsqu'il est lié à `127.0.0.1`. Le démarrage échoue sans token. Avec ce drapeau activé, un client **non authentifié** ne peut pas lire `/capabilities` pour découvrir que l'authentification est requise ; la surface de découverte est le corps de la réponse 401 lui-même. Une fois authentifié, la balise `caps.features.require_auth` est une confirmation post-authentification que le déploiement est durci (utile pour les interfaces d'audit/conformité) :
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … nécessitent tous Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (ou tout autre index — non nul après authentification signifie que la balise est présente)
> ```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://votre-hote:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/chemin/vers/votre-projet"}
# Mauvais token → 401
```

La comparaison du token est en temps constant (SHA-256 + `crypto.timingSafeEqual`) ; les réponses 401 sont uniformes entre « en-tête manquant », « mauvais schéma » et « mauvais token » afin qu'un canal latéral ne puisse pas les distinguer.

## Drapeaux CLI

| Drapeau                                  | Défaut           | Objectif                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                             | `4170`           | Port TCP. `0` = port éphémère attribué par l'OS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--hostname <addr>`                      | `127.0.0.1`      | Interface de liaison. Tout ce qui dépasse la boucle locale nécessite un token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--token <str>`                          | —                | Jeton Bearer. Utilise la variable d'environnement `QWEN_SERVER_TOKEN` comme fallback (les espaces en début/fin de chaîne sont supprimés — pratique pour `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--require-auth`                         | `false`          | Refuse de démarrer sans jeton Bearer, même sur la boucle locale. Durcit la valeur par défaut du développeur `127.0.0.1` pour les machines de développement partagées / runners CI / postes de travail multi-locataires où n'importe quel utilisateur local peut atteindre l'écouteur. Démarre uniquement avec `--token` ou `QWEN_SERVER_TOKEN` défini ; protège également `/health` derrière le Bearer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--max-sessions <n>`                     | `20`             | Plafond du nombre de sessions actives simultanées. Les nouvelles requêtes `POST /session` qui créeraient un enfant frais renvoient `503` (avec `Retry-After: 5`) lorsque le plafond est atteint ; les rattachements à des sessions existantes ne sont PAS comptés. Mettez à `0` pour désactiver. Dimensionné pour une utilisation mono-utilisateur / petite équipe ; augmentez-le si votre déploiement dispose de la mémoire/des descripteurs de fichiers nécessaires (~30–50 Mo par session).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--max-pending-prompts-per-session <n>`  | `5`              | Plafond par session des prompts acceptés par `POST /session/:id/prompt` mais pas encore terminés, y compris les prompts en file d'attente et le prompt actif. Le pont rejette le dépassement de manière synchrone avec `503`, `Retry-After: 5` et `code: "prompt_queue_full"` avant de retourner un `promptId`. Mettez à `0` pour désactiver. `branchSession` se sérialise sur le même FIFO mais n'est pas compté dans ce plafond de prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <chemin>`                    | `process.cwd()`  | Chemin absolu de l'espace de travail auquel ce daemon se lie (selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 — 1 daemon = 1 espace de travail). Les requêtes `POST /session` avec un `cwd` non correspondant renvoient `400 workspace_mismatch`. Pour les déploiements multi-espaces de travail, exécutez un `qwen serve` par espace de travail sur des ports séparés.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--max-connections <n>`                  | `256`            | Plafond de connexions TCP au niveau de l'écouteur (`server.maxConnections`). Limite le nombre brut de sockets quel que soit le nombre de sessions — les clients SSE lents / fantômes sont rejetés au moment de l'acceptation une fois le plafond atteint. Augmentez-le avec `--max-sessions` si votre déploiement attend de nombreux abonnés SSE par session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--event-ring-size <n>`                  | `8000`           | Profondeur du ring de rejeu SSE par session (cible #3803 §02). Définit le backlog disponible pour `GET /session/:id/events` avec `Last-Event-ID: N`. Plus grand = plus de marge de reconnexion au prix de quelques centaines de Ko de RAM supplémentaires par session. Les clients SDK peuvent également demander un plafond de backlog plus grand par abonnement via `?maxQueued=N` (plage `[16, 2048]`, défaut 256). Les daemons émettent également une trame SSE non terminale `slow_client_warning` à 75 % de remplissage de la file d'attente afin que les clients puissent vider/se reconnecter avant d'être expulsés. Pré-vol via `caps.features.slow_client_warning`.                                                                                                                                                                                                                                                                     |
| `--mcp-client-budget <n>`                | —                | Plafond entier positif du nombre de clients MCP actifs **par session ACP** (ticket [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1 ; PR 23 élève ce plafond à l'échelle de l'espace de travail via le pool MCP partagé). Combinez avec `--mcp-budget-mode`. Lorsqu'il n'est pas défini, pas d'application basée sur la comptabilité (mais `GET /workspace/mcp` rapporte toujours `clientCount`). Distinct de `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code qui contrôle la concurrence au démarrage, pas le nombre total de clients. Pré-vol via `caps.features.mcp_guardrails`.                                                                                                                                                                                                                                                                                                                                         |
| `--mcp-budget-mode <m>`                  | `warn` / `off`   | Comment `--mcp-client-budget` est appliqué. `warn` (défaut lorsque le budget est défini) : pas de refus, le `status` de `budgets[0]` passe à `warning` à ≥75 % du budget. `enforce` : les connexions dépassant le plafond sont refusées, la cellule du serveur montre `disabledReason: 'budget'`, déterministe par ordre de déclaration `mcpServers`. `off` (défaut lorsque le budget n'est pas défini) : pure observabilité. Le démarrage rejette `enforce` sans budget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--http-bridge`                          | `true`           | Mode Étape 1 : un enfant `qwen --acp` par daemon (lié à un espace de travail au démarrage, selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02) ; N sessions se multiplexent sur cet enfant via ACP `newSession()`. Le mode natif en process de l'étape 2 sera disponible plus tard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--allow-origin <pat>`                   | —                | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Liste d'autorisation d'origines croisées pour les clients webui navigateur. Répétable. Chaque valeur est `*` (n'importe quelle origine — le démarrage refuse si aucun jeton Bearer n'est configuré ; `--require-auth` sur boucle locale est recommandé pour que `/health` et `/demo` soient également protégés par Bearer, car les deux sont pré-authentification sur boucle locale par défaut) ou une origine d'URL canonique (`<scheme>://<host>[:<port>]`, sans slash final / chemin / userinfo / query). **Les wildcards de sous-domaine (`https://*.example.com`) ne sont intentionnellement pas supportés** — listez chaque sous-domaine explicitement, ou utilisez `*` avec un token configuré (et `--require-auth` pour un durcissement complet). Les origines correspondantes reçoivent des en-têtes de réponse CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, méthodes, en-têtes, max-age, et `Retry-After` exposé) ; les origines non correspondantes reçoivent toujours un 403 avec la même enveloppe que le mur actuel. `Origin: null` (iframes sandboxés, docs file://) est toujours rejeté, même sous `*`. Pré-vol via `caps.features.allow_origin`. Les requêtes d'auto-origine en boucle locale ne sont pas affectées. |
| `--web` / `--no-web`                     | `true`           | Servir l'application Web Shell intégrée à la racine du daemon (`GET /`, `/assets/*` et fallback deep-link SPA). Le shell statique est enregistré **avant** la porte d'authentification Bearer — un navigateur ne peut pas attacher un token à une sous-ressource `<script>` ou à une navigation dans la barre d'adresse, le shell ne transporte aucun secret, et toutes les routes API restent protégées par token quoi qu'il arrive. Sur les liaisons non-boucle locale, un avertissement stderr d'une ligne indique que l'interface est accessible sans authentification. Utilisez `--no-web` pour un daemon uniquement API. Sans effet lorsque la build omet les ressources Web Shell (le daemon enregistre un miette de pain et fonctionne en mode API uniquement).                                                                                                                                                                                 |
| `--open`                                 | `false`          | Une fois l'écouteur démarré, ouvrir le Web Shell dans le navigateur par défaut à l'URL du daemon (avec `#token=` ajouté comme fragment d'URL lorsqu'un token est configuré — un fragment n'est jamais envoyé au serveur, ce qui garde le token hors des journaux d'accès et des en-têtes Referer). Sans effet avec `--no-web`, ou dans les environnements headless / CI / SSH où aucun navigateur n'est disponible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
> **Calibrage des limites de charge.** `--max-sessions` est le plafond **new-child**.
> Trois autres couches limitent également la charge — pour dimensionner un déploiement
> à haute concurrence, réglez-les ensemble :
>
> - **niveau listener** : `--max-connections` / `server.maxConnections=256`
>   limite les connexions TCP brutes (back-pressure des clients lents).
> - **abonnés par session** : l'EventBus plafonne les abonnés SSE à
>   64 par session par défaut ; le 65e client reçoit une
>   `stream_error` terminale et est fermé.
> - **admissions de prompts par session** :
>   `--max-pending-prompts-per-session=5` limite les prompts en file d'attente + actifs
>   acceptés pour une session. Le dépassement renvoie un `503` avec `Retry-After: 5`.
> - **backlog par abonné** : une file de 256 trames par client SSE ; un
>   client en surcapacité reçoit une trame `client_evicted` terminale et est
>   fermé (un seul consommateur lent ne peut pas bloquer le daemon).
>
> Ces plafonds interagissent : `--max-sessions × 64 abonnés × 256 trames`
> est la mémoire en vol maximale au niveau de l'EventBus, tandis que
> `--max-sessions × --max-pending-prompts-per-session` limite le travail
> de prompt accepté au niveau de l'admission. Le dimensionnement par défaut suppose
> une charge d'utilisateur unique / petite équipe ; augmentez progressivement (et surveillez
> le RSS) pour les déploiements multi-locataires.

> **Garde-fous du client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Un espace de travail déclarant 30 serveurs MCP dans `mcpServers` démarrera 30 clients sans plafond amont, sauf si vous en définissez un. `--mcp-client-budget=N` plafonne le nombre de clients MCP actifs ; `--mcp-budget-mode={enforce,warn,off}` choisit le comportement. La valeur par défaut est `warn` lorsqu'un budget est défini (l'instantané indique l'avertissement mais aucun client n'est refusé — utile pour mesurer le fanout réel avant d'activer `enforce`). Les serveurs refusés en mode `enforce` reçoivent `disabledReason: 'budget'` sur leur cellule par serveur, et la cellule `budgets[0]` affiche `status: 'error'` + `errorKind: 'budget_exhausted'`. La réservation d'emplacement se fait par nom de serveur et survit aux reconnexions / timeouts de découverte — un serveur refusé ne peut pas prendre la place d'un serveur sain.
>
> ⚠️ **Périmètre v1 : par session, pas par espace de travail.** Chaque session ACP dans le daemon a son propre `Config`/`McpClientManager` (créé via `newSessionConfig` par session). Le budget limite les clients MCP actifs **par session**, pas agrégés dans toutes les sessions de l'espace de travail. L'instantané à `GET /workspace/mcp` reflète la vue de la session d'amorçage (la cellule porte `scope: 'session'` par honnêteté). Si vous exécutez 5 sessions ACP concurrentes avec `--mcp-client-budget=10`, vous pouvez avoir jusqu'à 50 clients MCP actifs dans le daemon — le plafond tient par session. **Wave 5 PR 23 (pool MCP partagé)** introduit un gestionnaire à portée d'espace de travail et fait passer cela à une véritable application par espace de travail.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # plus tard, après que la télémétrie montre votre distribution réelle :
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Ce n'est **pas** la même chose que `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code (qui limite la concurrence au démarrage) ; ils sont orthogonaux. PR 23 ajoutera un vrai pool MCP partagé (une cellule `scope: 'workspace'` dans `budgets[]` à côté de la cellule par session) ; PR 14 v1 est le compteur en processus + l'application souple sur le gestionnaire par session existant.
>
> **Événements push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Les clients SDK abonnés à `GET /session/:id/events` reçoivent des trames typées lorsque les seuils de budget sont franchis — `mcp_budget_warning` (synthétique, se déclenche une fois par dépassement ascendant de 75 % avec réarmement hystérésis à 37,5 %, annoncé via `mcp_guardrail_events`) et `mcp_child_refused_batch` (fusionné une fois par passe de découverte en mode `enforce` ; longueur 1 pour un refus de spawn paresseux depuis `readResource`). L'instantané à `GET /workspace/mcp` reste la source de vérité pour l'état après reconnexion ; les événements sont des bords de changement. Utile pour la visualisation en temps réel sans interrogation périodique.

## Modèle de menace par défaut du déploiement

- **127.0.0.1 uniquement** — liaison loopback, pas d'authentification nécessaire.
- **`--hostname 0.0.0.0` nécessite un jeton** — le démarrage refuse sans un.
- **`LOOPBACK_BINDS` inclut IPv6** — `::1` et `[::1]` comptent comme loopback pour la règle sans jeton.
- **Liste d'autorisation d'en-tête Host** — sur les liaisons **loopback**, le daemon vérifie que `Host:` correspond à `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` (insensible à la casse selon la RFC 7230 §5.4) pour se défendre contre le détournement DNS. **Les liaisons non-loopback (`--hostname 0.0.0.0`) contournent intentionnellement la liste d'autorisation Host** — l'opérateur a choisi la surface d'attaque, donc la porte du jeton porteur est la seule couche d'authentification ; les proxies reverse / SNI / l'ancrage de certificat client relèvent de la responsabilité de l'opérateur, pas du daemon. Si vous avez besoin d'isolation basée sur Host sur une liaison non-loopback, terminez TLS + vérifiez Host au niveau d'un proxy frontal.
- **CORS refuse toute origine de navigateur par défaut** — renvoie un JSON `403`. Passez **`--allow-origin <pattern>`** (répétable, T2.4 #4514) pour autoriser des origines de navigateur spécifiques. Chaque valeur est soit le littéral `*` (toute origine — le démarrage refuse si aucun jeton porteur n'est configuré ; `--require-auth` sur loopback est recommandé pour un durcissement complet car `/health` et `/demo` restent pré-authentifiés sur loopback par défaut) soit une origine d'URL canonique (`<scheme>://<host>[:<port>]`, sans barre oblique finale / chemin / userinfo). Les origines autorisées reçoivent les en-têtes de réponse CORS appropriés (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, plus les méthodes / en-têtes / max-age standards et l'exposé `Retry-After`) ; les origines non autorisées reçoivent toujours un 403 avec la même enveloppe que le mur par défaut. `caps.features.allow_origin` est annoncé conditionnellement pour que les clients SDK / webui puissent pré-vérifier si le daemon honore les hits cross-origin avant de les émettre. Exemple : `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Les hits d'auto-origine loopback (ex. la page `/demo`) ne sont pas affectés — un shim séparé de suppression d'Origin les gère indépendamment de `--allow-origin`. **Les webuis de navigateur sans `--allow-origin` configuré** retombent sur les mêmes options Stage 1 qu'avant : empaqueter comme une application native (Electron/Tauri) pour ne pas envoyer d'en-tête `Origin`, ou placer le daemon derrière un proxy reverse de même origine.
- **Le processus enfant `qwen --acp` hérite de l'environnement du daemon** avec un seul nettoyage explicite : `QWEN_SERVER_TOKEN` est supprimé avant le démarrage de l'enfant (le jeton porteur du daemon lui-même ; l'agent n'en a pas besoin). Tout le reste — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / votre `modelProviders[].envKey` personnalisé / etc. — est transmis, car l'agent en a légitimement besoin pour s'authentifier auprès du LLM. **C'est intentionnel, pas un bac à sable.** L'agent s'exécute avec le même UID avec un accès shell-out, donc tout ce qui se trouve dans `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` est accessible par injection de prompt quoi qu'il arrive. La passation d'environnement n'est pas la frontière de sécurité ; c'est l'utilisateur comme racine de confiance qui l'est. N'exécutez pas `qwen serve` sous une identité qui a des identifiants résidents dans l'environnement que vous ne confieriez pas à l'agent.
- **Files SSE limitées par abonné** — un client lent qui dépasse sa file reçoit une trame terminale `client_evicted` et est fermé ; un consommateur bloqué ne peut pas bloquer le daemon.
- **Limite d'admission de prompts par session** — par défaut 5 prompts acceptés mais non réglés par session. Un client défectueux ne peut pas mettre en file d'attente des promesses de prompts illimitées ou des attentes SSE temporaires pour une session.
- **Arrêt gracieux** — SIGINT/SIGTERM vide les enfants agents avant de fermer le listener (délai de 10 s par enfant).

> ⚠️ **Lacune connue Stage 1 — les autorisations sont globales au daemon, pas par session (BUy4H).** `pendingPermissions` vit au niveau du daemon ; tout client détenant le jeton porteur peut voter sur n'importe quel `requestId` pour n'importe quelle session qu'il peut voir (et les événements SSE `permission_request` portent le requestId dans leur charge utile). C'est acceptable sous le modèle de confiance mono-utilisateur / petite équipe où chaque client authentifié est le même humain ou des collaborateurs de confiance. Stage 1.5 passera à `POST /session/:id/permission/:requestId` + une carte des en attente par session + une identité par client (must-have #3 de la revue en aval) ; d'ici là, n'exécutez pas `qwen serve` derrière un jeton partagé avec des parties non fiables.
>
> ⚠️ **Lacune connue Stage 1 — corps de `POST /session/:id/prompt` limité à 10 Mo (BUy4L).** Les prompts multimodaux contenant des images/PDF/audio qui dépassent 10 Mo échoueront au moment du parsing du corps avant l'exécution de la logique de route (pas de streaming, pas d'abandon de téléchargement en cours). Solution de contournement : réduire la taille du contenu côté client, ou passer une référence de chemin et laisser l'agent lire le fichier via `readTextFile`. Stage 1.5 acceptera `multipart/form-data` ou le codage par morceaux sur `/prompt` pour que les gros prompts ne rencontrent pas de mur.
>
> ⚠️ **Lacune connue Stage 1 — connexions SSE fantômes derrière NAT.** Le
> daemon détecte les clients morts via la back-pressure TCP sur les
> heartbeats (intervalle de 15 s). Un client qui disparaît SANS RST TCP
> (ex. une box NAT qui abandonne silencieusement les flux inactifs)
> maintient la socket au niveau du noyau "vivante" jusqu'à ce que les
> sondes keepalive de Node expirent — typiquement ~2 heures sur les
> paramètres Linux par défaut. Sur les déploiements `--hostname 0.0.0.0`
> derrière de tels NATs, les connexions SSE fantômes peuvent s'accumuler
> et finir par atteindre le plafond de 256 `server.maxConnections`.
>
> Définissez [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)
> (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9)
> pour combler la lacune avec un délai d'inactivité explicite au niveau
> application : quand aucune écriture n'a été vidée avec succès pendant
> `n` ms, le daemon émet une trame terminale `client_evicted` avec
> `reason: 'writer_idle_timeout'` et ferme le flux. Le flag est
> désactivé par défaut pour préserver le contrat hérité — les opérateurs
> sur des réseaux qui avalent les RST devraient choisir une valeur
> bien au-dessus de l'intervalle de heartbeat de 15 s (ex. `60000`–`300000`)
> pour que les connexions inactives légitimes ne soient pas expulsées
> tandis que les rédacteurs vraiment bloqués sont récupérés rapidement.
> Pré-vérifiez `caps.features.includes('writer_idle_timeout')`
> depuis votre SDK pour confirmer que le daemon le supporte.

### Délais d'expiration et timeout d'inactivité du rédacteur

L'issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 livre deux flags optionnels qui comblent les lacunes des déploiements longue durée / à distance que le heartbeat de 15 s + AbortSignal ne couvrent pas. Les deux sont désactivés par défaut — les workflows loopback mono-utilisateur restent inchangés bit par bit.

| Flag                           | Var d'env                             | Défaut | Ce qu'il fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | non défini   | Limite temporelle côté serveur pour un seul `POST /session/:id/prompt`. À l'expiration, le daemon annule l'AbortController du prompt et renvoie un HTTP `504` avec `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`. Un champ `deadlineMs` dans le corps de la requête par prompt peut RACCOURCIR le délai effectif en dessous du flag mais jamais le prolonger. Balise de capacité (conditionnelle) : `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | non défini   | Délai d'inactivité par connexion SSE. Quand aucune écriture n'a été vidée AVEC SUCCÈS pendant `n` ms — ni un événement réel ni le heartbeat de 15 s — le daemon émet une trame terminale `client_evicted` avec `data.reason = 'writer_idle_timeout'` (reflété dans `data.errorKind`) et ferme le flux. **Choisissez une valeur confortablement au-dessus du heartbeat de 15 s** (ex. `30000`–`300000`) pour que les flux inactifs légitimes ne soient pas expulsés ; des valeurs `< 15000` expulseront des connexions inactives par ailleurs saines avant que le premier heartbeat ne se déclenche (intentionnel uniquement pour les tests / sessions de développement courtes). Balise de capacité (conditionnelle) : `writer_idle_timeout`. |

Les deux flags acceptent un entier positif en millisecondes ; `0`, `NaN`, les non-entiers ou les valeurs négatives sont rejetés au démarrage avec un message d'erreur clair. Le flag CLI prime sur la var d'env ; le champ explicite `ServeOptions` (appelants intégrés) prime sur la var d'env. Les consommateurs SDK devraient pré-vérifier la balise de capacité correspondante avant de se fier à l'un ou l'autre comportement — les daemons antérieurs à cette PR omettent les deux balises et le champ `deadlineMs` de la requête est silencieusement ignoré.

## Déploiement multi-session et multi-espace de travail

Selon [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02, chaque processus `qwen serve` se lie à **un espace de travail** au démarrage. Au sein de cet espace de travail, il multiplexe N sessions sur un seul enfant `qwen --acp` via la carte de sessions native de l'agent — les sessions partagent le processus de l'enfant / l'état OAuth / le cache de lecture de fichiers / l'analyse de la mémoire de hiérarchie.

Pour héberger **plusieurs espaces de travail** (un utilisateur, plusieurs dépôts ; ou plusieurs utilisateurs sur la même machine), exécutez **plusieurs processus daemon** — un par espace de travail, chacun sur son propre port, supervisés par systemd / docker-compose / k8s / un orchestrateur de référence `qwen-coordinator`. Le compromis est intentionnel : un espace de travail par enfant signifie que `loadSettings(cwd)` / OAuth / la portée du serveur MCP restent alignés sur le répertoire lié et ne dérivent pas entre les requêtes.

> **Abonnez-vous AVANT d'envoyer `modelServiceId` lors de l'attachement.** Lorsqu'un client fait `POST /session` avec un `modelServiceId` et que l'espace de travail a déjà une session exécutant un modèle différent, le daemon émet un appel interne `setSessionModel` — les échecs NE sont PAS propagés comme une erreur HTTP (la session reste opérationnelle sur son modèle actuel). Le signal d'échec visible est un événement `model_switch_failed` sur le flux SSE de la session. Si vous appelez `POST /session` et ensuite SEULEMENT ouvrez `GET /session/:id/events`, vous manquerez l'événement d'échec et continuerez silencieusement à parler au mauvais modèle. Ouvrez d'abord le flux SSE, ou passez `Last-Event-ID: 0` à l'abonnement pour rejouer le plus ancien événement disponible de l'anneau.

Pour gérer plusieurs **utilisateurs** (chacun avec son propre quota, journal d'audit, bac à sable) ou pour passer à l'échelle au-delà d'un seul processus (budget de démarrage à froid, nombre de descripteurs de fichiers, RSS), générez un daemon par espace de travail par utilisateur derrière un orchestrateur externe. Cet orchestrateur (multi-location / OIDC / Quota / Audit / k8s) est **hors du périmètre** du projet qwen-code — voir l'issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" pour les pointeurs de conception.

## Chargement et reprise d'une session persistée

Le daemon expose le flux `session/load` et de reprise d'ACP via HTTP sur deux routes :

| Route                      | Quand l'utiliser                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | Le client n'a **aucun** historique rendu (reconnexion à froid, sélecteur puis ouverture). Le daemon rejoue chaque tour persistant via SSE pour que les abonnés voient l'intégralité du transcript. Balise de capacité : `session_load`.                                                                                        |
| `POST /session/:id/resume` | Le client a déjà les tours à l'écran et a seulement besoin de retrouver le handle côté daemon. Le contexte du modèle est restauré côté agent sans relecture de l'UI — le flux SSE reste propre. Balise de capacité : `session_resume` (`unstable_session_resume` reste un alias déprécié pour les clients plus anciens). |

Le SDK TypeScript expose les deux comme des fabriques statiques sur `DaemonSessionClient` :

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Reconnexion à froid — le daemon rejouera l'historique via SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Ou, si votre UI a déjà l'historique, sautez la relecture :
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // D'abord les trames `session_update` rejouées (load uniquement),
  // puis les événements en direct.
}
```

Pré-vérifiez `caps.features.session_load` / `caps.features.session_resume` avant d'appeler — les daemons plus anciens renverront `404`. `unstable_session_resume` est toujours annoncé comme un alias de compatibilité déprécié. Les requêtes simultanées de même action pour le même identifiant se fusionnent ; les courses d'actions croisées (un `load` en concurrence avec un `resume`) reçoivent un `409 restore_in_progress` avec `Retry-After: 5`. Voir la [référence du protocole](../developers/qwen-serve-protocol.md) pour l'enveloppe d'erreur complète.

Remarque : la relecture de l'historique est limitée par l'anneau SSE (8000 trames par défaut). Les longs historiques avec des tours bavards peuvent dépasser cela — les trames les plus anciennes sont supprimées silencieusement. Pour les très longues sessions, préférez `resume` et fiez-vous à l'UI persistée locale du client.

## Modèle de durabilité

**Les sessions sont encore éphémères dans Stage 1 lors des redémarrages du daemon**, mais les sessions persistées sur disque peuvent être rechargées :

- Un crash d'un processus enfant publie `session_died` et supprime la session active des cartes du daemon. La session persistée sur disque **peut** être rechargée via `POST /session/:id/load` si un nouvel enfant agent peut être généré.
- Un redémarrage du daemon perd toutes les sessions actives en vol. Les sessions persistées restent sur disque et peuvent être chargées contre un nouveau processus daemon, sous réserve des mêmes règles de liaison d'espace de travail.
- Les déconnexions longues du client (>5 min sur un tour bavard) peuvent dépasser l'anneau de relecture SSE (8000 trames par défaut) — la reconnexion `Last-Event-ID` réussit mais l'état peut être incohérent. Pour les clients mobiles / réseaux instables, prévoyez de rouvrir le SSE sur les longues coupures ou appelez `POST /session/:id/load` pour rejouer depuis le disque.
- Les opérations sur fichiers (`writeTextFile`) sont atomiques face aux crashs (écrire puis renommer) ; elles ne sont pas atomiques face aux redémarrages du daemon dans le sens d'une relecture — l'écriture du fichier a soit abouti, soit elle n'a pas abouti.

Si votre intégration a besoin d'une durabilité côté serveur au-delà des redémarrages que ne couvre pas `session/load` (ex. files de relance gérées par le serveur), vous avez toujours besoin d'une récupération d'état au niveau application. Ne conservez pas d'état sensible aux redémarrages et de longue durée à l'intérieur de la session du daemon.

## Garanties d'exécution Stage 1.5+

Le contrat de Stage 1 est dimensionné pour du prototypage. Selon [#3889 chiga0 downstream-consumer review](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644), ce qui suit n'est **pas** dans Stage 1 — les intégrations de niveau production ont besoin de Stage 1.5+ avant de pouvoir compter dessus :
**Blocages pour une utilisation sérieuse en aval :**

1. **`loadSession` / `unstable_resumeSession` via HTTP** — sans cela, aucune intégration ne peut survivre à un crash de l’enfant ou à un redémarrage du démon, et aucun orchestrateur coordonnant le démon ne peut non plus récupérer l’état.
2. **Identité client persistante (jetons de paire + révocation par client)** — l’étape 1 utilise un seul bearer partagé ; un jeton divulgué révoque tout le monde, et `originatorClientId` est auto-déclaré par le client plutôt que tamponné par le démon à partir d’une identité authentifiée.

**Base fiable :**

3. ~~**Chemin de battement de cœur initié par le client**~~ — livré via [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9. `POST /session/:id/heartbeat` enregistre les horodatages de dernière activité sur le démon (balise de capacité `client_heartbeat`) ; les helpers SDK sont `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **Événement `permission_already_resolved`** lorsqu’un vote perd la course du premier répondant — actuellement les IUs doivent déduire l’état d’un `404`.
5. ~~**Anneau de relecture plus grand**~~ — porté à 8000. **Anneau configurable par session** reste ouvert — les charges mobiles / à tours bavards peuvent nécessiter des remplacements par session.
6. **Événement `slow_client_warning` avant `client_evicted`** — contre-pression douce pour que les clients lents bien élevés puissent s’auto-limiter (réduire la profondeur de rendu, abandonner des morceaux) avant d’être terminés.

**Ergonomie d’intégration :**

7. **`POST /session/:id/_meta` pour le contexte de type IM** — clé-valeur par session attachée aux invites suivantes (id de chat, expéditeur, id de fil) remplace l’improvisation par canal.
8. **Négociation réelle des fonctionnalités `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` pour que les clients puissent détecter la dérive au lieu de tomber sur « trame inconnue, ignorée ».
9. **Documentation de durabilité de première classe** (cette section) — déjà livrée ci-dessus.

La feuille de route complète de convergence est suivie sur [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

## Limites du périmètre de l’étape 1 — ce que nous ne corrigerons pas dans l’étape 1.5

Deux choix structurels sont des non-objectifs explicites pour la feuille de route principale des étapes 1 / 1.5 / 2. Si votre cas d’usage dépend de l’un d’eux, planifiez en conséquence plutôt que d’attendre notre correction.

### L’état de session est uniquement en mutation locale (selon [revue LaZzyMan #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

Le plan de l’étape 1.5 décrit TUI comme un abonné EventBus dans le processus. En pratique, **l’IU TUI est strictement plus large que le protocole filaire** :

- **IU locale uniquement** — les ~15 composants de dialogue Ink (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) et les commandes slash `local-jsx` (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) rendent du JSX Ink propre au terminal. Les clients distants sur HTTP/SSE ne peuvent pas équivalemment rendre Ink, et ces flux n’émettent aucun événement filaire.
- **Mutations d’état de session sans événements filaires** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (écriture de `CLAUDE.md`) changent tous le comportement de l’agent, mais seul `/model` publie actuellement un événement (`model_switched`).

**Choix de l’étape 1 — option (A) de la revue** : ne pas promouvoir ces mutations en événements filaires. Les deux modes de déploiement ont des conséquences différentes.

#### Mode 1 — `qwen serve` sans tête (cette PR)

Aucun shell TUI ne s’exécute dans le démon. Les commandes slash listées ci-dessus **n’existent pas** dans ce mode — il n’y a pas d’IU terminal pour les émettre. L’état de session est donc :

- **Figé au démarrage** pour `approval-mode` / `memory` / `agents` / `tools` liste autorisée / `auth` — tout chargé depuis les paramètres + disque lorsque l’enfant `qwen --acp` du démon démarre ; immuable pour la durée de vie de la session. Les serveurs MCP définis par paramètres sont également figés au démarrage, mais les **serveurs ajoutés à l’exécution** (via `POST /workspace/mcp/servers`) peuvent être ajoutés ou supprimés sans redémarrage.
- **Mutable via HTTP** via `POST /session/:id/model` (publie `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (publie `mcp_server_added` / `mcp_server_removed`), et les votes de permission (`POST /permission/:requestId`).

**Conséquence :** les clients distants en mode sans tête voient **l’état complet de la session**. Aucun TUI ne cache d’état supplémentaire ; aucune dérive n’est possible. Si vous souhaitez changer `approval-mode`, redémarrez le démon avec de nouveaux paramètres. Les serveurs MCP peuvent maintenant être ajoutés/supprimés à l’exécution via les routes de mutation (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — voir [Gestion des serveurs MCP à l’exécution](#runtime-mcp-server-management-issue-4514).

#### Mode 2 — Étape 1.5 `qwen --serve` avec TUI co-hébergé (pas dans cette PR)

Lorsque l’étape 1.5 livre `qwen --serve` (le processus TUI co-héberge le même serveur HTTP), le TUI **existe** aux côtés des clients distants. Un opérateur local tapant `/approval-mode yolo` ou `/mcp add-server` mute l’état de session, et les clients distants sur HTTP n’ont aucun événement pour observer le changement.

Dans ce mode, TUI est un **« super-client »** — il observe la même conversation d’agent que les clients distants, ET peut muter l’état de session que les clients distants ne peuvent pas. L’asymétrie est :

- ✅ TUI et clients distants voient les mêmes messages d’agent, appels d’outils, diffs de fichiers, invites de permission.
- ❌ Seul TUI voit / mute l’état approval-mode / memory / liste des serveurs MCP / agents / outils liste autorisée / auth.

**Conséquence en mode 2 :** si une IU de client distant tente de refléter les paramètres de session, elle peut dériver après toute commande slash TUI. Les clients distants doivent **recharger l’état lors de l’attachement / reconnexion** (utilisez `Last-Event-ID: 0` pour rejouer l’événement le plus ancien de l’anneau pour des choses comme `model_switched`) ; ils NE doivent PAS compter sur des événements incrémentaux pour les mutations côté TUI.

#### Pourquoi (A) et non (B) (promouvoir les mutations en famille d’événements `session_state_changed`)

(B) est la réponse plus ambitieuse mais verrouille l’étape 1.5 dans une surface filaire sensiblement plus grande qui doit aussi passer proprement à travers le refactoring prévu dans le processus. Nous préférons parcourir honnêtement un périmètre plus petit. Le travail de taxonomie des événements d’état de session — énumérer quels flux TUI sont locaux par conception vs. pourraient plausiblement passer au filaire sous une future extension (B) optionnelle — est déplacé vers [#3803](https://github.com/QwenLM/qwen-code/issues/3803), pas dans le code de l’étape 1.5.

### N sessions parallèles partagent un seul enfant `qwen --acp`

Plusieurs sessions sur le même espace de travail **partagent un seul processus enfant `qwen --acp`** via le support multi-session natif de l’agent (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). Le pont appelle `connection.newSession({cwd, mcpServers})` pour chaque session — l’agent les stocke dans sa map de sessions et démultiplexe par sessionId par appel.

Coût concret pour N=5 sessions sur le même espace de travail :

| Ressource                             | Par session | À N=5                         |
| ------------------------------------- | ----------- | ----------------------------- |
| Processus Node du démon               | un          | **30–50 Mo** (un démon)       |
| Enfant `qwen --acp`                   | partagé     | **60–100 Mo** (un enfant)     |
| Enfants serveurs MCP                  | par session | 3×N si les configs diffèrent  |
| `FileReadCache` (tas dans l’enfant)   | partagé     | parsé une fois                |
| Analyse `CLAUDE.md` / mémoire hiérarchique | partagé | parsé une fois                |
| État du jeton de rafraîchissement OAuth | partagé   | **un seul chemin de rafraîchissement** |
| Faits appris par l’auto-mémoire       | partagé     | une base de connaissance par enfant |
| Démarrage à froid                     | premier seulement | <200 ms après la première session |

Le pont maintient **un canal par démon** (un démon par espace de travail, conformément au §02). Le canal reste actif tant qu’au moins une session est active ; le dernier `killSession` (ou un crash au niveau du canal) tue l’enfant.

**Les enfants serveurs MCP** sont encore par session aujourd’hui — la configuration de chaque session peut spécifier des serveurs différents, donc ils sont lancés indépendamment. Suivi de l’étape 1.5 : compteur de références pour les enfants serveurs MCP par `(espaceDeTravail, hashDeConfig)` afin que des configurations identiques soient partagées. Hors périmètre de cette PR.

**Les agents pairs (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) font tous du multi-session en processus unique.** qwen-code les rejoint au niveau de l’agent ; le pont de l’étape 1 dans cette PR rend la même architecture visible via HTTP.

## Connexion à un démon distant (issue #4175 PR 21)

Lorsque le démon s’exécute sur un pod distant (pas d’affichage partagé avec vous), un client peut déclencher un flux OAuth Device Code via HTTP. Le démon interroge lui-même le fournisseur d’identité ; votre seule tâche est d’ouvrir une URL sur l’appareil qui a un navigateur.

> [!note]
>
> Le niveau gratuit Qwen OAuth a été interrompu le 2026-04-15. Les exemples `qwen-oauth`
> ci-dessous documentent la forme du protocole de flux Device Code et l’identifiant de fournisseur
> legacy ; les nouvelles installations doivent utiliser un fournisseur d’authentification
> actuellement pris en charge.

```bash
# 1. Démarrer un flux. Le démon contacte le fournisseur d’identité, retourne un code et une URL.
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

# 2. Visitez l’URL sur votre téléphone / portable, saisissez le code utilisateur.
# 3. Interrogez la complétion (ou abonnez-vous au SSE pour l’événement auth_device_flow_authorized) :
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → transitions d’état : pending → authorized
```

Le SDK TypeScript encapsule les deux étapes dans un seul helper :

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Ouvrez ${flow.verificationUri}\nCode : ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**Le démon n’ouvre jamais de navigateur pour vous.** Même en local, le démon reste passif — il retourne l’URL et laisse le SDK / l’utilisateur choisir où l’ouvrir. C’est intentionnel : un démon sur un pod sans tête qui appellerait `xdg-open` échouerait silencieusement, masquant la véritable surface d’authentification. Reproduisez l’UX « Appuyez sur Entrée pour ouvrir le navigateur » de `gh auth login` dans votre client.

**`--require-auth` et commodité de développement.** Les routes du flux Device Code utilisent la porte de mutation stricte (PR 15), ce qui signifie qu’une valeur par défaut sans jeton en boucle locale retourne `401 token_required`. Localement, le moyen le plus simple de contourner cela pendant le développement est `qwen serve --token=dev-token` ; vous n’avez pas besoin de `--require-auth` sauf si vous renforcez la valeur par défaut en boucle locale.

**Limitation entre démons.** `oauth_creds.json` est partagé entre démons (`~/.qwen/oauth_creds.json`), donc une connexion réussie sur le démon A est automatiquement reprise par le prochain rafraîchissement de jeton du démon B — mais les clients SDK du démon B ne recevront pas l’événement `auth_device_flow_authorized` (les événements sont par démon).

**Prise en charge inter-client.** Deux clients SDK sur le même démon qui font tous deux `POST /workspace/auth/device-flow` pour le même fournisseur obtiennent le singleton par fournisseur : le premier appel démarre une nouvelle requête au fournisseur d’identité et retourne `attached: false` ; le second appel retourne l’entrée EXISTANTE en vol avec `attached: true`. La prise en charge est enregistrée dans la piste d’audit (sous le `X-Qwen-Client-Id` du second client) mais n’émet PAS d’événement séparé — les deux clients observent finalement le MÊME `auth_device_flow_authorized` une fois que l’utilisateur termine la page du fournisseur d’identité. Si votre IU distingue « J’ai commencé ceci » de « le flux de quelqu’un d’autre auquel j’ai rejoint », branchez-vous sur le champ `attached` retourné par `start()`.

## Fichier journal du démon

`qwen serve` écrit un journal de diagnostic par processus dans :

```
${QWEN_RUNTIME_DIR ou ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

Un lien symbolique `latest` dans le même répertoire pointe toujours vers le journal du processus en cours, donc `tail -f ~/.qwen/debug/daemon/latest` suivra le démon en cours d’exécution.

Le journal capture les messages de cycle de vie, les erreurs de route (avec le contexte `route=` et `sessionId=`), la sortie d’erreur de l’enfant ACP, et — lorsque `QWEN_SERVE_DEBUG=1` est défini — des miettes de pain supplémentaires du pont. Les lignes qui vont actuellement vers stderr y vont toujours ; le fichier journal est **additif**, pas un remplacement.

### Désactivation

Définissez `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) pour ignorer complètement l’écriture du fichier journal. La sortie stderr n’est pas affectée.

### Relation avec les journaux de débogage de session

Les journaux de débogage au niveau session (`~/.qwen/debug/<sessionId>.txt` et le lien symbolique `~/.qwen/debug/latest`) sont indépendants. Le journal du démon se trouve dans un sous-répertoire `daemon/` frère ; la sémantique de débogage par session est inchangée par cette fonctionnalité.

### Pas de rotation

Le journal du démon s’ajoute indéfiniment. Effectuez une rotation manuellement s’il devient volumineux. Une future amélioration pourrait ajouter une rotation automatique ; suivez via les suivis de [#4548](https://github.com/QwenLM/qwen-code/issues/4548).

## Gestion des serveurs MCP à l’exécution (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

Ajoutez ou supprimez des serveurs MCP à l’exécution sans redémarrer le démon. Les entrées d’exécution vivent dans une couche éphémère qui **masque** les serveurs définis par les paramètres de même nom ; la configuration sous-jacente `settings.json` / `mcpServers` n’est jamais écrite.

**Pré-vérification :** vérifiez `caps.features` pour `mcp_server_runtime_mutation` avant d’appeler l’une ou l’autre route. Les démons plus anciens sans cette balise retournent `404`.

### `POST /workspace/mcp/servers` — ajouter un serveur MCP à l’exécution

Porte stricte (jeton bearer requis). Connecte le serveur immédiatement via le `McpClientManager` actif et découvre ses outils.

Requête :

```json
{
  "name": "mon-serveur",
  "config": {
    "command": "npx",
    "args": ["-y", "@mon-org/mcp-server"]
  }
}
```

`name` doit être alphanumérique plus `_` et `-` (max 256 caractères). `config` est le même objet de configuration de serveur MCP utilisé dans les entrées `mcpServers` de `settings.json` (champs dépendants du transport : `command`/`args` pour stdio, `url` pour SSE/HTTP). Les champs sensibles à la sécurité (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) sont supprimés par le démon et ignorés.

Réponse (200) — succès :

```json
{
  "name": "mon-serveur",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` — une entrée d’exécution avec le même nom existait déjà et l’empreinte de configuration diffère ; l’ancienne connexion est démontée, une nouvelle établie. Lorsque l’empreinte correspond (ré-ajout idempotent), `replaced` est `false`.
- `shadowedSettings: true` — un serveur défini par les paramètres avec le même nom existe ; l’entrée d’exécution le masque maintenant. L’entrée des paramètres est intacte et réapparaît si l’entrée d’exécution est ultérieurement supprimée.
- `toolCount` — nombre d’outils découverts sur le serveur nouvellement connecté.

Réponse (200) — refus souple (mode d’avertissement budgétaire) :

```json
{
  "name": "mon-serveur",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Retournée lorsque `--mcp-budget-mode=warn` et que l’ajout du serveur dépasserait le `--mcp-client-budget` configuré. Le serveur N’EST PAS connecté. Les appelants doivent signaler la pression budgétaire à l’utilisateur.

Erreurs :

| Statut | Code                      | Quand                                                                                         |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Nom vide, dépasse 256 caractères, ou contient des caractères hors de `[A-Za-z0-9_-]`          |
| `400`  | `missing_required_field`  | `config` manquant ou non un objet non nul                                                      |
| `400`  | `invalid_client_id`       | En-tête `X-Qwen-Client-Id` présent mais non enregistré pour cet espace de travail              |
| `400`  | `invalid_config`          | Forme de config rejetée par le validateur de transport MCP                                     |
| `401`  | `token_required`          | Aucun jeton bearer configuré (porte stricte)                                                   |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` et le budget est épuisé                                            |
| `502`  | `mcp_server_spawn_failed` | Le processus serveur s’est terminé ou a expiré pendant la connexion ; le corps porte `serverName`, `exitCode`, `stderr` |
| `503`  | `acp_channel_unavailable` | Aucun enfant ACP actif (aucune session n’a encore été créée)                                   |

### `DELETE /workspace/mcp/servers/:name` — supprimer un serveur MCP à l’exécution

Porte stricte. Déconnecte le serveur et le supprime de la couche d’exécution. Idempotent — supprimer un nom qui n’a jamais été ajouté retourne une réponse de saut (pas une erreur).

Le paramètre de chemin `:name` est le nom du serveur encodé en URL.

Réponse (200) — succès :

```json
{
  "name": "mon-serveur",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — l’entrée d’exécution supprimée masquait un serveur défini par les paramètres de même nom. Cette entrée des paramètres est maintenant démasquée et sera utilisée lors de la prochaine découverte/redémarrage.

Réponse (200) — saut idempotent :

```json
{
  "name": "fantome",
  "skipped": true,
  "reason": "not_present"
}
```

Retournée lorsque le nom n’était pas dans la couche d’exécution (il peut toujours exister dans les paramètres — les entrées des paramètres ne peuvent pas être supprimées via cette route).

Erreurs :

| Statut | Code                      | Quand                                                                                      |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------ |
| `400`  | `invalid_server_name`     | Nom vide, dépasse 256 caractères, ou contient des caractères hors de `[A-Za-z0-9_-]`      |
| `400`  | `invalid_client_id`       | En-tête `X-Qwen-Client-Id` présent mais non enregistré pour cet espace de travail          |
| `401`  | `token_required`          | Aucun jeton bearer configuré (porte stricte)                                               |
| `503`  | `acp_channel_unavailable` | Aucun enfant ACP actif                                                                     |

### Sémantique de masquage

Les entrées d’exécution forment une couche éphémère au-dessus des serveurs MCP définis par les paramètres :

- **Ajouter** un serveur d’exécution avec le même nom qu’une entrée des paramètres le **masque** — la configuration d’exécution prend le pas. L’entrée des paramètres d’origine n’est pas modifiée.
- **Supprimer** un serveur d’exécution qui masquait une entrée des paramètres le **démasque** — la configuration définie par les paramètres redevient active lors de la prochaine connexion.
- **Redémarrage du démon** perd toutes les entrées d’exécution. Seuls les serveurs définis par les paramètres survivent aux redémarrages. Les serveurs d’exécution ont une durée de vie limitée à la session.
- **`GET /workspace/mcp`** rapporte la vue fusionnée — les serveurs définis par les paramètres et ceux d’exécution apparaissent dans le tableau `servers[]`. Il n’y a pas de distinction au niveau filaire entre les deux origines dans l’instantané aujourd’hui.

### Événements

Les deux routes émettent des événements SSE **au niveau de l’espace de travail** (tous les bus de session actifs les reçoivent) :

| Événement            | Émis lorsque                  | Champs de la charge utile                                                                 |
| -------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` réussit (pas sauté)    | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId`    |
| `mcp_server_removed` | `DELETE` réussit (pas sauté)  | `name`, `wasShadowingSettings`, `originatorClientId`                                      |
Les réponses ignorées (`budget_warning_only`, `not_present`) n'émettent PAS d'événements.

Les événements liés au budget provenant de la surface `mcp_guardrail_events` existante (`mcp_budget_warning`, `mcp_child_refused_batch`) se déclenchent également lorsque des ajouts au moment de l'exécution franchissent le seuil budgétaire.

## Prochaines étapes

- **Mettre en place un démon longue durée ?** [Modèles de lancement local (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) pour v0.16-alpha (local uniquement).
- **Créer un client ?** Voir le [guide de démarrage rapide DaemonClient TypeScript](../developers/examples/daemon-client-quickstart.md) et la [référence du protocole HTTP](../developers/qwen-serve-protocol.md).
- **Lire le code source ?** Le code du pont se trouve dans `packages/cli/src/serve/` ; le client SDK dans `packages/sdk-typescript/src/daemon/`.
- **Suivre la feuille de route ?** La progression des étapes 1.5 / 2 est suivie dans le ticket [#3803](https://github.com/QwenLM/qwen-code/issues/3803).
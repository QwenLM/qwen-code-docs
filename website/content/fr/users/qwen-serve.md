# Mode démon (`qwen serve`)

Exécutez Qwen Code comme un démon HTTP afin que plusieurs clients (plugins IDE, interfaces web, scripts CI, CLI personnalisés) puissent partager des sessions d'agent via HTTP + Server-Sent Events au lieu de lancer chacun leur propre sous-processus.

> **Statut :** Expérimental. Le démon prend en charge les déploiements Web Shell/API locaux et distants. Avant de l'exposer au-delà de la boucle locale, consultez [Authentification](#authentication) et le [modèle de menace du déploiement](#default-deployment-threat-model).

## Ce que cela vous apporte

- **Interface Web Shell intégrée** — `qwen serve` sert le Web Shell basé sur le navigateur à sa racine (`http://127.0.0.1:4170/`) dès le départ ; exécutez `qwen serve --open` pour le lancer automatiquement dans votre navigateur. Il est servi sur la même origine que l'API, donc aucun second port ou reverse proxy n'est nécessaire. Passez `--no-web` pour un démon API uniquement.

  La barre latérale masque les **Sessions sans espace de travail** une fois que sa liste est chargée sans aucune session, tout comme **Épinglées**. Utilisez le bouton principal **Nouvelle session** et choisissez **Aucun espace de travail** dans le composeur pour démarrer une conversation lorsque le groupe est masqué.

- **Jusqu'à un enfant ACP primaire plus un enfant à la demande par secondaire de confiance, plusieurs clients** — la production tente de préchauffer le bridge primaire et réessaie à la première utilisation après échec ; les runtimes secondaires de confiance démarrent leur propre enfant à la demande, tandis que les secondaires non fiables n'en démarrent jamais un. Avec le `sessionScope: 'single'` par défaut, les clients ciblant le même workspace partagent une session ACP et collaborent sur la même conversation, les mêmes diffs de fichiers et les mêmes invites de permission.
- **Streaming sécurisé à la reconnexion** — SSE avec reconnexion `Last-Event-ID` permet à un client de se déconnecter et de reprendre exactement là où il s'était arrêté (dans la fenêtre de relecture de l'anneau).
- **Transcripts persistés paginés** — `GET /session/:id/transcript` renvoie le transcript persisté actif complet sous forme de pages de relecture sans attacher de client ni modifier la fenêtre de relecture SSE live.
- **Permissions au premier répondant** — lorsque l'agent demande la permission d'exécuter un outil, chaque client connecté voit la demande ; le premier client à répondre gagne.
- **Un démon, un ou plusieurs workspaces** — répétez `--workspace` pour enregistrer des runtimes de workspace isolés sous un seul écouteur. Le premier workspace est primaire et reste la valeur par défaut pour les requêtes qui omettent `cwd`.
- **Canaux expérimentaux gérés par le démon** — démarrez avec `qwen serve --channel <name>`, ou démarrez sans canal et sélectionnez-en un plus tard avec `qwen channel set`. Les workers sont des processus séparés appartenant au cycle de vie du démon. Leur sélection peut être requise, remplacée, rechargée et arrêtée sans redémarrer le démon.
- **Contrôle d'exécution distant** — changez le mode d'approbation d'une session (`POST /session/:id/approval-mode`), activez/désactivez un outil (`POST /workspace/tools/:name/enable`) ou un skill chargé (`POST /workspace/skills/:name/enable`) par workspace, échafaudez un `QWEN.md` vide (`POST /workspace/init`, mécanique uniquement — n'appelle PAS le modèle ; pour un remplissage par IA, enchaînez avec `POST /session/:id/prompt`), redémarrez un seul serveur MCP avec une pré-vérification de budget (`POST /workspace/mcp/:server/restart`), ou ajoutez/supprimez des serveurs MCP à l'exécution sans redémarrer le démon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). L'écouteur loopback sans token par défaut peut tous les utiliser ; les mutations strictes de workspace nécessitent en plus des identifiants opérateur dans les autres modes de déploiement.
- **Récapitulatif de session** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) suivi) — récupérez un résumé en une phrase "où en étais-je" d'une session active (`POST /session/:id/recap`). Encapsule le `generateSessionRecap` du core comme une requête latérale contre le modèle rapide ; ne pollue ni l'historique de chat principal ni le flux SSE. Porte non stricte (même posture que `/prompt`) ; helper SDK `client.recapSession(sessionId)`.
  - **Limite connue — amplification du coût en tokens :** la route est un endpoint à coût pur (chaque appel est une requête latérale LLM, sans bénéfice d'état) et le démon n'a pas de rate limit par route en v1. Sur un loopback sans token par défaut, un client local bogué ou malveillant peut le spammer pour brûler des tokens. Configurez `--token` (et optionnellement `--require-auth`) sur les hôtes de dev partagés avant d'exposer le démon.
  - **Sécurité des récapitulatifs simultanés :** deux appels `/recap` simultanés sur la même session exécutent deux requêtes latérales indépendantes. `generateSessionRecap` lit un instantané de l'historique de chat via `GeminiClient.getChat().getHistory()` et le transmet à un appel `BaseLlmClient.generateText` séparé (via `runSideQuery`) ; il n'ajoute jamais et ne mute jamais le `GeminiChat` de la session. Sûr à appeler depuis plusieurs clients sans coordination.

## Notes sur le déploiement et la sécurité [#deployment-and-security-notes]

- **La boucle locale est approuvée par défaut** — `127.0.0.1:4170` démarre sans authentification par jeton porteur, et chaque processus local pouvant y accéder reçoit l'autorité API complète, y compris l'exécution de code en tant qu'utilisateur du démon. Utilisez un `QWEN_SERVER_TOKEN` stable avec `--require-auth` sur des hôtes partagés ou non fiables.
- **Les écouteurs non-locaux portent toujours un jeton porteur** — fournissez votre propre jeton ou utilisez le jeton éphémère affiché au démarrage. Les jetons générés tournent à chaque redémarrage, donc les clients réutilisables ont besoin d'un jeton stable. HTTP n'est pas chiffré ; configurez TLS avant de traverser des réseaux non fiables.
- **Le lancement en arrière-plan a deux chemins** — utilisez `qwen daemon start` pour la gestion intégrée du cycle de vie local, ou les [modèles systemd / launchd / tmux / nohup](./qwen-serve-deploy-local.md) lorsque vous avez besoin d'une supervision par gestionnaire de services ou d'un démarrage après redémarrage.
- **La persistance des jetons est optionnelle** — `qwen daemon start --save-token` stocke un jeton porteur explicitement fourni dans un fichier auxiliaire réservé au propriétaire pour `qwen daemon token` ; les `qwen serve` ordinaires et les jetons générés n'utilisent pas ce fichier auxiliaire. Consultez [Inspecter et contrôler un démon local](#inspect-and-control-a-local-daemon).
- **Multi-espace de travail est mono-opérateur** — les espaces de travail enregistrés partagent le jeton porteur, l'écouteur, les quotas et la frontière de défaillance du processus du démon. Utilisez des démons séparés et un orchestrateur externe pour des utilisateurs ou des principes de sécurité indépendants ; consultez [Déploiement multi-sessions et multi-espaces de travail](#multi-session--multi-workspace-deployment).

Pour l'énumération plus approfondie de "ce que nous ne corrigerons pas à l'étape 1" (modèle de mutation d'état de session single-host + N sessions parallèles partageant un enfant ACP dans chaque runtime de workspace), voir [Stage 1 scope boundaries](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) ci-dessous.

## Démarrage rapide

### Web Shell distant et accès mobile [#remote-web-shell-and-phone-access]

Pour se connecter à un démon local en cours d'exécution depuis une autre machine, ouvrez son Web Shell et accédez à **Paramètres → Connexions → Autoriser les connexions distantes**. L'accès distant est désactivé par défaut. Activez-le, choisissez une interface réseau si demandé, et copiez l'adresse affichée ainsi que le jeton bearer dans le formulaire de connexion de l'autre Web Shell. Aucune commande terminal supplémentaire ni redémarrage du démon n'est requis.

Le listener distant sert les mêmes espaces de travail et sessions que le listener local. Il utilise d'abord le même port numérique sur l'interface sélectionnée. Si cette adresse est occupée, choisissez un port différent dans les paramètres avancés ; Qwen ne change pas silencieusement les ports ni n'arrête un autre service. Les pages HTTP sur `localhost` et `127.0.0.1` sont autorisées sur n'importe quel port. Les paramètres avancés acceptent des origines de navigateur exactes supplémentaires, y compris les pages HTTPS.

Désactiver l'accès ou réinitialiser le jeton révoque les connexions distantes existantes ; les clients locaux et les tâches en cours appartenant au démon continuent. La réactivation génère un nouveau jeton. Ce paramètre n'est pas persistant après un redémarrage du démon. Le jeton n'est disponible que pour l'opérateur local autorisé. Un listener principal déjà exposé par une configuration explicite de démarrage/proxy est étiqueté séparément et n'est pas fermé par ce commutateur.

L'adresse doit être accessible via le réseau et le pare-feu. HTTP ne chiffre pas le jeton ; utilisez un réseau fiable ou configurez HTTPS. Une page HTTPS ne peut pas se connecter à un point de terminaison HTTP distant. L'interface utilisateur distingue les erreurs d'authentification, de politique et de contenu mixte ; une erreur réseau générique du navigateur ne permet pas de distinguer fiablement les échecs CORS, de certificat et de connectivité.

```bash
qwen serve --hostname 0.0.0.0
```

Lorsque ni `--token` ni `QWEN_SERVER_TOKEN` n'est fourni, un écouteur non-local génère un jeton porteur éphémère de 128 bits (22 caractères sûrs pour les URL) et l'affiche une seule fois au démarrage. Les valeurs de drapeau explicites prévalent sur l'environnement ; sur une liaison non-locale, une valeur explicitement vide échoue encore en mode sécurisé et refuse de démarrer, tandis que sur la boucle locale elle masque `QWEN_SERVER_TOKEN` et laisse la liaison en mode approuvé sans jeton décrit sous `--require-auth`. Le comportement par défaut de la boucle locale reste inchangé.

Lors de liaisons sur des interfaces génériques, le démarrage liste les URL locales/réseau sans jeton issues des interfaces réelles et — pour le jeton généré, ou pour votre propre jeton dans un terminal interactif — un **code QR contenant un secret** pour une adresse privée LAN étiquetée. L'énumération des interfaces génériques ne liste que la même population LAN privée/lien-local annoncée par Local Control (IPv4 RFC 1918 / RFC 3927, plus IPv6 ULA fc00::/7 sur les liaisons double pile) ; le filtre d'interface logicielle qui exclut les adaptateurs VPN et les ponts conteneurs est une **heuristique de nom** ([#9158](https://github.com/QwenLM/qwen-code/issues/9158)), pas une garantie, donc les noms de superposition k8s (`cbr0`, `cali*`, `vxlan.*`) peuvent passer. Une liaison explicite non-loopback imprime et encode en QR exactement l'adresse choisie — y compris une adresse routable. Dans un conteneur, l'adresse énumérée est l'interface du conteneur lui-même, donc atteindre un port publié signifie substituer l'adresse de l'hôte ; un conteneur avec allocation pty compte comme un terminal interactif, ses logs restent donc porteurs de secrets. Scannez le QR pour ouvrir le Web Shell intégré avec le porteur dans le fragment d'URL. Le navigateur supprime le credential de l'URL et le conserve dans le `sessionStorage` par onglet. Alternativement, ouvrez une URL imprimée et entrez le jeton ; les credentials manquants ou expirés affichent un formulaire de nouvelle tentative. Les jetons générés tournent au redémarrage. `--no-web` omet le QR, et un stdout pipé/redirigé ne republie jamais un jeton opérateur stable dans un QR — ce cas imprime un indice de suppression mentionnant `--token-qr` plus un QR adresse-seule (le Web Shell demande le jeton à l'arrivée) ; passez `--token-qr` ou définissez `serve.tokenQr` dans les paramètres utilisateur, système ou valeurs par défaut système pour imprimer quand même le QR complet porteur de jeton ; `--no-token-qr` supprime le QR de jeton quickstart au démarrage pour cette exécution sur tous les chemins quickstart, y compris un terminal interactif et un jeton généré (qui s'imprime toujours sous forme de ligne texte brut séparée) ; il ne gouverne pas le QR d'appairage Local Control, que `--local-control` imprime par conception. Demander un QR là où aucun ne peut être imprimé — `--no-web`, ressources Web Shell non résolues, ou une liaison loopback — indique cela sur stderr au lieu de ne rien faire silencieusement. Les adresses n'impliquent pas la traversée de pare-feu ou NAT ; aucune IP publique n'est découverte automatiquement.

Les requêtes **HTTP** same-origin du Web Shell intégré fonctionnent sans `--allow-origin` ; les autres origines de navigateur nécessitent toujours cette liste autorisée, et `Origin: null` reste rejeté. Les fonctionnalités basées sur WebSocket (terminal, voix) et les navigateurs atteignant le démon via un proxy inverse terminant TLS nécessitent toujours une entrée explicite `--allow-origin <origin>` — les en-têtes transmis ne sont jamais considérés comme fiables pour établir le same-origin. Il en va de même pour tout intermédiaire HTTP simple qui réécrit l'en-tête `Host` : le `proxy_set_header Host $proxy_host` par défaut de nginx et l'Ingress k8s font tous deux voir au démon un `Host` qui ne correspond plus au `Origin` du navigateur. Passez `--allow-origin <origin>` pour l'origine réellement vue par votre navigateur, ou configurez le proxy pour transmettre `Host` verbatim. Sur une liaison **non-loopback**, la seule translation de port (`docker -p 8080:4170`) ne nécessite rien — la vérification same-origin compare `Origin` avec le `Host` transmis et ne consulte jamais le port d'écoute. Sur la liaison **loopback** par défaut, ce n'est pas le cas : la liste autorisée Host contre le rebind DNS n'accepte que le port du démon lui-même, donc un tunnel traduisant le port (`ssh -L 8080:localhost:4170`) est rejeté avec `403 Invalid Host header` pour chaque requête incluant le document shell, et `--allow-origin` ne peut pas outrepasser cela — transmettez le même port (`ssh -L 4170:localhost:4170`) ou liez en non-loopback. Le QR d'appairage **Accès mobile** est construit à partir du schéma et du `Host` de la requête qui le demande — jamais à partir des en-têtes transmis — donc derrière un proxy terminant TLS il conserve le schéma `http` du démon lui-même, et l'échange rejette la page `https` du téléphone car l'invitation est liée à l'origine pour laquelle elle a été émise. Appairez pendant la navigation sur l'adresse directe du démon, ou entrez le jeton sur le téléphone à la place. Le porteur accorde toute l'autorité API du démon, y compris l'exécution de code. Traitez les jetons de terminal et les captures QR comme des secrets. HTTP n'est pas chiffré ; les options existantes `--tls-cert` et `--tls-key` fournissent HTTPS avec votre propre certificat.

Pour utiliser un démon distant depuis le Web Shell sur votre propre machine, entrez l'origine du démon distant (par exemple `https://dev-box.example:4170`) et son jeton porteur dans l'écran de connexion ou le **Statut du Démon**. Le démon distant doit autoriser l'origine de votre page locale. Un onglet de navigateur sur un port fixe peut lister cette origine, par exemple `qwen serve --hostname 0.0.0.0 --allow-origin http://localhost:4170` ; le WebSocket du terminal a besoin de cette entrée aussi. Le **client desktop** est différent : il charge son propre shell depuis `http://127.0.0.1:<OS-assigned port>`, donc son origine de page change à chaque lancement et aucune entrée fixe ne peut correspondre. Autorisez explicitement cette classe d'origine avec `--allow-origin http://127.0.0.1:*`, qui admet tout port sur exactement cet hôte loopback pour l'API REST et le WebSocket terminal/voix. Préférez-le à `*` : `*` admet toutes les origines de navigateur et ne couvre que REST, pas la porte WebSocket. Le jeton est conservé par onglet et par origine de démon et n'est jamais réutilisé pour un autre démon. La barre latérale liste les espaces de travail d'un seul démon sélectionné à la fois ; changer de démon recharge la page et ne combine pas les listes de projets locaux et distants. Utilisez le formulaire existant **Ajouter un espace de travail** pour enregistrer un chemin absolu sur le démon sélectionné. Un lien dont le `?daemon=` nomme une origine à laquelle ce navigateur ne s'est jamais connecté n'est pas contacté tant que vous ne le confirmez pas sur l'écran de connexion. Les connexions cross-origin n'offrent pas le pont fichier local-navigateur, ni dans le Web Shell autonome ni embarqué. Une page HTTPS ne peut pas se connecter à un démon HTTP, donc servez les deux en HTTPS hors réseaux de confiance.

### 1. Démarrer le démon (loopback, sans auth)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: trusted loopback mode; local callers have full API access without bearer authentication, including code execution as the daemon user. Use --require-auth with QWEN_SERVER_TOKEN on shared or untrusted hosts.
```

La liaison par défaut est `127.0.0.1:4170`. L'auth Bearer est **désactivée** et l'écouteur primaire est de confiance, donc tout processus local pouvant atteindre le port peut utiliser l'API opérateur complète, y compris exécuter du code en tant qu'utilisateur du démon. Les vérifications de confiance workspace par route, de propriété de session, `X-Qwen-Client-Id`, de permission, de fonctionnalité, de validation et de ressources s'appliquent toujours. Le démon enregistre le répertoire de travail courant comme workspace primaire ; utilisez un `--workspace /path/to/dir` absolu pour le remplacer, et répétez le flag pour enregistrer des runtimes isolés supplémentaires.

Pour un démon API-only, désactivez le Web Shell. Les routes session, prompt, workspace, permission et SSE sont inchangées ; les surfaces liées au Web Shell disparaissent avec lui — l'activation Local Control échoue fermée sur toutes les plateformes, et les routes `/live/*` (plus, sur macOS avec `QWEN_SERVE_LIVE_NATIVE_HOST=1`, le WebSocket `/live/host`) ne sont pas enregistrées :

```bash
qwen serve --no-web
```

**Ouvrez l'interface Web Shell.** Naviguez vers `http://127.0.0.1:4170/` (ou démarrez le démon avec `qwen serve --open` pour le lancer automatiquement) pour le terminal complet dans le navigateur — chat, diffs, historique de commits, appels d'outils et invites de permission. L'UI est servie à la racine du démon sur la même origine que l'API. Le reste de ce guide utilise du HTTP brut afin que vous puissiez scripter directement contre l'API.

Pour un lancement authentifié mono-utilisateur sans créer manuellement un token, optez explicitement :

```bash
qwen serve --open-with-auth
```

Ce mode loopback uniquement génère un bearer token 256 bits lorsque ni `--token` ni `QWEN_SERVER_TOKEN` n'en fournit un, puis le transmet au Web Shell ouvert sous forme de fragment URL `#token=`. Le shell supprime le fragment et conserve l'identifiant dans le `sessionStorage` de cet onglet ; le rafraîchissement fonctionne, mais fermer l'onglet ou redémarrer le démon perd l'identifiant. En CI, SSH ou un autre environnement où l'auto-open n'est pas disponible, le démon démarre et affiche l'URL fragmentée pour ouverture manuelle. L'URL affichée contient des secrets.

Le flag est désactivé par défaut, inclut le comportement d'ouverture du navigateur, et nécessite le Web Shell, les assets Web Shell construits et une liaison loopback. Un simple `qwen serve --open` reste sans token sur le loopback. En mode open authentifié, les routes API normales rejettent les autres clients locaux sans le bearer ; les assets statiques du Web Shell et le `/health` loopback conservent leur comportement pré-authentification existant sauf si `--require-auth` est également défini. Pour plusieurs clients ou un Web Shell réouvrable, utilisez plutôt un token partagé stable :

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --open
```

### 2. Vérifiez son bon fonctionnement

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

Le champ `workspaceCwd` expose l'espace de travail de compatibilité principal afin que les clients puissent intentionnellement omettre `cwd` sur `POST /session`. Les clients actuels doivent sélectionner une entrée fiable dans `workspaces[]` et envoyer le `cwd` de cette entrée lors du ciblage explicite d'un runtime. Le champ `limits.maxPendingPromptsPerSession` annonce la limite d'admission de prompt active par session ; `null` signifie que la limite est désactivée. `limits.maxTotalSessions` annonce la limite optionnelle globale de nouvelles sessions du démon ; `null` signifie illimité.

### Inspecter et contrôler un démon local [#inspect-and-control-a-local-daemon]

`qwen serve` publie un enregistrement de découverte local pour chaque écouteur actif, afin qu'un second terminal n'ait pas à analyser stdout ou chercher dans `ps` :

```bash
qwen daemon start --port 4170      # detached; waits for the discovery record
qwen daemon status                 # ports, PIDs, workspaces, and health
qwen daemon status --json          # one JSON object per daemon
qwen daemon status --detail        # version, uptime, sessions, and issues
qwen daemon logs --port 4170 -f    # follow the recorded log file
qwen daemon stop --port 4170       # SIGTERM the recorded process
qwen daemon restart --port 4170    # stop, then start with the recorded settings
```

Les enregistrements résident sous le répertoire runtime (`$QWEN_RUNTIME_DIR`, `$QWEN_HOME`, ou `~/.qwen`) dans `daemon/daemon-<port>.json`. Ils sont `0600` sur POSIX et ne contiennent jamais le jeton porteur. Un enregistrement laissé par un démon planté est signalé comme `stale` ; `status --prune` ou `stop` le supprime. `stop` envoie `SIGTERM` seulement après que l'écouteur répond `/health` ou que son PID est encore vivant ; `--force` ajoute `SIGKILL` après le délai de grâce. Quand plus d'un démon est enregistré, passez `--port` ; `stop` accepte aussi `--all`.

`status --detail` interroge le démon pour son propre statut : version, durée de fonctionnement, sessions actives et nombre de problèmes. Il envoie `QWEN_SERVER_TOKEN` uniquement lorsque l'enregistrement indique que le démon utilise un jeton d'accès (bearer) et que le processus enregistré est vivant, adressable et démarré à la date indiquée dans l'enregistrement ; un enregistrement dont l'espace de noms PID enregistré n'est pas adressable par ce processus ne reçoit jamais le jeton d'accès. Sans jeton, un démon exigeant un jeton d'accès signale que l'authentification est requise.

`qwen daemon start` lance `qwen serve` en mode détaché, attend son enregistrement de découverte et affiche l'URL liée, le PID, le chemin du journal et la commande d'arrêt. Il supprime les identifiants et les liaisons de capacités privées de la session de lancement afin que l'enfant soit un nouveau démon, conserve l'environnement modèle/authentification de l'opérateur et passe `--no-token-qr` pour que le journal de démarrage ne puisse pas contenir de jeton. Les espaces de travail sont normalisés, les répertoires d'exécution relatifs sont épinglés au répertoire de lancement avant le spawn, et les racines relatives aux lecteurs Windows sont résolues par rapport au lecteur de lancement. Une liaison non-loopback nécessite `QWEN_SERVER_TOKEN` ; utilisez `qwen serve` directement si vous souhaitez un jeton éphémère. Le journal de démarrage est `0600` et est supprimé après un démarrage réussi. `--wait` attend jusqu'à ce que l'environnement d'exécution serve (aucun problème `daemon_runtime_starting` et pas `error`) ; un délai d'expiration conserve le journal de démarrage et quitte avec une valeur non nulle.

Pour un démon en arrière-plan authentifié avec un identifiant local réutilisable, fournissez un jeton stable via l'environnement et activez le fichier sidecar du jeton :

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen daemon start --require-auth --save-token --wait
qwen daemon token --port 4170          # print the saved bearer; treat the output as a secret
qwen daemon token --port 4170 --remove # delete only the local sidecar
```

Préférez `QWEN_SERVER_TOKEN` à `--token`, qui est visible dans la liste des processus du shell. `--save-token` nécessite un jeton explicitement fourni et refuse de lancer sans celui-ci. Le sidecar est `daemon/daemon-<port>-<pid>.token` sous le même répertoire d'exécution que l'enregistrement de découverte ; il est `0600` sur POSIX et n'est jamais inclus dans l'enregistrement de découverte ou le journal du démon. `qwen daemon stop` le supprime, tandis que `qwen daemon restart` le transmet à l'instance de remplacement. `qwen daemon token --remove` supprime la copie locale mais ne modifie ni ne révoque l'identifiant du démon en cours d'exécution ; arrêtez et redémarrez le démon avec un nouveau jeton pour le faire pivoter. Un `qwen serve` ordinaire, y compris `--open-with-auth`, n'écrit pas ce sidecar.

`qwen daemon restart` arrête un démon enregistré via `daemon stop` et le redémarre via `daemon start --wait` sur son port et son nom d'hôte enregistrés, avec ses espaces de travail de démarrage enregistrés, la racine du répertoire de travail des Conversations, le mode Web Shell et le paramètre `--require-auth` ; `--web`/`--no-web` et `--require-auth`/`--no-require-auth` remplacent l'enregistrement. Les enregistrements persistants d'espaces de travail sont restaurés par le nouveau démon lui-même, et non rejoués comme `--workspace`. Toutes les autres options `qwen serve` (par exemple `--profile`, `--channel`, `--allow-origin` ou les limites de débit) sont réinitialisées à leur valeur par défaut, donc relancez un démon configuré avec celles-ci via `qwen serve`. Avant d'arrêter quoi que ce soit, le redémarrage refuse un démon HTTPS, un espace de travail de démarrage qui n'existe plus, une exécution depuis l'intérieur d'un shell hébergé par le démon (comme son terminal Web Shell), et un démon avec jeton d'accès sans `--token` ou `QWEN_SERVER_TOKEN` ; un démon avec jeton d'accès en cours d'exécution doit accepter le jeton, donc le redémarrage ne fait jamais pivoter l'identifiant. Un jeton conservé uniquement dans un `.env` d'espace de travail ou un fichier de configuration n'est pas lu par `qwen daemon`. `--force` est transmis à `daemon stop` uniquement si vous le passez. Si le port enregistré est occupé, le démon démarre sur le prochain port libre et le redémarrage quitte avec une valeur non nulle.

La racine des Conversations enregistrée par un démon actuel est préservée par `daemon restart`, même si `QWEN_CONVERSATIONS_DIR` dans le shell de redémarrage a changé. Les anciens enregistrements de découverte sans ce champ utilisent à nouveau l'environnement de lancement ou la valeur par défaut ; ils ne peuvent pas garantir la sélection précédente. Pour choisir une autre racine, arrêtez le démon et démarrez-le avec la nouvelle valeur. Voir [Répertoire de travail des Conversations](#conversations-working-directory) pour les exigences de persistance et de récupération.

### Capacité d'enregistrement des espaces de travail

La limite d'enregistrement par défaut est 256. Définissez `QWEN_SERVE_MAX_WORKSPACES=25 qwen serve --workspace /path/to/project` pour la réduire ; les valeurs acceptées sont des entiers décimaux de 1 à 256. Les valeurs invalides font échouer le démarrage. C'est un paramètre de démarrage du démon : `.env` de projet et `settings.env` de projet ne peuvent pas le modifier. Les appelants intégrés peuvent définir `ServeOptions.maxRegisteredWorkspaces`, qui a priorité sur l'environnement de démarrage.

La limite compte l'espace de travail principal, les espaces de travail secondaires enregistrés et les espaces de travail temporaires créés par l'utilisateur. L'environnement d'exécution interne des Conversations est exempté. L'enregistrement dynamique renvoie `409 workspace_limit_reached` à la capacité. `GET /capabilities` et `GET /daemon/status` exposent `limits.maxRegisteredWorkspaces`.

Avec la capacité d'enregistrement par défaut de 256, le démon standard utilise par défaut une limite globale fixe de 800 sessions, y compris un démon démarré avec un seul espace de travail. La même limite de sessions par défaut s'applique à toute capacité d'enregistrement configurée supérieure à 25. `--max-total-sessions` la remplace toujours ; `0` la désactive. À des capacités de 25 ou moins, la limite par défaut existante reste : un espace de travail de démarrage ou restauré est illimité, et plusieurs dérivent le total de la limite par espace de travail et de ce nombre. Les modifications d'enregistrement ne recalculent pas le total. Cela ne modifie pas la politique de mémoire des enfants ACP ni ne promet 800 sessions concurrentes sûres.

Le contrôle de canal prend en charge indépendamment au maximum 25 propriétaires d'espaces de travail, exposé comme `limits.maxChannelControlWorkspaces`. Une transition compte également les propriétaires conservés pour la récupération ; à la capacité, arrêtez avec succès tous les canaux sélectionnés sur un ancien propriétaire avant d'ajouter un nouveau propriétaire. Une transition trop grande renvoie `409 channel_control_workspace_limit_reached`. `--channel all` continue de sélectionner uniquement l'espace de travail principal. Le délai d'expiration du SDK de canal est inchangé.

Les fichiers d'enregistrement persistants conservent la version de schéma 1 et prennent en charge jusqu'à 255 enregistrements secondaires dans 8 MiB. Les enregistrements bruts, y compris les alias obsolètes, consomment des emplacements persistants jusqu'à ce qu'ils soient oubliés. Si l'ensemble complet valide de démarrage dépasse la limite configurée, le démarrage échoue et laisse le fichier inchangé. Pour réduire la capacité, redémarrez avec la capacité précédente, oubliez suffisamment d'enregistrements et réduisez les arguments explicites `--workspace` avant de redémarrer avec la limite inférieure. Avant de passer à une binaire plus ancienne, sauvegardez le fichier et utilisez la binaire plus récente pour le réduire à au plus 24 enregistrements secondaires et 256 KiB. Sinon, les binaires plus anciennes rejettent ce magasin et démarrent uniquement avec des espaces de travail explicites ; leurs mutations du magasin échouent avant l'écriture.

### Ajuster le sondage de l'état actif des sessions

Web Shell actualise l'état actif des sessions de l'espace de travail toutes les **5 secondes** par défaut. Pour utiliser un intervalle différent, définissez la variable d'environnement du démon avant de le démarrer :

```bash
QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS=10000 qwen serve --web
```

La valeur est un entier en millisecondes, de `1000` à `2147483647`. Les valeurs manquantes ou invalides reviennent à `5000`. L'intervalle s'applique à tous les espaces de travail servis par ce démon ; redémarrez le démon et rechargez toutes les pages Web Shell ouvertes après l'avoir modifié. Les actions locales sur les sessions et le retour à un onglet visible peuvent encore rafraîchir immédiatement. Cela ne modifie que le sondage de l'état actif, pas le sondage complet du catalogue de sessions.

Le démon publie l'intervalle effectif sous `sessionLiveStatePollIntervalMs` dans `/capabilities`. Web Shell utilise cette valeur et revient à cinq secondes lors de la connexion à un ancien démon qui l'omet. Les consommateurs du SDK peuvent lire cette valeur pour choisir leur propre planification d'interrogation.

### Exécuter les canaux depuis le démon

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

Ce mode est expérimental et géré par le démon. Il ne remplace pas la commande autonome `qwen channel start` : sans `--daemon-url`, le comportement existant de `qwen channel start`, `stop` et `status` reste autonome. Avec `qwen serve --channel`, la sélection explicite prévaut, le démon réserve le bail du service de canal avant l'écoute, et le démarrage échoue si le worker initial ne peut pas devenir prêt. Lors d'un démarrage sans indicateur, le démon restaure `serve.channels` depuis chaque espace de travail enregistré fiable, afin qu'un canal configuré pour démarrer dans un espace de travail non principal revienne avec le démon au lieu de nécessiter un appel API runtime. Si aucune source ne sélectionne de canaux, le runtime lourd des canaux reste déchargé et aucun bail du service de canal n'est réservé jusqu'à la première PUT runtime, ou jusqu'à ce qu'un espace de travail configurant son propre `serve.channels` s'enregistre. Un espace de travail fiable enregistré après le démarrage du démon restaure également ses propres `serve.channels`, une fois par exécution du démon : le réenregistrer plus tard — après sa suppression ou après reconfiguration de sa confiance — ne répète pas la restauration, donc un canal arrêté entre-temps reste arrêté. Démarrer le démon avec un `--channel` explicite ignore entièrement cela, tout comme arrêter les canaux avec `qwen channel stop` (`DELETE /workspace/channel`) jusqu'à ce que `qwen channel set` les réactive : enregistrer un espace de travail n'est pas une demande de réactiver l'hébergement. Contrairement à la restauration au démarrage, qui ignore un nom qu'elle ne peut pas héberger et conserve les autres, un espace de travail tardif dont la liste contient un tel nom ne récupère aucun de ses canaux, et le journal du démon enregistre la raison. L'enregistrement de l'espace de travail n'attend pas que ses canaux démarrent. Un nom de canal listé par un espace de travail incapable de l'héberger est ignoré avec un log, laissant les canaux des autres espaces de travail actifs ; `all` s'applique toujours uniquement à l'espace de travail principal. Si un worker prêt plante ultérieurement, le démon continue de fonctionner, le relance sous une politique de redémarrage bornée, et rapporte son état (y compris les avertissements `channel_worker_exited`) dans `GET /daemon/status`.

La restauration automatique ignore un champ de démarrage invalide ou une erreur de validation ou de bail avant le lancement des workers, journalise sa source `serve.channels`, et maintient les paramètres non concernés en vigueur. Après l'échec du démarrage d'un worker, le démon ne continue que si le nettoyage réussit. Les délais globaux de démarrage runtime et les arrêts de workers non confirmés conservent le comportement normal d'échec de démarrage ; le bail du service reste retenu tant que la terminaison du worker n'est pas confirmée. Vérifiez le journal du démon pour les restaurations ignorées ou échouées.

Les noms de démarrage stockés doivent être non vides, sans espaces blancs en début ou fin, et ne contenir aucun caractère de contrôle dangereux ou invisible. Les entrées invalides sont ignorées individuellement et journalisées par index de tableau. Le démarrage ne les tronque pas vers un autre nom d'instance ni ne réécrit les paramètres. Le basculement de démarrage du canal reflète la configuration persistée, tandis que l'état runtime indique si le canal est actif.

Le contrôle runtime est exposé via `GET`, `PUT` et `DELETE /workspace/channel` ; les helpers SDK sont `getChannelWorkerControl()`, `setChannelWorkerSelection()` et `stopChannelWorker()`. PUT/DELETE/reload utilisent la porte de mutation stricte : les appelants principaux sur boucle locale fiable peuvent les utiliser sans jeton, tandis que les autres déploiements nécessitent des identifiants opérateur. Les sélections runtime sont volontairement éphémères : PUT ne modifie ni les paramètres ni les options de démarrage, et un redémarrage revient à la sélection explicite `qwen serve --channel`, sinon au `serve.channels` de l'espace de travail principal fiable, ou à désactivé si aucun n'existe. Les sélections nommées explicites CLI et runtime sont tronquées et dédupliquées selon l'ordre de première occurrence ; l'ordre est préservé car le premier canal peut affecter la sélection partagée du modèle.

Les `qwen channel set` et `qwen channel reload` gérés par le démon, ainsi que `status` et `stop` avec `--daemon-url`, ne peuvent pas découvrir un token généré par `--open-with-auth`. Utilisez `QWEN_SERVER_TOKEN` et passez la même valeur avec `--token` à ces clients, ou omettez le mode authenticated-open.

Le démon lit les paramètres de chaque canal (tokens, `proxy`, `model` par canal) au démarrage de son worker. Pour relire les paramètres sans modifier la sélection committée, appelez `POST /workspace/channel/reload` (SDK `client.reloadChannelWorker()`, ou `qwen channel reload`). Reload résout à nouveau la propriété du workspace et redémarre les workers sélectionnés via le même chemin de réconciliation rollback-safe. La capacité `channel_control` est présente chaque fois que le contrôle runtime est câblé ; `channel_reload` n'est présente que lorsque le manager est activé. Les threads persistés sont restaurés depuis le disque.

Le `cwd` de chaque canal sélectionné doit résoudre vers un espace de travail enregistré, et les canaux sont regroupés par cet espace de travail propriétaire : un démon mono-espace de travail exécute un seul worker (inchangé par rapport à avant) ; un démon multi-espaces de travail (`--workspace` répété) exécute un worker par espace de travail possédant un canal sélectionné, chacun lié au cwd, `QWEN_DAEMON_WORKSPACE` et overlay env de cet espace de travail. Pour héberger un canal dans un espace de travail non principal, définissez-le dans le propre `.qwen/settings.json` de cet espace de travail (aucun `cwd` nécessaire) ou définissez un `cwd` explicite égal au chemin de l'espace de travail. Un canal défini uniquement dans la portée utilisateur/système sans `cwd` est ambiguë entre plusieurs espaces de travail : une sélection explicite `--channel` fait échouer le démarrage, tandis que la restauration automatique journalise l'erreur de propriété et ignore cette sélection avant le lancement des workers. `--channel all` reste réservé au principal (il héberge les canaux de l'espace de travail principal) et ne peut pas être combiné avec des canaux nommés.

Remplacer une sélection pré-vole la configuration, la propriété et la confiance avant d'arrêter quoi que ce soit. Elle conserve les workers d'espace de travail dont la sélection ordonnée est inchangée. Si un worker modifié ne peut pas démarrer, le démon arrête les nouveaux workers et restaure l'ancienne sélection. Si le démon ne peut pas confirmer qu'un ancien enfant s'est terminé même après SIGKILL, il conserve le bail PID et refuse de créer un worker dupliqué. Un worker est toujours considéré comme prêt lorsqu'au moins un adaptateur demandé se connecte ; PUT retourne alors `partial: true`, et `/daemon/status` rapporte `channel_worker_partial_connect` pour les adaptateurs manquants. Un nom `serve.channels` que le démon n'a pas pu démarrer — une sélection configurée dont le worker a échoué, un nom que le démarrage n'a pas pu attribuer, ou un laissé en panne par la restauration d'une inscription tardive — est rapporté comme `channel_restore_failed` sur `/daemon/status`, et apparaît comme `error` avec son `lastError` dans la liste de canaux de cet espace de travail lorsque les propres paramètres de cet espace de travail le définissent. D'autres raisons pour lesquelles un nom reste non hébergé figurent uniquement dans le journal du démon.

Lorsqu'un adaptateur rejette `connect()`, les instantanés de worker actuels peuvent inclure des entrées `startupFailures` avec le canal, `phase: "connect"`, un code d'adaptateur optionnel, et un message avec identifiants expurgés. `qwen channel set`, `qwen channel reload` et `qwen channel status --daemon-url …` distants affichent ces raisons. Si chaque adaptateur échoue lors d'un set ou reload dynamique, la commande reçoit `502 channel_worker_start_failed` ; les raisons de la réponse décrivent cette tentative et son `state` décrit le résultat après rollback. La tentative échouée n'est pas conservée par les requêtes de statut ultérieures. Au maximum 64 raisons sont conservées par démarrage de worker, et les codes d'adaptateur doivent être traités comme diagnostiques plutôt que comme catégories stables. Le démarrage initial `qwen serve --channel …` quitte toujours lorsqu'aucun adaptateur ne se connecte.

Le démon expose également des instantanés de runtime en lecture seule pour les interfaces client et les opérateurs : `GET /daemon/status`, `GET /workspace/mcp`, `GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`, `GET /workspace/preflight`, `GET /workspace/:id/session-info`, `GET /session/:id/status`, `GET /session/:id/context`, `GET /session/:id/supported-commands`, et `GET /session/:id/tasks`, `GET /session/:id/lsp`, `GET /session/:id/resources`, et `GET /session/:id/transcript`.

`GET /workspace/:id/session-info` (et son jumeau pluriel `GET /workspaces/:workspace/session-info`) renvoie les agrégats de sessions pour un espace de travail : `active` / `archived` / `total` persistés, plus le nombre actuel `live` en mémoire lorsque l'état live est disponible. Les espaces de travail secondaires non fiables enregistrés omettent `live` car leurs lectures de catalogue n'interrogent pas le pont live. La liste paginée `GET /workspace/:id/sessions` n'inclut pas de total, c'est donc la surface dédiée pour « combien de sessions existent ? » — utile lorsque les tâches planifiées ou récurrentes laissent un grand magasin local.

> ⚠️ **Analyse disque — ne pas interroger périodiquement.** Ce point de terminaison parcourt les fichiers JSONL de session locaux sous le répertoire de chats de l'espace de travail. Les réponses incluent toujours `expensive: true` et `cost: "disk_scan"`. Appelez-le rarement (rafraîchissement manuel, outils d'opérateur, chargement UI occasionnel) — jamais sur un minuteur serré ou à chaque rendu de la barre latérale. Préférez `GET /workspace/:id/sessions` pour naviguer dans les pages et `GET /daemon/status` pour les comptes de sessions live en mémoire. Une réponse avec `truncated: true` signifie que l'analyse a atteint sa limite de sécurité ou n'a pas pu classer tous les fichiers candidats, donc les comptes persistés sont des bornes inférieures.

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status` renvoie le résumé du pont live pour une seule session : `sessionId`, `workspaceCwd`, `createdAt`, `displayName` optionnel, `clientCount`, et `hasActivePrompt`. Il répond `200` avec le résumé lorsque le démon détient une session live avec cet id, et `404` (corps `{ "error": …, "sessionId": … }`) sinon. Utilisez-le pour interroger si une session connue est toujours en cours d'exécution (`hasActivePrompt`) ou combien de clients sont attachés (`clientCount`) sans récupérer et analyser toute la liste paginée de sessions :

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

Ceci est la vue brute de la session live, donc `clientCount` et `hasActivePrompt` correspondent à l'entrée correspondante dans `GET /workspace/:id/sessions` — mais les deux routes ne sont pas identiques octet par octet. Le point de terminaison de liste enrichit chaque élément avec les données du magasin de sessions persisté : son `createdAt` est le temps du premier prompt persisté, et il ajoute `updatedAt` plus un `displayName` dérivé du titre stocké ou du premier prompt. `/status` rapporte plutôt le `createdAt` propre de la session live, omet `updatedAt`, et renvoie `displayName` uniquement lorsqu'il est défini sur la session live.

`GET /session/:id/lsp` renvoie le statut LSP structuré par session. Démarrez le démon avec `--experimental-lsp` pour activer LSP dans les sessions agent générées ; sinon, la route renvoie `enabled: false` sans serveurs.

`GET /session/:id/resources` renvoie les instantanés assainis Skill et MCP de la Config propre à cette session live. Utilisez-le lorsqu'une session peut s'exécuter depuis un worktree ou un autre répertoire effectif dont les ressources diffèrent de l'espace de travail de base. Les détails d'authentification MCP, de pool, de budget et d'erreurs de découverte appartenant à l'espace de travail sont omis de cette vue de session. Vérifiez la capacité `session_resources` avant de l'appeler.

`GET /daemon/status` est l'instantané consolidé de résolution des problèmes. La commande `detail=summary` par défaut lit uniquement l'état du démon en mémoire (sessions, autorisations, compteurs de transport SSE/ACP, rejets de limitation de débit, mémoire du processus, limites résolues) et ne démarre pas le processus enfant ACP. Utilisez `GET /daemon/status?detail=full` pour les diagnostics par session, les détails de connexion ACP, les compteurs d'authentification via flux d'appareils et les sections d'état de l'espace de travail lorsque vous enquêtez activement sur un problème.

`GET /workspace/mcp` signale le runtime ACP actif et ne démarre pas le processus enfant ACP lorsqu'il est inactif ; un démon inactif renvoie `initialized: false` avec un instantané vide. Une fois qu'une session est active, il bascule sur `initialized: true` et affiche l'état réel.

`GET /workspace/providers` reçoit une réponse localement depuis le démon à partir des paramètres de l'espace de travail et de l'environnement, il ne dépend donc pas d'un processus enfant ACP actif, et `acpChannelLive` est le signal de disponibilité. Si les paramètres de l'espace de travail ou la configuration du modèle ne peuvent pas être résolus, la réponse contient `initialized: false`, un tableau `providers` vide et une entrée `errors`. La route revient à l'instantané ACP actif uniquement lorsqu'un démon est construit sans constructeur d'état du fournisseur local au démon ; la réponse locale au démon n'inclut jamais les modèles enregistrés à l'exécution.

`GET /workspace/skills` renvoie immédiatement une observation conservée du démon et la revalide en arrière-plan, de sorte qu'une lecture chaude n'attend pas le processus enfant ACP. L'objet facultatif `snapshot` signale `observedAt`, `ageMs`, `stale` et `refreshing` ; vérifiez `ageMs` avant de considérer le catalogue comme à jour. Avant la première observation réussie, une lecture dans la fenêtre d'étranglement de démarrage d'une seconde peut renvoyer `initialized: false` avec une entrée `errors` au lieu d'attendre ; il s'agit d'une indisponibilité réessayable, et non d'un catalogue vide.

Pour mettre à jour les paramètres Skill de l'espace de travail par nom, appelez `POST /workspace/skills/:name/enable` avec `{ "enabled": true | false }` après avoir vérifié la capacité `workspace_skill_settings_toggle`. Pour modifier plusieurs noms, vérifiez `workspace_skill_settings_batch_toggle` et appelez `POST /workspace/skills/enable` avec `{ "skillNames": ["review", "deploy"], "enabled": false }` ; il traite tous les noms structurellement valides ensemble, persiste toutes les modifications de déclaration résultantes dans au plus une écriture verrouillée des paramètres, et actualise les sessions ACP actives une fois si quelque chose a changé. Ces routes écrivent les fichiers `skills.disabled` et `skills.enabled` de l'espace de travail sans consulter le catalogue Skill chargé, de sorte que les noms peuvent être désactivés avant l'installation ou pendant que leur Extension est inactive. L'activation supprime une désactivation correspondante de l'espace de travail et enregistre un opt-in explicite `skills.enabled`, même avant l'installation, afin que cette entrée puisse remplacer la désactivation interne d'une Skill d'une Extension. Répéter la même déclaration est une opération nulle (`changed: false`). Leurs chemins et corps de requête sont inchangés ; les capacités spécifiques aux paramètres remplacent les balises obsolètes de bascule Skill validées par le catalogue. Le tableau batch `errors` reste pour la compatibilité de transmission et est vide pour les noms structurellement valides. Une entrée dure `skills.disabled` héritée d'une portée supérieure reste autoritaire pour la disponibilité effective, mais n'empêche pas l'espace de travail d'enregistrer ou de supprimer sa propre déclaration. Les cellules de statut Skill exposent `disabledReason` (`hard`, `default`, ou `inactive_extension`) et un `lockedScope` facultatif. Les écritures d'espace de travail non fiables sont toujours rejetées. Une réponse `deferred` signifie qu'aucun processus enfant n'était actif lors du contrôle de disponibilité ou qu'une requête modifiée a perdu son processus enfant/session pendant l'actualisation requise ; lorsque `changed` est vrai, la déclaration persistée s'applique lorsqu'un processus enfant démarre. Le fait qu'une déclaration ait réellement changé est signalé par `changed` (sur chaque résultat pour une requête batch). `skills.disabled` désactive à la fois l'utilisation manuelle et par modèle, contrairement à `disable-model-invocation: true`, qui maintient l'invocation directe `/skill-name` disponible. Pour les batches d'Extension V2, vérifiez `extension_batch_activation_v2` : `PUT /extensions/activation` modifie les valeurs globales par défaut, tandis que `PUT /workspaces/:workspace/extensions/activation` modifie les remplacements exacts pour l'espace de travail sélectionné et accepte `"inherit"` pour les effacer. Les deux acceptent des noms dans `extensionNames` ; `enabled` et `disabled` peuvent être déclarés avant l'installation, tandis que `inherit` pour un nom inconnu est une opération nulle. Chaque requête renvoie une opération à interroger. Lorsque `extension_activation_explicit_refresh` est annoncé, cette opération se termine après que la politique d'activation est engagée et n'actualise pas directement les sessions actives. Pour l'appliquer immédiatement, soumettez l'actualisation indépendante principale ou qualifiée par espace de travail de l'Extension après le succès de l'activation. Sans cette actualisation explicite, les autres espaces de travail peuvent continuer à utiliser l'activation précédente jusqu'à la prochaine passe du réconciliateur de génération de 30 secondes ; la réconciliation échouée est réessayée par les passes ultérieures.

`GET /workspace/env` et `GET /workspace/preflight` répondent toujours par `initialized: true` quel que soit l'état ACP. `env` ne consulte jamais ACP (uniquement les informations du processus du démon) ; `preflight` répond aux cellules de niveau démon à partir de `process.*` et émet des espaces réservés `status: 'not_started'` pour les cellules de niveau ACP lorsque le processus enfant est inactif.

`GET /workspace/env` signale le runtime, la plateforme, le bac à sable, le proxy du processus du démon, ainsi que la **présence** (jamais la valeur) des variables d'environnement secrètes figurant sur la liste blanche telles que `OPENAI_API_KEY`. Les URL de proxy sont dépouillées de leurs identifiants et réduites à `host:port` avant leur transmission. La route répond toujours directement depuis le processus du démon et ne lance jamais de processus enfant ACP.

`GET /workspace/preflight` renvoie une liste de contrôles de préparation. Les **cellules de niveau démon** (version Node, entrée CLI, répertoire de l'espace de travail, ripgrep, git, npm) s'affichent toujours. Les **cellules de niveau ACP** (authentification, découverte MCP, compétences, fournisseurs, registre d'outils, trafic sortant) nécessitent un processus enfant ACP actif — lorsque le démon est inactif, elles émettent des espaces réservés `status: 'not_started'` plutôt que de lancer ACP juste pour les remplir. Les échecs correspondent à un ensemble fermé d'énumérations `errorKind` (`missing_binary`, `auth_env_error`, `init_timeout`, `restore_timeout`, `protocol_error`, `missing_file`, `parse_error`, `blocked_egress`) afin que les interfaces client puissent afficher des mesures correctives structurées.

Le démon expose également des utilitaires de fichiers d'espace de travail :

- `GET /file` lit des fichiers texte. Les réponses d'instantané complet renvoient un hachage `sha256:<hex>` d'octets bruts ; les fenêtres de lignes finies provenant de fichiers supérieurs à 256 KiB l'omettent.
- `GET /file/bytes` lit des fenêtres raw byte bornées et renvoie du contenu base64.
- `POST /file/write` crée ou remplace des fichiers texte.
- `POST /file/edit` applique exactement un remplacement de texte.

L'écriture/la modification sont des **routes de mutation strictes** : le principal écouteur de boucle de confiance sans jeton accorde l'autorité d'opérateur ; les intégrations non fiables sans identifiant renvoient `token_required`. Les remplacements et les modifications nécessitent le dernier `expectedHash` issu d'un instantané complet `GET /file` (ou d'une fenêtre complète `GET /file/bytes`). Une fenêtre partielle de gros fichier ne peut pas être utilisée comme jeton de concurrence optimiste. `create` n'écrase jamais. Les écritures explicites vers des chemins ignorés sont autorisées mais auditées. Les écritures binaires, la suppression/déplacement/création de répertoires et la création récursive de parents ne font pas partie de cette surface.

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

Ouvrez ceci **avant** d'envoyer l'invite — le tampon de relecture SSE conserve les 8000 derniers événements afin qu'un abonné tardif puisse rattraper son retard via `Last-Event-ID`, mais pour le cas simple « surveiller une seule invite », il est plus facile de s'abonner d'abord et de laisser le flux se dérouler en direct.

Le flux émet `session_update` (morceaux LLM, appels d'outils, utilisation), `permission_request` (outil nécessitant une approbation), `permission_resolved` (quelqu'un a voté), `model_switched`, `model_switch_failed`, ainsi que les trames terminales `session_died` (le processus enfant agent a planté — le SSE se ferme ensuite) et `client_evicted` (votre file d'attente a débordé — le SSE se ferme ensuite).

### 5. Envoyez un prompt (retour dans le terminal d'origine)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

Le `curl -N` de l'étape 4 affichera les frames au fur et à mesure de leur arrivée.

### Garde d'arrêt Todo optionnel

Les clients démons longue durée peuvent opter pour une continuation bornée lorsque la chaîne de travail actuelle écrit avec succès une liste Todo de premier niveau puis s'arrête alors que des éléments restent en attente ou en cours. Ajoutez ceci à `settings.json` et redémarrez le démon :

```json
{
  "experimental": {
    "todoStopGuard": true
  },
  "tools": {
    "todoWrite": {
      "enabled": true
    }
  }
}
```

La garde ajoute au maximum deux appels consécutifs au modèle principal sans nouvelle saisie utilisateur. Un message utilisateur en cours de tour est traité en premier et démarre une nouvelle étape de deux tentatives ; les résultats de relance/continuation et connexes en arrière-plan conservent le budget de l'étape actuelle. Chaque appel et l'état final d'épuisement apparaissent comme des événements `session_update` rejouables avec `_meta.source: "todo_stop_guard"` ; les métadonnées incluent la tentative et le nombre d'éléments non terminés, mais jamais le texte des Todo. Une invite complète mise en file d'attente est également traitée en premier, et les règles existantes d'autorisation/annulation restent inchangées.

Pendant qu'une chaîne armée attend des travaux d'arrière-plan connexes, les déclenchements cron/boucles non liés et les notifications d'anciennes tâches sont différés. Les travaux récurrents sont bornés et fusionnés par tâche jusqu'à ce que la chaîne cède.

L'option a une valeur par défaut de `false`, nécessite un redémarrage et est désactivée en mode sécurisé, en mode nu et en mode d'approbation `plan`. Elle est uniquement en mémoire : le chargement de l'état Todo depuis le disque ou le redémarrage du démon ne l'active pas. Définissez `tools.todoWrite.enabled` dans settings.json et redémarrez Qwen Code, puis une nouvelle invite ordinaire doit exécuter avec succès son propre `todo_write` de niveau supérieur ; les tentatives/reprises et la reconnexion client en direct conservent la chaîne de travail actuelle en mémoire. La modification réussie du répertoire de travail de la session efface cet état afin qu'un ancien Todo ne puisse pas reprendre dans un nouvel espace de travail.

## Authentification [#authentication]

Pour tout ce qui dépasse la boucle locale, chaque requête API nécessite un jeton bearer. Fournissez-en un stable pour les clients réutilisables, ou commencez sans en fournir un et utilisez le jeton éphémère que le démon génère et affiche :

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → uses QWEN_SERVER_TOKEN; generates an ephemeral token if neither token source is supplied
```

Les clients envoient ensuite `Authorization: Bearer <token>` sur les requêtes API normales — `$QWEN_SERVER_TOKEN` si vous en avez exporté un, ou le jeton bearer affiché au démarrage lorsque le démon l'a généré (ce chemin ne définit jamais la variable d'environnement, donc copiez la valeur depuis la sortie de démarrage). `/health` est exempté **uniquement sur les liaisons loopback ordinaires** afin que les sondes de vivacité k8s/Compose à l'intérieur du pod n'aient pas besoin d'identifiants. Sur les liaisons non-loopback (`--hostname 0.0.0.0` etc.), `/health` exige le jeton avec les autres routes API normales — sinon un attaquant peut sonder des adresses arbitraires pour confirmer l'existence du démon. L'ingress webhook du canal est séparé dans tous les modes et utilise son `x-qwen-webhook-secret` configuré au lieu du bearer du démon. Utilisez `/capabilities` pour vérifier que votre jeton configuré est correct de bout en bout :

> **Loopback renforcé (`--require-auth`).** Le comportement par défaut sans jeton sur loopback convient à un ordinateur portable mono-utilisateur mais est dangereux sur des hôtes de développement partagés, des runners CI ou des postes de travail multi-locataires où tout utilisateur local peut `curl 127.0.0.1:4170`. Passez `--require-auth` pour rendre le jeton bearer obligatoire sur chaque route API normale — y compris `/health` et `/capabilities` — même lors d'une liaison à `127.0.0.1`. L'ingress webhook du canal reste authentifié indépendamment par `x-qwen-webhook-secret`. Les routes de documents et d'actifs Web Shell restent pré-authentifiées ; utilisez `--no-web` pour les supprimer. Le démarrage échoue si aucune source de jeton n'est résolue, et sur loopback cela signifie `--token`, `QWEN_SERVER_TOKEN` ou `--open-with-auth` — ce dernier installe son propre jeton généré avant le démarrage, donc `--require-auth --open-with-auth` démarre. La génération dépend de l'orthographe de `--hostname` : les orthographes loopback (`127.0.0.0/8`, `localhost`, `::1`, `[::1]`) ne génèrent jamais rien, tandis que toute autre orthographe — y compris un nom DNS qui se résout fortuitement en loopback — génère un bearer éphémère qui satisfait `--require-auth` et est affiché au démarrage (jeton uniquement si le socket s'est lié en loopback), tournant à chaque redémarrage, donc épinglez `--token` ou `QWEN_SERVER_TOKEN` pour les clients réutilisables. Avec le drapeau activé, un client **non authentifié** ne peut pas lire `/capabilities` pour découvrir que l'authentification est requise ; la surface de découverte est le corps de réponse 401 lui-même. Une fois authentifié, la balise `caps.features.require_auth` est une confirmation post-authentification que le déploiement est renforcé (utile pour les interfaces d'audit / conformité) :
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
# Paste the bearer the daemon printed at startup, or your own QWEN_SERVER_TOKEN.
TOKEN='<printed bearer>'
curl -H "Authorization: Bearer $TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

La comparaison de token est en temps constant (SHA-256 + `crypto.timingSafeEqual`) ; les réponses 401 sont uniformes entre "header manquant", "schéma incorrect" et "token incorrect" afin qu'un side-channel ne puisse pas faire la distinction.

`--open-with-auth` est une commodité appartenant au CLI, pas une autre source de token du démon : il sélectionne `--token` lorsque cette option est définie (même vide), sinon `QWEN_SERVER_TOKEN`, puis tronque la valeur sélectionnée et génère uniquement si le résultat est vide. Le démon ne persiste pas la valeur générée ni ne l'exporte comme `QWEN_SERVER_TOKEN` ; le handoff interne existant pour l'enfant authentifié reste inchangé. Le Web Shell stocke sa copie navigateur uniquement dans le `sessionStorage` de l'onglet récepteur ; ce mode n'ajoute aucun mécanisme de découverte d'identifiant cross-tab ou pour les clients externes. Le token n'est pas indépendamment révocable ni lié à une identité client. La possession accorde la même autorité de démon que n'importe quel autre bearer token. Consultez la [conception du lancement Web Shell authentifié](../design/2026-08-22-serve-open-with-auth.md) et les travaux futurs connexes dans [#4514](https://github.com/QwenLM/qwen-code/issues/4514).

## HTTPS / TLS (pour l'accès mobile / cross-device) [#https--tls-for-mobile--cross-device-access]

Par défaut, le démon sert du HTTP en clair. C'est très bien sur `localhost`, mais un téléphone ou une tablette atteignant une IP LAN (`https://192.168.x.x:4170`) n'est **pas** un [contexte sécurisé](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) sur `http://` — les navigateurs bloquent donc `getUserMedia` (entrée vocale), WebRTC et les autres API réservées aux contextes sécurisés. Passez `--tls-cert` + `--tls-key` pour servir le Web Shell en HTTPS et les débloquer :

```bash
# 1. Install a local CA and trust it (one-time). The mobile device must
#    also trust this CA — mkcert prints where the root cert lives.
mkcert -install

# 2. Generate a cert for your machine's LAN IP. Add localhost / 127.0.0.1 to
#    the SANs too: with `--open`, the daemon rewrites the browser URL to
#    127.0.0.1, so a cert scoped to only the LAN IP would be rejected with
#    ERR_CERT_COMMON_NAME_INVALID. (mkcert names the output after all hosts.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. Start the daemon over HTTPS. Non-loopback binds still require a token,
#    and the browser Origin must be allowed through CORS.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve listening on https://0.0.0.0:4170
```

Notes :

- **Les deux drapeaux ou aucun** — le démarrage échoue si seul l'un est fourni (un certificat sans clé ne peut pas démarrer un écouteur HTTPS).
- **TLS est orthogonal à l'authentification** — HTTPS chiffre le transport ; lorsqu'un jeton bearer est configuré, il contrôle les routes API normales sauf `/health` sur une liaison loopback ordinaire. Passez `--require-auth` pour contrôler aussi `/health` sur loopback. L'ingress webhook du canal utilise toujours son propre secret partagé. Les liaisons non-loopback portent toujours un jeton avec ou sans TLS — celui que vous passez, ou celui éphémère que le démon génère et affiche au démarrage.
- **La portée est limitée à la terminaison TLS** — pas d'auto-génération, pas d'ACME / Let's Encrypt. C'est une commodité LAN / dev ; pour les déploiements exposés à Internet, terminez TLS derrière un proxy inverse (voir le modèle de menace ci-dessous).
- **Les workers de canal rappellent le démon en `https://`** — ils doivent donc aussi faire confiance au certificat de service. Un certificat auto-signé (ou une chaîne complète portant sa propre racine) n'a besoin de rien : le démon l'injecte dans le `NODE_EXTRA_CA_CERTS` de chaque worker. Le flux mkcert ci-dessus est **émis par une CA**, donc la feuille seule ne peut pas ancrer la chaîne — exportez `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"` dans l'environnement de lancement du démon avant de démarrer avec `--channel`. Une valeur définie par l'opérateur est _fusionnée_ avec le certificat du démon, pas remplacée. Sans cela, le démon démarre normalement tandis que chaque worker de canal boucle en redémarrage sur `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ; le log du démon nomme ce manque au démarrage.
- **Une liaison wildcard IPv6 est réduite sur le loopback réellement attribué par cet hôte** — `--hostname ::` (ou `[::]`) lie un socket IPv6. (Un `--hostname` vide n'atteint jamais l'écouteur : le démarrage le refuse comme erreur opérateur avant la liaison, donc un fichier compose avec un `HOSTNAME` non défini échoue bruyamment au lieu de silencieusement devenir wildcard.) Ce socket est dual-stack (Node épingle `IPV6_V6ONLY=0` dessus, donc le sysctl `net.ipv6.bindv6only` ne change rien à cela), et les deux loopbacks y accèdent généralement — mais un hôte sans IPv4 du tout n'a que `::1`, tandis qu'un hôte qui lie `::` mais ne porte pas de `::1` sur son loopback (par exemple `net.ipv6.conf.lo.disable_ipv6=1`) n'a que `127.0.0.1`. Les workers sont envoyés vers `[::1]` lorsque cet hôte l'attribue, et vers `127.0.0.1` sinon. Un certificat de service pour une liaison wildcard IPv6 doit porter les deux loopbacks dans ses SANs (`mkcert localhost 127.0.0.1 ::1` couvre cela) ; le diagnostic de confiance au démarrage inspecte l'URL exacte que les workers composeront et nomme l'écart. `--hostname 0.0.0.0` est inchangé et a toujours besoin de `127.0.0.1`.
- **La rotation de `--tls-cert` en place nécessite un redémarrage du démon** — le démon sert les octets qu'il a lus au démarrage, donc jusqu'à ce qu'il redémarre, les workers relancés peuvent charger des contenus plus récents que ceux que le démon présente et leurs handshakes échouent.

## Installer Web Shell comme application

Sur un navigateur pris en charge, ouvrez la Web Shell du démon et utilisez l'action **Installer l'application** ou **Ajouter à l'écran d'accueil** du navigateur. L'application installée ouvre le même serveur dans une fenêtre autonome portant le nom et l'icône de Qwen Code. Sur iOS, utilisez le menu Partager du navigateur et **Ajouter à l'écran d'accueil**. La disponibilité dépend du navigateur et de l'appareil.

Le démon fournit lui-même les métadonnées PWA : `GET /manifest.webmanifest` et `GET /sw.js` sont des routes pré-authentifiées (le navigateur récupère les deux avant l'existence d'un en-tête Authorization), et `sw.js` est servi avec `Service-Worker-Allowed: /` afin que sa portée couvre l'origine entière. Le worker met en cache uniquement les ressources de build Vite hachées par contenu, en stratégie cache-first. Les icônes publiques non hachées et le manifeste sont revalidés via HTTP. Les appels API, les flux d'événements et les requêtes portant un en-tête d'autorisation restent sur le réseau.

Utilisez une connexion HTTPS fiable pour un téléphone ou autre appareil distant ; HTTP sur `localhost` ou une adresse de bouclage est pris en charge pour le développement local. HTTP simple sur une IP LAN n'active pas le service worker. Voir les instructions TLS ci-dessus ; l'installation ne contourne pas les vérifications de certificat ou d'authentification.

L'installation lance toujours la racine du serveur. Un jeton, un lien de session ou un espace de travail dans l'adresse actuelle n'est jamais inclus dans l'URL de lancement de l'application. Vous devrez peut-être saisir à nouveau le jeton dans l'application installée : elle utilise le flux d'authentification Web Shell existant et n'ajoute pas de stockage persistant des identifiants.

Le serveur doit rester en cours d'exécution et accessible. Après l'activation et la prise de contrôle d'une page par le service worker, l'ouverture de la racine ou d'un lien de session lorsque la connexion échoue affiche une page de nouvelle tentative. Aucune conversation, fichier, réponse API ou identifiant n'est enregistré dans un cache de service worker. Les erreurs HTTP existantes proviennent toujours du serveur. Cette première étape ne fournit pas de travail hors ligne, de Web Push ni de notifications lorsque l'application est fermée. Les workers mis à jour s'activent immédiatement avec `skipWaiting()` et `clients.claim()`, remplaçant le worker précédent pour les onglets ouverts sans forcer le rechargement de la page. L'activation supprime les anciens caches de shell Qwen et conserve les caches non liés.

Les métadonnées d'installation utilisent l'identité intégrée de Qwen Code ; le branding personnalisé au moment de l'exécution s'applique toujours à l'intérieur de la Web Shell. Les consommateurs de bibliothèque embarqués n'enregistrent pas le worker. Pour supprimer l'installation, utilisez la gestion des applications de votre navigateur ou système d'exploitation ; pour supprimer son service worker et les données de site stockées, utilisez les paramètres de site du navigateur.

## Qwen Live (expérimental)

Qwen Live s'exécute via le Web Shell sur toutes les plateformes : l'onglet du navigateur sert de microphone et de haut-parleur (WS `/live/web`), donc ouvrez le Web Shell via `https` ou `localhost` pour accéder au microphone. L'application macOS native `Qwen Live Host` est désactivée par défaut ; pour l'essayer, démarrez un démon macOS avec `QWEN_SERVE_LIVE_NATIVE_HOST=1`, ce qui restaure le WebSocket `/live/host`, la capacité `realtime_voice` et le téléchargement Host lorsque Live est activé. Sans cela, un `Qwen Live Host.app` déjà installé reste incapable de se connecter (le démon ne s'enregistre pas `/live/host`) ; quittez-le et utilisez le Web Shell.

## Flags CLI

| Drapeau | Défaut | Objectif |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>` | `4170` | Port TCP. `0` = port éphémère attribué par l'OS. |
| `--hostname <addr>` | `127.0.0.1` | Interface de liaison. Toute liaison au-delà de la boucle locale nécessite un jeton ; si ni `--token` ni `QWEN_SERVER_TOKEN` n'en fournissent un, un jeton éphémère est généré et affiché au démarrage. |
| `--local-control` | `false` | Partagez le Web Shell sur une interface IPv4 privée sélectionnée avec un jeton d'appariement révocable possédé par le démon, un code QR terminal, une origine de navigateur exacte et une inhibition du sommeil au mieux. Se compose avec `--token`, `--allow-origin` et `--port 0` ; entre en conflit avec `--no-web` et `--hostname` non par défaut. Utilisez `--local-control-address` lorsque plusieurs candidats LAN sont disponibles, et ajoutez `--tls-cert` + `--tls-key` pour les API de navigateur en contexte sécurisé telles que la saisie vocale. |
| `--local-control-address <ip>` | — | Quelle adresse IPv4 LAN partager lorsque l'hôte a plus d'un candidat. Nécessaire uniquement si `--local-control` signale un choix ambigu. |
| `--token-qr` | — | Affichez le code QR contenant le jeton même lorsque stdout est capturé (pas un terminal interactif) et que le porteur est un jeton fourni par l'opérateur (stable), qui est retenu par défaut pour garder les identifiants stables hors des journaux collectés. Peut également être défini via le paramètre `serve.tokenQr`, respecté uniquement dans les portées utilisateur, système et valeurs par défaut système ; le drapeau l'emporte lorsqu'il est passé. Omettre le drapeau **n'est pas** la même chose que `--no-token-qr` : l'omission laisse la politique par défaut (QR sur un terminal interactif ou pour un jeton généré), tandis que `--no-token-qr` supprime le QR du jeton de démarrage rapide pour cette exécution sur tous les chemins de démarrage rapide, afin qu'un paramètre persistant puisse être rejeté par exécution. Aucun des deux ne régit le QR d'appariement Local Control. |
| `--token <str>` | — | Jeton porteur. Repli sur la variable d'environnement `QWEN_SERVER_TOKEN` (espaces blancs de début/fin supprimés — pratique pour `$(cat token.txt)`). Une liaison non-boucle locale sans aucune source génère un jeton éphémère. Une valeur explicitement vide refuse toujours de démarrer sur une liaison non-boucle locale ; sur la boucle locale, elle masque la variable d'environnement et sélectionne le mode de confiance sans jeton (ou refuse catégoriquement sous `--require-auth`). |
| `--require-auth` | `false` | Refusez de démarrer sans jeton porteur, même sur la boucle locale. Renforce le défaut développeur `127.0.0.1` pour les hôtes de développement partagés / runners CI / postes de travail multi-locataires où tout utilisateur local peut atteindre l'écouteur. Cet échec rapide est spécifique à la boucle locale : la boucle locale ne démarre qu'avec l'une de ses trois sources de jetons — `--token`, `QWEN_SERVER_TOKEN` ou `--open-with-auth`, qui installe son propre jeton généré avant le démarrage (la génération est supprimée sur la boucle locale) — tandis que sur une liaison non-boucle locale, le jeton éphémère généré satisfait le drapeau. Restreint également `/health` derrière le porteur. |
| `--enable-session-shell` | `false` | Activez l'exécution directe du shell de session. Efficace avec un jeton porteur configuré ou le mode de confiance boucle locale ; les appels nécessitent toujours un `X-Qwen-Client-Id` valide lié à la session. |
| `--tls-cert <path>` | — | Chemin vers un fichier de certificat PEM. Servez via **HTTPS** au lieu de HTTP. Doit être associé à `--tls-key` (le démarrage échoue si seul l'un est fourni). Débloque les API de navigateur en contexte sécurisé — saisie vocale (`getUserMedia`), WebRTC — sur une IP LAN, que les navigateurs bloquent autrement sur `http://` simple. Terminaison TLS uniquement ; pas de génération automatique / ACME. Voir [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) ci-dessous. |
| `--tls-key <path>` | — | Chemin vers un fichier de clé privée PEM. Doit être associé à `--tls-cert`. |
| `--max-sessions <n>` | `32` | Limite de sessions actives simultanées. Les nouvelles demandes `POST /session` qui engendreraient un nouvel enfant renvoient `503` (avec `Retry-After: 5`) lorsque la limite est atteinte ; les attachements aux sessions existantes NE SONT PAS comptés. Définissez sur `0` pour désactiver. Peut également être défini via `serve.maxSessions` (portées utilisateur, système et valeurs par défaut système uniquement) ; le drapeau l'emporte lorsqu'il est passé. Dimensionné pour usage mono-utilisateur / petite équipe ; augmentez-le si votre déploiement a la marge RAM/FD (~30–50 Mo par session). |
| `--max-total-sessions <n>` | `800` ou dérivé | Entier non négatif facultatif, limite globale du démon sur la création de nouvelles sessions parmi tous les environnements de travail enregistrés. Il s'applique aux nouvelles sessions enfants, à la restauration de sessions et aux sessions créées par branche/fork ; l'attachement à une session active existante ne consomme pas de place. Définissez sur `0` pour illimité. Par défaut 800 lorsque la capacité d'enregistrement dépasse 25 (y compris le défaut 256). À des capacités de 25 ou moins, un environnement de travail au démarrage ou restauré est illimité ; plusieurs dérivent le total de la limite par environnement et de ce nombre. L'enregistrement dynamique ultérieur ne le recalcule pas. |
| `--max-pending-prompts-per-session <n>` | `5` | Limite par session sur les invites acceptées par `POST /session/:id/prompt` mais non encore résolues, y compris les invites en file d'attente et l'invite active. Le pont rejette le débordement de manière synchrone avec `503`, `Retry-After: 5` et `code: "prompt_queue_full"` avant de renvoyer un `promptId`. Définissez sur `0` pour désactiver. `branchSession` se sérialise sur la même FIFO mais ne compte pas dans cette limite d'invites. |
| `--workspace <path>` | `process.cwd()` | Répertoire de l'espace de travail absolu enregistré par ce démon. Répétez le drapeau pour héberger plusieurs espaces de travail dans un seul processus ; le premier est principal et reste la valeur par défaut lorsqu'une requête omet `cwd`. Les valeurs relatives sont rejetées. Les demandes de session dont le `cwd` canonique n'est pas enregistré renvoient `400 workspace_mismatch`. |
| `--conversations-dir <path>` | — | Racine du répertoire de travail des Conversations pour les sessions autonomes et en direct. Remplace `QWEN_CONVERSATIONS_DIR` ; lorsque ni l'un ni l'autre ne sont définis, utilise `~/Documents/Qwen Code/Conversations`. Également accepté par `qwen daemon start`. Voir [Répertoire de travail des Conversations](#conversations-working-directory). |
| `--memory-project-scope <mode>` | `workspace` | Mode de partitionnement de la mémoire du projet. `workspace` (par défaut) indexe la mémoire par le répertoire exact de l'espace de travail enregistré afin que chaque espace de travail du démon ait sa propre mémoire isolée ; `git-root` est le mode de compatibilité hérité partagé par les espaces de travail résolus vers la même racine Git. Remplace `QWEN_CODE_MEMORY_PROJECT_SCOPE` lorsqu'il est fourni ; une valeur d'environnement vide est considérée comme non définie, tandis qu'une valeur non vide non reconnue est ignorée avec un avertissement unique et conserve le comportement hérité `git-root`. La nouvelle valeur par défaut ne migre pas la mémoire de projet existante basée sur la racine Git — utilisez une portée explicite `git-root` pour lire ces entrées lors de la migration. |
| `--channel <name\|all>` | — | Travailleur de canal expérimental géré par le démon. Répétez le drapeau pour sélectionner plusieurs canaux configurés, ou passez `all` pour démarrer tous les canaux configurés. `all` ne peut pas être combiné avec des canaux nommés. Les valeurs `cwd` des canaux sélectionnés doivent se résoudre vers un espace de travail enregistré ; un démon multi-espaces de travail exécute un travailleur par espace de travail propriétaire. Le travailleur est possédé par `qwen serve` ; arrêtez le démon pour arrêter les canaux gérés par serve. |
| `--max-connections <n>` | `256` | Limite de connexions TCP au niveau de l'écouteur (`server.maxConnections`). Bornes le nombre brut de sockets indépendamment du nombre de sessions — les clients SSE lents / fantômes sont rejetés au moment de l'acceptation une fois plein. Augmentez parallèlement à `--max-sessions` si votre déploiement s'attend à de nombreux abonnés SSE par session. |
| `--memory-budget-mb <n>` | 50 % du cgroup/hôte | Budget total de mémoire en Mo pour tout l'arbre de processus du démon. Lorsqu'il n'est pas défini, il est dérivé comme 50 % de la limite du cgroup ou de la mémoire de l'hôte ; dans les deux cas, la valeur effective est plafonnée à la mémoire disponible résolue, et les chiffres configurés et effectifs sont signalés. Il pilote la partition ACP fixe sélectionnée par `--child-heap-mode` et la croissance adaptative du journal en direct ; ce n'est pas une limite RSS totale : un pool de croissance global au démon dérivé comme 5 % du budget effectif (plafonné à `1024` Mo ; sur les hôtes rapportant `insufficientMemory`, le pool est de 0 et la croissance adaptative est désactivée) est partagé par chaque pont d'espace de travail — voir `--max-journal-bytes`. Les chiffres résolus apparaissent sous `limits.memory` dans `GET /daemon/status`, aux côtés des comptes d'enfants enregistrés et en direct et des parts indicatives par enfant sous `runtime.memory`. Un hôte trop petit pour le minimum signale `insufficientMemory` plutôt que d'être ajusté vers le haut ; parce que la fraction dérivée est de 50 %, tout hôte inférieur à ~2 Go déclenche cela. Passez un `--memory-budget-mb 1024` explicite sur un tel hôte pour remplacer la figure dérivée (le drapeau nécessite toujours au moins 1024 Mo de mémoire disponible pour lever l'avertissement). Doit être un entier dans `[1024, 1048576]`. |
| `--memory-pressure-mode <mode>` | `observe` | Si le démon transforme sa propre lecture de mémoire en verdict. `observe` (par défaut) signale le niveau de pression sous `runtime.memory.pressure` dans `GET /daemon/status` et soulève un problème `daemon_memory_pressure` — un `warning`, donc le statut global `status` laisse `ok` — chaque fois que le niveau quitte `normal`. `off` signale toujours chaque chiffre, y compris le niveau, mais ne soulève aucun problème, donc le statut global `status` reste inchangé ; utilisez-le lors de la calibration, ou si vous alertez sur le statut de niveau supérieur. Le niveau est le pire de deux ratios : RSS contre mémoire disponible (ce que surveille le tueur OOM du cgroup) et tas V8 utilisé contre le plafond de tas de ce processus. Il couvre uniquement le processus racine du démon ; comparez-le avec `runtime.memory.children.rssBytes` pour les enfants. Rien ne remédie dans aucun des modes. L'un de `off`, `observe`. |
| `--child-heap-mode <mode>` | `observe` | `off` désactive la partition ; `observe` signale `limits.memory.childHeap` sans modifier la création de processus ; `admit` applique uniquement le nombre d'enfants concurrents modélisé. L'activation expérimentale optionnelle `enforce` donne également à chaque enfant ACP géré le plafond d'espace ancien fixe `perChildCeilingMb` et signale `limits.memory.enforced: true`. Les deux modes d'admission peuvent récupérer un ACP inactif éligible avant de refuser avec `acp_child_capacity_exhausted` ; les sessions en direct restent protégées. L'enregistrement est indépendant de la capacité des enfants. Les configurations d'admission à zéro emplacement échouent au démarrage. Les drapeaux de tas Node hérités fixes sont normalisés dans `enforce` ; les drapeaux en pourcentage entrent en conflit et sont rejetés. Le plafond limite l'espace ancien, pas le RSS ou les descendants MCP. Calibrez votre charge de travail avant d'activer ; un compte de refus nul ne prouve pas la sécurité du tas. Les modifications de mode et de budget nécessitent un redémarrage du démon ; redémarrez avec `admit` pour annuler l'application du tas. |
| `--event-ring-size <n>` | `8000` | Profondeur de l'anneau de relecture SSE par session (objectif #3803 §02). Définit le backlog disponible pour `GET /session/:id/events` avec `Last-Event-ID: N`. Plus grand = plus de marge de reconnexion au coût de quelques centaines de Ko de RAM supplémentaires par session. Les clients SDK peuvent également demander une limite de backlog plus grande par abonné sur une souscription spécifique via `?maxQueued=N` (plage `[16, 2048]`, par défaut 256). Les démons émettent également une trame SSE non terminale `slow_client_warning` à 75 % de remplissage de la file d'attente afin que les clients puissent vider / se reconnecter avant d'être expulsés. Pré-vol `caps.features.slow_client_warning`. |
| `--compacted-replay-max-bytes <n>` | `4194304` | Limite de bytes par session en direct pour les événements de relecture conservés dans le instantané borné renvoyé par `POST /session/:id/load`. La limite s'applique à `compactedReplay` ; le `liveJournal` actuel en cours est séparément plafonné par `--max-journal-events` et `--max-journal-bytes` (les plafonds de base que la croissance adaptative peut augmenter — voir `--max-journal-bytes`). Les valeurs doivent être des entiers sûrs positifs ; les valeurs invalides échouent au démarrage, et le plafond dur est de 256 MiB. Lorsque la relecture conservée plus ancienne est supprimée, l'instantané commence avec `history_truncated`. Cela ne limite pas la transcription sur disque. |
| `--max-journal-events <n>` | `10000` | Plafond de base par session sur les entrées de relecture conservées dans le `liveJournal` en cours pour le tour actuel non terminé. Les morceaux consécutifs compatibles de texte ou de pensée partagent une entrée, avec au maximum 256 événements source par entrée ; les autres limites d'événements sont préservées. En cas de dépassement, le démon essaie d'abord la croissance adaptative (voir `--max-journal-bytes`) ; si aucune marge n'est accordée ou si l'accord ne couvre pas le dépassement, les entrées les plus anciennes sont supprimées et un marqueur `history_truncated` est préfixé. Les comptes d'événements source du marqueur `truncatedEvents` et `retainedEvents` décrivent les événements source. Doit être un entier sûr positif. Épingler ce drapeau (ou `--max-journal-bytes`) désactive la croissance adaptative. |
| `--max-journal-bytes <n>` | `8388608` | Limite de base en octets par session pour les événements `liveJournal` en cours, calculée à partir des événements sources sérialisés même lorsque des fragments compatibles partagent une entrée de relecture. Lorsqu'un tour dépasse la limite, la croissance adaptative augmente les limites de la session vers le double (jusqu'à une limite dure par session de 256 MiB, limitée par la marge restante du pool) tant que la croissance accordée sur toutes les sessions actives du démon tient dans un pool de croissance partagé unique dimensionné à 5 % du budget mémoire effectif du démon — la valeur `--memory-budget-mb` si fournie, plafonnée à la mémoire disponible résolue, sinon 50 % de la mémoire auto-détectée (voir `--memory-budget-mb`) — plafonné à `1024` Mo ; sur les hôtes signalant `insufficientMemory`, le pool est à 0 et la croissance adaptative est désactivée. La croissance se produit à la demande, et seulement dans la mesure permise par le pool ; lorsqu'elle est refusée, que le pool est épuisé ou qu'une allocation ne couvre pas le dépassement, les entrées les plus anciennes sont supprimées entièrement (au moins une entrée est toujours conservée), afin que la queue retenue puisse être bien plus petite que la limite. Épingler cet indicateur (ou `--max-journal-events`) désactive la croissance adaptative. Doit être un entier sûr positif. Par défaut : 8 MiB. |
| `--mcp-client-budget <n>` | — | Limite entière positive sur les clients MCP actifs. Lorsque `mcp_workspace_pool` est annoncé, la limite et les transports sont partagés par runtime de workspace ; lorsque le tag est absent, le gestionnaire hérité par session l'applique. Combinez avec `--mcp-budget-mode`. Lorsqu'il n'est pas défini, aucune application basée sur le comptage (mais `GET /workspace/mcp` signale toujours `clientCount`). Distinct de `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code, qui contrôle la concurrence au démarrage plutôt que le nombre total de clients actifs. Pré-vol `caps.features.mcp_guardrails` et `caps.features.mcp_workspace_pool`. |
| `--mcp-budget-mode <m>` | `warn` / `off` | Comment `--mcp-client-budget` est appliqué. `warn` (par défaut lorsque le budget est défini) : aucun refus, le champ `budgets[0].status` du snapshot passe à `warning` à ≥75 % du budget. `enforce` : les connexions dépassant la limite sont refusées, la cellule par serveur affiche `disabledReason: 'budget'`, déterministe selon l'ordre de déclaration `mcpServers`. `off` (par défaut lorsque le budget n'est pas défini) : pure observabilité. Le boot rejette `enforce` sans budget. |
| `--external-tool-guard-mode <m>` | `off` | Politique gérée ACP externe pré-exécution. `off` n'effectue aucun appel fournisseur et n'annonce aucune capacité. `required` échoue au démarrage sauf si un fournisseur compatible complète le handshake v1, puis échoue chaque invocation d'outil top-level supportée fermée sauf si sa seule requête prepare est autorisée. |
| `--external-tool-guard-endpoint <url>` | — | URL du fournisseur HTTP(S) loopback uniquement origine utilisée en mode `required`, par exemple `http://127.0.0.1:8787`. Les chemins, identifiants URL, redirections, hôtes non-loopback et routage proxy ne sont pas acceptés. |
| `--external-tool-guard-timeout-ms <n>` | `3000` | Entier `100..30000` ; s'applique indépendamment au handshake de démarrage et à chaque requête prepare. |
| `--http-bridge` | `true` | Mode Stage 1 : la production tente de préchauffer un enfant `qwen --acp` primaire pour la compatibilité et réessaie à la première utilisation après échec, tandis que chaque secondaire de confiance peut démarrer un enfant à la demande. Les sessions ciblant un runtime multiplexent via son enfant ACP `newSession()` ; les secondaires non fiables ne peuvent pas démarrer ACP. Le mode natif in-processus Stage 2 devient disponible plus tard. |
| `--initialize-timeout-ms <n>` | `10000` | Timeout de requête enfant ACP, incluant le handshake `initialize` (ms). Doit être un entier positif jusqu'à `2147483647`. Les valeurs supérieures au plafond du timer JS (`2^31-1`) sont rejetées au boot car Node les compresse silencieusement à 1 ms. Les déploiements conteneurs froids nécessitant plus de marge pour le démarrage de l'enfant peuvent augmenter cette valeur ; la même valeur gouverne `newSession`, les polls de statut workspace et autres deadlines de méthodes ext ACP. |
| `--session-restore-timeout-ms <n>` | `60000` | Deadline de chargement/reprise de session ACP en millisecondes. Doit être un entier positif jusqu'à `2147483647` ; `0` est invalide. Si omis, le défaut est 60 secondes, augmenté à un `--initialize-timeout-ms` explicitement fourni lorsque cette valeur est plus grande ; un timeout initialize plus court n'abaisse jamais le budget de restauration. Le SDK et Web Shell ajoutent 10 et 15 secondes de marge client. Un timeout renvoie `504 session_restore_timeout` retryable ; cela n'implique pas que le démon lui-même a quitté. |
| `--allow-origin <pat>` | — | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Liste blanche cross-origin pour les clients navigateur. Répétable. Chaque valeur est `*` (n'importe quelle origine — sur les binds loopback le boot refuse quand aucun token bearer n'est configuré ; sur les binds non-loopback un token éphémère généré satisfait ces gardes, donc les refus sont uniquement loopback ; `--require-auth` sur loopback est recommandé afin que `/health` soit également gated par bearer, car il est pre-auth sur loopback par défaut ; les assets statiques Web Shell restent pre-auth dans tous les modes, donc passez `--no-web` pour les retirer) ou une origine URL canonique (`<scheme>://<host>[:<port>]`, sans slash final / chemin / userinfo / query). Une origine **loopback** canonique peut utiliser `:*` pour le port (`<scheme>://<loopback-host>:*`, par exemple `http://127.0.0.1:*`) pour admettre cet hôte sur n'importe quel port ; elle nécessite un token bearer, correspond exactement à l'hôte (`127.0.0.1`, `localhost` et `[::1]` sont des entrées distinctes), et est honorée à la fois par le matcher CORS REST et la gate CSRF WebSocket. Sans token, les origines HTTP(S) doivent être loopback sur les binds loopback ; sur les binds non-loopback le token généré satisfait la même garde. Les origines HTTP(S) distantes s'authentifient avec le bearer sur chaque route API ; les exceptions pre-auth sont uniquement les routes document/asset Web Shell, le sandbox App MCP, l'ingress webhook channel, qui s'authentifie avec son propre `x-qwen-webhook-secret`, et `/health` sur les binds loopback (gated par bearer ailleurs). Les extensions navigateur conservent l'accès sans token localement. Les wildcards hôte et sous-domaine (`https://*.example.com`) ne sont intentionnellement pas supportés — listez chaque hôte explicitement, ou utilisez `*` avec un token configuré (et `--require-auth` pour un durcissement complet) ; la wildcard port loopback ci-dessus est la seule forme de wildcard. Les origines correspondantes reçoivent des headers de réponse CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, methods, headers, max-age, et `Retry-After` exposés) ; les origines non correspondantes reçoivent toujours un 403 avec la même enveloppe que le mur actuel. `Origin: null` (iframes sandboxed, docs file://) est toujours rejeté, même sous `*`. Pré-vol via `caps.features.allow_origin`. Les hits self-origin loopback ne sont pas affectés. |
| `--web` / `--no-web` | `true` | Sert le SPA Web Shell construit à la racine du démon (navigations document `GET /`, `/assets/*`, `/manifest.webmanifest`, `/sw.js` et `GET /session/<id>`). Ces points d'entrée sont enregistrés **avant** la gate d'auth bearer — un navigateur ne peut pas attacher un token à une sous-ressource `<script>` ou une navigation barre d'adresse, et le shell ne porte aucun secret. Les requêtes API suivent la politique d'autorité normale du démon : les tokens configurés gate les routes API normales sauf `/health` loopback sauf si `--require-auth` est défini, l'ingress webhook channel utilise toujours son propre shared secret, et le listener primary trusted-loopback sans token a un accès opérateur complet. Le fallback deep-link SPA pour tous les autres chemins se trouve derrière le middleware bearer. Sur les binds non-loopback, un avertissement stderr d'une ligne note que l'UI est accessible sans auth. Utilisez `--no-web` pour un démon API-only. Aucun effet lorsque le build omet les assets Web Shell (le démon log un breadcrumb et tourne en API-only). |
| `--open` | `false` | Une fois l'écouteur démarré, ouvrez le Web Shell dans votre navigateur par défaut à l'URL du démon (avec `#token=` ajouté comme fragment d'URL lorsqu'un jeton est résolu — configuré ou généré — car un fragment n'est jamais envoyé au serveur, gardant ainsi le jeton hors des journaux d'accès et des en-têtes Referer). Aucune action avec `--no-web`, ou dans les environnements sans interface graphique / CI / SSH où aucun navigateur n'est disponible. |
| `--open-with-auth` | `false` | Ouvrir le Web Shell avec une authentification par porteur sur la boucle locale. Nécessite un Web Shell activé et des ressources construites. Réutilise un jeton configuré ou génère un jeton porteur de 256 bits pour la durée de vie du processus et le délivre dans le fragment du Web Shell. Les environnements non éligibles au navigateur impriment l'URL manuelle contenant le secret. Les autres clients nécessitent le même jeton partagé explicitement configuré. |

> **Mises en garde sur la portée mémoire projet.**
>
> - **Démon vs CLI autonome.** L'environnement de lancement du drapeau ou du démon définit une portée figée unique pour tous les environnements d'exécution possédés par ce démon. Un espace de travail `.env` ou `settings.env` ne peut pas la remplacer pour un espace de travail enregistré spécifique. Une TUI standalone `qwen` reste par défaut sur la portée racine git ; pour maintenir la cohérence entre les deux points d'entrée, exportez `QWEN_CODE_MEMORY_PROJECT_SCOPE` dans l'environnement shell ou service qui les lance.
> - **Collisions de noms de répertoires.** La clé de stockage est dérivée par `sanitizeCwd`, qui remplace chaque caractère non alphanumérique par `-`. Des répertoires frères ne différant que par la ponctuation (par ex. `feature_1` et `feature-1`) se mappent vers le même répertoire de mémoire même sous une portée `workspace`. Évitez une telle dénomination si vous comptez sur l'isolation des espaces de travail.
> - **La normalisation diffère entre le drapeau et la variable d'environnement.** La variable d'environnement est tronquée et mise en minuscules (`"  Workspace  "` fonctionne) ; le drapeau CLI est comparé avec sensibilité à la casse par yargs `choices` (`--memory-project-scope Workspace` est rejeté). Utilisez des valeurs en minuscules lors de la copie entre les deux.

### Garde de relocation Git intégrée au démon

Chaque session ACP de démon gérée applique une garde pré-exécution intégrée pour les commandes shell du modèle, indépendamment de `--external-tool-guard-mode` et sans aucune annonce de capacité. Le démon possède l'espace de travail lié et le répertoire de travail effectif actuel de la session ; les deux sont fournis depuis l'état de session fiable et ne sont jamais acceptés depuis l'enfant ACP.

Le garde inspecte les outils qui exécutent une ligne de commande shell — `run_shell_command` et `monitor` — et refuse une commande Git mutante avant son exécution lorsque l'emplacement du dépôt se résout en dehors du répertoire de travail effectif de la session. La relocalisation est reconnue pour les formes littérales de `git -C <path>`, `git --git-dir[=]<path>`, `git --work-tree[=]<path>`, les affectations initiales `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE` (également lorsqu'elles sont effectuées via `export`/`declare`/`readonly`, ce qui les maintient dans l'environnement de chaque commande ultérieure de la chaîne), les indicateurs d'enveloppe changeant de répertoire (`env -C`, `sudo -D`), et les commandes intégrées `cd`, `pushd` ou `popd` plus tôt dans la même chaîne de commandes. Les préfixes d'enveloppe courants (`sh -c`, `bash -c`, `eval`, `sudo`, `nohup`, `timeout`, `exec`, `command`, `builtin`, `env`, binaires `git` qualifiés par chemin, et syntaxe shell `{ …; }` / `! …`) sont dépliés afin que la même politique s'applique à l'appel Git interne, et les corps de substitution `$(…)` ou entre accents graves sont analysés comme des commandes à part entière.

Un sous-agent épinglé à son propre worktree est contenu dans ce worktree plutôt que dans le répertoire de la session ; un appel shell dont le répertoire d'exécution ne peut pas être déterminé par le démon est refusé.

Les cibles relatives se résolvent à partir du répertoire de départ effectif de la commande (`arguments.directory` s'il est présent, sinon le répertoire de travail effectif actuel de la session) après résolution canonique du chemin, y compris les redirections gitfile `.git`, les liens symboliques et les répertoires administratifs par worktree. Une cible relocalisée qui ne peut pas être entièrement résolue avant l'exécution — une cible dynamique (`$VAR`, accents graves, `~`, globs), un chemin inexistant ou une indirection illisible — est refusée pour les sous-commandes mutantes ou non classifiables. Une cible relocalisée qui ne peut pas être résolue est refusée quelle que soit la sous-commande — y compris celles en lecture seule. Les commandes relocalisées dont la sous-commande fait partie d'un petit ensemble vérifié en lecture seule (`rev-parse`, `cat-file`) restent autorisées une fois la cible résolue, sauf si la commande porte une configuration `-c` exécutant des commandes, ou si elle porte un indicateur `--output`, `--textconv` ou `--filters` : ceux-ci écrivent un fichier ou exécutent les pilotes configurés du dépôt cible. Les commandes sans relocalisation reconnue conservent leur comportement existant. Les refus sont définitifs et sont signalés au modèle comme `Daemon shell guard denied a mutating Git command…` pour un emplacement de dépôt résolu, dynamique ou irresoluble, et comme `Daemon shell guard denied a shell command…` lorsque la commande n'a pas pu être analysée, sa charge utile n'a pas pu être résolue, ou qu'un programme non reconnu pourrait exécuter une commande Git relocalisée.

Le garde est fiable contre la relocalisation Git écrite dans les formes littérales ci-dessus — la commande mal ciblée pour laquelle ce contrôle existe — mais il est **au mieux-effort, pas une frontière**, contre le texte shell écrit pour le contourner : les constructions qui cachent la relocalisation à un lecteur statique peuvent passer, et de nouvelles seront continuellement trouvées. Ne pas accorder une confiance plus large au démon sur la base de cela. Il n'interprète pas les fichiers script, ne suit pas les valeurs des variables d'environnement entre les commandes, et n'analyse pas les corps heredoc (le texte de forme Git dans un heredoc peut être refusé même si le shell ne l'exécute jamais). `/fork` et la mémoire de workspace sauvegardée/rêvée par agent restent disponibles sous le garde intégré ; ils ne sont restreints que lorsque le mode fournisseur externe ci-dessous est actif. Un garde d'outil externe facultatif reste une politique supplémentaire et ne reçoit la même requête qu'après que la politique intégrée l'autorise.

### Tool Guard externe requis

Cette option est destinée aux déploiements ACP gérés nécessitant une décision externe d'autorisation/refus à la frontière finale de l'exécuteur d'outils. Elle est totalement inactive sauf si `--external-tool-guard-mode=required` est présent :

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

Le fournisseur doit exposer `POST /v1/handshake` et `POST /v1/prepare`, exiger `Authorization: Bearer <token>`, retourner du JSON, renvoyer le nonce ou l'ID de requête fourni, et utiliser la version de protocole `1`. Le jeton doit être non vide, compter au maximum 8192 unités de code UTF-16, et ne contenir aucun caractère de contrôle. Les requêtes sont limitées à 1 MiB, les réponses à 64 KiB, et les motifs de refus facultatifs à 500 unités de code UTF-16 sans caractères de contrôle. Une réponse de préparation réussie est :

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

Un refus utilise `allowed:false` et peut ajouter un court `reason`. Pour chaque invocation d'outil de premier niveau prise en charge qui passe les portes de permission existantes et `PreToolUse` et atteint la frontière d'exécution finale, Qwen Code envoie une requête de préparation et ne la relance jamais. Un refus antérieur de permission/hook n'envoie aucune requête de préparation. Le délai d'expiration, l'annulation, la défaillance de transport, les réponses malformées ou incompatibles, et le refus explicite empêchent l'exécuteur de s'exécuter. Chaque canal ACP lancé doit également confirmer qu'il a installé le rappel requis ; une confirmation manquante ou incompatible rejette le canal avant la création de Session. La requête du fournisseur porte `sessionId`, `promptId`, `toolCallId`, `toolName` canonique, et `arguments` final ; `toolCallId` est une étiquette de corrélation, pas une identité d'authentification ni une clé d'idempotence autonome.

Les arguments finaux peuvent contenir des données sensibles de l'application. Traitez-les comme telles dans les journaux du fournisseur et le stockage d'audit.

Les hooks `PreToolUse` s'exécutent avant cette décision finale de l'exécuteur. Le mode Garde Requis n'autorise ni ne sandboxe le comportement des hooks ; les déploiements nécessitant une frontière autour de chaque effet secondaire possible doivent désactiver les hooks ou gouverner leurs implémentations séparément.

Les actions de commandes slash s'exécutent également avant la planification des modèles/outils et ne sont pas des invocations Guard. Certaines commandes intégrées peuvent modifier directement les fichiers ou les paramètres. Un déploiement géré nécessitant une frontière couvrant tous les effets doit rejeter les entrées de commandes slash ou désactiver toutes les commandes non approuvées via `slashCommands.disabled` ou `--disabled-slash-commands`.

La portée gérée v1 concerne les outils de premier niveau invoqués par un Prompt géré actif en premier plan. Les contrôles imbriqués ou délégués `agent`, `workflow`, `create_sub_session`, `send_message`, les appels directs `/fork` et les fonctionnalités mémoire d'espace de travail basées sur l'agent (remember/dream) sont rejetés lorsque le mode requis est actif. Le démarrage d'un shell ou d'un moniteur en arrière-plan au premier niveau reste une invocation protégée unique et ses arguments finaux atteignent le fournisseur, mais cette fonctionnalité n'autorise pas continuellement le processus ni n'ajoute de protocole d'audit de complétion du processus ; une politique exigeant une complétion en premier plan devrait refuser ces configurations. Les appels MCP protégés désactivent également la reconnexion/relecture automatique après une erreur de transport. Après une poignée de main réussie au démarrage, `/capabilities` annonce `external_tool_guard` ; son absence signifie que les clients ne doivent pas supposer l'application des règles.

Cette fonctionnalité n'autorise pas les appels explicites de gestion REST/ACP du démon ; ceux-ci continuent d'utiliser l'authentification existante du démon et les contrats de routage. Elle ne rend pas non plus déterministe un outil ou une commande shell autorisée, ni ne sandbox ses composants internes ; les déploiements gérés doivent combiner la décision du fournisseur avec leur politique d'outil normale et leur frontière d'isolation.

> **Dimensionnement des réglages de charge.** `--max-sessions` est la limite de nouvelles sessions par espace de travail. `--max-total-sessions` est la limite de nouvelles sessions à l'échelle du démon ; lorsqu'il est omis, il prend par défaut 800 pour une capacité d'enregistrement par défaut de 256. Trois autres couches limitent également la charge — lors du dimensionnement pour un déploiement à haute concurrence, ajustez-les ensemble :
>
> - **niveau listener** : `--max-connections` / `server.maxConnections=256` bornent les connexions TCP brutes (rétropression client lent).
> - **abonnés par session** : l'EventBus borne les abonnés SSE à 64 par session par défaut ; le 65e client reçoit un terminal `stream_error` et est fermé.
> - **admissions de prompts par session** : `--max-pending-prompts-per-session=5` borne les prompts mis en file d'attente + actifs acceptés pour une session. En cas de dépassement, on obtient `503` avec `Retry-After: 5`.
> - **nouvelles sessions à l'échelle du démon** : `--max-total-sessions=N` borne la création de nouvelles sessions à travers le démon. En cas de dépassement, on obtient la même forme `session_limit_exceeded` avec `scope: "total"`.
> - **file d'attente par abonné** : une file d'attente de 256 trames par client SSE ; un client dépassant la capacité reçoit une trame terminale `client_evicted` et est fermé (un consommateur lent ne peut pas bloquer le démon).
>
> Ces limites interagissent : chaque runtime est borné par `--max-sessions`, tandis que `--max-total-sessions` borne leur agrégat. Le plafond effectif de sessions est le plus bas entre toute limite finie à l'échelle du démon et la limite agrégée par runtime (considérez cet agrégat comme illimité si la limite par espace de travail est illimitée). Si aucune n'est finie — ce qui, à la capacité d'enregistrement par défaut, nécessite `--max-total-sessions 0` — il n'y a pas de plafond fini de sessions. Un plafond fini × 64 abonnés × 256 trames représente la mémoire maximale en vol au niveau de l'EventBus ; en le multipliant par `--max-pending-prompts-per-session`, on borne le travail de prompt accepté au niveau de l'admission. Le dimensionnement par défaut suppose une charge mono-utilisateur / petite équipe ; augmentez progressivement (et surveillez la RSS) pour les déploiements plus importants.

> **Garde-fous du client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Un workspace déclarant 30 serveurs MCP dans `mcpServers` démarrera 30 clients sans limite amont sauf si vous en définissez une. `--mcp-client-budget=N` limite le nombre de clients MCP actifs ; `--mcp-budget-mode={enforce,warn,off}` choisit le comportement. La valeur par défaut est `warn` lorsqu'un budget est défini (le snapshot affiche l'avertissement mais aucun client n'est refusé — utile pour mesurer le fanout en conditions réelles avant d'activer le mode enforce). Les serveurs refusés en mode `enforce` reçoivent `disabledReason: 'budget'` sur leur cellule par serveur, et la cellule `budgets[0]` affiche `status: 'error'` + `errorKind: 'budget_exhausted'`. La réservation de slot se fait par nom de serveur et survit aux reconnexions / délais d'expiration de découverte — un serveur refusé ne peut pas prendre le slot d'un serveur sain.
>
> **La portée actuelle est pilotée par les capacités.** Lorsque `mcp_workspace_pool` est présent, toutes les sessions d'un runtime de workspace partagent son pool de transports MCP et son contrôleur de budget ; `GET /workspace/mcp` émet `scope: 'workspace'`. Un deuxième workspace a un pool et un budget indépendants. Lorsque le tag est absent (y compris `QWEN_SERVE_NO_MCP_POOL=1`), le démon utilise le `McpClientManager` par session hérité et émet `scope: 'session'` ; dans ce fallback, N sessions peuvent chacune consommer le plafond configuré.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Cela **n'est pas** équivalent au paramètre `MCP_SERVER_CONNECTION_BATCH_SIZE` de claude-code (qui contrôle la concurrence au démarrage) ; ils sont orthogonaux. Les clients doivent se brancher sur `mcp_workspace_pool`, ne pas supposer une portée à partir de la version du protocole seule.
>
> **Événements Push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Les clients SDK abonnés à `GET /session/:id/events` reçoivent des frames typées lorsque les seuils de budget sont franchis — `mcp_budget_warning` (synthétique, se déclenche une fois par franchissement ascendant de 75 % avec réarmement par hystérésis à 37,5 %, annoncé via `mcp_guardrail_events`) et `mcp_child_refused_batch` (coalescé une fois par passe de découverte en mode `enforce` ; longueur 1 pour le refus de spawn paresseux de `readResource`). Le snapshot sur `GET /workspace/mcp` reste la source de vérité pour l'état après reconnexion ; les événements sont des changements de bord. Utile pour le dashboarding en temps réel sans polling.

## Modèle de menace de déploiement par défaut [#default-deployment-threat-model]

- **Loopback uniquement** — `127.0.0.0/8`, `localhost` ou `::1` ; aucune authentification nécessaire.
- **`localhost` est résolu une seule fois, épinglé et vérifié après l'écoute** — si son adresse d'écoute réelle est en dehors de `127.0.0.0/8` ou `::1`, le démarrage sans token ferme l'écouteur et échoue.
- **`--hostname 0.0.0.0` nécessite un jeton** — un est généré lorsque aucune source de jeton n'est fournie ; les sources explicitement vides échouent toujours en mode fermé.
- **`LOOPBACK_BINDS` inclut l'IPv6** — `::1` et `[::1]` comptent comme loopback pour la règle sans token.
- **Liste d'autorisation de l'en-tête Host** — sur les liaisons **loopback**, le démon vérifie que `Host:` correspond à `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` ou à l'adresse et port loopback liés exacts (insensible à la casse selon la RFC 7230 §5.4) pour se défendre contre le DNS rebinding. Lors de l'écoute sur le port 80 ou 443, les formes sans port correspondantes sont également acceptées car les navigateurs omettent les ports par défaut de schéma. Cela prend en charge la plage loopback IPv4 complète (`127.0.0.0/8`) sans admettre de Hosts non liés. **Les liaisons non-loopback (`--hostname 0.0.0.0`) contournent intentionnellement la liste d'autorisation Host** — l'opérateur a choisi la surface d'exposition, la barrière du bearer-token est donc la seule couche d'authentification ; les reverse proxies / SNI / le pinning de certificats client relèvent de la responsabilité de l'opérateur, et non du daemon. Si vous avez besoin d'une isolation basée sur Host pour une liaison non-loopback, terminez le TLS + vérifiez Host au niveau d'un proxy frontal.
- **CORS refuse toute origine de navigateur par défaut** — renvoie `403` JSON. Passez **`--allow-origin <pattern>`** (répétable, T2.4 #4514) pour autoriser des origines de navigateur spécifiques. Chaque valeur est soit le littéral `*` (toute origine — sur une liaison **loopback**, le démarrage refuse si aucun jeton bearer n'est configuré, tandis qu'une liaison non-loopback démarre car la génération du jeton en fournit un ; `--require-auth` sur loopback est recommandé pour un durcissement complet puisque `/health` reste pré-authentifié sur loopback par défaut — notez que les ressources statiques Web Shell (`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` et les navigations documentaires `/settings`) sont montées avant le bearer dans tous les modes et restent pré-authentifiées même sous `--require-auth`, utilisez donc `--no-web` lorsque la surface résiduelle du navigateur est importante) ou une origine d'URL canonique (`<scheme>://<host>[:<port>]`, sans barre oblique finale / chemin / userinfo). Un hôte loopback peut utiliser à la place un joker de port (`<scheme>://<loopback-host>:*`) ; il nécessite un jeton bearer configuré (le démarrage refuse sans), correspond exactement au schéma et à l'hôte (`127.0.0.1`, `localhost` et `[::1]` sont des entrées distinctes), et est la seule forme de joker mise à part `*` réservé à REST. Sur une liaison **loopback** sans jeton, les entrées HTTP(S) doivent utiliser un hôte loopback ; une liaison non-loopback porte toujours un jeton — fourni ou généré — précisément parce que les origines de navigateur hébergées à distance peuvent exécuter du code via l'API opérateur en tant qu'utilisateur du démon. Les origines explicites d'extensions de navigateur conservent leur chemin local d'automatisation sans jeton. Les origines correspondantes reçoivent les en-têtes de réponse CORS appropriés (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, plus les méthodes / en-têtes / max-age standard et exposés `Retry-After`) ; les origines non correspondantes reçoivent toujours un 403 avec la même enveloppe que le mur par défaut. `caps.features.allow_origin` est annoncé conditionnellement afin que les clients SDK / webui puissent vérifier avant envoi si le démon honore les requêtes inter-origines. Exemple : `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Les hits d'origine self-loopback (par ex. l'UI Web Shell) ne sont pas affectés — un shim séparé de suppression d'Origine les gère indépendamment de `--allow-origin`. Les requêtes **HTTP** same-origin du Web Shell distant intégré fonctionnent également sans `--allow-origin` : sur un listener principal non-loopback, un `Origin` égal au schéma du socket direct plus l'autorité normalisée `Host` est authentifié par bearer puis supprimé avant le mur CORS, tandis que ses routes statiques publiques existantes restent non authentifiées. Deux exclusions nécessitent encore `--allow-origin` — les en-têtes transmis n'établissent jamais la confiance same-origin, donc l'origine navigateur `https` d'un proxy inverse terminant TLS n'est pas same-origin (et ce n'est pas le cas non plus d'un intermédiaire HTTP simple qui réécrit l'en-tête `Host`, comme le `proxy_set_header Host $proxy_host` par défaut de nginx ou Ingress k8s ; le remède consiste à utiliser `--allow-origin <origin>` pour l'origine vue par votre navigateur, ou un proxy qui transmet `Host` verbatim — la traduction de port seule ne nécessite rien, car seul l'en-tête `Host` transmis est comparé, avec seulement le schéma-par-défaut `:80`/`:443` supprimé), et les routes de mise à niveau WebSocket (terminal, voix) maintiennent une porte CSWSH séparée qui n'admet que les origines loopback de même port, les origines explicitement sur liste blanche (y compris les jokers de port loopback) et la propre origine du listener Local Control ; le littéral `*` ne s'y applique pas.
- **L'automatisation de navigateur par extension Chrome est séparée du cadrage.** `qwen serve --allow-origin chrome-extension://<id>` permet à l'extension de cadrer le Web Shell et de se connecter au démon. Les outils console/network/screenshot/click nécessitent une commande adaptateur CDP MCP externe : `QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`. Le paquet CLI principal ne bundle pas d'adaptateur d'automatisation de navigateur ; les clients peuvent vérifier `caps.features.includes('browser_automation_mcp')` avant de présenter ces outils comme disponibles.
- **Un enfant `qwen --acp` spawné reçoit l'environnement effectif de son runtime propriétaire.** Le démon gèle une base process-env, applique l'overlay settings/fichier env de ce workspace à un snapshot local au runtime, et ne réécrit jamais l'overlay dans `process.env` ; des clés de même nom dans un autre runtime ne se croisent pas. `QWEN_SERVER_TOKEN` est supprimé avant le spawn car l'agent n'a pas besoin du bearer du démon. Les variables affectant le chargeur (`NODE_OPTIONS`, `npm_config_node_options` et les redirections de fichiers de config npm, `NODE_PATH`, `OPENSSL_CONF`, `NODE_REPL_EXTERNAL_MODULE`, `npm_config_node_gyp`, `npm_config_init_module`, `LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `ZDOTDIR`, les définitions de fonctions bash exportées `BASH_FUNC_*`) ne sont jamais non plus transmises aux sous-processus de session — le démon les supprime de son propre `process.env` et de l'environnement de base gelé avec lequel les enfants hébergeant des sessions spawnent (l'environnement de base les conserve uniquement sous le harness `DEV=true`, dont les entrées `.ts` ont encore besoin du chargeur tsx), et les sources `.env` / `settings.json` `env` les rejettent (voir [settings](./configuration/settings.md)) ; cela s'applique à chaque session hébergée par le démon. Les identifiants de base tels que `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QWEN_*` et `DASHSCOPE_API_KEY` sont sinon transmis sauf si l'overlay du runtime les modifie. **Ceci est intentionnel, ce n'est pas un sandbox.** L'agent s'exécute avec le même UID et a accès aux outils shell, donc tout ce qui se trouve dans `~/.bashrc`, `~/.aws/credentials` ou `~/.npmrc` est accessible par injection de prompt de toute façon. L'isolation d'environnement entre runtimes n'est pas une frontière de sécurité au niveau du système d'exploitation ; n'exécutez pas `qwen serve` sous une identité possédant des identifiants que vous ne confieriez pas à l'agent.
- **Les lectures de texte de l'agent sont locales à l'enfant et suivent les règles de permission CLI normales, pas la limite du système de fichiers du workspace.** `read_file` direct peut atteindre des chemins texte de l'hôte en dehors de chaque workspace enregistré : les chemins externes sont par défaut en confirmation, et les règles d'autorisation ou les modes d'approbation peuvent les approuver automatiquement. Les lectures approuvées utilisent les limites de sortie CLI configurables plutôt que les limites de sortie renvoyée, de snapshot complet et de scan de texte volumineux du système de fichiers du workspace. Cela s'applique à chaque consommateur partagé de lecture de texte, donc les pré-lectures effectuées par les opérations d'écriture, d'édition, de notebook, de sed et d'artifact perdent ces limites ainsi que l'audit de lecture du système de fichiers du workspace, le rejet de liens symboliques et les protections TOCTOU côté lecture — voir [le document de conception](../design/daemon-local-text-reads.md) pour la liste exacte. Comme un payload de confirmation est construit en lisant le fichier, un diff hors-workspace est diffusé à **chaque** abonné SSE attaché avant que quiconque ne l'approuve — dans le CLI interactif, ce contenu n'est vu que par la personne au terminal. Traitez les clients démon authentifiés comme le même principal de sécurité. Les routes de système de fichiers HTTP restent limitées au workspace et le comportement des outils de découverte de l'agent est inchangé.
- **Les écritures finales approuvées des outils texte intégrés ont une route same-host étroite.** `write_file`, `edit`, `notebook_edit` et l'éditeur sed simulé de l'outil shell attachent la provenance interne uniquement après que la politique de permission existante autorise l'exécution. Leur écriture texte ACP finale peut donc cibler un chemin absolu en dehors du workspace propriétaire sans seconde confirmation ; les règles d'autorisation, AUTO/AUTO_EDIT et YOLO se comportent comme la CLI, tandis que le rejet, Plan, le refus Hook/Guard et l'annulation pré-exécution n'envoient pas l'écriture finale. L'annulation après qu'un outil est déjà entré dans une opération filesystem non annulable conserve le comportement existant de cet outil. Les cibles workspace utilisent toujours WFS. Les cibles externes utilisent un writer hôte démon avec le même snapshot de confiance, une limite encodée de 5 MiB, le rejet de liens symboliques feuilles, le verrouillage de chemin canonique, le rename atomique, la préservation de mode, le mode `0600` pour les nouveaux fichiers par défaut (configurable — voir [New-file mode for agent text writes](#new-file-mode-for-agent-text-writes)), la garde de génération et l'audit filesystem. Les écritures HTTP, les écritures ACP génériques ou non marquées, les intégrations injectées de bridge/workspace-registry/factory et les redirections shell arbitraires ne bénéficient pas de cette exception. Voir [la conception des écritures externes](../design/daemon-external-tool-text-writes.md).
- **Files SSE bornées par abonné** — un client lent qui dépasse sa file reçoit une frame terminale `client_evicted` et est déconnecté ; un consommateur bloqué ne peut pas immobiliser le daemon.
- **Limite d'admission des prompts par session** — par défaut à 5 prompts acceptés mais non résolus par session. Un client bogué ne peut pas mettre en file d'attente des promesses de prompt ou des attentes SSE temporaires illimitées pour une session.
- **Arrêt gracieux** — SIGINT/SIGTERM draine les processus enfants de l'agent avant de fermer l'écouteur (délai de 10s par enfant).

> ⚠️ **Les votes d'autorisation sont désormais limités à la session — plus une mise en garde permanente concernant le bearer partagé.** Préférez `POST /session/:id/permission/:requestId` (Wave 4 / F3) : il route vers le runtime qui possède la session active nommée et ne retombe jamais sur le pont principal — les nouvelles intégrations multi-workspaces doivent toujours utiliser cette route (pré-vol `caps.features.session_permission_vote`). Le processus global legacy `POST /permission/:requestId` reste disponible pour les clients mono-workspace pré-F3 : il est lié au principal et `404` pour une session possédée par un autre runtime enregistré — le même corps qu'un vote perdu sous la politique par défaut `first-responder` — donc un `404` là-bas ne signifie pas à lui seul que la requête a déjà été traitée. Table de routage : [Référence API REST du démon](../developers/daemon-rest-api-reference.md#permissions). Mise en garde permanente : chaque client détenant le jeton bearer est le même principal de sécurité — ne faites pas tourner `qwen serve` derrière un bearer partagé avec des parties non fiables.
>
> ⚠️ **Lacune connue de l'étape 1 — corps de `POST /session/:id/prompt` limité à 10 Mo (BUy4L).** Les prompts multimodaux contenant des images / PDF / audio dépassant 10 Mo échoueront lors de l'analyse du corps avant que la logique de route ne s'exécute (pas de streaming, pas d'annulation en cours de téléchargement). Solution de contournement : réduisez le contenu côté client, ou passez une référence de chemin et laissez l'agent lire le fichier via `readTextFile`. L'étape 1.5 acceptera `multipart/form-data` ou un encodage par morceaux sur `/prompt` afin que les grands prompts ne heurtent pas de limite abrupte.
>
> ⚠️ **Lacune connue de l'étape 1 — connexions SSE fantômes derrière NAT.** Le démon détecte les clients morts via la rétropression TCP sur les battements de cœur (intervalle de 15s). Un client qui disparaît SANS RST TCP (par ex. une boîte NAT supprimant silencieusement les flux inactifs) maintient la socket au niveau noyau "vivante" jusqu'à ce que les sondes keepalive de Node expirent — généralement ~2 heures avec les valeurs par défaut Linux. Sur les déploiements `--hostname 0.0.0.0` derrière de tels NATs, les connexions SSE fantômes peuvent s'accumuler et éventuellement atteindre le plafond de 256 `server.maxConnections`.
>
> Définissez [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout) (problème [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9) pour combler la lacune avec une échéance d'inactivité explicite au niveau application : lorsqu'aucune écriture n'a été correctement vidée pendant `n` ms, le démon émet une trame terminale `client_evicted` avec `reason: 'writer_idle_timeout'` et ferme le flux. L'indicateur est désactivé par défaut pour préserver le contrat hérité — les opérateurs sur des réseaux qui avalent les RST devraient choisir une valeur bien supérieure à l'intervalle de battement de cœur de 15s (par ex. `60000`–`300000`) afin que les connexions légitimement inactives ne soient pas évincées tandis que les rédacteurs réellement bloqués sont nettoyés rapidement. Vérifiez la prise en charge de `caps.features.includes('writer_idle_timeout')` depuis votre SDK pour confirmer que le démon le supporte.

### Deadlines et délai d'inactivité du writer [#deadlines-and-writer-idle-timeout]

L'issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 introduit deux flags opt-in qui comblent les lacunes des déploiements longue durée / distants que le heartbeat de 15s + AbortSignal ne couvrent pas. Le timeout de réponse de permission partagé est listé ici également. Les trois sont désactivés par défaut.

| Flag                           | Variable d'env                        | Défaut | Ce que cela fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | non défini   | Limite temporelle côté serveur pour un seul `POST /session/:id/prompt`. À l'expiration, le daemon annule l'AbortController du prompt et renvoie un HTTP `504` avec `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`. Un champ de corps de requête par prompt `deadlineMs` peut RACCOURCIR le délai effectif en dessous du flag mais ne peut jamais l'étendre. Tag de capacité (conditionnel) : `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | non défini   | Délai d'inactivité par connexion SSE. Lorsqu'aucune écriture n'a été flushée avec SUCCÈS pendant `n` ms — ni un événement réel ni le heartbeat de 15s — le daemon émet une frame terminale `client_evicted` avec `data.reason = 'writer_idle_timeout'` (miroir sur `data.errorKind`) et ferme le flux. **Choisissez une valeur confortablement supérieure au heartbeat de 15s** (par ex. `30000`–`300000`) afin que les flux inactifs légitimes ne soient pas expulsés ; les valeurs `< 15000` EXPULSERONT des connexions inactives par ailleurs saines avant que le premier heartbeat ne se déclenche (intentionnel uniquement pour les tests / sessions de dev courte durée). Tag de capacité (conditionnel) : `writer_idle_timeout`. |
| `--permission-response-timeout-ms <n>` | —                                   | `0`     | Temps mural partagé pour les réponses de permission ordinaires et `ask_user_question` en mode démon. `0` ou un flag omis attend indéfiniment ; un entier positif impose un délai sur les deux. L'annulation de voteur, l'annulation de session et l'arrêt du démon résolvent toujours les interactions en attente lorsque le timer est désactivé. |

Les flags de prompt et de writer acceptent un entier positif en millisecondes ; les valeurs `0`, `NaN`, non entières ou négatives sont rejetées au démarrage avec un message d'erreur clair. Le timeout de réponse de permission accepte `0` ou un entier positif. Pour les deux deadlines supportées par des variables d'env, les champs explicites `ServeOptions` l'emportent sur les valeurs d'env. Les consommateurs SDK doivent vérifier en amont (pre-flight) le tag de capacité correspondant avant de s'appuyer sur les comportements de prompt et de writer.

### Mode de fichier pour les écritures texte de l'agent [#new-file-mode-for-agent-text-writes]

Les écritures texte de l'agent (`write_file`, `edit`, `notebook_edit`, et l'éditeur sed simulé de l'outil shell) publient via le writer atomique du démon, qui préserve le mode d'une cible existante et — pour les **nouveaux** fichiers — utilise par défaut `0600` en propriétaire uniquement, ignorant l'umask du processus démon. Ce défaut fail-closed est intentionnel : un fichier fraîchement créé par l'agent n'est jamais lisible par le groupe/le monde par accident, quelle que soit la permissivité de l'umask du superviseur.

Les opérateurs dont la convention de déploiement est pilotée par l'umask (par ex. une unité systemd avec `UMask=0002`, des dépôts en groupe partagé) peuvent opter pour le traitement POSIX standard des nouveaux fichiers avec :

| Variable d'env               | Valeurs             | Défaut  | Ce que cela fait                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_NEW_FILE_MODE`   | `owner` \| `system` | `owner` | `system` crée les NOUVEAUX fichiers en `0o666 & ~umask`, afin que les fichiers créés par l'agent suivent l'umask du processus démon comme tout autre processus sur la machine. `owner` conserve le défaut `0600` indépendant de l'umask. Les valeurs sont insensibles à la casse ; le littéral `0600` est accepté comme alias de `owner` (aucun autre mode octal n'est pris en charge), et toute autre valeur est rejetée avec un avertissement stderr et le défaut `0600` est conservé. |

Portée et limites :

- S'applique aux NOUVEAUX fichiers créés par les routes d'écriture texte (cibles workspace, le writer hôte externe same-host et les écritures texte HTTP). Les fichiers existants conservent toujours leur mode sur disque — éditer un secret `0600` le garde en `0600`, un exécutable garde `+x`.
- Les uploads binaires (`POST /file/upload`) créent toujours en `0600` quel que soit ce paramètre.
- Le démon lit la variable lors de la construction du système de fichiers du workspace ; redémarrez le démon après l'avoir modifiée.

### Répertoire de travail des Conversations [#conversations-working-directory]

Définissez la racine du répertoire de travail pour les sessions autonomes et Live indépendamment du dossier personnel du système d'exploitation :

```bash
qwen serve --conversations-dir /persistent/qwen-conversations

# Or configure the launch environment:
QWEN_CONVERSATIONS_DIR=/persistent/qwen-conversations qwen serve

# The same option is available for a detached daemon:
qwen daemon start --conversations-dir /persistent/qwen-conversations
```

Le drapeau explicite prend la priorité sur `QWEN_CONVERSATIONS_DIR`, qui peut provenir de l'environnement de lancement ou d'un fichier utilisateur `.env`. Les lanceurs embarqués peuvent sélectionner la même racine avec `ServeOptions.conversationsDir`, qui prend également la priorité sur l'environnement. Lorsque aucun n'est configuré, la racine reste `~/Documents/Qwen Code/Conversations`. Monter un volume persistant à ce chemin par défaut ou modifier le dossier personnel du processus sont également des choix de déploiement valides.

Une valeur explicite doit être un chemin absolu entièrement qualifié, non vide et sans caractères NUL. Les chemins relatifs, un `~` non développé et les chemins Windows dépendant du lecteur courant sont rejetés. Les valeurs ne sont pas tronquées, et une configuration invalide fait échouer le démarrage au lieu de recourir à une solution de repli. Un drapeau explicite ou une option API valide écrase une valeur d'environnement invalide. La syntaxe du chemin est vérifiée avant l'écoute ; la création de répertoires et les vérifications du système de fichiers restent paresseuses, donc une racine Conversations inutilisée n'est pas créée au démarrage. Une défaillance du système de fichiers lors de la première utilisation ne sélectionne pas une autre racine.

La sélection est fixe pour la durée de vie du démon. Les fichiers projet `.env` et projet `.qwen/.env`, les fichiers `settings.json` `env` de premier niveau à toutes les portées, les rechargements d'environnement et les requêtes navigateur/session ne peuvent pas la rediriger. Il n'existe aucun paramètre de projet correspondant ni d'option de racine par session.

Autonome et Live continuent de partager le runtime Conversations existant. Chaque session utilise son enfant direct privé déterministe `conversation-<sha256(normalized session ID)>` comme répertoire de travail pour les outils et le shell. Les contrôles existants de propriété, permissions POSIX privées, identité canonique, enfant direct, lien/reparse, bail d'écriture et récupération s'appliquent toujours, y compris leurs limites spécifiques à la plateforme. Windows n'acquiert pas les garanties POSIX owner/mode ou ACL, et les systèmes de fichiers sans identité inode vérifiable ne peuvent toujours pas détecter tous les remplacements de même chemin. L'arbre Conversations sélectionné reste réservé à partir de l'enregistrement ordinaire des workspaces ; les autres workspaces conservent leurs règles existantes.

La racine de travail et le stockage runtime ont des responsabilités distinctes :

| Données | Emplacement |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Fichiers de travail de session | Sous-répertoires privés de la session sous la racine Conversations sélectionnée. |
| Configuration racine partagée | Configuration créée par l'utilisateur sous la racine sélectionnée, partagée entre ses sessions. |
| Transcriptions et fichiers annexes (sidecars) | Stockage existant de la base d'exécution du démon, indexé par le cwd runtime canonique des Conversations. |
| Journaux de récupération de suppression | L'espace de noms stable `<home>/.qwen/conversations/deletions`. |
| Découverte en direct | Le localisateur stable `<home>/.qwen/live/daemon.json` et, le cas échéant, sa copie dans la base d'exécution du démon. |
| Découverte locale du démon | `daemon/daemon-<port>.json` sous la base d'exécution du démon ; enregistre le chemin Conversations sélectionné pour le redémarrage. |

`QWEN_HOME` sélectionne le répertoire de configuration global Qwen. `QWEN_RUNTIME_DIR` et `advanced.runtimeOutputDir` sélectionnent le stockage des sorties runtime via leurs règles de priorité existantes. Aucun ne sélectionne la racine du répertoire de travail des Conversations. La persistance seule du stockage runtime ne persiste pas les fichiers créés dans les répertoires privés de session ; la configuration seule de la racine de travail ne préserve pas non plus le stockage runtime ni l'état de récupération et de découverte basé sur le home.

Pour un redémarrage utilisant la même racine, conservez le même chemin canonique, la même base runtime et l'état de contrôle requis. `qwen daemon restart` préserve la racine à partir d'un enregistrement de découverte actuel, et le relancement de mise à jour automatique préserve également la racine sélectionnée. L'acceptation normale de l'identité du système de fichiers, les autorisations, les baux d'écriture (writer leases) et les vérifications de récupération s'exécutent toujours ; ce n'est pas une garantie de récupération après chaque redémarrage de conteneur ou d'hôte. Voir [Verrous d'écriture et récupération des Conversations](./conversations-recovery.md).

Pour changer intentionnellement de racines, terminez la récupération de suppression en attente contre la racine originale, arrêtez tous les écrivains (writers) qui l'utilisent, puis arrêtez et démarrez le démon avec la nouvelle configuration. Une racine canonique différente sélectionne un espace de noms différent pour le stockage/découverte de l'historique et la configuration racine partagée. Aucun fichier de travail, enregistrement de session, configuration, journal de récupération ou état de découverte n'est automatiquement migré, et l'ancien historique n'est pas garanti de rester visible. Ne supprimez pas les preuves de récupération pour forcer l'acceptation : si la récupération contre la racine originale ne peut pas se terminer, changer cette option n'est pas une procédure de réparation.

### Stockage des pièces jointes de session [#session-attachment-storage]

Les pièces jointes de session (fichiers et images uploadés par le Web Shell via `POST /session/:id/attachments`) sont stockées par défaut sous le répertoire temp runtime du workspace : `<runtimeBaseDir>/tmp/<projectHash>/attachments`, clées par session sous `session-<sessionId>`. Les opérateurs qui souhaitent que les pièces jointes persistent en dehors du répertoire temp runtime (par ex. sur un volume dédié) peuvent remplacer la racine :

| Variable d'env                            | Valeurs | Défaut | Ce que cela fait                                                                                                                                                                                                |
| ------------------------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_SESSION_ATTACHMENTS_ROOT` | chemin   | non défini   | Stocke les pièces jointes de session sous ce répertoire au lieu du répertoire temp runtime par défaut. Accepte un chemin absolu, un chemin relatif au cwd du démon, ou `~` / `~/…` étendu par rapport au répertoire home. |

Portée et limites :

- **Migration à sens unique.** Lorsque la variable d'env est définie, les nouvelles pièces jointes sont écrites uniquement sous la racine configurée. Les lectures et suppressions qui manquent la racine configurée se rabattent sur le répertoire temp runtime par défaut, donc les pièces jointes uploadées **avant** le changement restent lisibles, et supprimables tant que le répertoire fallback par défaut reste accessible en écriture — une suppression dont la copie héritée ne peut pas être déliée (par ex. un volume fallback en lecture seule) signale l'erreur plutôt que de rapporter le succès. La direction inverse — supprimer la variable d'env après que des pièces jointes ont été écrites dans la racine configurée — rend ces pièces jointes inaccessibles ; maintenez la variable stable pour un workspace donné.
- **Layout par session.** Les fichiers vivent sous `<root>/<projectHash>/attachments/session-<sessionId>/` dans les deux emplacements, où `<projectHash>` est le même hash de workspace utilisé par le répertoire temp runtime par défaut ; la recherche fallback utilise le même layout de session dans le répertoire par défaut. Deux workspaces pointant vers la même racine configurée restent isolés l'un de l'autre.
- **Nettoyage par suppression.** Lorsqu'une session est supprimée, son répertoire de pièces jointes est retiré à la fois de la racine configurée et du répertoire fallback par défaut. Archiver une session conserve ses pièces jointes afin qu'elles survivent au désarchivage.
- Le démon lit la variable au démarrage ; redémarrez le démon après l'avoir modifiée. Le répertoire doit être accessible en écriture par le processus démon.

## Déploiement multi-session et multi-workspace [#multi-session--multi-workspace-deployment]

Passez `--workspace` plus d'une fois pour enregistrer plusieurs workspaces non chevauchants dans un seul processus `qwen serve`. Le premier chemin est primaire. Chaque workspace enregistré possède une frontière d'exécution isolée, tandis que l'écouteur à l'échelle du démon, la politique d'authentification et la limite de sessions totales sont partagées. La production tente de préchauffer l'enfant ACP primaire pour la compatibilité et réessaie à la première utilisation après échec ; les secondaires de confiance démarrent leur propre enfant à la demande, et les secondaires non fiables ne démarrent pas ACP. Les requêtes peuvent sélectionner un workspace enregistré par `cwd` canonique ; les requêtes qui omettent `cwd` utilisent le workspace primaire. Utilisez un démon par utilisateur ou principal de sécurité ; la confiance du workspace est une gate d'exécution, pas une ACL.

Un workspace secondaire non fiable est visible dans le Web Shell comme `untrusted` et `read-only`. Il peut être développé pour inspecter le catalogue de sessions persistées, mais ne peut pas encore être sélectionné ou ouvert dans le Web Shell, repris, utilisé pour créer des sessions, ou entièrement exporté. L'API REST suit la politique de lecture de système de fichiers bornée existante et expose également son catalogue de groupes de sessions persistées et, lorsque `workspace_persisted_transcript` est annoncé, son transcript persisté actif via le pager borné qualifié par workspace. Les lectures forward et cursor ne démarrent pas un enfant ACP ; une première page backward pour une session live peut en démarrer un pour flusher le tail persisté. L'export complet qualifié par workspace nécessite un workspace de confiance et la capacité séparée `workspace_session_export`. Faites confiance au workspace et redémarrez le démon avant d'utiliser les fonctionnalités d'exécution, de mutation ou d'export. Un primaire non fiable reste désactivé dans le Web Shell.

Utilisez des processus démon séparés lorsque vous avez besoin d'une frontière de panne ou de sécurité plus petite, de bearer tokens indépendants, de quotas, de frontières d'audit, d'isolation au niveau du système d'exploitation ou de supervision de ressources indépendante. Le mode multi-workspace est destiné à un opérateur hébergeant plusieurs repos ; ce n'est pas une frontière d'isolation multi-locataire. Un token de démon unique autorise chaque route API protégée par bearer que le démon expose, y compris le catalogue en lecture seule autorisé pour tous les workspaces enregistrés.

> **Abonnez-vous AVANT de poster `modelServiceId` lors de l'attachement.** Lorsqu'un client fait un `POST /session` avec un `modelServiceId` et que le workspace a déjà une session exécutant un modèle différent, le daemon émet un appel interne `setSessionModel` — les échecs ne sont PAS propagés comme une erreur HTTP (la session reste opérationnelle sur son modèle actuel). Le signal d'échec visible est un événement `model_switch_failed` sur le flux SSE de la session. Si vous appelez `POST /session` et ouvrez `GET /session/:id/events` ENSUITE seulement, vous manquerez l'événement d'échec et continuerez silencieusement à parler au mauvais modèle. Ouvrez d'abord le flux SSE, ou passez `Last-Event-ID: 0` à l'abonnement pour rejouer l'événement le plus ancien disponible dans l'anneau.

Pour gérer plusieurs **utilisateurs ou principaux de sécurité** (chacun avec un token indépendant, un quota, un journal d'audit, un sandbox ou une frontière de panne de processus) ou pour passer à l'échelle au-delà de la portée d'un seul processus (budget de cold-start, nombre de FD, RSS), lancez un démon par principal derrière un orchestrateur externe. Chaque démon peut toujours héberger plusieurs workspaces pour ce principal. L'orchestrateur (multi-locataire / OIDC / Quota / Audit / k8s) est **hors du périmètre** du projet qwen-code — consultez l'issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" pour les pointers de conception.

## Chargement et reprise d'une session persistée [#loading-and-resuming-a-persisted-session]

Le daemon expose le flux `session/load` et resume d'ACP via HTTP, plus un pager de transcript en lecture seule séparé :

| Route                                                   | À utiliser quand                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`                                | Le client n'a **aucun** historique local utile rendu (reconnexion à froid, sélection puis ouverture). Pour une session live, le démon renvoie et injecte la fenêtre courante d'instantané de relecture bornée ; si de la relecture plus ancienne a été supprimée, l'instantané commence par `history_truncated`. Tag de capacité : `session_load`. |
| `POST /session/:id/resume`                              | Le client a déjà les tours à l'écran et a seulement besoin de récupérer le handle côté daemon. Le contexte du modèle est restauré côté agent sans relecture de l'UI — le flux SSE reste propre. Tag de capacité : `session_resume` (`unstable_session_resume` reste un alias déprécié pour les anciens clients).     |
| `GET /session/:id/transcript`                           | Le client a besoin du transcript persisté actif complet. Il renvoie des frames de relecture sans id dans des pages par curseur et n'appelle pas `/load`, n'attache pas de client, n'initialise pas l'EventBus live, ne crée pas de session live et ne modifie pas la fenêtre de relecture live. Tag de capacité : `session_transcript`.                    |
| `GET /workspaces/:workspace/session/:id/transcript`     | Le client a besoin d'un transcript persisté actif d'un workspace sélectionné. Les pages forward et cursor restent daemon-local ; une première page backward pour une session live peut démarrer ACP et charger les paramètres du workspace pour flusher le tail persisté. Les workspaces secondaires non fiables enregistrés peuvent utiliser ce chemin en lecture seule. Tag de capacité : `workspace_persisted_transcript`. |
| `GET /workspaces/:workspace/session/:id/export`         | Le client a besoin d'une pièce jointe complète `html`, `md`, `json` ou `jsonl` d'un workspace de confiance sélectionné. Il lit le stockage persisté actif sans démarrer ACP ni retomber sur le primaire. Tag de capacité : `workspace_session_export`.                                                         |
| `GET /workspaces/:workspace/session/:id/archive/export` | Le client a besoin des mêmes formats de pièce jointe depuis le stockage persisté archivé dans un workspace de confiance sélectionné. Il ne désarchive pas, ne démarre pas ACP et ne retombe pas sur une session active ou primaire. Tag de capacité : `workspace_archived_session_export`.                                                |

Pour la charge et la reprise, le SDK TypeScript expose des fabriques statiques sur `DaemonSessionClient` :

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay the bounded snapshot window through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

Vérifiez en amont (pre-flight) `caps.features.session_load`, `caps.features.session_resume`, ou `caps.features.session_transcript` avant d'appeler la route correspondante — les anciens daemons renvoient `404`. `unstable_session_resume` est toujours annoncé comme un alias de compatibilité déprécié. Les requêtes simultanées de même action pour le même id sont coalescées ; les courses d'actions croisées (un `load` en concurrence avec un `resume`) et les spawns à id fourni par l'appelant en concurrence avec une restauration renvoient `409 restore_in_progress` avec `Retry-After: 5`. Une restauration qui dépasse `limits.sessionRestoreTimeoutMs` renvoie un `504 session_restore_timeout` retryable avec un `Retry-After` dérivé du budget (borné à 5-120s) ; la requête enfant toujours en cours reste clôturée jusqu'à ce que le nettoyage se règle, et les retries au même id pendant cette fenêtre obtiennent `409 restore_in_progress` avec `reason: awaiting_abandoned_cleanup` et un `Retry-After` dérivé du budget borné à 5-120 secondes au lieu d'un délai fixe de 5 secondes. Si le nettoyage est incertain, ou si la restauration abandonnée n'a toujours pas réglé un budget de restauration complet après son délai, le travail de session fraîche obtient temporairement un `503 acp_channel_unavailable` avec `reason: restore_cleanup_failed` ou `restore_settlement_overdue`. Une initialisation de session qui expire sans se régler rapidement peut également renvoyer `reason: new_session_cleanup_failed` lorsque le nettoyage tardif est non concluant ou `new_session_settlement_overdue` lorsque la requête enfant reste en attente pour un budget d'initialisation supplémentaire. Les sessions déjà actives restent utilisables pour ces quatre raisons. Consultez la [référence du protocole](../developers/qwen-serve-protocol.md) pour l'enveloppe d'erreur complète.

Pour la relecture persistée complète, pagez avec `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` ou la route REST brute :

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

Pour un workspace enregistré, utilisez `client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` ou `/workspaces/:workspace/session/:id/transcript`. La méthode qualifiée par workspace utilise toujours REST natif même lorsque le client SDK a un transport ACP remplaçable. Ses curseurs sont limités à la durée de vie du démon et doivent être redémarrés à la page un après un redémarrage du démon. Une première page backward pour une session live peut démarrer ACP et charger les paramètres du workspace pour flusher le tail persisté avant de le lire.

Pour une pièce jointe complète d'un workspace enregistré de confiance, vérifiez en amont `workspace_session_export` et appelez `client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` ou la route brute `/workspaces/:workspace/session/:id/export`. Ne déduisez pas la prise en charge de `session_export` ou `workspace_qualified_rest_core` : les anciens daemons peuvent annoncer les deux tout en conservant l'export primaire uniquement. L'action d'export Web Shell actuelle reste primaire uniquement ; utilisez le SDK ou la route REST pour un autre workspace.

Pour une pièce jointe archivée, vérifiez en amont `workspace_archived_session_export` et appelez `client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` ou `/workspaces/:workspace/session/:id/archive/export`. Ce chemin lit le stockage archivé en place et renvoie `409 session_not_archived` pour un id actif uniquement ; il ne désarchive pas la session. Le Web Shell expose le même export pour les lignes archivées dans les workspaces primaires et secondaires de confiance lorsque la capacité est présente.

`limit` est le nombre cible d'enregistrements de chat actifs, pas les frames de relecture émises ; un enregistrement peut produire plusieurs événements `session_update`. Une page backward peut s'étendre à au plus `3 * limit` enregistrements pour préserver les limites de tour et d'appel/résultat d'outil. La première réponse gèle la taille de l'instantané JSONL et renvoie `nextCursor` tant que `hasMore` est vrai. Les pages ultérieures ignorent les ajouts après la page 1, mais renvoient `409` si le fichier est supprimé, tronqué, remplacé, archivé ou autrement en conflit avec le curseur gelé. Les instantanés très volumineux renvoient `413 transcript_too_large` avant l'indexation afin que le démon ne scanne pas des fichiers transcript illimités sur le chemin de la requête.

Pour la pagination répétée via la route singulière héritée, définissez `--channel-idle-timeout-ms` sur une valeur positive. Avec la valeur par défaut `0`, l'enfant ACP d'un espace de travail inactif — et le cache d'index de transcription en processus qu'il détient — est révoqué après chaque page, donc chaque page relance l'enfant et reconstruit l'index en rescannant toute la préfixe figée (`O(snapshotSize)` par page). Un délai positif maintient l'enfant vivant pendant le parcours du curseur afin qu'il réutilise son index de transcription en cache et sa configuration de relecture, sauf si `--child-heap-mode admit` ou `enforce` le récupère pour satisfaire un spawn contraint par la capacité dans un autre espace de travail. Dans ce cas, la page suivante relance l'enfant et reconstruit l'index. Les pages avant et curseur qualifiées par espace de travail restent locales au démon ; seule une première page arrière pour une session active traverse la barrière de vidange (flush barrier).

Remarque : la relecture de l'historique de session live est limitée deux fois : par l'anneau SSE pour les reconnexions `Last-Event-ID` et par `--compacted-replay-max-bytes` pour l'instantané renvoyé par `POST /session/:id/load`. Les longs historiques avec des tours verbeux peuvent dépasser l'une ou l'autre borne. Le démon signale la troncature de l'instantané avec `history_truncated` ; utilisez `/transcript` lorsque vous avez besoin de l'historique persisté actif complet.

## Modèle de durabilité [#durability-model]

**Les sessions actives sont interrompues par les redémarrages du démon, mais les sessions persistées restent sur le disque et peuvent être rechargées :**

- Le crash d'un processus enfant publie `session_died` et supprime la session active des maps du daemon. La session persistée sur disque **peut** être rechargée via `POST /session/:id/load` si un nouvel enfant agent peut être lancé.
- Un redémarrage du daemon perd toutes les sessions actives en cours. Les sessions persistées restent sur disque et peuvent être chargées sur un nouveau processus daemon, sous réserve des mêmes règles de liaison de workspace.
- Les déconnexions client prolongées (>5 min sur un tour verbeux) peuvent dépasser l'anneau de relecture SSE (par défaut 8000 frames) — la reconnexion `Last-Event-ID` déclenche `state_resync_required`. Pour les clients mobiles / réseaux instables, prévoyez de rouvrir SSE lors de longues coupures ou d'appeler `POST /session/:id/load` pour récupérer l'instantané de relecture bornée actuel ; ne supposez pas que cette route renvoie le transcript complet.
- Les opérations sur les fichiers (`writeTextFile`) sont atomiques en cas de crash (write-then-rename) ; elles ne sont pas atomiques au sens de la relecture lors des redémarrages du daemon — l'écriture du fichier a abouti ou non.

Si votre intégration nécessite une durabilité côté serveur entre les redémarrages au-delà de ce que `session/load` couvre (par ex. des files de retry gérées par le serveur), vous avez toujours besoin d'une récupération d'état au niveau applicatif. Ne conservez pas d'état longue durée, sensible aux redémarrages, à l'intérieur de la session du daemon.

## Garanties d'exécution Stage 1.5+

Le contrat de la Stage 1 est dimensionné pour le prototypage. Conformément à la [revue downstream-consumer chiga0 #3889](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644), les éléments suivants **ne font pas** partie de la Stage 1 — les intégrations de niveau production ont besoin de la Stage 1.5+ avant de s'appuyer dessus :

**Obstacles pour une utilisation sérieuse en aval :**

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

## Limites du périmètre de la phase 1 — ce que nous ne corrigerons pas dans la phase 1.5 [#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15]

Deux choix structurels sont des non-objectifs explicites pour la feuille de route principale des phases 1 / 1.5 / 2. Si votre cas d'usage dépend de l'un ou l'autre, prévoyez des contournements plutôt que de nous attendre.

### L'état de session est en mutation locale uniquement (selon la [revue LaZzyMan #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

Le plan de la phase 1.5 décrit la TUI comme un abonné in-process à l'EventBus. En pratique, **l'UI de la TUI est strictement plus large que le protocole wire** :

- **UI locale uniquement** — les ~15 composants de dialogue Ink (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) et les commandes slash `local-jsx` (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) rendent du JSX Ink spécifique au terminal. Les clients distants sur HTTP/SSE ne peuvent pas rendre Ink de manière équivalente, et ces flux n'émettent aucun événement wire.
- **Mutations de l'état de session sans événements wire** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (écriture de `CLAUDE.md`) modifient tous le comportement de l'agent, mais seul `/model` publie actuellement un événement (`model_switched`).

**Choix de la phase 1 — option (A) de la revue** : ne pas promouvoir ces mutations en événements wire. Les deux modes de déploiement ont des conséquences différentes.

#### Mode 1 — `qwen serve` headless (cette PR)

Aucun shell TUI ne s'exécute à l'intérieur du démon. Les commandes slash listées ci-dessus **n'existent pas** dans ce mode — il n'y a pas d'UI terminal pour les exécuter. L'état de session est donc :

- **Figer au démarrage** pour `approval-mode` / `memory` / `agents` / `tools` allowlist / `auth` — tous chargés depuis les paramètres + le disque lorsque l'enfant `qwen --acp` du démon démarre ; immuables pour la durée de vie de la session. Les serveurs MCP définis dans les paramètres sont également figés au démarrage, mais les **serveurs ajoutés au runtime** (via `POST /workspace/mcp/servers`) peuvent être ajoutés ou supprimés sans redémarrage.
- **Mutable via HTTP** via `POST /session/:id/model` (publie `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (publie `mcp_server_added` / `mcp_server_removed`), et les votes de permission (`POST /session/:id/permission/:requestId` ; le `POST /permission/:requestId` global au processus hérité reste pour les clients mono-espace de travail pré-F3).

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

**Les enfants serveur MCP** utilisent le pool de transport scopé par espace de travail lorsque `mcp_workspace_pool` est annoncé : les entrées `(workspace runtime, server name, config fingerprint)` correspondantes sont comptées par référence (refcounted) entre les sessions. Si la capacité est absente, le gestionnaire hérité par session les lance indépendamment.

**Les agents pairs (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) font tous du multi-session en processus unique.** qwen-code les égale au niveau agent ; le pont Stage 1 dans cette PR rend la même architecture visible via HTTP.

## Connexion à un démon distant (issue #4175 PR 21)

Lorsque le démon tourne sur un pod distant (pas d'affichage partagé avec vous), un client peut déclencher un flux d'appareil OAuth via HTTP. Le démon interroge lui-même l'IdP ; votre rôle consiste simplement à ouvrir une URL sur tout appareil disposant d'un navigateur.

> [!note]
>
> Le niveau gratuit Qwen OAuth a été interrompu le 2026-04-15. Les exemples `qwen-oauth` ci-dessous documentent la forme du protocole de flux d'appareil et l'identifiant de fournisseur hérité ; les nouvelles configurations doivent utiliser un fournisseur d'authentification actuellement pris en charge.

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

**`--require-auth` et commodité de développement.** Les routes du flux device utilisent la gate de mutation stricte. Le loopback de confiance sans token par défaut peut démarrer et gérer un flux directement ; un embed non fiable sans identifiants retourne `401 token_required`. Définissez un `QWEN_SERVER_TOKEN` géré et passez `--require-auth` sur les hôtes partagés, les runners CI, les machines de développement distantes ou tout endroit où les processus locaux ne sont pas mutuellement de confiance.

**Limitation inter-démons.** `oauth_creds.json` est partagé entre les démons (`~/.qwen/oauth_creds.json`), donc une connexion réussie dans le démon A est automatiquement récupérée par le prochain refresh de token du démon B — mais les clients SDK du démon B ne recevront pas l'événement `auth_device_flow_authorized` (les événements sont par démon).

**Prise de contrôle inter-clients.** Deux clients SDK sur le même démon qui font tous les deux un `POST /workspace/auth/device-flow` pour le même fournisseur obtiennent le singleton par fournisseur : le premier appel démarre une nouvelle requête IdP et retourne `attached: false` ; le second appel retourne l'entrée EXISTANTE en cours avec `attached: true`. La prise de contrôle est enregistrée dans la piste d'audit (sous le `X-Qwen-Client-Id` du second client) mais n'émet PAS d'événement séparé — les deux clients observent finalement le MÊME `auth_device_flow_authorized` une fois que l'utilisateur a terminé la page IdP. Si votre UI distingue "J'ai démarré ceci" de "J'ai rejoint le flux de quelqu'un d'autre", branchez-vous sur le champ `attached` retourné par `start()`.

## Fichier de log du démon

`qwen serve` ajoute des enregistrements de diagnostic lors des redémarrages normaux au chemin actif stable :

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

Chaque enregistrement de fichier inclut un `runId` aléatoire par démarrage et le PID du démon. Un propriétaire stable réussi met également à jour `debug/daemon/latest` vers `daemon.log` sur les plateformes prenant en charge les liens symboliques. Sur macOS/Linux, suivez la rotation avec :

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

Sur les autres plateformes, configurez l'observateur pour qu'il rouvre le chemin après remplacement. Un observateur qui conserve uniquement l'ancien descripteur de fichier restera sur l'archive après la rotation.

Le log capture les messages de cycle de vie, les erreurs de route (avec le contexte `route=` et `sessionId=`), le stderr de l'enfant ACP, et — lorsque `QWEN_SERVE_DEBUG=1` est défini — des breadcrumbs supplémentaires du bridge. Les lignes qui vont au stderr aujourd'hui vont toujours au stderr ; le log fichier est **additif**, pas un remplacement.

La création autonome échouée ajoute `Standalone session creation failed.` avec la cible validée `sessionId`, `phase` échoué, `reason` sûr, `dispatchState` et `cleanupOutcome`. La création enfant conserve l'ID enfant et enregistre le parent validé séparément comme `relatedSessionId`. Corrélerez les lignes `source_persistence_failed` par ID de session pour l'accusé de réception de source privée ou les détails de transport ; `write_not_confirmed` n'identifie pas une cause système de fichiers. Une quarantaine terminée est distincte du rollback, et `unknown` n'établit pas le succès du nettoyage. Les codes d'erreur publics et le comportement de retry restent inchangés. Ces diagnostics omettent les causes brutes, les prompts et les charges utiles sources.

Le fichier actif effectue une rotation avant d'excéder 10 MiB. Chaque famille conserve quatre archives sous `archive/`, et chaque enregistrement de fichier est limité à 256 KiB. La file d'attente en mémoire accepte au maximum 4 MiB de charge utile de fichier non réglée. La pression sur la file d'attente, les échecs de rotation ou les échecs du système de fichiers peuvent donc entraîner la perte de copies de fichiers ; `GET /daemon/status?detail=full` expose l'état du journaliseur, les problèmes et les compteurs d'enregistrements/octets perdus.

Un seul démon peut posséder la famille stable dans un espace de noms de journal. Un démon concurrent écrit dans `debug/daemon/runs/run-<runId>/daemon.log` ; la bannière de démarrage et le statut complet contiennent le chemin faisant autorité. `runs/recent-fallback` est un localisateur best-effort pour une famille de repli récente et peut pointer vers une qui est encore active. Un espace de noms sain converge vers environ 100 MiB : environ 50 MiB pour la famille stable plus une famille de repli inactive. Les familles de repli actives ou non obsolètes sont conservées, de sorte que les démons concurrents ou les tempêtes de plantage/redémarrage peuvent temporairement utiliser davantage.

Un répertoire d'exécution unique constitue un espace de noms de propriété et de rétention. Utilisez des valeurs `QWEN_RUNTIME_DIR` distinctes lorsque les démons nécessitent un historique indépendant. Les nouveaux répertoires de journaux du démon sont privés pour l'utilisateur (`0700`) et les nouveaux fichiers utilisent `0600` sur POSIX. Il n'y a pas d'expiration basée sur l'âge.

### Désactivation

Définissez `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) pour ignorer complètement la journalisation dans un fichier. La sortie stderr n'est pas affectée.

### Relation avec les logs de debug de session

Les logs de debug par session (`~/.qwen/debug/<sessionId>.txt` et le lien symbolique `~/.qwen/debug/latest`) sont indépendants. Le log du démon se trouve dans un sous-répertoire frère `daemon/` ; la sémantique de debug par session n'est pas modifiée par cette fonctionnalité.

### Rotation externe

Ne pointez pas une règle logrotate externe vers le fichier actif `daemon.log`. Le démon est le seul writer et rotator pris en charge ; un renommage, une suppression ou une troncature externes invalident son modèle de taille. La copie ou l'expédition d'enregistrements sans modifier la famille est sûre. Les anciens fichiers `serve-<pid>.log` et `serve-<pid>-<workspaceHash>.log` ne sont pas touchés et ne sont pas comptabilisés par la nouvelle politique de rétention.

## Gestion des serveurs MCP au runtime (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514)) [#runtime-mcp-server-management-issue-4514]

Ajoutez ou supprimez des serveurs MCP au runtime sans redémarrer le démon. Les entrées runtime vivent dans un overlay éphémère qui **masque** les serveurs définis dans les paramètres portant le même nom ; la configuration sous-jacente `settings.json` / `mcpServers` n'est jamais modifiée.

**Pré-vol :** vérifiez `caps.features` pour `mcp_server_runtime_mutation` avant d'appeler l'une ou l'autre route. Les démons plus anciens sans ce tag retournent `404`.

### `POST /workspace/mcp/servers` — ajouter un serveur MCP au runtime

Soumis à une gate stricte (primaire loopback de confiance ou identifiants opérateur requis). Connecte le serveur immédiatement via le `McpClientManager` actif et découvre ses outils.

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

`name` doit être alphanumérique plus `_` et `-` (max 256 caractères). `config` est le même objet de configuration de serveur MCP utilisé dans les entrées `settings.json` `mcpServers` (champs dépendants du transport : `command`/`args` pour stdio, `url` pour SSE/HTTP). Les champs sensibles à la sécurité (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) sont retirés par le démon et ignorés.

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
| `401`  | `token_required`          | Requête non-fiable sans token refusée par la gate stricte                                           |
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
| `401`  | `token_required`          | Requête non-fiable sans token refusée par la gate stricte                      |
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

- **Configuration d'un démon longue durée ?** Utilisez les [modèles de lancement locaux (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) pour la supervision par gestionnaire de service et le démarrage après redémarrage.
- **Vous développez un client ?** Consultez le [guide de démarrage rapide DaemonClient TypeScript](../developers/examples/daemon-client-quickstart.md) et la [référence du protocole HTTP](../developers/qwen-serve-protocol.md).
- **Vous explorez le code source ?** Le code du bridge se trouve dans `packages/cli/src/serve/` ; le client SDK dans `packages/sdk-typescript/src/daemon/`.
- **Vous suivez la roadmap ?** L'avancement des étapes 1.5 et 2 est suivi dans l'issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

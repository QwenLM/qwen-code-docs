# Modèles de lancement local pour `qwen serve` (v0.16-alpha)

Modèles de référence pour exécuter `qwen serve` en tant que processus d’arrière-plan persistant sur un poste de développeur. Associé aux [limites connues de la v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) — local uniquement, mono-utilisateur, avec votre propre jeton porteur. Les déploiements conteneurisés, multi-hôtes ou avec terminaison TLS sont reportés à v0.16.x.

> **Public** : développeurs en test interne qui souhaitent que le démon reste actif après les redémarrages, avec des journaux sauvegardés durablement, et une gestion propre des redémarrages en cas d’échec. Si vous n’avez besoin du démon que pour la durée d’une seule session shell, un simple `qwen serve` (au premier plan, Ctrl-C pour arrêter) suffit.

## Générer un jeton porteur (une seule fois)

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # géré par l'utilisateur, PAS un chemin intégré
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

Le chemin / nom de fichier vous appartient ; la v0.16-alpha ne génère ni ne localise automatiquement un fichier de jeton (reporté à v0.16.x). Consultez la section [Authentification](./qwen-serve.md#authentication) du guide utilisateur pour la configuration standard d’apport de votre propre jeton.

> **Limitez cet `export` à la session shell en cours uniquement.** Ne l’ajoutez pas à `~/.bashrc` / `~/.zshrc` — un export au niveau du profil expose le jeton porteur à tous les processus lancés depuis ce shell (sous-processus IDE, débogueurs navigateur, scripts `npm` de projets sans rapport). Pour les configurations persistantes, utilisez les mécanismes `EnvironmentFile=` de systemd / `EnvironmentVariables` de launchd ci-dessous — tous deux limitent le jeton au seul processus démon.

Le démon lit le jeton porteur depuis `--token <valeur>` sur la CLI ou la variable d’environnement `QWEN_SERVER_TOKEN` (les espaces sont supprimés dans les deux cas). Le constructeur `DaemonClient` du SDK TypeScript se rabat sur `QWEN_SERVER_TOKEN` lorsque l’option `token` n’est pas fournie (fallback PR 27 — les clients ayant la variable d’environnement définie n’ont jamais besoin de transmettre la valeur dans leur script).

Un seul `export` au niveau shell couvre à la fois le démarrage du serveur et la construction du client SDK (gardez-le limité à la session, comme indiqué ci-dessus).

## Linux : unité utilisateur systemd

> **Trouvez d’abord le chemin de votre binaire `qwen`.** Le `ExecStart=` du fichier d’unité doit contenir un **chemin absolu** — les gestionnaires de services ne lisent pas le `PATH` de votre shell. Exécutez `which qwen` pour le découvrir. Emplacements courants : `/usr/local/bin/qwen` (Linuxbrew, installations manuelles), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.fnm/aliases/default/bin/qwen` (fnm), `~/.volta/bin/qwen` (Volta). Remplacez par le chemin réel partout où les modèles ci-dessous indiquent `/PATH/TO/qwen`.

`~/.config/systemd/user/qwen-serve.service` :

```ini
[Unit]
Description=Qwen Code daemon (loopback HTTP + SSE)
After=network.target

[Service]
Type=simple
# Remplacez par votre projet ; %h se développe en $HOME dans les unités utilisateur.
WorkingDirectory=%h/your-project
# Exécutez `which qwen` pour trouver le chemin absolu. systemd ne lit PAS $PATH.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# Lisez le jeton porteur depuis un fichier chmod 600 plutôt que de l'inliner
# dans l'unité. `Environment=` exposerait le jeton dans le fichier d'unité
# (généralement 644 = lisible par tous). EnvironmentFile conserve le jeton dans
# le fichier secret appartenant à l'utilisateur que vous avez déjà créé avec `chmod 600`.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Créez le fichier d’environnement une fois (le fichier de jeton de l’étape de configuration contient la valeur brute ; celui-ci l’encapsule sous forme `KEY=valeur` pour que systemd le lise comme une affectation d’environnement) :

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

Gestion :

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # maintient le gestionnaire utilisateur actif après déconnexion / redémarrage
journalctl --user -u qwen-serve -f               # suivi des journaux
systemctl --user restart qwen-serve.service     # après rotation du jeton
systemctl --user disable --now qwen-serve.service
```

Sans `loginctl enable-linger`, l’instance systemd au niveau utilisateur s’arrête lorsque l’utilisateur se déconnecte et ne redémarre qu’à la prochaine connexion — sur un poste de développement headless, le démon ne survivrait pas à la fin d’une session SSH. `enable-linger` est ce qui permet de fonctionner « après les redémarrages ».

**Alternative système** (postes de développement partagés, moins courante) : placez l’unité dans `/etc/systemd/system/qwen-serve@.service` avec `User=%i`, gérez via `sudo systemctl enable --now qwen-serve@<nom_utilisateur>.service`. Même corps de `[Service]` sinon — mais l’exposition lisible par tous via `Environment=` est encore plus problématique à ce niveau, donc utilisez toujours `EnvironmentFile=` pointant vers le fichier `chmod 600` de l’utilisateur. Privilégiez le niveau utilisateur + linger pour les postes de travail individuels.

## macOS : agent utilisateur launchd

> **Trouvez d’abord le chemin de votre binaire `qwen`.** Même contrainte que systemd — `ProgramArguments` doit contenir un **chemin absolu**. Exécutez `which qwen` pour le découvrir. Emplacements courants sur macOS : `/opt/homebrew/bin/qwen` (Homebrew sur Apple Silicon), `/usr/local/bin/qwen` (Homebrew sur Intel, installations manuelles), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.volta/bin/qwen` (Volta). Remplacez ci-dessous là où le modèle indique `/PATH/TO/qwen`.
`~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist` :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.qwenlm.qwen-serve</string>
  <key>ProgramArguments</key>
  <array>
    <!-- Run `which qwen` to find the absolute path; launchd does NOT read $PATH. -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd does NOT expand `~` or `$HOME` — use absolute paths. -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/your-project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- DO NOT COMMIT this file with a real token. Also chmod 600 the
         plist itself so the inlined token is not world-readable. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>PASTE-YOUR-TOKEN-HERE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- Restart only on non-zero exits (matches systemd Restart=on-failure).
       A bare `<true/>` would respawn even after a clean SIGTERM, making
       `kill <pid>` impossible to use as a stop signal — operator would
       have to `launchctl unload`. SuccessfulExit=false fixes that. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Throttle restart storms on persistent failures (mirrors systemd
       RestartSec=5; launchd's default would respawn every <1s). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- Log into the user's Library, not /tmp. /tmp is world-writable
       (symlink-attack risk on shared workstations) and gets cleaned by
       periodic-daily after 3 days; `~/Library/Logs/qwen-serve/` is
       user-scoped and survives. launchd truncates these on every
       `load`, so the unload→load token-rotation cycle wipes prior
       diagnostic logs — back them up if you need post-incident
       inspection. -->
  <key>StandardOutPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

**Gestion :**

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # first time only
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # plist holds the inline token
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # to stop
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

Après avoir modifié le fichier plist (par exemple en changeant le jeton), vous devez effectuer un `unload` puis un `load` — `launchctl` ne recharge pas automatiquement les modifications du plist comme le fait `systemd daemon-reload`. Notez que chaque `load` tronque les fichiers journaux : sauvegardez‑les donc si vous enquêtez sur un incident avant de renouveler le jeton.

## Session tmux (supervision interactive)

Suppose que `QWEN_SERVER_TOKEN` est déjà exporté dans votre shell (voir la section de configuration ci‑dessus) :

```bash
tmux new -d -s qwen-serve "cd ~/your-project && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # see live logs; Ctrl-b d to detach
tmux kill-session -t qwen-serve
```

`tmux new -d` hérite de l’environnement du shell parent, donc `QWEN_SERVER_TOKEN` est transmis automatiquement. Idéal lorsque vous souhaitez consulter ponctuellement la sortie standard du démon (avertissements d’authentification, progression de la découverte MCP, avertissements de client lent) sans vous engager dans une unité de service. Survit à la fermeture du terminal, mais pas au redémarrage de la machine.

## Ligne unique nohup (rapide & sale)

Suppose que `QWEN_SERVER_TOKEN` est déjà exporté dans votre shell :

```bash
nohup bash -c 'cd ~/your-project && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # daemon PID; capture if you want to `kill` cleanly later
```

Le `bash -c '...'` qui entoure la commande garantit que le démon se lie à `~/your-project` plutôt qu’à l’endroit où vous avez exécuté la commande. Sans ce `cd`, `qwen serve` utilise `process.cwd()` par défaut et une requête `POST /session` d’un client qui attend votre espace de travail projet renvoie une erreur `400 workspace_mismatch` — un piège silencieux.

Acceptable pour des usages ponctuels du type « je lance ça en arrière‑plan le temps d’explorer l’API ». **Déconseillé** pour tout ce qui dépasse une simple session — pas de redémarrage en cas de plantage, le fichier journal grossit sans limite, aucun moyen propre de retrouver le démon si vous oubliez le PID. Préférez tmux pour la supervision interactive, ou systemd / launchd pour tout ce qui doit survivre à un redémarrage.

## Vérifier que le démon est actif

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # daemon's feature set
```

Lorsque l’authentification est configurée (c’est‑à‑dire que le démon a été démarré avec `--token` / `QWEN_SERVER_TOKEN` défini, OU `--require-auth=true`), toute route sauf `/health` sur la boucle locale nécessite l’en‑tête `Authorization: Bearer <token>`. Si vous avez démarré le démon sans jeton sur la boucle locale par défaut (le chemin zéro‑configuration `qwen serve`), aucune des deux requêtes n’a besoin d’en‑tête. Les modèles ci‑dessus configurent tous un jeton, donc l’en‑tête `Authorization` est nécessaire en pratique. Si `/capabilities` renvoie `401`, le jeton de l’unité / du plist ne correspond pas à celui exporté dans l’environnement utilisé par votre `curl`.
## Rotation des jetons

1. Générez un nouveau jeton et écrivez le fichier d’environnement référencé par l’unité :
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (Pour les modèles launchd / nohup / tmux : modifiez la valeur `<string>` du plist ou ré-exportez `QWEN_SERVER_TOKEN`. N’oubliez pas `chmod 600` sur le plist si vous le régénérez.)
2. Redémarrez le démon :
   - **systemd** : `systemctl --user restart qwen-serve.service`
   - **launchd** : `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup** : `kill <pid>` puis relancez avec le nouveau jeton dans l’environnement
3. Mettez à jour les SDK clients / scripts. Le `DaemonClient` du SDK TypeScript lit automatiquement `QWEN_SERVER_TOKEN` (fallback dans la PR 27) — réexportez la nouvelle valeur dans tout shell client et reconstruisez le client.

## Redémarrage et comportement en cas de plantage

La sémantique de redémarrage du gestionnaire de services diffère selon les modèles :

- **systemd `Restart=on-failure`** — redémarre uniquement en cas de sortie non nulle ou de signal. Un SIGTERM propre (`systemctl stop`) **ne** déclenche **pas** de boucle de redémarrage.
- **launchd `KeepAlive` avec `SuccessfulExit=false`** (modèle ci-dessus) — correspond au comportement de systemd. Un simple `<true/>` aurait relancé même après une sortie propre. `ThrottleInterval=10` limite les tempêtes de redémarrage en cas d’échecs persistants, comme `RestartSec=5` pour systemd.
- **tmux / nohup** — pas de redémarrage automatique. Un plantage du démon laisse un PID mort jusqu’à ce que vous le relanciez.

Dans la **durée de vie d’un seul processus démon**, les déconnexions des clients sont récupérées par reprise SSE `Last-Event-ID` conformément à la section [Modèle de durabilité](./qwen-serve.md#durability-model) du guide utilisateur — l’anneau de rejeu est en mémoire.

Un **redémarrage** du démon supprime toutes les sessions en mémoire ; les clients se reconnectent et repartent de zéro. La persistance du contenu des sessions (prompts, appels d’outils, historique de conversation) entre les redémarrages **N’EST PAS** assurée dans la version v0.16-alpha.

## Hors du périmètre (reporté à la v0.16.x ou ultérieure)

- **Déploiement conteneurisé** — Dockerfile, docker-compose, manifests Kubernetes, proxy inverse nginx + TLS, isolation des jetons entre instances. Reporté à la v0.16.x après engagement d’un pilote entreprise ; la documentation deviendrait obsolète faute de validation.
- **Fédération inter-hôtes / coordination multi-démons sur un même hôte** — `1 démon = 1 espace de travail × N sessions` est la règle. Le rattachement des jetons au chemin d’instance et le nettoyage des jetons obsolètes sont reportés à la v0.16.x.
- **Jetons de démon générés automatiquement** — l’alpha nécessite que vous fournissiez votre propre jeton. La génération automatique et l’infrastructure de stockage des jetons sont reportées à la v0.16.x.
- **Service natif Windows** (`nssm`, wrapper Service Control Manager) — pour l’instant, utilisez [WSL2](https://learn.microsoft.com/fr-fr/windows/wsl/) et suivez la section systemd ci-dessus.

Consultez l’appel [Limites connues de la v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) dans le guide utilisateur principal pour la liste complète des fonctionnalités reportées, et [#4175](https://github.com/QwenLM/qwen-code/issues/4175) pour le suivi du déploiement de la v0.16-alpha.

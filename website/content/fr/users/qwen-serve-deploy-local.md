# Modèles de lancement locaux pour `qwen serve` (v0.16-alpha)

Modèles de référence pour exécuter `qwen serve` en tant que processus d'arrière-plan persistant sur une machine de développement. À utiliser avec les [limites connues de la v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) — local uniquement, mono-utilisateur, jeton d'authentification BYO. Les déploiements conteneurisés, multi-hôtes ou avec proxy TLS sont reportés à la v0.16.x.

> **Public cible** : développeurs pratiquant le dogfooding qui souhaitent que le démon fonctionne même après un redémarrage, avec des journaux stockés de manière durable, et une gestion propre des redémarrages en cas d'échec. Si vous n'avez besoin du démon que pour la durée d'une session shell unique, un simple `qwen serve` (au premier plan, Ctrl-C pour arrêter) suffit.

## Générer un jeton d'authentification (une fois)

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # géré par l'utilisateur, PAS un chemin intégré
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

Le chemin / nom du fichier est à votre discrétion ; la v0.16-alpha ne génère ni ne localise automatiquement de fichier de jeton (reporté à la v0.16.x). Consultez la section [Authentification](./qwen-serve.md#authentication) du guide utilisateur pour la configuration BYO canonique.

> **Limitez cet `export` à la session shell en cours uniquement.** Ne l'ajoutez pas à `~/.bashrc` / `~/.zshrc` — un export au niveau du profil expose le jeton d'authentification à chaque processus lancé depuis ce shell (sous-processus IDE, débogueurs navigateur, scripts `npm` de projets non liés). Pour les configurations persistantes, utilisez les mécanismes `EnvironmentFile=` de systemd / `EnvironmentVariables` de launchd ci-dessous — les deux limitent le jeton au seul processus démon.

Le démon lit le jeton d'authentification soit depuis `--token <valeur>` en ligne de commande, soit depuis la variable d'environnement `QWEN_SERVER_TOKEN` (les espaces sont supprimés dans les deux cas). Le constructeur `DaemonClient` du SDK TypeScript utilise `QWEN_SERVER_TOKEN` comme solution de repli lorsqu'aucune option `token` n'est passée (repli PR 27 — les clients avec la variable d'environnement définie n'ont jamais besoin de transmettre la valeur dans leur script).

Un seul `export` au niveau du shell couvre à la fois le démarrage du serveur et la construction du client SDK (gardez-le simplement limité à la session, comme indiqué ci-dessus).

## Linux : unité utilisateur systemd

> **Trouvez d'abord votre binaire `qwen`.** Le `ExecStart=` du fichier d'unité doit contenir un **chemin absolu** — les gestionnaires de services ne lisent pas le `PATH` de votre shell. Exécutez `which qwen` pour le trouver. Emplacements courants : `/usr/local/bin/qwen` (Linuxbrew, installations manuelles), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.fnm/aliases/default/bin/qwen` (fnm), `~/.volta/bin/qwen` (Volta). Remplacez par le chemin réel partout où les modèles ci-dessous indiquent `/PATH/TO/qwen`.

`~/.config/systemd/user/qwen-serve.service` :

```ini
[Unit]
Description=Démon Qwen Code (boucle HTTP + SSE)
After=network.target

[Service]
Type=simple
# Remplacez par votre projet ; %h est développé en $HOME sous les unités utilisateur.
WorkingDirectory=%h/your-project
# Exécutez `which qwen` pour trouver le chemin absolu. systemd ne lit PAS $PATH.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# Lisez le jeton d'authentification depuis un fichier chmod 600 plutôt que de l'inclure
# dans l'unité. `Environment=` exposerait le jeton dans le fichier d'unité
# (généralement 644 = lisible par tout le monde). EnvironmentFile conserve le jeton dans
# le fichier secret appartenant à l'utilisateur que vous avez déjà créé avec `chmod 600`.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Créez le fichier d'environnement une fois (le fichier de jeton de l'étape de configuration contient la valeur brute ; cela l'enveloppe sous forme `KEY=valeur` pour que systemd le lise comme une affectation d'environnement) :

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

Gestion :

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # maintient le gestionnaire utilisateur actif après déconnexion / redémarrage
journalctl --user -u qwen-serve -f               # consulter les journaux en continu
systemctl --user restart qwen-serve.service     # après rotation du jeton
systemctl --user disable --now qwen-serve.service
```

Sans `loginctl enable-linger`, l'instance systemd au niveau utilisateur s'arrête lorsque l'utilisateur se déconnecte et ne redémarre qu'à la prochaine connexion — sur une machine de développement sans tête, le démon ne survivrait pas à la fin d'une session SSH. `enable-linger` est ce qui permet de fonctionner "même après un redémarrage".

**Alternative système entier** (machines de développement partagées, moins courante) : placez l'unité dans `/etc/systemd/system/qwen-serve@.service` avec `User=%i`, gérez via `sudo systemctl enable --now qwen-serve@<nom-utilisateur>.service`. Même corps `[Service]` par ailleurs — mais l'exposition `Environment=` lisible par tous est encore plus problématique à ce niveau, utilisez donc toujours `EnvironmentFile=` pointant vers le fichier `chmod 600` de l'utilisateur. Privilégiez le niveau utilisateur + linger pour les postes de travail mono-utilisateur.

## macOS : agent utilisateur launchd

> **Trouvez d'abord votre binaire `qwen`.** Même contrainte que systemd — `ProgramArguments` doit contenir un **chemin absolu**. Exécutez `which qwen` pour le trouver. Emplacements courants sur macOS : `/opt/homebrew/bin/qwen` (Homebrew sur Apple Silicon), `/usr/local/bin/qwen` (Homebrew sur Intel, installations manuelles), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.volta/bin/qwen` (Volta). Remplacez ci-dessous là où le modèle indique `/PATH/TO/qwen`.

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
    <!-- Exécutez `which qwen` pour trouver le chemin absolu ; launchd ne lit PAS $PATH. -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd ne développe PAS `~` ni `$HOME` — utilisez des chemins absolus. -->
  <key>WorkingDirectory</key>
  <string>/Users/VOTRE-NOM-UTILISATEUR/your-project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- NE COMMITEZ PAS ce fichier avec un vrai jeton. Aussi, chmod 600 le
         plist lui-même pour que le jeton intégré ne soit pas lisible par tous. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>COLLEZ-VOTRE-JETON-ICI</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- Redémarrage uniquement en cas de sortie non nulle (correspond à Restart=on-failure
       de systemd). Un simple `<true/>` ferait redémarrer même après un SIGTERM propre,
       rendant `kill <pid>` impossible comme signal d'arrêt — l'opérateur devrait
       `launchctl unload`. SuccessfulExit=false corrige cela. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Limite les tempêtes de redémarrage en cas d'échecs persistants (correspond à
       RestartSec=5 de systemd ; la valeur par défaut de launchd redémarrerait toutes les <1s). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- Journalisation dans le répertoire Library de l'utilisateur, pas dans /tmp. /tmp est
       accessible en écriture par tous (risque d'attaque par lien symbolique sur les
       postes partagés) et est nettoyé par periodic-daily après 3 jours ; 
       `~/Library/Logs/qwen-serve/` est limité à l'utilisateur et persiste. launchd
       tronque ces fichiers à chaque `load`, donc le cycle unload→load de rotation du jeton
       efface les journaux de diagnostic précédents — sauvegardez-les si vous avez besoin
       d'une inspection post-incident. -->
  <key>StandardOutPath</key>
  <string>/Users/VOTRE-NOM-UTILISATEUR/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/VOTRE-NOM-UTILISATEUR/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

Gestion :

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # première fois seulement
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # le plist contient le jeton intégré
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # pour arrêter
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

Après avoir modifié le plist (par exemple, rotation du jeton), vous devez faire `unload` puis `load` à nouveau — `launchctl` ne recharge pas automatiquement les modifications du plist comme le fait `systemd daemon-reload`. Notez : chaque `load` tronque les fichiers journaux, donc sauvegardez-les si vous enquêtez sur un incident avant la rotation.

## Session tmux (supervision interactive)

Suppose que `QWEN_SERVER_TOKEN` est déjà exporté dans votre shell (voir la section de configuration ci-dessus) :

```bash
tmux new -d -s qwen-serve "cd ~/your-project && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # voir les journaux en direct ; Ctrl-b d pour détacher
tmux kill-session -t qwen-serve
```

`tmux new -d` hérite de l'environnement du shell parent, donc `QWEN_SERVER_TOKEN` est transmis automatiquement. Idéal lorsque vous voulez occasionnellement voir la sortie standard du démon (avertissements d'authentification, progression de la découverte MCP, avertissements de clients lents) sans vous engager dans une unité de service. Survit à la fermeture du terminal mais pas au redémarrage de la machine.

## Ligne unique nohup (rapide et sale)

Suppose que `QWEN_SERVER_TOKEN` est déjà exporté dans votre shell :

```bash
nohup bash -c 'cd ~/your-project && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # PID du démon ; capturez-le si vous voulez faire un `kill` propre plus tard
```

L'encapsulation `bash -c '...'` garantit que le démon se lie à `~/your-project` plutôt qu'à l'endroit où vous avez exécuté la commande. Sans ce `cd`, `qwen serve` utilise par défaut `process.cwd()` et un `POST /session` depuis un client s'attendant à votre espace de travail de projet renverra `400 workspace_mismatch` — un piège silencieux.

OK pour des flux de travail ponctuels du type "laissez-moi exécuter ceci en arrière-plan pendant que je teste l'API". **Non recommandé** pour quoi que ce soit au-delà d'une session unique — pas de redémarrage en cas de plantage, le fichier journal croît sans limite, pas de moyen propre de retrouver le démon si vous oubliez le PID. Préférez tmux pour une supervision interactive, ou systemd / launchd pour tout ce que vous voulez faire survivre à un redémarrage.

## Vérifier que le démon est actif

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # fonctionnalités du démon
```

Lorsque l'authentification est configurée (c'est-à-dire que le démon a été démarré avec `--token` / `QWEN_SERVER_TOKEN` défini, OU `--require-auth=true`), toutes les routes sauf `/health` sur la boucle locale nécessitent `Authorization: Bearer <jeton>`. Si vous avez démarré le démon sans jeton sur la boucle locale par défaut (le chemin sans configuration de `qwen serve`), aucun appel ne nécessite d'en-tête. Les modèles ci-dessus configurent tous un jeton, donc l'en-tête `Authorization` est nécessaire en pratique. Si `/capabilities` renvoie `401`, le jeton de l'unité / plist ne correspond pas au jeton exporté dans l'environnement utilisé par votre `curl`.

## Rotation du jeton

1. Générez un nouveau jeton et écrivez le fichier d'environnement référencé par l'unité :
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (Pour les modèles launchd / nohup / tmux : modifiez la valeur `<string>` du plist ou réexportez `QWEN_SERVER_TOKEN`. N'oubliez pas `chmod 600` sur le plist si vous le régénérez.)
2. Redémarrez le démon :
   - **systemd** : `systemctl --user restart qwen-serve.service`
   - **launchd** : `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup** : `kill <pid>` puis relancez avec le nouveau jeton dans l'environnement
3. Mettez à jour les SDK / scripts des clients. Le `DaemonClient` du SDK TypeScript lit `QWEN_SERVER_TOKEN` automatiquement (repli PR 27) — réexportez la nouvelle valeur dans tout shell client et reconstruisez le client.

## Comportement de redémarrage et de plantage

Les sémantiques de redémarrage du gestionnaire de services diffèrent selon les modèles :

- **systemd `Restart=on-failure`** — redémarrage uniquement en cas de sortie non nulle / signal. Un SIGTERM propre (`systemctl stop`) ne déclenche **pas** une boucle de redémarrage.
- **launchd `KeepAlive` avec `SuccessfulExit=false`** (le modèle ci-dessus) — correspond au comportement de systemd. Un simple `<true/>` aurait redémarré même après une sortie propre. `ThrottleInterval=10` limite les tempêtes de redémarrage sur les échecs persistants, reflétant le `RestartSec=5` de systemd.
- **tmux / nohup** — pas de redémarrage automatique. Un plantage du démon vous laisse avec un PID mort jusqu'à ce que vous relanciez.

Au cours de la **durée de vie d'un seul processus démon**, les déconnexions des clients sont récupérées via la reprise SSE `Last-Event-ID` conformément à la section [Modèle de durabilité](./qwen-serve.md#durability-model) du guide utilisateur — l'anneau de rejeu est en mémoire.

Un **redémarrage** du démon supprime toutes les sessions en mémoire ; les clients se reconnectent et repartent à zéro. La durabilité inter-redémarrage du contenu des sessions (prompts, appels d'outils, historique de conversation) n'est **PAS** dans la v0.16-alpha.

## Hors du périmètre (reporté à la v0.16.x ou ultérieure)

- **Déploiement conteneurisé** — Dockerfile, docker-compose, manifests Kubernetes, nginx + proxy inverse TLS, isolation des jetons multi-instances. Reporté à la v0.16.x dès qu'un pilote entreprise est engagé ; la documentation pourrirait faute de validation.
- **Fédération inter-hôtes / coordination multi-démon sur un seul hôte** — `1 démon = 1 espace de travail × N sessions` est appliqué. Le keying des jetons par instance et le nettoyage des jetons obsolètes sont reportés à la v0.16.x.
- **Jetons de démon générés automatiquement** — l'alpha est BYO (apportez votre propre jeton). L'infrastructure d'auto-génération et de stockage des jetons est reportée à la v0.16.x.
- **Service natif Windows** (`nssm`, wrapper Service Control Manager) — pour l'instant, utilisez [WSL2](https://learn.microsoft.com/fr-fr/windows/wsl/) et suivez la section systemd ci-dessus.

Consultez l'encadré [Limites connues de la v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) dans le guide utilisateur principal pour la liste complète des fonctionnalités reportées, et [#4175](https://github.com/QwenLM/qwen-code/issues/4175) pour le suivi du déploiement de la v0.16-alpha.
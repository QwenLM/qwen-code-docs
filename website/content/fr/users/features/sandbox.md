# Sandbox

Ce document explique le confinement de l'exécution des outils sur Linux et les méthodes existantes de sandbox pour l'ensemble du CLI.

## Sandbox d'exécution d'outils Linux

Sur Linux, installez `bwrap` (Bubblewrap) dans `/usr/bin/bwrap` (le chemin système pris en charge) pour obtenir la limite la plus forte prise en charge, puis activez le sandbox d'exécution d'outils dans vos paramètres **Utilisateur** (`~/.qwen/settings.json`, ou le répertoire sélectionné par `QWEN_HOME`) ou les paramètres **Système** administrateur :

```json
{
  "tools": {
    "executionSandbox": {
      "backend": "auto",
      "filesystem": "workspace-write",
      "network": "closed"
    }
  }
}
```

`filesystem` et `network` sont requis. `backend` a la valeur par défaut `auto`, qui tente d'abord bwrap. Lorsque bwrap n'est pas disponible et que `network` est `open`, `auto` peut utiliser le helper Landlock intégré sur les noyaux avec Landlock ABI 3 ou plus récent. Définissez `backend` à `bwrap` ou `landlock` pour exiger cette implémentation exacte. Landlock ne peut pas appliquer `network: closed` ni masquer les chemins masqués explicites. Chacune de ces exigences rejette Landlock avant le démarrage de toute commande ; le fallback automatique ne supprime jamais un masque de chemin restant. Utilisez `read-only` pour refuser les écritures dans le workspace, ou `workspace-write` pour autoriser les écritures dans le workspace canonique courant. Chaque commande reçoit également un espace de travail temporaire privé. Les paramètres ordinaires `includeDirectories` n'accordent pas d'accès en écriture. Gardez le workspace séparé des répertoires d'installation de Qwen, de configuration utilisateur et d'état d'exécution.

Le CLI, le transport de modèle, l'authentification et le stockage de session restent sur l'hôte. Le shell, le terminal `!`, l'interpolation de prompt shell, le Monitor, les appels Read/Write/Edit et les appels Agent/Code Mode imbriqués en processus pris en charge utilisent la même politique d'exécution. Avec bwrap, `network: closed` bloque les connexions hôtes/externes ordinaires des commandes, tandis que `open` partage le réseau hôte. Les lectures restent larges : ce mode ne masque pas les secrets de l'hôte ni ne promet d'isoler les sockets Unix de chemin et les services hôte. L'approbation et YOLO n'étendent pas la politique de système de fichiers ou de réseau. Les flux standard sont des capacités explicites fournies par l'appelant : une socket déjà connectée, un TTY ou un périphérique caractère reste utilisable même avec `network: closed`. Le réseau fermé ne révoque pas ces descripteurs existants ; évitez de fournir une connexion à un service hôte en stdin lorsque cet accès n'est pas souhaité. Les entrées stdin de fichier et de FIFO nommée nécessitent le helper d'entrée Linux x64/arm64 intégré et sont copiées via une socket de flux Unix privée avec sa moitié d'écriture fermée ; les décalages de fichier régulier n'avancent que par les octets consommés de cette socket, et un écrivain FIFO inactif ne retarde pas l'achèvement de la commande. Lisez le fd 0 directement : cette entrée est une socket plutôt qu'une FIFO, et la rouvrir via `/dev/stdin` ou `/proc/self/fd/0` n'est pas pris en charge. SIGINT/SIGTERM annulent la commande mais vidangent toujours les octets stdout/stderr acceptés ; une sortie fermée arrête ce flux avec le code de sortie 141 tandis que l'autre sortie valide est vidangée.

Landlock signale une application `partial` car il restreint les lectures, écritures et mutations de répertoire par chemin mais ne crée pas d'espaces de noms PID ou réseau et ne peut pas actuellement restreindre chaque opération de métadonnées, y compris `chmod`, `chown`, les attributs étendus et les horodatages. Une commande Landlock peut voir les processus de l'hôte et utilise le réseau de l'hôte. Les descendants détachés conservent les restrictions de système de fichiers Landlock mais n'obtiennent pas la limite de durée de vie d'espace de noms PID de bwrap. Les descripteurs de fichiers ouverts conservent leur accès existant. Qwen Code transmet les entrées stdin de fichier et de FIFO nommée via une socket en lecture seule privée au lieu de passer ces descripteurs à la charge utile ; les sockets, périphériques caractère et tubes anonymes peuvent être partagés. Les flux standard de sortie restent les destinations explicites de l'appelant. Le descripteur d'état d'exécution se ferme à l'exec de la charge utile.

Landlock a également une surface de périphériques inscriptibles plus étroite : il accorde les écritures dans `/dev/null`, mais ne crée pas les montages privés `/dev` et `/proc` de bwrap. L'ouverture de `/dev/full` ou `/dev/tty` en écriture et la création de fichiers dans `/dev/shm` sont refusées, donc les programmes nécessitant ces opérations peuvent échouer. Utilisez le répertoire temporaire privé exposé via `TMPDIR`, `TMP` et `TEMP` pour les fichiers temporaires. Les flux standard ouverts et fournis par l'appelant conservent leur accès existant. La sonde de politique Landlock au démarrage nécessite `/usr/bin/true` ; un hôte qui en est privé échoue à la sonde même si son noyau prend en charge Landlock.

Les paramètres de workspace ne peuvent pas activer, désactiver ou modifier cette politique, même dans un projet de confiance. La précédence effective est Système sur Utilisateur sur SystemDefaults, sélectionnant un objet de politique complet. Les valeurs doivent être des littéraux ; les substitutions d'environnement, champs inconnus et objets incomplets sont rejetés. `--bare` et `--safe-mode` conservent le confinement de l'opérateur. Les modifications nécessitent un nouveau runtime. Un fichier de paramètres SystemDefaults, Utilisateur ou Système mal formé ou illisible bloque maintenant le démarrage (code de sortie de configuration 52), au lieu de réinitialiser silencieusement la politique inconnue à des paramètres vides. L'erreur nomme le fichier et l'action de réparation. Réparez son objet JSON ou restaurez l'accès en lecture, puis redémarrez. Une copie `.corrupted` Utilisateur n'est qu'une référence ; le fichier original de l'opérateur n'est jamais effacé. La récupération de workspace uniquement reste disponible sans le confinement de l'opérateur. Les paramètres de workspace liés mal formés (y compris un répertoire `.qwen` lié ou un fichier hard-linké) nécessitent une réparation manuelle ; la récupération automatique refuse avant de modifier l'original ou une copie de corruption précédente. Le JSON lié valide reste lisible.

Ce mode public initial prend en charge le CLI headless ordinaire et les deux interfaces de terminal. ACP, `qwen serve` et les terminaux web le rejettent explicitement. MCP/LSP, les hooks/extensions exécutables, la gestion worktree/arena, les agents externes, l'exécution spéculative, les checkpoints de fichiers, la maintenance automatique de skill/mémoire, et les outils de processus ou de mutation non portés sont désactivés ou rejetés. Les agents en processus du même workspace ne peuvent pas ajouter de hooks, serveurs MCP, exécuteurs externes ou isolation worktree. Les commandes de statut personnalisées, les rendus Markdown/image externes, la détection et connexion IDE, la restauration de fichiers et les aperçus Git diff de l'hôte sont désactivés. Le rewind de conversation uniquement reste disponible.

Les diagnostics d'opérateur explicites tels que `/doctor`, l'ouverture ou l'édition de fichiers et dossiers via `/memory`, et le changement de paramètres via `/skills` restent des actions d'hôte de confiance. Ces commandes de gestion ne sont pas exposées comme commandes invocables par le modèle. Choisir un skill remplit le champ d'entrée ; soumettre `/skill-name` signale actuellement une erreur de mode non pris en charge avant de préparer les arguments ou de mettre à jour les enregistrements d'utilisation. L'exécution de commande skill et l'outil Skill du modèle restent indisponibles jusqu'à ce que leurs écritures de préparation soient confinées. La mémoire automatique et la maintenance de skill restent désactivées dans ce runtime même si vous modifiez leurs paramètres enregistrés.

Inspectez et vérifiez la limite active avant d'exécuter une tâche :

```bash
qwen sandbox
qwen sandbox --verify
qwen sandbox -- sh -c 'printf "confined command\n"'
qwen -y -p "Update the project and run its tests"
```

Les worktrees Git liés reçoivent l'accès en écriture au workspace admis uniquement. Le répertoire commun Git et les métadonnées worktree en dehors de ce workspace restent en lecture seule ; ce mode n'autorise pas implicitement la modification des métadonnées de dépôt d'un autre checkout. Les opérations nécessitant ces écritures peuvent être refusées.

Le rapport nomme la limite de l'outil, le backend demandé/effectif, le niveau d'application, l'ABI Landlock le cas échéant, le workspace, le système de fichiers et la politique réseau de commande. `--verify` vérifie les écritures de workspace, le refus contre un fichier connu comme inscriptible sur l'hôte, l'identité d'espace de noms PID privée ou partagée attendue, et l'espace de noms réseau sélectionné. Une sonde de backend réussie établit l'admission, pas la viabilité complète de session authentifiée sous tous les paramètres d'environnement hérités. Exécutez une tâche ordinaire ensuite pour tester ses outils et services requis. Si la vérification ne peut pas créer son fixture temporaire côté hôte, vérifiez `TMPDIR` et les permissions du répertoire ; ceci est séparé d'un refus de limite. Les erreurs de configuration du backend échouent avant l'exécution de la charge utile et ne relancent jamais la commande sur l'hôte. La sous-commande de commande unique transmet les arguments littéraux et l'entrée standard redirigée tout en préservant stdout et stderr octet par octet ; utilisez le terminal `!` pour les commandes PTY interactives.

### Migration depuis le bwrap pour l'ensemble du CLI

Remplacez `--sandbox bwrap` et supprimez `tools.sandbox: "bwrap"`, `QWEN_SANDBOX=bwrap`, `QWEN_SANDBOX_NET` et `QWEN_SANDBOX_PROXY_COMMAND`, puis configurez `tools.executionSandbox` comme ci-dessus. Redémarrez depuis un shell en dehors de l'ancien sandbox ; l'héritage de `SANDBOX=bwrap` est rejeté. `proxied` n'est pas une politique réseau prise en charge. Ne combinez pas ce mode avec Docker, Podman, Seatbelt ou un marqueur de sandbox pour l'ensemble du CLI hérité. Les anciens paramètres bwrap produisent une erreur de migration explicite.

Les méthodes Docker, Podman et macOS Seatbelt ci-dessous exécutent toujours l'ensemble du CLI dans leur environnement existant.

## Prérequis

Avant d'utiliser le sandboxing, vous devez installer et configurer Qwen Code :

```bash
npm install -g @qwen-code/qwen-code
```

Pour vérifier l'installation

```bash
qwen --version
```

## Présentation du sandboxing

Le sandboxing isole les opérations potentiellement dangereuses (comme les commandes shell ou les modifications de fichiers) de votre système hôte, fournissant une barrière de sécurité entre le CLI et votre environnement.

Les avantages du sandboxing incluent :

- **Sécurité** : Empêche les dommages accidentels au système ou la perte de données.
- **Isolation** : Limite l'accès au système de fichiers au répertoire du projet.
- **Cohérence** : Garantit des environnements reproductibles sur différents systèmes.
- **Sûreté** : Réduit les risques lorsque vous travaillez avec du code non fiable ou des commandes expérimentales.

> [!note]
>
> **Remarque sur le nommage :** Certaines variables d'environnement liées au sandbox peuvent avoir historiquement utilisé le préfixe `GEMINI_*`. Toutes les nouvelles variables d'environnement utilisent le préfixe `QWEN_*`.

## Méthodes de sandboxing

Votre méthode idéale de sandboxing peut différer selon votre plateforme et votre solution de conteneur préférée.

### 1. macOS Seatbelt (macOS uniquement)

Sandboxing léger intégré utilisant `sandbox-exec`.

**Profil par défaut** : `permissive-open` – restreint les écritures en dehors du répertoire du projet, mais permet la plupart des autres opérations et l'accès réseau sortant.

**Idéal pour** : Rapide, pas besoin de Docker, garde-fous solides pour les écritures de fichiers.

### 2. Basé sur conteneur (Docker/Podman)

Sandboxing multiplateforme avec une isolation complète des processus.

Par défaut, Qwen Code utilise une image sandbox publiée (configurée dans le package CLI) et la téléchargera si nécessaire.

Le sandbox conteneur monte votre espace de travail et votre répertoire `~/.qwen` dans le conteneur afin que l'authentification et les paramètres persistent entre les exécutions.

**Idéal pour** : Isolation forte sur n'importe quel OS, outils cohérents dans une image connue.

### Choisir une méthode

- **Sur macOS** :
  - Utilisez Seatbelt lorsque vous souhaitez un sandboxing léger (recommandé pour la plupart des utilisateurs).
  - Utilisez Docker/Podman lorsque vous avez besoin d'un environnement Linux complet (par exemple, des outils nécessitant des binaires Linux).
- **Sur Linux/Windows** :
  - Utilisez Docker ou Podman.

## Prise en main rapide

```bash
# Enable sandboxing with command flag
qwen -s -p "analyze the code structure"

# Or enable sandboxing for your shell session (recommended for CI / scripts)
export QWEN_SANDBOX=true   # true auto-picks a provider (see notes below)
qwen -p "run the test suite"

# Configure in settings.json
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **Remarques sur la sélection du fournisseur :**
>
> - Sur **macOS**, `QWEN_SANDBOX=true` sélectionne généralement `sandbox-exec` (Seatbelt) s'il est disponible.
> - Sur **Linux/Windows**, `QWEN_SANDBOX=true` nécessite que `docker` ou `podman` soit installé.
> - Pour forcer un fournisseur, définissez `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Configuration

### Activer le sandboxing (par ordre de priorité)

1. **Variable d'environnement** : `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Option de commande / argument** : `-s`, `--sandbox`, ou `--sandbox=<fournisseur>`
3. **Fichier de paramètres** : `tools.sandbox` dans votre `settings.json` (par exemple, `{"tools": {"sandbox": true}}`).

> [!important]
>
> Si `QWEN_SANDBOX` est défini, il **remplace** l'option CLI et `settings.json`.

`--sandbox` et `-s` acceptent une valeur optionnelle : `true`, `false`, `docker`, `podman` ou `sandbox-exec`. Pour la sélection automatique avec un prompt, utilisez `qwen --sandbox=true "query"` ou `qwen --sandbox -p "query"`. Contrairement à l'ancien analyseur booléen uniquement, `qwen --sandbox "query"` traite maintenant `query` comme une valeur de backend et rejette un backend inconnu. Les options avant `--` utilisent la même grammaire même après des mots positionnels ; utilisez `-p "..."` pour le texte d'option littéral dans un prompt. `--` arrête l'analyse d'options, mais ses tokens restants ne sont pas transmis comme prompt de commande par défaut. Les options de sandbox de session ne sont pas acceptées sur les sous-commandes de gestion, dont les alias `-s` conservent leur propre signification.

### Configurer l'image sandbox (Docker/Podman)

- **Option CLI** : `--sandbox-image <image>`
- **Variable d'environnement** : `QWEN_SANDBOX_IMAGE=<image>`
- **Fichier de paramètres** : `tools.sandboxImage` dans votre `settings.json` (par exemple, `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`)

Ordre de priorité (du plus élevé au plus bas) :

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. Image par défaut intégrée du package CLI (par exemple `ghcr.io/qwenlm/qwen-code:<version>`)

`settings.env.QWEN_SANDBOX_IMAGE` fonctionne également comme un mécanisme d'injection d'environnement générique, mais `tools.sandboxImage` est le paramètre persistant préféré.

Les images personnalisées sont gérées par l'utilisateur. Reconstruisez-les avec une installation de Qwen Code à jour pour recevoir le handoff de mise à jour sécurisée ; les images plus anciennes peuvent encore utiliser leur updater in-process d'origine.


### Profils Seatbelt macOS

Profils intégrés (définis via la variable d'environnement `SEATBELT_PROFILE`) :

- `permissive-open` (par défaut) : Restrictions d'écriture, réseau autorisé
- `permissive-closed` : Restrictions d'écriture, pas de réseau
- `permissive-proxied` : Restrictions d'écriture, réseau via proxy
- `restrictive-open` : Restrictions strictes, réseau autorisé
- `restrictive-closed` : Restrictions maximales
- `restrictive-proxied` : Restrictions strictes, réseau via proxy

> [!tip]
>
> Commencez avec `permissive-open`, puis resserrez vers `restrictive-closed` si votre workflow fonctionne toujours.

### Profils Seatbelt personnalisés (macOS)

Pour utiliser un profil Seatbelt personnalisé :

1. Créez un fichier nommé `.qwen/sandbox-macos-<nom_profil>.sb` dans votre projet.
2. Définissez `SEATBELT_PROFILE=<nom_profil>`.

### Options sandbox personnalisées

Pour le sandboxing basé sur conteneur, vous pouvez injecter des options personnalisées dans la commande `docker` ou `podman` en utilisant la variable d'environnement `SANDBOX_FLAGS`. Cela est utile pour des configurations avancées, comme la désactivation des fonctionnalités de sécurité pour des cas d'utilisation spécifiques.

**Exemple (Podman)** :

Pour désactiver l'étiquetage SELinux pour les montages de volumes, vous pouvez définir la variable suivante :

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Plusieurs options peuvent être fournies sous forme de chaîne séparée par des espaces :

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Proxy réseau (toutes les méthodes de sandbox)

Si vous souhaitez restreindre l'accès réseau sortant à une liste d'autorisation, vous pouvez exécuter un proxy local aux côtés du sandbox :

- Définissez `QWEN_SANDBOX_PROXY_COMMAND=<commande>`
- La commande doit démarrer un serveur proxy qui écoute sur `:::8877`

Ceci est particulièrement utile avec les profils Seatbelt `*-proxied`.

Pour un exemple fonctionnel de proxy de type liste d'autorisation, voir : [Script proxy d'exemple](../../developers/examples/proxy-script.md).

## Gestion UID/GID sous Linux

Sous Linux, Qwen Code active par défaut le mappage UID/GID afin que le sandbox s'exécute en tant que votre utilisateur (et réutilise le `~/.qwen` monté). Remplacez par :

```bash
export SANDBOX_SET_UID_GID=true   # Force l'UID/GID de l'hôte
export SANDBOX_SET_UID_GID=false  # Désactive le mappage UID/GID
```

## Dépannage

### Problèmes courants

**"Operation not permitted"**

- L'opération nécessite un accès en dehors du sandbox.
- Sur macOS Seatbelt : essayez un `SEATBELT_PROFILE` plus permissif.
- Sur Docker/Podman : vérifiez que l'espace de travail est monté et que votre commande ne nécessite pas d'accès en dehors du répertoire du projet.

**Commandes manquantes**

- Sandbox conteneur : ajoutez-les via `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt : les binaires de votre hôte sont utilisés, mais le sandbox peut restreindre l'accès à certains chemins.

**Java non disponible dans le sandbox Docker**

L'image Docker officielle de Qwen Code est intentionnellement minimale pour rester petite, sécurisée et rapide à télécharger. Différents utilisateurs ont besoin de différents environnements d'exécution (Java, Python, Node.js, etc.), et il n'est pas pratique de regrouper tous les environnements dans une seule image. Par conséquent, Java **n'est pas inclus par défaut** dans le sandbox Docker.

Si votre workflow nécessite Java, vous pouvez étendre l'image de base en créant un fichier `.qwen/sandbox.Dockerfile` dans votre projet :

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Ensuite, reconstruisez l'image sandbox :

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

Pour plus de détails sur la personnalisation du sandbox, voir [Personnalisation de l'environnement sandbox](../../developers/tools/sandbox.md).

**Problèmes réseau**

- Vérifiez que le profil sandbox autorise le réseau.
- Vérifiez la configuration du proxy.

### Mode débogage

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Remarque :** Si vous avez `DEBUG=true` dans un fichier `.env` du projet, cela n'affectera pas le CLI en raison de l'exclusion automatique. Utilisez les fichiers `.qwen/.env` pour les paramètres de débogage spécifiques à Qwen Code.

### Inspecter le sandbox

```bash
# Check environment
qwen -s -p "run shell command: env | grep SANDBOX"

# List mounts
qwen -s -p "run shell command: mount | grep workspace"
```

## Notes de sécurité

- Le sandboxing réduit mais n'élimine pas tous les risques.
- Utilisez le profil le plus restrictif qui permette votre travail.
- La surcharge du conteneur est minime après le premier téléchargement/construction.
- Les applications GUI peuvent ne pas fonctionner dans les sandbox.

## Documentation associée

- [Configuration](../configuration/settings) : Options de configuration complètes.
- [Commandes](../features/commands) : Commandes disponibles.
- [Dépannage](../support/troubleshooting) : Dépannage général.
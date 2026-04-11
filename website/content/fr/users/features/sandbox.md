# Sandbox

Ce document explique comment exécuter Qwen Code dans un sandbox afin de réduire les risques lorsque des outils exécutent des commandes shell ou modifient des fichiers.

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

Le sandboxing isole les opérations potentiellement dangereuses (comme les commandes shell ou les modifications de fichiers) de votre système hôte, en fournissant une barrière de sécurité entre la CLI et votre environnement.

Les avantages du sandboxing incluent :

- **Sécurité** : Empêche les dommages accidentels au système ou la perte de données.
- **Isolation** : Limite l'accès au système de fichiers au répertoire du projet.
- **Cohérence** : Garantit des environnements reproductibles sur différents systèmes.
- **Sûreté** : Réduit les risques lors de l'utilisation de code non fiable ou de commandes expérimentales.

> [!note]
>
> **Note sur le nommage :** Certaines variables d'environnement liées au sandbox utilisaient historiquement le préfixe `GEMINI_*`. Toutes les nouvelles variables d'environnement utilisent le préfixe `QWEN_*`.

## Méthodes de sandboxing

La méthode de sandboxing idéale peut varier selon votre plateforme et votre solution de conteneurisation préférée.

### 1. macOS Seatbelt (macOS uniquement)

Sandboxing léger et intégré utilisant `sandbox-exec`.

**Profil par défaut** : `permissive-open` - restreint les écritures en dehors du répertoire du projet, mais autorise la plupart des autres opérations et l'accès réseau sortant.

**Idéal pour** : Rapidité, aucun besoin de Docker, garde-fous stricts pour les écritures de fichiers.

### 2. Basé sur des conteneurs (Docker/Podman)

Sandboxing multiplateforme avec isolation complète des processus.

Par défaut, Qwen Code utilise une image sandbox publiée (configurée dans le package CLI) et la télécharge si nécessaire.

Le sandbox conteneurisé monte votre espace de travail et votre répertoire `~/.qwen` dans le conteneur afin que l'authentification et les paramètres persistent entre les exécutions.

**Idéal pour** : Isolation forte sur tout OS, outillage cohérent dans une image connue.

### Choisir une méthode

- **Sur macOS** :
  - Utilisez Seatbelt pour un sandboxing léger (recommandé pour la plupart des utilisateurs).
  - Utilisez Docker/Podman si vous avez besoin d'un espace utilisateur Linux complet (par ex., outils nécessitant des binaires Linux).
- **Sur Linux/Windows** :
  - Utilisez Docker ou Podman.

## Démarrage rapide

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
> **Notes sur la sélection du fournisseur :**
>
> - Sur **macOS**, `QWEN_SANDBOX=true` sélectionne généralement `sandbox-exec` (Seatbelt) s'il est disponible.
> - Sur **Linux/Windows**, `QWEN_SANDBOX=true` nécessite que `docker` ou `podman` soit installé.
> - Pour forcer un fournisseur, définissez `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Configuration

### Activer le sandboxing (par ordre de priorité)

1. **Variable d'environnement** : `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Option / argument de commande** : `-s`, `--sandbox` ou `--sandbox=<provider>`
3. **Fichier de paramètres** : `tools.sandbox` dans votre `settings.json` (par ex., `{"tools": {"sandbox": true}}`).

> [!important]
>
> Si `QWEN_SANDBOX` est défini, il **écrase** l'option CLI et `settings.json`.

### Configurer l'image sandbox (Docker/Podman)

- **Option CLI** : `--sandbox-image <image>`
- **Variable d'environnement** : `QWEN_SANDBOX_IMAGE=<image>`

Si vous ne définissez ni l'un ni l'autre, Qwen Code utilise l'image par défaut configurée dans le package CLI (par exemple `ghcr.io/qwenlm/qwen-code:<version>`).

### Profils macOS Seatbelt

Profils intégrés (définis via la variable d'environnement `SEATBELT_PROFILE`) :

- `permissive-open` (par défaut) : Restrictions d'écriture, réseau autorisé
- `permissive-closed` : Restrictions d'écriture, aucun réseau
- `permissive-proxied` : Restrictions d'écriture, réseau via proxy
- `restrictive-open` : Restrictions strictes, réseau autorisé
- `restrictive-closed` : Restrictions maximales
- `restrictive-proxied` : Restrictions strictes, réseau via proxy

> [!tip]
>
> Commencez par `permissive-open`, puis passez à `restrictive-closed` si votre flux de travail le permet.

### Profils Seatbelt personnalisés (macOS)

Pour utiliser un profil Seatbelt personnalisé :

1. Créez un fichier nommé `.qwen/sandbox-macos-<profile_name>.sb` dans votre projet.
2. Définissez `SEATBELT_PROFILE=<profile_name>`.

### Indicateurs sandbox personnalisés

Pour le sandboxing basé sur des conteneurs, vous pouvez injecter des indicateurs personnalisés dans la commande `docker` ou `podman` à l'aide de la variable d'environnement `SANDBOX_FLAGS`. Cela s'avère utile pour des configurations avancées, comme la désactivation de fonctionnalités de sécurité pour des cas d'usage spécifiques.

**Exemple (Podman)** :

Pour désactiver l'étiquetage SELinux pour les montages de volumes, vous pouvez définir ce qui suit :

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Plusieurs indicateurs peuvent être fournis sous forme de chaîne séparée par des espaces :

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Proxy réseau (toutes les méthodes de sandbox)

Si vous souhaitez restreindre l'accès réseau sortant à une allowlist, vous pouvez exécuter un proxy local parallèlement au sandbox :

- Définissez `QWEN_SANDBOX_PROXY_COMMAND=<command>`
- La commande doit démarrer un serveur proxy écoutant sur `:::8877`

Cela est particulièrement utile avec les profils Seatbelt `*-proxied`.

Pour un exemple fonctionnel de proxy de type allowlist, consultez : [Exemple de script proxy](/developers/examples/proxy-script).

## Gestion des UID/GID sous Linux

Sous Linux, Qwen Code active par défaut le mappage UID/GID afin que le sandbox s'exécute avec votre utilisateur (et réutilise le `~/.qwen` monté). Vous pouvez remplacer ce comportement avec :

```bash
export SANDBOX_SET_UID_GID=true   # Force host UID/GID
export SANDBOX_SET_UID_GID=false  # Disable UID/GID mapping
```

## Dépannage

### Problèmes courants

**"Operation not permitted"**

- L'opération nécessite un accès en dehors du sandbox.
- Sur macOS Seatbelt : essayez un `SEATBELT_PROFILE` plus permissif.
- Sur Docker/Podman : vérifiez que l'espace de travail est monté et que votre commande ne nécessite pas d'accès en dehors du répertoire du projet.

**Commandes manquantes**

- Sandbox conteneurisé : ajoutez-les via `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt : les binaires de votre hôte sont utilisés, mais le sandbox peut restreindre l'accès à certains chemins.

**Java non disponible dans le sandbox Docker**

L'image Docker officielle de Qwen Code est volontairement minimale pour rester légère, sécurisée et rapide à télécharger. Les utilisateurs ayant besoin de différents environnements d'exécution (Java, Python, Node.js, etc.), il n'est pas pratique de tous les inclure dans une seule image. Par conséquent, Java n'est **pas inclus par défaut** dans le sandbox Docker.

Si votre flux de travail nécessite Java, vous pouvez étendre l'image de base en créant un `.qwen/sandbox.Dockerfile` dans votre projet :

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Reconstruisez ensuite l'image sandbox :

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

Pour plus de détails sur la personnalisation du sandbox, consultez [Personnalisation de l'environnement sandbox](/developers/tools/sandbox).

**Problèmes réseau**

- Vérifiez que le profil sandbox autorise le réseau.
- Vérifiez la configuration du proxy.

### Mode debug

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Remarque :** Si vous avez `DEBUG=true` dans le fichier `.env` d'un projet, cela n'affectera pas la CLI en raison de l'exclusion automatique. Utilisez les fichiers `.qwen/.env` pour les paramètres de debug spécifiques à Qwen Code.

### Inspecter le sandbox

```bash
# Check environment
qwen -s -p "run shell command: env | grep SANDBOX"

# List mounts
qwen -s -p "run shell command: mount | grep workspace"
```

## Notes de sécurité

- Le sandboxing réduit mais n'élimine pas tous les risques.
- Utilisez le profil le plus restrictif qui permet à votre travail de s'exécuter.
- La surcharge des conteneurs est minime après le premier téléchargement/compilation.
- Les applications GUI peuvent ne pas fonctionner dans les sandboxes.

## Documentation connexe

- [Configuration](../configuration/settings) : Options de configuration complètes.
- [Commandes](../features/commands) : Commandes disponibles.
- [Dépannage](../support/troubleshooting) : Dépannage général.
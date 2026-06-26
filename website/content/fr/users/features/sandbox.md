# Sandbox

Ce document explique comment exécuter Qwen Code dans un sandbox pour réduire les risques lorsque les outils exécutent des commandes shell ou modifient des fichiers.

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
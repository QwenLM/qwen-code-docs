# Sandbox

Ce document explique comment exécuter Qwen Code dans un environnement isolé (sandbox) afin de réduire les risques lorsque les outils exécutent des commandes shell ou modifient des fichiers.

## Prérequis

Avant d'utiliser l'isolation (sandboxing), vous devez installer et configurer Qwen Code :

```bash
npm install -g @qwen-code/qwen-code
```

Pour vérifier l'installation

```bash
qwen --version
```

## Aperçu du sandboxing

Le sandboxing isole les opérations potentiellement dangereuses (telles que les commandes shell ou les modifications de fichiers) de votre système hôte, en fournissant une barrière de sécurité entre le CLI et votre environnement.

Les avantages du sandboxing incluent :

- **Sécurité** : Empêche les dommages accidentels au système ou la perte de données.
- **Isolation** : Limite l'accès au système de fichiers au répertoire du projet.
- **Cohérence** : Assure des environnements reproductibles sur différents systèmes.
- **Sécurité** : Réduit les risques lors de l'utilisation de code non approuvé ou de commandes expérimentales.

> [!note]
>
> **Remarque sur le nommage** : Certaines variables d'environnement liées au sandboxing utilisent encore le préfixe `GEMINI_*` pour des raisons de compatibilité ascendante.

## Méthodes de sandboxing

Votre méthode idéale de sandboxing peut varier selon votre plateforme et votre solution de conteneurisation préférée.

### 1. macOS Seatbelt (macOS uniquement)

Sandboxing intégré et léger utilisant `sandbox-exec`.

**Profil par défaut** : `permissive-open` - restreint les écritures en dehors du répertoire du projet, mais autorise la plupart des autres opérations ainsi que l'accès réseau sortant.

**Idéal pour** : Exécution rapide, sans Docker requis, protections solides pour les écritures de fichiers.

### 2. Basé sur conteneur (Docker/Podman)

Sandboxing multiplateforme avec isolement complet des processus.

Par défaut, Qwen Code utilise une image sandbox publiée (configurée dans le package CLI) et la téléchargera selon les besoins.

Le sandbox conteneur monte votre espace de travail et votre répertoire `~/.qwen` dans le conteneur afin que l'authentification et les paramètres persistent entre les exécutions.

**Idéal pour** : Isolation forte sur n'importe quel système d'exploitation, outils cohérents à l'intérieur d'une image connue.

### Choisir une méthode

- **Sur macOS** :
  - Utilisez Seatbelt lorsque vous souhaitez une sandboxing légère (recommandé pour la plupart des utilisateurs).
  - Utilisez Docker/Podman lorsque vous avez besoin d'un environnement utilisateur Linux complet (par exemple, les outils qui nécessitent des binaires Linux).
- **Sur Linux/Windows** :
  - Utilisez Docker ou Podman.

## Démarrage rapide

```bash

# Activer le sandboxing avec l'option de commande
qwen -s -p "analyser la structure du code"

# Ou activer le sandboxing pour votre session shell (recommandé pour CI / scripts)
export GEMINI_SANDBOX=true   # true sélectionne automatiquement un fournisseur (voir notes ci-dessous)
qwen -p "exécuter la suite de tests"

# Configurer dans settings.json
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
> - Sur **macOS**, `GEMINI_SANDBOX=true` sélectionne généralement `sandbox-exec` (Seatbelt) si disponible.
> - Sur **Linux/Windows**, `GEMINI_SANDBOX=true` nécessite que `docker` ou `podman` soit installé.
> - Pour forcer un fournisseur, définissez `GEMINI_SANDBOX=docker|podman|sandbox-exec`.

## Configuration

### Activer le mode bac à sable (par ordre de priorité)

1. **Variable d'environnement** : `GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Option de commande** : `-s`, `--sandbox`, ou `--sandbox=<fournisseur>`
3. **Fichier de configuration** : `tools.sandbox` dans votre `settings.json` (par exemple, `{"tools": {"sandbox": true}}`).

> [!important]
>
> Si `GEMINI_SANDBOX` est définie, elle **remplace** l'option CLI et le fichier `settings.json`.

### Configurer l'image du bac à sable (Docker/Podman)

- **Option CLI** : `--sandbox-image <image>`
- **Variable d'environnement** : `GEMINI_SANDBOX_IMAGE=<image>`

Si vous ne définissez aucune de ces options, Qwen Code utilise l'image par défaut configurée dans le package CLI (par exemple `ghcr.io/qwenlm/qwen-code:<version>`).

### Profils Seatbelt macOS

Profils intégrés (définis via la variable d'environnement `SEATBELT_PROFILE`) :

- `permissive-open` (par défaut) : Restrictions en écriture, réseau autorisé
- `permissive-closed` : Restrictions en écriture, pas de réseau
- `permissive-proxied` : Restrictions en écriture, réseau via proxy
- `restrictive-open` : Restrictions strictes, réseau autorisé
- `restrictive-closed` : Restrictions maximales
- `restrictive-proxied` : Restrictions strictes, réseau via proxy

> [!tip]
>
> Commencez avec `permissive-open`, puis resserrez vers `restrictive-closed` si votre flux de travail fonctionne toujours.

### Profils Seatbelt personnalisés (macOS)

Pour utiliser un profil Seatbelt personnalisé :

1. Créez un fichier nommé `.qwen/sandbox-macos-<nom_du_profil>.sb` dans votre projet.
2. Définissez `SEATBELT_PROFILE=<nom_du_profil>`.

### Indicateurs de bac à sable personnalisés

Pour le bac à sable basé sur les conteneurs, vous pouvez injecter des indicateurs personnalisés dans la commande `docker` ou `podman` en utilisant la variable d'environnement `SANDBOX_FLAGS`. Ceci est utile pour des configurations avancées, comme la désactivation des fonctionnalités de sécurité pour des cas d'usage spécifiques.

**Exemple (Podman)** :

Pour désactiver l'étiquetage SELinux pour les montages de volumes, vous pouvez définir ce qui suit :

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Plusieurs indicateurs peuvent être fournis sous forme d'une chaîne séparée par des espaces :

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Proxy réseau (toutes les méthodes de sandbox)

Si vous souhaitez restreindre l'accès réseau sortant à une liste blanche, vous pouvez exécuter un proxy local en parallèle avec la sandbox :

- Définissez `GEMINI_SANDBOX_PROXY_COMMAND=<command>`
- La commande doit démarrer un serveur proxy qui écoute sur `:::8877`

Ceci est particulièrement utile avec les profils Seatbelt `*-proxied`.

Pour un exemple fonctionnel de proxy en mode liste blanche, consultez : [Exemple de script proxy](/developers/examples/proxy-script).

## Gestion des UID/GID Linux

Sur Linux, Qwen Code active par défaut le mappage des UID/GID afin que la sandbox s'exécute sous votre utilisateur (et réutilise le dossier monté `~/.qwen`). Vous pouvez modifier ce comportement avec :

```bash
export SANDBOX_SET_UID_GID=true   # Forcer l'UID/GID hôte
export SANDBOX_SET_UID_GID=false  # Désactiver le mappage UID/GID
```

## Dépannage

### Problèmes courants

**"Opération non autorisée"**

- L'opération nécessite un accès en dehors du bac à sable.
- Sur macOS Seatbelt : essayez un `SEATBELT_PROFILE` plus permissif.
- Sur Docker/Podman : vérifiez que l'espace de travail est monté et que votre commande ne nécessite pas d'accéder en dehors du répertoire du projet.

**Commandes manquantes**

- Bac à sable du conteneur : ajoutez-les via `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt : vos binaires hôtes sont utilisés, mais le bac à sable peut restreindre l'accès à certains chemins.

**Problèmes réseau**

- Vérifiez que le profil du bac à sable autorise l'accès au réseau.
- Vérifiez la configuration du proxy.

### Mode débogage

```bash
DEBUG=1 qwen -s -p "commande de débogage"
```

**Remarque :** Si vous avez `DEBUG=true` dans le fichier `.env` d'un projet, cela n'affectera pas la CLI en raison de l'exclusion automatique. Utilisez les fichiers `.qwen/.env` pour les paramètres de débogage spécifiques à Qwen Code.

### Inspection du bac à sable

```bash

# Vérifier l'environnement
qwen -s -p "exécuter la commande shell : env | grep SANDBOX"

# Lister les montages
qwen -s -p "exécuter la commande shell : mount | grep workspace"
```

## Notes de sécurité

- Le sandboxing réduit mais n'élimine pas tous les risques.
- Utilisez le profil le plus restrictif qui permette votre travail.
- La surcharge des conteneurs est minimale après le premier téléchargement/construction.
- Les applications avec interface graphique peuvent ne pas fonctionner dans les environnements isolés.

## Documentation connexe

- [Configuration](../configuration/settings) : Options complètes de configuration.
- [Commandes](../features/commands) : Commandes disponibles.
- [Dépannage](../support/troubleshooting) : Dépannage général.
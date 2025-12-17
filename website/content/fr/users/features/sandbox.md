# Bac à sable

Ce document explique comment exécuter Qwen Code dans un bac à sable afin de réduire les risques lorsque des outils exécutent des commandes shell ou modifient des fichiers.

## Prérequis

Avant d'utiliser le bac à sable, vous devez installer et configurer Qwen Code :

```bash
npm install -g @qwen-code/qwen-code
```

Pour vérifier l'installation

```bash
qwen --version
```

## Aperçu de l'isolation (sandboxing)

L'isolation (sandboxing) sépare les opérations potentiellement dangereuses (telles que les commandes shell ou les modifications de fichiers) de votre système hôte, fournissant ainsi une barrière de sécurité entre la CLI et votre environnement.

Les avantages de l'isolation incluent :

- **Sécurité** : Prévenir les dommages accidentels au système ou la perte de données.
- **Isolation** : Limiter l'accès au système de fichiers au répertoire du projet.
- **Cohérence** : Garantir des environnements reproductibles sur différents systèmes.
- **Sûreté** : Réduire les risques lors de l'utilisation de code non fiable ou de commandes expérimentales.

> [!note]
>
> **Remarque sur la terminologie :** Certaines variables d'environnement liées à l'isolation utilisent encore le préfixe `GEMINI_*` pour des raisons de compatibilité ascendante.

## Méthodes d'isolation

Votre méthode idéale d'isolation peut varier selon votre plateforme et votre solution de conteneurisation préférée.

### 1. macOS Seatbelt (macOS uniquement)

Bac à sable léger intégré utilisant `sandbox-exec`.

**Profil par défaut** : `permissive-open` – restreint les écritures en dehors du répertoire du projet, mais autorise la plupart des autres opérations et l'accès réseau sortant.

**Idéal pour** : Rapidité, pas besoin de Docker, protection solide contre les écritures de fichiers.

### 2. Basé sur conteneur (Docker/Podman)

Bac à sable multiplateforme avec isolement complet des processus.

Par défaut, Qwen Code utilise une image de bac à sable publiée (configurée dans le paquet CLI) et la récupère si nécessaire.

**Idéal pour** : Isolement fort sur n'importe quel système d'exploitation, outillage cohérent à l'intérieur d'une image connue.

### Choisir une méthode

- **Sur macOS** :
  - Utilisez Seatbelt lorsque vous souhaitez un bac à sable léger (recommandé pour la plupart des utilisateurs).
  - Utilisez Docker/Podman lorsque vous avez besoin d'un environnement utilisateur Linux complet (par exemple, des outils nécessitant des binaires Linux).
- **Sur Linux/Windows** :
  - Utilisez Docker ou Podman.

## Démarrage rapide

```bash

# Activer le bac à sable avec un drapeau de commande
qwen -s -p "analyser la structure du code"

# Ou activer le bac à sable pour votre session shell (recommandé pour CI/scripts)
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

### Activer le bac à sable (par ordre de priorité)

1. **Variable d’environnement** : `GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Indicateur / argument de commande** : `-s`, `--sandbox`, ou `--sandbox=<fournisseur>`
3. **Fichier de configuration** : `tools.sandbox` dans votre `settings.json` (ex. : `{"tools": {"sandbox": true}}`).

> [!important]
>
> Si `GEMINI_SANDBOX` est défini, il **remplace** l’indicateur CLI et `settings.json`.

### Configurer l’image du bac à sable (Docker/Podman)

- **Option CLI** : `--sandbox-image <image>`
- **Variable d’environnement** : `GEMINI_SANDBOX_IMAGE=<image>`

Si vous ne définissez aucune de ces options, Qwen Code utilise l’image par défaut configurée dans le paquet CLI (par exemple `ghcr.io/qwenlm/qwen-code:<version>`).

### Profils Seatbelt macOS

Profils intégrés (définis via la variable d’environnement `SEATBELT_PROFILE`) :

- `permissive-open` (par défaut) : Restrictions en écriture, réseau autorisé
- `permissive-closed` : Restrictions en écriture, pas de réseau
- `permissive-proxied` : Restrictions en écriture, réseau via proxy
- `restrictive-open` : Restrictions strictes, réseau autorisé
- `restrictive-closed` : Restrictions maximales
- `restrictive-proxied` : Restrictions strictes, réseau via proxy

> [!tip]
>
> Commencez avec `permissive-open`, puis resserrez jusqu’à `restrictive-closed` si votre flux de travail fonctionne toujours.

### Profils Seatbelt personnalisés (macOS)

Pour utiliser un profil Seatbelt personnalisé :

1. Créez un fichier nommé `.qwen/sandbox-macos-<profile_name>.sb` dans votre projet.
2. Définissez `SEATBELT_PROFILE=<profile_name>`.

### Indicateurs de bac à sable personnalisés

Pour le bac à sable basé sur des conteneurs, vous pouvez injecter des indicateurs personnalisés dans la commande `docker` ou `podman` en utilisant la variable d'environnement `SANDBOX_FLAGS`. Cela est utile pour les configurations avancées, telles que la désactivation des fonctionnalités de sécurité pour des cas d'utilisation spécifiques.

**Exemple (Podman)** :

Pour désactiver l'étiquetage SELinux pour les montages de volumes, vous pouvez définir ce qui suit :

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Plusieurs indicateurs peuvent être fournis sous forme de chaîne séparée par des espaces :

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Proxy réseau (toutes les méthodes de bac à sable)

Si vous souhaitez restreindre l'accès réseau sortant à une liste d'autorisation, vous pouvez exécuter un proxy local aux côtés du bac à sable :

- Définissez `GEMINI_SANDBOX_PROXY_COMMAND=<command>`
- La commande doit démarrer un serveur proxy qui écoute sur `:::8877`

Ceci est particulièrement utile avec les profils Seatbelt de type `*-proxied`.

Pour un exemple fonctionnel de proxy avec liste d'autorisation, voir : [Exemple de script proxy](/developers/examples/proxy-script).

## Gestion des UID/GID Linux

Le bac à sable gère automatiquement les permissions utilisateur sur Linux. Remplacez ces permissions avec :

```bash
export SANDBOX_SET_UID_GID=true   # Forcer l'UID/GID de l'hôte
export SANDBOX_SET_UID_GID=false  # Désactiver le mappage UID/GID
```

## Personnalisation de l'environnement sandbox (Docker/Podman)

Si vous avez besoin d'outils supplémentaires dans le conteneur (par exemple, `git`, `python`, `rg`), créez un Dockerfile personnalisé :

- Chemin : `.qwen/sandbox.Dockerfile`
- Puis exécutez avec : `BUILD_SANDBOX=1 qwen -s ...`

Cela construit une image spécifique au projet basée sur l'image sandbox par défaut.

## Dépannage

### Problèmes courants

**« Operation not permitted »**

- L'opération nécessite un accès en dehors du bac à sable.
- Sur macOS Seatbelt : essayez un `SEATBELT_PROFILE` plus permissif.
- Sur Docker/Podman : vérifiez que l'espace de travail est monté et que votre commande ne nécessite pas d'accéder en dehors du répertoire du projet.

**Commandes manquantes**

- Bac à sable conteneurisé : ajoutez-les via `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt : vos binaires hôtes sont utilisés, mais le bac à sable peut restreindre l'accès à certains chemins.

**Problèmes réseau**

- Vérifiez que le profil du bac à sable autorise le réseau.
- Vérifiez la configuration du proxy.

### Mode débogage

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Remarque :** Si vous avez `DEBUG=true` dans le fichier `.env` d'un projet, cela n'affectera pas la CLI en raison d'une exclusion automatique. Utilisez les fichiers `.qwen/.env` pour les paramètres de débogage spécifiques à Qwen Code.

### Inspection du bac à sable

```bash

# Vérifier l'environnement
qwen -s -p "run shell command: env | grep SANDBOX"

# Lister les montages
qwen -s -p "run shell command: mount | grep workspace"
```

## Notes de sécurité

- Le bac à sable réduit mais n'élimine pas tous les risques.
- Utilisez le profil le plus restrictif qui permet votre travail.
- La surcharge du conteneur est minimale après le premier pull/build.
- Les applications graphiques peuvent ne pas fonctionner dans les bacs à sable.

## Documentation associée

- [Configuration](../configuration/settings) : Options de configuration complètes.
- [Commandes](../features/commands) : Commandes disponibles.
- [Dépannage](../support/troubleshooting) : Dépannage général.
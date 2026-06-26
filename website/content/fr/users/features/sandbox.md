# Bac à sable

Ce document explique comment exécuter Qwen Code dans un bac à sable pour réduire les risques lorsque les outils exécutent des commandes shell ou modifient des fichiers.

## Prérequis

Avant d'utiliser le bac à sable, vous devez installer et configurer Qwen Code :

```bash
npm install -g @qwen-code/qwen-code
```

Pour vérifier l'installation

```bash
qwen --version
```

## Aperçu du bac à sable

Le bac à sable isole les opérations potentiellement dangereuses (comme les commandes shell ou les modifications de fichiers) de votre système hôte, offrant une barrière de sécurité entre la CLI et votre environnement.

Les avantages du bac à sable incluent :

- **Sécurité** : Évite les dommages accidentels au système ou la perte de données.
- **Isolement** : Limite l'accès au système de fichiers au répertoire du projet.
- **Cohérence** : Garantit des environnements reproductibles sur différents systèmes.
- **Sûreté** : Réduit les risques lors de l'utilisation de code non fiable ou de commandes expérimentales.

> [!note]
>
> **Note de nommage :** Certaines variables d'environnement liées au bac à sable ont pu utiliser historiquement le préfixe `GEMINI_*`. Toutes les nouvelles variables d'environnement utilisent le préfixe `QWEN_*`.

## Méthodes de bac à sable

La méthode idéale de bac à sable peut différer selon votre plateforme et votre solution de conteneur préférée.

### 1. Seatbelt macOS (macOS uniquement)

Bac à sable léger et intégré utilisant `sandbox-exec`.

**Profil par défaut** : `permissive-open` - restreint les écritures en dehors du répertoire du projet, mais autorise la plupart des autres opérations et l'accès réseau sortant.

**Meilleur pour** : Rapide, pas besoin de Docker, protections solides pour les écritures de fichiers.

### 2. Basé sur conteneur (Docker/Podman)

Bac à sable multiplateforme avec isolation complète des processus.

Par défaut, Qwen Code utilise une image de bac à sable publiée (configurée dans le package CLI) et la téléchargera si nécessaire.

Le bac à sable conteneur monte votre espace de travail et votre répertoire `~/.qwen` dans le conteneur afin que l'authentification et les paramètres persistent entre les exécutions.

**Meilleur pour** : Isolation forte sur tout OS, outils cohérents dans une image connue.

### Choisir une méthode

- **Sur macOS** :
  - Utilisez Seatbelt lorsque vous souhaitez un bac à sable léger (recommandé pour la plupart des utilisateurs).
  - Utilisez Docker/Podman lorsque vous avez besoin d'un environnement utilisateur Linux complet (par exemple, des outils nécessitant des binaires Linux).
- **Sur Linux/Windows** :
  - Utilisez Docker ou Podman.

## Démarrage rapide

```bash
# Activer le bac à sable avec un indicateur de commande
qwen -s -p "analyse la structure du code"

# Ou activer le bac à sable pour votre session shell (recommandé pour CI / scripts)
export QWEN_SANDBOX=true   # true sélectionne automatiquement un fournisseur (voir notes ci-dessous)
qwen -p "exécute la suite de tests"

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
> - Sur **macOS**, `QWEN_SANDBOX=true` sélectionne généralement `sandbox-exec` (Seatbelt) s'il est disponible.
> - Sur **Linux/Windows**, `QWEN_SANDBOX=true` nécessite que `docker` ou `podman` soit installé.
> - Pour forcer un fournisseur, définissez `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Configuration

### Activer le bac à sable (par ordre de priorité)

1. **Variable d'environnement** : `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Indicateur de commande / argument** : `-s`, `--sandbox`, ou `--sandbox=<fournisseur>`
3. **Fichier de paramètres** : `tools.sandbox` dans votre `settings.json` (par exemple, `{"tools": {"sandbox": true}}`).

> [!important]
>
> Si `QWEN_SANDBOX` est défini, il **remplace** l'indicateur CLI et le fichier `settings.json`.

### Configurer l'image du bac à sable (Docker/Podman)

- **Indicateur CLI** : `--sandbox-image <image>`
- **Variable d'environnement** : `QWEN_SANDBOX_IMAGE=<image>`
- **Fichier de paramètres** : `tools.sandboxImage` dans votre `settings.json` (par exemple, `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`)

Ordre de priorité (du plus haut au plus bas) :

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. Image par défaut intégrée dans le package CLI (par exemple `ghcr.io/qwenlm/qwen-code:<version>`)

`settings.env.QWEN_SANDBOX_IMAGE` fonctionne également comme un mécanisme d'injection générique de variables, mais `tools.sandboxImage` est le paramètre persistant préféré.

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
> Commencez avec `permissive-open`, puis resserrez vers `restrictive-closed` si votre flux de travail fonctionne toujours.

### Profils Seatbelt personnalisés (macOS)

Pour utiliser un profil Seatbelt personnalisé :

1. Créez un fichier nommé `.qwen/sandbox-macos-<nom_profil>.sb` dans votre projet.
2. Définissez `SEATBELT_PROFILE=<nom_profil>`.

### Indicateurs de bac à sable personnalisés

Pour le bac à sable basé sur conteneur, vous pouvez injecter des indicateurs personnalisés dans la commande `docker` ou `podman` en utilisant la variable d'environnement `SANDBOX_FLAGS`. Ceci est utile pour des configurations avancées, comme la désactivation des fonctionnalités de sécurité pour des cas d'utilisation spécifiques.

**Exemple (Podman)** :

Pour désactiver l'étiquetage SELinux pour les montages de volumes, vous pouvez définir :
```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Plusieurs flags peuvent être fournis sous forme de chaîne séparée par des espaces :

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Proxy réseau (toutes les méthodes de sandbox)

Si vous souhaitez restreindre l'accès réseau sortant à une liste blanche, vous pouvez exécuter un proxy local à côté du sandbox :

- Définir `QWEN_SANDBOX_PROXY_COMMAND=<commande>`
- La commande doit démarrer un serveur proxy qui écoute sur `:::8877`
- Cela est particulièrement utile avec les profils Seatbelt `*-proxied`

Pour un exemple fonctionnel de proxy de type liste blanche, consultez : [Exemple de script proxy](../../developers/examples/proxy-script.md).

## Gestion des UID/GID sous Linux

Sous Linux, Qwen Code active par défaut le mappage UID/GID afin que le sandbox s'exécute avec votre utilisateur (et réutilise le `~/.qwen` monté). Remplacez avec :

```bash
export SANDBOX_SET_UID_GID=true   # Forcer l'UID/GID hôte
export SANDBOX_SET_UID_GID=false  # Désactiver le mappage UID/GID
```

## Dépannage

### Problèmes courants

**« Opération non autorisée »**

- L'opération nécessite un accès en dehors du sandbox.
- Sous macOS Seatbelt : essayez un `SEATBELT_PROFILE` plus permissif.
- Sous Docker/Podman : vérifiez que l'espace de travail est monté et que votre commande ne nécessite pas d'accès en dehors du répertoire du projet.

**Commandes manquantes**

- Sandbox conteneur : ajoutez-les via `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt : vos binaires hôtes sont utilisés, mais le sandbox peut restreindre l'accès à certains chemins.

**Java indisponible dans le sandbox Docker**

L'image Docker officielle de Qwen Code est intentionnellement minimale pour rester légère, sécurisée et rapide à télécharger. Différents utilisateurs ont besoin de différents environnements d'exécution (Java, Python, Node.js, etc.), et inclure tous les environnements dans une seule image n'est pas pratique. Par conséquent, Java **n'est pas inclus par défaut** dans le sandbox Docker.

Si votre flux de travail nécessite Java, vous pouvez étendre l'image de base en créant un fichier `.qwen/sandbox.Dockerfile` dans votre projet :

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Reconstruisez ensuite l'image du sandbox :

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

Pour plus de détails sur la personnalisation du sandbox, consultez [Personnalisation de l'environnement sandbox](../../developers/tools/sandbox.md).

**Problèmes réseau**

- Vérifiez que le profil du sandbox autorise le réseau.
- Vérifiez la configuration du proxy.

### Mode débogage

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Remarque :** Si vous avez `DEBUG=true` dans un fichier `.env` d'un projet, cela n'affectera pas le CLI en raison d'une exclusion automatique. Utilisez les fichiers `.qwen/.env` pour les paramètres de débogage spécifiques à Qwen Code.

### Inspecter le sandbox

```bash
# Vérifier l'environnement
qwen -s -p "run shell command: env | grep SANDBOX"

# Lister les montages
qwen -s -p "run shell command: mount | grep workspace"
```

## Remarques sur la sécurité

- Le sandbox réduit les risques mais ne les élimine pas complètement.
- Utilisez le profil le plus restrictif qui permet votre travail.
- La surcharge du conteneur est minime après le premier téléchargement/construction.
- Les applications GUI peuvent ne pas fonctionner dans les sandbox.

## Documentation connexe

- [Configuration](../configuration/settings) : Options de configuration complètes.
- [Commandes](../features/commands) : Commandes disponibles.
- [Dépannage général](../support/troubleshooting) : Dépannage général.

# Sandbox

Ce document explique comment exécuter Qwen Code dans un environnement isolé (sandbox) afin de réduire les risques liés à l’exécution de commandes shell ou à la modification de fichiers par les outils.

## Prérequis

Avant d’utiliser l’environnement isolé, vous devez installer et configurer Qwen Code :

```bash
npm install -g @qwen-code/qwen-code
```

Pour vérifier l’installation :

```bash
qwen --version
```

## Aperçu du bac à sable (sandboxing)

Le bac à sable isole les opérations potentiellement dangereuses (telles que les commandes shell ou les modifications de fichiers) de votre système hôte, créant ainsi une barrière de sécurité entre l’interface en ligne de commande (CLI) et votre environnement.

Les avantages du bac à sable sont les suivants :

- **Sécurité** : évite les dommages accidentels au système ou la perte de données ;
- **Isolation** : limite l’accès au système de fichiers au répertoire du projet ;
- **Cohérence** : garantit des environnements reproductibles sur différents systèmes ;
- **Sécurité renforcée** : réduit les risques lors de l’utilisation de code non fiable ou de commandes expérimentales.

> [!note]
>
> **Remarque concernant la dénomination** : Certaines variables d’environnement liées au bac à sable ont pu utiliser historiquement le préfixe `GEMINI_*`. Toutes les nouvelles variables d’environnement utilisent désormais le préfixe `QWEN_*`.

## Méthodes de bac à sable

La méthode idéale de bac à sable peut varier selon votre plateforme et votre solution de conteneurisation préférée.

### 1. Seatbelt macOS (macOS uniquement)

Sandboxing intégré léger utilisant `sandbox-exec`.

**Profil par défaut** : `permissive-open` — restreint les écritures en dehors du répertoire du projet, mais autorise la plupart des autres opérations ainsi que l’accès réseau sortant.

**Idéal pour** : une exécution rapide, sans Docker requis, avec des garde-fous solides contre les écritures de fichiers.

### 2. Basé sur un conteneur (Docker/Podman)

Sandboxing multiplateforme avec une isolation complète des processus.

Par défaut, Qwen Code utilise une image de sandbox publiée (configurée dans le package CLI) et la télécharge au besoin.

Le sandbox conteneurisé monte votre espace de travail et votre répertoire `~/.qwen` dans le conteneur afin que vos identifiants et paramètres soient conservés entre les exécutions.

**Idéal pour** : une isolation forte sur tout système d’exploitation, avec un ensemble d’outils cohérent à l’intérieur d’une image connue.

### Choix d’une méthode

- **Sur macOS** :
  - Utilisez Seatbelt si vous souhaitez une isolation légère (recommandé pour la plupart des utilisateurs).
  - Utilisez Docker ou Podman si vous avez besoin d’un environnement utilisateur Linux complet (par exemple, des outils nécessitant des binaires Linux).
- **Sur Linux ou Windows** :
  - Utilisez Docker ou Podman.

## Démarrage rapide

```bash

# Activer l’isolation via un indicateur de commande
qwen -s -p "analyser la structure du code"

# Ou activer l’isolation pour votre session shell (recommandé pour les pipelines CI / les scripts)
export QWEN_SANDBOX=true   # « true » choisit automatiquement un fournisseur (voir remarques ci-dessous)
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
> **Remarques sur le choix du fournisseur :**
>
> - Sur **macOS**, `QWEN_SANDBOX=true` sélectionne généralement `sandbox-exec` (Seatbelt), s’il est disponible.
> - Sur **Linux/Windows**, `QWEN_SANDBOX=true` nécessite que `docker` ou `podman` soit installé.
> - Pour imposer un fournisseur spécifique, définissez `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Configuration

### Activer la sandbox (par ordre de priorité)

1. **Variable d’environnement** : `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Indicateur ou argument de ligne de commande** : `-s`, `--sandbox` ou `--sandbox=<fournisseur>`
3. **Fichier de paramètres** : `tools.sandbox` dans votre fichier `settings.json` (par exemple `{"tools": {"sandbox": true}}`).

> [!important]
>
> Si la variable `QWEN_SANDBOX` est définie, elle **remplace** à la fois l’indicateur CLI et le fichier `settings.json`.

### Configurer l’image de la sandbox (Docker/Podman)

- **Indicateur CLI** : `--sandbox-image <image>`
- **Variable d’environnement** : `QWEN_SANDBOX_IMAGE=<image>`

Si aucune de ces deux options n’est définie, Qwen Code utilise l’image par défaut configurée dans le package CLI (par exemple `ghcr.io/qwenlm/qwen-code:<version>`).

### Profils Seatbelt pour macOS

Profils intégrés (définis via la variable d’environnement `SEATBELT_PROFILE`) :

- `permissive-open` (par défaut) : restrictions en écriture, réseau autorisé  
- `permissive-closed` : restrictions en écriture, aucun accès réseau  
- `permissive-proxied` : restrictions en écriture, accès réseau uniquement via un proxy  
- `restrictive-open` : restrictions strictes, réseau autorisé  
- `restrictive-closed` : restrictions maximales  
- `restrictive-proxied` : restrictions strictes, accès réseau uniquement via un proxy  

> [!tip]  
>  
> Commencez avec `permissive-open`, puis durcissez progressivement vers `restrictive-closed` si votre flux de travail fonctionne toujours correctement.

### Profils Seatbelt personnalisés (macOS)

Pour utiliser un profil Seatbelt personnalisé :

1. Créez un fichier nommé `.qwen/sandbox-macos-<nom_du_profil>.sb` dans votre projet.  
2. Définissez la variable d’environnement `SEATBELT_PROFILE=<nom_du_profil>`.

### Drapeaux personnalisés pour le bac à sable

Pour la virtualisation basée sur des conteneurs, vous pouvez injecter des drapeaux personnalisés dans la commande `docker` ou `podman` à l’aide de la variable d’environnement `SANDBOX_FLAGS`. Cette fonctionnalité est utile pour des configurations avancées, par exemple désactiver certaines fonctionnalités de sécurité dans des cas d’usage spécifiques.

**Exemple (Podman)** :

Pour désactiver l’étiquetage SELinux lors du montage de volumes, définissez la variable suivante :

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Plusieurs drapeaux peuvent être fournis sous forme de chaîne séparée par des espaces :

```bash
export SANDBOX_FLAGS="--flag1 --flag2=valeur"
```

### Interception réseau (toutes les méthodes de bac à sable)

Si vous souhaitez restreindre l’accès réseau sortant à une liste blanche, vous pouvez exécuter un proxy local en parallèle du bac à sable :

- Définissez `QWEN_SANDBOX_PROXY_COMMAND=<commande>`
- La commande doit démarrer un serveur proxy écoutant sur `:::8877`

Cette approche est particulièrement utile avec les profils Seatbelt de type `*-proxied`.

Pour un exemple fonctionnel de proxy basé sur une liste blanche, consultez : [Script de proxy d’exemple](/developers/examples/proxy-script).

## Gestion des UID/GID sous Linux

Sous Linux, Qwen Code active par défaut le mappage des UID/GID afin que la sandbox s’exécute avec votre utilisateur (et réutilise le répertoire monté `~/.qwen`). Vous pouvez remplacer ce comportement avec :

```bash
export SANDBOX_SET_UID_GID=true   # Forcer l’utilisation des UID/GID de l’hôte
export SANDBOX_SET_UID_GID=false  # Désactiver le mappage des UID/GID
```

## Dépannage

### Problèmes courants

**« Opération non autorisée »**

- L’opération nécessite un accès en dehors du bac à sable.
- Sur macOS avec Seatbelt : essayez un profil `SEATBELT_PROFILE` plus permissif.
- Sur Docker/Podman : vérifiez que l’espace de travail est correctement monté et que votre commande ne nécessite pas d’accéder à des chemins situés en dehors du répertoire du projet.

**Commandes manquantes**

- Bac à sable conteneurisé : ajoutez-les via `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt : les binaires hôtes sont utilisés, mais le bac à sable peut restreindre l’accès à certains chemins.

**Java indisponible dans le bac à sable Docker**

L’image Docker officielle Qwen Code est volontairement minimaliste afin de garder l’image légère, sécurisée et rapide à télécharger. Les utilisateurs ont des besoins variés en termes d’environnements d’exécution (Java, Python, Node.js, etc.), et intégrer tous ces environnements dans une seule image n’est pas pratique. Par conséquent, Java **n’est pas inclus par défaut** dans le bac à sable Docker.

Si votre flux de travail nécessite Java, vous pouvez étendre l’image de base en créant un fichier `.qwen/sandbox.Dockerfile` dans votre projet :

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Ensuite, reconstruisez l’image du bac à sable :

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

Pour plus de détails sur la personnalisation du bac à sable, consultez [Personnaliser l’environnement du bac à sable](/developers/tools/sandbox).

**Problèmes réseau**

- Vérifiez que le profil du bac à sable autorise l’accès réseau.
- Vérifiez la configuration du proxy.

### Mode débogage

```bash
DEBUG=1 qwen -s -p "commande de débogage"
```

**Remarque :** Si vous avez `DEBUG=true` dans le fichier `.env` d’un projet, cela n’affectera pas l’interface en ligne de commande (CLI), car ce fichier est automatiquement ignoré. Utilisez plutôt les fichiers `.qwen/.env` pour définir des paramètres de débogage spécifiques à Qwen Code.

### Inspecter le bac à sable

```bash

# Vérifier l’environnement
qwen -s -p "exécuter la commande shell : env | grep SANDBOX"

# Lister les points de montage
qwen -s -p "exécuter la commande shell : mount | grep workspace"
```

## Remarques sur la sécurité

- La mise en bac à sable réduit les risques, mais ne les élimine pas tous.
- Utilisez le profil le plus restrictif compatible avec vos besoins.
- La surcharge liée aux conteneurs est minime après le premier téléchargement ou la première compilation.
- Les applications graphiques peuvent ne pas fonctionner dans les bacs à sable.

## Documentation connexe

- [Configuration](../configuration/settings) : Options complètes de configuration.
- [Commandes](../features/commands) : Commandes disponibles.
- [Résolution des problèmes](../support/troubleshooting) : Procédures générales de dépannage.
# Sandboxing dans Qwen Code

Ce document fournit un guide sur le sandboxing dans Qwen Code, incluant les prérequis, un démarrage rapide et la configuration.

## Prérequis

Avant d'utiliser le sandboxing, vous devez installer et configurer Qwen Code :

```bash
npm install -g @qwen-code/qwen-code
```

Pour vérifier l'installation

```bash
qwen --version
```

## Aperçu du sandboxing

Le sandboxing isole les opérations potentiellement dangereuses (telles que les commandes shell ou les modifications de fichiers) de votre système hôte, fournissant une barrière de sécurité entre les opérations IA et votre environnement.

Les avantages du sandboxing incluent :

- **Sécurité** : Prévenir les dommages accidentels au système ou la perte de données.
- **Isolation** : Limiter l'accès au système de fichiers au répertoire du projet.
- **Cohérence** : Garantir des environnements reproductibles sur différents systèmes.
- **Sécurité** : Réduire les risques lors de l'utilisation de code non fiable ou de commandes expérimentales.

## Méthodes de sandboxing

Votre méthode idéale de sandboxing peut différer en fonction de votre plateforme et de votre solution de conteneurisation préférée.

### 1. macOS Seatbelt (macOS uniquement)

Sandboxing léger intégré utilisant `sandbox-exec`.

**Profil par défaut** : `permissive-open` - restreint les écritures en dehors du répertoire du projet mais autorise la plupart des autres opérations.

### 2. Basé sur les conteneurs (Docker/Podman)

Sandboxing multiplateforme avec isolement complet des processus.

**Note** : Nécessite de construire l'image sandbox localement ou d'utiliser une image publiée depuis le registre de votre organisation.

## Démarrage rapide

```bash

# Activer le sandboxing avec un flag de commande
qwen -s -p "analyze the code structure"

# Utiliser une variable d'environnement
export GEMINI_SANDBOX=true
qwen -p "run the test suite"

# Configurer dans settings.json
{
  "sandbox": "docker"
}
```

## Configuration

### Activer le sandboxing (par ordre de priorité)

1. **Flag de commande** : `-s` ou `--sandbox`
2. **Variable d'environnement** : `GEMINI_SANDBOX=true|docker|podman|sandbox-exec`
3. **Fichier de configuration** : `"sandbox": true` dans `settings.json`

### Profils Seatbelt macOS

Profils intégrés (définis via la variable d'environnement `SEATBELT_PROFILE`) :

- `permissive-open` (par défaut) : Restrictions d'écriture, réseau autorisé
- `permissive-closed` : Restrictions d'écriture, pas de réseau
- `permissive-proxied` : Restrictions d'écriture, réseau via proxy
- `restrictive-open` : Restrictions strictes, réseau autorisé
- `restrictive-closed` : Restrictions maximales

### Custom Sandbox Flags

Pour le sandboxing basé sur des containers, vous pouvez injecter des flags personnalisés dans la commande `docker` ou `podman` en utilisant la variable d'environnement `SANDBOX_FLAGS`. Cela est utile pour les configurations avancées, comme désactiver des fonctionnalités de sécurité pour des cas d'usage spécifiques.

**Exemple (Podman)** :

Pour désactiver le labeling SELinux sur les montages de volumes, vous pouvez définir :

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Plusieurs flags peuvent être fournis sous forme de chaîne séparée par des espaces :

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

## Gestion des UID/GID Linux

Le sandbox gère automatiquement les permissions utilisateur sur Linux. Remplacez ces permissions avec :

```bash
export SANDBOX_SET_UID_GID=true   # Forcer l'UID/GID de l'hôte
export SANDBOX_SET_UID_GID=false  # Désactiver le mapping UID/GID
```

## Dépannage

### Problèmes courants

**"Operation not permitted"**

- L'opération nécessite un accès en dehors du sandbox.
- Essayez un profil plus permissif ou ajoutez des points de montage.

**Commandes manquantes**

- Ajoutez-les dans un Dockerfile personnalisé.
- Installez via `sandbox.bashrc`.

**Problèmes réseau**

- Vérifiez que le profil du sandbox autorise le réseau.
- Contrôlez la configuration du proxy.

### Mode debug

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Note :** Si vous avez `DEBUG=true` dans le fichier `.env` d’un projet, cela n’affectera pas le CLI car il est automatiquement exclu. Utilisez les fichiers `.qwen/.env` pour les paramètres de debug spécifiques à Qwen Code.

### Inspection du sandbox

```bash

# Vérifier l’environnement
qwen -s -p "run shell command: env | grep SANDBOX"

# Lister les montages
qwen -s -p "run shell command: mount | grep workspace"
```

## Notes de sécurité

- Le sandboxing réduit mais n’élimine pas tous les risques.
- Utilisez le profil le plus restrictif qui permet votre travail.
- La surcharge du conteneur est minime après la première construction.
- Les applications GUI peuvent ne pas fonctionner dans les sandboxes.

## Documentation associée

- [Configuration](./cli/configuration.md) : Options de configuration complètes.
- [Commandes](./cli/commands.md) : Commandes disponibles.
- [Dépannage](./troubleshooting.md) : Dépannage général.
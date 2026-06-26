# Publication d'extensions

Il existe trois méthodes principales pour publier des extensions destinées aux utilisateurs :

- [Dépôt Git](#publication-avec-un-dépôt-git)
- [GitHub Releases](#publication-avec-les-github-releases)
- [Registre npm](#publication-avec-le-registre-npm)

La publication via un dépôt Git est généralement l'approche la plus simple et la plus flexible, tandis que les GitHub Releases peuvent être plus efficaces lors de l'installation initiale car elles sont livrées sous forme d'archives uniques plutôt que de nécessiter un clone Git qui télécharge chaque fichier individuellement. Les GitHub Releases peuvent également contenir des archives spécifiques à une plateforme si vous devez distribuer des fichiers binaires spécifiques à une plateforme. La publication via le registre npm est idéale pour les équipes qui utilisent déjà npm pour la distribution de paquets, en particulier avec des registres privés.

## Publication avec un dépôt Git

C'est l'option la plus flexible et la plus simple. Tout ce que vous avez à faire est de créer un dépôt Git accessible publiquement (par exemple un dépôt GitHub public), puis les utilisateurs peuvent installer votre extension avec `qwen extensions install <votre-uri-du-dépôt>`, ou pour un dépôt GitHub ils peuvent utiliser le format simplifié `qwen extensions install <org>/<repo>`. Ils peuvent éventuellement dépendre d'une référence spécifique (branche/tag/commit) en utilisant l'argument `--ref=<une-réf>`, qui par défaut utilise la branche par défaut.

Lorsque des commits sont poussés sur la référence dont dépend un utilisateur, celui-ci sera invité à mettre à jour l'extension. Notez que cela permet également des retours en arrière faciles : le commit HEAD est toujours considéré comme la dernière version, indépendamment de la version réelle dans le fichier `qwen-extension.json`.

### Gestion des canaux de publication avec un dépôt Git

Les utilisateurs peuvent dépendre de n'importe quelle référence de votre dépôt Git, comme une branche ou un tag, ce qui vous permet de gérer plusieurs canaux de publication.

Par exemple, vous pouvez maintenir une branche `stable`, que les utilisateurs installeront ainsi : `qwen extensions install <votre-uri-du-dépôt> --ref=stable`. Ou vous pouvez en faire la valeur par défaut en traitant votre branche par défaut comme votre branche de publication stable, et effectuer le développement dans une autre branche (par exemple appelée `dev`). Vous pouvez maintenir autant de branches ou de tags que vous le souhaitez, offrant une flexibilité maximale pour vous et vos utilisateurs.

Notez que ces arguments `ref` peuvent être des tags, des branches, ou même des commits spécifiques, ce qui permet aux utilisateurs de dépendre d'une version spécifique de votre extension. C'est à vous de décider comment gérer vos tags et branches.

### Exemple de flux de publication avec un dépôt Git

Bien qu'il existe de nombreuses options pour gérer les publications avec un flux Git, nous vous recommandons de traiter votre branche par défaut comme votre branche de publication "stable". Cela signifie que le comportement par défaut de `qwen extensions install <votre-uri-du-dépôt>` est d'être sur la branche de publication stable.

Disons que vous souhaitez maintenir trois canaux de publication standard : `stable`, `preview` et `dev`. Vous effectuerez tout votre développement standard dans la branche `dev`. Lorsque vous êtes prêt à faire une publication preview, vous fusionnez cette branche dans votre branche `preview`. Lorsque vous êtes prêt à promouvoir votre branche preview en stable, vous fusionnez `preview` dans votre branche stable (qui peut être votre branche par défaut ou une branche différente).

Vous pouvez également sélectionner des modifications d'une branche à une autre en utilisant `git cherry-pick`, mais notez que cela entraînera un historique légèrement divergent entre vos branches, à moins que vous ne forciez la poussée des modifications sur vos branches à chaque publication pour restaurer un historique vierge (ce qui peut ne pas être possible pour la branche par défaut selon les paramètres de votre dépôt). Si vous prévoyez d'utiliser des cherry-picks, vous voudrez peut-être éviter que votre branche par défaut soit la branche stable afin d'éviter de forcer la poussée vers la branche par défaut, ce qui doit généralement être évité.

## Publication avec les GitHub Releases

Les extensions Qwen Code peuvent être distribuées via les [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Cela offre une expérience d'installation initiale plus rapide et plus fiable pour les utilisateurs, car cela évite de cloner le dépôt.

Chaque publication inclut au moins un fichier d'archive, qui contient l'intégralité du contenu du dépôt au tag auquel elle était liée. Les publications peuvent également inclure des [archives pré-construites personnalisées](#archives-pré-construites-personnalisées) si votre extension nécessite une étape de build ou contient des binaires spécifiques à une plateforme.

Lors de la vérification des mises à jour, Qwen Code cherchera simplement la dernière publication sur GitHub (vous devez la marquer comme telle lors de sa création), sauf si l'utilisateur a installé une publication spécifique en passant `--ref=<un-tag-de-publication>`. Nous ne supportons pas pour l'instant l'option d'activation des publications préliminaires ou du semver.

### Archives pré-construites personnalisées

Les archives personnalisées doivent être attachées directement à la publication GitHub en tant qu'artefacts et doivent être totalement autonomes. Cela signifie qu'elles doivent inclure l'extension entière, voir [structure d'archive](#structure-darchive).

Si votre extension est indépendante de la plateforme, vous pouvez fournir un seul artefact générique. Dans ce cas, un seul artefact doit être attaché à la publication.

Les archives personnalisées peuvent également être utilisées si vous souhaitez développer votre extension dans un dépôt plus vaste : vous pouvez créer une archive qui a une disposition différente du dépôt lui-même (par exemple, il peut s'agir simplement d'une archive d'un sous-répertoire contenant l'extension).
#### Archives spécifiques à la plateforme

Pour garantir que Qwen Code puisse trouver automatiquement le bon artefact de publication pour chaque plateforme, vous devez respecter cette convention de nommage. La CLI recherchera les artefacts dans l'ordre suivant :

1.  **Plateforme et architecture spécifiques :** `{platform}.{arch}.{name}.{extension}`
2.  **Plateforme spécifique :** `{platform}.{name}.{extension}`
3.  **Générique :** Si un seul artefact est fourni, il sera utilisé comme solution de repli générique.

- `{name}` : Le nom de votre extension.
- `{platform}` : Le système d'exploitation. Valeurs prises en charge :
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}` : L'architecture. Valeurs prises en charge :
  - `x64`
  - `arm64`
- `{extension}` : L'extension de fichier de l'archive (par exemple, `.tar.gz` ou `.zip`).

**Exemples :**

- `darwin.arm64.my-tool.tar.gz` (spécifique aux Mac Apple Silicon)
- `darwin.my-tool.tar.gz` (pour tous les Mac)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Structure de l'archive

Les archives doivent contenir des extensions autonomes et répondre à toutes les exigences standard - en particulier, le fichier `qwen-extension.json` doit se trouver à la racine de l'archive.

Le reste de la structure doit être exactement identique à celui d'une extension typique, voir [introduction.md](./introduction.md).

#### Exemple de workflow GitHub Actions

Voici un exemple de workflow GitHub Actions qui construit et publie une extension Qwen Code pour plusieurs plateformes :

```yaml
name: Release Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build

      - name: Create release assets
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```

## Publication via le registre npm

Vous pouvez publier les extensions Qwen Code sous forme de paquets npm avec scope (par exemple `@your-org/my-extension`). Cela convient bien lorsque :

- Votre équipe utilise déjà npm pour la distribution de paquets
- Vous avez besoin du support d'un registre privé avec une infrastructure d'authentification existante
- Vous souhaitez que la résolution de version et le contrôle d'accès soient gérés par npm

### Prérequis du paquet

Votre paquet npm doit inclure un fichier `qwen-extension.json` à la racine du paquet. Il s'agit du même fichier de configuration utilisé par toutes les extensions Qwen Code — le tarball npm n'est qu'un autre mécanisme de distribution.

Une structure de paquet minimale ressemble à :

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # fichier de contexte optionnel
├── commands/             # commandes personnalisées optionnelles
├── skills/               # compétences personnalisées optionnelles
└── agents/               # sous-agents personnalisés optionnels
```

Assurez-vous que `qwen-extension.json` est inclus dans votre paquet publié (c'est-à-dire qu'il n'est pas exclu par `.npmignore` ou le champ `files` dans `package.json`).

### Publication

Utilisez les outils de publication npm standard :

```bash
# Publier sur le registre par défaut
npm publish

# Publier sur un registre privé/personnalisé
npm publish --registry https://your-registry.com
```

### Installation

Les utilisateurs installent votre extension en utilisant le nom du paquet avec scope :

```bash
# Installer la dernière version
qwen extensions install @your-org/my-extension

# Installer une version spécifique
qwen extensions install @your-org/my-extension@1.2.0

# Installer depuis un registre personnalisé
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### Comportement de mise à jour

- Les extensions installées sans version spécifiée (par exemple `@scope/pkg`) suivent le dist-tag `latest`.
- Les extensions installées avec un dist-tag (par exemple `@scope/pkg@beta`) suivent ce tag spécifique.
- Les extensions épinglées à une version exacte (par exemple `@scope/pkg@1.2.0`) sont toujours considérées comme à jour et ne proposeront pas de mise à jour.

### Authentification pour les registres privés

Qwen Code lit automatiquement les informations d'authentification npm :

1. **`NPM_TOKEN` variable d'environnement** — priorité la plus élevée
2. **Fichier `.npmrc`** — prend en charge les entrées `_authToken` au niveau de l'hôte et avec scope de chemin (par exemple `//your-registry.com/:_authToken=TOKEN` ou `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

Les fichiers `.npmrc` sont lus à partir du répertoire courant et du répertoire personnel de l'utilisateur.

### Gestion des canaux de publication

Vous pouvez utiliser les dist-tags npm pour gérer les canaux de publication :

```bash
# Publier une version bêta
npm publish --tag beta

# Les utilisateurs installent le canal bêta
qwen extensions install @your-org/my-extension@beta
```

Cela fonctionne de manière similaire aux canaux de publication basés sur des branches git, mais utilise le mécanisme natif des dist-tags de npm.

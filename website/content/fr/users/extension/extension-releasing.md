# Publication d'extensions

Il existe trois méthodes principales pour publier des extensions auprès des utilisateurs :

- [Dépôt Git](#releasing-through-a-git-repository)
- [GitHub Releases](#releasing-through-github-releases)
- [Registre npm](#releasing-through-npm-registry)

Les publications via un dépôt Git sont généralement l'approche la plus simple et la plus flexible. Les GitHub Releases peuvent être plus efficaces lors de l'installation initiale, car elles sont distribuées sous forme d'archives uniques au lieu de nécessiter un `git clone` qui télécharge chaque fichier individuellement. Les GitHub Releases peuvent également contenir des archives spécifiques à une plateforme si vous devez distribuer des fichiers binaires dépendants du système d'exploitation. Les publications via le registre npm sont idéales pour les équipes qui utilisent déjà npm pour la distribution de paquets, en particulier avec des registres privés.

## Publication via un dépôt Git

Il s'agit de l'option la plus flexible et la plus simple. Il vous suffit de créer un dépôt Git accessible publiquement (comme un dépôt GitHub public) pour que les utilisateurs puissent installer votre extension avec `qwen extensions install <your-repo-uri>`, ou utiliser le format simplifié `qwen extensions install <org>/<repo>` pour un dépôt GitHub. Ils peuvent éventuellement cibler une référence spécifique (branche/tag/commit) à l'aide de l'argument `--ref=<some-ref>`, qui cible par défaut la branche principale.

Chaque fois que des commits sont poussés vers la référence dont dépend un utilisateur, celui-ci sera invité à mettre à jour l'extension. Notez que cela permet également des retours en arrière faciles : le commit `HEAD` est toujours considéré comme la dernière version, indépendamment de la version indiquée dans le fichier `qwen-extension.json`.

### Gestion des canaux de publication via un dépôt Git

Les utilisateurs peuvent dépendre de n'importe quelle référence de votre dépôt Git, comme une branche ou un tag, ce qui vous permet de gérer plusieurs canaux de publication.

Par exemple, vous pouvez maintenir une branche `stable`, que les utilisateurs peuvent installer ainsi : `qwen extensions install <your-repo-uri> --ref=stable`. Vous pouvez également en faire le comportement par défaut en considérant votre branche principale comme votre branche de publication stable, et en effectuant le développement dans une autre branche (par exemple `dev`). Vous pouvez maintenir autant de branches ou de tags que vous le souhaitez, offrant ainsi une flexibilité maximale pour vous et vos utilisateurs.

Notez que ces arguments `ref` peuvent être des tags, des branches ou même des commits spécifiques, ce qui permet aux utilisateurs de cibler une version précise de votre extension. La gestion de vos tags et branches vous appartient entièrement.

### Exemple de flux de publication avec un dépôt Git

Bien qu'il existe de nombreuses façons de gérer les publications avec un flux Git, nous recommandons de traiter votre branche principale comme votre branche de publication "stable". Cela signifie que le comportement par défaut de `qwen extensions install <your-repo-uri>` est de pointer vers la branche de publication stable.

Supposons que vous souhaitiez maintenir trois canaux de publication standards : `stable`, `preview` et `dev`. Vous effectuerez tout votre développement standard dans la branche `dev`. Lorsque vous êtes prêt à publier une version preview, vous fusionnez cette branche dans votre branche `preview`. Lorsque vous êtes prêt à promouvoir votre branche preview en stable, vous fusionnez `preview` dans votre branche stable (qui peut être votre branche principale ou une autre branche).

Vous pouvez également appliquer des modifications d'une branche à une autre à l'aide de `git cherry-pick`, mais notez que cela entraînera une légère divergence dans l'historique de vos branches, à moins que vous ne forciez la poussée (`force push`) des modifications vers vos branches à chaque publication pour réinitialiser l'historique (ce qui peut ne pas être possible pour la branche principale selon les paramètres de votre dépôt). Si vous prévoyez d'utiliser des cherry-picks, il est préférable d'éviter que votre branche principale ne soit la branche stable, afin d'éviter les `force push` sur la branche principale, une pratique généralement déconseillée.

## Publication via GitHub Releases

Les extensions Qwen Code peuvent être distribuées via [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Cela offre aux utilisateurs une expérience d'installation initiale plus rapide et plus fiable, car cela évite de devoir cloner le dépôt.

Chaque publication inclut au moins un fichier d'archive, qui contient l'intégralité du contenu du dépôt au niveau du tag auquel elle est liée. Les publications peuvent également inclure des [archives précompilées](#custom-pre-built-archives) si votre extension nécessite une étape de build ou si elle contient des binaires spécifiques à une plateforme.

Lors de la vérification des mises à jour, Qwen Code recherchera simplement la dernière publication sur GitHub (vous devez la marquer comme telle lors de sa création), sauf si l'utilisateur a installé une publication spécifique en passant `--ref=<some-release-tag>`. Nous ne prenons pas encore en charge l'opt-in pour les versions pre-release ou le semver.

### Archives précompilées personnalisées

Les archives personnalisées doivent être jointes directement à la publication GitHub en tant qu'assets et doivent être entièrement autonomes. Cela signifie qu'elles doivent inclure l'intégralité de l'extension, voir [structure de l'archive](#archive-structure).

Si votre extension est indépendante de la plateforme, vous pouvez fournir un seul asset générique. Dans ce cas, un seul asset doit être joint à la publication.

Les archives personnalisées peuvent également être utilisées si vous souhaitez développer votre extension au sein d'un dépôt plus vaste. Vous pouvez ainsi générer une archive dont la structure diffère de celle du dépôt (par exemple, une archive ne contenant qu'un sous-répertoire avec l'extension).

#### Archives spécifiques à une plateforme

Pour garantir que Qwen Code puisse trouver automatiquement le bon asset de publication pour chaque plateforme, vous devez respecter cette convention de nommage. La CLI recherchera les assets dans l'ordre suivant :

1.  **Spécifique à la plateforme et à l'architecture :** `{platform}.{arch}.{name}.{extension}`
2.  **Spécifique à la plateforme :** `{platform}.{name}.{extension}`
3.  **Générique :** Si un seul asset est fourni, il sera utilisé comme solution de repli générique.

- `{name}` : Le nom de votre extension.
- `{platform}` : Le système d'exploitation. Les valeurs prises en charge sont :
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}` : L'architecture. Les valeurs prises en charge sont :
  - `x64`
  - `arm64`
- `{extension}` : L'extension du fichier d'archive (par ex. `.tar.gz` ou `.zip`).

**Exemples :**

- `darwin.arm64.my-tool.tar.gz` (spécifique aux Mac Apple Silicon)
- `darwin.my-tool.tar.gz` (pour tous les Mac)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Structure de l'archive

Les archives doivent contenir l'intégralité de l'extension et respecter toutes les exigences standards : le fichier `qwen-extension.json` doit notamment se trouver à la racine de l'archive.

Le reste de la structure doit être identique à celui d'une extension classique, voir [extensions.md](extension.md).

#### Exemple de workflow GitHub Actions

Voici un exemple de workflow GitHub Actions qui build et publie une extension Qwen Code pour plusieurs plateformes :

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
          node-version: '20'

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

Vous pouvez publier des extensions Qwen Code sous forme de paquets npm scopés (par ex. `@your-org/my-extension`). Cette approche est idéale lorsque :

- Votre équipe utilise déjà npm pour la distribution de paquets
- Vous avez besoin d'un support pour les registres privés avec votre infrastructure d'authentification existante
- Vous souhaitez que la résolution des versions et le contrôle d'accès soient gérés par npm

### Prérequis du paquet

Votre paquet npm doit inclure un fichier `qwen-extension.json` à la racine du paquet. Il s'agit du même fichier de configuration utilisé par toutes les extensions Qwen Code : le tarball npm est simplement un autre mécanisme de distribution.

Une structure de paquet minimale ressemble à ceci :

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # optional context file
├── commands/             # optional custom commands
├── skills/               # optional custom skills
└── agents/               # optional custom subagents
```

Assurez-vous que `qwen-extension.json` est bien inclus dans votre paquet publié (c'est-à-dire qu'il n'est pas exclu par `.npmignore` ou par le champ `files` de `package.json`).

### Publication

Utilisez les outils de publication npm standards :

```bash
# Publish to the default registry
npm publish

# Publish to a private/custom registry
npm publish --registry https://your-registry.com
```

### Installation

Les utilisateurs installent votre extension en utilisant le nom scopé du paquet :

```bash
# Install latest version
qwen extensions install @your-org/my-extension

# Install a specific version
qwen extensions install @your-org/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### Comportement des mises à jour

- Les extensions installées sans version figée (par ex. `@scope/pkg`) suivent le dist-tag `latest`.
- Les extensions installées avec un dist-tag (par ex. `@scope/pkg@beta`) suivent ce tag spécifique.
- Les extensions figées sur une version exacte (par ex. `@scope/pkg@1.2.0`) sont toujours considérées comme à jour et ne proposeront pas de mise à jour.

### Authentification pour les registres privés

Qwen Code lit automatiquement les identifiants d'authentification npm :

1. **Variable d'environnement `NPM_TOKEN`** — priorité la plus élevée
2. **Fichier `.npmrc`** — prend en charge les entrées `_authToken` au niveau de l'hôte et avec un scope de chemin (par ex. `//your-registry.com/:_authToken=TOKEN` ou `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

Les fichiers `.npmrc` sont lus depuis le répertoire courant et le répertoire personnel de l'utilisateur.

### Gestion des canaux de publication

Vous pouvez utiliser les dist-tags npm pour gérer les canaux de publication :

```bash
# Publish a beta release
npm publish --tag beta

# Users install beta channel
qwen extensions install @your-org/my-extension@beta
```

Cela fonctionne de manière similaire aux canaux de publication basés sur des branches Git, mais utilise le mécanisme natif des dist-tags de npm.
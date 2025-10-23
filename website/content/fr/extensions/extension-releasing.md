# Publication d'extensions

Il existe deux méthodes principales pour publier des extensions auprès des utilisateurs :

- [Dépôt Git](#publier-via-un-dépôt-git)
- [GitHub Releases](#publier-via-github-releases)

Les publications via dépôt Git sont généralement l'approche la plus simple et flexible, tandis que les GitHub releases peuvent être plus efficaces lors de l'installation initiale puisqu'elles sont distribuées sous forme d'archives uniques au lieu de nécessiter un git clone qui télécharge chaque fichier individuellement. Les GitHub releases peuvent également contenir des archives spécifiques à certaines plateformes si vous devez distribuer des fichiers binaires dépendant de la plateforme.

## Publier via un dépôt Git

Il s'agit de l'option la plus flexible et la plus simple. Il vous suffit de créer un dépôt Git accessible publiquement (comme un repository GitHub public), puis les utilisateurs pourront installer votre extension en utilisant `qwen extensions install <your-repo-uri>`, ou pour un dépôt GitHub, ils peuvent utiliser le format simplifié `qwen extensions install <org>/<repo>`. Ils peuvent éventuellement dépendre d'une ref spécifique (branche/tag/commit) en utilisant l'argument `--ref=<some-ref>`, par défaut il s'agit de la branche par défaut.

À chaque fois que des commits sont poussés vers la ref dont dépend un utilisateur, celui-ci sera invité à mettre à jour l'extension. Notez que cela permet également des rollbacks faciles, le commit HEAD est toujours traité comme la dernière version, indépendamment de la version réelle dans le fichier `qwen-extension.json`.

### Gérer les canaux de release avec un dépôt Git

Les utilisateurs peuvent dépendre de n'importe quelle ref de votre dépôt Git, comme une branche ou un tag, ce qui vous permet de gérer plusieurs canaux de release.

Par exemple, vous pouvez maintenir une branche `stable`, que les utilisateurs peuvent installer de cette façon : `qwen extensions install <your-repo-uri> --ref=stable`. Ou bien, vous pouvez en faire la valeur par défaut en utilisant votre branche par défaut comme branche de release stable, et en faisant le développement dans une autre branche (par exemple appelée `dev`). Vous pouvez maintenir autant de branches ou de tags que vous le souhaitez, offrant une flexibilité maximale pour vous et vos utilisateurs.

Notez que ces arguments `ref` peuvent être des tags, des branches, ou même des commits spécifiques, ce qui permet aux utilisateurs de dépendre d'une version spécifique de votre extension. C'est à vous de décider comment vous souhaitez gérer vos tags et branches.

### Exemple de flux de publication utilisant un dépôt Git

Bien qu'il existe de nombreuses façons de gérer les releases avec un git flow, nous recommandons de considérer votre branche par défaut comme la branche de release « stable ». Cela signifie que le comportement par défaut de `qwen extensions install <your-repo-uri>` pointe vers la branche de release stable.

Imaginons que vous souhaitiez maintenir trois canaux de release standards : `stable`, `preview` et `dev`. Vous effectuerez tout votre développement classique dans la branche `dev`. Lorsque vous êtes prêt à publier une version preview, vous fusionnez cette branche dans votre branche `preview`. Quand vous décidez de promouvoir votre version preview en version stable, vous fusionnez `preview` dans votre branche stable (qui pourrait être votre branche par défaut ou une autre branche dédiée).

Vous pouvez également reporter des commits spécifiques d'une branche à une autre via `git cherry-pick`, mais attention : cela entraîne un historique légèrement différent entre vos branches, sauf si vous forcez un push (`git push --force`) après chaque release afin de réinitialiser l’historique (ce qui n’est pas toujours possible sur la branche par défaut selon les paramètres de votre repository). Si vous prévoyez d’utiliser régulièrement `cherry-pick`, il serait préférable d’éviter d’utiliser la branche par défaut comme branche stable, pour éviter d’avoir à y faire des `force push`, ce qui est généralement déconseillé.

## Publication via les GitHub Releases

Les extensions Qwen Code peuvent être distribuées via les [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Cela permet aux utilisateurs une expérience d'installation initiale plus rapide et fiable, car cela évite de devoir cloner le repository.

Chaque release inclut au moins un fichier archive contenant l'intégralité du contenu du repo au moment du tag auquel elle est liée. Les releases peuvent également inclure des [archives pré-construites](#custom-pre-built-archives) si votre extension nécessite une étape de build ou possède des binaires spécifiques à certaines plateformes.

Lors de la vérification des mises à jour, Qwen Code recherchera simplement la dernière release sur GitHub (vous devez la marquer comme telle lors de sa création), sauf si l'utilisateur a installé une release spécifique en passant l'option `--ref=<some-release-tag>`. Pour le moment, nous ne prenons pas en charge l'utilisation volontaire des pre-release ou le versioning sémantique (semver).

### Archives pré-construits personnalisés

Les archives personnalisées doivent être attachées directement à la release GitHub en tant qu'assets et doivent être entièrement autonomes. Cela signifie qu'elles doivent inclure l'extension complète, voir [structure de l'archive](#archive-structure).

Si votre extension est indépendante de la plateforme, vous pouvez fournir un seul asset générique. Dans ce cas, il ne doit y avoir qu'un seul asset attaché à la release.

Les archives personnalisées peuvent également être utilisées si vous souhaitez développer votre extension dans un repository plus large. Vous pouvez alors construire une archive qui a une structure différente de celle du repo lui-même (par exemple, ce pourrait être simplement une archive d'un sous-répertoire contenant l'extension).

#### Archives spécifiques à chaque plateforme

Pour garantir que Qwen Code puisse automatiquement trouver l'asset de release approprié pour chaque plateforme, vous devez suivre cette convention de nommage. Le CLI recherchera les assets dans l'ordre suivant :

1. **Spécifique à la plateforme et à l'architecture :** `{platform}.{arch}.{name}.{extension}`
2. **Spécifique à la plateforme :** `{platform}.{name}.{extension}`
3. **Générique :** Si un seul asset est fourni, il sera utilisé comme solution de repli générique.

- `{name}` : Le nom de votre extension.
- `{platform}` : Le système d'exploitation. Les valeurs supportées sont :
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}` : L'architecture. Les valeurs supportées sont :
  - `x64`
  - `arm64`
- `{extension}` : L'extension du fichier archive (ex. : `.tar.gz` ou `.zip`).

**Exemples :**

- `darwin.arm64.my-tool.tar.gz` (spécifique aux Macs avec Apple Silicon)
- `darwin.my-tool.tar.gz` (pour tous les Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Structure de l'archive

Les archives doivent être des extensions entièrement autonomes et respecter toutes les exigences standard. En particulier, le fichier `qwen-extension.json` doit se trouver à la racine de l'archive.

Le reste de l'organisation doit ressembler exactement à une extension classique. Voir [extensions.md](extension.md).

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
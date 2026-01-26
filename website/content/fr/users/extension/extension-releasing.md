# Publication d'extensions

Il existe deux méthodes principales pour publier des extensions destinées aux utilisateurs :

- [Dépôt Git](#publication-via-un-dépôt-git)
- [Github Releases](#publication-via-github-releases)

Les publications via dépôt Git sont généralement la méthode la plus simple et la plus souple, tandis que les publications GitHub peuvent être plus efficaces lors de l'installation initiale car elles sont distribuées sous forme d'archives uniques au lieu de nécessiter un clonage git qui télécharge chaque fichier individuellement. Les publications Github peuvent également contenir des archives spécifiques à une plateforme si vous devez distribuer des fichiers binaires spécifiques à une plateforme.

## Publication via un dépôt git

C'est l'option la plus flexible et simple. Tout ce que vous avez à faire est de créer un dépôt git accessible publiquement (comme un dépôt GitHub public), puis les utilisateurs peuvent installer votre extension en utilisant `qwen extensions install <votre-uri-depôt>`, ou pour un dépôt GitHub, ils peuvent utiliser le format simplifié `qwen extensions install <org>/<depôt>`. Ils peuvent éventuellement spécifier une référence spécifique (branche/étiquette/commit) en utilisant l'argument `--ref=<quelque-ref>`, qui correspond par défaut à la branche principale.

Chaque fois que des commits sont poussés vers la référence sur laquelle un utilisateur dépend, il sera invité à mettre à jour l'extension. Notez que cela permet également des retours arrière faciles : le commit HEAD est toujours considéré comme la dernière version, quelle que soit la version réelle dans le fichier `qwen-extension.json`.

### Gestion des canaux de publication à l'aide d'un dépôt git

Les utilisateurs peuvent dépendre de n'importe quelle référence (ref) de votre dépôt git, telle qu'une branche ou une balise (tag), ce qui vous permet de gérer plusieurs canaux de publication.

Par exemple, vous pouvez maintenir une branche `stable`, que les utilisateurs peuvent installer de cette manière : `qwen extensions install <votre-uri-depôt> --ref=stable`. Vous pouvez également en faire la valeur par défaut en traitant votre branche principale comme celle de votre version stable, et en effectuant le développement dans une autre branche (par exemple appelée `dev`). Vous pouvez maintenir autant de branches ou de balises que vous le souhaitez, offrant ainsi un maximum de flexibilité à vous et à vos utilisateurs.

Notez que ces arguments `ref` peuvent être des balises, des branches ou même des commits spécifiques, ce qui permet aux utilisateurs de dépendre d'une version spécifique de votre extension. La gestion de vos balises et branches vous appartient.

### Exemple de flux de publication utilisant un dépôt git

Bien qu'il existe de nombreuses options pour gérer vos publications à l'aide d'un flux git, nous recommandons de traiter votre branche par défaut comme votre branche de publication « stable ». Cela signifie que le comportement par défaut de la commande `qwen extensions install <votre-uri-depôt>` sera d'utiliser la branche de publication stable.

Supposons que vous souhaitiez maintenir trois canaux de publication standards : `stable`, `preview` et `dev`. Vous effectuerez tout votre développement standard dans la branche `dev`. Lorsque vous serez prêt à effectuer une version de prévisualisation, vous fusionnerez cette branche dans votre branche `preview`. Lorsque vous déciderez de promouvoir votre branche preview en tant que version stable, vous fusionnerez `preview` dans votre branche stable (qui pourrait être votre branche par défaut ou une autre branche).

Vous pouvez également sélectionner des modifications spécifiques d'une branche vers une autre à l'aide de la commande `git cherry-pick`, mais notez que cela entraînera une divergence légère de l'historique entre vos branches, à moins que vous ne forciez l'envoi des modifications sur vos branches à chaque publication afin de réinitialiser l'historique (ce qui peut ne pas être possible pour la branche par défaut selon les paramètres de votre dépôt). Si vous prévoyez d'utiliser des sélections de commits, vous voudrez peut-être éviter que votre branche par défaut soit la branche stable, afin d'éviter les force-pushs sur la branche par défaut, ce qui devrait généralement être évité.

## Publication via les releases GitHub

Les extensions Qwen Code peuvent être distribuées via les [Releases GitHub](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Cela offre aux utilisateurs une expérience d'installation initiale plus rapide et plus fiable, en évitant la nécessité de cloner le dépôt.

Chaque release inclut au moins un fichier archive contenant l'intégralité du contenu du dépôt à l'étiquette à laquelle elle était liée. Les releases peuvent également inclure des [archives pré-construites](#custom-pre-built-archives) si votre extension nécessite une étape de construction ou comporte des binaires spécifiques à la plateforme.

Lors de la recherche de mises à jour, qwen code recherchera simplement la dernière release sur github (vous devez la marquer comme telle lors de la création de la release), sauf si l'utilisateur a installé une release spécifique en passant `--ref=<quelque-étiquette-de-release>`. Nous ne prenons actuellement pas en charge l'option pour les releases préliminaires ou semver.

### Archives pré-construits personnalisés

Les archives personnalisées doivent être attachées directement à la version GitHub en tant qu'actifs et doivent être entièrement autonomes. Cela signifie qu'elles doivent inclure l'extension complète, voir [structure de l'archive](#archive-structure).

Si votre extension est indépendante de la plateforme, vous pouvez fournir un seul actif générique. Dans ce cas, il ne devrait y avoir qu'un seul actif attaché à la version.

Les archives personnalisées peuvent également être utilisées si vous souhaitez développer votre extension au sein d'un dépôt plus vaste, vous pouvez créer une archive qui a une disposition différente de celle du dépôt lui-même (par exemple, il pourrait s'agir simplement d'une archive d'un sous-répertoire contenant l'extension).

#### Archives spécifiques à la plateforme

Pour garantir que Qwen Code puisse automatiquement trouver l'actif de publication correct pour chaque plateforme, vous devez suivre cette convention de nommage. Le CLI recherchera les actifs dans l'ordre suivant :

1.  **Spécifique à la plateforme et à l'architecture :** `{plateforme}.{arch}.{nom}.{extension}`
2.  **Spécifique à la plateforme :** `{plateforme}.{nom}.{extension}`
3.  **Générique :** Si un seul actif est fourni, il sera utilisé comme solution de repli générique.

- `{nom}` : Le nom de votre extension.
- `{plateforme}` : Le système d'exploitation. Les valeurs prises en charge sont :
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}` : L'architecture. Les valeurs prises en charge sont :
  - `x64`
  - `arm64`
- `{extension}` : L'extension du fichier de l'archive (par exemple, `.tar.gz` ou `.zip`).

**Exemples :**

- `darwin.arm64.mon-outil.tar.gz` (spécifique aux Macs avec puce Apple Silicon)
- `darwin.mon-outil.tar.gz` (pour tous les Macs)
- `linux.x64.mon-outil.tar.gz`
- `win32.mon-outil.zip`

#### Structure de l'archive

Les archives doivent être des extensions entièrement contenues et respecter toutes les exigences standard - en particulier, le fichier `qwen-extension.json` doit se trouver à la racine de l'archive.

Le reste de la structure doit ressembler exactement à une extension typique, voir [extensions.md](extension.md).

#### Exemple de flux de travail GitHub Actions

Voici un exemple de flux de travail GitHub Actions qui construit et publie une extension Qwen Code pour plusieurs plateformes :

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
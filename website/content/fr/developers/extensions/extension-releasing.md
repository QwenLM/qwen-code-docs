# Publication d'extensions

Il existe deux méthodes principales pour publier des extensions auprès des utilisateurs :

- [Dépôt Git](#publication-via-un-dépôt-git)
- [GitHub Releases](#publication-via-github-releases)

Les publications via dépôt Git constituent généralement l'approche la plus simple et la plus flexible, tandis que les publications GitHub peuvent s'avérer plus efficaces lors de l'installation initiale puisqu'elles sont distribuées sous forme d'archives uniques au lieu de nécessiter un clonage git qui télécharge chaque fichier individuellement. Les publications GitHub peuvent également contenir des archives spécifiques à certaines plateformes si vous devez distribuer des fichiers binaires spécifiques à une plateforme.

## Publier via un dépôt Git

Il s'agit de l'option la plus flexible et la plus simple. Il vous suffit de créer un dépôt Git accessible publiquement (comme un dépôt GitHub public), puis les utilisateurs pourront installer votre extension en utilisant `qwen extensions install <uri-de-votre-dépôt>`, ou pour un dépôt GitHub, ils peuvent utiliser le format simplifié `qwen extensions install <organisation>/<dépôt>`. Ils peuvent éventuellement dépendre d'une référence spécifique (branche/tag/commit) en utilisant l'argument `--ref=<une-référence>`, par défaut il s'agit de la branche par défaut.

Chaque fois que des commits sont poussés vers la référence dont dépend un utilisateur, celui-ci sera invité à mettre à jour l'extension. Notez que cela permet également des restaurations faciles, le commit HEAD est toujours traité comme la dernière version, indépendamment de la version réelle dans le fichier `qwen-extension.json`.

### Gestion des canaux de publication à l'aide d'un dépôt Git

Les utilisateurs peuvent dépendre de n'importe quelle référence de votre dépôt Git, comme une branche ou un tag, ce qui vous permet de gérer plusieurs canaux de publication.

Par exemple, vous pouvez maintenir une branche `stable`, que les utilisateurs peuvent installer de cette façon : `qwen extensions install <your-repo-uri> --ref=stable`. Vous pouvez également en faire la valeur par défaut en considérant votre branche par défaut comme votre branche de publication stable, et en effectuant le développement dans une autre branche (par exemple appelée `dev`). Vous pouvez conserver autant de branches ou de tags que vous le souhaitez, offrant ainsi une flexibilité maximale pour vous et vos utilisateurs.

Notez que ces arguments `ref` peuvent être des tags, des branches, ou même des commits spécifiques, ce qui permet aux utilisateurs de dépendre d'une version spécifique de votre extension. La manière dont vous gérez vos tags et branches dépend entièrement de vous.

### Exemple de flux de publication utilisant un dépôt Git

Bien qu'il existe de nombreuses façons de gérer les publications à l'aide d'un flux Git, nous recommandons de considérer votre branche par défaut comme la branche de publication « stable ». Cela signifie que le comportement par défaut de `qwen extensions install <your-repo-uri>` est d'utiliser la branche de version stable.

Supposons que vous souhaitiez maintenir trois canaux de publication standards : `stable`, `preview` et `dev`. Vous effectuerez tout votre développement standard dans la branche `dev`. Lorsque vous êtes prêt à publier une version préliminaire, vous fusionnez cette branche dans votre branche `preview`. Quand vous décidez de promouvoir votre branche `preview` vers la version stable, vous fusionnez `preview` dans votre branche stable (qui peut être votre branche par défaut ou une autre branche).

Vous pouvez également sélectionner manuellement des modifications d'une branche vers une autre en utilisant `git cherry-pick`, mais notez que cela entraînera un historique légèrement différent entre vos branches, sauf si vous forcez la mise à jour des branches à chaque publication afin de restaurer un historique propre (ce qui peut ne pas être possible pour la branche par défaut selon les paramètres de votre dépôt). Si vous prévoyez d'effectuer des opérations de cherry-pick, il serait préférable d'éviter d'avoir pour branche par défaut la branche stable, afin d'éviter les push forcés sur celle-ci, ce qui doit généralement être évité.

## Publication via les releases GitHub

Les extensions Qwen Code peuvent être distribuées via les [releases GitHub](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Cela offre aux utilisateurs une expérience d'installation initiale plus rapide et plus fiable, car cela évite le besoin de cloner le dépôt.

Chaque release inclut au moins un fichier archive contenant l'intégralité du contenu du dépôt au moment du tag auquel elle est liée. Les releases peuvent également inclure des [archives pré-construites](#custom-pre-built-archives) si votre extension nécessite une étape de construction ou possède des binaires spécifiques à certaines plateformes.

Lors de la vérification des mises à jour, Qwen Code recherchera simplement la dernière release sur GitHub (vous devez la marquer comme telle lors de sa création), sauf si l'utilisateur a installé une release spécifique en passant l'argument `--ref=<some-release-tag>`. Nous ne prenons actuellement pas en charge l'activation des versions préliminaires ou le respect de la sémantique de version (semver).

### Archives pré-construits personnalisés

Les archives personnalisées doivent être jointes directement à la release GitHub en tant qu'assets et doivent être entièrement autonomes. Cela signifie qu'elles doivent inclure l'extension complète, voir [structure de l'archive](#archive-structure).

Si votre extension est indépendante de la plateforme, vous pouvez fournir un seul asset générique. Dans ce cas, il ne doit y avoir qu'un seul asset attaché à la release.

Les archives personnalisées peuvent également être utilisées si vous souhaitez développer votre extension dans un dépôt plus large, vous pouvez construire une archive qui a une disposition différente de celle du dépôt lui-même (par exemple, cela pourrait simplement être une archive d'un sous-répertoire contenant l'extension).

#### Archives spécifiques à une plateforme

Pour garantir que Qwen Code puisse automatiquement trouver l'actif de version approprié pour chaque plateforme, vous devez suivre cette convention de nommage. L'interface en ligne de commande recherchera les actifs dans l'ordre suivant :

1. **Spécifique à la plateforme et à l'architecture :** `{plateforme}.{arch}.{nom}.{extension}`
2. **Spécifique à la plateforme :** `{plateforme}.{nom}.{extension}`
3. **Générique :** Si un seul actif est fourni, il sera utilisé comme solution de repli générique.

- `{nom}` : Le nom de votre extension.
- `{plateforme}` : Le système d'exploitation. Les valeurs prises en charge sont :
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}` : L'architecture. Les valeurs prises en charge sont :
  - `x64`
  - `arm64`
- `{extension}` : L'extension du fichier archive (par exemple, `.tar.gz` ou `.zip`).

**Exemples :**

- `darwin.arm64.mon-outil.tar.gz` (spécifique aux Macs avec processeur Apple Silicon)
- `darwin.mon-outil.tar.gz` (pour tous les Macs)
- `linux.x64.mon-outil.tar.gz`
- `win32.mon-outil.zip`

#### Structure de l'archive

Les archives doivent être des extensions entièrement autonomes et respecter toutes les exigences standards : notamment, le fichier `qwen-extension.json` doit se trouver à la racine de l'archive.

Le reste de la structure doit ressembler exactement à une extension classique, voir [extensions.md](extension.md).

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

      - name: Configurer Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Installer les dépendances
        run: npm ci

      - name: Construire l'extension
        run: npm run build

      - name: Créer les ressources de publication
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Créer une version GitHub
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```
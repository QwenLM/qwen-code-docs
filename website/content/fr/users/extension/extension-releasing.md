# Publication d’extensions

Il existe deux méthodes principales pour publier des extensions auprès des utilisateurs :

- [Dépôt Git](#publication-via-un-dépôt-git)
- [Versions GitHub](#publication-via-des-versions-github)

La publication via un dépôt Git est généralement la méthode la plus simple et la plus souple, tandis que les versions GitHub peuvent s’avérer plus efficaces lors de l’installation initiale, car elles sont fournies sous forme d’archives uniques, contrairement à un clonage Git qui télécharge chaque fichier individuellement. Les versions GitHub peuvent également inclure des archives spécifiques à une plateforme si vous devez distribuer des fichiers binaires adaptés à une plateforme donnée.

## Publication via un dépôt Git

Il s’agit de l’option la plus souple et la plus simple. Tout ce que vous avez à faire est de créer un dépôt Git accessible publiquement (par exemple, un dépôt GitHub public), puis les utilisateurs peuvent installer votre extension à l’aide de la commande `qwen extensions install <votre-uri-de-dépôt>`, ou, pour un dépôt GitHub, utiliser le format simplifié `qwen extensions install <organisation>/<dépôt>`. Ils peuvent éventuellement spécifier une référence précise (branche, étiquette ou commit) à l’aide de l’argument `--ref=<quelque-référence>`, qui par défaut correspond à la branche principale.

Dès qu’un commit est poussé sur la référence dont un utilisateur dépend, celui-ci est invité à mettre à jour l’extension. Notez que cela permet également des retours arrière (« rollbacks ») aisés : le commit HEAD est toujours considéré comme la version la plus récente, indépendamment de la version réellement indiquée dans le fichier `qwen-extension.json`.

### Gestion des canaux de publication à l’aide d’un dépôt Git

Les utilisateurs peuvent dépendre de n’importe quelle référence (« ref ») issue de votre dépôt Git, telle qu’une branche ou une étiquette (tag), ce qui vous permet de gérer plusieurs canaux de publication.

Par exemple, vous pouvez maintenir une branche `stable`, que les utilisateurs pourront installer ainsi : `qwen extensions install <votre-uri-de-dépôt> --ref=stable`. Vous pouvez également en faire la valeur par défaut en considérant votre branche principale comme la branche de publication stable, et en effectuant le développement dans une autre branche (par exemple nommée `dev`). Vous pouvez créer autant de branches ou d’étiquettes que souhaité, offrant ainsi une flexibilité maximale à vous-même et à vos utilisateurs.

Notez que ces arguments `ref` peuvent désigner des étiquettes, des branches ou même des commits spécifiques, ce qui permet aux utilisateurs de dépendre d’une version précise de votre extension. La gestion de vos étiquettes et branches vous appartient entièrement.

### Exemple de flux de publication utilisant un dépôt Git

Bien qu’il existe de nombreuses façons de gérer les publications selon un flux Git, nous vous recommandons de considérer votre branche par défaut comme votre branche de publication « stable ». Cela signifie que le comportement par défaut de la commande `qwen extensions install <votre-uri-de-dépôt>` consiste à cibler la branche de publication stable.

Supposons que vous souhaitiez maintenir trois canaux de publication standard : `stable`, `preview` et `dev`. Vous effectuez tout votre développement courant sur la branche `dev`. Lorsque vous êtes prêt à publier une version préliminaire (*preview*), vous fusionnez cette branche dans votre branche `preview`. Lorsque vous souhaitez promouvoir la branche `preview` vers la stabilité, vous fusionnez `preview` dans votre branche stable (qui peut être soit votre branche par défaut, soit une branche distincte).

Vous pouvez également sélectionner manuellement des validations (*cherry-pick*) d’une branche vers une autre à l’aide de la commande `git cherry-pick`. Toutefois, notez que cela entraîne une légère divergence historique entre vos branches, sauf si vous forcez l’écriture (*force push*) des modifications sur chacune de vos branches à chaque publication afin de rétablir un historique propre (ce qui n’est pas toujours possible pour la branche par défaut, selon les paramètres de votre dépôt). Si vous comptez utiliser fréquemment `git cherry-pick`, il peut être préférable de ne pas faire coïncider votre branche par défaut avec la branche stable, afin d’éviter les *force push* sur la branche par défaut — pratique généralement déconseillée.

## Publication via les versions GitHub

Les extensions Qwen Code peuvent être distribuées via les [versions GitHub](https://docs.github.com/fr/repositories/lib%C3%A9rer-des-projets-sur-github/%C3%A0-propos-des-versions). Cela offre aux utilisateurs une expérience d’installation initiale plus rapide et plus fiable, car cela évite la nécessité de cloner le dépôt.

Chaque version inclut au moins un fichier archive contenant l’intégralité du contenu du dépôt à la balise à laquelle elle est associée. Les versions peuvent également inclure des [archives pré-construites](#archives-pré-construites-personnalisées) si votre extension nécessite une étape de compilation ou si elle intègre des binaires spécifiques à une plateforme.

Lors de la recherche de mises à jour, Qwen Code se contente de rechercher la dernière version publiée sur GitHub (vous devez explicitement la marquer comme telle lors de sa création), sauf si l’utilisateur a installé une version spécifique en passant l’option `--ref=<balise-de-version>`. À ce jour, nous ne prenons pas en charge l’activation explicite des versions préliminaires (pré-sorties) ni la gestion sémantique des versions (semver).

### Archives préconstruites personnalisées

Les archives personnalisées doivent être jointes directement à la version GitHub sous forme de ressources (assets) et doivent être entièrement autonomes. Cela signifie qu’elles doivent inclure l’extension dans son intégralité ; voir la [structure de l’archive](#archive-structure).

Si votre extension est indépendante de la plateforme, vous pouvez fournir une seule ressource générique. Dans ce cas, une seule ressource doit être jointe à la version.

Les archives personnalisées peuvent également être utilisées si vous souhaitez développer votre extension au sein d’un dépôt plus vaste : vous pouvez ainsi créer une archive dont la structure diffère de celle du dépôt lui-même (par exemple, il peut s’agir simplement d’une archive d’un sous-répertoire contenant l’extension).

#### Archives spécifiques à la plateforme

Pour garantir que Qwen Code puisse automatiquement identifier l’élément de version approprié pour chaque plateforme, vous devez respecter cette convention de nommage. L’interface en ligne de commande (CLI) recherche les éléments dans l’ordre suivant :

1.  **Spécifique à la plateforme et à l’architecture :** `{plateforme}.{architecture}.{nom}.{extension}`
2.  **Spécifique à la plateforme :** `{plateforme}.{nom}.{extension}`
3.  **Générique :** Si un seul élément est fourni, il sera utilisé comme solution de repli générique.

- `{nom}` : Le nom de votre extension.
- `{plateforme}` : Le système d’exploitation. Les valeurs prises en charge sont :
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{architecture}` : L’architecture processeur. Les valeurs prises en charge sont :
  - `x64`
  - `arm64`
- `{extension}` : L’extension du fichier archive (par exemple `.tar.gz` ou `.zip`).

**Exemples :**

- `darwin.arm64.mon-outil.tar.gz` (spécifique aux Macs équipés de puces Apple Silicon)
- `darwin.mon-outil.tar.gz` (pour tous les Macs)
- `linux.x64.mon-outil.tar.gz`
- `win32.mon-outil.zip`

#### Structure de l’archive

Les archives doivent contenir intégralement une extension et respecter toutes les exigences standard — en particulier, le fichier `qwen-extension.json` doit se trouver à la racine de l’archive.

Le reste de la structure doit être identique à celle d’une extension classique ; voir [extensions.md](extension.md).

#### Exemple de workflow GitHub Actions

Voici un exemple de workflow GitHub Actions qui construit et publie une extension Qwen Code pour plusieurs plateformes :

```yaml
name: Publier l’extension

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

      - name: Construire l’extension
        run: npm run build

      - name: Créer les ressources de publication
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Créer une publication GitHub
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```
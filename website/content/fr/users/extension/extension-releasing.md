# Mise à disposition des extensions

Il existe trois méthodes principales pour mettre des extensions à disposition des utilisateurs :

- [Dépôt Git](#mise-à-disposition-via-un-dépôt-git)
- [GitHub Releases](#mise-à-disposition-via-github-releases)
- [Registre npm](#mise-à-disposition-via-le-registre-npm)

Les mises à disposition via un dépôt Git sont généralement l'approche la plus simple et la plus flexible, tandis que les GitHub Releases peuvent être plus efficaces lors de l'installation initiale car elles sont distribuées sous forme d'archives uniques au lieu de nécessiter un clone Git qui télécharge chaque fichier individuellement. Les GitHub Releases peuvent également contenir des archives spécifiques à une plateforme si vous devez distribuer des fichiers binaires spécifiques à une plateforme. Les mises à disposition via le registre npm sont idéales pour les équipes qui utilisent déjà npm pour la distribution de paquets, en particulier avec des registres privés.

## Mise à disposition via un dépôt Git

C'est l'option la plus flexible et la plus simple. Il vous suffit de créer un dépôt Git accessible publiquement (comme un dépôt GitHub public) et les utilisateurs pourront installer votre extension en utilisant `qwen extensions install <uri-de-votre-dépôt>`, ou pour un dépôt GitHub ils peuvent utiliser le format simplifié `qwen extensions install <org>/<repo>`. Ils peuvent éventuellement dépendre d'une référence spécifique (branche/tag/commit) en utilisant l'argument `--ref=<une-référence>`, qui utilise par défaut la branche par défaut.

Lorsque des commits sont poussés sur la référence dont dépend un utilisateur, celui-ci sera invité à mettre à jour l'extension. Notez que cela permet également des retours en arrière faciles : le commit HEAD est toujours considéré comme la dernière version, indépendamment de la version réelle dans le fichier `qwen-extension.json`.

### Gestion des canaux de mise à disposition via un dépôt Git

Les utilisateurs peuvent dépendre de n'importe quelle référence de votre dépôt Git, comme une branche ou un tag, ce qui vous permet de gérer plusieurs canaux de mise à disposition.

Par exemple, vous pouvez maintenir une branche `stable` que les utilisateurs peuvent installer avec `qwen extensions install <uri-de-votre-dépôt> --ref=stable`. Ou vous pouvez faire de votre branche par défaut votre branche de version stable, et développer dans une branche différente (par exemple appelée `dev`). Vous pouvez maintenir autant de branches ou de tags que vous le souhaitez, offrant une flexibilité maximale à vous et à vos utilisateurs.

Notez que ces arguments `ref` peuvent être des tags, des branches ou même des commits spécifiques, ce qui permet aux utilisateurs de dépendre d'une version particulière de votre extension. C'est à vous de décider comment gérer vos tags et vos branches.

### Exemple de flux de mise à disposition avec un dépôt Git

Bien qu'il existe de nombreuses options pour gérer les versions à l'aide d'un flux Git, nous vous recommandons de traiter votre branche par défaut comme votre branche de version « stable ». Cela signifie que le comportement par défaut de `qwen extensions install <uri-de-votre-dépôt>` est d'être sur la branche de version stable.

Supposons que vous souhaitiez maintenir trois canaux de mise à disposition standard : `stable`, `preview` et `dev`. Vous effectuerez tout votre développement standard dans la branche `dev`. Lorsque vous êtes prêt pour une version preview, vous fusionnez cette branche dans votre branche `preview`. Lorsque vous êtes prêt à promouvoir votre branche preview en stable, vous fusionnez `preview` dans votre branche stable (qui peut être votre branche par défaut ou une branche différente).

Vous pouvez également choisir des modifications d'une branche à une autre à l'aide de `git cherry-pick`, mais notez que cela aura pour conséquence que vos branches auront un historique légèrement divergent les unes des autres, à moins que vous ne forciez les changements sur vos branches à chaque mise à disposition pour restaurer un historique vierge (ce qui peut ne pas être possible pour la branche par défaut selon les paramètres de votre dépôt). Si vous prévoyez d'utiliser des cherry-pick, vous pouvez éviter que votre branche par défaut soit la branche stable pour éviter de forcer les poussées vers la branche par défaut, ce qui devrait généralement être évité.

## Mise à disposition via GitHub Releases

Les extensions Qwen Code peuvent être distribuées via [GitHub Releases](https://docs.github.com/fr/repositories/releasing-projects-on-github/about-releases). Cela offre une expérience d'installation initiale plus rapide et plus fiable pour les utilisateurs, car cela évite de devoir cloner le dépôt.

Chaque mise à disposition comprend au moins un fichier d'archive, qui contient l'intégralité du contenu du dépôt au tag auquel il était lié. Les mises à disposition peuvent également inclure des [archives pré-construites](#archives-pré-construites-personnalisées) si votre extension nécessite une étape de construction ou contient des binaires spécifiques à une plateforme.

Lors de la vérification des mises à jour, Qwen Code recherchera simplement la dernière mise à disposition sur GitHub (vous devez la marquer comme telle lors de la création de la mise à disposition), sauf si l'utilisateur a installé une mise à disposition spécifique en passant `--ref=<tag-de-mise-à-disposition>`. Nous ne prenons pas encore en charge l'adhésion aux versions préliminaires ou au semver.

### Archives pré-construites personnalisées

Les archives personnalisées doivent être attachées directement à la GitHub Release en tant qu'actifs et doivent être complètement autonomes. Cela signifie qu'elles doivent inclure l'extension entière, voir [structure d'archive](#structure-darchive).

Si votre extension est indépendante de la plateforme, vous pouvez fournir un seul actif générique. Dans ce cas, un seul actif doit être attaché à la mise à disposition.

Les archives personnalisées peuvent également être utilisées si vous souhaitez développer votre extension dans un dépôt plus vaste ; vous pouvez construire une archive qui a une disposition différente du dépôt lui-même (par exemple, il pourrait s'agir simplement d'une archive d'un sous-répertoire contenant l'extension).

#### Archives spécifiques à une plateforme

Pour garantir que Qwen Code puisse trouver automatiquement le bon actif de mise à disposition pour chaque plateforme, vous devez suivre cette convention de nommage. La CLI recherchera les actifs dans l'ordre suivant :

1. **Spécifique à la plateforme et à l'architecture :** `{plateforme}.{architec}.{nom}.{extension}`
2. **Spécifique à la plateforme :** `{plateforme}.{nom}.{extension}`
3. **Générique :** Si un seul actif est fourni, il sera utilisé comme solution de repli générique.

- `{nom}` : Le nom de votre extension.
- `{plateforme}` : Le système d'exploitation. Les valeurs prises en charge sont :
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{architec}` : L'architecture. Les valeurs prises en charge sont :
  - `x64`
  - `arm64`
- `{extension}` : L'extension de fichier de l'archive (par exemple `.tar.gz` ou `.zip`).

**Exemples :**

- `darwin.arm64.mon-outil.tar.gz` (spécifique aux Mac Apple Silicon)
- `darwin.mon-outil.tar.gz` (pour tous les Mac)
- `linux.x64.mon-outil.tar.gz`
- `win32.mon-outil.zip`

#### Structure d'archive

Les archives doivent contenir des extensions complètes et répondre à toutes les exigences standard – en particulier, le fichier `qwen-extension.json` doit se trouver à la racine de l'archive.

Le reste de la disposition doit ressembler exactement à une extension typique, voir [introduction.md](./introduction.md).

#### Exemple de workflow GitHub Actions

Voici un exemple de workflow GitHub Actions qui construit et publie une extension Qwen Code pour plusieurs plateformes :

```yaml
name: Publier l'extension

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
          node-version: '22'

      - name: Installer les dépendances
        run: npm ci

      - name: Construire l'extension
        run: npm run build

      - name: Créer les actifs de mise à disposition
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Créer la GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.mon-outil.tar.gz
            release/linux.arm64.mon-outil.tar.gz
            release/win32.arm64.mon-outil.zip
```

## Mise à disposition via le registre npm

Vous pouvez publier des extensions Qwen Code en tant que paquets npm scopés (par exemple `@votre-org/mon-extension`). Cela convient parfaitement lorsque :

- Votre équipe utilise déjà npm pour la distribution de paquets
- Vous avez besoin d'un support de registre privé avec une infrastructure d'authentification existante
- Vous souhaitez que la résolution de version et le contrôle d'accès soient gérés par npm

### Exigences du paquet

Votre paquet npm doit inclure un fichier `qwen-extension.json` à la racine du paquet. Il s'agit du même fichier de configuration utilisé par toutes les extensions Qwen Code – l'archive npm n'est qu'un autre mécanisme de livraison.

Une structure de paquet minimale ressemble à ceci :

```
mon-extension/
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
# Publier vers le registre par défaut
npm publish

# Publier vers un registre privé/personnalisé
npm publish --registry https://votre-registre.com
```

### Installation

Les utilisateurs installent votre extension en utilisant le nom de paquet scopé :

```bash
# Installer la dernière version
qwen extensions install @votre-org/mon-extension

# Installer une version spécifique
qwen extensions install @votre-org/mon-extension@1.2.0

# Installer depuis un registre personnalisé
qwen extensions install @votre-org/mon-extension --registry https://votre-registre.com
```

### Comportement de mise à jour

- Les extensions installées sans version fixe (par ex. `@scope/pkg`) suivent le dist-tag `latest`.
- Les extensions installées avec un dist-tag (par ex. `@scope/pkg@beta`) suivent ce tag spécifique.
- Les extensions épinglées à une version exacte (par ex. `@scope/pkg@1.2.0`) sont toujours considérées comme à jour et ne proposeront pas de mise à jour.

### Authentification pour les registres privés

Qwen Code lit automatiquement les identifiants d'authentification npm :

1. **Variable d'environnement `NPM_TOKEN`** — priorité la plus élevée
2. **Fichier `.npmrc`** — prend en charge les entrées `_authToken` au niveau de l'hôte et au niveau du chemin (par ex. `//votre-registre.com/:_authToken=TOKEN` ou `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

Les fichiers `.npmrc` sont lus depuis le répertoire courant et le répertoire personnel de l'utilisateur.

### Gestion des canaux de mise à disposition

Vous pouvez utiliser les dist-tags npm pour gérer les canaux de mise à disposition :

```bash
# Publier une version beta
npm publish --tag beta

# Les utilisateurs installent le canal beta
qwen extensions install @votre-org/mon-extension@beta
```

Cela fonctionne de manière similaire aux canaux basés sur les branches Git mais utilise le mécanisme natif des dist-tags de npm.
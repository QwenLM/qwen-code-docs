# Outil de lecture multi-fichiers (`read_many_files`)

Ce document décrit l'outil `read_many_files` pour Qwen Code.

## Description

Utilisez `read_many_files` pour lire le contenu de plusieurs fichiers spécifiés par des chemins ou des motifs glob. Le comportement de cet outil dépend des fichiers fournis :

- Pour les fichiers texte, cet outil concatène leur contenu en une seule chaîne.
- Pour les fichiers image (par exemple, PNG, JPEG), PDF, audio (MP3, WAV) et vidéo (MP4, MOV), il les lit et les retourne sous forme de données encodées en base64, à condition qu'ils soient explicitement demandés par nom ou extension.

`read_many_files` peut être utilisé pour effectuer des tâches telles que l'obtention d'un aperçu d'une base de code, la recherche de l'endroit où une fonctionnalité spécifique est implémentée, la révision de documentation ou la collecte de contexte à partir de plusieurs fichiers de configuration.

**Remarque :** `read_many_files` recherche les fichiers correspondant aux chemins ou motifs glob fournis. Un chemin de répertoire tel que `"/docs"` renverra un résultat vide ; l'outil nécessite un motif tel que `"/docs/*"` ou `"/docs/*.md"` pour identifier les fichiers pertinents.

### Arguments

`read_many_files` prend les arguments suivants :

- `paths` (list[string], requis) : Un tableau de motifs glob ou de chemins relatifs au répertoire cible de l'outil (par exemple, `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], optionnel) : Motifs glob pour les fichiers/répertoires à exclure (par exemple, `["**/*.log", "temp/"]`). Ceux-ci sont ajoutés aux exclusions par défaut si `useDefaultExcludes` est vrai.
- `include` (list[string], optionnel) : Motifs glob supplémentaires à inclure. Ceux-ci sont fusionnés avec `paths` (par exemple, `["*.test.ts"]` pour ajouter spécifiquement des fichiers de test s'ils ont été largement exclus, ou `["images/*.jpg"]` pour inclure des types d'images spécifiques).
- `recursive` (boolean, optionnel) : Indique s'il faut rechercher de manière récursive. Ceci est principalement contrôlé par `**` dans les motifs glob. Valeur par défaut : `true`.
- `useDefaultExcludes` (boolean, optionnel) : Indique s'il faut appliquer une liste de motifs d'exclusion par défaut (par exemple, `node_modules`, `.git`, fichiers binaires non image/pdf). Valeur par défaut : `true`.
- `respect_git_ignore` (boolean, optionnel) : Indique s'il faut respecter les motifs définis dans .gitignore lors de la recherche de fichiers. Valeur par défaut : true.

## Comment utiliser `read_many_files` avec Qwen Code

`read_many_files` recherche les fichiers correspondant aux `chemins` et motifs `include` fournis, tout en respectant les motifs `exclude` et les exclusions par défaut (si activées).

- Pour les fichiers texte : il lit le contenu de chaque fichier correspondant (en tentant d'ignorer les fichiers binaires non explicitement demandés comme image/PDF) et les concatène en une seule chaîne, avec un séparateur `--- {filePath} ---` entre le contenu de chaque fichier. Utilise l'encodage UTF-8 par défaut.
- L'outil insère un `--- End of content ---` après le dernier fichier.
- Pour les fichiers image et PDF : si explicitement demandés par nom ou extension (ex., `paths: ["logo.png"]` ou `include: ["*.pdf"]`), l'outil lit le fichier et renvoie son contenu sous forme de chaîne encodée en base64.
- L'outil tente de détecter et ignorer les autres fichiers binaires (ceux ne correspondant pas aux types d'image/PDF courants ou non explicitement demandés) en vérifiant la présence d'octets nuls dans leur contenu initial.

Utilisation :

```
read_many_files(paths=["Vos fichiers ou chemins ici."], include=["Fichiers supplémentaires à inclure."], exclude=["Fichiers à exclure."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Exemples de `read_many_files`

Lire tous les fichiers TypeScript dans le répertoire `src` :

```
read_many_files(paths=["src/**/*.ts"])
```

Lire le README principal, tous les fichiers Markdown dans le répertoire `docs`, et une image de logo spécifique, en excluant un fichier particulier :

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Lire tous les fichiers JavaScript mais inclure explicitement les fichiers de test et toutes les images JPEG d'un dossier `images` :

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Notes importantes

- **Gestion des fichiers binaires :**
  - **Fichiers image/PDF/audio/vidéo :** L'outil peut lire les types d'images courants (PNG, JPEG, etc.), les fichiers PDF, audio (mp3, wav) et vidéo (mp4, mov), en les retournant sous forme de données encodées en base64. Ces fichiers _doivent_ être ciblés explicitement par les motifs `paths` ou `include` (par exemple, en spécifiant le nom exact du fichier comme `video.mp4` ou un motif comme `*.mov`).
  - **Autres fichiers binaires :** L'outil tente de détecter et d'ignorer les autres types de fichiers binaires en examinant leur contenu initial pour la présence d'octets nuls. L'outil exclut ces fichiers de sa sortie.
- **Performances :** La lecture d'un très grand nombre de fichiers ou de fichiers individuels très volumineux peut consommer beaucoup de ressources.
- **Spécificité des chemins :** Assurez-vous que les chemins et les motifs glob sont correctement spécifiés par rapport au répertoire cible de l'outil. Pour les fichiers image/PDF, veillez à ce que les motifs soient suffisamment précis pour les inclure.
- **Exclusions par défaut :** Soyez conscient des motifs d'exclusion par défaut (comme `node_modules`, `.git`) et utilisez `useDefaultExcludes=False` si vous devez les outrepasser, mais faites-le avec prudence.
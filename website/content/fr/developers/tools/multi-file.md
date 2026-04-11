# Outil de lecture de fichiers multiples (`read_many_files`)

Ce document décrit l'outil `read_many_files` pour Qwen Code.

## Description

Utilisez `read_many_files` pour lire le contenu de plusieurs fichiers spécifiés par des chemins ou des motifs glob. Le comportement de cet outil dépend des fichiers fournis :

- Pour les fichiers texte, cet outil concatène leur contenu en une seule chaîne.
- Pour les fichiers image (ex. PNG, JPEG), PDF, audio (MP3, WAV) et vidéo (MP4, MOV), il les lit et les renvoie sous forme de données encodées en base64, à condition qu'ils soient explicitement demandés par leur nom ou leur extension.

`read_many_files` permet d'effectuer des tâches telles qu'obtenir une vue d'ensemble d'une base de code, identifier où une fonctionnalité spécifique est implémentée, consulter la documentation ou rassembler du contexte à partir de plusieurs fichiers de configuration.

**Remarque :** `read_many_files` recherche des fichiers en suivant les chemins ou motifs glob fournis. Un chemin de répertoire tel que `"/docs"` renverra un résultat vide ; l'outil nécessite un motif tel que `"/docs/*"` ou `"/docs/*.md"` pour identifier les fichiers pertinents.

### Arguments

`read_many_files` accepte les arguments suivants :

- `paths` (list[string], obligatoire) : Un tableau de motifs glob ou de chemins relatifs au répertoire cible de l'outil (ex. `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], facultatif) : Motifs glob pour les fichiers/répertoires à exclure (ex. `["**/*.log", "temp/"]`). Ils sont ajoutés aux exclusions par défaut si `useDefaultExcludes` est défini sur `true`.
- `include` (list[string], facultatif) : Motifs glob supplémentaires à inclure. Ils sont fusionnés avec `paths` (ex. `["*.test.ts"]` pour ajouter spécifiquement les fichiers de test s'ils ont été largement exclus, ou `["images/*.jpg"]` pour inclure des types d'images spécifiques).
- `recursive` (boolean, facultatif) : Indique si la recherche doit être récursive. Ceci est principalement contrôlé par `**` dans les motifs glob. La valeur par défaut est `true`.
- `useDefaultExcludes` (boolean, facultatif) : Indique s'il faut appliquer une liste de motifs d'exclusion par défaut (ex. `node_modules`, `.git`, fichiers binaires autres que image/pdf). La valeur par défaut est `true`.
- `respect_git_ignore` (boolean, facultatif) : Indique s'il faut respecter les motifs `.gitignore` lors de la recherche de fichiers. La valeur par défaut est `true`.

## Comment utiliser `read_many_files` avec Qwen Code

`read_many_files` recherche les fichiers correspondant aux motifs `paths` et `include` fournis, tout en respectant les motifs `exclude` et les exclusions par défaut (si activées).

- Pour les fichiers texte : il lit le contenu de chaque fichier correspondant (en tentant d'ignorer les fichiers binaires non explicitement demandés comme image/PDF) et le concatène en une seule chaîne, avec un séparateur `--- {filePath} ---` entre le contenu de chaque fichier. Utilise l'encodage UTF-8 par défaut.
- L'outil insère `--- End of content ---` après le dernier fichier.
- Pour les fichiers image et PDF : s'ils sont explicitement demandés par leur nom ou extension (ex. `paths: ["logo.png"]` ou `include: ["*.pdf"]`), l'outil lit le fichier et renvoie son contenu sous forme de chaîne encodée en base64.
- L'outil tente de détecter et d'ignorer les autres fichiers binaires (ceux ne correspondant pas aux types image/PDF courants ou non explicitement demandés) en vérifiant la présence d'octets nuls dans leur contenu initial.

Utilisation :

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Exemples d'utilisation de `read_many_files`

Lire tous les fichiers TypeScript du répertoire `src` :

```
read_many_files(paths=["src/**/*.ts"])
```

Lire le README principal, tous les fichiers Markdown du répertoire `docs` et une image de logo spécifique, en excluant un fichier précis :

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Lire tous les fichiers JavaScript, mais inclure explicitement les fichiers de test et tous les JPEG d'un dossier `images` :

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Remarques importantes

- **Gestion des fichiers binaires :**
  - **Fichiers Image/PDF/Audio/Vidéo :** L'outil peut lire les types d'images courants (PNG, JPEG, etc.), PDF, audio (mp3, wav) et vidéo (mp4, mov), et les renvoyer sous forme de données encodées en base64. Ces fichiers _doivent_ être explicitement ciblés par les motifs `paths` ou `include` (ex. en spécifiant le nom exact du fichier comme `video.mp4` ou un motif comme `*.mov`).
  - **Autres fichiers binaires :** L'outil tente de détecter et d'ignorer les autres types de fichiers binaires en examinant leur contenu initial à la recherche d'octets nuls. L'outil exclut ces fichiers de sa sortie.
- **Performances :** La lecture d'un très grand nombre de fichiers ou de fichiers individuels très volumineux peut être gourmande en ressources.
- **Précision des chemins :** Assurez-vous que les chemins et les motifs glob sont correctement spécifiés par rapport au répertoire cible de l'outil. Pour les fichiers image/PDF, vérifiez que les motifs sont suffisamment précis pour les inclure.
- **Exclusions par défaut :** Tenez compte des motifs d'exclusion par défaut (comme `node_modules`, `.git`) et utilisez `useDefaultExcludes=False` si vous devez les remplacer, mais faites-le avec prudence.
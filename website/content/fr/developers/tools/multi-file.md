# Outil de lecture de plusieurs fichiers (`read_many_files`)

Ce document décrit l’outil `read_many_files` pour Qwen Code.

## Description

Utilisez `read_many_files` pour lire le contenu de plusieurs fichiers spécifiés par des chemins ou des motifs glob. Le comportement de cet outil dépend des fichiers fournis :

- Pour les fichiers texte, cet outil concatène leur contenu en une seule chaîne de caractères.
- Pour les fichiers image (par exemple PNG, JPEG), PDF, audio (MP3, WAV) et vidéo (MP4, MOV), il les lit et les renvoie sous forme de données encodées en base64, à condition qu’ils soient explicitement demandés par nom ou par extension.

`read_many_files` peut être utilisé pour effectuer des tâches telles que l’obtention d’un aperçu d’une base de code, la recherche de l’emplacement où une fonctionnalité spécifique est implémentée, la relecture de la documentation ou la collecte de contexte à partir de plusieurs fichiers de configuration.

**Remarque :** `read_many_files` recherche les fichiers correspondant aux chemins ou motifs glob fournis. Un chemin de répertoire tel que `"/docs"` renverra un résultat vide ; l’outil nécessite un motif tel que `"/docs/*"` ou `"/docs/*.md"` pour identifier les fichiers pertinents.

### Arguments

`read_many_files` accepte les arguments suivants :

- `paths` (liste[string], requis) : Un tableau de motifs glob ou de chemins relatifs au répertoire cible de l’outil (par exemple, `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (liste[string], facultatif) : Des motifs glob pour exclure des fichiers ou des répertoires (par exemple, `["**/*.log", "temp/"]`). Ces motifs sont ajoutés aux exclusions par défaut si `useDefaultExcludes` vaut `true`.
- `include` (liste[string], facultatif) : Des motifs glob supplémentaires à inclure. Ils sont fusionnés avec `paths` (par exemple, `["*.test.ts"]` pour ajouter explicitement les fichiers de test s’ils ont été largement exclus, ou `["images/*.jpg"]` pour inclure des types d’images spécifiques).
- `recursive` (booléen, facultatif) : Indique si la recherche doit être effectuée de façon récursive. Ce comportement est principalement contrôlé par `**` dans les motifs glob. Valeur par défaut : `true`.
- `useDefaultExcludes` (booléen, facultatif) : Indique si une liste de motifs d’exclusion par défaut doit être appliquée (par exemple, `node_modules`, `.git`, fichiers binaires non image/PDF). Valeur par défaut : `true`.
- `respect_git_ignore` (booléen, facultatif) : Indique si les motifs définis dans `.gitignore` doivent être respectés lors de la recherche des fichiers. Valeur par défaut : `true`.

## Comment utiliser `read_many_files` avec Qwen Code

La fonction `read_many_files` recherche les fichiers correspondant aux motifs fournis dans les paramètres `paths` et `include`, tout en respectant les motifs d’exclusion spécifiés dans `exclude` ainsi que les exclusions par défaut (si activées).

- Pour les fichiers texte : elle lit le contenu de chaque fichier correspondant (en tentant d’ignorer les fichiers binaires non explicitement demandés comme images ou PDF) et concatène ce contenu en une seule chaîne de caractères, séparée par le délimiteur `--- {filePath} ---` entre chaque fichier. L’encodage UTF-8 est utilisé par défaut.
- L’outil insère une ligne `--- Fin du contenu ---` après le dernier fichier.
- Pour les fichiers image et PDF : s’ils sont explicitement demandés par leur nom ou leur extension (par exemple `paths: ["logo.png"]` ou `include: ["*.pdf"]`), l’outil lit le fichier et renvoie son contenu sous forme d’une chaîne de caractères encodée en base64.
- L’outil tente de détecter et d’ignorer les autres fichiers binaires (ceux qui ne correspondent pas aux types courants d’images/PDF ou qui n’ont pas été explicitement demandés) en vérifiant la présence d’octets nuls dans leurs premiers octets.

Utilisation :

```
read_many_files(paths=["Vos fichiers ou chemins ici."], include=["Fichiers supplémentaires à inclure."], exclude=["Fichiers à exclure."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Exemples de `read_many_files`

Lire tous les fichiers TypeScript du répertoire `src` :

```
read_many_files(paths=["src/**/*.ts"])
```

Lire le fichier README principal, tous les fichiers Markdown du répertoire `docs` et une image de logo spécifique, tout en excluant un fichier particulier :

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Lire tous les fichiers JavaScript, mais inclure explicitement les fichiers de test et tous les fichiers JPEG du dossier `images` :

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Remarques importantes

- **Gestion des fichiers binaires :**
  - **Fichiers image/PDF/audio/vidéo :** L’outil peut lire les formats d’image courants (PNG, JPEG, etc.), les fichiers PDF, les fichiers audio (mp3, wav) et les fichiers vidéo (mp4, mov), et les renvoie sous forme de données encodées en base64. Ces fichiers _doivent_ être explicitement ciblés par les motifs `paths` ou `include` (par exemple en spécifiant le nom exact du fichier tel que `video.mp4`, ou un motif tel que `*.mov`).
  - **Autres fichiers binaires :** L’outil tente de détecter et d’ignorer les autres types de fichiers binaires en examinant leurs premiers octets à la recherche de valeurs nulles. Ces fichiers sont exclus de la sortie de l’outil.
- **Performances :** La lecture d’un très grand nombre de fichiers ou de fichiers individuels très volumineux peut consommer beaucoup de ressources.
- **Spécificité des chemins :** Assurez-vous que les chemins et les motifs glob sont correctement spécifiés par rapport au répertoire cible de l’outil. Pour les fichiers image ou PDF, veillez à ce que les motifs soient suffisamment précis pour les inclure.
- **Exclusions par défaut :** Prenez connaissance des motifs d’exclusion par défaut (tels que `node_modules`, `.git`) et utilisez `useDefaultExcludes=False` si vous devez les remplacer, mais faites-le avec précaution.
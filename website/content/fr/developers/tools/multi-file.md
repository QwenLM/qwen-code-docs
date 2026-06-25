# Lecture multi-fichier (`read_many_files`)

> [!note]
>
> `read_many_files` était auparavant exposé comme un outil autonome, mais a été refactorisé en une fonction utilitaire interne. Le modèle ne l’invoque plus directement — à la place, les outils `read_file`, `glob` et `grep_search` couvrent la lecture de fichiers individuels et multiples. Les informations ci-dessous sont conservées à titre de référence.

## Description

`read_many_files` lit le contenu de plusieurs fichiers spécifiés par des chemins ou des motifs glob. Le comportement dépend du type de fichier :

- Pour les fichiers texte, cet outil concatène leur contenu en une seule chaîne de caractères.
- Pour les images (ex. PNG, JPEG), les PDF, les fichiers audio (MP3, WAV) et vidéo (MP4, MOV), il les lit et les retourne sous forme de données encodées en base64, à condition qu’ils soient explicitement demandés par leur nom ou leur extension.

`read_many_files` peut être utilisé pour effectuer des tâches telles que : obtenir une vue d’ensemble d’une base de code, trouver où une fonctionnalité spécifique est implémentée, examiner la documentation, ou rassembler le contexte de plusieurs fichiers de configuration.

**Remarque :** `read_many_files` recherche les fichiers selon les chemins ou motifs glob fournis. Un chemin de répertoire tel que `"/docs"` renverra un résultat vide ; l’outil nécessite un motif comme `"/docs/*"` ou `"/docs/*.md"` pour identifier les fichiers pertinents.

### Arguments

`read_many_files` prend les arguments suivants :

- `paths` (list[string], obligatoire) : un tableau de motifs glob ou de chemins relatifs au répertoire cible de l’outil (ex. `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], facultatif) : motifs glob pour les fichiers/répertoires à exclure (ex. `["**/*.log", "temp/"]`). Ils sont ajoutés aux exclusions par défaut si `useDefaultExcludes` est vrai.
- `include` (list[string], facultatif) : motifs glob supplémentaires à inclure. Ils sont fusionnés avec `paths` (ex. `["*.test.ts"]` pour ajouter spécifiquement les fichiers de test s’ils étaient largement exclus, ou `["images/*.jpg"]` pour inclure certains types d’images).
- `recursive` (boolean, facultatif) : indique s’il faut rechercher de manière récursive. Ce paramètre est principalement contrôlé par `**` dans les motifs glob. La valeur par défaut est `true`.
- `useDefaultExcludes` (boolean, facultatif) : indique s’il faut appliquer une liste de motifs d’exclusion par défaut (ex. `node_modules`, `.git`, fichiers binaires non image/PDF). La valeur par défaut est `true`.
- `respect_git_ignore` (boolean, facultatif) : indique s’il faut respecter les motifs `.gitignore` lors de la recherche de fichiers. La valeur par défaut est `true`.

## Comment utiliser `read_many_files` avec Qwen Code

`read_many_files` recherche les fichiers correspondant aux motifs `paths` et `include` fournis, tout en respectant les motifs `exclude` et les exclusions par défaut (si activées).

- Pour les fichiers texte : il lit le contenu de chaque fichier correspondant (en tentant d’ignorer les fichiers binaires qui ne sont pas explicitement demandés comme image/PDF) et le concatène en une seule chaîne de caractères, avec un séparateur `--- {filePath} ---` entre le contenu de chaque fichier. Utilise l’encodage UTF-8 par défaut.
- L’outil insère un `--- End of content ---` après le dernier fichier.
- Pour les fichiers image et PDF : s’ils sont explicitement demandés par nom ou extension (ex. `paths: ["logo.png"]` ou `include: ["*.pdf"]`), l’outil lit le fichier et retourne son contenu sous forme de chaîne encodée en base64.
- L’outil tente de détecter et d’ignorer les autres fichiers binaires (ceux qui ne correspondent pas aux types image/PDF courants ou qui ne sont pas explicitement demandés) en vérifiant la présence d’octets nuls dans leur contenu initial.

Utilisation :

```
read_many_files(paths=["Vos fichiers ou chemins ici."], include=["Fichiers supplémentaires à inclure."], exclude=["Fichiers à exclure."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Exemples de `read_many_files`

Lire tous les fichiers TypeScript dans le répertoire `src` :

```
read_many_files(paths=["src/**/*.ts"])
```

Lire le README principal, tous les fichiers Markdown du répertoire `docs` et une image de logo spécifique, en excluant un fichier particulier :

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Lire tous les fichiers JavaScript mais inclure explicitement les fichiers de test et tous les JPEG dans un dossier `images` :

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Remarques importantes

- **Gestion des fichiers binaires :**
  - **Fichiers image/PDF/audio/vidéo :** L’outil peut lire les types d’images courants (PNG, JPEG, etc.), les PDF, les fichiers audio (mp3, wav) et vidéo (mp4, mov), et les retourner sous forme de données encodées en base64. Ces fichiers *doivent* être ciblés explicitement par les motifs `paths` ou `include` (par exemple, en spécifiant le nom exact du fichier comme `video.mp4` ou un motif comme `*.mov`).
  - **Autres fichiers binaires :** L’outil tente de détecter et d’ignorer les autres types de fichiers binaires en examinant la présence d’octets nuls dans leur contenu initial. Ces fichiers sont exclus de la sortie.
- **Performances :** La lecture d’un très grand nombre de fichiers ou de fichiers très volumineux peut être gourmande en ressources.
- **Précision des chemins :** Assurez-vous que les chemins et motifs glob sont correctement spécifiés par rapport au répertoire cible de l’outil. Pour les fichiers image/PDF, assurez-vous que les motifs sont suffisamment précis pour les inclure.
- **Exclusions par défaut :** Soyez conscient des motifs d’exclusion par défaut (comme `node_modules`, `.git`) et utilisez `useDefaultExcludes=False` si vous devez les outrepasser, mais faites-le avec prudence.

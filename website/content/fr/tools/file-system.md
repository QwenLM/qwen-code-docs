# Outils du système de fichiers Qwen Code

Qwen Code fournit une suite complète d'outils pour interagir avec le système de fichiers local. Ces outils permettent au modèle de lire, écrire, lister, rechercher et modifier des fichiers et des répertoires, le tout sous votre contrôle et généralement avec confirmation pour les opérations sensibles.

**Remarque :** Tous les outils du système de fichiers fonctionnent dans un `rootDirectory` (généralement le répertoire de travail actuel où vous avez lancé la CLI) pour des raisons de sécurité. Les chemins que vous fournissez à ces outils sont généralement attendus en absolu ou sont résolus par rapport à ce répertoire racine.

## 1. `list_directory` (ListFiles)

`list_directory` liste les noms des fichiers et sous-répertoires directement présents dans un chemin de répertoire spécifié. Il peut éventuellement ignorer les entrées correspondant à des motifs glob fournis.

- **Nom de l'outil :** `list_directory`
- **Nom d'affichage :** ListFiles
- **Fichier :** `ls.ts`
- **Paramètres :**
  - `path` (string, requis) : Le chemin absolu du répertoire à lister.
  - `ignore` (tableau de strings, optionnel) : Une liste de motifs glob à exclure de la liste (ex. : `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, optionnel) : Indique s'il faut respecter les motifs définis dans `.gitignore` lors du listage des fichiers. Valeur par défaut : `true`.
- **Comportement :**
  - Retourne une liste contenant les noms des fichiers et répertoires.
  - Indique pour chaque entrée s’il s’agit d’un répertoire.
  - Trie les entrées en plaçant d'abord les répertoires, puis alphabétiquement.
- **Sortie (`llmContent`) :** Une chaîne comme : `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmation :** Non.

## 2. `read_file` (ReadFile)

`read_file` lit et retourne le contenu d’un fichier spécifié. Cet outil gère les fichiers texte, images (PNG, JPG, GIF, WEBP, SVG, BMP) et PDF. Pour les fichiers texte, il peut lire des plages de lignes spécifiques. Les autres types de fichiers binaires sont généralement ignorés.

- **Nom de l’outil :** `read_file`
- **Nom affiché :** ReadFile
- **Fichier :** `read-file.ts`
- **Paramètres :**
  - `path` (string, requis) : Le chemin absolu du fichier à lire.
  - `offset` (number, optionnel) : Pour les fichiers texte, le numéro de ligne (commençant à 0) à partir duquel commencer la lecture. Nécessite que `limit` soit défini.
  - `limit` (number, optionnel) : Pour les fichiers texte, le nombre maximal de lignes à lire. S’il est omis, une limite par défaut est utilisée (par exemple, 2000 lignes) ou le fichier entier est lu si possible.
- **Comportement :**
  - Pour les fichiers texte : Retourne le contenu. Si `offset` et `limit` sont utilisés, seul cet extrait de lignes est retourné. Indique si le contenu a été tronqué en raison des limites de lignes ou de longueur de ligne.
  - Pour les fichiers image et PDF : Retourne le contenu du fichier sous forme d’une structure encodée en base64 adaptée à la consommation par un modèle.
  - Pour les autres fichiers binaires : Tente de les identifier et les ignore, en retournant un message indiquant qu’il s’agit d’un fichier binaire générique.
- **Sortie :** (`llmContent`) :
  - Pour les fichiers texte : Le contenu du fichier, éventuellement précédé d’un message de troncature (ex. : `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Pour les fichiers image/PDF : Un objet contenant `inlineData` avec `mimeType` et les données encodées en base64 (ex. : `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Pour les autres fichiers binaires : Un message tel que `Cannot display content of binary file: /path/to/data.bin`.
- **Confirmation :** Non.

## 3. `write_file` (WriteFile)

`write_file` écrit du contenu dans un fichier spécifié. Si le fichier existe, il sera écrasé. Si le fichier n'existe pas, il (ainsi que les répertoires parents nécessaires) sera créé.

- **Nom de l'outil :** `write_file`
- **Nom d'affichage :** WriteFile
- **Fichier :** `write-file.ts`
- **Paramètres :**
  - `file_path` (string, requis) : Le chemin absolu vers le fichier à écrire.
  - `content` (string, requis) : Le contenu à écrire dans le fichier.
- **Comportement :**
  - Écrit le `content` fourni dans le `file_path`.
  - Crée les répertoires parents s'ils n'existent pas.
- **Sortie (`llmContent`) :** Un message de succès, par exemple : `Successfully overwrote file: /path/to/your/file.txt` ou `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmation :** Oui. Affiche un diff des changements et demande l'approbation de l'utilisateur avant d'écrire.

## 4. `glob` (Glob)

`glob` trouve les fichiers correspondant à des motifs glob spécifiques (par exemple, `src/**/*.ts`, `*.md`) et retourne leurs chemins absolus triés par date de modification (les plus récents en premier).

- **Nom de l'outil :** `glob`
- **Nom d'affichage :** Glob
- **Fichier :** `glob.ts`
- **Paramètres :**
  - `pattern` (string, requis) : Le motif glob à utiliser pour la recherche (ex. `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optionnel) : Le répertoire dans lequel effectuer la recherche. Si non spécifié, le répertoire courant est utilisé.
- **Comportement :**
  - Recherche les fichiers correspondant au motif glob dans le répertoire indiqué.
  - Retourne une liste de chemins absolus, triée avec les fichiers modifiés le plus récemment en premier.
  - Respecte les motifs définis dans `.gitignore` et `.qwenignore` par défaut.
  - Limite les résultats à 100 fichiers afin d'éviter un dépassement du contexte.
- **Sortie (`llmContent`) :** Un message tel que : `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **Confirmation :** Non.

## 5. `grep_search` (Grep)

`grep_search` recherche un motif d'expression régulière dans le contenu des fichiers d'un répertoire spécifié. Peut filtrer les fichiers via un motif glob. Retourne les lignes contenant des correspondances, ainsi que leurs chemins de fichier et numéros de ligne.

- **Nom de l'outil :** `grep_search`
- **Nom d'affichage :** Grep
- **Fichier :** `ripGrep.ts` (avec `grep.ts` comme solution de repli)
- **Paramètres :**
  - `pattern` (string, requis) : Le motif d'expression régulière à rechercher dans le contenu des fichiers (ex. : `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, optionnel) : Fichier ou répertoire dans lequel effectuer la recherche. Par défaut, il s'agit du répertoire de travail courant.
  - `glob` (string, optionnel) : Motif glob pour filtrer les fichiers (ex. : `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (number, optionnel) : Limite la sortie aux N premières lignes correspondantes. Optionnel – affiche toutes les correspondances si non spécifié.
- **Comportement :**
  - Utilise ripgrep pour une recherche rapide lorsque disponible ; sinon utilise une implémentation basée sur JavaScript.
  - Retourne les lignes correspondantes avec leurs chemins de fichier et numéros de ligne.
  - Insensible à la casse par défaut.
  - Respecte les motifs définis dans .gitignore et .qwenignore.
  - Limite la sortie pour éviter un dépassement de contexte.
- **Sortie (`llmContent`) :** Une chaîne formatée des correspondances, par exemple :

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **Confirmation :** Non.

### Exemples `grep_search`

Rechercher un motif avec limitation des résultats par défaut :

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Rechercher un motif avec limitation personnalisée des résultats :

```
grep_search(pattern="function", path="src", limit=50)
```

Rechercher un motif avec filtrage des fichiers et limitation personnalisée des résultats :

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Modifier)

L’outil `edit` remplace du texte dans un fichier. Par défaut, il nécessite que `old_string` corresponde à un seul emplacement unique ; définissez `replace_all` sur `true` si vous souhaitez intentionnellement modifier toutes les occurrences. Cet outil est conçu pour apporter des modifications précises et ciblées, et requiert un contexte important autour de `old_string` afin de garantir qu’il modifie le bon endroit.

- **Nom de l'outil :** `edit`
- **Nom affiché :** Modifier
- **Fichier :** `edit.ts`
- **Paramètres :**
  - `file_path` (string, requis) : Le chemin absolu vers le fichier à modifier.
  - `old_string` (string, requis) : Le texte littéral exact à remplacer.

    **IMPORTANT :** Cette chaîne doit identifier de manière unique l’instance à modifier. Elle doit inclure au moins 3 lignes de contexte _avant_ et _après_ le texte cible, en respectant précisément les espaces et l’indentation. Si `old_string` est vide, l’outil tente de créer un nouveau fichier à `file_path` avec `new_string` comme contenu.

  - `new_string` (string, requis) : Le texte littéral exact qui remplacera `old_string`.
  - `replace_all` (boolean, optionnel) : Remplacer toutes les occurrences de `old_string`. Valeur par défaut : `false`.

- **Comportement :**
  - Si `old_string` est vide et que `file_path` n’existe pas, crée un nouveau fichier avec `new_string` comme contenu.
  - Si `old_string` est fourni, lit le fichier à `file_path` et tente de trouver une seule occurrence, sauf si `replace_all` vaut `true`.
  - Si la correspondance est unique (ou si `replace_all` est vrai), remplace le texte par `new_string`.
  - **Fiabilité améliorée (Correction d’édition multi-étapes) :** Pour améliorer significativement le taux de réussite des éditions, notamment lorsque `old_string` fournie par le modèle n’est pas parfaitement précise, l’outil intègre un mécanisme de correction multi-étapes.
    - Si `old_string` initialement n’est pas trouvé ou correspond à plusieurs endroits, l’outil peut utiliser le modèle Qwen pour raffiner progressivement `old_string` (et potentiellement `new_string`).
    - Ce processus d’auto-correction tente d’identifier le segment unique que le modèle souhaitait modifier, rendant ainsi l’opération `edit` plus robuste même avec un contexte initial légèrement imparfait.
- **Conditions d’échec :** Malgré le mécanisme de correction, l’outil échouera si :
  - `file_path` n’est pas absolu ou se trouve en dehors du répertoire racine.
  - `old_string` n’est pas vide mais `file_path` n’existe pas.
  - `old_string` est vide mais `file_path` existe déjà.
  - `old_string` n’est pas trouvé dans le fichier après tentative de correction.
  - `old_string` apparaît plusieurs fois, `replace_all` est faux, et le mécanisme d’auto-correction ne parvient pas à résoudre cela en une seule correspondance non ambiguë.
- **Sortie (`llmContent`) :**
  - En cas de succès : `Successfully modified file: /path/to/file.txt (1 replacements).` ou `Created new file: /path/to/new_file.txt with provided content.`
  - En cas d’échec : Un message d’erreur expliquant la raison (ex. : `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Confirmation :** Oui. Affiche un diff des changements proposés et demande l’approbation de l’utilisateur avant d’écrire dans le fichier.

Ces outils du système de fichiers constituent une base permettant à Qwen Code de comprendre et d’interagir avec le contexte de votre projet local.
# Outils de système de fichiers Qwen Code

Qwen Code fournit une suite complète d'outils pour interagir avec le système de fichiers local. Ces outils permettent au modèle de lire, écrire, lister, rechercher et modifier des fichiers et des répertoires, le tout sous votre contrôle et généralement avec confirmation pour les opérations sensibles.

**Note :** Tous les outils de système de fichiers fonctionnent dans un `rootDirectory` (généralement le répertoire de travail actuel où vous avez lancé le CLI) pour des raisons de sécurité. Les chemins que vous fournissez à ces outils sont généralement attendus en absolu ou sont résolus par rapport à ce répertoire racine.

## 1. `list_directory` (ReadFolder)

`list_directory` liste les noms des fichiers et sous-répertoires directement présents dans un chemin de répertoire spécifié. Il peut éventuellement ignorer les entrées correspondant à des motifs glob fournis.

- **Nom de l'outil :** `list_directory`
- **Nom d'affichage :** ReadFolder
- **Fichier :** `ls.ts`
- **Paramètres :**
  - `path` (string, requis) : Le chemin absolu du répertoire à lister.
  - `ignore` (tableau de strings, optionnel) : Une liste de motifs glob à exclure du listing (ex. : `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, optionnel) : Indique s'il faut respecter les motifs `.gitignore` lors du listing des fichiers. Valeur par défaut : `true`.
- **Comportement :**
  - Retourne une liste de noms de fichiers et de répertoires.
  - Indique si chaque entrée est un répertoire.
  - Trie les entrées avec les répertoires en premier, puis par ordre alphabétique.
- **Sortie (`llmContent`) :** Une chaîne de caractères comme : `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmation :** Non.

## 2. `read_file` (ReadFile)

`read_file` lit et retourne le contenu d’un fichier spécifié. Cet outil gère les fichiers texte, images (PNG, JPG, GIF, WEBP, SVG, BMP) et PDF. Pour les fichiers texte, il peut lire des plages de lignes spécifiques. Les autres types de fichiers binaires sont généralement ignorés.

- **Nom de l’outil :** `read_file`
- **Nom d’affichage :** ReadFile
- **Fichier :** `read-file.ts`
- **Paramètres :**
  - `path` (string, requis) : Le chemin absolu du fichier à lire.
  - `offset` (number, optionnel) : Pour les fichiers texte, le numéro de ligne de départ (0-based). Nécessite que `limit` soit défini.
  - `limit` (number, optionnel) : Pour les fichiers texte, le nombre maximum de lignes à lire. Si omis, lit un maximum par défaut (ex. : 2000 lignes) ou le fichier entier si possible.
- **Comportement :**
  - Pour les fichiers texte : Retourne le contenu. Si `offset` et `limit` sont utilisés, retourne uniquement cette portion de lignes. Indique si le contenu a été tronqué en raison de limites de lignes ou de longueur de ligne.
  - Pour les fichiers image et PDF : Retourne le contenu du fichier sous forme d’une structure encodée en base64 adaptée à la consommation par un modèle.
  - Pour les autres fichiers binaires : Tente de les identifier et les ignore, en retournant un message indiquant qu’il s’agit d’un fichier binaire générique.
- **Sortie :** (`llmContent`) :
  - Pour les fichiers texte : Le contenu du fichier, éventuellement précédé d’un message de troncature (ex. : `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Pour les fichiers image/PDF : Un objet contenant `inlineData` avec `mimeType` et les `data` encodées en base64 (ex. : `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Pour les autres fichiers binaires : Un message tel que `Cannot display content of binary file: /path/to/data.bin`.
- **Confirmation :** Non.

## 3. `write_file` (WriteFile)

`write_file` écrit du contenu dans un fichier spécifié. Si le fichier existe, il sera écrasé. Si le fichier n'existe pas, il (ainsi que les répertoires parents nécessaires) sera créé.

- **Nom de l'outil :** `write_file`
- **Nom d'affichage :** WriteFile
- **Fichier :** `write-file.ts`
- **Paramètres :**
  - `file_path` (string, requis) : Le chemin absolu du fichier dans lequel écrire.
  - `content` (string, requis) : Le contenu à écrire dans le fichier.
- **Comportement :**
  - Écrit le `content` fourni dans le `file_path`.
  - Crée les répertoires parents s'ils n'existent pas.
- **Sortie (`llmContent`) :** Un message de succès, par exemple : `Successfully overwrote file: /path/to/your/file.txt` ou `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmation :** Oui. Affiche un diff des modifications et demande l'approbation de l'utilisateur avant d'écrire.

## 4. `glob` (FindFiles)

`glob` trouve des fichiers correspondant à des patterns glob spécifiques (ex : `src/**/*.ts`, `*.md`), et retourne des chemins absolus triés par date de modification (les plus récents en premier).

- **Nom de l'outil :** `glob`
- **Nom d'affichage :** FindFiles
- **Fichier :** `glob.ts`
- **Paramètres :**
  - `pattern` (string, requis) : Le pattern glob à utiliser pour la recherche (ex : `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optionnel) : Le chemin absolu du répertoire dans lequel effectuer la recherche. S’il est omis, la recherche se fait à partir du répertoire racine de l’outil.
  - `case_sensitive` (boolean, optionnel) : Indique si la recherche doit être sensible à la casse. Par défaut, `false`.
  - `respect_git_ignore` (boolean, optionnel) : Indique si les règles définies dans `.gitignore` doivent être respectées. Par défaut, `true`.
- **Comportement :**
  - Recherche des fichiers correspondant au pattern glob dans le répertoire spécifié.
  - Retourne une liste de chemins absolus, triés du plus récemment modifié au plus ancien.
  - Ignore par défaut les répertoires courants inutiles comme `node_modules` et `.git`.
- **Sortie (`llmContent`) :** Un message comme : `Found 5 file(s) matching "*.ts" within src, sorted by modification time (newest first):\nsrc/file1.ts\nsrc/subdir/file2.ts...`
- **Confirmation :** Non.

## 5. `search_file_content` (SearchText)

`search_file_content` recherche un motif d'expression régulière (regex) dans le contenu des fichiers d'un répertoire spécifié. Il peut filtrer les fichiers via un motif glob. Retourne les lignes contenant des correspondances, avec leurs chemins de fichiers et numéros de ligne.

- **Nom de l'outil :** `search_file_content`
- **Nom d'affichage :** SearchText
- **Fichier :** `grep.ts`
- **Paramètres :**
  - `pattern` (string, requis) : L'expression régulière à rechercher (ex. : `"function\s+myFunction"`).
  - `path` (string, optionnel) : Le chemin absolu du répertoire dans lequel effectuer la recherche. Par défaut, utilise le répertoire de travail courant.
  - `include` (string, optionnel) : Un motif glob pour filtrer les fichiers à explorer (ex. : `"*.js"`, `"src/**/*.{ts,tsx}"`). Si omis, la recherche s'applique à la plupart des fichiers (en respectant les ignorés classiques).
  - `maxResults` (number, optionnel) : Nombre maximum de correspondances à retourner afin d'éviter un dépassement de contexte (par défaut : 20, max : 100). Utilisez une valeur plus faible pour les recherches larges, plus élevée pour les recherches précises.
- **Comportement :**
  - Utilise `git grep` si disponible dans un dépôt Git pour plus de rapidité ; sinon, utilise `grep` système ou une recherche en JavaScript.
  - Retourne une liste des lignes correspondantes, chacune préfixée par son chemin de fichier (relatif au répertoire de recherche) et son numéro de ligne.
  - Limite les résultats à 20 correspondances par défaut pour éviter un dépassement de contexte. En cas de troncature, affiche un avertissement clair avec des conseils pour affiner la recherche.
- **Sortie (`llmContent`) :** Une chaîne formatée des correspondances, par exemple :

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  File: src/utils.ts
  L15: export function myFunction() {
  L22:   myFunction.call();
  ---
  File: src/index.ts
  L5: import { myFunction } from './utils';
  ---

  WARNING: Results truncated to prevent context overflow. To see more results:
  - Use a more specific pattern to reduce matches
  - Add file filters with the 'include' parameter (e.g., "*.js", "src/**")
  - Specify a narrower 'path' to search in a subdirectory
  - Increase 'maxResults' parameter if you need more matches (current: 20)
  ```

- **Confirmation :** Non.

### Exemples `search_file_content`

Rechercher un motif avec limitation des résultats par défaut :

```
search_file_content(pattern="function\s+myFunction", path="src")
```

Rechercher un motif avec limitation personnalisée des résultats :

```
search_file_content(pattern="function", path="src", maxResults=50)
```

Rechercher un motif avec filtrage des fichiers et limitation personnalisée des résultats :

```
search_file_content(pattern="function", include="*.js", maxResults=10)
```

## 6. `edit` (Modifier)

`edit` remplace du texte dans un fichier. Par défaut, il remplace une seule occurrence, mais peut remplacer plusieurs occurrences lorsque `expected_replacements` est spécifié. Cet outil est conçu pour apporter des modifications précises et ciblées, et nécessite un contexte important autour de `old_string` pour s'assurer qu'il modifie le bon endroit.

- **Nom de l'outil :** `edit`
- **Nom affiché :** Modifier
- **Fichier :** `edit.ts`
- **Paramètres :**
  - `file_path` (string, requis) : Le chemin absolu vers le fichier à modifier.
  - `old_string` (string, requis) : Le texte littéral exact à remplacer.

    **IMPORTANT :** Cette chaîne doit identifier de manière unique l'instance à modifier. Elle doit inclure au moins 3 lignes de contexte _avant_ et _après_ le texte cible, en respectant précisément les espaces et l'indentation. Si `old_string` est vide, l'outil tente de créer un nouveau fichier à `file_path` avec `new_string` comme contenu.

  - `new_string` (string, requis) : Le texte littéral exact qui remplacera `old_string`.
  - `expected_replacements` (number, optionnel) : Le nombre d'occurrences à remplacer. La valeur par défaut est `1`.

- **Comportement :**
  - Si `old_string` est vide et que `file_path` n'existe pas, crée un nouveau fichier avec `new_string` comme contenu.
  - Si `old_string` est fourni, il lit le fichier `file_path` et tente de trouver exactement une occurrence de `old_string`.
  - Si une occurrence est trouvée, il la remplace par `new_string`.
  - **Fiabilité améliorée (Correction d'édition multi-étapes) :** Pour améliorer significativement le taux de réussite des modifications, notamment lorsque la `old_string` fournie par le modèle n'est pas parfaitement précise, l'outil intègre un mécanisme de correction d'édition en plusieurs étapes.
    - Si la `old_string` initiale n'est pas trouvée ou correspond à plusieurs endroits, l'outil peut utiliser le modèle Qwen pour affiner de manière itérative `old_string` (et potentiellement `new_string`).
    - Ce processus d'auto-correction tente d'identifier le segment unique que le modèle voulait modifier, rendant l'opération `edit` plus robuste même avec un contexte initial légèrement imparfait.
- **Conditions d'échec :** Malgré le mécanisme de correction, l'outil échouera si :
  - `file_path` n'est pas absolu ou se trouve en dehors du répertoire racine.
  - `old_string` n'est pas vide, mais `file_path` n'existe pas.
  - `old_string` est vide, mais `file_path` existe déjà.
  - `old_string` n'est pas trouvé dans le fichier après les tentatives de correction.
  - `old_string` est trouvé plusieurs fois, et le mécanisme d'auto-correction ne parvient pas à le résoudre en une correspondance unique et non ambiguë.
- **Sortie (`llmContent`) :**
  - En cas de succès : `Successfully modified file: /path/to/file.txt (1 replacements).` ou `Created new file: /path/to/new_file.txt with provided content.`
  - En cas d'échec : Un message d'erreur expliquant la raison (par exemple, `Failed to edit, 0 occurrences found...`, `Failed to edit, expected 1 occurrences but found 2...`).
- **Confirmation :** Oui. Affiche un diff des modifications proposées et demande l'approbation de l'utilisateur avant d'écrire dans le fichier.

Ces outils du système de fichiers fournissent une base pour que Qwen Code puisse comprendre et interagir avec le contexte de votre projet local.
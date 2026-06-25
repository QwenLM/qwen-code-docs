# Outils du système de fichiers de Qwen Code

Qwen Code propose une suite complète d'outils pour interagir avec le système de fichiers local. Ces outils permettent au modèle de lire, écrire, lister, rechercher et modifier des fichiers et répertoires, tout cela sous votre contrôle et généralement avec une confirmation pour les opérations sensibles.

**Remarque :** Tous les outils du système de fichiers opèrent dans un `rootDirectory` (généralement le répertoire de travail actuel où vous avez lancé la CLI) pour des raisons de sécurité. Les chemins que vous fournissez à ces outils sont généralement attendus comme étant absolus ou sont résolus par rapport à ce répertoire racine.

## 1. `list_directory` (ListFiles)

`list_directory` liste les noms des fichiers et sous-répertoires directement dans un chemin de répertoire spécifié. Il peut éventuellement ignorer les entrées correspondant aux motifs glob fournis.

- **Nom de l'outil :** `list_directory`
- **Nom affiché :** ListFiles
- **Fichier :** `ls.ts`
- **Paramètres :**
  - `path` (chaîne, obligatoire) : Le chemin absolu du répertoire à lister.
  - `ignore` (tableau de chaînes, optionnel) : Une liste de motifs glob à exclure du listage (par ex., `["*.log", ".git"]`).
  - `respect_git_ignore` (booléen, optionnel) : Indique s'il faut respecter les motifs `.gitignore` lors du listage des fichiers. Par défaut `true`.
- **Comportement :**
  - Retourne une liste de noms de fichiers et de répertoires.
  - Indique si chaque entrée est un répertoire.
  - Trie les entrées en plaçant les répertoires en premier, puis par ordre alphabétique.
- **Sortie (`llmContent`) :** Une chaîne comme : `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmation :** Non.

## 2. `read_file` (ReadFile)

`read_file` lit et retourne le contenu d'un fichier spécifié. Cet outil gère les fichiers texte et les fichiers médias (images, PDF, audio, vidéo) dont la modalité est prise en charge par le modèle actuel. Pour les fichiers texte, il peut lire des plages de lignes spécifiques. Les fichiers médias dont la modalité n'est pas prise en charge par le modèle actuel sont rejetés avec un message d'erreur utile. Les autres types de fichiers binaires sont généralement ignorés.

- **Nom de l'outil :** `read_file`
- **Nom affiché :** ReadFile
- **Fichier :** `read-file.ts`
- **Paramètres :**
  - `path` (chaîne, obligatoire) : Le chemin absolu du fichier à lire.
  - `offset` (nombre, optionnel) : Pour les fichiers texte, le numéro de ligne (base 0) à partir duquel commencer la lecture. Nécessite que `limit` soit défini.
  - `limit` (nombre, optionnel) : Pour les fichiers texte, le nombre maximum de lignes à lire. S'il est omis, lit un maximum par défaut (par ex., 2000 lignes) ou le fichier entier si possible.
- **Comportement :**
  - Pour les fichiers texte : Retourne le contenu. Si `offset` et `limit` sont utilisés, retourne uniquement cette tranche de lignes. Indique si le contenu a été tronqué en raison des limites de lignes ou de longueur de ligne.
  - Pour les fichiers médias (images, PDF, audio, vidéo) : Si le modèle actuel prend en charge la modalité du fichier, retourne le contenu du fichier sous forme d'objet `inlineData` encodé en base64. Si le modèle ne prend pas en charge la modalité, retourne un message d'erreur avec des conseils (par ex., suggérant des compétences ou des outils externes).
  - Pour les autres fichiers binaires : Tente de les identifier et de les ignorer, retournant un message indiquant qu'il s'agit d'un fichier binaire générique.
- **Sortie (`llmContent`) :**
  - Pour les fichiers texte : Le contenu du fichier, éventuellement précédé d'un message de troncature (par ex., `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Pour les fichiers médias pris en charge : Un objet contenant `inlineData` avec `mimeType` et `data` en base64 (par ex., `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Pour les fichiers médias non pris en charge : Une chaîne de message d'erreur expliquant que le modèle actuel ne prend pas en charge cette modalité, avec des suggestions d'alternatives.
  - Pour les autres fichiers binaires : Un message comme `Cannot display content of binary file: /path/to/data.bin`.
- **Confirmation :** Non.

### Lecture de notebooks Jupyter

Pour les notebooks Jupyter (`.ipynb`), `read_file` analyse le JSON du notebook et retourne une vue structurée et lisible par le modèle au lieu du JSON brut. La sortie affichée inclut le langage du notebook, les cellules ordonnées, les identifiants des cellules, la source et les sorties résumées.

Les cellules du notebook peuvent ensuite être modifiées avec `notebook_edit`. Le modèle doit utiliser les ID de cellule affichés par `read_file` lorsqu'il cible une cellule.

`offset` et `limit` ne sont pas pris en charge pour les fichiers `.ipynb`. Les lectures de notebooks sont traitées comme des lectures complètes structurées ; si la sortie affichée du notebook est tronquée en interne parce qu'elle est trop volumineuse, `notebook_edit` rejettera les modifications au niveau des cellules et vous demandera de réduire les sorties ou de diviser le notebook avant de le modifier.

## 3. `notebook_edit` (NotebookEdit)

`notebook_edit` modifie les fichiers de notebook Jupyter (`.ipynb`) en toute sécurité au niveau des cellules. Utilisez-le à la place de `edit` ou `write_file` lorsque vous modifiez des cellules de notebook.

- **Nom de l'outil :** `notebook_edit`
- **Nom affiché :** NotebookEdit
- **Fichier :** `notebook-edit.ts`
- **Paramètres :**
  - `notebook_path` (chaîne, obligatoire) : Le chemin absolu du fichier `.ipynb`.
  - `cell_id` (chaîne, optionnel) : L'ID de cellule cible affiché par `read_file`. Requis pour les opérations `replace` et `delete`. Pour `insert`, la nouvelle cellule est insérée après cette cellule ; si omis, la nouvelle cellule est insérée au début.
  - `new_source` (chaîne, optionnel) : La nouvelle source de cellule pour les opérations `replace` et `insert`. Non requis pour `delete`.
  - `cell_type` (`code` ou `markdown`, optionnel) : Le type de cellule pour les cellules insérées, ou le type cible lors du remplacement d'une cellule.
  - `edit_mode` (`replace`, `insert` ou `delete`, optionnel) : L'opération d'édition. Par défaut `replace`.
- **Comportement :**
  - Nécessite que le notebook ait d'abord été lu avec `read_file` dans la session en cours.
  - Cible les cellules en utilisant les ID rendus par `read_file`, y compris les ID réels des cellules du notebook et les ID de repli `cell-N` affichés.
  - Rejette les ID de cellule rendus ambigus plutôt que de deviner.
  - Pour les cellules de code, efface les sorties obsolètes et réinitialise `execution_count` lorsque la source change.
  - Préserve le formatage JSON du notebook, les sauts de ligne, l'encodage et la marque BOM dans la mesure du possible.
  - Invalide l'état de lecture précédent après des modifications structurelles lorsque les ID de repli affichés peuvent se décaler, de sorte que la prochaine édition du notebook nécessite un nouveau `read_file`.
- **Sortie (`llmContent`) :** Un message de succès décrivant la cellule de notebook modifiée et, pour les opérations autres que `delete`, la source mise à jour.
- **Confirmation :** Oui. Affiche un diff JSON du notebook et demande l'approbation de l'utilisateur avant d'écrire, sauf si le mode d'autorisation actuel ou les règles approuvent automatiquement les outils d'édition.
### Exemples de `notebook_edit`

Remplacer une cellule de code :

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  cell_id="load-data",
  new_source="result = 41 + 1\nprint(result)"
)
```

Insérer une cellule markdown après une cellule existante :

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="insert",
  cell_id="summary",
  cell_type="markdown",
  new_source="## Findings\n\nThe cleaned data is ready for modeling."
)
```

Supprimer une cellule :

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="delete",
  cell_id="old-experiment"
)
```

## 4. `write_file` (WriteFile)

`write_file` écrit du contenu dans un fichier spécifié. Si le fichier existe, il sera écrasé. Si le fichier n'existe pas, il (et tous les répertoires parents nécessaires) seront créés.

- **Nom de l'outil :** `write_file`
- **Nom affiché :** WriteFile
- **Fichier :** `write-file.ts`
- **Paramètres :**
  - `file_path` (chaîne, obligatoire) : Le chemin absolu du fichier dans lequel écrire.
  - `content` (chaîne, obligatoire) : Le contenu à écrire dans le fichier.
- **Comportement :**
  - Écrit le `content` fourni dans le fichier `file_path`.
  - N'écrit pas le JSON brut du notebook Jupyter. Utilisez `notebook_edit` pour les modifications de cellules `.ipynb`.
  - Crée les répertoires parents s'ils n'existent pas.
- **Sortie (`llmContent`) :** Un message de succès, p. ex. `Successfully overwrote file: /path/to/your/file.txt` ou `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmation :** Oui. Affiche un diff des modifications et demande l'approbation de l'utilisateur avant d'écrire.

## 5. `glob` (Glob)

`glob` trouve les fichiers correspondant à des motifs glob spécifiques (p. ex. `src/**/*.ts`, `*.md`), renvoyant les chemins absolus triés par date de modification (le plus récent en premier).

- **Nom de l'outil :** `glob`
- **Nom affiché :** Glob
- **Fichier :** `glob.ts`
- **Paramètres :**
  - `pattern` (chaîne, obligatoire) : Le motif glob à utiliser pour la correspondance (p. ex. `"*.py"`, `"src/**/*.js"`).
  - `path` (chaîne, facultatif) : Le répertoire dans lequel chercher. Si non spécifié, le répertoire de travail courant est utilisé.
- **Comportement :**
  - Recherche les fichiers correspondant au motif glob dans le répertoire spécifié.
  - Renvoie une liste de chemins absolus, triés avec les fichiers les plus récemment modifiés en premier.
  - Respecte par défaut .gitignore, .qwenignore et les fichiers d'ignorance Qwen personnalisés configurés.
  - Limite les résultats à 100 fichiers pour éviter un débordement de contexte.
- **Sortie (`llmContent`) :** Un message tel que : `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **Confirmation :** Non.

## 6. `grep_search` (Grep)

`grep_search` recherche un motif d'expression régulière dans le contenu des fichiers d'un répertoire spécifié. Peut filtrer les fichiers par un motif glob. Renvoie les lignes contenant les correspondances, avec leurs chemins de fichier et numéros de ligne.

- **Nom de l'outil :** `grep_search`
- **Nom affiché :** Grep
- **Fichier :** `grep.ts` (avec `ripGrep.ts` comme solution de repli)
- **Paramètres :**
  - `pattern` (chaîne, obligatoire) : Le motif d'expression régulière à rechercher dans le contenu des fichiers (p. ex. `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (chaîne, facultatif) : Fichier ou répertoire dans lequel chercher. Par défaut, le répertoire de travail courant.
  - `glob` (chaîne, facultatif) : Motif glob pour filtrer les fichiers (p. ex. `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (entier, facultatif) : Limite la sortie aux N premières lignes correspondantes. Doit être un entier positif. Facultatif – affiche toutes les correspondances si non spécifié.
- **Comportement :**
  - Utilise ripgrep pour une recherche rapide si disponible ; sinon, utilise une implémentation de recherche basée sur JavaScript.
  - Renvoie les lignes correspondantes avec les chemins de fichier et les numéros de ligne.
  - Insensible à la casse par défaut.
  - Respecte .gitignore, .qwenignore et les fichiers d'ignorance Qwen personnalisés configurés.
  - Limite la sortie pour éviter un débordement de contexte.
- **Sortie (`llmContent`) :** Une chaîne formatée des correspondances, p. ex. :

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

### Exemples de `grep_search`

Rechercher un motif avec la limitation de résultats par défaut :

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Rechercher un motif avec une limitation de résultats personnalisée :

```
grep_search(pattern="function", path="src", limit=50)
```

Rechercher un motif avec filtrage de fichiers et limitation de résultats personnalisée :

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 7. `edit` (Edit)

`edit` remplace du texte dans un fichier. Par défaut, il exige que `old_string` corresponde à un emplacement unique ; définissez `replace_all` sur `true` lorsque vous souhaitez modifier intentionnellement toutes les occurrences. Cet outil est conçu pour des modifications précises et ciblées et nécessite un contexte important autour de `old_string` pour garantir qu'il modifie le bon emplacement.

- **Nom de l'outil :** `edit`
- **Nom affiché :** Edit
- **Fichier :** `edit.ts`
- **Paramètres :**
  - `file_path` (chaîne, obligatoire) : Le chemin absolu du fichier à modifier.
  - `old_string` (chaîne, obligatoire) : Le texte littéral exact à remplacer.
**CRITIQUE :** Cette chaîne doit identifier de manière unique l'instance à modifier. Elle doit inclure un contexte suffisant autour du texte cible, en respectant précisément les espaces et l'indentation. Si `old_string` est vide, l'outil tente de créer un nouveau fichier à l'emplacement `file_path` avec `new_string` comme contenu.

- `new_string` (string, obligatoire) : Le texte littéral exact qui remplacera `old_string`.
- `replace_all` (boolean, facultatif) : Remplace toutes les occurrences de `old_string`. Par défaut `false`.

- **Comportement :**
  - Ne modifie pas le JSON brut d'un notebook Jupyter. Utilisez `notebook_edit` pour les modifications de cellules `.ipynb`.
  - Si `old_string` est vide et que `file_path` n'existe pas, crée un nouveau fichier avec `new_string` comme contenu.
  - Si `old_string` est fourni, lit le fichier `file_path` et tente de trouver exactement une occurrence, sauf si `replace_all` est vrai.
  - Si la correspondance est unique (ou `replace_all` est vrai), remplace le texte par `new_string`.
  - **Fiabilité améliorée (correction d'édition multi-étapes) :** Afin d'augmenter significativement le taux de réussite des modifications, surtout lorsque le `old_string` fourni par le modèle peut ne pas être parfaitement précis, l'outil intègre un mécanisme de correction d'édition en plusieurs étapes.
    - Si le `old_string` initial n'est pas trouvé ou correspond à plusieurs emplacements, l'outil peut utiliser le modèle Qwen pour affiner itérativement `old_string` (et potentiellement `new_string`).
    - Ce processus d'auto-correction tente d'identifier le segment unique que le modèle avait l'intention de modifier, rendant l'opération `edit` plus robuste même avec un contexte initial légèrement imparfait.
- **Conditions d'échec :** Malgré le mécanisme de correction, l'outil échouera si :
  - `file_path` n'est pas absolu ou se trouve en dehors du répertoire racine.
  - `old_string` n'est pas vide, mais `file_path` n'existe pas.
  - `old_string` est vide, mais `file_path` existe déjà.
  - `old_string` est introuvable dans le fichier après les tentatives de correction.
  - `old_string` est trouvé plusieurs fois, `replace_all` est faux, et le mécanisme d'auto-correction ne peut pas le résoudre en une correspondance unique et non ambiguë.
- **Sortie (`llmContent`) :**
  - En cas de succès : `Successfully modified file: /path/to/file.txt (1 replacements).` ou `Created new file: /path/to/new_file.txt with provided content.`
  - En cas d'échec : Un message d'erreur expliquant la raison (par exemple, `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Confirmation :** Oui. Affiche un diff des modifications proposées et demande l'approbation de l'utilisateur avant d'écrire dans le fichier.

## Encodage des fichiers et comportement spécifique à la plateforme

### Détection et préservation de l'encodage

Lors de la lecture des fichiers, Qwen Code détecte l'encodage du fichier en utilisant une stratégie en plusieurs étapes :

1. **UTF-8** — essayé en premier (la plupart des outils modernes produisent de l'UTF-8)
2. **chardet** — détection statistique pour le contenu non UTF-8
3. **Encodage système** — revient à la page de codes du système d'exploitation (Windows `chcp` / Unix `LANG`)

Les fonctions `write_file` et `edit` préservent l'encodage original et la BOM (marque d'ordre des octets) des fichiers existants. Si un fichier a été lu en GBK avec une BOM UTF-8, il sera réécrit de la même manière.

### Configuration de l'encodage par défaut pour les nouveaux fichiers

Le paramètre `defaultFileEncoding` contrôle l'encodage des fichiers **nouvellement créés** (pas les modifications de fichiers existants) :

| Valeur      | Comportement                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| _(non défini)_ | UTF-8 sans BOM, avec des ajustements automatiques spécifiques à la plateforme (voir ci-dessous)      |
| `utf-8`     | UTF-8 sans BOM, aucun ajustement automatique                                                         |
| `utf-8-bom` | UTF-8 avec BOM pour tous les nouveaux fichiers                                                       |

Définissez-le dans `.qwen/settings.json` ou `~/.qwen/settings.json` :

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows : CRLF pour les fichiers batch

Sous Windows, les fichiers `.bat` et `.cmd` sont automatiquement écrits avec des fins de ligne CRLF (`\r\n`). Cela est nécessaire car `cmd.exe` utilise CRLF comme délimiteur de ligne — des fins de ligne uniquement LF peuvent casser les blocs `if`/`else` multi-lignes, les étiquettes `goto` et les boucles `for`. Cela s'applique indépendamment des paramètres d'encodage et uniquement sous Windows.

### Windows : BOM UTF-8 pour les scripts PowerShell

Sous Windows avec une **page de codes système non UTF-8** (par exemple GBK/cp936, Big5/cp950, Shift_JIS/cp932), les fichiers `.ps1` nouvellement créés sont automatiquement écrits avec une BOM UTF-8. Cela est nécessaire car Windows PowerShell 5.1 (la version intégrée à Windows 10/11) lit les scripts sans BOM en utilisant la page de codes ANSI du système. Sans BOM, tout caractère non ASCII présent dans le script sera mal interprété.

Cette BOM automatique ne s'applique que lorsque :

- La plateforme est Windows
- La page de codes système n'est pas UTF-8 (pas la page de codes 65001)
- Le fichier est un nouveau fichier `.ps1` (les fichiers existants conservent leur encodage d'origine)
- L'utilisateur n'a **pas** défini explicitement `defaultFileEncoding` dans les paramètres

PowerShell 7+ (pwsh) utilise par défaut UTF-8 et gère la BOM de manière transparente, donc la BOM y est inoffensive.
Si vous définissez explicitement `defaultFileEncoding` sur `"utf-8"`, le BOM automatique est désactivé — il s'agit d'une échappatoire intentionnelle pour les dépôts ou outils qui rejettent les BOM.

### Résumé

| Type de fichier | Plateforme                      | Comportement automatique          |
| --------------- | ------------------------------- | --------------------------------- |
| `.bat`, `.cmd`  | Windows                         | Sauts de ligne CRLF               |
| `.ps1`          | Windows (page de code non UTF-8) | BOM UTF-8 sur les nouveaux fichiers |
| Tous les autres | Toutes                          | UTF-8 sans BOM (par défaut)       |

Ces outils de système de fichiers fournissent une base pour que Qwen Code comprenne et interagisse avec le contexte de votre projet local.

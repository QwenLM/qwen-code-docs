# Outils de système de fichiers de Qwen Code

Qwen Code propose une suite complète d'outils pour interagir avec le système de fichiers local. Ces outils permettent au modèle de lire, écrire, lister, rechercher et modifier des fichiers et des répertoires, le tout sous votre contrôle et généralement avec une confirmation pour les opérations sensibles.

**Remarque :** Tous les outils de système de fichiers opèrent dans un `rootDirectory` (généralement le répertoire de travail courant depuis lequel vous avez lancé la CLI) pour des raisons de sécurité. Les chemins que vous fournissez à ces outils doivent généralement être absolus ou sont résolus par rapport à ce répertoire racine.

## 1. `list_directory` (ListFiles)

`list_directory` liste les noms des fichiers et sous-répertoires situés directement dans un chemin de répertoire spécifié. Il peut éventuellement ignorer les entrées correspondant aux motifs glob fournis.

- **Tool name:** `list_directory`
- **Display name:** ListFiles
- **File:** `ls.ts`
- **Parameters:**
  - `path` (string, requis) : Le chemin absolu du répertoire à lister.
  - `ignore` (array of strings, optionnel) : Une liste de motifs glob à exclure du listing (par ex. `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, optionnel) : Indique s'il faut respecter les motifs `.gitignore` lors du listage des fichiers. La valeur par défaut est `true`.
- **Behavior:**
  - Renvoie une liste de noms de fichiers et de répertoires.
  - Indique si chaque entrée est un répertoire.
  - Trie les entrées en plaçant les répertoires en premier, puis par ordre alphabétique.
- **Output (`llmContent`):** Une chaîne comme : `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmation:** Non.

## 2. `read_file` (ReadFile)

`read_file` lit et renvoie le contenu d'un fichier spécifié. Cet outil gère les fichiers texte et les fichiers multimédias (images, PDF, audio, vidéo) dont la modalité est prise en charge par le modèle actuel. Pour les fichiers texte, il peut lire des plages de lignes spécifiques. Les fichiers multimédias dont la modalité n'est pas prise en charge par le modèle actuel sont rejetés avec un message d'erreur explicatif. Les autres types de fichiers binaires sont généralement ignorés.

- **Tool name:** `read_file`
- **Display name:** ReadFile
- **File:** `read-file.ts`
- **Parameters:**
  - `path` (string, requis) : Le chemin absolu du fichier à lire.
  - `offset` (number, optionnel) : Pour les fichiers texte, le numéro de ligne (commençant à 0) à partir duquel commencer la lecture. Nécessite que `limit` soit défini.
  - `limit` (number, optionnel) : Pour les fichiers texte, le nombre maximum de lignes à lire. Si omis, lit un maximum par défaut (par ex. 2000 lignes) ou le fichier entier si possible.
- **Behavior:**
  - Pour les fichiers texte : Renvoie le contenu. Si `offset` et `limit` sont utilisés, renvoie uniquement cette tranche de lignes. Indique si le contenu a été tronqué en raison des limites de lignes ou de longueur de ligne.
  - Pour les fichiers multimédias (images, PDF, audio, vidéo) : Si le modèle actuel prend en charge la modalité du fichier, renvoie le contenu du fichier sous forme d'objet `inlineData` encodé en base64. Si le modèle ne prend pas en charge la modalité, renvoie un message d'erreur avec des conseils (par ex. suggérant des skills ou des outils externes).
  - Pour les autres fichiers binaires : Tente de les identifier et de les ignorer, en renvoyant un message indiquant qu'il s'agit d'un fichier binaire générique.
- **Output:** (`llmContent`):
  - Pour les fichiers texte : Le contenu du fichier, potentiellement préfixé par un message de troncature (par ex. `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Pour les fichiers multimédias pris en charge : Un objet contenant `inlineData` avec `mimeType` et `data` en base64 (par ex. `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Pour les fichiers multimédias non pris en charge : Une chaîne de message d'erreur expliquant que le modèle actuel ne prend pas en charge cette modalité, avec des suggestions d'alternatives.
  - Pour les autres fichiers binaires : Un message comme `Cannot display content of binary file: /path/to/data.bin`.
- **Confirmation:** Non.

## 3. `write_file` (WriteFile)

`write_file` écrit du contenu dans un fichier spécifié. Si le fichier existe, il sera écrasé. Si le fichier n'existe pas, il sera créé (ainsi que les répertoires parents nécessaires).

- **Tool name:** `write_file`
- **Display name:** WriteFile
- **File:** `write-file.ts`
- **Parameters:**
  - `file_path` (string, requis) : Le chemin absolu du fichier dans lequel écrire.
  - `content` (string, requis) : Le contenu à écrire dans le fichier.
- **Behavior:**
  - Écrit le `content` fourni dans le `file_path`.
  - Crée les répertoires parents s'ils n'existent pas.
- **Output (`llmContent`):** Un message de succès, par ex. `Successfully overwrote file: /path/to/your/file.txt` ou `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmation:** Oui. Affiche un diff des modifications et demande l'approbation de l'utilisateur avant l'écriture.

## 4. `glob` (Glob)

`glob` recherche les fichiers correspondant à des motifs glob spécifiques (par ex. `src/**/*.ts`, `*.md`), et renvoie des chemins absolus triés par date de modification (le plus récent en premier).

- **Tool name:** `glob`
- **Display name:** Glob
- **File:** `glob.ts`
- **Parameters:**
  - `pattern` (string, requis) : Le motif glob à faire correspondre (par ex. `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optionnel) : Le répertoire dans lequel effectuer la recherche. Si non spécifié, le répertoire de travail courant sera utilisé.
- **Behavior:**
  - Recherche les fichiers correspondant au motif glob dans le répertoire spécifié.
  - Renvoie une liste de chemins absolus, triés avec les fichiers les plus récemment modifiés en premier.
  - Respecte les motifs .gitignore et .qwenignore par défaut.
  - Limite les résultats à 100 fichiers pour éviter le débordement de contexte.
- **Output (`llmContent`):** Un message comme : `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **Confirmation:** Non.

## 5. `grep_search` (Grep)

`grep_search` recherche un motif d'expression régulière dans le contenu des fichiers d'un répertoire spécifié. Peut filtrer les fichiers via un motif glob. Renvoie les lignes contenant les correspondances, ainsi que leurs chemins de fichiers et numéros de ligne.

- **Tool name:** `grep_search`
- **Display name:** Grep
- **File:** `grep.ts` (avec `ripGrep.ts` comme fallback)
- **Parameters:**
  - `pattern` (string, requis) : Le motif d'expression régulière à rechercher dans le contenu des fichiers (par ex. `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, optionnel) : Fichier ou répertoire dans lequel effectuer la recherche. La valeur par défaut est le répertoire de travail courant.
  - `glob` (string, optionnel) : Motif glob pour filtrer les fichiers (par ex. `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (number, optionnel) : Limite la sortie aux N premières lignes correspondantes. Optionnel - affiche toutes les correspondances si non spécifié.
- **Behavior:**
  - Utilise ripgrep pour une recherche rapide lorsqu'il est disponible ; sinon, utilise une implémentation de recherche basée sur JavaScript.
  - Renvoie les lignes correspondantes avec les chemins de fichiers et les numéros de ligne.
  - Insensible à la casse par défaut.
  - Respecte les motifs .gitignore et .qwenignore.
  - Limite la sortie pour éviter le débordement de contexte.
- **Output (`llmContent`):** Une chaîne formatée des correspondances, par ex. :

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **Confirmation:** Non.

### Exemples `grep_search`

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

## 6. `edit` (Edit)

`edit` remplace du texte dans un fichier. Par défaut, il exige que `old_string` corresponde à un seul emplacement unique ; définissez `replace_all` sur `true` lorsque vous souhaitez intentionnellement modifier chaque occurrence. Cet outil est conçu pour des modifications précises et ciblées, et nécessite un contexte important autour de `old_string` pour garantir qu'il modifie le bon emplacement.

- **Tool name:** `edit`
- **Display name:** Edit
- **File:** `edit.ts`
- **Parameters:**
  - `file_path` (string, requis) : Le chemin absolu du fichier à modifier.
  - `old_string` (string, requis) : Le texte littéral exact à remplacer.

    **CRITIQUE :** Cette chaîne doit identifier de manière unique l'instance à modifier. Elle doit inclure un contexte suffisant autour du texte cible, en respectant précisément les espaces et l'indentation. Si `old_string` est vide, l'outil tente de créer un nouveau fichier à `file_path` avec `new_string` comme contenu.

  - `new_string` (string, requis) : Le texte littéral exact pour remplacer `old_string`.
  - `replace_all` (boolean, optionnel) : Remplace toutes les occurrences de `old_string`. La valeur par défaut est `false`.

- **Behavior:**
  - Si `old_string` est vide et que `file_path` n'existe pas, crée un nouveau fichier avec `new_string` comme contenu.
  - Si `old_string` est fourni, il lit le `file_path` et tente de trouver exactement une occurrence, sauf si `replace_all` est vrai.
  - Si la correspondance est unique (ou si `replace_all` est vrai), il remplace le texte par `new_string`.
  - **Fiabilité améliorée (Correction d'édition en plusieurs étapes) :** Pour améliorer considérablement le taux de réussite des modifications, surtout lorsque le `old_string` fourni par le modèle n'est pas parfaitement précis, l'outil intègre un mécanisme de correction d'édition en plusieurs étapes.
    - Si le `old_string` initial n'est pas trouvé ou correspond à plusieurs emplacements, l'outil peut exploiter le modèle Qwen pour affiner itérativement `old_string` (et potentiellement `new_string`).
    - Ce processus d'auto-correction tente d'identifier le segment unique que le modèle souhaitait modifier, rendant l'opération `edit` plus robuste même avec un contexte initial légèrement imparfait.
- **Failure conditions:** Malgré le mécanisme de correction, l'outil échouera si :
  - `file_path` n'est pas absolu ou se trouve en dehors du répertoire racine.
  - `old_string` n'est pas vide, mais le `file_path` n'existe pas.
  - `old_string` est vide, mais le `file_path` existe déjà.
  - `old_string` n'est pas trouvé dans le fichier après les tentatives de correction.
  - `old_string` est trouvé plusieurs fois, `replace_all` est faux, et le mécanisme d'auto-correction ne parvient pas à le résoudre en une correspondance unique et non ambiguë.
- **Output (`llmContent`):**
  - En cas de succès : `Successfully modified file: /path/to/file.txt (1 replacements).` ou `Created new file: /path/to/new_file.txt with provided content.`
  - En cas d'échec : Un message d'erreur expliquant la raison (par ex. `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Confirmation:** Oui. Affiche un diff des modifications proposées et demande l'approbation de l'utilisateur avant l'écriture dans le fichier.

## Encodage des fichiers et comportement spécifique à la plateforme

### Détection et préservation de l'encodage

Lors de la lecture de fichiers, Qwen Code détecte l'encodage du fichier en utilisant une stratégie en plusieurs étapes :

1. **UTF-8** — essayé en premier (la plupart des outils modernes produisent de l'UTF-8)
2. **chardet** — détection statistique pour les contenus non-UTF-8
3. **System encoding** — utilise la page de code du système d'exploitation (Windows `chcp` / Unix `LANG`) en dernier recours

Les outils `write_file` et `edit` préservent l'encodage d'origine et le BOM (marque d'ordre des octets) des fichiers existants. Si un fichier a été lu en GBK avec un BOM UTF-8, il sera réécrit de la même manière.

### Configuration de l'encodage par défaut pour les nouveaux fichiers

Le paramètre `defaultFileEncoding` contrôle l'encodage pour les fichiers **nouvellement créés** (et non pour les modifications de fichiers existants) :

| Valeur      | Comportement                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| _(non défini)_ | UTF-8 sans BOM, avec ajustements automatiques spécifiques à la plateforme (voir ci-dessous) |
| `utf-8`     | UTF-8 sans BOM, sans ajustements automatiques                                 |
| `utf-8-bom` | UTF-8 avec BOM pour tous les nouveaux fichiers                                            |

Définissez-le dans `.qwen/settings.json` ou `~/.qwen/settings.json` :

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows : CRLF pour les fichiers batch

Sous Windows, les fichiers `.bat` et `.cmd` sont automatiquement écrits avec des fins de ligne CRLF (`\r\n`). Cela est requis car `cmd.exe` utilise CRLF comme délimiteur de ligne — les fins de ligne LF seules peuvent casser les blocs `if`/`else` multilignes, les étiquettes `goto` et les boucles `for`. Cela s'applique indépendamment des paramètres d'encodage et uniquement sous Windows.

### Windows : BOM UTF-8 pour les scripts PowerShell

Sous Windows avec une **page de code système non-UTF-8** (par ex. GBK/cp936, Big5/cp950, Shift_JIS/cp932), les fichiers `.ps1` nouvellement créés sont automatiquement écrits avec un BOM UTF-8. Cela est nécessaire car Windows PowerShell 5.1 (la version intégrée à Windows 10/11) lit les scripts sans BOM en utilisant la page de code ANSI du système. Sans BOM, tous les caractères non-ASCII du script seront mal interprétés.

Ce BOM automatique s'applique uniquement lorsque :

- La plateforme est Windows
- La page de code système n'est pas UTF-8 (pas la page de code 65001)
- Le fichier est un nouveau fichier `.ps1` (les fichiers existants conservent leur encodage d'origine)
- L'utilisateur n'a **pas** explicitement défini `defaultFileEncoding` dans les paramètres

PowerShell 7+ (pwsh) utilise UTF-8 par défaut et gère le BOM de manière transparente, le BOM est donc inoffensif dans ce cas.

Si vous définissez explicitement `defaultFileEncoding` sur `"utf-8"`, le BOM automatique est désactivé — il s'agit d'une porte de sortie intentionnelle pour les dépôts ou les outils qui rejettent les BOM.

### Résumé

| Type de fichier      | Plateforme                      | Comportement automatique          |
| -------------- | ----------------------------- | --------------------------- |
| `.bat`, `.cmd` | Windows                       | Fins de ligne CRLF           |
| `.ps1`         | Windows (page de code non-UTF-8) | BOM UTF-8 sur les nouveaux fichiers      |
| Tous les autres     | Tous                           | UTF-8 sans BOM (par défaut) |

Ces outils de système de fichiers constituent la base permettant à Qwen Code de comprendre et d'interagir avec le contexte de votre projet local.
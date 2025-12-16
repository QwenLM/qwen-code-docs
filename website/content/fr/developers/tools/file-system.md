# Outils du système de fichiers Qwen Code

Qwen Code fournit une suite complète d'outils pour interagir avec le système de fichiers local. Ces outils permettent au modèle de lire, écrire, lister, rechercher et modifier des fichiers et des répertoires, le tout sous votre contrôle et généralement avec confirmation pour les opérations sensibles.

**Remarque :** Tous les outils du système de fichiers fonctionnent dans un `rootDirectory` (généralement le répertoire de travail actuel où vous avez lancé la CLI) pour des raisons de sécurité. Les chemins que vous fournissez à ces outils sont généralement attendus en absolu ou sont résolus par rapport à ce répertoire racine.

## 1. `list_directory` (ListFiles)

`list_directory` liste les noms des fichiers et sous-répertoires directement présents dans un chemin de répertoire spécifié. Il peut éventuellement ignorer les entrées correspondant à des motifs glob fournis.

- **Nom de l'outil :** `list_directory`
- **Nom d'affichage :** ListFiles
- **Fichier :** `ls.ts`
- **Paramètres :**
  - `path` (chaîne de caractères, requis) : Le chemin absolu du répertoire à lister.
  - `ignore` (tableau de chaînes de caractères, optionnel) : Une liste de motifs glob à exclure de la liste (par exemple, `["*.log", ".git"]`).
  - `respect_git_ignore` (booléen, optionnel) : Indique s'il faut respecter les motifs `.gitignore` lors du listage des fichiers. Valeur par défaut : `true`.
- **Comportement :**
  - Retourne une liste de noms de fichiers et de répertoires.
  - Indique si chaque entrée est un répertoire.
  - Trie les entrées avec les répertoires en premier, puis par ordre alphabétique.
- **Sortie (`llmContent`) :** Une chaîne comme : `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmation :** Non.

## 2. `read_file` (ReadFile)

`read_file` lit et renvoie le contenu d’un fichier spécifié. Cet outil gère les fichiers texte, images (PNG, JPG, GIF, WEBP, SVG, BMP) et PDF. Pour les fichiers texte, il peut lire des plages de lignes spécifiques. Les autres types de fichiers binaires sont généralement ignorés.

- **Nom de l’outil :** `read_file`
- **Nom d'affichage :** ReadFile
- **Fichier :** `read-file.ts`
- **Paramètres :**
  - `path` (chaîne, requis) : Le chemin absolu du fichier à lire.
  - `offset` (nombre, optionnel) : Pour les fichiers texte, le numéro de ligne de départ basé sur 0. Nécessite que `limit` soit défini.
  - `limit` (nombre, optionnel) : Pour les fichiers texte, le nombre maximal de lignes à lire. S’il est omis, lit un maximum par défaut (par exemple, 2000 lignes) ou le fichier entier si possible.
- **Comportement :**
  - Pour les fichiers texte : Renvoie le contenu. Si `offset` et `limit` sont utilisés, renvoie uniquement cette portion de lignes. Indique si le contenu a été tronqué en raison des limites de lignes ou de longueur de ligne.
  - Pour les fichiers image et PDF : Renvoie le contenu du fichier sous forme d'une structure encodée en base64 adaptée à la consommation par le modèle.
  - Pour les autres fichiers binaires : Tente de les identifier et de les ignorer, en renvoyant un message indiquant qu’il s’agit d’un fichier binaire générique.
- **Sortie :** (`llmContent`) :
  - Pour les fichiers texte : Le contenu du fichier, éventuellement précédé d’un message de troncature (par exemple, `[Contenu du fichier tronqué : affichage des lignes 1-100 sur 500 lignes au total...]\nContenu réel du fichier...`).
  - Pour les fichiers image/PDF : Un objet contenant `inlineData` avec `mimeType` et les données encodées en base64 (par exemple, `{ inlineData: { mimeType: 'image/png', data: 'chaineencodéeenbase64' } }`).
  - Pour les autres fichiers binaires : Un message tel que `Impossible d'afficher le contenu du fichier binaire : /chemin/vers/données.bin`.
- **Confirmation :** Non.

## 3. `write_file` (WriteFile)

`write_file` écrit du contenu dans un fichier spécifié. Si le fichier existe, il sera écrasé. Si le fichier n'existe pas, il (ainsi que les répertoires parents nécessaires) sera créé.

- **Nom de l'outil :** `write_file`
- **Nom d'affichage :** WriteFile
- **Fichier :** `write-file.ts`
- **Paramètres :**
  - `file_path` (chaîne, requis) : Le chemin absolu du fichier dans lequel écrire.
  - `content` (chaîne, requis) : Le contenu à écrire dans le fichier.
- **Comportement :**
  - Écrit le `content` fourni dans le `file_path`.
  - Crée les répertoires parents s'ils n'existent pas.
- **Sortie (`llmContent`) :** Un message de succès, par exemple, `Successfully overwrote file: /path/to/your/file.txt` ou `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmation :** Oui. Affiche un diff des modifications et demande l'approbation de l'utilisateur avant d'écrire.

## 4. `glob` (Glob)

`glob` trouve les fichiers correspondant à des motifs glob spécifiques (par exemple, `src/**/*.ts`, `*.md`), renvoyant des chemins absolus triés par date de modification (les plus récents en premier).

- **Nom de l'outil :** `glob`
- **Nom d'affichage :** Glob
- **Fichier :** `glob.ts`
- **Paramètres :**
  - `pattern` (chaîne, requis) : Le motif glob à faire correspondre (par exemple, `"*.py"`, `"src/**/*.js"`).
  - `path` (chaîne, optionnel) : Le répertoire dans lequel effectuer la recherche. S'il n'est pas spécifié, le répertoire de travail actuel sera utilisé.
- **Comportement :**
  - Recherche des fichiers correspondant au motif glob dans le répertoire spécifié.
  - Renvoie une liste de chemins absolus, triés avec les fichiers modifiés le plus récemment en premier.
  - Respecte les motifs .gitignore et .qwenignore par défaut.
  - Limite les résultats à 100 fichiers pour éviter un débordement du contexte.
- **Sortie (`llmContent`) :** Un message comme : `Trouvé 5 fichier(s) correspondant à "*.ts" dans /chemin/vers/repertoire/recherche, trié(s) par date de modification (les plus récents en premier) :\n---\n/chemin/vers/fichier1.ts\n/chemin/vers/sous-repertoire/fichier2.ts\n---\n[95 fichiers tronqués] ...`
- **Confirmation :** Non.

## 5. `grep_search` (Grep)

`grep_search` recherche un motif d'expression régulière dans le contenu des fichiers d'un répertoire spécifié. Peut filtrer les fichiers par un motif glob. Retourne les lignes contenant des correspondances, ainsi que leurs chemins de fichier et numéros de ligne.

- **Nom de l'outil :** `grep_search`
- **Nom d'affichage :** Grep
- **Fichier :** `grep.ts` (avec `ripGrep.ts` comme solution de repli)
- **Paramètres :**
  - `pattern` (chaîne, requis) : Le motif d'expression régulière à rechercher dans le contenu des fichiers (ex. : `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (chaîne, optionnel) : Fichier ou répertoire dans lequel effectuer la recherche. Par défaut, il s'agit du répertoire de travail actuel.
  - `glob` (chaîne, optionnel) : Motif glob pour filtrer les fichiers (ex. : `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (nombre, optionnel) : Limite la sortie aux N premières lignes correspondantes. Optionnel – affiche toutes les correspondances si non spécifié.
- **Comportement :**
  - Utilise ripgrep pour une recherche rapide lorsqu'il est disponible ; sinon utilise une implémentation de recherche basée sur JavaScript.
  - Retourne les lignes correspondantes avec les chemins de fichier et les numéros de ligne.
  - Insensible à la casse par défaut.
  - Respecte les motifs présents dans .gitignore et .qwenignore.
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

### Exemples de `grep_search`

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

`edit` remplace du texte dans un fichier. Par défaut, il nécessite que `old_string` corresponde à un emplacement unique ; définissez `replace_all` sur `true` lorsque vous souhaitez intentionnellement modifier toutes les occurrences. Cet outil est conçu pour apporter des modifications précises et ciblées, et requiert un contexte important autour de `old_string` afin d'assurer qu'il modifie le bon emplacement.

- **Nom de l’outil :** `edit`
- **Nom affiché :** Modifier
- **Fichier :** `edit.ts`
- **Paramètres :**
  - `file_path` (chaîne de caractères, requis) : Le chemin absolu vers le fichier à modifier.
  - `old_string` (chaîne de caractères, requis) : Le texte littéral exact à remplacer.

    **IMPORTANT :** Cette chaîne doit identifier de manière unique l'instance à modifier. Elle doit inclure suffisamment de contexte autour du texte cible, en respectant précisément les espaces blancs et l'indentation. Si `old_string` est vide, l'outil tente de créer un nouveau fichier à `file_path` avec `new_string` comme contenu.

  - `new_string` (chaîne de caractères, requis) : Le texte littéral exact qui remplacera `old_string`.
  - `replace_all` (booléen, optionnel) : Remplacer toutes les occurrences de `old_string`. Valeur par défaut : `false`.

- **Comportement :**
  - Si `old_string` est vide et que `file_path` n'existe pas, crée un nouveau fichier avec `new_string` comme contenu.
  - Si `old_string` est fourni, lit le fichier `file_path` et tente de trouver une seule occurrence, sauf si `replace_all` vaut `true`.
  - Si la correspondance est unique (ou si `replace_all` vaut `true`), remplace le texte par `new_string`.
  - **Fiabilité améliorée (Correction multi-étapes) :** Pour améliorer significativement le taux de réussite des modifications, notamment lorsque la `old_string` fournie par le modèle n’est pas parfaitement précise, l’outil intègre un mécanisme de correction multi-étapes.
    - Si la `old_string` initiale n’est pas trouvée ou correspond à plusieurs endroits, l’outil peut utiliser le modèle Qwen pour raffiner de manière itérative `old_string` (et potentiellement `new_string`).
    - Ce processus d’auto-correction tente d’identifier le segment unique que le modèle souhaitait modifier, rendant ainsi l’opération `edit` plus robuste même avec un contexte initial légèrement imparfait.
- **Conditions d’échec :** Malgré le mécanisme de correction, l’outil échouera si :
  - `file_path` n’est pas absolu ou se trouve en dehors du répertoire racine.
  - `old_string` n’est pas vide mais `file_path` n’existe pas.
  - `old_string` est vide mais `file_path` existe déjà.
  - `old_string` n’est pas trouvé dans le fichier après les tentatives de correction.
  - `old_string` est trouvé à plusieurs endroits, `replace_all` est faux, et le mécanisme d’auto-correction ne parvient pas à résoudre cela en une correspondance unique et non ambiguë.
- **Sortie (`llmContent`) :**
  - En cas de succès : `Successfully modified file: /chemin/vers/fichier.txt (1 remplacements).` ou `Created new file: /chemin/vers/nouveau_fichier.txt with provided content.`
  - En cas d’échec : Un message d’erreur expliquant la raison (ex. : `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Confirmation :** Oui. Affiche un diff des changements proposés et demande l’approbation de l’utilisateur avant d’écrire dans le fichier.

Ces outils du système de fichiers fournissent une base permettant à Qwen Code de comprendre et d’interagir avec le contexte de votre projet local.
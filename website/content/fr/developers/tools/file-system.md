# Outils du système de fichiers Qwen Code

Qwen Code fournit une suite complète d’outils pour interagir avec le système de fichiers local. Ces outils permettent au modèle de lire, écrire, lister, rechercher et modifier des fichiers et des répertoires, entièrement sous votre contrôle, et généralement avec une confirmation pour les opérations sensibles.

> [!note]  
> Tous les outils du système de fichiers s’exécutent dans un `rootDirectory` (généralement le répertoire de travail courant depuis lequel vous avez lancé l’interface en ligne de commande) à des fins de sécurité. Les chemins que vous fournissez à ces outils doivent généralement être absolus ou sont résolus relativement à ce répertoire racine.

## 1. `list_directory` (Lister les fichiers)

`list_directory` liste les noms des fichiers et sous-répertoires situés directement dans un chemin de répertoire spécifié. Il peut éventuellement ignorer les entrées correspondant à des motifs glob fournis.

- **Nom de l’outil :** `list_directory`
- **Nom d’affichage :** Lister les fichiers
- **Fichier :** `ls.ts`
- **Paramètres :**
  - `path` (chaîne de caractères, requis) : Le chemin absolu du répertoire à lister.
  - `ignore` (tableau de chaînes de caractères, facultatif) : Une liste de motifs glob à exclure de la liste (par exemple, `["*.log", ".git"]`).
  - `respect_git_ignore` (booléen, facultatif) : Indique si les motifs définis dans `.gitignore` doivent être respectés lors de la liste des fichiers. Valeur par défaut : `true`.
- **Comportement :**
  - Renvoie une liste des noms de fichiers et de répertoires.
  - Indique si chaque entrée est un répertoire.
  - Trie les entrées en plaçant d’abord les répertoires, puis effectue un tri alphabétique.
- **Sortie (`llmContent`) :** Une chaîne de caractères telle que : `Liste des éléments du répertoire /chemin/vers/votre/dossier :\n[DIR] sous-dossier1\nfichier1.txt\nfichier2.png`
- **Confirmation :** Non

## 2. `read_file` (ReadFile)

`read_file` lit et renvoie le contenu d’un fichier spécifié. Cet outil gère les fichiers texte ainsi que les fichiers multimédias (images, PDF, audio, vidéo) dont la modalité est prise en charge par le modèle actuel. Pour les fichiers texte, il peut lire des plages de lignes spécifiques. Les fichiers multimédias dont la modalité n’est pas prise en charge par le modèle actuel sont rejetés avec un message d’erreur explicite. Les autres types de fichiers binaires sont généralement ignorés.

- **Nom de l’outil :** `read_file`
- **Nom affiché :** ReadFile
- **Fichier :** `read-file.ts`
- **Paramètres :**
  - `path` (chaîne de caractères, requis) : Le chemin absolu du fichier à lire.
  - `offset` (nombre, facultatif) : Pour les fichiers texte, le numéro de ligne (indexé à partir de zéro) à partir duquel commencer la lecture. Nécessite que `limit` soit également défini.
  - `limit` (nombre, facultatif) : Pour les fichiers texte, le nombre maximal de lignes à lire. Si omis, lit un maximum par défaut (par exemple, 2000 lignes) ou l’intégralité du fichier si cela est possible.
- **Comportement :**
  - Pour les fichiers texte : Renvoie le contenu. Si `offset` et `limit` sont utilisés, ne renvoie que cette portion de lignes. Indique clairement si le contenu a été tronqué en raison d’une limite sur le nombre de lignes ou sur la longueur des lignes.
  - Pour les fichiers multimédias (images, PDF, audio, vidéo) : Si la modalité du fichier est prise en charge par le modèle actuel, renvoie le contenu sous forme d’un objet `inlineData` encodé en base64. Si la modalité n’est pas prise en charge, renvoie un message d’erreur accompagné de recommandations (par exemple, suggestions de compétences ou d’outils externes).
  - Pour les autres fichiers binaires : Tente de les identifier et de les ignorer, en renvoyant un message indiquant qu’il s’agit d’un fichier binaire générique.
- **Sortie :** (`llmContent`)
  - Pour les fichiers texte : Le contenu du fichier, éventuellement précédé d’un message de troncature (par exemple, `[Contenu du fichier tronqué : affichage des lignes 1 à 100 sur 500 lignes au total…]\nContenu réel du fichier…`).
  - Pour les fichiers multimédias pris en charge : Un objet contenant `inlineData`, avec les champs `mimeType` et `data` encodé en base64 (par exemple, `{ inlineData: { mimeType: 'image/png', data: 'chaîneencodéeenbase64' } }`).
  - Pour les fichiers multimédias non pris en charge : Une chaîne de caractères décrivant l’absence de prise en charge de cette modalité par le modèle actuel, accompagnée de suggestions d’alternatives.
  - Pour les autres fichiers binaires : Un message tel que `Impossible d’afficher le contenu du fichier binaire : /chemin/vers/data.bin`.
- **Confirmation :** Aucune.

## 3. `write_file` (WriteFile)

La fonction `write_file` écrit du contenu dans un fichier spécifié. Si le fichier existe déjà, il est écrasé. Si le fichier n’existe pas, celui-ci (ainsi que tous les répertoires parents nécessaires) est créé.

- **Nom de l’outil :** `write_file`
- **Nom affiché :** WriteFile
- **Fichier :** `write-file.ts`
- **Paramètres :**
  - `file_path` (chaîne de caractères, requis) : Le chemin absolu du fichier à écrire.
  - `content` (chaîne de caractères, requis) : Le contenu à écrire dans le fichier.
- **Comportement :**
  - Écrit le `content` fourni au chemin `file_path`.
  - Crée les répertoires parents s’ils n’existent pas.
- **Résultat (`llmContent`) :** Un message de réussite, par exemple `Fichier écrasé avec succès : /chemin/vers/votre/fichier.txt` ou `Fichier nouvellement créé et écrit avec succès : /chemin/vers/nouveau/fichier.txt`.
- **Confirmation :** Oui. Affiche un diff des modifications et demande l’approbation de l’utilisateur avant d’écrire.

## 4. `glob` (Glob)

`glob` recherche les fichiers correspondant à des motifs glob spécifiques (par exemple, `src/**/*.ts`, `*.md`) et renvoie leurs chemins absolus triés par date de modification (le plus récent en premier).

- **Nom de l’outil :** `glob`
- **Nom d’affichage :** Glob
- **Fichier :** `glob.ts`
- **Paramètres :**
  - `pattern` (chaîne de caractères, requis) : Le motif glob à faire correspondre (par exemple, `"*.py"`, `"src/**/*.js"`).
  - `path` (chaîne de caractères, facultatif) : Le répertoire dans lequel effectuer la recherche. Si non spécifié, le répertoire de travail actuel est utilisé.
- **Comportement :**
  - Recherche les fichiers correspondant au motif glob dans le répertoire spécifié.
  - Renvoie une liste de chemins absolus, triée avec les fichiers les plus récemment modifiés en premier.
  - Prend en compte par défaut les motifs définis dans les fichiers `.gitignore` et `.qwenignore`.
  - Limite les résultats à 100 fichiers afin d’éviter un débordement de contexte.
- **Sortie (`llmContent`) :** Un message tel que : `5 fichier(s) trouvé(s) correspondant à "*.ts" dans /chemin/vers/repertoire/de/recherche, triés par date de modification (le plus récent en premier) :\n---\n/chemin/vers/fichier1.ts\n/chemin/vers/sous-repertoire/fichier2.ts\n---\n[95 fichiers tronqués] ...`
- **Confirmation :** Non.

## 5. `grep_search` (Grep)

La fonction `grep_search` recherche un motif d’expression régulière dans le contenu des fichiers d’un répertoire spécifié. Elle permet de filtrer les fichiers à l’aide d’un motif glob. Elle renvoie les lignes contenant des correspondances, accompagnées de leur chemin de fichier et de leur numéro de ligne.

- **Nom de l’outil :** `grep_search`
- **Nom affiché :** Grep
- **Fichier :** `grep.ts` (avec `ripGrep.ts` comme solution de secours)
- **Paramètres :**
  - `pattern` (chaîne de caractères, requis) : Le motif d’expression régulière à rechercher dans le contenu des fichiers (par exemple `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (chaîne de caractères, facultatif) : Fichier ou répertoire dans lequel effectuer la recherche. Par défaut, le répertoire de travail courant.
  - `glob` (chaîne de caractères, facultatif) : Motif glob permettant de filtrer les fichiers (par exemple `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (nombre, facultatif) : Limite le résultat aux N premières lignes correspondantes. Facultatif — affiche toutes les correspondances si non spécifié.
- **Comportement :**
  - Utilise ripgrep pour une recherche rapide lorsqu’il est disponible ; sinon, se rabat sur une implémentation JavaScript de recherche.
  - Renvoie les lignes correspondantes avec leurs chemins de fichier et numéros de ligne.
  - Insensible à la casse par défaut.
  - Prend en compte les motifs définis dans les fichiers `.gitignore` et `.qwenignore`.
  - Limite la sortie afin d’éviter un débordement de contexte.
- **Sortie (`llmContent`) :** Une chaîne de caractères formatée listant les correspondances, par exemple :

  ```
  Trouvé 3 correspondances pour le motif "myFunction" dans le chemin "." (filtre : "*.ts") :
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lignes tronquées] ...
  ```

- **Confirmation :** Non

### Exemples de `grep_search`

Rechercher un motif avec la limitation par défaut du nombre de résultats :

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Rechercher un motif avec une limitation personnalisée du nombre de résultats :

```
grep_search(pattern="function", path="src", limit=50)
```

Rechercher un motif avec filtrage des fichiers et limitation personnalisée du nombre de résultats :

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Modifier)

`edit` remplace du texte dans un fichier. Par défaut, il exige que `old_string` corresponde à un emplacement unique et précis ; définissez `replace_all` sur `true` si vous souhaitez délibérément remplacer toutes les occurrences. Cet outil est conçu pour des modifications précises et ciblées, et nécessite un contexte important autour de `old_string` afin de garantir qu’il modifie bien l’emplacement souhaité.

- **Nom de l’outil :** `edit`
- **Nom affiché :** Modifier
- **Fichier :** `edit.ts`
- **Paramètres :**
  - `file_path` (chaîne de caractères, requis) : Le chemin absolu du fichier à modifier.
  - `old_string` (chaîne de caractères, requis) : Le texte littéral exact à remplacer.

    **CRITIQUE :** Cette chaîne doit identifier de façon unique la seule occurrence à modifier. Elle doit inclure suffisamment de contexte autour du texte cible, en respectant scrupuleusement les espaces et l’indentation. Si `old_string` est vide, l’outil tente de créer un nouveau fichier à l’emplacement `file_path`, dont le contenu sera `new_string`.

  - `new_string` (chaîne de caractères, requis) : Le texte littéral exact qui remplacera `old_string`.
  - `replace_all` (booléen, facultatif) : Remplace toutes les occurrences de `old_string`. Valeur par défaut : `false`.

- **Comportement :**
  - Si `old_string` est vide et que `file_path` n’existe pas, crée un nouveau fichier contenant `new_string`.
  - Si `old_string` est fourni, l’outil lit le fichier désigné par `file_path` et tente d’y trouver une seule occurrence, sauf si `replace_all` vaut `true`.
  - Si la correspondance est unique (ou si `replace_all` vaut `true`), le texte est remplacé par `new_string`.
  - **Fiabilité renforcée (correction itérative des modifications) :** Afin d’améliorer significativement le taux de réussite des modifications — notamment lorsque `old_string` fourni par le modèle pourrait ne pas être parfaitement précis — cet outil intègre un mécanisme de correction itérative en plusieurs étapes.
    - Si `old_string` initial n’est pas trouvé ou correspond à plusieurs emplacements, l’outil peut solliciter le modèle Qwen pour affiner itérativement `old_string` (et éventuellement `new_string`).
    - Ce processus d’autocorrection cherche à identifier le segment unique que le modèle entendait modifier, rendant ainsi l’opération `edit` plus robuste même avec un contexte initial légèrement imprécis.
- **Cas d’échec :** Malgré ce mécanisme de correction, l’outil échoue si :
  - `file_path` n’est pas absolu ou se trouve en dehors du répertoire racine.
  - `old_string` n’est pas vide, mais le fichier `file_path` n’existe pas.
  - `old_string` est vide, mais le fichier `file_path` existe déjà.
  - `old_string` n’est pas trouvé dans le fichier, même après les tentatives de correction.
  - `old_string` est trouvé plusieurs fois, `replace_all` vaut `false`, et le mécanisme d’autocorrection ne parvient pas à résoudre l’ambiguïté en une correspondance unique et non équivoque.
- **Sortie (`llmContent`) :**
  - En cas de succès : `Fichier modifié avec succès : /chemin/vers/fichier.txt (1 remplacement).` ou `Fichier créé : /chemin/vers/nouveau_fichier.txt avec le contenu fourni.`
  - En cas d’échec : Un message d’erreur expliquant la cause (ex. : `Échec de la modification : 0 occurrence trouvée…`, `Échec de la modification car le texte correspond à plusieurs emplacements…`).
- **Confirmation :** Oui. Affiche une comparaison (diff) des modifications proposées et demande l’approbation explicite de l’utilisateur avant d’écrire dans le fichier.

Ces outils système de fichiers constituent la base permettant à Qwen Code de comprendre et d’interagir avec le contexte local de votre projet.
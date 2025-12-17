# Ignorer des fichiers

Ce document fournit une vue d'ensemble de la fonctionnalité Qwen Ignore (`.qwenignore`) de Qwen Code.

Qwen Code inclut la capacité d'ignorer automatiquement des fichiers, de manière similaire à `.gitignore` (utilisé par Git). Ajouter des chemins à votre fichier `.qwenignore` les exclura des outils qui prennent en charge cette fonctionnalité, bien qu'ils resteront visibles pour d'autres services (comme Git).

## Fonctionnement

Lorsque vous ajoutez un chemin à votre fichier `.qwenignore`, les outils qui respectent ce fichier excluront automatiquement les fichiers et répertoires correspondants de leurs opérations. Par exemple, lorsque vous utilisez la commande [`read_many_files`](../../developers/tools/multi-file), tous les chemins présents dans votre fichier `.qwenignore` seront automatiquement exclus.

Dans l'ensemble, `.qwenignore` suit les conventions des fichiers `.gitignore` :

- Les lignes vides et les lignes commençant par `#` sont ignorées.
- Les motifs glob standards sont pris en charge (comme `*`, `?`, et `[]`).
- Ajouter un `/` à la fin ne fera correspondre que les répertoires.
- Placer un `/` au début ancre le chemin par rapport au fichier `.qwenignore`.
- `!` inverse un motif.

Vous pouvez modifier votre fichier `.qwenignore` à tout moment. Pour appliquer les changements, vous devez redémarrer votre session Qwen Code.

## Comment utiliser `.qwenignore`

| Étape                     | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| **Activer .qwenignore**   | Créez un fichier nommé `.qwenignore` dans le répertoire racine de votre projet |
| **Ajouter des règles d'ignorance** | Ouvrez le fichier `.qwenignore` et ajoutez les chemins à ignorer, exemple : `/archive/` ou `apikeys.txt` |

### Exemples de `.qwenignore`

Vous pouvez utiliser `.qwenignore` pour ignorer des répertoires et des fichiers :

```

# Exclure votre répertoire /packages/ et tous ses sous-répertoires
/packages/

# Exclure votre fichier apikeys.txt
apikeys.txt
```

Vous pouvez utiliser des caractères génériques dans votre fichier `.qwenignore` avec `*` :

```

# Exclure tous les fichiers .md
*.md
```

Enfin, vous pouvez exclure des fichiers et des répertoires de l'exclusion avec `!` :

```

# Exclure tous les fichiers .md sauf README.md
*.md
!README.md
```

Pour supprimer des chemins de votre fichier `.qwenignore`, supprimez les lignes concernées.
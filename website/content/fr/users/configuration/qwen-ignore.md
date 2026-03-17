# Ignorer des fichiers

Ce document présente la fonctionnalité « Qwen Ignore » (fichier `.qwenignore`) de Qwen Code.

Qwen Code permet d’ignorer automatiquement des fichiers, de façon similaire au fichier `.gitignore` (utilisé par Git). L’ajout de chemins dans votre fichier `.qwenignore` les exclut des outils prenant en charge cette fonctionnalité, bien qu’ils restent visibles pour d’autres services (tels que Git).

## Fonctionnement

Lorsque vous ajoutez un chemin à votre fichier `.qwenignore`, les outils qui prennent en compte ce fichier excluent automatiquement les fichiers et répertoires correspondants de leurs opérations. Par exemple, lorsque vous utilisez la commande [`read_many_files`](../../developers/tools/multi-file), tous les chemins figurant dans votre fichier `.qwenignore` sont automatiquement exclus.

Pour l’essentiel, le fichier `.qwenignore` suit les conventions des fichiers `.gitignore` :

- Les lignes vides et celles commençant par `#` sont ignorées.
- Les motifs glob standards sont pris en charge (par exemple `*`, `?` et `[]`).
- Placer un `/` à la fin d’un motif ne fait correspondre que les répertoires.
- Placer un `/` au début d’un motif ancre le chemin par rapport à l’emplacement du fichier `.qwenignore`.
- Le caractère `!` inverse le sens d’un motif (exclusion → inclusion).

Vous pouvez mettre à jour votre fichier `.qwenignore` à tout moment. Pour appliquer les modifications, vous devez redémarrer votre session Qwen Code.

## Comment utiliser le fichier `.qwenignore`

| Étape                   | Description                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **Activer `.qwenignore`** | Créez un fichier nommé `.qwenignore` dans le répertoire racine de votre projet         |
| **Ajouter des règles d’ignorance** | Ouvrez le fichier `.qwenignore` et ajoutez les chemins à ignorer, par exemple : `/archive/` ou `apikeys.txt` |

### Exemples de fichiers `.qwenignore`

Vous pouvez utiliser `.qwenignore` pour ignorer des répertoires et des fichiers :

```
# Ignorer le répertoire /packages/ et tous ses sous-répertoires
/packages/

# Ignorer le fichier apikeys.txt
apikeys.txt
```

Vous pouvez utiliser des caractères génériques (`*`) dans votre fichier `.qwenignore` :

```
# Ignorer tous les fichiers .md
*.md
```

Enfin, vous pouvez annuler l'ignorance de fichiers ou de répertoires à l'aide du caractère `!` :

```
# Exclure tous les fichiers `.md` sauf `README.md`
*.md
!README.md
```

Pour supprimer des chemins de votre fichier `.qwenignore`, supprimez les lignes correspondantes.
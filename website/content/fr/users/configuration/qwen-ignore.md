# Ignorer des fichiers

Ce document présente la fonctionnalité Qwen Ignore (`.qwenignore`) de Qwen Code.

Qwen Code permet d'ignorer automatiquement des fichiers, de manière similaire à `.gitignore` (utilisé par Git). L'ajout de chemins à votre fichier `.qwenignore` les exclura des outils prenant en charge cette fonctionnalité, bien qu'ils restent visibles pour d'autres services (comme Git).

## Fonctionnement

Lorsque vous ajoutez un chemin à votre fichier `.qwenignore`, les outils respectant ce fichier excluront les fichiers et répertoires correspondants de leurs opérations. Par exemple, lorsque vous utilisez la commande [`read_many_files`](../../developers/tools/multi-file), tous les chemins présents dans votre fichier `.qwenignore` seront automatiquement exclus.

Dans l'ensemble, `.qwenignore` suit les conventions des fichiers `.gitignore` :

- Les lignes vides et les lignes commençant par `#` sont ignorées.
- Les motifs glob standards sont pris en charge (tels que `*`, `?` et `[]`).
- Ajouter un `/` à la fin ne correspondra qu'aux répertoires.
- Ajouter un `/` au début ancre le chemin par rapport au fichier `.qwenignore`.
- `!` inverse un motif.

Vous pouvez mettre à jour votre fichier `.qwenignore` à tout moment. Pour appliquer les modifications, vous devez redémarrer votre session Qwen Code.

## Utiliser `.qwenignore`

| Étape                  | Description                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Activer .qwenignore** | Créez un fichier nommé `.qwenignore` dans le répertoire racine de votre projet                       |
| **Ajouter des règles d'exclusion**   | Ouvrez le fichier `.qwenignore` et ajoutez les chemins à ignorer, par exemple : `/archive/` ou `apikeys.txt` |

### Exemples `.qwenignore`

Vous pouvez utiliser `.qwenignore` pour ignorer des répertoires et des fichiers :

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

Vous pouvez utiliser des caractères génériques dans votre fichier `.qwenignore` avec `*` :

```
# Exclude all .md files
*.md
```

Enfin, vous pouvez annuler l'exclusion de fichiers et de répertoires avec `!` :

```
# Exclude all .md files except README.md
*.md
!README.md
```

Pour supprimer des chemins de votre fichier `.qwenignore`, supprimez les lignes correspondantes.
# Ignorer des fichiers

Ce document fournit un aperçu de la fonctionnalité Qwen Ignore (`.qwenignore`) de Qwen Code.

Qwen Code inclut la capacité d'ignorer automatiquement des fichiers, similaire à `.gitignore` (utilisé par Git). L'ajout de chemins dans votre fichier `.qwenignore` les exclura des outils prenant en charge cette fonctionnalité, bien qu'ils restent visibles pour d'autres services (tels que Git).

## Fonctionnement

Lorsque vous ajoutez un chemin dans votre fichier `.qwenignore`, les outils qui respectent ce fichier excluront les fichiers et répertoires correspondants de leurs opérations. Par exemple, lorsque vous utilisez la commande [`read_many_files`](../../developers/tools/multi-file), tous les chemins présents dans votre fichier `.qwenignore` seront automatiquement exclus.

Pour la plupart, `.qwenignore` suit les conventions des fichiers `.gitignore` :

- Les lignes vides et les lignes commençant par `#` sont ignorées.
- Les motifs glob standard sont pris en charge (tels que `*`, `?` et `[]`).
- Placer un `/` à la fin ne correspondra qu'aux répertoires.
- Placer un `/` au début ancre le chemin par rapport au fichier `.qwenignore`.
- `!` inverse un motif.

Vous pouvez modifier votre fichier `.qwenignore` à tout moment. Pour appliquer les modifications, vous devez redémarrer votre session Qwen Code.

## Comment utiliser `.qwenignore`

| Étape                  | Description                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Activer .qwenignore** | Créez un fichier nommé `.qwenignore` dans le répertoire racine de votre projet         |
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

Enfin, vous pouvez exclure des fichiers et répertoires de l'exclusion avec `!` :

# Exclure tous les fichiers .md sauf README.md
*.md
!README.md
```

Pour supprimer des chemins de votre fichier `.qwenignore`, supprimez les lignes correspondantes.
# Ignorer des fichiers

Ce document fournit un aperçu de la fonctionnalité Gemini Ignore (`.geminiignore`) de Qwen Code.

Qwen Code inclut la possibilité d'ignorer automatiquement des fichiers, de manière similaire à `.gitignore` (utilisé par Git) et `.aiexclude` (utilisé par Gemini Code Assist). Ajouter des chemins à votre fichier `.geminiignore` les exclura des outils qui prennent en charge cette fonctionnalité, bien qu'ils resteront visibles pour d'autres services (comme Git).

## Fonctionnement

Lorsque vous ajoutez un chemin à votre fichier `.geminiignore`, les outils qui respectent ce fichier excluront automatiquement les fichiers et répertoires correspondants de leurs opérations. Par exemple, lorsque vous utilisez la commande [`read_many_files`](./tools/multi-file.md), tous les chemins présents dans votre fichier `.geminiignore` seront automatiquement exclus.

Dans l'ensemble, `.geminiignore` suit les conventions des fichiers `.gitignore` :

- Les lignes vides et les lignes commençant par `#` sont ignorées.
- Les motifs glob standards sont pris en charge (comme `*`, `?`, et `[]`).
- Ajouter un `/` à la fin ne correspondra qu'aux répertoires.
- Placer un `/` au début ancre le chemin par rapport au fichier `.geminiignore`.
- `!` inverse un motif (négation).

Vous pouvez modifier votre fichier `.geminiignore` à tout moment. Pour appliquer les changements, vous devez redémarrer votre session Qwen Code.

## Comment utiliser `.geminiignore`

Pour activer `.geminiignore` :

1. Créez un fichier nommé `.geminiignore` à la racine de votre répertoire de projet.

Pour ajouter un fichier ou un répertoire à `.geminiignore` :

1. Ouvrez votre fichier `.geminiignore`.
2. Ajoutez le chemin ou le fichier que vous souhaitez ignorer, par exemple : `/archive/` ou `apikeys.txt`.

### Exemples de `.geminiignore`

Vous pouvez utiliser `.geminiignore` pour ignorer des répertoires et des fichiers :

```

# Exclure votre répertoire /packages/ et tous ses sous-répertoires
/packages/

# Exclure votre fichier apikeys.txt
apikeys.txt
```

Vous pouvez utiliser des wildcards dans votre fichier `.geminiignore` avec `*` :

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

Pour supprimer des chemins de votre fichier `.geminiignore`, supprimez les lignes concernées.
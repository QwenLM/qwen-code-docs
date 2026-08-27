# Ignorer des fichiers

Ce document fournit un aperçu de la fonctionnalité Qwen Ignore (`.qwenignore`) de Qwen Code. Qwen Code reconnaît également les fichiers d'ignorance personnalisés configurés via `context.fileFiltering.customIgnoreFiles`, qui par défaut correspond aux fichiers de compatibilité `.agentignore` et `.aiignore`.

Qwen Code inclut la possibilité d'ignorer automatiquement des fichiers, similaire à `.gitignore` (utilisé par Git). Ajouter des chemins dans `.qwenignore` ou dans un fichier d'ignorance personnalisé configuré les exclura des outils qui prennent en charge cette fonctionnalité, bien qu'ils restent visibles pour d'autres services (comme Git).

## Fonctionnement

Lorsque vous ajoutez un chemin à l'un de ces fichiers d'ignorance, les outils qui respectent les règles d'ignorance de Qwen excluront les fichiers et dossiers correspondants de leurs opérations. Par exemple, lorsque vous utilisez la commande [`read_many_files`](../../developers/tools/multi-file), tous les chemins présents dans `.qwenignore` ou dans les fichiers d'ignorance personnalisés configurés seront automatiquement exclus.

Pour l'essentiel, ces fichiers d'ignorance suivent les conventions des fichiers `.gitignore` :

- Les lignes vides et les lignes commençant par `#` sont ignorées.
- Les motifs glob standard sont pris en charge (tels que `*`, `?` et `[]`).
- Un `/` à la fin correspond uniquement aux dossiers.
- Un `/` au début ancre le chemin par rapport au fichier d'ignorance.
- `!` annule un motif.

Vous pouvez mettre à jour ces fichiers d'ignorance à tout moment. Pour appliquer les modifications, vous devez redémarrer votre session Qwen Code.

## Comment utiliser les fichiers d'ignorance

| Étape                    | Description                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Activer les règles**   | Créez `.qwenignore`, un fichier personnalisé par défaut (`.agentignore` / `.aiignore`), ou un fichier d'ignorance personnalisé configuré dans le répertoire racine de votre projet |
| **Ajouter des règles**   | Ouvrez le fichier d'ignorance et ajoutez les chemins à ignorer, exemple : `/archive/` ou `apikeys.txt`                                        |

Par défaut, Qwen Code lit `.qwenignore`, `.agentignore` et `.aiignore`.
Pour utiliser un autre fichier d'ignorance personnalisé, configurez :

```json
{
  "context": {
    "fileFiltering": {
      "customIgnoreFiles": [".cursorignore"]
    }
  }
}
```

`.qwenignore` est toujours inclus lorsque `context.fileFiltering.respectQwenIgnore`
est activé. Les chemins des fichiers d'ignorance personnalisés sont relatifs à la racine du projet.

### Exemples de fichiers d'ignorance

Vous pouvez utiliser n'importe quel fichier d'ignorance pris en charge pour ignorer des dossiers et fichiers :

```
# Exclure le dossier /packages/ et tous ses sous-dossiers
/packages/

# Exclure le fichier apikeys.txt
apikeys.txt
```

Vous pouvez utiliser des caractères génériques dans votre fichier d'ignorance avec `*` :

```
# Exclure tous les fichiers .md
*.md
```

Enfin, vous pouvez exclure des fichiers et dossiers de l'exclusion avec `!` :

```
# Exclure tous les fichiers .md sauf README.md
*.md
!README.md
```

Pour supprimer des chemins d'un fichier d'ignorance, supprimez les lignes correspondantes.
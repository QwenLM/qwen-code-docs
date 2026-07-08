# Simulation du suivi de l'historique des fichiers pour `sed -i`

## Résumé

Prend en charge l'élément B1 restant de l'issue #4204 en traitant une classe restreinte de commandes shell `sed -i 's/pattern/replacement/flags' file` comme des modifications de fichiers plutôt que comme des exécutions shell opaques.

Le chemin simulé prévisualise la modification exacte du texte dans l'interface de confirmation d'édition standard, enregistre le fichier cible avec `FileHistoryService.trackEdit()`, écrit via `FileSystemService.writeTextFile()`, et évite de lancer un shell. Cela permet à `/rewind` de capturer les modifications in-place pilotées par le shell, qui sont courantes dans les workflows d'agents.

## Périmètre

Seules les substitutions in-place simples sont simulées :

- `sed -i 's/foo/bar/' file`
- `sed -i '' -E 's/foo|bar/baz/g' file`
- `sed -i -e 's/foo/bar/' file`

Les commandes ne sont pas simulées lorsqu'elles incluent des opérateurs shell composés, des globs, plusieurs fichiers, des substitutions de commandes, des références à des variables shell dans l'expression sed, des chemins de fichiers avec expansion de variables, des suffixes de sauvegarde tels que `-i.bak`, des flags sed non supportés, des expressions sed non supportées, ou une exécution en arrière-plan. Ces cas conservent le comportement d'exécution shell existant.

Les flags de substitution supportés sont intentionnellement limités à `g` et aux occurrences numériques. Les flags qui peuvent affecter stdout ou avoir un comportement sed spécifique à une plateforme, tels que `p`, `I` et `M`, rebasculent vers le chemin shell. Les wrappers shell préfixés par un environnement rebasculent également afin que les changements de locale ou d'environnement ne puissent pas être ignorés silencieusement par le simulateur.

## Comportement

La confirmation lit le fichier cible, applique la substitution analysée en mémoire, et retourne `ToolEditConfirmationDetails` avec un diff de fichier standard.

L'exécution relit le fichier avant l'écriture. Si le contenu du fichier diffère de celui utilisé pour la confirmation, l'exécution rejette avec `FILE_CHANGED_SINCE_READ` au lieu d'écrire une modification que l'utilisateur n'a pas approuvée.

Si la prévisualisation du fichier échoue, la commande est confirmée et exécutée via le chemin shell existant au lieu d'être simulée.

La confirmation masque les actions de modification de l'éditeur externe car ShellTool n'est pas un outil d'édition de fichier modifiable généraliste. Si un IDE ou un hôte retourne une payload `newContent` inline lors de l'approbation du diff, le chemin sed simulé écrit ce contenu approuvé après la même protection contre le contenu obsolète.

Avant l'écriture, l'exécution appelle `FileHistoryService.trackEdit(filePath)` afin que le snapshot de l'historique des fichiers du tour actuel capture une sauvegarde pré-édition. L'appel à l'historique des fichiers est best-effort et ne bloque jamais l'édition. L'écriture elle-même utilise `FileSystemService.writeTextFile()` avec les métadonnées de lecture afin que le comportement d'encodage, de BOM et de fin de ligne reste aligné avec les outils Edit et WriteFile.

## Compatibilité

Aucun changement de schéma persisté n'est nécessaire. Il s'agit simplement d'une autre source d'éditions de fichiers suivies à l'intérieur d'un snapshot existant. Les commandes shell non supportées continuent d'emprunter le chemin shell existant, ce qui ne modifie pas la sémantique shell générique.

## Hors périmètre

Le suivi générique des mutations shell reste reporté. Les commandes comme `perl -pi`, `python -c`, `awk`, `cat > file`, `mv`, les scripts arbitraires et les invocations `sed` multi-fichiers ne sont pas simulées. Elles nécessitent une analyse plus large des effets du shell que claude-code ne supporte pas aujourd'hui et qui sort du cadre de B1.
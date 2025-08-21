# Memory Import Processor

Le Memory Import Processor est une fonctionnalité qui vous permet de modulariser vos fichiers de contexte (par exemple, `QWEN.md`) en important du contenu depuis d'autres fichiers en utilisant la syntaxe `@file.md`.

## Aperçu

Cette fonctionnalité vous permet de découper des fichiers de contexte volumineux (par exemple, `QWEN.md`) en composants plus petits et plus faciles à gérer, qui peuvent être réutilisés dans différents contextes. Le processeur d'import prend en charge à la fois les chemins relatifs et absolus, avec des fonctionnalités de sécurité intégrées pour éviter les imports circulaires et garantir la sécurité d'accès aux fichiers.

## Syntaxe

Utilisez le symbole `@` suivi du chemin vers le fichier que vous souhaitez importer :

```markdown

# Fichier principal QWEN.md

Ceci est le contenu principal.

@./components/instructions.md

Plus de contenu ici.

@./shared/configuration.md
```

## Formats de chemin pris en charge

### Chemins relatifs

- `@./file.md` - Import depuis le même répertoire
- `@../file.md` - Import depuis le répertoire parent
- `@./components/file.md` - Import depuis un sous-répertoire

### Chemins absolus

- `@/absolute/path/to/file.md` - Importer en utilisant un chemin absolu

## Exemples

### Import basique

```markdown

# My QWEN.md

Bienvenue dans mon projet !

@./getting-started.md

## Fonctionnalités

@./features/overview.md
```

### Imports imbriqués

Les fichiers importés peuvent eux-mêmes contenir des imports, créant ainsi une structure imbriquée :

```markdown

# main.md

@./header.md
@./content.md
@./footer.md
```

```markdown

# header.md

# En-tête du projet

@./shared/title.md
```

## Fonctionnalités de sécurité

### Détection des imports circulaires

Le processeur détecte automatiquement et empêche les imports circulaires :

```markdown

# file-a.md

@./file-b.md

# file-b.md

@./file-a.md <!-- Ceci sera détecté et empêché -->
```

### Sécurité d'accès aux fichiers

La fonction `validateImportPath` garantit que les imports ne sont autorisés que depuis des répertoires spécifiés, empêchant l'accès à des fichiers sensibles en dehors de la portée autorisée.

### Profondeur d'importation maximale

Pour éviter les récursions infinies, il existe une profondeur d'importation maximale configurable (par défaut : 5 niveaux).

## Gestion des erreurs

### Fichiers manquants

Si un fichier référencé n'existe pas, l'importation échouera proprement avec un commentaire d'erreur dans la sortie.

### Erreurs d'accès aux fichiers

Les problèmes de permissions ou autres erreurs du système de fichiers sont gérés proprement avec des messages d'erreur appropriés.

## Détection des régions de code

Le processeur d'importation utilise la bibliothèque `marked` pour détecter les blocs de code et les portions de code en ligne, garantissant que les imports `@` à l'intérieur de ces régions sont correctement ignorés. Cela permet une gestion robuste des blocs de code imbriqués et des structures Markdown complexes.

## Structure de l'Arbre d'Importation

Le processeur retourne un arbre d'importation qui montre la hiérarchie des fichiers importés. Cela aide les utilisateurs à déboguer les problèmes avec leurs fichiers de contexte en montrant quels fichiers ont été lus et leurs relations d'importation.

Exemple de structure d'arbre :

```
 Memory Files
 L project: QWEN.md
            L a.md
              L b.md
                L c.md
              L d.md
                L e.md
                  L f.md
            L included.md
```

L'arbre préserve l'ordre dans lequel les fichiers ont été importés et montre la chaîne d'importation complète à des fins de débogage.

## Comparaison avec l'approche `/memory` de Claude Code (`claude.md`)

La fonctionnalité `/memory` de Claude Code (comme vu dans `claude.md`) produit un document plat et linéaire en concaténant tous les fichiers inclus, en marquant toujours les limites des fichiers avec des commentaires clairs et des noms de chemins. Elle ne présente pas explicitement la hiérarchie d'importation, mais le LLM reçoit tous les contenus et chemins des fichiers, ce qui suffit pour reconstruire la hiérarchie si nécessaire.

Note : L'arbre d'importation est principalement utile pour la clarté pendant le développement et a une pertinence limitée pour la consommation par le LLM.

## Référence API

### `processImports(content, basePath, debugMode?, importState?)`

Traite les instructions d'import dans le contenu d'un fichier de contexte.

**Paramètres :**

- `content` (string) : Le contenu à traiter pour les imports
- `basePath` (string) : Le chemin du répertoire où se trouve le fichier courant
- `debugMode` (boolean, optional) : Active ou non le logging de debug (par défaut : false)
- `importState` (ImportState, optional) : État de suivi pour prévenir les imports circulaires

**Retourne :** Promise<ProcessImportsResult> - Objet contenant le contenu traité et l'arbre des imports

### `ProcessImportsResult`

```typescript
interface ProcessImportsResult {
  content: string; // Le contenu traité avec les imports résolus
  importTree: MemoryFile; // Structure arborescente montrant la hiérarchie des imports
}
```

### `MemoryFile`

```typescript
interface MemoryFile {
  path: string; // Le chemin du fichier
  imports?: MemoryFile[]; // Imports directs, dans l'ordre où ils ont été importés
}
```

### `validateImportPath(importPath, basePath, allowedDirectories)`

Valide les chemins d'import pour s'assurer qu'ils sont sûrs et situés dans les répertoires autorisés.

**Paramètres :**

- `importPath` (string) : Le chemin d'import à valider
- `basePath` (string) : Le répertoire de base pour résoudre les chemins relatifs
- `allowedDirectories` (string[]) : Tableau des chemins de répertoires autorisés

**Retourne :** boolean - Indique si le chemin d'import est valide

### `findProjectRoot(startDir)`

Trouve la racine du projet en recherchant un répertoire `.git` en remontant à partir du répertoire de départ donné. Implémentée comme une fonction **async** utilisant des APIs de système de fichiers non bloquantes pour éviter de bloquer la boucle d'événements de Node.js.

**Paramètres :**

- `startDir` (string) : Le répertoire à partir duquel commencer la recherche

**Retourne :** Promise<string> - Le répertoire racine du projet (ou le répertoire de départ si aucun `.git` n'est trouvé)

## Bonnes pratiques

1. **Utilisez des noms de fichiers descriptifs** pour les composants importés
2. **Gardez les imports peu profonds** - évitez les chaînes d'importation trop imbriquées
3. **Documentez votre structure** - maintenez une hiérarchie claire des fichiers importés
4. **Testez vos imports** - assurez-vous que tous les fichiers référencés existent et sont accessibles
5. **Utilisez des chemins relatifs** quand c'est possible pour une meilleure portabilité

## Dépannage

### Problèmes courants

1. **Import qui ne fonctionne pas** : Vérifiez que le fichier existe et que le chemin est correct
2. **Avertissements d'import circulaire** : Revoyez votre structure d'import pour détecter les références circulaires
3. **Erreurs de permission** : Assurez-vous que les fichiers sont lisibles et se trouvent dans les répertoires autorisés
4. **Problèmes de résolution de chemin** : Utilisez des chemins absolus si les chemins relatifs ne se résolvent pas correctement

### Mode debug

Activez le mode debug pour voir les logs détaillés du processus d'import :

```typescript
const result = await processImports(content, basePath, true);
```
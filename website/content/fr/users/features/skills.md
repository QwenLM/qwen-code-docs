# Agent Skills

> Créez, gérez et partagez des Skills pour étendre les capacités de Qwen Code.

Ce guide vous explique comment créer, utiliser et gérer des Agent Skills dans **Qwen Code**. Les Skills sont des capacités modulaires qui améliorent l'efficacité du modèle grâce à des dossiers organisés contenant des instructions (et éventuellement des scripts ou des ressources).

## Prérequis

- Qwen Code (version récente)
- Familiarité de base avec Qwen Code ([Démarrage rapide](../quickstart.md))

## Que sont les Agent Skills ?

Les Agent Skills regroupent une expertise sous forme de capacités détectables. Chaque Skill se compose d'un fichier `SKILL.md` contenant des instructions que le modèle peut charger lorsque c'est pertinent, ainsi que de fichiers de support optionnels comme des scripts et des modèles.

### Comment les Skills sont invoqués

Les Skills sont **invoqués par le modèle** : le modèle décide de manière autonome quand les utiliser en fonction de votre demande et de la description du Skill. Cela diffère des commandes slash, qui sont **invoquées par l'utilisateur** (vous tapez explicitement `/commande`).

Si vous souhaitez invoquer un Skill explicitement, utilisez la commande slash `/skills` :

```bash
/skills <skill-name>
```

Utilisez l'autocomplétion pour parcourir les Skills disponibles et leurs descriptions.

### Avantages

- Étendre Qwen Code pour vos workflows
- Partager l'expertise au sein de votre équipe via git
- Réduire les prompts répétitifs
- Combiner plusieurs Skills pour des tâches complexes

## Créer un Skill

Les Skills sont stockés sous forme de répertoires contenant un fichier `SKILL.md`.

### Skills personnels

Les Skills personnels sont disponibles dans tous vos projets. Stockez-les dans `~/.qwen/skills/` :

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Utilisez les Skills personnels pour :

- Vos workflows et préférences individuels
- Les Skills que vous développez
- Des assistants de productivité personnelle

### Skills de projet

Les Skills de projet sont partagés avec votre équipe. Stockez-les dans `.qwen/skills/` au sein de votre projet :

```bash
mkdir -p .qwen/skills/my-skill-name
```

Utilisez les Skills de projet pour :

- Les workflows et conventions d'équipe
- L'expertise spécifique au projet
- Les utilitaires et scripts partagés

Les Skills de projet peuvent être commités dans git et deviennent automatiquement disponibles pour vos coéquipiers.

## Rédiger `SKILL.md`

Créez un fichier `SKILL.md` avec un frontmatter YAML et du contenu Markdown :

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### Exigences des champs

Qwen Code valide actuellement que :

- `name` est une chaîne non vide correspondant à `/^[\p{L}\p{N}_:.-]+$/u` — lettres et chiffres Unicode (CJK / cyrillique / latin accentué acceptés), ainsi que `_`, `:`, `.`, `-`. Les espaces, barres obliques, crochets et autres caractères structurellement non sûrs sont rejetés lors de l'analyse.
- `description` est une chaîne non vide

Conventions recommandées :

- Privilégiez l'ASCII minuscule avec des tirets pour les noms partageables (ex. `tsx-helper`)
- Rendez `description` précise : incluez à la fois **ce que** fait le Skill et **quand** l'utiliser (mots-clés que les utilisateurs mentionneront naturellement)

### Optionnel : restreindre un Skill à des chemins de fichiers (`paths:`)

Pour les Skills qui ne concernent que des parties spécifiques d'un codebase, ajoutez une liste `paths:` de motifs glob. Le Skill reste exclu de la liste des Skills disponibles du modèle jusqu'à ce qu'un appel d'outil touche un fichier correspondant :

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

Notes :

- Les globs sont évalués relativement à la racine du projet avec [picomatch](https://github.com/micromatch/picomatch) ; les fichiers en dehors de la racine du projet ne déclenchent jamais l'activation.
- Un Skill restreint par chemin **reste activé pour le reste de la session** une fois qu'un fichier correspondant est touché. Une nouvelle session, ou un `refreshCache` déclenché par la modification d'un fichier Skill, réinitialise les activations.
- `paths:` ne restreint que la découverte par le **modèle**, et uniquement au niveau de la liste SkillTool. Vous pouvez toujours invoquer vous-même un Skill restreint par chemin via `/<skill-name>` ou le sélecteur `/skills` — ce chemin utilisateur exécute le corps du Skill quel que soit son état d'activation. Côté modèle, cependant, la restriction reste active jusqu'à ce qu'un fichier correspondant soit touché : une invocation slash **ne débloque pas** l'activation côté modèle. Ainsi, si vous souhaitez que le modèle poursuive après votre invocation (en appelant `Skill { skill: ... }` lui-même), accédez d'abord à un fichier correspondant au `paths:` du Skill.
- Combiner `paths:` avec `disable-model-invocation: true` est autorisé mais la restriction n'a aucun effet — le Skill est masqué au modèle quoi qu'il arrive, donc l'activation par chemin ne le rend jamais visible.

## Ajouter des fichiers de support

Créez des fichiers supplémentaires à côté de `SKILL.md` :

```text
my-skill/
├── SKILL.md (required)
├── reference.md (optional documentation)
├── examples.md (optional examples)
├── scripts/
│   └── helper.py (optional utility)
└── templates/
    └── template.txt (optional template)
```

Référencez ces fichiers depuis `SKILL.md` :

````markdown
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## Afficher les Skills disponibles

Qwen Code détecte les Skills depuis :

- Skills personnels : `~/.qwen/skills/`
- Skills de projet : `.qwen/skills/`
- Skills d'extension : Skills fournis par les extensions installées

### Skills d'extension

Les extensions peuvent fournir des Skills personnalisés qui deviennent disponibles lorsque l'extension est activée. Ces Skills sont stockés dans le répertoire `skills/` de l'extension et suivent le même format que les Skills personnels et de projet.

Les Skills d'extension sont automatiquement détectés et chargés lorsque l'extension est installée et activée.

Pour voir quelles extensions fournissent des Skills, consultez le champ `skills` dans le fichier `qwen-extension.json` de l'extension.

Pour afficher les Skills disponibles, demandez directement à Qwen Code :

```text
What Skills are available?
```

> **Note importante — vue modèle vs vue utilisateur.** Demander au modèle n'affiche que les Skills que le modèle peut actuellement voir. Si un Skill utilise `paths:` (voir « Optionnel : restreindre un Skill à des chemins de fichiers » ci-dessus), il reste exclu de cette liste jusqu'à ce qu'un fichier correspondant soit touché. L'ensemble complet est toujours visible pour vous via la commande slash `/skills` et sur le disque.

Ou parcourez la liste complète avec la commande slash (affiche toujours tous les Skills, y compris ceux restreints par chemin qui ne sont pas encore activés) :

```text
/skills
```

Ou inspectez le système de fichiers :

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Tester un Skill

Après avoir créé un Skill, testez-le en posant des questions correspondant à sa description.

Exemple : si votre description mentionne "fichiers PDF" :

```text
Can you help me extract text from this PDF?
```

Le modèle décide de manière autonome d'utiliser votre Skill si la demande correspond — vous n'avez pas besoin de l'invoquer explicitement.

## Déboguer un Skill

Si Qwen Code n'utilise pas votre Skill, vérifiez ces problèmes courants :

### Rendre la description précise

Trop vague :

```yaml
description: Helps with documents
```

Précis :

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### Vérifier le chemin du fichier

- Skills personnels : `~/.qwen/skills/<skill-name>/SKILL.md`
- Skills de projet : `.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### Vérifier la syntaxe YAML

Un YAML invalide empêche le chargement correct des métadonnées du Skill.

```bash
cat SKILL.md | head -n 15
```

Vérifiez que :

- L'ouverture `---` est sur la ligne 1
- La fermeture `---` précède le contenu Markdown
- La syntaxe YAML est valide (pas de tabulations, indentation correcte)

### Afficher les erreurs

Exécutez Qwen Code en mode debug pour voir les erreurs de chargement des Skills :

```bash
qwen --debug
```

## Partager des Skills avec votre équipe

Vous pouvez partager des Skills via des dépôts de projet :

1. Ajoutez le Skill sous `.qwen/skills/`
2. Commitez et poussez
3. Vos coéquipiers récupèrent (pull) les modifications

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Mettre à jour un Skill

Modifiez `SKILL.md` directement :

```bash
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

Les modifications prennent effet au prochain démarrage de Qwen Code. Si Qwen Code est déjà en cours d'exécution, redémarrez-le pour charger les mises à jour.

## Supprimer un Skill

Supprimez le répertoire du Skill :

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## Bonnes pratiques

### Garder les Skills ciblés

Un Skill doit couvrir une seule capacité :

- Ciblé : "Remplissage de formulaires PDF", "Analyse Excel", "Messages de commit Git"
- Trop large : "Traitement de documents" (divisez en Skills plus petits)

### Rédiger des descriptions claires

Aidez le modèle à détecter quand utiliser les Skills en incluant des déclencheurs précis :

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Tester avec votre équipe

- Le Skill s'active-t-il quand prévu ?
- Les instructions sont-elles claires ?
- Manque-t-il des exemples ou des cas limites ?
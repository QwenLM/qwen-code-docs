# Compétences de l'Agent

> Créez, gérez et partagez des Compétences pour étendre les capacités de Qwen Code.

Ce guide vous montre comment créer, utiliser et gérer les Compétences d'Agent dans **Qwen Code**. Les Compétences sont des capacités modulaires qui améliorent l'efficacité du modèle grâce à des dossiers organisés contenant des instructions (et éventuellement des scripts/ressources).

## Prérequis

- Qwen Code (version récente)
- Connaissance de base de Qwen Code ([Démarrage rapide](../quickstart.md))

## Que sont les Compétences d'Agent ?

Les Compétences d'Agent regroupent l'expertise en capacités découvrables. Chaque Compétence se compose d'un fichier `SKILL.md` avec des instructions que le modèle peut charger lorsque cela est pertinent, ainsi que des fichiers optionnels comme des scripts et des modèles.

### Comment les Compétences sont invoquées

Les Compétences sont **invoquées par le modèle** — le modèle décide de manière autonome quand les utiliser en fonction de votre demande et de la description de la Compétence. Cela diffère des commandes slash, qui sont **invoquées par l'utilisateur** (vous tapez explicitement `/commande`).

Si vous souhaitez invoquer une Compétence explicitement, utilisez la commande slash `/skills` :

```bash
/skills <skill-name>
```

Utilisez l'autocomplétion pour parcourir les Compétences disponibles et leurs descriptions.

### Avantages

- Étendre Qwen Code pour vos workflows
- Partager l'expertise au sein de votre équipe via git
- Réduire les invites répétitives
- Composer plusieurs Compétences pour des tâches complexes

## Créer une Compétence

Les Compétences sont stockées sous forme de dossiers contenant un fichier `SKILL.md`.

### Compétences personnelles

Les Compétences personnelles sont disponibles dans tous vos projets. Stockez-les dans `~/.qwen/skills/` :

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Utilisez les Compétences personnelles pour :

- Vos workflows et préférences individuels
- Les Compétences que vous développez
- Des aides à la productivité personnelle

### Compétences de projet

Les Compétences de projet sont partagées avec votre équipe. Stockez-les dans `.qwen/skills/` dans votre projet :

```bash
mkdir -p .qwen/skills/my-skill-name
```

Utilisez les Compétences de projet pour :

- Les workflows et conventions d'équipe
- L'expertise spécifique au projet
- Les utilitaires et scripts partagés

Les Compétences de projet peuvent être versionnées dans git et deviennent automatiquement disponibles pour les collègues.

## Écrire `SKILL.md`

Créez un fichier `SKILL.md` avec un frontmatter YAML et un contenu Markdown :

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
priority: 10
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### Exigences des champs

Qwen Code valide actuellement que :

- `name` est une chaîne non vide correspondant à `/^[\p{L}\p{N}_:.-]+$/u` — lettres et chiffres Unicode (CJK / cyrillique / latin accentué sont acceptés), plus `_`, `:`, `.`, `-`. Les espaces, barres obliques, crochets et autres caractères structurellement dangereux sont rejetés lors de l'analyse.
- `description` est une chaîne non vide
- `priority` est facultatif. S'il est présent, il doit s'agir d'un nombre fini. Les valeurs plus élevées trient plus tôt dans la liste `/skills` uniquement — la complétion de commande slash (taper `/`) et la vue des commandes personnalisées `/help` restent alphabétiques, donc une Compétence à haute priorité ne réorganise jamais les commandes intégrées. Les valeurs omises ou invalides sont traitées comme non définies, ce qui se comporte comme `0`.

Conventions recommandées :

- Préférez les minuscules ASCII avec des traits d'union pour les noms partageables (par exemple `tsx-helper`)
- Rendez la `description` spécifique : incluez à la fois **ce que** la Compétence fait et **quand** l'utiliser (mots-clés que les utilisateurs mentionneront naturellement)
- Utilisez `priority` avec parcimonie pour les Compétences qui doivent apparaître avant l'ordre alphabétique par défaut dans `/skills`. Les priorités négatives sont autorisées et trient en dessous des Compétences non définies.

### Facultatif : conditionner une Compétence aux chemins de fichiers (`paths:`)

Pour les Compétences qui ne concernent que des parties spécifiques d'une base de code, ajoutez une liste `paths:` de motifs glob. La Compétence reste hors de la liste des compétences disponibles du modèle jusqu'à ce qu'un appel d'outil touche un fichier correspondant :

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

Remarques :

1. Les globs sont mis en correspondance par rapport à la racine du projet avec [picomatch](https://github.com/micromatch/picomatch) ; les fichiers en dehors de la racine du projet ne déclenchent jamais d'activation.
2. Une Compétence conditionnée par chemin **reste activée pour le reste de la session** une fois qu'un fichier correspondant est touché. Une nouvelle session, ou un `refreshCache` déclenché par l'édition d'un fichier de Compétence, réinitialise les activations.
3. `paths:` ne conditionne que la découverte par le **modèle**, et uniquement au niveau de la liste SkillTool. Sauf si `user-invocable: false` est défini, vous pouvez toujours invoquer vous-même une Compétence conditionnée par chemin via `/<nom-de-la-compétence>` ou le sélecteur `/skills` — ce chemin utilisateur exécute le corps de la Compétence quel que soit l'état d'activation. Du côté du modèle, en revanche, la condition reste active jusqu'à ce qu'un fichier correspondant soit touché : une invocation par slash ne **débloque pas** l'activation côté modèle, donc si vous souhaitez que le modèle enchaîne sur votre invocation (appelle lui-même `Skill { skill: ... }`), accédez d'abord à un fichier correspondant aux `paths:` de la compétence.
4. Combiner `paths:` avec `disable-model-invocation: true` est autorisé mais la condition n'a aucun effet — la Compétence est cachée du modèle de toute façon, donc l'activation par chemin ne la révèle jamais.
### Optionnel : contrôler l'invocation utilisateur et modèle

Les Skills sont invocables par l'utilisateur par défaut. Pour masquer un Skill des commandes slash directes tout en le gardant disponible pour l'invocation du modèle, définissez `user-invocable: false` :

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

Cela supprime le Skill de l'invocation `/<skill-name>` et des résultats du sélecteur `/skills`. Cela ne cache pas le Skill au modèle.

Pour masquer un Skill de l'invocation du modèle tout en gardant l'invocation directe par l'utilisateur disponible, définissez `disable-model-invocation: true` :

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

Vous pouvez combiner les deux champs, mais alors le Skill n'est pas accessible via les chemins normaux d'invocation utilisateur ou modèle.

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

## Voir les Skills disponibles

Qwen Code découvre les Skills depuis :

- Skills personnels : `~/.qwen/skills/`
- Skills de projet : `.qwen/skills/`
- Skills d'extension : Skills fournis par les extensions installées

### Skills d'extension

Les extensions peuvent fournir des skills personnalisés qui deviennent disponibles lorsque l'extension est activée. Ces skills sont stockés dans le répertoire `skills/` de l'extension et suivent le même format que les skills personnels et de projet.

Les skills d'extension sont automatiquement découverts et chargés lorsque l'extension est installée et activée.

Pour voir quelles extensions fournissent des skills, vérifiez le fichier `qwen-extension.json` de l'extension pour un champ `skills`.

Pour voir les Skills disponibles, demandez directement à Qwen Code :

```text
What Skills are available?
```

> **Attention — vue modèle vs utilisateur.** Interroger le modèle ne fait apparaître que les Skills que le modèle peut voir actuellement. Si un Skill utilise `paths:` (voir "Optionnel : limiter un Skill à des chemins de fichiers" ci-dessus), il reste en dehors de cette liste jusqu'à ce qu'un fichier correspondant ait été touché. La commande slash `/skills` affiche les Skills que vous pouvez invoquer directement ; les Skills avec `user-invocable: false` restent visibles sur le disque et peuvent toujours être visibles par le modèle.

Ou parcourez la liste invocable par l'utilisateur avec la commande slash (y compris les Skills limités par chemin qui ne se sont pas encore activés) :

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

Après avoir créé un Skill, testez-le en posant des questions qui correspondent à votre description.

Exemple : si votre description mentionne "fichiers PDF" :

```text
Can you help me extract text from this PDF?
```

Le modèle décide de manière autonome d'utiliser votre Skill s'il correspond à la demande — vous n'avez pas besoin de l'invoquer explicitement.

## Déboguer un Skill

Si Qwen Code n'utilise pas votre Skill, vérifiez ces problèmes courants :

### Rendre la description spécifique

Trop vague :

```yaml
description: Helps with documents
```

Spécifique :

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

Assurez-vous que :

- Ouverture `---` à la ligne 1
- Fermeture `---` avant le contenu Markdown
- Syntaxe YAML valide (pas de tabulations, indentation correcte)

### Voir les erreurs

Exécutez Qwen Code en mode débogage pour voir les erreurs de chargement des Skills :

```bash
qwen --debug
```

## Partager les Skills avec votre équipe

Vous pouvez partager des Skills via les dépôts de projet :

1. Ajoutez le Skill sous `.qwen/skills/`
2. Commitez et poussez
3. Les membres de l'équipe récupèrent les modifications

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

## Meilleures pratiques

### Garder les Skills ciblés

Un Skill doit correspondre à une seule capacité :

- Ciblé : "Remplissage de formulaires PDF", "Analyse Excel", "Messages de commit Git"
- Trop large : "Traitement de documents" (à diviser en Skills plus petits)
### Rédigez des descriptions claires

Aidez le modèle à savoir quand utiliser les Skills en incluant des déclencheurs spécifiques :

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Testez avec votre équipe

- La Skill s'active-t-elle comme prévu ?
- Les instructions sont-elles claires ?
- Manque-t-il des exemples ou des cas particuliers ?

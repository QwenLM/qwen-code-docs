# Agent Skills

> Créez, gérez et partagez des Skills pour étendre les capacités de Qwen Code.

Ce guide vous explique comment créer, utiliser et gérer des Agent Skills dans **Qwen Code**. Les Skills sont des capacités modulaires qui améliorent l'efficacité du modèle grâce à des dossiers organisés contenant des instructions (et éventuellement des scripts ou des ressources).

## Prérequis

- Qwen Code (version récente)
- Familiarité de base avec Qwen Code ([Démarrage rapide](../quickstart.md))

## Que sont les Agent Skills ?

Les Agent Skills regroupent une expertise sous forme de capacités détectables. Chaque Skill se compose d'un fichier `SKILL.md` contenant des instructions que le modèle peut charger si nécessaire, ainsi que de fichiers de support facultatifs comme des scripts et des modèles.

### Comment les Skills sont invoqués

Les Skills sont **invoqués par le modèle** : le modèle décide de manière autonome quand les utiliser en fonction de votre demande et de la description du Skill. Cela diffère des commandes slash, qui sont **invoquées par l'utilisateur** (vous tapez explicitement `/commande`).

Si vous souhaitez invoquer explicitement un Skill, utilisez la commande slash `/skills` :

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
name: nom-de-votre-skill
description: Brève description de ce que fait ce Skill et quand l'utiliser
---

# Nom de votre Skill

## Instructions
Fournissez des instructions claires et étape par étape pour Qwen Code.

## Exemples
Montrez des exemples concrets d'utilisation de ce Skill.
```

### Exigences des champs

Qwen Code valide actuellement que :

- `name` est une chaîne non vide
- `description` est une chaîne non vide

Conventions recommandées (pas encore strictement appliquées) :

- Utilisez des minuscules, des chiffres et des tirets dans `name`
- Rendez `description` spécifique : incluez à la fois **ce que** fait le Skill et **quand** l'utiliser (mots-clés que les utilisateurs mentionneront naturellement)

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
Pour une utilisation avancée, consultez [reference.md](reference.md).

Exécutez le script d'aide :

```bash
python scripts/helper.py input.txt
```
````

## Voir les Skills disponibles

Qwen Code détecte les Skills depuis :

- Skills personnels : `~/.qwen/skills/`
- Skills de projet : `.qwen/skills/`
- Skills d'extension : Skills fournis par les extensions installées

### Skills d'extension

Les extensions peuvent fournir des Skills personnalisés qui deviennent disponibles lorsque l'extension est activée. Ces Skills sont stockés dans le répertoire `skills/` de l'extension et suivent le même format que les Skills personnels et de projet.

Les Skills d'extension sont automatiquement détectés et chargés lorsque l'extension est installée et activée.

Pour voir quelles extensions fournissent des Skills, vérifiez la présence d'un champ `skills` dans le fichier `qwen-extension.json` de l'extension.

Pour afficher les Skills disponibles, demandez directement à Qwen Code :

```text
Quels Skills sont disponibles ?
```

Ou inspectez le système de fichiers :

```bash
# Lister les Skills personnels
ls ~/.qwen/skills/

# Lister les Skills de projet (si vous êtes dans un répertoire de projet)
ls .qwen/skills/

# Afficher le contenu d'un Skill spécifique
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Tester un Skill

Après avoir créé un Skill, testez-le en posant des questions correspondant à sa description.

Exemple : si votre description mentionne "fichiers PDF" :

```text
Pouvez-vous m'aider à extraire le texte de ce PDF ?
```

Le modèle décide de manière autonome d'utiliser votre Skill si la demande correspond : vous n'avez pas besoin de l'invoquer explicitement.

## Déboguer un Skill

Si Qwen Code n'utilise pas votre Skill, vérifiez ces problèmes courants :

### Rendre la description spécifique

Trop vague :

```yaml
description: Helps with documents
```

Spécifique :

```yaml
description: Extrait le texte et les tableaux des fichiers PDF, remplit les formulaires, fusionne les documents. À utiliser lorsque vous travaillez avec des PDF, des formulaires ou l'extraction de documents.
```

### Vérifier le chemin du fichier

- Skills personnels : `~/.qwen/skills/<skill-name>/SKILL.md`
- Skills de projet : `.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personnel
ls ~/.qwen/skills/my-skill/SKILL.md

# Projet
ls .qwen/skills/my-skill/SKILL.md
```

### Vérifier la syntaxe YAML

Un YAML invalide empêche le chargement correct des métadonnées du Skill.

```bash
cat SKILL.md | head -n 15
```

Vérifiez que :

- L'ouverture `---` se trouve sur la ligne 1
- La fermeture `---` précède le contenu Markdown
- La syntaxe YAML est valide (pas de tabulations, indentation correcte)

### Afficher les erreurs

Exécutez Qwen Code en mode debug pour voir les erreurs de chargement des Skills :

```bash
qwen --debug
```

## Partager des Skills avec votre équipe

Vous pouvez partager des Skills via les dépôts de projet :

1. Ajoutez le Skill sous `.qwen/skills/`
2. Commitez et poussez (push)
3. Vos coéquipiers récupèrent (pull) les modifications

```bash
git add .qwen/skills/
git commit -m "Ajout d'un Skill d'équipe pour le traitement des PDF"
git push
```

## Mettre à jour un Skill

Modifiez `SKILL.md` directement :

```bash
# Skill personnel
code ~/.qwen/skills/my-skill/SKILL.md

# Skill de projet
code .qwen/skills/my-skill/SKILL.md
```

Les modifications prennent effet au prochain démarrage de Qwen Code. Si Qwen Code est déjà en cours d'exécution, redémarrez-le pour charger les mises à jour.

## Supprimer un Skill

Supprimez le répertoire du Skill :

```bash
# Personnel
rm -rf ~/.qwen/skills/my-skill

# Projet
rm -rf .qwen/skills/my-skill
git commit -m "Suppression d'un Skill inutilisé"
```

## Bonnes pratiques

### Garder les Skills ciblés

Un Skill doit couvrir une seule capacité :

- Ciblé : "Remplissage de formulaires PDF", "Analyse Excel", "Messages de commit Git"
- Trop large : "Traitement de documents" (divisez-le en Skills plus petits)

### Rédiger des descriptions claires

Aidez le modèle à détecter quand utiliser les Skills en incluant des déclencheurs spécifiques :

```yaml
description: Analyse les classeurs Excel, crée des tableaux croisés dynamiques et génère des graphiques. À utiliser lorsque vous travaillez avec des fichiers Excel, des classeurs ou des données .xlsx.
```

### Tester avec votre équipe

- Le Skill s'active-t-il au moment prévu ?
- Les instructions sont-elles claires ?
- Manque-t-il des exemples ou des cas limites ?
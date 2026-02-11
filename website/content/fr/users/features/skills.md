# Compétences de l'agent

> Créez, gérez et partagez des compétences pour étendre les capacités de Qwen Code.

Ce guide vous montre comment créer, utiliser et gérer les compétences d'agent dans **Qwen Code**. Les compétences sont des capacités modulaires qui étendent l'efficacité du modèle grâce à des dossiers organisés contenant des instructions (et éventuellement des scripts/ressources).

## Prérequis

- Qwen Code (version récente)
- Connaissance de base de Qwen Code ([Démarrage rapide](../quickstart.md))

## Qu'est-ce que les compétences d'agent ?

Les compétences d'agent regroupent l'expertise en capacités détectables. Chaque compétence se compose d'un fichier `SKILL.md` contenant des instructions que le modèle peut charger lorsque c'est pertinent, ainsi que des fichiers de support optionnels tels que des scripts et des modèles.

### Comment les compétences sont invoquées

Les compétences sont **invoquées par le modèle** — le modèle décide de manière autonome quand les utiliser en fonction de votre requête et de la description de la compétence. Cela diffère des commandes slash, qui sont **invoquées par l'utilisateur** (vous tapez explicitement `/commande`).

Si vous souhaitez invoquer une compétence explicitement, utilisez la commande slash `/skills` :

```bash
/skills <nom-de-la-compétence>
```

Utilisez l'autocomplétion pour parcourir les compétences disponibles et leurs descriptions.

### Avantages

- Étendre Qwen Code pour vos flux de travail
- Partager l'expertise au sein de votre équipe via git
- Réduire les demandes répétitives
- Composer plusieurs compétences pour des tâches complexes

## Créer une compétence

Les compétences sont stockées sous forme de répertoires contenant un fichier `SKILL.md`.

### Compétences personnelles

Les compétences personnelles sont disponibles dans tous vos projets. Stockez-les dans `~/.qwen/skills/` :

```bash
mkdir -p ~/.qwen/skills/nom-de-ma-compétence
```

Utilisez les compétences personnelles pour :

- Vos flux de travail et préférences individuels
- Les compétences que vous développez
- Les assistants personnels de productivité

### Compétences du projet

Les compétences du projet sont partagées avec votre équipe. Stockez-les dans le répertoire `.qwen/skills/` de votre projet :

```bash
mkdir -p .qwen/skills/my-skill-name
```

Utilisez les compétences du projet pour :

- Les flux de travail et conventions d'équipe
- L'expertise spécifique au projet
- Les utilitaires et scripts partagés

Les compétences du projet peuvent être ajoutées à git et deviennent automatiquement disponibles pour vos collègues.

## Écrire `SKILL.md`

Créez un fichier `SKILL.md` avec des métadonnées YAML et du contenu Markdown :

```yaml
---
name: your-skill-name
description: Brève description de ce que fait cette compétence et quand l'utiliser
---

# Nom de votre compétence

## Instructions
Fournissez un guide clair et étape par étape pour Qwen Code.

## Exemples
Montrez des exemples concrets d'utilisation de cette compétence.
```

### Exigences relatives aux champs

Qwen Code valide actuellement que :

- `name` est une chaîne de caractères non vide
- `description` est une chaîne de caractères non vide

Conventions recommandées (pas encore strictement appliquées) :

- Utilisez des lettres minuscules, des chiffres et des traits d'union dans `name`
- Rendez `description` spécifique : incluez à la fois **ce que fait** la compétence et **quand** l'utiliser (mots-clés que les utilisateurs mentionneront naturellement)

## Ajouter des fichiers complémentaires

Créez des fichiers supplémentaires à côté de `SKILL.md` :

```text
ma-compétence/
├── SKILL.md (requis)
├── reference.md (documentation facultative)
├── examples.md (exemples facultatifs)
├── scripts/
│   └── helper.py (utilitaire facultatif)
└── templates/
    └── template.txt (modèle facultatif)
```

Référez-vous à ces fichiers depuis `SKILL.md` :

````markdown
Pour une utilisation avancée, consultez [reference.md](reference.md).

Exécutez le script d'aide :

```bash
python scripts/helper.py input.txt
```
````

## Voir les compétences disponibles

Qwen Code découvre les compétences à partir de :

- Compétences personnelles : `~/.qwen/skills/`
- Compétences de projet : `.qwen/skills/`
- Compétences d'extension : Compétences fournies par les extensions installées

### Compétences d'extension

Les extensions peuvent fournir des compétences personnalisées qui deviennent disponibles lorsque l'extension est activée. Ces compétences sont stockées dans le répertoire `skills/` de l'extension et suivent le même format que les compétences personnelles et celles du projet.

Les compétences d'extension sont automatiquement découvertes et chargées lorsque l'extension est installée et activée.

Pour voir quelles extensions fournissent des compétences, vérifiez le fichier `qwen-extension.json` de l'extension à la recherche d'un champ `skills`.

Pour afficher les compétences disponibles, demandez directement à Qwen Code :

```text
Quelles compétences sont disponibles ?
```

Ou inspectez le système de fichiers :

```bash

# Lister les compétences personnelles
ls ~/.qwen/skills/

# Lister les compétences de projet (si dans un répertoire de projet)
ls .qwen/skills/

# Afficher le contenu d'une compétence spécifique
cat ~/.qwen/skills/ma-competence/SKILL.md
```

## Tester une compétence

Après avoir créé une compétence, testez-la en posant des questions qui correspondent à votre description.

Exemple : si votre description mentionne « fichiers PDF » :

```text
Pouvez-vous m'aider à extraire le texte de ce PDF ?
```

Le modèle décide de manière autonome d'utiliser votre compétence si elle correspond à la demande — vous n'avez pas besoin de l'invoquer explicitement.

## Déboguer une compétence

Si Qwen Code n'utilise pas votre compétence, vérifiez ces problèmes courants :

### Rendez la description spécifique

Trop vague :

```yaml
description: Aide avec les documents
```

Spécifique :

```yaml
description: Extraire du texte et des tableaux à partir de fichiers PDF, remplir des formulaires, fusionner des documents. À utiliser lorsqu'on travaille avec des PDF, des formulaires ou de l'extraction de documents.
```

### Vérifier le chemin du fichier

- Compétences personnelles : `~/.qwen/skills/<nom-de-la-compétence>/SKILL.md`
- Compétences de projet : `.qwen/skills/<nom-de-la-compétence>/SKILL.md`

```bash

# Personnel
ls ~/.qwen/skills/ma-competence/SKILL.md

# Projet
ls .qwen/skills/ma-competence/SKILL.md
```

### Vérifier la syntaxe YAML

Un fichier YAML invalide empêche le chargement correct des métadonnées du Skill.

```bash
cat SKILL.md | head -n 15
```

Assurez-vous que :

- La ligne 1 contient l'ouverture `---`
- La fermeture `---` se trouve avant le contenu Markdown
- La syntaxe YAML est valide (pas de tabulations, indentation correcte)

### Afficher les erreurs

Exécutez Qwen Code en mode débogage pour voir les erreurs de chargement des Skills :

```bash
qwen --debug
```

## Partager des Skills avec votre équipe

Vous pouvez partager des Skills via des dépôts de projets :

1. Ajoutez le Skill dans `.qwen/skills/`
2. Faites un commit et poussez
3. Les membres de l'équipe récupèrent les modifications

```bash
git add .qwen/skills/
git commit -m "Ajout d'un Skill d'équipe pour le traitement PDF"
git push
```

## Mettre à jour un Skill

Modifiez directement `SKILL.md` :

```bash

# Skill personnel
code ~/.qwen/skills/mon-skill/SKILL.md

# Skill de projet
code .qwen/skills/mon-skill/SKILL.md
```

Les modifications prennent effet au prochain démarrage de Qwen Code. Si Qwen Code est déjà en cours d'exécution, redémarrez-le pour charger les mises à jour.

## Supprimer un Skill

Supprimez le répertoire du Skill :

```bash
```

# Personnel
rm -rf ~/.qwen/skills/my-skill

# Projet
rm -rf .qwen/skills/my-skill
git commit -m "Supprimer le Skill inutilisé"
```

## Meilleures pratiques

### Garder les Skills ciblés

Un Skill devrait traiter une seule capacité :

- Ciblé : "Remplissage de formulaires PDF", "Analyse Excel", "Messages de commit Git"
- Trop large : "Traitement de documents" (diviser en Skills plus petits)

### Rédiger des descriptions claires

Aidez le modèle à découvrir quand utiliser les Skills en incluant des déclencheurs spécifiques :

```yaml
description: Analyser les feuilles de calcul Excel, créer des tableaux croisés dynamiques et générer des graphiques. À utiliser lors du travail avec des fichiers Excel, des feuilles de calcul ou des données .xlsx.
```

### Tester avec votre équipe

- Le Skill s'active-t-il comme prévu ?
- Les instructions sont-elles claires ?
- Y a-t-il des exemples manquants ou des cas particuliers non couverts ?
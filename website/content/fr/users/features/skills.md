# Compétences des agents

> Créez, gérez et partagez des compétences pour étendre les fonctionnalités de Qwen Code.

Ce guide vous explique comment créer, utiliser et gérer les compétences d’agents dans **Qwen Code**. Les compétences sont des fonctionnalités modulaires qui améliorent l’efficacité du modèle grâce à des dossiers organisés contenant des instructions (et éventuellement des scripts ou des ressources).

## Prérequis

- Qwen Code (version récente)  
- Une connaissance de base de Qwen Code ([Démarrage rapide](../quickstart.md))

## Qu’est-ce qu’une compétence d’agent ?

Les compétences d’agents regroupent une expertise sous forme de fonctionnalités découpables et facilement repérables. Chaque compétence comprend un fichier `SKILL.md` contenant des instructions que le modèle peut charger lorsqu’elles sont pertinentes, ainsi que des fichiers complémentaires optionnels (scripts, modèles, etc.).

### Comment les compétences sont appelées

Les compétences sont **appelées par le modèle** : le modèle décide de manière autonome quand les utiliser, en fonction de votre demande et de la description de la compétence. Cela diffère des commandes avec barre oblique (« slash commands »), qui sont **appelées par l’utilisateur** (vous tapez explicitement `/command`).

Si vous souhaitez appeler une compétence de façon explicite, utilisez la commande avec barre oblique `/skills` :

```bash
/skills <nom-de-la-compétence>
```

Utilisez la saisie semi-automatique pour parcourir les compétences disponibles ainsi que leurs descriptions.

### Avantages

- Étendez Qwen Code pour vos propres flux de travail  
- Partagez votre expertise au sein de votre équipe via Git  
- Réduisez les invites répétitives  
- Combine plusieurs compétences pour accomplir des tâches complexes  

## Créer une compétence

Les compétences sont stockées sous forme de répertoires contenant un fichier `SKILL.md`.

### Compétences personnelles

Les compétences personnelles sont disponibles dans tous vos projets. Stockez-les dans le répertoire `~/.qwen/skills/` :

```bash
mkdir -p ~/.qwen/skills/mon-nom-de-compétence
```

Utilisez les compétences personnelles pour :

- Vos propres flux de travail et préférences individuelles  
- Les compétences que vous développez actuellement  
- Les assistants personnels destinés à améliorer votre productivité

### Compétences du projet

Les compétences du projet sont partagées avec votre équipe. Stockez-les dans le dossier `.qwen/skills/` de votre projet :

```bash
mkdir -p .qwen/skills/my-skill-name
```

Utilisez les compétences du projet pour :

- Les flux de travail et conventions d’équipe
- L’expertise spécifique au projet
- Les utilitaires et scripts partagés

Les compétences du projet peuvent être suivies par Git et deviennent automatiquement disponibles pour vos collègues.

## Rédigez `SKILL.md`

Créez un fichier `SKILL.md` contenant un en-tête YAML et du contenu au format Markdown :

```yaml
---
name: your-skill-name
description: Description brève de ce que fait cette compétence et des cas où il convient de l’utiliser
---

# Nom de votre compétence

## Instructions
Fournissez des instructions claires, étape par étape, destinées à Qwen Code.

## Exemples
Présentez des exemples concrets d’utilisation de cette compétence.
```

### Exigences relatives aux champs

Qwen Code valide actuellement que :

- `name` est une chaîne de caractères non vide
- `description` est une chaîne de caractères non vide

Conventions recommandées (pas encore strictement appliquées) :

- Utilisez uniquement des lettres minuscules, des chiffres et des traits d’union dans `name`
- Rendez `description` précise : indiquez à la fois **ce que** fait la compétence et **quand** l’utiliser (mots-clés que les utilisateurs mentionneront naturellement)

## Ajouter des fichiers complémentaires

Créez des fichiers supplémentaires à côté de `SKILL.md` :

```text
my-skill/
├── SKILL.md (obligatoire)
├── reference.md (documentation facultative)
├── examples.md (exemples facultatifs)
├── scripts/
│   └── helper.py (utilitaire facultatif)
└── templates/
    └── template.txt (modèle facultatif)
```

Faites référence à ces fichiers depuis `SKILL.md` :

````markdown
Pour une utilisation avancée, consultez [reference.md](reference.md).

Exécutez le script d’assistance :

```bash
python scripts/helper.py input.txt
```
````

## Afficher les compétences disponibles

Qwen Code détecte les compétences à partir des emplacements suivants :

- Compétences personnelles : `~/.qwen/skills/`
- Compétences projet : `.qwen/skills/`
- Compétences d’extensions : compétences fournies par les extensions installées

### Compétences d’extensions

Les extensions peuvent fournir des compétences personnalisées qui deviennent disponibles dès que l’extension est activée. Ces compétences sont stockées dans le répertoire `skills/` de l’extension et suivent le même format que les compétences personnelles et projet.

Les compétences d’extensions sont automatiquement détectées et chargées dès lors que l’extension est installée et activée.

Pour identifier les extensions qui fournissent des compétences, consultez le champ `skills` du fichier `qwen-extension.json` de l’extension.

Pour afficher les compétences disponibles, interrogez directement Qwen Code :

```text
Quelles compétences sont disponibles ?
```

Ou inspectez le système de fichiers :

```bash

# Lister les compétences personnelles
ls ~/.qwen/skills/

# Lister les compétences projet (si vous êtes dans un répertoire projet)
ls .qwen/skills/

# Afficher le contenu d’une compétence spécifique
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Tester une compétence

Après avoir créé une compétence, testez-la en posant des questions correspondant à sa description.

Exemple : si votre description mentionne « fichiers PDF » :

```text
Pouvez-vous m’aider à extraire du texte de ce fichier PDF ?
```

Le modèle décide de manière autonome d’utiliser votre compétence si celle-ci correspond à la demande — vous n’avez pas besoin de l’invoquer explicitement.

## Déboguer une compétence

Si Qwen Code n’utilise pas votre compétence, vérifiez les problèmes courants suivants :

### Rendez la description plus précise

Trop vague :

```yaml
description: Aide avec les documents
```

Précis :

```yaml
description: Extrait du texte et des tableaux à partir de fichiers PDF, remplit des formulaires et fusionne des documents. À utiliser lors de la manipulation de fichiers PDF, de formulaires ou d’extraction de documents.
```

### Vérifiez le chemin du fichier

- Compétences personnelles : `~/.qwen/skills/<nom-de-la-compétence>/SKILL.md`
- Compétences projet : `.qwen/skills/<nom-de-la-compétence>/SKILL.md`

```bash

# Personnelles
ls ~/.qwen/skills/ma-compétence/SKILL.md

# Projet
ls .qwen/skills/ma-compétence/SKILL.md
```

### Vérifier la syntaxe YAML

Une syntaxe YAML invalide empêche le chargement correct des métadonnées de la Skill.

```bash
cat SKILL.md | head -n 15
```

Vérifiez les points suivants :

- Présence de `---` d’ouverture à la ligne 1
- Présence de `---` de fermeture avant le contenu Markdown
- Syntaxe YAML valide (pas de tabulations, indentation correcte)

### Afficher les erreurs

Exécutez Qwen Code en mode débogage pour visualiser les erreurs de chargement des Skills :

```bash
qwen --debug
```

## Partager des Skills avec votre équipe

Vous pouvez partager des Skills via les dépôts de projet :

1. Ajoutez la Skill dans le répertoire `.qwen/skills/`
2. Validez et poussez les modifications
3. Vos collègues récupèrent les changements

```bash
git add .qwen/skills/
git commit -m "Ajout de la Skill d’équipe pour le traitement PDF"
git push
```

## Mettre à jour une Skill

Modifiez directement le fichier `SKILL.md` :

```bash

# Skill personnelle
code ~/.qwen/skills/my-skill/SKILL.md

# Skill de projet
code .qwen/skills/my-skill/SKILL.md
```

Les modifications prennent effet lors du prochain démarrage de Qwen Code. Si Qwen Code est déjà en cours d’exécution, redémarrez-le pour charger les mises à jour.

## Supprimer une Skill

Supprimez le répertoire de la Skill :

```bash

# Personnel
rm -rf ~/.qwen/skills/ma-compétence

# Projet
rm -rf .qwen/skills/ma-compétence
git commit -m « Suppression de la compétence inutilisée »

## Bonnes pratiques

### Conservez vos compétences ciblées

Une compétence doit répondre à une seule capacité :

- Ciblée : « Remplissage de formulaires PDF », « Analyse Excel », « Messages de validation Git »
- Trop vaste : « Traitement de documents » (divisez-la en compétences plus petites)

### Rédigez des descriptions claires

Aidez le modèle à déterminer quand utiliser une compétence en y intégrant des déclencheurs spécifiques :

```yaml
description: Analyse des classeurs Excel, création de tableaux croisés dynamiques et génération de graphiques. À utiliser lors de la manipulation de fichiers Excel, de classeurs ou de données au format .xlsx.
```

### Testez avec votre équipe

- La compétence s’active-t-elle dans les cas attendus ?
- Les instructions sont-elles claires ?
- Manque-t-il des exemples ou des cas particuliers ?
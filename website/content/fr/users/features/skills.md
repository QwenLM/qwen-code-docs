# Compétences de l'agent (Expérimental)

> Créez, gérez et partagez des compétences pour étendre les capacités de Qwen Code.

Ce guide vous montre comment créer, utiliser et gérer les compétences d'agent dans **Qwen Code**. Les compétences sont des capacités modulaires qui étendent l'efficacité du modèle grâce à des dossiers organisés contenant des instructions (et éventuellement des scripts/ressources).

> [!note]
>
> Les compétences sont actuellement **expérimentales** et doivent être activées avec `--experimental-skills`.

## Prérequis

- Qwen Code (version récente)
- Exécuter avec l'indicateur expérimental activé :

```bash
qwen --experimental-skills
```

- Connaissance de base de Qwen Code ([Démarrage rapide](../quickstart.md))

## Qu'est-ce que les compétences d'agent ?

Les compétences d'agent regroupent l'expertise en capacités découvrables. Chaque compétence se compose d'un fichier `SKILL.md` contenant des instructions que le modèle peut charger lorsque c'est pertinent, ainsi que des fichiers de support optionnels tels que des scripts et des modèles.

### Comment les compétences sont invoquées

Les compétences sont **invoquées par le modèle** — le modèle décide de manière autonome quand les utiliser en fonction de votre requête et de la description de la compétence. Cela diffère des commandes slash, qui sont **invoquées par l'utilisateur** (vous tapez explicitement `/commande`).

Si vous souhaitez invoquer une compétence explicitement, utilisez la commande slash `/skills` :

```bash
/skills <nom-de-la-compétence>
```

La commande `/skills` n'est disponible que lorsque vous exécutez avec `--experimental-skills`. Utilisez la complétion automatique pour parcourir les compétences disponibles et leurs descriptions.

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
mkdir -p ~/.qwen/skills/my-skill-name
```

Utilisez les compétences personnelles pour :

- Vos flux de travail et préférences individuels
- Les compétences expérimentales que vous développez
- Les assistants personnels de productivité

### Compétences de projet

Les compétences de projet sont partagées avec votre équipe. Stockez-les dans `.qwen/skills/` à l'intérieur de votre projet :

```bash
mkdir -p .qwen/skills/my-skill-name
```

Utilisez les compétences de projet pour :

- Les flux de travail et conventions d'équipe
- L'expertise spécifique au projet
- Les utilitaires et scripts partagés

Les compétences de projet peuvent être versionnées dans git et deviennent automatiquement disponibles pour vos collègues.

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
Afficher des exemples concrets d'utilisation de cette compétence.
```

### Exigences relatives aux champs

Qwen Code valide actuellement que :

- `name` est une chaîne non vide
- `description` est une chaîne non vide

Conventions recommandées (pas encore strictement appliquées) :

- Utiliser des lettres minuscules, des chiffres et des traits d'union dans `name`
- Rendre `description` spécifique : inclure à la fois **ce que** fait la compétence et **quand** l'utiliser (mots-clés que les utilisateurs mentionneront naturellement)

## Ajouter des fichiers de support

Créer des fichiers supplémentaires à côté de `SKILL.md` :

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

Référencer ces fichiers depuis `SKILL.md` :

````markdown
Pour une utilisation avancée, voir [reference.md](reference.md).

Exécuter le script d'aide :

```bash
python scripts/helper.py input.txt
```
````

## Voir les compétences disponibles

Lorsque `--experimental-skills` est activé, Qwen Code découvre les compétences à partir de :

- Compétences personnelles : `~/.qwen/skills/`
- Compétences du projet : `.qwen/skills/`

Pour voir les compétences disponibles, demandez directement à Qwen Code :

```text
Quelles compétences sont disponibles ?
```

Ou examinez le système de fichiers :

```bash

# Lister les compétences personnelles
ls ~/.qwen/skills/

# Lister les compétences du projet (si dans un répertoire de projet)
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

Le modèle décide automatiquement d'utiliser votre compétence si elle correspond à la demande — vous n'avez pas besoin de l'invoquer explicitement.

## Déboguer une compétence

Si Qwen Code n'utilise pas votre compétence, vérifiez ces problèmes courants :

### Rendez la description spécifique

Trop vague :

```yaml
description: Aide avec les documents
```

Spécifique :

```yaml
description: Extrait le texte et les tableaux à partir des fichiers PDF, remplit les formulaires, fusionne les documents. À utiliser lors du travail avec des PDF, des formulaires ou de l'extraction de documents.
```

### Vérifiez le chemin du fichier

- Compétences personnelles : `~/.qwen/skills/<nom-de-la-compétence>/SKILL.md`
- Compétences de projet : `.qwen/skills/<nom-de-la-compétence>/SKILL.md`

```bash

# Personnel
ls ~/.qwen/skills/ma-competence/SKILL.md

# Projet
ls .qwen/skills/ma-competence/SKILL.md
```

### Vérifiez la syntaxe YAML

Un fichier YAML invalide empêche le chargement correct des métadonnées de la compétence.

```bash
cat SKILL.md | head -n 15
```

Assurez-vous que :

- La ligne 1 contient `---` d'ouverture
- Une ligne `---` de fermeture se trouve avant le contenu Markdown
- La syntaxe YAML est valide (pas de tabulations, indentation correcte)

### Afficher les erreurs

Exécutez Qwen Code en mode débogage pour voir les erreurs de chargement des compétences :

```bash
qwen --experimental-skills --debug
```

## Partager des compétences avec votre équipe

Vous pouvez partager des compétences via les dépôts de projet :

1. Ajoutez la compétence dans le répertoire `.qwen/skills/`
2. Validez et poussez les modifications
3. Les membres de l'équipe récupèrent les changements et exécutent avec `--experimental-skills`

```bash
git add .qwen/skills/
git commit -m "Ajouter une compétence d'équipe pour le traitement PDF"
git push
```

## Mettre à jour une compétence

Modifiez directement le fichier `SKILL.md` :

```bash

# Compétence personnelle
code ~/.qwen/skills/my-skill/SKILL.md

# Compétence de projet
code .qwen/skills/my-skill/SKILL.md
```

Les modifications prennent effet au prochain démarrage de Qwen Code. Si Qwen Code est déjà en cours d'exécution, redémarrez-le pour charger les mises à jour.

## Supprimer une compétence

Supprimez le répertoire de la compétence :

```bash

# Personnel
rm -rf ~/.qwen/skills/my-skill

# Projet
rm -rf .qwen/skills/my-skill
git commit -m "Supprimer la compétence inutilisée"
```

## Bonnes pratiques

### Garder les compétences ciblées

Une compétence devrait traiter une seule capacité :

- Ciblé : « remplissage de formulaires PDF », « analyse Excel », « messages de commit Git »
- Trop large : « traitement de documents » (à diviser en compétences plus petites)

### Rédigez des descriptions claires

Aidez le modèle à découvrir quand utiliser les compétences en incluant des déclencheurs spécifiques :

```yaml
description: Analyser les feuilles de calcul Excel, créer des tableaux croisés dynamiques et générer des graphiques. À utiliser lorsqu'on travaille avec des fichiers Excel, des feuilles de calcul ou des données .xlsx.
```

### Testez avec votre équipe

- La compétence s'active-t-elle comme prévu ?
- Les instructions sont-elles claires ?
- Y a-t-il des exemples manquants ou des cas particuliers non traités ?
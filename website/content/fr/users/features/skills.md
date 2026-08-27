# Agent Skills

> Créez, gérez et partagez des Skills pour étendre les capacités de Qwen Code.

Ce guide vous montre comment créer, utiliser et gérer les Agent Skills dans **Qwen Code**. Les Skills sont des capacités modulaires qui étendent l'efficacité du modèle grâce à des dossiers organisés contenant des instructions (et éventuellement des scripts/ressources).

## Prérequis

- Qwen Code (version récente)
- Connaissance de base de Qwen Code ([Démarrage rapide](../quickstart.md))

## Que sont les Agent Skills ?

Les Agent Skills regroupent l'expertise en capacités découvrables. Chaque Skill se compose d'un fichier `SKILL.md` contenant des instructions que le modèle peut charger si nécessaire, ainsi que de fichiers de support optionnels comme des scripts et des templates.

### Comment les Skills sont invoqués

Les Skills sont **invoqués par le modèle** : le modèle décide de manière autonome quand les utiliser en fonction de votre requête et de la description du Skill. Cela diffère des commandes slash, qui sont **invoquées par l'utilisateur** (vous tapez explicitement `/command`).

Si vous souhaitez invoquer un Skill explicitement, tapez-le comme une commande slash en utilisant le nom du Skill :

```bash
/<skill-name>
```

Commencez à taper `/` pour utiliser l'autocomplétion et parcourir les Skills disponibles avec leurs descriptions. La commande `/skills` ouvre le panneau des Skills, où vous pouvez parcourir, rechercher, activer/désactiver et lancer des Skills de manière interactive.

> **Remarque :** Si vous avez précédemment exécuté un Skill avec `/skills <skill-name>`, cette syntaxe ouvre désormais simplement le panneau des Skills et ignore l'argument final. Utilisez `/<skill-name>` pour exécuter un Skill directement.

### Avantages

- Étendez Qwen Code pour vos workflows
- Partagez l'expertise au sein de votre équipe via git
- Réduisez les prompts répétitifs
- Combinez plusieurs Skills pour des tâches complexes

## Créer un Skill

Les Skills sont stockés sous forme de répertoires contenant un fichier `SKILL.md`.

### Générer un Skill de projet avec `/learn`

Utilisez `/learn` pour distiller une source de connaissances existante en un Skill
de projet réutilisable :

```text
/learn https://docs.example.com/api
/learn ~/projects/acme-sdk
/learn Notre processus de déploiement : exécuter migrate, déployer le service, puis vérifier la santé
```

La commande s'exécute comme un tour d'agent normal et crée le résultat sous
`.qwen/skills/learned-skill-<name>/SKILL.md` avec `source: learned` dans son
frontmatter. Vérifiez les instructions générées avant de les utiliser ou de les
partager.

`/learn` accepte aussi les vidéos `.mp4`, `.webm`, `.mov` et `.m4v` locales ou
par lien direct. Ajoutez du texte après le chemin ou l'URL pour cibler le Skill
généré sur une partie du tutoriel :

```text
/learn ./tutorial.mp4 focus on the deployment workflow
```

L'apprentissage vidéo nécessite un modèle compatible vidéo sur un fournisseur compatible OpenAI.
Les URLs de page YouTube ne sont pas une entrée vidéo directe ; téléchargez la vidéo dans le
workspace et passez son chemin local à la place.

### Skills personnels

Les Skills personnels sont disponibles dans tous vos projets. Stockez-les dans `~/.qwen/skills/` :

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Utilisez les Skills personnels pour :

- Vos workflows et préférences individuels
- Les Skills que vous développez
- Les assistants de productivité personnelle

### Skills de projet

Les Skills de projet sont partagés avec votre équipe. Stockez-les dans `.qwen/skills/` au sein de votre projet :

```bash
mkdir -p .qwen/skills/my-skill-name
```

Utilisez les Skills de projet pour :

- Les workflows et conventions d'équipe
- L'expertise spécifique au projet
- Les utilitaires et scripts partagés

Les Skills de projet peuvent être commités dans git et deviennent automatiquement disponibles pour les membres de l'équipe.

### Maintenir les Skills de projet auto-générés

Qwen Code suit localement les utilisations réussies des Skills de projet générés, y compris lorsque la génération de nouveaux Auto Skills est désactivée, afin que la réactivation de la maintenance ne puisse pas confondre un skill récemment utilisé avec un skill inactif. Lorsque **Auto Skill** est activé, il déplace périodiquement les Skills générés inactifs hors de la bibliothèque active. Seuls les répertoires nommés `.qwen/skills/auto-skill-*` dont le frontmatter `SKILL.md` contient `source: auto-skill` sont gérés ; les Skills personnels, d'extension, intégrés et rédigés manuellement ne sont jamais sélectionnés.

- Après 30 jours sans utilisation réussie ni modification de `SKILL.md`, un auto-skill est marqué obsolète.
- Après 90 jours, son répertoire complet est déplacé vers `.qwen/archived-skills/`. Rien n'est définitivement supprimé.
- La maintenance automatique s'exécute au maximum une fois tous les 7 jours dans les workspaces fiables. Chaque auto-skill nouvellement observé bénéficie d'une période de grâce complète avant le début de la maintenance.
- Un auto-skill épinglé est exclu des transitions automatiques obsolète et archive jusqu'à ce qu'il soit désépinglé.
- Les noms de répertoires archivés restent réservés, et une destination d'archive existante ignore uniquement cette collision plutôt que d'arrêter la maintenance pour les autres skills.

Utilisez `/curator` pour voir les auto-skills actifs, obsolètes, archivés et épinglés. Exécutez `/curator run --dry-run` pour prévisualiser un passage de maintenance, `/curator run` pour l'appliquer immédiatement, `/curator pin <répertoire>` ou `/curator unpin <répertoire>` pour contrôler la maintenance par skill, ou `/curator restore <répertoire>` pour ramener un auto-skill archivé dans la bibliothèque active.

Le statut et les prévisualisations dry-run sont disponibles en mode safe et dans les workspaces non fiables. Appliquer la maintenance, modifier les épinglages et restaurer les auto-skills archivés nécessitent un workspace fiable hors mode safe.

## Écrire `SKILL.md`

Créez un fichier `SKILL.md` avec un frontmatter YAML et du contenu Markdown :

```yaml
---
name: nom-de-votre-skill
description: Brève description de ce que fait ce Skill et quand l'utiliser
priority: 10
---

# Nom de votre Skill

## Instructions
Fournissez des directives claires et étape par étape pour Qwen Code.

## Exemples
Montrez des exemples concrets d'utilisation de ce Skill.
```

### Exigences des champs

Qwen Code valide actuellement que :

- `name` est une chaîne non vide correspondant à `/^[\p{L}\p{N}_:.-]+$/u` — lettres et chiffres Unicode (CJK / cyrillique / latin accentué tous OK), plus `_`, `:`, `.`, `-`. Les espaces, les slashes, les crochets et autres caractères structurellement non sûrs sont rejetés lors de l'analyse.
- `description` est une chaîne non vide
- `priority` est optionnel. Lorsqu'il est présent, il doit s'agir d'un nombre fini. Les valeurs plus élevées sont triées plus tôt dans la liste `/skills` uniquement — l'autocomplétion des commandes slash (en tapant `/`) et la vue des commandes personnalisées `/help` restent alphabétiques, de sorte qu'un Skill à haute priorité ne réordonne jamais les commandes intégrées. Les valeurs omises ou invalides sont traitées comme non définies, ce qui se comporte comme `0`.

Conventions recommandées :

- Préférez l'ASCII minuscule avec des tirets pour les noms partageables (par ex. `tsx-helper`)
- Rendez la `description` spécifique : incluez à la fois **ce que** fait le Skill et **quand** l'utiliser (mots-clés que les utilisateurs mentionneront naturellement)
- Utilisez `priority` avec parcimonie pour les Skills qui doivent apparaître de manière fiable avant l'ordre alphabétique par défaut dans `/skills`. Les priorités négatives sont autorisées et sont triées en dessous des Skills non définis.

### Optionnel : restreindre un Skill à des chemins de fichiers (`paths:`)

Pour les Skills qui ne concernent que des parties spécifiques d'une base de code, ajoutez une liste `paths:` de motifs glob. Le Skill reste en dehors de la liste des skills disponibles du modèle jusqu'à ce qu'un appel d'outil touche un fichier correspondant :

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

- Les globs sont évalués par rapport à la racine du projet avec [picomatch](https://github.com/micromatch/picomatch) ; les fichiers en dehors de la racine du projet ne déclenchent jamais l'activation.
- Un Skill restreint par chemin **reste activé pour le reste de la session** une fois qu'un fichier correspondant est touché. Une nouvelle session, ou un `refreshCache` déclenché par la modification de n'importe quel fichier Skill, réinitialise les activations.
- `paths:` restreint uniquement la découverte par le **modèle**, et seulement au niveau de la liste SkillTool. À moins que `user-invocable: false` ne soit défini, vous pouvez toujours invoquer vous-même un Skill restreint par chemin via `/<skill-name>` ou le sélecteur `/skills` — ce chemin utilisateur exécute le corps du Skill quel que soit l'état d'activation. Côté modèle, cependant, la restriction reste en place jusqu'à ce qu'un fichier correspondant soit touché : une invocation par slash ne débloque **pas** l'activation côté modèle, donc si vous voulez que le modèle s'enchaîne à partir de votre invocation (qu'il appelle lui-même `Skill { skill: ... }`), accédez d'abord à un fichier correspondant aux `paths:` du skill.
- Combiner `paths:` avec `disable-model-invocation: true` est autorisé, mais la restriction n'a aucun effet — le Skill est de toute façon masqué pour le modèle, donc l'activation par chemin ne l'annonce jamais.

### Optionnel : contrôler l'invocation par l'utilisateur et le modèle

Les Skills sont invocables par l'utilisateur par défaut. Pour masquer un Skill de l'utilisation directe par commande slash tout en le gardant disponible pour l'invocation par le modèle, définissez `user-invocable: false` :

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

Cela supprime le Skill de l'invocation `/<skill-name>` et des résultats du sélecteur `/skills`. Cela ne masque pas le Skill au modèle.

Pour masquer un Skill de l'invocation par le modèle tout en gardant l'invocation directe par l'utilisateur disponible, définissez `disable-model-invocation: true` :

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

Vous pouvez combiner les deux champs, mais le Skill ne sera alors plus accessible via les chemins d'invocation normaux de l'utilisateur ou du modèle.

## Ajouter des fichiers de support

Créez des fichiers supplémentaires à côté de `SKILL.md` :

```text
my-skill/
├── SKILL.md (requis)
├── reference.md (documentation optionnelle)
├── examples.md (exemples optionnels)
├── scripts/
│   └── helper.py (utilitaire optionnel)
└── templates/
    └── template.txt (template optionnel)
```

Référencez ces fichiers depuis `SKILL.md` :

````markdown
Pour une utilisation avancée, voir [reference.md](reference.md).

Exécutez le script d'assistance :

```bash
python scripts/helper.py input.txt
```
````

## Voir les Skills disponibles

Qwen Code découvre les Skills depuis :

- Les Skills personnels : `~/.qwen/skills/`
- Les Skills de projet : `.qwen/skills/`
- Les Skills d'extension : les Skills fournis par les extensions installées
- Les Skills intégrés : les Skills fournis avec Qwen Code

### Skills d'extension

Les extensions peuvent fournir des skills personnalisés qui deviennent disponibles lorsque l'extension est activée. Ces skills sont stockés dans le répertoire `skills/` de l'extension et suivent le même format que les skills personnels et de projet.

Les skills d'extension sont automatiquement découverts et chargés lorsque l'extension est installée et activée.

Pour voir quelles extensions fournissent des skills, vérifiez la présence d'un champ `skills` dans le fichier `qwen-extension.json` de l'extension.

Pour voir les Skills disponibles, demandez directement à Qwen Code :

```text
Quels Skills sont disponibles ?
```

> **Attention — vue modèle vs. vue utilisateur.** Demander au modèle ne fait apparaître que les Skills que le modèle peut actuellement voir. Si un Skill utilise `paths:` (voir « Optionnel : restreindre un Skill à des chemins de fichiers » ci-dessus), il reste en dehors de cette liste jusqu'à ce qu'un fichier correspondant ait été touché. La commande slash `/skills` affiche les Skills que vous pouvez invoquer directement ; les Skills avec `user-invocable: false` restent visibles sur le disque et peuvent toujours être visibles pour le modèle.

Ou parcourez la liste invocable par l'utilisateur avec la commande slash (y compris les Skills restreints par chemin qui ne se sont pas encore activés) :

```text
/skills
```

Ou inspectez le système de fichiers :

```bash
# Lister les Skills personnels
ls ~/.qwen/skills/

# Lister les Skills de projet (si dans un répertoire de projet)
ls .qwen/skills/

# Voir le contenu d'un Skill spécifique
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Tester un Skill

Après avoir créé un Skill, testez-le en posant des questions qui correspondent à votre description.

Exemple : si votre description mentionne « fichiers PDF » :

```text
Pouvez-vous m'aider à extraire le texte de ce PDF ?
```

Le modèle décide de manière autonome d'utiliser votre Skill s'il correspond à la requête — vous n'avez pas besoin de l'invoquer explicitement.

## Déboguer un Skill

Si Qwen Code n'utilise pas votre Skill, vérifiez ces problèmes courants :

### Rendre la description spécifique

Trop vague :

```yaml
description: Aide pour les documents
```

Spécifique :

```yaml
description: Extrait le texte et les tableaux des fichiers PDF, remplit les formulaires, fusionne les documents. À utiliser lors du travail avec des PDF, des formulaires ou de l'extraction de documents.
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

Assurez-vous que :

- L'ouverture `---` est à la ligne 1
- La fermeture `---` est avant le contenu Markdown
- La syntaxe YAML est valide (pas de tabulations, indentation correcte)

### Voir les erreurs

Exécutez Qwen Code en mode debug pour voir les erreurs de chargement des Skills :

```bash
qwen --debug
```

## Partager des Skills avec votre équipe

Vous pouvez partager des Skills via les dépôts de projet :

1. Ajoutez le Skill sous `.qwen/skills/`
2. Commitez et pushez
3. Les membres de l'équipe récupèrent les modifications

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

Pendant une session normale, Qwen Code surveille les répertoires de Skills personnels et de projet. Ajouter, modifier ou supprimer un Skill rafraîchit la liste des Skills et l'état d'invocation automatiquement après un court délai. Le mode bare ne démarre pas ces watchers, donc redémarrez Qwen Code pour charger les modifications de Skills dans ce mode.

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

Un Skill doit traiter une seule capacité :

- Ciblé : « Remplissage de formulaires PDF », « Analyse Excel », « Messages de commit Git »
- Trop large : « Traitement de documents » (à diviser en Skills plus petits)

### Écrire des descriptions claires

Aidez le modèle à découvrir quand utiliser les Skills en incluant des déclencheurs spécifiques :

```yaml
description: Analyse les tableurs Excel, crée des tableaux croisés dynamiques et génère des graphiques. À utiliser lors du travail avec des fichiers Excel, des tableurs ou des données .xlsx.
```

### Tester avec votre équipe

- Le Skill s'active-t-il comme prévu ?
- Les instructions sont-elles claires ?
- Manque-t-il des exemples ou des cas limites ?
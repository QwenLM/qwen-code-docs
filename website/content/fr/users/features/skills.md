```markdown
# Compétences Agent

> Créez, gérez et partagez des compétences (Skills) pour étendre les capacités de Qwen Code.

Ce guide explique comment créer, utiliser et gérer les compétences Agent (Agent Skills) dans **Qwen Code**. Les compétences sont des capacités modulaires qui améliorent l'efficacité du modèle grâce à des dossiers organisés contenant des instructions (et, éventuellement, des scripts/ressources).

## Prérequis

- Qwen Code (version récente)
- Familiarité de base avec Qwen Code ([Démarrage rapide](../quickstart.md))

## Que sont les compétences Agent ?

Les compétences Agent regroupent de l'expertise en capacités découvrables. Chaque compétence consiste en un fichier `SKILL.md` contenant des instructions que le modèle peut charger lorsque cela est pertinent, ainsi que des fichiers de support optionnels comme des scripts et des templates.

### Comment les compétences sont invoquées

Les compétences sont **invoquées par le modèle** — le modèle décide de manière autonome quand les utiliser en fonction de votre requête et de la description de la compétence. Cela diffère des commandes slash, qui sont **invoquées par l'utilisateur** (vous tapez explicitement `/commande`).

Si vous souhaitez invoquer une compétence explicitement, utilisez la commande slash `/skills` :

```bash
/skills <nom-de-la-competence>
```

Utilisez l'autocomplétion pour parcourir les compétences et descriptions disponibles.

### Avantages

- Étendre Qwen Code pour vos workflows
- Partager l'expertise au sein de votre équipe via git
- Réduire les invites répétitives
- Composer plusieurs compétences pour des tâches complexes

## Créer une compétence

Les compétences sont stockées dans des dossiers contenant un fichier `SKILL.md`.

### Compétences personnelles

Les compétences personnelles sont disponibles dans tous vos projets. Stockez-les dans `~/.qwen/skills/` :

```bash
mkdir -p ~/.qwen/skills/mon-nom-de-competence
```

Utilisez les compétences personnelles pour :

- Vos workflows et préférences individuelles
- Les compétences que vous développez
- Des outils de productivité personnelle

### Compétences de projet

Les compétences de projet sont partagées avec votre équipe. Stockez-les dans `.qwen/skills/` à l'intérieur de votre projet :

```bash
mkdir -p .qwen/skills/mon-nom-de-competence
```

Utilisez les compétences de projet pour :

- Les workflows et conventions d'équipe
- L'expertise spécifique au projet
- Les utilitaires et scripts partagés

Les compétences de projet peuvent être versionnées dans git et deviennent automatiquement disponibles pour les coéquipiers.

## Rédiger `SKILL.md`

Créez un fichier `SKILL.md` avec un frontmatter YAML et du contenu Markdown :

```yaml
---
name: nom-de-votre-competence
description: Brève description de ce que fait cette compétence et quand l'utiliser
priority: 10
---

# Nom de votre compétence

## Instructions
Fournissez des conseils clairs et étape par étape pour Qwen Code.

## Exemples
Montrez des exemples concrets d'utilisation de cette compétence.
```

### Exigences des champs

Qwen Code valide actuellement :

- `name` est une chaîne non vide correspondant à `/^[\p{L}\p{N}_:.-]+$/u` — lettres et chiffres Unicode (CJK / cyrillique / latin accentué OK), plus `_`, `:`, `.`, `-`. Les espaces, barres obliques, crochets et autres caractères structurellement dangereux sont rejetés à l'analyse.
- `description` est une chaîne non vide
- `priority` est optionnel. S'il est présent, il doit être un nombre fini. Des valeurs plus élevées trient plus tôt dans le listing `/skills` uniquement — la complétion par slash (taper `/`) et la vue des commandes personnalisées `/help` restent alphabétiques, donc une compétence à haute priorité ne réorganise jamais les commandes intégrées. Les valeurs omises ou invalides sont traitées comme non définies, ce qui se comporte comme `0`.

Conventions recommandées :

- Préférez l'ASCII minuscule avec des traits d'union pour les noms partageables (par ex. `tsx-helper`)
- Rendez la `description` spécifique : incluez à la fois **ce que** fait la compétence et **quand** l'utiliser (mots-clés que les utilisateurs mentionneront naturellement)
- Utilisez `priority` avec parcimonie pour les compétences qui doivent apparaître de manière fiable avant l'ordre alphabétique par défaut dans `/skills`. Les priorités négatives sont autorisées et se classent après les compétences non définies.

### Optionnel : restreindre une compétence à des chemins de fichiers (`paths:`)

Pour les compétences qui ne concernent que des parties spécifiques d'une base de code, ajoutez une liste `paths:` de motifs glob. La compétence reste hors du listing des compétences disponibles du modèle jusqu'à ce qu'un appel d'outil touche un fichier correspondant :

```yaml
---
name: tsx-helper
description: Aide pour les composants React TSX
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

Remarques :

- Les motifs glob sont mis en correspondance par rapport à la racine du projet avec [picomatch](https://github.com/micromatch/picomatch) ; les fichiers en dehors de la racine du projet ne déclenchent jamais l'activation.
- Une compétence restreinte par chemin **reste activée pour le reste de la session** une fois qu'un fichier correspondant est touché. Une nouvelle session, ou un `refreshCache` déclenché par l'édition d'un fichier de compétence, réinitialise les activations.
- `paths:` ne restreint que la **découverte par le modèle**, et uniquement au niveau du listing SkillTool. À moins que `user-invocable: false` ne soit défini, vous pouvez toujours invoquer vous-même une compétence restreinte via `/<nom-de-competence>` ou le sélecteur `/skills` — ce chemin utilisateur exécute le corps de la compétence quel que soit l'état d'activation. Du côté du modèle, cependant, la restriction reste en place jusqu'à ce qu'un fichier correspondant soit touché : une invocation par slash **ne débloque pas** l'activation côté modèle, donc si vous voulez que le modèle enchaîne sur votre invocation (appelle `Skill { skill: ... }` lui-même), accédez d'abord à un fichier correspondant aux `paths:` de la compétence.
- Combiner `paths:` avec `disable-model-invocation: true` est autorisé mais la restriction n'a aucun effet — la compétence est cachée du modèle de toute façon, donc l'activation par chemin ne l'annonce jamais.

### Optionnel : contrôler l'invocation utilisateur et modèle

Les compétences sont invocables par l'utilisateur par défaut. Pour masquer une compétence de l'utilisation directe via commande slash tout en la laissant disponible pour l'invocation par le modèle, définissez `user-invocable: false` :

```yaml
---
name: aide-uniquement-modele
description: Aide que le modèle peut appeler si nécessaire
user-invocable: false
---
```

Cela supprime la compétence de l'invocation `/<nom-de-competence>` et des résultats du sélecteur `/skills`. Cela ne cache pas la compétence au modèle.

Pour masquer une compétence de l'invocation par le modèle tout en gardant l'invocation directe par l'utilisateur disponible, définissez `disable-model-invocation: true` :

```yaml
---
name: aide-manuelle
description: Aide que vous invoquez manuellement
disable-model-invocation: true
---
```

Vous pouvez combiner les deux champs, mais alors la compétence n'est accessible ni par les chemins d'invocation normaux utilisateur ni modèle.

## Ajouter des fichiers de support

Créez des fichiers supplémentaires à côté de `SKILL.md` :

```text
ma-competence/
├── SKILL.md (obligatoire)
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

Exécutez le script utilitaire :

```bash
python scripts/helper.py input.txt
```
````

## Voir les compétences disponibles

Qwen Code découvre les compétences depuis :

- Compétences personnelles : `~/.qwen/skills/`
- Compétences de projet : `.qwen/skills/`
- Compétences d'extension : compétences fournies par les extensions installées

### Compétences d'extension

Les extensions peuvent fournir des compétences personnalisées qui deviennent disponibles lorsque l'extension est activée. Ces compétences sont stockées dans le dossier `skills/` de l'extension et suivent le même format que les compétences personnelles et de projet.

Les compétences d'extension sont automatiquement découvertes et chargées lorsque l'extension est installée et activée.

Pour voir quelles extensions fournissent des compétences, vérifiez le fichier `qwen-extension.json` de l'extension pour un champ `skills`.

Pour voir les compétences disponibles, demandez directement à Qwen Code :

```text
Quelles compétences sont disponibles ?
```

> **Attention — vue modèle vs. utilisateur.** Demander au modèle ne remonte que les compétences que le modèle peut actuellement voir. Si une compétence utilise `paths:` (voir « Optionnel : restreindre une compétence à des chemins de fichiers » ci-dessus), elle reste hors de ce listing jusqu'à ce qu'un fichier correspondant ait été touché. La commande slash `/skills` montre les compétences que vous pouvez invoquer directement ; les compétences avec `user-invocable: false` restent visibles sur le disque et peuvent encore être visibles pour le modèle.

Ou parcourez la liste invocable par l'utilisateur avec la commande slash (y compris les compétences restreintes par chemin qui ne se sont pas encore activées) :

```text
/skills
```

Ou inspectez le système de fichiers :

```bash
# Lister les compétences personnelles
ls ~/.qwen/skills/

# Lister les compétences de projet (si dans un répertoire de projet)
ls .qwen/skills/

# Voir le contenu d'une compétence spécifique
cat ~/.qwen/skills/ma-competence/SKILL.md
```

## Tester une compétence

Après avoir créé une compétence, testez-la en posant des questions qui correspondent à votre description.

Exemple : si votre description mentionne « fichiers PDF » :

```text
Peux-tu m'aider à extraire le texte de ce PDF ?
```

Le modèle décide de manière autonome d'utiliser votre compétence si elle correspond à la demande — vous n'avez pas besoin de l'invoquer explicitement.

## Déboguer une compétence

Si Qwen Code n'utilise pas votre compétence, vérifiez ces problèmes courants :

### Rendre la description spécifique

Trop vague :

```yaml
description: Aide avec les documents
```

Spécifique :

```yaml
description: Extraire du texte et des tableaux de fichiers PDF, remplir des formulaires, fusionner des documents. À utiliser lors du travail avec des PDF, des formulaires ou de l'extraction de documents.
```

### Vérifier le chemin du fichier

- Compétences personnelles : `~/.qwen/skills/<nom-de-la-competence>/SKILL.md`
- Compétences de projet : `.qwen/skills/<nom-de-la-competence>/SKILL.md`

```bash
# Personnel
ls ~/.qwen/skills/ma-competence/SKILL.md

# Projet
ls .qwen/skills/ma-competence/SKILL.md
```

### Vérifier la syntaxe YAML

Un YAML invalide empêche le chargement correct des métadonnées de la compétence.

```bash
cat SKILL.md | head -n 15
```

Assurez-vous :

- `---` d'ouverture à la ligne 1
- `---` de fermeture avant le contenu Markdown
- Syntaxe YAML valide (pas de tabulations, indentation correcte)

### Voir les erreurs

Exécutez Qwen Code en mode débogage pour voir les erreurs de chargement des compétences :

```bash
qwen --debug
```

## Partager des compétences avec votre équipe

Vous pouvez partager des compétences via les dépôts de projet :

1. Ajoutez la compétence sous `.qwen/skills/`
2. Commitez et poussez
3. Les coéquipiers récupèrent les changements

```bash
git add .qwen/skills/
git commit -m "Ajout de la compétence d'équipe pour le traitement PDF"
git push
```

## Mettre à jour une compétence

Modifiez `SKILL.md` directement :

```bash
# Compétence personnelle
code ~/.qwen/skills/ma-competence/SKILL.md

# Compétence de projet
code .qwen/skills/ma-competence/SKILL.md
```

Les modifications prennent effet au prochain démarrage de Qwen Code. Si Qwen Code est déjà en cours d'exécution, redémarrez-le pour charger les mises à jour.

## Supprimer une compétence

Supprimez le dossier de la compétence :

```bash
# Personnel
rm -rf ~/.qwen/skills/ma-competence

# Projet
rm -rf .qwen/skills/ma-competence
git commit -m "Suppression d'une compétence inutilisée"
```

## Bonnes pratiques

### Garder les compétences ciblées

Une compétence doit couvrir une seule capacité :

- Ciblé : « Remplissage de formulaires PDF », « Analyse Excel », « Messages de commit Git »
- Trop large : « Traitement de documents » (à diviser en compétences plus petites)

### Rédiger des descriptions claires

Aidez le modèle à découvrir quand utiliser les compétences en incluant des déclencheurs spécifiques :

```yaml
description: Analyser des feuilles de calcul Excel, créer des tableaux croisés dynamiques et générer des graphiques. À utiliser lors du travail avec des fichiers Excel, des feuilles de calcul ou des données .xlsx.
```

### Tester avec votre équipe

- La compétence s'active-t-elle comme prévu ?
- Les instructions sont-elles claires ?
- Y a-t-il des exemples ou cas limites manquants ?
```
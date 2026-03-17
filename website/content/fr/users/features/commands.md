# Commandes

Ce document décrit l’ensemble des commandes prises en charge par Qwen Code, afin de vous aider à gérer efficacement vos sessions, personnaliser l’interface et contrôler son comportement.

Les commandes Qwen Code sont déclenchées à l’aide de préfixes spécifiques et se répartissent en trois catégories :

| Type de préfixe            | Description de la fonction                        | Cas d’utilisation typique                                          |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Commandes obliques (`/`)   | Contrôle au niveau méta de Qwen Code lui-même     | Gestion des sessions, modification des paramètres, obtention d’aide |
| Commandes « at » (`@`)     | Injection rapide du contenu de fichiers locaux dans la conversation | Permettre à l’IA d’analyser des fichiers ou du code spécifiés situés dans des répertoires |
| Commandes d’exclamation (`!`) | Interaction directe avec le shell système         | Exécution de commandes système telles que `git status`, `ls`, etc. |

## 1. Commandes obliques (`/`)

Les commandes obliques permettent de gérer les sessions Qwen Code, l’interface et le comportement de base.

### 1.1 Gestion des sessions et des projets

Ces commandes vous aident à enregistrer, restaurer et résumer l’avancement de votre travail.

| Commande    | Description                                                                 | Exemples d’utilisation               |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `/init`     | Analyse le répertoire courant et crée un fichier de contexte initial         | `/init`                              |
| `/summary`  | Génère un résumé du projet à partir de l’historique des conversations        | `/summary`                           |
| `/compress` | Remplace l’historique des discussions par un résumé afin d’économiser des jetons | `/compress`                          |
| `/resume`   | Reprend une session de conversation précédente                              | `/resume`                            |
| `/restore`  | Restaure les fichiers à leur état antérieur à l’exécution de l’outil       | `/restore` (liste) ou `/restore <ID>` |

### 1.2 Interface et contrôle de l’espace de travail

Commandes permettant d’ajuster l’apparence de l’interface et de l’environnement de travail.

| Commande       | Description                                      | Exemples d’utilisation              |
| -------------- | ------------------------------------------------ | ------------------------------------ |
| `/clear`       | Efface le contenu de l’écran du terminal         | `/clear` (raccourci : `Ctrl+L`)     |
| `/theme`       | Change le thème visuel de Qwen Code              | `/theme`                            |
| `/vim`         | Active/désactive le mode d’édition Vim dans la zone de saisie | `/vim`                              |
| `/directory`   | Gère l’espace de travail avec prise en charge de plusieurs répertoires | `/dir add ./src,./tests`           |
| `/editor`      | Ouvre une boîte de dialogue pour sélectionner un éditeur pris en charge | `/editor`                           |

### 1.3 Paramètres linguistiques

Commandes spécifiques permettant de contrôler la langue de l’interface et des sorties.

| Commande              | Description                          | Exemples d’utilisation         |
| --------------------- | -------------------------------------- | ------------------------------ |
| `/language`           | Afficher ou modifier les paramètres linguistiques | `/language`                    |
| → `ui [langue]`       | Définir la langue de l’interface utilisateur | `/language ui zh-CN`           |
| → `output [langue]`   | Définir la langue de sortie du modèle LLM | `/language output chinois`     |

- Langues d’interface utilisateur intégrées disponibles : `zh-CN` (chinois simplifié), `en-US` (anglais), `ru-RU` (russe), `de-DE` (allemand)  
- Exemples de langues de sortie : `chinois`, `anglais`, `japonais`, etc.

### 1.4 Gestion des outils et des modèles

Commandes permettant de gérer les outils et modèles d’IA.

| Commande           | Description                                           | Exemples d’utilisation                                  |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------- |
| `/mcp`             | Liste les serveurs MCP et les outils configurés       | `/mcp`, `/mcp desc`                                     |
| `/tools`           | Affiche la liste des outils actuellement disponibles  | `/tools`, `/tools desc`                                 |
| `/skills`          | Liste et exécute les compétences disponibles          | `/skills`, `/skills <nom>`                              |
| `/approval-mode`   | Modifie le mode d’approbation pour l’utilisation des outils | `/approval-mode <mode (auto-edit)> --project`         |
| → `plan`           | Analyse uniquement, aucune exécution                  | Révision sécurisée                                      |
| → `default`        | Nécessite une approbation pour les modifications       | Utilisation quotidienne                                 |
| → `auto-edit`      | Approuve automatiquement les modifications             | Environnement fiable                                    |
| → `yolo`           | Approuve automatiquement toutes les actions            | Prototypage rapide                                      |
| `/model`           | Change le modèle utilisé dans la session en cours       | `/model`                                                |
| `/extensions`      | Liste toutes les extensions actives dans la session en cours | `/extensions`                                        |
| `/memory`          | Gère le contexte d’instructions de l’IA               | `/memory add Informations importantes`                 |

### 1.5 Informations, paramètres et aide

Commandes permettant d’obtenir des informations et de configurer le système.

| Commande    | Description                                          | Exemples d’utilisation                     |
| ----------- | ---------------------------------------------------- | ------------------------------------------ |
| `/help`     | Affiche les informations d’aide relatives aux commandes disponibles | `/help` ou `/?`                            |
| `/about`    | Affiche les informations sur la version            | `/about`                                   |
| `/stats`    | Affiche des statistiques détaillées pour la session en cours | `/stats`                                   |
| `/settings` | Ouvre l’éditeur de paramètres                        | `/settings`                                |
| `/auth`     | Modifie la méthode d’authentification                | `/auth`                                    |
| `/bug`      | Signale un problème lié à Qwen Code                 | `/bug Le clic sur le bouton ne répond pas` |
| `/copy`     | Copie le dernier contenu généré dans le presse-papiers | `/copy`                                    |
| `/quit`     | Quitte immédiatement Qwen Code                       | `/quit` ou `/exit`                         |

### 1.6 Raccourcis courants

| Raccourci          | Fonction                | Remarque               |
| ------------------ | ----------------------- | ---------------------- |
| `Ctrl/cmd+L`       | Effacer l’écran         | Équivalent à `/clear`  |
| `Ctrl/cmd+T`       | Afficher/masquer la description de l’outil | Gestion des outils MCP |
| `Ctrl/cmd+C`×2     | Confirmation de sortie  | Mécanisme de sortie sécurisé |
| `Ctrl/cmd+Z`       | Annuler la saisie       | Édition de texte       |
| `Ctrl/cmd+Maj+Z`   | Rétablir la saisie      | Édition de texte       |

## 2. Commandes `@` (introduction de fichiers)

Les commandes `@` permettent d’ajouter rapidement le contenu d’un fichier ou d’un répertoire local à la conversation.

| Format de la commande | Description                                          | Exemples                                               |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `@<chemin/vers/fichier>`      | Insère le contenu du fichier spécifié                | `@src/main.py Expliquez ce code`                       |
| `@<chemin/vers/répertoire>` | Lit récursivement tous les fichiers texte du répertoire | `@docs/ Résumez le contenu de ce document`            |
| `@` seul              | Utilisé lorsqu’on parle du symbole `@` lui-même      | `@ À quoi sert ce symbole en programmation ?`         |

Remarque : Les espaces présents dans les chemins doivent être échappés avec une barre oblique inversée (par exemple, `@Mes\ Documents/fichier.txt`).

## 3. Commandes d’exclamation (`!`) — Exécution de commandes shell

Les commandes d’exclamation vous permettent d’exécuter directement des commandes système dans Qwen Code.

| Format de commande     | Description                                                                 | Exemples                               |
| ---------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| `!<commande shell>`    | Exécute la commande dans un sous-shell                                       | `!ls -la`, `!git status`               |
| `!` seul               | Active le mode shell : toute entrée est exécutée directement comme commande shell | `!`(entrée) → Saisir une commande → `!`(sortie) |

Variables d’environnement : Les commandes exécutées via `!` définissent la variable d’environnement `QWEN_CODE=1`.

## 4. Commandes personnalisées

Enregistrez les invites fréquemment utilisées sous forme de commandes raccourcies afin d’améliorer l’efficacité du travail et garantir la cohérence.

> [!note]
>
> Les commandes personnalisées utilisent désormais le format Markdown, avec un en-tête YAML facultatif. Le format TOML est obsolète, mais reste pris en charge pour assurer la rétrocompatibilité. Lorsqu’un fichier au format TOML est détecté, un message vous invite automatiquement à migrer vers le format Markdown.

### Aperçu rapide

| Fonction           | Description                                      | Avantages                                   | Priorité | Scénarios applicables                                     |
| ------------------ | ------------------------------------------------ | ------------------------------------------- | -------- | --------------------------------------------------------- |
| Espace de noms     | Un sous-répertoire crée des commandes nommées avec deux-points | Meilleure organisation des commandes        |          |                                                           |
| Commandes globales | `~/.qwen/commands/`                               | Disponibles dans tous les projets           | Faible   | Commandes personnelles fréquemment utilisées, usage transverse entre projets |
| Commandes projet   | `<répertoire-racine-du-projet>/.qwen/commands/` | Spécifiques au projet, contrôlables en version | Élevée   | Partage d’équipe, commandes spécifiques à un projet      |

Règles de priorité : Les commandes projet priment sur les commandes utilisateur (en cas de conflit de noms, la commande projet est utilisée).

### Règles de dénomination des commandes

#### Tableau de correspondance entre le chemin du fichier et le nom de la commande

| Emplacement du fichier                   | Commande générée | Exemple d’appel         |
| ---------------------------------------- | ---------------- | ----------------------- |
| `~/.qwen/commands/test.md`               | `/test`          | `/test Paramètre`       |
| `<projet>/.qwen/commands/git/commit.md`  | `/git:commit`    | `/git:commit Message`   |

Règles de dénomination : Le séparateur de chemin (`/` ou `\`) est remplacé par deux-points (`:`)

### Spécification du format de fichier Markdown (recommandé)

Les commandes personnalisées utilisent des fichiers Markdown avec un en-tête YAML facultatif :

```markdown
---
description: Description facultative (affichée dans /help)
---

Contenu de votre prompt ici.
Utilisez `{{args}}` pour l’injection de paramètres.
```

| Champ         | Obligatoire | Description                                      | Exemple                                     |
| -------------- | ----------- | ------------------------------------------------ | ------------------------------------------- |
| `description`  | Facultatif  | Description de la commande (affichée dans `/help`) | `description: Outil d’analyse de code`      |
| Corps du prompt | Obligatoire | Contenu du prompt envoyé au modèle               | Tout contenu Markdown situé après l’en-tête |

### Format de fichier TOML (obsolète)

> [!warning]
>
> **Obsolète** : Le format TOML est toujours pris en charge, mais sera supprimé dans une version ultérieure. Veuillez migrer vers le format Markdown.

| Champ         | Obligatoire | Description                                     | Exemple                                      |
| -------------- | ----------- | ----------------------------------------------- | -------------------------------------------- |
| `prompt`       | Obligatoire | Contenu de l’invite envoyé au modèle            | `prompt = "Veuillez analyser le code : {{args}}"` |
| `description`  | Facultatif  | Description de la commande (affichée dans `/help`) | `description = "Outil d’analyse de code"`    |

### Mécanisme de traitement des paramètres

| Méthode de traitement         | Syntaxe            | Scénarios applicables                | Fonctionnalités de sécurité            |
| ----------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injection sensible au contexte | `{{args}}`         | Nécessite un contrôle précis des paramètres | Échappement automatique des caractères shell |
| Traitement par défaut des paramètres | Aucun marquage spécial | Commandes simples, ajout de paramètres | Ajout tel quel                         |
| Injection de commande shell   | `!{command}`       | Nécessite un contenu dynamique       | Confirmation d’exécution requise avant |

#### 1. Injection sensible au contexte (`{{args}}`)

| Scénario         | Configuration TOML                      | Méthode d’appel           | Effet réel                    |
| ---------------- | --------------------------------------- | ------------------------- | ----------------------------- |
| Injection brute  | `prompt = "Corriger : {{args}}"`        | `/corriger "Problème de bouton"` | `Corriger : "Problème de bouton"` |
| Dans une commande shell | `prompt = "Rechercher : !{grep {{args}} .}"` | `/rechercher "hello"`     | Exécute `grep "hello" .`      |

#### 2. Traitement par défaut des paramètres

| Situation d’entrée | Méthode de traitement                                      | Exemple                                        |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Paramètres présents  | Ajout à la fin de l’invite (séparés par deux sauts de ligne) | `/cmd paramètre` → Invite d’origine + paramètre |
| Pas de paramètres    | Envoi de l’invite telle quelle                             | `/cmd` → Invite d’origine                       |

🚀 Injection de contenu dynamique

| Type d’insertion        | Syntaxe         | Ordre de traitement | Objectif                                  |
| ----------------------- | --------------- | ------------------- | ----------------------------------------- |
| Contenu de fichier      | `@{chemin/vers/fichier}` | Traitée en premier     | Injecter des fichiers de référence statiques |
| Commandes shell         | `!{commande}`   | Traitée au milieu    | Injecter les résultats d’exécutions dynamiques |
| Remplacement de paramètres | `{{args}}`      | Traitée en dernier   | Injecter les paramètres fournis par l’utilisateur |

#### 3. Exécution de commandes shell (`!{...}`)

| Opération                             | Interaction utilisateur |
| ------------------------------------- | ------------------------- |
| 1. Analyse de la commande et des paramètres | —                         |
| 2. Échappement automatique dans le shell    | —                         |
| 3. Affichage de la boîte de dialogue de confirmation | ✅ Confirmation utilisateur |
| 4. Exécution de la commande                 | —                         |
| 5. Injection de la sortie dans l’invite     | —                         |

Exemple : Génération d’un message de commit Git

````markdown
---
description: Générer un message de commit à partir des modifications mises en staging
---

Veuillez générer un message de commit à partir de la différence suivante :

```diff
!{git diff --staged}
```
````

#### 4. Injection de contenu de fichier (`@{...}`)

| Type de fichier | Statut de prise en charge | Méthode de traitement           |
| --------------- | ------------------------- | -------------------------------- |
| Fichiers texte  | ✅ Prise en charge complète | Injection directe du contenu     |
| Images/PDF      | ✅ Prise en charge multimodale | Encodage puis injection          |
| Fichiers binaires | ⚠️ Prise en charge limitée   | Peuvent être ignorés ou tronqués |
| Répertoire      | ✅ Injection récursive    | Respecte les règles de `.gitignore` |

Exemple : Commande d’analyse de code

```markdown
---
description: Analyse de code fondée sur les bonnes pratiques
---

Analyser {{args}}, en référence aux normes suivantes :

@{docs/code-standards.md}
```

### Exemple pratique de création

#### Tableau des étapes de création de la commande « Refactorisation en fonction pure »

| Opération                        | Commande/code                             |
| -------------------------------- | ----------------------------------------- |
| 1. Créer la structure de répertoires | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Créer le fichier de commande  | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Modifier le contenu de la commande | Se reporter au code complet ci-dessous.         |
| 4. Tester la commande            | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Refactoriser le code en fonction pure
---

Veuillez analyser le code dans le contexte actuel et le refactoriser en une fonction pure.
Exigences :

1. Fournir le code refactorisé
2. Expliquer les modifications clés et la mise en œuvre des caractéristiques d’une fonction pure
3. Conserver la signature de la fonction inchangée
```

### Résumé des bonnes pratiques pour les commandes personnalisées

#### Tableau des recommandations de conception des commandes

| Points pratiques         | Approche recommandée                | À éviter                                          |
| ------------------------ | ----------------------------------- | ------------------------------------------------- |
| Nom des commandes        | Utiliser des espaces de noms pour l’organisation | Éviter les noms trop génériques                 |
| Traitement des paramètres | Utiliser clairement `{{args}}`      | Compter sur l’ajout par défaut (risque de confusion) |
| Gestion des erreurs      | Utiliser la sortie d’erreur du shell | Ignorer les échecs d’exécution                  |
| Organisation des fichiers | Organiser par fonction dans des répertoires | Placer toutes les commandes dans le répertoire racine |
| Champ de description     | Fournir systématiquement une description claire | Compter sur la description générée automatiquement |

#### Tableau de rappel des fonctionnalités de sécurité

| Mécanisme de sécurité     | Effet de protection              | Opération utilisateur       |
| ------------------------- | -------------------------------- | --------------------------- |
| Échappement des commandes shell | Empêche les injections de commandes | Traitement automatique      |
| Confirmation d’exécution  | Évite les exécutions accidentelles | Confirmation via une boîte de dialogue |
| Rapport d’erreurs         | Aide au diagnostic des problèmes | Affichage des informations d’erreur |
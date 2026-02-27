# Commandes

Ce document détaille toutes les commandes prises en charge par Qwen Code, vous aidant à gérer efficacement les sessions, personnaliser l'interface et contrôler son comportement.

Les commandes Qwen Code sont déclenchées via des préfixes spécifiques et se répartissent en trois catégories :

| Type de préfixe            | Description de la fonction                          | Cas d'utilisation typique                                        |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Commandes slash (`/`)      | Contrôle au niveau méta de Qwen Code lui-même       | Gestion des sessions, modification des paramètres, obtention d'aide |
| Commandes arobase (`@`)    | Injection rapide du contenu de fichiers locaux dans la conversation | Permettre à l'IA d'analyser des fichiers ou du code spécifié sous des répertoires |
| Commandes point d'exclamation (`!`) | Interaction directe avec le shell système         | Exécution de commandes système comme `git status`, `ls`, etc.    |

## 1. Commandes slash (`/`)

Les commandes slash sont utilisées pour gérer les sessions Qwen Code, l'interface et le comportement de base.

### 1.1 Gestion des sessions et des projets

Ces commandes vous aident à sauvegarder, restaurer et résumer l'avancement du travail.

| Commande    | Description                                                                 | Exemples d'utilisation               |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `/init`     | Analyser le répertoire actuel et créer un fichier de contexte initial       | `/init`                              |
| `/summary`  | Générer un résumé du projet basé sur l'historique des conversations         | `/summary`                           |
| `/compress` | Remplacer l'historique des discussions par un résumé pour économiser les jetons | `/compress`                          |
| `/resume`   | Reprendre une session de conversation précédente                            | `/resume`                            |
| `/restore`  | Restaurer les fichiers dans l'état précédent à l'exécution de l'outil       | `/restore` (liste) ou `/restore <ID>` |

### 1.2 Interface et contrôle de l'espace de travail

Commandes permettant d'ajuster l'apparence de l'interface et l'environnement de travail.

| Commande     | Description                               | Exemples d'utilisation        |
| ------------ | ----------------------------------------- | ----------------------------- |
| `/clear`     | Effacer le contenu de l'écran du terminal | `/clear` (raccourci : `Ctrl+L`) |
| `/theme`     | Changer le thème visuel de Qwen Code      | `/theme`                      |
| `/vim`       | Activer/désactiver le mode édition Vim dans la zone de saisie | `/vim`                        |
| `/directory` | Gérer l'espace de travail avec prise en charge multi-répertoires | `/dir add ./src,./tests`      |
| `/editor`    | Ouvrir une boîte de dialogue pour sélectionner un éditeur pris en charge | `/editor`                     |

### 1.3 Paramètres de langue

Commandes spécifiques pour contrôler la langue de l'interface et des sorties.

| Commande              | Description                                | Exemples d'utilisation     |
| --------------------- | ------------------------------------------ | -------------------------- |
| `/language`           | Afficher ou modifier les paramètres de langue | `/language`                |
| → `ui [language]`     | Définir la langue de l'interface utilisateur | `/language ui zh-CN`       |
| → `output [language]` | Définir la langue de sortie du LLM         | `/language output Chinese` |

- Langues d'interface intégrées disponibles : `zh-CN` (chinois simplifié), `en-US` (anglais), `ru-RU` (russe), `de-DE` (allemand)
- Exemples de langues de sortie : `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gestion des outils et modèles

Commandes pour gérer les outils et modèles d'IA.

| Commande         | Description                                   | Exemples d'utilisation                        |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| `/mcp`           | Liste les serveurs et outils MCP configurés   | `/mcp`, `/mcp desc`                           |
| `/tools`         | Affiche la liste des outils actuellement disponibles | `/tools`, `/tools desc`                       |
| `/skills`        | Liste et exécute les compétences disponibles  | `/skills`, `/skills <nom>`                    |
| `/approval-mode` | Modifie le mode d'approbation pour l'utilisation des outils | `/approval-mode <mode (auto-edit)> --project` |
| →`plan`          | Analyse uniquement, pas d'exécution           | Revue sécurisée                               |
| →`default`       | Nécessite une approbation pour les modifications | Utilisation quotidienne                         |
| →`auto-edit`     | Approuve automatiquement les modifications    | Environnement de confiance                    |
| →`yolo`          | Approuve automatiquement tout                 | Prototypage rapide                            |
| `/model`         | Change le modèle utilisé dans la session actuelle | `/model`                                      |
| `/extensions`    | Liste toutes les extensions actives dans la session actuelle | `/extensions`                                 |
| `/memory`        | Gère le contexte d'instructions de l'IA       | `/memory add Informations importantes`        |

### 1.5 Informations, paramètres et aide

Commandes permettant d'obtenir des informations et de modifier les paramètres du système.

| Commande    | Description                                          | Exemples d'utilisation           |
| ----------- | ---------------------------------------------------- | -------------------------------- |
| `/help`     | Afficher les informations d'aide pour les commandes disponibles | `/help` ou `/?`                  |
| `/about`    | Afficher les informations de version                 | `/about`                         |
| `/stats`    | Afficher les statistiques détaillées pour la session en cours | `/stats`                         |
| `/settings` | Ouvrir l'éditeur de paramètres                       | `/settings`                      |
| `/auth`     | Changer la méthode d'authentification                | `/auth`                          |
| `/bug`      | Soumettre un problème concernant Qwen Code           | `/bug Button click unresponsive` |
| `/copy`     | Copier le dernier contenu affiché dans le presse-papiers | `/copy`                          |
| `/quit`     | Quitter Qwen Code immédiatement                      | `/quit` ou `/exit`               |

### 1.6 Raccourcis courants

| Raccourci          | Fonction                     | Remarque               |
| ------------------ | ---------------------------- | ---------------------- |
| `Ctrl/cmd+L`       | Effacer l'écran              | Équivalent à `/clear`  |
| `Ctrl/cmd+T`       | Basculer la description outil| Gestion des outils MCP |
| `Ctrl/cmd+C`×2     | Confirmation de sortie       | Mécanisme de sortie sécurisé |
| `Ctrl/cmd+Z`       | Annuler la saisie            | Édition de texte       |
| `Ctrl/cmd+Shift+Z` | Rétablir la saisie           | Édition de texte       |

## 2. Commandes @ (Introduction de fichiers)

Les commandes @ sont utilisées pour ajouter rapidement le contenu d'un fichier ou d'un répertoire local à la conversation.

| Format de commande  | Description                                        | Exemples                                           |
| ------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `@<chemin du fichier>` | Injecter le contenu du fichier spécifié            | `@src/main.py Veuillez expliquer ce code`          |
| `@<chemin du répertoire>` | Lire récursivement tous les fichiers texte du répertoire | `@docs/ Résumez le contenu de ce document`         |
| `@` autonome        | Utilisé lorsqu'on discute du symbole `@` lui-même  | `@ À quoi sert ce symbole en programmation ?`      |

Remarque : Les espaces dans les chemins doivent être échappés avec une barre oblique inversée (par exemple, `@Mon\ Documents/fichier.txt`)

## 3. Commandes d'exclamation (`!`) - Exécution de commandes Shell

Les commandes d'exclamation vous permettent d'exécuter directement des commandes système dans Qwen Code.

| Format de commande | Description                                                                 | Exemples                               |
| ------------------ | --------------------------------------------------------------------------- | -------------------------------------- |
| `!<commande shell>`| Exécute la commande dans un sous-shell                                      | `!ls -la`, `!git status`               |
| `!` autonome       | Passe en mode shell, toute entrée est exécutée directement comme commande shell | `!`(entrée) → Saisir la commande → `!`(sortie) |

Variables d'environnement : Les commandes exécutées via `!` définissent la variable d'environnement `QWEN_CODE=1`.

## 4. Commandes personnalisées

Enregistrez les invites fréquemment utilisées en tant que commandes raccourcies pour améliorer l'efficacité du travail et garantir la cohérence.

> [!note]
>
> Les commandes personnalisées utilisent désormais le format Markdown avec un frontmatter YAML facultatif. Le format TOML est obsolète mais toujours pris en charge pour des raisons de compatibilité ascendante. Lorsque des fichiers TOML sont détectés, une invite de migration automatique s'affichera.

### Aperçu rapide

| Fonction           | Description                                      | Avantages                              | Priorité | Scénarios applicables                                  |
| ------------------ | ------------------------------------------------ | -------------------------------------- | -------- | ------------------------------------------------------ |
| Espace de noms     | Le sous-répertoire crée des commandes avec deux points | Meilleure organisation des commandes   |          |                                                        |
| Commandes globales | `~/.qwen/commands/`                              | Disponibles dans tous les projets      | Faible   | Commandes personnelles fréquemment utilisées, usage inter-projets |
| Commandes projet   | `<répertoire racine du projet>/.qwen/commands/`  | Spécifiques au projet, contrôlables par version | Élevée   | Partage en équipe, commandes spécifiques au projet     |

Règles de priorité : Les commandes projet ont priorité sur les commandes utilisateur (la commande projet est utilisée lorsque les noms sont identiques)

### Règles de nommage des commandes

#### Tableau de correspondance entre le chemin du fichier et le nom de la commande

| Emplacement du fichier                   | Commande générée  | Exemple d'appel       |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Paramètre`     |
| `<projet>/.qwen/commands/git/commit.md`  | `/git:commit`     | `/git:commit Message` |

Règles de nommage : Le séparateur de chemin (`/` ou `\`) est converti en deux-points (`:`)

### Spécification du format de fichier Markdown (Recommandé)

Les commandes personnalisées utilisent des fichiers Markdown avec un frontmatter YAML facultatif :

```markdown
---
description: Description facultative (affichée dans /help)
---

Votre contenu de prompt ici.
Utilisez {{args}} pour l'injection de paramètres.
```

| Champ         | Requis   | Description                               | Exemple                                   |
| ------------- | -------- | ----------------------------------------- | ----------------------------------------- |
| `description` | Facultatif | Description de la commande (affichée dans /help) | `description: Outil d'analyse de code`    |
| Corps du prompt | Requis   | Contenu du prompt envoyé au modèle        | Tout contenu Markdown après le frontmatter |

### Format de fichier TOML (Obsolète)

> [!warning]
>
> **Obsolète :** Le format TOML est toujours pris en charge mais sera supprimé dans une version future. Veuillez migrer vers le format Markdown.

| Champ         | Requis   | Description                              | Exemple                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `prompt`      | Requis   | Contenu de l'invite envoyé au modèle     | `prompt = "Veuillez analyser le code : {{args}}"` |
| `description` | Facultatif | Description de la commande (affichée dans /help) | `description = "Outil d'analyse de code"`       |

### Mécanisme de traitement des paramètres

| Méthode de traitement        | Syntaxe            | Scénarios applicables                | Fonctionnalités de sécurité            |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injection consciente du contexte | `{{args}}`         | Besoin d'un contrôle précis des paramètres | Échappement automatique du shell       |
| Traitement par défaut des paramètres | Pas de marquage spécial | Commandes simples, ajout de paramètres | Ajout tel quel                          |
| Injection de commande shell  | `!{command}`       | Besoin de contenu dynamique          | Confirmation d'exécution requise avant |

#### 1. Injection sensible au contexte (`{{args}}`)

| Scénario         | Configuration TOML                    | Méthode d'appel       | Effet réel               |
| ---------------- | ------------------------------------- | --------------------- | ------------------------ |
| Injection brute  | `prompt = "Corriger : {{args}}"`      | `/fix "Problème bouton"` | `Corriger : "Problème bouton"` |
| Dans commande shell | `prompt = "Rechercher : !{grep {{args}} .}"` | `/search "bonjour"`   | Exécuter `grep "bonjour" .` |

#### 2. Traitement par défaut des paramètres

| Situation d'entrée | Méthode de traitement                                | Exemple                                        |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------- |
| A des paramètres   | Ajouter à la fin de l'invite (séparé par deux sauts de ligne) | `/cmd paramètre` → Invite originale + paramètre |
| N'a pas de paramètres | Envoyer l'invite telle quelle                        | `/cmd` → Invite originale                      |

🚀 Injection de contenu dynamique

| Type d'injection      | Syntaxe        | Ordre de traitement | Objectif                                     |
| --------------------- | -------------- | ------------------- | -------------------------------------------- |
| Contenu de fichier    | `@{chemin du fichier}` | Traitée en premier  | Injecter des fichiers de référence statiques |
| Commandes shell       | `!{commande}`  | Traitée au milieu   | Injecter les résultats d'exécution dynamiques |
| Remplacement de paramètres | `{{args}}`     | Traitée en dernier  | Injecter les paramètres utilisateur          |

#### 3. Exécution de commande shell (`!{...}`)

| Opération                        | Interaction utilisateur |
| -------------------------------- | ----------------------- |
| 1. Analyser la commande et les paramètres | -                       |
| 2. Échappement automatique du shell     | -                       |
| 3. Afficher la boîte de dialogue de confirmation | ✅ Confirmation de l'utilisateur |
| 4. Exécuter la commande                 | -                       |
| 5. Injecter la sortie dans l'invite     | -                       |

Exemple : Génération du message de commit Git

````markdown
---
description: Générer un message de commit basé sur les modifications stagées
---

Veuillez générer un message de commit basé sur le diff suivant :

```diff
!{git diff --staged}
```
````

#### 4. Injection de contenu de fichier (`@{...}`)

| Type de fichier | Statut de prise en charge | Méthode de traitement         |
| --------------- | ------------------------- | ----------------------------- |
| Fichiers texte  | ✅ Prise en charge complète | Injection directe du contenu  |
| Images/PDF      | ✅ Prise en charge multimodale | Encodage et injection         |
| Fichiers binaires | ⚠️ Prise en charge limitée | Peut être ignoré ou tronqué   |
| Répertoire      | ✅ Injection récursive    | Respecte les règles .gitignore |

Exemple : Commande d'examen de code

```markdown
---
description: Examen de code basé sur les meilleures pratiques
---

Examiner {{args}}, références aux normes :

@{docs/code-standards.md}
```

### Exemple pratique de création

#### Tableau des étapes de création de la commande "Refactoring de fonction pure"

| Opération                   | Commande/Code                               |
| --------------------------- | ------------------------------------------- |
| 1. Créer la structure de répertoires | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Créer le fichier de commande     | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Éditer le contenu de la commande | Référez-vous au code complet ci-dessous.  |
| 4. Tester la commande               | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Refactoriser le code en fonction pure
---

Veuillez analyser le code dans le contexte actuel et le refactoriser en fonction pure.
Exigences :

1. Fournir le code refactorisé
2. Expliquer les changements clés et l'implémentation des caractéristiques de la fonction pure
3. Maintenir la fonction inchangée
```

### Résumé des meilleures pratiques pour les commandes personnalisées

#### Tableau des recommandations pour la conception de commandes

| Points de pratique   | Approche recommandée                | À éviter                                    |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Nommage des commandes| Utiliser des espaces de noms pour l'organisation | Éviter les noms trop génériques           |
| Traitement des paramètres | Utiliser clairement `{{args}}`   | S'appuyer sur l'ajout par défaut (source de confusion) |
| Gestion des erreurs  | Utiliser la sortie d'erreur du shell| Ignorer l'échec de l'exécution              |
| Organisation des fichiers | Organiser par fonctionnalité dans des répertoires | Toutes les commandes dans le répertoire racine |
| Champ de description | Toujours fournir une description claire | S'appuyer sur une description générée automatiquement |

#### Tableau de rappel des fonctionnalités de sécurité

| Mécanisme de sécurité  | Effet de protection        | Opération utilisateur  |
| ---------------------- | -------------------------- | ---------------------- |
| Échappement du shell   | Prévenir l'injection de commandes | Traitement automatique |
| Confirmation d'exécution | Éviter l'exécution accidentelle | Confirmation par dialogue |
| Rapport d'erreurs      | Aider au diagnostic des problèmes | Affichage des informations d'erreur |
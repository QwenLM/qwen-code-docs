# Commandes

Ce document détaille toutes les commandes prises en charge par Qwen Code, afin de vous aider à gérer efficacement les sessions, personnaliser l'interface et contrôler son comportement.

Les commandes de Qwen Code sont déclenchées via des préfixes spécifiques et se répartissent en trois catégories :

| Type de préfixe             | Description de la fonction                          | Cas d'utilisation typique                                          |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Commandes Slash (`/`)       | Contrôle de Qwen Code au niveau méta                 | Gestion des sessions, modification des paramètres, obtention d'aide |
| Commandes At (`@`)          | Injection rapide du contenu d'un fichier local dans la conversation | Permettre à l'IA d'analyser des fichiers ou du code spécifié dans des répertoires |
| Commandes Exclamation (`!`) | Interaction directe avec le Shell système            | Exécution de commandes système telles que `git status`, `ls`, etc. |

## 1. Commandes Slash (`/`)

Les commandes slash sont utilisées pour gérer les sessions, l'interface et le comportement de base de Qwen Code.

### 1.1 Gestion des Sessions et des Projets

Ces commandes vous aident à sauvegarder, restaurer et résumer l'avancement du travail.

| Commande    | Description                                              | Exemples d'utilisation                |
| ----------- | -------------------------------------------------------- | ------------------------------------- |
| `/summary`  | Génère un résumé du projet basé sur l'historique de conversation | `/summary`                           |
| `/compress` | Remplace l'historique de discussion par un résumé pour économiser des Tokens | `/compress`                          |
| `/restore`  | Restaure les fichiers à leur état précédent à l'exécution de l'outil | `/restore` (liste) ou `/restore <ID>` |
| `/init`     | Analyse le répertoire actuel et crée un fichier de contexte initial | `/init`                              |

### 1.2 Contrôle de l'interface et de l'espace de travail

Commandes permettant d'ajuster l'apparence de l'interface et l'environnement de travail.

| Commande     | Description                                      | Exemples d'utilisation          |
| ------------ | ------------------------------------------------ | ------------------------------- |
| `/clear`     | Effacer le contenu de l'écran du terminal        | `/clear` (raccourci : `Ctrl+L`) |
| `/theme`     | Changer le thème visuel de Qwen Code             | `/theme`                        |
| `/vim`       | Activer/désactiver le mode d'édition Vim dans la zone de saisie | `/vim`                        |
| `/directory` | Gérer les espaces de travail avec prise en charge de plusieurs répertoires | `/dir add ./src,./tests`      |
| `/editor`    | Ouvrir une boîte de dialogue pour sélectionner un éditeur pris en charge | `/editor`                     |

### 1.3 Paramètres de langue

Commandes spécifiquement destinées à contrôler la langue de l'interface et la langue de sortie.

| Commande              | Description                           | Exemples d'utilisation     |
| --------------------- | ------------------------------------- | -------------------------- |
| `/language`           | Afficher ou modifier les paramètres de langue | `/language`                |
| → `ui [langue]`       | Définir la langue de l'interface utilisateur | `/language ui zh-CN`       |
| → `output [langue]`   | Définir la langue de sortie du LLM    | `/language output Chinese` |

- Langues d'interface disponibles : `zh-CN` (chinois simplifié), `en-US` (anglais)
- Exemples de langues de sortie : `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gestion des outils et des modèles

Commandes pour gérer les outils et les modèles d'IA.

| Commande         | Description                                   | Exemples d'utilisation                        |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| `/mcp`           | Liste les serveurs et outils MCP configurés   | `/mcp`, `/mcp desc`                           |
| `/tools`         | Affiche la liste des outils disponibles       | `/tools`, `/tools desc`                       |
| `/approval-mode` | Modifie le mode d'approbation pour l'usage des outils | `/approval-mode <mode (auto-edit)> --project` |
| →`plan`          | Analyse uniquement, pas d'exécution           | Revue sécurisée                               |
| →`default`       | Nécessite une approbation pour les modifications | Usage quotidien                              |
| →`auto-edit`     | Approuve automatiquement les modifications    | Environnement de confiance                    |
| →`yolo`          | Approuve automatiquement tout                 | Prototypage rapide                            |
| `/model`         | Change le modèle utilisé dans la session actuelle | `/model`                                  |
| `/extensions`    | Liste toutes les extensions actives dans la session actuelle | `/extensions`                     |
| `/memory`        | Gère le contexte d'instructions de l'IA        | `/memory add Information importante`          |

### 1.5 Informations, Paramètres et Aide

Commandes pour obtenir des informations et effectuer des réglages système.

| Commande        | Description                                        | Exemples d'utilisation                          |
| --------------- | -------------------------------------------------- | ----------------------------------------------- |
| `/help`         | Afficher les informations d'aide sur les commandes disponibles | `/help` ou `/?`                                 |
| `/about`        | Afficher les informations de version               | `/about`                                        |
| `/stats`        | Afficher les statistiques détaillées de la session en cours | `/stats`                                        |
| `/settings`     | Ouvrir l'éditeur de paramètres                     | `/settings`                                     |
| `/auth`         | Changer la méthode d'authentification              | `/auth`                                         |
| `/bug`          | Soumettre un problème concernant Qwen Code         | `/bug Le bouton ne répond pas au clic`          |
| `/copy`         | Copier le dernier contenu de sortie dans le presse-papiers | `/copy`                                         |
| `/quit-confirm` | Afficher une boîte de dialogue de confirmation avant de quitter | `/quit-confirm` (raccourci : appuyer deux fois sur `Ctrl+C`) |
| `/quit`         | Quitter immédiatement Qwen Code                    | `/quit` ou `/exit`                              |

### 1.6 Raccourcis courants

| Raccourci          | Fonction                 | Note                     |
| ------------------ | ------------------------ | ------------------------ |
| `Ctrl/cmd+L`       | Effacer l'écran          | Équivalent à `/clear`    |
| `Ctrl/cmd+T`       | Basculer la description de l'outil | Gestion des outils MCP   |
| `Ctrl/cmd+C`×2     | Confirmation de sortie   | Mécanisme de sortie sécurisé |
| `Ctrl/cmd+Z`       | Annuler la saisie        | Édition de texte         |
| `Ctrl/cmd+Shift+Z` | Rétablir la saisie       | Édition de texte         |

## 2. Commandes @ (Introduction de fichiers)

Les commandes @ sont utilisées pour ajouter rapidement le contenu d'un fichier ou d'un répertoire local à la conversation.

| Format de commande   | Description                                      | Exemples                                           |
| -------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `@<chemin_fichier>`  | Injecte le contenu du fichier spécifié           | `@src/main.py Veuillez expliquer ce code`          |
| `@<chemin_répertoire>` | Lit récursivement tous les fichiers texte du répertoire | `@docs/ Résumez le contenu de ce document`         |
| `@` seul             | Utilisé lorsqu'on discute du symbole `@` lui-même | `@ À quoi sert ce symbole en programmation ?`      |

Remarque : Les espaces dans les chemins doivent être échappés avec une barre oblique inverse (ex. : `@Mes\ Documents/fichier.txt`)

## 3. Commandes d’exclamation (`!`) - Exécution de commandes Shell

Les commandes d’exclamation vous permettent d’exécuter directement des commandes système dans Qwen Code.

| Format de commande | Description                                                  | Exemples                          |
| ------------------ | ------------------------------------------------------------ | --------------------------------- |
| `!<commande shell>` | Exécute la commande dans un sous-shell                       | `!ls -la`, `!git status`          |
| `!` seul           | Active le mode Shell, toute entrée est exécutée comme commande Shell | `!`(entrée) → Saisir commande → `!`(sortie) |

Variables d’environnement : Les commandes exécutées via `!` définissent la variable d’environnement `QWEN_CODE=1`.

## 4. Commandes personnalisées

Enregistrez les invites fréquemment utilisées en tant que commandes raccourcies pour améliorer l'efficacité du travail et garantir la cohérence.

### Aperçu rapide

| Fonction         | Description                                      | Avantages                              | Priorité | Scénarios applicables                                  |
| ---------------- | ------------------------------------------------ | -------------------------------------- | -------- | ------------------------------------------------------ |
| Espace de noms   | Le sous-répertoire crée des commandes nommées avec deux-points | Meilleure organisation des commandes   |          |                                                        |
| Commandes globales | `~/.qwen/commands/`                            | Disponibles dans tous les projets      | Faible   | Commandes personnelles fréquemment utilisées, usage inter-projets |
| Commandes de projet | `<répertoire racine du projet>/.qwen/commands/` | Spécifiques au projet, contrôlables par version | Élevée   | Partage d'équipe, commandes spécifiques au projet       |

Règles de priorité : Commandes de projet > Commandes utilisateur (la commande de projet est utilisée lorsque les noms sont identiques)

### Règles de nommage des commandes

#### Tableau de correspondance entre le chemin du fichier et le nom de la commande

| Emplacement du fichier       | Commande générée  | Exemple d'appel       |
| ---------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.toml` | `/test`           | `/test Paramètre`     |
| `<projet>/git/commit.toml`   | `/git:commit`     | `/git:commit Message` |

Règles de nommage : Le séparateur de chemin (`/` ou `\`) est converti en deux-points (`:`)

### Spécification du format de fichier TOML

| Champ         | Requis   | Description                                         | Exemple                                     |
| ------------- | -------- | --------------------------------------------------- | ------------------------------------------- |
| `prompt`      | Requis   | Contenu de l'invite envoyé au modèle                | `prompt = "Veuillez analyser le code : {{args}}"` |
| `description` | Optionnel| Description de la commande (affichée dans /help)    | `description = "Outil d'analyse de code"`    |

### Mécanisme de Traitement des Paramètres

| Méthode de Traitement        | Syntaxe            | Scénarios Applicables                | Fonctionnalités de Sécurité            |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injection Contextuelle       | `{{args}}`         | Nécessite un contrôle précis des paramètres | Échappement Shell automatique          |
| Traitement par Défaut des Paramètres | Pas de marquage spécial | Commandes simples, ajout de paramètres | Ajout tel quel                         |
| Injection de Commande Shell  | `!{command}`       | Nécessite du contenu dynamique       | Confirmation d'exécution requise avant |

#### 1. Injection contextuelle (`{{args}}`)

| Scénario             | Configuration TOML                     | Méthode d'appel       | Effet réel               |
| -------------------- | -------------------------------------- | --------------------- | ------------------------ |
| Injection brute      | `prompt = "Fix: {{args}}"`             | `/fix "Button issue"` | `Fix: "Button issue"`    |
| Dans une commande shell | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Exécute `grep "hello" .` |

#### 2. Traitement des paramètres par défaut

| Situation d'entrée | Méthode de traitement                                  | Exemple                                        |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| Avec paramètres    | Ajout à la fin de l'invite (séparé par deux sauts de ligne) | `/cmd paramètre` → Invite originale + paramètre |
| Sans paramètres    | Envoi de l'invite telle quelle                           | `/cmd` → Invite originale                      |

🚀 Injection de contenu dynamique

| Type d'injection       | Syntaxe        | Ordre de traitement     | Objectif                         |
| ---------------------- | -------------- | ----------------------- | -------------------------------- |
| Contenu de fichier     | `@{chemin_fichier}` | Traité en premier     | Injecter des fichiers de référence statiques |
| Commandes shell        | `!{commande}`  | Traité au milieu        | Injecter les résultats d'exécution dynamiques |
| Remplacement paramètre | `{{args}}`     | Traité en dernier       | Injecter les paramètres utilisateur |

#### 3. Exécution de commandes Shell (`!{...}`)

| Opération                          | Interaction utilisateur  |
| ---------------------------------- | ------------------------ |
| 1. Analyser la commande et les paramètres | -                        |
| 2. Échappement automatique du Shell    | -                        |
| 3. Afficher une boîte de dialogue de confirmation | ✅ Confirmation de l'utilisateur |
| 4. Exécuter la commande              | -                        |
| 5. Injecter la sortie dans l'invite   | -                        |

Exemple : Génération de message de commit Git

```

# git/commit.toml
description = "Générer un message de commit basé sur les modifications indexées"
prompt = """
Veuillez générer un message de commit basé sur le diff suivant :
diff
!{git diff --staged}
"""
```

#### 4. Injection de Contenu de Fichier (`@{...}`)

| Type de Fichier | Statut de Support      | Méthode de Traitement       |
| --------------- | ---------------------- | --------------------------- |
| Fichiers Texte  | ✅ Support Complet     | Injecter directement le contenu |
| Images/PDF      | ✅ Support Multi-modal | Encoder et injecter         |
| Fichiers Binaires | ⚠️ Support Limité    | Peut être ignoré ou tronqué |
| Répertoire      | ✅ Injection Récursive | Suivre les règles de .gitignore |

Exemple : Commande d'Examen de Code

```

# review.toml
description = "Examen du code basé sur les bonnes pratiques"
prompt = """
Examiner {{args}}, référencer les normes :

@{docs/code-standards.md}
"""
```

### Exemple de Création Pratique

#### Tableau des étapes de création de la commande "Pure Function Refactoring"

| Opération                          | Commande/Code                                      |
| ---------------------------------- | -------------------------------------------------- |
| 1. Créer la structure de répertoires | `mkdir -p ~/.qwen/commands/refactor`               |
| 2. Créer le fichier de commande      | `touch ~/.qwen/commands/refactor/pure.toml`        |
| 3. Modifier le contenu de la commande| Voir le code complet ci-dessous.                   |
| 4. Tester la commande                | `@file.js` → `/refactor:pure`                      |

```# ~/.qwen/commands/refactor/pure.toml
description = "Refactoriser le code en fonction pure"
prompt = """
	Analysez le code dans le contexte actuel et refactorisez-le en fonction pure.
	Exigences :
		1. Fournir le code refactorisé
		2. Expliquer les changements clés et l'implémentation des caractéristiques d'une fonction pure
		3. Conserver la fonction inchangée
	"""
```

### Résumé des bonnes pratiques pour les commandes personnalisées

#### Tableau des recommandations de conception des commandes

| Points de pratique    | Approche recommandée                 | À éviter                                    |
| --------------------- | ------------------------------------ | ------------------------------------------- |
| Nom des commandes     | Utiliser des espaces de noms pour l'organisation | Éviter les noms trop génériques             |
| Traitement des paramètres | Utiliser clairement `{{args}}`       | S'appuyer sur l'ajout par défaut (facilement confusable) |
| Gestion des erreurs   | Utiliser la sortie d'erreur du Shell | Ignorer les échecs d'exécution              |
| Organisation des fichiers | Organiser par fonction dans des répertoires | Toutes les commandes dans le répertoire racine |
| Champ de description  | Toujours fournir une description claire | S'appuyer sur une description auto-générée  |

#### Tableau de rappel des fonctionnalités de sécurité

| Mécanisme de sécurité  | Effet de protection        | Opération utilisateur  |
| ---------------------- | -------------------------- | ---------------------- |
| Échappement shell      | Prévenir l'injection de commandes | Traitement automatique |
| Confirmation d'exécution | Éviter l'exécution accidentelle | Confirmation par dialogue |
| Rapport d'erreurs      | Aider au diagnostic des problèmes | Afficher les informations d'erreur |
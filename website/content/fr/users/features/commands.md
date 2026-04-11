# Commandes

Ce document détaille toutes les commandes prises en charge par Qwen Code, pour vous aider à gérer efficacement les sessions, personnaliser l'interface et contrôler son comportement.

Les commandes Qwen Code sont déclenchées via des préfixes spécifiques et se divisent en trois catégories :

| Type de préfixe                | Description de la fonction                                | Cas d'utilisation typique                                                 |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Commandes Slash (`/`)       | Contrôle de haut niveau de Qwen Code lui-même              | Gestion des sessions, modification des paramètres, obtention d'aide              |
| Commandes At (`@`)          | Injection rapide du contenu de fichiers locaux dans la conversation | Permettre à l'IA d'analyser des fichiers ou du code dans des répertoires spécifiés |
| Commandes Exclamation (`!`) | Interaction directe avec le Shell système                | Exécution de commandes système comme `git status`, `ls`, etc.          |

## 1. Commandes Slash (`/`)

Les commandes slash servent à gérer les sessions, l'interface et le comportement de base de Qwen Code.

### 1.1 Gestion des sessions et des projets

Ces commandes vous aident à sauvegarder, restaurer et résumer la progression du travail.

| Commande     | Description                                               | Exemples d'utilisation                       |
| ----------- | --------------------------------------------------------- | ------------------------------------ |
| `/init`     | Analyser le répertoire courant et créer un fichier de contexte initial | `/init`                              |
| `/summary`  | Générer un résumé du projet basé sur l'historique des conversations    | `/summary`                           |
| `/compress` | Remplacer l'historique du chat par un résumé pour économiser des Tokens          | `/compress`                          |
| `/resume`   | Reprendre une session de conversation précédente                    | `/resume`                            |
| `/restore`  | Restaurer les fichiers à l'état antérieur à l'exécution de l'outil              | `/restore` (liste) ou `/restore <ID>` |

### 1.2 Contrôle de l'interface et de l'espace de travail

Commandes pour ajuster l'apparence de l'interface et l'environnement de travail.

| Commande      | Description                              | Exemples d'utilisation                |
| ------------ | ---------------------------------------- | ----------------------------- |
| `/clear`     | Effacer le contenu de l'écran du terminal            | `/clear` (raccourci : `Ctrl+L`) |
| `/context`   | Afficher la répartition de l'utilisation de la fenêtre de contexte      | `/context`                    |
| → `detail`   | Afficher la répartition détaillée par élément    | `/context detail`             |
| `/theme`     | Changer le thème visuel de Qwen Code            | `/theme`                      |
| `/vim`       | Activer/désactiver le mode d'édition Vim dans la zone de saisie  | `/vim`                        |
| `/directory` | Gérer l'espace de travail avec prise en charge multi-répertoires | `/dir add ./src,./tests`      |
| `/editor`    | Ouvrir une boîte de dialogue pour sélectionner l'éditeur pris en charge   | `/editor`                     |

### 1.3 Paramètres de langue

Commandes dédiées au contrôle de la langue de l'interface et des sorties.

| Commande               | Description                      | Exemples d'utilisation             |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | Afficher ou modifier les paramètres de langue | `/language`                |
| → `ui [language]`     | Définir la langue de l'interface utilisateur        | `/language ui zh-CN`       |
| → `output [language]` | Définir la langue de sortie du LLM          | `/language output Chinese` |

- Langues d'interface intégrées disponibles : `zh-CN` (chinois simplifié), `en-US` (anglais), `ru-RU` (russe), `de-DE` (allemand)
- Exemples de langues de sortie : `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gestion des outils et des modèles

Commandes pour gérer les outils et modèles d'IA.

| Commande          | Description                                   | Exemples d'utilisation                                |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| `/mcp`           | Lister les serveurs et outils MCP configurés         | `/mcp`, `/mcp desc`                           |
| `/tools`         | Afficher la liste des outils actuellement disponibles         | `/tools`, `/tools desc`                       |
| `/skills`        | Lister et exécuter les skills disponibles                 | `/skills`, `/skills <name>`                   |
| `/plan`          | Basculer en mode plan ou quitter le mode plan         | `/plan`, `/plan <task>`, `/plan exit`         |
| `/approval-mode` | Changer le mode d'approbation pour l'utilisation des outils           | `/approval-mode <mode (auto-edit)> --project` |
| →`plan`          | Analyse uniquement, sans exécution                   | Revue sécurisée                                 |
| →`default`       | Exiger une approbation pour les modifications                    | Usage quotidien                                     |
| →`auto-edit`     | Approuver automatiquement les modifications                   | Environnement de confiance                           |
| →`yolo`          | Tout approuver automatiquement                     | Prototypage rapide                             |
| `/model`         | Changer le modèle utilisé dans la session courante          | `/model`                                      |
| `/model --fast`  | Définir un modèle plus léger pour les suggestions de prompt    | `/model --fast qwen3-coder-flash`             |
| `/extensions`    | Lister toutes les extensions actives dans la session courante | `/extensions`                                 |
| `/memory`        | Gérer le contexte d'instructions de l'IA               | `/memory add Important Info`                  |

### 1.5 Skills intégrés

Ces commandes invoquent des skills intégrés qui fournissent des workflows spécialisés.

| Commande      | Description                                                         | Exemples d'utilisation                                    |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------- |
| `/review`    | Examiner les modifications de code avec 5 agents parallèles + analyse déterministe | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`      | Exécuter un prompt selon une planification récurrente                                | `/loop 5m check the build`                        |
| `/qc-helper` | Répondre aux questions sur l'utilisation et la configuration de Qwen Code            | `/qc-helper how do I configure MCP?`              |

Consultez la documentation complète de `/review` dans [Code Review](./code-review.md).

### 1.6 Question annexe (`/btw`)

La commande `/btw` vous permet de poser des questions annexes rapides sans interrompre ni affecter le flux de la conversation principale.

| Commande                | Description                           |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | Poser une question annexe rapide             |
| `?btw <your question>` | Syntaxe alternative pour les questions annexes |

**Fonctionnement :**

- La question annexe est envoyée via un appel API distinct avec le contexte de conversation récent (jusqu'aux 20 derniers messages)
- La réponse s'affiche au-dessus du Composer — vous pouvez continuer à taper pendant l'attente
- La conversation principale n'est **pas bloquée** — elle se poursuit indépendamment
- La réponse à la question annexe ne fait **pas** partie de l'historique de la conversation principale
- Les réponses sont rendues avec une prise en charge complète du Markdown (blocs de code, listes, tableaux, etc.)

**Raccourcis clavier (Mode interactif) :**

| Raccourci             | Action                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Annuler (pendant le chargement) ou fermer (une fois terminé) |
| `Space` ou `Enter`   | Fermer la réponse (lorsque la saisie est vide)            |
| `Ctrl+C` ou `Ctrl+D` | Annuler une question annexe en cours                   |

**Exemple :**

```
(Pendant que la conversation principale porte sur le refactoring de code)

> /btw Quelle est la différence entre let et var en JavaScript ?

  ╭──────────────────────────────────────────╮
  │ /btw Quelle est la différence entre let  │
  │     et var en JavaScript ?               │
  │                                          │
  │ + Réponse en cours...                    │
  │ Appuyez sur Escape, Ctrl+C ou Ctrl+D     │
  │ pour annuler                             │
  ╰──────────────────────────────────────────╯
  > (Le Composer reste actif — continuez à taper)

(Une fois la réponse arrivée)

  ╭──────────────────────────────────────────╮
  │ /btw Quelle est la différence entre let  │
  │     et var en JavaScript ?               │
  │                                          │
  │ `let` a une portée de bloc, tandis que   │
  │ `var` a une portée de fonction. `let` a  │
  │ été introduit dans ES6 et ne subit pas   │
  │ le hoisting de la même manière.          │
  │                                          │
  │ Appuyez sur Espace, Entrée ou Escape     │
  │ pour fermer                              │
  ╰──────────────────────────────────────────╯
  > (Le Composer est toujours actif)
```

**Modes d'exécution pris en charge :**

| Mode                 | Comportement                                     |
| -------------------- | -------------------------------------------- |
| Interactif          | S'affiche au-dessus du Composer avec rendu Markdown |
| Non-interactif      | Retourne un résultat texte : `btw> question\nanswer` |
| ACP (Agent Protocol) | Retourne un générateur asynchrone `stream_messages`      |

> [!tip]
>
> Utilisez `/btw` lorsque vous avez besoin d'une réponse rapide sans perdre le fil de votre tâche principale. C'est particulièrement utile pour clarifier des concepts, vérifier des faits ou obtenir des explications rapides tout en restant concentré sur votre workflow principal.

### 1.7 Informations, paramètres et aide

Commandes pour obtenir des informations et configurer le système.

| Commande     | Description                                     | Exemples d'utilisation                   |
| ----------- | ----------------------------------------------- | -------------------------------- |
| `/help`     | Afficher l'aide pour les commandes disponibles | `/help` ou `/?`                  |
| `/about`    | Afficher les informations de version                     | `/about`                         |
| `/stats`    | Afficher les statistiques détaillées de la session courante | `/stats`                         |
| `/settings` | Ouvrir l'éditeur de paramètres                            | `/settings`                      |
| `/auth`     | Changer la méthode d'authentification                    | `/auth`                          |
| `/bug`      | Soumettre un problème concernant Qwen Code                    | `/bug Button click unresponsive` |
| `/copy`     | Copier le contenu de la dernière sortie dans le presse-papiers           | `/copy`                          |
| `/quit`     | Quitter Qwen Code immédiatement                      | `/quit` ou `/exit`               |

### 1.8 Raccourcis courants

| Raccourci           | Fonction                | Note                   |
| ------------------ | ----------------------- | ---------------------- |
| `Ctrl/cmd+L`       | Effacer l'écran            | Équivalent à `/clear` |
| `Ctrl/cmd+T`       | Basculer la description des outils | Gestion des outils MCP    |
| `Ctrl/cmd+C`×2     | Confirmation de sortie       | Mécanisme de sortie sécurisé  |
| `Ctrl/cmd+Z`       | Annuler la saisie              | Édition de texte           |
| `Ctrl/cmd+Shift+Z` | Rétablir la saisie              | Édition de texte           |

### 1.9 Sous-commandes CLI d'authentification

En plus de la commande slash `/auth` en session, Qwen Code propose des sous-commandes CLI autonomes pour gérer l'authentification directement depuis le terminal :

| Commande                                              | Description                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | Configuration interactive de l'authentification                  |
| `qwen auth qwen-oauth`                               | Authentification via Qwen OAuth                      |
| `qwen auth coding-plan`                              | Authentification via Alibaba Cloud Coding Plan       |
| `qwen auth coding-plan --region china --key sk-sp-…` | Configuration non interactive du Coding Plan (pour les scripts) |
| `qwen auth status`                                   | Afficher l'état actuel de l'authentification                |

> [!tip]
>
> Ces commandes s'exécutent en dehors d'une session Qwen Code. Utilisez-les pour configurer l'authentification avant de démarrer une session, ou dans des scripts et environnements CI. Consultez la page [Authentication](../configuration/auth) pour plus de détails.

## 2. Commandes @ (Injection de fichiers)

Les commandes @ servent à ajouter rapidement le contenu d'un fichier ou d'un répertoire local à la conversation.

| Format de commande      | Description                                  | Exemples                                         |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| `@<file path>`      | Injecter le contenu du fichier spécifié             | `@src/main.py Please explain this code`          |
| `@<directory path>` | Lire récursivement tous les fichiers texte du répertoire | `@docs/ Summarize content of this document`      |
| `@` seul      | Utilisé pour discuter du symbole `@` lui-même       | `@ What is this symbol used for in programming?` |

Remarque : Les espaces dans les chemins doivent être échappés avec un antislash (ex. : `@My\ Documents/file.txt`)

## 3. Commandes Exclamation (`!`) - Exécution de commandes Shell

Les commandes exclamation vous permettent d'exécuter des commandes système directement dans Qwen Code.

| Format de commande     | Description                                                        | Exemples                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<shell command>` | Exécuter la commande dans un sous-Shell                                       | `!ls -la`, `!git status`               |
| `!` seul     | Basculer en mode Shell, toute saisie est exécutée directement comme commande Shell | `!`(entrer) → Saisir commande → `!`(quitter) |

Variables d'environnement : Les commandes exécutées via `!` définiront la variable d'environnement `QWEN_CODE=1`.

## 4. Commandes personnalisées

Enregistrez les prompts fréquemment utilisés sous forme de commandes raccourcies pour améliorer l'efficacité et garantir la cohérence.

> [!note]
>
> Les commandes personnalisées utilisent désormais le format Markdown avec un frontmatter YAML optionnel. Le format TOML est déprécié mais reste pris en charge pour la rétrocompatibilité. Lorsqu'un fichier TOML est détecté, une invite de migration automatique s'affichera.

### Aperçu rapide

| Fonction         | Description                                | Avantages                             | Priorité | Cas d'utilisation                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Espace de noms        | Les sous-répertoires créent des commandes nommées avec deux-points  | Meilleure organisation des commandes            |          |                                                      |
| Commandes globales  | `~/.qwen/commands/`                        | Disponibles dans tous les projets              | Faible      | Commandes personnelles fréquentes, utilisation multi-projets |
| Commandes projet | `<répertoire racine du projet>/.qwen/commands/` | Spécifiques au projet, contrôlables par version | Élevée     | Partage d'équipe, commandes spécifiques au projet              |

Règles de priorité : Commandes projet > Commandes utilisateur (la commande projet est utilisée en cas de conflit de nom)

### Règles de nommage des commandes

#### Tableau de correspondance entre chemin de fichier et nom de commande

| Emplacement du fichier                            | Commande générée | Exemple d'appel          |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Paramètre`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Message` |

Règles de nommage : Le séparateur de chemin (`/` ou `\`) est converti en deux-points (`:`)

### Spécification du format de fichier Markdown (Recommandé)

Les commandes personnalisées utilisent des fichiers Markdown avec un frontmatter YAML optionnel :

```markdown
---
description: Description optionnelle (affichée dans /help)
---

Votre contenu de prompt ici.
Utilisez {{args}} pour l'injection de paramètres.
```

| Champ         | Requis | Description                              | Exemple                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `description` | Optionnel | Description de la commande (affichée dans /help) | `description: Outil d'analyse de code`          |
| Corps du prompt   | Requis | Contenu du prompt envoyé au modèle             | Tout contenu Markdown après le frontmatter |

### Format de fichier TOML (Déprécié)

> [!warning]
>
> **Déprécié :** Le format TOML est toujours pris en charge mais sera supprimé dans une version future. Veuillez migrer vers le format Markdown.

| Champ         | Requis | Description                              | Exemple                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `prompt`      | Requis | Contenu du prompt envoyé au modèle             | `prompt = "Please analyze code: {{args}}"` |
| `description` | Optionnel | Description de la commande (affichée dans /help) | `description = "Code analysis tool"`       |

### Mécanisme de traitement des paramètres

| Méthode de traitement            | Syntaxe             | Cas d'utilisation                 | Fonctionnalités de sécurité                      |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injection contextuelle      | `{{args}}`         | Besoin d'un contrôle précis des paramètres       | Échappement Shell automatique               |
| Traitement par défaut des paramètres | Pas de marquage spécial | Commandes simples, ajout de paramètres | Ajout tel quel                           |
| Injection de commande Shell      | `!{command}`       | Besoin de contenu dynamique                 | Confirmation d'exécution requise avant |

#### 1. Injection contextuelle (`{{args}}`)

| Scénario         | Configuration TOML                      | Méthode d'appel           | Effet réel            |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Injection brute    | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| Dans une commande Shell | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Exécute `grep "hello" .` |

#### 2. Traitement par défaut des paramètres

| Situation de saisie | Méthode de traitement                                      | Exemple                                        |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Avec paramètres  | Ajout à la fin du prompt (séparé par deux sauts de ligne) | `/cmd paramètre` → Prompt original + paramètre |
| Sans paramètres   | Envoyer le prompt tel quel                                      | `/cmd` → Prompt original                       |

🚀 Injection de contenu dynamique

| Type d'injection        | Syntaxe         | Ordre de traitement    | Objectif                          |
| --------------------- | -------------- | ------------------- | -------------------------------- |
| Contenu de fichier          | `@{file path}` | Traité en premier     | Injecter des fichiers de référence statiques    |
| Commandes Shell        | `!{command}`   | Traité au milieu | Injecter des résultats d'exécution dynamiques |
| Remplacement de paramètres | `{{args}}`     | Traité en dernier      | Injecter les paramètres utilisateur           |

#### 3. Exécution de commandes Shell (`!{...}`)

| Opération                       | Interaction utilisateur     |
| ------------------------------- | -------------------- |
| 1. Analyser la commande et les paramètres | -                    |
| 2. Échappement Shell automatique     | -                    |
| 3. Afficher la boîte de dialogue de confirmation     | ✅ Confirmation utilisateur |
| 4. Exécuter la commande              | -                    |
| 5. Injecter la sortie dans le prompt      | -                    |

Exemple : Génération de message de commit Git

````markdown
---
description: Générer un message de commit basé sur les modifications indexées
---

Veuillez générer un message de commit basé sur le diff suivant :

```diff
!{git diff --staged}
```
````

#### 4. Injection de contenu de fichier (`@{...}`)

| Type de fichier    | État de prise en charge         | Méthode de traitement           |
| ------------ | ---------------------- | --------------------------- |
| Fichiers texte   | ✅ Prise en charge complète        | Injecter directement le contenu     |
| Images/PDF   | ✅ Prise en charge multimodale | Encoder et injecter           |
| Fichiers binaires | ⚠️ Prise en charge limitée     | Peut être ignoré ou tronqué |
| Répertoire    | ✅ Injection récursive | Respecte les règles .gitignore     |

Exemple : Commande de revue de code

```markdown
---
description: Revue de code basée sur les bonnes pratiques
---

Revoyez {{args}}, normes de référence :

@{docs/code-standards.md}
```

### Exemple de création pratique

#### Tableau des étapes de création de la commande "Refactoring en fonction pure"

| Opération                     | Commande/Code                              |
| ----------------------------- | ----------------------------------------- |
| 1. Créer la structure de répertoires | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Créer le fichier de commande        | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Éditer le contenu de la commande       | Voir le code complet ci-dessous.         |
| 4. Tester la commande               | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Refactoriser le code en fonction pure
---

Veuillez analyser le code dans le contexte actuel et le refactoriser en fonction pure.
Exigences :

1. Fournir le code refactorisé
2. Expliquer les modifications clés et l'implémentation des caractéristiques de fonction pure
3. Conserver le comportement de la fonction inchangé
```

### Résumé des bonnes pratiques pour les commandes personnalisées

#### Tableau des recommandations de conception des commandes

| Points de pratique      | Approche recommandée                | À éviter                                       |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Nommage des commandes       | Utiliser des espaces de noms pour l'organisation     | Éviter les noms trop génériques                  |
| Traitement des paramètres | Utiliser explicitement `{{args}}`              | Compter sur l'ajout par défaut (source de confusion) |
| Gestion des erreurs       | Exploiter la sortie d'erreur du Shell          | Ignorer les échecs d'exécution                    |
| Organisation des fichiers    | Organiser par fonction dans des répertoires | Toutes les commandes dans le répertoire racine              |
| Champ de description    | Toujours fournir une description claire    | Compter sur la description générée automatiquement          |

#### Tableau de rappel des fonctionnalités de sécurité

| Mécanisme de sécurité     | Effet de protection          | Opération utilisateur         |
| ---------------------- | -------------------------- | ---------------------- |
| Échappement Shell         | Empêcher l'injection de commandes  | Traitement automatique   |
| Confirmation d'exécution | Éviter l'exécution accidentelle | Confirmation via boîte de dialogue    |
| Rapport d'erreurs        | Aider au diagnostic des problèmes       | Consulter les informations d'erreur |
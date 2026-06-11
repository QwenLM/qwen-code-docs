# Commandes

Ce document détaille toutes les commandes prises en charge par Qwen Code, vous aidant à gérer efficacement les sessions, personnaliser l'interface et contrôler son comportement.

Les commandes de Qwen Code sont déclenchées via des préfixes spécifiques et se divisent en trois catégories :

| Type de préfixe                | Description de la fonction                                | Cas d'utilisation typique                                                 |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Commandes Slash (`/`)       | Contrôle de haut niveau de Qwen Code lui-même              | Gestion des sessions, modification des paramètres, obtention d'aide              |
| Commandes At (`@`)          | Injecter rapidement le contenu d'un fichier local dans la conversation | Permettre à l'IA d'analyser des fichiers spécifiés ou du code dans des répertoires |
| Commandes Exclamation (`!`) | Interaction directe avec le Shell système                | Exécution de commandes système comme `git status`, `ls`, etc.          |

## 1. Commandes Slash (`/`)

Les commandes Slash sont utilisées pour gérer les sessions, l'interface et le comportement de base de Qwen Code.

### 1.1 Gestion des sessions et des projets

Ces commandes vous aident à enregistrer, restaurer et résumer la progression du travail.

| Commande     | Description                                               | Exemples d'utilisation                       |
| ----------- | --------------------------------------------------------- | ------------------------------------ |
| `/init`     | Analyse le répertoire courant et crée un fichier de contexte initial | `/init`                              |
| `/summary`  | Génère un résumé du projet basé sur l'historique des conversations    | `/summary`                           |
| `/compress` | Remplace l'historique du chat par un résumé pour économiser des Tokens          | `/compress`                          |
| `/resume`   | Reprend une session de conversation précédente                    | `/resume`                            |
| `/recap`    | Génère un résumé d'une ligne de la session actuelle                     | `/recap`                             |
| `/restore`  | Restaure les fichiers à leur état avant l'exécution de l'outil              | `/restore` (liste) ou `/restore <ID>` |

### 1.2 Contrôle de l'interface et de l'espace de travail

Commandes pour ajuster l'apparence de l'interface et l'environnement de travail.

| Commande      | Description                              | Exemples d'utilisation                |
| ------------ | ---------------------------------------- | ----------------------------- |
| `/clear`     | Efface le contenu du terminal            | `/clear` (raccourci : `Ctrl+L`) |
| `/context`   | Affiche la répartition de l'utilisation de la fenêtre de contexte      | `/context`                    |
| → `detail`   | Affiche la répartition de l'utilisation du contexte par élément    | `/context detail`             |
| `/theme`     | Change le thème visuel de Qwen Code            | `/theme`                      |
| `/vim`       | Active/désactive le mode d'édition Vim dans la zone de saisie  | `/vim`                        |
| `/directory` | Gère l'espace de travail multi-répertoires | `/dir add ./src,./tests`      |
| `/editor`    | Ouvre une boîte de dialogue pour sélectionner l'éditeur pris en charge   | `/editor`                     |

### 1.3 Paramètres de langue

Commandes dédiées au contrôle de la langue de l'interface et des sorties.

| Commande               | Description                      | Exemples d'utilisation             |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | Affiche ou modifie les paramètres de langue | `/language`                |
| → `ui [language]`     | Définit la langue de l'interface utilisateur        | `/language ui zh-CN`       |
| → `output [language]` | Définit la langue de sortie du LLM          | `/language output Chinese` |

- Langues d'interface intégrées disponibles : `zh-CN` (chinois simplifié), `en-US` (anglais), `ru-RU` (russe), `de-DE` (allemand)
- Exemples de langues de sortie : `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gestion des outils et des modèles

Commandes pour gérer les outils et modèles d'IA.

| Commande          | Description                                   | Exemples d'utilisation                                |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| `/mcp`           | Liste les serveurs et outils MCP configurés         | `/mcp`, `/mcp desc`                           |
| `/tools`         | Affiche la liste des outils actuellement disponibles         | `/tools`, `/tools desc`                       |
| `/skills`        | Liste et exécute les compétences disponibles                 | `/skills`, `/skills <name>`                   |
| `/plan`          | Bascule en mode plan ou quitte le mode plan         | `/plan`, `/plan <task>`, `/plan exit`         |
| `/approval-mode` | Modifie le mode d'approbation pour l'utilisation des outils           | `/approval-mode <mode (auto-edit)> --project` |
| →`plan`          | Analyse uniquement, aucune exécution                   | Révision sécurisée                                 |
| →`default`       | Demande une approbation pour les modifications                    | Utilisation quotidienne                                     |
| →`auto-edit`     | Approuve automatiquement les modifications                   | Environnement de confiance                           |
| →`yolo`          | Approuve automatiquement tout                     | Prototypage rapide                             |
| `/model`         | Change le modèle utilisé dans la session actuelle          | `/model`                                      |
| `/model --fast`  | Définit un modèle plus léger pour les suggestions de prompt    | `/model --fast qwen3-coder-flash`             |
| `/extensions`    | Liste toutes les extensions actives dans la session actuelle | `/extensions`                                 |
| `/memory`        | Ouvre la boîte de dialogue du gestionnaire de mémoire                | `/memory`                                     |
| `/remember`      | Enregistre une mémoire durable                         | `/remember Prefer terse responses`            |
| `/forget`        | Supprime les entrées correspondantes de la mémoire automatique      | `/forget <query>`                             |
| `/dream`         | Exécute manuellement la consolidation de la mémoire automatique        | `/dream`                                      |

### 1.5 Compétences intégrées

Ces commandes invoquent des compétences intégrées qui fournissent des flux de travail spécialisés.

| Commande      | Description                                                         | Exemples d'utilisation                                    |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------- |
| `/review`    | Révise les modifications de code avec 5 agents parallèles + analyse déterministe | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`      | Exécute un prompt selon un planning récurrent                                | `/loop 5m check the build`                        |
| `/qc-helper` | Répond aux questions sur l'utilisation et la configuration de Qwen Code            | `/qc-helper how do I configure MCP?`              |

Consultez [Code Review](./code-review.md) pour la documentation complète de `/review`.

### 1.6 Question secondaire (`/btw`)

La commande `/btw` vous permet de poser des questions secondaires rapides sans interrompre ni affecter le flux de la conversation principale.

| Commande                | Description                           |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | Pose une question secondaire rapide             |
| `?btw <your question>` | Syntaxe alternative pour les questions secondaires |

**Fonctionnement :**

- La question secondaire est envoyée via une requête API distincte avec le contexte de conversation récent (jusqu'aux 20 derniers messages)
- La réponse s'affiche au-dessus du Composer — vous pouvez continuer à taper pendant l'attente
- La conversation principale n'est **pas bloquée** — elle continue indépendamment
- La réponse à la question secondaire ne fait **pas** partie de l'historique de la conversation principale
- Les réponses sont rendues avec prise en charge complète du Markdown (blocs de code, listes, tableaux, etc.)

**Raccourcis clavier (Mode interactif) :**

| Raccourci             | Action                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Annuler (pendant le chargement) ou masquer (après achèvement) |
| `Space` ou `Enter`   | Masquer la réponse (lorsque la saisie est vide)            |
| `Ctrl+C` ou `Ctrl+D` | Annuler une question secondaire en cours                   |

**Exemple :**

```
(Pendant que la conversation principale porte sur le refactoring de code)

> /btw Quelle est la différence entre let et var en JavaScript ?

  ╭──────────────────────────────────────────╮
  │ /btw Quelle est la différence entre let   │
  │     et var en JavaScript ?               │
  │                                          │
  │ + Réponse en cours...                           │
  │ Appuyez sur Escape, Ctrl+C ou Ctrl+D pour annuler│
  ╰──────────────────────────────────────────╯
  > (Le Composer reste actif — continuez à taper)

(Après réception de la réponse)

  ╭──────────────────────────────────────────╮
  │ /btw Quelle est la différence entre let   │
  │     et var en JavaScript ?               │
  │                                          │
  │ `let` est limité au bloc, tandis que `var` est    │
  │ limité à la fonction. `let` a été introduit    │
  │ dans ES6 et ne subit pas le hoisting de la même manière.   │
  │                                          │
  │ Appuyez sur Espace, Entrée ou Escape pour masquer │
  ╰──────────────────────────────────────────╯
  > (Le Composer est toujours actif)
```

**Modes d'exécution pris en charge :**

| Mode                 | Comportement                                     |
| -------------------- | -------------------------------------------- |
| Interactif          | S'affiche au-dessus du Composer avec rendu Markdown |
| Non interactif      | Retourne le résultat texte : `btw> question\nanswer` |
| ACP (Agent Protocol) | Retourne un générateur async stream_messages      |

> [!tip]
>
> Utilisez `/btw` lorsque vous avez besoin d'une réponse rapide sans perdre le fil de votre tâche principale. C'est particulièrement utile pour clarifier des concepts, vérifier des faits ou obtenir des explications rapides tout en restant concentré sur votre flux de travail principal.

### 1.7 Résumé de session (`/recap`)

La commande `/recap` génère un court résumé « où vous en étiez » de la session actuelle, vous permettant de reprendre une ancienne conversation sans faire défiler des pages d'historique.

| Commande  | Description                                |
| -------- | ------------------------------------------ |
| `/recap` | Génère et affiche un résumé d'une ligne de la session |

**Fonctionnement :**

- Utilise le modèle rapide configuré (paramètre `fastModel`) lorsqu'il est disponible, avec repli sur le modèle de session principal. Un modèle petit et peu coûteux suffit pour un résumé.
- La conversation récente (jusqu'à 30 messages, texte uniquement — les appels d'outils et réponses d'outils sont filtrés) est envoyée au modèle avec un prompt système strict.
- Le résumé s'affiche en couleur atténuée avec un préfixe `❯` pour se distinguer des réponses réelles de l'assistant.
- Refuse avec une erreur intégrée si un tour de modèle est en cours ou si une autre commande est en traitement. S'il n'y a pas de conversation utilisable ou si la génération sous-jacente échoue, `/recap` affiche un court message d'information au lieu d'un résumé — la commande manuelle répond toujours par quelque chose.

**Déclenchement automatique au retour d'absence :**

Si le terminal est flouté pendant **5+ minutes** et retrouve le focus, un résumé est généré et affiché automatiquement (uniquement lorsqu'aucune réponse du modèle n'est en cours ; sinon, il attend la fin du tour actuel avant de se déclencher). Contrairement à la commande manuelle, le déclenchement automatique est totalement silencieux en cas d'échec : si la génération échoue ou s'il n'y a rien à résumer, aucun message n'est ajouté à l'historique. Contrôlé par le paramètre `general.showSessionRecap` (par défaut : `true`) ; la commande manuelle `/recap` fonctionne toujours indépendamment de ce paramètre.

**Exemple :**

```
> /recap

❯ Refactoring de loopDetectionService.ts pour résoudre les OOM en session longue causés par
  streamContentHistory et contentStats non bornés. La prochaine étape consiste à
  implémenter l'option B (fenêtre glissante LRU avec FNV-1a) en attente de confirmation.
```

> [!tip]
>
> Configurez un modèle rapide via `/model --fast <modèle>` (ex.
> `qwen3-coder-flash`) pour rendre `/recap` rapide et peu coûteux. Définissez
> `general.showSessionRecap` sur `false` pour désactiver le déclenchement
> automatique tout en conservant la commande manuelle disponible.

### 1.8 Informations, paramètres et aide

Commandes pour obtenir des informations et configurer les paramètres système.

| Commande     | Description                                     | Exemples d'utilisation                   |
| ----------- | ----------------------------------------------- | -------------------------------- |
| `/help`     | Affiche l'aide pour les commandes disponibles | `/help` ou `/?`                  |
| `/about`    | Affiche les informations de version                     | `/about`                         |
| `/stats`    | Affiche les statistiques détaillées de la session actuelle | `/stats`                         |
| `/settings` | Ouvre l'éditeur de paramètres                            | `/settings`                      |
| `/auth`     | Modifie la méthode d'authentification                    | `/auth`                          |
| `/bug`      | Signale un problème concernant Qwen Code                    | `/bug Button click unresponsive` |
| `/copy`     | Copie le contenu de la dernière sortie dans le presse-papiers           | `/copy`                          |
| `/quit`     | Quitte immédiatement Qwen Code                      | `/quit` ou `/exit`               |

### 1.9 Raccourcis courants

| Raccourci           | Fonction                | Note                   |
| ------------------ | ----------------------- | ---------------------- |
| `Ctrl/cmd+L`       | Efface l'écran            | Équivalent à `/clear` |
| `Ctrl/cmd+T`       | Active/désactive la description des outils | Gestion des outils MCP    |
| `Ctrl/cmd+C`×2     | Confirmation de sortie       | Mécanisme de sortie sécurisé  |
| `Ctrl/cmd+Z`       | Annule la saisie              | Édition de texte           |
| `Ctrl/cmd+Shift+Z` | Rétablit la saisie              | Édition de texte           |

### 1.10 Sous-commandes CLI d'authentification

En plus de la commande slash `/auth` en session, Qwen Code propose des sous-commandes CLI autonomes pour gérer l'authentification directement depuis le terminal :

| Commande                                              | Description                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `qwen auth`                                          | Configuration interactive de l'authentification                              |
| `qwen auth coding-plan`                              | Authentification avec le plan de codage Alibaba Cloud                   |
| `qwen auth coding-plan --region china --key sk-sp-…` | Configuration non interactive du plan de codage (pour les scripts)             |
| `qwen auth api-key`                                  | Authentification avec une clé API                                  |
| `qwen auth qwen-oauth`                               | ~~Authentification avec Qwen OAuth~~ (abandonné le 2026-04-15) |
| `qwen auth status`                                   | Affiche l'état actuel de l'authentification                            |

> [!tip]
>
> Ces commandes s'exécutent en dehors d'une session Qwen Code. Utilisez-les pour configurer l'authentification avant de démarrer une session, ou dans des scripts et environnements CI. Consultez la page [Authentication](../configuration/auth) pour plus de détails.

## 2. Commandes @ (Introduction de fichiers)

Les commandes @ sont utilisées pour ajouter rapidement le contenu d'un fichier ou d'un répertoire local à la conversation.

| Format de commande      | Description                                  | Exemples                                         |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| `@<file path>`      | Injecte le contenu du fichier spécifié             | `@src/main.py Please explain this code`          |
| `@<directory path>` | Lit récursivement tous les fichiers texte du répertoire | `@docs/ Summarize content of this document`      |
| `@` seul      | Utilisé lorsqu'on discute du symbole `@` lui-même       | `@ What is this symbol used for in programming?` |

Remarque : Les espaces dans les chemins doivent être échappés avec un antislash (ex. `@My\ Documents/file.txt`)

## 3. Commandes Exclamation (`!`) - Exécution de commandes Shell

Les commandes Exclamation vous permettent d'exécuter des commandes système directement dans Qwen Code.

| Format de commande     | Description                                                        | Exemples                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<shell command>` | Exécute la commande dans un sous-Shell                                       | `!ls -la`, `!git status`               |
| `!` seul     | Bascule en mode Shell, toute saisie est exécutée directement comme commande Shell | `!`(entrer) → Saisir commande → `!`(sortir) |

Variables d'environnement : Les commandes exécutées via `!` définiront la variable d'environnement `QWEN_CODE=1`.

## 4. Commandes personnalisées

Enregistrez les prompts fréquemment utilisés comme commandes raccourcies pour améliorer l'efficacité du travail et garantir la cohérence.

> [!note]
>
> Les commandes personnalisées utilisent désormais le format Markdown avec un frontmatter YAML optionnel. Le format TOML est déprécié mais reste pris en charge pour la compatibilité descendante. Lorsque des fichiers TOML sont détectés, une invite de migration automatique s'affichera.

### Aperçu rapide

| Fonction         | Description                                | Avantages                             | Priorité | Scénarios applicables                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Espace de noms        | Sous-répertoire crée des commandes nommées avec deux-points  | Meilleure organisation des commandes            |          |                                                      |
| Commandes globales  | `~/.qwen/commands/`                        | Disponible dans tous les projets              | Faible      | Commandes personnelles fréquentes, utilisation inter-projets |
| Commandes projet | `<project root directory>/.qwen/commands/` | Spécifique au projet, contrôlable par version | Haute     | Partage d'équipe, commandes spécifiques au projet              |

Règles de priorité : Commandes projet > Commandes utilisateur (la commande projet est utilisée en cas de nom identique)

### Règles de nommage des commandes

#### Tableau de correspondance chemin de fichier -> nom de commande

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
| `description` | Optionnel | Description de la commande (affichée dans /help) | `description: Code analysis tool`          |
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

| Méthode de traitement            | Syntaxe             | Scénarios applicables                 | Fonctionnalités de sécurité                      |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injection contextuelle      | `{{args}}`         | Besoin d'un contrôle précis des paramètres       | Échappement Shell automatique               |
| Traitement par défaut des paramètres | Aucun marquage spécial | Commandes simples, ajout de paramètres | Ajout tel quel                           |
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
| Sans paramètres   | Envoie le prompt tel quel                                      | `/cmd` → Prompt original                       |

🚀 Injection de contenu dynamique

| Type d'injection        | Syntaxe         | Ordre de traitement    | Objectif                          |
| --------------------- | -------------- | ------------------- | -------------------------------- |
| Contenu du fichier          | `@{file path}` | Traité en premier     | Injecte des fichiers de référence statiques    |
| Commandes Shell        | `!{command}`   | Traité au milieu | Injecte les résultats d'exécution dynamiques |
| Remplacement de paramètres | `{{args}}`     | Traité en dernier      | Injecte les paramètres utilisateur           |

#### 3. Exécution de commande Shell (`!{...}`)

| Opération                       | Interaction utilisateur     |
| ------------------------------- | -------------------- |
| 1. Analyse la commande et les paramètres | -                    |
| 2. Échappement Shell automatique     | -                    |
| 3. Affiche la boîte de dialogue de confirmation     | ✅ Confirmation utilisateur |
| 4. Exécute la commande              | -                    |
| 5. Injecte la sortie dans le prompt      | -                    |

Exemple : Génération de message de commit Git

````markdown
---
description: Génère un message de commit basé sur les modifications indexées
---

Veuillez générer un message de commit basé sur le diff suivant :

```diff
!{git diff --staged}
```
````

#### 4. Injection de contenu de fichier (`@{...}`)

| Type de fichier    | État de prise en charge         | Méthode de traitement           |
| ------------ | ---------------------- | --------------------------- |
| Fichiers texte   | ✅ Prise en charge complète        | Injecte directement le contenu     |
| Images/PDF   | ✅ Prise en charge multimodale | Encode et injecte           |
| Fichiers binaires | ⚠️ Prise en charge limitée     | Peut être ignoré ou tronqué |
| Répertoire    | ✅ Injection récursive | Suit les règles .gitignore     |

Exemple : Commande de revue de code

```markdown
---
description: Revue de code basée sur les bonnes pratiques
---

Révisez {{args}}, normes de référence :

@{docs/code-standards.md}
```

### Exemple de création pratique

#### Tableau des étapes de création de la commande "Refactoring en fonction pure"

| Opération                     | Commande/Code                              |
| ----------------------------- | ----------------------------------------- |
| 1. Crée la structure de répertoires | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Crée le fichier de commande        | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Modifie le contenu de la commande       | Reportez-vous au code complet ci-dessous.         |
| 4. Teste la commande               | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Refactorise le code en fonction pure
---

Veuillez analyser le code dans le contexte actuel et le refactoriser en fonction pure.
Exigences :

1. Fournir le code refactorisé
2. Expliquer les modifications clés et l'implémentation des caractéristiques des fonctions pures
3. Maintenir la fonction inchangée
```

### Résumé des bonnes pratiques pour les commandes personnalisées

#### Tableau des recommandations de conception des commandes

| Points de pratique      | Approche recommandée                | À éviter                                       |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Nommage des commandes       | Utilisez des espaces de noms pour l'organisation     | Évitez les noms trop génériques                  |
| Traitement des paramètres | Utilisez clairement `{{args}}`              | Compter sur l'ajout par défaut (prêt à confusion) |
| Gestion des erreurs       | Utilisez la sortie d'erreur Shell          | Ignorer l'échec d'exécution                    |
| Organisation des fichiers    | Organisez par fonction dans des répertoires | Toutes les commandes dans le répertoire racine              |
| Champ de description    | Fournissez toujours une description claire    | Compter sur la description auto-générée          |

#### Tableau de rappel des fonctionnalités de sécurité

| Mécanisme de sécurité     | Effet de protection          | Opération utilisateur         |
| ---------------------- | -------------------------- | ---------------------- |
| Échappement Shell         | Empêche l'injection de commandes  | Traitement automatique   |
| Confirmation d'exécution | Évite l'exécution accidentelle | Confirmation par dialogue    |
| Signalement d'erreurs        | Aide au diagnostic des problèmes       | Affiche les informations d'erreur |
# Commandes

Ce document détaille toutes les commandes prises en charge par Qwen Code, vous aidant à gérer efficacement les sessions, personnaliser l'interface et contrôler son comportement.

Les commandes Qwen Code sont déclenchées via des préfixes spécifiques et se répartissent en trois catégories :

| Type de préfixe                | Description de la fonction                                | Cas d'utilisation typique                                           |
| ------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------- |
| Commandes slash (`/`)          | Contrôle méta-niveau de Qwen Code lui-même                | Gestion des sessions, modification des paramètres, aide             |
| Commandes arobase (`@`)        | Injection rapide du contenu de fichiers locaux dans la conversation | Permettre à l'IA d'analyser des fichiers spécifiés ou du code sous des répertoires |
| Commandes point d'exclamation (`!`) | Interaction directe avec le Shell système                 | Exécution de commandes système telles que `git status`, `ls`, etc.  |

## 1. Commandes slash (`/`)

Les commandes slash sont utilisées pour gérer les sessions Qwen Code, l'interface et le comportement de base.

### 1.1 Gestion des sessions et des projets

Ces commandes vous aident à enregistrer, restaurer et résumer l'avancement du travail.

| Commande         | Description                                                              | Exemples d'utilisation                                            |
| ---------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `/init`          | Analyser le répertoire courant et créer un fichier de contexte initial   | `/init`                                                           |
| `/summary`       | Générer un résumé du projet basé sur l'historique de la conversation     | `/summary`                                                        |
| `/compress`      | Remplacer l'historique de la conversation par un résumé pour économiser des Tokens | `/compress`                                            |
| `/compress-fast` | Compression rapide sans IA — supprime les anciennes sorties d'outils et les parties de réflexion | `/compress-fast`                              |
| `/resume`        | Reprendre une session de conversation précédente                         | `/resume`                                                         |
| `/recap`         | Générer un récapitulatif d'une ligne pour la session en cours maintenant  | `/recap`                                                          |
| `/restore`       | Revenir aux fichiers du projet au point de contrôle avant l'exécution d'un outil | `/restore` (liste) ou `/restore <ID>`                  |
| `/delete`        | Supprimer une session précédente                                         | `/delete`                                                         |
| `/branch`        | Dériver la conversation actuelle en une nouvelle session                 | `/branch`                                                         |
| `/fork`          | Lancer un agent en arrière-plan qui hérite de toute la conversation      | `/fork <directive>`                                               |
| `/rewind`        | Revenir en arrière dans la conversation jusqu'à un tour précédent        | `/rewind` ou `/rollback`                                          |
| `/export`        | Exporter l'historique de la session dans un fichier                      | `/export html`, `/export md`, `/export json`, `/export jsonl`     |
| `/rename`        | Renommer ou étiqueter la session actuelle                                | `/rename My Feature` ou `/tag`                                    |

### 1.2 Contrôle de l'interface et de l'espace de travail

Commandes pour ajuster l'apparence de l'interface et l'environnement de travail.

| Commande              | Description                                                                                                                                                                       | Exemples d'utilisation                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/clear`              | Effacer le contenu de l'écran du terminal                                                                                                                                         | `/clear` (raccourci : `Ctrl+L`)                                                           |
| `/context`            | Afficher la ventilation de l'utilisation de la fenêtre de contexte                                                                                                                | `/context`                                                                                |
| → `detail`            | Afficher la ventilation de l'utilisation par élément de contexte                                                                                                                  | `/context detail`                                                                         |
| `/history`            | Contrôler les préférences d'affichage et la visibilité de l'historique                                                                                                            | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now`         |
| `/diff`              | Ouvrir un visualiseur de différences interactif montrant les modifications non validées et les différences par tour. Utilisez ←/→ pour basculer entre le git diff actuel et les tours de conversation individuels, ↑/↓ pour parcourir les fichiers | `/diff`                                                                                   |
| `/theme`             | Changer le thème visuel de Qwen Code                                                                                                                                              | `/theme`                                                                                  |
| `/vim`               | Activer/désactiver le mode d'édition Vim dans la zone de saisie                                                                                                                   | `/vim`                                                                                    |
| `/voice`             | Activer/désactiver la saisie par dictée vocale                                                                                                                                    | `/voice`, `/voice status`                                                                 |
| `/directory`         | Gérer l'espace de travail de support multi-répertoire                                                                                                                             | `/dir add ./src,./tests`                                                                  |
| `/cd`                | Déplacer cette session vers un nouveau répertoire de travail                                                                                                                      | `/cd ../other-project`                                                                    |
| `/editor`            | Ouvrir une boîte de dialogue pour sélectionner l'éditeur pris en charge                                                                                                           | `/editor`                                                                                 |
| `/statusline`        | Ouvrir la boîte de dialogue interactive des préréglages de [ligne d'état](./status-line.md)                                                                                        | `/statusline`                                                                             |
| `/statusline <text>` | Générer une [ligne d'état](./status-line.md) en mode commande via un agent                                                                                                        | `/statusline show model and git branch`                                                   |
| `/terminal-setup`    | Configurer les raccourcis clavier du terminal pour la saisie multiligne                                                                                                           | `/terminal-setup`                                                                         |
### 1.3 Paramètres de langue

Commandes spécifiques pour contrôler la langue de l'interface et de la sortie.

| Commande            | Description                            | Exemples d'utilisation       |
| ------------------- | -------------------------------------- | ---------------------------- |
| `/language`         | Afficher ou modifier les paramètres de langue | `/language`                  |
| → `ui [langue]`     | Définir la langue de l'interface       | `/language ui zh-CN`         |
| → `output [langue]` | Définir la langue de sortie du LLM     | `/language output Chinese`   |

- Langues d'interface intégrées disponibles : `zh-CN` (Chinois simplifié), `en-US` (Anglais), `ru-RU` (Russe), `de-DE` (Allemand), `ja-JP` (Japonais), `pt-BR` (Portugais – Brésil), `fr-FR` (Français), `ca-ES` (Catalan)
- Exemples de langues de sortie : `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gestion des outils et des modèles

Commandes de gestion des outils et modèles d'IA.

| Commande          | Description                                     | Exemples d'utilisation                                                          |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `/mcp`            | Lister les serveurs et outils MCP configurés    | `/mcp`, `/mcp desc`                                                             |
| `/import-config`  | Importer des serveurs MCP depuis les configs Claude | `/import-config claude-code`, `/import-config claude-desktop --scope project` |
| `/tools`          | Afficher la liste des outils disponibles        | `/tools`, `/tools desc`                                                         |
| `/skills`         | Lister et exécuter les compétences disponibles  | `/skills`, `/skills <nom>`                                                      |
| `/plan`           | Passer en mode planification ou en sortir       | `/plan`, `/plan <tâche>`, `/plan exit`                                          |
| `/approval-mode`  | Modifier le mode d'approbation pour l'utilisation des outils | `/approval-mode <mode (auto-edit)> --project`             |
| →`plan`           | Analyse uniquement, sans exécution              | Révision sécurisée                                                              |
| →`default`        | Demander l'approbation pour les modifications   | Usage quotidien                                                                 |
| →`auto-edit`      | Approuver automatiquement les modifications     | Environnement de confiance                                                      |
| →`auto`           | Approbation évaluée par classifieur             | Sessions autonomes avec barrières de sécurité                                   |
| →`yolo`           | Tout approuver automatiquement                  | Prototypage rapide                                                              |
| `/model`          | Changer de modèle dans la session en cours      | `/model`, `/model <id-modèle>` (passage immédiat)                               |
| `/model --fast`   | Définir un modèle plus léger pour les suggestions d'invite | `/model --fast qwen3-coder-flash`                              |
| `/model --voice`  | Définir le modèle utilisé pour la transcription vocale | `/model --voice <id-modèle>`                                                  |
| `/extensions`     | Lister toutes les extensions actives dans la session | `/extensions`                                                                   |
| `/memory`         | Ouvrir la boîte de dialogue du gestionnaire de mémoire | `/memory`                                                                       |
| `/remember`       | Enregistrer une mémoire durable                 | `/remember Préférer des réponses concises`                                      |
| `/forget`         | Supprimer les entrées correspondantes de la mémoire automatique | `/forget <requête>`                                              |
| `/dream`          | Exécuter manuellement la consolidation de la mémoire automatique | `/dream`                                                                        |
| `/hooks`          | Gérer les hooks de Qwen Code                    | `/hooks`, `/hooks list`                                                         |
| `/permissions`    | Gérer les règles d'autorisation                 | `/permissions`                                                                  |
| `/agents`         | Gérer les sous-agents                           | `/agents manage`, `/agents create`                                              |
| `/arena`          | Gérer les sessions Arena                        | `/arena start`, `/arena status`                                                 |
| `/goal`           | Définir un objectif — continuer jusqu'à réalisation de la condition | `/goal <condition>`, `/goal clear`                              |
| `/tasks`          | Lister les tâches en arrière-plan               | `/tasks`                                                                        |
| `/workflows`      | Inspecter les exécutions de workflow            | `/workflows`, `/workflows <runId>`                                              |
| `/lsp`            | Afficher le statut du serveur LSP               | `/lsp`                                                                          |
| `/trust`          | Gérer les paramètres de confiance des dossiers  | `/trust`                                                                        |
### 1.5 Compétences intégrées

Ces commandes invoquent des compétences intégrées qui fournissent des workflows spécialisés.

| Commande      | Description                                                                  | Exemples d'utilisation                          |
| ------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `/review`     | Examiner les modifications de code avec 5 agents parallèles + analyse déterministe | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`       | Exécuter une invite selon un planning récurrent                              | `/loop 5m check the build`                      |
| `/simplify`   | Examiner les modifications récentes et appliquer directement des nettoyages sécurisés | `/simplify`, `/simplify focus on duplication`   |
| `/qc-helper`  | Répondre aux questions sur l'utilisation et la configuration de Qwen Code    | `/qc-helper how do I configure MCP?`            |

Voir [Code Review](./code-review.md) pour la documentation complète de `/review`.

### 1.6 Question annexe (`/btw`)

La commande `/btw` vous permet de poser rapidement des questions annexes sans interrompre ni affecter le flux principal de la conversation.

| Commande               | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `/btw <your question>` | Poser une question annexe rapide                |
| `?btw <your question>` | Syntaxe alternative pour les questions annexes  |

**Fonctionnement :**

- La question annexe est envoyée via un appel API séparé avec le contexte de la conversation récente (jusqu'aux 20 derniers messages)
- La réponse s'affiche au-dessus du Composer — vous pouvez continuer à taper en attendant
- La conversation principale n'est **pas bloquée** — elle se poursuit indépendamment
- La réponse à la question annexe ne fait **pas** partie de l'historique de la conversation principale
- Les réponses sont rendues avec le support complet de Markdown (blocs de code, listes, tableaux, etc.)

**Raccourcis clavier (mode interactif) :**

| Raccourci             | Action                                                   |
| --------------------- | -------------------------------------------------------- |
| `Escape`              | Annuler (pendant le chargement) ou fermer (après completion) |
| `Space` ou `Enter`    | Fermer la réponse (lorsque l'entrée est vide)            |
| `Ctrl+C` ou `Ctrl+D`  | Annuler une question annexe en cours                     |

**Exemple :**

```
(Pendant que la conversation principale porte sur le refactoring de code)

> /btw Quelle est la différence entre let et var en JavaScript ?

  ╭──────────────────────────────────────────╮
  │ /btw Quelle est la différence entre let  │
  │     et var en JavaScript ?               │
  │                                          │
  │ + Réponse en cours...                    │
  │ Appuyez sur Échap, Ctrl+C ou Ctrl+D      │
  │ pour annuler                             │
  ╰──────────────────────────────────────────╯
  > (Le Composer reste actif — continuez de taper)

(Après l'arrivée de la réponse)

  ╭──────────────────────────────────────────╮
  │ /btw Quelle est la différence entre let  │
  │     et var en JavaScript ?               │
  │                                          │
  │ `let` a une portée de bloc, tandis que   │
  │ `var` a une portée de fonction. `let`    │
  │ a été introduit dans ES6 et ne remonte   │
  │ pas de la même manière.                  │
  │                                          │
  │ Appuyez sur Espace, Entrée ou Échap      │
  │ pour fermer                              │
  ╰──────────────────────────────────────────╯
  > (Composer toujours actif)
```

**Modes d'exécution pris en charge :**

| Mode                 | Comportement                                                          |
| -------------------- | --------------------------------------------------------------------- |
| Interactif           | Affiche au-dessus du Composer avec rendu Markdown                     |
| Non interactif       | Renvoie un résultat textuel : `btw> question\nanswer`                 |
| ACP (Agent Protocol) | Renvoie un générateur asynchrone stream_messages                      |

> [!tip]
>
> Utilisez `/btw` lorsque vous avez besoin d'une réponse rapide sans détourner votre tâche principale. C'est particulièrement utile pour clarifier des concepts, vérifier des faits ou obtenir des explications rapides tout en restant concentré sur votre flux de travail principal.

### 1.7 Récapitulatif de session (`/recap`)

La commande `/recap` génère un court résumé de « là où vous vous êtes arrêté » de la session en cours, afin que vous puissiez reprendre une ancienne conversation sans faire défiler des pages d'historique.

| Commande  | Description                                            |
| --------- | ------------------------------------------------------ |
| `/recap`  | Générer et afficher un récapitulatif de session d'une ligne |

**Fonctionnement :**

- Utilise le modèle rapide configuré (paramètre `fastModel`) lorsqu'il est disponible, en revenant au modèle de session principal. Un modèle petit et peu coûteux suffit pour un récapitulatif.
- La conversation récente (jusqu'à 30 messages, texte uniquement — les appels d'outils et les réponses d'outils sont filtrés) est envoyée au modèle avec une invite système concise.
- Le récapitulatif est rendu dans une couleur atténuée avec un préfixe `❯` afin qu'il se distingue des vraies réponses de l'assistant.
- Refuse avec une erreur en ligne si un tour de modèle est en cours ou si une autre commande est en cours de traitement. S'il n'y a pas de conversation utilisable, ou si la génération sous-jacente échoue, `/recap` affiche un court message d'information au lieu d'un récapitulatif — la commande manuelle répond toujours quelque chose.
**Déclenchement automatique au retour d’absence :**

Si le terminal est flouté pendant **5 minutes ou plus** et qu’il est de nouveau actif, un récapitulatif est généré et affiché automatiquement (uniquement lorsqu’aucune réponse du modèle n’est en cours ; sinon, il attend la fin du tour en cours puis se déclenche). Contrairement à la commande manuelle, le déclenchement automatique est totalement silencieux en cas d’échec : si la génération échoue ou s’il n’y a rien à résumer, aucun message n’est ajouté à l’historique. Contrôlé par le paramètre `general.showSessionRecap` (valeur par défaut : `false`) ; la commande manuelle `/recap` fonctionne toujours, quelle que soit la valeur de ce paramètre.

**Exemple :**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> Configurez un modèle rapide via `/model --fast <modèle>` (par ex. `qwen3-coder-flash`) pour que `/recap` soit rapide et économique. Définissez `general.showSessionRecap` à `true` pour activer le déclenchement automatique ; la commande manuelle `/recap` fonctionne toujours quelle que soit la valeur de ce paramètre.

### 1.8 Visionneuse de différences (`/diff`)

La commande `/diff` ouvre une visionneuse interactive de différences montrant les modifications non validées et les différences par tour. Utilisez ←/→ pour basculer entre le diff git actuel et les tours de conversation individuels, ↑/↓ pour parcourir les fichiers, et Entrée pour voir les différences en ligne.

**Fonctionnement :**

En mode interactif, `/diff` ouvre une boîte de dialogue avec un **sélecteur de source** en haut :

- **Actuel** — arbre de travail vs HEAD (`git diff HEAD`). Affiche toutes les modifications non validées, y compris les fichiers indexés, non indexés et non suivis.
- **T1, T2, T3, …** — différences par tour, un onglet par tour du modèle ayant modifié des fichiers. Les tours les plus récents apparaissent en premier. Chaque onglet affiche un aperçu de la demande initiale pour replacer le contexte.

La liste des fichiers affiche les statistiques par fichier (lignes ajoutées/supprimées) avec des étiquettes pour les états spéciaux (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Appuyez sur Entrée sur un fichier pour voir sa différence en ligne avec les blocs surlignés syntaxiquement.

Les différences par tour nécessitent que la création de points de contrôle de fichier soit activée (activée par défaut en mode interactif). Lorsque la création de points de contrôle est désactivée, seule la source « Actuel » est disponible.

**Raccourcis clavier :**

| Touche    | Action                                                                    |
| --------- | ------------------------------------------------------------------------- |
| `←` / `→` | Basculer entre les sources (Actuel / T1 / T2…)                            |
| `↑` / `↓` | Naviguer dans la liste des fichiers                                       |
| `j` / `k` | Naviguer dans la liste des fichiers (style vim)                           |
| Entrée    | Afficher la différence en ligne pour le fichier sélectionné               |
| `←` / Esc | Revenir à la liste des fichiers depuis l’affichage des différences en ligne |
| Esc       | Fermer la boîte de dialogue                                                |

**Exemple :**

```
┌ /diff · Turn 3 "refactor the auth middleware" ──── 3 files +45 -12 ┐
│                                                                     │
│ ◀ Current · T3 · T2 · T1 ▶                                         │
│                                                                     │
│ › src/utils/parser.ts                              +30 -8           │
│   src/utils/parser.test.ts                         +12 -2           │
│   README.md                                        +3 -2            │
│                                                                     │
│ ←/→ source · ↑/↓ file · Enter view · Esc close                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Mode non interactif :**

En contexte non interactif ou headless (`--prompt`), `/diff` affiche un résumé en texte brut de l’arbre de travail par rapport à HEAD. La navigation par tour n’est pas disponible.

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informations, paramètres et aide

Commandes pour obtenir des informations et effectuer des réglages système.

| Commande         | Description                                                                                                                                                                                                                                                                                          | Exemples d’utilisation          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `/help`          | Affiche l’aide pour les commandes disponibles                                                                                                                                                                                                                                                        | `/help` ou `/?`                 |
| `/status`        | Affiche les informations de version                                                                                                                                                                                                                                                                  | `/status` ou `/about`           |
| `/status paths`  | Affiche les chemins du fichier de session et des journaux actuels                                                                                                                                                                                                                                    | `/status paths`                 |
| `/stats`         | Ouvre un tableau de bord interactif de statistiques d’utilisation avec trois onglets : Session (métriques en direct), Activité (heatmap, tendance des jetons, classement des projets) et Efficacité (taux de cache, classement des outils, comparaison des modèles). Utilisez `tab` pour changer d’onglet, `r` pour parcourir les plages de temps, `←→` pour faire défiler les mois, `esc` pour fermer. | `/stats`                        |
| `/stats model`   | Affiche la répartition des jetons par modèle et le coût estimé                                                                                                                                                                                                                                       | `/stats model`                  |
| `/stats tools`   | Affiche le nombre d’appels par outil                                                                                                                                                                                                                                                                 | `/stats tools`                  |
| `/stats skills`  | Affiche le nombre d’appels par compétence pour la session en cours. Cela n’inclut pas l’activité quotidienne/mensuelle intersession.                                                                                                                                                                  | `/stats skills`                 |
| `/settings`      | Ouvre l’éditeur de paramètres                                                                                                                                                                                                                                                                        | `/settings`                     |
| `/auth`          | Change la méthode d’authentification                                                                                                                                                                                                                                                                 | `/auth`                         |
| `/doctor`        | Exécute des diagnostics d’installation et d’environnement                                                                                                                                                                                                                                            | `/doctor`, `/doctor memory`     |
| `/docs`          | Ouvre la documentation complète de Qwen Code dans le navigateur                                                                                                                                                                                                                                      | `/docs`                         |
| `/ide`           | Gère l’intégration avec l’IDE                                                                                                                                                                                                                                                                        | `/ide status`, `/ide install`   |
| `/insight`       | Génère des informations de programmation à partir de l’historique du chat                                                                                                                                                                                                                            | `/insight`                      |
| `/setup-github`  | Configure GitHub Actions                                                                                                                                                                                                                                                                             | `/setup-github`                 |
| `/bug`           | Soumet un problème concernant Qwen Code                                                                                                                                                                                                                                                              | `/bug Button click unresponsive` |
| `/copy`          | Copie la sortie de l’IA dans le presse-papiers (`/copy N` = N-ième dernier message de l’IA)                                                                                                                                                                                                          | `/copy` ou `/copy 2`            |
| `/quit`          | Quitte Qwen Code immédiatement                                                                                                                                                                                                                                                                       | `/quit` ou `/exit`              |
### 1.10 Raccourcis courants

| Raccourci          | Fonction                     | Note                              |
| ------------------ | ---------------------------- | --------------------------------- |
| `Ctrl/cmd+L`       | Effacer l'écran              | Équivalent à `/clear`             |
| `Ctrl/cmd+T`       | Afficher/masquer la description d'outil | Gestion des outils MCP           |
| `Ctrl/cmd+C`×2     | Confirmation de sortie       | Mécanisme de sortie sécurisé      |
| `Ctrl/cmd+Z`       | Annuler la saisie            | Édition de texte                  |
| `Ctrl/cmd+Shift+Z` | Rétablir la saisie           | Édition de texte                  |

### 1.11 Commandes d'authentification

Utilisez `/auth` dans une session Qwen Code pour configurer l'authentification. Utilisez `/doctor` pour inspecter l'état actuel de l'authentification et de l'environnement.

| Commande  | Description                                      |
| --------- | ------------------------------------------------ |
| `/auth`   | Configure l'authentification de manière interactive |
| `/doctor` | Affiche les vérifications d'authentification et d'environnement |

> [!note]
>
> La commande CLI autonome `qwen auth` a été supprimée. Les invocations héritées telles que `qwen auth status` affichent un avis de suppression avec des conseils de migration. Consultez la page [Authentification](../configuration/auth) pour tous les détails.

## 2. Commandes @ (Introduction de fichiers)

Les commandes @ sont utilisées pour ajouter rapidement le contenu d'un fichier ou d'un répertoire local à la conversation.

| Format de commande | Description                                     | Exemples                                          |
| ------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `@<chemin du fichier>`      | Injecte le contenu du fichier spécifié             | `@src/main.py Veuillez expliquer ce code`      |
| `@<chemin du répertoire>` | Lit récursivement tous les fichiers texte du répertoire | `@docs/ Résumez le contenu de ce document`      |
| `@` autonome      | Utilisé pour discuter du symbole `@` lui-même       | `@ À quoi sert ce symbole en programmation ?` |

Remarque : Les espaces dans les chemins doivent être échappés avec une barre oblique inverse (p. ex., `@My\ Documents/fichier.txt`)

## 3. Commandes Exclamation (`!`) - Exécution de commandes Shell

Les commandes Exclamation vous permettent d'exécuter des commandes système directement dans Qwen Code.

| Format de commande | Description                                                     | Exemples                               |
| ------------------ | --------------------------------------------------------------- | -------------------------------------- |
| `!<commande shell>` | Exécute la commande dans un sous-Shell                          | `!ls -la`, `!git status`               |
| `!` autonome       | Bascule en mode Shell, toute entrée est exécutée directement comme commande Shell | `!`(entrée) → Saisissez une commande → `!`(sortie) |

Variables d'environnement : Les commandes exécutées via `!` définiront la variable d'environnement `QWEN_CODE=1`.

## 4. Commandes personnalisées

Enregistrez les invites fréquemment utilisées comme commandes de raccourci pour améliorer l'efficacité du travail et assurer la cohérence.

> [!note]
>
> Les commandes personnalisées utilisent désormais le format Markdown avec un frontmatter YAML optionnel. Le format TOML est déprécié mais toujours pris en charge pour la rétrocompatibilité. Lorsque des fichiers TOML sont détectés, une invite de migration automatique s'affiche.

### Aperçu rapide

| Fonction        | Description                                    | Avantages                          | Priorité | Scénarios applicables                                       |
| --------------- | ---------------------------------------------- | ---------------------------------- | -------- | ----------------------------------------------------------- |
| Espace de noms | Le sous-répertoire crée des commandes nommées avec deux-points | Meilleure organisation des commandes |          |                                                             |
| Commandes globales | `~/.qwen/commands/`                            | Disponibles dans tous les projets   | Faible   | Commandes personnelles fréquemment utilisées, utilisation inter-projets |
| Commandes projet | `<répertoire racine du projet>/.qwen/commands/` | Spécifiques au projet, contrôlables par version | Élevée   | Partage en équipe, commandes spécifiques au projet          |

Règles de priorité : Commandes projet > Commandes utilisateur (la commande projet est utilisée lorsque les noms sont identiques)

### Règles de nommage des commandes

#### Table de correspondance entre chemin de fichier et nom de commande

| Emplacement du fichier                    | Commande générée | Exemple d'appel          |
| ---------------------------------------- | ---------------- | ------------------------ |
| `~/.qwen/commands/test.md`               | `/test`          | `/test Paramètre`        |
| `<projet>/.qwen/commands/git/commit.md` | `/git:commit`    | `/git:commit Message`   |

Règle de nommage : Le séparateur de chemin (`/` ou `\`) est converti en deux-points (`:`)

### Spécification du format de fichier Markdown (recommandé)

Les commandes personnalisées utilisent des fichiers Markdown avec un frontmatter YAML optionnel :

```markdown
---
description: Description optionnelle (affichée dans /help)
---

Votre contenu d'invite ici.
Utilisez {{args}} pour l'injection de paramètres.
```

| Champ       | Requis | Description                                   | Exemple                                  |
| ----------- | ------ | --------------------------------------------- | ---------------------------------------- |
| `description` | Optionnel | Description de la commande (affichée dans /help) | `description: Outil d'analyse de code`   |
| Corps de l'invite | Requis | Contenu de l'invite envoyé au modèle          | Tout contenu Markdown après le frontmatter |
### Format de fichier TOML (Obsolète)

> [!warning]
>
> **Obsolète :** Le format TOML est toujours pris en charge mais sera supprimé dans une version future. Veuillez migrer vers le format Markdown.

| Champ         | Requis | Description                              | Exemple                                    |
| ------------- | ------ | ---------------------------------------- | ------------------------------------------ |
| `prompt`      | Requis | Contenu de l'invite envoyé au modèle     | `prompt = "Please analyze code: {{args}}"` |
| `description` | Facultatif | Description de la commande (affichée dans /help) | `description = "Code analysis tool"`       |

### Mécanisme de traitement des paramètres

| Méthode de traitement            | Syntaxe             | Scénarios applicables                 | Fonctionnalités de sécurité                      |
| -------------------------------- | ------------------- | ------------------------------------- | ----------------------------------------------- |
| Injection contextuelle           | `{{args}}`          | Nécessité d'un contrôle précis des paramètres | Échappement automatique du shell               |
| Traitement par défaut des paramètres | Aucun marquage spécial | Commandes simples, ajout de paramètres | Ajout tel quel                                  |
| Injection de commande Shell      | `!{command}`        | Nécessité de contenu dynamique        | Confirmation d'exécution requise avant        |

#### 1. Injection contextuelle (`{{args}}`)

| Scénario         | Configuration TOML                      | Méthode d'appel           | Effet réel            |
| ---------------- | --------------------------------------- | ------------------------- | --------------------- |
| Injection brute  | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"`     | `Fix: "Button issue"` |
| Dans une commande Shell | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`         | Exécute `grep "hello" .` |

#### 2. Traitement par défaut des paramètres

| Situation d'entrée | Méthode de traitement                                      | Exemple                                        |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------- |
| A des paramètres   | Ajout à la fin de l'invite (séparé par deux sauts de ligne) | `/cmd paramètre` → Invite originale + paramètre |
| Aucun paramètre    | Envoyer l'invite telle quelle                              | `/cmd` → Invite originale                      |

🚀 Injection de contenu dynamique

| Type d'injection        | Syntaxe         | Ordre de traitement    | Objectif                          |
| ----------------------- | --------------- | ---------------------- | --------------------------------- |
| Contenu de fichier      | `@{file path}`  | Traité en premier      | Injecter des fichiers de référence statiques |
| Commandes Shell         | `!{command}`    | Traité au milieu       | Injecter les résultats d'exécution dynamiques |
| Remplacement de paramètres | `{{args}}`   | Traité en dernier      | Injecter les paramètres utilisateur |

#### 3. Exécution de commande Shell (`!{...}`)

| Opération                       | Interaction utilisateur |
| ------------------------------- | ----------------------- |
| 1. Analyser la commande et les paramètres | -                       |
| 2. Échappement automatique du shell       | -                       |
| 3. Afficher la boîte de dialogue de confirmation | ✅ Confirmation utilisateur |
| 4. Exécuter la commande                 | -                       |
| 5. Injecter la sortie dans l'invite      | -                       |

Exemple : Génération de message de commit Git

````markdown
---
description: Generate Commit message based on staged changes
---

Veuillez générer un message de commit basé sur la différence suivante :

```diff
!{git diff --staged}
```
````

#### 4. Injection de contenu de fichier (`@{...}`)

| Type de fichier | Statut de prise en charge | Méthode de traitement           |
| --------------- | ------------------------- | ------------------------------- |
| Fichiers texte  | ✅ Prise en charge complète | Injecter directement le contenu |
| Images/PDF      | ✅ Prise en charge multimodale | Encoder et injecter             |
| Fichiers binaires | ⚠️ Prise en charge limitée | Peut être ignoré ou tronqué     |
| Répertoire      | ✅ Injection récursive     | Suivre les règles .gitignore    |

Exemple : Commande de revue de code

```markdown
---
description: Code review based on best practices
---

Examinez {{args}}, référez-vous aux normes :

@{docs/code-standards.md}
```

### Exemple pratique de création

#### Tableau des étapes de création de la commande « Refactorisation de fonction pure »

| Opération                     | Commande/Code                              |
| ----------------------------- | ----------------------------------------- |
| 1. Créer la structure de répertoires | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Créer le fichier de commande      | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Modifier le contenu de la commande | Référez-vous au code complet ci-dessous. |
| 4. Tester la commande               | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Refactor code to pure function
---

Veuillez analyser le code dans le contexte actuel, le refactoriser en fonction pure.
Exigences :

1. Fournir le code refactorisé
2. Expliquer les changements clés et la mise en œuvre des caractéristiques de la fonction pure
3. Maintenir la fonction inchangée
```
### Résumé des bonnes pratiques pour les commandes personnalisées

#### Tableau de recommandations pour la conception des commandes

| Points de pratique      | Approche recommandée                | À éviter                                       |
| ----------------------- | ----------------------------------- | ---------------------------------------------- |
| Nommage des commandes   | Utiliser des espaces de noms pour l'organisation | Éviter les noms trop génériques                |
| Traitement des paramètres | Utiliser clairement `{{args}}`      | Se fier à l'ajout par défaut (facile à confondre) |
| Gestion des erreurs     | Utiliser la sortie d'erreur du shell | Ignorer les échecs d'exécution                 |
| Organisation des fichiers | Organiser par fonction dans des répertoires | Toutes les commandes dans le répertoire racine |
| Champ de description    | Toujours fournir une description claire | Se fier à la description générée automatiquement |

#### Rappel des fonctionnalités de sécurité

| Mécanisme de sécurité | Effet de protection          | Opération utilisateur         |
| --------------------- | ---------------------------- | ----------------------------- |
| Échappement shell     | Prévenir l'injection de commandes | Traitement automatique        |
| Confirmation d'exécution | Éviter les exécutions accidentelles | Confirmation par dialogue     |
| Rapport d'erreurs     | Aider au diagnostic des problèmes | Voir les informations d'erreur |

## 5. Sous-commandes CLI

Ces commandes sont exécutées depuis le shell avec `qwen <sous-commande>` avant de démarrer une session interactive.

### Gestion des sessions

| Commande              | Description                       | Exemples d'utilisation                                   |
| --------------------- | --------------------------------- | -------------------------------------------------------- |
| `qwen sessions list` | Lister les sessions de conversation récentes | `qwen sessions list`, `qwen sessions list --json --limit 50` |

#### `qwen sessions list`

Liste vos sessions récentes de Qwen Code avec leurs métadonnées.

**Indicateurs :**

| Indicateur | Type    | Défaut | Description                                     |
| ---------- | ------- | ------ | ----------------------------------------------- |
| `--json`  | booléen | `false` | Sortie au format JSON Lines (un objet JSON par ligne) |
| `--limit` | nombre  | `20`    | Nombre maximal de sessions à afficher              |

**Sortie lisible par un humain (par défaut) :**

Un tableau avec les colonnes : SESSION ID, STARTED (horodatage UTC), TITLE, BRANCH, PROMPT.

**Sortie JSON (`--json`) :**

Produit des lignes JSON sur stdout. Chaque ligne est un objet JSON avec les champs :

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

L'indication « has more sessions » est émise via stderr pour que le pipage vers `jq` reste sûr.

**Exemples :**

```bash
# Afficher les 20 dernières sessions (par défaut)
qwen sessions list

# Afficher les 50 dernières sessions
qwen sessions list --limit 50

# Sortie au format JSON pour le scripting
qwen sessions list --json | jq .
```

# Commandes

Ce document détaille toutes les commandes prises en charge par Qwen Code, vous aidant à gérer efficacement les sessions, à personnaliser l'interface et à contrôler son comportement.

Les commandes de Qwen Code sont déclenchées via des préfixes spécifiques et se répartissent en trois catégories :

| Type de préfixe                | Description de la fonction                                | Cas d'utilisation typique                                                 |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Commandes slash (`/`)       | Contrôle de Qwen Code au niveau méta              | Gestion des sessions, modification des paramètres, obtention d'aide              |
| Commandes at (`@`)          | Injection rapide du contenu de fichiers locaux dans la conversation | Permettre à l'IA d'analyser des fichiers spécifiés ou du code dans des répertoires |
| Commandes exclamation (`!`) | Interaction directe avec le Shell du système                | Exécution de commandes système comme `git status`, `ls`, etc.          |

## 1. Commandes slash (`/`)

Les commandes slash sont utilisées pour gérer les sessions, l'interface et le comportement de base de Qwen Code.

### 1.1 Gestion des sessions et des projets

Ces commandes vous aident à sauvegarder, restaurer et résumer l'avancement du travail.

| Commande          | Description                                                              | Exemples d'utilisation                                                |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `/init`          | Analyser le répertoire actuel et créer le fichier de contexte initial                | `/init`                                                       |
| `/summary`       | Générer un résumé du projet basé sur l'historique des conversations                   | `/summary`                                                    |
| `/compress`      | Remplacer l'historique du chat par un résumé pour économiser des Tokens                         | `/compress` ou `/summarize`                                   |
| `/compress-fast` | Compression rapide sans IA — supprime les anciennes sorties d'outils et les parties de réflexion | `/compress-fast`                                              |
| `/resume`        | Reprendre une session de conversation précédente                                   | `/resume` ou `/continue`                                      |
| `/recap`         | Générer immédiatement un résumé d'une ligne de la session                                    | `/recap`                                                      |
| `/restore`       | Rétablir les fichiers du projet au point de contrôle avant l'exécution d'un appel d'outil            | `/restore` (liste) ou `/restore <ID>`                          |
| `/delete`        | Supprimer une session précédente                                                | `/delete`                                                     |
| `/branch`        | Forker la conversation actuelle dans une nouvelle session                         | `/branch`                                                     |
| `/fork`          | Lancer un agent en arrière-plan qui hérite de l'intégralité de la conversation             | `/fork <directive>`                                           |
| `/rewind`        | Rembobiner la conversation à un tour précédent                                   | `/rewind` ou `/rollback`                                      |
| `/export`        | Exporter l'historique de la session vers un fichier                                           | `/export html`, `/export md`, `/export json`, `/export jsonl` |
| `/rename`        | Renommer ou taguer la session actuelle                                        | `/rename My Feature` ou `/tag`                                |

> [!note]
>
> `/summarize` est un alias de `/compress` (il compresse l'historique du chat — une opération destructive). Pour générer plutôt un résumé de projet non destructif, utilisez `/summary`.

### 1.2 Contrôle de l'interface et de l'espace de travail

Commandes pour ajuster l'apparence de l'interface et l'environnement de travail.

| Commande              | Description                                                                                                                                                                       | Exemples d'utilisation                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear`             | Effacer l'historique des conversations et libérer le contexte                                                                                                                                    | `/clear`, `/reset`, `/new`                                                        |
| `/context`           | Afficher la répartition de l'utilisation de la fenêtre de contexte                                                                                                                                               | `/context`                                                                        |
| → `detail`           | Afficher la répartition de l'utilisation du contexte par élément                                                                                                                                             | `/context detail`                                                                 |
| `/history`           | Contrôler les préférences d'affichage et la visibilité de l'historique                                                                                                                                | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff`              | Ouvrir une visionneuse de diff interactive affichant les modifications non commitées et les diffs par tour. Utilisez ←/→ pour basculer entre le diff git actuel et les tours de conversation individuels, ↑/↓ pour parcourir les fichiers | `/diff`                                                                           |
| `/theme`             | Changer le thème visuel de Qwen Code                                                                                                                                                     | `/theme`                                                                          |
| `/vim`               | Activer/Désactiver le mode d'édition Vim dans la zone de saisie                                                                                                                                           | `/vim`                                                                            |
| `/voice`             | Activer/Désactiver la saisie par dictée vocale                                                                                                                                                      | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`              |
| `/directory`         | Gérer l'espace de travail avec support multi-répertoires                                                                                                                                          | `/dir add ./src,./tests`, `/dir show`                                             |
| `/cd`                | Déplacer cette session vers un nouveau répertoire de travail                                                                                                                                      | `/cd ../other-project`                                                            |
| `/editor`            | Ouvrir la boîte de dialogue pour sélectionner l'éditeur pris en charge                                                                                                                                            | `/editor`                                                                         |
| `/statusline`        | Ouvrir la boîte de dialogue interactive de préréglage de la [ligne d'état](./status-line.md)                                                                                                                    | `/statusline`                                                                     |
| `/statusline <text>` | Générer une [ligne d'état](./status-line.md) en mode commande via l'agent                                                                                                                 | `/statusline show model and git branch`                                           |
| `/terminal-setup`    | Configurer les raccourcis clavier du terminal pour la saisie multiligne                                                                                                                                | `/terminal-setup`                                                                 |

### 1.3 Paramètres de langue

Commandes spécifiquement dédiées au contrôle de la langue de l'interface et de la sortie.

| Commande               | Description                      | Exemples d'utilisation             |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | Afficher ou modifier les paramètres de langue | `/language`                |
| → `ui [language]`     | Définir la langue de l'interface utilisateur        | `/language ui zh-CN`       |
| → `output [language]` | Définir la langue de sortie du LLM          | `/language output Chinese` |

- Langues de l'interface intégrées disponibles : `zh-CN` (chinois simplifié), `en-US` (anglais), `ru-RU` (russe), `de-DE` (allemand), `ja-JP` (japonais), `pt-BR` (portugais - Brésil), `fr-FR` (français), `ca-ES` (catalan)
- Exemples de langues de sortie : `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gestion des outils et des modèles

Commandes pour gérer les outils et les modèles d'IA.

| Commande           | Description                                                                      | Exemples d'utilisation                                                                                            |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/mcp`            | Lister les serveurs et outils MCP configurés                                            | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema`                                                         |
| `/import-config`  | Importer les serveurs MCP depuis les configurations Claude                                           | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools`          | Afficher la liste des outils actuellement disponibles                                            | `/tools`, `/tools desc`                                                                                   |
| `/skills`         | Ouvrir le panneau des skills pour parcourir, rechercher, activer/désactiver et lancer des skills               | `/skills`, `/<skill-name>`                                                                                |
| `/plan`           | Passer en mode plan ou quitter le mode plan                                            | `/plan`, `/plan <task>`, `/plan exit`                                                                     |
| `/approval-mode`  | Changer le mode d'approbation des outils (session actuelle uniquement)                             | `/approval-mode`, `/approval-mode auto-edit`                                                              |
| → `plan`          | Analyse uniquement, pas d'exécution (revue sécurisée)                                      | `/approval-mode plan`                                                                                     |
| → `default`       | Exiger une approbation pour les modifications (usage quotidien)                                           | `/approval-mode default`                                                                                  |
| → `auto-edit`     | Approuver automatiquement les modifications (environnement de confiance)                                         | `/approval-mode auto-edit`                                                                                |
| → `auto`          | Approbation évaluée par classifieur (autonome)                                       | `/approval-mode auto`                                                                                     |
| → `yolo`          | Tout approuver automatiquement (prototypage rapide)                                      | `/approval-mode yolo`                                                                                     |
| `/model`          | Changer de modèle utilisé dans la session actuelle                                             | `/model`, `/model <model-id>` (changement immédiat)                                                        |
| `/model --fast`   | Définir un modèle plus léger pour les suggestions de prompt                                       | `/model --fast qwen3-coder-flash`                                                                         |
| `/model --voice`  | Définir le modèle utilisé pour la transcription vocale                                       | `/model --voice <model-id>`                                                                               |
| `/model --vision` | Définir le modèle vision-bridge utilisé pour transcrire les images pour un modèle principal textuel | `/model --vision <model-id>`                                                                              |
| `/effort`         | Définir l'effort de raisonnement pour les modèles capables de réflexion                                 | `/effort` (ouvre le sélecteur), `/effort high` (low/medium/high/xhigh/max ; mappé et plafonné par fournisseur)       |
| `/extensions`     | Gérer les extensions                                                                | `/extensions list`, `/extensions manage`                                                                  |
| → `list`          | Lister les extensions installées                                                        | `/extensions list`                                                                                        |
| → `manage`        | Gérer les extensions installées (interactif)                                        | `/extensions manage`                                                                                      |
| → `explore`       | Ouvrir la page des extensions dans le navigateur                                                  | `/extensions explore <Gemini\|ClaudeCode>`                                                                |
| → `install`       | Installer une extension depuis un dépôt git ou un chemin                                     | `/extensions install <repo-or-path>`                                                                      |
| `/memory`         | Ouvrir la boîte de dialogue du gestionnaire de mémoire                                                   | `/memory`                                                                                                 |
| `/remember`       | Sauvegarder une mémoire durable                                                            | `/remember Prefer terse responses`                                                                        |
| `/forget`         | Supprimer les entrées correspondantes de l'auto-mémoire                                         | `/forget <query>`                                                                                         |
| `/dream`          | Exécuter manuellement la consolidation de l'auto-mémoire                                           | `/dream`                                                                                                  |
| `/hooks`          | Gérer les hooks de Qwen Code                                                           | `/hooks`, `/hooks list`                                                                                   |
| `/permissions`    | Gérer les règles de permissions                                                          | `/permissions`                                                                                            |
| `/agents`         | Gérer les sous-agents                                                                 | `/agents manage`, `/agents create`                                                                        |
| `/arena`          | Gérer les sessions Arena                                                            | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (alias `choose`)                          |
| `/goal`           | Définir un objectif — continuer à travailler jusqu'à ce que la condition soit remplie                                    | `/goal <condition>`, `/goal clear`                                                                        |
| `/tasks`          | Lister les tâches en arrière-plan                                                            | `/tasks`                                                                                                  |
| `/workflows`      | Inspecter les exécutions de workflow                                                            | `/workflows`, `/workflows <runId>`                                                                        |
| `/lsp`            | Afficher le statut du serveur LSP                                                           | `/lsp`                                                                                                    |
| `/trust`          | Gérer les paramètres de confiance des dossiers                                                     | `/trust`                                                                                                  |
> [!warning]
>
> Installez uniquement des extensions (`/extensions install`) provenant de sources fiables. Les extensions peuvent inclure des serveurs MCP, des skills et des commandes qui s'exécutent avec les mêmes permissions que Qwen Code lui-même — elles peuvent accéder à vos fichiers, clés API et données de conversation. `/extensions install` ne demande pas de confirmation.

> [!warning]
>
> Les modes d'approbation `auto-edit`, `auto` et `yolo` contournent les invites d'approbation pour l'exécution des outils. En mode `yolo`, toutes les actions — y compris les commandes shell, les écritures de fichiers et les requêtes réseau — s'exécutent sans confirmation. N'utilisez ces modes que dans des environnements de confiance, sandboxés ou jetables.

> [!note]
>
> `/workflows`, `/lsp` et `/trust` ne sont enregistrés que lorsque leur fonctionnalité est activée — respectivement via la variable d'environnement `QWEN_CODE_ENABLE_WORKFLOWS=1`, le flag CLI `--experimental-lsp` et le paramètre `security.folderTrust.enabled`. Lorsqu'ils sont désactivés, ils n'apparaîtront pas et signaleront une commande inconnue.

### 1.5 Skills intégrées

Ces commandes invoquent des skills intégrées qui fournissent des workflows spécialisés.

| Commande     | Description                                                 | Exemples d'utilisation                            |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------- |
| `/review`    | Révise les modifications de code avec 9 agents de review parallèles | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`      | Exécute un prompt de manière récurrente                     | `/loop 5m check the build`                        |
| `/simplify`  | Révise les modifications récentes et applique directement des edits de nettoyage sûrs | `/simplify`, `/simplify focus on duplication`     |
| `/qc-helper` | Répond aux questions sur l'utilisation et la configuration de Qwen Code | `/qc-helper how do I configure MCP?`              |

Consultez [Code Review](./code-review.md) pour la documentation complète de `/review`.

### 1.6 Question annexe (`/btw`)

La commande `/btw` vous permet de poser des questions annexes rapides sans interrompre ni affecter le flux de la conversation principale.

| Commande               | Description                           |
| ---------------------- | ------------------------------------- |
| `/btw <votre question>`| Pose une question annexe rapide       |
| `?btw <votre question>`| Syntaxe alternative pour les questions annexes |

**Fonctionnement :**

- La question annexe est envoyée via un appel API séparé avec le contexte de conversation récent (jusqu'aux 20 derniers messages)
- La réponse s'affiche au-dessus du Composer — vous pouvez continuer à taper en attendant
- La conversation principale n'est **pas bloquée** — elle continue indépendamment
- La réponse à la question annexe ne fait **pas** partie de l'historique de la conversation principale
- Les réponses sont rendues avec le support complet du Markdown (blocs de code, listes, tableaux, etc.)

**Raccourcis clavier (Mode interactif) :**

| Raccourci            | Action                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Annuler (pendant le chargement) ou fermer (une fois terminé) |
| `Space` ou `Enter`   | Fermer la réponse (lorsque l'input est vide)        |
| `Ctrl+C` ou `Ctrl+D` | Annuler une question annexe en cours                |

**Exemple :**

```
(While the main conversation is about refactoring code)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > (Composer remains active — keep typing)

(After the answer arrives)

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ `let` is block-scoped, while `var` is    │
  │ function-scoped. `let` was introduced    │
  │ in ES6 and doesn't hoist the same way.   │
  │                                          │
  │ Press Space, Enter, or Escape to dismiss │
  ╰──────────────────────────────────────────╯
  > (Composer still active)
```

**Modes d'exécution supportés :**

| Mode                 | Comportement                                     |
| -------------------- | -------------------------------------------- |
| Interactive          | Affiche au-dessus du Composer avec le rendu Markdown |
| Non-interactive      | Retourne le résultat texte : `btw> question\nanswer` |
| ACP (Agent Protocol) | Retourne un générateur asynchrone stream_messages      |

> [!tip]
>
> Utilisez `/btw` lorsque vous avez besoin d'une réponse rapide sans perdre le fil de votre tâche principale. C'est particulièrement utile pour clarifier des concepts, vérifier des faits ou obtenir des explications rapides tout en restant concentré sur votre workflow principal.

### 1.7 Récapitulatif de session (`/recap`)

La commande `/recap` génère un court résumé "où vous en étiez" de la session en cours, afin que vous puissiez reprendre une ancienne conversation sans avoir à faire défiler des pages d'historique.

| Commande | Description                                |
| -------- | ------------------------------------------ |
| `/recap` | Génère et affiche un récapitulatif de session sur une ligne |

**Fonctionnement :**

- Utilise le modèle rapide configuré (paramètre `fastModel`) lorsqu'il est disponible, sinon revient au modèle de session principal. Un modèle petit et peu coûteux suffit pour un récapitulatif.
- La conversation récente (jusqu'à 30 messages, texte uniquement — les appels d'outils et les réponses d'outils sont filtrés) est envoyée au modèle avec un system prompt strict.
- Le récapitulatif est rendu en couleur atténuée avec un préfixe `❯` pour le distinguer des vraies réponses de l'assistant.
- Refuse avec une erreur inline si un tour de modèle est en cours ou si une autre commande est en cours de traitement. S'il n'y a pas de conversation utilisable, ou si la génération sous-jacente échoue, `/recap` affiche un court message d'information au lieu d'un récapitulatif — la commande manuelle répond toujours avec quelque chose.

**Déclenchement automatique au retour après une absence :**

Si le terminal perd le focus pendant **5 minutes ou plus** et le récupère, un récapitulatif est généré et affiché automatiquement (uniquement lorsqu'aucune réponse de modèle n'est en cours ; sinon, il attend la fin du tour en cours puis se déclenche). Contrairement à la commande manuelle, le déclenchement automatique est totalement silencieux en cas d'échec : si la génération échoue ou s'il n'y a rien à résumer, aucun message n'est ajouté à l'historique. Contrôlé par le paramètre `general.showSessionRecap` (par défaut : `false`) ; la commande manuelle `/recap` fonctionne toujours indépendamment de ce paramètre.

**Exemple :**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> Configurez un modèle rapide via `/model --fast <model>` (par ex. `qwen3-coder-flash`) pour rendre `/recap` rapide et peu coûteux. Définissez `general.showSessionRecap` sur `true` pour activer le déclenchement automatique ; la commande manuelle `/recap` fonctionne toujours indépendamment de ce paramètre.

### 1.8 Visionneuse de diff (`/diff`)

La commande `/diff` ouvre une visionneuse de diff interactive affichant les modifications non commitées et les diffs par tour. Utilisez ←/→ pour basculer entre le git diff actuel et les tours de conversation individuels, ↑/↓ pour parcourir les fichiers, et Enter pour voir les diffs inline.

**Fonctionnement :**

En mode interactif, `/diff` ouvre une boîte de dialogue avec un **sélecteur de source** en haut :

- **Current** — working tree vs HEAD (`git diff HEAD`). Affiche toutes les modifications non commitées, y compris les fichiers stagés, non stagés et non suivis.
- **T1, T2, T3, …** — diffs par tour, un onglet par tour de modèle qui a modifié des fichiers. Les tours les plus récents apparaissent en premier. Chaque onglet affiche un aperçu du prompt original pour le contexte.

La liste de fichiers affiche les statistiques par fichier (lignes ajoutées/supprimées) avec des tags pour les états spéciaux (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Appuyez sur Enter sur un fichier pour voir son diff inline avec les hunks colorés syntaxiquement.

Les diffs par tour nécessitent que le checkpointing de fichiers soit activé (activé par défaut en mode interactif). Lorsque le checkpointing de fichiers est désactivé, seule la source "Current" est disponible.

**Raccourcis clavier :**

| Touche      | Action                                      |
| --------- | ------------------------------------------- |
| `←` / `→` | Basculer entre les sources (Current / T1 / T2…) |
| `↑` / `↓` | Naviguer dans la liste de fichiers          |
| `j` / `k` | Naviguer dans la liste de fichiers (style vim) |
| Enter     | Voir le diff inline pour le fichier sélectionné |
| `←` / Esc | Retourner à la liste de fichiers depuis la vue diff inline |
| Esc       | Fermer la boîte de dialogue                 |

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

En mode headless (`--prompt`) ou dans des contextes non interactifs, `/diff` affiche un résumé en texte brut du working tree vs HEAD. La navigation par tour n'est pas disponible.

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informations, paramètres et aide

Commandes pour obtenir des informations et configurer le système.

| Commande         | Description                                                                                                                    | Exemples d'utilisation                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/help`          | Affiche l'aide pour les commandes disponibles                                                                                  | `/help` ou `/?`                                                                     |
| `/status`        | Affiche les informations de version                                                                                            | `/status` ou `/about`                                                               |
| `/status paths`  | Affiche les chemins des fichiers et des logs de la session en cours                                                            | `/status paths`                                                                     |
| `/stats`         | Ouvre le tableau de bord interactif des statistiques d'utilisation (onglets Session, Activity et Efficiency)                   | `/stats` ou `/usage`                                                                |
| `/stats model`   | Affiche la répartition des tokens par modèle et le coût estimé                                                                 | `/stats model`                                                                      |
| `/stats tools`   | Affiche le nombre d'appels par outil                                                                                           | `/stats tools`                                                                      |
| `/stats skills`  | Affiche le nombre d'appels par skill pour la session live en cours (live uniquement ; exclut l'activité quotidienne/mensuelle inter-sessions) | `/stats skills`                                                                     |
| `/stats daily`   | Affiche les statistiques d'utilisation des tokens par jour                                                                     | `/stats daily` (alias `day`), `/stats day [YYYY-MM-DD]`                             |
| `/stats monthly` | Affiche les statistiques d'utilisation des tokens par mois                                                                     | `/stats monthly` (alias `month`), `/stats month [YYYY-MM]`                          |
| `/stats export`  | Exporte les statistiques d'utilisation en CSV ou JSON                                                                          | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]` |
| `/settings`      | Ouvre l'éditeur de paramètres                                                                                                  | `/settings`                                                                         |
| `/config`        | Obtient ou définit n'importe quel paramètre par sa clé dot-path (écrit dans les paramètres utilisateur)                        | `/config` (liste tout), `/config <key>`, `/config <key>=<value>`                    |
| `/auth`          | Change la méthode d'authentification                                                                                           | `/auth`, `/connect`, `/login`                                                       |
| `/doctor`        | Exécute les diagnostics d'installation et d'environnement                                                                      | `/doctor`, `/doctor memory`                                                         |
| → `memory`       | Affiche les diagnostics de mémoire du processus en cours                                                                       | `/doctor memory [--json] [--sample] [--snapshot]`                                   |
| → `cpu-profile`  | Enregistre un profil CPU pour l'analyse dans Chrome DevTools                                                                   | `/doctor cpu-profile [--duration <seconds>]`                                        |
| → `rollback`     | Restaure le binaire CLI standalone à la version précédente (installations standalone uniquement ; pour l'historique de conversation utilisez `/rewind`) | `/doctor rollback`                                                                  |
| `/docs`          | Ouvre la documentation complète de Qwen Code dans le navigateur                                                                | `/docs`                                                                             |
| `/ide`           | Gère l'intégration IDE                                                                                                         | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                        |
| `/insight`       | Génère des insights de programmation à partir de l'historique du chat                                                          | `/insight`                                                                          |
| `/setup-github`  | Configure GitHub Actions                                                                                                       | `/setup-github`                                                                     |
| `/bug`           | Soumet un problème concernant Qwen Code                                                                                        | `/bug Button click unresponsive`                                                    |
| `/copy`          | Copie dans le presse-papiers : réponse (N-ième avant la fin), code (par lang), LaTeX ou Mermaid                                | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                  |
| `/quit`          | Quitte Qwen Code immédiatement                                                                                                 | `/quit` ou `/exit`                                                                  |
> [!warning]
>
> `/doctor memory --snapshot` écrit un instantané du tas V8 (heap snapshot) qui peut contenir des prompts, des contenus de fichiers, des clés API et des résultats d'outils de la session en cours. Vérifiez le fichier avant de le partager.

> [!note]
>
> `/config` lit et écrit des paramètres individuels via une clé dot-path (par ex. `general.vimMode`), en complément de l'éditeur interactif `/settings`. Exécuter `/config` sans argument (ou avec `--help`) liste toutes les clés configurables avec leur type et leur valeur actuelle. `/config <key>` affiche la valeur actuelle — sauf pour les clés booléennes, où cela bascule la valeur. `/config <key>=<value>` définit la valeur. Les modifications sont écrites dans les paramètres utilisateur (`~/.qwen/settings.json`). Seuls les paramètres de type `boolean`, `string`, `number` et `enum` peuvent être modifiés de cette façon — les paramètres `array` et `object` doivent être édités directement dans `settings.json`. Les valeurs sensibles (clés API, tokens, URLs de base) sont masquées dans la sortie, et la définition de `tools.approvalMode` à `yolo` est bloquée.

### 1.10 Raccourcis courants

| Raccourci          | Fonction                | Note                                                                      |
| ------------------ | ----------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | Effacer l'écran         | Efface uniquement l'écran visible (ne réinitialise pas la session comme `/clear`) |
| `Ctrl/cmd+T`       | Basculer la description de l'outil | Gestion des outils MCP                                     |
| `Ctrl/cmd+C`×2     | Confirmation de sortie  | Mécanisme de sortie sécurisé                                              |
| `Ctrl/cmd+Z`       | Annuler la saisie       | Édition de texte                                                          |
| `Ctrl/cmd+Shift+Z` | Rétablir la saisie      | Édition de texte                                                          |

### 1.11 Commandes d'authentification

Utilisez `/auth` dans une session Qwen Code pour configurer l'authentification. Utilisez `/doctor` pour inspecter l'état actuel de l'authentification et de l'environnement.

| Commande  | Description                                                            |
| --------- | ---------------------------------------------------------------------- |
| `/auth`   | Configurer l'authentification de manière interactive (alias : `/connect`, `/login`) |
| `/doctor` | Afficher les vérifications d'authentification et d'environnement       |

> [!note]
>
> La commande CLI autonome `qwen auth` a été supprimée. Les invocations héritées telles que `qwen auth status` affichent un avis de suppression avec des instructions de migration. Consultez la page [Authentication](../configuration/auth) pour plus de détails.

## 2. Commandes @ (Introduction de fichiers)

Les commandes @ sont utilisées pour ajouter rapidement le contenu d'un fichier ou d'un répertoire local à la conversation.

| Format de la commande | Description                                  | Exemples                                         |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| `@<chemin du fichier>`      | Injecter le contenu du fichier spécifié             | `@src/main.py Veuillez expliquer ce code`          |
| `@<chemin du répertoire>` | Lire récursivement tous les fichiers texte du répertoire | `@docs/ Résumer le contenu de ce document`      |
| `@` seul      | Utilisé lorsqu'on parle du symbole `@` lui-même       | `@ À quoi sert ce symbole en programmation ?` |

Note : Les espaces dans les chemins doivent être échappés avec un antislash (par ex. `@My\ Documents/file.txt`)

## 3. Commandes avec point d'exclamation (`!`) - Exécution de commandes Shell

Les commandes avec point d'exclamation vous permettent d'exécuter des commandes système directement dans Qwen Code.

| Format de la commande     | Description                                                        | Exemples                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<commande shell>` | Exécuter la commande dans un sous-Shell                                       | `!ls -la`, `!git status`               |
| `!` seul     | Basculer en mode Shell, toute saisie est exécutée directement comme commande Shell | `!`(entrée) → Saisir la commande → `!`(sortie) |

Variables d'environnement : Les commandes exécutées via `!` définiront la variable d'environnement `QWEN_CODE=1`.

## 4. Commandes personnalisées

Enregistrez les prompts fréquemment utilisés comme commandes raccourcies pour améliorer l'efficacité du travail et garantir la cohérence.

> [!note]
>
> Les commandes personnalisées utilisent désormais le format Markdown avec un frontmatter YAML optionnel. Le format TOML est obsolète mais reste pris en charge pour la rétrocompatibilité. Lorsque des fichiers TOML sont détectés, une invite de migration automatique sera affichée.

### Aperçu rapide

| Fonction         | Description                                | Avantages                             | Priorité | Scénarios applicables                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Espace de noms (Namespace)        | Un sous-répertoire crée des commandes nommées avec des deux-points  | Meilleure organisation des commandes            |          |                                                      |
| Commandes globales  | `~/.qwen/commands/`                        | Disponibles dans tous les projets              | Basse      | Commandes personnelles fréquemment utilisées, utilisation multi-projets |
| Commandes de projet | `<répertoire racine du projet>/.qwen/commands/` | Spécifiques au projet, contrôlables par version | Haute     | Partage en équipe, commandes spécifiques au projet              |

Règles de priorité : Commandes de projet > Commandes utilisateur (la commande de projet est utilisée en cas de noms identiques)

### Règles de nommage des commandes

#### Tableau de correspondance entre le chemin du fichier et le nom de la commande

| Emplacement du fichier                            | Commande générée | Exemple d'appel          |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Paramètre`     |
| `<projet>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Message` |

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

| Champ         | Obligatoire | Description                              | Exemple                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `description` | Optionnel | Description de la commande (affichée dans /help) | `description: Outil d'analyse de code`          |
| Corps du prompt   | Obligatoire | Contenu du prompt envoyé au modèle             | Tout contenu Markdown après le frontmatter |

### Format de fichier TOML (Obsolète)

> [!warning]
>
> **Obsolète :** Le format TOML est toujours pris en charge mais sera supprimé dans une future version. Veuillez migrer vers le format Markdown.

| Champ         | Obligatoire | Description                              | Exemple                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `prompt`      | Obligatoire | Contenu du prompt envoyé au modèle             | `prompt = "Veuillez analyser le code : {{args}}"` |
| `description` | Optionnel | Description de la commande (affichée dans /help) | `description = "Outil d'analyse de code"`       |

### Mécanisme de traitement des paramètres

| Méthode de traitement            | Syntaxe             | Scénarios applicables                 | Fonctionnalités de sécurité                      |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injection contextuelle      | `{{args}}`         | Nécessite un contrôle précis des paramètres       | Échappement Shell automatique               |
| Traitement des paramètres par défaut | Aucun marquage spécial | Commandes simples, ajout de paramètres | Ajout tel quel                           |
| Injection de commande Shell      | `!{command}`       | Nécessite du contenu dynamique                 | Confirmation d'exécution requise avant |

#### 1. Injection contextuelle (`{{args}}`)

| Scénario         | Configuration TOML                      | Méthode d'appel           | Effet réel            |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Injection brute    | `prompt = "Fix: {{args}}"`              | `/fix "Problème de bouton"` | `Fix: "Problème de bouton"`    |
| Dans une commande Shell | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Exécute `grep "hello" .` |

#### 2. Traitement des paramètres par défaut

| Situation d'entrée | Méthode de traitement                                      | Exemple                                        |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Avec paramètres  | Ajout à la fin du prompt (séparé par deux sauts de ligne) | `/cmd paramètre` → Prompt original + paramètre |
| Sans paramètres   | Envoi du prompt tel quel                                      | `/cmd` → Prompt original                       |

🚀 Injection de contenu dynamique

| Type d'injection        | Syntaxe         | Ordre de traitement    | Objectif                          |
| --------------------- | -------------- | ------------------- | -------------------------------- |
| Contenu de fichier          | `@{chemin du fichier}` | Traité en premier     | Injecter des fichiers de référence statiques    |
| Commandes Shell        | `!{command}`   | Traité au milieu | Injecter des résultats d'exécution dynamiques |
| Remplacement de paramètres | `{{args}}`     | Traité en dernier      | Injecter des paramètres utilisateur           |

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

| Type de fichier    | Statut de support         | Méthode de traitement           |
| ------------ | ---------------------- | --------------------------- |
| Fichiers texte   | ✅ Support complet        | Injection directe du contenu     |
| Images/PDF   | ✅ Support multi-modal | Encodage et injection           |
| Fichiers binaires | ⚠️ Support limité     | Peut être ignoré ou tronqué |
| Répertoire    | ✅ Injection récursive | Suit les règles de .gitignore     |

Exemple : Commande de revue de code

```markdown
---
description: Revue de code basée sur les bonnes pratiques
---

Réviser {{args}}, standards de référence :

@{docs/code-standards.md}
```

### Exemple de création pratique

#### Tableau des étapes de création de la commande "Refactoring en fonction pure"

| Opération                     | Commande/Code                              |
| ----------------------------- | ----------------------------------------- |
| 1. Créer la structure de répertoires | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Créer le fichier de commande        | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Éditer le contenu de la commande       | Se référer au code complet ci-dessous.         |
| 4. Tester la commande               | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Refactorer le code en fonction pure
---

Veuillez analyser le code dans le contexte actuel, refactorer en fonction pure.
Exigences :

1. Fournir le code refactorisé
2. Expliquer les changements clés et l'implémentation des caractéristiques des fonctions pures
3. Maintenir la fonction inchangée
```

### Résumé des bonnes pratiques pour les commandes personnalisées

#### Tableau des recommandations pour la conception des commandes

| Points de pratique      | Approche recommandée                | À éviter                                       |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Nommage des commandes       | Utiliser des espaces de noms pour l'organisation     | Éviter les noms trop génériques                  |
| Traitement des paramètres | Utiliser clairement `{{args}}`              | S'appuyer sur l'ajout par défaut (facile à confondre) |
| Gestion des erreurs       | Utiliser la sortie d'erreur Shell          | Ignorer l'échec d'exécution                    |
| Organisation des fichiers    | Organiser par fonction dans des répertoires | Toutes les commandes dans le répertoire racine              |
| Champ de description    | Toujours fournir une description claire    | S'appuyer sur la description générée automatiquement          |
#### Tableau récapitulatif des fonctionnalités de sécurité

| Mécanisme de sécurité    | Effet de protection          | Opération utilisateur    |
| ------------------------ | ---------------------------- | ------------------------ |
| Échappement Shell        | Prévention de l'injection de commandes | Traitement automatique |
| Confirmation d'exécution | Évite l'exécution accidentelle | Confirmation par dialogue |
| Rapport d'erreur         | Aide au diagnostic des problèmes | Affichage des informations d'erreur |

## 5. Sous-commandes CLI

Ces commandes sont exécutées depuis le shell sous la forme `qwen <subcommand>` avant de démarrer une session interactive.

### Gestion des sessions

| Commande             | Description                           | Exemples d'utilisation                                         |
| -------------------- | ------------------------------------- | -------------------------------------------------------------- |
| `qwen sessions list` | Liste les sessions de conversation récentes | `qwen sessions list`, `qwen sessions list --json --limit 50` |

#### `qwen sessions list`

Liste vos sessions Qwen Code récentes avec leurs métadonnées.

**Options :**

| Option    | Type    | Défaut | Description                                     |
| --------- | ------- | ------ | ----------------------------------------------- |
| `--json`  | boolean | `false`| Sortie au format JSON Lines (un objet JSON par ligne) |
| `--limit` | number  | `20`   | Nombre maximum de sessions à afficher           |

**Sortie lisible par l'homme (par défaut) :**

Un tableau avec les colonnes : SESSION ID, STARTED (horodatage UTC), TITLE, BRANCH, PROMPT.

**Sortie JSON (`--json`) :**

Génère des JSON Lines sur stdout. Chaque ligne est un objet JSON contenant les champs suivants :

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

L'indication « has more sessions » est émise via stderr afin que le piping vers `jq` reste sûr.

**Exemples :**

```bash
# Affiche les 20 dernières sessions (par défaut)
qwen sessions list

# Affiche les 50 dernières sessions
qwen sessions list --limit 50

# Sortie au format JSON pour les scripts
qwen sessions list --json | jq .
```